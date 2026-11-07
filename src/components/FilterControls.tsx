import { useId, type ReactNode } from 'react';
import { Icon } from './Icon';
import type { IconName } from './iconPaths';
import { NumberField } from './NumberField';
import { formatPrice } from '../lib/format';
import { DPE_COLORS } from '../lib/labels';
import { scopeLabel, type HotelScope } from '../lib/listingJson';
import {
  COUNT_TOP, countRangeIncludes, countRangeText, ENERGY_CLASSES, energyRangeLabel, tapCountRange, type EnergyClass,
} from '../lib/search';

// Contrôles des filtres, comme DesignSystem/Components/FormControls.swift dans l'app : cartes titrées, pastilles
// de choix, champs de montant, fourchette à deux poignées, interrupteurs, échelle du DPE.

/** « Non renseigné » : un champ vide n'est jamais zéro. */
const EMPTY = 'Non renseigné';
export const PERCENT_ISSUE = 'Saisissez un pourcentage entre 0 et 100.';
export const RANGE_ISSUE = "Le minimum dépasse le maximum : ce critère n'est pas appliqué.";

/** Carte blanche titrée (SectionCard) : titre seul, sans icône décorative. */
export function FilterCard({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  const id = useId();
  return (
    <section className="filter-card" aria-labelledby={id}>
      <div className="filter-card-head">
        <h3 id={id}>{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

/** Ligne d'information bleu pâle. */
export function InfoLine({ children }: { children: ReactNode }) {
  return (
    <p className="info-line">
      <Icon name="info" />
      <span>{children}</span>
    </p>
  );
}

/** Pastille de choix, bleue quand elle est sélectionnée. */
export function ChoiceChip({ title, selected, onClick, expands = false }: { title: string; selected: boolean; onClick: () => void; expands?: boolean }) {
  return (
    <button type="button" className={`choice-chip${expands ? ' expands' : ''}`} aria-pressed={selected} onClick={onClick}>
      {title}
    </button>
  );
}

/** Libellé suivi de pastilles (groupe lu comme tel). */
export function ChoiceGroup({ label, aside, layout = 'row', children }: { label: string; aside?: ReactNode; layout?: 'row' | 'grid' | 'grid-small' | 'stack'; children: ReactNode }) {
  const id = useId();
  return (
    <div className="choice-field" role="group" aria-labelledby={id}>
      <div className="field-label-row">
        <span id={id} className="field-label">{label}</span>
        {aside}
      </div>
      <div className={`choice-${layout}`}>{children}</div>
    </div>
  );
}

/** Montant ou nombre ; vide = non renseigné. */
export function AmountField({ label, value, onChange, unit, decimals = false, allowNegative = false, groups = true, issue = null }: {
  label: string;
  value: number | null;
  onChange: (value: number | null) => void;
  unit: string;
  decimals?: boolean;
  allowNegative?: boolean;
  groups?: boolean;
  issue?: string | null;
}) {
  return (
    <NumberField label={label} value={value} onChange={onChange} unit={unit || undefined} placeholder={EMPTY}
      allowDecimal={decimals} allowNegative={allowNegative} groups={groups} error={issue} />
  );
}

/** Indifférent, oui ou non. */
export function OptionalBoolPicker({ title, value, onChange, trueLabel, falseLabel }: {
  title: string; value: boolean | null; onChange: (value: boolean | null) => void; trueLabel: string; falseLabel: string;
}) {
  return (
    <ChoiceGroup label={title}>
      <ChoiceChip title="Indifférent" selected={value === null} onClick={() => onChange(null)} expands />
      <ChoiceChip title={trueLabel} selected={value === true} onClick={() => onChange(true)} expands />
      <ChoiceChip title={falseLabel} selected={value === false} onClick={() => onChange(false)} expands />
    </ChoiceGroup>
  );
}

/** « Pièces minimum » (Studio, 2, 3, 4, 5+) ou « Chambres minimum » (1 à 5+) ; retoucher le choix l'enlève (Mon projet). */
export function RoomsPicker({ title, value, onChange, startsAtOne = false }: { title: string; value: number | null; onChange: (value: number | null) => void; startsAtOne?: boolean }) {
  return (
    <ChoiceGroup label={`${title} minimum`}>
      {[1, 2, 3, 4, 5].map((count) => (
        <ChoiceChip key={count} title={count === 5 ? '5+' : count === 1 && !startsAtOne ? 'Studio' : String(count)}
          selected={value === count} onClick={() => onChange(value === count ? null : count)} expands />
      ))}
    </ChoiceGroup>
  );
}

/**
 * « Pièces minimum et maximum » (Studio, 2, 3, 4, 5+) ou « Chambres minimum et maximum » (1 à 5+) sur une seule ligne,
 * comme l'app : 2 puis 4 allument 2, 3 et 4 (« De 2 à 4 ») ; un seul appui, ce nombre exactement ; « 5+ », sans maximum
 * (tapCountRange).
 */
export function RoomsRangePicker({ title, min, max, onChange, startsAtOne = false }: {
  title: string;
  min: number | null;
  max: number | null;
  onChange: (min: number | null, max: number | null) => void;
  startsAtOne?: boolean;
}) {
  return (
    <ChoiceGroup label={`${title} minimum et maximum`} aside={<span className="field-value">{countRangeText(min, max)}</span>}>
      {[1, 2, 3, 4, COUNT_TOP].map((count) => (
        <ChoiceChip key={count} title={count === COUNT_TOP ? `${COUNT_TOP}+` : count === 1 && !startsAtOne ? 'Studio' : String(count)}
          selected={countRangeIncludes(min, max, count)} expands
          onClick={() => {
            const next = tapCountRange(min, max, count);
            onChange(next.min, next.max);
          }} />
      ))}
    </ChoiceGroup>
  );
}

/** DPE : classe la moins bonne acceptée, sur l'échelle A à G (couleurs officielles). */
export function EnergyPicker({ value, onChange }: { value: EnergyClass | null; onChange: (value: EnergyClass | null) => void }) {
  return (
    <ChoiceGroup label="DPE maximum accepté" aside={<span className="field-value">{value ? energyRangeLabel(value) : 'Indifférent'}</span>}>
      <div className="energy-scale">
        {ENERGY_CLASSES.map((energy) => {
          const included = value === null || ENERGY_CLASSES.indexOf(energy) <= ENERGY_CLASSES.indexOf(value);
          return (
            <button
              key={energy}
              type="button"
              className={`energy-step${included ? '' : ' is-excluded'}`}
              style={{ background: DPE_COLORS[energy], color: energy === 'D' || energy === 'E' ? '#0A1A44' : '#FFFFFF' }}
              aria-pressed={value === energy}
              aria-label={`DPE ${energy}`}
              onClick={() => onChange(value === energy ? null : energy)}
            >
              <span>{energy}</span>
            </button>
          );
        })}
      </div>
    </ChoiceGroup>
  );
}

/** Interrupteur avec icône (équipements). */
export function FeatureToggle({ icon, title, checked, onChange }: { icon?: IconName; title: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className="feature-toggle">
      {icon && <Icon name={icon} />}
      <span className="feature-title">{title}</span>
      <input type="checkbox" role="switch" className="switch" checked={checked} onChange={(event) => onChange(event.target.checked)} />
    </label>
  );
}

/** Rayon autour d'une commune : 5, 10 (par défaut), 20, 50 ou 100 km. */
export function RadiusChoices({ value, onChange }: { value: number | null; onChange: (value: number | null) => void }) {
  const current = value ?? 10;
  return (
    <div className="choice-scroll" role="group" aria-label="Rayon autour du lieu">
      {[5, 10, 20, 50, 100].map((km) => (
        <ChoiceChip key={km} title={km === current ? `Rayon : ${km} km` : `${km} km`} selected={km === current}
          onClick={() => onChange(km === 10 ? null : km)} />
      ))}
    </div>
  );
}

function boundLabel(value: number | null, unit: string, fallback: string): string {
  if (value === null) return fallback;
  if (unit === '€') return formatPrice(value);
  if (unit === '€/mois' || unit === '€/m²') return `${formatPrice(value)}${unit.slice(1)}`;
  return `${value} ${unit}`;
}

/** Fourchette à deux poignées, synchronisée avec les champs minimum et maximum. Vide = sans limite. */
export function RangeSliderField({ min, max, onChange, bounds, step, unit, minTitle, maxTitle }: {
  min: number | null;
  max: number | null;
  onChange: (min: number | null, max: number | null) => void;
  bounds: [number, number];
  step: number;
  unit: string;
  minTitle: string;
  maxTitle: string;
}) {
  const [lowest, highest] = bounds;
  const clamp = (v: number) => Math.min(Math.max(v, lowest), highest);
  const low = clamp(min ?? lowest);
  const high = clamp(max ?? highest);
  const percent = (v: number) => ((v - lowest) / (highest - lowest)) * 100;
  const rounded = (v: number) => clamp(Math.round(v / step) * step);
  return (
    <div className="range-field">
      <div className="field-pair">
        <AmountField label={minTitle} value={min} onChange={(v) => onChange(v, max)} unit={unit} decimals />
        <AmountField label={maxTitle} value={max} onChange={(v) => onChange(min, v)} unit={unit} decimals />
      </div>
      <div className="range-slider">
        <div className="range-track" aria-hidden="true">
          <div className="range-fill" style={{ left: `${percent(low)}%`, right: `${100 - percent(high)}%` }} />
        </div>
        {/* Poignées superposées : celle du minimum passe devant dans la moitié haute, pour rester attrapable. */}
        <input type="range" min={lowest} max={highest} step={step} value={low} aria-label={minTitle}
          style={{ zIndex: low > (lowest + highest) / 2 ? 2 : undefined }}
          aria-valuetext={boundLabel(min, unit, 'Sans minimum')}
          onChange={(event) => {
            // Une poignée ramenée à la borne remet le critère à vide (pas de limite).
            const next = Math.min(rounded(Number(event.target.value)), high);
            onChange(next === lowest ? null : next, max);
          }} />
        <input type="range" min={lowest} max={highest} step={step} value={high} aria-label={maxTitle}
          aria-valuetext={boundLabel(max, unit, 'Sans maximum')}
          onChange={(event) => {
            const next = Math.max(rounded(Number(event.target.value)), low);
            onChange(min, next === highest ? null : next);
          }} />
      </div>
      <div className="range-bounds" aria-hidden="true">
        <span>{boundLabel(min, unit, 'Sans minimum')}</span>
        <span>{boundLabel(max, unit, 'Sans maximum')}</span>
      </div>
      {min !== null && max !== null && min > max && <p className="field-error">Le minimum dépasse le maximum : ce critère est ignoré.</p>}
    </div>
  );
}

/** Jour au format AAAA-MM-JJ, à l'heure du navigateur. */
export function isoDay(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Même jour le mois suivant (dernier jour du mois s'il n'existe pas), comme le calendrier de l'app. */
export function inOneMonth(from: Date): Date {
  const year = from.getFullYear();
  const month = from.getMonth() + 1;
  const lastDay = new Date(year, month + 1, 0).getDate();
  return new Date(year, month, Math.min(from.getDate(), lastDay));
}

/** Date facultative : un interrupteur, puis le calendrier (dans un mois par défaut). */
export function DateChoice({ title, value, onChange }: { title: string; value: string | null; onChange: (value: string | null) => void }) {
  const today = isoDay(new Date());
  return (
    <div className="date-choice">
      <label className="feature-toggle">
        <span className="feature-title field-label">{title}</span>
        <input type="checkbox" role="switch" className="switch" checked={value !== null}
          onChange={(event) => onChange(event.target.checked ? isoDay(inOneMonth(new Date())) : null)} />
      </label>
      {value !== null && (
        <input type="date" className="date-input" aria-label={`${title} : date`} min={today} value={value}
          onChange={(event) => onChange(event.target.value || null)} />
      )}
    </div>
  );
}

/** Cash-flow minimum : ≥ 0, ≥ 200, ≥ 500 €/mois, ou montant personnalisé (négatif = effort d'épargne). */
export function CashFlowChoices({ value, onChange }: { value: number | null; onChange: (value: number | null) => void }) {
  return (
    <div className="choice-field-block">
      <ChoiceGroup label="Cash-flow mensuel minimum (estimé)">
        {[0, 200, 500].map((amount) => (
          <ChoiceChip key={amount} title={`≥ ${formatPrice(amount)}`} selected={value === amount}
            onClick={() => onChange(value === amount ? null : amount)} expands />
        ))}
      </ChoiceGroup>
      <AmountField label="Personnalisé (négatif = effort d'épargne maximal)" value={value} onChange={onChange} unit="€/mois" decimals allowNegative />
    </div>
  );
}

const SCOPES: HotelScope[] = ['wallsAndBusiness', 'wallsOnly', 'businessOnly'];

export type HotelThresholdValues = {
  hotelScope: HotelScope | null;
  roomsMin: number | null;
  minHotelStars: number | null;
  minAnnualRevenue: number | null;
  minEbitda: number | null;
  minOperatingIncome: number | null;
  minOccupancyRatePercent: number | null;
};

/** Seuils d'un hôtel : opération, chambres, classement, CA, EBITDA, résultat d'exploitation, occupation. */
export function HotelThresholds({ values, onChange }: { values: HotelThresholdValues; onChange: (patch: Partial<HotelThresholdValues>) => void }) {
  const occupancy = values.minOccupancyRatePercent;
  return (
    <>
      <ChoiceGroup label="Nature de l'opération" layout="stack">
        {SCOPES.map((scope) => (
          <ChoiceChip key={scope} title={scopeLabel(scope)} selected={values.hotelScope === scope}
            onClick={() => onChange({ hotelScope: values.hotelScope === scope ? null : scope })} expands />
        ))}
        <ChoiceChip title="Indifférent" selected={values.hotelScope === null} onClick={() => onChange({ hotelScope: null })} expands />
      </ChoiceGroup>
      <AmountField label="Chambres minimum" value={values.roomsMin} onChange={(v) => onChange({ roomsMin: v === null ? null : Math.trunc(v) })} unit="chambres" />
      <ChoiceGroup label="Classement minimum">
        {[1, 2, 3, 4, 5].map((stars) => (
          <ChoiceChip key={stars} title={`${stars} ★`} selected={values.minHotelStars === stars}
            onClick={() => onChange({ minHotelStars: values.minHotelStars === stars ? null : stars })} expands />
        ))}
      </ChoiceGroup>
      <AmountField label="Chiffre d'affaires annuel minimum" value={values.minAnnualRevenue} onChange={(v) => onChange({ minAnnualRevenue: v })} unit="€/an" decimals />
      <AmountField label="EBITDA minimum" value={values.minEbitda} onChange={(v) => onChange({ minEbitda: v })} unit="€/an" decimals />
      <AmountField label="Résultat d'exploitation minimum" value={values.minOperatingIncome} onChange={(v) => onChange({ minOperatingIncome: v })} unit="€/an" decimals />
      <AmountField label="Taux d'occupation minimum" value={occupancy} onChange={(v) => onChange({ minOccupancyRatePercent: v })} unit="%" decimals
        issue={occupancy !== null && (occupancy < 0 || occupancy > 100) ? PERCENT_ISSUE : null} />
      <InfoLine>
        EBITDA : résultat avant intérêts, impôts, dépréciations et amortissements. Résultat d'exploitation : après dépréciations
        et amortissements. Valeurs déclarées par le vendeur ; un hôtel qui ne les communique pas est écarté dès qu'un minimum
        est fixé. Aucune rentabilité n'est tirée du chiffre d'affaires.
      </InfoLine>
    </>
  );
}
