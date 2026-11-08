import { ChoiceChip, DateChoice, InfoLine, PERCENT_ISSUE } from '../../components/FilterControls';
import { formatFraction, formatPrice } from '../../lib/format';
import { scopeLabel } from '../../lib/listingJson';
import {
  buildingOfDraft, CHARGES_MODES, currentAnnualRent, depositWarning, emptyBuilding, emptyHotel, emptyRental, FEE_PAYERS, feesNeedPayer,
  flatRateWarning, grossYield, hotelOfDraft, HOTEL_AMENITIES, HOTEL_STATUSES, isDwelling, LEASE_TYPES, potentialGrossYield,
  pricePerSquareMeter, rentalChargesLabel, rentIncludingCharges, saleChargesLabel, syncBuildingRent, tenantShareWarning,
  type BuildingDraft, type FeePayer, type HotelDraft, type LeaseType, type PublishDraft, type RentalDraft,
} from '../../lib/publish/draft';
import { CHARGES_MODE_LABELS, HOTEL_AMENITY_LABELS, HOTEL_STATUS_LABELS, LEASE_LABELS } from '../../lib/publish/labels';
import { Amount, BoolChoices, Card, Choices, ErrorLine, IndicatorsCard, type StepProps, type Update } from './controls';

// Étape « Prix et finances » (PublishFinanceStep.swift) : champs propres à la catégorie et indicateurs calculés
// seulement quand les données le permettent (jamais de rendement net ni de cash-flow saisis par le vendeur).

const perSquareMeter = (value: number | null) => (value === null ? null : `${formatPrice(value)}/m²`);
const round2 = (value: number) => Math.round(value * 100) / 100;

function setters(update: Update) {
  const set = <K extends keyof PublishDraft>(key: K, value: PublishDraft[K]) => update((current) => ({ ...current, [key]: value }));
  const rental = (change: Partial<RentalDraft>) => update((current) => ({ ...current, rentalInfo: { ...(current.rentalInfo ?? emptyRental()), ...change } }));
  const hotel = (change: Partial<HotelDraft>) => update((current) => ({
    ...current, assetDetails: { kind: 'hotel', hotel: { ...(hotelOfDraft(current) ?? emptyHotel()), ...change } },
  }));
  // Loyers d'un immeuble : reportés dans les informations locatives, comme l'app.
  const building = (change: Partial<BuildingDraft>) => update((current) => syncBuildingRent({
    ...current, assetDetails: { kind: 'building', building: { ...(buildingOfDraft(current) ?? emptyBuilding()), ...change } },
  }));
  /** Bail d'un local ou de bureaux (type et échéance), rangé dans leurs détails. */
  const lease = (change: { leaseType?: LeaseType | null; leaseEndDate?: string | null }) => update((current) => {
    const details = current.assetDetails;
    if (details?.kind === 'commercial') return { ...current, assetDetails: { kind: 'commercial', commercial: { ...details.commercial, ...change } } };
    if (details?.kind === 'office') return { ...current, assetDetails: { kind: 'office', office: { ...details.office, ...change } } };
    return current;
  });
  return { set, rental, hotel, building, lease };
}

function leaseOf(draft: PublishDraft): { leaseType: LeaseType | null; leaseEndDate: string | null } {
  const details = draft.assetDetails;
  if (details?.kind === 'commercial') return { leaseType: details.commercial.leaseType, leaseEndDate: details.commercial.leaseEndDate };
  if (details?.kind === 'office') return { leaseType: details.office.leaseType, leaseEndDate: details.office.leaseEndDate };
  return { leaseType: null, leaseEndDate: null };
}

function LeaseTypeChoice({ value, onChange }: { value: LeaseType | null; onChange: (value: LeaseType | null) => void }) {
  return (
    <Choices label="Type de bail">
      {LEASE_TYPES.map((lease) => (
        <ChoiceChip key={lease} title={LEASE_LABELS[lease]} selected={value === lease} expands onClick={() => onChange(value === lease ? null : lease)} />
      ))}
    </Choices>
  );
}

/** `isPro` : compte professionnel, qui indique ses honoraires (mention obligatoire de ses annonces). */
export function FinanceStep({ isPro, ...props }: StepProps & { isPro: boolean }) {
  return (
    <>
      {categoryCards(props)}
      {isPro && <FeesCard {...props} />}
    </>
  );
}

