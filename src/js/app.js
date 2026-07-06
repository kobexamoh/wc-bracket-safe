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
import { renderBracket, getGroupOrder, getGroupTeamNames, getFlagCode, randomPicks, fillBlankRanks, randomizeGroups, ADVANCE_COUNT } from './bracketData.js';
import { loadBracketRow, savePicks } from './bracketStore.js';
import { downloadBracketImage } from './exportImage.js';
import { celebrate } from './celebrate.js';
import { getThirdPlaceCandidates, buildKnockoutBracket, applyWinnerPick, getPodiumPlacements } from './knockout.js';
import { renderKnockoutTree } from './knockoutRender.js';
import {
  buildRealResultsBracket,
  applyRealWinnerPick,
  getLockedMatchIds,
} from './realKnockout.js';
import {
  allGroupsRanked,
  isThirdPlaceComplete,
  getStageNavState,
  STAGE_HEADER_LABELS,
} from './stageNav.js';
import { mountBallChase } from './ballChase.js';
import { saveDraft, readDraft, clearDraft, shouldRestoreDraft } from './draftStore.js';
import { isOtpCooldownActive, formatCooldownSeconds } from './authUtils.js';
import {
  isGroupStageSubmitLocked,
  GROUP_STAGE_LOCK_BANNER,
  GROUP_STAGE_LOCK_SUBMIT_ALERT,
} from './groupStageLock.js';
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
let savedKnockoutSnapshot = '{"winners":{},"thirdGroups":[]}';
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
const KNOCKOUT_DEBOUNCE_MS = 1200;
let draftTimer = null;
let knockoutTimer = null;

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
  document.getElementById('authSection').style.display = 'grid';
  document.getElementById('bracketSection').style.display = 'none';
  const headerActions = document.getElementById('headerActions');
  if (headerActions) headerActions.style.display = 'none'; // Sign Out hidden when logged out
  const headerTagline = document.getElementById('headerTagline');
  if (headerTagline) headerTagline.style.display = 'none'; // tagline lives in the grey area on the sign-in screen
  closeAuthConfirmModal({ showHint: false });
  if (loginHelpStatus) loginHelpStatus.textContent = '';
  startBallChase();
}

