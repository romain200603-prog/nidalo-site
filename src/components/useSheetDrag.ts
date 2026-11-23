import { useEffect, useRef, type RefObject } from 'react';
import { DESKTOP_QUERY } from '../lib/desktop';

// Feuille du bas qu'on tire vers le bas pour la fermer, comme une feuille de l'app (presentationDragIndicator) :
// sous 1024 px, un glissement vers le bas qui part du haut de la feuille (sa poignée, son en-tête : les éléments
// marqués data-sheet-grab, hors boutons et champs) la fait suivre le doigt ; lâchée au-delà du quart de sa hauteur,
// ou d'un geste rapide, elle se ferme, sinon elle revient en place. Sur ordinateur, la fenêtre reste au centre et ne
// bouge pas. `enabled` faux (une alerte, interactiveDismissDisabled de l'app) : rien ne bouge.

const INTERACTIVE = 'button, a, input, textarea, select, label, [role="slider"], [contenteditable="true"]';

/** `anchor` : un élément dans la feuille ; la feuille est le <dialog> qui le contient. */
export function useSheetDrag(anchor: RefObject<HTMLElement | null>, onDismiss: () => void, enabled: boolean) {
  const dismiss = useRef(onDismiss);
  useEffect(() => { dismiss.current = onDismiss; });

  useEffect(() => {
    const sheet = anchor.current?.closest('dialog') ?? null;
    if (!sheet || !enabled) return undefined;
    let drag: { id: number; y: number; time: number; offset: number; moving: boolean } | null = null;

    const reset = () => {
      sheet.style.removeProperty('translate');
      sheet.style.removeProperty('transition');
    };
    const down = (event: PointerEvent) => {
      if (window.matchMedia(DESKTOP_QUERY).matches || event.button !== 0) return;
      const target = event.target instanceof Element ? event.target : null;
      if (!target?.closest('[data-sheet-grab]') || target.closest(INTERACTIVE)) return;
      drag = { id: event.pointerId, y: event.clientY, time: event.timeStamp, offset: 0, moving: false };
    };
    const move = (event: PointerEvent) => {
      if (!drag || event.pointerId !== drag.id) return;
      const offset = Math.max(0, event.clientY - drag.y);
      if (!drag.moving) {
        if (offset < 4) return;
        drag.moving = true;
        sheet.setPointerCapture(event.pointerId);
        sheet.style.transition = 'none';
      }
      drag.offset = offset;
      sheet.style.translate = `0 ${offset}px`;
    };
    const up = (event: PointerEvent) => {
      if (!drag || event.pointerId !== drag.id) return;
      const { offset, moving, time } = drag;
      drag = null;
      if (!moving) return;
      // Le clic qui suit un glissement (visé sur la feuille, qui a gardé le pointeur) ne doit rien fermer ni toucher.
      const swallow = (click: MouseEvent) => { click.stopPropagation(); click.preventDefault(); };
      sheet.addEventListener('click', swallow, { capture: true, once: true });
      window.setTimeout(() => sheet.removeEventListener('click', swallow, { capture: true }), 0);
      const speed = offset / Math.max(1, event.timeStamp - time);
      const close = event.type === 'pointerup' && (offset > sheet.getBoundingClientRect().height / 4 || (offset > 24 && speed > 0.6));
      // Retour en place (ou départ) avec la transition de la feuille.
      sheet.style.removeProperty('transition');
      if (close) {
        reset();
        dismiss.current();
      } else {
        sheet.style.removeProperty('translate');
      }
    };

    sheet.addEventListener('pointerdown', down);
    sheet.addEventListener('pointermove', move);
    sheet.addEventListener('pointerup', up);
    sheet.addEventListener('pointercancel', up);
    return () => {
      sheet.removeEventListener('pointerdown', down);
      sheet.removeEventListener('pointermove', move);
      sheet.removeEventListener('pointerup', up);
      sheet.removeEventListener('pointercancel', up);
      reset();
    };
  }, [anchor, enabled]);
}
