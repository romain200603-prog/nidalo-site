import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ChoiceChip, InfoLine } from '../../components/FilterControls';
import { Icon } from '../../components/Icon';
import type { Message } from '../../lib/messages/api';
import { addCommunityMembers } from '../../lib/messages/communities';
import { saveFile } from '../../lib/messages/exportFiles';
import { muteLabel } from '../../lib/messages/format';
import {
  addGroupMembers, canManage, collapsedMembers, countLabel, creationLabel, creatorName, dayMonthYearLabel, EPHEMERAL_DURATIONS,
  ephemeralOf, EXPORT_PERIODS, exportedMessages, exportFileName, exportSender, exportText, GROUP_DETAILS_LIMIT, GROUP_NAME_LIMIT,
  groupMemberActions, hideConversation, leaveConversation, memberMatches, moreMembersLabel, purposeLabel, removeGroupMember, roleIn, roleOf,
  setEphemeral, setGroupRole, submissionMessage, transferGroupOwnership, updateGroupInfo, type EphemeralDuration, type ExportPeriod,
} from '../../lib/messages/groups';
import { isMuted, sameId, type Conversation, type Member } from '../../lib/messages/inbox';
import { reloadConversations, updateSettings } from '../../lib/messages/store';
import { mediaEntries, MUTE_OPTIONS, mutedUntil, muteNotice, sharedItems, visibleMessages, type SharedItem } from '../../lib/messages/thread';
import { ReportSheet } from './actions';
import { MediaTile } from './Details';
import {
  AddMembersRow, DestructiveRow, Divider, ErrorLine, FieldLabel, FormCard, GroupSection, InfoBar, InfoToast, LimitedEditor, LimitedField,
  MemberRow, MemberSearch, ParticipantPicker, PhotoField, QuickTile, StepButton, useContacts, useInfoToast, usePhotoChoice,
} from './groupParts';
import { openContact } from './NewConversation';
import { ActionMenu, ConfirmDialog, ConversationAvatar, Sheet, showNotice, type MenuItem } from './parts';
import { navigate, type MediaTab } from './route';
import { MediaViewer } from './Thread';

// « Infos du groupe » (GroupInfoView.swift), poussé au-dessus de la conversation : l'en-tête (photo, nom, membres,
// type), Ajouter et Rechercher, puis « À propos », « Médias », « Paramètres de la conversation », « Actions du groupe »,
// les membres (rôles et actions selon le sien), « Quitter le groupe » (ou « Supprimer le groupe » une fois parti) et la
// date de création. Les réussites et les refus passent dans le bandeau bleu du bas, comme l'app. Aussi : « Ajouter des
// membres » (AddGroupMembersView, page et feuille), « Modifier le groupe », « Messages éphémères » et « Exporter la
// discussion ».

type Confirmation =
  | { kind: 'remove'; member: Member }
  | { kind: 'transfer'; member: Member }
  | { kind: 'clear' }
  | { kind: 'leave' }
  | { kind: 'delete' };

/** Après une action : la liste du serveur relue (rôles, membres, réglages), sans que son échec fasse échouer l'action. */
const reload = () => reloadConversations().catch(() => undefined);

