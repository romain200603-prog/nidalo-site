import { describe, expect, it } from 'vitest';
import { attachmentsPreview, contentPreview, decodeContent, gifAddress, gifRatio, isVideoAddress, voiceBars, type Attachment } from './content';

// Messages vocaux et GIF envoyés par l'app (MessageAttachment .audio et .gif, Codable de Swift).

const GIF_URL = 'https://static.klipy.com/ii/935d7ab9d8c6202580a668421940ec81/14/af/V6da8Awi.mp4';
const STILL_URL = 'https://static.klipy.com/ii/935d7ab9d8c6202580a668421940ec81/14/af/uvntdY4w.jpg';

const voice = {
  id: '6F1C2E3F-4B5D-4E6F-8A9B-0C1D2E3F4A01', kind: 'audio', fileName: 'Message vocal',
  storagePath: '8C1D2E3F-4B5D-4E6F-8A9B-0C1D2E3F4A00/6F1C2E3F-4B5D-4E6F-8A9B-0C1D2E3F4A01.m4a', byteCount: 48200, durationSeconds: 12.4,
  waveform: [0, 12, 40, 100, 140, -5, 63],
};
const gif = {
  id: '6F1C2E3F-4B5D-4E6F-8A9B-0C1D2E3F4A02', kind: 'gif', fileName: 'Hello Hi', byteCount: 0,
  remoteURL: GIF_URL, previewURL: STILL_URL, width: 498, height: 498, provider: 'klipy', providerId: 'hello-hi-662',
};
const items = (raw: unknown): Attachment[] => {
  const content = decodeContent({ attachments: { _0: [raw] } });
  return content.kind === 'attachments' ? content.items : [];
};

describe('messages vocaux et GIF', () => {
  it('lit un message vocal : chemin, durée et niveaux bornés de 0 à 100', () => {
    expect(items(voice)).toEqual([{
      id: voice.id, kind: 'audio', fileName: 'Message vocal', storagePath: voice.storagePath, byteCount: 48200, durationSeconds: 12.4,
      waveform: [0, 12, 40, 100, 100, 0, 63],
    }]);
  });

  it('lit des niveaux en base64 (Data de Swift)', () => {
    expect(items({ ...voice, waveform: btoa(String.fromCharCode(0, 50, 100)) })[0].waveform).toEqual([0, 50, 100]);
    expect(items({ ...voice, waveform: 'pas du base64 !' })[0].waveform).toBeUndefined();
    expect(items({ ...voice, waveform: [] })[0].waveform).toBeUndefined();
  });

  it('lit un GIF : adresses chez KLIPY, taille, fournisseur et identifiant', () => {
    expect(items(gif)).toEqual([gif]);
    expect(items({ ...gif, providerId: 42 })[0].providerId).toBe('42');
    expect(items({ ...gif, width: 0, height: -3 })[0]).not.toHaveProperty('width');
  });

  it('aperçus de la liste des conversations, comme l\'app', () => {
    expect(attachmentsPreview(items(voice), null)).toBe('🎤 Message vocal (0:12)');
    expect(attachmentsPreview(items({ ...voice, durationSeconds: 75.6 }), null)).toBe('🎤 Message vocal (1:16)');
    expect(attachmentsPreview(items({ ...voice, durationSeconds: undefined }), null)).toBe('🎤 Message vocal');
    expect(contentPreview(decodeContent({ attachments: { _0: [gif] } }))).toBe('🎞️ GIF');
  });

  it('une sorte inconnue ne donne jamais « 0 photos »', () => {
    const content = decodeContent({ attachments: { _0: [{ ...gif, kind: 'sticker' }] } });
    expect(content).toEqual({ kind: 'attachments', items: [], caption: null });
    expect(contentPreview(content)).toBe('📎 Pièce jointe');
  });

  it('n\'affiche que des GIF en https chez KLIPY', () => {
    expect(gifAddress(GIF_URL)).toBe(GIF_URL);
    for (const refused of [
      'https://klipy.com/a.gif', 'https://media.klipy.com/a.gif', 'https://static.klipy.com:8443/a.gif', 'http://static.klipy.com/a.gif', 'https://static.klipy.com.exemple.fr/a.gif', 'https://exemple.fr/static.klipy.com/a.gif',
      'https://moi:secret@static.klipy.com/a.gif', 'javascript:alert(1)', 'data:image/gif;base64,R0lGOD', 'pas une adresse', '', undefined,
    ]) expect(gifAddress(refused)).toBeNull();
  });

  it('reconnaît un GIF en vidéo', () => {
    expect(isVideoAddress(GIF_URL)).toBe(true);
    expect(isVideoAddress('https://static.klipy.com/a.webm?v=2')).toBe(true);
    expect(isVideoAddress(STILL_URL)).toBe(false);
    expect(isVideoAddress('https://static.klipy.com/a.webp')).toBe(false);
  });

  it('proportions d\'un GIF : celles envoyées, bornées comme les photos', () => {
    expect(gifRatio({ width: 498, height: 498 })).toBe(1);
    expect(gifRatio({ width: 480, height: 270 })).toBeCloseTo(16 / 9);
    expect(gifRatio({ width: 1000, height: 100 })).toBeCloseTo(320 / 120);
    expect(gifRatio({ width: 100, height: 1000 })).toBe(0.75);
    expect(gifRatio({})).toBe(1);
  });

  it('barres d\'un vocal : le bon nombre, de 0 à 1', () => {
    const levels = Array.from({ length: 48 }, (_, index) => (index * 7) % 101);
    const bars = voiceBars(levels, 28);
    expect(bars).toHaveLength(28);
    expect(bars.every((bar) => bar >= 0 && bar <= 1)).toBe(true);
    expect(voiceBars([100, 0], 4)).toEqual([1, 1, 0, 0]);
    expect(voiceBars(undefined, 3)).toEqual([0.3, 0.3, 0.3]);
  });
});
