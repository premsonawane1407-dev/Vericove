import { miraVoiceMessages } from './miraVoiceMessages.js';

let lastMessageId = '';
let typingTimer;
let activeAudio;
let activeController;
let clickToken = 0;
let hideTimer;
let introTypingTimer;
const reactionCells = {
  happy: [2, 2],
  curious: [0, 1],
  thinking: [0, 0],
  supportive: [2, 1],
  excited: [2, 0],
  attentive: [0, 0],
  playful: [1, 1]
};

const setReactionExpression = (figure, mood) => {
  const [column, row] = reactionCells[mood] || reactionCells.happy;
  figure.style.setProperty('--mira-reaction-x', `${(1 - column) * 33.333333}%`);
  figure.style.setProperty('--mira-reaction-y', `${(1 - row) * 33.333333}%`);
};
let miraLanguage = (() => {
  try { return localStorage.getItem('mira-dialogue-language') === 'hi' ? 'hi' : 'en'; }
  catch { return 'en'; }
})();
function animateIntroHeading() {
  const visual = document.querySelector('.mira-intro-typed');
  if (!visual) return;
  const heading = visual.closest('.mira-intro-title');
  const phrase = 'Hey, I’m Mira.';
  clearInterval(introTypingTimer);
  heading?.classList.remove('is-typing');
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
    visual.textContent = phrase;
    return;
  }
  visual.textContent = '';
  heading?.classList.add('is-typing');
  let position = 0;
  introTypingTimer = setInterval(() => {
    visual.textContent = phrase.slice(0, ++position);
    if (position >= phrase.length) {
      clearInterval(introTypingTimer);
      heading?.classList.remove('is-typing');
    }
  }, 54);
}

function setInfoMenu(button, open) {
  const menu = document.getElementById(button?.getAttribute('aria-controls') || '');
  if (!menu) return;
  button.setAttribute('aria-expanded', String(open));
  if (open) {
    menu.hidden = false;
    requestAnimationFrame(() => menu.classList.add('is-open'));
    return;
  }
  menu.classList.remove('is-open');
  setTimeout(() => { if (button.getAttribute('aria-expanded') === 'false') menu.hidden = true; }, 240);
}

function selectMessage() {
  const options = miraVoiceMessages.filter(message => message.id !== lastMessageId);
  const selected = options[Math.floor(Math.random() * options.length)];
  lastMessageId = selected.id;
  return { ...selected, text: miraLanguage === 'hi' ? selected.textHi : selected.text };
}

function updateLanguageToggle(button, language = miraLanguage) {
  button.dataset.language = language;
  button.setAttribute('aria-pressed', String(language === 'hi'));
  button.setAttribute('aria-label', `Mira language: ${language === 'hi' ? 'Hindi' : 'English'}. Switch to ${language === 'hi' ? 'English' : 'Hindi'}.`);
}

function restoreLanguageToggle() {
  document.querySelectorAll('[data-mira-language-toggle]').forEach(button => updateLanguageToggle(button));
}

function stopCurrentVoice() {
  clearInterval(typingTimer);
  activeController?.abort();
  activeController = null;
  if (activeAudio) {
    activeAudio.pause();
    activeAudio.removeAttribute('src');
    activeAudio = null;
  }
  if ('speechSynthesis' in window) speechSynthesis.cancel();
}

function typeMessage(message, typedText, announcement, token) {
  clearInterval(typingTimer);
  typedText.textContent = '';
  announcement.textContent = message.text;
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
    typedText.textContent = message.text;
    typedText.closest('.mira-voice-message')?.classList.remove('is-speaking');
    return;
  }
  let position = 0;
  typingTimer = setInterval(() => {
    if (token !== clickToken) {
      clearInterval(typingTimer);
      return;
    }
    typedText.textContent = message.text.slice(0, ++position);
    if (position >= message.text.length) {
      clearInterval(typingTimer);
      typedText.closest('.mira-voice-message')?.classList.remove('is-speaking');
    }
  }, 28);
}

function speakWithDeviceVoice(text, language) {
  if (!('speechSynthesis' in window)) return;
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = language === 'hi' ? 'hi-IN' : 'en-IN';
  utterance.rate = 0.97;
  utterance.pitch = 1.1;
  const voices = speechSynthesis.getVoices();
  const languagePrefix = language === 'hi' ? 'hi' : 'en';
  utterance.voice = voices.find(voice => /female|woman|zira|samantha|aria|jenny|sara|heera|aditi|priya/i.test(voice.name) && voice.lang.toLowerCase().startsWith(languagePrefix))
    || voices.find(voice => voice.lang.toLowerCase() === utterance.lang.toLowerCase())
    || voices.find(voice => /female|woman|zira|samantha|aria|jenny|sara|heera|aditi|priya/i.test(voice.name) && voice.lang.toLowerCase().startsWith('en'))
    || voices.find(voice => voice.lang.toLowerCase().startsWith(languagePrefix))
    || null;
  speechSynthesis.speak(utterance);
}

