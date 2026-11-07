/**
 * Mira's approved expression art. Keep filenames here so adding an expression
 * never requires changing the character renderer.
 */
export const MIRA_EXPRESSIONS = Object.freeze({
  happy: { src: '/mascots/MIRA-expressions/happy.webp', label: 'happy' },
  empathetic: { src: '/mascots/MIRA-expressions/empathetic.png', label: 'empathetic' },
  thoughtful: { src: '/mascots/MIRA-expressions/neutral.webp', label: 'thoughtful' },
  curious: { src: '/mascots/MIRA-expressions/Curious.png', label: 'curious' },
  reassuring: { src: '/mascots/MIRA-expressions/Reassuring.png', label: 'reassuring' },
  speaking: { src: '/mascots/MIRA-expressions/speaking.png', label: 'speaking' },
  listening: { src: '/mascots/MIRA-expressions/Surprised-excited-sleepy-listening.png', label: 'listening' },
  idle: { src: '/mascots/MIRA-expressions/gentle.png', label: 'at ease' },
});

export const MIRA_DIRECTION_ATLAS = '/mascots/MIRA-expressions/nurse-directions.webp';
export const MIRA_REACTION_ATLAS = '/mascots/MIRA-expressions/nurse-reactions.webp';

export class MiraExpressionController {
  constructor(root) {
    this.root = root;
    this.image = root?.querySelector('[data-mira-expression-image]');
    if (this.image && !this.image.dataset.expression) this.image.dataset.expression = 'idle';
  }

  set(expression) {
    const config = MIRA_EXPRESSIONS[expression] || MIRA_EXPRESSIONS.idle;
    if (!this.image) return;
    if (this.image.dataset.expression === expression) return;
    this.image.dataset.expression = expression in MIRA_EXPRESSIONS ? expression : 'idle';
    this.image.classList.add('is-changing');
    const next = new Image();
    next.onload = () => {
      this.image.src = config.src;
      this.image.alt = `Mira, ${config.label}`;
      requestAnimationFrame(() => this.image.classList.remove('is-changing'));
    };
    next.onerror = () => this.image.classList.remove('is-changing');
    next.src = config.src;
  }
}

export function MiraCharacter() {
  return `<div class="tm-character" data-mira-character aria-label="Mira, your wellbeing companion">
    <span class="tm-character-halo" aria-hidden="true"></span>
    <img data-mira-expression-image src="${MIRA_EXPRESSIONS.idle.src}" alt="Mira, at ease" width="1280" height="1280" fetchpriority="high" />
    <div class="tm-character-caption"><span class="tm-presence-dot"></span><span><strong>Mira</strong><small>Here with you, at your pace</small></span></div>
  </div>`;
}
