import { state, persist } from '../core.js';

const POLL_INTERVAL = 30 * 60 * 1000;
let inFlight = false;

export async function refreshAutoContent() {
  if (inFlight) return;
  inFlight = true;
  try {
    const response = await fetch('/api/auto-content', { headers: { accept: 'application/json' } });
    if (!response.ok) return;
    const payload = await response.json();
    const known = new Set(state.posts.map(post => post.id));
    const additions = (Array.isArray(payload.items) ? payload.items : []).filter(post => post?.id && !known.has(post.id));
    if (!additions.length) return;
    state.posts = [...additions, ...state.posts].slice(0, 300);
    persist();
    document.dispatchEvent(new CustomEvent('content:auto-updated'));
  } catch {
    // The community remains usable while offline or while the source feed is down.
  } finally {
    inFlight = false;
  }
}

export function startAutoContent() {
  void refreshAutoContent();
  window.setInterval(() => {
    if (document.visibilityState === 'visible') void refreshAutoContent();
  }, POLL_INTERVAL);
}
