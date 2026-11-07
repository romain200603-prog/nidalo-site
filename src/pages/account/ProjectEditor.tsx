import { useEffect, useId, useLayoutEffect, useRef, useState, type ChangeEvent, type ReactNode } from 'react';
import { ChoiceChip, EnergyPicker, FeatureToggle, InfoLine, RadiusChoices, RoomsPicker } from '../../components/FilterControls';
import { Icon } from '../../components/Icon';
import { PlaceField } from '../../components/PlaceField';
import { PROJECT_KIND_LABELS, PROJECT_STEPS, STEP_LABELS, type ProjectKind } from '../../lib/account/project';
import {
  AMOUNT_INVALID, amountText, changeKind, completionOf, editableProjectStore, encodeCriteria, groupedInput, inputAmount, investmentLabel,
  INVESTMENT_ASSET_TYPES, isEmptyCriteria, isStepCompleted, KIND_DISPLAY_ORDER, KIND_SUBTITLES, loadEditableProject,
  NOTARY_FEE_RATE_EXISTING, NOTARY_FEE_RATE_NEW_BUILD, PERCENTAGE_ISSUE, projectIssues, projectToSave, RENTAL_TYPES, resetCategory,
  RESIDENTIAL_TYPES, sameProject, saveProject, STEP_HINTS, summaryRows, toggleStep, type Financing, type HotelCriteria,
  type InvestmentCriteria, type Project, type ProjectLocation, type RentalCriteria, type ResidentialCriteria,
} from '../../lib/account/projectEditor';
import { useStore } from '../../lib/account/session';
import { formatFraction, formatPrice } from '../../lib/format';
import { PROPERTY_TYPE_LABELS, SEARCH_MODES, type PropertyType } from '../../lib/labels';
import { scopeLabel, type HotelScope } from '../../lib/listingJson';
import { dayString } from '../../lib/listing/visits';
import { accountPath, PATHS } from '../../lib/paths';
import { placeShortName, placeSuggestions } from '../../lib/places';
import { draftFromProject } from '../../lib/projectSearch';
import { knownCityCenter, OUTDOOR_LABELS, OUTDOOR_SPACES, paramsFromDraft, type OutdoorSpace } from '../../lib/search';
import { ChoiceDialog, ProgressRing, ScreenHead } from './DesktopParts';
import { Spinner } from './parts';

// « Mon projet immobilier » sur ordinateur (Features/Profile/ProjectEditorView.swift et
// DesignSystem/Components/FormControls.swift), dans la colonne de 640 px : les quatre parcours aux critères propres,
// le résumé qui suit la saisie, « Montrer mon projet à mes contacts » et l'avancement du projet. Comme l'app, tout
// porte sur une copie, enregistrée d'un coup par « Enregistrer mon projet » (upsert de real_estate_projects,
// lib/account/projectEditor).

const SCOPES: HotelScope[] = ['wallsAndBusiness', 'wallsOnly', 'businessOnly'];
const KIND_ICONS = Object.fromEntries(SEARCH_MODES.map((mode) => [mode.mode, mode.icon])) as Record<ProjectKind, 'house' | 'key' | 'bars' | 'bed'>;

/** Suggestions de lieux de la carte Localisation (PlaceSuggestionList, scope .area, 5 au plus). */
const areaFetcher = (raw: string, _limit?: number, signal?: AbortSignal) => placeSuggestions(raw, 5, signal);

// MARK: - Contrôles (FormControls.swift)

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

function CardSection({ title, children, className }: { title: string; children: ReactNode; className?: string }) {
  const id = useId();
  return (
    <section className={`dsc-card ${className ?? ''}`} aria-labelledby={id}>
      <h2 id={id} className="dsc-card-title">{title}</h2>
      {children}
    </section>
  );
}

function FieldLabel({ children, id }: { children: ReactNode; id?: string }) {
  return <span id={id} className="field-label">{children}</span>;
}

/**
 * Montant ou nombre à la française (AmountField) : vide = non renseigné, milliers espacés pendant la frappe avec le
 * curseur à sa place, « % » saisi en pourcentage (`percent`), nombre entier pour une année, un étage ou des lots.
 */
