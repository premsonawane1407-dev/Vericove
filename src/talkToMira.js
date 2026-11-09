import { esc, svg, userAvatar } from './core.js';
import { MIRA_EXPRESSIONS, MiraCharacter, MiraExpressionController } from './miraExpressionAssets.js';
import { CHAT_THEMES, CHAT_WALLPAPERS, chatWallpaperLayer, getChatAppearance, getChatWallpaper, getChatWallpaperStyle, setChatAppearance } from './chatAppearance.js';
import { checkMiraConnection, requestMiraVoice, sendMiraMessage } from './lib/miraApi.js';
import './talk-to-mira.css';

const welcome = 'Hi, I’m Mira. I’m here to listen, without judgment or pressure. What’s on your mind today?';
const suggestions = ['Listen for a moment', 'Help me find the words', 'I’m not sure where to start'];
const transcript = [{ role: 'assistant', content: welcome, createdAt: new Date().toISOString() }];
let pending = false;
let voiceLoading = false;
let configured = null;
let checkedConnection = false;
let errorMessage = '';
let revealIndex = -1;
let revealTimer = 0;
let recognition = null;
let requestController = null;
let voiceController = null;
let audio = null;
let bubbleSoundContext = null;
let audioUrl = '';
let lastSpokenIndex = -1;
let muted = false;
let voiceReplies = false;
let typingText = '';
let composerDraft = '';
let pendingAnnouncement = '';
let draftAttachments = [];
let attachmentsLoading = false;
let emojiOpen = false;
let menuOpen = false;
let appearanceOpen = false;
let transcriptScrollTop = 0;
let readingHistory = false;
let returnFocusRoute = 'my-health';
const acceptedFiles = '.png,.jpg,.jpeg,.webp,.pdf,.txt,.md,.csv';
const maxAttachmentBytes = 2 * 1024 * 1024;
const maxAttachmentCount = 3;
const emojiChoices = ['🙂','😊','🥹','💜','🫶','🌿','✨','💬','❤️','🙏','☁️','🌸'];
let expressionController;

const dateTime = raw => new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(new Date(raw));
const isReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const attachmentMarkup = attachment => attachment.kind === 'image'
  ? `<figure class="tm-attachment-image"><img src="${esc(attachment.preview)}" alt="Attached image: ${esc(attachment.name)}" loading="lazy"/><figcaption>${esc(attachment.name)}</figcaption></figure>`
  : `<span class="tm-attachment-file"><span>${svg('file',15)}</span><span><strong>${esc(attachment.name)}</strong><small>${esc(attachment.label)} · ${Math.max(1,Math.ceil(attachment.size/1024))} KB</small></span></span>`;
const messageMarkup = (message, index) => {
  const isMira = message.role === 'assistant';
  const expression = message.expression || (index === 0 ? 'happy' : 'empathetic');
  const expressionAsset = MIRA_EXPRESSIONS[expression] || MIRA_EXPRESSIONS.empathetic;
  const content = index === revealIndex ? esc(typingText) : esc(message.content);
  return `<article class="tm-message ${isMira ? 'from-mira' : 'from-you'} ${index === revealIndex ? 'is-revealing' : ''}" data-message-index="${index}">
    ${isMira ? `<img class="tm-message-avatar" src="${expressionAsset.src}" alt="Mira, ${expressionAsset.label}" loading="lazy"/>` : `<span class="tm-user-avatar" aria-label="You">${userAvatar()}</span>`}
    <div class="tm-message-body"><div class="tm-speaker ${isMira ? '' : 'tm-you-label'}">${isMira ? `Mira <span class="tm-speaker-dot" aria-hidden="true"></span>` : 'You'}</div>
    <div class="tm-message-copy">${content}${(message.attachments||[]).length?`<div class="tm-message-attachments">${message.attachments.map(attachmentMarkup).join('')}</div>`:''}</div>
    <div class="tm-message-foot"><time datetime="${esc(message.createdAt)}">${dateTime(message.createdAt)}</time>${isMira ? `<button class="tm-message-play" type="button" data-tm-action="speak" data-index="${index}" aria-label="Listen to Mira’s response" title="Listen">${svg('play',13)}</button>` : ''}</div></div>
  </article>`;
};

function formatConversation() {
  return transcript.map((message, index) => messageMarkup(message, index)).join('');
}

