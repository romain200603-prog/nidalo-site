import { useId, useRef, type ChangeEvent, type ClipboardEvent } from 'react';

const grouping = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 });

/** « 250000 » → « 250 000 » (espaces fines insécables), comme les champs de nombres de l'app ; sans espaces pour
 * une année (`groups` à false). */
export function groupDigits(raw: string, allowDecimal: boolean, allowNegative: boolean, groups = true): string {
  const negative = allowNegative && /^\s*[-−]/.test(raw);
  let cleaned = raw.replace(/[^\d,.]/g, '').replace('.', ',');
  if (!allowDecimal) cleaned = cleaned.replace(/,.*/, '');
  const [whole, decimals] = cleaned.split(',');
  const digits = (whole ?? '').replace(/^0+(?=\d)/, '');
  const grouped = digits ? !groups ? digits : grouping.format(Number(digits)).replace(/\s/g, ' ') : '';
  const sign = negative ? '−' : '';
  if (decimals !== undefined) return `${sign}${grouped || '0'},${decimals.replace(/,/g, '').slice(0, 2)}`;
  return `${sign}${grouped}`;
}

/**
 * Montant collé avec des points de milliers (GroupedNumberInput.pastedAmount de l'app, n° 242) : « 250.000 » → « 250000 »,
 * « 1.250.000 € » → « 1250000 », « 250.000,50 » → « 250000,50 ». Seulement 1 à 3 chiffres suivis de groupes « point + 3
 * chiffres », avec une virgule et des décimales éventuelles ; sinon le texte est rendu tel quel (« 62.5 », « 12.34.56 »).
 * Appliquée au seul collage, dans les champs en euros.
 */
export function pastedAmount(text: string): string {
  const trimmed = text.replace(/^[\s\u0085€]+|[\s\u0085€]+$/g, '');
  return /^[0-9]{1,3}(\.[0-9]{3})+(,[0-9]+)?$/.test(trimmed) ? trimmed.replace(/\./g, '') : text;
}

export function parseGrouped(text: string): number | null {
  const negative = /^\s*[-−]/.test(text);
  const cleaned = text.replace(/[^\d,]/g, '').replace(',', '.');
  if (!cleaned || cleaned === '.') return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? (negative ? -n : n) : null;
}

type Props = {
  label: string;
  value: number | null;
  onChange: (value: number | null) => void;
  unit?: string;
  placeholder?: string;
  allowDecimal?: boolean;
  allowNegative?: boolean;
  hint?: string;
  error?: string | null;
  /** Milliers espacés (« 250 000 ») ; à false pour une année. */
  groups?: boolean;
};

export function NumberField({ label, value, onChange, unit, placeholder, allowDecimal = false, allowNegative = false, hint, error, groups = true }: Props) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const shown = value === null ? '' : groupDigits(String(value).replace('.', ',').replace('-', '−'), allowDecimal, allowNegative, groups);

  function handle(event: ChangeEvent<HTMLInputElement>) {
    const el = event.target;
    apply(el.value, el.selectionStart ?? el.value.length);
  }

  /** Montant en euros collé avec des points de milliers : « 250.000 » donne 250 000 (n° 242) ; les autres collages ne changent pas. */
  function paste(event: ClipboardEvent<HTMLInputElement>) {
    if (!unit?.includes('€')) return;
    const pasted = event.clipboardData.getData('text');
    const amount = pastedAmount(pasted);
    if (amount === pasted) return;
    event.preventDefault();
    const el = event.currentTarget;
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? start;
    apply(`${el.value.slice(0, start)}${amount}${el.value.slice(end)}`, start + amount.length);
  }

  /** Texte tapé ou collé : regroupé, valeur transmise, curseur remis après les mêmes chiffres. */
  function apply(raw: string, caret: number) {
    // Nombre de chiffres avant le curseur, pour le remettre au même endroit après le regroupement.
    const digitsBefore = raw.slice(0, caret).replace(/[^\d,]/g, '').length;
    const text = groupDigits(raw, allowDecimal, allowNegative, groups);
    const next = parseGrouped(text);
    onChange(text === '' || text === '−' ? null : next);
    requestAnimationFrame(() => {
      const node = input.current;
      if (!node) return;
      let seen = 0;
      let position = node.value.length;
      for (let i = 0; i < node.value.length; i++) {
        if (seen === digitsBefore) { position = i; break; }
        if (/[\d,]/.test(node.value[i])) seen++;
      }
      if (seen === digitsBefore && digitsBefore === node.value.replace(/[^\d,]/g, '').length) position = node.value.length;
      node.setSelectionRange(position, position);
    });
  }

  return (
    <div className={`number-field${error ? ' has-error' : ''}`}>
      <label htmlFor={id}>{label}</label>
      <div className="number-input">
        <input
          ref={input}
          id={id}
          type="text"
          inputMode={allowNegative ? 'text' : allowDecimal ? 'decimal' : 'numeric'}
          autoComplete="off"
          placeholder={placeholder ?? 'Indifférent'}
          value={shown}
          onChange={handle}
          onPaste={paste}
          aria-invalid={error ? true : undefined}
          aria-describedby={error || hint ? `${id}-aide` : undefined}
          maxLength={16}
        />
        {unit && <span className="unit" aria-hidden="true">{unit}</span>}
      </div>
      {(error || hint) && <p id={`${id}-aide`} className={error ? 'field-error' : 'field-hint'}>{error ?? hint}</p>}
    </div>
  );
}
