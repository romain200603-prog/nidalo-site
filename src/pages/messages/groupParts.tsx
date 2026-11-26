import { useCallback, useEffect, useId, useRef, useState, type ReactNode, type RefObject } from 'react';
import { Icon } from '../../components/Icon';
import type { IconName } from '../../components/iconPaths';
import { currentUserId, useStore } from '../../lib/account/session';
import { AVATAR_SIDE, cleanPhoto } from '../../lib/cleanPhoto';
import { contactMember, contactUserId, countLabel, ROLE_LABELS, roleOf, suggestedContacts, type PhotoChoice } from '../../lib/messages/groups';
import { alphabetical, contactMatches, contactsFrom, sameId, type Contact, type Member } from '../../lib/messages/inbox';
import { blockedStore, inboxStore, loadProfessionals, professionalsStore } from '../../lib/messages/store';
import { CounterpartAvatar, useSignedUrl } from './parts';

// Morceaux des écrans de groupe et de communauté, comme l'app (NewGroupView.swift, GroupInfoView.swift) : choix des
// participants (ParticipantPicker), bouton d'étape (StepButton), cartes et champs de formulaire (FormCard, LimitedField,
// LimitedEditor, PhotoField, ErrorLine ; InfoLine et ChoiceChip sont ceux du site, components/FilterControls.tsx),
// ligne de membre (MemberRow), barre des écrans poussés (InfoBar), rubriques des infos (GroupSection, DestructiveRow)
// et bandeau bleu de 2 secondes en bas de l'écran (toast des infos du groupe).

// MARK: - Bandeau

/** Bandeau des infos (show) : une capsule bleue de 40, 2 secondes, qui monte du bas puis s'efface. */
export function useInfoToast(): [{ text: string; leaving: boolean } | null, (text: string) => void] {
  const [toast, setToast] = useState<{ text: string; leaving: boolean } | null>(null);
  const timers = useRef<number[]>([]);
  useEffect(() => () => timers.current.forEach((timer) => window.clearTimeout(timer)), []);
  const show = useCallback((text: string) => {
    timers.current.forEach((timer) => window.clearTimeout(timer));
    setToast({ text, leaving: false });
    timers.current = [
      window.setTimeout(() => setToast((current) => (current?.text === text ? { text, leaving: true } : current)), 2000),
      window.setTimeout(() => setToast((current) => (current?.text === text ? null : current)), 2250),
    ];
  }, []);
  return [toast, show];
}

export function InfoToast({ toast }: { toast: { text: string; leaving: boolean } | null }) {
  return (
    <div className="dmg-toast-host" role="status" aria-live="polite">
      {toast && <p key={toast.text} className={`dmg-toast${toast.leaving ? ' is-leaving' : ''}`}>{toast.text}</p>}
    </div>
  );
}

/**
 * Barre d'un écran poussé (barre de navigation de l'app) : retour, titre centré, puis le bouton de droite
 * (« Modifier ») ou une place vide.
 */
export function InfoBar({ titleId, title, onBack, action = null }: {
  titleId: string;
  title: string;
  onBack: () => void;
  action?: { label: string; onClick: () => void } | null;
}) {
  return (
    <header className="dm-details-bar dmg-bar">
      <button type="button" className="dm-round is-plain" onClick={onBack} aria-label="Retour" title="Retour">
        <Icon name="chevronLeft" />
      </button>
      <h2 id={titleId} tabIndex={-1}>{title}</h2>
      {action ? <button type="button" className="dmg-bar-action" onClick={action.onClick}>{action.label}</button>
        : <span className="dm-round is-plain is-spacer" aria-hidden="true" />}
    </header>
  );
}

// MARK: - Formulaires

export function FormCard({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`dmg-card ${className}`}>{children}</div>;
}

export function FieldLabel({ children }: { children: ReactNode }) {
  return <span className="dmg-label">{children}</span>;
}

/** Refus ou champ manquant : 12 en rouge (ErrorLine). */
export function ErrorLine({ text, id }: { text: string; id?: string }) {
  return <p className="dmg-error" id={id} role="alert">{text}</p>;
}

const clip = (value: string, limit: number) => [...value].slice(0, limit).join('');

