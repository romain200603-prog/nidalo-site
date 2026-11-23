import { useEffect, useId, useLayoutEffect, useRef, useState, type ChangeEvent, type ReactNode } from 'react';
import { Icon } from '../../components/Icon';
import type { IconName } from '../../components/iconPaths';
import { accountStore, formFor, loadAccount, publicName, saveProfile } from '../../lib/account/profile';
import { useStore } from '../../lib/account/session';
import type { Message } from '../../lib/messages/api';
import {
  CATEGORY_ICONS, CATEGORY_LABELS, contentPreview, DOCUMENT_CATEGORIES, documentIcon, documentLine, MAX_FILES_PER_MESSAGE, type Attachment,
  type DocumentCategory,
} from '../../lib/messages/content';
import {
  DOCUMENT_ACCEPT, MEDIA_ACCEPT, pendingDocument, pendingMedia, releasePending, UNREADABLE, UPLOAD_FAILURE, uploadPending, type PendingFile,
} from '../../lib/messages/files';
import { durationLabel, sizeLabel } from '../../lib/messages/format';
import { sameId, type Conversation } from '../../lib/messages/inbox';
import { replyComposerTitle } from '../../lib/messages/interactions';
import { sendAttachments, sendText } from '../../lib/messages/store';
import { groupSender, needsFirstName } from '../../lib/messages/thread';
import { ReplyComposerBar } from './MessageInteractions';
import { DialogContent } from '../listing/Dialogs';
import { Dialog, Sheet, showIphoneOnly, showNotice } from './parts';

// Zone de saisie (demande de Romain du 14 novembre 2026) : réponses rapides selon le contexte, puis « + » (pièces
// jointes), « Écrivez votre message… » (jusqu'à 5 lignes), émojis, envoi (grisé tant que le champ est vide). Entrée
// envoie, Maj + Entrée va à la ligne. Le premier message d'une conversation à deux demande d'abord le prénom (« Votre
// prénom »), comme l'app. Le « + » ouvre « Joindre » (AttachmentMenuSheet) : les photos, vidéos et documents viennent
// de l'ordinateur ; l'aperçu (AttachmentPreviewSheet) envoie chaque fichier puis le message.

/** Réponse rapide au-dessus du champ : une action, ou `documents` pour choisir des documents à envoyer. */
export type Suggestion = { key: string; label: string; icon?: IconName; disabled?: boolean; onSelect: (() => void) | 'documents' };

const SEND_FAILED = 'Le message n\'a pas pu être envoyé. Réessayez.';

/** Émojis du bouton à droite du champ (le site n'a pas le clavier d'émojis de l'iPhone). */
const EMOJIS = [
  '😀', '😊', '🙂', '😉', '😍', '🥰', '😂', '😅', '😇', '🤔', '😮', '😢', '🙏', '👍', '👎', '👏',
  '💪', '👌', '🤝', '🙌', '👋', '✌️', '❤️', '🔥', '🎉', '✅', '❌', '⏰', '🏠', '🔑', '📅', '📍',
];

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