function MiraDialoguePanel() {
  const canSend = Boolean(composerDraft.trim() || draftAttachments.length) && !pending && !attachmentsLoading;
  return `<section class="tm-dialogue" aria-label="Conversation with Mira">
    <div class="tm-dialogue-head"><div><span class="tm-kicker">A QUIET SPACE TO TALK</span><p>Share what feels right. We can take it one thought at a time.</p></div></div>
    ${configured === false ? `<div class="tm-inline-status" role="status"><span>Gemini isn’t connected right now. You can still write a message and try again.</span><button type="button" data-tm-action="reconnect">Reconnect</button></div>` : ''}
    <div class="tm-transcript" data-tm-transcript role="region" aria-label="Conversation history">${chatWallpaperLayer(getChatWallpaper('talk-to-mira'), 'tm-wallpaper-video')}${formatConversation()}<div class="tm-end-anchor" data-tm-end></div></div><span class="tm-sr-only" aria-live="polite" aria-atomic="true">${esc(pendingAnnouncement)}</span>
    ${errorMessage ? `<div class="tm-error" role="alert"><p>${esc(errorMessage)}</p><button type="button" data-tm-action="retry">Try again</button></div>` : ''}
    ${revealIndex >= 0 ? '<button type="button" class="tm-reveal-button" data-tm-action="skip-reveal">Show full response</button>' : ''}
    ${transcript.length === 1 ? `<div class="tm-suggestions" aria-label="Ideas to begin">${suggestions.map((text, i) => `<button type="button" class="tm-suggestion" data-tm-suggestion="${i}">${esc(text)} <span aria-hidden="true">↗</span></button>`).join('')}</div>` : ''}
    <form class="tm-composer" data-tm-form>
      <label class="tm-composer-label" for="tm-message">Your message</label>
      ${pending ? `<div class="tm-thinking" role="status" aria-label="${voiceLoading ? 'Preparing Mira’s voice' : 'Mira is thinking'}"><img class="tm-thinking-avatar" src="${MIRA_EXPRESSIONS.thoughtful.src}" alt="" width="144" height="144"><span class="tm-thinking-bubble" aria-hidden="true"><i></i><i></i><i></i></span><small>${voiceLoading ? 'Preparing voice…' : 'Mira is thinking…'}</small></div>` : ''}
      ${attachmentsLoading ? '<div class="tm-attachment-progress" role="status"><span></span> Preparing attachment…</div>' : ''}
      ${draftAttachments.length ? `<div class="tm-attachment-drafts" aria-label="Attachments ready to send">${draftAttachments.map((attachment,index)=>`<span class="tm-attachment-draft">${attachment.kind==='image'?`<img src="${esc(attachment.preview)}" alt=""/>`:svg('file',15)}<span>${esc(attachment.name)}</span><button type="button" data-tm-action="remove-attachment" data-index="${index}" aria-label="Remove ${esc(attachment.name)}" ${pending?'disabled':''}>×</button></span>`).join('')}</div>` : ''}
      <textarea id="tm-message" name="message" rows="1" maxlength="1800" placeholder="Write what’s on your mind…" aria-describedby="tm-composer-hint" autocomplete="off" ${pending ? 'disabled' : ''}>${esc(composerDraft)}</textarea>
      <div class="tm-composer-tools"><div class="tm-composer-left">
        <button class="tm-tool-button" type="button" data-tm-action="emoji" aria-label="Choose an emoji" aria-expanded="${emojiOpen}" title="Choose emoji">☺</button>
        <button class="tm-tool-button" type="button" data-tm-action="attach-file" aria-label="Attach a file or image" title="Attach a file or image" ${pending || attachmentsLoading ? 'disabled' : ''}>${svg('upload',16)}<span>Attach</span></button>
        <button class="tm-tool-button tm-mic-button" type="button" data-tm-action="mic" aria-label="Use voice input" title="Speak your message" ${pending ? 'disabled' : ''}>${svg('microphone',16)}<span>Speak</span></button>
      </div><span id="tm-composer-hint" class="tm-composer-hint">Enter to send · Shift + Enter for a new line</span><div class="tm-composer-right">
        <div class="tm-playback-tools" aria-label="Voice playback controls"><span class="tm-waveform ${audio && !audio.paused ? 'is-active' : ''}" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></span>
          ${audio && !audio.paused ? `<button type="button" data-tm-action="pause" aria-label="Pause Mira" title="Pause">${svg('pause',14)}</button>` : `<button type="button" data-tm-action="resume" aria-label="Resume Mira" title="Resume" ${!audio ? 'disabled' : ''}>${svg('play',13)}</button>`}<button type="button" data-tm-action="replay" aria-label="Replay Mira’s response" title="Replay" ${lastSpokenIndex < 0 ? 'disabled' : ''}>${svg('replay',14)}</button><button type="button" data-tm-action="mute" aria-label="${muted ? 'Unmute' : 'Mute'} Mira" title="${muted ? 'Unmute' : 'Mute'}" aria-pressed="${muted}">${svg(muted ? 'volumeOff' : 'volume',14)}</button><button type="button" data-tm-action="stop" aria-label="Stop Mira’s voice" title="Stop" ${!audio ? 'disabled' : ''}>${svg('stop',14)}</button>
        </div><button class="tm-send" type="submit" aria-label="Send message" ${canSend?'':'disabled'}>${svg('send',17)}<span>Send</span></button></div></div>
      ${emojiOpen ? `<div class="tm-emoji-picker" role="group" aria-label="Choose an emoji">${emojiChoices.map(emoji=>`<button type="button" data-tm-emoji="${emoji}" aria-label="Insert ${emoji}">${emoji}</button>`).join('')}</div>` : ''}
      <input class="tm-hidden-file" type="file" data-tm-file-input accept="${acceptedFiles}" multiple aria-label="Choose files or images" hidden/>
      <p class="tm-privacy-note"><span aria-hidden="true">${svg('shield',13)}</span> Messages and attachments stay in this tab and aren’t saved by Vericove. They’re sent to Gemini when you send. Voice input may be processed by your browser’s speech service.</p>
    </form>
  </section>`;
}

