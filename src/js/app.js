/**
 * Main Application Logic
 * 
 * SECURITY NOTES:
 * ✅ Config (API keys) loaded from environment variables
 * ✅ All user input sanitized before rendering
 * ✅ No sensitive data in git history (.env in .gitignore)
 * ✅ Supabase anon key has RLS policies (server-side security)
 */

import { createClient } from '@supabase/supabase-js';
import { inject } from '@vercel/analytics';
import { sanitizeEmail, redactEmail } from './sanitize.js';
import { renderBracket, getGroupOrder, getGroupTeamNames, randomPicks, fillBlankRanks, randomizeGroups, ADVANCE_COUNT } from './bracketData.js';
import { loadBracketRow, savePicks } from './bracketStore.js';
import { downloadBracketImage } from './exportImage.js';
import { celebrate } from './celebrate.js';
import { saveDraft, readDraft, clearDraft, shouldRestoreDraft } from './draftStore.js';
import { isOtpCooldownActive, formatCooldownSeconds } from './authUtils.js';
import { config } from '../config/supabase.js';

// Initialize Supabase
const supabase = createClient(config.supabaseUrl, config.supabaseAnonKey);

// Vercel Web Analytics: cookieless page/visit metrics. Only records on the
// deployed domain (a no-op locally), so enable Web Analytics in the Vercel
// dashboard for it to collect anything.
inject();

// State
let currentUser = null;
let picks = {}; // { [groupCode]: [teamName, ...] } ordered 1st -> 4th
let savedSnapshot = '{}'; // JSON of last persisted picks, for unsaved-change detection
let loadedUserId = null; // guards against reloading (and clobbering unsaved picks) on tab refocus
let loadedUpdatedAt = null; // DB row's updated_at we last synced with (a draft's base version)
let otpLastSentAt = 0;
let lastLoginEmail = ''; // kept after OTP send so "Didn't get the email?" can notify without re-typing

// Draft autosave: a guarded localStorage handle (private mode can throw on the
// very access) and a debounce timer so we persist shortly after the user stops
// clicking rather than on every single click.
const draftStorage = (() => {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
})();
const DRAFT_DEBOUNCE_MS = 500;
let draftTimer = null;

// The screenshot "Your name" field is persisted per user in localStorage
// (reusing the guarded draftStorage handle) and defaults to the email's local part.
function nameStorageKey(userId) {
  return `wc-bracket:name:${userId}`;
}
function loadStoredName(userId) {
  if (!draftStorage || !userId) return '';
  try {
    return draftStorage.getItem(nameStorageKey(userId)) || '';
  } catch {
    return '';
  }
}
function persistName(userId, name) {
  if (!draftStorage || !userId) return;
  try {
    if (name) draftStorage.setItem(nameStorageKey(userId), name);
    else draftStorage.removeItem(nameStorageKey(userId));
  } catch {
    /* private mode / quota - ignore */
  }
}
function emailLocalPart(email) {
  return String(email || '').split('@')[0] || '';
}

// ============================================
// UI Helpers
// ============================================

// One in-place status message at a time — never stack. A new message replaces
// whatever's showing (in the bracket's side rail, or the sign-in screen's own
// area). Transient messages auto-clear; errors persist until the next message.
const ALERT_DEFAULT_MS = 6000;
let alertTimer = null;

// Containers a message can live in: the sign-in screen, the desktop rail, and
// the mobile bottom-bar status. CSS shows whichever fits the current breakpoint.
const ALERT_CONTAINER_IDS = ['alerts', 'authAlerts', 'alertsMobile', 'alertsToolbar'];

function alertTargets() {
  const section = document.getElementById('bracketSection');
  const onBracket = section && section.style.display !== 'none';
  // On the bracket screen, mirror into the rail (desktop) AND the bottom-bar
  // status (mobile); CSS hides whichever doesn't apply at the current width.
  const ids = onBracket ? ['alerts', 'alertsToolbar', 'alertsMobile'] : ['authAlerts'];
  const targets = ids.map((id) => document.getElementById(id)).filter(Boolean);
  if (targets.length) return targets;
  // Fallback so a message is never silently dropped.
  return [document.getElementById('alerts') || document.getElementById('authAlerts')].filter(Boolean);
}