function categoryCards(props: StepProps) {
  switch (props.draft.category) {
    case 'rental': return <RentalCards {...props} />;
    case 'investment': return <InvestmentCards {...props} />;
    case 'hotel': return <HotelCards {...props} />;
    default: return <SaleCards {...props} />;
  }
}

// MARK: - Honoraires (professionnels)

function FeesCard({ draft, update, showsErrors }: StepProps) {
  const { set } = setters(update);
  const rent = draft.transaction === 'rent';
  const payerLabel = (payer: FeePayer) => (payer === 'buyer' ? (rent ? 'Locataire' : 'Acquéreur') : (rent ? 'Propriétaire' : 'Vendeur'));
  return (
    <Card title="Honoraires d'agence">
      <Amount label="Honoraires TTC" value={draft.agencyFeesAmount} unit="€" onChange={(value) => set('agencyFeesAmount', value)} />
      <Choices label="À la charge de">
        {FEE_PAYERS.map((payer) => (
          <ChoiceChip key={payer} title={payerLabel(payer)} selected={draft.agencyFeesPaidBy === payer} expands
            onClick={() => set('agencyFeesPaidBy', draft.agencyFeesPaidBy === payer ? null : payer)} />
        ))}
      </Choices>
      {showsErrors && feesNeedPayer(draft) && <ErrorLine>Indiquez qui paie les honoraires.</ErrorLine>}
      <InfoLine>
        {rent ? 'Montant TTC. Pour le locataire, indiquez sa part, état des lieux compris.' : "Montant TTC. Si l'acquéreur les paie, le prix affiché les inclut."}
      </InfoLine>
    </Card>
  );
}

// MARK: - Vente résidentielle

function SaleCards({ draft, update }: StepProps) {
  const { set } = setters(update);
  const land = draft.propertyType === 'land';
  return (
    <>
      <Card title="Prix et charges">
        <Amount label="Prix de vente" value={draft.price} unit="€" onChange={(value) => set('price', value)} />
        {draft.propertyType === 'apartment' && (
          <Amount label="Charges de copropriété" value={draft.monthlyCharges} unit="€/mois" onChange={(value) => set('monthlyCharges', value)} />
        )}
        {!land && <Amount label="Taxe foncière" value={draft.annualPropertyTax} unit="€/an" onChange={(value) => set('annualPropertyTax', value)} />}
      </Card>
      <IndicatorsCard rows={[{
        title: land ? 'Prix au m² de terrain' : 'Prix au m²',
        value: perSquareMeter(pricePerSquareMeter(draft)),
        formula: land ? 'Prix ÷ surface du terrain' : 'Prix ÷ surface habitable',
      }]} />
    </>
  );
}

// MARK: - Location

