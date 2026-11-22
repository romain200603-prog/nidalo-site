// Écran de connexion comme l'app (ImmoDomain/User/AuthFlow.swift) : les étapes et leurs textes, la règle et la jauge
// du mot de passe, les données jointes à l'inscription et le compte à rebours de « Renvoyer l'e-mail ».
// L'étape « Vérifiez votre e-mail » (code à 6 chiffres) de l'app n'existe pas ici : les e-mails du site ne contiennent
// qu'un lien.

/** Une étape de l'écran : l'accueil (Apple, Google, e-mail), puis les étapes par e-mail dans la feuille blanche. */
export type AuthScreen = 'welcome' | 'signIn' | 'signUp' | 'forgotPassword' | 'linkSent' | 'confirmEmail' | 'newPassword';

/** Titre et sous-titre de chaque étape (AuthScreen.title et .subtitle). */
export const SCREEN_TEXTS: Record<AuthScreen, { title: string; subtitle: string }> = {
  welcome: { title: 'Votre prochain bien commence ici.', subtitle: 'Acheter, louer, investir : toute l\'offre immobilière au même endroit.' },
  signIn: { title: 'Ravi de vous revoir', subtitle: 'Connectez-vous pour retrouver vos projets immobiliers.' },
  signUp: { title: 'Créez votre compte', subtitle: 'Gratuit, et prêt en moins d\'une minute.' },
  forgotPassword: { title: 'Mot de passe oublié ?', subtitle: 'Recevez un lien pour en choisir un nouveau.' },
  linkSent: { title: 'E-mail envoyé', subtitle: 'Plus qu\'un clic pour retrouver votre compte.' },
  confirmEmail: { title: 'Confirmez votre adresse e-mail', subtitle: 'Plus qu\'un clic pour activer votre compte.' },
  newPassword: { title: 'Nouveau mot de passe', subtitle: 'Choisissez-le, puis vous êtes connecté.' },
};

/** Flèche retour en haut à gauche : l'étape où elle ramène, ou `null` (accueil, nouveau mot de passe). */
export function screenBack(screen: AuthScreen): AuthScreen | null {
  switch (screen) {
    case 'welcome':
    case 'newPassword':
      return null;
    case 'signIn':
    case 'signUp':
      return 'welcome';
    // Mot de passe oublié et e-mail envoyé reviennent à la connexion.
    case 'forgotPassword':
    case 'linkSent':
    case 'confirmEmail':
      return 'signIn';
  }
}

// MARK: - Mot de passe (PasswordRule et PasswordStrength)

const segmenter = typeof Intl.Segmenter === 'function' ? new Intl.Segmenter('fr', { granularity: 'grapheme' }) : null;

/** Caractères comme Swift les compte (« é » écrit avec un accent séparé compte pour un). */
export function characters(text: string): string[] {
  if (segmenter) return Array.from(segmenter.segment(text), (part) => part.segment);
  return Array.from(text);
}

export const PASSWORD_MINIMUM_LENGTH = 8;
export const PASSWORD_HINT = 'Au moins 8 caractères, avec des lettres et des chiffres.';

/** Même règle que Supabase : 8 caractères au moins, dont une lettre a-z ou A-Z et un chiffre 0-9. */
export function passwordRuleSatisfied(password: string): boolean {
  return characters(password).length >= PASSWORD_MINIMUM_LENGTH && /[A-Za-z]/.test(password) && /[0-9]/.test(password);
}

export type PasswordStrength = { level: 1 | 2 | 3 | 4; label: string; color: string };

/** Niveaux de la jauge, du rouge au vert ; tous les segments remplis prennent la couleur du niveau. */
export const PASSWORD_STRENGTHS: readonly PasswordStrength[] = [
  { level: 1, label: 'Faible', color: '#D64545' },
  { level: 2, label: 'Moyen', color: '#E08A2E' },
  { level: 3, label: 'Bon', color: '#7BAA35' },
  { level: 4, label: 'Solide', color: '#1C9A5B' },
];