function clearAllAlerts() {
  if (alertTimer) {
    clearTimeout(alertTimer);
    alertTimer = null;
  }
  ALERT_CONTAINER_IDS.forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.replaceChildren();
  });
}

function showAlert(message, type = 'info', options = {}) {
  const targets = alertTargets();
  if (!targets.length) return;
  // Clear any current message everywhere so only one ever shows.
  clearAllAlerts();

  targets.forEach((target) => {
    const alertDiv = document.createElement('div');
    alertDiv.className = `alert ${type}`;
    alertDiv.textContent = message;
    target.replaceChildren(alertDiv);
  });

  // Errors stay until the next action replaces them; everything else fades out.
  const persist = options.persist ?? (type === 'error');
  if (!persist) {
    const ms = options.duration ?? ALERT_DEFAULT_MS;
    alertTimer = setTimeout(() => {
      targets.forEach((target) => target.replaceChildren());
    }, ms);
  }
}

function showAuthSection() {
  document.getElementById('authSection').style.display = 'block';
  document.getElementById('bracketSection').style.display = 'none';
  const headerActions = document.getElementById('headerActions');
  if (headerActions) headerActions.style.display = 'none'; // Sign Out hidden when logged out
  const headerTagline = document.getElementById('headerTagline');
  if (headerTagline) headerTagline.style.display = 'none'; // tagline lives in the grey area on the sign-in screen
  if (authConfirm) authConfirm.hidden = true; // reset the post-send confirmation
  if (loginHelpStatus) loginHelpStatus.textContent = '';
}

function showBracketSection() {
  document.getElementById('authSection').style.display = 'none';
  document.getElementById('bracketSection').style.display = 'block';
  const headerActions = document.getElementById('headerActions');
  if (headerActions) headerActions.style.display = 'flex'; // Sign Out in the header when logged in
  const headerTagline = document.getElementById('headerTagline');
  if (headerTagline) headerTagline.style.display = 'block'; // small subtitle under the h1 once logged in
  maybeAutoOpenHelp(); // first-time onboarding overlay (once per browser)
}

// ============================================
// Modals (shared): the how-it-works onboarding overlay and the "Select for me"
// chooser share one accessible open/close + focus-trap implementation.
// ============================================
const helpModal = document.getElementById('helpModal');
const helpBtn = document.getElementById('helpBtn');
const selectModal = document.getElementById('selectModal');
const selectApplyBtn = document.getElementById('selectApplyBtn');
const selectGroupsFieldset = document.getElementById('selectGroupsFieldset');
const selectGroupsGrid = document.getElementById('selectGroupsGrid');
const selectRememberCheckbox = document.getElementById('selectRemember');
const successModal = document.getElementById('successModal');
const successScreenshotBtn = document.getElementById('successScreenshotBtn');
const authConfirm = document.getElementById('authConfirm');
const loginHelpBtn = document.getElementById('loginHelpBtn');
const loginHelpStatus = document.getElementById('loginHelpStatus');
const loginHelpHoneypot = document.getElementById('loginHelpHoneypot');
const HELP_SEEN_KEY = 'wc-bracket:seen-help';

// "Select for me" chooser: the choice remembered for this signed-in session
// (only 'blanks' or 'all'; the one-off 'selected' is never remembered). Cleared
// on sign-out.
let sessionSelectMode = null;

// Only one modal is open at a time; track it for the shared Esc/Tab handler.
let activeModal = null;
let activeModalDialog = null;
let lastFocusedBeforeModal = null;

// Generic seen-once flags live in the same guarded localStorage handle as the
// draft (private mode can throw on access).
function flagSeen(key) {
  if (!draftStorage) return false;
  try {
    return draftStorage.getItem(key) === '1';
  } catch {
    return false;
  }
}

