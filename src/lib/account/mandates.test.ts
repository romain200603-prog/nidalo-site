import { describe, expect, it } from 'vitest';
import {
  documentName, mandateErrors, mandateFileIssue, mandateFormFor, mandatesIn, mandatesSubtitle, mandateStage, mandateState, mandateWrite,
  type MandateForm, type MandateRow,
} from './mandates';

const TODAY = '2026-11-08';

const mandate = (over: Partial<MandateRow>): MandateRow => ({
  id: 'm1', listing_id: null, kind: 'sale', exclusivity: 'exclusive', number: '2026-001', client_name: 'M. Durand', title: 'Appartement',
  city: 'Lyon 3e', price: '320000', fees: null, signed_on: '2026-10-01', ends_on: null, ended_on: null, document_path: null,
  document_name: null, note: null, created_at: '2026-10-01T10:00:00Z', updated_at: '2026-10-01T10:00:00Z', ...over,
});

describe('Mes mandats', () => {
  it('écrit où en est chaque mandat', () => {
    const rows = [
      mandate({}),
      mandate({ ends_on: '2027-01-01' }),
      mandate({ ends_on: TODAY }),
      mandate({ ends_on: '2026-11-07' }),
      mandate({ ends_on: '2027-01-01', ended_on: '2026-11-05' }),
    ];
    expect(rows.map((row) => [mandateState(row, TODAY), mandateStage(row, TODAY)])).toEqual([
      ['active', 'Sans date de fin'],
      ['active', 'Jusqu\'au 1 janvier 2027'],
      ['active', 'Jusqu\'au 8 novembre 2026'],
      ['ended', 'Échu le 7 novembre 2026'],
      ['ended', 'Terminé le 5 novembre 2026'],
    ]);
  });

  it('range le registre : la fin la plus proche d\'abord, puis les plus récemment finis', () => {
    const rows = [
      mandate({ id: 'sans-fin', signed_on: '2026-11-01' }),
      mandate({ id: 'sans-fin-ancien', signed_on: '2026-09-01' }),
      mandate({ id: 'mars', ends_on: '2027-03-01' }),
      mandate({ id: 'janvier', ends_on: '2027-01-01' }),
      mandate({ id: 'echu', ends_on: '2026-10-31' }),
      mandate({ id: 'termine', ends_on: '2027-06-01', ended_on: '2026-11-06' }),
    ];
    expect(mandatesIn(rows, 'active', TODAY).map((row) => row.id)).toEqual(['janvier', 'mars', 'sans-fin', 'sans-fin-ancien']);
    expect(mandatesIn(rows, 'ended', TODAY).map((row) => row.id)).toEqual(['termine', 'echu']);
    expect(mandatesSubtitle(rows, TODAY)).toBe('4 mandats actifs, vente et location');
    expect(mandatesSubtitle([], TODAY)).toBe('0 mandat actif, vente et location');
  });

  it('vérifie le formulaire', () => {
    const form = (over: Partial<MandateForm>): MandateForm => ({
      ...mandateFormFor(null), number: '2026-014', signedOn: '2026-11-02', title: 'Maison', clientName: 'Mme Roux', ...over,
    });
    expect(mandateErrors(form({}), TODAY)).toEqual({});
    expect(mandateErrors(form({ number: ' ', signedOn: '', title: '', clientName: ' ' }), TODAY)).toEqual({
      number: 'Indiquez le numéro du registre.', signedOn: 'Indiquez la date de signature.', title: 'Indiquez le bien.', clientName: 'Indiquez le mandant.',
    });
    expect(mandateErrors(form({ number: 'x'.repeat(41), signedOn: '2026-11-09' }), TODAY)).toEqual({
      number: '40 caractères au plus.', signedOn: 'Cette date est après aujourd\'hui.',
    });
    expect(mandateErrors(form({ endsOn: '2026-11-01' }), TODAY)).toEqual({ endsOn: 'Cette date est avant la signature.' });
    expect(mandateErrors(form({ endsOn: '2026-11-03', price: '0', fees: '1 000 000 000' }), TODAY)).toEqual({
      price: 'Montant invalide.', fees: 'Montant invalide.',
    });
  });

  it('écrit les valeurs et reprend un mandat dans le formulaire', () => {
    const form = mandateFormFor(mandate({ listing_id: 'ABC', kind: 'rental', exclusivity: 'simple', price: 950, fees: '1200.00', ends_on: '2027-11-01' }));
    expect([form.listingId, form.kind, form.exclusivity, form.price, form.fees, form.endsOn]).toEqual(['abc', 'rental', 'simple', '950', '1 200', '2027-11-01']);
    expect(mandateWrite({ ...form, number: ' 2026-002 ', city: ' ', clientName: ' Mme Roux ', price: '1 250', fees: '', note: ' Clés à l\'agence. ' })).toEqual({
      listing_id: 'abc', kind: 'rental', exclusivity: 'simple', number: '2026-002', client_name: 'Mme Roux', title: 'Appartement', city: null,
      price: 1250, fees: null, signed_on: '2026-10-01', ends_on: '2027-11-01', note: 'Clés à l\'agence.',
    });
  });

  it('accepte un PDF de 10 Mo au plus et garde son nom lisible', () => {
    expect(mandateFileIssue({ name: 'mandat.pdf', size: 1000, type: 'application/pdf' })).toBeNull();
    expect(mandateFileIssue({ name: 'MANDAT.PDF', size: 1000, type: '' })).toBeNull();
    expect(mandateFileIssue({ name: 'photo.jpg', size: 1000, type: 'image/jpeg' })).toBe('Choisissez un fichier PDF.');
    expect(mandateFileIssue({ name: 'mandat.pdf', size: 10 * 1024 * 1024 + 1, type: 'application/pdf' })).toBe('Le PDF dépasse 10 Mo.');
    expect(mandateFileIssue({ name: 'mandat.pdf', size: 0, type: 'application/pdf' })).toBe('Ce fichier est vide.');
    expect(documentName('  Mandat   Durand.pdf ')).toBe('Mandat Durand.pdf');
    expect(documentName('dossier/mandat')).toBe('dossier mandat.pdf');
    expect(documentName(`${'a'.repeat(300)}.pdf`)).toHaveLength(200);
  });
});
