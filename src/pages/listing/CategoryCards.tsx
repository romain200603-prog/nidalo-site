import { useState } from 'react';
import { Icon } from '../../components/Icon';
import { formatArea } from '../../lib/format';
import { HotelPerformance, type Decimal, type RentalCost } from '../../lib/investment';
import { capacity, cardEuros, cardEuros1, cardPercent, thin } from '../../lib/listing/money';
import type { FinancingChoice, FinancingOptions, ProfitabilityBadge, ProfitabilityView } from '../../lib/listing/profitability';
import { ExtraIcon } from './icons';
import {
  BADGES, SPEC_COLORS, SpecBanner, SpecBarRow, SpecBlockTitle, SpecBoxValue, SpecCard, SpecCardHeader, SpecFootnote,
  SpecNote, SpecResultBox, SpecSegmentRow, SpecSimulator, SpecTotalRow, SpecValueBox, SpecValueCaption, type Badge,
} from './Spec';

// Bloc propre à la catégorie, en haut de la fiche (ListingCategorySections.swift et ListingTopCards.swift) :
// « Coût de la location » (Location), « Rentabilité hôtelière » (Hôtels) ou « Rentabilité » (vente avec loyer).

const { blue, valueBlue, orange, grayBlue, green, red } = SPEC_COLORS;
/** Longueur d'une barre (TopCardFormat.double(part / total)). */
const ratio = (part: Decimal, total: Decimal) => (total.gt(0) ? part.dividedBy(total).toNumber() : 0);

// MARK: Location

export function RentalCostCard({ cost }: { cost: RentalCost }) {
  const [income, setIncome] = useState<Decimal | null>(null);
  const [hasGuarantor, setHasGuarantor] = useState(false);
  const selectedIncome = income ?? cost.defaultIncome;
  const cc = cost.rentIncludingCharges;
  const share = cost.share(selectedIncome);
  const shareRatio = share?.toNumber() ?? 0;
  const verdict = cost.verdict(selectedIncome, hasGuarantor);
  const isOK = verdict !== 'guarantorAdvised';
  const ink = isOK ? green : '#8A5A0B';
  const perArea = cost.rentPerSquareMeter;
  return (
    <SpecCard labelledBy="cout-location">
      <SpecCardHeader id="cout-location" icon={<ExtraIcon name="keyRound" />} title="Coût de la location" subtitle="Calculé à partir des informations de l’annonce" />
      <SpecBanner
        left={{
          label: 'Loyer charges comprises', value: cardEuros(cc), unit: '/mois',
          detail: cost.charges !== null ? `Dont ${cardEuros(cost.charges)} de charges` : undefined,
        }}
        right={perArea !== null
          ? { label: 'Loyer au m²', value: cardEuros1(perArea), unit: '/m²', detail: cost.area !== null ? `Hors charges, sur ${thin(formatArea(cost.area.toNumber()))}` : undefined }
          : { label: 'Loyer hors charges', value: cardEuros(cost.rentExcludingCharges), unit: '/mois' }}
      />
      <SpecValueBox title="Revenus souvent demandés" subtitle="3 fois le loyer charges comprises">
        <SpecBoxValue text={cardEuros(cost.requiredIncome)} />
        <SpecValueCaption icon={<ExtraIcon name="userCheck" />} text="nets par mois" color={valueBlue} />
      </SpecValueBox>

      <SpecBlockTitle title="Votre mois type" legend={[['Loyer', blue], ['Charges', orange]]} />
      <div className="spec-rows">
        <SpecBarRow label="Loyer hors charges" badge={BADGES.listing} amount={cardEuros(cost.rentExcludingCharges)}
          ratio={ratio(cost.rentExcludingCharges, cc)} color={blue} />
        {cost.charges !== null && (
          <SpecBarRow label="Provisions sur charges" detail="régularisées chaque année" amount={cardEuros(cost.charges)}
            ratio={ratio(cost.charges, cc)} color={orange} />
        )}
      </div>
      <SpecTotalRow label="Loyer charges comprises" amount={cardEuros(cc)} unit="/mois" />

      <SpecBlockTitle title="À prévoir à l’entrée" trailingText="Une seule fois" />
      <div className="spec-rows">
        <SpecBarRow label="Premier loyer" detail="charges comprises" amount={cardEuros(cc)} ratio={ratio(cc, cost.entryTotal)} color={grayBlue} />
        {cost.deposit !== null && (
          <SpecBarRow label="Dépôt de garantie" badge={cost.isDepositDeclared ? BADGES.listing : BADGES.legal('Maximum légal')}
            amount={cardEuros(cost.deposit)} ratio={ratio(cost.deposit, cost.entryTotal)} color={grayBlue} />
        )}
        {cost.agencyFees !== null && (
          <SpecBarRow label="Honoraires d’agence" badge={BADGES.listing} amount={cardEuros(cost.agencyFees)}
            ratio={ratio(cost.agencyFees, cost.entryTotal)} color={grayBlue} />
        )}
      </div>
      <SpecTotalRow label="Total à l’entrée" amount={cardEuros(cost.entryTotal)} />
      {!cost.isDepositDeclared && cost.isFurnished !== null && (
        <div className="spec-notes">
          <SpecNote text={cost.isFurnished
            ? 'Logement meublé : le dépôt de garantie est limité à 2 mois de loyer hors charges. Il n’est pas précisé dans l’annonce.'
            : 'Logement non meublé : le dépôt de garantie est limité à 1 mois de loyer hors charges. Il n’est pas précisé dans l’annonce.'} />
        </div>
      )}

      <SpecSimulator id="simuler-dossier" title="Simuler mon dossier">
        <div className="spec-segment-group">
          <SpecSegmentRow title="Revenus" labelWidth={76} options={cost.incomeOptions} selected={selectedIncome}
            onSelect={setIncome} label={(value) => cardEuros(value)} />
          <SpecSegmentRow title="Garant" labelWidth={76} options={[false, true]} selected={hasGuarantor}
            onSelect={setHasGuarantor} label={(value) => (value ? 'Avec garant' : 'Sans garant')} />
        </div>
        <SpecResultBox title="Part du loyer dans vos revenus" value={cardPercent(share ?? 0, 0)} valueColor={ink} tone={isOK ? 'ok' : 'warning'}>
          <div className="spec-gauge" aria-hidden="true">
            <span style={{ width: `${Math.min(shareRatio, 1) * 100}%`, background: ink }} />
            <i />
          </div>
          <div className="spec-verdict">
            <span style={{ color: ink }}>
              <Icon name={isOK ? 'check' : 'triangleAlert'} />
              {verdict === 'solid' ? 'Dossier solide' : verdict === 'solidWithGuarantor' ? 'Dossier solide avec garant' : 'Garant conseillé'}
            </span>
            <span className="spec-verdict-ref">repère : 33 %</span>
          </div>
        </SpecResultBox>
        <SpecFootnote text="Indicatif : chaque propriétaire fixe ses propres critères." />
      </SpecSimulator>
    </SpecCard>
  );
}

