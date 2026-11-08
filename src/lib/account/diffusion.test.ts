import { describe, expect, it } from 'vitest';
import { fileSlug, posterBand, posterPrice, publicListingUrl, qrMatrix, qrPath, qrViewSize, socialText } from './diffusion';

const ID = '6b0f6c1e-1d1a-4c55-9a51-0c3d7c2f1a01';
const s = '\u202f'; // séparateur des milliers
const nb = '\u00a0'; // avant « € »
const flat = {
  id: ID, title: 'Appartement lumineux avec balcon', city: 'Lyon 3e', postal_code: '69003', transaction: 'sale' as const, price: 238000,
  monthly_charges: null, property_type: 'apartment', living_area: 62, land_area: null, rooms: 3, asset_details: null,
};

describe('Outils de diffusion', () => {
  it('donne l\'adresse publique de l\'annonce sur nidalo.fr', () => {
    expect(publicListingUrl(ID)).toBe(`https://nidalo.fr/annonce/?id=${ID}`);
  });

  it('prépare le texte des réseaux sociaux : celui de « Partager », puis l\'adresse', () => {
    expect(socialText(flat)).toBe([
      'Appartement lumineux avec balcon · Lyon 3e (69003)',
      `238${s}000${nb}€ · 62 m² · 3 pièces`,
      'À voir sur Nidalo',
      `https://nidalo.fr/annonce/?id=${ID}`,
    ].join('\n'));
  });

  it('affiche le prix de vente, ou le loyer charges comprises', () => {
    expect([posterBand(flat), posterPrice(flat)]).toEqual(['À vendre', `238${s}000${nb}€`]);
    const rent = { ...flat, transaction: 'rent' as const, price: 950, monthly_charges: 80 };
    expect([posterBand(rent), posterPrice(rent)]).toEqual(['À louer', `1${s}030${nb}€/mois charges comprises`]);
    expect(posterPrice({ ...rent, monthly_charges: null })).toBe(`950${nb}€/mois`);
  });

  it('dessine un QR code carré avec ses trois repères dans les coins', () => {
    const matrix = qrMatrix(publicListingUrl(ID));
    // 66 caractères en correction M : version 5, 37 cases de côté.
    expect(matrix.length).toBe(37);
    expect(matrix.every((row) => row.length === 37)).toBe(true);
    const finder = (top: number, left: number) => [0, 6].every((i) => [0, 1, 2, 3, 4, 5, 6].every((j) => (
      matrix[top + i][left + j] && matrix[top + j][left + i]
    ))) && !matrix[top + 1][left + 1] && matrix[top + 3][left + 3];
    expect([finder(0, 0), finder(0, 30), finder(30, 0)]).toEqual([true, true, true]);
    expect(qrViewSize(matrix)).toBe(45);
    // Première ligne : le haut des deux repères, réunis chacun en une seule suite de 7 cases.
    expect(qrPath(matrix).startsWith('M4 4h7v1h-7z')).toBe(true);
    expect(qrPath([[true, true, false, true]], 0)).toBe('M0 0h2v1h-2zM3 0h1v1h-1z');
  });

  it('nomme les fichiers d\'après le titre, sans accents ni signes', () => {
    expect(fileSlug('Appartement lumineux à Lyon 3e !')).toBe('appartement-lumineux-a-lyon-3e');
    expect(fileSlug('  ')).toBe('annonce');
    expect(fileSlug('Très grande maison familiale avec piscine chauffée et jardin arboré de 2 000 m²').length).toBeLessThanOrEqual(60);
  });
});
