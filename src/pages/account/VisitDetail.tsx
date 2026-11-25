import { ContentUnavailable } from '../../components/ContentUnavailable';
import { Icon } from '../../components/Icon';
import type { IconName } from '../../components/iconPaths';
import { OfflineState } from '../../components/OfflineState';
import { PageHeader } from '../../components/PageHeader';
import {
  acceptsReport, canContact, directionsUrl, displayStatus, isVideoVisit, noAddressNotice, routableAddress, STATUS_LABELS, visitDetails,
  type AgendaItem, type VisitDisplayStatus,
} from '../../lib/account/agenda';
import { useDesktop } from '../../lib/desktop';
import { formatPrice } from '../../lib/format';
import { visitDateLong } from '../../lib/listing/visits';
import { formattedPhoneNumber } from '../../lib/messages/format';
import { accountPath } from '../../lib/paths';
import { ScreenHead } from './DesktopParts';
import { Spinner } from './parts';

// « Détail de la visite » (/compte/?vue=agenda&visite=…), comme l'app (Features/Visits/VisitDetailView.swift) : photo
// du bien, état, titre, ville et prix ; date, adresse, contact, participants, rappels et notes ; compte rendu d'une
// visite passée ; Itinéraire et Contacter ; « Partager la visite », « Ajouter à mon calendrier » (un fichier .ics sur
// le site), puis Annuler et Supprimer d'une visite ajoutée à la main. Modifier, reprogrammer, la note et le compte rendu
// restent dans l'app iPhone (leur formulaire n'est pas sur le site).

const BADGE: Record<VisitDisplayStatus, { tone: string; icon: IconName | null }> = {
  confirmed: { tone: 'green', icon: null }, awaitingOther: { tone: 'amber', icon: 'clock' }, toConfirm: { tone: 'blue', icon: 'calendar' },
  done: { tone: 'gray', icon: 'check' }, cancelled: { tone: 'red', icon: 'x' },
};

/** Ligne d'information : icône bleue de 18, titre de 12 gris clair, valeur de 15. */
function InfoRow({ icon, title, value }: { icon: IconName; title: string; value: string }) {
  return (
    <div className="app-detail-row">
      <span className="app-detail-row-icon" aria-hidden="true"><Icon name={icon} /></span>
      <span className="app-detail-row-text">
        <span className="app-detail-row-title">{title}</span>
        <span className="app-detail-row-value">{value}</span>
      </span>
    </div>
  );
}

/** Bouton large teinté (wideButton) : bleu, ou rouge pour annuler et supprimer. */
function WideButton({ icon, label, danger = false, href, onClick, disabled = false }: {
  icon: IconName; label: string; danger?: boolean; href?: string; onClick?: () => void; disabled?: boolean;
}) {
  const className = `app-detail-button${danger ? ' is-danger' : ''}`;
  if (href) {
    return <a className={className} href={href} target="_blank" rel="noopener noreferrer"><Icon name={icon} />{label}</a>;
  }
  return <button type="button" className={className} onClick={onClick} disabled={disabled}><Icon name={icon} />{label}</button>;
}

export type VisitDetailActions = {
  contact: (item: AgendaItem) => void;
  notice: (text: string) => void;
  share: (item: AgendaItem) => void;
  calendar: (item: AgendaItem) => void;
  cancel: (item: AgendaItem) => void;
  remove: (item: AgendaItem) => void;
  /** Ce que seule l'app iPhone fait (modifier, reprogrammer, note, compte rendu). */
  iphone: (title: string) => void;
};

/**
 * `load` : la première lecture de l'agenda en cours, une coupure de connexion (« Réessayer »), ou l'agenda lu ; une
 * visite absente de l'agenda lu est « Visite supprimée ».
 */
