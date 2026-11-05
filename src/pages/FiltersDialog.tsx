import { useEffect, useRef, useState } from 'react';
import { Icon } from '../components/Icon';
import { NumberField } from '../components/NumberField';
import { PROPERTY_TYPE_LABELS } from '../lib/labels';
import {
  DEFAULT_DOWN_PAYMENT, defaultDraft, MODE_PROPERTY_TYPES, searchCenter, validPercent, type SearchDraft,
} from '../lib/search';

type Props = { open: boolean; draft: SearchDraft; onClose: () => void; onApply: (draft: SearchDraft) => void };

const ROOMS = [1, 2, 3, 4, 5];
const RADII = [5, 10, 20, 30, 50];

/** Filtres de la recherche, comme la feuille « Filtres » de l'app (critères principaux). */
export function FiltersDialog({ open, draft, onClose, onApply }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [local, setLocal] = useState(draft);

  useEffect(() => {
    const el = dialog.current;
    if (!el) return;
    if (open) {
      setLocal(draft);
      if (!el.open) el.showModal();
    } else if (el.open) {
      el.close();
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (patch: Partial<SearchDraft>) => setLocal((d) => ({ ...d, ...patch }));
  const rent = local.mode === 'rent';
  const invest = local.mode === 'invest';
  const hotel = local.mode === 'hotel';
  const percentError = (value: number | null) => (value !== null && !validPercent(value) ? 'Entre 0 et 100 %' : null);

  return (
    <dialog ref={dialog} className="filters-dialog" aria-labelledby="filtres-titre" onClose={onClose}
      onClick={(event) => { if (event.target === dialog.current) onClose(); }}>
      <form method="dialog" className="filters-form" onSubmit={(event) => { event.preventDefault(); onApply(local); }}>
        <header className="filters-header">
          <h2 id="filtres-titre">Filtres</h2>
          <button type="button" className="icon-button" aria-label="Fermer les filtres" onClick={onClose}><Icon name="x" /></button>
        </header>
        <div className="filters-body">
          {!hotel && (
            <fieldset>
              <legend>Type de bien</legend>
              <div className="chip-group">
                {MODE_PROPERTY_TYPES[local.mode].map((type) => {
                  const on = local.types.includes(type);
                  return (
                    <button key={type} type="button" className="chip" aria-pressed={on}
                      onClick={() => set({ types: on ? local.types.filter((t) => t !== type) : [...local.types, type] })}>
                      {PROPERTY_TYPE_LABELS[type]}
                    </button>
                  );
                })}
              </div>
              <p className="field-hint">Aucun type choisi : tous les types.</p>
            </fieldset>
          )}

          <fieldset>
            <legend>{rent ? 'Loyer par mois' : 'Budget'}</legend>
            <div className="field-pair">
              <NumberField label="Minimum" value={local.priceMin} onChange={(v) => set({ priceMin: v })} unit="€" />
              <NumberField label="Maximum" value={local.priceMax} onChange={(v) => set({ priceMax: v })} unit="€" />
            </div>
          </fieldset>

          <fieldset>
            <legend>Surface habitable</legend>
            <div className="field-pair">
              <NumberField label="Minimum" value={local.livingAreaMin} onChange={(v) => set({ livingAreaMin: v })} unit="m²" />
              <NumberField label="Maximum" value={local.livingAreaMax} onChange={(v) => set({ livingAreaMax: v })} unit="m²" />
            </div>
          </fieldset>

          <fieldset>
            <legend>{hotel ? 'Chambres' : 'Pièces'}</legend>
            <div className="chip-group">
              <button type="button" className="chip" aria-pressed={local.roomsMin === null} onClick={() => set({ roomsMin: null })}>Indifférent</button>
              {ROOMS.map((n) => (
                <button key={n} type="button" className="chip" aria-pressed={local.roomsMin === n} onClick={() => set({ roomsMin: n })}>
                  {n} et +
                </button>
              ))}
            </div>
          </fieldset>

          {searchCenter(local) && (
            <fieldset>
              <legend>Rayon autour du lieu</legend>
              <div className="chip-group">
                {RADII.map((km) => {
                  const on = (local.radiusKm ?? 10) === km;
                  return (
                    <button key={km} type="button" className="chip" aria-pressed={on} onClick={() => set({ radiusKm: km === 10 ? null : km })}>
                      {km} km
                    </button>
                  );
                })}
              </div>
            </fieldset>
          )}

          {invest && (
            <fieldset>
              <legend>Rentabilité</legend>
              <NumberField label="Apport" value={local.downPayment} onChange={(v) => set({ downPayment: v })} unit="€"
                placeholder={new Intl.NumberFormat('fr-FR').format(DEFAULT_DOWN_PAYMENT)}
                hint="Sert à calculer le cash-flow. Sans apport choisi : 50 000 €." />
              <div className="field-pair">
                <NumberField label="Rendement brut minimum" value={local.minGrossYieldPercent} allowDecimal unit="%"
                  onChange={(v) => set({ minGrossYieldPercent: v })} error={percentError(local.minGrossYieldPercent)} />
                <NumberField label="Rendement net minimum" value={local.minNetYieldPercent} allowDecimal unit="%"
                  onChange={(v) => set({ minNetYieldPercent: v })} error={percentError(local.minNetYieldPercent)} />
              </div>
              <NumberField label="Cash-flow minimum par mois" value={local.minMonthlyCashFlow} allowNegative unit="€"
                onChange={(v) => set({ minMonthlyCashFlow: v })} />
            </fieldset>
          )}
        </div>
        <footer className="filters-footer">
          <button type="button" className="btn btn-outline" onClick={() => setLocal({ ...defaultDraft(local.mode), place: local.place, chosen: local.chosen })}>
            Effacer
          </button>
          <button type="submit" className="btn btn-primary">Voir les résultats</button>
        </footer>
      </form>
    </dialog>
  );
}
