import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { requireAccount } from '../../lib/account/gate';
import { currentUserId, useSession } from '../../lib/account/session';
import type { SearchMode } from '../../lib/labels';
import { openListingConversation, type ListingConversation } from '../../lib/listing/conversation';
import { canMakeOffer } from '../../lib/listing/offers';
import type { Profitability } from '../../lib/listing/profitability';
import type { ListingRow, PhotoRow } from '../../lib/listings';
import { conversationPath, listingPath, listingScreenFromParams, wantsVideoVisit, type ListingScreen } from '../../lib/paths';
import { OfferScreen } from './OfferScreen';
import { useListingAccount } from './useListingAccount';
import { VisitRequestScreen } from './VisitRequestScreen';

// Actions de la fiche qui demandent un compte (ListingDetailView.swift), communes à l'ordinateur (DesktopListing) et
// au téléphone (ListingView) : « Envoyer un message » ouvre (ou crée) la conversation avec le vendeur dans Messages ;
// « Demander une visite » et « Faire une offre » ont leur propre adresse (&vue=visite, &vue=offre). Sans compte, la
// connexion d'abord ; sa propre annonce n'en a pas.

const sameId = (a: string | null | undefined, b: string | null | undefined) => !!a && !!b && a.toLowerCase() === b.toLowerCase();

/** Ce que l'écran ouvert montre du bien : la photo et le destinataire (visite), la rentabilité (offre). */
export type ScreenDetails = { photo: PhotoRow | undefined; recipientName: string; profitability: Profitability | null };

