import { searchNormalized } from '../places';

// Heures, tailles, durées, numéros et recherche de la messagerie, comme l'app : MessageTime
// (Features/Messages/MessagesView.swift:682-728), GroupInfoView.muteLabel (GroupInfoView.swift:519),
// AttachmentPolicy.sizeLabel et durationLabel (ImmoDomain/Messaging/MessageAttachment.swift:136-153),
// PhoneNumber et MessagingDirectory.matchesWords (ImmoDomain/Messaging/MessagingDirectory.swift:74-262).
// Toujours à l'heure de l'appareil, comme l'app.

const capitalized = (text: string) => text.charAt(0).toLocaleUpperCase('fr-FR') + text.slice(1);
const weekdayShort = new Intl.DateTimeFormat('fr-FR', { weekday: 'short' });
const dayMonthWide = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long' });
const dayMonthYearWide = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
const dayMonthShort = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' });
const dayMonthYearShort = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });

const pad = (value: number) => String(value).padStart(2, '0');

function startOfDay(date: Date): number {
  const day = new Date(date.getTime());
  day.setHours(0, 0, 0, 0);
  return day.getTime();
}

/** Jours entre deux dates, de minuit à minuit (les jours de 23 ou 25 heures comptent pour un). */
export function daysBetween(date: Date, now: Date): number {
  return Math.round((startOfDay(now) - startOfDay(date)) / 86_400_000);
}

/** « 10:42 » (MessageTime.clock). */
export function clock(date: Date): string {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/**
 * « 10:42 » aujourd'hui, « Hier », « Mar. » dans la semaine, sinon « 12 juin », et « 12 juin 2025 » pour une autre
 * année (MessageTime.listLabel, n° 220).
 */
export function listLabel(date: Date, now: Date = new Date()): string {
  const days = daysBetween(date, now);
  if (days === 0) return clock(date);
  if (days === 1) return 'Hier';
  if (days < 7) return capitalized(weekdayShort.format(date));
  if (date.getFullYear() !== now.getFullYear()) return dayMonthYearWide.format(date);
  return dayMonthWide.format(date);
}

// MARK: - Page Messages du site (demande de Romain du 14 novembre 2026)

const weekdayDayMonth = new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });

/** Heure d'une conversation de la liste : « 14:10 » aujourd'hui, « Hier », « Mer. » dans la semaine, sinon « 10 nov. ». */
export function rowTimeLabel(date: Date, now: Date = new Date()): string {
  const days = daysBetween(date, now);
  if (days <= 0) return clock(date);
  if (days === 1) return 'Hier';
  if (days < 7) return capitalized(weekdayShort.format(date));
  const text = dayMonthShort.format(date);
  return date.getFullYear() === now.getFullYear() ? text : `${text} ${date.getFullYear()}`;
}

/** Séparateur de date du fil : « Aujourd'hui », « Hier », sinon « Mer. 12 nov. » (l'année si ce n'est pas celle-ci). */
export function daySeparatorLabel(date: Date, now: Date = new Date()): string {
  const days = daysBetween(date, now);
  if (days <= 0) return 'Aujourd\'hui';
  if (days === 1) return 'Hier';
  const text = capitalized(weekdayDayMonth.format(date));
  return date.getFullYear() === now.getFullYear() ? text : `${text} ${date.getFullYear()}`;
}

/**
 * Sous le nom, quand la personne n'est pas en ligne : la dernière fois qu'elle a lu la conversation (son
 * last_read_at, la même lecture que les coches « vu ») : « Vu il y a 5 min », « Vu il y a 2 h », « Vu hier à 18:42 »,
 * puis « Vu le 10 nov. ».
 */
export function lastSeenLabel(date: Date, now: Date = new Date()): string {
  const minutes = Math.floor((now.getTime() - date.getTime()) / 60_000);
  if (minutes < 1) return 'Vu à l\'instant';
  if (minutes < 60) return `Vu il y a ${minutes} min`;
  const days = daysBetween(date, now);
  if (minutes < 24 * 60 && days === 0) return `Vu il y a ${Math.floor(minutes / 60)} h`;
  if (days <= 1) return `Vu hier à ${clock(date)}`;
  const text = dayMonthShort.format(date);
  return `Vu le ${date.getFullYear() === now.getFullYear() ? text : `${text} ${date.getFullYear()}`}`;
}

/**
 * Montants et nombres sans coupure à l'affichage : « 61 800 € », « 1 250 000 € » ou « 24,7 % » gardent leurs
 * espaces insécables. Le texte enregistré ne change pas.
 */
export function keepNumbersTogether(text: string): string {
  return text
    .replace(/(\d)[ \u202F](?=\d{3}(?!\d))/g, '$1\u00A0')
    .replace(/(\d)[ \u202F](?=(?:€|%|m²|k€|M€)(?![\p{L}\d]))/gu, '$1\u00A0');
}

/** « 6 nov. 2026 » : date d'un document dans « Médias et fichiers » (SharedMediaView.subtitle). */
export function shortDateWithYear(date: Date): string {
  return dayMonthYearShort.format(date);
}

