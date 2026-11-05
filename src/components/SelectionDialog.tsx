import { useEffect, useId, useRef, useState } from 'react';
import { Icon } from './Icon';
import type { IconName } from './iconPaths';

// Menu de sélection, comme DomiaSelectionSheet dans l'app : en-tête (icône, titre, précision, croix), liste
// d'options et bouton « Valider ». Le choix reste en attente jusqu'à « Valider » ; la croix, Échap ou un clic à
// l'extérieur ferment sans rien appliquer. Choix unique, ou multiple avec une ligne « tous » qui vide la sélection.
// En choix unique, un champ facultatif permet de saisir soi-même un montant.

export type SelectionOption<T> = { value: T; title: string; subtitle?: string; isAny?: boolean };

export type CustomAmount<T> = {
  placeholder: string;
  unit: string;
  /** Une décimale acceptée (« 6,5 » pour un rendement). */
  allowsDecimal?: boolean;
  /** Bouton +/− dans le champ (cash-flow) ; 0 est alors une valeur valable. */
  allowsNegative?: boolean;
  /** Valeur strictement inférieure à cette borne (100 pour un rendement en %). */
  upperBound?: number;
  makeValue: (amount: number) => T;
};

type Common = {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  icon?: IconName;
};

type Single<T> = Common & {
  multiple?: false;
  options: SelectionOption<T>[];
  selection: T;
  /** Titre d'une valeur actuelle absente de la liste (ajoutée en tête, « Valeur actuelle »). */
  currentTitle: (value: T) => string;
  customAmount?: CustomAmount<T>;
  onValidate: (value: T) => void;
};

type Multiple<T> = Common & {
  multiple: true;
  options: SelectionOption<T>[];
  selection: T[];
  anyTitle: string;
  anySubtitle?: string;
  onValidate: (values: T[]) => void;
};

/** Chiffres seulement, groupés par milliers, une décimale si permis : texte affiché et nombre lu. */
export function parseCustomAmount(text: string, allowsDecimal: boolean): { text: string; value: number | null } {
  const normalized = text.replace(/\./g, ',');
  const [integerPart = '', ...rest] = normalized.split(',');
  const integerDigits = integerPart.replace(/\D/g, '').slice(0, 10);
  const hasComma = allowsDecimal && rest.length > 0;
  const decimalDigits = hasComma ? rest.join('').replace(/\D/g, '').slice(0, 1) : '';
  if (!integerDigits && !hasComma) return { text: '', value: null };
  const integer = Number(integerDigits || '0');
  let formatted = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(integer);
  if (hasComma) formatted += `,${decimalDigits}`;
  return { text: formatted, value: integer + (decimalDigits ? Number(decimalDigits) / 10 : 0) };
}

function same<T>(a: T, b: T): boolean {
  return a === b || JSON.stringify(a) === JSON.stringify(b);
}