function markFlagSeen(key) {
  if (!draftStorage) return;
  try {
    draftStorage.setItem(key, '1');
  } catch {
    /* private mode / quota - ignore */
  }
}

// Visible, focusable controls inside a container (for the Tab focus-trap).
function getFocusable(container) {
  return Array.from(
    container.querySelectorAll(
      'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )
  ).filter((el) => el.offsetParent !== null);
}

// Esc closes the open modal; Tab cycles within its dialog so focus can't slip behind.
function onModalKeydown(e) {
  if (!activeModal) return;
  if (e.key === 'Escape') {
    e.preventDefault();
    closeModal(activeModal);
    return;
  }
  if (e.key !== 'Tab' || !activeModalDialog) return;
  const focusable = getFocusable(activeModalDialog);
  if (!focusable.length) {
    e.preventDefault();
    activeModalDialog.focus();
    return;
  }
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  const active = document.activeElement;
  if (e.shiftKey && (active === first || active === activeModalDialog)) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && active === last) {
    e.preventDefault();
    first.focus();
  }
}

function openModal(modalEl) {
  if (!modalEl) return;
  lastFocusedBeforeModal = document.activeElement;
  activeModal = modalEl;
  activeModalDialog = modalEl.querySelector('.modal__dialog');
  modalEl.hidden = false;
  document.body.style.overflow = 'hidden'; // lock background scroll
  document.addEventListener('keydown', onModalKeydown, true);
  if (activeModalDialog) activeModalDialog.focus(); // move focus in for Esc + screen readers
}

function closeModal(modalEl) {
  if (!modalEl || modalEl.hidden) return;
  modalEl.hidden = true;
  document.body.style.overflow = '';
  document.removeEventListener('keydown', onModalKeydown, true);
  if (lastFocusedBeforeModal && typeof lastFocusedBeforeModal.focus === 'function') {
    lastFocusedBeforeModal.focus(); // restore focus to the trigger
  }
  lastFocusedBeforeModal = null;
  activeModal = null;
  activeModalDialog = null;
}

// Auto-open the how-it-works explainer once per browser, the first time the
// bracket appears.
function maybeAutoOpenHelp() {
  if (!helpModal || flagSeen(HELP_SEEN_KEY)) return;
  markFlagSeen(HELP_SEEN_KEY);
  openModal(helpModal);
}

// ============================================
// Bracket UI (interactive ranking)
// ============================================

const bracketEl = document.getElementById('bracket');
const saveBtn = document.getElementById('saveBtn');
const deselectBtn = document.getElementById('deselectBtn');
const randomBtn = document.getElementById('randomBtn');
const exportBtn = document.getElementById('exportBtn');
const nameInput = document.getElementById('displayNameInput');
const saveStatusEl = document.getElementById('saveStatus');
const progressTextEl = document.getElementById('progressText');
const progressBarEl = document.getElementById('progressBar');
// Mobile-only mirror controls (the sticky bottom Submit bar)
const saveBtnMobile = document.getElementById('saveBtnMobile');
const progressTextElMobile = document.getElementById('progressTextMobile');

function setSaveStatus(text) {
  if (saveStatusEl) saveStatusEl.textContent = text;
}

// Submit appears twice (desktop toolbar + mobile bottom bar); toggle both together.
function setSubmitButtons(disabled, label) {
  [saveBtn, saveBtnMobile].forEach((btn) => {
    if (!btn) return;
    btn.disabled = disabled;
    btn.textContent = label;
  });
}

function updateProgress() {
  const groups = getGroupOrder();
  const done = groups.filter((code) => (picks[code]?.length || 0) >= ADVANCE_COUNT).length;
  const label = `${done} / ${groups.length} groups set`;
  if (progressTextEl) progressTextEl.textContent = label;
  if (progressTextElMobile) progressTextElMobile.textContent = label;
  if (progressBarEl) progressBarEl.style.transform = `scaleX(${done / groups.length})`;
}

