// Contenu des messages, au format JSON que l'app écrit et lit (MessageContent et MessageAttachment, Codable de Swift :
// ImmoDomain/Messaging/Message.swift et MessageAttachment.swift). Le site lit chaque sorte de message ; il n'écrit
// que du texte et des pièces jointes, comme l'app (CompositeMessagingRepository.send : text, attachments).

import { durationLabel } from './format';

export type AttachmentKind = 'photo' | 'video' | 'document' | 'location' | 'contact' | 'audio' | 'gif';

export const DOCUMENT_CATEGORIES = [
  'energyDiagnostic', 'asbestos', 'lead', 'otherDiagnostic', 'technicalReport', 'floorPlan', 'propertyPhotos',
  'saleMandate', 'rentalMandate', 'saleAgreement', 'rentReceipt', 'incomeProof', 'tenantFile', 'condominium', 'other',
] as const;
export type DocumentCategory = (typeof DOCUMENT_CATEGORIES)[number];

/** Pièce jointe : les clés de MessageAttachment ; les champs absents sont omis, comme l'encodage de Swift. */
export type Attachment = {
  id: string;
  kind: AttachmentKind;
  fileName: string;
  storagePath?: string;
  thumbnailPath?: string;
  byteCount: number;
  durationSeconds?: number;
  category?: DocumentCategory;
  latitude?: number;
  longitude?: number;
  detail?: string;
  contactKey?: string;
  /** Message vocal : niveaux du son, de 0 à 100. */
  waveform?: number[];
  /** GIF : adresses chez le fournisseur (KLIPY), rien n'est copié chez Nidalo. */
  remoteURL?: string;
  previewURL?: string;
  width?: number;
  height?: number;
  provider?: string;
  providerId?: string;
};

export type MessageContent =
  | { kind: 'text'; text: string }
  | { kind: 'image'; storagePath: string }
  | { kind: 'visitProposal' }
  | { kind: 'visitConfirmation' }
  | { kind: 'visitConfirmed'; slot: string; address: string }
  | { kind: 'photos'; count: number }
  | { kind: 'file'; name: string }
  | { kind: 'offer'; offerId: string }
  | { kind: 'attachments'; items: Attachment[]; caption: string | null }
  | { kind: 'system'; text: string }
  | { kind: 'unknown' };

type Json = Record<string, unknown>;

const isObject = (value: unknown): value is Json => typeof value === 'object' && value !== null && !Array.isArray(value);
const text = (value: unknown): string | null => (typeof value === 'string' ? value : null);
const number = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) ? value : null);

const KINDS: readonly AttachmentKind[] = ['photo', 'video', 'document', 'location', 'contact', 'audio', 'gif'];

/** Niveaux d'un vocal : nombres de 0 à 100 ([UInt8] de Swift), ou octets en base64 (Data de Swift). */
function levels(value: unknown): number[] | null {
  let raw: number[] = [];
  if (Array.isArray(value)) raw = value.filter((level): level is number => typeof level === 'number' && Number.isFinite(level));
  else if (typeof value === 'string' && value) {
    try {
      raw = [...atob(value)].map((character) => character.charCodeAt(0));
    } catch {
      raw = [];
    }
  }
  return raw.length ? raw.slice(0, 200).map((level) => Math.min(100, Math.max(0, level))) : null;
}