function firstScalar(character: string): string {
  return String.fromCodePoint(character.codePointAt(0) ?? 0);
}

function isSingleScalar(character: string): boolean {
  return Array.from(character).length === 1;
}

/** Character.isCased, .isUppercase et .isLowercase de Swift. */
function isCased(character: string): boolean {
  if (isSingleScalar(character) && /\p{Cased}/u.test(character)) return true;
  return character.toUpperCase() !== character || character.toLowerCase() !== character;
}

function isUppercase(character: string): boolean {
  if (isSingleScalar(character) && /\p{Uppercase}/u.test(character)) return true;
  return character.toUpperCase() === character && isCased(character);
}

function isLowercase(character: string): boolean {
  if (isSingleScalar(character) && /\p{Lowercase}/u.test(character)) return true;
  return character.toLowerCase() === character && isCased(character);
}

/** Ni lettre, ni chiffre, ni espace (Character.isLetter, .isNumber et .isWhitespace lisent le premier point de code). */
function isSymbol(character: string): boolean {
  const scalar = firstScalar(character);
  return !/\p{L}/u.test(scalar) && !/\p{N}/u.test(scalar) && !/\p{White_Space}/u.test(scalar);
}

/**
 * `null` tant que rien n'est saisi (jauge vide, sans libellé). Règle non respectée : Faible. Règle respectée : Moyen,
 * puis un niveau de plus pour un des bonus (majuscules et minuscules, caractère spécial, 12 caractères ou plus), deux
 * niveaux pour au moins deux.
 */
export function passwordStrength(password: string): PasswordStrength | null {
  if (password === '') return null;
  if (!passwordRuleSatisfied(password)) return PASSWORD_STRENGTHS[0];
  const list = characters(password);
  const hasMixedCase = list.some(isUppercase) && list.some(isLowercase);
  const hasSymbol = list.some(isSymbol);
  const isLong = list.length >= 12;
  const bonuses = [hasMixedCase, hasSymbol, isLong].filter(Boolean).length;
  return PASSWORD_STRENGTHS[Math.min(bonuses, 2) + 1];
}

/** Texte lu par les lecteurs d'écran sur la jauge. */
export function strengthLabel(strength: PasswordStrength | null): string {
  return strength ? `Solidité du mot de passe : ${strength.label}` : 'Solidité du mot de passe';
}

// MARK: - Inscription (SignUpForm et SignUpName)

export const DISPLAY_NAME_LIMIT = 80;

/**
 * Données jointes à l'inscription, comme l'app : `first_name`, `last_name` et `display_name` (« Prénom Nom », 80
 * caractères au plus), que le serveur lit pour créer le profil. Jamais de type de compte : « Quel est votre profil ? »
 * le demande après la confirmation.
 */
export function signUpMetadata(firstName: string, lastName: string): { first_name: string; last_name: string; display_name: string } {
  const first = firstName.trim();
  const last = lastName.trim();
  const display = characters([first, last].filter(Boolean).join(' ')).slice(0, DISPLAY_NAME_LIMIT).join('');
  return { first_name: first, last_name: last, display_name: display };
}

// MARK: - « Renvoyer l'e-mail » (AuthResend)

/** Le serveur impose 60 s entre deux e-mails. */
export const RESEND_DELAY = 60;

/** Secondes restantes avant de pouvoir renvoyer (0 : possible), arrondies au-dessus. */
export function resendSecondsLeft(sentAt: number | null, now: number, delay = RESEND_DELAY): number {
  if (sentAt === null) return 0;
  return Math.max(0, Math.ceil(delay - (now - sentAt) / 1000));
}

export function resendLabel(secondsLeft: number): string {
  return secondsLeft > 0 ? `Renvoyer l'e-mail dans ${secondsLeft} s` : 'Renvoyer l\'e-mail';
}
