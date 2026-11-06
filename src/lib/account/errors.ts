import { GENERIC_MESSAGE, isNetworkError, NETWORK_MESSAGE } from './auth';

// Erreurs de la base telles que l'app les montre (SupabaseAccountRepositories.swift 11–25 ; AccountStore.swift 182–190).

export const REFUSED_MESSAGE = 'Certaines informations n\'ont pas été acceptées. Vérifiez-les, puis réessayez.';
export const SESSION_MESSAGE = 'Votre session a expiré. Reconnectez-vous.';

type Coded = { code?: string; message?: string };

export function databaseMessage(error: unknown): string {
  if (isNetworkError(error)) return NETWORK_MESSAGE;
  const { code } = (error ?? {}) as Coded;
  if (code && ['23514', '23502', '22001', '22P02'].includes(code)) return REFUSED_MESSAGE;
  return GENERIC_MESSAGE;
}

/** Message d'un déclencheur de la base sur les annonces (P0001), montré tel quel ; sinon `fallback`. */
export function triggerMessage(error: unknown, fallback: string): string {
  if (isNetworkError(error)) return NETWORK_MESSAGE;
  const { code, message } = (error ?? {}) as Coded;
  return code === 'P0001' && message ? message : fallback;
}
