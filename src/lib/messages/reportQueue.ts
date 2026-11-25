import { isOfflineFailure } from '../loadFailure';
import { REPORT_REASONS, sendReport, type ReportReason, type ReportTargetType } from './api';

// File des signalements (ReportQueueStore de l'app) : un signalement part tout de suite ; sans réseau, il attend dans
// ce navigateur (localStorage « nidalo.signalements.<compte> », une file par compte : il ne part jamais sous le nom
// d'un autre compte) et repart au retour de la connexion ou à la prochaine ouverture de Messages. Une coupure le garde ;
// un refus du serveur le retire, sinon il repartirait à chaque fois.

export type QueuedReport = {
  id: string;
  targetType: ReportTargetType;
  targetId: string;
  reason: ReportReason;
  details: string | null;
};

export const REPORT_SENT = 'Signalement envoyé à l\'équipe Nidalo.';
export const REPORT_QUEUED = 'Signalement enregistré. Il partira dès le retour de la connexion.';
export const REPORT_SAVE_FAILED = 'Le signalement n\'a pas pu être enregistré. Réessayez.';

const keyFor = (owner: string) => `nidalo.signalements.${owner.toLowerCase()}`;
const REASONS = new Set<string>(REPORT_REASONS.map((option) => option.value));

function isReport(value: unknown): value is QueuedReport {
  const report = value as Partial<Record<keyof QueuedReport, unknown>> | null;
  return !!report && typeof report.id === 'string' && (report.targetType === 'conversation' || report.targetType === 'message')
    && typeof report.targetId === 'string' && typeof report.reason === 'string' && REASONS.has(report.reason)
    && (report.details === null || typeof report.details === 'string');
}

function read(owner: string): QueuedReport[] {
  try {
    const raw = window.localStorage.getItem(keyFor(owner));
    const pending = raw ? (JSON.parse(raw) as { pending?: unknown }).pending : [];
    return Array.isArray(pending) ? pending.filter(isReport) : [];
  } catch {
    return [];
  }
}

/** Écrit la file ; `false` si ce navigateur refuse (navigation privée pleine, stockage bloqué). */
function write(owner: string, pending: QueuedReport[]): boolean {
  try {
    if (pending.length === 0) window.localStorage.removeItem(keyFor(owner));
    else window.localStorage.setItem(keyFor(owner), JSON.stringify({ pending }));
    return true;
  } catch {
    return false;
  }
}

/** Envoi en cours : une seule transmission de la file à la fois. */
let flushing: Promise<void> | null = null;

/** Transmet la file du compte ; ce qui n'a pas pu partir faute de réseau reste pour la prochaine fois. */
export function sendPendingReports(owner: string | null): Promise<void> {
  if (!owner) return Promise.resolve();
  if (flushing) return flushing.then(() => sendPendingReports(owner));
  const run = (async () => {
    const pending = read(owner);
    if (pending.length === 0) return;
    const sent = new Set<string>();
    for (const report of pending) {
      try {
        await sendReport(report.id, report.targetType, report.targetId, report.reason, report.details);
        sent.add(report.id);
      } catch (error) {
        if (!isOfflineFailure(error)) sent.add(report.id);
      }
    }
    if (sent.size > 0) write(owner, read(owner).filter((report) => !sent.has(report.id)));
  })();
  flushing = run.finally(() => {
    flushing = null;
  });
  return flushing;
}

/**
 * Enregistre puis transmet un signalement (ReportSheet.save) : renvoie le message à montrer, envoyé ou enregistré
 * faute de réseau, ou `error` si l'enregistrement a échoué. Sans stockage possible dans ce navigateur, il part
 * directement : envoyé, ou l'erreur d'enregistrement.
 */
export async function saveReport(owner: string, report: QueuedReport): Promise<{ notice: string } | { error: string }> {
  const pending = read(owner);
  if (!pending.some((item) => item.id === report.id) && !write(owner, [...pending, report])) {
    try {
      await sendReport(report.id, report.targetType, report.targetId, report.reason, report.details);
      return { notice: REPORT_SENT };
    } catch {
      return { error: REPORT_SAVE_FAILED };
    }
  }
  await sendPendingReports(owner);
  return { notice: read(owner).some((item) => item.id === report.id) ? REPORT_QUEUED : REPORT_SENT };
}
