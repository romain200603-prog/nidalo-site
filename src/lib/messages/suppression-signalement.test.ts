import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Suppression d'un message (SupabaseMessagingRepository.deleteMessage de l'app), fichiers du bucket à effacer
// (MessageAttachmentFiles.serverPaths), file des signalements (ReportQueueStore) et fichiers donnés à enregistrer
// (.ics d'une visite, .vcf d'un contact). Le client Supabase est simulé : chaque appel est noté tel quel.

type Chain = [string, ...unknown[]][];

const server = vi.hoisted(() => ({
  calls: [] as { table: string; chain: Chain }[],
  removed: [] as string[][],
  /** Réponse de chaque appel, selon sa table et sa première méthode (« messages:select », « messages:delete »…). */
  results: {} as Record<string, { data: unknown; error: unknown }>,
  /** Erreur renvoyée par les insertions dans reports, une par appel (null : réussite). */
  reportErrors: [] as unknown[],
}));

vi.mock('../supabase', () => {
  const from = (table: string) => {
    const call = { table, chain: [] as Chain };
    server.calls.push(call);
    const proxy: object = new Proxy({}, {
      get(_target, key) {
        if (key === 'then') {
          return (resolve: (value: unknown) => unknown, reject: (error: unknown) => unknown) => {
            if (table === 'reports') {
              const error = server.reportErrors.length ? server.reportErrors.shift() : null;
              return Promise.resolve({ data: null, error }).then(resolve, reject);
            }
            const result = server.results[`${table}:${call.chain[0]?.[0]}`] ?? { data: [], error: null };
            return Promise.resolve(result).then(resolve, reject);
          };
        }
        return (...args: unknown[]) => {
          call.chain.push([String(key), ...args]);
          return proxy;
        };
      },
    });
    return proxy;
  };
  const storage = {
    from: () => ({
      remove: (paths: string[]) => {
        server.removed.push(paths);
        return Promise.resolve({ data: paths.map((name) => ({ name })), error: null });
      },
    }),
  };
  return { supabase: { from, storage } };
});

import { DeleteRefused, deleteMessageRow } from './api';
import type { Attachment } from './content';
import { contactCardFile, directionsUrl, safeFileName, visitCalendarFile } from './exportFiles';
import { isServerPath, removeFiles, serverPaths } from './files';
import { REPORT_QUEUED, REPORT_SAVE_FAILED, REPORT_SENT, saveReport, sendPendingReports, type QueuedReport } from './reportQueue';

const MESSAGE = '9a000000-0000-4000-8000-000000000005';
const CONVERSATION = 'c1000000-0000-4000-8000-000000000001';
const OWNER = 'A0000000-0000-4000-8000-0000000000C1';
const OFFLINE = { message: 'TypeError: Failed to fetch' };

beforeEach(() => {
  server.calls = [];
  server.removed = [];
  server.results = {};
  server.reportErrors = [];
});

describe('suppression d\'un message', () => {
  it('lit le contenu, supprime la ligne en la demandant en retour, puis rend le contenu', async () => {
    const content = { text: { _0: 'Bonjour' } };
    server.results['messages:select'] = { data: { content }, error: null };
    server.results['messages:delete'] = { data: [{ id: MESSAGE }], error: null };
    await expect(deleteMessageRow(MESSAGE)).resolves.toEqual(content);
    expect(server.calls).toEqual([
      { table: 'messages', chain: [['select', 'content'], ['eq', 'id', MESSAGE.toUpperCase()], ['single']] },
      { table: 'messages', chain: [['delete'], ['eq', 'id', MESSAGE.toUpperCase()], ['select', 'id']] },
    ]);
  });

  it('aucune ligne supprimée alors que le message est là : refus (pas l\'auteur)', async () => {
    server.results['messages:select'] = { data: { content: { text: { _0: 'Bonjour' } } }, error: null };
    server.results['messages:delete'] = { data: [], error: null };
    await expect(deleteMessageRow(MESSAGE)).rejects.toBeInstanceOf(DeleteRefused);
  });

  it('message déjà parti : réussite, sans contenu (aucun fichier à effacer)', async () => {
    server.results['messages:select'] = { data: null, error: { code: 'PGRST116', message: 'no rows' } };
    server.results['messages:delete'] = { data: [], error: null };
    await expect(deleteMessageRow(MESSAGE)).resolves.toBeNull();
  });

  it('erreur du serveur : transmise', async () => {
    server.results['messages:delete'] = { data: null, error: { code: '42501', message: 'refusé' } };
    await expect(deleteMessageRow(MESSAGE)).rejects.toMatchObject({ code: '42501' });
  });
});