function attachment(value: unknown): Attachment | null {
  if (!isObject(value)) return null;
  const id = text(value.id);
  const kind = text(value.kind) as AttachmentKind | null;
  const fileName = text(value.fileName);
  if (!id || !kind || !KINDS.includes(kind) || fileName === null) return null;
  const item: Attachment = { id, kind, fileName, byteCount: number(value.byteCount) ?? 0 };
  const storagePath = text(value.storagePath);
  if (storagePath) item.storagePath = storagePath;
  const thumbnailPath = text(value.thumbnailPath);
  if (thumbnailPath) item.thumbnailPath = thumbnailPath;
  const duration = number(value.durationSeconds);
  if (duration !== null) item.durationSeconds = duration;
  const category = text(value.category) as DocumentCategory | null;
  if (category && (DOCUMENT_CATEGORIES as readonly string[]).includes(category)) item.category = category;
  const latitude = number(value.latitude);
  const longitude = number(value.longitude);
  if (latitude !== null) item.latitude = latitude;
  if (longitude !== null) item.longitude = longitude;
  const detail = text(value.detail);
  if (detail !== null) item.detail = detail;
  const contactKey = text(value.contactKey);
  if (contactKey !== null) item.contactKey = contactKey;
  const waveform = levels(value.waveform);
  if (waveform) item.waveform = waveform;
  for (const key of ['remoteURL', 'previewURL', 'provider'] as const) {
    const field = text(value[key]);
    if (field !== null) item[key] = field;
  }
  const providerId = text(value.providerId) ?? (number(value.providerId) !== null ? String(value.providerId) : null);
  if (providerId !== null) item.providerId = providerId;
  const width = number(value.width);
  const height = number(value.height);
  if (width !== null && width > 0) item.width = width;
  if (height !== null && height > 0) item.height = height;
  return item;
}

/** Contenu lu d'une ligne de messages (`{"text":{"_0":"…"}}`, `{"attachments":{"_0":[…],"caption":"…"}}`…). */
export function decodeContent(raw: unknown): MessageContent {
  if (!isObject(raw)) return { kind: 'unknown' };
  const [key] = Object.keys(raw);
  const body = raw[key];
  const payload = isObject(body) ? body : {};
  switch (key) {
    case 'text': return { kind: 'text', text: text(payload._0) ?? '' };
    case 'system': return { kind: 'system', text: text(payload._0) ?? '' };
    case 'offer': {
      const offerId = text(payload.offerId);
      return offerId ? { kind: 'offer', offerId } : { kind: 'unknown' };
    }
    case 'attachments': {
      const items = Array.isArray(payload._0) ? payload._0.map(attachment).filter((item): item is Attachment => item !== null) : [];
      const caption = text(payload.caption);
      return { kind: 'attachments', items, caption };
    }
    case 'image': {
      const image = isObject(payload._0) ? payload._0 : {};
      return { kind: 'image', storagePath: text(image.storagePath) ?? '' };
    }
    case 'visitProposal': return { kind: 'visitProposal' };
    case 'visitConfirmation': return { kind: 'visitConfirmation' };
    case 'visitConfirmed': return { kind: 'visitConfirmed', slot: text(payload.slot) ?? '', address: text(payload.address) ?? '' };
    case 'photos': {
      const urls = Array.isArray(payload._0) ? payload._0.length : 0;
      return { kind: 'photos', count: urls + (number(payload.moreCount) ?? 0) };
    }
    case 'file': return { kind: 'file', name: text(payload.name) ?? '' };
    default: return { kind: 'unknown' };
  }
}

/** JSON d'un texte, tel que l'app l'écrit (cas `text(String)` de MessageContent). */
export function textContent(value: string): Json {
  return { text: { _0: value } };
}

/** JSON de pièces jointes : `caption` est omise quand il n'y a pas de message d'accompagnement. */
export function attachmentsContent(items: Attachment[], caption: string | null): Json {
  const body: Json = { _0: items };
  if (caption !== null) body.caption = caption;
  return { attachments: body };
}

/** Aperçu des pièces jointes dans la liste des conversations (AttachmentPolicy.preview). */
export function attachmentsPreview(items: Attachment[], caption: string | null): string {
  if (caption) return caption;
  const photos = items.filter((item) => item.kind === 'photo').length;
  const videos = items.filter((item) => item.kind === 'video').length;
  if (items.length === 1) {
    const only = items[0];
    switch (only.kind) {
      case 'photo': return '📷 Photo';
      case 'video': return '🎥 Vidéo';
      case 'document': return `📎 ${only.fileName}`;
      case 'location': return '📍 Localisation';
      case 'contact': return `👤 ${only.fileName}`;
      case 'audio': return only.durationSeconds !== undefined ? `🎤 Message vocal (${durationLabel(only.durationSeconds)})` : '🎤 Message vocal';
      case 'gif': return '🎞️ GIF';
    }
  }
  // Aucune pièce lisible (sorte venue d'une version plus récente de l'app) : jamais « 0 photos ».
  if (items.length === 0) return '📎 Pièce jointe';
  if (photos === items.length) return `📷 ${photos} photos`;
  if (videos === items.length) return `🎥 ${videos} vidéos`;
  return `📎 ${items.length} pièces jointes`;
}

