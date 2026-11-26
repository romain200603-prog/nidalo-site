import { useEffect } from 'react';
import { DESKTOP_QUERY } from '../lib/desktop';

// Rangées qui défilent de côté (rails de l'accueil, pastilles des critères et des filtres, fiches du panneau de la
// carte, colonnes de Comparer). Au doigt et au pavé tactile, elles défilent comme sur l'iPhone. À partir de 1024 px,
// elles défilent aussi à la molette d'une souris et en les tirant, bouton gauche enfoncé ; au clavier, le focus d'une
// carte fait défiler sa rangée jusqu'à elle (le navigateur s'en charge). En dessous de 1024 px, rien n'est écouté.

/** Les rangées des écrans de la recherche ; la plus proche du pointeur qui a de quoi défiler est prise. */
const RAILS = '.home-app-carousel, .chips-row, .criterion-chips, .choice-scroll, .map-panel-strip, .cmpm-scroll';
/** Un geste de molette commencé sur la page lui reste tant qu'il continue (au plus 0,4 s entre deux crans). */
const PAGE_LATCH = 400;
/** Déplacement, bouton enfoncé, à partir duquel la rangée suit la souris (en dessous : un clic). */
const DRAG_START = 5;
/** Rangée calée fiche par fiche (scroll-snap) : un cran de molette avance d'une fiche, puis attend 0,3 s. */
const SNAP_PAUSE = 300;
/** Une ligne de molette (deltaMode 1), en pixels. */
const LINE = 33;

function scrollsSideways(element: Element): element is HTMLElement {
  if (!(element instanceof HTMLElement) || element.scrollWidth <= element.clientWidth + 1) return false;
  const overflow = getComputedStyle(element).overflowX;
  return overflow === 'auto' || overflow === 'scroll';
}

/** La rangée sous le pointeur qui a de quoi défiler. */
function railAt(target: EventTarget | null): HTMLElement | null {
  let element = target instanceof Element ? target.closest(RAILS) : null;
  while (element) {
    if (scrollsSideways(element)) return element;
    element = element.parentElement?.closest(RAILS) ?? null;
  }
  return null;
}

function snaps(rail: HTMLElement): boolean {
  const type = getComputedStyle(rail).scrollSnapType;
  return type !== '' && type !== 'none';
}

function reducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

type Drag = { rail: HTMLElement; pointerId: number; x: number; y: number; left: number; moving: boolean };

let users = 0;
let stop: (() => void) | null = null;

