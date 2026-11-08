import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '../../components/Icon';
import type { IconName } from '../../components/iconPaths';
import { AlertDialog } from '../listing/Dialogs';
import {
  CONTACT_FILTERS, CONTACT_NAME_MAX, CONTACT_NOTE_MAX, contactErrors, contactFormFor, contactLine, contactsStore,
  deleteManualContact, filterContacts, loadContacts, saveContactNote, saveManualContact,
  type ActivityKind, type Contact, type ContactField, type ContactFilter, type ContactForm,
} from '../../lib/account/contacts';
import { phonePairs } from '../../lib/account/profile';
import { useStore } from '../../lib/account/session';
import { listLabel, telHref } from '../../lib/messages/format';
import { accountPath, contactPath, CONTACTS_PATH, conversationPath, NEW_CONTACT_PATH } from '../../lib/paths';
import { Avatar, EmptyState, ScreenHeader, Spinner, Toast } from './parts';

// « Mes contacts » de l'espace professionnel : la liste (recherche et filtres), la fiche d'un contact (ses échanges,
// une note privée) et le formulaire d'un contact ajouté à la main.

const SAVED_TOASTS: Record<string, string> = {
  ajoute: 'Contact ajouté',
  modifie: 'Modifications enregistrées',
  supprime: 'Contact supprimé',
};

/** Message bref après un enregistrement (`ok=` dans l'adresse), retiré de l'adresse aussitôt lu. */
function useSavedToast(): string | null {
  const [toast, setToast] = useState<string | null>(() => SAVED_TOASTS[new URLSearchParams(window.location.search).get('ok') ?? ''] ?? null);
  useEffect(() => {
    if (!toast) return undefined;
    const params = new URLSearchParams(window.location.search);
    params.delete('ok');
    window.history.replaceState(window.history.state, '', `${window.location.pathname}?${params.toString()}`);
    const timer = window.setTimeout(() => setToast(null), 2500);
    return () => window.clearTimeout(timer);
  }, [toast]);
  return toast;
}

export function Contacts({ contactKey, screen }: { contactKey: string | null; screen: string | null }) {
  const state = useStore(contactsStore);

  useEffect(() => {
    void loadContacts();
  }, []);

  if (state.status === 'error') {
    return (
      <div className="space">
        <ScreenHeader title="Mes contacts" />
        <p className="signin-error" role="alert">{state.message}</p>
        <button type="button" className="btn btn-light" onClick={() => void loadContacts()}>Réessayer</button>
      </div>
    );
  }
  if (state.status !== 'ready') return <Spinner />;
  if (screen === 'ajouter') return <ContactEditor contact={null} />;
  if (!contactKey) return <ContactList contacts={state.items} />;
  const contact = state.items.find((item) => item.key === contactKey.toLowerCase()) ?? null;
  if (!contact) {
    return (
      <div className="space">
        <ScreenHeader title="Contact" back={CONTACTS_PATH} />
        <EmptyState
          icon="users"
          title="Contact introuvable"
          text="Ce contact n'existe plus, ou il ne fait plus partie de vos contacts."
          action={<a className="btn btn-primary" href={CONTACTS_PATH}>Mes contacts</a>}
        />
      </div>
    );
  }
  if (screen === 'modifier' && contact.userId === null) return <ContactEditor contact={contact} />;
  return <ContactDetail contact={contact} />;
}

// MARK: - Liste

