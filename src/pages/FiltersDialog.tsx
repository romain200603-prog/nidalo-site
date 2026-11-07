import { useEffect, useRef, useState } from 'react';
import {
  AmountField, CashFlowChoices, ChoiceChip, ChoiceGroup, DateChoice, EnergyPicker, FeatureToggle, FilterCard, HotelThresholds,
  InfoLine, OptionalBoolPicker, PERCENT_ISSUE, RadiusChoices, RANGE_ISSUE, RangeSliderField, RoomsRangePicker,
} from '../components/FilterControls';
import { Icon } from '../components/Icon';
import { ModeTabs } from '../components/ModeTabs';
import { PlaceField } from '../components/PlaceField';
import { formatPrice } from '../lib/format';
import { highlightsFor } from '../lib/highlights';
import { investmentTypeLabel } from '../lib/homeCriteria';
import { PROPERTY_TYPE_LABELS, type SearchMode } from '../lib/labels';
import { placeShortName, type PlaceSuggestion } from '../lib/places';
import {
  filterChips, MODE_PROPERTY_TYPES, OUTDOOR_LABELS, OUTDOOR_SPACES, paramsFromDraft, resetFilters, search, searchCenter,
  switchMode, type SearchDraft,
} from '../lib/search';

// « Filtres de recherche », comme Features/Search/SearchFiltersSheet.swift : localisation et rayon, catégorie,
// critères actifs retirables, puis les critères propres à chaque catégorie. Les changements portent sur des copies
// (une par catégorie), appliquées d'un coup par « Afficher N annonces ». Plein écran sur téléphone ; sur ordinateur,
// une page complète (demande de Romain du 7 novembre : « Plus de critères » ouvre une page, plus une fenêtre), sur
// deux colonnes, que le bouton Retour du navigateur referme comme une page.

/** Écran d'ordinateur : même seuil que le reste du site (lib/desktop). */
const DESKTOP_QUERY = '(min-width: 1024px)';
/** Marque de l'entrée d'historique ajoutée à l'ouverture de la page des critères. */
const HISTORY_MARK = 'nidaloCriteres';

export type DraftsByMode = Partial<Record<SearchMode, SearchDraft>>;

type Props = {
  open: boolean;
  draft: SearchDraft;
  /** Derniers critères des autres catégories, repris quand on change de catégorie. */
  remembered?: DraftsByMode;
  onClose: () => void;
  onApply: (draft: SearchDraft, drafts: DraftsByMode) => void;
  /** « Voir sur la carte » : applique les filtres et ouvre la carte. */
  onShowMap?: (draft: SearchDraft, drafts: DraftsByMode) => void;
  /** Recherche enregistrée : sa catégorie est fixe (pas d'onglets de catégorie). */
  fixedMode?: boolean;
  /** Favoris : le bouton compte les favoris retenus (« Afficher 3 biens »), sans interroger le serveur. */
  countAmong?: (draft: SearchDraft) => number;
};

/** Bornes et pas des fourchettes de prix (budgetBounds, budgetStep). */
const BUDGET: Record<SearchMode, { bounds: [number, number]; step: number }> = {
  buy: { bounds: [0, 1_500_000], step: 10_000 },
  rent: { bounds: [0, 3_000], step: 50 },
  invest: { bounds: [0, 2_000_000], step: 10_000 },
  hotel: { bounds: [0, 10_000_000], step: 50_000 },
};

/** Zones des plans locaux d'urbanisme (LocalSuggestions.zoning). */
const ZONES = [
  { value: 'U', detail: 'Zone urbaine' },
  { value: 'AU', detail: 'Zone à urbaniser' },
  { value: 'A', detail: 'Zone agricole' },
  { value: 'N', detail: 'Zone naturelle et forestière' },
];

/** Zones dont le code commence par la saisie (« A » → A, AU) ; toutes si le champ est vide ; aucune pour un code précis. */
function zoneSuggestions(text: string) {
  const typed = text.trim().toUpperCase();
  if (!typed) return ZONES;
  return ZONES.filter((zone) => zone.value.startsWith(typed) && zone.value !== typed);
}

