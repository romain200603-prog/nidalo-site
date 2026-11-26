import { useCallback, useEffect, useState } from 'react';
import { Icon } from '../../components/Icon';
import { OfflineState } from '../../components/OfflineState';
import { CONTACT_EMAIL } from '../../lib/config';
import { accountPath, PATHS } from '../../lib/paths';
import { ScreenHeader, Spinner } from './parts';

// Un texte légal ouvert depuis « Informations légales » (LegalPageView, Features/Legal/LegalPages.swift), dans Mon
// compte : retour vers la liste, grand titre, date, sommaire numéroté, une carte par section numérotée, « Une question
// sur ce texte ? », « Autres textes » et « Revenir au sommaire ». Le texte est celui de la page du site (/conditions/,
// /confidentialite/, /mentions-legales/), lu sur le site même, comme la feuille de l'écran de connexion (LegalSheet) ;
// les pages restent ouvertes à tous, en bas de chaque page du site.

export type LegalTextKey = 'conditions' | 'confidentialite' | 'mentions';

/** Dans l'ordre de l'app : conditions, confidentialité, mentions légales. */
export const LEGAL_TEXTS: LegalTextKey[] = ['conditions', 'confidentialite', 'mentions'];

export const LEGAL_TITLES: Record<LegalTextKey, string> = {
  conditions: 'Conditions d’utilisation',
  confidentialite: 'Politique de confidentialité',
  mentions: 'Mentions légales',
};

/** Titre de l'en-tête (shortTitle de l'app). */
const SHORT_TITLES: Record<LegalTextKey, string> = {
  conditions: 'Conditions',
  confidentialite: 'Confidentialité',
  mentions: 'Mentions légales',
};

const PAGE_PATHS: Record<LegalTextKey, string> = {
  conditions: PATHS.terms,
  confidentialite: PATHS.privacy,
  mentions: PATHS.legal,
};

/** Version et entrée en vigueur des conditions (LegalInfo.termsVersion, termsEffectiveDate). */
const TERMS_VERSION = 'Version 1.0 · entrée en vigueur : dès sa publication';

export function legalTextKey(value: string | null): LegalTextKey | null {
  return LEGAL_TEXTS.find((key) => key === value) ?? null;
}

type LegalDocument = { title: string; updated: string | null; lead: string | null; sections: { title: string; html: string }[] };

const read = new Map<LegalTextKey, LegalDocument>();

/**
 * Le texte de la page, en sections : sans rien d'actif (ni script, ni cadre, ni attribut d'événement) ; ses liens vers
 * les autres textes s'ouvrent dans Mon compte.
 */
async function legalDocument(key: LegalTextKey): Promise<LegalDocument> {
  const known = read.get(key);
  if (known) return known;
  const response = await fetch(PAGE_PATHS[key], { credentials: 'same-origin', headers: { accept: 'text/html' } });
  if (!response.ok) throw new Error(`Page illisible (${response.status})`);
  const parsed = new DOMParser().parseFromString(await response.text(), 'text/html');
  const article = parsed.querySelector('article.doc');
  if (!article) throw new Error('Page sans texte');
  article.querySelectorAll('script, style, iframe, object, embed, form, link, meta, .noscript').forEach((node) => node.remove());
  for (const element of article.querySelectorAll('*')) {
    for (const attribute of [...element.attributes]) {
      if (attribute.name.startsWith('on') || (attribute.name === 'href' && /^\s*javascript:/i.test(attribute.value))) element.removeAttribute(attribute.name);
    }
  }
  for (const link of article.querySelectorAll('a[href]')) {
    const target = LEGAL_TEXTS.find((other) => link.getAttribute('href') === PAGE_PATHS[other]);
    if (target) link.setAttribute('href', accountPath('legal', { texte: target }));
  }
  const sections = [...article.querySelectorAll('section')].map((section) => {
    const heading = section.querySelector('h2');
    const title = heading?.textContent?.trim() ?? '';
    heading?.remove();
    return { title, html: section.innerHTML.trim() };
  }).filter((section) => section.title !== '' || section.html !== '');
  const result: LegalDocument = {
    title: article.querySelector('h1')?.textContent?.trim() || LEGAL_TITLES[key],
    updated: article.querySelector('.updated')?.textContent?.trim() || null,
    lead: article.querySelector('.lead')?.textContent?.trim() || null,
    sections,
  };
  read.set(key, result);
  return result;
}

/** Fait défiler jusqu'à l'élément et y met le focus (le sommaire, ou une section). */
function reveal(id: string) {
  const target = document.getElementById(id);
  if (!target) return;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  target.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
  target.focus({ preventScroll: true });
}

export function LegalTextScreen({ text }: { text: LegalTextKey }) {
  const [doc, setDoc] = useState<LegalDocument | 'loading' | 'failed'>(() => read.get(text) ?? 'loading');

  const load = useCallback(() => {
    setDoc(read.get(text) ?? 'loading');
    legalDocument(text).then(setDoc, () => setDoc('failed'));
  }, [text]);
  useEffect(load, [load]);

  const others = LEGAL_TEXTS.filter((other) => other !== text);
  return (
    <div className="space legal-text-screen">
      <ScreenHeader title={SHORT_TITLES[text]} back={accountPath('legal')} />
      {doc === 'loading' ? <Spinner /> : doc === 'failed' ? <OfflineState onRetry={load} /> : (
        <>
          <div id="legal-haut" className="legal-text-head" tabIndex={-1}>
            <h2>{doc.title}</h2>
            {doc.updated && <p>{doc.updated}</p>}
            {text === 'conditions' && <p>{TERMS_VERSION}</p>}
          </div>
          {doc.lead && <p className="legal-text-lead">{doc.lead}</p>}
          {doc.sections.length > 0 && (
            <nav className="legal-toc app-card" aria-labelledby="legal-sommaire">
              <p id="legal-sommaire" className="legal-card-title">Sommaire</p>
              <ol>
                {doc.sections.map((section, index) => (
                  <li key={section.title || index}>
                    <button type="button" onClick={() => reveal(`legal-section-${index + 1}`)}>
                      <span className="legal-toc-number">{index + 1}.</span>
                      <span>{section.title}</span>
                    </button>
                  </li>
                ))}
              </ol>
            </nav>
          )}
          {doc.sections.map((section, index) => (
            <section key={section.title || index} className="legal-section app-card" aria-labelledby={`legal-section-${index + 1}`}>
              <h3 id={`legal-section-${index + 1}`} tabIndex={-1}>{index + 1}. {section.title}</h3>
              <div className="legal-section-body" dangerouslySetInnerHTML={{ __html: section.html }} />
            </section>
          ))}
          <div className="legal-contact app-card">
            <p className="legal-card-title">Une question sur ce texte ?</p>
            <a className="app-button app-button-primary" href={`mailto:${CONTACT_EMAIL}`}><Icon name="mail" />Écrire à l&apos;éditeur</a>
            <p className="legal-contact-email">{CONTACT_EMAIL}</p>
          </div>
          <nav className="legal-others app-card" aria-labelledby="legal-autres">
            <p id="legal-autres" className="legal-card-title">Autres textes</p>
            {others.map((other) => (
              <a key={other} href={accountPath('legal', { texte: other })}>
                <span>{LEGAL_TITLES[other]}</span>
                <Icon name="chevronRight" />
              </a>
            ))}
          </nav>
          <button type="button" className="app-button app-button-secondary" onClick={() => reveal('legal-haut')}>
            <Icon name="arrowUp" />Revenir au sommaire
          </button>
        </>
      )}
    </div>
  );
}