export function talkToMiraPage(returnRoute = 'my-health') {
  const appearance = getChatAppearance('talk-to-mira');
  const wallpaperStyle = getChatWallpaperStyle('talk-to-mira');
  const wallpaper = getChatWallpaper('talk-to-mira');
  return `<div class="talk-to-mira" data-chat-theme="${appearance.theme}" data-chat-wallpaper="${appearance.wallpaper}" style="${wallpaperStyle}" aria-label="Talk to Mira conversation">
    <button class="tm-backdrop" type="button" data-route="${esc(returnRoute)}" aria-label="Close Talk to Mira"></button>
    <div class="tm-ambient tm-ambient-one" aria-hidden="true"></div><div class="tm-ambient tm-ambient-two" aria-hidden="true"></div><div class="tm-grain" aria-hidden="true"></div>
    <section class="tm-window" role="dialog" aria-modal="true" aria-labelledby="tm-title" tabindex="-1">
      <header class="tm-topbar"><button class="tm-back tm-icon-button" type="button" data-route="${esc(returnRoute)}" aria-label="Back to health">${svg('arrow',18)}</button><div class="tm-identity"><span class="tm-mini-character">${MiraCharacter()}</span><span class="tm-identity-copy"><strong id="tm-title">Talk to Mira</strong><small><i class="tm-online-dot"></i> Here with you</small></span></div><div class="tm-top-actions"><button class="tm-icon-button ${voiceReplies ? 'is-selected' : ''}" type="button" data-tm-action="voice-toggle" aria-pressed="${voiceReplies}" aria-label="${voiceReplies ? 'Turn voice replies off' : 'Turn voice replies on'}" title="${voiceReplies ? 'Voice replies on' : 'Voice replies off'}">${svg(voiceReplies ? 'volume' : 'volumeOff',18)}</button><button class="tm-icon-button" type="button" data-tm-action="menu" aria-label="Conversation menu" aria-expanded="${menuOpen}">${svg('more',18)}</button>${menuOpen ? `<div class="tm-menu" role="menu"><button type="button" role="menuitem" data-tm-action="appearance">${svg('settings',15)} Chat appearance</button><button type="button" role="menuitem" data-tm-action="history">${svg('clock',15)} Conversation history</button><button type="button" role="menuitem" data-tm-action="clear">${svg('plus',15)} New conversation</button></div>` : ''}${appearanceOpen ? `<aside class="tm-appearance-panel" aria-label="Chat appearance"><div class="tm-appearance-panel-head"><strong>Chat appearance</strong><button type="button" data-tm-action="appearance-close" aria-label="Close appearance settings">${svg('close',15)}</button></div><p>Choose a calm tone for this conversation.</p><div class="tm-appearance-themes">${CHAT_THEMES.map(theme => `<button type="button" class="tm-appearance-theme ${appearance.theme===theme.id?'is-selected':''}" data-tm-action="appearance-theme" data-theme-id="${theme.id}" aria-pressed="${appearance.theme===theme.id}"><i style="--theme-swatch:${theme.swatch}"></i>${theme.name}</button>`).join('')}</div><div class="tm-appearance-wallpapers"><strong>Wallpaper</strong>${CHAT_WALLPAPERS.length?`${CHAT_WALLPAPERS.map(wallpaper=>`<button type="button" class="${appearance.wallpaper===wallpaper.id?'is-selected':''}" data-tm-action="appearance-wallpaper" data-wallpaper-id="${wallpaper.id}" aria-pressed="${appearance.wallpaper===wallpaper.id}">${wallpaper.type==='video'?`<video src="${wallpaper.src}" muted loop autoplay playsinline preload="none" aria-hidden="true"></video><i class="chat-wallpaper-motion" aria-hidden="true">▶</i>`:`<img src="${wallpaper.src}" alt="" loading="lazy">`}<span>${wallpaper.name}</span></button>`).join('')}<button type="button" class="${appearance.wallpaper?'':'is-selected'}" data-tm-action="appearance-wallpaper" data-wallpaper-id="" aria-pressed="${!appearance.wallpaper}"><i class="tm-plain-wallpaper"></i><span>Plain colour</span></button>`:'<small>Your wallpaper choices will appear here.</small>'}</div></aside>` : ''}</div></header>
      <div class="tm-stage">${MiraDialoguePanel()}</div>
      <footer class="tm-footer"><span>Mira is an AI wellbeing companion, not a therapist or clinician.</span><a href="https://findahelpline.com" target="_blank" rel="noreferrer">Need human support? Find a helpline ↗</a></footer>
    </section>
  </div>`;
}

