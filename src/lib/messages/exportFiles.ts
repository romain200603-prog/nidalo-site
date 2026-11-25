// Fichiers que le site donne à enregistrer, à la place des actions de l'iPhone : une visite pour l'agenda (.ics,
// VisitActions.addToCalendar de l'app : « Visite immobilière », l'adresse, 45 minutes) et une fiche de contact
// (.vcf, « Ajouter aux contacts »). Le navigateur les ouvre avec l'agenda ou le carnet d'adresses de l'appareil.

/** Durée d'une visite ajoutée à l'agenda, comme l'app. */
export const VISIT_MINUTES = 45;
export const VISIT_EVENT_TITLE = 'Visite immobilière';

const pad = (value: number) => String(value).padStart(2, '0');

/** Date UTC d'un fichier d'agenda : « 20261119T170000Z ». */
export function icsDate(date: Date): string {
  return `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`;
}

/** Texte d'un champ (RFC 5545) : barre oblique inverse, virgule, point-virgule et retours à la ligne échappés. */
function icsText(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

/** Fichier d'agenda d'une visite confirmée. */
export function visitCalendarFile({ id, start, address, now = new Date() }: { id: string; start: Date; address: string; now?: Date }): string {
  const end = new Date(start.getTime() + VISIT_MINUTES * 60_000);
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Nidalo//Messages//FR',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${id.toLowerCase()}@nidalo.fr`,
    `DTSTAMP:${icsDate(now)}`,
    `DTSTART:${icsDate(start)}`,
    `DTEND:${icsDate(end)}`,
    `SUMMARY:${icsText(VISIT_EVENT_TITLE)}`,
    ...(address ? [`LOCATION:${icsText(address)}`] : []),
    'END:VEVENT',
    'END:VCALENDAR',
    '',
  ].join('\r\n');
}

/** Texte d'une fiche de contact (RFC 6350). */
function vcfText(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/,/g, '\\,').replace(/;/g, '\\;').replace(/\r?\n/g, '\\n');
}

/** Fiche de contact : le nom et chacun des numéros partagés. */
export function contactCardFile(name: string, phones: string[]): string {
  return [
    'BEGIN:VCARD',
    'VERSION:3.0',
    `FN:${vcfText(name)}`,
    `N:${vcfText(name)};;;;`,
    ...phones.map((phone) => `TEL;TYPE=CELL:${vcfText(phone)}`),
    'END:VCARD',
    '',
  ].join('\r\n');
}

/** Nom de fichier sans caractères refusés par les systèmes de fichiers. */
export function safeFileName(name: string, fallback: string): string {
  const cleaned = name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim();
  return cleaned || fallback;
}

/** Donne un fichier à enregistrer (lien de téléchargement), sans quitter la page. */
export function saveFile(fileName: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.rel = 'noopener';
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** Itinéraire vers une adresse dans Plans d'Apple (VisitActions.directionsURL). */
export function directionsUrl(address: string): string {
  return `https://maps.apple.com/?daddr=${encodeURIComponent(address)}`;
}
