import { useCallback, useId } from 'react';
import { ChoiceChip, FeatureToggle, InfoLine } from '../../components/FilterControls';
import { Icon } from '../../components/Icon';
import { PlaceField } from '../../components/PlaceField';
import { scopeLabel } from '../../lib/listingJson';
import { placeSuggestions, streetSuggestions, type PlaceSuggestion } from '../../lib/places';
import {
  buildingOfDraft, CONDITIONS, emptyBuilding, emptyHotel, hotelOfDraft, HOTEL_SCOPES, isDwelling, isSubtypeSelected,
  mixedBuildingIncomplete, OFFICE_EQUIPMENT, PARKING_TYPES, postalCodeOf, cityOf, PUBLISH_CATEGORIES, rentalBanMessage, rentalBanYear,
  requiresEnergyDiagnostic, selectCategory, selectSubtype, subtypes, totalUnits,
  type Address, type BuildingDraft, type CommercialDraft, type EnergyDraft, type HotelDraft, type LandDraft, type OfficeDraft,
  type PublishCategory, type PublishDraft,
} from '../../lib/publish/draft';
import {
  CATEGORY_SUBTITLES, CATEGORY_TITLES, CONDITION_LABELS, OFFICE_EQUIPMENT_LABELS, PARKING_LABELS, PLU_ZONES,
} from '../../lib/publish/labels';
import { OUTDOOR_LABELS, OUTDOOR_SPACES } from '../../lib/search';
import {
  Amount, BoolChoices, Card, Choices, EnergyClassChoice, ErrorLine, FieldLabel, RoomsChoice, TextInput, type StepProps,
} from './controls';

// Étapes « Catégorie », « Informations principales » et « Caractéristiques » de Publier (PublishFlowView.swift).

/** Mêmes icônes que les modes de recherche (PublishCategory.icon). */
const CATEGORY_ICONS: Record<PublishCategory, 'house' | 'bars' | 'key' | 'bed'> = {
  residential: 'house',
  investment: 'bars',
  rental: 'key',
  hotel: 'bed',
};

export function CategoryStep({ draft, update, showsErrors }: StepProps) {
  const category = draft.category;
  return (
    <>
      <Card title="Que souhaitez-vous publier ?">
        <div className="dsc-kinds">
          {PUBLISH_CATEGORIES.map((option) => {
            const selected = category === option;
            return (
              <button key={option} type="button" className="dsc-kind" aria-pressed={selected}
                aria-label={`${CATEGORY_TITLES[option]}, ${CATEGORY_SUBTITLES[option]}`}
                onClick={() => update((current) => selectCategory(current, option))}>
                <Icon name={CATEGORY_ICONS[option]} />
                <span className="dsc-kind-title">{CATEGORY_TITLES[option]}</span>
                <span className="dsc-kind-subtitle">{CATEGORY_SUBTITLES[option]}</span>
                {selected && <span className="dsc-kind-check" aria-hidden="true"><Icon name="check" /></span>}
              </button>
            );
          })}
        </div>
      </Card>
      {category !== null && category !== 'hotel' && (
        <Card title={category === 'investment' ? 'Type d\'actif' : 'Type de bien'}>
          <div className="dsc-choices-stack" role="group" aria-label={category === 'investment' ? 'Type d\'actif' : 'Type de bien'}>
            {subtypes(category).map((option) => (
              <ChoiceChip key={option.title} title={option.title} selected={isSubtypeSelected(draft, option)} expands
                onClick={() => update((current) => selectSubtype(current, option))} />
            ))}
          </div>
          {showsErrors && draft.propertyType === null && <ErrorLine>Choisissez le type de bien.</ErrorLine>}
        </Card>
      )}
      {category === 'hotel' && (
        <InfoLine>Hôtel à vendre : murs et fonds, murs seuls ou fonds seul, à préciser à l'étape « Caractéristiques ».</InfoLine>
      )}
    </>
  );
}

// MARK: - Informations principales

const NO_ADDRESS: Address = { street: null, postalCode: '', city: '', inseeCode: null };

