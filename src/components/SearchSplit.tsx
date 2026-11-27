import { useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';

/**
 * « Votre recherche » sur ordinateur (≥ 1024 px) : la barre entre la liste et la carte, à faire glisser pour agrandir
 * l'une ou l'autre. Souris : glisser la barre ; double-clic : le partage de départ (58 / 42). Clavier : flèches gauche
 * et droite (32 px), Début et Fin (jusqu'au bord). La liste garde 380 px au moins et la carte 360 (recherche-ordinateur.css).
 * La barre est rangée dans la page (.search-layout), entre la liste et la carte ; le partage est posé sur cette page en
 * deux variables (--search-list et --search-map), sans redessiner la page. Il est gardé dans l'onglet (sessionStorage),
 * pour le retrouver en revenant d'une annonce. Rien n'est envoyé au serveur.
 */

const KEY = 'nidalo.recherche.liste';
/** Part de la liste au départ, en % de la largeur (comme recherche-ordinateur.css). */
const DEFAULT_SHARE = 58;
const LIST_MIN = 380;
const MAP_MIN = 360;
const KEY_STEP = 32;

function readShare(): number | null {
  try {
    const value = Number(sessionStorage.getItem(KEY));
    return Number.isFinite(value) && value > 0 && value < 100 ? value : null;
  } catch {
    return null;
  }
}

function writeShare(share: number | null) {
  try {
    if (share === null) sessionStorage.removeItem(KEY);
    else sessionStorage.setItem(KEY, share.toFixed(2));
  } catch {
    // Stockage refusé (navigation privée…) : le partage vaut pour cette page seulement.
  }
}

/** La part de la liste (en %) ramenée entre ses bornes pour cette largeur : liste de 380 px et carte de 360 au moins. */
function clamp(share: number, width: number): number {
  const min = (LIST_MIN / width) * 100;
  const max = 100 - (MAP_MIN / width) * 100;
  return Math.min(Math.max(share, min), max);
}

export function SearchSplit() {
  const self = useRef<HTMLDivElement>(null);
  /** La page qui contient la barre (.search-layout), sur laquelle le partage est posé. */
  const page = () => self.current?.parentElement ?? null;
  const [share, setShare] = useState<number | null>(readShare);
  const current = useRef(share);
  current.current = share;
  const drag = useRef<{ left: number; width: number } | null>(null);

  useLayoutEffect(() => {
    const el = page();
    if (!el) return;
    if (share === null) {
      el.style.removeProperty('--search-list');
      el.style.removeProperty('--search-map');
    } else {
      el.style.setProperty('--search-list', `${share}fr`);
      el.style.setProperty('--search-map', `${100 - share}fr`);
    }
  }, [share]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sous 1024 px, la barre disparaît : la page reprend sa mise en page du téléphone, sans rien de la barre.
  useLayoutEffect(() => {
    const el = page();
    return () => {
      el?.style.removeProperty('--search-list');
      el?.style.removeProperty('--search-map');
      el?.classList.remove('is-resizing');
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const finish = () => {
    if (!drag.current) return;
    drag.current = null;
    page()?.classList.remove('is-resizing');
    writeShare(current.current);
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    const el = page();
    if (!el || event.button !== 0) return;
    event.preventDefault();
    const box = el.getBoundingClientRect();
    drag.current = { left: box.left, width: box.width };
    event.currentTarget.setPointerCapture(event.pointerId);
    el.classList.add('is-resizing');
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const box = drag.current;
    if (!box) return;
    setShare(clamp(((event.clientX - box.left) / box.width) * 100, box.width));
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const el = page();
    if (!el) return;
    const width = el.getBoundingClientRect().width;
    const now = share ?? DEFAULT_SHARE;
    const step = (KEY_STEP / width) * 100;
    const target = { ArrowLeft: now - step, ArrowRight: now + step, Home: 0, End: 100 }[event.key];
    if (target === undefined) return;
    event.preventDefault();
    const next = clamp(target, width);
    setShare(next);
    writeShare(next);
  };

  const reset = () => {
    setShare(null);
    writeShare(null);
  };

  const listPercent = Math.round(share ?? DEFAULT_SHARE);
  return (
    <div
      ref={self}
      className="search-split"
      role="separator"
      aria-orientation="vertical"
      aria-controls="search-list"
      aria-label="Largeur de la liste et de la carte"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={listPercent}
      aria-valuetext={`Liste ${listPercent} %, carte ${100 - listPercent} %`}
      title="Faites glisser pour agrandir la liste ou la carte"
      tabIndex={0}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={finish}
      onPointerCancel={finish}
      onLostPointerCapture={finish}
      onDoubleClick={reset}
      onKeyDown={onKeyDown}
    />
  );
}
