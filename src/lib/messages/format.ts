import { searchNormalized } from '../places';

// Heures, tailles, durées, numéros et recherche de la messagerie, comme l'app : MessageTime
// (Features/Messages/MessagesView.swift:682-728), GroupInfoView.muteLabel (GroupInfoView.swift:519),
// AttachmentPolicy.sizeLabel et durationLabel (ImmoDomain/Messaging/MessageAttachment.swift:136-153),
// PhoneNumber et MessagingDirectory.matchesWords (ImmoDomain/Messaging/MessagingDirectory.swift:74-262).
// Toujours à l'heure de l'appareil, comme l'app.

const capitalized = (text: string) => text.charAt(0).toLocaleUpperCase('fr-FR') + text.slice(1);
const weekdayShort = new Intl.DateTimeFormat('fr-FR', { weekday: 'short' });
const dayMonthWide = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long' });
const dayWide = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
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

/** « 10:42 » aujourd'hui, « Hier », « Mar. » dans la semaine, sinon « 12 juin » (MessageTime.listLabel). */
export function listLabel(date: Date, now: Date = new Date()): string {
  const days = daysBetween(date, now);
  if (days === 0) return clock(date);
  if (days === 1) return 'Hier';
  if (days < 7) return capitalized(weekdayShort.format(date));
  return dayMonthWide.format(date);
}

/** « Aujourd'hui », « Hier » ou « Lundi 28 septembre » (MessageTime.dayLabel). */
export function dayLabel(date: Date, now: Date = new Date()): string {
  const days = daysBetween(date, now);
  if (days === 0) return 'Aujourd\'hui';
  if (days === 1) return 'Hier';
  return capitalized(dayWide.format(date));
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

/** Dix chiffres commençant par 0, ou `null` si la saisie n'est pas un numéro français complet (PhoneNumber.normalized). */
export function normalizedPhoneNumber(text: string): string | null {
  if (!PHONE_CHARACTERS.test(text)) return null;
  let digits = text.replace(/\D/g, '');
  if (digits.startsWith('0033')) digits = `0${digits.slice(4)}`;
  else if (text.trim().startsWith('+33') || (digits.startsWith('33') && digits.length === 11)) digits = `0${digits.slice(2)}`;
  if (digits.length !== 10 || !digits.startsWith('0') || digits.charAt(1) === '0') return null;
  return digits;
}

/** « 06 39 98 12 34 » (PhoneNumber.formatted). */
export function formattedPhoneNumber(normalized: string): string {
  return normalized.match(/.{1,2}/g)?.join(' ') ?? '';
}

/** Saisie mise en forme pendant la frappe, par paires (PhoneNumber.typing), 15 chiffres au plus. */
export function typingPhoneNumber(text: string): string {
  const digits = text.replace(/\D/g, '').slice(0, 15);
  if (!text.trim().startsWith('+')) return formattedPhoneNumber(digits);
  if (!digits.startsWith('33')) {
    const rest = formattedPhoneNumber(digits.slice(2));
    return `+${digits.slice(0, 2)}${rest ? ` ${rest}` : ''}`;
  }
  const national = digits.slice(2);
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