async function playGeminiVoice(message, token, language) {
  const controller = new AbortController();
  activeController = controller;
  try {
    const response = await fetch('/api/mira-voice', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messageId: message.id, language }),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error('Voice unavailable');
    const audioUrl = URL.createObjectURL(await response.blob());
    if (token !== clickToken) {
      URL.revokeObjectURL(audioUrl);
      return;
    }
    const audio = new Audio(audioUrl);
    activeAudio = audio;
    audio.addEventListener('ended', () => {
      URL.revokeObjectURL(audioUrl);
      if (activeAudio === audio) activeAudio = null;
    }, { once: true });
    await audio.play();
  } catch (error) {
    if (error.name === 'AbortError' || token !== clickToken) return;
    speakWithDeviceVoice(message.text, language);
  }
}

document.addEventListener('click', event => {
  const mascot = event.target.closest?.('.mira-mascot');
  if (!mascot) return;
  const messageBox = mascot.closest('.mira-portrait')?.querySelector('.mira-voice-message');
  const typedText = messageBox?.querySelector('.mira-voice-typed');
  const announcement = messageBox?.querySelector('.mira-voice-announcement');
  if (!messageBox || !typedText || !announcement) return;

  stopCurrentVoice();
  const token = ++clickToken;
  clearTimeout(hideTimer);
  const message = selectMessage();
  const figure = mascot.closest('.mira-figure');
  figure.dataset.mood = message.mood;
  setReactionExpression(figure, message.mood);
  clearTimeout(figure.reactionTimer);
  figure.dataset.reaction = 'true';
  figure.reactionTimer = setTimeout(() => {
    delete figure.dataset.reaction;
    figure.dispatchEvent(new CustomEvent('mira:reaction-finished', { bubbles: true }));
  }, 1350);

  messageBox.hidden = false;
  messageBox.classList.remove('is-visible', 'is-speaking');
  void messageBox.offsetWidth;
  messageBox.classList.add('is-visible', 'is-speaking');
  typeMessage(message, typedText, announcement, token);
  void playGeminiVoice(message, token, miraLanguage);
  hideTimer = setTimeout(() => {
    if (token !== clickToken) return;
    messageBox.classList.remove('is-visible', 'is-speaking');
    hideTimer = setTimeout(() => {
      if (token === clickToken) messageBox.hidden = true;
    }, 360);
  }, 12_000);
});

document.addEventListener('mira:page-rendered', event => {
  if (event.detail?.route === 'my-health') {
    restoreLanguageToggle();
    if (event.detail?.previousRoute !== 'my-health') animateIntroHeading();
    return;
  }
  clickToken++;
  clearTimeout(hideTimer);
  clearInterval(introTypingTimer);
  stopCurrentVoice();
  document.querySelectorAll('.mira-voice-message').forEach(message => {
    message.classList.remove('is-visible', 'is-speaking');
    message.hidden = true;
  });
});

document.addEventListener('click', event => {
  const toggle = event.target.closest?.('[data-mira-language-toggle]');
  if (!toggle) return;
  miraLanguage = miraLanguage === 'en' ? 'hi' : 'en';
  try { localStorage.setItem('mira-dialogue-language', miraLanguage); }
  catch { /* The toggle remains active for this page session. */ }
  updateLanguageToggle(toggle);
});

document.addEventListener('click', event => {
  const toggle = event.target.closest?.('[data-mira-info-toggle]');
  if (toggle) {
    setInfoMenu(toggle, toggle.getAttribute('aria-expanded') !== 'true');
    return;
  }
  if (event.target.closest?.('.mira-info-menu')) return;
  document.querySelectorAll('[data-mira-info-toggle][aria-expanded="true"]').forEach(button => setInfoMenu(button, false));
});

document.addEventListener('keydown', event => {
  if (event.key !== 'Escape') return;
  document.querySelectorAll('[data-mira-info-toggle][aria-expanded="true"]').forEach(button => {
    setInfoMenu(button, false);
    button.focus();
  });
});

window.addEventListener('pagehide', stopCurrentVoice);