/** Communes du code postal ou du nom saisi (PlaceSuggestionList, scope .municipality). */
async function communeSuggestions(raw: string, limit = 6, signal?: AbortSignal): Promise<PlaceSuggestion[]> {
  const found = await placeSuggestions(raw, limit + 4, signal);
  return found.filter((place) => place.kind === 'municipality' || place.kind === 'district').slice(0, limit);
}

export const ADDRESS_NOT_FOUND = 'Adresse introuvable. Vérifiez le code postal et la ville.';

export function MainStep({ draft, update, showsErrors, addressError }: StepProps & { addressError: string | null }) {
  const postalCode = postalCodeOf(draft);
  const city = cityOf(draft);
  const rent = draft.transaction === 'rent';
  const streetFetcher = useCallback(
    (text: string, limit?: number, signal?: AbortSignal) => streetSuggestions(text, limit, signal, postalCode),
    [postalCode],
  );

  /** Code postal ou ville modifiés à la main : le code INSEE ne correspond plus, la position sera recalculée. */
  const setCommuneField = (field: 'postalCode' | 'city', value: string) => update((current) => {
    const address = current.address ?? NO_ADDRESS;
    if (address[field] === value) return current;
    return { ...current, address: { ...address, [field]: value, inseeCode: null }, coordinate: null };
  });
  const setStreet = (value: string) => update((current) => {
    const address = current.address ?? NO_ADDRESS;
    const street = value === '' ? null : value;
    if (address.street === street) return current;
    return { ...current, address: { ...address, street }, coordinate: null };
  });
  /**
   * Lieu choisi dans les suggestions : rue, code postal, ville et position réelle (BAN). Une commune choisie garde la
   * rue déjà saisie ; sa position sera recalculée avec la rue en continuant.
   */
  const fill = (place: PlaceSuggestion, keepsStreet: boolean) => update((current) => {
    const postal = place.postalCode ?? '';
    const town = place.city ?? place.name;
    if (postal === '' || town === '') return current;
    const typed = current.address?.street ?? null;
    const street = keepsStreet ? typed : place.kind === 'street' || place.kind === 'address' ? place.name : null;
    return {
      ...current,
      address: { street, postalCode: postal, city: town, inseeCode: place.inseeCode ?? null },
      coordinate: keepsStreet && typed !== null ? null : place.coordinate ?? null,
    };
  });

  const postalMissing = showsErrors && postalCode === '';
  const cityMissing = showsErrors && city === '';
  return (
    <>
      <Card title="Adresse du bien">
        <div className="dsc-field-block">
          <span className="dsc-label" aria-hidden="true">Rue et numéro (facultatif)</span>
          <PlaceField value={draft.address?.street ?? ''} label="Rue et numéro (facultatif)" placeholder="Non renseigné"
            className="dsc-place dsc-place-plain" fetcher={streetFetcher} onChange={setStreet} onChoose={(place) => fill(place, false)} />
        </div>
        <div className="dpub-postal-row">
          <div className={`dsc-field-block dpub-place${postalMissing ? ' has-error' : ''}`}>
            <span className="dsc-label" aria-hidden="true">Code postal</span>
            <PlaceField value={draft.address?.postalCode ?? ''} label="Code postal" placeholder="Non renseigné" className="dsc-place dsc-place-plain"
              fetcher={communeSuggestions} onChange={(text) => setCommuneField('postalCode', text)} onChoose={(place) => fill(place, true)} />
            {postalMissing && <ErrorLine>Obligatoire</ErrorLine>}
          </div>
          <div className={`dsc-field-block dpub-place${cityMissing ? ' has-error' : ''}`}>
            <span className="dsc-label" aria-hidden="true">Ville</span>
            <PlaceField value={draft.address?.city ?? ''} label="Ville" placeholder="Non renseigné" className="dsc-place dsc-place-plain"
              fetcher={communeSuggestions} onChange={(text) => setCommuneField('city', text)} onChoose={(place) => fill(place, true)} />
            {cityMissing && <ErrorLine>Obligatoire</ErrorLine>}
          </div>
        </div>
        {addressError && <ErrorLine>{addressError}</ErrorLine>}
        <FeatureToggle icon="pin" title="Afficher l'adresse exacte sur l'annonce" checked={draft.locationPrecision === 'exact'}
          onChange={(exact) => update((current) => ({ ...current, locationPrecision: exact ? 'exact' : 'approximate' }))} />
        <InfoLine>
          {draft.locationPrecision === 'exact'
            ? 'Le point exact sera visible sur la carte.'
            : 'Seul le quartier sera indiqué : un cercle approximatif apparaît sur la carte.'}
        </InfoLine>
      </Card>
      <Card title={rent ? 'Loyer' : 'Prix'}>
        <Amount label={rent ? 'Loyer mensuel hors charges' : 'Prix de vente'} value={draft.price} unit={rent ? '€/mois' : '€'}
          onChange={(price) => update((current) => ({ ...current, price }))} />
        {showsErrors && (draft.price ?? 0) <= 0 && <ErrorLine>{rent ? 'Indiquez le loyer.' : 'Indiquez le prix.'}</ErrorLine>}
        {draft.transaction === 'sale' && (
          <InfoLine>Prix affiché frais d'agence inclus le cas échéant. Charges, taxe foncière et revenus se renseignent à l'étape « Prix et finances ».</InfoLine>
        )}
      </Card>
    </>
  );
}

