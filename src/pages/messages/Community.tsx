import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { showToast } from '../../components/AppToast';
import { ContentUnavailable } from '../../components/ContentUnavailable';
import { Icon } from '../../components/Icon';
import type { IconName } from '../../components/iconPaths';
import { createStore, useStore } from '../../lib/account/session';
import {
  categoryOf, COMMUNITY_AREA_LIMIT, COMMUNITY_CATEGORIES, COMMUNITY_COVERS, COMMUNITY_DETAILS_LIMIT, COMMUNITY_NAME_LIMIT, communityInvites,
  communityIssues, communityMemberActions, coverOf, createCommunity, createCommunityInvite, decideJoinRequest, inviteLink, inviteMessage,
  inviteShareText, joinRequests, leaveCommunity, removeCommunityMember, revokeCommunityInvite, setCommunityRole, updateCommunityInfo,
  validityLabel, type CommunityCategory, type CommunityCover, type CommunityDraft, type CommunityInvite, type JoinRequest,
} from '../../lib/messages/communities';
import { listLabel } from '../../lib/messages/format';
import { canManage, countLabel, creatorName, dayMonthLabel, dayMonthYearLabel, memberMatches, roleIn, roleOf, submissionMessage } from '../../lib/messages/groups';
import { sameId, type CommunityInfo, type Conversation, type Member } from '../../lib/messages/inbox';
import { reloadConversations } from '../../lib/messages/store';
import { QrCode } from '../account/Diffusion';
import {
  AddMembersRow, DestructiveRow, Divider, ErrorLine, FieldLabel, FormCard, GroupSection, InfoBar, InfoToast, LimitedEditor, LimitedField,
  MemberRow, MemberSearch, ParticipantPicker, PHOTO_FAILED, PhotoField, PhotoInput, preparedGroupPhoto, QuickTile, StepButton, useInfoToast,
  useObjectUrl, usePhotoChoice,
} from './groupParts';
import { ActionMenu, ConfirmDialog, CounterpartAvatar, PlainSheet, Sheet, useSignedUrl, type MenuItem } from './parts';
import { navigate } from './route';

// Communautés, comme l'app (CommunityViews.swift, CommunityInviteViews.swift) : « Nouvelle communauté » en deux étapes
// (Informations, puis Premiers membres), la page « Communauté » (visuel, Ajouter, Rechercher, Inviter, « À propos »,
// « Demandes », « Discussions », membres, « Quitter la communauté »), « Modifier la communauté », ses infos, l'invitation
// par lien et QR code, et les demandes pour entrer. L'aperçu d'un lien ouvert (« Invitation ») reste dans l'app : le
// lien est un lien de l'app (nidalo://invite/…).

const reload = () => reloadConversations().catch(() => undefined);

