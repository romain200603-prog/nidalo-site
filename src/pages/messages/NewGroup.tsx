import { useRef, useState } from 'react';
import { ChoiceChip } from '../../components/FilterControls';
import { currentUserId } from '../../lib/account/session';
import {
  createGroup, GROUP_DETAILS_LIMIT, GROUP_NAME_LIMIT, GROUP_PURPOSES, groupStepIssues, hasEnoughParticipants, MIN_GROUP_PARTICIPANTS,
  submissionMessage, type GroupDraft,
} from '../../lib/messages/groups';
import { reloadConversations } from '../../lib/messages/store';
import {
  ErrorLine, FieldLabel, FormCard, LimitedEditor, LimitedField, MemberRow, ParticipantPicker, PHOTO_FAILED, PhotoField, preparedGroupPhoto,
  StepButton, useObjectUrl,
} from './groupParts';

// « Nouveau groupe » en deux étapes, comme l'app (NewGroupView.swift) : les participants (au moins deux autres
// personnes, le créateur est membre d'office), puis « Infos du groupe » (photo, nom, description, type et
// participants) et « Créer le groupe ». Le groupe créé s'ouvre.

const scrollBehavior = (): ScrollBehavior => (window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth');

/** Étape 1 : « Suivant » atténué tant qu'il manque des participants ; un appui montre ce qui manque. */
export function NewGroupParticipants({ draft, onChange, onNext }: { draft: GroupDraft; onChange: (draft: GroupDraft) => void; onNext: () => void }) {
  const [showsErrors, setShowsErrors] = useState(false);
  const error = useRef<HTMLDivElement>(null);
  const issues = groupStepIssues(draft, 0);
  const count = draft.participants.length;

  const next = () => {
    if (issues.length === 0) {
      setShowsErrors(false);
      onNext();
      return;
    }
    setShowsErrors(true);
    window.setTimeout(() => error.current?.scrollIntoView({ block: 'center', behavior: scrollBehavior() }), 120);
  };

  return (
    <>
      <div className="dm-new-body dmg-body is-picker">
        <p className="dmg-intro">Créez une conversation avec plusieurs personnes.</p>
        {showsErrors && issues[0] && (
          <div ref={error} className="dmg-step-error">
            <ErrorLine text={issues[0] === 'notEnoughParticipants' ? `Choisissez au moins ${MIN_GROUP_PARTICIPANTS} personnes.` : 'Veuillez sélectionner une option.'} />
          </div>
        )}
        <ParticipantPicker
          selection={draft.participants}
          onChange={(participants) => onChange({ ...draft, participants })}
          hint={count < MIN_GROUP_PARTICIPANTS ? `Choisissez au moins ${MIN_GROUP_PARTICIPANTS} personnes` : null}
        />
      </div>
      <StepButton title="Suivant" dimmed={!hasEnoughParticipants(count)} onClick={next} />
    </>
  );
}

/**
 * Étape 2 : photo, nom, description, type (un second appui le retire), participants (« Modifier » revient à l'étape 1),
 * puis « Créer le groupe ». Un nom manquant est montré ; des participants manquants ramènent à l'étape 1.
 */
export function NewGroupDetails({ draft, onChange, onEditParticipants, onCreated }: {
  draft: GroupDraft;
  onChange: (draft: GroupDraft) => void;
  onEditParticipants: () => void;
  onCreated: (conversationId: string) => void;
}) {
  const [showsErrors, setShowsErrors] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const busy = useRef(false);
  const nameField = useRef<HTMLDivElement>(null);
  const photoUrl = useObjectUrl(draft.photo);
  const set = (patch: Partial<GroupDraft>) => onChange({ ...draft, ...patch });
  const me = currentUserId();

  const pickPhoto = async (file: File) => {
    const blob = await preparedGroupPhoto(file);
    if (!blob) {
      setPhotoError(PHOTO_FAILED);
      return;
    }
    set({ photo: blob });
    setPhotoError(null);
  };

  const create = async () => {
    if (groupStepIssues(draft, 0).length > 0) {
      onEditParticipants();
      return;
    }
    if (groupStepIssues(draft, 1).length > 0) {
      setShowsErrors(true);
      window.setTimeout(() => nameField.current?.scrollIntoView({ block: 'center', behavior: scrollBehavior() }), 120);
      return;
    }
    if (busy.current) return;
    busy.current = true;
    setSending(true);
    setError(null);
    try {
      await createGroup(draft);
      await reloadConversations().catch(() => undefined);
      onCreated(draft.id);
    } catch (failure) {
      setError(submissionMessage(failure, true));
    } finally {
      busy.current = false;
      setSending(false);
    }
  };

  return (
    <>
      <div className="dm-new-body dmg-body is-form">
        <PhotoField url={photoUrl} hasPhoto={!!draft.photo} onPick={(file) => void pickPhoto(file)} onRemove={() => set({ photo: null })} error={photoError} />

        <FormCard>
          <div ref={nameField}>
            <LimitedField
              label="Nom du groupe"
              placeholder="Exemple : Projet immobilier Lyon"
              value={draft.name}
              onChange={(name) => set({ name })}
              limit={GROUP_NAME_LIMIT}
              error={showsErrors && !draft.name.trim() ? 'Donnez un nom au groupe.' : null}
            />
          </div>
          <LimitedEditor
            label="Description (facultative)"
            placeholder="Exemple : Échanges autour de notre projet d'achat à Lyon."
            value={draft.details}
            onChange={(details) => set({ details })}
            limit={GROUP_DETAILS_LIMIT}
          />
        </FormCard>

        <FormCard>
          <FieldLabel>Type de groupe (facultatif)</FieldLabel>
          <div className="dmg-purposes">
            {GROUP_PURPOSES.map((purpose) => (
              <ChoiceChip
                key={purpose.value}
                title={purpose.label}
                selected={draft.purpose === purpose.value}
                expands
                onClick={() => set({ purpose: draft.purpose === purpose.value ? null : purpose.value })}
              />
            ))}
          </div>
          <p className="dmg-note">Purement descriptif : le type ne change pas les droits des membres.</p>
        </FormCard>

        <FormCard>
          <div className="dmg-card-head">
            <FieldLabel>Participants · {draft.participants.length + 1} avec vous</FieldLabel>
            <button type="button" className="dmg-link" onClick={onEditParticipants}>Modifier</button>
          </div>
          <MemberRow member={{ userId: me ?? '', name: 'Vous', kind: 'individual', role: 'owner' }} />
          {draft.participants.map((member) => <MemberRow key={member.userId} member={member} />)}
        </FormCard>
      </div>
      <StepButton title="Créer le groupe" loading={sending} error={error} onClick={() => void create()} />
    </>
  );
}
