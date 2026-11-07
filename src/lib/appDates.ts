// Dates écrites par l'app. supabase-swift encode une date en UTC, sans fuseau, au millième
// (« 2026-11-13T09:00:00.000 ») : dans le JSON d'une colonne jsonb (la visite de agenda_visits, les critères d'un
// projet), le serveur la garde telle quelle. Lue par `new Date`, une date sans fuseau serait prise à l'heure locale :
// ces deux fonctions lisent et écrivent comme l'app.

const ZONELESS = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/;

/** Date d'une valeur de l'app ou du serveur ; sans fuseau, elle est en UTC. `null` si elle est illisible. */
export function appDate(value: unknown): Date | null {
  if (typeof value !== 'string' || !value) return null;
  const date = new Date(ZONELESS.test(value) ? `${value}Z` : value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Date écrite comme l'app : UTC sans fuseau, au millième. */
export function appDateString(date: Date): string {
  return date.toISOString().slice(0, -1);
}
