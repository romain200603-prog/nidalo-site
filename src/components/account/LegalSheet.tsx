import { useEffect, useRef, useState, type MouseEvent } from 'react';
import { PageHeader } from '../PageHeader';
import { useSheetDrag } from '../useSheetDrag';
import { Modal } from '../../pages/listing/Dialogs';
import { PATHS } from '../../lib/paths';

// Conditions et confidentialité par-dessus l'écran de connexion, sans quitter l'étape (AuthView : domiaSheet de
// LegalPageView, avec son en-tête « Conditions » ou « Confidentialité » et son retour qui ferme). Le texte est celui des
// pages /conditions/ et /confidentialite/ du site, lu sur le site même (même origine) ; s'il ne peut pas être lu, le
// lien s'ouvre comme avant.

export type LegalPage = 'terms' | 'privacy';

const PAGES: Record<LegalPage, { href: string; title: string; shortTitle: string }> = {
  terms: { href: PATHS.terms, title: 'Conditions d’utilisation', shortTitle: 'Conditions' },
  privacy: { href: PATHS.privacy, title: 'Politique de confidentialité', shortTitle: 'Confidentialité' },
};

/** Pages déjà lues pendant la visite : la feuille se rouvre aussitôt. */
const loaded = new Map<LegalPage, string>();

/** Le texte de la page (son article), sans rien d'actif : ni script, ni cadre, ni attribut d'événement. */
async function legalArticle(page: LegalPage): Promise<string> {
  const known = loaded.get(page);
  if (known !== undefined) return known;
  const response = await fetch(PAGES[page].href, { credentials: 'same-origin', headers: { accept: 'text/html' } });
  if (!response.ok) throw new Error(`Page illisible (${response.status})`);
  const parsed = new DOMParser().parseFromString(await response.text(), 'text/html');
  const article = parsed.querySelector('article.doc');
  if (!article) throw new Error('Page sans texte');
  article.querySelectorAll('script, style, iframe, object, embed, form, link, meta').forEach((node) => node.remove());
  for (const element of article.querySelectorAll('*')) {
    for (const attribute of [...element.attributes]) {
      if (attribute.name.startsWith('on') || (attribute.name === 'href' && /^\s*javascript:/i.test(attribute.value))) element.removeAttribute(attribute.name);
    }
  }
  const html = article.innerHTML;
  loaded.set(page, html);
  return html;
}

/** Un lien vers une page légale : un simple clic ouvre la feuille ; Ctrl, ⌘, Maj ou un clic du milieu : le lien. */
export function openLegalOnClick(event: MouseEvent<HTMLAnchorElement>, page: LegalPage, open: (page: LegalPage) => void) {
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  open(page);
}

function LegalSheetContent({ page, onClose }: { page: LegalPage; onClose: () => void }) {
  const head = useRef<HTMLDivElement>(null);
  const [html, setHtml] = useState<string | null>(() => loaded.get(page) ?? null);
  useSheetDrag(head, onClose, true);
  useEffect(() => {
    let cancelled = false;
    legalArticle(page).then(
      (text) => { if (!cancelled) setHtml(text); },
      // Texte non lu (pas de connexion…) : la page elle-même, comme le lien d'avant.
      () => { if (!cancelled) window.location.assign(PAGES[page].href); },
    );
    return () => { cancelled = true; };
  }, [page]);
  return (
    <div className="legal-sheet-body">
      <div ref={head} className="legal-sheet-head" data-sheet-grab="">
        <span className="legal-sheet-grabber" aria-hidden="true" />
        <PageHeader title={PAGES[page].shortTitle} onBack={onClose} decorative />
      </div>
      <div className="legal-sheet-scroll">
        {html === null ? (
          <div className="legal-sheet-loading"><span className="spinner" role="status" aria-label="Chargement" /></div>
        ) : (
          <div className="doc legal-sheet-doc" dangerouslySetInnerHTML={{ __html: html }} />
        )}
      </div>
    </div>
  );
}

/** Feuille de la page légale `page` (fermée sans page). */
export function LegalSheet({ page, onClose }: { page: LegalPage | null; onClose: () => void }) {
  return (
    <Modal open={page !== null} onClose={onClose} className="legal-sheet" label={page ? PAGES[page].title : undefined}>
      {page && <LegalSheetContent page={page} onClose={onClose} />}
    </Modal>
  );
}
