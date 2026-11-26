import { useEffect } from 'react';
import { Icon } from './Icon';
import { createStore, useStore } from '../lib/account/session';
import '../styles/pieces-app.css';

// Message du bas de l'app (CompareToast et CompareToastState, Features/Compare/CompareButton.swift) : fond bleu,
// icône, texte et, à droite, une action soulignée (« Annuler », « Voir »). Il reste 4 s ; un seul à la fois, le
// dernier remplace le précédent. 70 au-dessus de la zone du bas du téléphone (28 au-dessus de la barre d'onglets), en
// bas au centre sur ordinateur.

export type ToastMessage = {
  icon: 'heart' | 'check' | 'columns' | 'info';
  text: string;
  action?: { label: string; accessibilityLabel: string; run: () => void };
  /** Tout le message fait l'action, pas seulement son bouton (« Voir », « Gérer » de la comparaison, comme l'app). */
  wholeToast?: boolean;
};

type ToastState = { id: number; message: ToastMessage; leaving: boolean } | null;

const toastStore = createStore<ToastState>(null);
let lastId = 0;
let hideTimer: number | undefined;
let removeTimer: number | undefined;

function clearTimers() {
  window.clearTimeout(hideTimer);
  window.clearTimeout(removeTimer);
}

/** Affiche le message (et remplace celui qui est affiché) ; il part seul après 4 s. */
export function showToast(message: ToastMessage) {
  clearTimers();
  lastId += 1;
  toastStore.set({ id: lastId, message, leaving: false });
  hideTimer = window.setTimeout(hideToast, 4000);
}

/** Le message part (fondu de 0,2 s vers le bas). */
export function hideToast() {
  const current = toastStore.get();
  clearTimers();
  if (!current || current.leaving) return;
  toastStore.set({ ...current, leaving: true });
  removeTimer = window.setTimeout(() => {
    if (toastStore.get()?.id === current.id) toastStore.set(null);
  }, 200);
}

/** Un message est affiché (Votre recherche cache alors son bouton « Carte », comme l'app). */
export function useToastShown(): boolean {
  const state = useStore(toastStore);
  return state !== null && !state.leaving;
}

/** Emplacement du message, posé une fois par page (Page, dans Layout). */
export function ToastHost() {
  const state = useStore(toastStore);
  // Une page quittée garde son message : il ne doit pas réapparaître au retour par « Précédent ».
  useEffect(() => {
    const onHide = () => { clearTimers(); toastStore.set(null); };
    window.addEventListener('pagehide', onHide);
    return () => window.removeEventListener('pagehide', onHide);
  }, []);
  const message = state?.message;
  const run = () => {
    const action = message?.action?.run;
    hideToast();
    action?.();
  };
  // Toucher le message : au doigt ou à la souris ; au clavier et pour les lecteurs d'écran, son bouton.
  const wholeToast = Boolean(message?.action && message.wholeToast && !state?.leaving);
  return (
    <div className="app-toast-host" role="status" aria-live="polite">
      {state && message && (
        <div key={state.id} className={`app-toast${state.leaving ? ' is-leaving' : ''}${wholeToast ? ' is-tappable' : ''}`}
          onClick={wholeToast ? run : undefined}>
          <Icon name={message.icon} />
          <span className="app-toast-text">{message.text}</span>
          {message.action && (
            <button
              type="button"
              className="app-toast-action"
              aria-label={message.action.accessibilityLabel}
              onClick={(event) => {
                event.stopPropagation();
                run();
              }}
            >
              {message.action.label}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
