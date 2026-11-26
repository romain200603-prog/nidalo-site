import { useId, useRef, type ReactNode } from 'react';
import { useSheetDrag } from '../../components/useSheetDrag';
import { Modal } from './Dialogs';

// Feuille de la fiche (domiaSheet de l'app avec sa barre de navigation : titre de 17 centré, « Annuler » à gauche),
// pour « Signaler l'annonce », ou sans barre quand l'écran a son propre en-tête (« Faire une offre »). Sous 1024 px, elle monte du bas sur
// presque toute la hauteur et se referme en la tirant vers le bas par son en-tête ; sur ordinateur, au centre.

export function ListingSheet({ open, onClose, title, cancelLabel = 'Annuler', className, head, children }: {
  open: boolean;
  onClose: () => void;
  title: string;
  /** Bouton de gauche ; `null` : aucun (la feuille a sa propre croix, `head`). */
  cancelLabel?: string | null;
  className?: string;
  /**
   * En-tête propre à la feuille, à la place du titre centré ; `null` : aucun, le contenu a le sien (marqué
   * data-sheet-grab pour tirer la feuille), et `title` nomme la feuille pour les lecteurs d'écran.
   */
  head?: ReactNode;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <Modal open={open} onClose={onClose} className={`listing-sheet${className ? ` ${className}` : ''}`}
      labelledBy={head === null ? undefined : `${id}-titre`} label={head === null ? title : undefined}>
      <SheetBody titleId={`${id}-titre`} title={title} cancelLabel={cancelLabel} onClose={onClose} head={head}>
        {children}
      </SheetBody>
    </Modal>
  );
}

function SheetBody({ titleId, title, cancelLabel, onClose, head, children }: {
  titleId: string;
  title: string;
  cancelLabel: string | null;
  onClose: () => void;
  head?: ReactNode;
  children: ReactNode;
}) {
  const root = useRef<HTMLDivElement>(null);
  useSheetDrag(root, onClose, true);
  return (
    <div ref={root} className="sheet-body">
      {head === null ? (
        <div className="sheet-grab-bar" data-sheet-grab=""><span className="sheet-grabber" aria-hidden="true" /></div>
      ) : head ? (
        <div className="sheet-custom-head" data-sheet-grab="">
          <span className="sheet-grabber" aria-hidden="true" />
          {head}
        </div>
      ) : (
        <header className="sheet-head" data-sheet-grab="">
          <span className="sheet-grabber" aria-hidden="true" />
          {cancelLabel && <button type="button" className="sheet-cancel" onClick={onClose}>{cancelLabel}</button>}
          <h2 id={titleId}>{title}</h2>
        </header>
      )}
      <div className="sheet-scroll">{children}</div>
    </div>
  );
}
