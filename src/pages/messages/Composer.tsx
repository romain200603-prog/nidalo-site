import { useEffect, useId, useLayoutEffect, useRef, useState, type ChangeEvent, type ReactNode } from 'react';
import { Icon } from '../../components/Icon';
import type { IconName } from '../../components/iconPaths';
import { accountStore, formFor, loadAccount, publicName, saveProfile } from '../../lib/account/profile';
import { useStore } from '../../lib/account/session';
import type { Message } from '../../lib/messages/api';
import {
  CATEGORY_ICONS, CATEGORY_LABELS, DOCUMENT_CATEGORIES, documentIcon, documentLine, MAX_FILES_PER_MESSAGE, type Attachment, type DocumentCategory,
} from '../../lib/messages/content';
import {
  DOCUMENT_ACCEPT, MEDIA_ACCEPT, pendingDocument, pendingMedia, releasePending, UNREADABLE, UPLOAD_FAILURE, uploadPending, type PendingFile,
} from '../../lib/messages/files';
import { durationLabel, sizeLabel } from '../../lib/messages/format';
import type { Conversation } from '../../lib/messages/inbox';
import { sendAttachments, sendText } from '../../lib/messages/store';
import { needsFirstName } from '../../lib/messages/thread';
import { Dialog, Sheet, showIphoneOnly, showNotice } from './parts';

// Barre d'écriture de la conversation (ConversationView.composer) : « + » (pièces jointes), « Votre message... »,
// émoji, envoi. Le premier message d'une conversation à deux demande d'abord le prénom (« Votre prénom »), comme
// l'app. Le « + » ouvre « Joindre » (AttachmentMenuSheet) : les photos, vidéos et documents viennent de
// l'ordinateur ; l'aperçu (AttachmentPreviewSheet) envoie chaque fichier puis le message.

const SEND_FAILED = 'Le message n\'a pas pu être envoyé. Réessayez.';

/** Sources du « + », dans l'ordre de l'app (AttachmentSource) ; `null` : seulement dans l'app iPhone. */
const SOURCES: { key: string; title: string; subtitle: string; icon: IconName; web: 'media' | 'documents' | null }[] = [
  { key: 'camera', title: 'Appareil photo', subtitle: 'Prendre une photo', icon: 'camera', web: null },
  { key: 'library', title: 'Photos et vidéos', subtitle: 'Plusieurs photos ou vidéos', icon: 'image', web: 'media' },
  { key: 'documents', title: 'Documents', subtitle: 'PDF, Word, Excel…', icon: 'fileText', web: 'documents' },
  { key: 'video', title: 'Caméra vidéo', subtitle: 'Enregistrer une vidéo', icon: 'video', web: null },
  { key: 'location', title: 'Localisation', subtitle: 'Une adresse ou votre position', icon: 'pin', web: null },
  { key: 'contact', title: 'Contacts', subtitle: 'Les coordonnées d\'un contact', icon: 'contactRound', web: null },
  { key: 'dossier', title: 'Mon dossier', subtitle: 'Pièces de votre dossier immobilier, avec filigrane', icon: 'folderCheck', web: null },
];