const scrollBehavior = (): ScrollBehavior => (window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth');

// MARK: - Indicateur d'étapes (StepProgressHeader touchable)

const STEP_TITLES = ['Informations', 'Membres'];

/**
 * « Étape 1 sur 2 · Informations » et la barre d'étapes touchable : bleue jusqu'à l'étape la plus loin atteinte,
 * l'étape en cours un peu plus épaisse ; un appui sur une étape atteinte l'ouvre.
 */
function StepHeader({ current, reached, onSelect }: { current: 0 | 1; reached: number; onSelect: (index: number) => void }) {
  const last = Math.max(reached, current);
  return (
    <div className="dmg-steps">
      <p className="dmg-steps-title" aria-hidden="true">Étape {current + 1} sur 2 · {STEP_TITLES[current]}</p>
      <div className="dmg-steps-bar">
        {STEP_TITLES.map((title, index) => {
          const isReached = index <= last;
          return (
            <button
              key={title}
              type="button"
              className={`${isReached ? 'is-done' : ''}${index === current ? ' is-current' : ''}`}
              disabled={!isReached}
              aria-hidden={isReached ? undefined : true}
              aria-current={index === current ? 'step' : undefined}
              aria-label={`Étape ${index + 1} sur 2, ${title}, ${index === current ? 'en cours' : 'terminée'}`}
              onClick={() => { if (index !== current) onSelect(index); }}
            >
              <span />
            </button>
          );
        })}
      </div>
    </div>
  );
}

// MARK: - Couverture

/** Couverture dessinée (CommunityCoverView) : dégradé de la charte et icône en filigrane, ou la photo choisie. */
function CoverArt({ cover, photo, iconSize, letter }: { cover: string | null; photo: string | null; iconSize: number; letter?: string }) {
  if (photo) return <span className="dmg-cover"><img src={photo} alt="" /></span>;
  const style = coverOf(cover);
  return (
    <span className="dmg-cover" style={{ backgroundImage: `linear-gradient(to bottom right, ${style.from}, ${style.to})` }}>
      {iconSize > 0 && (
        <span className="dmg-cover-mark" style={{ width: iconSize, height: iconSize, right: -iconSize * 0.12, bottom: -iconSize * 0.18 }}>
          <Icon name={style.icon} />
        </span>
      )}
      {letter && <span className="dmg-cover-letter">{letter}</span>}
    </span>
  );
}

/** Aperçu pendant la saisie (CommunityPreviewCard) : couverture, avatar carré arrondi, nom, catégorie, zone, « Privée ». */
function PreviewCard({ draft, photo }: { draft: CommunityDraft; photo: string | null }) {
  const name = draft.name.trim();
  const area = draft.area.trim();
  const line = [draft.category ? categoryOf(draft.category).label : null, area || null, 'Privée'].filter(Boolean).join(' · ');
  return (
    <div className="dmg-preview" role="img" aria-label={`Aperçu : ${name || 'communauté sans nom'}`}>
      <div className="dmg-preview-cover">
        <CoverArt cover={draft.cover} photo={photo} iconSize={64} />
        <CounterpartAvatar counterpart={{ name, kind: 'community', imagePath: null }} size={52} fontSize={17} className="dmg-preview-avatar" />
      </div>
      <div className="dmg-preview-text">
        <strong className={name ? undefined : 'is-empty'}>{name || 'Nom de la communauté'}</strong>
        <span>{line}</span>
      </div>
    </div>
  );
}

/** Tuile de catégorie : icône, libellé ; bordure bleue et coche une fois choisie (CommunityCategoryTile). */
function CategoryTile({ category, selected, wide = false, onClick }: {
  category: (typeof COMMUNITY_CATEGORIES)[number];
  selected: boolean;
  wide?: boolean;
  onClick: () => void;
}) {
  return (
    <button type="button" className={`dmg-category${wide ? ' is-wide' : ''}${selected ? ' is-on' : ''}`} aria-pressed={selected} onClick={onClick}>
      <span className="dmg-category-icon"><Icon name={category.icon as IconName} /></span>
      <span className="dmg-category-label">{category.label}</span>
      {selected && <span className="dmg-category-check" aria-hidden="true"><Icon name="check" /></span>}
    </button>
  );
}

// MARK: - Nouvelle communauté, étape 1

type Field = 'name' | 'details' | 'category';

/**
 * Informations : aperçu, couverture (quatre couvertures Nidalo ou une photo), nom, description, catégorie, zone et
 * visibilité « Privée » ; « Suivant » montre le premier champ manquant.
 */
export function NewCommunityInfo({ draft, onChange, reached, onNext }: {
  draft: CommunityDraft;
  onChange: (draft: CommunityDraft) => void;
  /** L'étape « Membres » a déjà été ouverte : son trait est touchable, et un retour montre ce qui manque. */
  reached: boolean;
  onNext: () => void;
}) {
  const [showsErrors, setShowsErrors] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const photoUrl = useObjectUrl(draft.photo);
  const photoInput = useRef<HTMLInputElement>(null);
  const details = useRef<HTMLTextAreaElement>(null);
  const area = useRef<HTMLInputElement>(null);
  const fields = { name: useRef<HTMLDivElement>(null), details: useRef<HTMLDivElement>(null), category: useRef<HTMLDivElement>(null) };
  const issues = communityIssues(draft);
  const set = (patch: Partial<CommunityDraft>) => onChange({ ...draft, ...patch });
  const selectedCover: CommunityCover | null = draft.photo ? null : draft.cover ?? 'brand';

  const showErrors = () => {
    setShowsErrors(true);
    const first = issues[0];
    const field: Field | null = first === 'missingName' || first === 'nameTooLong' ? 'name' : first === 'missingDetails' ? 'details' : first === 'missingCategory' ? 'category' : null;
    if (field) window.setTimeout(() => fields[field].current?.scrollIntoView({ block: 'center', behavior: scrollBehavior() }), 120);
  };

  // Retour de « Membres » après « Créer » avec un champ manquant : il est montré ici.
  useEffect(() => {
    if (reached && communityIssues(draft).length > 0) showErrors();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pickPhoto = async (file: File) => {
    const blob = await preparedGroupPhoto(file);
    if (!blob) {
      setPhotoError(PHOTO_FAILED);
      return;
    }
    set({ photo: blob });
    setPhotoError(null);
  };

  const next = () => {
    if (issues.length === 0) {
      setShowsErrors(false);
      onNext();
    } else {
      showErrors();
    }
  };

  return (
    <>
      <StepHeader current={0} reached={reached ? 1 : 0} onSelect={() => { setShowsErrors(false); onNext(); }} />
      <div className="dm-new-body dmg-body is-form">
        <PreviewCard draft={draft} photo={photoUrl} />

        <FormCard>
          <FieldLabel>Couverture</FieldLabel>
          <div className="dmg-covers">
            {COMMUNITY_COVERS.map((cover) => (
              <button
                key={cover.value}
                type="button"
                className={`dmg-cover-choice${selectedCover === cover.value ? ' is-on' : ''}`}
                aria-label={`Couverture ${cover.label}`}
                aria-pressed={selectedCover === cover.value}
                onClick={() => set({ photo: null, cover: cover.value })}
              >
                <CoverArt cover={cover.value} photo={null} iconSize={26} />
                <CoverRing selected={selectedCover === cover.value} />
              </button>
            ))}
            <button
              type="button"
              className={`dmg-cover-choice is-photo${draft.photo ? ' is-on' : ''}`}
              aria-label={draft.photo ? 'Changer la photo' : 'Choisir une photo'}
              aria-pressed={!!draft.photo}
              onClick={() => photoInput.current?.click()}
            >
              {photoUrl ? <span className="dmg-cover"><img src={photoUrl} alt="" /></span> : (
                <span className="dmg-cover-photo"><Icon name="image" /><span>Photo</span></span>
              )}
              <CoverRing selected={!!draft.photo} />
            </button>
            <PhotoInput inputRef={photoInput} onPick={(file) => void pickPhoto(file)} />
          </div>
          {photoError && <ErrorLine text={photoError} />}
        </FormCard>

        <FormCard>
          <div ref={fields.name}>
            <LimitedField
              label="Nom de la communauté"
              placeholder="Exemple : Investisseurs immobiliers à Lyon"
              value={draft.name}
              onChange={(name) => set({ name })}
              limit={COMMUNITY_NAME_LIMIT}
              error={showsErrors && !draft.name.trim() ? 'Donnez un nom à la communauté.' : null}
              onEnter={() => details.current?.focus()}
            />
          </div>
          <div ref={fields.details}>
            <LimitedEditor
              label="Description"
              placeholder="Exemple : Partage d'opportunités, conseils et retours d'expérience sur l'investissement immobilier dans la région lyonnaise."
              value={draft.details}
              onChange={(value) => set({ details: value })}
              limit={COMMUNITY_DETAILS_LIMIT}
              error={showsErrors && issues.includes('missingDetails') ? 'Expliquez en quelques mots le but de la communauté.' : null}
              inputRef={details}
            />
          </div>
        </FormCard>

        <div ref={fields.category}>
          <FormCard>
            <FieldLabel>Catégorie</FieldLabel>
            {showsErrors && issues.includes('missingCategory') && <ErrorLine text="Veuillez sélectionner une option." />}
            <CategoryTile category={categoryOf('general')} selected={draft.category === 'general'} wide onClick={() => set({ category: 'general' })} />
            <div className="dmg-categories">
              {COMMUNITY_CATEGORIES.filter((category) => category.value !== 'general').map((category) => (
                <CategoryTile key={category.value} category={category} selected={draft.category === category.value}
                  onClick={() => set({ category: category.value as CommunityCategory })} />
              ))}
            </div>
          </FormCard>
        </div>

        <FormCard>
          <LimitedField
            label="Zone géographique (facultative)"
            placeholder="Exemple : Lyon et alentours"
            value={draft.area}
            onChange={(value) => set({ area: value })}
            limit={COMMUNITY_AREA_LIMIT}
            inputRef={area}
            onEnter={() => area.current?.blur()}
          />
        </FormCard>

        <FormCard>
          <FieldLabel>Visibilité</FieldLabel>
          <div className="dmg-visibility">
            <span className="dmg-visibility-icon"><Icon name="lock" /></span>
            <span className="dmg-visibility-text">
              <strong>Privée</strong>
              <span>Seuls les membres que vous invitez accèdent à la communauté. Une communauté publique, que chacun peut découvrir et rejoindre, arrivera avec la messagerie en ligne.</span>
            </span>
            <span className="dmg-check is-22 is-on" aria-hidden="true"><Icon name="check" /></span>
          </div>
        </FormCard>
      </div>
      <StepButton title="Suivant" onClick={next} />
    </>
  );
}

/** Contour d'une vignette de couverture, coché quand elle est choisie (CoverSelectionRing). */
function CoverRing({ selected }: { selected: boolean }) {
  return (
    <span className={`dmg-cover-ring${selected ? ' is-on' : ''}`} aria-hidden="true">
      {selected && <span className="dmg-cover-tick"><Icon name="check" /></span>}
    </span>
  );
}

// MARK: - Nouvelle communauté, étape 2

/**
 * Création de la communauté (NewCommunityMembersView.create) : avec un champ manquant, l'étape « Informations »
 * s'ouvre et le montre ; sinon create_community, la liste relue, puis la discussion principale s'ouvre.
 */
export function useCommunityCreation(draft: CommunityDraft, { onMissingInfo, onCreated }: { onMissingInfo: () => void; onCreated: (conversationId: string) => void }) {
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);
  const create = async () => {
    if (communityIssues(draft).length > 0) {
      onMissingInfo();
      return;
    }
    if (busy.current) return;
    busy.current = true;
    setSending(true);
    setError(null);
    try {
      const conversationId = await createCommunity(draft);
      await reload();
      onCreated(conversationId);
    } catch (failure) {
      setError(submissionMessage(failure, true));
    } finally {
      busy.current = false;
      setSending(false);
    }
  };
  return { create, sending, error, reset: () => setError(null) };
}

/** Premiers membres (facultatifs), puis « Créer la communauté » ; « Passer » est dans la barre tant que personne n'est choisi. */
export function NewCommunityMembers({ draft, onChange, onBack, creation }: {
  draft: CommunityDraft;
  onChange: (draft: CommunityDraft) => void;
  onBack: () => void;
  creation: ReturnType<typeof useCommunityCreation>;
}) {
  return (
    <>
      <StepHeader current={1} reached={1} onSelect={onBack} />
      <div className="dm-new-body dmg-body is-members">
        <p className="dmg-intro">Invitez vos premiers membres. Vous pourrez en ajouter d'autres plus tard.</p>
        <ParticipantPicker selection={draft.members} onChange={(members) => onChange({ ...draft, members })} hint="Facultatif" showsSuggestions onlyServerAccounts />
      </div>
      <StepButton title="Créer la communauté" loading={creation.sending} error={creation.error} onClick={() => void creation.create()} />
    </>
  );
}

// MARK: - Demandes pour entrer (CommunityInviteStore.requestsByCommunity)

const requestsStore = createStore<ReadonlyMap<string, JoinRequest[]>>(new Map());

/** Demandes relues ; un échec garde celles déjà connues. */
async function refreshRequests(communityId: string): Promise<void> {
  const found = await joinRequests(communityId);
  if (!found) return;
  const next = new Map(requestsStore.get());
  next.set(communityId.toLowerCase(), found);
  requestsStore.set(next);
}

function useRequests(communityId: string): JoinRequest[] {
  return useStore(requestsStore).get(communityId.toLowerCase()) ?? [];
}

// MARK: - Page de la communauté

/** Communauté de la discussion principale, si j'en suis membre (isAccessible). */
export function accessibleCommunity(conversation: Conversation, me: string | null): CommunityInfo | null {
  const community = conversation.community;
  return community && community.members.some((member) => sameId(member.userId, me)) ? community : null;
}

export function CommunityView({ conversation, me }: { conversation: Conversation; me: string | null }) {
  const community = accessibleCommunity(conversation, me);
  const myRole = community ? roleIn(community.members, me) ?? 'member' : null;
  const [editing, setEditing] = useState(false);
  const back = () => navigate({ conversationId: conversation.id });

  return (
    <section className="dm-pane dm-details dmg-page" aria-labelledby="dmg-community-title">
      <InfoBar
        titleId="dmg-community-title"
        title="Communauté"
        onBack={back}
        action={community && canManage(myRole) ? { label: 'Modifier', onClick: () => setEditing(true) } : null}
      />
      {community && myRole ? (
        <CommunityContent conversation={conversation} community={community} myRole={myRole} me={me} editing={editing} onEditingChange={setEditing} />
      ) : (
        <div className="dm-details-scroll">
          <ContentUnavailable icon="lock" title="Communauté inaccessible" text="Cette communauté est privée : seuls ses membres peuvent l'ouvrir." className="dmg-unavailable" />
        </div>
      )}
    </section>
  );
}

function CommunityContent({ conversation, community, myRole, me, editing, onEditingChange }: {
  conversation: Conversation;
  community: CommunityInfo;
  myRole: 'owner' | 'admin' | 'member';
  me: string | null;
  editing: boolean;
  onEditingChange: (editing: boolean) => void;
}) {
  const [toast, show] = useInfoToast();
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState('');
  const [inviting, setInviting] = useState(false);
  const [showsInfo, setShowsInfo] = useState(false);
  const [confirmsLeave, setConfirmsLeave] = useState(false);
  const searchInput = useRef<HTMLInputElement>(null);
  const searchBar = useRef<HTMLDivElement>(null);
  const busy = useRef(false);
  const manages = canManage(myRole);
  const requests = useRequests(community.id);
  const photo = useSignedUrl(community.imagePath);
  const members = community.members;
  const filtering = query.trim() !== '';
  const shown = filtering ? members.filter((member) => memberMatches(member.name, query)) : members;
  const count = members.length;
  const category = categoryOf(community.category);
  const toAdd = () => navigate({ conversationId: conversation.id, view: 'ajout' });

  useEffect(() => {
    if (manages) void refreshRequests(community.id);
  }, [manages, community.id]);

  useLayoutEffect(() => {
    if (!searching) return;
    searchBar.current?.scrollIntoView({ block: 'start', behavior: scrollBehavior() });
    searchInput.current?.focus({ preventScroll: true });
  }, [searching]);

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

  const memberItems = (member: Member): MenuItem[] => {
    const { canPromote, canRemove } = communityMemberActions(myRole, member, me);
    const isAdmin = roleOf(member.role) === 'admin';
    const items: MenuItem[] = [];
    if (canPromote) {
      items.push({
        label: isAdmin ? 'Retirer le rôle d\'administrateur' : 'Nommer administrateur', icon: 'shieldCheck',
        onSelect: () => void perform(async () => { await setCommunityRole(community.id, member.userId, isAdmin ? 'member' : 'admin'); await reload(); }),
      });
    }
    if (canRemove) {
      items.push({
        label: 'Retirer de la communauté', icon: 'userMinus', destructive: true,
        onSelect: () => void perform(async () => { await removeCommunityMember(community.id, member.userId); await reload(); }),
      });
    }
    return items;
  };

  return (
    <>
      <div className="dm-details-scroll">
        <div className="dm-details-inner dmg-inner">
          <header className="dmg-hero is-community">
            <span className="dmg-hero-cover" aria-hidden="true">
              <CoverArt cover={community.cover} photo={photo} iconSize={0} letter={community.imagePath ? undefined : [...community.name][0]?.toLocaleUpperCase('fr-FR')} />
            </span>
            <h3 className="dmg-hero-name">{community.name}</h3>
            <p className="dmg-hero-sub">Communauté · {countLabel(count, 'membre')}</p>
            <p className="dmg-hero-line">
              <Icon name="lock" />
              {['Privée', category.label, community.area].filter(Boolean).join(' · ')}
            </p>
          </header>

          <div className="dmg-tiles is-three">
            <QuickTile icon="userPlus" title="Ajouter" enabled={manages} onClick={toAdd} />
            <QuickTile icon="search" title="Rechercher" onClick={() => setSearching(true)} />
            <QuickTile icon="link" title="Inviter" onClick={() => setInviting(true)} />
          </div>

          <GroupSection title="À propos">
            <p className="dmg-about">{community.details}</p>
            <Divider inset={16} />
            <button type="button" className="dmg-about-button" onClick={() => setShowsInfo(true)} aria-label="Infos de la communauté">
              <span>Créée par {creatorName(community.createdBy, members, me)} · {dayMonthLabel(community.createdAt)}</span>
              <Icon name="info" />
            </button>
          </GroupSection>

          {manages && requests.length > 0 && (
            <GroupSection title="Demandes">
              <button
                type="button"
                className="dm-action-row dmg-tall"
                aria-label={`Demandes, ${requests.length}`}
                onClick={() => navigate({ conversationId: conversation.id, view: 'demandes' })}
              >
                <Icon name="userPlus" />
                <span className="dm-action-text"><span>Demandes</span></span>
                <span className="dmg-badge">{requests.length}</span>
                <Icon name="chevronRight" className="icon dm-chevron" />
              </button>
            </GroupSection>
          )}

          <GroupSection title="Discussions">
            <button type="button" className="dm-action-row dmg-tall" onClick={() => navigate({ conversationId: conversation.id })}>
              <Icon name="messageSquareText" />
              <span className="dm-action-text">
                <span>Discussion principale</span>
                <small>{conversation.lastMessagePreview ?? 'Écrire aux membres'}</small>
              </span>
              {conversation.lastMessageAt && <span className="dmg-time">{listLabel(conversation.lastMessageAt)}</span>}
              <Icon name="chevronRight" className="icon dm-chevron" />
            </button>
          </GroupSection>

          <GroupSection title={countLabel(count, 'membre')}>
            {manages && (
              <>
                <AddMembersRow onClick={toAdd} />
                <Divider inset={64} />
              </>
            )}
            {searching && (
              <div ref={searchBar} className="dmg-search-anchor is-community">
                <MemberSearch query={query} onChange={setQuery} onClose={() => { setSearching(false); setQuery(''); }} inputRef={searchInput} />
              </div>
            )}
            {shown.length === 0 && <p className="dmg-none">Aucun membre pour « {query} »</p>}
            <ul className="dmg-members">
              {shown.map((member) => {
                const items = memberItems(member);
                return (
                  <li key={member.userId}>
                    {items.length > 0 ? (
                      <ActionMenu label={member.name} className="dmg-member-line" items={items}><MemberRow member={member} /></ActionMenu>
                    ) : <span className="dmg-member-line"><MemberRow member={member} /></span>}
                  </li>
                );
              })}
            </ul>
          </GroupSection>

          <GroupSection>
            <DestructiveRow icon="logOut" title="Quitter la communauté" onClick={() => setConfirmsLeave(true)} />
          </GroupSection>

          <p className="dmg-foot">Communauté privée · créée le {dayMonthYearLabel(community.createdAt)}</p>
          {searching && <div className="dmg-search-room" aria-hidden="true" />}
        </div>
      </div>
      <InfoToast toast={toast} />

      {manages
        ? <CommunityInviteSheet open={inviting} community={community} onClose={() => setInviting(false)} />
        : <InviteMemberNotice open={inviting} onClose={() => setInviting(false)} />}
      <CommunityInfoSheet open={showsInfo} community={community} onClose={() => setShowsInfo(false)} />
      <EditCommunitySheet open={editing} community={community} onClose={() => onEditingChange(false)} onSaved={() => show('Infos de la communauté mises à jour')} />
      <ConfirmDialog
        open={confirmsLeave}
        title="Quitter la communauté ?"
        message="La communauté reste pour les autres membres. S'il vous a été confié, le rôle de créateur passe à l'administrateur le plus ancien, sinon au membre le plus ancien."
        confirm="Quitter la communauté"
        destructive
        onConfirm={() => void perform(async () => { await leaveCommunity(community.id); await reload(); }, () => navigate({ conversationId: null }))}
        onClose={() => setConfirmsLeave(false)}
      />
    </>
  );
}

// MARK: - Modifier la communauté

function EditCommunitySheet({ open, community, onClose, onSaved }: { open: boolean; community: CommunityInfo; onClose: () => void; onSaved: () => void }) {
  return (
    <Sheet open={open} title="Modifier la communauté" onClose={onClose} closeLabel="Annuler" className="dmg-sheet">
      <EditCommunityForm community={community} onClose={onClose} onSaved={onSaved} />
    </Sheet>
  );
}

/** Le nom et la photo seulement (la description ne change pas ici), comme l'app. */
function EditCommunityForm({ community, onClose, onSaved }: { community: CommunityInfo; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(community.name);
  const photo = usePhotoChoice(community.imagePath);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const missing = name.trim() === '';

  const save = async () => {
    if (saving || missing) return;
    setSaving(true);
    setError(null);
    try {
      await updateCommunityInfo(community, name, photo.choice);
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
          <LimitedField label="Nom de la communauté" placeholder="Exemple : Investisseurs immobiliers à Lyon" value={name} onChange={setName}
            limit={COMMUNITY_NAME_LIMIT} error={missing ? 'Donnez un nom à la communauté.' : null} />
        </FormCard>
        {error && <ErrorLine text={error} />}
      </div>
      <StepButton title="Enregistrer" enabled={!missing} loading={saving} onClick={() => void save()} />
    </>
  );
}

// MARK: - Infos de la communauté

function CommunityInfoSheet({ open, community, onClose }: { open: boolean; community: CommunityInfo; onClose: () => void }) {
  return (
    <Sheet open={open} title={community.name} onClose={onClose} className="dmg-sheet">
      <div className="dm-sheet-content dmg-body">
        <FormCard>
          <p className="dmg-info-details">{community.details}</p>
          <span className="dmg-tag">{categoryOf(community.category).label}</span>
        </FormCard>
        <FormCard>
          <InfoPair title="Zone" value={community.area ?? 'Non précisée'} />
          <InfoPair title="Visibilité" value="Privée : sur invitation" />
          <InfoPair title="Créée le" value={dayMonthYearLabel(community.createdAt)} />
          <InfoPair title="Espaces" value="Une discussion principale" />
        </FormCard>
      </div>
    </Sheet>
  );
}

function InfoPair({ title, value }: { title: string; value: string }) {
  return <p className="dmg-pair"><span>{title}</span><strong>{value}</strong></p>;
}

// MARK: - Inviter (CommunityInviteSheet)

/**
 * Lien d'invitation actif (créé s'il n'y en a pas) : son QR code, le lien, sa validité, « Copier le lien »,
 * « Partager » et « Annuler ce lien ». Chaque personne qui l'utilise envoie une demande.
 */
function CommunityInviteSheet({ open, community, onClose }: { open: boolean; community: CommunityInfo; onClose: () => void }) {
  return (
    <Sheet open={open} title="Inviter" onClose={onClose} className="dmg-sheet">
      <InviteContent community={community} />
    </Sheet>
  );
}

function InviteContent({ community }: { community: CommunityInfo }) {
  const [invite, setInvite] = useState<CommunityInvite | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [confirmsRevoke, setConfirmsRevoke] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const active = (await communityInvites(community.id))[0] ?? await createCommunityInvite(community.id);
        if (!cancelled) {
          setInvite(active);
          setError(null);
        }
      } catch (failure) {
        if (!cancelled) setError(inviteMessage(failure));
      }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [community.id]);

  const create = async () => {
    setLoading(true);
    setError(null);
    try {
      setInvite(await createCommunityInvite(community.id));
    } catch (failure) {
      setError(inviteMessage(failure));
    }
    setLoading(false);
  };

  const revoke = async () => {
    if (!invite) return;
    try {
      await revokeCommunityInvite(invite.id);
      setInvite(null);
      setCopied(false);
      setError(null);
    } catch (failure) {
      setError(inviteMessage(failure));
    }
  };

  const link = invite ? inviteLink(invite.token) : '';
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      setError(INVITE_COPY_FAILED);
    }
  };
  const share = async () => {
    const text = inviteShareText(community.name, link);
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ text });
      } catch {
        // Partage annulé : rien à dire.
      }
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      showToast({ icon: 'check', text: 'Invitation copiée.' });
    } catch {
      setError(INVITE_COPY_FAILED);
    }
  };

  return (
    <div className="dm-sheet-content dmg-body">
      {invite ? (
        <div className="dmg-invite">
          <h3>{community.name}</h3>
          <span className="dmg-invite-qr"><QrCode text={link} label="QR code d'invitation" /></span>
          <p className="dmg-invite-link">{link}</p>
          <p className="dmg-invite-validity">{validityLabel(invite.expiresAt)}</p>
          <p className="dmg-invite-note">Chaque personne qui utilise ce lien envoie une demande : vous l'acceptez ou la refusez dans la page de la communauté.</p>
          <button type="button" className="btn btn-light dmg-wide" onClick={() => void copy()}>
            <Icon name={copied ? 'check' : 'copy'} />
            {copied ? 'Lien copié' : 'Copier le lien'}
          </button>
          <button type="button" className="btn btn-primary dmg-wide" onClick={() => void share()}>
            <Icon name="share" />
            Partager
          </button>
          <button type="button" className="dmg-text-danger" onClick={() => setConfirmsRevoke(true)}>Annuler ce lien</button>
        </div>
      ) : loading ? (
        <span className="dmg-loading"><span className="spinner" role="status" aria-label="Chargement" /></span>
      ) : (
        <button type="button" className="btn btn-primary dmg-wide" onClick={() => void create()}>Créer un nouveau lien</button>
      )}
      {error && <ErrorLine text={error} />}
      <ConfirmDialog
        open={confirmsRevoke}
        title="Annuler ce lien ?"
        message="Personne ne pourra plus rejoindre la communauté avec ce lien ni avec son QR code."
        confirm="Annuler ce lien"
        destructive
        cancel="Garder le lien"
        onConfirm={() => void revoke()}
        onClose={() => setConfirmsRevoke(false)}
      />
    </div>
  );
}

