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
import { sanitizeEmail, redactEmail } from './sanitize.js';
import { renderBracket, getGroupOrder, getGroupTeamNames, randomPicks, ADVANCE_COUNT } from './bracketData.js';
import { loadBracketRow, savePicks } from './bracketStore.js';
import { downloadBracketImage } from './exportImage.js';
import { saveDraft, readDraft, clearDraft, shouldRestoreDraft } from './draftStore.js';
import { isOtpCooldownActive, formatCooldownSeconds } from './authUtils.js';
import { config } from '../config/supabase.js';

// Initialize Supabase
const supabase = createClient(config.supabaseUrl, config.supabaseAnonKey);

// State
let currentUser = null;
let picks = {}; // { [groupCode]: [teamName, ...] } ordered 1st -> 4th
let savedSnapshot = '{}'; // JSON of last persisted picks, for unsaved-change detection
let loadedUserId = null; // guards against reloading (and clobbering unsaved picks) on tab refocus
let loadedUpdatedAt = null; // DB row's updated_at we last synced with (a draft's base version)
let otpLastSentAt = 0;

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

function alertTarget() {
  const section = document.getElementById('bracketSection');
  const onBracket = section && section.style.display !== 'none';
  return (
    (onBracket ? document.getElementById('alerts') : document.getElementById('authAlerts')) ||
    document.getElementById('alerts') ||
    document.getElementById('authAlerts')
  );
}

function clearAllAlerts() {
  if (alertTimer) {
    clearTimeout(alertTimer);
    alertTimer = null;
  }
  ['alerts', 'authAlerts'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.replaceChildren();
  });
}

function showAlert(message, type = 'info', options = {}) {
  const target = alertTarget();
  if (!target) return;
  // Clear any current message (on either screen) so only one ever shows.
  clearAllAlerts();

  const alertDiv = document.createElement('div');
  alertDiv.className = `alert ${type}`;
  alertDiv.textContent = message;
  target.replaceChildren(alertDiv);

  // Errors stay until the next action replaces them; everything else fades out.
  const persist = options.persist ?? (type === 'error');
  if (!persist) {
    const ms = options.duration ?? ALERT_DEFAULT_MS;
    alertTimer = setTimeout(() => {
      if (target.firstChild === alertDiv) target.replaceChildren();
    }, ms);
  }
}

function showAuthSection() {
  document.getElementById('authSection').style.display = 'block';
  document.getElementById('bracketSection').style.display = 'none';
  const headerActions = document.getElementById('headerActions');
  if (headerActions) headerActions.style.display = 'none'; // Sign Out hidden when logged out
}

function showBracketSection() {
  document.getElementById('authSection').style.display = 'none';
  document.getElementById('bracketSection').style.display = 'block';
  const headerActions = document.getElementById('headerActions');
  if (headerActions) headerActions.style.display = 'flex'; // Sign Out in the header when logged in
  maybeAutoOpenHelp(); // first-time onboarding overlay (once per browser)
}

// ============================================
// How-it-works modal (onboarding overlay)
// ============================================
const helpModal = document.getElementById('helpModal');
const helpBtn = document.getElementById('helpBtn');
const helpDialog = helpModal ? helpModal.querySelector('.modal__dialog') : null;
const HELP_SEEN_KEY = 'wc-bracket:seen-help';
let lastFocusedBeforeHelp = null;

// Seen-once flag lives in the same guarded localStorage handle as the draft.
function helpAlreadySeen() {
  if (!draftStorage) return false;
  try {
    return draftStorage.getItem(HELP_SEEN_KEY) === '1';
  } catch {
    return false;
  }
}

