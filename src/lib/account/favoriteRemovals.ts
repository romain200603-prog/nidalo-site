// Retrait annulable d'un favori, comme ImmoDomain/Favorites/FavoriteRemovals.swift de l'app (demande du 17/11).
// Toucher le cœur dans Vos favoris retire la carte tout de suite ; le retrait n'est envoyé au serveur qu'à la fin du
// message « Retiré des favoris » (4 s), quand la page est quittée ou cachée, ou au retrait suivant. « Annuler »
// remet le dernier favori retiré à sa place, avec sa date d'ajout d'origine. Logique pure, sans minuterie.

/** Durée du message « Retiré des favoris », en millisecondes (4 s, comme l'app). */
export const UNDO_DURATION = 4000;

export type PendingRemoval = {
  id: string;
  /** Date d'ajout d'origine (created_at), gardée pour remettre le favori à sa place. */
  addedAt: string;
  /** Fin du message, en millisecondes depuis 1970. */
  deadline: number;
};

export class FavoriteRemovals {
  pending: PendingRemoval | null = null;

  /** Nouveau retrait : le précédent encore en attente devient définitif et est rendu, pour être envoyé. */
  remove(id: string, addedAt: string, now: number): PendingRemoval | null {
    const previous = this.pending;
    this.pending = { id, addedAt, deadline: now + UNDO_DURATION };
    return previous?.id === id ? null : previous;
  }

  /** « Annuler » : rend le dernier retrait (à remettre), rien n'est envoyé. */
  undo(): PendingRemoval | null {
    const pending = this.pending;
    this.pending = null;
    return pending;
  }

  /** Fin du message : rend le retrait à envoyer, s'il est arrivé à son terme. */
  expire(now: number): PendingRemoval | null {
    const pending = this.pending;
    if (!pending || now < pending.deadline) return null;
    this.pending = null;
    return pending;
  }

  /** Page quittée ou cachée : le retrait en attente part tout de suite. */
  flush(): PendingRemoval | null {
    const pending = this.pending;
    this.pending = null;
    return pending;
  }

  /** Remet `id` dans l'ordre d'ajout, avant le premier favori ajouté après lui (sinon à la fin). */
  static restoring(id: string, addedAt: string, ordered: string[], dates: Map<string, string>): string[] {
    const result = ordered.filter((other) => other !== id);
    const time = Date.parse(addedAt);
    const index = result.findIndex((other) => {
      const date = dates.get(other);
      return (date === undefined ? -Infinity : Date.parse(date)) > time;
    });
    result.splice(index === -1 ? result.length : index, 0, id);
    return result;
  }
}
