/**
 * Input Sanitization - Prevents XSS attacks
 * 
 * All user input (team names, emails, etc) must be sanitized
 * before rendering to the DOM
 */

export function sanitizeHTML(input) {
  const div = document.createElement('div');
  div.textContent = input;
  return div.innerHTML;
}

export function sanitizeInput(input) {
  if (typeof input !== 'string') return '';
  return input
    .trim()
    .slice(0, 255) // Max length
    .replace(/[<>]/g, ''); // Remove angle brackets
}

export function sanitizeEmail(email) {
  if (typeof email !== 'string') return '';
  const sanitized = email.trim().toLowerCase();
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(sanitized) ? sanitized : '';
}

// Redact email for display (GDPR compliance)
export function redactEmail(email) {
  if (!email || !email.includes('@')) return '***';
  const [local, domain] = email.split('@');
  return `${local.substring(0, 2)}***@${domain}`;
}
