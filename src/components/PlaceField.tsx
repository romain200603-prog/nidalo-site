import { useEffect, useId, useRef, useState, type FocusEvent, type KeyboardEvent } from 'react';
import { Icon } from './Icon';
import { keptCenter, NEARBY_LABEL, nearbyPlace } from '../lib/nearby';
import {
  communeAt, highlightRanges, placeShortName, placeSubtitle, placeSuggestions, PlaceSearchError, type PlaceSuggestion,
} from '../lib/places';
import { clearRecentPlaces, currentOwner, recordRecentPlace, useRecentPlaces } from '../lib/recentPlaces';
import '../styles/pieces-app.css';

type Props = {
  value: string;
  onChange: (text: string) => void;
  onChoose: (place: PlaceSuggestion) => void;
  onSubmit?: () => void;
  label: string;
  placeholder?: string;
  className?: string;
  /**
   * `home` : champ « Où cherchez-vous ? » de l'accueil (épingle, libellé visible, chevron) ;
   * `search` : champ de la page de recherche (loupe, libellé lu par les lecteurs d'écran) ;
   * `app` : champ blanc de la ligne du haut de Votre recherche sur téléphone (SearchPlaceField de l'app).
   */
  variant?: 'search' | 'home' | 'app';
  /** Hors saisie, texte montré à la place du lieu (« Lyon et alentours »), comme le champ de l'app. */
  idleText?: string;
  /** Saisie en cours ou finie (Votre recherche efface son bouton « Carte » pendant la saisie). */
  onFocusChange?: (focused: boolean) => void;
  /** Nom du bouton qui efface le lieu. */
  clearLabel?: string;
  /**
   * Champs de lieu des recherches seulement (showsNearbyAndRecents de l'app) : champ vide, « Autour de moi » puis les
   * lieux récents. Jamais dans un champ d'adresse.
   */
  shortcuts?: boolean;
  /** Pour les tests : remplace l'appel aux services publics. */
  fetcher?: typeof placeSuggestions;
};

/** « Autour de moi » : rien, position en cours, refusée, ou introuvable (NearbyState de l'app). */
type NearbyState = 'idle' | 'locating' | 'denied' | 'failed';

function Highlighted({ text, query }: { text: string; query: string }) {
  const ranges = highlightRanges(text, query);
  if (!ranges.length) return <>{text}</>;
  const parts = [];
  let cursor = 0;
  ranges.forEach(([start, end], i) => {
    if (start > cursor) parts.push(<span key={`t${i}`}>{text.slice(cursor, start)}</span>);
    parts.push(<strong key={`h${i}`}>{text.slice(start, end)}</strong>);
    cursor = end;
  });
  if (cursor < text.length) parts.push(<span key="end">{text.slice(cursor)}</span>);
  return <>{parts}</>;
}

/**
 * Position du navigateur, demandée seulement au choix de « Autour de moi » (le navigateur demande d'abord la
 * permission) : précise à une dizaine de mètres comme l'app, une position de moins d'une minute convient.
 */
function locate(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      reject(new Error('indisponible'));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 15_000, maximumAge: 60_000 });
  });
}