/** Défilement doux, sauf « Réduire les animations ». */
const scrollBehavior = (): ScrollBehavior => (window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth');

export function GroupInfoView({ conversation, messages, me }: { conversation: Conversation; messages: Message[]; me: string | null }) {
  const id = conversation.id;
  const group = conversation.group;
  const hasLeft = conversation.hasLeft;
  const myRole = roleIn(conversation.members, me);
  const canEdit = canManage(myRole) && !hasLeft;
  const canManageMembers = canEdit;
  const [toast, show] = useInfoToast();
  const [editing, setEditing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [viewer, setViewer] = useState<number | null>(null);
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState('');
  const [showsAll, setShowsAll] = useState(false);
  const searchInput = useRef<HTMLInputElement>(null);
  const searchBar = useRef<HTMLDivElement>(null);
  const busy = useRef(false);
  const contacts = useContacts();

  const now = new Date();
  const visible = visibleMessages(messages, conversation.clearedAt, now);
  const shared = sharedItems(visible);
  const entries = mediaEntries(visible);
  const name = conversation.counterpart.name;
  const members = conversation.members;
  const count = members.length;
  const purpose = purposeLabel(group?.purpose);
  const createdBy = group?.createdBy ?? null;
  const filtering = query.trim() !== '';
  const shown = filtering ? members.filter((member) => memberMatches(member.name, query))
    : showsAll ? members : collapsedMembers(members, createdBy);
  const moreLabel = filtering ? null : moreMembersLabel(members, createdBy);
  const ephemeral = ephemeralOf(group?.ephemeralSeconds);
  const muted = isMuted(conversation, now);

  // « Rechercher » : la barre apparaît, la page glisse jusqu'à elle (en haut), puis le champ prend le focus.
  useLayoutEffect(() => {
    if (!searching) return;
    searchBar.current?.scrollIntoView({ block: 'start', behavior: scrollBehavior() });
    searchInput.current?.focus({ preventScroll: true });
  }, [searching]);

  /** Une action à la fois ; son refus dans le bandeau (n° 110), sa réussite ensuite. */
  const perform = async (operation: () => Promise<void>, then?: () => void) => {
    if (busy.current) return;
    busy.current = true;
    try {
      await operation();
      then?.();
    } catch (error) {
      show(submissionMessage(error));
    } finally {
      busy.current = false;
    }
  };

  const toMedia = (tab: MediaTab) => () => navigate({ conversationId: id, view: 'medias', tab });
  const toAdd = () => navigate({ conversationId: id, view: 'ajout' });
  const openMedia = (item: SharedItem) => {
    const index = entries.findIndex((entry) => entry.attachment.id === item.attachment?.id);
    if (index >= 0) setViewer(index);
  };

  /** « Envoyer un message » : la conversation à deux avec ce membre, s'il est parmi les contacts. */
  const writeTo = async (member: Member) => {
    const contact = contacts.find((item) => {
      const userId = item.conversations[0]?.otherUserId ?? item.professional?.user_id ?? null;
      return sameId(userId, member.userId);
    });
    if (!contact) {
      show(`${member.name} n'a pas encore de conversation avec vous.`);
      return;
    }
    if (!(await openContact(contact))) show(`Écrivez d'abord à ${member.name} depuis une de ses annonces.`);
  };

  const memberItems = (member: Member): MenuItem[] => {
    const { canPromote, canRemove } = groupMemberActions(hasLeft ? null : myRole, member);
    const isAdmin = roleOf(member.role) === 'admin';
    const items: MenuItem[] = [{ label: 'Envoyer un message', icon: 'messageCircle', onSelect: () => void writeTo(member) }];
    if (canPromote) {
      items.push({
        label: isAdmin ? 'Retirer le rôle d\'administrateur' : 'Nommer administrateur', icon: 'shieldCheck',
        onSelect: () => void perform(async () => {
          await setGroupRole(id, member.userId, isAdmin ? 'member' : 'admin');
          await reload();
        }, () => show(isAdmin ? `${member.name} n'est plus administrateur` : `${member.name} est administrateur`)),
      });
      items.push({ label: 'Transférer la propriété', icon: 'crown', onSelect: () => setConfirmation({ kind: 'transfer', member }) });
    }
    if (canRemove) {
      items.push({ label: 'Retirer du groupe', icon: 'userMinus', destructive: true, onSelect: () => setConfirmation({ kind: 'remove', member }) });
    }
    return items;
  };

  const confirm = (item: Confirmation) => {
    switch (item.kind) {
      case 'remove':
        void perform(async () => { await removeGroupMember(id, item.member.userId); await reload(); }, () => show(`${item.member.name} retiré du groupe`));
        break;
      case 'transfer':
        void perform(async () => { await transferGroupOwnership(id, item.member.userId); await reload(); },
          () => show(`${item.member.name} est créateur du groupe`));
        break;
      case 'clear':
        void perform(async () => {
          await updateSettings(id, (current) => ({ ...current, clearedAt: new Date().toISOString() }));
          await reload();
        }, () => show('Discussion effacée'));
        break;
      case 'leave':
        // Les infos puis la conversation se ferment : retour à la liste.
        void perform(async () => { await leaveConversation(id); await reload(); }, () => navigate({ conversationId: null }));
        break;
      case 'delete':
        void perform(async () => { await hideConversation(id); await reload(); }, () => navigate({ conversationId: null }));
        break;
    }
  };

  const dialog = confirmationTexts(confirmation);

  return (
    <section className="dm-pane dm-details dmg-page" aria-labelledby="dmg-group-title">
      <InfoBar
        titleId="dmg-group-title"
        title="Infos du groupe"
        onBack={() => navigate({ conversationId: id })}
        action={canEdit ? { label: 'Modifier', onClick: () => setEditing(true) } : null}
      />
      <div className="dm-details-scroll">
        <div className="dm-details-inner dmg-inner">
          <header className="dmg-hero">
            <span className="dmg-hero-avatar">
              <ConversationAvatar conversation={conversation} size={92} fontSize={26} />
              {canEdit && (
                <button type="button" className="dmg-hero-camera" onClick={() => setEditing(true)} aria-label="Modifier la photo du groupe" title="Modifier la photo du groupe">
                  <Icon name="camera" />
                </button>
              )}
            </span>
            <h3 className="dmg-hero-name">{name}</h3>
            <p className="dmg-hero-sub">Groupe · {countLabel(count, 'membre')}</p>
            {purpose && <span className="dmg-tag">{purpose}</span>}
          </header>

          <div className="dmg-tiles">
            <QuickTile icon="userPlus" title="Ajouter" enabled={canManageMembers} onClick={toAdd} />
            <QuickTile icon="search" title="Rechercher" onClick={() => setSearching(true)} />
          </div>

          <GroupSection title="À propos">
            {group?.details && (
              <>
                <p className="dmg-about">{group.details}</p>
                <Divider inset={16} />
              </>
            )}
            <p className="dmg-about-by">Créé par {creatorName(createdBy, members, me)} · {creationLabel(conversation.createdAt, now)}</p>
          </GroupSection>

          <GroupSection title="Médias">
            <div className="dmg-media-head">
              {shared.media.length > 0 && (
                <span>{shared.media.length === 1 ? '1 photo ou vidéo' : `${shared.media.length} photos et vidéos`}</span>
              )}
              <button type="button" className="dm-link-button" onClick={toMedia('photos')}>Tout voir</button>
            </div>
            {shared.media.length === 0 && shared.documents.length === 0 && shared.links.length === 0 ? (
              <div className="dmg-media-empty">
                <Icon name="image" />
                <p>Les photos et documents partagés dans ce groupe apparaîtront ici.</p>
              </div>
            ) : (
              <>
                {shared.media.length > 0 && (
                  <div className="dmg-media-grid">
                    {shared.media.slice(0, 6).map((item) => (
                      <div key={item.id} className="dmg-media-tile"><MediaTile item={item} onOpen={() => openMedia(item)} /></div>
                    ))}
                  </div>
                )}
                {shared.documents.length > 0 && (
                  <>
                    <Divider inset={62} />
                    <MediaLine icon="fileText" title="Documents" count={shared.documents.length} onClick={toMedia('documents')} />
                  </>
                )}
                {shared.links.length > 0 && (
                  <>
                    <Divider inset={62} />
                    <MediaLine icon="share" title="Liens" count={shared.links.length} onClick={toMedia('liens')} />
                  </>
                )}
              </>
            )}
          </GroupSection>

          <GroupSection title="Paramètres de la conversation">
            <ActionMenu
              label="Notifications"
              className="dm-action-row"
              items={MUTE_OPTIONS.map((option) => ({
                label: option.label,
                icon: option.value === 'off' ? 'bell' : 'bellOff',
                onSelect: () => void perform(async () => {
                  const until = mutedUntil(option.value);
                  await updateSettings(id, (current) => ({ ...current, mutedUntil: until ? until.toISOString() : null }));
                }, () => show(muteNotice(option.value))),
              }))}
            >
              <Icon name={muted ? 'bellOff' : 'bell'} />
              <span className="dm-action-text"><span>Notifications</span></span>
              <span className="dmg-value">{muteLabel(conversation.mutedUntil, now)}</span>
              <Icon name="chevronRight" className="icon dm-chevron" />
            </ActionMenu>
            <Divider inset={62} />
            <button type="button" className="dm-action-row" onClick={() => navigate({ conversationId: id, view: 'ephemeres' })}>
              <Icon name="clock" />
              <span className="dm-action-text"><span>Messages éphémères</span></span>
              <span className="dmg-value">{ephemeral.label}</span>
              <Icon name="chevronRight" className="icon dm-chevron" />
            </button>
            <Divider inset={62} />
            <button
              type="button"
              className="dm-action-row"
              aria-pressed={conversation.isFavorite}
              onClick={() => {
                const adding = !conversation.isFavorite;
                void perform(() => updateSettings(id, (current) => ({ ...current, isFavorite: adding })),
                  () => show(adding ? 'Ajouté aux favoris' : 'Retiré des favoris'));
              }}
            >
              <Icon name="heart" />
              <span className="dm-action-text">
                <span>{conversation.isFavorite ? 'Retirer des favoris' : 'Ajouter aux favoris'}</span>
                <small>Retrouvez ce groupe avec le filtre Favoris de Messages</small>
              </span>
              <span className={`dm-favorite-mark${conversation.isFavorite ? ' is-on' : ''}`} aria-hidden="true"><Icon name="heart" /></span>
            </button>
          </GroupSection>

          <GroupSection title="Actions du groupe">
            <button type="button" className="dm-action-row" onClick={() => setExporting(true)}>
              <Icon name="fileText" />
              <span className="dm-action-text"><span>Exporter la discussion</span></span>
              <Icon name="chevronRight" className="icon dm-chevron" />
            </button>
            <Divider inset={62} />
            <button type="button" className="dm-action-row" onClick={() => setConfirmation({ kind: 'clear' })}>
              <Icon name="trash2" />
              <span className="dm-action-text"><span>Effacer la discussion</span><small>Seulement pour vous</small></span>
              <Icon name="chevronRight" className="icon dm-chevron" />
            </button>
            <Divider inset={62} />
            <DestructiveRow icon="triangleAlert" title="Signaler le groupe" onClick={() => setReporting(true)} />
          </GroupSection>

          <GroupSection title={countLabel(count, 'membre')}>
            {canManageMembers && (
              <>
                <AddMembersRow onClick={toAdd} />
                <Divider inset={64} />
              </>
            )}
            {searching && (
              <div ref={searchBar} className="dmg-search-anchor">
                <MemberSearch
                  query={query}
                  onChange={setQuery}
                  onClose={() => { setSearching(false); setQuery(''); }}
                  inputRef={searchInput}
                />
              </div>
            )}
            {shown.length === 0 && <p className="dmg-none">Aucun membre pour « {query} »</p>}
            <ul className="dmg-members">
              {shown.map((member) => (
                <li key={member.userId}>
                  {sameId(member.userId, me) ? (
                    <span className="dmg-member-line"><MemberRow member={member} /></span>
                  ) : (
                    <ActionMenu label={member.name} className="dmg-member-line" items={memberItems(member)}>
                      <MemberRow member={member} />
                    </ActionMenu>
                  )}
                </li>
              ))}
            </ul>
            {moreLabel && (
              <>
                <Divider inset={16} />
                <button
                  type="button"
                  className={`dmg-more${showsAll ? ' is-open' : ''}`}
                  aria-expanded={showsAll}
                  title={showsAll ? 'Replie la liste des membres' : 'Affiche tous les membres'}
                  onClick={() => setShowsAll((value) => !value)}
                >
                  {showsAll ? 'Voir moins' : moreLabel}
                  <Icon name="chevronDown" />
                </button>
              </>
            )}
          </GroupSection>

          <GroupSection>
            {hasLeft
              ? <DestructiveRow icon="trash2" title="Supprimer le groupe" onClick={() => setConfirmation({ kind: 'delete' })} />
              : <DestructiveRow icon="logOut" title="Quitter le groupe" onClick={() => setConfirmation({ kind: 'leave' })} />}
          </GroupSection>

          <p className="dmg-foot">Groupe créé le {dayMonthYearLabel(conversation.createdAt)}</p>
          {searching && <div className="dmg-search-room" aria-hidden="true" />}
        </div>
      </div>
      <InfoToast toast={toast} />

      <EditGroupInfoSheet open={editing} conversation={conversation} onClose={() => setEditing(false)} onSaved={() => show('Infos du groupe mises à jour')} />
      <ExportSheet open={exporting} conversation={conversation} messages={messages} me={me} onClose={() => setExporting(false)} />
      <ReportSheet
        open={reporting}
        title="Signaler le groupe"
        conversationId={id}
        offersLeave={!hasLeft}
        onClose={() => setReporting(false)}
        onSaved={(notice, leaves) => {
          show(notice);
          if (leaves) void perform(async () => { await leaveConversation(id); await reload(); }, () => show('Vous avez quitté le groupe'));
        }}
      />
      <ConfirmDialog
        open={confirmation !== null}
        title={dialog.title}
        message={dialog.message}
        confirm={dialog.confirm}
        destructive={dialog.destructive}
        onConfirm={() => { if (confirmation) confirm(confirmation); }}
        onClose={() => setConfirmation(null)}
      />
      <MediaViewer entries={entries} index={viewer} conversation={conversation} me={me} onIndex={setViewer} onClose={() => setViewer(null)} />
    </section>
  );
}

/** Titre, texte et bouton de chaque confirmation (confirmationTitle, confirmationMessage, confirmationActions). */
function confirmationTexts(item: Confirmation | null): { title: string; message: string; confirm: string; destructive: boolean } {
  switch (item?.kind) {
    case 'remove':
      return { title: `Retirer ${item.member.name} ?`, message: 'Cette personne ne fera plus partie du groupe.', confirm: 'Retirer du groupe', destructive: true };
    case 'transfer':
      return {
        title: `Transférer la propriété à ${item.member.name} ?`, message: 'Cette personne devient créatrice du groupe ; vous restez administrateur.',
        confirm: 'Transférer la propriété', destructive: false,
      };
    case 'clear':
      return {
        title: 'Effacer la discussion ?', message: 'L\'historique est effacé seulement pour vous. Les autres membres le gardent.',
        confirm: 'Effacer la discussion', destructive: true,
      };
    case 'leave':
      return {
        title: 'Quitter le groupe ?',
        message: 'Le groupe reste pour les autres membres. S\'il vous a été confié, le rôle de créateur passe à l\'administrateur le plus ancien, sinon au membre le plus ancien.',
        confirm: 'Quitter le groupe', destructive: true,
      };
    case 'delete':
      return {
        title: 'Supprimer le groupe ?', message: 'Le groupe est retiré de votre liste. Il n\'est pas supprimé pour les autres membres.',
        confirm: 'Supprimer le groupe', destructive: true,
      };
    default:
      return { title: '', message: '', confirm: '', destructive: false };
  }
}

/** Ligne « Documents » ou « Liens » des médias : le nombre en bleu (« Aucun » en gris), puis le chevron. */
function MediaLine({ icon, title, count, onClick }: { icon: 'fileText' | 'share'; title: string; count: number; onClick: () => void }) {
  return (
    <button type="button" className="dm-action-row" onClick={onClick}>
      <Icon name={icon} />
      <span className="dm-action-text"><span>{title}</span></span>
      <span className={`dmg-count-value${count === 0 ? ' is-none' : ''}`}>{count === 0 ? 'Aucun' : count}</span>
      <Icon name="chevronRight" className="icon dm-chevron" />
    </button>
  );
}

// MARK: - Ajouter des membres

/**
 * Choix des nouveaux membres parmi les contacts (ceux du groupe ne sont pas proposés), puis « Ajouter au groupe (2) » ;
 * pour une communauté, seulement les comptes que le serveur accepte, puis « Ajouter 2 ». Le refus du serveur s'écrit
 * au-dessus du bouton.
 */
function AddMembersForm({ conversation, onAdded }: { conversation: Conversation; onAdded: (count: number) => void }) {
  const [selection, setSelection] = useState<Member[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const community = conversation.community;
  const existing = (community ? community.members : conversation.members).map((member) => member.userId);
  const count = selection.length;
  const title = community ? (count === 0 ? 'Ajouter' : `Ajouter ${count}`) : count === 0 ? 'Ajouter au groupe' : `Ajouter au groupe (${count})`;

  const add = async () => {
    if (sending || count === 0) return;
    setSending(true);
    setError(null);
    try {
      if (community) await addCommunityMembers(community.id, selection);
      else await addGroupMembers(conversation.id, selection);
      await reload();
      setSending(false);
      onAdded(count);
    } catch (failure) {
      setSending(false);
      setError(submissionMessage(failure));
    }
  };

  return (
    <>
      <div className="dm-new-body dmg-body">
        <ParticipantPicker
          selection={selection}
          onChange={setSelection}
          excluded={existing}
          placeholder={community ? undefined : 'Rechercher un membre…'}
          onlyServerAccounts={!!community}
        />
      </div>
      <StepButton title={title} enabled={count > 0} loading={sending} error={error} onClick={() => void add()} />
    </>
  );
}

/** « Ajouter des membres » poussé depuis les infos (groupe) ou la page de la communauté ; ajoutés, on y revient. */
export function AddMembersView({ conversation }: { conversation: Conversation }) {
  const back = () => navigate({ conversationId: conversation.id, view: conversation.community ? 'communaute' : 'groupe' });
  return (
    <section className="dm-pane dm-details dmg-page" aria-labelledby="dmg-add-title">
      <InfoBar titleId="dmg-add-title" title="Ajouter des membres" onBack={back} />
      <AddMembersForm conversation={conversation} onAdded={back} />
    </section>
  );
}

/** Feuille de l'en-tête de la conversation (groupe seulement) : ajoutés, elle se ferme et l'avis le dit. */
export function AddGroupMembersSheet({ open, conversation, onClose }: { open: boolean; conversation: Conversation; onClose: () => void }) {
  return (
    <Sheet open={open} title="Ajouter des membres" onClose={onClose} closeLabel="Annuler" className="dmg-sheet">
      <AddMembersForm
        conversation={conversation}
        onAdded={(count) => {
          onClose();
          showNotice(count > 1 ? `${count} membres ajoutés au groupe.` : 'Membre ajouté au groupe.');
        }}
      />
    </Sheet>
  );
}

// MARK: - Modifier le groupe

function EditGroupInfoSheet({ open, conversation, onClose, onSaved }: { open: boolean; conversation: Conversation; onClose: () => void; onSaved: () => void }) {
  return (
    <Sheet open={open} title="Modifier le groupe" onClose={onClose} closeLabel="Annuler" className="dmg-sheet">
      <EditGroupInfoForm conversation={conversation} onClose={onClose} onSaved={onSaved} />
    </Sheet>
  );
}

/** Photo, nom (obligatoire) et description ; « Enregistrer » envoie le nom et la description tels que saisis. */
function EditGroupInfoForm({ conversation, onClose, onSaved }: { conversation: Conversation; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(conversation.counterpart.name);
  const [details, setDetails] = useState(conversation.group?.details ?? '');
  const photo = usePhotoChoice(conversation.counterpart.imagePath);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const missing = name.trim() === '';

  const save = async () => {
    if (saving || missing) return;
    setSaving(true);
    setError(null);
    try {
      await updateGroupInfo(conversation.id, name, details, photo.choice);
      await reload();
      setSaving(false);
      onSaved();
      onClose();
    } catch (failure) {
      setSaving(false);
      setError(submissionMessage(failure));
    }
  };

  return (
    <>
      <div className="dm-sheet-content dmg-body">
        <PhotoField url={photo.url} hasPhoto={photo.choice !== null} onPick={(file) => void photo.pick(file)} onRemove={photo.remove} error={photo.error} />
        <FormCard>
          <LimitedField label="Nom du groupe" placeholder="Exemple : Projet immobilier Lyon" value={name} onChange={setName}
            limit={GROUP_NAME_LIMIT} error={missing ? 'Donnez un nom au groupe.' : null} />
          <LimitedEditor label="Description (facultative)" placeholder="Objectif du groupe" value={details} onChange={setDetails} limit={GROUP_DETAILS_LIMIT} />
        </FormCard>
        {error && <ErrorLine text={error} />}
      </div>
      <StepButton title="Enregistrer" enabled={!missing} loading={saving} onClick={() => void save()} />
    </>
  );
}

// MARK: - Messages éphémères

export function EphemeralView({ conversation }: { conversation: Conversation }) {
  const current = ephemeralOf(conversation.group?.ephemeralSeconds);
  const [pending, setPending] = useState<EphemeralDuration | null>(null);
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);

  const apply = async (duration: EphemeralDuration) => {
    if (busy.current) return;
    busy.current = true;
    setError(null);
    try {
      await setEphemeral(conversation.id, duration);
      await reload();
    } catch (failure) {
      setError(submissionMessage(failure));
    } finally {
      busy.current = false;
    }
  };

  return (
    <section className="dm-pane dm-details dmg-page" aria-labelledby="dmg-ephemeral-title">
      <InfoBar titleId="dmg-ephemeral-title" title="Messages éphémères" onBack={() => navigate({ conversationId: conversation.id, view: 'groupe' })} />
      <div className="dm-details-scroll">
        <div className="dm-details-inner dmg-inner is-tight">
          <InfoLine>
            Les nouveaux messages disparaissent automatiquement après la durée choisie. Les messages déjà envoyés ne changent pas. Une ligne informe les membres du groupe.
          </InfoLine>
          <ul className="dmg-plain-card" role="radiogroup" aria-label="Messages éphémères">
            {EPHEMERAL_DURATIONS.map((duration) => {
              const selected = duration.value === current.value;
              return (
                <li key={duration.value}>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    className="dmg-radio-row"
                    onClick={() => {
                      if (duration.value === 'off') void apply(duration);
                      else if (!selected) setPending(duration);
                    }}
                  >
                    <span>{duration.label}</span>
                    <span className={`dmg-check is-22${selected ? ' is-on' : ''}`} aria-hidden="true">{selected && <Icon name="check" />}</span>
                  </button>
                </li>
              );
            })}
          </ul>
          {error && <ErrorLine text={error} />}
        </div>
      </div>
      <ConfirmDialog
        open={pending !== null}
        title="Activer les messages éphémères ?"
        message={pending ? `Les nouveaux messages de ce groupe disparaîtront de la conversation, pour tous les membres, ${pending.label} après leur envoi.` : ''}
        confirm={pending ? `Activer : ${pending.label}` : ''}
        onConfirm={() => { if (pending) void apply(pending); }}
        onClose={() => setPending(null)}
      />
    </section>
  );
}

// MARK: - Exporter la discussion

function ExportSheet({ open, conversation, messages, me, onClose }: {
  open: boolean;
  conversation: Conversation;
  messages: Message[];
  me: string | null;
  onClose: () => void;
}) {
  return (
    <Sheet open={open} title="Exporter la discussion" onClose={onClose} className="dmg-sheet">
      <ExportForm conversation={conversation} messages={messages} me={me} />
    </Sheet>
  );
}

/** Période, nombre de messages, puis « Exporter » : un fichier texte de ce que l'on voit dans la discussion. */
function ExportForm({ conversation, messages, me }: { conversation: Conversation; messages: Message[]; me: string | null }) {
  const [period, setPeriod] = useState<ExportPeriod>('all');
  const [failed, setFailed] = useState(false);
  const title = conversation.counterpart.name;
  const exported = exportedMessages(messages, conversation.clearedAt, period);
  useEffect(() => setFailed(false), [period]);

  const download = () => {
    try {
      saveFile(exportFileName(title), exportText(title, exported, exportSender(conversation, me)), 'text/plain;charset=utf-8');
    } catch {
      setFailed(true);
    }
  };

  return (
    <div className="dm-sheet-content dmg-body">
      <FormCard>
        <FieldLabel>Période</FieldLabel>
        {EXPORT_PERIODS.map((option) => (
          <ChoiceChip key={option.value} title={option.label} selected={period === option.value} expands onClick={() => setPeriod(option.value)} />
        ))}
      </FormCard>
      <FormCard>
        <p className="dmg-export-count">{exported.length} message{exported.length > 1 ? 's' : ''} · fichier texte (.txt)</p>
        <p className="dmg-export-note">Seulement ce que vous voyez dans la discussion : rien de ce que vous avez effacé.</p>
      </FormCard>
      {failed ? <ErrorLine text="Le fichier n'a pas pu être préparé." /> : (
        <button type="button" className="btn btn-primary dmg-wide" onClick={download}>
          <Icon name="share" />
          Exporter
        </button>
      )}
    </div>
  );
}