describe('fichiers du bucket', () => {
  const item = (fields: Partial<Attachment>): Attachment => ({ id: 'X', kind: 'photo', fileName: 'Photo.jpg', byteCount: 1, ...fields });

  it('reconnaît les chemins du serveur (« <conversation>/<fichier> »), comme localPath(forServer:)', () => {
    expect(isServerPath(`${CONVERSATION}/7A1C2E3F.jpg`)).toBe(true);
    expect(isServerPath(`${CONVERSATION.toUpperCase()}/dossier/plan.pdf`)).toBe(true);
    expect(isServerPath(`local:pieces-jointes/${CONVERSATION}/a.jpg`)).toBe(false);
    expect(isServerPath('pas-un-identifiant/a.jpg')).toBe(false);
    expect(isServerPath(`${CONVERSATION}/`)).toBe(false);
    expect(isServerPath(`${CONVERSATION}/../autre/a.jpg`)).toBe(false);
    expect(isServerPath(`/${CONVERSATION}/a.jpg`)).toBe(false);
  });

  it('prend le fichier et la vignette de chaque pièce, sans les autres chemins', () => {
    expect(serverPaths([
      item({ storagePath: `${CONVERSATION}/a.mp4`, thumbnailPath: `${CONVERSATION}/a.jpg` }),
      item({ kind: 'location', storagePath: undefined }),
      item({ storagePath: 'https://exemple.test/b.jpg' }),
    ])).toEqual([`${CONVERSATION}/a.mp4`, `${CONVERSATION}/a.jpg`]);
  });

  it('efface les fichiers en une demande, et rien sans fichier', async () => {
    await removeFiles([]);
    await removeFiles([`${CONVERSATION}/a.jpg`, `${CONVERSATION}/b.pdf`]);
    expect(server.removed).toEqual([[`${CONVERSATION}/a.jpg`, `${CONVERSATION}/b.pdf`]]);
  });
});