/** Texte court d'un message (MessageContent.preview) : bulle, liste des conversations, colonne « preview ». */
export function contentPreview(content: MessageContent): string {
  switch (content.kind) {
    case 'text': return content.text;
    case 'image': return '📷 Photo';
    case 'visitProposal': return '📅 Proposition de visite';
    case 'visitConfirmation':
    case 'visitConfirmed': return '✅ Visite confirmée';
    case 'photos': return content.count > 1 ? `📷 ${content.count} photos` : '📷 Photo';
    case 'file': return content.name;
    case 'offer': return '💶 Offre';
    case 'attachments': return attachmentsPreview(content.items, content.caption);
    case 'system': return content.text;
    case 'unknown': return '';
  }
}

export const isMedia = (item: Attachment) => item.kind === 'photo' || item.kind === 'video';

/** Texte d'une pièce jointe d'une sorte inconnue, comme dans l'app. */
export const UNSUPPORTED_ATTACHMENT = 'Ce contenu n\'est pas pris en charge par cette version de Nidalo.';

/** Adresse d'un GIF que le site affiche : https chez KLIPY seulement (static.klipy.com), sinon `null`. */
export function gifAddress(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password) return null;
    // Le même serveur que la règle de sécurité du site (img-src et media-src de vite.config.ts).
    if (url.hostname !== 'static.klipy.com' || url.port) return null;
    return url.href;
  } catch {
    return null;
  }
}

/** Un GIF en vidéo (mp4, webm) plutôt qu'en image (gif, webp). */
export const isVideoAddress = (address: string) => /\.(mp4|webm)$/i.test(new URL(address).pathname);

/** Proportions d'un GIF (largeur / hauteur) : celles envoyées, bornées comme les photos ; carré sans taille. */
export function gifRatio(item: Pick<Attachment, 'width' | 'height'>): number {
  if (!item.width || !item.height) return 1;
  return Math.min(Math.max(item.width / item.height, 0.75), 320 / 120);
}

/** Barres d'un vocal : `count` hauteurs de 0 à 1, moyennes des niveaux reçus ; barres basses sans niveaux. */
export function voiceBars(waveform: number[] | undefined, count: number): number[] {
  if (!waveform || waveform.length === 0) return Array.from({ length: count }, () => 0.3);
  return Array.from({ length: count }, (_, index) => {
    const start = Math.floor((index * waveform.length) / count);
    const end = Math.max(start + 1, Math.floor(((index + 1) * waveform.length) / count));
    const slice = waveform.slice(start, Math.min(end, waveform.length));
    const average = slice.reduce((sum, level) => sum + level, 0) / Math.max(1, slice.length);
    return Math.min(1, Math.max(0, average / 100));
  });
}

/** Extension en majuscules (« PDF »), vide sans extension (MessageAttachment.fileExtension). */
export function fileExtension(fileName: string): string {
  const dot = fileName.lastIndexOf('.');
  return dot > 0 && dot < fileName.length - 1 ? fileName.slice(dot + 1).toUpperCase() : '';
}

// MARK: - Documents immobiliers (RealEstateDocumentCategory)

