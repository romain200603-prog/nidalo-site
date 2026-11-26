import { useState } from 'react';
import { Icon } from '../../components/Icon';
import { directionsUrl, saveFile, visitCalendarFile } from '../../lib/messages/exportFiles';
import { visitLongDate } from '../../lib/messages/format';

/**
 * Carte « Visite confirmée » (VisitEventCard de l'app), dans le fil et dans « Détails » : « VISITE CONFIRMÉE » en vert,
 * la date (« Jeudi 19 novembre · 18 h 00 »), l'adresse, puis « Ajouter à l'agenda » et « Itinéraire ». Le site donne
 * la visite à enregistrer dans l'agenda de l'appareil (fichier .ics de 45 minutes, « Visite immobilière ») ; le bouton
 * devient ensuite « Dans votre agenda » avec une coche, comme dans l'app.
 */
export function VisitEventCard({ id, slot, address, className = '' }: { id: string; slot: Date; address: string; className?: string }) {
  const [added, setAdded] = useState(false);
  const addToCalendar = () => {
    saveFile('visite-nidalo.ics', visitCalendarFile({ id, start: slot, address }), 'text/calendar;charset=utf-8');
    setAdded(true);
  };
  return (
    <div className={`dm-event ${className}`}>
      <p className="dm-event-kind"><Icon name="calendarCheck" />Visite confirmée</p>
      <p className="dm-event-date">{visitLongDate(slot)}</p>
      {address && <p className="dm-event-place"><Icon name="pin" />{address}</p>}
      <div className="dm-event-actions">
        {added ? (
          <span className="dm-event-added"><Icon name="check" />Dans votre agenda</span>
        ) : (
          <button type="button" className="dm-event-button is-filled" onClick={addToCalendar}>
            <Icon name="calendarPlus" />Ajouter à l'agenda
          </button>
        )}
        {address && (
          <a className="dm-event-button" href={directionsUrl(address)} target="_blank" rel="noopener noreferrer">
            <Icon name="navigation" />Itinéraire
          </a>
        )}
      </div>
    </div>
  );
}
