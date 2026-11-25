import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { requireAccount } from '../../lib/account/gate';
import { currentUserId, useSession } from '../../lib/account/session';
import type { SearchMode } from '../../lib/labels';
import {
  CONVERSATION_ERROR_TITLE, conversationErrorMessage, startListingConversation, type ListingConversation,
} from '../../lib/listing/conversation';
import { canMakeOffer } from '../../lib/listing/offers';
import type { Profitability } from '../../lib/listing/profitability';
import type { Publisher } from '../../lib/listing/publisher';
import type { ListingRow, PhotoRow } from '../../lib/listings';
import { isDesktop } from '../../lib/desktop';
import { conversationPath, listingPath, listingScreenFromParams, wantsVideoVisit, type ListingScreen } from '../../lib/paths';
import { AlertDialog } from './Dialogs';
import { OfferScreen } from './OfferScreen';
import { ProfileScreen } from './ProfileScreen';
import { useListingAccount } from './useListingAccount';
import { VisitRequestScreen } from './VisitRequestScreen';

// Actions de la fiche qui demandent un compte (ListingDetailView.swift), communes à l'ordinateur (DesktopListing) et
// au téléphone (ListingView) : « Envoyer un message » ouvre (ou crée) la conversation avec le vendeur dans Messages ;
// « Demander une visite » et « Faire une offre » ont leur propre adresse (&vue=visite, &vue=offre). Sans compte, la
// connexion d'abord ; sa propre annonce n'en a pas. Si la conversation ne s'ouvre pas (message, offre), la fenêtre
// « Impossible d'ouvrir la conversation » (n° 68), commune aux deux tailles. Le profil du vendeur ou de l'agence
// (« Voir le profil ») a aussi son adresse (&vue=profil), sans compte.

const sameId = (a: string | null | undefined, b: string | null | undefined) => !!a && !!b && a.toLowerCase() === b.toLowerCase();

/** Écrans ouverts depuis la fiche : ceux de lib/paths, et le profil public de l'interlocuteur. */
type Screen = ListingScreen | 'profil';

function screenFromParams(params: URLSearchParams): Screen | null {
  return params.get('vue') === 'profil' ? 'profil' : listingScreenFromParams(params);
}

/** Ce que l'écran ouvert montre du bien : la photo et le destinataire (visite), la rentabilité (offre), le profil. */
export type ScreenDetails = { photo: PhotoRow | undefined; recipientName: string; profitability: Profitability | null; publisher?: Publisher | null };