function scrollToLatest() {
  const transcriptNode = document.querySelector('[data-tm-transcript]');
  const end = document.querySelector('[data-tm-end]');
  if (!readingHistory) {
    end?.scrollIntoView({ behavior: isReducedMotion() ? 'instant' : 'smooth', block: 'end' });
    if (transcriptNode) transcriptNode.scrollTop = transcriptNode.scrollHeight;
    if (transcriptNode) transcriptScrollTop = transcriptNode.scrollTop;
  } else if (transcriptNode) transcriptNode.scrollTop = transcriptScrollTop;
}

function replyExpression(text) {
  const lower = String(text || '').toLowerCase();
  if (/\b(happy|glad|wonderful|celebrate|proud of you|that is a win|that’s a win)\b/i.test(lower)) return 'happy';
  if (/\b(it makes sense|that sounds|i hear|i can hear|i’m sorry|i’m here|must feel|a lot to carry|thank you for sharing)\b/i.test(lower)) return 'empathetic';
  if (/\b(you can take|here with you|no need to|at your pace|one step|you deserve|we can go slowly|there is no rush)\b/i.test(lower)) return 'reassuring';
  if (/[?]\s*$/.test(lower) || /\b(would you|could you|what feels|what has|what might|tell me more)\b/i.test(lower)) return 'curious';
  if (/\b(perhaps|maybe|it sounds like|i wonder|on the one hand|another way)\b/i.test(lower)) return 'thoughtful';
  const lastExpression = [...transcript].reverse().find(message => message.role === 'assistant')?.expression || 'idle';
  if (lastExpression === 'empathetic') return 'reassuring';
  if (lastExpression === 'reassuring') return 'thoughtful';
  if (lastExpression === 'thoughtful') return 'curious';
  return 'thoughtful';
}

function primeBubbleSound() {
  if (muted) return;
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return;
  try {
    bubbleSoundContext ||= new AudioContextClass();
    if (bubbleSoundContext.state === 'suspended') bubbleSoundContext.resume().catch(() => {});
  } catch { bubbleSoundContext = null; }
}

function playBubblePop() {
  if (muted || !bubbleSoundContext || bubbleSoundContext.state !== 'running') return;
  try {
    const now = bubbleSoundContext.currentTime;
    const tone = bubbleSoundContext.createOscillator();
    const gain = bubbleSoundContext.createGain();
    tone.type = 'sine';
    tone.frequency.setValueAtTime(520, now);
    tone.frequency.exponentialRampToValueAtTime(760, now + .055);
    gain.gain.setValueAtTime(.0001, now);
    gain.gain.exponentialRampToValueAtTime(.035, now + .012);
    gain.gain.exponentialRampToValueAtTime(.0001, now + .12);
    tone.connect(gain);
    gain.connect(bubbleSoundContext.destination);
    tone.start(now);
    tone.stop(now + .13);
  } catch { /* Sound is decorative; text remains fully usable. */ }
}

