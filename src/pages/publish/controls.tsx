import { useEffect, useId, useLayoutEffect, useRef, useState, type ChangeEvent, type ReactNode } from 'react';
import { ChoiceChip, InfoLine } from '../../components/FilterControls';
import { AMOUNT_INVALID, amountText, groupedInput, inputAmount } from '../../lib/account/projectEditor';
import { DPE_COLORS } from '../../lib/labels';
import { ENERGY_CLASSES, type EnergyClass } from '../../lib/search';
import type { PublishDraft } from '../../lib/publish/draft';

// Contrôles de Publier sur ordinateur, comme l'app (FormControls.swift, TextInput, ErrorLine, EnergyClassChoice et
// IndicatorsCard de Features/Publish), dans le style des formulaires de Mon espace (.dsc).

const EMPTY = 'Non renseigné';

/** Modification du brouillon à partir de sa dernière version. */
export type Update = (change: (draft: PublishDraft) => PublishDraft) => void;
export type StepProps = { draft: PublishDraft; update: Update; showsErrors: boolean };

/**
 * `guide` : repère d'un champ à compléter (`data-guide`, un nom de StepIssue), vers lequel l'écran défile quand
 * « Continuer », « Publier » ou « Enregistrer » trouve qu'il manque.
 */
type Guided = { guide?: string };

/** Carte titrée (SectionCard). */
export function Card({ title, guide, children }: { title: string; children: ReactNode } & Guided) {
  const id = useId();
  return (
    <section className="dsc-card" aria-labelledby={id} data-guide={guide}>
      <h2 id={id} className="dsc-card-title">{title}</h2>
      {children}
    </section>
  );
}

export function FieldLabel({ children, id }: { children: ReactNode; id?: string }) {
  return <span id={id} className="field-label">{children}</span>;
}

/** Message d'erreur sous un champ (ErrorLine). */
export function ErrorLine({ children, guide }: { children: ReactNode } & Guided) {
  return <p className="field-error dpub-error" data-guide={guide}>{children}</p>;
}

/** Caractères qui comptent pour replacer le curseur (GroupedNumberInput.isSignificant). */
const isSignificant = (character: string) => /[0-9,.\-−+]/.test(character);

function significantCount(text: string, upTo: number): number {
  return Array.from(text.slice(0, Math.max(0, upTo))).filter(isSignificant).length;
}

function offsetAfterSignificant(formatted: string, count: number): number {
  if (count <= 0) return 0;
  let seen = 0;
  for (let index = 0; index < formatted.length; index++) {
    if (!isSignificant(formatted[index])) continue;
    seen += 1;
    if (seen === count) return index + 1;
  }
  return formatted.length;
}

/**
 * Montant ou nombre à la française (AmountField) : vide = non renseigné, milliers espacés pendant la frappe avec le
 * curseur à sa place, saisie en % pour une fraction (`percent`), nombre entier (`integer`), sans espaces pour une
 * année (`groups` à false).
 */
export function Amount({ label, value, onChange, unit, percent = false, integer = false, groups = true, issue = null, guide }: {
  label: string;
  value: number | null;
  onChange: (value: number | null) => void;
  unit: string;
  percent?: boolean;
  integer?: boolean;
  groups?: boolean;
  issue?: string | null;
} & Guided) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const caret = useRef<number | null>(null);
  const [text, setText] = useState(() => amountText(value, percent, groups));
  const [focused, setFocused] = useState(false);

  // Valeur changée ailleurs (proposition, autre champ) : seulement hors saisie, comme l'app.
  useEffect(() => {
    if (focused) return;
    if (inputAmount(text, false, percent) !== value) setText(amountText(value, percent, groups));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  useLayoutEffect(() => {
    if (caret.current === null || !input.current) return;
    input.current.setSelectionRange(caret.current, caret.current);
    caret.current = null;
  }, [text]);

  function handle(event: ChangeEvent<HTMLInputElement>) {
    const raw = event.target.value;
    const count = significantCount(raw, event.target.selectionStart ?? raw.length);
    let formatted = groupedInput(raw, false, groups);
    // Nombre entier (étage, lots, année…) : pas de virgule.
    if (integer) formatted = formatted.replace(/,.*$/, '');
    caret.current = offsetAfterSignificant(formatted, count);
    setText(formatted);
    const parsed = inputAmount(formatted, false, percent);
    onChange(parsed === null ? null : integer ? Math.trunc(parsed) : parsed);
  }

  const invalid = text.trim() !== '' && inputAmount(text) === null;
  const message = invalid ? AMOUNT_INVALID : issue;
  return (
    <div className={`number-field dsc-amount${message ? ' has-error' : ''}`} data-guide={guide}>
      <label htmlFor={id}>{label}</label>
      <div className="number-input">
        <input ref={input} id={id} type="text" inputMode={integer ? 'numeric' : 'decimal'} autoComplete="off" placeholder={EMPTY}
          value={text} onChange={handle} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
          aria-invalid={message ? true : undefined} aria-describedby={message ? `${id}-erreur` : undefined} />
        {unit && <span className="unit" aria-hidden="true">{unit}</span>}
      </div>
      {message && <p id={`${id}-erreur`} className="field-error">{message}</p>}
    </div>
  );
}

/** Champ texte (TextInput) : libellé, « Non renseigné », erreur sous le champ. */
export function TextInput({ label, value, onChange, error = null, maxLength = 150, autoComplete, list, disabled = false, guide }: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string | null;
  maxLength?: number;
  autoComplete?: string;
  /** Suggestions sous le champ (`<datalist>`). */
  list?: string;
  disabled?: boolean;
} & Guided) {
  const id = useId();
  return (
    <div className={`dsc-field${error ? ' has-error' : ''}`} data-guide={guide}>
      <label htmlFor={id}>{label}</label>
      <input id={id} className="dsc-input" type="text" placeholder={EMPTY} value={value} maxLength={maxLength} autoComplete={autoComplete ?? 'off'}
        list={list} disabled={disabled} aria-invalid={error ? true : undefined} aria-describedby={error ? `${id}-erreur` : undefined}
        onChange={(event) => onChange(event.target.value)} />
      {error && <p id={`${id}-erreur`} className="field-error">{error}</p>}
    </div>
  );
}

