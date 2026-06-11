const OTP_COOLDOWN_MS = 60_000;

export function isOtpCooldownActive(lastSentAt, now = Date.now(), cooldownMs = OTP_COOLDOWN_MS) {
  return typeof lastSentAt === 'number' && now - lastSentAt < cooldownMs;
}

export function formatCooldownSeconds(lastSentAt, now = Date.now(), cooldownMs = OTP_COOLDOWN_MS) {
  const remaining = Math.max(0, Math.ceil((cooldownMs - (now - lastSentAt)) / 1000));
  return remaining;
}

export function getOtpCooldownMs() {
  return OTP_COOLDOWN_MS;
}