function renderBracketUI() {
  if (!bracketEl) return;
  bracketEl.innerHTML = renderBracket(picks);
  updateProgress();
}

// Click a team to assign the next finishing position; click a ranked team to
// clear it (the remaining ranks reflow). Mirrors the original app's UX.
function togglePick(group, teamName) {
  const list = picks[group] ? [...picks[group]] : [];
  const at = list.indexOf(teamName);
  if (at >= 0) {
    list.splice(at, 1);
  } else if (list.length < 4) {
    list.push(teamName);
  }
  if (list.length) picks[group] = list;
  else delete picks[group];
}

function hasUnsavedChanges() {
  return JSON.stringify(picks) !== savedSnapshot;
}

// Persist the in-progress bracket to localStorage so a refresh can't lose it.
// Debounced on each click; drafts may be incomplete (the gated DB Save is the
// real submission). When the picks match the DB again we drop the draft instead.
function scheduleDraftSave() {
  if (draftTimer) clearTimeout(draftTimer);
  draftTimer = setTimeout(flushDraft, DRAFT_DEBOUNCE_MS);
}

function flushDraft() {
  if (draftTimer) {
    clearTimeout(draftTimer);
    draftTimer = null;
  }
  if (!currentUser) return;

  if (hasUnsavedChanges()) {
    const ok = saveDraft(draftStorage, currentUser.id, picks, loadedUpdatedAt);
    setSaveStatus(ok ? 'Draft saved · not submitted' : 'Unsaved changes');
  } else {
    clearDraft(draftStorage, currentUser.id);
    setSaveStatus('');
  }
}

// Shared post-change routine: re-render, reflect draft status, and autosave.
function afterPicksChanged() {
  renderBracketUI();
  setSaveStatus(hasUnsavedChanges() ? 'Saving draft…' : '');
  scheduleDraftSave();
}

function onBracketClick(e) {
  // Per-group reset takes priority: it has no data-index, so it isn't a team.
  const clearBtn = e.target.closest('button[data-clear-group]');
  if (clearBtn) {
    clearGroup(clearBtn.dataset.clearGroup);
    return;
  }

  const btn = e.target.closest('button[data-group]');
  if (!btn) return;
  const group = btn.dataset.group;
  const index = Number(btn.dataset.index);
  const teamName = getGroupTeamNames(group)[index];
  if (!teamName) return;

  togglePick(group, teamName);
  afterPicksChanged();
}

// Clear one group's picks; the rest of the bracket is untouched. Single-group
// clears are low-stakes and quickly re-entered, so no confirm (the global
// Deselect all keeps its confirm because it wipes everything).
function clearGroup(group) {
  if (!group || !picks[group]) return; // nothing to clear
  delete picks[group];
  afterPicksChanged();
  // The Clear control just unmounted; move focus to this group's first team so
  // keyboard users aren't dropped to the top of the document.
  const firstTeam = bracketEl?.querySelector(`.group-card[data-group="${group}"] .team-row`);
  if (firstTeam) firstTeam.focus();
}

// Clear every pick at once (with a quick confirm), then autosave the empty draft.
function handleDeselectAll() {
  if (!Object.keys(picks).length) return;
  if (!window.confirm('Clear all your picks?')) return;
  picks = {};
  afterPicksChanged();
}

// "Select for me" — non-destructive by default. An empty bracket has nothing to
// protect, so just fill all 12; otherwise open the chooser (or apply the choice
// remembered for this session) so the user controls exactly what gets touched.
function handleSelectForMe() {
  const hasPicks = getGroupOrder().some((code) => picks[code]?.length);
  if (!hasPicks) {
    picks = randomPicks();
    afterPicksChanged();
    showAlert('🎲 Filled all 12 groups for you — tweak, then submit.', 'info');
    return;
  }
  if (sessionSelectMode) {
    applySelectForMe(sessionSelectMode);
    return;
  }
  openSelectChooser();
}

