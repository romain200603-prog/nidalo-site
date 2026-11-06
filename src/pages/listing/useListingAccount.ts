import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchConversations, type InboxRow } from '../../lib/listing/conversation';
import { fetchOffers, type OfferRow } from '../../lib/listing/offers';
import { fetchAgenda, fetchVisitRequests, type AgendaVisit, type VisitRequestRow } from '../../lib/listing/visits';

// Ce que l'app sait déjà du compte quand elle ouvre la fiche d'un autre : ses conversations (MessagingStore), ses
// offres (OfferStore), son agenda (VisitStore) et ses demandes de visite (VisitRequestStore), lus à la connexion.
// Le site les lit en ouvrant la fiche sur ordinateur, puis au retour sur l'onglet (l'app : au retour au premier
// plan et en temps réel). Une lecture ratée laisse la liste vide : l'app n'affiche alors rien.

export type ListingAccount = {
  conversations: InboxRow[];
  offers: OfferRow[];
  visits: AgendaVisit[];
  requests: VisitRequestRow[];
};

const EMPTY: ListingAccount = { conversations: [], offers: [], visits: [], requests: [] };

/** `userId` : le compte connecté, ou `null` (sans compte, ou sa propre annonce : rien n'est lu). */
export function useListingAccount(userId: string | null) {
  const [account, setAccount] = useState<ListingAccount>(EMPTY);
  // Compte des lectures en cours : une réponse arrivée après un changement de compte est ignorée.
  const current = useRef(userId);
  current.current = userId;

  const read = useCallback(async <K extends keyof ListingAccount>(key: K, load: () => Promise<ListingAccount[K]>): Promise<ListingAccount[K] | null> => {
    const id = current.current;
    if (!id) return null;
    try {
      const value = await load();
      if (current.current === id) setAccount((previous) => ({ ...previous, [key]: value }));
      return value;
    } catch {
      return null;
    }
  }, []);

  const refreshOffers = useCallback(() => read('offers', fetchOffers), [read]);
  const refreshConversations = useCallback(() => read('conversations', fetchConversations), [read]);
  const refreshAll = useCallback(() => Promise.all([
    refreshConversations(), refreshOffers(), read('visits', fetchAgenda), read('requests', fetchVisitRequests),
  ]), [read, refreshConversations, refreshOffers]);

  useEffect(() => {
    setAccount(EMPTY);
    if (!userId) return;
    void refreshAll();
    const onVisible = () => { if (document.visibilityState === 'visible') void refreshAll(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [userId, refreshAll]);

  /** Demande de visite tout juste envoyée (VisitRequestStore.send l'ajoute à la liste). */
  const addRequest = useCallback((request: VisitRequestRow) => {
    setAccount((previous) => ({ ...previous, requests: [...previous.requests.filter((other) => other.id !== request.id), request] }));
  }, []);

  return { account, refreshOffers, refreshConversations, addRequest };
}