/** Libellé suivi de pastilles. */
export function Choices({ label, layout = 'row', guide, children }: {
  label: string;
  layout?: 'row' | 'wide' | 'outdoor' | 'stack' | 'two';
  children: ReactNode;
} & Guided) {
  const id = useId();
  const grid = layout === 'wide' ? 'dpub-choices-wide' : layout === 'two' ? 'dpub-choices-two' : `dsc-choices-${layout}`;
  return (
    <div className="dsc-choices" role="group" aria-labelledby={id} data-guide={guide}>
      <FieldLabel id={id}>{label}</FieldLabel>
      <div className={grid}>{children}</div>
    </div>
  );
}

/** Oui, non ou « À préciser » (OptionalBoolPicker avec unsetLabel « À préciser »). */
export function BoolChoices({ title, value, onChange, trueLabel = 'Oui', falseLabel = 'Non', guide }: {
  title: string;
  value: boolean | null;
  onChange: (value: boolean | null) => void;
  trueLabel?: string;
  falseLabel?: string;
} & Guided) {
  return (
    <Choices label={title} guide={guide}>
      <ChoiceChip title="À préciser" selected={value === null} onClick={() => onChange(null)} expands />
      <ChoiceChip title={trueLabel} selected={value === true} onClick={() => onChange(true)} expands />
      <ChoiceChip title={falseLabel} selected={value === false} onClick={() => onChange(false)} expands />
    </Choices>
  );
}

/** Nombre exact de pièces (Studio, 2, 3, 4, 5+) ou de chambres (1 à 5+) ; retoucher le choix l'enlève (RoomsPicker). */
export function RoomsChoice({ title, value, onChange, startsAtOne = false, guide }: {
  title: string;
  value: number | null;
  onChange: (value: number | null) => void;
  startsAtOne?: boolean;
} & Guided) {
  return (
    <Choices label={title} guide={guide}>
      {[1, 2, 3, 4, 5].map((count) => (
        <ChoiceChip key={count} title={count === 5 ? '5+' : count === 1 && !startsAtOne ? 'Studio' : String(count)}
          selected={value === count} onClick={() => onChange(value === count ? null : count)} expands />
      ))}
    </Choices>
  );
}

/** Classe DPE ou GES parmi A à G (couleurs officielles) ; retoucher la classe choisie l'efface (EnergyClassChoice). */
export function EnergyClassChoice({ title, value, onChange, guide }: {
  title: string;
  value: EnergyClass | null;
  onChange: (value: EnergyClass | null) => void;
} & Guided) {
  const id = useId();
  return (
    <div className="dsc-choices" role="group" aria-labelledby={id} data-guide={guide}>
      <FieldLabel id={id}>{title}</FieldLabel>
      <div className="energy-scale">
        {ENERGY_CLASSES.map((energy) => (
          <button
            key={energy}
            type="button"
            className={`energy-step${value !== null && value !== energy ? ' is-excluded' : ''}`}
            style={{ background: DPE_COLORS[energy], color: energy === 'D' || energy === 'E' ? '#0A1A44' : '#FFFFFF' }}
            aria-pressed={value === energy}
            aria-label={`${title} ${energy}`}
            onClick={() => onChange(value === energy ? null : energy)}
          >
            <span>{energy}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export type Indicator = {
  title: string;
  value: string | null;
  formula: string;
  isHypothesis?: boolean;
  /** Masqué sans donnée (hypothèse facultative) plutôt que « Données insuffisantes ». */
  hidesWhenMissing?: boolean;
};

/** Indicateurs calculés en direct : valeur et formule, ou « Données insuffisantes » (IndicatorsCard). */
export function IndicatorsCard({ rows, footnote }: { rows: Indicator[]; footnote?: string }) {
  return (
    <Card title="Indicateurs calculés">
      {rows.filter((row) => row.value !== null || !row.hidesWhenMissing).map((row) => (
        <div key={row.title} className="dpub-indicator">
          <div className="dpub-indicator-top">
            <span className="dpub-indicator-title">{row.title}</span>
            {row.isHypothesis && <span className="dpub-hypothesis">Hypothèse</span>}
            <span className={`dpub-indicator-value${row.value === null ? ' is-empty' : ''}`}>{row.value ?? '—'}</span>
          </div>
          <p className="dpub-indicator-formula">{row.value === null ? 'Données insuffisantes pour calculer cet indicateur.' : row.formula}</p>
        </div>
      ))}
      {footnote && <InfoLine>{footnote}</InfoLine>}
    </Card>
  );
}