// Run a chosen fill mode. `codes` only applies to 'selected'.
function applySelectForMe(mode, codes = []) {
  if (mode === 'all') {
    picks = randomPicks();
    afterPicksChanged();
    showAlert('🎲 Replaced your whole bracket with a fresh random one — tweak, then submit.', 'info');
    return;
  }
  if (mode === 'selected') {
    if (!codes.length) return;
    picks = randomizeGroups(picks, codes);
    afterPicksChanged();
    const n = codes.length;
    showAlert(`🎲 Re-rolled ${n} group${n === 1 ? '' : 's'} (${codes.join(', ')}) — tweak, then submit.`, 'info');
    return;
  }
  // 'blanks' (default, safe): keep every placed team, fill only the empty ranks.
  picks = fillBlankRanks(picks);
  afterPicksChanged();
  showAlert('🎲 Filled the blanks — the teams you already placed stayed put. Tweak, then submit.', 'info');
}

// --- "Select for me" chooser modal ---------------------------------------
// Build the per-group checkboxes once (the group set is static).
function buildSelectGroupChecks() {
  if (!selectGroupsGrid || selectGroupsGrid.childElementCount) return;
  for (const code of getGroupOrder()) {
    const label = document.createElement('label');
    label.className = 'select-groups__item';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.value = code;
    const span = document.createElement('span');
    span.textContent = `Group ${code}`;
    label.append(cb, span);
    selectGroupsGrid.append(label);
  }
}

function selectedChooserMode() {
  const checked = selectModal?.querySelector('input[name="selectMode"]:checked');
  return checked ? checked.value : 'blanks';
}

function checkedGroupCodes() {
  if (!selectGroupsGrid) return [];
  return Array.from(selectGroupsGrid.querySelectorAll('input[type="checkbox"]:checked')).map((cb) => cb.value);
}

// Reflect the chosen radio: reveal the group checklist for 'selected' (and
// disable "don't ask again" there, since a one-off selection can't be
// remembered), label the Apply button, and disable Apply while 'selected' has
// nothing ticked.
function syncChooserState() {
  const mode = selectedChooserMode();
  const isSelected = mode === 'selected';
  if (selectGroupsFieldset) selectGroupsFieldset.hidden = !isSelected;
  if (selectRememberCheckbox) {
    selectRememberCheckbox.disabled = isSelected;
    if (isSelected) selectRememberCheckbox.checked = false;
  }
  if (selectApplyBtn) {
    const labels = { blanks: 'Fill in the blanks', selected: 'Re-roll selected', all: 'Replace everything' };
    selectApplyBtn.textContent = labels[mode] || 'Apply';
    selectApplyBtn.disabled = isSelected && checkedGroupCodes().length === 0;
  }
}

function openSelectChooser() {
  if (!selectModal) {
    applySelectForMe('blanks'); // modal missing (shouldn't happen) — safe default
    return;
  }
  buildSelectGroupChecks();
  const blanksRadio = selectModal.querySelector('input[name="selectMode"][value="blanks"]');
  if (blanksRadio) blanksRadio.checked = true; // reset to the safe default each open
  if (selectGroupsGrid) {
    selectGroupsGrid.querySelectorAll('input[type="checkbox"]').forEach((cb) => { cb.checked = false; });
  }
  if (selectRememberCheckbox) selectRememberCheckbox.checked = false;
  syncChooserState();
  openModal(selectModal);
}

function applyChooserAndClose() {
  const mode = selectedChooserMode();
  const codes = mode === 'selected' ? checkedGroupCodes() : [];
  if (mode === 'selected' && !codes.length) return; // Apply is disabled anyway; guard
  if (selectRememberCheckbox?.checked && mode !== 'selected') sessionSelectMode = mode;
  closeModal(selectModal);
  applySelectForMe(mode, codes);
}

