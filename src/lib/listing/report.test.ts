import { describe, expect, it } from 'vitest';
import { LISTING_REPORT_REASONS, listingReportRow } from './report';

describe('Signaler l’annonce (ReportSheet, SupabaseMessagingRepository.report)', () => {
  it('les motifs d’une annonce, dans l’ordre de la feuille de l’app', () => {
    expect(LISTING_REPORT_REASONS.map((reason) => reason.label)).toEqual([
      'Fraude immobilière ou arnaque', 'Annonce trompeuse', 'Spam', 'Contenu inapproprié', 'Autre',
    ]);
  });

  it('la ligne de « reports » : identifiants en majuscules, cible « listing », sans détails s’il n’y en a pas', () => {
    expect(listingReportRow('e1000000-0000-4000-8000-00000000000a', 'b0000000-0000-4000-8000-0000000000f1', 'scam', null)).toEqual({
      id: 'E1000000-0000-4000-8000-00000000000A', target_type: 'listing', target_id: 'B0000000-0000-4000-8000-0000000000F1', reason: 'scam',
    });
  });

  it('les détails sont coupés à 2 000 caractères, sans couper un emoji', () => {
    const row = listingReportRow('e1', 'b1', 'other', `${'a'.repeat(1999)}🏠🏠`);
    expect(row.details).toBe(`${'a'.repeat(1999)}🏠`);
  });
});
