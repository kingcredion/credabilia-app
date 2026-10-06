// When a bell item should pulse and when it should only sit quietly. The item itself never goes away until what it is about is done; only the
// pulsing calms down once the member has seen it, and comes back when there is a reason to look again.
export const REPULSE_AFTER_MS = 24 * 60 * 60 * 1000;   // still not dealt with a day after it was last seen
export const DEADLINE_WARNING_MS = 12 * 60 * 60 * 1000; // a deadline (auction end, request expiry) is this close

export const notificationKey = n => [n.kind, n.purchase_id || '', n.conversation_id || '', n.listing_id || ''].join('|');

// seen: { [key]: { seenAt: ms } }. An item pulses when it has never been seen, when something newer happened since (a new message),
// when a day has passed, or when its deadline has come within 12 hours and it has not been seen since that point.
export function isLoud(n, seen, now) {
  const entry = seen?.[notificationKey(n)];
  if (!entry) return true;
  const startedAt = Date.parse(n.at) || 0;
  if (startedAt > entry.seenAt) return true;
  if (now - entry.seenAt >= REPULSE_AFTER_MS) return true;
  const deadline = Date.parse(n.expires_at) || 0;
  if (deadline > now && deadline - now <= DEADLINE_WARNING_MS && entry.seenAt < deadline - DEADLINE_WARNING_MS) return true;
  return false;
}

// Forget items that are gone (done, expired, answered) so the stored list stays small and a repeat of the same thing starts fresh.
export function pruneSeen(seen, notifications) {
  const present = new Set(notifications.map(notificationKey));
  return Object.fromEntries(Object.entries(seen || {}).filter(([key]) => present.has(key)));
}

// Loud: the gold pulse. Calm: needs attention but already seen, so just a small steady dot. Nothing: nothing waiting.
export const glowClass = (attention, loud) => loud ? ' attention-glow' : attention ? ' attention-calm' : '';

// A cheap fingerprint of what the bell holds, so the app can tell when something new or finished happened and reload the rest.
export const notificationSignature = list => (list || []).map(n => notificationKey(n) + '@' + (n.at || '')).sort().join(',');
