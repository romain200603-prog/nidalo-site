import { useState } from 'react';
import { Icon } from '../../components/Icon';
import { currentUserId } from '../../lib/account/session';
import { REPORT_DETAILS_LIMIT, REPORT_REASONS, type ReportReason, type ReportTargetType } from '../../lib/messages/api';
import { DISTANT_FUTURE, telHref } from '../../lib/messages/format';
import { isDeletedAccount, isMuted, type Conversation } from '../../lib/messages/inbox';
import { REPORT_SAVE_FAILED, saveReport } from '../../lib/messages/reportQueue';
import { block, setArchived, unblock, updateSettings } from '../../lib/messages/store';
import { ConfirmDialog, Sheet, showIphoneOnly, showNotice, type MenuItem } from './parts';

// Actions d'une conversation partagées par son en-tête et par « Détails », comme l'app : le menu ⋮
// (DirectConversationMenuItems, ConversationView.swift:1080-1116, et celui du groupe, :280-306), l'appel
// (« Appeler X ? »), le blocage (« Bloquer ce compte ? ») et le signalement (ReportSheet, GroupInfoView.swift:1206).

/** Échec d'un réglage (favori, archive, sourdine), comme l'app (n° 210, n° 233). */
export const SETTING_FAILED = 'La modification n\'a pas pu être enregistrée.';

/** Favori ajouté ou retiré (updateSettings) ; l'avis de réussite seulement après l'enregistrement (n° 210). */
export async function toggleFavorite(conversation: Conversation, added: string, removed: string) {
  const adding = !conversation.isFavorite;
  try {
    await updateSettings(conversation.id, (current) => ({ ...current, isFavorite: adding }));
  } catch {
    showNotice(SETTING_FAILED);
    return;
  }
  showNotice(adding ? added : removed);
}

/** Archiver ou désarchiver : tout de suite ; refusé, l'archive revient et l'avis le dit (n° 210). */
export async function toggleArchived(conversation: Conversation) {
  if (!(await setArchived(conversation.id, !conversation.isArchived))) showNotice(SETTING_FAILED);
}

/** Sourdine « toujours » ou aucune (mutedUntil, comme la ligne « Notifications ») ; échec : l'avis de l'app (n° 210). */
export async function toggleMuted(conversation: Conversation) {
  const muted = isMuted(conversation);
  await updateSettings(conversation.id, (current) => ({ ...current, mutedUntil: muted ? null : DISTANT_FUTURE.toISOString() }))
    .catch(() => showNotice(SETTING_FAILED));
}

/** Débloquer : seulement après la réponse du serveur, puis l'avis de l'app (n° 28). */
export async function unblockWithNotice(userId: string) {
  showNotice(await unblock(userId) ? 'Compte débloqué.' : 'Le déblocage n\'a pas pu être enregistré. Vérifiez votre connexion.');
}

/** Menu ⋮ d'une conversation à deux : archiver, sourdine, favori, bloquer ou débloquer, signaler. */
export function directMenuItems({ conversation, isBlocked, onBlock, onReport }: {
  conversation: Conversation;
  isBlocked: boolean;
  onBlock: () => void;
  onReport: () => void;
}): MenuItem[] {
  const muted = isMuted(conversation);
  const items: MenuItem[] = [
    {
      label: conversation.isArchived ? 'Désarchiver' : 'Archiver', icon: 'archive',
      onSelect: () => void toggleArchived(conversation),
    },
    {
      label: muted ? 'Réactiver les notifications' : 'Mettre en sourdine', icon: muted ? 'bell' : 'bellOff',
      onSelect: () => void toggleMuted(conversation),
    },
    {
      label: conversation.isFavorite ? 'Retirer des favoris' : 'Ajouter aux favoris', icon: 'heart',
      onSelect: () => void toggleFavorite(conversation, 'Conversation ajoutée aux favoris.', 'Conversation retirée des favoris.'),
    },
  ];
  const other = conversation.otherUserId;
  if (!isDeletedAccount(conversation) && other) {
    items.push(isBlocked
      ? { label: 'Débloquer', icon: 'ban', onSelect: () => void unblockWithNotice(other) }
      : { label: 'Bloquer', icon: 'ban', destructive: true, onSelect: onBlock });
  }
  items.push({ label: 'Signaler', icon: 'flag', destructive: true, onSelect: onReport });
  return items;
}

/**
 * Menu ⋮ d'un groupe : infos (dans l'app iPhone), favori, sourdine « toujours », archiver, signaler le groupe ; pour
 * une communauté, « Communauté ajoutée aux favoris. » et « Signaler la communauté » (n° 212).
 */
export function groupMenuItems({ conversation, onReport }: { conversation: Conversation; onReport: () => void }): MenuItem[] {
  const muted = isMuted(conversation);
  const community = conversation.communityId !== null;
  const info = community ? 'Communauté' : 'Infos du groupe';
  return [
    { label: info, icon: 'info', onSelect: () => showIphoneOnly(info) },
    {
      label: conversation.isFavorite ? 'Retirer des favoris' : 'Ajouter aux favoris', icon: 'heart',
      onSelect: () => void (community
        ? toggleFavorite(conversation, 'Communauté ajoutée aux favoris.', 'Communauté retirée des favoris.')
        : toggleFavorite(conversation, 'Groupe ajouté aux favoris.', 'Groupe retiré des favoris.')),
    },
    {
      label: muted ? 'Réactiver les notifications' : 'Mettre en sourdine', icon: muted ? 'bell' : 'bellOff',
      onSelect: () => void toggleMuted(conversation),
    },
    {
      label: conversation.isArchived ? 'Désarchiver' : 'Archiver', icon: 'archive',
      onSelect: () => void toggleArchived(conversation),
    },
    { label: community ? 'Signaler la communauté' : 'Signaler le groupe', icon: 'flag', destructive: true, onSelect: onReport },
  ];
}