// MARK: Hôtels

export function HotelSection({ figures }: { figures: HotelPerformance }) {
  const [years, setYears] = useState(20);
  const [rate, setRate] = useState<Decimal>(HotelPerformance.rateOptions[1]);
  const borrowing = figures.borrowingCapacity(years, rate);
  const margin = figures.margin;
  const kpis = [
    figures.occupancyRate !== null
      ? { icon: <Icon name="bedDouble" />, title: 'Taux d’occupation', suffix: null, sub: 'Communiqué par le vendeur', value: cardPercent(figures.occupancyRate, 0) }
      : null,
    figures.revPAR !== null
      ? { icon: <Icon name="layers" />, title: 'RevPAR', suffix: '(est.)', sub: 'Par chambre disponible et par nuit', value: cardEuros(figures.revPAR) }
      : null,
    figures.averageRoomRate !== null
      ? { icon: <ExtraIcon name="chartColumn" />, title: 'Prix moyen par chambre', suffix: '(est.)', sub: 'Par nuitée vendue', value: cardEuros(figures.averageRoomRate) }
      : null,
  ].filter((row) => row !== null);
  return (
    <div className="spec-stack">
      <SpecCard labelledBy="rentabilite-hoteliere">
        <SpecCardHeader id="rentabilite-hoteliere" icon={<ExtraIcon name="chartColumn" />} title="Rentabilité hôtelière"
          subtitle="Estimée à partir des performances indiquées par le vendeur" />
        <SpecBanner hotel left={{ label: 'Chiffre d’affaires annuel', value: cardEuros(figures.annualRevenue) }}
          right={{ label: 'EBITDA', value: cardEuros(figures.ebitda) }} />
        {margin !== null && (
          <SpecValueBox title="Marge EBITDA" subtitle={`${cardEuros(figures.ebitda)} / ${cardEuros(figures.annualRevenue)}`}>
            <SpecBoxValue text={cardPercent(margin, 1)} />
          </SpecValueBox>
        )}
        <SpecBlockTitle title="Votre performance" legend={[['Entrées', blue], ['Sorties', orange]]} />
        <div className="spec-rows">
          <SpecBarRow tight label="Chiffre d’affaires mensuel" detail="(moy.)" amount={cardEuros(figures.monthlyRevenue, true)} ratio={1} color={blue} />
          <SpecBarRow tight label="Charges d’exploitation" detail="(est.)" amount={cardEuros(figures.monthlyCharges.negated(), true)}
            ratio={ratio(figures.monthlyCharges, figures.monthlyRevenue)} color={orange} />
        </div>
        <SpecTotalRow label="EBITDA mensuel" detail="(moy.)" amount={cardEuros(figures.monthlyEbitda, true)}
          color={figures.monthlyEbitda.gte(0) ? green : red} />
      </SpecCard>

      <SpecCard labelledBy="indicateurs-cles">
        <h2 id="indicateurs-cles" className="spec-card-title">Indicateurs clés</h2>
        {kpis.length > 0 && (
          <ul className="spec-kpis">
            {kpis.map((row) => (
              <li key={row.title}>
                <span className="spec-kpi-icon" aria-hidden="true">{row.icon}</span>
                <span className="spec-kpi-text">
                  <span className="spec-kpi-title">{row.title}{row.suffix && <span> {row.suffix}</span>}</span>
                  <span className="spec-kpi-sub">{row.sub}</span>
                </span>
                <span className="spec-kpi-value">{row.value}</span>
              </li>
            ))}
          </ul>
        )}
        <div className="spec-kpi-note">
          <SpecNote text="Chiffres indicatifs communiqués par le vendeur, à vérifier sur les bilans." />
        </div>
      </SpecCard>

      <SpecCard labelledBy="financement-hotel">
        <h2 id="financement-hotel" className="spec-simulator-title">Ajuster le financement</h2>
        <div className="spec-segment-group">
          <SpecSegmentRow title="Durée" labelWidth={64} options={HotelPerformance.durationOptions} selected={years}
            onSelect={setYears} label={(value) => `${value} ans`} />
          <SpecSegmentRow title="Taux" labelWidth={64} options={HotelPerformance.rateOptions} selected={rate}
            onSelect={setRate} label={(value) => cardPercent(value, 1)} />
        </div>
        <SpecResultBox title="Capacité d’emprunt estimée" value={capacity(borrowing)}>
          <div className="spec-result-line">
            <span>Mensualité maximale</span>
            <span>{cardEuros(figures.maximumMonthlyPayment)}/mois</span>
          </div>
        </SpecResultBox>
        <SpecFootnote text="Hypothèse : l’EBITDA couvre 1,3 fois les mensualités. Le prix de vente n’est pas pris en compte." />
      </SpecCard>
    </div>
  );
}

