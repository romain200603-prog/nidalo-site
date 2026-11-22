// Identifiants des envois ratés, repris au renvoi du même contenu dans la même conversation, comme l'app
// (ImmoDomain/Messaging/RetryClientIds.swift, n° 99) : un message qui était bien arrivé malgré l'échec affiché n'est
// pas enregistré deux fois (le serveur reconnaît son client_id, et le site relit alors le message déjà là).

export class RetryClientIds {
  private pending = new Map<string, string>();

  private static key(conversationId: string, content: unknown): string {
    return `${conversationId.toLowerCase()} ${JSON.stringify(content)}`;
  }

  /** Identifiant à utiliser : celui de l'envoi raté du même contenu, sinon un nouveau. */
  id(conversationId: string, content: unknown, next: () => string = () => crypto.randomUUID()): string {
    return this.pending.get(RetryClientIds.key(conversationId, content)) ?? next();
  }

  /** Envoi raté : l'identifiant est gardé pour le renvoi. */
  failed(id: string, conversationId: string, content: unknown) {
    this.pending.set(RetryClientIds.key(conversationId, content), id);
  }

  /** Envoi réussi : l'identifiant est oublié. */
  succeeded(conversationId: string, content: unknown) {
    this.pending.delete(RetryClientIds.key(conversationId, content));
  }
}