// Download the current bracket as a branded PNG (html2canvas is lazy-loaded).
async function handleExport() {
  if (!Object.keys(picks).length) {
    showAlert('Pick at least one team before downloading an image', 'info');
    return;
  }
  if (exportBtn) {
    exportBtn.disabled = true;
    exportBtn.textContent = 'Generating…';
  }
  try {
    const name = nameInput ? nameInput.value : '';
    await downloadBracketImage(picks, { name });
    showAlert('🖼️ Image downloaded', 'success');
  } catch (err) {
    console.error('Export error:', err);
    showAlert(`❌ Could not export image: ${err.message}`, 'error');
  } finally {
    if (exportBtn) {
      exportBtn.disabled = false;
      exportBtn.textContent = 'Screenshot bracket (PNG)';
    }
  }
}

async function handleSave() {
  if (!currentUser) {
    showAlert('❌ Please sign in before submitting', 'error');
    return;
  }
  // Require at least the advancing pair (2) in every group before saving.
  const incomplete = getGroupOrder().filter((code) => (picks[code]?.length || 0) < ADVANCE_COUNT);
  if (incomplete.length) {
    const list = incomplete.slice(0, 4).map((code) => `Group ${code}`).join(', ');
    const more = incomplete.length > 4 ? `, +${incomplete.length - 4} more` : '';
    showAlert(`❌ Pick ${ADVANCE_COUNT} teams in every group before submitting — still need: ${list}${more}`, 'error');
    return;
  }
  // A draft write may be queued; cancel it so it can't overwrite the save status.
  if (draftTimer) {
    clearTimeout(draftTimer);
    draftTimer = null;
  }
  setSubmitButtons(true, 'Submitting…');
  setSaveStatus('Submitting…');
  try {
    const saved = await savePicks(supabase, currentUser.id, picks);
    picks = saved.picks;
    savedSnapshot = JSON.stringify(picks);
    loadedUpdatedAt = saved.updatedAt;
    clearDraft(draftStorage, currentUser.id); // DB is now the source of truth
    renderBracketUI();
    setSaveStatus('Submitted ✓');
    // The celebratory modal now carries the confirmation, so don't also stack a
    // banner. Fall back to the in-place alert only if the modal markup is missing.
    if (successModal) {
      clearAllAlerts();
      openModal(successModal);
      celebrate(); // brief, lazy-loaded, brand-tinted confetti; no-ops under reduced motion
    } else {
      showAlert(
        '✅ Bracket submitted! Log back in anytime to change it, screenshot it for the team in Campfire, or clear it to start a new one.',
        'success',
        { duration: 9000 }
      );
    }
  } catch (err) {
    console.error('Save error:', err);
    setSaveStatus('Not submitted');
    showAlert(`❌ Couldn't submit your bracket: ${err.message}`, 'error');
  } finally {
    setSubmitButtons(false, 'Submit bracket');
  }
}

// ============================================
// Authentication
// ============================================

async function handleLogin(e) {
  e.preventDefault();

  const email = document.getElementById('emailInput').value;
  const sanitized = sanitizeEmail(email);
  const loginBtn = document.getElementById('loginBtn');

  if (!sanitized) {
    showAlert('❌ Please enter a valid email address', 'error');
    return;
  }

  if (isOtpCooldownActive(otpLastSentAt)) {
    const secondsLeft = formatCooldownSeconds(otpLastSentAt);
    showAlert(`⏳ Please wait ${secondsLeft}s before requesting another login email.`, 'info');
    return;
  }

  if (loginBtn) {
    loginBtn.disabled = true;
    loginBtn.textContent = 'Sending…';
  }

  try {
    const { error } = await supabase.auth.signInWithOtp({
      email: sanitized,
      options: {
        // Return to the origin the request came from so a login requested
        // from localhost / a Vercel preview / prod each lands back on
        // itself, instead of falling back to Supabase's Site URL.
        emailRedirectTo: window.location.origin,
      },
    });

    if (error) throw error;

    otpLastSentAt = Date.now();
    lastLoginEmail = sanitized;
    // Reveal the persistent confirmation (with the knockout-teaser meme) rather
    // than a transient toast; clear any prior error so only the confirmation shows.
    clearAllAlerts();
    if (authConfirm) authConfirm.hidden = false;
    document.getElementById('emailInput').value = '';
  } catch (err) {
    console.error('Login error:', err);
    showAlert(`❌ Login failed: ${err.message}`, 'error');
  } finally {
    if (loginBtn) {
      loginBtn.disabled = false;
      loginBtn.textContent = 'Sign In with Email';
    }
  }
}