describe('file des signalements', () => {
  let stored: Map<string, string>;
  let blocked: boolean;
  const report = (n: number): QueuedReport => ({
    id: `E000000${n}-0000-4000-8000-000000000000`, targetType: 'message', targetId: MESSAGE, reason: 'spam', details: null,
  });
  const queued = (owner = OWNER) => {
    const raw = stored.get(`nidalo.signalements.${owner.toLowerCase()}`);
    return raw ? (JSON.parse(raw) as { pending: QueuedReport[] }).pending.map((item) => item.id) : [];
  };

  beforeEach(() => {
    stored = new Map();
    blocked = false;
    vi.stubGlobal('window', {
      localStorage: {
        getItem: (key: string) => {
          if (blocked) throw new Error('stockage bloqué');
          return stored.get(key) ?? null;
        },
        setItem: (key: string, value: string) => {
          if (blocked) throw new Error('stockage bloqué');
          stored.set(key, value);
        },
        removeItem: (key: string) => {
          if (blocked) throw new Error('stockage bloqué');
          stored.delete(key);
        },
      },
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('envoyé tout de suite : « Signalement envoyé à l\'équipe Nidalo. », la file reste vide', async () => {
    await expect(saveReport(OWNER, report(1))).resolves.toEqual({ notice: REPORT_SENT });
    expect(queued()).toEqual([]);
    expect(server.calls).toEqual([{ table: 'reports', chain: [['insert', { id: report(1).id, target_type: 'message', target_id: MESSAGE.toUpperCase(), reason: 'spam' }]] }]);
  });

  it('sans réseau : gardé pour ce compte, puis envoyé au retour de la connexion', async () => {
    server.reportErrors = [OFFLINE];
    await expect(saveReport(OWNER, report(1))).resolves.toEqual({ notice: REPORT_QUEUED });
    expect(queued()).toEqual([report(1).id]);
    // Un autre compte ne l'envoie jamais.
    await sendPendingReports('a0000000-0000-4000-8000-0000000000e1');
    expect(server.calls).toHaveLength(1);
    await sendPendingReports(OWNER);
    expect(server.calls).toHaveLength(2);
    expect(queued()).toEqual([]);
  });

  it('refusé par le serveur : retiré de la file (il repartirait à chaque fois)', async () => {
    server.reportErrors = [OFFLINE];
    await saveReport(OWNER, report(1));
    server.reportErrors = [{ code: '42501', message: 'refusé' }];
    await sendPendingReports(OWNER);
    expect(queued()).toEqual([]);
  });

  it('déjà reçu (23505) : compté comme envoyé', async () => {
    server.reportErrors = [{ code: '23505', message: 'duplicate key' }];
    await expect(saveReport(OWNER, report(1))).resolves.toEqual({ notice: REPORT_SENT });
  });

  it('sans stockage dans ce navigateur : envoyé directement, ou l\'erreur d\'enregistrement', async () => {
    blocked = true;
    await expect(saveReport(OWNER, report(1))).resolves.toEqual({ notice: REPORT_SENT });
    server.reportErrors = [OFFLINE];
    await expect(saveReport(OWNER, report(2))).resolves.toEqual({ error: REPORT_SAVE_FAILED });
  });
});

describe('fichiers à enregistrer', () => {
  it('visite pour l\'agenda : 45 minutes, « Visite immobilière », l\'adresse échappée', () => {
    const text = visitCalendarFile({
      id: 'E1000000-0000-4000-8000-000000000001', start: new Date('2026-11-12T17:00:00Z'), address: '12 rue de l\'Exemple, 69002 Lyon',
      now: new Date('2026-11-06T09:50:00Z'),
    });
    expect(text.split('\r\n')).toEqual([
      'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Nidalo//Messages//FR', 'CALSCALE:GREGORIAN', 'BEGIN:VEVENT',
      'UID:e1000000-0000-4000-8000-000000000001@nidalo.fr', 'DTSTAMP:20261106T095000Z', 'DTSTART:20261112T170000Z', 'DTEND:20261112T174500Z',
      'SUMMARY:Visite immobilière', 'LOCATION:12 rue de l\'Exemple\\, 69002 Lyon', 'END:VEVENT', 'END:VCALENDAR', '',
    ]);
  });

  it('contact : le nom et chacun des numéros', () => {
    expect(contactCardFile('Claire Martin', ['06 39 98 12 34']).split('\r\n')).toEqual([
      'BEGIN:VCARD', 'VERSION:3.0', 'FN:Claire Martin', 'N:Claire Martin;;;;', 'TEL;TYPE=CELL:06 39 98 12 34', 'END:VCARD', '',
    ]);
  });

  it('nom de fichier sans caractères refusés, itinéraire dans Plans', () => {
    expect(safeFileName('Claire / Martin: *', 'contact')).toBe('Claire Martin');
    expect(safeFileName('  ', 'contact')).toBe('contact');
    expect(directionsUrl('12 rue de l\'Exemple, Lyon')).toBe('https://maps.apple.com/?daddr=12%20rue%20de%20l\'Exemple%2C%20Lyon');
  });
});