function showBracketSection() {
  stopBallChase();
  document.getElementById('authSection').style.display = 'none';
  document.getElementById('bracketSection').style.display = 'block';
  const headerActions = document.getElementById('headerActions');
  if (headerActions) headerActions.style.display = 'flex'; // Sign Out in the header when logged in
  const headerTagline = document.getElementById('headerTagline');
  if (headerTagline) headerTagline.style.display = 'block'; // small subtitle under the h1 once logged in
  wasAllGroupsRanked = allGroupsRanked(picks);
  if (isGroupStageSubmitLocked()) {
    setActiveStage('officialBracket');
  } else {
    setActiveStage('groups');
  }
  refreshSubmitLockUI();
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
const championModal = document.getElementById('championModal');
const podiumList = document.getElementById('podiumList');
const championScreenshotBtn = document.getElementById('championScreenshotBtn');
const qfHelpModal = document.getElementById('qfHelpModal');
const authConfirmModal = document.getElementById('authConfirmModal');
const loginHelpBtn = document.getElementById('loginHelpBtn');
const loginHelpStatus = document.getElementById('loginHelpStatus');
const loginHelpHoneypot = document.getElementById('loginHelpHoneypot');
const loginHeroFrame = document.getElementById('loginHeroFrame');
const HELP_SEEN_KEY = 'wc-bracket:seen-help';

const AUTH_SENT_HINT =
  'Check your email — open the sign-in link on this same device and browser.';

let unmountBallChase = null;

function startBallChase() {
  if (!loginHeroFrame) return;
  stopBallChase();
  unmountBallChase = mountBallChase(loginHeroFrame);
}

function stopBallChase() {
  if (unmountBallChase) {
    unmountBallChase();
    unmountBallChase = null;
  }
}

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

/** Close the post-send auth dialog; optionally leave a one-line hint in #authAlerts. */
function closeAuthConfirmModal({ showHint = true } = {}) {
  if (!authConfirmModal || authConfirmModal.hidden) return;
  closeModal(authConfirmModal);
  if (showHint) {
    showAlert(AUTH_SENT_HINT, 'info', { persist: true });
  }
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
const knockoutEl = document.getElementById('knockout');
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

// Multi-screen stage flow: Group Stage → Third Place → Knockout (OG-style tabs).
const bracketSection = document.getElementById('bracketSection');
const bracketLayout = document.getElementById('bracketLayout');
const stageNav = document.getElementById('stageNav');
const headerStageLabel = document.getElementById('headerStageLabel');
const thirdPlaceGrid = document.getElementById('thirdPlaceGrid');
const thirdPlaceCounter = document.getElementById('thirdPlaceCounter');
const groupStageLockBanner = document.getElementById('groupStageLockBanner');
const officialBracketEl = document.getElementById('officialBracket');
const officialBracketTree = document.getElementById('officialBracketTree');

const SUBMIT_LABEL_OPEN = 'Submit bracket';
const SUBMIT_LABEL_LOCKED = 'Submissions closed';
const SUBMIT_TITLE_OPEN = 'Submit your bracket (needs at least 2 picks in every group)';
const SUBMIT_TITLE_LOCKED = 'Group-stage submissions are closed — the real group stage has finished';

const STAGE_AUTO_MS = 600;
let activeStage = 'groups'; // 'groups' | 'third' | 'knockout'
let selectedThirdGroups = []; // 8 group letters
let knockoutWinners = {}; // { [matchId]: 'A'|'B' }
let wasAllGroupsRanked = false;
let stageAutoTimer = null;

// Official Bracket (real-results) state
let officialWinners = {};      // user's own picks for unlocked real-bracket matches
let savedOfficialSnapshot = '{"winners":{}}';
let officialSaveTimer = null;
const OFFICIAL_DEBOUNCE_MS = 1200;

function currentKnockoutMeta() {
  return { winners: knockoutWinners, thirdGroups: selectedThirdGroups };
}

function applyKnockoutMeta(meta = {}) {
  knockoutWinners = meta.winners ? { ...meta.winners } : {};
  selectedThirdGroups = Array.isArray(meta.thirdGroups) ? [...meta.thirdGroups] : [];
  savedKnockoutSnapshot = JSON.stringify(currentKnockoutMeta());
}

function currentOfficialMeta() {
  return { winners: officialWinners };
}

function applyOfficialMeta(meta = {}) {
  officialWinners = meta?.winners ? { ...meta.winners } : {};
  savedOfficialSnapshot = JSON.stringify(currentOfficialMeta());
}

function hasUnsavedOfficialChanges() {
  return JSON.stringify(currentOfficialMeta()) !== savedOfficialSnapshot;
}

function hasUnsavedKnockoutChanges() {
  return JSON.stringify(currentKnockoutMeta()) !== savedKnockoutSnapshot;
}

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

/** Reflect env lock: read-only groups, disabled submit + bulk randomizers. */
function refreshSubmitLockUI() {
  const locked = isGroupStageSubmitLocked();

  if (bracketSection) bracketSection.classList.toggle('is-group-stage-locked', locked);
  if (groupStageLockBanner) groupStageLockBanner.hidden = !(locked && activeStage === 'groups');

  if (randomBtn) randomBtn.disabled = locked;
  if (deselectBtn) deselectBtn.disabled = locked;

  const isSubmitting = saveBtn?.textContent === 'Submitting…';
  if (isSubmitting) return;

  [saveBtn, saveBtnMobile].forEach((btn) => {
    if (!btn) return;
    btn.disabled = locked;
    btn.textContent = locked ? SUBMIT_LABEL_LOCKED : SUBMIT_LABEL_OPEN;
    btn.title = locked ? SUBMIT_TITLE_LOCKED : SUBMIT_TITLE_OPEN;
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
  const locked = isGroupStageSubmitLocked();
  bracketEl.innerHTML = renderBracket(picks, { showClearButtons: !locked });
  updateProgress();
}

function clearStageAutoTimer() {
  if (stageAutoTimer) {
    clearTimeout(stageAutoTimer);
    stageAutoTimer = null;
  }
}

function scheduleStageAdvance(nextStage) {
  clearStageAutoTimer();
  stageAutoTimer = setTimeout(() => {
    stageAutoTimer = null;
    setActiveStage(nextStage);
  }, STAGE_AUTO_MS);
}

function reconcileActiveStage() {
  if (activeStage === 'third' && !allGroupsRanked(picks)) {
    setActiveStage('groups');
    return;
  }
  if (activeStage === 'knockout' && !isThirdPlaceComplete(selectedThirdGroups)) {
    setActiveStage(allGroupsRanked(picks) ? 'third' : 'groups');
  }
}

function updateStageNav() {
  if (!stageNav) return;
  const state = getStageNavState(picks, selectedThirdGroups, activeStage);
  for (const btn of stageNav.querySelectorAll('[data-stage]')) {
    const key = btn.dataset.stage;
    const entry = state[key];
    if (!entry) continue;
    btn.classList.toggle('stage-btn--active', entry.active);
    btn.classList.toggle('stage-btn--completed', entry.completed && !entry.active);
    btn.classList.toggle('stage-btn--disabled', !!entry.disabled);
    btn.disabled = !!entry.disabled;
    btn.setAttribute('aria-current', entry.active ? 'step' : 'false');
  }
}

function setActiveStage(stage) {
  if (stage === 'third' && !allGroupsRanked(picks)) return;
  if (stage === 'knockout' && !isThirdPlaceComplete(selectedThirdGroups)) return;

  clearStageAutoTimer();
  const valid = ['groups', 'third', 'knockout', 'officialBracket'];
  activeStage = valid.includes(stage) ? stage : 'groups';

  if (bracketSection) {
    bracketSection.classList.remove('is-stage-groups', 'is-stage-third', 'is-stage-knockout');
    bracketSection.classList.add(`is-stage-${activeStage}`);
  }
  if (bracketLayout) {
    bracketLayout.classList.toggle('bracket-layout--full', activeStage !== 'groups');
  }
  if (headerStageLabel) {
    headerStageLabel.textContent = STAGE_HEADER_LABELS[activeStage] || STAGE_HEADER_LABELS.groups;
  }

  for (const panel of document.querySelectorAll('[data-stage-panel]')) {
    panel.hidden = panel.dataset.stagePanel !== activeStage;
  }

  updateStageNav();

  if (activeStage === 'third') renderThirdPlaceGrid();
  if (activeStage === 'knockout') renderKnockoutUI();
  if (activeStage === 'officialBracket') renderOfficialBracketUI();

  refreshSubmitLockUI();
  window.scrollTo(0, 0);
}

function updateThirdPlaceCounter() {
  if (!thirdPlaceCounter) return;
  thirdPlaceCounter.textContent = `${selectedThirdGroups.length} / 8 selected`;
}

function escHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function renderThirdPlaceGrid() {
  if (!thirdPlaceGrid) return;
  const candidates = getThirdPlaceCandidates(picks);
  const chosenSet = new Set(selectedThirdGroups);
  thirdPlaceGrid.innerHTML = candidates
    .map(({ group, team }) => {
      if (!team) return '';
      const selected = chosenSet.has(group);
      const code = getFlagCode(team);
      const flag = code
        ? `<img class="third-place-card__flag team-flag" src="/flags/${code}.svg" alt="" width="28" height="21">`
        : '';
      return `
        <button
          type="button"
          class="third-place-card${selected ? ' is-selected' : ''}"
          data-third-group="${group}"
        >
          ${flag}
          <span class="third-place-card__name">${escHtml(team)}</span>
          <span class="third-place-card__meta">Group ${group} · 3rd</span>
          ${selected ? '<span class="third-place-card__check" aria-hidden="true">✓</span>' : ''}
        </button>
      `;
    })
    .join('');
  updateThirdPlaceCounter();
}

function toggleThirdPlace(group) {
  const prevLen = selectedThirdGroups.length;
  const idx = selectedThirdGroups.indexOf(group);
  if (idx > -1) {
    selectedThirdGroups = selectedThirdGroups.filter((g) => g !== group);
  } else if (selectedThirdGroups.length < 8) {
    selectedThirdGroups = [...selectedThirdGroups, group];
  } else {
    return;
  }

  renderThirdPlaceGrid();
  updateStageNav();
  afterKnockoutChanged();

  if (selectedThirdGroups.length === 8 && prevLen === 7) {
    scheduleStageAdvance('knockout');
  }
}

function renderKnockoutUI() {
  if (!knockoutEl) return;
  const scrollEl = knockoutEl.querySelector('.knockout-scroll');
  const savedScrollLeft = scrollEl ? scrollEl.scrollLeft : 0;

  if (selectedThirdGroups.length !== 8) {
    knockoutEl.innerHTML = `
      <div class="alert info">Select exactly 8 third-place teams on the <strong>Third Place</strong> tab to build the Round of 32.</div>
    `;
    return;
  }
  try {
    const bracket = buildKnockoutBracket(picks, selectedThirdGroups, knockoutWinners);
    knockoutEl.innerHTML = renderKnockoutTree(bracket, knockoutWinners);
  } catch (err) {
    knockoutEl.innerHTML = `<div class="alert error">${err.message}</div>`;
  }

  const newScrollEl = knockoutEl.querySelector('.knockout-scroll');
  if (newScrollEl && savedScrollLeft > 0) {
    newScrollEl.scrollLeft = savedScrollLeft;
  }
}

function openChampionModal() {
  if (!championModal || !podiumList) return;
  const bracket = buildKnockoutBracket(picks, selectedThirdGroups, knockoutWinners);
  const podium = getPodiumPlacements(bracket, knockoutWinners);
  const rows = [
    ['1st place', podium.first],
    ['2nd place', podium.second],
    ['3rd place', podium.third],
    ['4th place', podium.fourth],
  ];
  podiumList.innerHTML = rows
    .map(([label, team]) => {
      const value = team || '— (not picked yet)';
      return `<li class="podium-list__item"><span class="podium-list__place">${label}</span><span class="podium-list__team">${value}</span></li>`;
    })
    .join('');
  openModal(championModal);
  celebrate();
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

  if (hasUnsavedChanges() || hasUnsavedKnockoutChanges()) {
    const ok = saveDraft(
      draftStorage,
      currentUser.id,
      picks,
      loadedUpdatedAt,
      currentKnockoutMeta(),
    );
    setSaveStatus(ok ? 'Draft saved · not submitted' : 'Unsaved changes');
  } else {
    clearDraft(draftStorage, currentUser.id);
    setSaveStatus('');
  }
}

function scheduleKnockoutSave() {
  if (knockoutTimer) clearTimeout(knockoutTimer);
  knockoutTimer = setTimeout(flushKnockoutSave, KNOCKOUT_DEBOUNCE_MS);
}

async function flushKnockoutSave() {
  if (knockoutTimer) {
    clearTimeout(knockoutTimer);
    knockoutTimer = null;
  }
  if (!currentUser || hasUnsavedChanges()) return;
  if (!hasUnsavedKnockoutChanges()) return;

  try {
    const saved = await savePicks(supabase, currentUser.id, picks, currentKnockoutMeta(), currentOfficialMeta());
    savedKnockoutSnapshot = JSON.stringify(saved.knockout);
    savedOfficialSnapshot = JSON.stringify(saved.knockoutReal);
    loadedUpdatedAt = saved.updatedAt;
    setSaveStatus('Knockout saved ✓');
  } catch (err) {
    console.error('Knockout save error:', err);
    setSaveStatus('Knockout not saved');
  }
}

function afterKnockoutChanged() {
  renderKnockoutUI();
  updateStageNav();
  reconcileActiveStage();
  if (!currentUser) return;
  if (hasUnsavedChanges()) {
    setSaveStatus('Saving draft…');
    scheduleDraftSave();
    return;
  }
  setSaveStatus('Saving knockout…');
  scheduleKnockoutSave();
}

// ── Official Bracket (real results) ──────────────────────────────────────────

function renderOfficialBracketUI() {
  if (!officialBracketTree) return;
  const scrollEl = officialBracketTree.querySelector('.knockout-scroll');
  const savedScrollLeft = scrollEl ? scrollEl.scrollLeft : 0;

  try {
    const { bracket, mergedWinners, lockedSet } = buildRealResultsBracket(officialWinners);
    officialBracketTree.innerHTML = renderKnockoutTree(bracket, mergedWinners, { lockedMatches: lockedSet });
  } catch (err) {
    officialBracketTree.innerHTML = `<div class="alert error">${err.message}</div>`;
  }

  const newScrollEl = officialBracketTree.querySelector('.knockout-scroll');
  if (newScrollEl && savedScrollLeft > 0) {
    newScrollEl.scrollLeft = savedScrollLeft;
  }
}

function scheduleOfficialSave() {
  if (officialSaveTimer) clearTimeout(officialSaveTimer);
  officialSaveTimer = setTimeout(flushOfficialSave, OFFICIAL_DEBOUNCE_MS);
}

async function flushOfficialSave() {
  if (officialSaveTimer) {
    clearTimeout(officialSaveTimer);
    officialSaveTimer = null;
  }
  if (!currentUser) return;
  if (!hasUnsavedOfficialChanges()) return;

  try {
    const saved = await savePicks(
      supabase,
      currentUser.id,
      picks,
      currentKnockoutMeta(),
      currentOfficialMeta(),
    );
    savedOfficialSnapshot = JSON.stringify(saved.knockoutReal);
    loadedUpdatedAt = saved.updatedAt;
    setSaveStatus('Official picks saved ✓');
  } catch (err) {
    console.error('Official bracket save error:', err);
    setSaveStatus('Official picks not saved');
  }
}

function afterOfficialChanged() {
  renderOfficialBracketUI();
  if (!currentUser) return;
  setSaveStatus('Saving official picks…');
  scheduleOfficialSave();
}

// Shared post-change routine: re-render, reflect draft status, and autosave.
function afterPicksChanged() {
  renderBracketUI();
  if (!isGroupStageSubmitLocked()) {
    setSaveStatus(hasUnsavedChanges() ? 'Saving draft…' : '');
    scheduleDraftSave();
  }

  const nowAllRanked = allGroupsRanked(picks);
  if (nowAllRanked && !wasAllGroupsRanked && activeStage === 'groups') {
    scheduleStageAdvance('third');
  }
  wasAllGroupsRanked = nowAllRanked;

  updateStageNav();
  reconcileActiveStage();

  if (activeStage === 'third') renderThirdPlaceGrid();
  if (activeStage === 'knockout') renderKnockoutUI();
}

function onBracketClick(e) {
  if (isGroupStageSubmitLocked()) return;

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
  if (isGroupStageSubmitLocked()) return;
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
  if (isGroupStageSubmitLocked()) return;
  if (!Object.keys(picks).length) return;
  if (!window.confirm('Clear all your picks?')) return;
  picks = {};
  applyKnockoutMeta({});
  wasAllGroupsRanked = false;
  if (activeStage !== 'groups') setActiveStage('groups');
  afterPicksChanged();
}

// "Select for me" — non-destructive by default. An empty bracket has nothing to
// protect, so just fill all 12; otherwise open the chooser (or apply the choice
// remembered for this session) so the user controls exactly what gets touched.
function handleSelectForMe() {
  if (isGroupStageSubmitLocked()) return;
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
  if (isGroupStageSubmitLocked()) {
    showAlert(GROUP_STAGE_LOCK_SUBMIT_ALERT, 'info', { persist: true });
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
    const saved = await savePicks(supabase, currentUser.id, picks, currentKnockoutMeta(), currentOfficialMeta());
    picks = saved.picks;
    savedSnapshot = JSON.stringify(picks);
    savedKnockoutSnapshot = JSON.stringify(saved.knockout);
    savedOfficialSnapshot = JSON.stringify(saved.knockoutReal);
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
    refreshSubmitLockUI();
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
    loginBtn.setAttribute('aria-busy', 'true');
    loginBtn.classList.add('auth-form__submit--sending');
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
    // Open the check-email dialog (keeps the hero pitch visible behind it).
    clearAllAlerts();
    openModal(authConfirmModal);
    document.getElementById('emailInput').value = '';
  } catch (err) {
    console.error('Login error:', err);
    showAlert(`❌ Login failed: ${err.message}`, 'error');
  } finally {
    if (loginBtn) {
      loginBtn.disabled = false;
      loginBtn.removeAttribute('aria-busy');
      loginBtn.classList.remove('auth-form__submit--sending');
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

    if (res.status === 403) {
      if (loginHelpStatus) {
        loginHelpStatus.textContent =
          'Could not send from this browser origin. Try the live site or a Vercel preview.';
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
    if (knockoutTimer) {
      clearTimeout(knockoutTimer);
      knockoutTimer = null;
    }
    if (officialSaveTimer) {
      clearTimeout(officialSaveTimer);
      officialSaveTimer = null;
    }
    clearStageAutoTimer();
    if (currentUser) clearDraft(draftStorage, currentUser.id);
    currentUser = null;
    picks = {};
    savedSnapshot = '{}';
    applyKnockoutMeta({});
    applyOfficialMeta({});
    wasAllGroupsRanked = false;
    activeStage = 'groups';
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

// OG-style stage tabs + third-place card grid
if (stageNav) {
  stageNav.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-stage]');
    if (!btn || btn.disabled) return;
    setActiveStage(btn.dataset.stage);
  });
}
if (thirdPlaceGrid) {
  thirdPlaceGrid.addEventListener('click', (e) => {
    const card = e.target.closest('[data-third-group]');
    if (!card) return;
    toggleThirdPlace(card.dataset.thirdGroup);
  });
}

if (knockoutEl) {
  knockoutEl.addEventListener('click', (e) => {
    if (e.target.closest('[data-open-qf-help]')) {
      openModal(qfHelpModal);
      return;
    }

    if (e.target.closest('#viewPodiumBtn')) {
      openChampionModal();
      return;
    }

    const btn = e.target.closest('button[data-match][data-side]');
    if (!btn) return;
    const matchId = btn.dataset.match;
    const side = btn.dataset.side;
    if (matchId === 'M103' && (!knockoutWinners.M101 || !knockoutWinners.M102)) return;

    const prevChampion = buildKnockoutBracket(picks, selectedThirdGroups, knockoutWinners)?.championTeam || null;
    knockoutWinners = applyWinnerPick(
      knockoutWinners,
      matchId,
      side,
      picks,
      selectedThirdGroups,
    );
    afterKnockoutChanged();

    const nextChampion = buildKnockoutBracket(picks, selectedThirdGroups, knockoutWinners)?.championTeam || null;
    if (!prevChampion && nextChampion) {
      openChampionModal();
    }
  });
}

// Official Bracket click handler: same pick UX but respects locked matches.
if (officialBracketTree) {
  officialBracketTree.addEventListener('click', (e) => {
    if (e.target.closest('#viewPodiumBtn')) {
      openOfficialChampionModal();
      return;
    }

    const btn = e.target.closest('button[data-match][data-side]');
    if (!btn || btn.disabled) return;
    const matchId = btn.dataset.match;
    const side = btn.dataset.side;

    const lockedSet = getLockedMatchIds();
    if (lockedSet.has(matchId)) return;

    if (matchId === 'M103') {
      const { mergedWinners } = buildRealResultsBracket(officialWinners);
      if (!mergedWinners.M101 || !mergedWinners.M102) return;
    }

    const prevBracket = buildRealResultsBracket(officialWinners);
    const prevChampion = prevBracket.bracket.championTeam || null;

    officialWinners = applyRealWinnerPick(officialWinners, matchId, side);
    afterOfficialChanged();

    const nextBracket = buildRealResultsBracket(officialWinners);
    const nextChampion = nextBracket.bracket.championTeam || null;
    if (!prevChampion && nextChampion) {
      openOfficialChampionModal();
    }
  });
}

function openOfficialChampionModal() {
  if (!championModal || !podiumList) return;
  const { bracket, mergedWinners } = buildRealResultsBracket(officialWinners);
  const podium = getPodiumPlacements(bracket, mergedWinners);
  const rows = [
    ['1st place', podium.first],
    ['2nd place', podium.second],
    ['3rd place', podium.third],
    ['4th place', podium.fourth],
  ];
  podiumList.innerHTML = rows
    .map(([label, team]) => {
      const value = team || '— (not picked yet)';
      return `<li class="podium-list__item"><span class="podium-list__place">${label}</span><span class="podium-list__team">${value}</span></li>`;
    })
    .join('');
  openModal(championModal);
  celebrate();
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
    const { picks: dbPicks, knockout: dbKnockout, knockoutReal: dbKnockoutReal, updatedAt } = await loadBracketRow(supabase, userId);
    picks = dbPicks;
    applyKnockoutMeta(dbKnockout);
    applyOfficialMeta(dbKnockoutReal);
    savedSnapshot = JSON.stringify(picks);
    loadedUpdatedAt = updatedAt;

    // Restore a local draft only if it was based on the DB version we just
    // loaded (the bracket wasn't saved from another device since). The DB
    // snapshot stays the baseline, so a restored draft reads as "not submitted".
    const draft = readDraft(draftStorage, userId);
    const lockActive = isGroupStageSubmitLocked();
    if (!lockActive && shouldRestoreDraft(draft, updatedAt) && (
      JSON.stringify(draft.picks) !== savedSnapshot
      || JSON.stringify(draft.knockout) !== savedKnockoutSnapshot
    )) {
      picks = draft.picks;
      applyKnockoutMeta(draft.knockout);
      savedSnapshot = JSON.stringify(picks);
      renderBracketUI();
      wasAllGroupsRanked = allGroupsRanked(picks);
      updateStageNav();
      reconcileActiveStage();
      if (activeStage === 'third') renderThirdPlaceGrid();
      if (activeStage === 'knockout') renderKnockoutUI();
      if (activeStage === 'officialBracket') renderOfficialBracketUI();
      setSaveStatus('Draft restored · not submitted');
      showAlert('↩️ Restored your unsaved draft (not submitted yet)', 'info');
    } else {
      if (draft) clearDraft(draftStorage, userId); // stale: DB changed elsewhere, or lock skips drafts
      renderBracketUI();
      wasAllGroupsRanked = allGroupsRanked(picks);
      updateStageNav();
      if (activeStage === 'officialBracket') renderOfficialBracketUI();
      if (Object.keys(picks).length) {
        setSaveStatus('Loaded your saved bracket');
        if (lockActive) {
          showAlert(GROUP_STAGE_LOCK_BANNER, 'info', { persist: true });
        } else {
          showAlert('👋 Welcome back — we loaded your saved bracket', 'success');
        }
      } else {
        setSaveStatus('');
        if (lockActive) {
          showAlert(GROUP_STAGE_LOCK_BANNER, 'info', { persist: true });
        }
      }
    }
  } catch (err) {
    loadedUserId = null; // load failed — allow a retry on the next auth event
    console.error('Load bracket error:', err);
    showAlert('❌ Failed to load your saved bracket', 'error');
  }

  refreshSubmitLockUI();
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

// Magic-link sent: close via ×, Got it, or backdrop; leave a slim hint in #authAlerts.
if (authConfirmModal) {
  authConfirmModal.querySelectorAll('[data-close-auth]').forEach((el) => {
    el.addEventListener('click', () => closeAuthConfirmModal());
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

if (championModal) {
  championModal.querySelectorAll('[data-close-champion]').forEach((el) => {
    el.addEventListener('click', () => closeModal(championModal));
  });
}

if (qfHelpModal) {
  qfHelpModal.querySelectorAll('[data-close-qf-help]').forEach((el) => {
    el.addEventListener('click', () => closeModal(qfHelpModal));
  });
}

// Flush a pending draft synchronously before the page is hidden or unloaded, so
// a refresh inside the debounce window still persists the latest picks.
window.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') {
    if (draftTimer) flushDraft();
    if (knockoutTimer) flushKnockoutSave();
    if (officialSaveTimer) flushOfficialSave();
  }
});
window.addEventListener('pagehide', () => {
  if (draftTimer) flushDraft();
  if (knockoutTimer) flushKnockoutSave();
  if (officialSaveTimer) flushOfficialSave();
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
