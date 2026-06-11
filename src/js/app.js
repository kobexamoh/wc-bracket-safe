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
import { renderBracket, getGroupOrder, getGroupTeamNames, ADVANCE_COUNT } from './bracketData.js';
import { loadPicks, savePicks } from './bracketStore.js';
import { isOtpCooldownActive, formatCooldownSeconds } from './authUtils.js';
import { config } from '../config/supabase.js';

// Initialize Supabase
const supabase = createClient(config.supabaseUrl, config.supabaseAnonKey);

// State
let currentUser = null;
let picks = {}; // { [groupCode]: [teamName, ...] } ordered 1st -> 4th
let savedSnapshot = '{}'; // JSON of last persisted picks, for unsaved-change detection
let otpLastSentAt = 0;

// ============================================
// UI Helpers
// ============================================

function showAlert(message, type = 'info') {
  const alertDiv = document.createElement('div');
  alertDiv.className = `alert ${type}`;
  alertDiv.textContent = message;
  document.getElementById('alerts').appendChild(alertDiv);
  setTimeout(() => alertDiv.remove(), 5000);
}

function showAuthSection() {
  document.getElementById('authSection').style.display = 'block';
  document.getElementById('bracketSection').style.display = 'none';
}

function showBracketSection() {
  document.getElementById('authSection').style.display = 'none';
  document.getElementById('bracketSection').style.display = 'block';
}

// ============================================
// Bracket UI (interactive ranking)
// ============================================

const bracketEl = document.getElementById('bracket');
const saveBtn = document.getElementById('saveBtn');
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
  if (progressBarEl) progressBarEl.style.width = `${(done / groups.length) * 100}%`;
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

function onBracketClick(e) {
  const btn = e.target.closest('button[data-group]');
  if (!btn) return;
  const group = btn.dataset.group;
  const index = Number(btn.dataset.index);
  const teamName = getGroupTeamNames(group)[index];
  if (!teamName) return;

  togglePick(group, teamName);
  renderBracketUI();
  setSaveStatus(hasUnsavedChanges() ? 'Unsaved changes' : '');
}

async function handleSave() {
  if (!currentUser) {
    showAlert('❌ Please sign in before saving', 'error');
    return;
  }
  if (saveBtn) {
    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving…';
  }
  setSaveStatus('Saving…');
  try {
    picks = await savePicks(supabase, currentUser.id, picks);
    savedSnapshot = JSON.stringify(picks);
    renderBracketUI();
    setSaveStatus('Saved ✓');
    showAlert('✅ Bracket saved', 'success');
  } catch (err) {
    console.error('Save error:', err);
    setSaveStatus('Not saved');
    showAlert(`❌ Save failed: ${err.message}`, 'error');
  } finally {
    if (saveBtn) {
      saveBtn.disabled = false;
      saveBtn.textContent = 'Save bracket';
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
    });

    if (error) throw error;

    otpLastSentAt = Date.now();
    showAlert('✅ Check your email for the login link', 'success');
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
    currentUser = null;
    picks = {};
    savedSnapshot = '{}';
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
      
      // Display user info (redacted email for privacy)
      const userInfoDiv = document.getElementById('userInfo');
      userInfoDiv.textContent = `👤 Logged in as: ${redactEmail(currentUser.email)}`;
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

  renderBracketUI(); // show the interactive bracket immediately

  try {
    picks = await loadPicks(supabase, currentUser.id);
    savedSnapshot = JSON.stringify(picks);
    renderBracketUI();
    setSaveStatus(Object.keys(picks).length ? 'Loaded your saved bracket' : '');
  } catch (err) {
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
if (bracketEl) bracketEl.addEventListener('click', onBracketClick);

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