function Amount({ label, value, onChange, unit, percent = false, allowsNegative = false, groups = true, integer = false, issue = null }: {
  label: string;
  value: number | null;
  onChange: (value: number | null) => void;
  unit: string;
  percent?: boolean;
  allowsNegative?: boolean;
  groups?: boolean;
  integer?: boolean;
  issue?: string | null;
}) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const caret = useRef<number | null>(null);
  const [text, setText] = useState(() => amountText(value, percent, groups));
  const [focused, setFocused] = useState(false);

  // Valeur changée ailleurs (pastille, Réinitialiser) : seulement hors saisie, comme l'app.
  useEffect(() => {
    if (focused) return;
    const typed = inputAmount(text, allowsNegative, percent);
    if (typed !== value) setText(amountText(value, percent, groups));
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
    const formatted = groupedInput(raw, allowsNegative, groups);
    caret.current = offsetAfterSignificant(formatted, count);
    setText(formatted);
    const parsed = inputAmount(formatted, allowsNegative, percent);
    onChange(parsed === null ? null : integer ? Math.trunc(parsed) : parsed);
  }

  const invalid = text.trim() !== '' && inputAmount(text, allowsNegative) === null;
  const message = invalid ? AMOUNT_INVALID : issue;
  return (
    <div className={`number-field dsc-amount${message ? ' has-error' : ''}`}>
      <label htmlFor={id}>{label}</label>
      <div className="number-input">
        <input ref={input} id={id} type="text" inputMode={allowsNegative ? 'text' : 'decimal'} autoComplete="off" placeholder="Non renseigné"
          value={text} onChange={handle} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
          aria-invalid={message ? true : undefined} aria-describedby={message ? `${id}-erreur` : undefined} />
        {unit && <span className="unit" aria-hidden="true">{unit}</span>}
      </div>
      {message && <p id={`${id}-erreur`} className="field-error">{message}</p>}
    </div>
  );
}

/** Libellé suivi de pastilles. */
function Choices({ label, layout = 'row', children }: { label: string; layout?: 'row' | 'types' | 'outdoor' | 'stack'; children: ReactNode }) {
  const id = useId();
  return (
    <div className="dsc-choices" role="group" aria-labelledby={id}>
      <FieldLabel id={id}>{label}</FieldLabel>
      <div className={`dsc-choices-${layout}`}>{children}</div>
    </div>
  );
}

/** Types de bien (TypeChoices) : pastilles cochées ou non. */
function TypeChoices({ options, selection, onChange, label = (type) => PROPERTY_TYPE_LABELS[type] }: {
  options: PropertyType[];
  selection: PropertyType[];
  onChange: (value: PropertyType[]) => void;
  label?: (type: PropertyType) => string;
}) {
  return (
    <div className="dsc-choices-types" role="group" aria-label="Types de bien">
      {options.map((type) => (
        <ChoiceChip key={type} title={label(type)} selected={selection.includes(type)} expands
          onClick={() => onChange(selection.includes(type) ? selection.filter((other) => other !== type) : [...selection, type])} />
      ))}
    </div>
  );
}

function FinancingPicker({ value, onChange }: { value: Financing | null; onChange: (value: Financing | null) => void }) {
  const choices: [Financing, string][] = [['bankLoan', 'Oui'], ['cash', 'Non'], ['undecided', 'À définir']];
  return (
    <Choices label="Financement bancaire">
      {choices.map(([choice, title]) => (
        <ChoiceChip key={choice} title={title} selected={value === choice} expands onClick={() => onChange(value === choice ? null : choice)} />
      ))}
    </Choices>
  );
}

/** Indifférent, oui ou (s'il existe) non (OptionalBoolPicker). */
function BoolChoices({ title, value, onChange, trueLabel, falseLabel }: {
  title: string;
  value: boolean | null;
  onChange: (value: boolean | null) => void;
  trueLabel: string;
  falseLabel: string | null;
}) {
  return (
    <Choices label={title}>
      <ChoiceChip title="Indifférent" selected={value === null} expands onClick={() => onChange(null)} />
      <ChoiceChip title={trueLabel} selected={value === true} expands onClick={() => onChange(true)} />
      {falseLabel !== null && <ChoiceChip title={falseLabel} selected={value === false} expands onClick={() => onChange(false)} />}
    </Choices>
  );
}

function OutdoorChoices({ value, onChange }: { value: OutdoorSpace[]; onChange: (value: OutdoorSpace[]) => void }) {
  return (
    <Choices label="Extérieur" layout="outdoor">
      {OUTDOOR_SPACES.map((space) => (
        <ChoiceChip key={space} title={OUTDOOR_LABELS[space]} selected={value.includes(space)} expands
          onClick={() => onChange(value.includes(space) ? value.filter((other) => other !== space) : [...value, space])} />
      ))}
    </Choices>
  );
}

/** Même jour le mois suivant, à la même heure (Calendar.date(byAdding: .month, value: 1, to: .now)). */
function oneMonthLater(from: Date): Date {
  const lastDay = new Date(from.getFullYear(), from.getMonth() + 2, 0).getDate();
  const next = new Date(from);
  next.setDate(1);
  next.setMonth(from.getMonth() + 1);
  next.setDate(Math.min(from.getDate(), lastDay));
  return next;
}