async function handleLoginHelp() {
  const email = sanitizeEmail(lastLoginEmail);
  if (!email) {
    if (loginHelpStatus) loginHelpStatus.textContent = 'Enter your email above and request a link first.';
    return;
  }

  if (loginHelpBtn) {
    loginHelpBtn.disabled = true;
  }
  if (loginHelpStatus) loginHelpStatus.textContent = 'Sending…';

  try {
    const res = await fetch('/api/notify?event=login-help', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        website: loginHelpHoneypot?.value || '',
      }),
    });

    if (res.status === 429) {
      if (loginHelpStatus) {
        loginHelpStatus.textContent = 'Please wait a bit before asking again.';
      }
      return;
    }

    if (!res.ok) {
      if (loginHelpStatus) {
        loginHelpStatus.textContent = 'Could not send the alert right now. Try again in a minute.';
      }
      return;
    }

    if (loginHelpStatus) {
      loginHelpStatus.textContent = 'Got it — the organizer has been notified. Check spam while you wait.';
    }
  } catch {
    if (loginHelpStatus) {
      loginHelpStatus.textContent = 'Could not send the alert right now. Try again in a minute.';
    }
  } finally {
    if (loginHelpBtn) loginHelpBtn.disabled = false;
  }
}

async function handleLogout() {
  try {
    await supabase.auth.signOut();
    if (draftTimer) {
      clearTimeout(draftTimer);
      draftTimer = null;
    }
    if (currentUser) clearDraft(draftStorage, currentUser.id);
    currentUser = null;
    picks = {};
    savedSnapshot = '{}';
    if (nameInput) nameInput.value = '';
    loadedUserId = null;
    loadedUpdatedAt = null;
    lastLoginEmail = '';
    sessionSelectMode = null; // forget the remembered "Select for me" choice
    showAuthSection();
    showAlert('✅ Signed out', 'success');
  } catch (err) {
    console.error('Logout error:', err);
    showAlert(`❌ Logout failed: ${err.message}`, 'error');
  }
}

async function checkAuth() {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    
    if (session?.user) {
      currentUser = session.user;
      loadBracket();
      showBracketSection();
      if (nameInput) {
        nameInput.value = loadStoredName(currentUser.id) || emailLocalPart(currentUser.email);
      }
      
      // Display user info (redacted email for privacy)
      const userInfoDiv = document.getElementById('userInfo');
      userInfoDiv.textContent = `Logged in as: ${redactEmail(currentUser.email)}`;
    } else {
      showAuthSection();
    }
  } catch (err) {
    console.error('Auth check error:', err);
    showAuthSection();
  }
}

// ============================================
// Bracket Data
// ============================================

async function loadBracket() {
  if (!currentUser) return;
  // Supabase fires auth events (e.g. token refresh) when the tab regains focus.
  // Load from the DB only once per user so we never clobber unsaved picks.
  if (loadedUserId === currentUser.id) return;
  // Claim the load synchronously — before the first await — so two near-
  // simultaneous triggers (initial DOMContentLoaded + a SIGNED_IN/token-refresh
  // auth event) can't both run and double up the toast / DB request.
  const userId = currentUser.id;
  loadedUserId = userId;

  renderBracketUI(); // show the interactive bracket immediately

  try {
    const { picks: dbPicks, updatedAt } = await loadBracketRow(supabase, userId);
    picks = dbPicks;
    savedSnapshot = JSON.stringify(picks);
    loadedUpdatedAt = updatedAt;

    // Restore a local draft only if it was based on the DB version we just
    // loaded (the bracket wasn't saved from another device since). The DB
    // snapshot stays the baseline, so a restored draft reads as "not submitted".
    const draft = readDraft(draftStorage, userId);
    if (shouldRestoreDraft(draft, updatedAt) && JSON.stringify(draft.picks) !== savedSnapshot) {
      picks = draft.picks;
      renderBracketUI();
      setSaveStatus('Draft restored · not submitted');
      showAlert('↩️ Restored your unsaved draft (not submitted yet)', 'info');
    } else {
      if (draft) clearDraft(draftStorage, userId); // stale: DB changed elsewhere
      renderBracketUI();
      if (Object.keys(picks).length) {
        setSaveStatus('Loaded your saved bracket');
        showAlert('👋 Welcome back — we loaded your saved bracket', 'success');
      } else {
        setSaveStatus('');
      }
    }
  } catch (err) {
    loadedUserId = null; // load failed — allow a retry on the next auth event
    console.error('Load bracket error:', err);
    showAlert('❌ Failed to load your saved bracket', 'error');
  }
}