export function SelectionDialog<T>(props: Single<T> | Multiple<T>) {
  const { open, onClose, title, subtitle, icon } = props;
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [pending, setPending] = useState<T[]>([]);
  const [customText, setCustomText] = useState('');
  const [negative, setNegative] = useState(false);

  // À chaque ouverture, on repart de la valeur actuelle.
  useEffect(() => {
    const node = dialog.current;
    if (!node) return;
    if (open && !node.open) {
      setPending(props.multiple ? props.selection.filter((v) => props.options.some((o) => same(o.value, v))) : [props.selection]);
      setCustomText('');
      setNegative(false);
      node.showModal();
    } else if (!open && node.open) {
      node.close();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const options: SelectionOption<T>[] = props.multiple
    ? props.options
    : props.options.some((o) => same(o.value, props.selection))
      ? props.options
      : [{ value: props.selection, title: props.currentTitle(props.selection), subtitle: 'Valeur actuelle' }, ...props.options];

  const custom = props.multiple ? undefined : props.customAmount;

  function applyCustom(text: string, isNegative: boolean) {
    if (!custom) return;
    const parsed = parseCustomAmount(text, custom.allowsDecimal ?? false);
    setCustomText(parsed.text);
    let amount = parsed.value;
    const valid = amount !== null && parsed.text !== ''
      && (custom.allowsNegative ? true : amount > 0)
      && (custom.upperBound === undefined || amount < custom.upperBound);
    if (!valid || amount === null) {
      setPending([]);
      return;
    }
    if (isNegative) amount = -amount;
    setPending([custom.makeValue(amount)]);
  }

  function select(option: SelectionOption<T> | null) {
    setCustomText('');
    setNegative(false);
    if (props.multiple) {
      if (!option) return setPending([]);
      setPending((current) => current.some((v) => same(v, option.value))
        ? current.filter((v) => !same(v, option.value))
        : [...current, option.value]);
    } else if (option) {
      setPending([option.value]);
    }
  }

  function validate() {
    if (props.multiple) props.onValidate(pending);
    else if (pending.length) props.onValidate(pending[0]);
    onClose();
  }

  const isSelected = (value: T) => pending.some((v) => same(v, value));
  const canValidate = props.multiple || pending.length > 0;
  const rows: { key: string; option: SelectionOption<T> | null; title: string; subtitle?: string; selected: boolean; isAny: boolean }[] = [];
  if (props.multiple) rows.push({ key: 'tous', option: null, title: props.anyTitle, subtitle: props.anySubtitle, selected: pending.length === 0, isAny: true });
  options.forEach((option, index) => rows.push({
    key: String(index), option, title: option.title, subtitle: option.subtitle, selected: isSelected(option.value), isAny: option.isAny ?? false,
  }));

  return (
    <dialog
      ref={dialog}
      className="selection-dialog"
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        // Un clic sur le fond (hors de la feuille) ferme sans rien appliquer.
        if (event.target === dialog.current) onClose();
      }}
    >
      <div className="selection-sheet">
        <div className="selection-head">
          {icon && <span className="selection-icon"><Icon name={icon} /></span>}
          <div className="selection-titles">
            <h2 id={titleId}>{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button type="button" className="selection-close" aria-label="Fermer" onClick={onClose}><Icon name="x" /></button>
        </div>
        {custom && (
          <div className={`selection-custom${customText ? ' has-value' : ''}`}>
            <Icon name="pen" className="icon selection-custom-icon" />
            {custom.allowsNegative && (
              <button
                type="button"
                className="selection-sign"
                aria-label={negative ? 'Montant négatif, passer en positif' : 'Montant positif, passer en négatif'}
                onClick={() => {
                  setNegative(!negative);
                  applyCustom(customText, !negative);
                }}
              >
                {negative ? '−' : '+'}
              </button>
            )}
            <input
              type="text"
              inputMode={custom.allowsDecimal ? 'decimal' : 'numeric'}
              aria-label={custom.placeholder}
              placeholder={custom.placeholder}
              value={customText}
              onChange={(event) => applyCustom(event.target.value, negative)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && canValidate) {
                  event.preventDefault();
                  validate();
                }
              }}
            />
            <span className="selection-unit">{custom.unit}</span>
          </div>
        )}
        <div className="selection-list" role={props.multiple ? 'group' : 'radiogroup'} aria-labelledby={titleId}>
          {rows.map((row) => (
            <button
              key={row.key}
              type="button"
              role={props.multiple ? 'checkbox' : 'radio'}
              aria-checked={row.selected}
              className={`selection-row${row.selected ? ' is-selected' : ''}`}
              onClick={() => select(row.option)}
            >
              {row.isAny && <span className="selection-any"><Icon name="ban" /></span>}
              <span className="selection-text">
                <span className="selection-title">{row.title}</span>
                {row.subtitle && <span className="selection-subtitle">{row.subtitle}</span>}
              </span>
              <span className={`selection-mark${props.multiple ? ' is-square' : ''}`} aria-hidden="true">
                {row.selected && <Icon name="check" />}
              </span>
            </button>
          ))}
        </div>
        <div className="selection-foot">
          <button type="button" className="btn btn-primary" disabled={!canValidate} onClick={validate}>
            {props.multiple && pending.length ? `Valider (${pending.length})` : 'Valider'}
          </button>
        </div>
      </div>
    </dialog>
  );
}
