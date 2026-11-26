import { useState } from 'react';
import { InfoLine } from '../../components/FilterControls';
import { Icon } from '../../components/Icon';
import { startDirectConversation } from '../../lib/messages/api';
import { alphabetical, type Contact } from '../../lib/messages/inbox';
import { reloadConversations, sendText } from '../../lib/messages/store';
import { AlertDialog } from '../listing/Dialogs';
import { StepButton } from './groupParts';
import { EmptyContacts } from './NewConversation';
import { CounterpartAvatar } from './parts';

// « Nouvelle diffusion » (BroadcastView.swift) : un même message envoyé séparément dans la conversation à deux de
// chaque destinataire (créée au besoin pour une agence, sans doublon : start_direct_conversation). Ce n'est pas un
// groupe : personne ne voit les autres destinataires ni leurs réponses.

/** Conversation d'un destinataire : sa plus récente, sinon celle avec l'agence (créée une seule fois par le serveur). */
async function conversationFor(contact: Contact): Promise<{ id: string; created: boolean } | null> {
  const latest = contact.conversations[0];
  if (latest) return { id: latest.id, created: false };
  if (!contact.professional) return null;
  try {
    return { id: await startDirectConversation(contact.professional.user_id), created: true };
  } catch {
    return null;
  }
}

export function Broadcast({ contacts, onFinish }: { contacts: Contact[]; onFinish: () => void }) {
  const sorted = alphabetical(contacts);
  const [selection, setSelection] = useState<Set<string>>(() => new Set());
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ text: string; allSent: boolean } | null>(null);
  const message = text.trim();
  const count = selection.size;

  const toggle = (id: string) => setSelection((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });

  /** Envoi un par un ; le résultat dit exactement combien de conversations ont reçu le message. */
  const send = async () => {
    if (sending || !message || count === 0) return;
    const recipients = sorted.filter((contact) => selection.has(contact.id));
    setSending(true);
    let sent = 0;
    let created = false;
    const failed = new Set<string>();
    for (const contact of recipients) {
      const conversation = await conversationFor(contact);
      if (conversation?.created) created = true;
      if (!conversation || !(await sendText(conversation.id, message)).sent) {
        failed.add(contact.id);
        continue;
      }
      sent += 1;
    }
    if (created) await reloadConversations().catch(() => undefined);
    setSending(false);
    // Seuls les destinataires qui n'ont rien reçu restent cochés.
    if (failed.size > 0) setSelection(failed);
    const word = `conversation${sent > 1 ? 's' : ''}`;
    setResult({
      text: sent === recipients.length ? `Message envoyé dans ${sent} ${word}.` : `Message envoyé dans ${sent} ${word} sur ${recipients.length}. Réessayez pour les autres.`,
      allSent: failed.size === 0,
    });
  };

  return (
    <>
      <div className="dm-new-body dmg-body is-picker">
        <InfoLine>Chaque destinataire reçoit le message dans sa propre conversation avec vous. Ce n'est pas un groupe : personne ne voit les autres destinataires.</InfoLine>
        <h3 className="dm-results-title">Message</h3>
        <textarea
          className="dmg-broadcast-text"
          value={text}
          placeholder="Votre message"
          aria-label="Message à diffuser"
          rows={4}
          onChange={(event) => setText(event.currentTarget.value)}
        />
        <h3 className="dm-results-title">{count === 0 ? 'Destinataires' : `Destinataires · ${count}`}</h3>
        {sorted.length === 0 ? <EmptyContacts action={{ label: 'Fermer', onClick: onFinish }} /> : (
          <ul className="dmg-picker-list">
            {sorted.map((contact) => {
              const selected = selection.has(contact.id);
              return (
                <li key={contact.id}>
                  <button type="button" className="dmg-picker-row" aria-pressed={selected} onClick={() => toggle(contact.id)}>
                    <CounterpartAvatar counterpart={contact.counterpart} size={44} fontSize={14} />
                    <span className="dmg-picker-text">
                      <span className="dmg-picker-name">{contact.counterpart.name}</span>
                      <span className="dmg-picker-detail">{contact.counterpart.subtitle}</span>
                    </span>
                    <span className={`dmg-check is-22${selected ? ' is-on' : ''}`} aria-hidden="true">{selected && <Icon name="check" />}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <StepButton
        title={count === 0 ? 'Choisissez des destinataires' : `Envoyer à ${count} destinataire${count > 1 ? 's' : ''}`}
        enabled={!!message && count > 0}
        loading={sending}
        onClick={() => void send()}
      />
      <AlertDialog
        open={result !== null}
        onClose={() => setResult(null)}
        title={result?.text ?? ''}
        dismissible={false}
        actions={[{
          label: 'OK',
          role: 'cancel',
          onClick: () => {
            // Tout est parti : l'écran se ferme ; sinon la fenêtre se ferme seule, le texte reste (n° 108).
            const done = result?.allSent ?? false;
            setResult(null);
            if (done) onFinish();
          },
        }]}
      />
    </>
  );
}