function RentalCards({ draft, update }: StepProps) {
  const { set, rental: setRental, lease: setLease } = setters(update);
  const rental = draft.rentalInfo ?? emptyRental();
  const total = rentIncludingCharges(draft);
  const warning = depositWarning(draft, formatPrice);
  const flatRate = flatRateWarning(draft);
  // Ameublement, plafond du dépôt et liste légale des pièces : règles de la location d'un logement seulement.
  const dwelling = isDwelling(draft.propertyType);
  const business = draft.propertyType === 'commercial' || draft.propertyType === 'office';
  return (
    <>
      <Card title="Loyer et charges">
        <Amount label="Loyer mensuel hors charges" value={draft.price} unit="€/mois" onChange={(value) => set('price', value)} />
        <Choices label="Charges">
          {CHARGES_MODES.map((mode) => (
            <ChoiceChip key={mode} title={CHARGES_MODE_LABELS[mode]} selected={rental.chargesMode === mode} expands
              onClick={() => setRental({ chargesMode: rental.chargesMode === mode ? null : mode })} />
          ))}
        </Choices>
        <Amount label={rentalChargesLabel(rental.chargesMode)} value={draft.monthlyCharges} unit="€/mois" onChange={(value) => set('monthlyCharges', value)} />
        <InfoLine>Provisions : régularisées chaque année selon les dépenses réelles. Forfait : montant fixe, sans régularisation.</InfoLine>
        {flatRate && <InfoLine>{flatRate}</InfoLine>}
        {total !== null && <InfoLine>{`Loyer charges comprises : ${formatPrice(total)}/mois.`}</InfoLine>}
        <Amount label="Dépôt de garantie" value={rental.securityDeposit} unit="€" onChange={(securityDeposit) => setRental({ securityDeposit })} />
        {warning && <InfoLine>{warning}</InfoLine>}
      </Card>
      <Card title="Conditions de location">
        {dwelling && (
          <BoolChoices title="Ameublement" value={rental.isFurnished} trueLabel="Meublé" falseLabel="Non meublé"
            onChange={(isFurnished) => setRental({ isFurnished })} />
        )}
        {business && <LeaseTypeChoice value={leaseOf(draft).leaseType} onChange={(leaseType) => setLease({ leaseType })} />}
        <DateChoice title="Disponible à partir du" value={rental.availableFrom} onChange={(availableFrom) => setRental({ availableFrom })} />
        <Amount label="Durée du bail" value={rental.leaseDurationMonths} unit="mois" integer
          onChange={(leaseDurationMonths) => setRental({ leaseDurationMonths })} />
        {dwelling && (
          <InfoLine>Pièces de candidature : seuls l'identité, le domicile, l'activité professionnelle, les ressources et les éléments du garant peuvent être demandés (liste légale).</InfoLine>
        )}
      </Card>
    </>
  );
}

// MARK: - Investissement