/** Champ « Ville, code postal » avec suggestions, comme le champ de recherche de l'app. */
export function PlaceField({
  value, onChange, onChoose, onSubmit, label, placeholder = 'Ville, code postal, quartier…', className, variant = 'search', idleText,
  onFocusChange, clearLabel = 'Effacer le lieu', shortcuts = false, fetcher = placeSuggestions,
}: Props) {
  const id = useId();
  const listId = `${id}-liste`;
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [error, setError] = useState<string | null>(null);
  const [focused, setFocused] = useState(false);
  /** Le champ ou l'un des raccourcis a le focus (« Effacer » ou un lieu récent atteint au clavier). */
  const [within, setWithin] = useState(false);
  /** Raccourcis refermés par Échap, jusqu'au prochain retour dans le champ. */
  const [dismissed, setDismissed] = useState(false);
  const [nearby, setNearby] = useState<NearbyState>('idle');
  const recents = useRecentPlaces();
  const typed = useRef(false);
  const blurTimer = useRef<number | undefined>(undefined);
  const input = useRef<HTMLInputElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const nearbyButton = useRef<HTMLButtonElement>(null);
  const locating = useRef(false);
  const alive = useRef(true);

  useEffect(() => {
    if (!typed.current) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      fetcher(value, 6, controller.signal)
        .then((found) => {
          setSuggestions(found);
          setActive(-1);
          setError(null);
          // La liste ne s'ouvre que sous le champ en cours de saisie : un texte rempli par une autre suggestion (code
          // postal et ville d'une adresse choisie) n'ouvre rien ; ses suggestions reviennent si on retourne au champ.
          setOpen(found.length > 0 && document.activeElement === input.current);
        })
        .catch((reason: unknown) => {
          if (controller.signal.aborted) return;
          setSuggestions([]);
          setOpen(false);
          setError(reason instanceof PlaceSearchError ? reason.userMessage : new PlaceSearchError('unavailable').userMessage);
        });
    }, 220);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [value, fetcher]);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      window.clearTimeout(blurTimer.current);
    };
  }, []);

  const showsShortcuts = shortcuts && within && !dismissed && !value.trim();

  /** Raccourci choisi au clavier : le focus revient au champ (les raccourcis se ferment), sauf dans le champ du haut. */
  function focusBackFromPanel() {
    if (variant !== 'app' && panel.current?.contains(document.activeElement)) input.current?.focus();
  }

  /** Champ du haut de Votre recherche : le lieu choisi, le clavier se ferme (comme l'app). */
  function closeKeyboard() {
    if (variant !== 'app') return;
    input.current?.blur();
    if (panel.current?.contains(document.activeElement)) (document.activeElement as HTMLElement).blur();
  }

  function choose(place: PlaceSuggestion) {
    focusBackFromPanel();
    typed.current = false;
    setOpen(false);
    setSuggestions([]);
    setActive(-1);
    // Lieu choisi dans un champ de recherche (suggestion ou lieu récent) : gardé dans les lieux récents du compte.
    const owner = currentOwner();
    if (shortcuts && owner !== undefined) recordRecentPlace(place, owner);
    onChoose(place);
    closeKeyboard();
  }

  /**
   * « Autour de moi » : la position (le navigateur demande la permission s'il le faut), sa commune pour le libellé
   * enregistré, puis le même choix qu'une suggestion. Refus ou position introuvable : un message, sans alerte.
   */
  async function chooseNearby() {
    if (locating.current) return;
    locating.current = true;
    setNearby('locating');
    let position: GeolocationPosition;
    try {
      position = await locate();
    } catch (reason) {
      locating.current = false;
      // Code 1 : permission refusée (PERMISSION_DENIED) ; le reste : position introuvable, délai dépassé, pas de GPS.
      const code = (reason as GeolocationPositionError | null)?.code;
      if (alive.current) setNearby(code === 1 ? 'denied' : 'failed');
      return;
    }
    const exact = { latitude: position.coords.latitude, longitude: position.coords.longitude };
    const commune = await communeAt(exact);
    locating.current = false;
    // Champ quitté entre-temps (page fermée) : rien n'est choisi.
    if (!alive.current) return;
    setNearby('idle');
    focusBackFromPanel();
    typed.current = false;
    onChoose(nearbyPlace(keptCenter(exact), commune));
    closeKeyboard();
  }

  /** Boutons des raccourcis, dans l'ordre : flèches haut et bas pour passer de l'un à l'autre. */
  function shortcutButtons(): HTMLButtonElement[] {
    return [...(panel.current?.querySelectorAll<HTMLButtonElement>('button:not([disabled])') ?? [])];
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (showsShortcuts && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
      const buttons = shortcutButtons();
      if (buttons.length) {
        event.preventDefault();
        buttons[event.key === 'ArrowDown' ? 0 : buttons.length - 1].focus();
      }
      return;
    }
    if (showsShortcuts && event.key === 'Escape') {
      event.preventDefault();
      setDismissed(true);
      return;
    }
    // Raccourcis refermés par Échap : ↓ les rouvre (le focus reste dans le champ).
    if (shortcuts && within && dismissed && !value.trim() && event.key === 'ArrowDown') {
      event.preventDefault();
      setDismissed(false);
      return;
    }
    if (event.key === 'ArrowDown' && suggestions.length) {
      event.preventDefault();
      setOpen(true);
      setActive((i) => (i + 1) % suggestions.length);
    } else if (event.key === 'ArrowUp' && suggestions.length) {
      event.preventDefault();
      setOpen(true);
      setActive((i) => (i <= 0 ? suggestions.length - 1 : i - 1));
    } else if (event.key === 'Enter') {
      if (open && active >= 0 && suggestions[active]) {
        event.preventDefault();
        choose(suggestions[active]);
      } else if (onSubmit) {
        event.preventDefault();
        setOpen(false);
        onSubmit();
        if (variant === 'app') input.current?.blur();
      }
    } else if (event.key === 'Escape' && open) {
      event.preventDefault();
      setOpen(false);
    }
  }

  function onPanelKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const buttons = shortcutButtons();
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (event.key === 'ArrowUp' && index <= 0) {
        input.current?.focus();
        return;
      }
      buttons[Math.min(buttons.length - 1, index + 1 + (event.key === 'ArrowUp' ? -2 : 0))]?.focus();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      input.current?.focus();
      setDismissed(true);
    }
  }

  const showsIdle = !focused && Boolean(idleText) && idleText !== value.trim();
  const keepFocus = (event: { preventDefault: () => void }) => event.preventDefault();
  return (
    <div
      className={`place-field${variant === 'home' ? ' place-field-home' : variant === 'app' ? ' place-field-app' : ''} ${className ?? ''}`}
      onFocus={() => setWithin(true)}
      onBlur={(event: FocusEvent<HTMLDivElement>) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setWithin(false);
          // Sortie du champ : un message de position s'efface, sauf pendant la recherche de la position.
          if (!locating.current) setNearby('idle');
        }
      }}
    >
      <label className={variant === 'home' ? 'place-field-caption' : 'visually-hidden'} htmlFor={id}>{label}</label>
      <Icon name={variant === 'home' ? 'pin' : 'search'} className="icon place-field-icon" />
      <input
        ref={input}
        id={id}
        type="text"
        inputMode="search"
        enterKeyHint="search"
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        maxLength={120}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={open && active >= 0 ? `${listId}-${active}` : undefined}
        aria-describedby={error ? `${id}-erreur` : undefined}
        placeholder={placeholder}
        value={value}
        onChange={(event) => {
          typed.current = true;
          setDismissed(false);
          onChange(event.target.value);
        }}
        onKeyDown={onKeyDown}
        onFocus={() => {
          setFocused(true);
          setDismissed(false);
          onFocusChange?.(true);
          if (suggestions.length) setOpen(true);
        }}
        onBlur={() => {
          setFocused(false);
          onFocusChange?.(false);
          blurTimer.current = window.setTimeout(() => setOpen(false), 120);
        }}
        className={showsIdle ? 'is-idle' : undefined}
      />
      {showsIdle && <span className="place-field-idle" aria-hidden="true">{idleText}</span>}
      {variant === 'home' && !value && <Icon name="chevronRight" className="icon place-field-chevron" />}
      {value && (
        <button
          type="button"
          className="place-field-clear"
          aria-label={clearLabel}
          // Comme la croix de l'app : la saisie en cours continue (le champ garde le focus), sans en ouvrir une.
          onMouseDown={keepFocus}
          onClick={(event) => {
            if (document.activeElement === event.currentTarget) input.current?.focus();
            typed.current = false;
            setSuggestions([]);
            setOpen(false);
            onChange('');
          }}
        >
          <Icon name="x" />
        </button>
      )}
      <ul id={listId} role="listbox" aria-label="Suggestions de lieux" className="place-list" hidden={!open || showsShortcuts}>
        {suggestions.map((place, index) => (
          <li
            key={place.id}
            id={`${listId}-${index}`}
            role="option"
            aria-selected={index === active}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => choose(place)}
          >
            <Icon name="pin" className="icon place-list-icon" />
            <span>
              <span className="place-name"><Highlighted text={placeShortName(place)} query={value} /></span>
              <span className="place-sub">{placeSubtitle(place)}</span>
            </span>
          </li>
        ))}
      </ul>
      {shortcuts && (
        // Champ vide : « Autour de moi », puis « Recherches récentes » (5 au plus) et « Effacer » (shortcuts de l'app).
        // Un appui dans les raccourcis (ligne, message) garde le focus dans le champ : ils restent ouverts.
        <div ref={panel} className="place-list place-shortcuts" hidden={!showsShortcuts} onKeyDown={onPanelKeyDown} onMouseDown={keepFocus}>
          <button ref={nearbyButton} type="button" className="place-shortcut" onClick={() => void chooseNearby()}
            aria-label={nearby === 'locating' ? `${NEARBY_LABEL}, localisation en cours` : NEARBY_LABEL}
            aria-describedby={`${id}-proche`} aria-busy={nearby === 'locating' || undefined}>
            <span className="place-shortcut-tile is-nearby"><Icon name="locate" /></span>
            <span className="place-shortcut-name is-nearby">{NEARBY_LABEL}</span>
            {nearby === 'locating' && <span className="place-shortcut-spinner" aria-hidden="true" />}
          </button>
          <span id={`${id}-proche`} hidden>Cherche autour de votre position</span>
          <div className="place-nearby-problem" role="status" aria-live="polite">
            {(nearby === 'denied' || nearby === 'failed') && (
              <>
                {/* Texte de l'app ; refusée, le site dit où l'autoriser (pas de bouton « Ouvrir les Réglages » sur le web). */}
                <p>
                  <Icon name="info" />
                  {nearby === 'denied'
                    ? 'Nidalo n’a pas accès à votre position. Autorisez-la pour nidalo.fr dans les réglages de votre navigateur (souvent l’icône à gauche de l’adresse) pour chercher autour de vous.'
                    : 'Votre position n’a pas pu être trouvée. Réessayez dans un instant.'}
                </p>
                <button
                  type="button"
                  className="place-nearby-retry"
                  onClick={(event) => {
                    // Le message part pendant la recherche : le focus passe sur « Autour de moi » et son indicateur.
                    if (document.activeElement === event.currentTarget) nearbyButton.current?.focus();
                    void chooseNearby();
                  }}
                >
                  Réessayer
                </button>
              </>
            )}
          </div>
          {recents.items.length > 0 && (
            <>
              <div className="place-recents-head">
                <span id={`${id}-recents`} role="heading" aria-level={3}>Recherches récentes</span>
                <button type="button" aria-label="Effacer les recherches récentes"
                  onClick={() => { if (recents.owner !== undefined) clearRecentPlaces(recents.owner); input.current?.focus(); }}>
                  Effacer
                </button>
              </div>
              <ul className="place-recents" aria-labelledby={`${id}-recents`}>
                {recents.items.map((place) => (
                  <li key={place.id}>
                    <button type="button" className="place-shortcut" onClick={() => choose(place)} aria-describedby={`${id}-recent`}>
                      <span className="place-shortcut-tile is-recent"><Icon name="history" /></span>
                      <span className="place-shortcut-text">
                        <span className="place-shortcut-name">{placeShortName(place)}</span>
                        <span className="place-shortcut-sub">{placeSubtitle(place)}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
              <span id={`${id}-recent`} hidden>Recherche récente</span>
            </>
          )}
        </div>
      )}
      <p id={`${id}-erreur`} className="place-error" role="status" aria-live="polite">{error ?? ''}</p>
    </div>
  );
}