/** Copie refusée par le navigateur. */
const INVITE_COPY_FAILED = 'Le lien n\'a pas pu être copié.';

/** Simple membre : pas de lien à partager (CommunityInviteMemberNotice). */
function InviteMemberNotice({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <PlainSheet open={open} onClose={onClose} className="dmg-notice-sheet" labelledBy="dmg-invite-notice">
      <div className="dmg-notice">
        <Icon name="link" />
        <p id="dmg-invite-notice">Seuls le créateur et les administrateurs peuvent inviter avec un lien.</p>
        <button type="button" className="btn btn-light dmg-wide" onClick={onClose}>J'ai compris</button>
      </div>
    </PlainSheet>
  );
}

// MARK: - Demandes (CommunityJoinRequestsView)

export function JoinRequestsView({ conversation }: { conversation: Conversation }) {
  const community = conversation.community;
  const communityId = community?.id ?? '';
  const requests = useRequests(communityId);
  const [deciding, setDeciding] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (communityId) void refreshRequests(communityId);
  }, [communityId]);

  const decide = async (request: JoinRequest, accept: boolean) => {
    if (deciding) return;
    setDeciding(request.id);
    setError(null);
    try {
      await decideJoinRequest(request.id, accept);
      const next = new Map(requestsStore.get());
      next.set(communityId.toLowerCase(), (next.get(communityId.toLowerCase()) ?? []).filter((item) => item.id !== request.id));
      requestsStore.set(next);
      await refreshRequests(communityId);
      // Accepté : la personne apparaît parmi les membres.
      if (accept) await reload();
    } catch (failure) {
      setError(inviteMessage(failure));
    }
    setDeciding(null);
  };

  return (
    <section className="dm-pane dm-details dmg-page" aria-labelledby="dmg-requests-title">
      <InfoBar titleId="dmg-requests-title" title="Demandes" onBack={() => navigate({ conversationId: conversation.id, view: 'communaute' })} />
      <div className="dm-details-scroll">
        <div className="dm-details-inner dmg-inner is-tight">
          <GroupSection title={countLabel(requests.length, 'demande')}>
            <ul className="dmg-requests">
              {requests.map((request) => (
                <li key={request.id}>
                  <RequestRow request={request} deciding={deciding} onDecide={(accept) => void decide(request, accept)} />
                </li>
              ))}
            </ul>
          </GroupSection>
          {error && <ErrorLine text={error} />}
        </div>
      </div>
    </section>
  );
}

function RequestRow({ request, deciding, onDecide }: { request: JoinRequest; deciding: string | null; onDecide: (accept: boolean) => void }) {
  return (
    <div className="dmg-request">
      <CounterpartAvatar counterpart={{ name: request.name, kind: 'individual', imagePath: null }} photo={request.avatarUrl} size={40} fontSize={14} />
      <span className="dmg-request-name">{request.name}</span>
      {deciding === request.id ? <span className="spinner dmg-request-spinner" role="status" aria-label="Envoi en cours" /> : (
        <>
          <button type="button" className="dmg-refuse" disabled={deciding !== null} onClick={() => onDecide(false)}>Refuser</button>
          <button type="button" className="dmg-accept" disabled={deciding !== null} onClick={() => onDecide(true)}>Accepter</button>
        </>
      )}
    </div>
  );
}
