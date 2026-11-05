import { Icon } from './Icon';
import { SEARCH_MODES, type SearchMode } from '../lib/labels';

/** Choix Résidentiel · Location · Investir · Hôtels, icône au-dessus du nom, comme l'accueil de l'app. */
export function ModeTabs({ mode, onChange, className }: { mode: SearchMode; onChange: (mode: SearchMode) => void; className?: string }) {
  return (
    <div className={`mode-tabs ${className ?? ''}`} role="radiogroup" aria-label="Type de recherche">
      {SEARCH_MODES.map((item) => (
        <button
          key={item.mode}
          type="button"
          role="radio"
          aria-checked={item.mode === mode}
          className="mode-tab"
          onClick={() => onChange(item.mode)}
          onKeyDown={(event) => {
            const index = SEARCH_MODES.findIndex((m) => m.mode === mode);
            const step = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 0;
            if (!step) return;
            event.preventDefault();
            const next = SEARCH_MODES[(index + step + SEARCH_MODES.length) % SEARCH_MODES.length];
            onChange(next.mode);
            const buttons = event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('button');
            buttons?.[SEARCH_MODES.indexOf(next)]?.focus();
          }}
          tabIndex={item.mode === mode ? 0 : -1}
        >
          <Icon name={item.icon} />
          <span>{item.label}</span>
        </button>
      ))}
    </div>
  );
}
