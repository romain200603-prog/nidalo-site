import { AuthError, type Session } from '@supabase/supabase-js';
import { SITE_URL } from '../config';
import { PATHS } from '../paths';
import { supabase } from '../supabase';

// Connexion, création de compte et mot de passe oublié, comme l'app (Data/Supabase/AuthStore.swift).
// Les liens des e-mails envoyés depuis le site reviennent sur la page Mon compte du site (PKCE : le lien ne
// fonctionne que dans le navigateur qui a fait la demande, comme sur l'iPhone). La connexion avec Google revient
// au même endroit, de la même façon.

/**
 * Adresse où reviennent les liens des e-mails et la connexion avec Google (déclarée dans Supabase › Authentication ›
 * URL Configuration). Toujours exactement celle-ci, sans rien ajouter : Supabase compare l'adresse entière.
 */
export const AUTH_REDIRECT_URL = `${SITE_URL}${PATHS.account}`;

/** Délai avant de pouvoir renvoyer un e-mail, en secondes (AuthStore.resendDelay). */
export const RESEND_DELAY_SECONDS = 60;

export type LinkPurpose = 'signup' | 'recovery';

// Marques gardées dans le navigateur (comme UserDefaults dans l'app) : le type du prochain lien, le compte
// tout neuf qui doit encore choisir son profil, et la page à retrouver après la connexion avec Google.
const PENDING_LINK_KEY = 'nidalo.authPendingLink';
const NEW_ACCOUNT_KEY = 'nidalo.newAccount';
const GOOGLE_RETURN_KEY = 'nidalo.googleReturn';

function readStorage(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string | null) {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    // Stockage refusé (navigation privée stricte) : la connexion marche quand même, sans ces rappels.
  }
}

export function pendingLink(): LinkPurpose | null {
  const value = readStorage(PENDING_LINK_KEY);
  return value === 'signup' || value === 'recovery' ? value : null;
}

export function setPendingLink(purpose: LinkPurpose | null) {
  writeStorage(PENDING_LINK_KEY, purpose);
}

export function isNewAccount(): boolean {
  return readStorage(NEW_ACCOUNT_KEY) === '1';
}

export function setNewAccount(value: boolean) {
  writeStorage(NEW_ACCOUNT_KEY, value ? '1' : null);
}

// MARK: - Connexion avec Google

/** Au-delà, la marque d'un départ vers Google est oubliée (page de Google quittée sans revenir, par exemple). */
const GOOGLE_RETURN_TTL_MS = 15 * 60 * 1000;

/** Une page du site (« /favoris/ », « /annonce/?id=… »), jamais une autre adresse. */
function isSitePath(path: unknown): path is string {
  return typeof path === 'string' && path.startsWith('/') && !path.startsWith('//') && !path.includes('\\');
}

/** Note la page d'où l'on part vers Google, pour y revenir après la connexion. */
export function setGoogleReturn(path: string, now = Date.now()) {
  writeStorage(GOOGLE_RETURN_KEY, isSitePath(path) ? JSON.stringify({ to: path, at: now }) : null);
}

/**
 * Retour de Google sur la page Mon compte : la page d'où l'on était parti (la marque est effacée), ou `null` si
 * personne n'est parti vers Google depuis ce navigateur dans le dernier quart d'heure.
 */
export function takeGoogleReturn(now = Date.now()): string | null {
  const raw = readStorage(GOOGLE_RETURN_KEY);
  if (raw === null) return null;
  writeStorage(GOOGLE_RETURN_KEY, null);
  try {
    const value = JSON.parse(raw) as { to?: unknown; at?: unknown };
    if (!isSitePath(value.to) || typeof value.at !== 'number') return null;
    return now - value.at >= 0 && now - value.at < GOOGLE_RETURN_TTL_MS ? value.to : null;
  } catch {
    return null;
  }
}

type AccountUser = { app_metadata?: { provider?: string }; created_at?: string; last_sign_in_at?: string | null };

