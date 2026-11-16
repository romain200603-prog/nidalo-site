// Photos d'annonce prêtes à être envoyées, comme ImmoDomain/Media/ListingPhotoEncoder.swift : JPEG, plus grand côté
// 2048 px au plus, et AUCUNE métadonnée (préparation commune de cleanPhoto.ts). Redessiner l'image dans un canevas ne
// garde que ses pixels : la position GPS de l'EXIF (qui donnerait l'adresse exacte même quand l'annonce la masque),
// l'appareil et la date disparaissent. L'orientation de la photo est appliquée aux pixels.

import { cleanPhoto, PHOTO_SIDE, type CleanPhoto } from '../cleanPhoto';

/** Comme le sélecteur de photos de l'app (20 photos par annonce). */
export const MAX_PHOTOS = 20;

export const UNREADABLE_PHOTO = 'Cette photo n’a pas pu être lue. Choisissez une photo JPEG, PNG ou WebP.';

export type EncodedPhoto = CleanPhoto;

export async function encodePhoto(file: Blob): Promise<EncodedPhoto> {
  const photo = await cleanPhoto(file, PHOTO_SIDE);
  if (!photo) throw new Error(UNREADABLE_PHOTO);
  return photo;
}