/** Champ d'une ligne : titre, compteur « 12/50 », contour bleu au focus, rouge en erreur, puis l'erreur. */
export function LimitedField({ label, placeholder, value, onChange, limit, error, inputRef, onEnter }: {
  label: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  limit: number;
  error?: string | null;
  inputRef?: RefObject<HTMLInputElement | null>;
  /** Touche Entrée : champ suivant. */
  onEnter?: () => void;
}) {
  const id = useId();
  const count = [...value].length;
  return (
    <div className="dmg-field">
      <div className="dmg-field-head">
        <label className="dmg-label" htmlFor={id}>{label}</label>
        <span className={`dmg-count${count > limit ? ' is-over' : ''}`} aria-hidden="true">{count}/{limit}</span>
      </div>
      <input
        id={id}
        ref={inputRef}
        className={`dmg-input${error ? ' is-error' : ''}`}
        value={value}
        placeholder={placeholder}
        autoComplete="off"
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-erreur` : undefined}
        onChange={(event) => onChange(clip(event.currentTarget.value, limit))}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && onEnter) {
            event.preventDefault();
            onEnter();
          }
        }}
      />
      {error && <ErrorLine id={`${id}-erreur`} text={error} />}
    </div>
  );
}

/** Texte de plusieurs lignes avec compteur (LimitedEditor). */
export function LimitedEditor({ label, placeholder, value, onChange, limit, error, inputRef }: {
  label: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  limit: number;
  error?: string | null;
  inputRef?: RefObject<HTMLTextAreaElement | null>;
}) {
  const id = useId();
  return (
    <div className="dmg-field">
      <div className="dmg-field-head">
        <label className="dmg-label" htmlFor={id}>{label}</label>
        <span className="dmg-count" aria-hidden="true">{[...value].length}/{limit}</span>
      </div>
      <textarea
        id={id}
        ref={inputRef}
        className={`dmg-input dmg-editor${error ? ' is-error' : ''}`}
        value={value}
        placeholder={placeholder}
        rows={3}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-erreur` : undefined}
        onChange={(event) => onChange(clip(event.currentTarget.value, limit))}
      />
      {error && <ErrorLine id={`${id}-erreur`} text={error} />}
    </div>
  );
}

/** Adresse locale d'une photo choisie (aperçu), libérée quand elle change. */
export function useObjectUrl(blob: Blob | null): string | null {
  const [url, setUrl] = useState<{ blob: Blob; url: string } | null>(null);
  useEffect(() => {
    if (!blob) return undefined;
    const next = URL.createObjectURL(blob);
    setUrl({ blob, url: next });
    return () => URL.revokeObjectURL(next);
  }, [blob]);
  return blob && url?.blob === blob ? url.url : null;
}

/** Photo choisie, préparée comme les photos de profil (JPEG de 512 px au plus, sans métadonnées) ; `null` si illisible. */
export async function preparedGroupPhoto(file: Blob): Promise<Blob | null> {
  return (await cleanPhoto(file, AVATAR_SIDE))?.blob ?? null;
}

export const PHOTO_FAILED = 'La photo n\'a pas pu être ajoutée.';

/** Photo d'une feuille « Modifier » : celle enregistrée, une nouvelle, ou aucune ; son aperçu et son erreur. */
export function usePhotoChoice(savedPath: string | null) {
  const [choice, setChoice] = useState<PhotoChoice>(savedPath ? { kind: 'saved', path: savedPath } : null);
  const [error, setError] = useState<string | null>(null);
  const saved = useSignedUrl(choice?.kind === 'saved' ? choice.path : null);
  const fresh = useObjectUrl(choice?.kind === 'new' ? choice.blob : null);
  const pick = async (file: File) => {
    const blob = await preparedGroupPhoto(file);
    if (!blob) {
      setError(PHOTO_FAILED);
      return;
    }
    setChoice({ kind: 'new', blob });
    setError(null);
  };
  return { choice, url: choice?.kind === 'new' ? fresh : saved, error, pick, remove: () => setChoice(null) };
}

/**
 * Photo facultative (PhotoField, forme ronde) : rond de 96 bleu pâle avec l'icône, ou la photo ; pastille appareil
 * photo bleue cerclée de blanc ; dessous « Retirer la photo » ou « Photo facultative ».
 */
export function PhotoField({ url, hasPhoto, onPick, onRemove, error, icon = 'users' }: {
  url: string | null;
  hasPhoto: boolean;
  onPick: (file: File) => void;
  onRemove: () => void;
  error: string | null;
  icon?: IconName;
}) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <div className="dmg-photo">
      <button type="button" className="dmg-photo-pick" onClick={() => input.current?.click()} aria-label={hasPhoto ? 'Changer la photo' : 'Ajouter une photo'}>
        <span className="dmg-photo-preview">{url ? <img src={url} alt="" /> : <Icon name={icon} />}</span>
        <span className="dmg-photo-badge" aria-hidden="true"><Icon name="camera" /></span>
      </button>
      <PhotoInput inputRef={input} onPick={onPick} />
      {hasPhoto
        ? <button type="button" className="dmg-photo-remove" onClick={onRemove}>Retirer la photo</button>
        : <span className="dmg-photo-note">Photo facultative</span>}
      {error && <ErrorLine text={error} />}
    </div>
  );
}