export function VisitDetail({ item, load, onRetry, now, actions }: {
  item: AgendaItem | null; load: 'loading' | 'offline' | 'ready'; onRetry: () => void; now: Date; actions: VisitDetailActions;
}) {
  const desktop = useDesktop();
  const back = accountPath('agenda');
  const header = desktop ? (
    <ScreenHead title="Détail de la visite" back={back} action={item ? (
      <button type="button" className="dsc-button" onClick={() => actions.iphone('Ajouter une note')}>Note</button>
    ) : undefined} />
  ) : (
    <PageHeader title="Détail de la visite" back={back} history trailing={item ? (
      <button type="button" className="app-detail-note" onClick={() => actions.iphone('Ajouter une note')} aria-label="Ajouter une note">Note</button>
    ) : undefined} />
  );
  if (!item) {
    return (
      <div className={desktop ? 'dsc app-request app-detail is-desktop' : 'app-request app-detail'}>
        {header}
        {load === 'loading' ? <Spinner label="Chargement de la visite…" />
          : load === 'offline' ? <OfflineState onRetry={onRetry} />
            : <ContentUnavailable icon="calendarBlank" title="Visite supprimée" text="Cette visite n'est plus dans votre agenda." />}
      </div>
    );
  }
  const status = displayStatus(item, now);
  const details = visitDetails(item);
  const address = routableAddress(item);
  const badge = BADGE[status];
  const listing = item.listing;
  const contact = [item.contactName ?? 'Non renseigné', details.contactPhone ? formattedPhoneNumber(details.contactPhone) : null].filter(Boolean).join(' · ');
  const report = acceptsReport(item, now) ? details.report : null;
  return (
    <div className={desktop ? 'dsc app-request app-detail is-desktop' : 'app-request app-detail'}>
      {header}
      <div className="app-detail-body">
        <div className="app-detail-photo" aria-hidden="true">
          {listing?.coverImageURL ? <img src={listing.coverImageURL} alt="" /> : <Icon name="home" />}
        </div>
        <div className="app-detail-titles">
          <span className={`app-detail-badge app-tone-${badge.tone}`}>
            {badge.icon ? <Icon name={badge.icon} /> : <span className="app-detail-badge-dot" aria-hidden="true" />}
            {STATUS_LABELS[status]}
          </span>
          <h2 className="app-detail-title">{listing?.title ?? 'Visite'}</h2>
          {listing && <p className="app-detail-place">{`${listing.city} · ${formatPrice(listing.price)}${listing.transaction === 'rent' ? '/mois' : ''}`}</p>}
        </div>

        <div className="app-detail-card">
          <InfoRow icon="calendar" title="Date" value={visitDateLong(item.start) + (item.durationMinutes ? ` · ${item.durationMinutes} min` : '')} />
          <InfoRow icon="pin" title="Adresse" value={address ?? 'Non renseignée'} />
          <InfoRow icon="user" title="Contact" value={contact} />
          {details.participants.length > 0 && <InfoRow icon="users" title="Participants" value={details.participants.join(', ')} />}
          {details.reminders && <InfoRow icon="bell" title="Rappels" value={details.reminders} />}
          {details.notes && <InfoRow icon="fileText" title="Notes" value={details.notes} />}
        </div>

        {acceptsReport(item, now) && (
          <section className="app-request-section">
            <h2><Icon name="clipboardCheck" />Compte rendu</h2>
            {report ? (
              <>
                {report.summary && <p className="app-detail-report-summary">{report.summary}</p>}
                {([['Points positifs', report.positives], ['Points négatifs', report.negatives], ['Note personnelle', report.personalNote]] as const)
                  .filter(([, value]) => value).map(([title, value]) => (
                    <div key={title} className="app-detail-report-field"><span>{title}</span><p>{value}</p></div>
                  ))}
                {report.worksEstimate !== null && <p className="app-detail-report-works">{`Travaux estimés : ${formatPrice(report.worksEstimate)}`}</p>}
                {report.photos > 0 && <p className="app-detail-report-photos">{report.photos === 1 ? '1 photo' : `${report.photos} photos`}</p>}
              </>
            ) : (
              <p className="app-request-note">La visite est passée : notez votre avis, les points forts et faibles, les travaux et votre décision.</p>
            )}
            <WideButton icon="squarePen" label={report ? 'Modifier le compte rendu' : 'Remplir le compte rendu'}
              onClick={() => actions.iphone(report ? 'Modifier le compte rendu' : 'Remplir le compte rendu')} />
          </section>
        )}

        {details.preparation && (
          <section className="app-request-section">
            <h2><Icon name="clipboardCheck" />Ma préparation</h2>
            {details.preparation.sections.map((section) => (
              <div key={section.title} className="app-detail-report-field">
                <span>{section.title}</span>
                <ul className="app-detail-checklist">{section.items.map((line, index) => <li key={index}>{line}</li>)}</ul>
              </div>
            ))}
            {details.preparation.condition && (
              <div className="app-detail-report-field"><span>État général du logement</span><p>{details.preparation.condition}</p></div>
            )}
          </section>
        )}

        <div className="app-detail-pair">
          {/* Visite en visio : pas d'itinéraire (n° 178). */}
          {!isVideoVisit(item) && (address
            ? <WideButton icon="navigation" label="Itinéraire" href={directionsUrl(address)} />
            : <WideButton icon="navigation" label="Itinéraire" onClick={() => actions.notice(noAddressNotice(item))} />)}
          <WideButton icon="messageCircle" label="Contacter" disabled={!canContact(item)} onClick={() => actions.contact(item)} />
        </div>

        <div className="app-detail-actions">
          {/* Les participants ne sont pas prévenus automatiquement : on partage le rendez-vous soi-même. */}
          <WideButton icon="share" label="Partager la visite" onClick={() => actions.share(item)} />
          <WideButton icon="calendarPlus" label="Ajouter à mon calendrier" onClick={() => actions.calendar(item)} />
          {item.requestId !== null ? (
            <p className="app-detail-help">
              Pour déplacer ou annuler cette visite, ouvrez sa demande dans votre agenda (Mon compte) : l'autre personne doit accepter un nouveau créneau.
            </p>
          ) : item.status !== 'cancelled' && status !== 'done' ? (
            <>
              <WideButton icon="squarePen" label="Modifier ou reprogrammer" onClick={() => actions.iphone('Modifier ou reprogrammer')} />
              <WideButton icon="x" label="Annuler la visite" danger onClick={() => actions.cancel(item)} />
            </>
          ) : item.status === 'cancelled' ? (
            <WideButton icon="calendarCheck" label="Reprogrammer" onClick={() => actions.iphone('Reprogrammer')} />
          ) : null}
          {item.conversationId === null && item.requestId === null && (
            <WideButton icon="trash2" label="Supprimer" danger onClick={() => actions.remove(item)} />
          )}
        </div>
      </div>
    </div>
  );
}
