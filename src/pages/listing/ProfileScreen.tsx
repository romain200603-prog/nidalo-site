import { useEffect, useState } from 'react';
import { Icon } from '../../components/Icon';
import { ListingCard } from '../../components/ListingCard';
import { PageHeader } from '../../components/PageHeader';
import { cardContent } from '../../lib/cardContent';
import { fetchPublicListings, type Publisher } from '../../lib/listing/publisher';
import type { ListingRow } from '../../lib/listings';
import { Spinner } from '../account/parts';
import { Avatar, FeatureRow, SectionCard } from './Sections';

// Profils publics ouverts depuis « Votre interlocuteur » (PublisherViews.swift 222–455) : « Profil » d'un particulier
// (photo de 88, nom, « Particulier », ancienneté, mention, « Ses annonces ») et « Agence » (en-tête, présentation,
// contact, barème, informations professionnelles, « Ses biens »). En bas, « Contacter… » dans une barre blanche, sauf
// sur sa propre annonce. Rien n'est inventé : seulement ce que le serveur envoie (fonction public_profiles).

type ListingsState = { status: 'loading' } | { status: 'error' } | { status: 'ready'; rows: ListingRow[] };

/** « Ses annonces » / « Ses biens » (PublisherListingsSection) : chargement, erreur, aucune annonce, ou les cartes. */
function PublisherListings({ title, state }: { title: string; state: ListingsState }) {
  const count = state.status === 'ready' && state.rows.length > 0 ? state.rows.length : null;
  return (
    <section className="profile-listings" aria-labelledby="profil-annonces">
      <h2 id="profil-annonces">{count !== null ? `${title} · ${count}` : title}</h2>
      {state.status === 'loading' && <Spinner label="Chargement des annonces" />}
      {state.status === 'error' && <p className="form-error">Les annonces n'ont pas pu être chargées. Réessayez dans un instant.</p>}
      {state.status === 'ready' && state.rows.length === 0 && <p className="profile-empty">Aucune annonce en ligne pour le moment.</p>}
      {state.status === 'ready' && state.rows.map((row) => (
        <ListingCard key={row.id} row={row} content={cardContent(row, null, null)} headingLevel="h3" />
      ))}
    </section>
  );
}

function ProfileHeader({ publisher }: { publisher: Publisher }) {
  const agency = publisher.agency;
  return (
    <div className="profile-head">
      <span className="profile-avatar"><Avatar publisher={publisher} /></span>
      <p className="profile-name">{publisher.name}</p>
      <span className="profile-badges">
        <span className={`publisher-badge${publisher.isProfessional ? ' pro' : ''}`} aria-label={publisher.isProfessional ? 'Professionnel' : 'Particulier'}>
          {publisher.isProfessional ? 'PRO' : 'Particulier'}
        </span>
        {agency?.isVerified && <span className="profile-verified"><Icon name="badgeCheck" />Vérifiée</span>}
      </span>
      {publisher.isProfessional ? (agency?.cityLine && <p className="profile-sub">{agency.cityLine}</p>)
        : (publisher.memberSince && <p className="profile-sub">{publisher.memberSince}</p>)}
    </div>
  );
}

const hostOf = (url: string): string => {
  try {
    return new URL(url).host || url;
  } catch {
    return url;
  }
};

export function ProfileScreen({ publisher, onClose, onContact }: {
  publisher: Publisher;
  onClose: () => void;
  /** « Contacter… » : absent sur sa propre annonce. La location d'un particulier garde « Contacter le vendeur », comme la
   barre du profil de l'app. */
  onContact?: () => void;
}) {
  const agency = publisher.agency;
  const ownerId = publisher.isProfessional ? null : publisher.userId;
  const [listings, setListings] = useState<ListingsState>({ status: 'loading' });

  useEffect(() => {
    // Agence : l'app demande ses biens sans agent et n'en reçoit aucun (publicListings, `agentUserId: nil`).
    if (!ownerId) {
      setListings({ status: 'ready', rows: [] });
      return undefined;
    }
    let cancelled = false;
    setListings({ status: 'loading' });
    fetchPublicListings(ownerId).then(
      (rows) => { if (!cancelled) setListings({ status: 'ready', rows }); },
      () => { if (!cancelled) setListings({ status: 'error' }); },
    );
    return () => { cancelled = true; };
  }, [ownerId]);

  const contactTitle = publisher.isProfessional ? 'Contacter l\'agence' : 'Contacter le vendeur';
  return (
    <div className={`listing-profile${onContact ? ' has-contact' : ''}`}>
      <PageHeader title={publisher.isProfessional ? 'Agence' : 'Profil'} onBack={onClose} className="listing-screen-header" />
      <div className="profile-stack">
        <ProfileHeader publisher={publisher} />
        {!publisher.isProfessional && (
          <p className="info-line">
            <Icon name="info" />
            <span>Particulier qui vend ou loue son bien. Échangez via la messagerie de Nidalo : vos coordonnées restent privées.</span>
          </p>
        )}
        {agency?.about && (
          <SectionCard id="profil-presentation" title="Présentation">
            <p className="profile-text">{agency.about}</p>
          </SectionCard>
        )}
        {agency && (agency.contactName || agency.phone || agency.email || agency.website) && (
          <SectionCard id="profil-contact" title="Contact">
            <dl className="feature-rows">
              {agency.contactName && <FeatureRow title="Votre interlocuteur" value={agency.contactName} />}
              {agency.phone && <FeatureRow title="Téléphone" value={agency.phone} />}
              {agency.email && <FeatureRow title="E-mail" value={agency.email} />}
            </dl>
            {agency.website && (
              <a className="btn btn-light btn-block" href={agency.website} target="_blank" rel="noopener noreferrer">
                <Icon name="link" />
                {hostOf(agency.website)}
              </a>
            )}
          </SectionCard>
        )}
        {publisher.isProfessional && publisher.feeScheduleUrl && (
          <SectionCard id="profil-bareme" title="Barème d'honoraires">
            <a className="btn btn-light btn-block" href={publisher.feeScheduleUrl} target="_blank" rel="noopener noreferrer">
              <Icon name="link" />
              {hostOf(publisher.feeScheduleUrl)}
            </a>
          </SectionCard>
        )}
        {agency && (
          <SectionCard id="profil-pro" title="Informations professionnelles">
            {agency.professionalRows.length === 0 ? (
              <p className="profile-muted">L'agence n'a pas encore renseigné ses informations professionnelles.</p>
            ) : (
              <dl className="feature-rows">
                {agency.professionalRows.map(([title, value]) => <FeatureRow key={title} title={title} value={value} />)}
              </dl>
            )}
            {!agency.isVerified && (
              <p className="profile-note">Ces informations sont déclarées par l'agence et n'ont pas encore été vérifiées par Nidalo.</p>
            )}
          </SectionCard>
        )}
        <PublisherListings title={publisher.isProfessional ? 'Ses biens' : 'Ses annonces'} state={listings} />
      </div>
      {onContact && (
        <div className="screen-bottom-bar">
          <button type="button" className="btn btn-primary btn-block" onClick={onContact}>{contactTitle}</button>
        </div>
      )}
    </div>
  );
}
