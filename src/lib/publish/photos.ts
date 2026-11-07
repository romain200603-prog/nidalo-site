// Photos d'annonce prêtes à être envoyées, comme ImmoDomain/Media/ListingPhotoEncoder.swift : JPEG, plus grand côté
// 2048 px au plus, qualité 0,8, et AUCUNE métadonnée. Redessiner l'image dans un canevas ne garde que ses pixels : la
// position GPS de l'EXIF (qui donnerait l'adresse exacte même quand l'annonce la masque), l'appareil et la date
// disparaissent. L'orientation de la photo est appliquée aux pixels.

export const MAX_PHOTO_SIDE = 2048;
export const PHOTO_QUALITY = 0.8;
/** Comme le sélecteur de photos de l'app (20 photos par annonce). */
export const MAX_PHOTOS = 20;

export const UNREADABLE_PHOTO = 'Cette photo n’a pas pu être lue. Choisissez une photo JPEG, PNG ou WebP.';

export type EncodedPhoto = { blob: Blob; width: number; height: number };

/** Taille réduite sans agrandir : le plus grand côté passe à `max` au plus. */
export function fittedSize(width: number, height: number, max = MAX_PHOTO_SIDE): { width: number; height: number } {
  const scale = Math.min(1, max / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

export async function encodePhoto(file: Blob): Promise<EncodedPhoto> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    throw new Error(UNREADABLE_PHOTO);
  }
  try {
    const { width, height } = fittedSize(bitmap.width, bitmap.height);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error(UNREADABLE_PHOTO);
    // Fond blanc sous une image transparente (PNG), comme le JPEG de l'app.
    context.fillStyle = '#FFFFFF';
    context.fillRect(0, 0, width, height);
    context.imageSmoothingQuality = 'high';
    context.drawImage(bitmap, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', PHOTO_QUALITY));
    if (!blob) throw new Error(UNREADABLE_PHOTO);
    return { blob, width, height };
  } finally {
    bitmap.close();
  }
}