export function Composer({ conversation, messages, suggestions, onMakeOffer, replyingTo = null, onReplyChange = () => undefined, me = null }: {
  conversation: Conversation;
  /** Réponses rapides selon le contexte (demande de visite, dossier). */
  suggestions: Suggestion[];
  /** Tous les messages lus de la conversation (le prénom n'est demandé que s'il n'y en a aucun) ; `null` pendant la lecture. */
  messages: Message[] | null;
  /** « Faire une offre » dans le « + » : acheteur d'une annonce en vente, sans offre en cours. */
  onMakeOffer: (() => void) | null;
  /** Message auquel on répond (« Réponse à Sophie Martin » au-dessus du champ) ; il part avec le message envoyé. */
  replyingTo?: Message | null;
  onReplyChange?: (message: Message | null) => void;
  me?: string | null;
}) {
  const account = useStore(accountStore);
  const emojiPanelId = useId();
  const [draft, setDraft] = useState('');
  const [askName, setAskName] = useState(false);
  const [menu, setMenu] = useState<'closed' | 'sources' | 'categories'>('closed');
  const [emojis, setEmojis] = useState(false);
  const [pending, setPending] = useState<PendingFile[]>([]);
  const field = useRef<HTMLTextAreaElement>(null);
  const emojiButton = useRef<HTMLButtonElement>(null);
  const emojiPanel = useRef<HTMLDivElement>(null);
  const mediaInput = useRef<HTMLInputElement>(null);
  const documentInput = useRef<HTMLInputElement>(null);
  const category = useRef<DocumentCategory | null>(null);
  const pendingRef = useRef<PendingFile[]>([]);
  // Place du curseur après un émoji ajouté, appliquée une fois le champ mis à jour.
  const caret = useRef<number | null>(null);
  pendingRef.current = pending;

  useEffect(() => { void loadAccount(); }, []);
  // « Répondre » : le champ prend la main, comme l'app (isComposerFocused).
  const replyId = replyingTo?.id ?? null;
  useEffect(() => { if (replyId) field.current?.focus(); }, [replyId]);
  // Page quittée ou autre conversation : les aperçus locaux sont libérés.
  useEffect(() => () => releasePending(pendingRef.current), []);

  // Champ d'une à cinq lignes, puis il défile.
  useLayoutEffect(() => {
    const el = field.current;
    if (!el) return;
    const style = getComputedStyle(el);
    const lines = 5 * (parseFloat(style.lineHeight) || 22) + (parseFloat(style.paddingTop) || 0) + (parseFloat(style.paddingBottom) || 0);
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, lines)}px`;
    if (caret.current !== null) {
      el.focus();
      el.setSelectionRange(caret.current, caret.current);
      caret.current = null;
    }
  }, [draft]);

  // Panneau des émojis : se ferme avec Échap ou un clic ailleurs.
  useEffect(() => {
    if (!emojis) return undefined;
    const onPointer = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!emojiPanel.current?.contains(target) && !emojiButton.current?.contains(target)) setEmojis(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setEmojis(false);
      emojiButton.current?.focus();
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [emojis]);

  /** Met l'émoji à la place du curseur, puis remet le curseur juste après. */
  const insertEmoji = (emoji: string) => {
    const el = field.current;
    const start = el?.selectionStart ?? draft.length;
    const end = el?.selectionEnd ?? draft.length;
    caret.current = start + emoji.length;
    setDraft(`${draft.slice(0, start)}${emoji}${draft.slice(end)}`);
    setEmojis(false);
  };

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
    await sendDraft();
  };

  /**
   * Comme l'app : le champ et la réponse se vident tout de suite ; refusé, la réponse revient, et le texte aussi : seul
   * si rien n'a été tapé depuis, sinon devant le nouveau texte, séparé par une espace (n° 208).
   */
  const sendDraft = async () => {
    const text = draft;
    const reply = replyingTo;
    setDraft('');
    onReplyChange(null);
    const outcome = await sendText(conversation.id, text, reply?.id ?? null);
    if (!outcome.sent) {
      setDraft((current) => (current === '' ? text : `${text} ${current}`));
      onReplyChange(reply);
      showNotice(outcome.refusal ?? SEND_FAILED);
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
    await sendDraft();
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
    <>
      {suggestions.length > 0 && (
        <div className="dm-quick" role="group" aria-label="Réponses rapides">
          {suggestions.map((item) => (
            <button
              key={item.key}
              type="button"
              disabled={item.disabled}
              onClick={() => {
                if (item.onSelect === 'documents') setMenu('categories');
                else item.onSelect();
              }}
            >
              {item.icon && <Icon name={item.icon} />}
              {item.label}
            </button>
          ))}
        </div>
      )}
      {replyingTo && (
        <ReplyComposerBar
          title={replyComposerTitle(sameId(replyingTo.senderId, me),
            groupSender(conversation, replyingTo.senderId)?.name ?? conversation.counterpart.name)}
          preview={contentPreview(replyingTo.content)}
          onCancel={() => onReplyChange(null)}
        />
      )}
      <div className="dm-composer">
        <button type="button" className="dm-plus" onClick={() => setMenu('sources')} aria-label="Ajouter une pièce jointe" title="Ajouter une pièce jointe">
          <Icon name="plus" />
        </button>
        <div className="dm-field">
          <textarea
            ref={field}
            rows={1}
            value={draft}
            placeholder="Écrivez votre message…"
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
            ref={emojiButton}
            type="button"
            className="dm-emoji"
            onClick={() => setEmojis((open) => !open)}
            aria-label="Ajouter un émoji"
            aria-expanded={emojis}
            aria-controls={emojis ? emojiPanelId : undefined}
            title="Ajouter un émoji"
          >
            <Icon name="smile" />
          </button>
          {emojis && (
            <div ref={emojiPanel} id={emojiPanelId} className="dm-emoji-panel" role="group" aria-label="Émojis">
              {EMOJIS.map((emoji) => (
                <button key={emoji} type="button" onClick={() => insertEmoji(emoji)} aria-label={emoji}>{emoji}</button>
              ))}
            </div>
          )}
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
          replyToId={replyingTo?.id ?? null}
          onReplySent={() => onReplyChange(null)}
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
    </>
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

/**
 * « Votre prénom » (domiaAlert) : champ « Prénom », « Affiché à votre interlocuteur : Claire M. », Envoyer, Annuler.
 * Une alerte : seuls ses boutons la ferment, ni Échap ni un clic à l'extérieur (n° 45).
 */
function FirstNameDialog({ open, lastName, onClose, onSend }: { open: boolean; lastName: string; onClose: () => void; onSend: (first: string) => void }) {
  const id = useId();
  return (
    <Dialog open={open} onClose={onClose} className="alert-dialog dm-dialog" labelledBy={`${id}-titre`} describedBy={`${id}-texte`} dismissible={false}>
      <FirstNameForm id={id} lastName={lastName} onClose={onClose} onSend={onSend} />
    </Dialog>
  );
}

function FirstNameForm({ id, lastName, onClose, onSend }: { id: string; lastName: string; onClose: () => void; onSend: (first: string) => void }) {
  const [value, setValue] = useState('');
  return (
    <DialogContent
      titleId={`${id}-titre`}
      textId={`${id}-texte`}
      title="Votre prénom"
      message={`Affiché à votre interlocuteur : ${publicName(value === '' ? 'Prénom' : value, lastName, false)}.`}
      alert
      onDismiss={onClose}
      onSubmit={() => {
        const first = value.trim();
        // Comme l'alerte de l'app : « Envoyer » la referme ; sans prénom, rien n'est envoyé.
        if (!first) {
          onClose();
          return;
        }
        onSend(first);
      }}
      actions={[{ label: 'Envoyer', submit: true }, { label: 'Annuler', onClick: onClose, role: 'cancel' }]}
    >
      <input
        className="dialog-field dm-name-input"
        value={value}
        onChange={(event) => setValue(event.currentTarget.value)}
        placeholder="Prénom"
        aria-label="Prénom"
        autoComplete="given-name"
        autoFocus
      />
    </DialogContent>
  );
}

// MARK: - Aperçu avant envoi (AttachmentPreviewSheet)

function PreviewSheet({ items, conversationId, replyToId, onReplySent, onRemove, onDone }: {
  items: PendingFile[];
  conversationId: string;
  /** Réponse en cours : les pièces jointes partent en réponse à ce message. */
  replyToId: string | null;
  onReplySent: () => void;
  onRemove: (id: string) => void;
  onDone: () => void;
}) {
  const [caption, setCaption] = useState('');
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const cancelled = useRef(false);
  // Fichiers déjà envoyés dans le dossier, par élément : « Réessayer » ne les renvoie pas, et le message refait est le
  // même, reconnu par le serveur s'il était arrivé malgré l'échec (n° 99).
  const uploaded = useRef(new Map<string, Attachment>());
  const open = items.length > 0;
  const sendable = items.filter((item) => item.error === null);

  useEffect(() => {
    if (open) return;
    setCaption('');
    setProgress(null);
    setError(null);
    uploaded.current.clear();
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
        const done = uploaded.current.get(item.id) ?? await uploadPending(item, conversationId);
        uploaded.current.set(item.id, done);
        stored.push(done);
        if (cancelled.current) return;
        setProgress((index + 1) / sendable.length);
      }
      const outcome = await sendAttachments(conversationId, stored, caption, replyToId);
      if (cancelled.current) return;
      if (!outcome.sent) {
        // Message d'accompagnement refusé par le filtre de mots interdits, ou message cité qui n'est plus disponible :
        // le message du serveur ; sinon l'échec habituel.
        setProgress(null);
        setError(outcome.refusal ?? UPLOAD_FAILURE);
        return;
      }
      if (replyToId) onReplySent();
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
  || /^(Format non accepté|Ce fichier est vide|Fichier trop volumineux|Vidéo trop volumineuse|Le contenu de ce fichier)/.test(message);

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
