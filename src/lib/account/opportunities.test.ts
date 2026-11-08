import { describe, expect, it } from 'vitest';
import {
  budgetText, closedOn, followUpText, opportunitiesIn, opportunitiesSubtitle, opportunityErrors, opportunityFormFor, opportunityLine,
  opportunityStatus, opportunityWrite, type OpportunityForm, type OpportunityRow,
} from './opportunities';

const TODAY = '2026-11-08';
/** Espaces fines et insécables des montants, écrites ici en espaces simples. */
const plain = (text: string | null): string | null => text?.replace(/[\u202f\u00a0]/g, ' ') ?? null;

const opportunity = (over: Partial<OpportunityRow>): OpportunityRow => ({
  id: 'o1', listing_id: null, kind: 'buyer', stage: 'new', name: 'Julie Morel', phone: null, email: null, budget: '300000', project: null,
  follow_up_on: null, note: null, closed_on: null, created_at: '2026-11-01T10:00:00Z', updated_at: '2026-11-01T10:00:00Z', ...over,
});

describe('Mes opportunités', () => {
  it('écrit la personne, son étape, son montant et sa relance', () => {
    expect(plain(opportunityLine(opportunity({})))).toBe('Acheteur · Nouvelle · 300 000 €');
    expect(plain(opportunityLine(opportunity({ kind: 'tenant', stage: 'active', budget: 900 })))).toBe('Locataire · En cours · 900 €/mois');
    expect(opportunityLine(opportunity({ kind: 'seller', stage: 'won', budget: null, closed_on: TODAY }))).toBe('Vendeur');
    expect(plain(budgetText({ kind: 'seller', budget: '480000.00' }))).toBe('480 000 €');
    expect(budgetText({ kind: 'buyer', budget: 0 })).toBeNull();
    expect([
      opportunity({}), opportunity({ follow_up_on: TODAY }), opportunity({ follow_up_on: '2026-11-05' }), opportunity({ follow_up_on: '2026-11-12' }),
      opportunity({ stage: 'won', closed_on: '2026-11-07' }), opportunity({ stage: 'lost', closed_on: '2026-10-30', follow_up_on: '2026-11-01' }),
    ].map((row) => opportunityStatus(row, TODAY))).toEqual([
      { text: 'Aucune relance prévue', due: false },
      { text: 'À relancer aujourd\'hui', due: true },
      { text: 'À relancer depuis le 5 novembre', due: true },
      { text: 'À relancer le 12 novembre', due: false },
      { text: 'Gagnée le 7 novembre', due: false },
      { text: 'Perdue le 30 octobre', due: false },
    ]);
    expect(opportunityStatus(opportunity({ follow_up_on: '2027-01-05' }), TODAY)).toEqual({ text: 'À relancer le 5 janvier 2027', due: false });
    expect(opportunityStatus(opportunity({ stage: 'won', closed_on: '2025-12-30' }), TODAY).text).toBe('Gagnée le 30 décembre 2025');
    expect(['2026-11-05', TODAY, '2026-11-12', null].map((day) => followUpText(day, TODAY)))
      .toEqual(['5 novembre 2026 (en retard)', 'Aujourd\'hui', '12 novembre 2026', 'Non prévue']);
  });

  it('range la liste : la relance la plus proche d\'abord, puis les plus récemment gagnées ou perdues', () => {
    const rows = [
      opportunity({ id: 'sans-relance-ancienne', created_at: '2026-10-01T10:00:00Z' }),
      opportunity({ id: 'sans-relance', stage: 'active', created_at: '2026-11-07T10:00:00Z' }),
      opportunity({ id: 'mardi', follow_up_on: '2026-11-10' }),
      opportunity({ id: 'en-retard', stage: 'active', follow_up_on: '2026-11-02' }),
      opportunity({ id: 'gagnee', stage: 'won', closed_on: '2026-11-06' }),
      opportunity({ id: 'gagnee-avant', stage: 'won', closed_on: '2026-10-20' }),
      opportunity({ id: 'perdue', stage: 'lost', closed_on: '2026-11-01' }),
    ];
    expect(opportunitiesIn(rows, 'open').map((row) => row.id)).toEqual(['en-retard', 'mardi', 'sans-relance', 'sans-relance-ancienne']);
    expect(opportunitiesIn(rows, 'won').map((row) => row.id)).toEqual(['gagnee', 'gagnee-avant']);
    expect(opportunitiesIn(rows, 'lost').map((row) => row.id)).toEqual(['perdue']);
    expect(opportunitiesSubtitle(rows)).toBe('4 opportunités actives');
    expect(opportunitiesSubtitle(rows.slice(4))).toBe('0 opportunité active');
    expect(opportunitiesSubtitle(rows.slice(3))).toBe('1 opportunité active');
  });

  it('vérifie le formulaire', () => {
    const form = (over: Partial<OpportunityForm>): OpportunityForm => ({ ...opportunityFormFor(null), name: 'Julie Morel', ...over });
    expect(opportunityErrors(form({}))).toEqual({});
    expect(opportunityErrors(form({ phone: '06 12 34 56 78', email: 'julie@exemple.fr', budget: '300 000', followUpOn: '2026-11-12' }))).toEqual({});
    expect(opportunityErrors(form({ name: '  ', phone: '06 12 34', email: 'julie@', budget: '0', followUpOn: '2026-02-30x' }))).toEqual({
      name: 'Indiquez le nom de la personne.', phone: 'Numéro de téléphone invalide.', email: 'Adresse e-mail invalide.', budget: 'Montant invalide.',
      followUpOn: 'Date invalide.',
    });
    expect(opportunityErrors(form({ name: 'x'.repeat(121), project: 'p'.repeat(201), note: 'n'.repeat(2001), budget: '10 000 000 000' }))).toEqual({
      name: '120 caractères au plus.', project: '200 caractères au plus.', note: '2 000 caractères au plus.', budget: 'Montant invalide.',
    });
  });

  it('écrit les valeurs, date la fin d\'une opportunité et la reprend dans le formulaire', () => {
    const row = opportunity({ listing_id: 'ABC', kind: 'tenant', stage: 'active', phone: '+447946000000', budget: 950, follow_up_on: '2026-11-12' });
    const form = opportunityFormFor(row);
    expect([form.listingId, form.kind, form.stage, form.phone, form.budget, form.followUpOn]).toEqual(['abc', 'tenant', 'active', '+44 79 46 00 00 00', '950', '2026-11-12']);
    expect(opportunityWrite({ ...form, name: ' Hugo T. ', phone: '06 12 34 56 78', email: ' ', budget: '1 100', project: ' T2 meublé ', note: ' ' }, row, TODAY)).toEqual({
      listing_id: 'abc', kind: 'tenant', stage: 'active', name: 'Hugo T.', phone: '0612345678', email: null, budget: 1100, project: 'T2 meublé',
      follow_up_on: '2026-11-12', note: null, closed_on: null,
    });
    expect(opportunityWrite({ ...form, stage: 'won' }, row, TODAY).closed_on).toBe(TODAY);
    expect([
      closedOn('won', { stage: 'won', closed_on: '2026-11-01' }, TODAY), closedOn('lost', { stage: 'won', closed_on: '2026-11-01' }, TODAY),
      closedOn('active', { stage: 'won', closed_on: '2026-11-01' }, TODAY), closedOn('lost', null, TODAY),
    ]).toEqual(['2026-11-01', TODAY, null, TODAY]);
  });
});
