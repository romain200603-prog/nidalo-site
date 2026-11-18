import { supabase } from '../supabase';
import { cleanPhoto, PHOTO_SIDE } from '../cleanPhoto';
import {
  attachmentIssue, CONTENT_MISMATCH, contentMatches, DOCUMENT_EXTENSIONS, lowerExtension, PHOTO_EXTENSIONS, photoExtension,
  storageContentType, type Attachment, type AttachmentKind, type DocumentCategory,
} from './content';
import { sizeLabel } from './format';

// Fichiers des pièces jointes, comme l'app : préparation avant envoi (Features/Messages/Attachments/AttachmentImport.swift,
// Data/LocalAttachmentStorage.swift) puis envoi dans le bucket privé message-attachments, au chemin
// « <conversation en minuscules>/<UUID>.<ext> » (Data/Supabase/MessageAttachmentFiles.swift). Les fichiers reçus
// se lisent par URL signée de 10 minutes, demandée pour chaque fichier, comme l'app.

export const ATTACHMENT_BUCKET = 'message-attachments';
/** Qualité JPEG de la vignette d'une vidéo (0,8, 800 px au plus) ; les photos suivent cleanPhoto.ts. */
const THUMBNAIL_QUALITY = 0.8;
const THUMBNAIL_SIDE = 800;
export const UPLOAD_FAILURE = 'La pièce jointe n\'a pas pu être envoyée. Vérifiez votre connexion et réessayez.';
export const UNREADABLE = 'Ce fichier n\'a pas pu être lu.';

/** Élément choisi, en attente d'envoi (PendingAttachment). */
export type PendingFile = {
  id: string;
  kind: 'photo' | 'video' | 'document';
  /** Nom affiché : « Photo.png », « Vidéo.mp4 », ou le nom du document. */
  fileName: string;
  file: File;
  byteCount: number;
  category: DocumentCategory | null;
  /** Aperçu local (photo, vignette de vidéo), adresse blob: libérée à la fin. */
  previewUrl: string | null;
  durationSeconds: number | null;
  error: string | null;
};

const newId = () => crypto.randomUUID().toUpperCase();

async function header(file: Blob, length = 64): Promise<Uint8Array> {
  return new Uint8Array(await file.slice(0, length).arrayBuffer());
}

/** Photo ou vidéo choisie sur l'ordinateur (« Photos et vidéos ») ; le nom vient du contenu, comme l'app. */
export async function pendingMedia(file: File): Promise<PendingFile> {
  const isVideo = file.type.startsWith('video/') || ['mov', 'mp4', 'm4v'].includes(lowerExtension(file.name));
  if (isVideo) {
    const ext = lowerExtension(file.name) || 'mp4';
    const item: PendingFile = {
      id: newId(), kind: 'video', fileName: `Vidéo.${ext}`, file, byteCount: file.size, category: null, previewUrl: null,
      durationSeconds: null, error: null,
    };
    const frame = await videoFrame(file);
    if (frame) {
      item.previewUrl = URL.createObjectURL(frame.thumbnail);
      item.durationSeconds = frame.duration;
    }
    item.error = attachmentIssue('video', item.fileName, item.byteCount, sizeLabel);
    return item;
  }
  const ext = photoExtension(await header(file, 16), /heic|heif/i.test(file.type));
  const item: PendingFile = {
    id: newId(), kind: 'photo', fileName: `Photo.${ext}`, file, byteCount: file.size, category: null, previewUrl: URL.createObjectURL(file),
    durationSeconds: null, error: null,
  };
  item.error = attachmentIssue('photo', item.fileName, item.byteCount, sizeLabel);
  return item;
}

/** Document choisi (« Documents », « Documents immobiliers ») : son nom et son contenu d'origine. */
export function pendingDocument(file: File, category: DocumentCategory | null): PendingFile {
  return {
    id: newId(), kind: 'document', fileName: file.name, file, byteCount: file.size, category, previewUrl: null,
    durationSeconds: null, error: attachmentIssue('document', file.name, file.size, sizeLabel),
  };
}

export function releasePending(items: PendingFile[]) {
  for (const item of items) if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
}

/** Types proposés par le sélecteur de fichiers (la liste blanche de l'app). */
export const DOCUMENT_ACCEPT = DOCUMENT_EXTENSIONS.map((ext) => `.${ext}`).join(',');
export const MEDIA_ACCEPT = 'image/jpeg,image/png,image/heic,image/heif,video/mp4,video/quicktime,.jpg,.jpeg,.png,.heic,.heif,.mp4,.mov';

// MARK: - Préparation