// MARK: - Caractéristiques

/** Détails d'actif du type choisi, modifiés à partir de la dernière version du brouillon. */
function useAssetSetters(update: StepProps['update']) {
  return {
    hotel: (change: Partial<HotelDraft>) => update((current) => ({
      ...current, assetDetails: { kind: 'hotel', hotel: { ...(hotelOfDraft(current) ?? emptyHotel()), ...change } },
    })),
    commercial: (change: Partial<CommercialDraft>) => update((current) => {
      const base: CommercialDraft = current.assetDetails?.kind === 'commercial'
        ? current.assetDetails.commercial : { frontageMeters: null, salesArea: null, leaseType: null, leaseEndDate: null };
      return { ...current, assetDetails: { kind: 'commercial', commercial: { ...base, ...change } } };
    }),
    office: (change: Partial<OfficeDraft>) => update((current) => {
      const base: OfficeDraft = current.assetDetails?.kind === 'office'
        ? current.assetDetails.office
        : { workstations: null, parkingSpaces: null, isAccessible: null, equipment: null, leaseType: null, leaseEndDate: null };
      return { ...current, assetDetails: { kind: 'office', office: { ...base, ...change } } };
    }),
    land: (change: Partial<LandDraft>) => update((current) => {
      const base: LandDraft = current.assetDetails?.kind === 'land'
        ? current.assetDetails.land : { zoning: null, buildability: null, isServiced: null, hasBuildings: null };
      return { ...current, assetDetails: { kind: 'land', land: { ...base, ...change } } };
    }),
    building: (change: Partial<BuildingDraft>) => update((current) => ({
      ...current, assetDetails: { kind: 'building', building: { ...(buildingOfDraft(current) ?? emptyBuilding()), ...change } },
    })),
  };
}