/** Sélecteur de fichier caché (photothèque de l'app). */
export function PhotoInput({ inputRef, onPick }: { inputRef: RefObject<HTMLInputElement | null>; onPick: (file: File) => void }) {
  return (
    <input
      ref={inputRef}
      type="file"
      accept="image/*"
      className="dm-visually-hidden"
      tabIndex={-1}
      aria-hidden="true"
      onChange={(event) => {
        const file = event.currentTarget.files?.[0];
        event.currentTarget.value = '';
        if (file) onPick(file);
      }}
    />
  );
}

/**
 * Bouton principal fixe en bas d'une étape (StepButton) : atténué tant qu'il manque quelque chose (un appui montre
 * quoi), la roue pendant l'envoi ; l'erreur du serveur juste au-dessus.
 */
export function StepButton({ title, enabled = true, dimmed = false, loading = false, error, onClick }: {
  title: string;
  enabled?: boolean;
  dimmed?: boolean;
  loading?: boolean;
  error?: string | null;
  onClick: () => void;
}) {
  return (
    <div className="dmg-step">
      {error && <ErrorLine text={error} />}
      <button
        type="button"
        className={`btn btn-primary dmg-step-button${!enabled || dimmed ? ' is-dim' : ''}`}
        disabled={!enabled || loading}
        aria-busy={loading || undefined}
        onClick={onClick}
      >
        {loading ? <span className="spinner spinner-white" role="status" aria-label="Envoi en cours" /> : title}
      </button>
    </div>
  );
}

// MARK: - Membres

/** Ligne de membre (MemberRow) : avatar à initiales de 36, nom, rôle en pastille sauf « Membre ». */
export function MemberRow({ member }: { member: Member }) {
  const role = roleOf(member.role);
  return (
    <span className="dmg-member">
      <CounterpartAvatar counterpart={{ name: member.name, kind: member.kind, imagePath: null }} size={36} fontSize={12} />
      <span className="dmg-member-name">{member.name}</span>
      {role !== 'member' && <span className="dmg-role">{ROLE_LABELS[role]}</span>}
    </span>
  );
}

/** Rubrique (GroupSection) : titre de 18 en gras, puis une carte blanche bordée. */
export function GroupSection({ title, children, className = '' }: { title?: string; children: ReactNode; className?: string }) {
  const id = useId();
  return (
    <section className={`dmg-section ${className}`} aria-labelledby={title ? id : undefined}>
      {title && <h3 className="dmg-section-title" id={id}>{title}</h3>}
      <div className="dmg-section-card">{children}</div>
    </section>
  );
}

/** Trait fin entre deux lignes, décalé sous le texte (RowDivider). */
export function Divider({ inset }: { inset: 16 | 62 | 64 | 70 }) {
  return <span className={`dmg-divider is-${inset}`} aria-hidden="true" />;
}

/** Ligne rouge sobre (signaler, quitter, supprimer). */
export function DestructiveRow({ icon, title, onClick }: { icon: IconName; title: string; onClick: () => void }) {
  return (
    <button type="button" className="dmg-destructive" onClick={onClick}>
      <Icon name={icon} />
      <span>{title}</span>
    </button>
  );
}

/** « Ajouter des membres » en tête de la liste des membres : rond bleu pâle, texte bleu. */
export function AddMembersRow({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" className="dmg-add-row" onClick={onClick}>
      <span className="dmg-add-icon"><Icon name="userPlus" /></span>
      <span>Ajouter des membres</span>
    </button>
  );
}

/** Tuile d'action des infos (Ajouter, Rechercher, Inviter) : icône bleue de 22, titre ; grisée sans le droit. */
export function QuickTile({ icon, title, enabled = true, onClick }: { icon: IconName; title: string; enabled?: boolean; onClick: () => void }) {
  return (
    <button type="button" className="dmg-tile" disabled={!enabled} onClick={onClick}>
      <Icon name={icon} />
      <span>{title}</span>
    </button>
  );
}

/** Barre de recherche des membres : ✕ « Fermer la recherche », loupe, « Rechercher un membre… ». */
export function MemberSearch({ query, onChange, onClose, inputRef }: {
  query: string;
  onChange: (value: string) => void;
  onClose: () => void;
  inputRef: RefObject<HTMLInputElement | null>;
}) {
  return (
    <div className="dmg-member-search">
      <button type="button" className="dmg-search-close" onClick={onClose} aria-label="Fermer la recherche" title="Fermer la recherche">
        <Icon name="x" />
      </button>
      <Icon name="search" />
      <input
        ref={inputRef}
        type="search"
        value={query}
        placeholder="Rechercher un membre…"
        aria-label="Rechercher un membre…"
        autoComplete="off"
        onChange={(event) => onChange(event.currentTarget.value)}
      />
    </div>
  );
}

// MARK: - Choix des participants (ParticipantPicker)