/**
 * Compte tout juste créé par Google (règle de l'app, AuthStore) : créé par Google, et moins de 2 minutes entre sa
 * création et cette connexion. Il choisit alors son profil, comme après la confirmation d'un e-mail. Un compte qui
 * existait déjà avec la même adresse est relié par Supabase : il garde son profil.
 */
export function isFreshGoogleAccount(user: AccountUser | null | undefined): boolean {
  if (!user || user.app_metadata?.provider !== 'google' || !user.created_at || !user.last_sign_in_at) return false;
  const gap = Date.parse(user.last_sign_in_at) - Date.parse(user.created_at);
  return Number.isFinite(gap) && Math.abs(gap) < 2 * 60 * 1000;
}

// MARK: - Vérification du formulaire (ImmoDomain/User/AccountSession.swift)

const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/;

/** Adresse nettoyée comme l'app : sans espaces autour, en minuscules. */
export function cleanEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function emailError(email: string): string | null {
  const trimmed = email.trim();
  if (!trimmed) return 'Saisissez votre adresse e-mail.';
  if (!EMAIL_PATTERN.test(trimmed)) return 'Cette adresse e-mail n\'est pas valide.';
  return null;
}

export function passwordError(password: string): string | null {
  return [...password].length < 8 ? 'Le mot de passe doit contenir au moins 8 caractères.' : null;
}

// MARK: - Messages d'erreur (AuthStore.swift 233–275)

const MESSAGES: Record<string, string> = {
  invalid_credentials: 'Adresse e-mail ou mot de passe incorrect.',
  email_not_confirmed: 'Votre adresse e-mail n\'est pas encore confirmée.',
  over_email_send_rate_limit: 'Trop d\'e-mails envoyés pour le moment. Réessayez dans une heure.',
  over_request_rate_limit: 'Trop de tentatives, réessayez dans quelques minutes.',
  email_address_invalid: 'Cette adresse e-mail n\'est pas valide.',
  email_address_not_authorized: 'Cette adresse ne peut pas encore recevoir d\'e-mail de NIDALO. Les comptes sont pour l\'instant réservés à l\'équipe.',
  otp_expired: 'Ce lien a expiré ou a déjà servi. Demandez-en un nouveau.',
  flow_state_expired: 'Ce lien a expiré ou a déjà servi. Demandez-en un nouveau.',
  // Sur l'iPhone : « Ouvrez le lien sur l'iPhone où vous avez fait la demande, puis réessayez. »
  bad_code_verifier: 'Ouvrez le lien dans le navigateur où vous avez fait la demande, puis réessayez.',
  flow_state_not_found: 'Ouvrez le lien dans le navigateur où vous avez fait la demande, puis réessayez.',
  user_already_exists: 'Un compte existe déjà avec cette adresse.',
  weak_password: 'Ce mot de passe est trop simple. Choisissez-en un plus long ou plus varié.',
  same_password: 'Choisissez un mot de passe différent de l\'ancien.',
};

export const NETWORK_MESSAGE = 'Connexion impossible. Vérifiez votre accès à Internet, puis réessayez.';
export const GENERIC_MESSAGE = 'L\'opération n\'a pas abouti. Réessayez dans un instant.';
/** Connexion avec Google refusée, annulée ou impossible à terminer (même texte que l'app). */
export const GOOGLE_MESSAGE = 'La connexion avec Google n\'a pas abouti. Réessayez, ou connectez-vous avec votre adresse e-mail.';

/** Une demande qui n'a pas pu partir (hors ligne, serveur injoignable). */
export function isNetworkError(error: unknown): boolean {
  if (error instanceof TypeError) return true;
  if (error instanceof AuthError && (error.name === 'AuthRetryableFetchError' || error.status === 0)) return true;
  const message = error instanceof Error ? error.message : '';
  return /Failed to fetch|NetworkError|Load failed|fetch failed/i.test(message);
}