function updateExpression() {
  const latest = transcript.at(-1)?.content || '';
  if (audio && !audio.paused || revealIndex >= 0) expressionController?.set('speaking');
  else if (pending) expressionController?.set('listening');
  else if (transcript.length === 1) expressionController?.set('idle');
  else if (transcript.at(-1)?.role === 'user') expressionController?.set('thoughtful');
  else if (/[?]\s*$/.test(latest)) expressionController?.set('curious');
  else if (/you can take|here with you|no need to|at your pace|one step/i.test(latest)) expressionController?.set('reassuring');
  else if (/glad|happy for you|that sounds like a win|celebrate/i.test(latest)) expressionController?.set('happy');
  else expressionController?.set('empathetic');
}

async function requestReply() {
  pending = true;
  voiceLoading = false;
  errorMessage = '';
  requestController?.abort();
  requestController = new AbortController();
  document.dispatchEvent(new CustomEvent('health:refresh'));
  updateExpression();
  scrollToLatest();
  try {
    const result = await sendMiraMessage(transcript.map(({ role, content, attachments }) => ({ role, content, attachments: (attachments||[]).map(({ name, mimeType, data, text }) => ({ name, mimeType, data, text })) })), requestController.signal);
    transcript.push({ role: 'assistant', content: result.text, expression: replyExpression(result.text), createdAt: new Date().toISOString() });
    revealIndex = transcript.length - 1;
    const replyIndex = revealIndex;
    typingText = '';
    pending = false;
    document.dispatchEvent(new CustomEvent('health:refresh'));
    updateExpression();
    scrollToLatest();
    requestAnimationFrame(() => {
      const bubble = document.querySelector(`[data-message-index="${replyIndex}"] .tm-message-copy`);
      bubble?.classList.remove('tm-bubble-pop');
      if (bubble) { void bubble.offsetWidth; bubble.classList.add('tm-bubble-pop'); }
      playBubblePop();
      setTimeout(() => bubble?.classList.remove('tm-bubble-pop'), 520);
    });
    startReveal(revealIndex);
    if (voiceReplies && !muted) setTimeout(() => playMessage(revealIndex), 160);
  } catch (error) {
    pending = false;
    if (error.name === 'AbortError') return;
    errorMessage = error.message || 'Mira could not connect just now. Your message remains here; please try again.';
    document.dispatchEvent(new CustomEvent('health:refresh'));
    updateExpression();
    scrollToLatest();
  }
}

function startReveal(index) {
  clearInterval(revealTimer);
  const message = transcript[index];
  if (!message || isReducedMotion()) { typingText = message?.content || ''; revealIndex = -1; pendingAnnouncement = message?.content || ''; document.dispatchEvent(new CustomEvent('health:refresh')); return; }
  let shown = 0;
  const complete = () => {
    clearInterval(revealTimer);
    typingText = message.content;
    revealIndex = -1;
    pendingAnnouncement = message.content;
    document.dispatchEvent(new CustomEvent('health:refresh'));
    updateExpression();
  };
  revealTimer = setInterval(() => {
    shown = Math.min(shown + Math.max(3, Math.ceil(message.content.length / 90)), message.content.length);
    typingText = message.content.slice(0, shown);
    const copy = document.querySelector(`[data-message-index="${index}"] .tm-message-copy`);
    if (copy) copy.textContent = typingText;
    if (shown >= message.content.length) complete();
    scrollToLatest();
  }, 24);
  document.querySelector(`[data-message-index="${index}"] .tm-message-copy`)?.setAttribute('aria-live', 'polite');
}

async function playMessage(index) {
  const message = transcript[index];
  if (!message || message.role !== 'assistant') return;
  if (muted) { errorMessage = 'Voice is muted. Turn voice on to play Mira’s response.'; document.dispatchEvent(new CustomEvent('health:refresh')); return; }
  clearAudio();
  voiceController = new AbortController();
  lastSpokenIndex = index;
  pending = true;
  voiceLoading = true;
  document.dispatchEvent(new CustomEvent('health:refresh'));
  updateExpression();
  try {
    const blob = await requestMiraVoice(message.content, voiceController.signal);
    audioUrl = URL.createObjectURL(blob);
    audio = new Audio(audioUrl);
    audio.onended = () => { clearAudio(); document.dispatchEvent(new CustomEvent('health:refresh')); updateExpression(); };
    audio.onerror = () => { clearAudio(); errorMessage = 'Mira’s voice could not play. You can keep reading or try again.'; document.dispatchEvent(new CustomEvent('health:refresh')); updateExpression(); };
    pending = false;
    voiceLoading = false;
    await audio.play();
    document.dispatchEvent(new CustomEvent('health:refresh'));
    updateExpression();
  } catch (error) {
    pending = false;
    voiceLoading = false;
    if (error.name === 'AbortError') return;
    errorMessage = error.message || 'Mira’s voice could not play. Text conversation is still available.';
    document.dispatchEvent(new CustomEvent('health:refresh'));
    updateExpression();
  }
}