export const CATEGORY_LABELS: Record<DocumentCategory, string> = {
  energyDiagnostic: 'DPE',
  asbestos: 'Diagnostic amiante',
  lead: 'Diagnostic plomb',
  otherDiagnostic: 'Autre diagnostic',
  technicalReport: 'Rapport technique',
  floorPlan: 'Plan du logement',
  propertyPhotos: 'Photos du bien',
  saleMandate: 'Mandat de vente',
  rentalMandate: 'Mandat de location',
  saleAgreement: 'Compromis et documents de vente',
  rentReceipt: 'Quittance de loyer',
  incomeProof: 'Justificatif de revenus',
  tenantFile: 'Dossier locataire',
  condominium: 'Copropriété',
  other: 'Autre document',
};

export type DocumentIcon = 'zap' | 'shieldCheck' | 'clipboardCheck' | 'ruler' | 'image' | 'filePenLine' | 'handshake' | 'receipt'
  | 'wallet' | 'folderCheck' | 'building2' | 'fileText' | 'fileSpreadsheet' | 'fileType';

export const CATEGORY_ICONS: Record<DocumentCategory, DocumentIcon> = {
  energyDiagnostic: 'zap',
  asbestos: 'shieldCheck',
  lead: 'shieldCheck',
  otherDiagnostic: 'shieldCheck',
  technicalReport: 'clipboardCheck',
  floorPlan: 'ruler',
  propertyPhotos: 'image',
  saleMandate: 'filePenLine',
  rentalMandate: 'filePenLine',
  saleAgreement: 'handshake',
  rentReceipt: 'receipt',
  incomeProof: 'wallet',
  tenantFile: 'folderCheck',
  condominium: 'building2',
  other: 'fileText',
};

/** Icône d'un document d'après son extension (DocumentLabel.icon, AttachmentBubble.swift). */
export function documentIcon(fileName: string): DocumentIcon {
  const ext = fileExtension(fileName).toLowerCase();
  if (['pdf', 'ppt', 'pptx', 'odp'].includes(ext)) return 'fileText';
  if (['xls', 'xlsx', 'ods', 'csv'].includes(ext)) return 'fileSpreadsheet';
  if (['doc', 'docx', 'odt', 'rtf', 'txt'].includes(ext)) return 'fileType';
  return 'image';
}

/** « DPE · PDF · 1,2 Mo » : catégorie, extension, taille (DocumentLabel.line). */
export function documentLine(item: Attachment, size: (bytes: number) => string): string {
  return [item.category ? CATEGORY_LABELS[item.category] : null, fileExtension(item.fileName) || null, size(item.byteCount)]
    .filter((part): part is string => !!part).join(' · ');
}

// MARK: - Règles d'envoi (AttachmentPolicy)

export const MAX_FILES_PER_MESSAGE = 10;
const MIB = 1024 * 1024;
export const MAX_BYTES: Record<'photo' | 'video' | 'document', number> = { photo: 25 * MIB, video: 200 * MIB, document: 50 * MIB };
export const PHOTO_EXTENSIONS = ['jpg', 'jpeg', 'png', 'heic', 'heif'];
export const VIDEO_EXTENSIONS = ['mov', 'mp4'];
export const DOCUMENT_EXTENSIONS = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'odt', 'ods', 'odp', 'rtf', 'txt', 'csv', ...PHOTO_EXTENSIONS];

/** Extension en minuscules d'un nom de fichier (`pathExtension.lowercased()`). */
export function lowerExtension(fileName: string): string {
  return fileExtension(fileName).toLowerCase();
}

/** Ce qui empêche l'envoi d'un fichier (AttachmentPolicy.issue puis message(for:)), ou `null`. */
export function attachmentIssue(kind: 'photo' | 'video' | 'document', fileName: string, byteCount: number, size: (bytes: number) => string): string | null {
  const ext = lowerExtension(fileName);
  const allowed = kind === 'photo' ? PHOTO_EXTENSIONS : kind === 'video' ? VIDEO_EXTENSIONS : DOCUMENT_EXTENSIONS;
  if (!allowed.includes(ext)) {
    return `Format non accepté (${ext ? ext.toUpperCase() : 'sans extension'}). Envoyez une photo, une vidéo ou un document (PDF, Word, Excel…).`;
  }
  if (byteCount <= 0) return 'Ce fichier est vide.';
  if (byteCount > MAX_BYTES[kind]) return `Fichier trop volumineux : ${size(MAX_BYTES[kind])} au maximum.`;
  return null;
}

