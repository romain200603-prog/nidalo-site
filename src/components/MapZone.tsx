import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { CriterionChip } from './CriterionChips';
import { Icon } from './Icon';
import type { DrawTool } from './ResultsMap';
import { ActionMenu, type MenuItem } from '../pages/account/DesktopParts';
import { canGrow, canShrink, DRAWN_ZONE_LABEL } from '../lib/drawnZone';
import type { SavedSearch } from '../lib/account/savedSearches';
import type { Coordinate } from '../lib/places';
import '../styles/carte-zone.css';

// Zone dessinée sur la carte de Votre recherche (MapTabView.swift de l'app, prompt 30) : bandeau du tracé, choix de
// l'outil, carte « Ajuster puis valider », crayon et son menu, pastille « Zone dessinée ».

/** Outil du tracé, gardé tant que la page est ouverte (MapSession.drawTool de l'app : « Tracé libre » au départ). */
export const zoneSession: { drawTool: DrawTool } = { drawTool: 'free' };

/** « 6 biens dans cette zone » (MapTabView.proposalCount). */
export function proposalCount(count: number): string {
  if (count === 0) return 'Aucun bien dans cette zone';
  if (count === 1) return '1 bien dans cette zone';
  return `${count} biens dans cette zone`;
}

/** Souris (ordinateur) : la consigne ne parle pas du doigt. */
function usesMouse(): boolean {
  try {
    return window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  } catch {
    return false;
  }
}

/** Consigne du bandeau pendant le tracé. */
export function drawingInstruction(tool: DrawTool): string {
  const mouse = usesMouse();
  if (tool === 'free') return mouse ? 'Tracez votre zone à la souris' : 'Tracez votre zone au doigt';
  return mouse ? 'Cliquez au centre, puis écartez' : 'Touchez le centre, puis écartez';
}

/**
 * Bandeau à la place de la recherche (drawingBanner) : crayon, consigne et « Annuler », qui remet la zone d'avant ;
 * Échap fait de même. Pendant le tracé, « Zone autour du centre de la carte » (l'action VoiceOver de l'app) est un vrai
 * bouton, caché jusqu'à ce qu'il reçoive le focus du clavier.
 */
export function ZoneBanner({ text, onCancel, onZoneAroundCenter }: {
  text: string;
  onCancel: () => void;
  onZoneAroundCenter?: () => void;
}) {
  const cancel = useRef(onCancel);
  cancel.current = onCancel;
  const textRef = useRef<HTMLParagraphElement>(null);
  // Consigne trop longue pour le bandeau : le texte rapetisse jusqu'à 80 % (minimumScaleFactor(0.8) de l'app), puis « … ».
  useLayoutEffect(() => {
    const element = textRef.current;
    if (!element) return;
    const fit = () => {
      element.style.fontSize = '';
      const { scrollWidth, clientWidth } = element;
      if (clientWidth <= 0 || scrollWidth <= clientWidth) return;
      const size = Number.parseFloat(getComputedStyle(element).fontSize);
      element.style.fontSize = `${Math.max(size * 0.8, Math.floor(((size * clientWidth) / scrollWidth) * 4) / 4)}px`;
    };
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, [text]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented || document.querySelector('dialog[open]')) return;
      event.preventDefault();
      cancel.current();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);
  return (
    <div className="zone-banner">
      <Icon name="pencil" className="icon zone-banner-icon" />
      <p ref={textRef} className="zone-banner-text" role="status">{text}</p>
      {onZoneAroundCenter && (
        <button type="button" className="zone-banner-center" onClick={onZoneAroundCenter}>Zone autour du centre de la carte</button>
      )}
      <button type="button" className="zone-banner-cancel" onClick={onCancel}>Annuler</button>
    </div>
  );
}

/** Choix de l'outil, en bas pendant le tracé (toolPicker) : « Tracé libre » ou « Cercle ». */
export function ZoneToolPicker({ tool, onChange }: { tool: DrawTool; onChange: (tool: DrawTool) => void }) {
  const tools: { value: DrawTool; icon: 'pencil' | 'circle'; title: string }[] = [
    { value: 'free', icon: 'pencil', title: 'Tracé libre' },
    { value: 'circle', icon: 'circle', title: 'Cercle' },
  ];
  return (
    <div className="zone-tools" role="group" aria-label="Outil du tracé">
      {tools.map(({ value, icon, title }) => (
        <button key={value} type="button" className={`zone-tool${tool === value ? ' is-selected' : ''}`} aria-pressed={tool === value}
          onClick={() => onChange(value)}>
          <Icon name={icon} />
          {title}
        </button>
      ))}
    </div>
  );
}

/**
 * Carte blanche en bas pendant l'ajustement (validationCard) : nombre de biens, − et +, « Recommencer » et « Voir les
 * 6 biens ». Le nombre est annoncé aux lecteurs d'écran à chaque recalcul.
 */