// ============================================
// Event Listeners
// ============================================

document.getElementById('loginForm').addEventListener('submit', handleLogin);
if (loginHelpBtn) loginHelpBtn.addEventListener('click', handleLoginHelp);
document.getElementById('logoutBtn').addEventListener('click', handleLogout);
if (saveBtn) saveBtn.addEventListener('click', handleSave);
if (saveBtnMobile) saveBtnMobile.addEventListener('click', handleSave);
if (deselectBtn) deselectBtn.addEventListener('click', handleDeselectAll);
if (randomBtn) randomBtn.addEventListener('click', handleSelectForMe);
if (exportBtn) exportBtn.addEventListener('click', handleExport);
if (nameInput) nameInput.addEventListener('input', () => {
  if (currentUser) persistName(currentUser.id, nameInput.value.trim());
});
if (bracketEl) bracketEl.addEventListener('click', onBracketClick);

// How-it-works modal: open from the header button; close via ×, "Got it", or backdrop.
if (helpBtn) helpBtn.addEventListener('click', () => openModal(helpModal));
if (helpModal) {
  helpModal.querySelectorAll('[data-close-help]').forEach((el) => {
    el.addEventListener('click', () => closeModal(helpModal));
  });
}

// "Select for me" chooser: radios re-sync the dialog (reveal group checklist,
// toggle remember + Apply label), the checklist enables/disables Apply, close
// controls dismiss, and Apply runs the chosen fill.
if (selectModal) {
  selectModal.querySelectorAll('[data-close-select]').forEach((el) => {
    el.addEventListener('click', () => closeModal(selectModal));
  });
  selectModal.querySelectorAll('input[name="selectMode"]').forEach((radio) => {
    radio.addEventListener('change', syncChooserState);
  });
}
if (selectGroupsGrid) selectGroupsGrid.addEventListener('change', syncChooserState);
if (selectApplyBtn) selectApplyBtn.addEventListener('click', applyChooserAndClose);

// Submit-success modal: close via ×, Done, or backdrop; "Screenshot my bracket"
// closes the celebration and reuses the existing export handler.
if (successModal) {
  successModal.querySelectorAll('[data-close-success]').forEach((el) => {
    el.addEventListener('click', () => closeModal(successModal));
  });
}
if (successScreenshotBtn) {
  successScreenshotBtn.addEventListener('click', () => {
    closeModal(successModal);
    handleExport();
  });
}

// Flush a pending draft synchronously before the page is hidden or unloaded, so
// a refresh inside the debounce window still persists the latest picks.
window.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden' && draftTimer) flushDraft();
});
window.addEventListener('pagehide', () => {
  if (draftTimer) flushDraft();
});

// Check authentication on page load
document.addEventListener('DOMContentLoaded', checkAuth);

// Listen for auth changes
supabase.auth.onAuthStateChange((event, session) => {
  if (event === 'SIGNED_IN' || event === 'USER_UPDATED') {
    currentUser = session?.user;
    checkAuth();
  } else if (event === 'SIGNED_OUT') {
    currentUser = null;
    showAuthSection();
  }
});

export { supabase, currentUser };