function clearAudio() {
  if (audio) { audio.pause(); audio.onended = null; audio.onerror = null; audio.src = ''; audio = null; }
  voiceController?.abort();
  voiceController = null;
  if (audioUrl) URL.revokeObjectURL(audioUrl);
  audioUrl = '';
}

function submitMessage(text) {
  const providedText = String(text || '').trim();
  if ((!providedText && !draftAttachments.length) || pending || attachmentsLoading) return;
  const content = providedText || 'I’m sharing an attachment. Could you help me talk through it?';
  composerDraft = '';
  primeBubbleSound();
  clearAudio();
  recognition?.stop();
  recognition = null;
  const attachments = draftAttachments.splice(0);
  transcript.push({ role: 'user', content, attachments, createdAt: new Date().toISOString() });
  readingHistory = false;
  typingText = '';
  revealIndex = -1;
  requestReply();
}

function autoSize(textarea) {
  if (!textarea) return;
  textarea.style.height = 'auto';
  textarea.style.height = `${Math.min(textarea.scrollHeight, 180)}px`;
}

function fileDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error(`Could not read ${file.name}.`));
    reader.readAsDataURL(file);
  });
}

function fileMime(file) {
  const extension = file.name.split('.').pop()?.toLowerCase();
  const byExtension = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', pdf: 'application/pdf', csv: 'text/csv', txt: 'text/plain', md: 'text/markdown' };
  return byExtension[extension] || file.type.toLowerCase();
}

async function prepareAttachments(files) {
  errorMessage = '';
  const selected = Array.from(files);
  const totalSize = selected.reduce((sum, file) => sum + file.size, draftAttachments.reduce((sum, attachment) => sum + attachment.size, 0));
  if (draftAttachments.length + selected.length > maxAttachmentCount) { errorMessage = 'You can add up to 3 attachments to one message.'; document.dispatchEvent(new CustomEvent('health:refresh')); return; }
  if (selected.some(file => file.size > maxAttachmentBytes) || totalSize > 3 * 1024 * 1024) { errorMessage = 'Keep each attachment under 2 MB and the combined size under 3 MB.'; document.dispatchEvent(new CustomEvent('health:refresh')); return; }
  attachmentsLoading = true;
  document.dispatchEvent(new CustomEvent('health:refresh'));
  try {
    for (const file of selected) {
      const mimeType = fileMime(file);
      const attachment = { id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, name: file.name, mimeType, size: file.size, data: '', text: '', preview: '', kind: 'file', label: 'File' };
      if (['image/png','image/jpeg','image/webp'].includes(mimeType)) {
        const dataUrl = await fileDataUrl(file);
        attachment.kind = 'image';
        attachment.label = 'Image';
        attachment.preview = dataUrl;
        attachment.data = dataUrl.split(',')[1] || '';
      } else if (mimeType === 'application/pdf' || mimeType === 'text/csv') {
        const dataUrl = await fileDataUrl(file);
        attachment.data = dataUrl.split(',')[1] || '';
        attachment.label = mimeType === 'application/pdf' ? 'PDF' : 'CSV';
      } else if (mimeType === 'text/plain' || mimeType === 'text/markdown') {
        attachment.text = (await file.text()).slice(0, 24_000);
        attachment.label = mimeType === 'text/markdown' ? 'Markdown' : 'Text file';
      } else {
        throw new Error('Choose a PNG, JPG, WebP, PDF, CSV, TXT or Markdown file.');
      }
      draftAttachments.push(attachment);
    }
  } catch (error) {
    errorMessage = error.message || 'This attachment could not be prepared.';
  } finally {
    attachmentsLoading = false;
    document.dispatchEvent(new CustomEvent('health:refresh'));
  }
}

function insertEmoji(emoji) {
  const textarea = document.querySelector('#tm-message');
  if (!textarea) return;
  const start = textarea.selectionStart ?? textarea.value.length;
  const end = textarea.selectionEnd ?? start;
  textarea.value = `${textarea.value.slice(0, start)}${emoji}${textarea.value.slice(end)}`;
  composerDraft = textarea.value;
  emojiOpen = false;
  document.dispatchEvent(new CustomEvent('health:refresh'));
  const refreshed = document.querySelector('#tm-message');
  refreshed?.focus();
  const cursor = start + emoji.length;
  refreshed?.setSelectionRange(cursor, cursor);
}

