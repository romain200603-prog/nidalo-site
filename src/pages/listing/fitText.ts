import { useEffect, useLayoutEffect, useRef } from 'react';

// Comme `.lineLimit(1).minimumScaleFactor(…)` dans l'app : un texte d'une ligne trop long pour sa place rapetisse,
// jusqu'à la part écrite dans son attribut `data-fit` (de 0,7 à 0,85), avant d'être coupé par « … ».
// Tous les textes d'une carte sont remis à leur taille, mesurés ensemble, puis réduits d'un coup ; une seconde passe
// rattrape ce qui dépasse encore (les écarts fixes entre un montant et son unité). Un texte réduit ne change pas la
// largeur de la carte, donc rien ne boucle.

function fitTexts(root: HTMLElement) {
  const items = [...root.querySelectorAll<HTMLElement>('[data-fit]')];
  for (const item of items) item.style.removeProperty('font-size');
  const sizes = items.map((item) => parseFloat(getComputedStyle(item).fontSize));
  const scales = items.map(() => 1);
  for (let pass = 0; pass < 2; pass += 1) {
    const next = items.map((item, index) => {
      if (item.scrollWidth <= item.clientWidth) return scales[index];
      const smallest = Number(item.dataset.fit) || 1;
      return Math.max(smallest, Math.floor(scales[index] * (item.clientWidth / item.scrollWidth) * 100) / 100);
    });
    let changed = false;
    items.forEach((item, index) => {
      if (next[index] === scales[index]) return;
      scales[index] = next[index];
      item.style.fontSize = `${sizes[index] * next[index]}px`;
      changed = true;
    });
    if (!changed) break;
  }
}

/** Ref à poser sur la carte : ses textes `data-fit` s'ajustent à chaque rendu et quand la carte change de largeur. */
export function useFitTexts<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  useLayoutEffect(() => {
    if (ref.current) fitTexts(ref.current);
  });
  useEffect(() => {
    const root = ref.current;
    if (!root || typeof ResizeObserver === 'undefined') return;
    let width = root.clientWidth;
    const observer = new ResizeObserver(() => {
      if (root.clientWidth === width) return;
      width = root.clientWidth;
      fitTexts(root);
    });
    observer.observe(root);
    return () => observer.disconnect();
  }, []);
  return ref;
}
