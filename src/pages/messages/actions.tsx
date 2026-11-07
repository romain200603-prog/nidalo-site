import { useState } from 'react';
import { Icon } from '../../components/Icon';
import { REPORT_DETAILS_LIMIT, REPORT_REASONS, reportConversation, type ReportReason } from '../../lib/messages/api';
import { DISTANT_FUTURE, telHref } from '../../lib/messages/format';
import { isMuted, type Conversation } from '../../lib/messages/inbox';
import { block, setArchived, setMuted, unblock, updateSettings } from '../../lib/messages/store';
import { ConfirmDialog, Sheet, showIphoneOnly, showNotice, type MenuItem } from './parts';

// Actions d'une conversation partagées par son en-tête et par « Détails », comme l'app : le menu ⋮
// (DirectConversationMenuItems, ConversationView.swift:1080-1116, et celui du groupe, :280-306), l'appel
// (« Appeler X ? »), le blocage (« Bloquer ce compte ? ») et le signalement (ReportSheet, GroupInfoView.swift:1206).

export const DELETED_ACCOUNT = 'Compte supprimé';

/** Favori ajouté ou retiré (updateSettings, `try?`), puis l'avis de l'app, même si l'enregistrement a échoué. */
async function toggleFavorite(conversation: Conversation, added: string, removed: string) {
  const adding = !conversation.isFavorite;
  await updateSettings(conversation.id, (current) => ({ ...current, isFavorite: adding })).catch(() => undefined);
  showNotice(adding ? added : removed);
}

/** Débloquer : tout de suite, puis l'avis de l'app. */
export async function unblockWithNotice(userId: string) {
  showNotice(await unblock(userId) ? 'Compte débloqué.' : 'Le déblocage n\'a pas abouti.');
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
      onSelect: () => void setArchived(conversation.id, !conversation.isArchived),
    },
    {
      label: muted ? 'Réactiver les notifications' : 'Mettre en sourdine', icon: muted ? 'bell' : 'bellOff',
      onSelect: () => void setMuted(conversation.id, !muted),
    },
    {
      label: conversation.isFavorite ? 'Retirer des favoris' : 'Ajouter aux favoris', icon: 'heart',
      onSelect: () => void toggleFavorite(conversation, 'Conversation ajoutée aux favoris.', 'Conversation retirée des favoris.'),
    },
  ];
  const other = conversation.otherUserId;
  if (conversation.counterpart.name !== DELETED_ACCOUNT && other) {
    items.push(isBlocked
      ? { label: 'Débloquer', icon: 'ban', onSelect: () => void unblockWithNotice(other) }
      : { label: 'Bloquer', icon: 'ban', destructive: true, onSelect: onBlock });
  }
  items.push({ label: 'Signaler', icon: 'flag', destructive: true, onSelect: onReport });
  return items;
}

/** Menu ⋮ d'un groupe : infos (dans l'app iPhone), favori, sourdine « toujours », archiver, signaler le groupe. */
export function groupMenuItems({ conversation, onReport }: { conversation: Conversation; onReport: () => void }): MenuItem[] {
  const muted = isMuted(conversation);
  const info = conversation.communityId ? 'Communauté' : 'Infos du groupe';
  return [
    { label: info, icon: 'info', onSelect: () => showIphoneOnly(info) },
    {
      label: conversation.isFavorite ? 'Retirer des favoris' : 'Ajouter aux favoris', icon: 'heart',
      onSelect: () => void toggleFavorite(conversation, 'Groupe ajouté aux favoris.', 'Groupe retiré des favoris.'),
    },
    {
      label: muted ? 'Réactiver les notifications' : 'Mettre en sourdine', icon: muted ? 'bell' : 'bellOff',
      onSelect: () => void updateSettings(conversation.id, (current) => ({
        ...current, mutedUntil: muted ? null : DISTANT_FUTURE.toISOString(),
      })).catch(() => undefined),
    },
    {
      label: conversation.isArchived ? 'Désarchiver' : 'Archiver', icon: 'archive',
      onSelect: () => void setArchived(conversation.id, !conversation.isArchived),
    },
    { label: 'Signaler le groupe', icon: 'flag', destructive: true, onSelect: onReport },
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

/** « Bloquer ce compte ? » ; l'avis dit si le blocage a abouti. */
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
        void block(userId).then((done) => showNotice(done ? 'Compte bloqué.' : 'Le blocage n\'a pas abouti.'));
      }}
      onClose={onClose}
    />
  );
}

/**
 * Signalement (ReportSheet) : motif, description facultative de 500 caractères, puis « Enregistrer le signalement ».
 * Il part dans la table reports, comme la file de l'app quand elle est transmise.
 */
export function ReportSheet({ open, title, conversationId, onClose }: { open: boolean; title: string; conversationId: string; onClose: () => void }) {
  return (
    <Sheet open={open} title={title} onClose={onClose} className="dm-report" closeLabel="Annuler">
      <ReportForm conversationId={conversationId} onClose={onClose} />
    </Sheet>
  );
}

function ReportForm({ conversationId, onClose }: { conversationId: string; onClose: () => void }) {
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
    try {
      await reportConversation(crypto.randomUUID(), conversationId, reason, text ? text : null);
    } catch {
      setSaving(false);
      setError('Le signalement n\'a pas pu être enregistré. Réessayez.');
      return;
    }
    onClose();
    showNotice('Signalement transmis à l’équipe NIDALO.');
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
      <p className="dm-sheet-note">Il est transmis à l’équipe NIDALO. Les autres membres ne le voient pas.</p>
      {error && <p className="dm-error" role="alert"><Icon name="triangleAlert" />{error}</p>}
      <button type="submit" className="btn btn-primary dm-wide-button" disabled={!reason} aria-busy={saving}>Enregistrer le signalement</button>
    </form>
  );
}