export function useListingScreens(row: ListingRow, mode: SearchMode | null) {
  const session = useSession();
  const me = session.status === 'signedIn' ? session.userId : null;
  // Sans compte, aucune annonce n'est « la mienne » (isOwnListing de l'app).
  const isOwn = sameId(row.owner_id, me);
  const { account, refreshOffers, refreshConversations, addRequest } = useListingAccount(isOwn ? null : me);
  const [opening, setOpening] = useState(false);

  // ——— Écrans « Demander une visite » et « Faire une offre » (adresse de la fiche avec &vue=…) ———
  const [screen, setScreen] = useState<ListingScreen | null>(() => listingScreenFromParams(new URLSearchParams(window.location.search)));
  const [offerConversation, setOfferConversation] = useState<ListingConversation | null>(null);
  const screenRef = useRef(screen);
  /** L'écran a été ouvert depuis la fiche : « Fermer » revient en arrière dans l'historique. */
  const pushed = useRef(false);
  /** Position de la fiche quand un écran s'ouvre, retrouvée en le fermant. */
  const listingScroll = useRef(0);
  const resolving = useRef(false);
  const offersRef = useRef(account.offers);
  offersRef.current = account.offers;

  const setView = useCallback((next: ListingScreen | null) => {
    if (screenRef.current === null && next !== null) listingScroll.current = window.scrollY;
    screenRef.current = next;
    setScreen(next);
  }, []);

  const go = useCallback((next: ListingScreen | null, how: 'push' | 'replace') => {
    const url = listingPath(row.id, mode, next);
    if (how === 'push') {
      window.history.pushState(null, '', url);
      pushed.current = true;
    } else {
      window.history.replaceState(null, '', url);
    }
    setView(next);
  }, [row.id, mode, setView]);

  const close = useCallback(() => {
    if (pushed.current) {
      pushed.current = false;
      window.history.back();
      return;
    }
    go(null, 'replace');
  }, [go]);

  useEffect(() => {
    const onPop = () => {
      pushed.current = false;
      const next = listingScreenFromParams(new URLSearchParams(window.location.search));
      // Revenir sur « Faire une offre » relit la conversation : une offre envoyée entre-temps l'interdit.
      if (next === 'offre') setOfferConversation(null);
      setView(next);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [setView]);

  /**
   * « Faire une offre » (makeOffer de l'app) : la conversation de l'annonce (créée au besoin), puis la feuille d'offre ;
   * une offre déjà en attente ou acceptée ouvre la conversation, qui la montre.
   */
  const resolveOffer = useCallback(async (how: 'push' | 'replace') => {
    const userId = currentUserId();
    if (resolving.current) return;
    if (!userId || sameId(row.owner_id, userId) || row.transaction !== 'sale') {
      if (how === 'replace') go(null, 'replace');
      return;
    }
    resolving.current = true;
    setOpening(true);
    try {
      const conversation = await openListingConversation(row.id, userId);
      if (!conversation) {
        if (how === 'replace') go(null, 'replace');
        return;
      }
      // Les offres du compte, relues pour ne pas proposer une offre déjà en attente.
      const offers = (await refreshOffers()) ?? offersRef.current;
      if (canMakeOffer(conversation, offers, new Date())) {
        setOfferConversation(conversation);
        go('offre', how);
      } else {
        window.location.assign(conversationPath(conversation.id));
      }
    } finally {
      resolving.current = false;
      setOpening(false);
    }
  }, [row.id, row.owner_id, row.transaction, go, refreshOffers]);

  const showVisitForm = useCallback(() => {
    if (sameId(row.owner_id, currentUserId())) return;
    go('visite', 'push');
  }, [row.owner_id, go]);

  /** « Demander une visite » : connexion d'abord si besoin, puis le formulaire. */
  const requestVisit = () => void requireAccount(showVisitForm);
  const makeOffer = () => void requireAccount(() => void resolveOffer('push'));

  /** « Envoyer un message » : ouvre (ou crée) la conversation avec le vendeur, dans Messages. */
  const contactSeller = () => void requireAccount(() => {
    const userId = currentUserId();
    if (!userId || sameId(row.owner_id, userId)) return;
    setOpening(true);
    void openListingConversation(row.id, userId).then((conversation) => {
      if (conversation) window.location.assign(conversationPath(conversation.id));
      else setOpening(false);
    });
  });

  // Adresse d'un écran ouverte directement : sans compte, la connexion d'abord ; sa propre annonce (ou une location
  // pour l'offre) revient à la fiche ; « Faire une offre » retrouve d'abord la conversation.
  useEffect(() => {
    if (screen === null || session.status === 'loading') return;
    if (session.status === 'signedOut') {
      const wanted = screen;
      go(null, 'replace');
      void requireAccount(() => (wanted === 'visite' ? showVisitForm() : void resolveOffer('push')));
      return;
    }
    if (isOwn || (screen === 'offre' && row.transaction !== 'sale')) {
      go(null, 'replace');
      return;
    }
    if (screen === 'offre' && !offerConversation) void resolveOffer('replace');
  }, [screen, session.status, isOwn, offerConversation, row.transaction, go, resolveOffer, showVisitForm]);

  // Un autre compte : la feuille d'offre est relue pour lui.
  useEffect(() => { setOfferConversation(null); }, [me]);

  const shown: ListingScreen | null = me && !isOwn
    ? (screen === 'visite' ? 'visite' : screen === 'offre' && offerConversation ? 'offre' : null)
    : null;

  const firstLayout = useRef(true);
  useLayoutEffect(() => {
    if (firstLayout.current) {
      firstLayout.current = false;
      return;
    }
    window.scrollTo(0, shown ? 0 : listingScroll.current);
    // L'écran ouvert reçoit le focus sur son titre, sauf si un de ses champs l'a déjà (le montant de l'offre).
    const opened = shown ? document.querySelector<HTMLElement>('.dl-screen') : null;
    if (opened && !opened.contains(document.activeElement)) opened.querySelector<HTMLElement>('h1')?.focus({ preventScroll: true });
  }, [shown]);

  useEffect(() => {
    document.title = shown === 'visite' ? `Demander une visite · ${row.title} · Nidalo`
      : shown === 'offre' ? `Faire une offre · ${row.title} · Nidalo`
        : `${row.title} à ${row.city} · Nidalo`;
  }, [row, shown]);

  /** L'écran ouvert (formulaire de visite ou feuille d'offre), sinon null. */
  const renderScreen = ({ photo, recipientName, profitability }: ScreenDetails): ReactNode => {
    if (shown === 'visite') {
      return (
        <VisitRequestScreen
          row={row}
          photo={photo}
          recipientName={recipientName}
          initialMode={wantsVideoVisit(new URLSearchParams(window.location.search)) ? 'video' : 'onSite'}
          onClose={close}
          onSent={addRequest}
        />
      );
    }
    if (shown === 'offre' && offerConversation) {
      return (
        <OfferScreen
          conversationId={offerConversation.id}
          title={offerConversation.title ?? row.title}
          price={offerConversation.price ?? Number(row.price)}
          profitability={profitability}
          onClose={close}
          onSent={async () => {
            // Comme l'app (ListingDetailView.swift:165-176) : offres et conversations relues, puis la conversation de
            // l'offre s'ouvre dans Messages ; « Retour » ramène à la fiche, qui montre « Offre en attente ».
            await Promise.all([refreshOffers(), refreshConversations()]);
            window.location.replace(conversationPath(offerConversation.id));
          }}
        />
      );
    }
    return null;
  };

  return { session, me, isOwn, account, opening, shown, renderScreen, requestVisit, makeOffer, contactSeller };
}
