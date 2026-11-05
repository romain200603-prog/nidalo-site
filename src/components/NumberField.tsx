import { useId, useRef, type ChangeEvent } from 'react';

const grouping = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 });

/** « 250000 » → « 250 000 » (espaces fines insécables), comme les champs de nombres de l'app. */
export function groupDigits(raw: string, allowDecimal: boolean, allowNegative: boolean): string {
  const negative = allowNegative && /^\s*[-−]/.test(raw);
  let cleaned = raw.replace(/[^\d,.]/g, '').replace('.', ',');
  if (!allowDecimal) cleaned = cleaned.replace(/,.*/, '');
  const [whole, decimals] = cleaned.split(',');
  const digits = (whole ?? '').replace(/^0+(?=\d)/, '');
  const grouped = digits ? grouping.format(Number(digits)).replace(/\s/g, ' ') : '';
  const sign = negative ? '−' : '';
  if (decimals !== undefined) return `${sign}${grouped || '0'},${decimals.replace(/,/g, '').slice(0, 2)}`;
  return `${sign}${grouped}`;
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
};

export function NumberField({ label, value, onChange, unit, placeholder, allowDecimal = false, allowNegative = false, hint, error }: Props) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const shown = value === null ? '' : groupDigits(String(value).replace('.', ',').replace('-', '−'), allowDecimal, allowNegative);

  function handle(event: ChangeEvent<HTMLInputElement>) {
    const el = event.target;
    const caret = el.selectionStart ?? el.value.length;
    // Nombre de chiffres avant le curseur, pour le remettre au même endroit après le regroupement.
    const digitsBefore = el.value.slice(0, caret).replace(/[^\d,]/g, '').length;
    const text = groupDigits(el.value, allowDecimal, allowNegative);
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
          inputMode={allowDecimal ? 'decimal' : 'numeric'}
          autoComplete="off"
          placeholder={placeholder ?? 'Indifférent'}
          value={shown}
          onChange={handle}
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
