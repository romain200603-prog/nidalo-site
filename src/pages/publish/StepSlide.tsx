import { Component, createRef, type AnimationEvent, type ReactNode } from 'react';

// Passage d'une étape de Publier à l'autre, comme l'app (PublishFlowView.stepTransition) : en avançant, l'étape quittée
// part vers la gauche en s'estompant pendant que la suivante arrive par la droite ; en revenant, l'inverse. Avec
// « Réduire les animations », un fondu seul. L'en-tête et la barre d'actions ne bougent pas ; les mouvements sont dans
// ordinateur-publier.css (le ressort de l'app, --app-ease).
//
// L'étape quittée n'existe plus dans React : juste avant le changement, une copie inerte de son contenu est prise, puis
// gardée à la même place à l'écran (calque fixe, entre le haut de l'étape et la barre d'actions) pendant que la page
// remonte en haut pour la nouvelle étape ; elle est retirée à la fin du mouvement. Les classes ajoutées ici le sont sur
// des éléments dont React ne change jamais la classe, et le calque n'a pas d'enfant React.

type Props = { index: number; children: ReactNode };
type Snapshot = { copy: HTMLElement; top: number; forward: boolean } | null;

/** Marge de chaque côté de la colonne où le mouvement reste visible (ombres et contours des cartes compris). */
const MARGIN = 24;

/** Copie inerte d'une étape : mêmes valeurs saisies, sans identifiant, nom de champ ni repère de guidage en double. */
function copyOf(box: HTMLElement, forward: boolean): HTMLElement {
  const copy = box.cloneNode(true) as HTMLElement;
  copy.className = `dpub-step-copy ${forward ? 'is-forward' : 'is-back'}`;
  for (const element of [copy, ...copy.querySelectorAll('*')]) {
    for (const attribute of ['id', 'name', 'for', 'data-guide']) element.removeAttribute(attribute);
  }
  for (const dialog of copy.querySelectorAll('dialog')) dialog.remove();
  // Les valeurs saisies sont des propriétés, que la copie ne reprend pas.
  const fields = box.querySelectorAll('input, textarea, select');
  const copies = copy.querySelectorAll('input, textarea, select');
  fields.forEach((field, position) => {
    const target = copies[position];
    if (field instanceof HTMLInputElement && target instanceof HTMLInputElement) {
      if (field.type === 'checkbox' || field.type === 'radio') target.checked = field.checked;
      else if (field.type !== 'file') target.value = field.value;
    } else if ((field instanceof HTMLTextAreaElement && target instanceof HTMLTextAreaElement)
      || (field instanceof HTMLSelectElement && target instanceof HTMLSelectElement)) {
      target.value = field.value;
    }
  });
  return copy;
}

/** « 0.45s », « 250ms » → millisecondes (la première durée). */
function milliseconds(duration: string): number {
  const first = duration.split(',')[0].trim();
  const value = parseFloat(first);
  if (!Number.isFinite(value)) return 0;
  return first.endsWith('ms') ? value : value * 1000;
}

export class StepSlide extends Component<Props> {
  private readonly root = createRef<HTMLDivElement>();
  private readonly box = createRef<HTMLDivElement>();
  private readonly exit = createRef<HTMLDivElement>();
  private timer: number | undefined;
  private sliding = false;

  /** Un changement d'étape est en cours : un second « Continuer » attend sa fin, comme dans l'app (isChangingStep). */
  get isSliding(): boolean {
    return this.sliding;
  }

  getSnapshotBeforeUpdate(previous: Props): Snapshot {
    const box = this.box.current;
    if (previous.index === this.props.index || !box) return null;
    const forward = this.props.index >= previous.index;
    return { copy: copyOf(box, forward), top: box.getBoundingClientRect().top, forward };
  }

  componentDidUpdate(_previous: Props, _state: unknown, snapshot: Snapshot) {
    if (!snapshot) return;
    const { root: { current: root }, box: { current: box }, exit: { current: exit } } = this;
    this.finish();
    // Chaque étape s'ouvre en haut de page, dès sa première image.
    window.scrollTo({ top: 0 });
    if (!root || !box || !exit) return;
    const rect = box.getBoundingClientRect();
    const bar = root.closest('.dpub')?.querySelector('.dsc-action-bar');
    const top = Math.max(0, rect.top);
    const bottom = Math.min(window.innerHeight, bar ? bar.getBoundingClientRect().top : window.innerHeight);
    Object.assign(exit.style, {
      left: `${rect.left - MARGIN}px`, top: `${top}px`, width: `${rect.width + 2 * MARGIN}px`, height: `${Math.max(0, bottom - top)}px`,
    });
    Object.assign(snapshot.copy.style, { left: `${MARGIN}px`, top: `${snapshot.top - top}px`, width: `${rect.width}px` });
    exit.replaceChildren(snapshot.copy);
    box.classList.add('is-entering', snapshot.forward ? 'is-forward' : 'is-back');
    root.classList.add('is-sliding');
    this.sliding = true;
    // Fin du mouvement : à la fin de l'animation de l'étape, ou après sa durée si elle n'a pas lieu (onglet caché).
    this.timer = window.setTimeout(() => this.finish(), milliseconds(getComputedStyle(box).animationDuration) + 100);
  }

  componentWillUnmount() {
    this.finish();
  }

  private finish() {
    window.clearTimeout(this.timer);
    this.timer = undefined;
    this.sliding = false;
    this.exit.current?.replaceChildren();
    this.box.current?.classList.remove('is-entering', 'is-forward', 'is-back');
    this.root.current?.classList.remove('is-sliding');
  }

  private readonly ended = (event: AnimationEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget && this.sliding) this.finish();
  };

  render() {
    return (
      <div ref={this.root} className="dpub-steps">
        <div ref={this.box} className="dpub-step" onAnimationEnd={this.ended}>{this.props.children}</div>
        <div ref={this.exit} className="dpub-step-exit" aria-hidden="true" inert />
      </div>
    );
  }
}
