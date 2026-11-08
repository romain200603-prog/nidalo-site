import qrcode from 'qrcode-generator';
import { SITE_URL } from '../config';
import { sharePrice, shareText } from '../listing/share';
import type { ListingRow } from '../listings';
import { listingPath } from '../paths';

// « Outils de diffusion » de l'espace professionnel : pour chaque annonce en ligne, son adresse sur nidalo.fr, un QR
// code qui l'ouvre, un texte prêt pour les réseaux sociaux (celui du bouton « Partager », suivi de l'adresse) et une
// affiche à imprimer pour la vitrine.

type TextRow = Parameters<typeof shareText>[0] & Pick<ListingRow, 'id'>;

/** Adresse publique de l'annonce, toujours sur nidalo.fr : le QR code et l'affiche servent hors du site. */
export function publicListingUrl(id: string): string {
  return `${SITE_URL}${listingPath(id)}`;
}

/** Texte pour les réseaux sociaux : celui de « Partager » (titre et lieu, prix et surfaces, « À voir sur Nidalo »), puis l'adresse. */
export function socialText(row: TextRow): string {
  return `${shareText(row).text}\n${publicListingUrl(row.id)}`;
}

/** Prix de l'affiche : le prix de vente, ou le loyer par mois, « charges comprises » quand elles sont connues. */
export function posterPrice(row: Parameters<typeof sharePrice>[0]): string {
  const price = sharePrice(row);
  return row.transaction === 'rent' && row.monthly_charges !== null ? `${price} charges comprises` : price;
}

/** Bandeau de l'affiche. */
export const posterBand = (row: Pick<ListingRow, 'transaction'>): string => (row.transaction === 'rent' ? 'À louer' : 'À vendre');

/**
 * Cases sombres d'un QR code, ligne par ligne. Correction M : il reste lisible un peu abîmé, et assez simple pour
 * être scanné de loin sur une vitrine.
 */
export function qrMatrix(text: string): boolean[][] {
  const code = qrcode(0, 'M');
  code.addData(text, 'Byte');
  code.make();
  const size = code.getModuleCount();
  return Array.from({ length: size }, (_, row) => Array.from({ length: size }, (_, column) => code.isDark(row, column)));
}

/** Marge blanche autour du QR code, en cases (4 : la marge de la norme). */
export const QR_MARGIN = 4;

/** Chemin SVG des cases sombres (une case = 1 unité, suites d'une même ligne réunies), pour un viewBox de `qrViewSize`. */
export function qrPath(matrix: boolean[][], margin = QR_MARGIN): string {
  let path = '';
  matrix.forEach((cells, row) => {
    let column = 0;
    while (column < cells.length) {
      if (!cells[column]) {
        column += 1;
        continue;
      }
      let end = column;
      while (end < cells.length && cells[end]) end += 1;
      path += `M${column + margin} ${row + margin}h${end - column}v1h${column - end}z`;
      column = end;
    }
  });
  return path;
}

export const qrViewSize = (matrix: boolean[][], margin = QR_MARGIN): number => matrix.length + 2 * margin;

/** Nom de fichier lisible : « nidalo-qr-appartement-lumineux-avec-balcon.png ». */
export function fileSlug(title: string): string {
  const slug = title.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60).replace(/-+$/, '');
  return slug || 'annonce';
}

/** QR code en PNG (fond blanc, environ `pixels` de côté) pour l'imprimer ou le poser sur un document. */
export async function qrPng(matrix: boolean[][], pixels = 1024): Promise<Blob> {
  const view = qrViewSize(matrix);
  const cell = Math.max(1, Math.floor(pixels / view));
  const canvas = document.createElement('canvas');
  canvas.width = cell * view;
  canvas.height = cell * view;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Dessin impossible');
  context.fillStyle = '#FFFFFF';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = '#000000';
  matrix.forEach((cells, row) => cells.forEach((dark, column) => {
    if (dark) context.fillRect((column + QR_MARGIN) * cell, (row + QR_MARGIN) * cell, cell, cell);
  }));
  return new Promise((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('PNG impossible'))), 'image/png'));
}

/** Enregistre un fichier sur l'ordinateur ou le téléphone (lien de téléchargement éphémère). */
export function saveFile(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