export function useListingScreens(row: ListingRow, mode: SearchMode | null) {
  const session = useSession();
  const me = session.status === 'signedIn' ? session.userId : null;
  // Sans compte, aucune annonce n'est « la mienne » (isOwnListing de l'app).
  const isOwn = sameId(row.owner_id, me);
  const { account, refreshOffers, refreshConversations, addRequest } = useListingAccount(isOwn ? null : me);
  const [opening, setOpening] = useState(false);
  /** Texte de la fenêtre « Impossible d'ouvrir la conversation », ou `null`. */
  const [conversationError, setConversationError] = useState<string | null>(null);
  const contacting = useRef(false);

  // ——— Écrans « Demander une visite » et « Faire une offre » (adresse de la fiche avec &vue=…) ———
  const [screen, setScreen] = useState<Screen | null>(() => screenFromParams(new URLSearchParams(window.location.search)));
  const [offerConversation, setOfferConversation] = useState<ListingConversation | null>(null);
  const screenRef = useRef(screen);
  /** L'écran a été ouvert depuis la fiche : « Fermer » revient en arrière dans l'historique. */
  const pushed = useRef(false);
  /** Position de la fiche quand un écran s'ouvre, retrouvée en le fermant. */
  const listingScroll = useRef(0);
  const resolving = useRef(false);
  const offersRef = useRef(account.offers);
  offersRef.current = account.offers;

  const setView = useCallback((next: Screen | null) => {
    if (screenRef.current === null && next !== null) listingScroll.current = window.scrollY;
    screenRef.current = next;
    setScreen(next);
  }, []);

  const go = useCallback((next: Screen | null, how: 'push' | 'replace') => {
    const url = next === 'profil' ? `${listingPath(row.id, mode)}&vue=profil` : listingPath(row.id, mode, next);
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
      const next = screenFromParams(new URLSearchParams(window.location.search));
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
      let conversation: ListingConversation;
      try {
        conversation = await startListingConversation(row.id, userId);
      } catch (error) {
        if (how === 'replace') go(null, 'replace');
        setConversationError(conversationErrorMessage(error));
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
  /** « Voir le profil » ou « Voir l'agence » : le profil public, sans compte. */
  const openProfile = () => go('profil', 'push');

  /**
   * « Envoyer un message » : ouvre (ou crée) la conversation avec le vendeur, dans Messages. Une seule ouverture à la
   * fois (le bouton reste actif pour son animation, comme dans l'app).
   */
  const contactSeller = () => void requireAccount(() => {
    const userId = currentUserId();
    if (!userId || sameId(row.owner_id, userId) || contacting.current) return;
    contacting.current = true;
    setOpening(true);
    startListingConversation(row.id, userId).then(
      (conversation) => window.location.assign(conversationPath(conversation.id)),
      (error) => {
        contacting.current = false;
        setOpening(false);
        setConversationError(conversationErrorMessage(error));
      },
    );
  });

  // Adresse d'un écran ouverte directement : sans compte, la connexion d'abord ; sa propre annonce (ou une location
  // pour l'offre) revient à la fiche ; « Faire une offre » retrouve d'abord la conversation.
  useEffect(() => {
    if (screen === null || screen === 'profil' || session.status === 'loading') return;
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

  // Retour depuis Messages sur la fiche gardée par le navigateur : la conversation est ouverte, plus rien n'attend
  // (comme la fiche de l'app quand on revient de la conversation).
  useEffect(() => {
    const onShow = (event: PageTransitionEvent) => {
      if (!event.persisted) return;
      contacting.current = false;
      setOpening(false);
    };
    window.addEventListener('pageshow', onShow);
    return () => window.removeEventListener('pageshow', onShow);
  }, []);

  const shown: Screen | null = screen === 'profil' ? 'profil' : me && !isOwn
    ? (screen === 'visite' ? 'visite' : screen === 'offre' && offerConversation ? 'offre' : null)
    : null;

  const firstLayout = useRef(true);
  useLayoutEffect(() => {
    if (firstLayout.current) {
      firstLayout.current = false;
      return;
    }
    // « Faire une offre » sur téléphone : une feuille sur la fiche, qui reste où elle était.
    const sheet = shown === 'offre' && !isDesktop();
    if (!sheet) window.scrollTo(0, shown ? 0 : listingScroll.current);
    // L'écran ouvert reçoit le focus sur son titre (ou, sur téléphone, sur son retour rond, le premier élément de
    // l'écran poussé), sauf si un de ses champs l'a déjà (le montant de l'offre).
    const opened = shown ? document.querySelector<HTMLElement>('.dl-screen, .listing-profile') : null;
    if (opened && !opened.contains(document.activeElement)) {
      opened.querySelector<HTMLElement>('h1[tabindex], .app-page-header .app-round')?.focus({ preventScroll: true });
    }
  }, [shown]);

  useEffect(() => {
    document.title = shown === 'visite' ? `Demander une visite · ${row.title} · Nidalo`
      : shown === 'offre' ? `Faire une offre · ${row.title} · Nidalo`
        : shown === 'profil' ? `Profil · ${row.title} · Nidalo`
          : `${row.title} à ${row.city} · Nidalo`;
  }, [row, shown]);

  /** L'écran ouvert (formulaire de visite, feuille d'offre, profil), sinon null. */
  const renderScreen = ({ photo, recipientName, profitability, publisher }: ScreenDetails): ReactNode => {
    if (shown === 'profil') {
      // Profil encore en lecture (adresse ouverte directement) : la fiche d'abord, le profil dès qu'il est là.
      return publisher ? <ProfileScreen publisher={publisher} onClose={close} onContact={isOwn ? undefined : contactSeller} /> : null;
    }
    if (shown === 'visite') {
      const params = new URLSearchParams(window.location.search);
      // « Proposer une autre date » (écran « Demande de visite ») : la demande refusée, parmi celles du compte.
      const previousId = params.get('precedente');
      const previous = previousId ? account.requests.find((request) => sameId(request.id, previousId) && request.status === 'declined'
        && sameId(request.requester?.userId, me)) ?? null : null;
      return (
        <VisitRequestScreen
          row={row}
          photo={photo}
          recipientName={recipientName}
          initialMode={wantsVideoVisit(params) ? 'video' : 'onSite'}
          previous={previous}
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

  /** « Impossible d'ouvrir la conversation » : le message du serveur, ou celui de la connexion ; seul « OK » la ferme. */
  const conversationAlert = (
    <AlertDialog
      open={conversationError !== null}
      onClose={() => setConversationError(null)}
      dismissible={false}
      title={CONVERSATION_ERROR_TITLE}
      message={conversationError}
      actions={[{ label: 'OK', onClick: () => setConversationError(null), role: 'cancel' }]}
    />
  );

  return { session, me, isOwn, account, opening, shown, renderScreen, closeScreen: close, requestVisit, makeOffer, contactSeller, openProfile, conversationAlert };
}