/** Contacts de la messagerie, ceux de la page Messages (conversations et agences qui publient). */
export function useContacts(): Contact[] {
  const inbox = useStore(inboxStore);
  const professionals = useStore(professionalsStore);
  useEffect(() => { loadProfessionals(); }, []);
  return contactsFrom(inbox.status === 'ready' ? inbox.conversations : [], professionals.value);
}

/**
 * Participants parmi les contacts (mêmes contacts et même recherche que « Nouvelle discussion ») : pastilles des
 * personnes choisies, compteur, aucun numéro affiché. Seuls les contacts qui ont un compte Nidalo sont proposés ;
 * `onlyServerAccounts` (communauté) écarte aussi les comptes bloqués.
 */
export function ParticipantPicker({ selection, onChange, hint, excluded = [], placeholder = 'Rechercher un contact…', showsSuggestions = false, onlyServerAccounts = false }: {
  selection: Member[];
  onChange: (selection: Member[]) => void;
  hint?: string | null;
  excluded?: string[];
  placeholder?: string;
  showsSuggestions?: boolean;
  onlyServerAccounts?: boolean;
}) {
  const [query, setQuery] = useState('');
  const all = useContacts();
  const inbox = useStore(inboxStore);
  const blocked = useStore(blockedStore);
  const text = query.trim();
  const skip = new Set(excluded.map((id) => id.toLowerCase()));
  const contacts = alphabetical(all).filter((contact) => {
    const userId = contactUserId(contact)?.toLowerCase();
    return !!userId && !skip.has(userId) && (!onlyServerAccounts || !blocked.has(userId));
  });
  const shown = text ? contacts.filter((contact) => contactMatches(contact, text)) : contacts;
  const me = currentUserId();
  const groupMembers = new Set((inbox.status === 'ready' ? inbox.conversations : []).filter((item) => item.isGroup)
    .flatMap((item) => item.members.map((member) => member.userId.toLowerCase())).filter((id) => !sameId(id, me)));
  const suggested = showsSuggestions && !text ? suggestedContacts(contacts, groupMembers) : [];
  const toggle = (member: Member) => onChange(selection.some((item) => sameId(item.userId, member.userId))
    ? selection.filter((item) => !sameId(item.userId, member.userId))
    : [...selection, member]);
  const count = selection.length;

  const card = (list: Contact[]) => (
    <ul className="dmg-picker-list">
      {list.map((contact) => {
        const member = contactMember(contact);
        if (!member) return null;
        const selected = selection.some((item) => sameId(item.userId, member.userId));
        return (
          <li key={contact.id}>
            <button type="button" className="dmg-picker-row" aria-pressed={selected} onClick={() => toggle(member)}>
              <CounterpartAvatar counterpart={contact.counterpart} size={44} fontSize={14} />
              <span className="dmg-picker-text">
                <span className="dmg-picker-name">{contact.counterpart.name}</span>
                <span className="dmg-picker-detail">{contact.counterpart.subtitle}</span>
              </span>
              <span className={`dmg-check${selected ? ' is-on' : ''}`} aria-hidden="true">{selected && <Icon name="check" />}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );

  return (
    <div className="dmg-picker">
      <label className="dm-search dmg-picker-search">
        <Icon name="search" />
        <input type="search" value={query} placeholder={placeholder} aria-label={placeholder} autoComplete="off"
          onChange={(event) => setQuery(event.currentTarget.value)} />
        {query && (
          <button type="button" className="dm-search-clear" onClick={() => setQuery('')} aria-label="Effacer la saisie" title="Effacer la saisie">
            <Icon name="x" />
          </button>
        )}
      </label>
      {count > 0 && (
        <div className="dmg-chips">
          {selection.map((member) => (
            <button key={member.userId} type="button" className="dmg-chip" onClick={() => toggle(member)} aria-label={`Retirer ${member.name}`}>
              <CounterpartAvatar counterpart={{ name: member.name, kind: member.kind, imagePath: null }} size={24} fontSize={9} />
              <span>{member.name}</span>
              <Icon name="x" />
            </button>
          ))}
        </div>
      )}
      <div className="dmg-picker-count">
        <strong aria-live="polite">{count === 0 ? 'Aucune personne choisie' : `${countLabel(count, 'personne')} choisie${count > 1 ? 's' : ''}`}</strong>
        {hint && <span>{hint}</span>}
      </div>
      {shown.length === 0 ? (
        <p className="dmg-picker-empty">
          {contacts.length === 0 ? 'Aucun contact pour l\'instant. Vos contacts apparaissent dès votre premier échange.' : `Aucun contact pour « ${text} »`}
        </p>
      ) : suggested.length > 0 ? (
        <>
          <h4 className="dmg-picker-title">Suggestions</h4>
          {card(suggested)}
          <h4 className="dmg-picker-title is-second">Tous les contacts</h4>
          {card(shown)}
        </>
      ) : card(shown)}
    </div>
  );
}