/** « Appeler X ? » puis « Appeler le 06 39 98 12 34 » (lien tel:, comme openURL de l'app). */
export function CallDialog({ open, name, phone, onClose }: { open: boolean; name: string; phone: string | null; onClose: () => void }) {
  return (
    <ConfirmDialog
      open={open && !!phone}
      title={`Appeler ${name} ?`}
      confirm={`Appeler le ${phone ?? ''}`}
      onConfirm={() => { if (phone) window.location.href = telHref(phone); }}
      onClose={onClose}
    />
  );
}

/** « Bloquer ce compte ? » ; l'avis dit si le blocage a été enregistré par le serveur (n° 28). */
export function BlockDialog({ open, userId, onClose }: { open: boolean; userId: string | null; onClose: () => void }) {
  return (
    <ConfirmDialog
      open={open}
      title="Bloquer ce compte ?"
      message="Il ne pourra plus vous écrire. Vous pourrez le débloquer à tout moment."
      confirm="Bloquer"
      destructive
      onConfirm={() => {
        if (!userId) return;
        void block(userId).then((done) => showNotice(done ? 'Compte bloqué.' : 'Le blocage n\'a pas pu être enregistré. Vérifiez votre connexion.'));
      }}
      onClose={onClose}
    />
  );
}

/**
 * Signalement (ReportSheet) : motif, description facultative de 500 caractères, puis « Enregistrer le signalement ».
 * Il part tout de suite dans la table reports, comme l'app avec un compte connecté (n° 2) ; le site n'a pas la file
 * de l'iPhone qui le garde sans réseau : un échec le dit, et le bouton reste là pour réessayer.
 */
export function ReportSheet({ open, title, conversationId, messageId = null, onClose }: {
  open: boolean;
  title: string;
  conversationId: string;
  /** « Signaler le message » (appui long sur un message reçu) : le message plutôt que la conversation. */
  messageId?: string | null;
  onClose: () => void;
}) {
  return (
    <Sheet open={open} title={title} onClose={onClose} className="dm-report" closeLabel="Annuler">
      <ReportForm target={messageId ? { type: 'message', id: messageId } : { type: 'conversation', id: conversationId }} onClose={onClose} />
    </Sheet>
  );
}

/**
 * Enregistre le signalement puis le transmet (ReportSheet.save de l'app) : « Signalement envoyé à l'équipe Nidalo. »,
 * ou, sans réseau, « Signalement enregistré. Il partira dès le retour de la connexion. ».
 */
function ReportForm({ target, onClose }: { target: { type: ReportTargetType; id: string }; onClose: () => void }) {
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [details, setDetails] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const count = [...details].length;

  const save = async () => {
    if (!reason || saving) return;
    setSaving(true);
    setError(null);
    const text = details.trim();
    const owner = currentUserId();
    const report = { id: crypto.randomUUID().toUpperCase(), targetType: target.type, targetId: target.id, reason, details: text ? text : null };
    const result = owner ? await saveReport(owner, report) : { error: REPORT_SAVE_FAILED };
    if ('error' in result) {
      setSaving(false);
      setError(result.error);
      return;
    }
    onClose();
    showNotice(result.notice);
  };

  return (
    <form className="dm-sheet-content" onSubmit={(event) => { event.preventDefault(); void save(); }}>
      <fieldset className="dm-card dm-report-reasons">
        <legend className="dm-field-label">Motif</legend>
        {REPORT_REASONS.map((option) => (
          <label key={option.value} className={`dm-choice${reason === option.value ? ' is-on' : ''}`}>
            <input type="radio" name="motif" value={option.value} checked={reason === option.value} onChange={() => setReason(option.value)} />
            {option.label}
          </label>
        ))}
      </fieldset>
      <div className="dm-card">
        <div className="dm-field-head">
          <label className="dm-field-label" htmlFor="dm-report-details">Description (facultative)</label>
          <span className="dm-field-count">{count}/{REPORT_DETAILS_LIMIT}</span>
        </div>
        <textarea
          id="dm-report-details"
          className="dm-textarea"
          placeholder="Ce qui s'est passé"
          value={details}
          onChange={(event) => setDetails([...event.currentTarget.value].slice(0, REPORT_DETAILS_LIMIT).join(''))}
          rows={4}
        />
      </div>
      <p className="dm-sheet-note">Il est transmis à l'équipe Nidalo. Les autres membres ne le voient pas.</p>
      {error && <p className="dm-error" role="alert"><Icon name="triangleAlert" />{error}</p>}
      <button type="submit" className="btn btn-primary dm-wide-button" disabled={!reason} aria-busy={saving}>Enregistrer le signalement</button>
    </form>
  );
}
