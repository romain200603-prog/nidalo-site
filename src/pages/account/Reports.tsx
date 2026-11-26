import { useEffect, useState } from 'react';
import { Icon } from '../../components/Icon';
import type { IconName } from '../../components/iconPaths';
import {
  ACTION_DONE, ACTION_LABELS, actionLine, confirmation, fetchReports, groupMembers, isLate, isReserved, moderationFailure,
  REASON_LABELS, reportActions, reportContent, reportDate, REPORTS_FAILURE, resolveReport, TARGET_LABELS,
  type ModerationAction, type ReportRow,
} from '../../lib/account/moderation';
import { PUBLIC_STATUSES } from '../../lib/listings';
import { listingPath } from '../../lib/paths';
import { RoundButton } from '../../components/RoundButton';
import { ChoiceDialog } from './DesktopParts';
import { ScreenHeader, Spinner, Toast } from './parts';

// « Signalements » (modération, 15 novembre 2026), pour les comptes modérateurs seulement : les signalements envoyés
// depuis l'app et le site, à traiter sous 24 heures (conditions d'utilisation). Chaque fiche montre ce qui a été
// signalé, tel que le serveur l'a copié au moment du signalement, puis les gestes possibles : retirer l'annonce,
// supprimer le message, suspendre le compte (ou lever la suspension), classer sans suite. Le serveur refait chaque
// vérification (moderation_reports, moderation_resolve).

type Tab = 'open' | 'closed';
type State =
  | { status: 'loading' }
  | { status: 'reserved'; message: string }
  | { status: 'error'; message: string }
  | { status: 'ready'; rows: ReportRow[] };
type Pending = { row: ReportRow; action: ModerationAction; userId: string | null; name: string | null };

const ACTION_ICONS: Record<ModerationAction, IconName> = {
  remove_listing: 'eyeOff',
  delete_message: 'trash',
  suspend_user: 'ban',
  unsuspend_user: 'rotateCcw',
  dismiss: 'check',
};

/** Phrase sous le titre (ModerationText.subtitle). */
const SUBTITLE = 'Chaque signalement est à traiter sous 24 heures.';

const isPublic = (status: string | null) => status !== null && (PUBLIC_STATUSES as readonly string[]).includes(status);

export function Reports() {
  const [tab, setTab] = useState<Tab>('open');
  const [state, setState] = useState<State>({ status: 'loading' });
  const [openCount, setOpenCount] = useState<number | null>(null);
  const [reload, setReload] = useState(0);
  const [pending, setPending] = useState<Pending | null>(null);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setState({ status: 'loading' });
    fetchReports(tab === 'closed')
      .then((rows) => {
        if (!alive) return;
        setState({ status: 'ready', rows });
        if (tab === 'open') setOpenCount(rows.length);
      })
      .catch((error: unknown) => {
        if (!alive) return;
        const message = moderationFailure(error, REPORTS_FAILURE);
        setState(isReserved(error) ? { status: 'reserved', message } : { status: 'error', message });
      });
    return () => { alive = false; };
  }, [tab, reload]);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = window.setTimeout(() => setToast(null), 2500);
    return () => window.clearTimeout(timer);
  }, [toast]);

  async function confirm() {
    if (!pending || busy) return;
    const { row, action, userId } = pending;
    setBusy(true);
    setFailure(null);
    const error = await resolveReport(row.id, action, userId);
    setBusy(false);
    setPending(null);
    if (error) setFailure(error);
    else setToast(ACTION_DONE[action]);
    // Relu dans tous les cas : un autre signalement a pu être traité avec, ou le contenu a déjà disparu.
    setReload((n) => n + 1);
  }

  const now = new Date();
  let content;
  if (state.status === 'loading') {
    content = <Spinner />;
  } else if (state.status === 'reserved') {
    content = (
      <div className="dsc-empty">
        <Icon name="lock" />
        <h2>Page réservée</h2>
        <p>{state.message}</p>
      </div>
    );
  } else if (state.status === 'error') {
    content = (
      <div className="dsc-empty">
        <Icon name="triangleAlert" />
        <h2>Signalements indisponibles</h2>
        <p>{state.message}</p>
        <button type="button" className="dsc-button dsc-button-light" onClick={() => setReload((n) => n + 1)}>Réessayer</button>
      </div>
    );
  } else if (state.rows.length === 0) {
    content = tab === 'open' ? (
      <div className="dsc-empty">
        <Icon name="circleCheck" />
        <h2>Rien à traiter</h2>
        <p>Chaque nouveau signalement arrive ici, avec une notification sur votre iPhone.</p>
      </div>
    ) : (
      <div className="dsc-empty">
        <Icon name="flag" />
        <h2>Aucun signalement traité</h2>
        <p>Les signalements traités apparaîtront ici.</p>
      </div>
    );
  } else {
    content = (
      <ul className="dsc-reports">
        {state.rows.map((row) => (
          <ReportCard
            key={row.id}
            row={row}
            late={isLate(row, now)}
            disabled={busy}
            onAction={(action, userId, name) => { setFailure(null); setPending({ row, action, userId, name }); }}
          />
        ))}
      </ul>
    );
  }

  const asked = pending ? confirmation(pending.action, pending.name) : null;
  const reserved = state.status === 'reserved';
  const refresh = () => setReload((n) => n + 1);

  return (
    <div className="dsc dsc-reports-screen is-phone">
      <Toast text={toast} />
      {/* L'en-tête de l'app et son bouton rond « Actualiser » (refresh-cw), puis la phrase de 13,5 grise. */}
      <ScreenHeader title="Signalements" action={!reserved && <RoundButton icon="refreshCw" label="Actualiser" onClick={refresh} />} />
      {!reserved && <p className="reports-subtitle">{SUBTITLE}</p>}
      {!reserved && (
        <div className="dsc-tabs" role="tablist" aria-label="Signalements">
          <button type="button" role="tab" aria-selected={tab === 'open'} className="dsc-tab" onClick={() => setTab('open')}>
            À traiter
            {openCount !== null && <span className="dsc-tab-count">{openCount}</span>}
          </button>
          <button type="button" role="tab" aria-selected={tab === 'closed'} className="dsc-tab" onClick={() => setTab('closed')}>
            Traités
          </button>
        </div>
      )}
      {failure && <p className="dsc-report-failure" role="alert"><Icon name="triangleAlert" />{failure}</p>}
      <div role={reserved ? undefined : 'tabpanel'} aria-label={tab === 'open' ? 'À traiter' : 'Traités'}>{content}</div>
      <ChoiceDialog
        open={pending !== null}
        title={asked?.title ?? ''}
        message={asked?.message}
        onClose={() => { if (!busy) setPending(null); }}
        actions={pending && asked ? [
          { label: busy ? 'Un instant…' : ACTION_LABELS[pending.action], onClick: () => void confirm(), role: asked.danger ? 'destructive' : undefined },
          { label: 'Annuler', onClick: () => { if (!busy) setPending(null); }, role: 'cancel' },
        ] : []}
      />
    </div>
  );
}

