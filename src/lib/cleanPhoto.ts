// Préparation commune de toutes les photos que le site envoie vers Supabase Storage : photos d'annonce, photos et
// documents en image des messages, photo de profil, logo d'agence. Comme dans l'app, l'image est redessinée dans un
// canevas, dans le bon sens (l'orientation de l'EXIF est appliquée aux pixels), sur fond blanc, puis encodée en JPEG.
// Le canevas ne garde que les pixels : la position GPS (qui donnerait l'adresse exacte même quand l'annonce la masque),
// la date, l'appareil et tout le reste de l'EXIF disparaissent. Les octets d'origine ne partent jamais.

/** Plus grand côté d'une photo d'annonce ou de message. */
export const PHOTO_SIDE = 2048;
/** Plus grand côté d'une photo de profil ou d'un logo d'agence. */
export const AVATAR_SIDE = 512;
/** Qualité JPEG de toutes les photos envoyées. */
export const JPEG_QUALITY = 0.82;

export type CleanPhoto = { blob: Blob; width: number; height: number };

/** Taille réduite sans agrandir : le plus grand côté passe à `max` au plus, jamais moins de 1 px. */
export function fittedSize(width: number, height: number, max: number): { width: number; height: number } {
  const scale = Math.min(1, max / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/**
 * Photo réencodée en JPEG, sans aucune métadonnée, son plus grand côté ramené à `maxSide` ; `null` si le navigateur
 * ne sait pas la lire (par exemple une photo HEIC ailleurs que dans Safari) : rien n'est alors envoyé.
 */
export async function cleanPhoto(file: Blob, maxSide: number): Promise<CleanPhoto | null> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    return null;
  }
  try {
    const { width, height } = fittedSize(bitmap.width, bitmap.height, maxSide);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) return null;
    // Fond blanc sous une image transparente (PNG), comme le JPEG de l'app.
    context.fillStyle = '#FFFFFF';
    context.fillRect(0, 0, width, height);
    context.imageSmoothingQuality = 'high';
    context.drawImage(bitmap, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY));
    return blob ? { blob, width, height } : null;
  } finally {
    bitmap.close();
  }
}