export function FeaturesStep({ draft, update, showsErrors }: StepProps) {
  const type = draft.propertyType;
  const set = <K extends keyof PublishDraft>(key: K, value: PublishDraft[K]) => update((current) => ({ ...current, [key]: value }));
  const setEnergy = (change: Partial<EnergyDraft>) => update((current) => ({ ...current, energy: { ...current.energy, ...change } }));
  const assets = useAssetSetters(update);
  const ban = rentalBanMessage(draft);
  const energy = draft.energy.energyClass;
  const banYear = rentalBanYear(energy);
  return (
    <>
      <Card title="Surfaces">
        {type !== 'land' && (
          <>
            <Amount label={type === 'apartment' || type === 'house' ? 'Surface habitable' : 'Surface totale'} value={draft.livingArea} unit="m²"
              onChange={(value) => set('livingArea', value)} />
            {showsErrors && (draft.livingArea ?? 0) <= 0 && <ErrorLine>Indiquez la surface.</ErrorLine>}
          </>
        )}
        {(type === 'house' || type === 'land' || type === 'building' || type === 'hotel') && (
          <>
            <Amount label={type === 'land' ? 'Surface du terrain' : 'Surface du terrain (facultatif)'} value={draft.landArea} unit="m²"
              onChange={(value) => set('landArea', value)} />
            {showsErrors && type === 'land' && (draft.landArea ?? 0) <= 0 && <ErrorLine>Indiquez la surface du terrain.</ErrorLine>}
          </>
        )}
      </Card>
      {(type === 'apartment' || type === 'house') && (
        <Card title="Pièces">
          <RoomsChoice title="Pièces" value={draft.rooms} onChange={(value) => set('rooms', value)} />
          {showsErrors && (draft.rooms ?? 0) <= 0 && <ErrorLine>Indiquez le nombre de pièces.</ErrorLine>}
          <RoomsChoice title="Chambres" value={draft.bedrooms} onChange={(value) => set('bedrooms', value)} startsAtOne />
        </Card>
      )}
      {(type === 'apartment' || type === 'office' || type === 'commercial') && (
        <Card title="Étage">
          <div className="dsc-pair">
            <Amount label="Étage (0 = RDC)" value={draft.floor} unit="" integer onChange={(value) => set('floor', value)} />
            <Amount label="Étages de l'immeuble" value={draft.totalFloors} unit="" integer onChange={(value) => set('totalFloors', value)} />
          </div>
          <BoolChoices title="Ascenseur" value={draft.hasElevator} onChange={(value) => set('hasElevator', value)} />
        </Card>
      )}
      {type === 'hotel' && <HotelFeatures hotel={hotelOfDraft(draft) ?? emptyHotel()} setHotel={assets.hotel} showsErrors={showsErrors} />}
      {type === 'commercial' && <CommercialFeatures draft={draft} setCommercial={assets.commercial} />}
      {type === 'office' && <OfficeFeatures draft={draft} setOffice={assets.office} />}
      {type === 'land' && <LandFeatures draft={draft} setLand={assets.land} />}
      {type === 'building' && <BuildingFeatures draft={draft} setBuilding={assets.building} showsErrors={showsErrors} />}
      {type !== 'land' && type !== 'parking' && (
        <>
          <Card title="Équipements">
            <Choices label="Extérieur" layout="outdoor">
              {OUTDOOR_SPACES.map((space) => {
                const selected = draft.outdoorSpaces.includes(space);
                return (
                  <ChoiceChip key={space} title={OUTDOOR_LABELS[space]} selected={selected} expands
                    onClick={() => set('outdoorSpaces', selected ? draft.outdoorSpaces.filter((other) => other !== space) : [...draft.outdoorSpaces, space])} />
                );
              })}
            </Choices>
            <Choices label="Stationnement" layout="wide">
              {PARKING_TYPES.map((parking) => (
                <ChoiceChip key={parking} title={PARKING_LABELS[parking]} selected={draft.parking === parking} expands onClick={() => set('parking', parking)} />
              ))}
            </Choices>
            <BoolChoices title="Cave" value={draft.hasCellar} onChange={(value) => set('hasCellar', value)} />
          </Card>
          <Card title="État et travaux">
            <Choices label="État général" layout="two">
              {CONDITIONS.map((condition) => (
                <ChoiceChip key={condition} title={CONDITION_LABELS[condition]} selected={draft.condition === condition} expands
                  onClick={() => set('condition', draft.condition === condition ? null : condition)} />
              ))}
            </Choices>
            <Amount label="Année de construction" value={draft.yearBuilt} unit="" integer groups={false} onChange={(value) => set('yearBuilt', value)} />
            <FeatureToggle icon="sparkles" title="Construction neuve (moins de 5 ans)" checked={draft.isNewBuild} onChange={(value) => set('isNewBuild', value)} />
            <Amount label="Travaux à prévoir (estimation)" value={draft.worksAmount} unit="€" onChange={(value) => set('worksAmount', value)} />
          </Card>
          <Card title="Visites">
            <FeatureToggle icon="video" title="J'accepte les visites en visio" checked={draft.acceptsVideoVisits === true}
              onChange={(value) => set('acceptsVideoVisits', value ? true : null)} />
          </Card>
        </>
      )}
      {requiresEnergyDiagnostic(type) && (
        <Card title="Performance énergétique">
          <EnergyClassChoice title="DPE (classe énergie)" value={energy} onChange={(value) => setEnergy({ energyClass: value })} />
          {showsErrors && energy === null && <ErrorLine>Le DPE est obligatoire pour ce type de bien.</ErrorLine>}
          <EnergyClassChoice title="GES (classe climat)" value={draft.energy.climateClass} onChange={(value) => setEnergy({ climateClass: value })} />
          <Amount label="Consommation (facultatif)" value={draft.energy.primaryEnergyConsumption} unit="kWh/m²/an" integer
            onChange={(value) => setEnergy({ primaryEnergyConsumption: value })} />
          {/* Décence énergétique : une classe interdite bloque la publication d'une location de logement. */}
          {ban !== null ? (
            <ErrorLine>{`${ban} Vous pouvez la proposer à la vente.`}</ErrorLine>
          ) : draft.transaction === 'rent' && isDwelling(type) && energy !== null && banYear !== null ? (
            <InfoLine>{`DPE ${energy} : location interdite à partir de ${banYear}, et loyer gelé.`}</InfoLine>
          ) : null}
        </Card>
      )}
    </>
  );
}