export function Composer({ conversation, messages, onMakeOffer }: {
  conversation: Conversation;
  /** Tous les messages lus de la conversation (le prénom n'est demandé que s'il n'y en a aucun) ; `null` pendant la lecture. */
  messages: Message[] | null;
  /** « Faire une offre » dans le « + » : acheteur d'une annonce en vente, sans offre en cours. */
  onMakeOffer: (() => void) | null;
}) {
  const account = useStore(accountStore);
  const [draft, setDraft] = useState('');
  const [askName, setAskName] = useState(false);
  const [menu, setMenu] = useState<'closed' | 'sources' | 'categories'>('closed');
  const [pending, setPending] = useState<PendingFile[]>([]);
  const field = useRef<HTMLTextAreaElement>(null);
  const mediaInput = useRef<HTMLInputElement>(null);
  const documentInput = useRef<HTMLInputElement>(null);
  const category = useRef<DocumentCategory | null>(null);
  const pendingRef = useRef<PendingFile[]>([]);
  pendingRef.current = pending;

  useEffect(() => { void loadAccount(); }, []);
  // Page quittée ou autre conversation : les aperçus locaux sont libérés.
  useEffect(() => () => releasePending(pendingRef.current), []);

  // Champ de 1 à 4 lignes, comme le TextField vertical de l'app.
  useLayoutEffect(() => {
    const el = field.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 4 * 24 + 24)}px`;
  }, [draft]);

  const firstName = account.status === 'ready' ? account.account.details?.first_name ?? '' : '';
  const canSend = draft.trim() !== '';

  const send = async () => {
    // Messages pas encore lus : on ne sait pas encore s'il faut demander le prénom.
    if (!canSend || messages === null) return;
    // Premier message d'une vraie conversation : un prénom est montré à l'interlocuteur.
    if (needsFirstName({ conversation, messages, firstName })) {
      setAskName(true);
      return;
    }
    const text = draft;
    setDraft('');
    if (!await sendText(conversation.id, text)) {
      setDraft(text);
      showNotice(SEND_FAILED);
    }
  };

  const onNamed = async (first: string) => {
    if (account.status !== 'ready') return;
    const current = account.account;
    const error = await saveProfile(
      current,
      { ...formFor(current), firstName: [...first].slice(0, 50).join(''), lastName: current.details?.last_name ?? '' },
      undefined,
      { displayName: current.profile.display_name },
    );
    if (error) {
      showNotice(error);
      return;
    }
    const text = draft;
    setDraft('');
    if (!await sendText(conversation.id, text)) {
      setDraft(text);
      showNotice(SEND_FAILED);
    }
  };

  /** Ajoute un élément à l'aperçu ; 10 au plus par message (AttachmentFlow.add). */
  const add = (items: PendingFile[]) => {
    const room = MAX_FILES_PER_MESSAGE - pendingRef.current.length;
    const kept = items.slice(0, Math.max(room, 0));
    releasePending(items.slice(kept.length));
    if (kept.length < items.length) showNotice(`${MAX_FILES_PER_MESSAGE} éléments au maximum par message.`);
    if (kept.length) setPending((current) => [...current, ...kept]);
  };

  const onMedia = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = [...(event.currentTarget.files ?? [])].slice(0, MAX_FILES_PER_MESSAGE);
    event.currentTarget.value = '';
    if (!files.length) return;
    add(await Promise.all(files.map(pendingMedia)));
  };

  const onDocuments = (event: ChangeEvent<HTMLInputElement>) => {
    const files = [...(event.currentTarget.files ?? [])].slice(0, MAX_FILES_PER_MESSAGE);
    event.currentTarget.value = '';
    const chosen = category.current;
    category.current = null;
    if (files.length) add(files.map((file) => pendingDocument(file, chosen)));
  };

  const choose = (source: (typeof SOURCES)[number]) => {
    setMenu('closed');
    if (source.web === 'media') mediaInput.current?.click();
    else if (source.web === 'documents') {
      category.current = null;
      documentInput.current?.click();
    } else showIphoneOnly(source.title);
  };

  return (
    <div className="dm-composer">
      <button type="button" className="dm-plus" onClick={() => setMenu('sources')} aria-label="Ajouter une pièce jointe" title="Ajouter une pièce jointe">
        <Icon name="plus" />
      </button>
      <div className="dm-field">
        <textarea
          ref={field}
          rows={1}
          value={draft}
          placeholder="Votre message..."
          aria-label="Votre message"
          onChange={(event) => setDraft(event.currentTarget.value)}
          onKeyDown={(event) => {
            // Entrée envoie, Maj + Entrée va à la ligne.
            if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              void send();
            }
          }}
        />
        <button
          type="button"
          className="dm-emoji"
          onClick={() => {
            setDraft((value) => `${value}🙂`);
            field.current?.focus();
          }}
          aria-label="Ajouter un émoji"
          title="Ajouter un émoji"
        >
          <Icon name="smile" />
        </button>
      </div>
      <button type="button" className="dm-send" onClick={() => void send()} disabled={!canSend} aria-label="Envoyer" title="Envoyer">
        <Icon name="arrowUp" />
      </button>

      <input ref={mediaInput} type="file" accept={MEDIA_ACCEPT} multiple hidden onChange={(event) => void onMedia(event)} data-testid="dm-media-input" />
      <input ref={documentInput} type="file" accept={DOCUMENT_ACCEPT} multiple hidden onChange={onDocuments} data-testid="dm-document-input" />

      <Sheet open={menu === 'sources'} title="Joindre" onClose={() => setMenu('closed')} className="dm-attach-sheet">
        <div className="dm-sheet-content">
          <ul className="dm-sources">
            {SOURCES.map((source) => (
              <li key={source.key}>
                <button type="button" onClick={() => choose(source)} title={source.subtitle} aria-label={source.key === 'dossier' ? 'Depuis mon dossier' : source.title} aria-describedby={`dm-source-${source.key}`}>
                  <span className="dm-source-icon"><Icon name={source.icon} /></span>
                  <span className="dm-source-title">{source.title}</span>
                  <span id={`dm-source-${source.key}`} className="dm-visually-hidden">{source.subtitle}</span>
                </button>
              </li>
            ))}
          </ul>
          <WideRow icon="house" title="Documents immobiliers" subtitle="Diagnostics, plans, mandats, quittances…" onClick={() => setMenu('categories')} />
          {onMakeOffer && (
            <WideRow
              icon="handshake"
              title="Faire une offre"
              subtitle="Proposer un prix d'achat au vendeur"
              tone="green"
              onClick={() => {
                setMenu('closed');
                onMakeOffer();
              }}
            />
          )}
        </div>
      </Sheet>

      <Sheet open={menu === 'categories'} title="Documents immobiliers" onClose={() => setMenu('closed')} onBack={() => setMenu('sources')} className="dm-categories-sheet">
        <div className="dm-sheet-content">
          <p className="dm-sheet-note">Choisissez le type de document pour l'indiquer au destinataire, ou envoyez n'importe quel document autorisé.</p>
          <ul className="dm-card dm-rows">
            {DOCUMENT_CATEGORIES.map((item) => (
              <li key={item}>
                <button
                  type="button"
                  className="dm-action-row"
                  onClick={() => {
                    setMenu('closed');
                    category.current = item;
                    documentInput.current?.click();
                  }}
                >
                  <span className="dm-row-icon"><Icon name={CATEGORY_ICONS[item]} /></span>
                  <span className="dm-action-text"><span>{CATEGORY_LABELS[item]}</span></span>
                  <Icon name="chevronRight" className="icon dm-chevron" />
                </button>
              </li>
            ))}
          </ul>
          <button
            type="button"
            className="dm-link-button dm-centered"
            onClick={() => {
              setMenu('closed');
              category.current = null;
              documentInput.current?.click();
            }}
          >
            Envoyer un document sans catégorie
          </button>
        </div>
      </Sheet>

      <PreviewSheet
        items={pending}
        conversationId={conversation.id}
        onRemove={(id) => setPending((current) => {
          releasePending(current.filter((item) => item.id === id));
          return current.filter((item) => item.id !== id);
        })}
        onDone={() => setPending((current) => {
          releasePending(current);
          return [];
        })}
      />

      <FirstNameDialog
        open={askName}
        lastName={account.status === 'ready' ? account.account.details?.last_name ?? '' : ''}
        onClose={() => setAskName(false)}
        onSend={(first) => {
          setAskName(false);
          void onNamed(first);
        }}
      />
    </div>
  );
}

function WideRow({ icon, title, subtitle, tone = 'blue', onClick }: { icon: IconName; title: string; subtitle: string; tone?: 'blue' | 'green'; onClick: () => void }) {
  return (
    <button type="button" className={`dm-wide-row is-${tone}`} onClick={onClick}>
      <span className="dm-wide-icon"><Icon name={icon} /></span>
      <span className="dm-wide-text">
        <span className="dm-wide-title">{title}</span>
        <span className="dm-wide-sub">{subtitle}</span>
      </span>
      <Icon name="chevronRight" className="icon dm-chevron" />
    </button>
  );
}

/** « Votre prénom » (domiaAlert) : champ « Prénom », « Affiché à votre interlocuteur : Claire M. », Envoyer, Annuler. */
function FirstNameDialog({ open, lastName, onClose, onSend }: { open: boolean; lastName: string; onClose: () => void; onSend: (first: string) => void }) {
  const id = useId();
  return (
    <Dialog open={open} onClose={onClose} className="alert-dialog dm-dialog" labelledBy={`${id}-titre`} describedBy={`${id}-texte`}>
      <FirstNameForm id={id} lastName={lastName} onClose={onClose} onSend={onSend} />
    </Dialog>
  );
}

function FirstNameForm({ id, lastName, onClose, onSend }: { id: string; lastName: string; onClose: () => void; onSend: (first: string) => void }) {
  const [value, setValue] = useState('');
  return (
    <form
      className="alert-body"
      onSubmit={(event) => {
        event.preventDefault();
        const first = value.trim();
        // Comme l'alerte de l'app : « Envoyer » la referme ; sans prénom, rien n'est envoyé.
        if (!first) {
          onClose();
          return;
        }
        onSend(first);
      }}
    >
      <h2 id={`${id}-titre`}>Votre prénom</h2>
      <p id={`${id}-texte`}>Affiché à votre interlocuteur : {publicName(value === '' ? 'Prénom' : value, lastName, false)}.</p>
      <input
        className="text-input dm-name-input"
        value={value}
        onChange={(event) => setValue(event.currentTarget.value)}
        placeholder="Prénom"
        aria-label="Prénom"
        autoComplete="given-name"
        autoFocus
      />
      <div className="alert-actions">
        <button type="submit" className="btn btn-primary">Envoyer</button>
        <button type="button" className="btn btn-quiet" onClick={onClose}>Annuler</button>
      </div>
    </form>
  );
}

// MARK: - Aperçu avant envoi (AttachmentPreviewSheet)

function PreviewSheet({ items, conversationId, onRemove, onDone }: {
  items: PendingFile[];
  conversationId: string;
  onRemove: (id: string) => void;
  onDone: () => void;
}) {
  const [caption, setCaption] = useState('');
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const cancelled = useRef(false);
  const open = items.length > 0;
  const sendable = items.filter((item) => item.error === null);

  useEffect(() => {
    if (open) return;
    setCaption('');
    setProgress(null);
    setError(null);
  }, [open]);

  const close = () => {
    cancelled.current = true;
    onDone();
  };

  /** Envoie chaque fichier (progression réelle), puis le message ; un échec arrête tout et « Réessayer » relance. */
  const send = async () => {
    if (!sendable.length || progress !== null) return;
    cancelled.current = false;
    setError(null);
    setProgress(0);
    const stored: Attachment[] = [];
    try {
      for (const [index, item] of sendable.entries()) {
        stored.push(await uploadPending(item, conversationId));
        if (cancelled.current) return;
        setProgress((index + 1) / sendable.length);
      }
      if (!await sendAttachments(conversationId, stored, caption)) throw new Error(UPLOAD_FAILURE);
      if (cancelled.current) return;
      onDone();
    } catch (failure) {
      if (cancelled.current) return;
      setProgress(null);
      const message = failure instanceof Error ? failure.message : '';
      setError(isKnownError(message) ? message : UPLOAD_FAILURE);
    }
  };

  return (
    <Sheet open={open} title={items.length > 1 ? `${items.length} éléments` : 'Aperçu'} onClose={close} className="dm-preview-sheet" closeLabel="Annuler">
      <div className="dm-sheet-content">
        <ul className="dm-pending">
          {items.map((item) => (
            <li key={item.id}>
              <PendingTile item={item} onRemove={() => onRemove(item.id)} disabled={progress !== null} />
            </li>
          ))}
        </ul>
        {items.some((item) => item.error !== null) && <p className="dm-sheet-note">Les éléments signalés en rouge ne seront pas envoyés.</p>}
      </div>
      <div className="dm-preview-foot">
        {error && <p className="dm-error" role="alert"><Icon name="triangleAlert" />{error}</p>}
        {progress !== null && (
          <div className="dm-progress">
            <span>Envoi…</span>
            <progress value={progress} max={1} aria-label="Envoi des pièces jointes" />
          </div>
        )}
        <div className="dm-preview-send">
          <textarea
            className="dm-caption-input"
            rows={1}
            value={caption}
            placeholder="Ajouter un message…"
            aria-label="Ajouter un message"
            onChange={(event) => setCaption(event.currentTarget.value)}
          />
          <button type="button" className="btn btn-primary dm-pill" onClick={() => void send()} disabled={!sendable.length || progress !== null}>
            {error === null ? 'Envoyer' : 'Réessayer'}
          </button>
        </div>
      </div>
    </Sheet>
  );
}

/** Messages de l'app (AttachmentError, AttachmentPolicy) montrés tels quels ; les autres deviennent « n'a pas pu être envoyée ». */
const isKnownError = (message: string) => message === UNREADABLE || message === UPLOAD_FAILURE
  || /^(Format non accepté|Ce fichier est vide|Fichier trop volumineux|Le contenu de ce fichier)/.test(message);

/** Vignette d'un élément en attente : photo, vidéo (durée), document (icône, nom, « DPE · PDF · 1,2 Mo »), ou son erreur. */
function PendingTile({ item, onRemove, disabled }: { item: PendingFile; onRemove: () => void; disabled: boolean }) {
  let body: ReactNode;
  if (item.error) {
    body = (
      <span className="dm-tile-error">
        <Icon name="triangleAlert" />
        <span>{item.error}</span>
      </span>
    );
  } else if (item.kind === 'document') {
    body = (
      <span className="dm-tile-doc">
        <Icon name={documentIcon(item.fileName)} />
        <span className="dm-tile-name">{item.fileName}</span>
        <span className="dm-tile-line">{documentLine({ id: item.id, kind: 'document', fileName: item.fileName, byteCount: item.byteCount, ...(item.category ? { category: item.category } : {}) }, sizeLabel)}</span>
      </span>
    );
  } else {
    body = (
      <span className="dm-tile-media">
        {item.previewUrl ? <img src={item.previewUrl} alt="" /> : <Icon name={item.kind === 'video' ? 'video' : 'image'} />}
        {item.kind === 'video' && (
          <span className="dm-duration"><Icon name="play" />{item.durationSeconds !== null ? durationLabel(item.durationSeconds) : null}</span>
        )}
      </span>
    );
  }
  return (
    <div className={`dm-tile${item.error ? ' is-error' : ''}`}>
      {body}
      <button type="button" className="dm-tile-remove" onClick={onRemove} disabled={disabled} aria-label={`Retirer ${item.fileName}`} title="Retirer">
        <Icon name="x" />
      </button>
    </div>
  );
}
