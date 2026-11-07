import { describe, expect, it } from 'vitest';
import { appDate, appDateString } from './appDates';

describe('Dates de l’app (encodeur de supabase-swift)', () => {
  it('une date sans fuseau est en UTC', () => {
    expect(appDate('2026-11-13T09:00:00.000')?.toISOString()).toBe('2026-11-13T09:00:00.000Z');
    expect(appDate('2026-11-13T09:00:00')?.toISOString()).toBe('2026-11-13T09:00:00.000Z');
  });

  it('une date avec fuseau garde le sien', () => {
    expect(appDate('2026-11-13T09:00:00Z')?.toISOString()).toBe('2026-11-13T09:00:00.000Z');
    expect(appDate('2026-11-13T10:00:00+01:00')?.toISOString()).toBe('2026-11-13T09:00:00.000Z');
    expect(appDate('2026-11-13T09:00:00.123456+00:00')?.toISOString()).toBe('2026-11-13T09:00:00.123Z');
  });

  it('valeur illisible : null', () => {
    expect(appDate(null)).toBeNull();
    expect(appDate('')).toBeNull();
    expect(appDate(42)).toBeNull();
    expect(appDate('demain')).toBeNull();
  });

  it('écrite comme l’app : UTC sans fuseau, au millième', () => {
    expect(appDateString(new Date(Date.UTC(2026, 10, 13, 9, 0, 0)))).toBe('2026-11-13T09:00:00.000');
    expect(appDate(appDateString(new Date(Date.UTC(2026, 10, 13, 9, 30)))))
      .toEqual(new Date(Date.UTC(2026, 10, 13, 9, 30)));
  });
});