/** Date facultative (DateChoice) : interrupteur, puis le calendrier ; dans un mois par défaut. */
function DateChoice({ title, value, onChange }: { title: string; value: Date | null; onChange: (value: Date | null) => void }) {
  return (
    <div className="dsc-date-choice">
      <label className="feature-toggle">
        <span className="feature-title field-label">{title}</span>
        <input type="checkbox" role="switch" className="switch" checked={value !== null}
          onChange={(event) => onChange(event.target.checked ? oneMonthLater(new Date()) : null)} />
      </label>
      {value !== null && (
        <input type="date" className="date-input" aria-label={`${title} : date`} min={dayString(new Date())} value={dayString(value)}
          onChange={(event) => {
            const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(event.target.value);
            if (!match) return;
            // Le calendrier change le jour et garde l'heure de la date choisie.
            const next = new Date(value);
            next.setFullYear(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
            onChange(next);
          }} />
      )}
    </div>
  );
}

/** Carte « Localisation » : lieu avec suggestions, puis le rayon quand le lieu a un centre. */
function LocationCard({ location, onChange }: { location: ProjectLocation; onChange: (value: ProjectLocation) => void }) {
  const labelId = useId();
  const available = knownCityCenter(location.place) !== null || location.center !== null;
  return (
    <CardSection title="Localisation">
      <div className="dsc-field-block">
        <span id={labelId} className="field-label" aria-hidden="true">Ville, quartier ou code postal</span>
        <PlaceField value={location.place} label="Ville, quartier ou code postal" placeholder="Ex. : Lyon 2e, Villeurbanne, Annecy"
          className="dsc-place" fetcher={areaFetcher}
          // Texte modifié à la main : la commune choisie (et son centre) est oubliée.
          onChange={(text) => { if (text !== location.place) onChange({ ...location, place: text, center: null }); }}
          // Un arrondissement se cherche par son nom ; une commune ou un quartier, autour de son centre.
          onChoose={(place) => onChange({ ...location, place: placeShortName(place), center: place.kind === 'district' ? null : place.coordinate ?? null })} />
      </div>
      {available && <RadiusChoices value={location.radiusKilometers} onChange={(radius) => onChange({ ...location, radiusKilometers: radius })} />}
    </CardSection>
  );
}

/** Section dépliable « Plus de critères » ; repliée, elle garde les valeurs saisies. */
function MoreCriteria({ expanded, onToggle, children }: { expanded: boolean; onToggle: () => void; children: ReactNode }) {
  const id = useId();
  return (
    <section className="dsc-card" aria-labelledby={`${id}-titre`}>
      <button type="button" className="dsc-card-toggle" aria-expanded={expanded} aria-controls={expanded ? id : undefined} onClick={onToggle}>
        <span id={`${id}-titre`} className="dsc-card-title">Plus de critères</span>
        <Icon name={expanded ? 'chevronUp' : 'chevronDown'} />
      </button>
      {expanded && <div id={id} className="dsc-card-body">{children}</div>}
    </section>
  );
}

/** Puces de cash-flow minimum : ≥ 0, ≥ 200, ≥ 500 €/mois, ou montant personnalisé. */
function CashFlowChoices({ value, onChange }: { value: number | null; onChange: (value: number | null) => void }) {
  return (
    <div className="dsc-field-block">
      <Choices label="Cash-flow mensuel minimum (estimé)">
        {[0, 200, 500].map((amount) => (
          <ChoiceChip key={amount} title={`≥ ${formatPrice(amount)}`} selected={value === amount} expands
            onClick={() => onChange(value === amount ? null : amount)} />
        ))}
      </Choices>
      <Amount label="Personnalisé (négatif = effort d'épargne maximal)" value={value} onChange={onChange} unit="€/mois" allowsNegative />
    </div>
  );
}

// MARK: - Parcours

function ResidentialSections({ c, set, issues, more, onMore }: {
  c: ResidentialCriteria;
  set: (patch: Partial<ResidentialCriteria>) => void;
  issues: Record<string, string>;
  more: boolean;
  onMore: () => void;
}) {
  const types = c.propertyTypes;
  const onlyLand = types.length === 1 && types[0] === 'land';
  const rate = c.isNewBuild === true ? NOTARY_FEE_RATE_NEW_BUILD : NOTARY_FEE_RATE_EXISTING;
  return (
    <>
      <CardSection title="Budget et financement">
        <Amount label="Budget maximum d'achat" value={c.maxBudget} onChange={(v) => set({ maxBudget: v })} unit="€" />
        <Amount label="Apport personnel (profil, pour le calcul)" value={c.downPayment} onChange={(v) => set({ downPayment: v })} unit="€"
          issue={issues.downPayment} />
        <FinancingPicker value={c.financing} onChange={(v) => set({ financing: v })} />
        {c.financing === 'bankLoan' && (
          <Amount label="Mensualité maximale" value={c.maxMonthlyPayment} onChange={(v) => set({ maxMonthlyPayment: v })} unit="€/mois" />
        )}
        {c.maxBudget !== null && (
          // Frais de notaire de l'ancien ou du neuf, selon l'état choisi (hypothèses du moteur de calcul).
          <InfoLine>
            {`Budget total estimé avec frais de notaire (${formatFraction(rate)}) : ${formatPrice(Math.round((c.maxBudget * (1000 + rate * 1000)) / 1000))}.`}
          </InfoLine>
        )}
      </CardSection>
      <CardSection title="Type de bien">
        <TypeChoices options={RESIDENTIAL_TYPES} selection={types} onChange={(v) => set({ propertyTypes: v })} />
        {(types.length === 0 || types.includes('apartment') || types.includes('house')) && (
          <>
            <RoomsPicker title="Pièces" value={c.minRooms} onChange={(v) => set({ minRooms: v })} />
            <RoomsPicker title="Chambres" value={c.minBedrooms} onChange={(v) => set({ minBedrooms: v })} startsAtOne />
            <Amount label="Surface habitable minimale" value={c.minArea} onChange={(v) => set({ minArea: v })} unit="m²" />
          </>
        )}
        {(types.includes('house') || types.includes('land')) && (
          <Amount label={onlyLand ? 'Surface de terrain minimale' : 'Surface de terrain souhaitée'} value={c.minLandArea}
            onChange={(v) => set({ minLandArea: v })} unit="m²" />
        )}
        {types.includes('land') && (
          <>
            <FeatureToggle icon="fileText" title="Constructibilité documentée" checked={c.requiresDocumentedBuildability}
              onChange={(v) => set({ requiresDocumentedBuildability: v })} />
            <FeatureToggle icon="plug" title="Viabilisé" checked={c.requiresServiced} onChange={(v) => set({ requiresServiced: v })} />
            <InfoLine>Un terrain n'est présenté comme constructible que si un document d'urbanisme le justifie.</InfoLine>
          </>
        )}
      </CardSection>
      <LocationCard location={c.location} onChange={(location) => set({ location })} />
      <MoreCriteria expanded={more} onToggle={onMore}>
        <EnergyPicker value={c.worstEnergyClass} onChange={(v) => set({ worstEnergyClass: v })} />
        <BoolChoices title="État du bien" value={c.isNewBuild} onChange={(v) => set({ isNewBuild: v })} trueLabel="Neuf" falseLabel="Ancien" />
        {!onlyLand && (
          <>
            <Amount label="Construit à partir de" value={c.minYearBuilt} onChange={(v) => set({ minYearBuilt: v })} unit="" groups={false} integer />
            <div className="dsc-pair">
              <Amount label="Étage min." value={c.minFloor} onChange={(v) => set({ minFloor: v })} unit="" integer />
              <Amount label="Étage max." value={c.maxFloor} onChange={(v) => set({ maxFloor: v })} unit="" integer />
            </div>
            <FeatureToggle title="Hors rez-de-chaussée" checked={c.excludesGroundFloor} onChange={(v) => set({ excludesGroundFloor: v })} />
            <FeatureToggle title="Ascenseur" checked={c.requiresElevator} onChange={(v) => set({ requiresElevator: v })} />
            <FeatureToggle title="Parking ou garage" checked={c.requiresParking} onChange={(v) => set({ requiresParking: v })} />
            <OutdoorChoices value={c.outdoorSpaces} onChange={(v) => set({ outdoorSpaces: v })} />
          </>
        )}
      </MoreCriteria>
    </>
  );
}

function InvestmentSections({ c, set, issues, more, onMore }: {
  c: InvestmentCriteria;
  set: (patch: Partial<InvestmentCriteria>) => void;
  issues: Record<string, string>;
  more: boolean;
  onMore: () => void;
}) {
  return (
    <>
      <CardSection title="Budget et financement">
        <Amount label="Prix d'acquisition maximum" value={c.maxPrice} onChange={(v) => set({ maxPrice: v })} unit="€" />
        <Amount label="Apport personnel (sert au calcul du cash-flow)" value={c.downPayment} onChange={(v) => set({ downPayment: v })} unit="€"
          issue={issues.downPayment} />
        <FinancingPicker value={c.financing} onChange={(v) => set({ financing: v })} />
        {c.financing === 'bankLoan' && (
          <Amount label="Mensualité maximale" value={c.maxMonthlyPayment} onChange={(v) => set({ maxMonthlyPayment: v })} unit="€/mois" />
        )}
        <Amount label="Budget travaux" value={c.worksBudget} onChange={(v) => set({ worksBudget: v })} unit="€" />
      </CardSection>
      <CardSection title="Type d'actif">
        <TypeChoices options={INVESTMENT_ASSET_TYPES} selection={c.assetTypes} onChange={(v) => set({ assetTypes: v })} label={investmentLabel} />
        <ChoiceChip title="Immeuble mixte (logements et commerces)" selected={c.includesMixedBuildings} expands
          onClick={() => set({ includesMixedBuildings: !c.includesMixedBuildings })} />
        {(c.assetTypes.includes('building') || c.includesMixedBuildings) && (
          <Amount label="Nombre de lots minimum" value={c.minUnits} onChange={(v) => set({ minUnits: v })} unit="lots" integer />
        )}
      </CardSection>
      <CardSection title="Objectifs financiers">
        <Amount label="Rendement brut minimum" value={c.minGrossYield} onChange={(v) => set({ minGrossYield: v })} unit="%" percent
          issue={issues.minGrossYield} />
        <Amount label="Rendement net minimum (estimé)" value={c.minNetYield} onChange={(v) => set({ minNetYield: v })} unit="%" percent
          issue={issues.minNetYield} />
        <CashFlowChoices value={c.minMonthlyCashFlow} onChange={(v) => set({ minMonthlyCashFlow: v })} />
        <Amount label="Loyer actuel minimum (perçu, hors loyer potentiel)" value={c.minCurrentMonthlyRent}
          onChange={(v) => set({ minCurrentMonthlyRent: v })} unit="€/mois" />
        <InfoLine>
          Rendement brut : loyers annuels actuels hors charges ÷ prix. Rendement net et cash-flow sont estimés avec un crédit sur 20 ans à 3,5 %,
          votre apport, les charges et la taxe foncière de chaque annonce ; une annonce sans loyer connu n'est pas retenue.
        </InfoLine>
      </CardSection>
      <CardSection title="Situation locative">
        <BoolChoices title="Bien loué" value={c.leasedOnly ? true : null} onChange={(v) => set({ leasedOnly: v === true })}
          trueLabel="Loué uniquement" falseLabel={null} />
      </CardSection>
      <LocationCard location={c.location} onChange={(location) => set({ location })} />
      <MoreCriteria expanded={more} onToggle={onMore}>
        <Amount label="Taxe foncière maximale" value={c.maxAnnualPropertyTax} onChange={(v) => set({ maxAnnualPropertyTax: v })} unit="€/an" />
        <EnergyPicker value={c.worstEnergyClass} onChange={(v) => set({ worstEnergyClass: v })} />
      </MoreCriteria>
    </>
  );
}

function RentalSections({ c, set, more, onMore }: {
  c: RentalCriteria;
  set: (patch: Partial<RentalCriteria>) => void;
  more: boolean;
  onMore: () => void;
}) {
  const total = c.maxRent !== null && c.maxMonthlyCharges !== null ? c.maxRent + c.maxMonthlyCharges : null;
  return (
    <>
      <CardSection title="Budget locatif">
        <Amount label="Loyer mensuel maximum (hors charges)" value={c.maxRent} onChange={(v) => set({ maxRent: v })} unit="€/mois" />
        <Amount label="Charges mensuelles maximales" value={c.maxMonthlyCharges} onChange={(v) => set({ maxMonthlyCharges: v })} unit="€/mois" />
        {total !== null && <InfoLine>{`Budget mensuel total charges comprises : ${formatPrice(total)}.`}</InfoLine>}
      </CardSection>
      <CardSection title="Logement">
        <TypeChoices options={RENTAL_TYPES} selection={c.propertyTypes} onChange={(v) => set({ propertyTypes: v })} />
        <RoomsPicker title="Pièces" value={c.minRooms} onChange={(v) => set({ minRooms: v })} />
        <RoomsPicker title="Chambres" value={c.minBedrooms} onChange={(v) => set({ minBedrooms: v })} startsAtOne />
        <Amount label="Surface minimale" value={c.minArea} onChange={(v) => set({ minArea: v })} unit="m²" />
        <BoolChoices title="Ameublement" value={c.furnished} onChange={(v) => set({ furnished: v })} trueLabel="Meublé" falseLabel="Non meublé" />
        <DateChoice title="Entrée souhaitée au plus tard le" value={c.moveInBy} onChange={(v) => set({ moveInBy: v })} />
      </CardSection>
      <LocationCard location={c.location} onChange={(location) => set({ location })} />
      <MoreCriteria expanded={more} onToggle={onMore}>
        <FeatureToggle title="Ascenseur" checked={c.requiresElevator} onChange={(v) => set({ requiresElevator: v })} />
        <FeatureToggle title="Parking ou garage" checked={c.requiresParking} onChange={(v) => set({ requiresParking: v })} />
        <OutdoorChoices value={c.outdoorSpaces} onChange={(v) => set({ outdoorSpaces: v })} />
        <EnergyPicker value={c.worstEnergyClass} onChange={(v) => set({ worstEnergyClass: v })} />
        <BoolChoices title="Garant" value={c.hasGuarantor} onChange={(v) => set({ hasGuarantor: v })} trueLabel="Disponible" falseLabel="Sans garant" />
        <BoolChoices title="Dossier locataire" value={c.isApplicationReady} onChange={(v) => set({ isApplicationReady: v })} trueLabel="Prêt"
          falseLabel="À constituer" />
        <InfoLine>Préférences indicatives : aucun document n'est demandé ici, le dossier se gère dans votre compte.</InfoLine>
      </MoreCriteria>
    </>
  );
}

function HotelSections({ c, set, issues }: { c: HotelCriteria; set: (patch: Partial<HotelCriteria>) => void; issues: Record<string, string> }) {
  const occupancyIssue = c.minOccupancyRate !== null && (c.minOccupancyRate < 0 || c.minOccupancyRate > 1) ? PERCENTAGE_ISSUE : null;
  return (
    <>
      <CardSection title="Budget et financement">
        <Amount label="Budget total maximum (prix affiché, murs et fonds non additionnés)" value={c.maxBudget} onChange={(v) => set({ maxBudget: v })}
          unit="€" />
        <Amount label="Apport disponible (profil)" value={c.downPayment} onChange={(v) => set({ downPayment: v })} unit="€" issue={issues.downPayment} />
        <FinancingPicker value={c.financing} onChange={(v) => set({ financing: v })} />
        <Amount label="Budget travaux ou rénovation" value={c.worksBudget} onChange={(v) => set({ worksBudget: v })} unit="€" />
        <Amount label="Surface totale minimale" value={c.minArea} onChange={(v) => set({ minArea: v })} unit="m²" />
      </CardSection>
      <CardSection title="Établissement et exploitation">
        <Choices label="Nature de l'opération" layout="stack">
          {SCOPES.map((scope) => (
            <ChoiceChip key={scope} title={scopeLabel(scope)} selected={c.scope === scope} expands onClick={() => set({ scope: c.scope === scope ? null : scope })} />
          ))}
          <ChoiceChip title="À définir" selected={c.scope === null} expands onClick={() => set({ scope: null })} />
        </Choices>
        <Amount label="Chambres minimum" value={c.minRooms} onChange={(v) => set({ minRooms: v })} unit="chambres" integer />
        <Choices label="Classement minimum">
          {[1, 2, 3, 4, 5].map((stars) => (
            <ChoiceChip key={stars} title={`${stars} ★`} selected={c.minStars === stars} expands
              onClick={() => set({ minStars: c.minStars === stars ? null : stars })} />
          ))}
        </Choices>
        <Amount label="Chiffre d'affaires annuel minimum" value={c.minAnnualRevenue} onChange={(v) => set({ minAnnualRevenue: v })} unit="€/an" />
        <Amount label="EBITDA minimum" value={c.minEBITDA} onChange={(v) => set({ minEBITDA: v })} unit="€/an" />
        <Amount label="Résultat d'exploitation minimum" value={c.minOperatingIncome} onChange={(v) => set({ minOperatingIncome: v })} unit="€/an" />
        <Amount label="Taux d'occupation minimum" value={c.minOccupancyRate} onChange={(v) => set({ minOccupancyRate: v })} unit="%" percent
          issue={occupancyIssue} />
        <InfoLine>
          EBITDA : résultat avant intérêts, impôts, dépréciations et amortissements. Résultat d'exploitation : après dépréciations et
          amortissements. Valeurs déclarées par le vendeur ; un hôtel qui ne les communique pas est écarté dès qu'un minimum est fixé. Aucune
          rentabilité n'est tirée du chiffre d'affaires.
        </InfoLine>
      </CardSection>
      <LocationCard location={c.location} onChange={(location) => set({ location })} />
    </>
  );
}

// MARK: - Écran

/** Recherche réglée par le projet (router.startSearch(for:)). */
function searchUrl(project: Project): string {
  return `${PATHS.search}?${paramsFromDraft(draftFromProject(project.kind, encodeCriteria(project.criteria)))}`;
}

function Editor({ saved }: { saved: Project }) {
  const [draft, setDraft] = useState<Project>(saved);
  const [moreExpanded, setMoreExpanded] = useState(false);
  const [stepsExpanded, setStepsExpanded] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const stepsId = useId();

  const issues = projectIssues(draft.criteria, draft.kind);
  const hasIssues = Object.keys(issues).length > 0;
  const hasChanges = !sameProject(draft, saved);
  const steps = PROJECT_STEPS[draft.kind];
  const doneCount = steps.filter((step) => isStepCompleted(draft, step)).length;
  const back = accountPath();

  const criteria = <K extends keyof Project['criteria']>(key: K) => (patch: Partial<Project['criteria'][K]>) =>
    setDraft((current) => ({ ...current, criteria: { ...current.criteria, [key]: { ...current.criteria[key], ...patch } } }));

  /** Enregistre le projet ; la ville du projet suit le lieu de la catégorie. Le projet enregistré, ou null. */
  async function save(): Promise<Project | null> {
    if (hasIssues || saving) return null;
    const edited = projectToSave(draft);
    setDraft(edited);
    setSaving(true);
    const failure = await saveProject(edited);
    setSaving(false);
    setError(failure);
    return failure === null ? edited : null;
  }

  let sections: ReactNode;
  switch (draft.kind) {
    case 'buy':
      sections = <ResidentialSections c={draft.criteria.residential} set={criteria('residential')} issues={issues} more={moreExpanded}
        onMore={() => setMoreExpanded(!moreExpanded)} />;
      break;
    case 'invest':
      sections = <InvestmentSections c={draft.criteria.investment} set={criteria('investment')} issues={issues} more={moreExpanded}
        onMore={() => setMoreExpanded(!moreExpanded)} />;
      break;
    case 'rent':
      sections = <RentalSections c={draft.criteria.rental} set={criteria('rental')} more={moreExpanded} onMore={() => setMoreExpanded(!moreExpanded)} />;
      break;
    case 'hotel':
      sections = <HotelSections c={draft.criteria.hotel} set={criteria('hotel')} issues={issues} />;
      break;
  }

  return (
    <div className="dsc dsc-project-screen">
      <ScreenHead title="Mon projet immobilier" subtitle="Définissez vos critères pour trouver les biens qui vous correspondent"
        onBack={() => (hasChanges ? setLeaving(true) : window.location.assign(back))}>
        {!isEmptyCriteria(saved.criteria) && <span className="dsc-active"><span aria-hidden="true" />Projet actif</span>}
      </ScreenHead>

      <CardSection title="Votre projet">
        <div className="dsc-kinds">
          {KIND_DISPLAY_ORDER.map((kind) => {
            const selected = draft.kind === kind;
            return (
              <button key={kind} type="button" className="dsc-kind" aria-pressed={selected} aria-label={`${PROJECT_KIND_LABELS[kind]}, ${KIND_SUBTITLES[kind]}`}
                onClick={() => setDraft((current) => changeKind(current, kind))}>
                <Icon name={KIND_ICONS[kind]} />
                <span className="dsc-kind-title">{PROJECT_KIND_LABELS[kind]}</span>
                <span className="dsc-kind-subtitle">{KIND_SUBTITLES[kind]}</span>
                {selected && <span className="dsc-kind-check" aria-hidden="true"><Icon name="check" /></span>}
              </button>
            );
          })}
        </div>
      </CardSection>

      {sections}

      <CardSection title="Votre profil de recherche">
        <div className="dsc-summary">
          <dl className="dsc-summary-rows">
            {summaryRows(draft).map(([title, value]) => (
              <div key={title} className="dsc-summary-row">
                <dt>{title}</dt>
                <dd className={value === null ? 'is-empty' : undefined}>{value ?? 'Non renseigné'}</dd>
              </div>
            ))}
          </dl>
          <div className="dsc-summary-ring">
            <ProgressRing progress={completionOf(draft)} size={64} />
            <span>Projet complété</span>
          </div>
        </div>
      </CardSection>

      <CardSection title="Partage">
        <FeatureToggle title="Montrer mon projet à mes contacts" checked={draft.sharesWithContacts}
          onChange={(value) => setDraft((current) => ({ ...current, sharesWithContacts: value }))} />
        <p className="dsc-note">
          Visible par les personnes avec qui vous avez une conversation à deux : type de bien, budget, apport, financement, rendement et secteur.
          Jamais dans les groupes.
        </p>
      </CardSection>

      <section className="dsc-card" aria-labelledby={`${stepsId}-titre`}>
        <button type="button" className="dsc-card-toggle" aria-expanded={stepsExpanded} aria-controls={stepsExpanded ? stepsId : undefined}
          onClick={() => setStepsExpanded(!stepsExpanded)}>
          <span id={`${stepsId}-titre`} className="dsc-card-title">Avancement du projet</span>
          {/* En étapes, pour ne pas confondre avec le pourcentage de complétude du résumé. */}
          <span className="dsc-steps-count">{`${doneCount} étapes sur ${steps.length}`}</span>
          <Icon name={stepsExpanded ? 'chevronUp' : 'chevronDown'} />
        </button>
        {stepsExpanded && (
          <ul id={stepsId} className="dsc-steps">
            {steps.map((step) => {
              const done = isStepCompleted(draft, step);
              return (
                <li key={step}>
                  <button type="button" className="dsc-step" aria-pressed={done} onClick={() => setDraft((current) => toggleStep(current, step))}>
                    <span className={`dsc-step-mark${done ? ' is-done' : ''}`} aria-hidden="true">{done && <Icon name="check" />}</span>
                    <span className="dsc-step-text">
                      <span className="dsc-step-title">{STEP_LABELS[step]}</span>
                      <span className="dsc-step-hint">{STEP_HINTS[step]}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <div className="dsc-action-bar">
        {error ? (
          <p className="dsc-action-message" role="alert">{error}</p>
        ) : hasIssues ? (
          <p className="dsc-action-message">Corrigez les champs signalés en rouge pour enregistrer.</p>
        ) : completionOf(draft) > 0 ? (
          <button type="button" className="dsc-text-button" onClick={() => void save().then((project) => { if (project) window.location.assign(searchUrl(project)); })}>
            Rechercher des biens pour ce projet
          </button>
        ) : null}
        <div className="dsc-action-buttons">
          <button type="button" className="dsc-button dsc-button-light" onClick={() => setResetting(true)}>
            <Icon name="rotateCcw" />Réinitialiser
          </button>
          <button type="button" className="dsc-button dsc-button-primary" disabled={hasIssues || saving}
            onClick={() => void save().then((project) => { if (project) window.location.assign(back); })}>
            {saving ? <span className="spinner dsc-button-spinner" role="status" aria-label="Enregistrement" /> : <><Icon name="circleCheck" />Enregistrer mon projet</>}
          </button>
        </div>
      </div>

      <ChoiceDialog
        open={resetting}
        title={`Réinitialiser les critères ${PROJECT_KIND_LABELS[draft.kind].toLowerCase()} ?`}
        message="Les critères des autres parcours sont conservés."
        onClose={() => setResetting(false)}
        actions={[
          { label: 'Réinitialiser', onClick: () => { setDraft((current) => resetCategory(current)); setResetting(false); }, tone: 'danger' },
          { label: 'Annuler', onClick: () => setResetting(false) },
        ]}
      />
      <ChoiceDialog
        open={leaving}
        title="Enregistrer les modifications ?"
        onClose={() => setLeaving(false)}
        actions={[
          { label: 'Enregistrer', onClick: () => { setLeaving(false); void save().then((project) => { if (project) window.location.assign(back); }); }, tone: 'primary' },
          { label: 'Quitter sans enregistrer', onClick: () => window.location.assign(back), tone: 'danger' },
          { label: 'Continuer la saisie', onClick: () => setLeaving(false) },
        ]}
      />
    </div>
  );
}

export function ProjectEditor() {
  const state = useStore(editableProjectStore);
  useEffect(() => {
    void loadEditableProject();
  }, []);
  if (state.status === 'ready') return <Editor saved={state.project} />;
  return (
    <div className="dsc dsc-project-screen">
      <ScreenHead title="Mon projet immobilier" subtitle="Définissez vos critères pour trouver les biens qui vous correspondent" />
      {state.status === 'error' ? (
        // Projet illisible : rien n'est proposé à l'enregistrement, pour ne pas remplacer le projet du compte par un projet vide.
        <div className="dsc-empty">
          <Icon name="triangleAlert" />
          <h2>Projet indisponible</h2>
          <p>Impossible de charger votre projet. Réessayez dans un instant.</p>
          <button type="button" className="dsc-button dsc-button-primary" onClick={() => void loadEditableProject()}>Réessayer</button>
        </div>
      ) : <Spinner />}
    </div>
  );
}