function HotelFeatures({ hotel, setHotel, showsErrors }: { hotel: HotelDraft; setHotel: (change: Partial<HotelDraft>) => void; showsErrors: boolean }) {
  return (
    <Card title="Établissement">
      <div className="dsc-field-block">
        <Choices label="Nature de la vente" layout="stack">
          {HOTEL_SCOPES.map((scope) => (
            <ChoiceChip key={scope} title={scopeLabel(scope)} selected={hotel.scope === scope} expands onClick={() => setHotel({ scope })} />
          ))}
        </Choices>
        <InfoLine>Murs et fonds ne sont jamais supposés vendus ensemble : choisissez ce que comprend le prix.</InfoLine>
      </div>
      <Amount label="Nombre de chambres" value={hotel.rooms} unit="chambres" integer onChange={(rooms) => setHotel({ rooms })} />
      {showsErrors && (hotel.rooms ?? 0) <= 0 && <ErrorLine>Indiquez le nombre de chambres.</ErrorLine>}
      <Choices label="Classement">
        {[1, 2, 3, 4, 5].map((stars) => (
          <ChoiceChip key={stars} title={`${stars} ★`} selected={hotel.stars === stars} expands
            onClick={() => setHotel({ stars: hotel.stars === stars ? null : stars })} />
        ))}
      </Choices>
    </Card>
  );
}

function CommercialFeatures({ draft, setCommercial }: { draft: PublishDraft; setCommercial: (change: Partial<CommercialDraft>) => void }) {
  const commercial = draft.assetDetails?.kind === 'commercial' ? draft.assetDetails.commercial : null;
  return (
    <Card title="Local commercial">
      <Amount label="Surface de vente (si distincte)" value={commercial?.salesArea ?? null} unit="m²" onChange={(salesArea) => setCommercial({ salesArea })} />
      <Amount label="Longueur de vitrine (facultatif)" value={commercial?.frontageMeters ?? null} unit="m"
        onChange={(frontageMeters) => setCommercial({ frontageMeters })} />
    </Card>
  );
}

