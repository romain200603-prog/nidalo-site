import { useState, type ReactNode } from 'react';
import { Icon } from '../../components/Icon';
import { DPE_COLORS } from '../../lib/labels';
import type { Origin } from '../../lib/listing/fields';
import { activeCountLine, initials, type Publisher } from '../../lib/listing/publisher';
import { energyInk, ORIGIN_LABELS, type OriginRow, type Row } from '../../lib/listing/rows';

// Sections de la fiche sous les cartes du haut (ListingDetailView.swift, PublisherViews.swift).

/** Carte de section (`SectionCard`) : titre 20/800, puis le contenu à 14. */
export function SectionCard({ id, title, children, className }: { id: string; title: string; children: ReactNode; className?: string }) {
  return (
    <section className={`section-card ${className ?? ''}`} aria-labelledby={id}>
      <h2 id={id}>{title}</h2>
      {children}
    </section>
  );
}

/** Ligne « libellé … valeur ». */
export function FeatureRow({ title, value }: { title: string; value: string }) {
  return (
    <div className="feature-row">
      <dt>{title}</dt>
      <dd>{value}</dd>
    </div>
  );
}

export function PracticalInfo({ rows }: { rows: Row[] }) {
  if (!rows.length) return null;
  return (
    <SectionCard id="infos-pratiques" title="Informations pratiques">
      <dl className="feature-rows">
        {rows.map(([title, value]) => <FeatureRow key={title} title={title} value={value} />)}
      </dl>
    </SectionCard>
  );
}

function OriginChip({ origin }: { origin: Origin }) {
  return (
    <span className="origin-chip">
      <Icon name={origin === 'estimated' ? 'sparkles' : 'userRound'} />
      {ORIGIN_LABELS[origin]}
    </span>
  );
}

export function InfoNote({ text }: { text: string }) {
  return (
    <p className="info-note">
      <Icon name="info" />
      <span>{text}</span>
    </p>
  );
}

/** « Activité » d'un hôtel sans assez de chiffres pour la rentabilité hôtelière. */
export function HotelActivity({ rows, showsNote }: { rows: OriginRow[]; showsNote: boolean }) {
  return (
    <SectionCard id="activite" title="Activité">
      <dl className="origin-rows">
        {rows.map((row) => (
          <div key={row.title} className="origin-row">
            <dt>{row.title}</dt>
            <dd>
              {row.origin !== 'seller' && <OriginChip origin={row.origin} />}
              <span className="origin-amount">{row.amount}</span>
            </dd>
          </div>
        ))}
      </dl>
      {showsNote && <InfoNote text="Chiffres indicatifs communiqués par le vendeur, à vérifier sur les bilans." />}
    </SectionCard>
  );
}

export function Description({ text }: { text: string }) {
  return (
    <SectionCard id="description" title="Description">
      <p className="description-text">{text}</p>
    </SectionCard>
  );
}

/** « Caractéristiques » : deux colonnes, la première prend la moitié arrondie au-dessus. */
export function Features({ rows }: { rows: Row[] }) {
  const split = Math.ceil(rows.length / 2);
  const column = (part: Row[]) => (
    <dl className="features-column">
      {part.map(([title, value]) => (
        <div key={title} className="features-item">
          <dt>{title}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
  return (
    <SectionCard id="caracteristiques" title="Caractéristiques">
      <div className="features">
        {column(rows.slice(0, split))}
        <span className="features-rule" aria-hidden="true" />
        {column(rows.slice(split))}
      </div>
    </SectionCard>
  );
}

function EnergyChip({ title, letter }: { title: string; letter: string | null }) {
  return (
    <span className="energy-chip" role="img" aria-label={letter ? `${title} ${letter}` : `${title} non communiqué`}>
      <span className="energy-title" aria-hidden="true">{title}</span>
      {letter ? (
        <span className="energy-letter" aria-hidden="true" style={{ background: DPE_COLORS[letter], color: energyInk(letter) }}>{letter}</span>
      ) : (
        <span className="energy-none" aria-hidden="true">Non communiqué</span>
      )}
    </span>
  );
}

export function Energy({ energyClass, climateClass, lines }: { energyClass: string | null; climateClass: string | null; lines: string[] }) {
  return (
    <SectionCard id="energie" title="Performance énergétique">
      <div className="energy">
        <div className="energy-chips">
          <EnergyChip title="DPE" letter={energyClass} />
          <span className="energy-rule" aria-hidden="true" />
          <EnergyChip title="GES" letter={climateClass} />
        </div>
        {lines.length > 0 && (
          <div className="energy-lines">
            {lines.map((line) => <p key={line}>{line}</p>)}
          </div>
        )}
      </div>
    </SectionCard>
  );
}

/** Photo ou logo, sinon les initiales : rond pour un particulier, carré arrondi pour une agence. */
export function Avatar({ publisher }: { publisher: Publisher }) {
  const [failed, setFailed] = useState(false);
  return (
    <span className={`publisher-avatar${publisher.isProfessional ? ' pro' : ''}`} aria-hidden="true">
      {publisher.avatarUrl && !failed
        ? <img src={publisher.avatarUrl} alt="" width={52} height={52} loading="lazy" decoding="async" crossOrigin="anonymous"
          referrerPolicy="no-referrer" onError={() => setFailed(true)} />
        : initials(publisher.name)}
    </span>
  );
}

/**
 * « Votre interlocuteur » : sans page de profil en phase 1 (pas de « Voir le profil »). Sans `onContact` (sa propre
 * annonce, comme l'app), pas de bouton de contact.
 */
export function PublisherCard({ publisher, fees, activeCount, onContact }: {
  publisher: Publisher;
  fees: string | null;
  activeCount: number | null;
  onContact?: () => void;
}) {
  const lines = activeCount !== null ? [...publisher.lines, activeCountLine(activeCount)] : publisher.lines;
  return (
    <SectionCard id="interlocuteur" title="Votre interlocuteur">
      <div className="publisher">
        <div className="publisher-head">
          <Avatar publisher={publisher} />
          <span className="publisher-text">
            <span className="publisher-name">
              <span>{publisher.name}</span>
              <span className={`publisher-badge${publisher.isProfessional ? ' pro' : ''}`}>{publisher.isProfessional ? 'PRO' : 'Particulier'}</span>
            </span>
            {lines.map((line) => <span key={line} className="publisher-line">{line}</span>)}
          </span>
        </div>
        {fees && (
          <dl className="feature-rows">
            <FeatureRow title="Honoraires" value={fees} />
          </dl>
        )}
        {onContact && (
          <button type="button" className="btn btn-primary btn-block" onClick={onContact}>
            {publisher.isProfessional ? 'Contacter l\'agence' : 'Contacter le vendeur'}
          </button>
        )}
      </div>
    </SectionCard>
  );
}

export function Footnote({ text }: { text: string | null }) {
  return text ? <p className="listing-footnote">{text}</p> : null;
}
