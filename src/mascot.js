// The approved direction art is a 3×3 sprite sheet: each cell is one of Mira’s
// eight gaze directions plus the centered pose.
const directionCells = [
  ['up-left', 'up', 'up-right'],
  ['left', 'center', 'right'],
  ['down-left', 'down', 'down-right'],
];

const setMascotLook = (mascot, column = 1, row = 1) => {
  const figure = mascot.closest('.mira-figure');
  if (!figure || figure.dataset.look === `${column}-${row}`) return;
  figure.dataset.look = `${column}-${row}`;
  figure.dataset.direction = directionCells[row]?.[column] || 'center';
  figure.style.setProperty('--mascot-direction-x', `${(1 - column) * 33.333333}%`);
  figure.style.setProperty('--mascot-direction-y', `${(1 - row) * 33.333333}%`);
};

let pointerFrame = 0;
let lastPointerPosition = null;

const updateMascotLook = () => {
  pointerFrame = 0;
  const mascot = document.querySelector('.mira-mascot');
  const figure = mascot?.closest('.mira-figure');
  if (!mascot || !figure || !lastPointerPosition || figure.dataset.reaction === 'true') return;
  const bounds = figure.getBoundingClientRect();
  const horizontal = lastPointerPosition.x - (bounds.left + bounds.width / 2);
  const vertical = lastPointerPosition.y - (bounds.top + bounds.height / 2);
  const directionIndex = delta => Math.abs(delta) < 44 ? 1 : delta < 0 ? 0 : 2;
  const column = directionIndex(horizontal);
  const row = directionIndex(vertical);
  setMascotLook(mascot, column, row);
};

const scheduleMascotLook = () => {
  if (!pointerFrame) pointerFrame = requestAnimationFrame(updateMascotLook);
};

document.addEventListener('pointermove', event => {
  if (event.pointerType === 'touch') return;
  lastPointerPosition = { x: event.clientX, y: event.clientY };
  scheduleMascotLook();
}, { passive: true });

document.addEventListener('pointerdown', event => {
  lastPointerPosition = { x: event.clientX, y: event.clientY };
  scheduleMascotLook();
}, { passive: true });

window.addEventListener('blur', () => {
  lastPointerPosition = null;
  const mascot = document.querySelector('.mira-mascot');
  if (mascot) setMascotLook(mascot);
});

document.addEventListener('mira:page-rendered', event => {
  if (event.detail?.route === 'my-health' && lastPointerPosition) scheduleMascotLook();
});

document.addEventListener('mira:reaction-finished', () => {
  if (lastPointerPosition) scheduleMascotLook();
});