function InvestmentCards({ draft, update }: StepProps) {
  const { set, rental: setRental, building: setBuilding, lease: setLease } = setters(update);
  const type = draft.propertyType;
  const rental = draft.rentalInfo ?? emptyRental();
  const leased = draft.rentalInfo?.isLeased ?? null;
  const building = buildingOfDraft(draft) ?? emptyBuilding();
  const business = type === 'commercial' || type === 'office';
  const annualRent = currentAnnualRent(draft);
  const gross = grossYield(draft);
  const potential = potentialGrossYield(draft);
  const shareWarning = tenantShareWarning(draft);

  const setLeased = (isLeased: boolean) => update((current) => {
    const info = { ...(current.rentalInfo ?? emptyRental()), isLeased };
    if (!isLeased) {
      info.currentMonthlyRent = null;
      info.leaseEndDate = null;
      info.recoverableMonthlyCharges = null;
    }
    return { ...current, rentalInfo: info };
  });

  /** Charges récupérables : la part des charges remboursée par le ou les locataires, comptée dans la rentabilité. */
  const tenantShare = (label: string) => (
    <>
      <Amount label={label} value={rental.recoverableMonthlyCharges} unit="€/mois"
        onChange={(recoverableMonthlyCharges) => setRental({ recoverableMonthlyCharges })} />
      <InfoLine>{shareWarning ?? 'Charges récupérables, remboursées chaque mois par le locataire. Elles comptent dans la rentabilité.'}</InfoLine>
    </>
  );

  return (
    <>
      <Card title="Prix et charges">
        <Amount label="Prix de vente" value={draft.price} unit="€" onChange={(value) => set('price', value)} />
        <Amount label={saleChargesLabel(type)} value={draft.monthlyCharges} unit="€/mois" onChange={(value) => set('monthlyCharges', value)} />
        <Amount label="Taxe foncière" value={draft.annualPropertyTax} unit="€/an" onChange={(value) => set('annualPropertyTax', value)} />
      </Card>
      {type === 'building' ? (
        <Card title="Loyers de l'immeuble">
          <div className="dsc-pair">
            <Amount label="Surface logements" value={building.residentialArea} unit="m²" onChange={(residentialArea) => setBuilding({ residentialArea })} />
            <Amount label="Surface commerces" value={building.commercialArea} unit="m²" onChange={(commercialArea) => setBuilding({ commercialArea })} />
          </div>
          <Amount label="Loyers annuels actuels des logements (HC)" value={building.residentialAnnualRent} unit="€/an"
            onChange={(residentialAnnualRent) => setBuilding({ residentialAnnualRent })} />
          <Amount label="Loyers annuels actuels des commerces (HC)" value={building.commercialAnnualRent} unit="€/an"
            onChange={(commercialAnnualRent) => setBuilding({ commercialAnnualRent })} />
          <InfoLine>Loyers effectivement perçus aujourd'hui, hors charges récupérables. Les loyers espérés se saisissent à part, comme hypothèse.</InfoLine>
          {tenantShare('Part des charges payée par les locataires')}
        </Card>
      ) : (
        <Card title="Situation locative">
          <div className="dsc-choices-row" role="group" aria-label="Situation locative">
            <ChoiceChip title="Loué" selected={leased === true} expands onClick={() => setLeased(true)} />
            <ChoiceChip title="Libre" selected={leased === false} expands onClick={() => setLeased(false)} />
          </div>
          {leased === true && (business ? (
            <>
              {/* Loyer annuel saisi pour un local ou des bureaux, enregistré en mensuel (comme les autres annonces). */}
              <Amount label="Loyer annuel actuel hors charges" value={rental.currentMonthlyRent === null ? null : rental.currentMonthlyRent * 12} unit="€/an"
                onChange={(annual) => setRental({ currentMonthlyRent: annual === null ? null : round2(annual / 12) })} />
              {tenantShare('Part des charges payée par le locataire')}
              <LeaseTypeChoice value={leaseOf(draft).leaseType} onChange={(leaseType) => setLease({ leaseType })} />
              <DateChoice title="Échéance du bail" value={leaseOf(draft).leaseEndDate} onChange={(leaseEndDate) => setLease({ leaseEndDate })} />
            </>
          ) : (
            <>
              <Amount label="Loyer mensuel actuel hors charges" value={rental.currentMonthlyRent} unit="€/mois"
                onChange={(currentMonthlyRent) => setRental({ currentMonthlyRent })} />
              {tenantShare('Part des charges payée par le locataire')}
              <DateChoice title="Fin du bail en cours" value={rental.leaseEndDate} onChange={(leaseEndDate) => setRental({ leaseEndDate })} />
            </>
          ))}
        </Card>
      )}
      <Card title="Loyer potentiel (hypothèse)">
        <Amount label="Loyer mensuel envisagé hors charges" value={rental.potentialMonthlyRent} unit="€/mois"
          onChange={(potentialMonthlyRent) => setRental({ potentialMonthlyRent })} />
        <InfoLine>Hypothèse du vendeur, affichée séparément des loyers actuels et signalée comme telle sur l'annonce.</InfoLine>
      </Card>
      <IndicatorsCard
        rows={[
          { title: 'Prix au m²', value: perSquareMeter(pricePerSquareMeter(draft)), formula: 'Prix ÷ surface' },
          {
            title: 'Loyers annuels actuels', value: annualRent === null ? null : `${formatPrice(annualRent)}/an`,
            formula: type === 'building' ? 'Somme des loyers par usage' : 'Loyer actuel × 12',
          },
          { title: 'Rendement brut actuel', value: gross === null ? null : formatFraction(gross), formula: 'Loyers annuels actuels hors charges récupérables ÷ prix de vente × 100' },
          {
            title: 'Rendement potentiel (hypothèse)', value: potential === null ? null : formatFraction(potential),
            formula: 'Loyer envisagé × 12 ÷ prix de vente × 100', isHypothesis: true, hidesWhenMissing: true,
          },
        ]}
        footnote="Rendement net et cash-flow s'affichent sur l'annonce, estimés avec les hypothèses de NIDALO (crédit sur 20 ans à 3,5 %), jamais saisis par le vendeur."
      />
    </>
  );
}

// MARK: - Hôtel