document.addEventListener('health:refresh', () => {
  if (!document.querySelector('.talk-to-mira')) return;
  const oldTranscript = document.querySelector('[data-tm-transcript]');
  if (oldTranscript) transcriptScrollTop = oldTranscript.scrollTop;
  const existingDraft = document.querySelector('#tm-message');
  if (existingDraft) composerDraft = existingDraft.value;
  expressionController = new MiraExpressionController(document.querySelector('[data-mira-character]'));
  if (!checkedConnection) { checkedConnection = true; checkMiraConnection().then(result => {
    configured = result;
    document.dispatchEvent(new CustomEvent('health:refresh'));
  }).catch(() => { configured = false; document.dispatchEvent(new CustomEvent('health:refresh')); }); }
  const textarea = document.querySelector('#tm-message');
  if (textarea) autoSize(textarea);
  updateExpression();
  scrollToLatest();
});

document.addEventListener('mira:page-rendered', event => {
  document.body.classList.toggle('is-tm-open', event.detail?.route === 'talk-to-mira');
  if (event.detail?.route !== 'talk-to-mira') {
    cleanupTalkToMira();
    if (event.detail?.previousRoute === 'talk-to-mira') document.querySelector('[data-route="talk-to-mira"]')?.focus({ preventScroll: true });
    return;
  }
  expressionController = new MiraExpressionController(document.querySelector('[data-mira-character]'));
  updateExpression();
  scrollToLatest();
  pendingAnnouncement = '';
  if (event.detail?.previousRoute !== 'talk-to-mira' && !window.matchMedia('(pointer: coarse)').matches) document.querySelector('#tm-message')?.focus({ preventScroll: true });
  if (checkedConnection) return;
  checkedConnection = true;
  checkMiraConnection().then(result => {
    configured = result;
    document.dispatchEvent(new CustomEvent('health:refresh'));
  }).catch(() => { configured = false; document.dispatchEvent(new CustomEvent('health:refresh')); });
});

document.addEventListener('input', event => {
  if (event.target.matches('#tm-message')) { composerDraft = event.target.value; autoSize(event.target); }
});

document.addEventListener('change', event => {
  const input = event.target.closest('[data-tm-file-input], [data-tm-image-input]');
  if (!input || !input.files?.length) return;
  prepareAttachments(input.files);
  input.value = '';
});

document.addEventListener('scroll', event => {
  if (!event.target.matches?.('[data-tm-transcript]')) return;
  transcriptScrollTop = event.target.scrollTop;
  readingHistory = event.target.scrollHeight - event.target.scrollTop - event.target.clientHeight > 120;
}, true);