function ContactList({ contacts }: { contacts: Contact[] }) {
  const toast = useSavedToast();
  const [filter, setFilter] = useState<ContactFilter>('all');
  const [query, setQuery] = useState('');
  const shown = filterContacts(contacts, filter, query);
  const now = new Date();

  return (
    <div className="space contacts">
      <Toast text={toast} />
      <ScreenHeader title="Mes contacts" action={<a className="save-capsule" href={NEW_CONTACT_PATH}>Ajouter</a>} />
      {contacts.length === 0 ? (
        <EmptyState
          icon="users"
          title="Aucun contact pour le moment"
          text="Les personnes qui vous écrivent, demandent une visite ou font une offre sur vos annonces apparaîtront ici. Vous pouvez aussi ajouter un contact à la main."
          action={<a className="btn btn-primary" href={NEW_CONTACT_PATH}>Ajouter un contact</a>}
        />
      ) : (
        <>
          <div className="contacts-tools">
            <p className="contacts-intro">
              Les personnes qui ont écrit, demandé une visite ou fait une offre sur vos annonces, et les contacts que vous ajoutez.
            </p>
            <label className="contacts-search">
              <Icon name="search" />
              <input
                type="search"
                aria-label="Rechercher un contact"
                placeholder="Rechercher un nom, un bien…"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
            <div className="contacts-filters" role="group" aria-label="Filtrer les contacts">
              {CONTACT_FILTERS.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  className={`select-chip${filter === item.value ? ' is-selected' : ''}`}
                  aria-pressed={filter === item.value}
                  onClick={() => setFilter(item.value)}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
          {shown.length === 0 ? (
            <p className="contacts-none">
              {query.trim() ? 'Aucun contact ne correspond à votre recherche.' : 'Aucun contact dans ce filtre pour le moment.'}
            </p>
          ) : (
            <ul className="contacts-list space-card">
              {shown.map((contact) => (
                <li key={contact.key}>
                  <a className="contact-row" href={contactPath(contact.key)}>
                    <Avatar name={contact.name} path={contact.avatarPath} size={48} />
                    <span className="contact-row-text">
                      <span className="contact-row-top">
                        <span className="contact-row-name">{contact.name}</span>
                        {contact.isNew && <span className="contact-new">Nouveau</span>}
                        <span className="contact-row-date">{listLabel(contact.lastAt, now)}</span>
                      </span>
                      <span className="contact-row-line">{contactLine(contact)}</span>
                      {contact.listingTitles.length > 0 && <span className="contact-row-listing">{contact.listingTitles.join(' · ')}</span>}
                    </span>
                    <Icon name="chevronRight" className="icon row-chevron" />
                  </a>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

// MARK: - Fiche

const ACTIVITY_ICONS: Record<ActivityKind, IconName> = { message: 'messageCircle', visit: 'calendarDays', offer: 'handshake' };

function ContactDetail({ contact }: { contact: Contact }) {
  const savedToast = useSavedToast();
  const [toast, setToast] = useState<string | null>(null);
  const [note, setNote] = useState(contact.note);
  const [saving, setSaving] = useState(false);
  const [noteError, setNoteError] = useState<string | null>(null);
  const isManual = contact.userId === null;
  const kind = isManual ? 'Ajouté à la main' : contact.isAgency ? 'Agence sur Nidalo' : 'Membre Nidalo';
  const now = new Date();
  const changed = note.trim() !== contact.note.trim();

  async function saveNote() {
    setSaving(true);
    setNoteError(null);
    const failure = await saveContactNote(contact, note);
    if (failure) {
      setSaving(false);
      setNoteError(failure);
      return;
    }
    await loadContacts();
    setSaving(false);
    setToast('Note enregistrée');
    window.setTimeout(() => setToast(null), 2500);
  }

  return (
    <div className="space contacts contact-page">
      <Toast text={toast ?? savedToast} />
      <ScreenHeader
        title="Contact"
        back={CONTACTS_PATH}
        action={isManual ? <a className="save-capsule" href={contactPath(contact.key, true)}>Modifier</a> : undefined}
      />
      <section className="contact-head space-card">
        <Avatar name={contact.name} path={contact.avatarPath} size={76} />
        <h2 className="contact-name">{contact.name}</h2>
        <p className="contact-kind">
          {kind}
          {contact.isNew && <span className="contact-new">Nouveau</span>}
        </p>
        {contact.conversationId && (
          <a className="btn btn-primary contact-action" href={conversationPath(contact.conversationId)}>
            <Icon name="messageCircle" />Envoyer un message
          </a>
        )}
        {isManual && (contact.phone || contact.email) && (
          <div className="contact-actions">
            {contact.phone && <a className="btn btn-light" href={telHref(contact.phone)}><Icon name="phone" />Appeler</a>}
            {contact.email && <a className="btn btn-light" href={`mailto:${contact.email}`}><Icon name="mail" />E-mail</a>}
          </div>
        )}
      </section>

      {isManual && (
        <section className="contact-card space-card">
          <h2 className="contact-card-title"><Icon name="contactRound" />Coordonnées</h2>
          {contact.phone || contact.email ? (
            <dl className="contact-rows">
              {contact.phone && <div><dt>Téléphone</dt><dd><a href={telHref(contact.phone)}>{phonePairs(contact.phone)}</a></dd></div>}
              {contact.email && <div><dt>E-mail</dt><dd><a href={`mailto:${contact.email}`}>{contact.email}</a></dd></div>}
            </dl>
          ) : (
            <p className="contact-empty">Aucune coordonnée. Ajoutez-en avec « Modifier ».</p>
          )}
        </section>
      )}

      {!isManual && (
        <section className="contact-card space-card">
          <h2 className="contact-card-title"><Icon name="clock" />Échanges</h2>
          {contact.activities.length === 0 ? (
            <p className="contact-empty">Aucun échange en cours sur vos annonces.</p>
          ) : (
            <ul className="contact-activities">
              {contact.activities.map((activity) => (
                <li key={`${activity.kind}-${activity.id}`}>
                  <a className="contact-activity" href={activity.href}>
                    <span className="contact-activity-icon"><Icon name={ACTIVITY_ICONS[activity.kind]} /></span>
                    <span className="contact-activity-text">
                      <span className="contact-activity-top">
                        <span className="contact-activity-title">{activity.title}</span>
                        <span className="contact-activity-date">{listLabel(activity.at, now)}</span>
                      </span>
                      {activity.detail && <span className="contact-activity-detail">{activity.detail}</span>}
                      {activity.listingTitle && <span className="contact-activity-listing">{activity.listingTitle}</span>}
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          )}
          <p className="contact-caption">Nidalo ne montre ni le numéro ni l&apos;e-mail des membres : écrivez-leur depuis Messages.</p>
        </section>
      )}

      <section className="contact-card space-card">
        <h2 className="contact-card-title"><Icon name="squarePen" />Note privée</h2>
        <textarea
          className="text-input contact-note"
          aria-label="Note privée"
          placeholder="Projet, budget, disponibilités, à rappeler…"
          rows={4}
          maxLength={CONTACT_NOTE_MAX}
          value={note}
          onChange={(event) => setNote(event.target.value)}
        />
        <p className="contact-caption">Seul vous voyez cette note.</p>
        {noteError && <p className="signin-error" role="alert">{noteError}</p>}
        <button type="button" className="btn btn-light contact-note-save" disabled={!changed || saving} onClick={() => void saveNote()}>
          {saving ? <span className="spinner" aria-label="Enregistrement" /> : 'Enregistrer la note'}
        </button>
      </section>
    </div>
  );
}

// MARK: - Formulaire

function ContactEditor({ contact }: { contact: Contact | null }) {
  const initial = useMemo(() => contactFormFor(contact), [contact]);
  const [form, setForm] = useState<ContactForm>(initial);
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<'leave' | 'delete' | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const errors = submitted ? contactErrors(form) : {};
  const hasErrors = Object.keys(errors).length > 0;
  const dirty = JSON.stringify(form) !== JSON.stringify(initial);
  const backPath = contact ? contactPath(contact.key) : CONTACTS_PATH;

  function update(key: ContactField, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function save() {
    setSubmitted(true);
    setSaveError(null);
    if (Object.keys(contactErrors(form)).length) {
      window.setTimeout(() => formRef.current?.querySelector('[aria-invalid="true"]')?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 0);
      return;
    }
    setSaving(true);
    const result = await saveManualContact(contact?.rowId ?? null, form);
    if ('error' in result) {
      setSaving(false);
      setSaveError(result.error);
      return;
    }
    window.location.assign(accountPath('contacts', { contact: `m-${result.id.toLowerCase()}`, ok: contact ? 'modifie' : 'ajoute' }));
  }

  async function remove() {
    if (!contact?.rowId) return;
    setDialog(null);
    setSaving(true);
    setSaveError(null);
    const failure = await deleteManualContact(contact.rowId);
    if (failure) {
      setSaving(false);
      setSaveError(failure);
      return;
    }
    window.location.assign(accountPath('contacts', { ok: 'supprime' }));
  }

  return (
    <div className="space contacts contact-form-screen">
      <ScreenHeader title={contact ? 'Modifier le contact' : 'Nouveau contact'} onBack={() => (dirty ? setDialog('leave') : window.location.assign(backPath))} />
      <form ref={formRef} className="info-form" noValidate onSubmit={(event) => { event.preventDefault(); void save(); }}>
        <section className="info-card space-card">
          <TextInput label="Nom" value={form.name} error={errors.name} onChange={(value) => update('name', value)} autoComplete="name" maxLength={CONTACT_NAME_MAX} />
          <TextInput label="Téléphone (facultatif)" value={form.phone} error={errors.phone} onChange={(value) => update('phone', value)} inputMode="tel" autoComplete="tel" maxLength={24} />
          <TextInput label="E-mail (facultatif)" value={form.email} error={errors.email} onChange={(value) => update('email', value)} inputMode="email" autoComplete="email" maxLength={254} />
          <label className="form-field">
            <span className="field-label">Note (facultative)</span>
            <textarea
              className="text-input contact-note"
              rows={4}
              maxLength={CONTACT_NOTE_MAX}
              placeholder="Projet, budget, disponibilités, à rappeler…"
              value={form.note}
              aria-invalid={errors.note ? true : undefined}
              onChange={(event) => update('note', event.target.value)}
            />
            {errors.note && <span className="field-error">{errors.note}</span>}
          </label>
          <p className="field-hint">Seul vous voyez ce contact et sa note.</p>
        </section>
        {hasErrors && <p className="field-error" role="alert">Vérifiez les champs en rouge.</p>}
        {saveError && <p className="signin-error" role="alert">{saveError}</p>}
        <button type="submit" className="btn btn-primary contact-save" disabled={saving}>
          {saving ? <span className="spinner spinner-white" aria-label="Enregistrement" /> : contact ? 'Enregistrer les modifications' : 'Ajouter le contact'}
        </button>
        {contact && (
          <button type="button" className="link-button is-danger contact-delete" disabled={saving} onClick={() => setDialog('delete')}>
            Supprimer ce contact
          </button>
        )}
      </form>

      <AlertDialog
        open={dialog === 'leave'}
        onClose={() => setDialog((current) => (current === 'leave' ? null : current))}
        title="Quitter sans enregistrer ?"
        message="Vos modifications ne sont pas encore enregistrées."
        actions={[
          { label: 'Enregistrer', onClick: () => { setDialog(null); void save(); }, tone: 'primary' },
          { label: 'Quitter sans enregistrer', href: backPath },
          { label: 'Continuer', onClick: () => setDialog(null), tone: 'quiet' },
        ]}
      />
      <AlertDialog
        open={dialog === 'delete'}
        onClose={() => setDialog((current) => (current === 'delete' ? null : current))}
        title="Supprimer ce contact ?"
        message="Ses coordonnées et votre note seront effacées."
        actions={[
          { label: 'Supprimer', onClick: () => void remove(), tone: 'primary' },
          { label: 'Annuler', onClick: () => setDialog(null), tone: 'quiet' },
        ]}
      />
    </div>
  );
}

type InputOptions = { inputMode?: 'tel' | 'email' | 'text'; autoComplete?: string; maxLength?: number };

function TextInput({ label, value, error, onChange, inputMode, autoComplete, maxLength }: InputOptions & {
  label: string;
  value: string;
  error?: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="form-field">
      <span className="field-label">{label}</span>
      <input
        className="text-input"
        value={value}
        inputMode={inputMode}
        autoComplete={autoComplete}
        maxLength={maxLength}
        aria-invalid={error ? true : undefined}
        onChange={(event) => onChange(event.target.value)}
      />
      {error && <span className="field-error">{error}</span>}
    </label>
  );
}
