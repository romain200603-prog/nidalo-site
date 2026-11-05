import { Icon } from '../../components/Icon';
import { ExtraIcon } from './icons';

// Barre d'actions des annonces des autres (FloatingActionBar, ListingDetailView.swift 1209–1262) : capsule bleue,
// trois segments séparés de filets fins. Téléphone et tablette : flottante en bas de l'écran ; ordinateur : sous
// le résumé, dans la colonne de droite.
export function ActionBar({ onMessage, onVisit, onCall }: { onMessage: () => void; onVisit: () => void; onCall: () => void }) {
  return (
    <nav className="action-bar" aria-label="Contacter">
      <div className="action-bar-capsule">
        <button type="button" className="action-bar-item" onClick={onMessage}>
          <ExtraIcon name="messageCircle" />
          Messages
        </button>
        <span className="action-bar-divider" aria-hidden="true" />
        <button type="button" className="action-bar-item" onClick={onVisit}>
          <ExtraIcon name="calendarPlus" />
          Visiter
        </button>
        <span className="action-bar-divider" aria-hidden="true" />
        <button type="button" className="action-bar-item" onClick={onCall}>
          <Icon name="phone" />
          Téléphone
        </button>
      </div>
    </nav>
  );
}
