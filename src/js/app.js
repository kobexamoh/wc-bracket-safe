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
import { sanitizeInput, sanitizeEmail, redactEmail } from './sanitize.js';
import { config } from '../config/supabase.js';

// Initialize Supabase
const supabase = createClient(config.supabaseUrl, config.supabaseAnonKey);

// State
let currentUser = null;
let currentBracket = null;

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
// Authentication
// ============================================

async function handleLogin(e) {
  e.preventDefault();
  
  const email = document.getElementById('emailInput').value;
  const sanitized = sanitizeEmail(email);
  
  if (!sanitized) {
    showAlert('❌ Please enter a valid email address', 'error');
    return;
  }

  try {
    const { error } = await supabase.auth.signInWithOtp({
      email: sanitized,
    });

    if (error) throw error;

    showAlert('✅ Check your email for the login link', 'success');
    document.getElementById('emailInput').value = '';
  } catch (err) {
    console.error('Login error:', err);
    showAlert(`❌ Login failed: ${err.message}`, 'error');
  }
}

async function handleLogout() {
  try {
    await supabase.auth.signOut();
    currentUser = null;
    currentBracket = null;
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
      userInfoDiv.innerHTML = `👤 Logged in as: ${sanitizeInput(redactEmail(currentUser.email))}`;
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

  try {
    // TODO: Load bracket from Supabase
    // const { data, error } = await supabase
    //   .from('brackets')
    //   .select('*')
    //   .eq('user_id', currentUser.id)
    //   .single();

    const bracketDiv = document.getElementById('bracket');
    bracketDiv.innerHTML = `
      <div class="alert info">
        <strong>🚧 Bracket UI coming soon</strong><br>
        You're authenticated and ready to build your bracket!
      </div>
    `;
  } catch (err) {
    console.error('Load bracket error:', err);
    showAlert('❌ Failed to load bracket', 'error');
  }
}

// ============================================
// Event Listeners
// ============================================

document.getElementById('loginForm').addEventListener('submit', handleLogin);
document.getElementById('logoutBtn').addEventListener('click', handleLogout);

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