/** Écoute la molette et la souris ; rend de quoi l'arrêter. */
function listen(): () => void {
  let pageWheelAt = -Infinity;
  let snapAt = -Infinity;
  let drag: Drag | null = null;

  const onWheel = (event: WheelEvent) => {
    if (event.ctrlKey || event.defaultPrevented) return;
    // Geste de côté (pavé tactile, Maj + molette) : le navigateur fait défiler la rangée lui-même.
    if (Math.abs(event.deltaX) >= Math.abs(event.deltaY)) return;
    const rail = railAt(event.target);
    const now = event.timeStamp;
    if (!rail || now - pageWheelAt < PAGE_LATCH) {
      pageWheelAt = now;
      return;
    }
    const delta = event.deltaY * (event.deltaMode === 1 ? LINE : event.deltaMode === 2 ? rail.clientWidth : 1);
    const end = rail.scrollWidth - rail.clientWidth;
    // Au bout de la rangée, la page reprend la molette.
    if ((delta > 0 && rail.scrollLeft >= end - 1) || (delta < 0 && rail.scrollLeft <= 1)) {
      pageWheelAt = now;
      return;
    }
    event.preventDefault();
    if (!snaps(rail)) {
      rail.scrollLeft += delta;
      return;
    }
    if (now - snapAt < SNAP_PAUSE) return;
    snapAt = now;
    const item = rail.firstElementChild instanceof HTMLElement ? rail.firstElementChild : null;
    const step = item ? item.offsetWidth + (parseFloat(getComputedStyle(rail).columnGap) || 0) : rail.clientWidth;
    rail.scrollBy({ left: Math.sign(delta) * step, behavior: reducedMotion() ? 'auto' : 'smooth' });
  };

  const release = (rail: HTMLElement) => {
    rail.style.removeProperty('cursor');
    rail.style.removeProperty('user-select');
    rail.style.removeProperty('scroll-snap-type');
  };

  const onPointerDown = (event: PointerEvent) => {
    if (event.pointerType !== 'mouse' || event.button !== 0) return;
    if (event.target instanceof Element && event.target.closest('input, select, textarea')) return;
    const rail = railAt(event.target);
    drag = rail ? { rail, pointerId: event.pointerId, x: event.clientX, y: event.clientY, left: rail.scrollLeft, moving: false } : null;
  };

  const onPointerMove = (event: PointerEvent) => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const dx = event.clientX - drag.x;
    if (!drag.moving) {
      const dy = event.clientY - drag.y;
      if (Math.max(Math.abs(dx), Math.abs(dy)) < DRAG_START) return;
      // Geste vertical : la rangée ne bouge pas (la page, ou le panneau de la carte, le prend).
      if (Math.abs(dy) > Math.abs(dx)) {
        drag = null;
        return;
      }
      drag.moving = true;
      drag.rail.style.setProperty('cursor', 'grabbing');
      drag.rail.style.setProperty('user-select', 'none');
      drag.rail.style.setProperty('scroll-snap-type', 'none');
      window.getSelection()?.removeAllRanges();
    }
    drag.rail.scrollLeft = drag.left - dx;
  };

  const onPointerUp = (event: PointerEvent) => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const { rail, moving } = drag;
    drag = null;
    if (!moving) return;
    release(rail);
    if (event.type !== 'pointerup') return;
    // Le clic qui suit le relâchement n'ouvre pas la fiche sous la souris.
    const swallow = (click: MouseEvent) => {
      click.preventDefault();
      click.stopPropagation();
    };
    window.addEventListener('click', swallow, { capture: true, once: true });
    window.setTimeout(() => window.removeEventListener('click', swallow, { capture: true }), 0);
  };

  // Une fiche tirée à la souris fait défiler sa rangée au lieu d'être glissée comme un lien.
  const onDragStart = (event: DragEvent) => {
    if (railAt(event.target)) event.preventDefault();
  };

  document.addEventListener('wheel', onWheel, { passive: false });
  document.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);
  window.addEventListener('pointercancel', onPointerUp);
  document.addEventListener('dragstart', onDragStart);
  return () => {
    if (drag) release(drag.rail);
    document.removeEventListener('wheel', onWheel);
    document.removeEventListener('pointerdown', onPointerDown);
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
    window.removeEventListener('pointercancel', onPointerUp);
    document.removeEventListener('dragstart', onDragStart);
  };
}

/** L'écoute suit la largeur de la fenêtre : posée à partir de 1024 px, retirée en dessous. */
function start(): () => void {
  let query: MediaQueryList | null = null;
  try {
    query = window.matchMedia(DESKTOP_QUERY);
  } catch {
    return () => undefined;
  }
  let detach: (() => void) | null = null;
  const sync = () => {
    if (query?.matches && !detach) detach = listen();
    else if (!query?.matches && detach) {
      detach();
      detach = null;
    }
  };
  sync();
  query.addEventListener('change', sync);
  return () => {
    query?.removeEventListener('change', sync);
    detach?.();
    detach = null;
  };
}

/** Molette et souris pour les rangées de la page : une seule écoute, quel que soit le nombre d'écrans qui la demandent. */
export function useRailScroll() {
  useEffect(() => {
    users += 1;
    if (users === 1) stop = start();
    return () => {
      users -= 1;
      if (users === 0) {
        stop?.();
        stop = null;
      }
    };
  }, []);
}
