import { Icon } from '../../components/Icon';
import { ExtraIcon } from './icons';

// Barre d'actions des annonces des autres (FloatingActionBar, ListingDetailView.swift 1209–1262) : capsule bleue,
// trois segments séparés de filets fins. Téléphone et tablette : flottante en bas de l'écran ; ordinateur : sous
// le résumé, dans la colonne de droite. Sa propre annonce : « Voir les demandes » et « Gérer l'annonce », comme la
// fiche sur ordinateur.
export function ActionBar({ onMessage, onVisit, onCall, callHref = null, busy = false, owner = null }: {
  onMessage: () => void;
  onVisit: () => void;
  /** « Téléphone » sans numéro (la fenêtre « Numéro non disponible »). */
  onCall: () => void;
  /** Le numéro du vendeur, quand il le communique (tel:…) : « Téléphone » l'appelle. */
  callHref?: string | null;
  /** La conversation avec le vendeur s'ouvre : « Messages » attend. */
  busy?: boolean;
  owner?: { onRequests: () => void; onManage: () => void } | null;
}) {
  if (owner) {
    return (
      <nav className="action-bar" aria-label="Mon annonce">
        <div className="action-bar-capsule">
          <button type="button" className="action-bar-item" onClick={owner.onRequests}>
            <Icon name="calendarCheck" />
            Voir les demandes
          </button>
          <span className="action-bar-divider" aria-hidden="true" />
          <button type="button" className="action-bar-item" onClick={owner.onManage}>
            <Icon name="pen" />
            Gérer l'annonce
          </button>
        </div>
      </nav>
    );
  }
  return (
    <nav className="action-bar" aria-label="Contacter">
      <div className="action-bar-capsule">
        <button type="button" className="action-bar-item" onClick={onMessage} disabled={busy}>
          <ExtraIcon name="messageCircle" />
          Messages
        </button>
        <span className="action-bar-divider" aria-hidden="true" />
        <button type="button" className="action-bar-item" onClick={onVisit}>
          <ExtraIcon name="calendarPlus" />
          Visiter
        </button>
        <span className="action-bar-divider" aria-hidden="true" />
        {callHref ? (
          <a className="action-bar-item" href={callHref}>
            <Icon name="phone" />
            Téléphone
          </a>
        ) : (
          <button type="button" className="action-bar-item" onClick={onCall}>
            <Icon name="phone" />
            Téléphone
          </button>
        )}
      </div>
    </nav>
  );
}