document.addEventListener('keydown', event => {
  if (document.body.classList.contains('is-tm-open')) {
    if (event.key === 'Escape') { document.querySelector('.tm-back')?.click(); return; }
    if (event.key === 'Tab') {
      const dialog = document.querySelector('.tm-window');
      const focusable = [...(dialog?.querySelectorAll('button:not(:disabled), textarea:not(:disabled), a[href], input:not(:disabled)') || [])].filter(node => node.getClientRects().length);
      if (!focusable.length) return;
      const first = focusable[0], last = focusable.at(-1);
      if (event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
  }
  if (!event.target.matches('#tm-message') || event.key !== 'Enter' || event.shiftKey || event.isComposing) return;
  event.preventDefault();
  event.target.form?.requestSubmit();
});

document.addEventListener('submit', event => {
  if (!event.target.matches('[data-tm-form]')) return;
  event.preventDefault();
  const textarea = event.target.elements.message;
  const content = textarea.value;
  if ((!content.trim() && !draftAttachments.length) || pending || attachmentsLoading) return;
  textarea.value = '';
  typingText = '';
  submitMessage(content);
});

document.addEventListener('click', event => {
  const emoji = event.target.closest('[data-tm-emoji]');
  if (emoji) { insertEmoji(emoji.dataset.tmEmoji); return; }
  const suggestion = event.target.closest('[data-tm-suggestion]');
  if (suggestion) { submitMessage(suggestions[Number(suggestion.dataset.tmSuggestion)]); return; }
  const button = event.target.closest('[data-tm-action]');
  if (!button) return;
  const action = button.dataset.tmAction;
  if (action === 'menu') { menuOpen = !menuOpen; appearanceOpen = false; document.dispatchEvent(new CustomEvent('health:refresh')); return; }
  if (action === 'appearance') { appearanceOpen = true; menuOpen = false; document.dispatchEvent(new CustomEvent('health:refresh')); return; }
  if (action === 'appearance-close') { appearanceOpen = false; document.dispatchEvent(new CustomEvent('health:refresh')); return; }
  if (action === 'appearance-theme') { setChatAppearance('talk-to-mira', { theme: button.dataset.themeId }); document.dispatchEvent(new CustomEvent('health:refresh')); return; }
  if (action === 'appearance-wallpaper') { setChatAppearance('talk-to-mira', { wallpaper: button.dataset.wallpaperId || '' }); document.dispatchEvent(new CustomEvent('health:refresh')); return; }
  if (action === 'reconnect') { checkedConnection = false; configured = null; document.dispatchEvent(new CustomEvent('health:refresh')); return; }
  if (action === 'history') { readingHistory = true; transcriptScrollTop = 0; document.querySelector('[data-tm-transcript]')?.scrollTo({ top: 0, behavior: isReducedMotion() ? 'instant' : 'smooth' }); return; }
  if (action === 'emoji') { emojiOpen = !emojiOpen; document.dispatchEvent(new CustomEvent('health:refresh')); return; }
  if (action === 'attach-file') { document.querySelector('[data-tm-file-input]')?.click(); return; }
  if (action === 'attach-image') { document.querySelector('[data-tm-image-input]')?.click(); return; }
  if (action === 'remove-attachment') { draftAttachments.splice(Number(button.dataset.index), 1); document.dispatchEvent(new CustomEvent('health:refresh')); return; }
  if (action === 'retry') { requestReply(); return; }
  if (action === 'skip-reveal') { clearInterval(revealTimer); typingText = transcript[revealIndex]?.content || ''; pendingAnnouncement = typingText; revealIndex = -1; document.dispatchEvent(new CustomEvent('health:refresh')); updateExpression(); return; }
  if (action === 'speak') { playMessage(Number(button.dataset.index)); return; }
  if (action === 'pause') { audio?.pause(); document.dispatchEvent(new CustomEvent('health:refresh')); updateExpression(); return; }
  if (action === 'resume') { audio?.play().then(() => { document.dispatchEvent(new CustomEvent('health:refresh')); updateExpression(); }).catch(() => {}); return; }
  if (action === 'replay') { playMessage(lastSpokenIndex); return; }
  if (action === 'stop') { clearAudio(); document.dispatchEvent(new CustomEvent('health:refresh')); updateExpression(); return; }
  if (action === 'mute') { muted = !muted; if (muted) clearAudio(); document.dispatchEvent(new CustomEvent('health:refresh')); updateExpression(); return; }
  if (action === 'voice-toggle') { voiceReplies = !voiceReplies; document.dispatchEvent(new CustomEvent('health:refresh')); return; }
  if (action === 'mic') {
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) { errorMessage = 'Speech input isn’t available in this browser. You can type instead.'; document.dispatchEvent(new CustomEvent('health:refresh')); return; }
    if (recognition) { recognition.stop(); recognition = null; return; }
    recognition = new Recognition();
    recognition.lang = navigator.languages?.[0] || navigator.language || 'en-US';
    recognition.interimResults = true;
    recognition.continuous = false;
    const baseText = document.querySelector('#tm-message')?.value || '';
    recognition.onresult = resultEvent => {
      const textarea = document.querySelector('#tm-message');
      if (!textarea) return;
      const text = Array.from(resultEvent.results).map(result => result[0].transcript).join('');
      textarea.value = `${baseText}${baseText ? ' ' : ''}${text}`;
      composerDraft = textarea.value;
      autoSize(textarea);
    };
    recognition.onerror = () => { errorMessage = 'Microphone access was unavailable. You can type your message instead.'; recognition = null; document.dispatchEvent(new CustomEvent('health:refresh')); };
    recognition.onend = () => { recognition = null; };
    recognition.start();
    return;
  }
  if (action === 'clear') {
    requestController?.abort();
    requestController = null;
    pending = false;
    voiceLoading = false;
    composerDraft = '';
    draftAttachments = [];
    attachmentsLoading = false;
    emojiOpen = false;
    menuOpen = false;
    readingHistory = false;
    transcript.splice(0, transcript.length, { role: 'assistant', content: welcome, createdAt: new Date().toISOString() });
    errorMessage = '';
    clearAudio();
    revealIndex = -1;
    document.dispatchEvent(new CustomEvent('health:refresh'));
  }
});

export function cleanupTalkToMira() {
  clearInterval(revealTimer);
  requestController?.abort();
  requestController = null;
  clearAudio();
  recognition?.abort();
  recognition = null;
  menuOpen = false;
}
