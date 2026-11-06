const centerMascot = mascot => {
  mascot.style.setProperty('--mascot-x', '50%');
  mascot.style.setProperty('--mascot-y', '50%');
};

document.addEventListener('pointermove', event => {
  if (event.pointerType === 'touch') return;
  const mascot = document.querySelector('.mira-mascot');
  if (!mascot || mascot.dataset.reaction === 'true') return;
  const bounds = mascot.getBoundingClientRect();
  const horizontal = event.clientX - (bounds.left + bounds.width / 2);
  const vertical = event.clientY - (bounds.top + bounds.height / 2);
  const column = Math.abs(horizontal) < 42 ? 1 : horizontal < 0 ? 0 : 2;
  const row = Math.abs(vertical) < 42 ? 1 : vertical < 0 ? 0 : 2;
  mascot.style.setProperty('--mascot-x', `${column * 50}%`);
  mascot.style.setProperty('--mascot-y', `${row * 50}%`);
});

window.addEventListener('blur', () => {
  const mascot = document.querySelector('.mira-mascot');
  if (mascot) centerMascot(mascot);
});

document.addEventListener('click', event => {
  const mascot = event.target.closest?.('.mira-mascot');
  if (!mascot) return;
  mascot.dataset.reaction = 'true';
  clearTimeout(mascot.reactionTimer);
  mascot.reactionTimer = setTimeout(() => delete mascot.dataset.reaction, 700);
});
