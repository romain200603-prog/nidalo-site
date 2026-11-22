// Mouvements de l'écran de connexion, comme l'app (AuthView.swift) : ressort de 0,55 s (réponse 0,55, amorti 0,85),
// fondu de 0,2 s avec « Réduire les animations ».
// - En quittant l'accueil : le titre remonte de 24 et les boutons descendent de 40, en fondu ; le lancement s'efface ;
//   le titre de l'étape et la feuille blanche montent du bas de l'écran. Au retour, l'inverse.
// - D'une étape à l'autre : l'ancien titre et l'ancien contenu s'effacent, les nouveaux arrivent en fondu en glissant
//   de 18 (titre) et 14 (contenu) ; la feuille prend sa nouvelle hauteur.
// Ce qui s'en va est remplacé un instant par une copie figée, sans rien d'interactif ni de lisible par les lecteurs
// d'écran.

/** Le ressort de l'app : la courbe du site ajustée sur un ressort (écart de 1 %), sur 0,55 s. */
const SPRING: KeyframeAnimationOptions = { duration: 550, easing: 'cubic-bezier(0.24, 0.15, 0.2, 1.13)' };
const FADE: KeyframeAnimationOptions = { duration: 200, easing: 'ease-in-out' };

export function prefersReducedMotion(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function canAnimate(element: Element | null): element is HTMLElement {
  return element instanceof HTMLElement && typeof element.animate === 'function';
}

/** Secousse d'un champ en erreur : trois allers-retours de 6 en 0,36 s (ShakeEffect de l'app). */
export function shake(element: HTMLElement | null) {
  if (!canAnimate(element) || prefersReducedMotion()) return;
  const frames = Array.from({ length: 25 }, (_, step) => ({ transform: `translateX(${(6 * Math.sin((step / 24) * Math.PI * 6)).toFixed(3)}px)` }));
  element.animate(frames, { duration: 360, easing: 'linear' });
}

/** Attributs retirés de la copie : identifiants, liens, rôles et libellés lus par les lecteurs d'écran. */
const STRIPPED = ['id', 'for', 'name', 'role', 'href', 'tabindex', 'autocomplete', 'aria-live', 'aria-label', 'aria-labelledby', 'aria-describedby', 'aria-invalid', 'aria-busy'];

/** Copie figée d'un élément qui s'en va : même dessin, rien d'interactif, cachée aux lecteurs d'écran. */
function freeze(element: HTMLElement): HTMLElement {
  const copy = element.cloneNode(true) as HTMLElement;
  const originals = [element, ...element.querySelectorAll<HTMLElement | SVGElement>('*')];
  const copies = [copy, ...copy.querySelectorAll<HTMLElement | SVGElement>('*')];
  originals.forEach((original, index) => {
    const twin = copies[index];
    if (!twin) return;
    // Styles posés par le code (positions du lancement en boucle) : recopiés propriété par propriété.
    for (let i = 0; i < original.style.length; i += 1) {
      const property = original.style.item(i);
      twin.style.setProperty(property, original.style.getPropertyValue(property));
    }
    if (original instanceof HTMLInputElement && twin instanceof HTMLInputElement) {
      twin.value = original.value;
      twin.readOnly = true;
    }
    for (const name of STRIPPED) twin.removeAttribute(name);
  });
  // Plus de titres dans la copie : la page n'en a qu'un, celui de l'étape affichée.
  copy.querySelectorAll('h1, h2, h3').forEach((heading) => {
    const plain = document.createElement('div');
    plain.className = heading.className;
    plain.append(...heading.childNodes);
    heading.replaceWith(plain);
  });
  copy.setAttribute('aria-hidden', 'true');
  copy.inert = true;
  copy.classList.add('auth-ghost');
  return copy;
}

/** Les éléments de l'écran que les mouvements utilisent. */
export type MotionElements = {
  stage: HTMLElement | null;
  stageGhosts: HTMLElement | null;
  layer: HTMLElement | null;
  headGhosts: HTMLElement | null;
  head: HTMLElement | null;
  sheet: HTMLElement | null;
  contentGhosts: HTMLElement | null;
  content: HTMLElement | null;
};

type Snapshot =
  | { kind: 'layer'; leaving: 'welcome' | 'steps'; ghost: HTMLElement; bottom: number; height: number }
  | { kind: 'step'; head: HTMLElement | null; content: HTMLElement | null; sheetHeight: number };

export class ScreenMotion {
  private animations: Animation[] = [];
  private ghosts: HTMLElement[] = [];
  private resizing: HTMLElement | null = null;
  private pending: Snapshot | null = null;

  /** Arrête tout mouvement en cours : copies retirées, éléments à leur place. */
  stop() {
    for (const animation of this.animations) animation.cancel();
    this.animations = [];
    for (const ghost of this.ghosts) ghost.remove();
    this.ghosts = [];
    this.resizing?.classList.remove('is-resizing');
    this.resizing = null;
  }

  /** Juste avant le changement d'étape : la copie de ce qui va partir, et la hauteur de la feuille. */
  capture(elements: MotionElements, fromWelcome: boolean, toWelcome: boolean) {
    this.stop();
    this.pending = null;
    if (fromWelcome !== toWelcome) {
      const { stage, layer } = elements;
      if (!stage || !layer) return;
      const stageBox = stage.getBoundingClientRect();
      const layerBox = layer.getBoundingClientRect();
      this.pending = {
        kind: 'layer', leaving: fromWelcome ? 'welcome' : 'steps', ghost: freeze(layer),
        bottom: stageBox.bottom - layerBox.bottom, height: layerBox.height,
      };
      return;
    }
    if (fromWelcome) return;
    this.pending = {
      kind: 'step',
      head: elements.head ? freeze(elements.head) : null,
      content: elements.content ? freeze(elements.content) : null,
      sheetHeight: elements.sheet?.getBoundingClientRect().height ?? 0,
    };
  }

  /** Juste après le changement (avant l'affichage) : les mouvements. `false` s'il n'y avait rien à faire. */
  play(elements: MotionElements): boolean {
    const snapshot = this.pending;
    this.pending = null;
    if (!snapshot) return false;
    const reduced = prefersReducedMotion();
    const timing = reduced ? FADE : SPRING;
    const animate = (element: Element | null, frames: Keyframe[]) => {
      if (!canAnimate(element)) return;
      this.animations.push(element.animate(frames, timing));
    };
    const fadeIn: Keyframe[] = [{ opacity: 0 }, { opacity: 1 }];
    const fadeOut: Keyframe[] = [{ opacity: 1 }, { opacity: 0 }];
    const rise = (offset: number, entering: boolean): Keyframe[] => {
      const moved = { opacity: 0, transform: `translateY(${offset}px)` };
      const still = { opacity: 1, transform: 'none' };
      return entering ? [moved, still] : [still, moved];
    };

    if (snapshot.kind === 'layer') {
      const { ghost } = snapshot;
      if (!elements.stageGhosts) return true;
      ghost.classList.add(snapshot.leaving === 'welcome' ? 'is-under' : 'is-over');
      ghost.style.bottom = `${snapshot.bottom}px`;
      ghost.style.height = `${snapshot.height}px`;
      elements.stageGhosts.append(ghost);
      this.ghosts.push(ghost);
      const layer = elements.layer;
      if (snapshot.leaving === 'welcome') {
        if (reduced) {
          animate(ghost, fadeOut);
          animate(layer, fadeIn);
        } else {
          animate(ghost.querySelector('.auth-welcome-head'), rise(-24, false));
          animate(ghost.querySelector('.auth-welcome-actions'), rise(40, false));
          animate(ghost.querySelector('.auth-loop-zone'), fadeOut);
          animate(layer, [{ transform: 'translateY(100%)' }, { transform: 'none' }]);
        }
      } else if (reduced) {
        animate(ghost, fadeOut);
        animate(layer, fadeIn);
      } else {
        animate(ghost, [{ transform: 'none' }, { transform: 'translateY(100%)' }]);
        animate(layer?.querySelector('.auth-welcome-head') ?? null, rise(-24, true));
        animate(layer?.querySelector('.auth-welcome-actions') ?? null, rise(40, true));
        animate(layer?.querySelector('.auth-loop-zone') ?? null, fadeIn);
      }
    } else {
      const { head, content } = snapshot;
      if (head && elements.headGhosts) {
        head.style.bottom = '0px';
        elements.headGhosts.append(head);
        this.ghosts.push(head);
        animate(head, fadeOut);
      }
      if (content && elements.contentGhosts) {
        content.classList.add('auth-content-ghost');
        elements.contentGhosts.append(content);
        this.ghosts.push(content);
        animate(content, fadeOut);
      }
      animate(elements.head, reduced ? fadeIn : rise(18, true));
      animate(elements.content, reduced ? fadeIn : rise(14, true));
      const sheet = elements.sheet;
      const height = sheet?.getBoundingClientRect().height ?? 0;
      if (canAnimate(sheet) && Math.abs(height - snapshot.sheetHeight) > 0.5) {
        sheet.classList.add('is-resizing');
        this.resizing = sheet;
        animate(sheet, [{ height: `${snapshot.sheetHeight}px` }, { height: `${height}px` }]);
      }
    }

    const all = this.animations.slice();
    void Promise.all(all.map((animation) => animation.finished)).then(() => {
      // Seulement si aucun autre mouvement n'a commencé entre-temps.
      if (this.animations.length === all.length && this.animations.every((animation, index) => animation === all[index])) this.stop();
    }, () => undefined);
    return true;
  }
}