// MARK: Rentabilité (vente avec un loyer)

const ROW_BADGES: Record<ProfitabilityBadge, Badge> = { simulation: BADGES.simulation, estimated: BADGES.legal('Estimé') };

export function ProfitabilityCard({ view, choice, options, onChange }: {
  view: ProfitabilityView;
  choice: FinancingChoice;
  options: FinancingOptions;
  onChange: (choice: FinancingChoice) => void;
}) {
  const largest = view.largestAmount;
  const positive = view.cashFlow.gte(0);
  const cashInk = positive ? green : red;
  const cashFlowText = view.cashFlowText;
  return (
    <SpecCard labelledBy="rentabilite">
      <SpecCardHeader id="rentabilite" icon={<ExtraIcon name="chartColumn" />} title="Rentabilité" subtitle={view.source} />
      <SpecBanner
        left={{ label: 'Rendement brut', value: view.grossYield, unit: 'brut', detail: view.grossDetail }}
        right={{ label: 'Rendement net', value: view.netYield, unit: 'net', detail: 'Charges, taxe et frais inclus' }}
      />
      <SpecValueBox title="Cash-flow mensuel" subtitle={view.financing} tone={positive ? 'positive' : 'negative'}>
        <SpecBoxValue text={cashFlowText} color={cashInk} />
        <SpecValueCaption icon={positive ? <ExtraIcon name="arrowUpRight" /> : <Icon name="arrowDownRight" />}
          text={positive ? 'Autofinancé' : 'Effort d’épargne'} color={cashInk} />
      </SpecValueBox>

      <SpecBlockTitle title="Votre mois type" legend={[['Entrées', blue], ['Sorties', orange]]} />
      <div className="spec-rows">
        {view.rows.map((row) => (
          <SpecBarRow key={row.id} label={row.label} detail={row.info} badge={row.badge ? ROW_BADGES[row.badge] : null} amount={cardEuros(row.amount, true)}
            ratio={ratio(row.amount.abs(), largest)} color={row.amount.gte(0) ? blue : orange} />
        ))}
      </div>
      <SpecTotalRow label="Cash-flow" amount={cashFlowText} color={positive ? green : red} />
      {view.notes.length > 0 && (
        <div className="spec-notes">
          {view.notes.map((note) => <SpecNote key={note} text={note} />)}
        </div>
      )}

      <SpecSimulator id="ajuster-financement" title="Ajuster le financement">
        <div className="spec-segment-group">
          <SpecSegmentRow title="Apport" labelWidth={64} options={options.downPaymentShares} selected={choice.downPaymentShare}
            onSelect={(value) => onChange({ ...choice, downPaymentShare: value })} label={(value) => cardPercent(value, 0)} />
          <SpecSegmentRow title="Durée" labelWidth={64} options={options.years} selected={choice.years}
            onSelect={(value) => onChange({ ...choice, years: value })} label={(value) => `${value} ans`} />
          <SpecSegmentRow title="Taux" labelWidth={64} options={options.annualRates} selected={choice.annualRate}
            onSelect={(value) => onChange({ ...choice, annualRate: value })} label={(value) => cardPercent(value, 1)} />
        </div>
        <SpecResultBox title="Mensualité estimée" value={`${cardEuros(view.monthlyPayment)}/mois`} />
        <SpecFootnote text="Résultat indicatif, à confirmer avec votre banque." />
      </SpecSimulator>
    </SpecCard>
  );
}
