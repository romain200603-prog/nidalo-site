import { Icon } from '../../components/Icon';
import { ContactBar } from './ContactBar';
import { useFitTexts } from './fitText';

// Barre du bas de la fiche sur téléphone et tablette (actionBar de ListingDetailView.swift), posée une fois l'annonce
// chargée. L'annonce d'un autre : la barre de contact « Duo » (ContactBar.tsx), « Appeler » et « Envoyer un message » ;
// la visite se demande sur la carte « Aucune visite prévue ». Sa propre annonce : la barre blanche de l'app,
// « Voir les demandes » (bleu clair) et « Gérer l'annonce » (bleu), qui ouvrent les mêmes fenêtres qu'avant.
export function ActionBar({ onMessage, onCall, callHref = null, busy = false, isRental, playsArrival, onArrived, owner = null }: {
  onMessage: () => void;
  /** « Appeler » sans numéro (la fenêtre « Numéro non disponible »). */
  onCall: () => void;
  /** Le numéro du vendeur, quand il le communique (tel:…) : « Appeler » l'appelle. */
  callHref?: string | null;
  /** La conversation avec le vendeur s'ouvre : les points dans la bulle. */
  busy?: boolean;
  /** Location : « propriétaire » au lieu de « vendeur » (n° 74). */
  isRental: boolean;
  /** L'arrivée de la barre se joue une fois par ouverture de la fiche. */
  playsArrival: boolean;
  onArrived: () => void;
  owner?: { onRequests: () => void; onManage: () => void } | null;
}) {
  if (owner) return <OwnerBar onRequests={owner.onRequests} onManage={owner.onManage} />;
  return (
    <ContactBar onCall={onCall} callHref={callHref} onMessage={onMessage} opening={busy} isRental={isRental}
      playsArrival={playsArrival} onArrived={onArrived} />
  );
}

/**
 * Sa propre annonce : barre blanche sur toute la largeur (padding 8 / 16 / 6, ombre bleu marine à 6 %), deux boutons
 * de 46 px à 10 px l'un de l'autre, textes d'une ligne qui rapetissent (75 % et 80 % au plus), comme l'app.
 */
function OwnerBar({ onRequests, onManage }: { onRequests: () => void; onManage: () => void }) {
  const ref = useFitTexts<HTMLElement>();
  return (
    <nav ref={ref} className="action-bar owner-bar" aria-label="Mon annonce">
      <button type="button" className="owner-bar-button owner-bar-requests" onClick={onRequests}>
        <Icon name="calendarCheck" />
        <span data-fit="0.75">Voir les demandes</span>
      </button>
      <button type="button" className="owner-bar-button owner-bar-manage" onClick={onManage}>
        <Icon name="squarePen" />
        <span data-fit="0.8">Gérer l'annonce</span>
      </button>
    </nav>
  );
}
