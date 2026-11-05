import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { Icon } from './Icon';
import {
  highlightRanges, placeShortName, placeSubtitle, placeSuggestions, PlaceSearchError, type PlaceSuggestion,
} from '../lib/places';

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
   * `search` : champ de la page de recherche (loupe, libellé lu par les lecteurs d'écran).
   */
  variant?: 'search' | 'home';
  /** Pour les tests : remplace l'appel aux services publics. */
  fetcher?: typeof placeSuggestions;
};

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

/** Champ « Ville, code postal » avec suggestions, comme le champ de recherche de l'app. */
export function PlaceField({ value, onChange, onChoose, onSubmit, label, placeholder = 'Ville, code postal, quartier…', className, variant = 'search', fetcher = placeSuggestions }: Props) {
  const id = useId();
  const listId = `${id}-liste`;
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [error, setError] = useState<string | null>(null);
  const typed = useRef(false);
  const blurTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (!typed.current) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      fetcher(value, 6, controller.signal)
        .then((found) => {
          setSuggestions(found);
          setActive(-1);
          setError(null);
          setOpen(found.length > 0);
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

  useEffect(() => () => window.clearTimeout(blurTimer.current), []);

  function choose(place: PlaceSuggestion) {
    typed.current = false;
    setOpen(false);
    setSuggestions([]);
    setActive(-1);
    onChoose(place);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
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
      }
    } else if (event.key === 'Escape' && open) {
      event.preventDefault();
      setOpen(false);
    }
  }

  return (
    <div className={`place-field${variant === 'home' ? ' place-field-home' : ''} ${className ?? ''}`}>
      <label className={variant === 'home' ? 'place-field-caption' : 'visually-hidden'} htmlFor={id}>{label}</label>
      <Icon name={variant === 'home' ? 'pin' : 'search'} className="icon place-field-icon" />
      <input
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
          onChange(event.target.value);
        }}
        onKeyDown={onKeyDown}
        onFocus={() => suggestions.length && setOpen(true)}
        onBlur={() => {
          blurTimer.current = window.setTimeout(() => setOpen(false), 120);
        }}
      />
      {variant === 'home' && !value && <Icon name="chevronRight" className="icon place-field-chevron" />}
      {value && (
        <button
          type="button"
          className="place-field-clear"
          aria-label="Effacer le lieu"
          onClick={() => {
            typed.current = false;
            setSuggestions([]);
            setOpen(false);
            onChange('');
          }}
        >
          <Icon name="x" />
        </button>
      )}
      <ul id={listId} role="listbox" aria-label="Suggestions de lieux" className="place-list" hidden={!open}>
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
      <p id={`${id}-erreur`} className="place-error" role="status" aria-live="polite">{error ?? ''}</p>
    </div>
  );
}