export function ZoneValidationCard({ zone, count, loading, onShrink, onGrow, onRestart, onCommit }: {
  zone: Coordinate[];
  count: number;
  loading: boolean;
  onShrink: () => void;
  onGrow: () => void;
  onRestart: () => void;
  onCommit: () => void;
}) {
  const [announcement, setAnnouncement] = useState<{ id: number; text: string } | null>(null);
  useEffect(() => {
    if (!loading) setAnnouncement((previous) => ({ id: (previous?.id ?? 0) + 1, text: proposalCount(count) }));
  }, [loading, count, zone]);
  const shrinkable = canShrink(zone);
  const growable = canGrow(zone);
  const commitLabel = loading ? 'Voir les biens' : count === 0 ? 'Valider la zone' : count === 1 ? 'Voir le bien' : `Voir les ${count} biens`;
  return (
    <div className="zone-card" role="group" aria-label="Ajuster la zone">
      <div className="zone-card-head">
        <div className="zone-card-titles">
          <p className="zone-card-count">
            {loading ? <><span className="zone-spinner" aria-hidden="true" />Recherche des biens…</> : proposalCount(count)}
          </p>
          <p className="zone-card-sub">Ajustez sa taille si besoin</p>
        </div>
        {/* Inactifs sous 500 m et au-delà de 300 km ; ils gardent le focus du clavier. */}
        <button type="button" className="zone-size" aria-label="Réduire la zone" aria-disabled={!shrinkable || undefined}
          onClick={() => { if (shrinkable) onShrink(); }}>
          <Icon name="minus" />
        </button>
        <button type="button" className="zone-size" aria-label="Agrandir la zone" aria-disabled={!growable || undefined}
          onClick={() => { if (growable) onGrow(); }}>
          <Icon name="plus" />
        </button>
      </div>
      <div className="zone-card-actions">
        <button type="button" className="zone-restart" onClick={onRestart}>
          <Icon name="rotateCcw" />
          Recommencer
        </button>
        <button type="button" className="zone-commit" onClick={onCommit}>{commitLabel}</button>
      </div>
      <div className="visually-hidden" aria-live="polite">
        {announcement && <span key={announcement.id}>{announcement.text}</span>}
      </div>
    </div>
  );
}

/**
 * Menu du crayon quand une zone est posée (zoneMenu) : Redessiner, Ajuster la taille, l'alerte selon le cas, Effacer
 * la zone (en rouge).
 */
export function zoneMenuItems({ saved, onRedraw, onAdjust, onCreateAlert, onEnableAlert, onClear }: {
  saved: SavedSearch | null;
  onRedraw: () => void;
  onAdjust: () => void;
  onCreateAlert: () => void;
  onEnableAlert: (search: SavedSearch) => void;
  onClear: () => void;
}): MenuItem[] {
  const alert: MenuItem = saved?.alerts_enabled
    ? { label: 'Alerte active', icon: 'bell', onClick: () => undefined, disabled: true }
    : saved
      ? { label: 'Activer l’alerte', icon: 'bell', onClick: () => onEnableAlert(saved) }
      : { label: 'Créer une alerte', icon: 'bell', onClick: onCreateAlert };
  return [
    { label: 'Redessiner', icon: 'pencil', onClick: onRedraw },
    { label: 'Ajuster la taille', icon: 'maximize', onClick: onAdjust },
    alert,
    { label: 'Effacer la zone', icon: 'trash2', onClick: onClear, danger: true },
  ];
}

/**
 * Crayon, troisième commande de la carte : sans zone, il lance le tracé (« Dessiner une zone ») ; bleu pendant le tracé
 * ou l'ajustement, il fait comme « Annuler » ; bleu avec une zone posée, il ouvre son menu (« Options de la zone »).
 */
export function ZonePencil({ menu, editing, onStart }: { menu: MenuItem[] | null; editing: boolean; onStart: () => void }) {
  if (menu && !editing) {
    return <ActionMenu label="Options de la zone" icon="pencil" items={menu} triggerClassName="map-round is-active zone-pencil" className="zone-menu" />;
  }
  return (
    <button type="button" className={`map-round zone-pencil${editing ? ' is-active' : ''}`} aria-label="Dessiner une zone"
      title="Dessiner une zone" aria-pressed={editing} onClick={onStart}>
      <Icon name="pencil" />
    </button>
  );
}

/**
 * « Zone dessinée » et sa croix, qui l'efface : la même pastille que les autres critères (son libellé ouvre les filtres).
 * `withIcon` : le crayon avant le libellé (sur ordinateur, dans la rangée des critères).
 */
export function ZoneChip({ onOpen, onRemove, withIcon = false }: { onOpen: () => void; onRemove: () => void; withIcon?: boolean }) {
  const hint = useId();
  return (
    <div className="zone-chip">
      <ul className="criterion-chips" aria-label="Zone">
        <CriterionChip label={DRAWN_ZONE_LABEL} onOpen={onOpen} onRemove={onRemove} hintId={hint} icon={withIcon ? 'pencil' : undefined} />
      </ul>
      <span id={hint} hidden>Ouvre les filtres</span>
    </div>
  );
}