function ReportCard({ row, late, disabled, onAction }: {
  row: ReportRow;
  late: boolean;
  disabled: boolean;
  onAction: (action: ModerationAction, userId: string | null, name: string | null) => void;
}) {
  const shown = reportContent(row);
  const actions = reportActions(row);
  const members = groupMembers(row);
  const [member, setMember] = useState(members[0]?.id ?? '');
  const chosen = members.find((item) => item.id === member) ?? members[0] ?? null;
  const done = actionLine(row);

  function act(action: ModerationAction) {
    // Groupe : la personne choisie dans la liste ; sinon celle que le serveur a trouvée.
    if (action === 'suspend_user' && chosen) onAction(action, chosen.id, chosen.name);
    else onAction(action, null, row.person_name);
  }

  return (
    <li className="dsc-card dsc-report">
      <div className="dsc-report-top">
        <span className="dsc-report-type">{TARGET_LABELS[row.target_type] ?? row.target_type}</span>
        <span className="dsc-report-reason">{REASON_LABELS[row.reason] ?? row.reason}</span>
        {late && <span className="dsc-report-late">Plus de 24 h</span>}
      </div>
      <p className="dsc-report-meta">
        {reportDate(row.created_at)} · Signalé par {row.reporter_name ?? 'un compte supprimé'}
      </p>
      {row.details && <p className="dsc-report-details">« {row.details} »</p>}

      {shown.kind === 'listing' && (
        <div className="dsc-report-body">
          <span className="dsc-report-title">{shown.title}</span>
          {shown.line && <span className="dsc-report-line">{shown.line}</span>}
          {shown.description && <p className="dsc-report-text">{shown.description}</p>}
          <span className="dsc-report-state">
            {shown.state}
            {isPublic(row.listing_status) && <a className="dsc-report-link" href={listingPath(row.target_id)}>Voir l&apos;annonce</a>}
          </span>
        </div>
      )}
      {shown.kind === 'message' && (
        <div className="dsc-report-body">
          <p className="dsc-report-text">{shown.text}</p>
          {shown.deleted && <span className="dsc-report-state">Message supprimé</span>}
        </div>
      )}
      {shown.kind === 'conversation' && (
        <div className="dsc-report-body dsc-report-thread">
          {shown.lines.length === 0 ? <p className="dsc-report-line">Aucun message copié</p> : (
            <ol>
              {shown.lines.map((line, index) => (
                <li key={index}><strong>{line.name}</strong> {line.text}</li>
              ))}
            </ol>
          )}
        </div>
      )}

      {(row.person_name || shown.kind === 'user') && (
        <p className="dsc-report-person">
          <Icon name="userRound" />
          <span>{shown.kind === 'user' ? shown.name : row.person_name}</span>
          {row.person_suspended && <span className="dsc-report-suspended">Suspendu</span>}
        </p>
      )}
      {done && <p className="dsc-report-done"><Icon name="circleCheck" />{done}</p>}

      {actions.length > 0 && (
        <div className="dsc-report-actions">
          {members.length > 0 && actions.includes('suspend_user') && (
            <label className="dsc-select">
              <span className="visually-hidden">Compte à suspendre</span>
              <select value={chosen?.id ?? ''} onChange={(event) => setMember(event.target.value)} disabled={disabled}>
                {members.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
              <Icon name="chevronDown" />
            </label>
          )}
          {actions.map((action) => (
            <button
              key={action}
              type="button"
              className={`dsc-small${action === 'dismiss' || action === 'unsuspend_user' ? '' : ' is-danger'}`}
              disabled={disabled}
              onClick={() => act(action)}
            >
              <Icon name={ACTION_ICONS[action]} />
              {ACTION_LABELS[action]}
            </button>
          ))}
        </div>
      )}
    </li>
  );
}
