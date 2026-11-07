const STORAGE_KEY = 'vericove-chat-appearance-v1';

export const CHAT_THEMES = Object.freeze([
  { id: 'light', name: 'Light', swatch: '#eeeaf0', surface: '#fbfafc', bubble: '#f2eff3', outgoing: '#e7dce8', accent: '#715a76' },
  { id: 'midnight', name: 'Midnight', swatch: '#242228', surface: '#0d1014', bubble: '#25282d', outgoing: '#70576f', accent: '#d0afd0' },
  { id: 'rose', name: 'Rose', swatch: '#4a3039', surface: '#261b21', bubble: '#3a2931', outgoing: '#764655', accent: '#edb3c3' },
  { id: 'sage', name: 'Sage', swatch: '#344338', surface: '#18211c', bubble: '#28352d', outgoing: '#3d5846', accent: '#b1d0b5' },
  { id: 'ocean', name: 'Ocean', swatch: '#30434b', surface: '#172126', bubble: '#25353d', outgoing: '#385866', accent: '#add2df' },
  { id: 'sand', name: 'Sand', swatch: '#54483a', surface: '#28231e', bubble: '#3b3329', outgoing: '#66513c', accent: '#e0c39c' },
  { id: 'ink', name: 'Ink', swatch: '#303035', surface: '#111114', bubble: '#242428', outgoing: '#424248', accent: '#d2d2dc' },
]);

const wallpaperFiles = import.meta.glob('/assets/DM wallpapers/*.{jpg,jpeg,png,webp,mp4,webm}', {
  eager: true,
  query: '?url',
  import: 'default',
});

// Keep the source filenames intact so adding a wallpaper only requires adding
// an asset to this folder. Both image and video wallpapers share this catalog.
export const CHAT_WALLPAPERS = Object.freeze(Object.entries(wallpaperFiles)
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([path, src], index) => {
    const filename = path.split('/').pop();
    const type = /\.(mp4|webm)$/i.test(filename) ? 'video' : 'image';
    return {
      id: filename,
      filename,
      name: `${type === 'video' ? 'Motion' : 'Wallpaper'} ${String(index + 1).padStart(2, '0')}`,
      type,
      src,
    };
  }));

function readPreferences() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export function getChatAppearance(conversationId) {
  const saved = readPreferences()[conversationId] || {};
  const theme = CHAT_THEMES.some(item => item.id === saved.theme) ? saved.theme : conversationId === 'talk-to-mira' ? 'midnight' : 'light';
  const wallpaper = CHAT_WALLPAPERS.some(item => item.id === saved.wallpaper) ? saved.wallpaper : '';
  return { theme, wallpaper };
}

export function getChatWallpaperStyle(conversationId) {
  const { wallpaper } = getChatAppearance(conversationId);
  const asset = CHAT_WALLPAPERS.find(item => item.id === wallpaper);
  return asset?.type === 'image' ? `--chat-wallpaper:url("${asset.src}")` : '--chat-wallpaper:none';
}

export function getChatWallpaper(conversationId) {
  const { wallpaper } = getChatAppearance(conversationId);
  return CHAT_WALLPAPERS.find(item => item.id === wallpaper) || null;
}

export function chatWallpaperLayer(wallpaper, className = 'vc-chat-wallpaper-video') {
  return wallpaper?.type === 'video'
    ? `<video class="${className}" src="${wallpaper.src}" autoplay muted loop playsinline preload="metadata" aria-hidden="true"></video>`
    : '';
}

function wallpaperPreview(wallpaper) {
  return wallpaper.type === 'video'
    ? `<video src="${wallpaper.src}" muted loop autoplay playsinline preload="none" aria-hidden="true"></video><i class="chat-wallpaper-motion" aria-hidden="true">▶</i>`
    : `<img src="${wallpaper.src}" alt="" loading="lazy">`;
}

// Keep uploaded wallpaper clips silent even if a browser restores a prior
// media volume state when autoplay begins.
if (typeof document !== 'undefined') {
  document.addEventListener('play', event => {
    const video = event.target;
    if (!(video instanceof HTMLVideoElement) || !video.matches('.vc-chat-wallpaper-video, .tm-wallpaper-video, .chat-wallpaper-choice video, .tm-appearance-wallpapers video')) return;
    video.defaultMuted = true;
    video.muted = true;
    video.volume = 0;
    video.removeAttribute('controls');
    const audioTracks = video.audioTracks;
    if (audioTracks) for (let index = 0; index < audioTracks.length; index += 1) audioTracks[index].enabled = false;
  }, true);
}

export function setChatAppearance(conversationId, changes) {
  if (!conversationId) return getChatAppearance(conversationId);
  const preferences = readPreferences();
  const current = getChatAppearance(conversationId);
  const theme = CHAT_THEMES.some(item => item.id === changes.theme) ? changes.theme : current.theme;
  const wallpaper = changes.wallpaper === '' || CHAT_WALLPAPERS.some(item => item.id === changes.wallpaper)
    ? changes.wallpaper
    : current.wallpaper;
  preferences[conversationId] = { theme, wallpaper };
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences)); } catch { /* Keep the selection for this render if storage is unavailable. */ }
  return { theme, wallpaper };
}

export function chatAppearanceMarkup(conversationId, scope = 'dm') {
  const selected = getChatAppearance(conversationId);
  return `<div class="chat-appearance" data-appearance-scope="${scope}">
    <p class="chat-appearance-intro">Personalize this conversation. Your choice is saved on this device.</p>
    <fieldset class="chat-appearance-themes"><legend>Message theme</legend><div class="chat-theme-grid">${CHAT_THEMES.map(theme => `<button type="button" class="chat-theme-choice ${selected.theme === theme.id ? 'is-selected' : ''}" data-action="chat-appearance-theme" data-theme-id="${theme.id}" data-appearance-scope="${scope}" aria-pressed="${selected.theme === theme.id}" aria-label="${theme.name} theme"><span class="chat-theme-swatch" style="--theme-swatch:${theme.swatch}"><i></i><i></i></span><span>${theme.name}</span></button>`).join('')}</div></fieldset>
    <fieldset class="chat-appearance-wallpapers"><legend>Wallpaper</legend>${CHAT_WALLPAPERS.length ? `<div class="chat-wallpaper-grid">${CHAT_WALLPAPERS.map(wallpaper => `<button type="button" class="chat-wallpaper-choice ${selected.wallpaper === wallpaper.id ? 'is-selected' : ''}" data-action="chat-appearance-wallpaper" data-wallpaper-id="${wallpaper.id}" data-appearance-scope="${scope}" aria-pressed="${selected.wallpaper === wallpaper.id}" aria-label="${wallpaper.name} ${wallpaper.type} wallpaper">${wallpaperPreview(wallpaper)}<span>${wallpaper.name}</span></button>`).join('')}<button type="button" class="chat-wallpaper-clear ${selected.wallpaper ? '' : 'is-selected'}" data-action="chat-appearance-wallpaper" data-wallpaper-id="" data-appearance-scope="${scope}" aria-pressed="${!selected.wallpaper}">Plain colour</button></div>` : `<p class="chat-appearance-empty">Your wallpaper choices will appear here.</p>`}</fieldset>
  </div>`;
}