const percentIssue = (value: number | null) => (value !== null && (value < 0 || value > 100) ? PERCENT_ISSUE : null);
const rangeIssue = (min: number | null, max: number | null) => (min !== null && max !== null && min > max ? RANGE_ISSUE : null);
const whole = (value: number | null) => (value === null ? null : Math.trunc(value));

function applyTitle(count: number | null, favorites = false): string {
  const [one, many, none] = favorites ? ['bien', 'biens', 'Aucun bien'] : ['annonce', 'annonces', 'Aucune annonce'];
  if (count === null) return `Afficher les ${many}`;
  if (count === 0) return none;
  return count === 1 ? `Afficher 1 ${one}` : `Afficher ${new Intl.NumberFormat('fr-FR').format(count)} ${many}`;
}

export function FiltersDialog({ open, draft, remembered, onClose, onApply, onShowMap, fixedMode = false, countAmong }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [mode, setMode] = useState<SearchMode>(draft.mode);
  const [drafts, setDrafts] = useState<DraftsByMode>({ [draft.mode]: draft });
  const [perSquareMeter, setPerSquareMeter] = useState(false);
  const [count, setCount] = useState<number | null>(null);
  const [zoningFocused, setZoningFocused] = useState(false);
  const working = drafts[mode] ?? draft;
  /** Entrée d'historique de la page des critères (ordinateur), et ce qu'il reste à faire quand elle est retirée. */
  const pushed = useRef(false);
  const pending = useRef<(() => void) | null>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  // Sur ordinateur, la page des critères a sa propre entrée d'historique : Retour (navigateur) la referme, sans
  // quitter la page d'où elle a été ouverte.
  useEffect(() => {
    if (!open || !window.matchMedia(DESKTOP_QUERY).matches) return;
    const state: unknown = window.history.state;
    window.history.pushState({ ...(state !== null && typeof state === 'object' ? state : {}), [HISTORY_MARK]: true }, '');
    pushed.current = true;
    const onPop = () => {
      if (!pushed.current) return;
      pushed.current = false;
      const next = pending.current ?? closeRef.current;
      pending.current = null;
      next();
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [open]);

  /** Ferme la page des critères puis fait `then` ; sur ordinateur, son entrée d'historique est d'abord retirée. */
  function leave(then: () => void) {
    if (pushed.current) {
      pending.current = then;
      window.history.back();
    } else {
      then();
    }
  }

  // À chaque ouverture, on repart des critères de la recherche.
  useEffect(() => {
    const node = dialog.current;
    if (!node) return;
    if (open) {
      setMode(draft.mode);
      setDrafts({ ...remembered, [draft.mode]: draft });
      setPerSquareMeter(draft.pricePerSquareMeterMin !== null || draft.pricePerSquareMeterMax !== null);
      if (!node.open) node.showModal();
    } else if (node.open) {
      node.close();
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // Nombre d'annonces, avec le même moteur que la liste, après une courte pause pendant la saisie.
  const key = paramsFromDraft(working).toString();
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setCount(null);
    const timer = window.setTimeout(() => {
      if (countAmong) {
        setCount(countAmong(working));
        return;
      }
      search(working, (row) => highlightsFor(row, working.mode === 'invest' ? working.downPayment : null))
        .then((results) => { if (!cancelled) setCount(results.length); })
        .catch(() => { if (!cancelled) setCount(null); });
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [open, key]); // eslint-disable-line react-hooks/exhaustive-deps

  const update = (patch: Partial<SearchDraft>) => setDrafts((all) => ({ ...all, [mode]: { ...(all[mode] ?? draft), ...patch } }));
  const replace = (next: SearchDraft) => setDrafts((all) => ({ ...all, [mode]: next }));

  function changeMode(next: SearchMode) {
    if (next === mode) return;
    // Chaque catégorie garde ses critères ; le lieu suit.
    const target = switchMode(working, next, drafts[next]);
    setDrafts((all) => ({ ...all, [next]: target }));
    setMode(next);
    setPerSquareMeter(target.pricePerSquareMeterMin !== null || target.pricePerSquareMeterMax !== null);
  }

  function choosePlace(place: PlaceSuggestion) {
    const name = placeShortName(place);
    update({ place: name, area: null, chosen: { kind: place.kind, name, postalCode: place.postalCode, inseeCode: place.inseeCode, coordinate: place.coordinate } });
  }

  function choosePriceMode(byArea: boolean) {
    if (byArea === perSquareMeter) return;
    setPerSquareMeter(byArea);
    // Un seul mode à la fois : l'autre fourchette est vidée.
    update(byArea ? { priceMin: null, priceMax: null } : { pricePerSquareMeterMin: null, pricePerSquareMeterMax: null });
  }

  const finalDrafts = (): DraftsByMode => ({ ...drafts, [mode]: working });
  const chips = filterChips(working);
  const buyOrRent = mode === 'buy' || mode === 'rent';
  const situation = working.leasedOnly ? 1 : working.vacantOnly ? 2 : 0;
  const types = MODE_PROPERTY_TYPES[mode];
  const onlyLand = working.types.length === 1 && working.types[0] === 'land';
  const zones = zoningFocused ? zoneSuggestions(working.zoning) : [];

  return (
    <dialog
      ref={dialog}
      className="filters-dialog"
      aria-labelledby="filtres-titre"
      onCancel={(event) => {
        event.preventDefault();
        leave(onClose);
      }}
      onClick={(event) => { if (event.target === dialog.current) leave(onClose); }}
    >
      <form className="filters-form" onSubmit={(event) => {
        event.preventDefault();
        const next = working;
        const all = finalDrafts();
        leave(() => onApply(next, all));
      }}>
        <div className="filters-scroll">
          <header className="filters-header">
            <button type="button" className="filters-back" aria-label="Fermer les filtres" onClick={() => leave(onClose)}><Icon name="arrowLeft" /></button>
            <div className="filters-titles">
              <h2 id="filtres-titre">Filtres de recherche</h2>
              <p>Affinez votre recherche selon vos critères</p>
            </div>
            <button type="button" className="filters-reset" aria-label="Réinitialiser les filtres de cette catégorie"
              title="Réinitialiser les filtres de cette catégorie"
              onClick={() => {
                replace(resetFilters(working));
                setPerSquareMeter(false);
              }}>
              <Icon name="rotateCcw" />
            </button>
          </header>

          <div className="filters-page">
            <FilterCard
              title="Localisation"
              action={onShowMap && (
                <button type="button" className="filters-map-link" onClick={() => {
                  const next = working;
                  const all = finalDrafts();
                  leave(() => onShowMap(next, all));
                }}>
                  <Icon name="map" />Voir sur la carte
                </button>
              )}
            >
              <PlaceField
                className="filters-place"
                label="Ville, quartier ou code postal"
                placeholder="Ville, quartier ou code postal"
                value={working.place}
                onChange={(text) => update({ place: text, area: null })}
                onChoose={choosePlace}
              />
              {searchCenter(working) && <RadiusChoices value={working.radiusKm} onChange={(radiusKm) => update({ radiusKm })} />}
            </FilterCard>

            {!fixedMode && <ModeTabs mode={mode} onChange={changeMode} className="mode-tabs-search filters-modes" />}

            {chips.length > 0 && (
              <div className="filters-active" role="group" aria-label="Critères appliqués">
                {chips.map((chip) => (
                  <button key={chip.id} type="button" className="active-chip" aria-label={`Retirer le critère ${chip.label}`}
                    onClick={() => replace(chip.remove(working))}>
                    {chip.label}
                    <Icon name="x" />
                  </button>
                ))}
              </div>
            )}

            <div className="filters-cards">
              {mode !== 'hotel' && (
                <FilterCard title={mode === 'invest' ? "Type d'actif" : 'Type de bien'}>
                  <div className="choice-grid">
                    {types.map((type) => {
                      const on = working.types.includes(type);
                      return (
                        <ChoiceChip key={type} title={mode === 'invest' ? investmentTypeLabel(type) : PROPERTY_TYPE_LABELS[type]} selected={on} expands
                          onClick={() => update({ types: on ? working.types.filter((t) => t !== type) : [...working.types, type] })} />
                      );
                    })}
                  </div>
                  {mode === 'invest' && (
                    <ChoiceChip title="Immeuble mixte (logements et commerces)" selected={working.mixedBuilding} expands
                      onClick={() => update({ mixedBuilding: !working.mixedBuilding })} />
                  )}
                </FilterCard>
              )}

              <FilterCard title={mode === 'rent' ? 'Loyer mensuel' : 'Budget'}>
                {mode === 'buy' && (
                  <div className="segmented" role="radiogroup" aria-label="Mode de prix">
                    <button type="button" role="radio" aria-checked={!perSquareMeter} onClick={() => choosePriceMode(false)}>Prix total</button>
                    <button type="button" role="radio" aria-checked={perSquareMeter} onClick={() => choosePriceMode(true)}>Prix au m²</button>
                  </div>
                )}
                {mode === 'buy' && perSquareMeter ? (
                  <>
                    <RangeSliderField min={working.pricePerSquareMeterMin} max={working.pricePerSquareMeterMax}
                      onChange={(min, max) => update({ pricePerSquareMeterMin: min, pricePerSquareMeterMax: max })}
                      bounds={[0, 15_000]} step={100} unit="€/m²" minTitle="Prix au m² min." maxTitle="Prix au m² max." />
                    <InfoLine>Prix ÷ surface habitable, ou ÷ surface du terrain pour un terrain ; une annonce sans surface est écartée.</InfoLine>
                  </>
                ) : (
                  <RangeSliderField min={working.priceMin} max={working.priceMax}
                    onChange={(min, max) => update({ priceMin: min, priceMax: max })}
                    bounds={BUDGET[mode].bounds} step={BUDGET[mode].step} unit={mode === 'rent' ? '€/mois' : '€'}
                    minTitle={mode === 'rent' ? 'Loyer min. (HC)' : 'Prix minimum'} maxTitle={mode === 'rent' ? 'Loyer max. (HC)' : 'Prix maximum'} />
                )}
              </FilterCard>

              {mode !== 'hotel' && (
                <FilterCard title="Surface et pièces">
                  <div className="field-pair">
                    <AmountField label="Surface min." value={working.livingAreaMin} onChange={(v) => update({ livingAreaMin: v })} unit="m²" decimals />
                    <AmountField label="Surface max." value={working.livingAreaMax} onChange={(v) => update({ livingAreaMax: v })} unit="m²" decimals />
                  </div>
                  {!onlyLand && (
                    <>
                      <RoomsRangePicker title="Pièces" min={working.roomsMin} max={working.roomsMax}
                        onChange={(roomsMin, roomsMax) => update({ roomsMin, roomsMax })} />
                      <RoomsRangePicker title="Chambres" min={working.bedroomsMin} max={working.bedroomsMax} startsAtOne
                        onChange={(bedroomsMin, bedroomsMax) => update({ bedroomsMin, bedroomsMax })} />
                    </>
                  )}
                  <EnergyPicker value={working.worstEnergyClass} onChange={(worstEnergyClass) => update({ worstEnergyClass })} />
                </FilterCard>
              )}

              {mode === 'buy' && (
                <>
                  <FilterCard title="État du bien">
                    <OptionalBoolPicker title="Neuf ou ancien" value={working.isNewBuild} onChange={(isNewBuild) => update({ isNewBuild })}
                      trueLabel="Neuf" falseLabel="Ancien" />
                  </FilterCard>
                  {working.types.includes('land') && (
                    <FilterCard title="Terrain">
                      <FeatureToggle icon="fileText" title="Constructibilité documentée" checked={working.requiresDocumentedBuildability}
                        onChange={(requiresDocumentedBuildability) => update({ requiresDocumentedBuildability })} />
                      <FeatureToggle icon="plug" title="Viabilisé" checked={working.requiresServiced} onChange={(requiresServiced) => update({ requiresServiced })} />
                      <div className="text-field">
                        <label htmlFor="filtre-zone-plu">Zone du PLU</label>
                        <input id="filtre-zone-plu" type="text" placeholder="Ex. : UB" autoComplete="off" autoCapitalize="characters" spellCheck={false}
                          maxLength={12} value={working.zoning} onChange={(event) => update({ zoning: event.target.value })}
                          onFocus={() => setZoningFocused(true)} onBlur={() => setZoningFocused(false)} />
                        {zones.length > 0 && (
                          <ul className="zone-list" aria-label="Suggestions">
                            {zones.map((zone) => (
                              <li key={zone.value}>
                                <button type="button" onMouseDown={(event) => event.preventDefault()}
                                  onClick={() => { update({ zoning: zone.value }); setZoningFocused(false); }}>
                                  <Icon name="map" />
                                  <span><strong>{zone.value}</strong><small>{zone.detail}</small></span>
                                </button>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                      <InfoLine>Constructible seulement si un document d'urbanisme le justifie ; un terrain qui ne renseigne pas ces informations est écarté par ces critères.</InfoLine>
                    </FilterCard>
                  )}
                </>
              )}

              {mode === 'rent' && (
                <FilterCard title="Charges et disponibilité">
                  <OptionalBoolPicker title="Ameublement" value={working.furnished} onChange={(furnished) => update({ furnished })}
                    trueLabel="Meublé" falseLabel="Non meublé" />
                  <AmountField label="Charges mensuelles maximales" value={working.maxMonthlyCharges} onChange={(v) => update({ maxMonthlyCharges: v })} unit="€/mois" decimals />
                  {working.priceMax !== null && working.maxMonthlyCharges !== null && (
                    <InfoLine>Budget mensuel total charges comprises : {formatPrice(working.priceMax + working.maxMonthlyCharges)} au plus.</InfoLine>
                  )}
                  <DateChoice title="Disponible au plus tard le" value={working.availableBy} onChange={(availableBy) => update({ availableBy })} />
                  <InfoLine>Une annonce qui n'indique pas ses charges ou sa date de disponibilité est écartée par ces critères.</InfoLine>
                </FilterCard>
              )}

              {mode === 'invest' && (
                <>
                  <FilterCard title="Rentabilité">
                    <AmountField label="Rendement brut minimum" value={working.minGrossYieldPercent} onChange={(v) => update({ minGrossYieldPercent: v })}
                      unit="%" decimals issue={percentIssue(working.minGrossYieldPercent)} />
                    <AmountField label="Rendement net minimum (estimé)" value={working.minNetYieldPercent} onChange={(v) => update({ minNetYieldPercent: v })}
                      unit="%" decimals issue={percentIssue(working.minNetYieldPercent)} />
                    <CashFlowChoices value={working.minMonthlyCashFlow} onChange={(minMonthlyCashFlow) => update({ minMonthlyCashFlow })} />
                    <AmountField label="Apport (pour le calcul du cash-flow)" value={working.downPayment} onChange={(v) => update({ downPayment: v })} unit="€" decimals />
                    <InfoLine>
                      Rendement brut : loyers annuels actuels hors charges ÷ prix. Net et cash-flow sont estimés avec un crédit sur 20 ans à
                      3,5 % ; sans apport saisi, l'apport couvre les frais de notaire. Une annonce sans loyer connu n'est pas retenue.
                    </InfoLine>
                  </FilterCard>
                  <FilterCard title="Situation locative et charges">
                    <div className="choice-row" role="group" aria-label="Situation locative">
                      {(['Indifférent', 'Loué', 'Libre'] as const).map((title, index) => (
                        // Seule la situation change : type d'actif et immeuble mixte restent.
                        <ChoiceChip key={title} title={title} selected={situation === index} expands
                          onClick={() => update({ leasedOnly: index === 1, vacantOnly: index === 2 })} />
                      ))}
                    </div>
                    <FeatureToggle title="Loyer déclaré par le vendeur uniquement" checked={working.requiresDeclaredRent}
                      onChange={(requiresDeclaredRent) => update({ requiresDeclaredRent })} />
                    <AmountField label="Loyer actuel minimum (perçu, hors loyer potentiel)" value={working.minCurrentMonthlyRent}
                      onChange={(v) => update({ minCurrentMonthlyRent: v })} unit="€/mois" decimals />
                    <AmountField label="Charges de copropriété maximales" value={working.maxAnnualCharges} onChange={(v) => update({ maxAnnualCharges: v })} unit="€/an" decimals />
                    <AmountField label="Taxe foncière maximale" value={working.maxAnnualPropertyTax} onChange={(v) => update({ maxAnnualPropertyTax: v })} unit="€/an" decimals />
                    <AmountField label="Travaux maximum" value={working.maxWorksAmount} onChange={(v) => update({ maxWorksAmount: v })} unit="€" decimals />
                  </FilterCard>
                  {(working.types.includes('building') || working.mixedBuilding) && (
                    <FilterCard title="Immeuble">
                      <AmountField label="Nombre de lots minimum" value={working.minUnits} onChange={(v) => update({ minUnits: whole(v) })} unit="lots" />
                      <AmountField label="Lots vacants maximum" value={working.maxVacantUnits} onChange={(v) => update({ maxVacantUnits: whole(v) })} unit="lots" />
                      <InfoLine>D'après les lots déclarés (logements et commerces) ; un immeuble sans détail de ses lots est écarté par ces critères.</InfoLine>
                    </FilterCard>
                  )}
                </>
              )}

              {mode === 'hotel' && (
                <FilterCard title="Établissement et exploitation">
                  <HotelThresholds values={working} onChange={update} />
                  <AmountField label="Surface totale minimale" value={working.livingAreaMin} onChange={(v) => update({ livingAreaMin: v })} unit="m²" decimals />
                </FilterCard>
              )}

              {buyOrRent && (
                <FilterCard title="Étage">
                  <div className="field-pair">
                    <AmountField label="Étage min." value={working.floorMin} onChange={(v) => update({ floorMin: whole(v) })} unit="" />
                    <AmountField label="Étage max." value={working.floorMax} onChange={(v) => update({ floorMax: whole(v) })} unit=""
                      issue={rangeIssue(working.floorMin, working.floorMax)} />
                  </div>
                  <FeatureToggle icon="building" title="Hors rez-de-chaussée" checked={working.excludesGroundFloor}
                    onChange={(excludesGroundFloor) => update({ excludesGroundFloor })} />
                </FilterCard>
              )}
              {mode !== 'hotel' && (
                <FilterCard title="Année de construction">
                  <div className="field-pair">
                    <AmountField label="À partir de" value={working.yearBuiltMin} onChange={(v) => update({ yearBuiltMin: whole(v) })} unit="" groups={false} />
                    <AmountField label="Jusqu'en" value={working.yearBuiltMax} onChange={(v) => update({ yearBuiltMax: whole(v) })} unit="" groups={false}
                      issue={rangeIssue(working.yearBuiltMin, working.yearBuiltMax)} />
                  </div>
                </FilterCard>
              )}
              <FilterCard title="Équipements">
                {mode !== 'hotel' && (
                  <FeatureToggle icon="arrowUp" title="Ascenseur" checked={working.requiresElevator} onChange={(requiresElevator) => update({ requiresElevator })} />
                )}
                <FeatureToggle icon="car" title="Parking ou garage" checked={working.requiresParking} onChange={(requiresParking) => update({ requiresParking })} />
                {buyOrRent && (
                  <ChoiceGroup label="Extérieur" layout="grid-small">
                    {OUTDOOR_SPACES.map((space) => {
                      const on = working.outdoorSpaces.includes(space);
                      return (
                        <ChoiceChip key={space} title={OUTDOOR_LABELS[space]} selected={on} expands
                          onClick={() => update({ outdoorSpaces: on ? working.outdoorSpaces.filter((s) => s !== space) : [...working.outdoorSpaces, space] })} />
                      );
                    })}
                  </ChoiceGroup>
                )}
              </FilterCard>
            </div>
          </div>
        </div>

        <div className="filters-apply">
          <button type="submit" className="btn btn-primary">
            <Icon name="search" />
            <span aria-live="polite">{applyTitle(count, countAmong !== undefined)}</span>
          </button>
        </div>
      </form>
    </dialog>
  );
}