async function canvasBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
  if (!blob) throw new Error(UNREADABLE);
  return blob;
}

/** Dimensions réduites : le plus grand côté ramené à `max`, arrondies (LocalAttachmentStorage.reduced). */
export function reducedSize(width: number, height: number, max: number): { width: number; height: number } {
  const side = Math.max(width, height);
  if (side <= max) return { width, height };
  const scale = max / side;
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

/** Photo réduite à 2 048 px et réencodée en JPEG 0,82, sans métadonnées (ni lieu, ni date, ni appareil). */
export async function photoJpeg(file: Blob): Promise<Blob> {
  const photo = await cleanPhoto(file, PHOTO_SIDE);
  if (!photo) throw new Error(UNREADABLE);
  return photo.blob;
}

/** Nom d'un document en image une fois réencodé en JPEG : « Plan.png » devient « Plan.jpg ». */
export function jpegFileName(fileName: string): string {
  if (/\.jpe?g$/i.test(fileName)) return fileName;
  const base = fileName.replace(/\.[^.]*$/, '');
  return `${base || 'Photo'}.jpg`;
}

/** Première image et durée d'une vidéo (vignette de 800 px au plus, JPEG 0,8) ; `null` si le navigateur ne la lit pas. */
export async function videoFrame(file: Blob): Promise<{ thumbnail: Blob; duration: number | null } | null> {
  const url = URL.createObjectURL(file);
  const video = document.createElement('video');
  video.muted = true;
  video.preload = 'auto';
  video.playsInline = true;
  try {
    await new Promise<void>((resolve, reject) => {
      const timer = window.setTimeout(() => reject(new Error('timeout')), 8000);
      video.onloadeddata = () => { window.clearTimeout(timer); resolve(); };
      video.onerror = () => { window.clearTimeout(timer); reject(new Error('unreadable')); };
      video.src = url;
    });
    if (video.currentTime !== 0) {
      await new Promise<void>((resolve) => { video.onseeked = () => resolve(); video.currentTime = 0; });
    }
    const size = reducedSize(video.videoWidth, video.videoHeight, THUMBNAIL_SIDE);
    if (!size.width || !size.height) return null;
    const canvas = document.createElement('canvas');
    canvas.width = size.width;
    canvas.height = size.height;
    const context = canvas.getContext('2d');
    if (!context) return null;
    context.drawImage(video, 0, 0, size.width, size.height);
    const thumbnail = await canvasBlob(canvas, THUMBNAIL_QUALITY);
    return { thumbnail, duration: Number.isFinite(video.duration) ? video.duration : null };
  } catch {
    return null;
  } finally {
    video.removeAttribute('src');
    video.load();
    URL.revokeObjectURL(url);
  }
}

const BOX_NAMES_REMOVED = new Set(['udta', 'meta']);
const BOX_CONTAINERS = new Set(['moov', 'trak', 'mdia', 'minf']);
/** En-têtes qui portent une date de création et de modification (vidéo, piste, média). */
const BOX_DATES = new Set(['mvhd', 'tkhd', 'mdhd']);
/** Boîte « uuid » des métadonnées XMP (Adobe), qui peut contenir un lieu. */
const XMP_UUID = [0xbe, 0x7a, 0xcf, 0xcb, 0x97, 0xa9, 0x42, 0xe8, 0x9c, 0x71, 0x99, 0x94, 0x91, 0xe3, 0xaf, 0xac];

/**
 * Vidéo sans ses métadonnées de lieu, de date ni d'appareil (MessageAttachmentFiles.videoWithoutMetadata) : les boîtes
 * « udta » et « meta » (lieu, appareil, logiciel) et la boîte XMP deviennent des boîtes « free », que tous les lecteurs
 * ignorent, et leur contenu est effacé (remplacé par des zéros : changer seulement le nom laisserait le lieu lisible
 * dans le fichier) ; les dates de création et de modification des en-têtes sont remises à zéro. La taille du fichier
 * ne change pas, les images et le son restent identiques, sans recompression (un navigateur ne sait pas réencoder une
 * vidéo proprement).
 */
export function videoWithoutMetadata(buffer: ArrayBuffer): ArrayBuffer {
  const copy = buffer.slice(0);
  const view = new DataView(copy);
  const walk = (start: number, end: number) => {
    let offset = start;
    while (offset + 8 <= end) {
      let size = view.getUint32(offset);
      let headerSize = 8;
      if (size === 1) {
        if (offset + 16 > end) return;
        const high = view.getUint32(offset + 8);
        const low = view.getUint32(offset + 12);
        size = high * 2 ** 32 + low;
        headerSize = 16;
      } else if (size === 0) {
        size = end - offset;
      }
      if (size < headerSize || offset + size > end) return;
      const type = String.fromCharCode(view.getUint8(offset + 4), view.getUint8(offset + 5), view.getUint8(offset + 6), view.getUint8(offset + 7));
      const isXmp = type === 'uuid' && offset + headerSize + 16 <= offset + size
        && XMP_UUID.every((byte, index) => view.getUint8(offset + headerSize + index) === byte);
      if (BOX_NAMES_REMOVED.has(type) || isXmp) {
        [0x66, 0x72, 0x65, 0x65].forEach((byte, index) => view.setUint8(offset + 4 + index, byte));
        new Uint8Array(copy, offset + headerSize, size - headerSize).fill(0);
      } else if (BOX_CONTAINERS.has(type)) {
        walk(offset + headerSize, offset + size);
      } else if (BOX_DATES.has(type)) {
        // Après la version (1 octet) et les options (3 octets) : création puis modification, 4 octets chacune en
        // version 0, 8 en version 1.
        const body = offset + headerSize;
        const length = view.getUint8(body) === 1 ? 16 : 8;
        if (body + 4 + length <= offset + size) {
          for (let index = 0; index < length; index += 1) view.setUint8(body + 4 + index, 0);
        }
      }
      offset += size;
    }
  };
  walk(0, copy.byteLength);
  return copy;
}

// MARK: - Envoi

/** Chemin d'un fichier envoyé : « <conversation en minuscules>/<UUID>.<ext> » (uploadFile). */
export function storagePath(conversationId: string, name: string): string {
  return `${conversationId.toLowerCase()}/${name}`;
}

/**
 * Envoi d'un fichier ; « déjà envoyé » (409, envoi rejoué) est un succès, comme dans l'app (put). supabase-js envoie
 * un Blob en multipart avec le type du Blob (pas `contentType`) : le fichier part donc avec le type de l'app, comme
 * le formulaire multipart du SDK Swift.
 */
async function put(path: string, data: Blob, contentType: string): Promise<void> {
  const body = data.type === contentType ? data : new Blob([data], { type: contentType });
  const { error } = await supabase.storage.from(ATTACHMENT_BUCKET).upload(path, body, { cacheControl: '3600', contentType });
  if (!error) return;
  const { statusCode, error: code } = error as unknown as { statusCode?: string | number; error?: string };
  if (String(statusCode) === '409' || code === 'Duplicate') return;
  throw new Error(UPLOAD_FAILURE);
}

/**
 * Prépare et envoie un élément, puis rend sa pièce jointe telle que l'app l'écrit (LocalAttachmentStorage.store, puis
 * MessageAttachmentFiles.upload) : photo en JPEG, vidéo sans métadonnées et sa vignette, document en image réencodé en
 * JPEG comme une photo (sans lieu ni EXIF), autre document tel quel.
 */
export async function uploadPending(item: PendingFile, conversationId: string): Promise<Attachment> {
  const issue = attachmentIssue(item.kind, item.fileName, item.file.size, sizeLabel);
  if (issue) throw new Error(issue);
  const ext = lowerExtension(item.fileName);
  if (!contentMatches(item.fileName, await header(item.file))) throw new Error(CONTENT_MISMATCH);
  const category = item.category ? { category: item.category } : {};
  if (item.kind === 'photo') {
    const jpeg = await photoJpeg(item.file);
    const path = storagePath(conversationId, `${newId()}.jpg`);
    await put(path, jpeg, 'image/jpeg');
    return { id: item.id, kind: 'photo', fileName: item.fileName, storagePath: path, byteCount: jpeg.size, ...category };
  }
  if (item.kind === 'video') {
    const data = new Blob([videoWithoutMetadata(await item.file.arrayBuffer())]);
    const path = storagePath(conversationId, `${newId()}.${ext}`);
    await put(path, data, storageContentType('video', ext));
    const attachment: Attachment = { id: item.id, kind: 'video', fileName: item.fileName, storagePath: path, byteCount: item.file.size };
    const frame = await videoFrame(item.file);
    if (frame) {
      const thumbnailPath = storagePath(conversationId, `${newId()}.jpg`);
      await put(thumbnailPath, frame.thumbnail, 'image/jpeg');
      attachment.thumbnailPath = thumbnailPath;
      if (frame.duration !== null) attachment.durationSeconds = frame.duration;
    }
    return { ...attachment, ...category };
  }
  if (PHOTO_EXTENSIONS.includes(ext)) {
    const jpeg = await photoJpeg(item.file);
    const path = storagePath(conversationId, `${newId()}.jpg`);
    await put(path, jpeg, 'image/jpeg');
    return { id: item.id, kind: 'document', fileName: jpegFileName(item.fileName), storagePath: path, byteCount: jpeg.size, ...category };
  }
  const path = storagePath(conversationId, `${newId()}.${ext}`);
  await put(path, item.file, storageContentType('document', ext));
  return { id: item.id, kind: 'document', fileName: item.fileName, storagePath: path, byteCount: item.file.size, ...category };
}

// MARK: - Transfert

/** « Photo.heic » → « Photo.jpg » (MessageAttachmentFiles.renamed). */
export function renamedFile(name: string, ext: string): string {
  const base = name.replace(/\.[^.]*$/, '');
  return `${base || name}.${ext}`;
}

/**
 * Un fichier d'une conversation recopié dans le dossier d'une autre, sous le même nom (uploadFile de l'app après le
 * téléchargement de l'original) : une photo, ou une image jointe comme document, repart en JPEG sans métadonnées ;
 * une vidéo sans lieu ni appareil ; le reste tel quel. Rend le chemin sur le serveur.
 */
async function copyFile(path: string, kind: AttachmentKind, conversationId: string): Promise<string> {
  const url = await signedUrl(path);
  const response = url ? await fetch(url).catch(() => null) : null;
  if (!response?.ok) throw new Error(UPLOAD_FAILURE);
  const source = await response.blob();
  const original = path.split('/').pop() || `${newId()}`;
  const ext = lowerExtension(original);
  if (kind === 'photo' || (kind === 'document' && PHOTO_EXTENSIONS.includes(ext))) {
    const target = storagePath(conversationId, renamedFile(original, 'jpg'));
    await put(target, await photoJpeg(source), 'image/jpeg');
    return target;
  }
  const target = storagePath(conversationId, original);
  if (kind === 'video') {
    await put(target, new Blob([videoWithoutMetadata(await source.arrayBuffer())]), storageContentType('video', ext));
    return target;
  }
  await put(target, source, storageContentType(kind, ext));
  return target;
}

/**
 * Pièces jointes d'un message transféré, recopiées dans le dossier de la conversation d'arrivée par le même envoi
 * (SupabaseMessagingRepository.send puis MessageAttachmentFiles.upload) : le fichier et sa vignette ; un document en
 * image renommé en « .jpg ». Un GIF, un lieu ou un contact n'a pas de fichier et part tel quel.
 */
export async function copyAttachments(items: Attachment[], conversationId: string): Promise<Attachment[]> {
  const copied: Attachment[] = [];
  for (const item of items) {
    const next: Attachment = { ...item };
    if (item.storagePath) {
      next.storagePath = await copyFile(item.storagePath, item.kind, conversationId);
      const ext = lowerExtension(next.storagePath);
      if (item.kind === 'document' && ext !== lowerExtension(item.fileName)) next.fileName = renamedFile(item.fileName, ext);
    }
    if (item.thumbnailPath) next.thumbnailPath = await copyFile(item.thumbnailPath, 'photo', conversationId);
    copied.push(next);
  }
  return copied;
}

// MARK: - Lecture (URL signées)

const SIGNED_SECONDS = 600;
/** Une URL signée est réutilisée pendant 8 minutes sur ses 10 de validité. */
const REUSE_MS = 8 * 60_000;
const signed = new Map<string, { url: string; at: number } | Promise<string | null>>();

/** Adresse signée d'un fichier du bucket (createSignedUrl, 600 s), gardée en mémoire ; `null` si indisponible. */
export function signedUrl(path: string): Promise<string | null> {
  const cached = signed.get(path);
  if (cached instanceof Promise) return cached;
  if (cached && Date.now() - cached.at < REUSE_MS) return Promise.resolve(cached.url);
  const request = (async () => {
    try {
      const { data, error } = await supabase.storage.from(ATTACHMENT_BUCKET).createSignedUrl(path, SIGNED_SECONDS);
      if (error || !data?.signedUrl) {
        signed.delete(path);
        return null;
      }
      signed.set(path, { url: data.signedUrl, at: Date.now() });
      return data.signedUrl;
    } catch {
      signed.delete(path);
      return null;
    }
  })();
  signed.set(path, request);
  return request;
}

/** URL signée déjà connue et encore valable (pour un lien), sinon `null`. */
export function knownSignedUrl(path: string): string | null {
  const cached = signed.get(path);
  return cached && !(cached instanceof Promise) && Date.now() - cached.at < REUSE_MS ? cached.url : null;
}