/** Message affiché pour une erreur de connexion, comme l'app. */
export function authMessage(error: unknown): string {
  if (isNetworkError(error)) return NETWORK_MESSAGE;
  const code = error instanceof AuthError ? error.code : (error as { code?: string } | null)?.code;
  return (code && MESSAGES[code]) || GENERIC_MESSAGE;
}

/** Erreur rapportée dans l'adresse d'un lien d'e-mail (« ?error=access_denied&error_code=otp_expired »). */
export function linkErrorMessage(params: URLSearchParams): string | null {
  const error = params.get('error');
  const code = params.get('error_code');
  if (!error && !code) return null;
  if (code === 'otp_expired' || error === 'access_denied') return 'Ce lien a expiré ou a déjà servi. Demandez-en un nouveau.';
  return 'Ce lien n\'a pas pu être utilisé. Demandez-en un nouveau.';
}

// MARK: - Appels au serveur

export type SignUpOutcome = 'signedIn' | 'checkEmail' | 'alreadyExists';

export async function signIn(email: string, password: string): Promise<Session> {
  const { data, error } = await supabase.auth.signInWithPassword({ email: cleanEmail(email), password });
  if (error) throw error;
  return data.session;
}

/** Création du compte : sans nom ni type de compte, comme l'app (le serveur crée le profil). */
export async function signUp(email: string, password: string): Promise<SignUpOutcome> {
  const { data, error } = await supabase.auth.signUp({
    email: cleanEmail(email),
    password,
    options: { emailRedirectTo: AUTH_REDIRECT_URL },
  });
  if (error) throw error;
  if (data.session) {
    setNewAccount(true);
    return 'signedIn';
  }
  // Adresse déjà connue (confirmation activée) : Supabase répond sans identité.
  if (data.user && (data.user.identities?.length ?? 0) === 0) return 'alreadyExists';
  setNewAccount(true);
  setPendingLink('signup');
  return 'checkEmail';
}

/** Renvoie l'e-mail de confirmation (connexion d'une adresse pas encore confirmée, ou bouton « Renvoyer »). */
export async function resendConfirmation(email: string): Promise<void> {
  const { error } = await supabase.auth.resend({ type: 'signup', email: cleanEmail(email), options: { emailRedirectTo: AUTH_REDIRECT_URL } });
  if (error) throw error;
  setNewAccount(true);
  setPendingLink('signup');
}

export async function sendPasswordReset(email: string): Promise<void> {
  const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail(email), { redirectTo: AUTH_REDIRECT_URL });
  if (error) throw error;
  setPendingLink('recovery');
}

/**
 * Connexion avec Google : la page de Google remplace le site, puis revient sur Mon compte avec un code (PKCE, comme
 * les liens des e-mails). `from` est la page à retrouver ensuite. Les marques d'un e-mail en attente sont effacées :
 * c'est cette connexion qui compte.
 */
export async function signInWithGoogle(from: string): Promise<void> {
  setPendingLink(null);
  setNewAccount(false);
  setGoogleReturn(from);
  const { error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: AUTH_REDIRECT_URL } });
  if (error) {
    writeStorage(GOOGLE_RETURN_KEY, null);
    throw error;
  }
}

/** Lien d'un e-mail, ou retour de Google, ouvert sur la page Mon compte : échange du code contre une session. */
export async function openLink(code: string): Promise<LinkPurpose | null> {
  const purpose = pendingLink();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) throw error;
  setPendingLink(null);
  if (isFreshGoogleAccount(data.user)) setNewAccount(true);
  return purpose;
}

export async function updatePassword(password: string): Promise<void> {
  const { error } = await supabase.auth.updateUser({ password });
  if (error) throw error;
}

/** Déconnexion de tous les appareils, comme l'app ; en cas d'échec, au moins dans ce navigateur. */
export async function signOut(): Promise<void> {
  setPendingLink(null);
  setNewAccount(false);
  const { error } = await supabase.auth.signOut();
  if (error) await supabase.auth.signOut({ scope: 'local' });
}
