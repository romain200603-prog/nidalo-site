import { useEffect, useRef, useState } from 'react';
import { Icon } from '../../components/Icon';
import { PlaceField } from '../../components/PlaceField';
import { fullLabel } from '../../lib/account/agenda';
import { addressSuggestions, placeAt, type Coordinate, type PlaceSuggestion } from '../../lib/places';
import { Sheet } from './parts';

// « Localisation » du « + » (LocationShareSheet de l'app) : « Position actuelle » (position du navigateur, puis son
// adresse), ou « Adresse du bien » avec les suggestions de la Géoplateforme (le même service que les autres champs
// d'adresse du site) ; « Rechercher » cherche le texte saisi sans suggestion. « Joindre cette adresse » n'est possible
// qu'avec un point trouvé pour le texte affiché : changé ensuite, le point ne vaut plus (n° 216). Le site ne montre pas
// de carte d'aperçu.

const DENIED = 'Nidalo n\'a pas accès à votre position. Autorisez-la dans les réglages de ce navigateur, ou saisissez une adresse.';
const NOT_FOUND = 'Votre position n\'a pas pu être trouvée. Saisissez une adresse.';
const UNKNOWN_ADDRESS = 'Adresse introuvable. Vérifiez-la ou ajoutez la ville.';
/** Adresse d'une position sans réponse du service d'adresses. */
const SHARED_POSITION = 'Position partagée';

const addressFetcher = (raw: string, _limit?: number, signal?: AbortSignal) => addressSuggestions(raw, 5, signal);

/** Position du navigateur (CurrentLocation.locate) : `denied` si la personne a refusé. */
function locate(): Promise<Coordinate | 'denied' | null> {
  return new Promise((resolve) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      resolve(null);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => resolve({ latitude: position.coords.latitude, longitude: position.coords.longitude }),
      (error) => resolve(error.code === error.PERMISSION_DENIED ? 'denied' : null),
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 60_000 },
    );
  });
}

export function LocationSheet({ open, onClose, onShare }: {
  open: boolean;
  onClose: () => void;
  onShare: (address: string, coordinate: Coordinate) => void;
}) {
  return (
    <Sheet open={open} title="Localisation" onClose={onClose} className="dm-location-sheet">
      {open && <LocationForm onShare={onShare} />}
    </Sheet>
  );
}

function LocationForm({ onShare }: { onShare: (address: string, coordinate: Coordinate) => void }) {
  const [address, setAddress] = useState('');
  const [found, setFound] = useState<{ text: string; coordinate: Coordinate } | null>(null);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const alive = useRef(true);
  useEffect(() => () => {
    alive.current = false;
  }, []);
  const current = found && found.text.trim() === address.trim() ? found.coordinate : null;

  const useCurrentPosition = async () => {
    setError(null);
    setLocating(true);
    const position = await locate();
    if (!alive.current) return;
    if (position === null || position === 'denied') {
      setLocating(false);
      setError(position === 'denied' ? DENIED : NOT_FOUND);
      return;
    }
    const place = await placeAt(position);
    if (!alive.current) return;
    const label = place ? fullLabel(place) : SHARED_POSITION;
    setFound({ text: label, coordinate: position });
    setAddress(label);
    setLocating(false);
  };

  const findAddress = async (raw: string = address) => {
    const text = raw.trim();
    if (!text) return;
    setError(null);
    setLocating(true);
    let place: PlaceSuggestion | undefined;
    try {
      place = (await addressSuggestions(text, 5)).find((item) => item.coordinate);
    } catch {
      place = undefined;
    }
    if (!alive.current) return;
    setLocating(false);
    if (place?.coordinate) setFound({ text, coordinate: place.coordinate });
    else {
      setFound(null);
      setError(UNKNOWN_ADDRESS);
    }
  };

  return (
    <div className="dm-sheet-content dm-location">
      <button type="button" className="dm-location-current" onClick={() => void useCurrentPosition()} disabled={locating}>
        <span className="dm-location-icon" aria-hidden="true"><Icon name="locate" /></span>
        <span className="dm-location-title">Position actuelle</span>
        {locating && <span className="spinner" role="status" aria-label="Recherche en cours" />}
      </button>
      <div className="dm-location-field">
        <PlaceField
          value={address}
          label="Adresse du bien"
          placeholder="Adresse du bien"
          className="dm-location-place"
          fetcher={addressFetcher}
          onChange={(text) => {
            setAddress(text);
            setError(null);
          }}
          onChoose={(place) => {
            const label = fullLabel(place);
            setAddress(label);
            setError(null);
            if (place.coordinate) setFound({ text: label, coordinate: place.coordinate });
            else void findAddress(label);
          }}
          onSubmit={() => void findAddress()}
        />
        <button type="button" className="dm-link-button" onClick={() => void findAddress()} disabled={!address.trim() || locating}>Rechercher</button>
      </div>
      {error && <p className="dm-error" role="alert"><Icon name="triangleAlert" />{error}</p>}
      <button
        type="button"
        className="btn btn-primary dm-wide-button dm-location-share"
        disabled={!current}
        onClick={() => {
          if (current) onShare(address.trim(), current);
        }}
      >
        Joindre cette adresse
      </button>
    </div>
  );
}
