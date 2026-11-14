import type { RealtimeChannel } from '@supabase/supabase-js';
import { useEffect } from 'react';
import { createStore, useStore } from '../account/session';
import { supabase } from '../supabase';

// « En ligne » dans l'en-tête de la conversation (demande de Romain du 14 novembre 2026), avec Supabase Presence : un
// canal par conversation, nommé d'après son identifiant (que seuls ses membres connaissent). Tant que la page Messages
// du site est visible, le compte s'y annonce, pour la conversation ouverte et ses conversations à deux les plus
// récentes (12 au plus). L'app iPhone ne s'annonce pas : ses membres restent « Vu il y a … ».

export const MAX_PRESENCE_CHANNELS = 12;

/** Autres personnes en ligne, par conversation (identifiants en minuscules). */
export const presenceStore = createStore<ReadonlyMap<string, ReadonlySet<string>>>(new Map());

type Joined = { channel: RealtimeChannel; subscribed: boolean };

const joined = new Map<string, Joined>();
let me: string | null = null;

const isVisible = () => typeof document === 'undefined' || document.visibilityState === 'visible';

/** Nom du canal d'une conversation. */
export const presenceTopic = (conversationId: string) => `presence-${conversationId.toLowerCase()}`;

function publish(id: string, channel: RealtimeChannel) {
  const others = new Set(Object.keys(channel.presenceState()).map((key) => key.toLowerCase()).filter((key) => key !== me));
  const next = new Map(presenceStore.get());
  next.set(id, others);
  presenceStore.set(next);
}

function join(id: string) {
  if (!me || joined.has(id)) return;
  const channel = supabase.channel(presenceTopic(id), { config: { presence: { key: me } } });
  const entry: Joined = { channel, subscribed: false };
  joined.set(id, entry);
  channel.on('presence', { event: 'sync' }, () => publish(id, channel));
  channel.subscribe((status) => {
    if (status !== 'SUBSCRIBED') return;
    entry.subscribed = true;
    if (isVisible()) void channel.track({ online: true });
  });
}

function leaveAll() {
  for (const { channel } of joined.values()) void supabase.removeChannel(channel);
  joined.clear();
  presenceStore.set(new Map());
}

/** Onglet caché : le compte n'est plus « en ligne » ; de retour : il l'est de nouveau. */
function onVisibility() {
  for (const entry of joined.values()) {
    if (!entry.subscribed) continue;
    if (isVisible()) void entry.channel.track({ online: true });
    else void entry.channel.untrack();
  }
}

/**
 * Annonce le compte sur les canaux de ses conversations et suit qui y est en ligne. `conversationIds` : la conversation
 * ouverte d'abord (toujours suivie), puis les plus récentes ; on n'en quitte aucune avant de quitter la page.
 */
export function usePresence(userId: string | null, conversationIds: string[]): ReadonlyMap<string, ReadonlySet<string>> {
  const key = conversationIds.map((id) => id.toLowerCase()).join(',');
  useEffect(() => {
    if (!userId) return undefined;
    me = userId.toLowerCase();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      leaveAll();
      me = null;
    };
  }, [userId]);
  useEffect(() => {
    if (!userId) return;
    key.split(',').filter(Boolean).forEach((id, index) => {
      if (index === 0 || joined.size < MAX_PRESENCE_CHANNELS) join(id);
    });
  }, [userId, key]);
  return useStore(presenceStore);
}

/** L'autre personne est-elle sur la page Messages du site en ce moment ? */
export function isOnline(presence: ReadonlyMap<string, ReadonlySet<string>>, conversationId: string, userId: string | null): boolean {
  return !!userId && !!presence.get(conversationId.toLowerCase())?.has(userId.toLowerCase());
}