function OfficeFeatures({ draft, setOffice }: { draft: PublishDraft; setOffice: (change: Partial<OfficeDraft>) => void }) {
  const office = draft.assetDetails?.kind === 'office' ? draft.assetDetails.office : null;
  const equipment = office?.equipment ?? [];
  return (
    <Card title="Bureaux">
      <Amount label="Postes de travail (facultatif)" value={office?.workstations ?? null} unit="postes" integer
        onChange={(workstations) => setOffice({ workstations })} />
      <Amount label="Places de stationnement (facultatif)" value={office?.parkingSpaces ?? null} unit="places" integer
        onChange={(parkingSpaces) => setOffice({ parkingSpaces })} />
      <BoolChoices title="Accessible PMR" value={office?.isAccessible ?? null} onChange={(isAccessible) => setOffice({ isAccessible })} />
      <Choices label="Équipements techniques">
        {OFFICE_EQUIPMENT.map((item) => {
          const selected = equipment.includes(item);
          return (
            <ChoiceChip key={item} title={OFFICE_EQUIPMENT_LABELS[item]} selected={selected} expands
              onClick={() => {
                const next = OFFICE_EQUIPMENT.filter((other) => (other === item ? !selected : equipment.includes(other)));
                setOffice({ equipment: next.length > 0 ? next : null });
              }} />
          );
        })}
      </Choices>
    </Card>
  );
}

function LandFeatures({ draft, setLand }: { draft: PublishDraft; setLand: (change: Partial<LandDraft>) => void }) {
  const id = useId();
  const land = draft.assetDetails?.kind === 'land' ? draft.assetDetails.land : null;
  const buildability = land?.buildability ?? null;
  return (
    <Card title="Terrain">
      {/* Grandes familles de zones du PLU : U, AU, A, N (la zone précise, « UB », reste libre). */}
      <TextInput label="Zone du PLU (facultatif)" value={land?.zoning ?? ''} maxLength={40} list={`${id}-zones`}
        onChange={(zoning) => setLand({ zoning: zoning === '' ? null : zoning })} />
      <datalist id={`${id}-zones`}>
        {PLU_ZONES.map((zone) => <option key={zone.value} value={zone.value}>{zone.detail}</option>)}
      </datalist>
      <BoolChoices title="Viabilisé" value={land?.isServiced ?? null} onChange={(isServiced) => setLand({ isServiced })} />
      <BoolChoices title="Construction existante" value={land?.hasBuildings ?? null} onChange={(hasBuildings) => setLand({ hasBuildings })} />
      <div className="dsc-field-block">
        <FieldLabel>Constructibilité documentée (facultatif)</FieldLabel>
        <Amount label="Surface constructible" value={buildability?.floorArea ?? null} unit="m²"
          onChange={(area) => setLand({ buildability: area === null ? null : { floorArea: area, documentReference: buildability?.documentReference ?? '' } })} />
        {/* Comme l'app : la référence n'existe qu'avec une surface constructible. */}
        <TextInput label="Référence du document (certificat d'urbanisme…)" value={buildability?.documentReference ?? ''} maxLength={120}
          disabled={buildability === null}
          onChange={(reference) => { if (buildability) setLand({ buildability: { floorArea: buildability.floorArea, documentReference: reference } }); }} />
        <InfoLine>Le terrain n'est présenté comme constructible qu'avec la surface et la référence du document d'urbanisme.</InfoLine>
      </div>
    </Card>
  );
}

function BuildingFeatures({ draft, setBuilding, showsErrors }: {
  draft: PublishDraft;
  setBuilding: (change: Partial<BuildingDraft>) => void;
  showsErrors: boolean;
}) {
  const building = buildingOfDraft(draft) ?? emptyBuilding();
  const total = totalUnits(building);
  return (
    <Card title={draft.isMixedBuilding ? 'Lots de l\'immeuble mixte' : 'Lots de l\'immeuble'}>
      <div className="dsc-pair">
        <Amount label="Logements" value={building.residentialUnits} unit="lots" integer onChange={(residentialUnits) => setBuilding({ residentialUnits })} />
        <Amount label="Commerces" value={building.commercialUnits} unit="lots" integer onChange={(commercialUnits) => setBuilding({ commercialUnits })} />
      </div>
      <Amount label="Lots vacants" value={building.vacantUnits} unit="lots" integer onChange={(vacantUnits) => setBuilding({ vacantUnits })} />
      {total !== null && <InfoLine>{`${total} lot${total > 1 ? 's' : ''} au total.`}</InfoLine>}
      {showsErrors && mixedBuildingIncomplete(draft) && <ErrorLine>Un immeuble mixte compte au moins un logement et un commerce.</ErrorLine>}
    </Card>
  );
}

