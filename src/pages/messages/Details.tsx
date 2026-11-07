import { useEffect, useState, type ReactNode } from 'react';
import { Icon } from '../../components/Icon';
import type { IconName } from '../../components/iconPaths';
import { avatarUrl } from '../../lib/account/profile';
import { useStore } from '../../lib/account/session';
import { formatPerMonth, formatPrice } from '../../lib/format';
import { memberSince } from '../../lib/listing/publisher';
import { visitDateLong } from '../../lib/listing/visits';
import { fetchProfiles, upcomingVisits, type ConversationVisit, type Message } from '../../lib/messages/api';
import { CATEGORY_LABELS, documentIcon } from '../../lib/messages/content';
import { durationLabel, muteLabel, shortDateWithYear, sizeLabel } from '../../lib/messages/format';
import { isMuted, sameId, type Conversation, type ProfileRow } from '../../lib/messages/inbox';
import { profileOf, setArchived, setMuted, updateSettings } from '../../lib/messages/store';
import {
  bannerLocation, callState, EMPTY_MEDIA_TEXT, linkTitle, mediaEntries, mediaPreview, MUTE_OPTIONS, mutedUntil, muteNotice, senderName,
  sharedItems, videoState, visitState, visibleMessages, type ActionState, type ListingAvailability, type SharedItem,
} from '../../lib/messages/thread';
import { accountPath, listingPath, videoVisitPath } from '../../lib/paths';
import { BlockDialog, CallDialog, DELETED_ACCOUNT, directMenuItems, ReportSheet, unblockWithNotice } from './actions';
import { listingStore, loadListingRow, type ListingRowState } from './listingRow';
import { ActionMenu, CounterpartAvatar, PublisherBadge, showIphoneOnly, showNotice, useSignedUrl } from './parts';
import { navigate, type MediaTab } from './route';
import { MediaViewer } from './Thread';

// « Détails » d'une conversation à deux (ConversationDetailsView.swift), ouvert en cliquant sur l'en-tête :
// l'interlocuteur, cinq actions (Appeler, Vidéo, Visite, Profil, Silencieux), le bien concerné, la prochaine visite,
// les médias et fichiers, les paramètres et la confidentialité ; puis « Médias » (SharedMediaView,
// GroupInfoView.swift:892) avec ses trois onglets.

type DetailsProps = {
  conversation: Conversation;
  messages: Message[];
  visits: ConversationVisit[];
  blocked: Set<string>;
  me: string | null;
};

/** Disponibilité de l'annonce pour les boutons Visite et Vidéo (listingAvailability). */
export function listingAvailability(conversation: Conversation, state: ListingRowState | undefined, me: string | null): ListingAvailability {
  if (!conversation.listing) return 'none';
  if (conversation.isSellerSide) return 'own';
  if (!state || state.status === 'loading') return 'loading';
  if (state.status === 'unavailable') return 'unavailable';
  if (sameId(state.row.owner_id, me)) return 'own';
  return state.row.accepts_video_visits ? 'availableWithVideo' : 'available';
}

const back = (conversationId: string) => () => navigate({ conversationId });