function HotelCards({ draft, update }: StepProps) {
  const { set, hotel: setHotel, rental: setRental } = setters(update);
  const hotel = hotelOfDraft(draft) ?? emptyHotel();
  const rental = draft.rentalInfo ?? emptyRental();
  /** Valeur déclarée par le vendeur (provenance « Vendeur »). */
  const sourced = (value: number | null) => (value === null ? null : { value, origin: 'seller' as const });
  const occupancy = hotel.occupancyRate?.value ?? null;
  const amenities = hotel.amenities ?? [];
  return (
    <>
      <Card title="Prix">
        <Amount label="Prix de vente" value={draft.price} unit="€" onChange={(value) => set('price', value)} />
        {hotel.scope !== null && (
          <InfoLine>{`Le prix comprend : ${scopeLabel(hotel.scope).toLowerCase()}. Murs et fonds ne sont jamais additionnés.`}</InfoLine>
        )}
        <Amount label="Taxe foncière" value={draft.annualPropertyTax} unit="€/an" onChange={(value) => set('annualPropertyTax', value)} />
        {hotel.scope === 'wallsOnly' && (
          <>
            {/* Loyer saisi à l'année, enregistré en mensuel comme le bail d'un local loué : il sert au calcul de rentabilité. */}
            <Amount label="Loyer annuel payé par l'exploitant" value={rental.currentMonthlyRent === null ? null : rental.currentMonthlyRent * 12} unit="€/an"
              onChange={(annual) => setRental({ currentMonthlyRent: annual === null ? null : round2(annual / 12), isLeased: annual !== null })} />
            <InfoLine>Loyer hors charges du bail en cours. Il sert au calcul de la rentabilité, comme pour un investissement.</InfoLine>
          </>
        )}
        {hotel.scope === 'businessOnly' && (
          <>
            <Amount label="Loyer annuel des murs" value={hotel.wallsAnnualRent} unit="€/an" onChange={(wallsAnnualRent) => setHotel({ wallsAnnualRent })} />
            <InfoLine>Loyer que l'exploitant paie au propriétaire des murs.</InfoLine>
          </>
        )}
      </Card>
      <Card title="Exploitation">
        <Choices label="Situation">
          {HOTEL_STATUSES.map((status) => (
            <ChoiceChip key={status} title={HOTEL_STATUS_LABELS[status]} selected={hotel.operatingStatus === status} expands
              onClick={() => setHotel({ operatingStatus: hotel.operatingStatus === status ? null : status })} />
          ))}
        </Choices>
        <Amount label="Chiffre d'affaires annuel" value={hotel.annualRevenue?.value ?? null} unit="€/an" onChange={(value) => setHotel({ annualRevenue: sourced(value) })} />
        <Amount label="Année de référence" value={hotel.financialYear} unit="" integer groups={false} onChange={(financialYear) => setHotel({ financialYear })} />
        <Amount label="EBITDA" value={hotel.ebitda?.value ?? null} unit="€/an" onChange={(value) => setHotel({ ebitda: sourced(value) })} />
        <Amount label="Résultat d'exploitation" value={hotel.operatingIncome?.value ?? null} unit="€/an" onChange={(value) => setHotel({ operatingIncome: sourced(value) })} />
        <Amount label="Taux d'occupation" value={occupancy} unit="%" percent onChange={(value) => setHotel({ occupancyRate: sourced(value) })}
          issue={occupancy !== null && (occupancy < 0 || occupancy > 1) ? PERCENT_ISSUE : null} />
        <Amount label="Prix moyen par chambre (ADR)" value={hotel.averageDailyRate?.value ?? null} unit="€/nuit"
          onChange={(value) => setHotel({ averageDailyRate: sourced(value) })} />
        <InfoLine>Chiffre d'affaires : ventes de l'année. EBITDA : résultat avant intérêts, impôts et amortissements. Résultat d'exploitation : après amortissements. Ce ne sont ni un bénéfice ni un rendement. Avec le chiffre d'affaires et l'EBITDA, la fiche affiche une rentabilité hôtelière indicative (marge, performance, capacité d'emprunt). Renseignez seulement les données que vous pouvez justifier.</InfoLine>
      </Card>
      <Card title="Équipements de l'hôtel">
        <div className="dpub-choices-wide" role="group" aria-label="Équipements de l'hôtel">
          {HOTEL_AMENITIES.map((amenity) => {
            const selected = amenities.includes(amenity);
            return (
              <ChoiceChip key={amenity} title={HOTEL_AMENITY_LABELS[amenity]} selected={selected} expands
                onClick={() => {
                  const next = HOTEL_AMENITIES.filter((other) => (other === amenity ? !selected : amenities.includes(other)));
                  setHotel({ amenities: next.length > 0 ? next : null });
                }} />
            );
          })}
        </div>
      </Card>
    </>
  );
}