function markHelpSeen() {
  if (!draftStorage) return;
  try {
    draftStorage.setItem(HELP_SEEN_KEY, '1');
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

// Esc closes; Tab cycles within the dialog so focus can't slip behind it.
function onHelpKeydown(e) {
  if (e.key === 'Escape') {
    e.preventDefault();
    closeHelp();
    return;
  }
  if (e.key !== 'Tab' || !helpDialog) return;
  const focusable = getFocusable(helpDialog);
  if (!focusable.length) {
    e.preventDefault();
    helpDialog.focus();
    return;
  }
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  const active = document.activeElement;
  if (e.shiftKey && (active === first || active === helpDialog)) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && active === last) {
    e.preventDefault();
    first.focus();
  }
}

function openHelp() {
  if (!helpModal) return;
  lastFocusedBeforeHelp = document.activeElement;
  helpModal.hidden = false;
  document.body.style.overflow = 'hidden'; // lock background scroll
  document.addEventListener('keydown', onHelpKeydown, true);
  if (helpDialog) helpDialog.focus(); // move focus in for Esc + screen readers
}

function closeHelp() {
  if (!helpModal || helpModal.hidden) return;
  helpModal.hidden = true;
  document.body.style.overflow = '';
  document.removeEventListener('keydown', onHelpKeydown, true);
  if (lastFocusedBeforeHelp && typeof lastFocusedBeforeHelp.focus === 'function') {
    lastFocusedBeforeHelp.focus(); // restore focus to the trigger
  }
  lastFocusedBeforeHelp = null;
}

// Auto-open the explainer once per browser, the first time the bracket appears.
function maybeAutoOpenHelp() {
  if (!helpModal || helpAlreadySeen()) return;
  markHelpSeen();
  openHelp();
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

function setSaveStatus(text) {
  if (saveStatusEl) saveStatusEl.textContent = text;
}

function updateProgress() {
  const groups = getGroupOrder();
  const done = groups.filter((code) => (picks[code]?.length || 0) >= ADVANCE_COUNT).length;
  if (progressTextEl) progressTextEl.textContent = `${done} / ${groups.length} groups set`;
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

// Fill a random but valid bracket (2 advancing per group); user can tweak or save.
function handleSelectForMe() {
  picks = randomPicks();
  afterPicksChanged();
  showAlert('🎲 Picked a random bracket for you — tweak it, then submit.', 'info');
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
  if (saveBtn) {
    saveBtn.disabled = true;
    saveBtn.textContent = 'Submitting…';
  }
  setSaveStatus('Submitting…');
  try {
    const saved = await savePicks(supabase, currentUser.id, picks);
    picks = saved.picks;
    savedSnapshot = JSON.stringify(picks);
    loadedUpdatedAt = saved.updatedAt;
    clearDraft(draftStorage, currentUser.id); // DB is now the source of truth
    renderBracketUI();
    setSaveStatus('Submitted ✓');
    showAlert(
      '✅ Bracket submitted! Log back in anytime to change it, screenshot it for the team in Campfire, or clear it to start a new one.',
      'success',
      { duration: 9000 }
    );
  } catch (err) {
    console.error('Save error:', err);
    setSaveStatus('Not submitted');
    showAlert(`❌ Couldn't submit your bracket: ${err.message}`, 'error');
  } finally {
    if (saveBtn) {
      saveBtn.disabled = false;
      saveBtn.textContent = 'Submit bracket';
    }
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
    showAlert('✅ Check your email for the login link (open it in this same browser)', 'success');
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
document.getElementById('logoutBtn').addEventListener('click', handleLogout);
if (saveBtn) saveBtn.addEventListener('click', handleSave);
if (deselectBtn) deselectBtn.addEventListener('click', handleDeselectAll);
if (randomBtn) randomBtn.addEventListener('click', handleSelectForMe);
if (exportBtn) exportBtn.addEventListener('click', handleExport);
if (nameInput) nameInput.addEventListener('input', () => {
  if (currentUser) persistName(currentUser.id, nameInput.value.trim());
});
if (bracketEl) bracketEl.addEventListener('click', onBracketClick);

// How-it-works modal: open from the header button; close via ×, "Got it", or backdrop.
if (helpBtn) helpBtn.addEventListener('click', openHelp);
if (helpModal) {
  helpModal.querySelectorAll('[data-close-help]').forEach((el) => {
    el.addEventListener('click', closeHelp);
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