export const CONTENT_MISMATCH = 'Le contenu de ce fichier ne correspond pas à son format : il n\'a pas été envoyé.';

/** Les premiers octets correspondent-ils à l'extension ? (AttachmentPolicy.contentMatches) */
export function contentMatches(fileName: string, header: Uint8Array): boolean {
  const ext = lowerExtension(fileName);
  const bytes = header.slice(0, 16);
  const starts = (signature: number[], offset = 0) =>
    bytes.length >= offset + signature.length && signature.every((value, index) => bytes[offset + index] === value);
  const ascii = (value: string) => [...value].map((character) => character.charCodeAt(0));
  if (starts([0x4d, 0x5a]) || starts([0x7f, 0x45, 0x4c, 0x46]) || starts([0x23, 0x21]) || starts([0xcf, 0xfa, 0xed, 0xfe]) || starts([0xca, 0xfe, 0xba, 0xbe])) {
    return false;
  }
  const zip = starts([0x50, 0x4b, 0x03, 0x04]);
  const ole = starts([0xd0, 0xcf, 0x11, 0xe0]);
  const isoMedia = starts(ascii('ftyp'), 4);
  switch (ext) {
    case 'pdf': return starts(ascii('%PDF'));
    case 'jpg': case 'jpeg': return starts([0xff, 0xd8, 0xff]);
    case 'png': return starts([0x89, 0x50, 0x4e, 0x47]);
    case 'heic': case 'heif': case 'mov': case 'mp4': return isoMedia || starts(ascii('moov'), 4) || starts(ascii('wide'), 4);
    case 'docx': case 'xlsx': case 'pptx': case 'odt': case 'ods': case 'odp': return zip;
    case 'doc': case 'xls': case 'ppt': return ole;
    case 'rtf': return starts(ascii('{\\rtf'));
    case 'txt': case 'csv': {
      if (header.includes(0)) return false;
      try {
        new TextDecoder('utf-8', { fatal: true }).decode(header);
        return true;
      } catch {
        return false;
      }
    }
    default: return false;
  }
}

/** Type envoyé au stockage (MessageAttachmentFiles.contentType) ; une photo part toujours en JPEG. */
export function storageContentType(kind: AttachmentKind, ext: string): string {
  if (kind === 'photo') return 'image/jpeg';
  switch (ext) {
    case 'jpg': case 'jpeg': return 'image/jpeg';
    case 'png': return 'image/png';
    case 'heic': return 'image/heic';
    case 'heif': return 'image/heif';
    case 'mov': return 'video/quicktime';
    case 'mp4': case 'm4v': return 'video/mp4';
    case 'pdf': return 'application/pdf';
    case 'doc': return 'application/msword';
    case 'docx': return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    case 'xls': return 'application/vnd.ms-excel';
    case 'xlsx': return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    case 'ppt': return 'application/vnd.ms-powerpoint';
    case 'pptx': return 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
    case 'odt': return 'application/vnd.oasis.opendocument.text';
    case 'ods': return 'application/vnd.oasis.opendocument.spreadsheet';
    case 'odp': return 'application/vnd.oasis.opendocument.presentation';
    case 'rtf': return 'application/rtf';
    case 'csv': return 'text/csv';
    default: return 'text/plain';
  }
}

/** Extension d'une photo d'après son contenu (AttachmentImport.photoItem) : PNG, JPEG, HEIC, sinon JPEG. */
export function photoExtension(header: Uint8Array, isHeic = false): string {
  if (header[0] === 0x89 && header[1] === 0x50) return 'png';
  if (header[0] === 0xff && header[1] === 0xd8) return 'jpg';
  if (header.length > 8 && String.fromCharCode(...header.slice(4, 8)) === 'ftyp') return 'heic';
  return isHeic ? 'heic' : 'jpg';
}
