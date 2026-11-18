// Sous-titres des lignes de l'espace particulier de Mon compte, comme l'app (ProfileSubtitles,
// Features/Profile/ProfileView.swift) : seulement de vraies données, rien à zéro.

/** « Mon agenda » : « 2 visites à venir · 1 à confirmer » ; rien sans visite à venir. */
export function agendaSubtitle(upcoming: number, toConfirm: number): string | null {
  if (upcoming <= 0) return null;
  const visits = `${upcoming} visite${upcoming > 1 ? 's' : ''} à venir`;
  return toConfirm > 0 ? `${visits} · ${toConfirm} à confirmer` : visits;
}

/** « Mes recherches » : « 2 recherches enregistrées » ; rien à zéro. */
export function savedSearchesSubtitle(count: number): string | null {
  return count > 0 ? `${count} recherche${count > 1 ? 's' : ''} enregistrée${count > 1 ? 's' : ''}` : null;
}

/** « Biens consultés » : « 3 biens » ; rien à zéro. */
export function viewedSubtitle(count: number): string | null {
  return count > 0 ? `${count} bien${count > 1 ? 's' : ''}` : null;
}

/** « Mes annonces » de l'espace particulier : « 1 en ligne » ; rien à zéro. */
export function onlineSubtitle(count: number): string | null {
  return count > 0 ? `${count} en ligne` : null;
}
