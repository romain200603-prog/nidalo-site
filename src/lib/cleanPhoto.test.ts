import { afterEach, describe, expect, it, vi } from 'vitest';
import { AVATAR_SIDE, cleanPhoto, fittedSize, JPEG_QUALITY, PHOTO_SIDE } from './cleanPhoto';

// Le navigateur est simulé : on vérifie ce que la préparation lui demande (sens de la photo, taille, fond blanc,
// JPEG 0,82). Le vrai réencodage, sans EXIF ni GPS, est vérifié dans Chromium (scripts de l'audit du 16 novembre).
function fakeBrowser(width: number, height: number, { unreadable = false, noBlob = false } = {}) {
  const steps: unknown[][] = [];
  const bitmap = { width, height, close: vi.fn() };
  const createImageBitmap = vi.fn(async (...args: unknown[]) => {
    steps.push(['bitmap', ...args]);
    if (unreadable) throw new Error('format inconnu');
    return bitmap;
  });
  const context = {
    fillStyle: '',
    imageSmoothingQuality: '',
    fillRect: (...args: unknown[]) => steps.push(['fill', context.fillStyle, ...args]),
    drawImage: (...args: unknown[]) => steps.push(['draw', ...args.slice(1)]),
  };
  const canvas = {
    width: 0,
    height: 0,
    getContext: () => context,
    toBlob: (done: (blob: Blob | null) => void, type: string, quality: number) => {
      steps.push(['toBlob', type, quality]);
      done(noBlob ? null : new Blob(['jpeg'], { type }));
    },
  };
  const createElement = vi.fn(() => canvas);
  vi.stubGlobal('createImageBitmap', createImageBitmap);
  vi.stubGlobal('document', { createElement });
  return { steps, bitmap, canvas, context, createElement };
}

describe('Préparation commune des photos envoyées (cleanPhoto)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('photo d’annonce ou de message : dans le bon sens, 2 048 px au plus, fond blanc, JPEG 0,82', async () => {
    const browser = fakeBrowser(4000, 3000);
    const file = new Blob(['photo'], { type: 'image/jpeg' });
    const photo = await cleanPhoto(file, PHOTO_SIDE);
    expect(photo).not.toBeNull();
    expect([photo?.width, photo?.height]).toEqual([2048, 1536]);
    expect(photo?.blob.type).toBe('image/jpeg');
    expect(browser.steps).toEqual([
      ['bitmap', file, { imageOrientation: 'from-image' }],
      ['fill', '#FFFFFF', 0, 0, 2048, 1536],
      ['draw', 0, 0, 2048, 1536],
      ['toBlob', 'image/jpeg', 0.82],
    ]);
    expect([browser.canvas.width, browser.canvas.height]).toEqual([2048, 1536]);
    expect(browser.context.imageSmoothingQuality).toBe('high');
    expect(browser.bitmap.close).toHaveBeenCalledOnce();
    expect(JPEG_QUALITY).toBe(0.82);
  });

  it('photo de profil et logo : 512 px au plus ; une petite image n’est jamais agrandie', async () => {
    fakeBrowser(3000, 4000);
    const avatar = await cleanPhoto(new Blob(['a']), AVATAR_SIDE);
    expect([avatar?.width, avatar?.height]).toEqual([384, 512]);
    fakeBrowser(300, 200);
    const small = await cleanPhoto(new Blob(['b']), AVATAR_SIDE);
    expect([small?.width, small?.height]).toEqual([300, 200]);
  });

  it('image illisible (HEIC hors Safari) : rien à envoyer, aucun canevas', async () => {
    const browser = fakeBrowser(100, 100, { unreadable: true });
    expect(await cleanPhoto(new Blob(['heic']), PHOTO_SIDE)).toBeNull();
    expect(browser.createElement).not.toHaveBeenCalled();
  });

  it('encodage refusé par le navigateur : rien à envoyer, image libérée', async () => {
    const browser = fakeBrowser(100, 100, { noBlob: true });
    expect(await cleanPhoto(new Blob(['x']), PHOTO_SIDE)).toBeNull();
    expect(browser.bitmap.close).toHaveBeenCalledOnce();
  });

  it('taille réduite : jamais 0 px, même pour une image très allongée', () => {
    expect(fittedSize(10000, 1, PHOTO_SIDE)).toEqual({ width: 2048, height: 1 });
    expect(fittedSize(2048, 2048, PHOTO_SIDE)).toEqual({ width: 2048, height: 2048 });
    expect(fittedSize(1024, 4096, AVATAR_SIDE)).toEqual({ width: 128, height: 512 });
  });
});
