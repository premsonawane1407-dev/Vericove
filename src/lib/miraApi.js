async function jsonRequest(url, options = {}) {
  const response = await fetch(url, options);
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || 'Mira could not connect just now. Please try again.');
  return result;
}

export async function checkMiraConnection() {
  const result = await jsonRequest('/api/mira-chat');
  return Boolean(result.configured);
}

export function sendMiraMessage(messages, signal) {
  return jsonRequest('/api/mira-chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages }),
    signal,
  });
}

export async function requestMiraVoice(text, signal) {
  const response = await fetch('/api/mira-voice', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
    signal,
  });
  if (!response.ok) {
    const result = await response.json().catch(() => ({}));
    throw new Error(result.error || 'Voice playback is unavailable right now.');
  }
  return response.blob();
}