/** Sourdine : « Activées », « En sourdine » (toujours) ou « Jusqu'à 6 nov. à 18:30 » (GroupInfoView.muteLabel). */
export function muteLabel(mutedUntil: Date | null, now: Date = new Date()): string {
  if (!mutedUntil || mutedUntil.getTime() <= now.getTime()) return 'Activées';
  if (mutedUntil.getTime() === DISTANT_FUTURE.getTime()) return 'En sourdine';
  return `Jusqu'à ${dayMonthShort.format(mutedUntil)} à ${clock(mutedUntil)}`;
}

/** `Date.distantFuture` de Swift : sourdine « toujours » (MuteOption.always). */
export const DISTANT_FUTURE = new Date(Date.UTC(4001, 0, 1));

const decimal1 = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 });
const decimal2 = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 });
const decimal0 = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });

/** « 1,2 Mo », « 340 Ko » : ByteCountFormatter de l'app (style fichier, 1 000 octets par Ko). */
export function sizeLabel(bytes: number): string {
  const value = Math.max(0, bytes);
  if (value < 1_000_000) return `${decimal0.format(value === 0 ? 0 : Math.max(1, Math.round(value / 1000)))} Ko`;
  if (value < 1_000_000_000) return `${decimal1.format(value / 1_000_000)} Mo`;
  return `${decimal2.format(value / 1_000_000_000)} Go`;
}

/** « 0:42 », « 12:05 » (AttachmentPolicy.durationLabel). */
export function durationLabel(seconds: number): string {
  const total = Math.round(seconds);
  return `${Math.floor(total / 60)}:${pad(total % 60)}`;
}

// MARK: - Numéros de téléphone (PhoneNumber)

const PHONE_CHARACTERS = /^[0-9 .\-+()]*$/;

/** Saisie qui ressemble à un numéro : commence par 0 ou +, chiffres et séparateurs ; 5 chiffres = un code postal. */
export function looksLikePhoneNumber(text: string): boolean {
  const trimmed = text.trim();
  const first = trimmed.charAt(0);
  if ((first !== '0' && first !== '+') || !PHONE_CHARACTERS.test(trimmed)) return false;
  if (/^\d{5}$/.test(trimmed)) return false;
  return trimmed.replace(/\D/g, '').length >= 2;
}

/**
 * Dix chiffres commençant par 0, ou `null` si la saisie n'est pas un numéro français complet (PhoneNumber.normalized).
 * « +33 (0)6 12 34 56 78 » et « 0033 (0)6… » : après l'indicatif, le « 0 » entre parenthèses est retiré (n° 239).
 */
export function normalizedPhoneNumber(text: string): string | null {
  if (!PHONE_CHARACTERS.test(text)) return null;
  let digits = text.replace(/\D/g, '');
  let replaced = true;
  if (digits.startsWith('0033')) digits = `0${digits.slice(4)}`;
  else if (text.trim().startsWith('+33') || (digits.startsWith('33') && digits.length === 11)) digits = `0${digits.slice(2)}`;
  else replaced = false;
  if (replaced && digits.startsWith('00')) digits = digits.slice(1);
  if (digits.length !== 10 || !digits.startsWith('0') || digits.charAt(1) === '0') return null;
  return digits;
}

/** « 06 39 98 12 34 » (PhoneNumber.formatted). */
export function formattedPhoneNumber(normalized: string): string {
  return normalized.match(/.{1,2}/g)?.join(' ') ?? '';
}

/**
 * Saisie mise en forme pendant la frappe, par paires (PhoneNumber.typing), 15 chiffres au plus ; le « 0 » tapé après
 * « +33 » est retiré (n° 239).
 */
export function typingPhoneNumber(text: string): string {
  const digits = text.replace(/\D/g, '').slice(0, 15);
  if (!text.trim().startsWith('+')) return formattedPhoneNumber(digits);
  if (!digits.startsWith('33')) {
    const rest = formattedPhoneNumber(digits.slice(2));
    return `+${digits.slice(0, 2)}${rest ? ` ${rest}` : ''}`;
  }
  let national = digits.slice(2);
  if (national.startsWith('0')) national = national.slice(1);
  const first = national.charAt(0);
  if (!first) return `+${digits}`;
  const rest = formattedPhoneNumber(national.slice(1));
  return `+33 ${first}${rest ? ` ${rest}` : ''}`;
}

/** Chiffres et « + » d'un numéro, pour un lien tel: (`phone.filter { $0.isNumber || $0 == "+" }`). */
export function telHref(phone: string): string {
  return `tel:${phone.replace(/[^\d+]/g, '')}`;
}

// MARK: - Recherche (MessagingDirectory.matchesWords)

/** Mots d'un texte : minuscules sans accents, coupés sur tout ce qui n'est ni lettre ni chiffre. */
export function searchWords(text: string): string[] {
  return searchNormalized(text).split(/[^\p{L}\p{N}]+/u).filter(Boolean);
}

/** Chaque mot saisi commence un mot de l'un des textes : « ap ly » trouve « Appartement · Lyon 2e ». */
export function matchesWords(query: string, texts: string[]): boolean {
  const words = searchWords(query);
  if (!words.length) return false;
  const candidates = texts.flatMap(searchWords);
  return words.every((word) => candidates.some((candidate) => candidate.startsWith(word)));
}