export function DetailsView({ conversation, messages, visits, blocked, me }: DetailsProps) {
  const other = conversation.otherUserId;
  const [profile, setProfile] = useState<ProfileRow | null>(() => profileOf(other));
  const [calling, setCalling] = useState(false);
  const [blocking, setBlocking] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [viewer, setViewer] = useState<number | null>(null);
  const rows = useStore(listingStore);
  const listing = conversation.listing;
  const listingState = listing ? rows.get(listing.listingId.toLowerCase()) : undefined;
  const isBlocked = !!other && blocked.has(other.toLowerCase());
  const counterpart = conversation.counterpart;
  const now = new Date();
  const nextVisit = upcomingVisits(visits, now).find((visit) => sameId(visit.conversationId, conversation.id)) ?? null;
  const visible = visibleMessages(messages, conversation.clearedAt, now);
  const shared = sharedItems(visible);
  const entries = mediaEntries(visible);
  const preview = mediaPreview(shared.media.length);
  const documents = shared.documents.slice(0, 2);

  useEffect(() => { if (listing) loadListingRow(listing.listingId); }, [listing]);

  // Profil public de l'interlocuteur (déjà lu avec la boîte de réception, sinon lu ici, comme openContactProfile).
  useEffect(() => {
    if (profile || !other) return undefined;
    let cancelled = false;
    void fetchProfiles([other]).then((found) => {
      if (cancelled) return;
      const row = found.get(other.toLowerCase()) ?? null;
      if (row) {
        setProfile(row);
      } else {
        showNotice('Son profil n\'a pas pu être chargé. Réessayez dans un instant.');
        navigate({ conversationId: conversation.id }, { replace: true });
      }
    });
    return () => { cancelled = true; };
  }, [profile, other, conversation.id]);

  const availability = listingAvailability(conversation, listingState, me);
  const muted = isMuted(conversation, now);
  const openListing = () => {
    if (listing && listingState?.status === 'ready') window.location.assign(listingPath(listing.listingId));
    else showNotice('L\'annonce n\'a pas pu être chargée. Réessayez dans un instant.');
  };
  const requestVisit = () => { if (listing) window.location.assign(listingPath(listing.listingId, null, 'visite')); };
  const requestVideoVisit = () => { if (listing) window.location.assign(videoVisitPath(listing.listingId)); };
  const photo = profile ? avatarUrl(counterpart.kind === 'agency' ? profile.agency_logo_path ?? null : profile.avatar_path) : null;
  const since = profile?.member_since ? memberSince(profile.member_since) : null;
  const openMedia = (item: SharedItem) => {
    const index = entries.findIndex((entry) => entry.attachment.id === item.attachment?.id);
    if (index >= 0) setViewer(index);
  };
  const toMedia = (tab: MediaTab) => () => navigate({ conversationId: conversation.id, view: 'medias', tab });

  return (
    <section className="dm-pane dm-details" aria-labelledby="dm-details-title">
      <header className="dm-details-bar">
        <button type="button" className="dm-round is-plain" onClick={back(conversation.id)} aria-label="Retour" title="Retour">
          <Icon name="chevronLeft" />
        </button>
        <h2 id="dm-details-title" tabIndex={-1}>Détails</h2>
        <ActionMenu
          label="Plus d'options"
          className="dm-round is-plain"
          items={directMenuItems({ conversation, isBlocked, onBlock: () => setBlocking(true), onReport: () => setReporting(true) })}
        >
          <Icon name="ellipsisVertical" />
        </ActionMenu>
      </header>
      <div className="dm-details-scroll">
        <div className="dm-details-inner">
          <div className="dm-details-who">
            {photo ? (
              <span className="dm-avatar dm-details-photo" aria-hidden="true"><img src={photo} alt="" /></span>
            ) : <CounterpartAvatar counterpart={counterpart} size={88} />}
            <h3>{counterpart.name}</h3>
            <p className="dm-details-badges">
              <PublisherBadge kind={counterpart.kind} />
              {since && <span>{since}</span>}
            </p>
          </div>

          <div className="dm-detail-actions">
            <QuickAction icon="phone" title="Appeler" state={callState(counterpart.name, counterpart.phone)} onClick={() => setCalling(true)} />
            <QuickAction icon="video" title="Vidéo" state={videoState(availability)} onClick={requestVideoVisit} />
            <QuickAction icon="calendarPlus" title="Visite" state={visitState(availability)} onClick={requestVisit} />
            <QuickAction icon="userRound" title="Profil" state={{ enabled: true }} onClick={() => showIphoneOnly('Profil')} />
            <QuickAction
              icon={muted ? 'bell' : 'bellOff'}
              title={muted ? 'Réactiver' : 'Silencieux'}
              state={{ enabled: true }}
              onClick={() => void setMuted(conversation.id, !muted)}
            />
          </div>

          {listing && (
            <DetailsSection title="Bien concerné" link={{ title: 'Voir l\'annonce', onClick: openListing }}>
              <div className="dm-card">
                <button type="button" className="dm-details-listing" onClick={openListing}>
                  <span className="dm-details-listing-photo">{listing.coverUrl ? <img src={listing.coverUrl} alt="" /> : <Icon name="image" />}</span>
                  <span className="dm-details-listing-text">
                    <span className="dm-details-listing-title">{listing.title}</span>
                    <span className="dm-details-listing-place">{bannerLocation(listing, nextVisit?.address ?? null)}</span>
                    <span className="dm-details-listing-price">{listing.transaction === 'rent' ? formatPerMonth(listing.price) : formatPrice(listing.price)}</span>
                  </span>
                  <Icon name="chevronRight" className="icon dm-chevron" />
                </button>
              </div>
            </DetailsSection>
          )}

          {nextVisit && (
            <DetailsSection title="Prochaine visite" link={{ title: 'Voir l\'agenda', href: accountPath('bientot', { ecran: 'agenda' }) }}>
              <VisitCard start={nextVisit.start} address={nextVisit.address ?? nextVisit.listing?.city ?? listing?.city ?? ''} />
            </DetailsSection>
          )}

          <DetailsSection title="Médias et fichiers" link={{ title: 'Tout voir', onClick: toMedia('photos') }}>
            {preview.shown > 0 && (
              <div className="dm-details-tiles">
                {[0, 1, 2].map((index) => (index < preview.shown ? (
                  <div key={shared.media[index].id} className="dm-details-tile">
                    <MediaTile item={shared.media[index]} onOpen={() => openMedia(shared.media[index])} />
                    {index === 2 && preview.more > 0 && (
                      <button type="button" className="dm-details-more" onClick={toMedia('photos')} aria-label={`${preview.more} autres photos et vidéos`}>
                        +{preview.more}
                      </button>
                    )}
                  </div>
                ) : <span key={index} className="dm-details-tile is-empty" aria-hidden="true" />))}
              </div>
            )}
            {shared.media.length === 0 && documents.length === 0 ? (
              <div className="dm-card dm-details-empty">
                <Icon name="image" />
                <p>{EMPTY_MEDIA_TEXT}</p>
              </div>
            ) : documents.length > 0 && (
              <ul className="dm-card dm-rows">
                {documents.map((item) => (
                  <li key={item.id}>
                    <button type="button" className="dm-action-row" onClick={toMedia('documents')}>
                      <span className="dm-row-icon"><Icon name="fileText" /></span>
                      <span className="dm-action-text">
                        <span>{item.attachment?.fileName ?? ''}</span>
                        <small>{sharedSubtitle(item, conversation, me)}</small>
                      </span>
                      <Icon name="chevronRight" className="icon dm-chevron" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </DetailsSection>

          <DetailsSection title="Paramètres">
            <ul className="dm-card dm-rows">
              <li>
                <ActionMenu
                  label="Notifications"
                  className="dm-action-row"
                  items={MUTE_OPTIONS.map((option) => ({
                    label: option.label,
                    icon: option.value === 'off' ? 'bell' : 'bellOff',
                    onSelect: () => {
                      const until = mutedUntil(option.value);
                      void updateSettings(conversation.id, (current) => ({ ...current, mutedUntil: until ? until.toISOString() : null }))
                        .then(() => showNotice(muteNotice(option.value)))
                        .catch(() => showNotice('Le réglage n\'a pas pu être enregistré. Réessayez.'));
                    },
                  }))}
                >
                  <span className="dm-row-icon"><Icon name={muted ? 'bellOff' : 'bell'} /></span>
                  <span className="dm-action-text"><span>Notifications</span></span>
                  <span className="dm-row-value">{muteLabel(conversation.mutedUntil, now)}</span>
                  <Icon name="chevronRight" className="icon dm-chevron" />
                </ActionMenu>
              </li>
              <li>
                <button
                  type="button"
                  className="dm-action-row"
                  aria-pressed={conversation.isFavorite}
                  onClick={() => {
                    const adding = !conversation.isFavorite;
                    void updateSettings(conversation.id, (current) => ({ ...current, isFavorite: adding }))
                      .catch(() => undefined)
                      .then(() => showNotice(adding ? 'Conversation ajoutée aux favoris.' : 'Conversation retirée des favoris.'));
                  }}
                >
                  <span className="dm-row-icon"><Icon name="heart" /></span>
                  <span className="dm-action-text"><span>{conversation.isFavorite ? 'Retirer des favoris' : 'Ajouter aux favoris'}</span></span>
                  <span className={`dm-favorite-mark${conversation.isFavorite ? ' is-on' : ''}`} aria-hidden="true"><Icon name="heart" /></span>
                </button>
              </li>
            </ul>
          </DetailsSection>

          <DetailsSection title="Confidentialité">
            <ul className="dm-card dm-rows">
              <li>
                <button type="button" className="dm-action-row" onClick={() => void setArchived(conversation.id, !conversation.isArchived)}>
                  <span className="dm-row-icon"><Icon name="archive" /></span>
                  <span className="dm-action-text"><span>{conversation.isArchived ? 'Désarchiver la conversation' : 'Archiver la conversation'}</span></span>
                </button>
              </li>
              {counterpart.name !== DELETED_ACCOUNT && other && (
                <li>
                  <button type="button" className="dm-action-row" onClick={() => (isBlocked ? void unblockWithNotice(other) : setBlocking(true))}>
                    <span className="dm-row-icon"><Icon name="ban" /></span>
                    <span className="dm-action-text"><span>{isBlocked ? 'Débloquer' : 'Bloquer'}</span></span>
                  </button>
                </li>
              )}
              <li>
                <button type="button" className="dm-action-row is-destructive" onClick={() => setReporting(true)}>
                  <span className="dm-row-icon"><Icon name="flag" /></span>
                  <span className="dm-action-text"><span>Signaler un problème</span></span>
                </button>
              </li>
            </ul>
          </DetailsSection>
        </div>
      </div>

      <CallDialog open={calling} name={counterpart.name} phone={counterpart.phone} onClose={() => setCalling(false)} />
      <BlockDialog open={blocking} userId={other} onClose={() => setBlocking(false)} />
      <ReportSheet open={reporting} title="Signaler la conversation" conversationId={conversation.id} onClose={() => setReporting(false)} />
      <MediaViewer entries={entries} index={viewer} conversation={conversation} me={me} onIndex={setViewer} onClose={() => setViewer(null)} />
    </section>
  );
}

/** Rond bleu clair, icône et nom ; grisé, il explique pourquoi au clic (quickAction). */
function QuickAction({ icon, title, state, onClick }: { icon: IconName; title: string; state: ActionState; onClick: () => void }) {
  return (
    <button
      type="button"
      className={`dm-detail-action${state.enabled ? '' : ' is-dim'}`}
      onClick={() => (state.enabled ? onClick() : showNotice(state.message))}
      title={state.enabled ? undefined : state.message}
    >
      <span className="dm-detail-icon"><Icon name={icon} /></span>
      <span>{title}</span>
    </button>
  );
}

type SectionLink = { title: string; onClick: () => void } | { title: string; href: string };

function DetailsSection({ title, link, children }: { title: string; link?: SectionLink; children: ReactNode }) {
  return (
    <section className="dm-details-section">
      <div className="dm-section-head">
        <h3>{title}</h3>
        {link && ('href' in link
          ? <a href={link.href}>{link.title}</a>
          : <button type="button" className="dm-link-button" onClick={link.onClick}>{link.title}</button>)}
      </div>
      {children}
    </section>
  );
}

/** Carte de la prochaine visite (VisitEventCard) ; l'ajout au calendrier se fait dans l'app iPhone. */
function VisitCard({ start, address }: { start: Date; address: string }) {
  return (
    <div className="dm-card dm-visit-card">
      <p className="dm-visit-label"><Icon name="calendarCheck" />VISITE CONFIRMÉE</p>
      <p className="dm-visit-date">{visitDateLong(start)}</p>
      <p className="dm-visit-place"><Icon name="pin" />{address}</p>
      <div className="dm-visit-actions">
        <button type="button" className="btn btn-primary" onClick={() => showIphoneOnly('Ajouter à l\'agenda')}>
          <Icon name="calendarPlus" />Ajouter à l'agenda
        </button>
        <a className="btn btn-light" href={`https://maps.apple.com/?${new URLSearchParams({ daddr: address })}`} target="_blank" rel="noopener noreferrer">
          <Icon name="navigation" />Itinéraire
        </a>
      </div>
    </div>
  );
}

/** Vignette carrée d'un média partagé (SharedMediaTile) : photo, ou vignette d'une vidéo avec sa durée. */
function MediaTile({ item, onOpen }: { item: SharedItem; onOpen: () => void }) {
  const attachment = item.attachment;
  const url = useSignedUrl(attachment?.kind === 'video' ? attachment.thumbnailPath : attachment?.storagePath);
  return (
    <button type="button" className="dm-media-square" onClick={onOpen} aria-label={item.kind === 'video' ? 'Vidéo' : 'Photo'}>
      {url ? <img src={url} alt="" loading="lazy" /> : <Icon name="image" />}
      {item.kind === 'video' && (
        <span className="dm-duration"><Icon name="play" />{attachment?.durationSeconds !== undefined ? durationLabel(attachment.durationSeconds) : null}</span>
      )}
    </button>
  );
}

/** « DPE · Vous · 6 nov. 2026 · 1,2 Mo » (SharedMediaView.subtitle). */
export function sharedSubtitle(item: SharedItem, conversation: Conversation, me: string | null): string {
  const parts = [senderName(item.senderId, conversation, me), shortDateWithYear(item.date)];
  if (item.attachment) {
    if (item.attachment.category) parts.unshift(CATEGORY_LABELS[item.attachment.category]);
    parts.push(sizeLabel(item.attachment.byteCount));
  }
  return parts.join(' · ');
}

// MARK: - Médias (SharedMediaView)

const TABS: { value: MediaTab; title: string; empty: string }[] = [
  { value: 'photos', title: 'Photos et vidéos', empty: 'Aucune photo ni vidéo pour l\'instant. Celles envoyées avec le + de la conversation apparaissent ici.' },
  { value: 'documents', title: 'Documents', empty: 'Aucun document pour l\'instant. Ceux envoyés avec le + de la conversation apparaissent ici.' },
  { value: 'liens', title: 'Liens', empty: 'Aucun lien partagé. Les liens écrits dans les messages apparaissent ici.' },
];

export function MediaView({ conversation, messages, tab, me }: { conversation: Conversation; messages: Message[]; tab: MediaTab; me: string | null }) {
  const [viewer, setViewer] = useState<number | null>(null);
  const visible = visibleMessages(messages, conversation.clearedAt);
  const shared = sharedItems(visible);
  const entries = mediaEntries(visible);
  const current = TABS.find((item) => item.value === tab) ?? TABS[0];
  const items = tab === 'photos' ? shared.media : tab === 'documents' ? shared.documents : shared.links;

  return (
    <section className="dm-pane dm-details" aria-labelledby="dm-media-title">
      <header className="dm-details-bar">
        <button
          type="button"
          className="dm-round is-plain"
          onClick={() => navigate({ conversationId: conversation.id, view: 'details' })}
          aria-label="Retour"
          title="Retour"
        >
          <Icon name="chevronLeft" />
        </button>
        <h2 id="dm-media-title" tabIndex={-1}>Médias</h2>
        <span className="dm-round is-plain is-spacer" aria-hidden="true" />
      </header>
      <div className="dm-details-scroll">
        <div className="dm-details-inner">
          <div className="dm-segments" role="tablist" aria-label="Type">
            {TABS.map((item) => (
              <button
                key={item.value}
                type="button"
                role="tab"
                aria-selected={item.value === tab}
                onClick={() => navigate({ conversationId: conversation.id, view: 'medias', tab: item.value }, { replace: true })}
              >
                {item.title}
              </button>
            ))}
          </div>
          {items.length === 0 ? (
            <p className="dm-media-empty">{current.empty}</p>
          ) : tab === 'photos' ? (
            <div className="dm-media-gallery">
              {shared.media.map((item) => (
                <MediaTile
                  key={item.id}
                  item={item}
                  onOpen={() => {
                    const index = entries.findIndex((entry) => entry.attachment.id === item.attachment?.id);
                    if (index >= 0) setViewer(index);
                  }}
                />
              ))}
            </div>
          ) : (
            <ul className="dm-card dm-rows">
              {items.map((item) => (
                <li key={item.id}>
                  {item.kind === 'link' && item.url ? (
                    <a className="dm-action-row" href={item.url} target="_blank" rel="noopener noreferrer">
                      <span className="dm-row-icon"><Icon name="share" /></span>
                      <span className="dm-action-text">
                        <span>{linkTitle(item.url)}</span>
                        <small>{sharedSubtitle(item, conversation, me)}</small>
                      </span>
                      <Icon name="chevronRight" className="icon dm-chevron" />
                    </a>
                  ) : <SharedDocumentRow item={item} subtitle={sharedSubtitle(item, conversation, me)} />}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      <MediaViewer entries={entries} index={viewer} conversation={conversation} me={me} onIndex={setViewer} onClose={() => setViewer(null)} />
    </section>
  );
}

/** Document partagé : il s'ouvre dans un nouvel onglet (URL signée de 10 minutes). */
function SharedDocumentRow({ item, subtitle }: { item: SharedItem; subtitle: string }) {
  const url = useSignedUrl(item.attachment?.storagePath);
  const name = item.attachment?.fileName ?? '';
  const body = (
    <>
      <span className="dm-row-icon"><Icon name={documentIcon(name)} /></span>
      <span className="dm-action-text">
        <span>{name}</span>
        <small>{subtitle}</small>
      </span>
      <Icon name="chevronRight" className="icon dm-chevron" />
    </>
  );
  return url
    ? <a className="dm-action-row" href={url} target="_blank" rel="noopener noreferrer">{body}</a>
    : <span className="dm-action-row is-waiting">{body}</span>;
}
