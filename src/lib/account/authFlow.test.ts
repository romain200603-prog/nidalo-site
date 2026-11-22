import { describe, expect, it } from 'vitest';
import {
  characters, PASSWORD_HINT, PASSWORD_STRENGTHS, passwordRuleSatisfied, passwordStrength, resendLabel, resendSecondsLeft,
  SCREEN_TEXTS, screenBack, signUpMetadata, strengthLabel,
} from './authFlow';

// Mêmes cas que l'app (ImmoDomainTests/AuthFlowTests.swift).
describe('connexion : jauge du mot de passe (PasswordStrength de l’app)', () => {
  const level = (password: string) => passwordStrength(password)?.label ?? null;

  it('rien de saisi : aucun niveau', () => {
    expect(passwordStrength('')).toBeNull();
    expect(strengthLabel(null)).toBe('Solidité du mot de passe');
  });

  it('règle non respectée : Faible', () => {
    expect(level('abc')).toBe('Faible');
    expect(level('abcdefgh')).toBe('Faible');
    expect(level('Abc!1')).toBe('Faible');
    expect(level('12345678')).toBe('Faible');
  });

  it('règle respectée sans bonus : Moyen ; un bonus : Bon ; deux : Solide', () => {
    expect(level('abcdefg1')).toBe('Moyen');
    expect(level('Abcdefg1')).toBe('Bon');
    expect(level('abcdefg1!')).toBe('Bon');
    expect(level('abcdefghijk1')).toBe('Bon');
    expect(level('Fourvi3re!x')).toBe('Solide');
    expect(level('abcdefghijk1!')).toBe('Solide');
    // Une espace n'est pas un caractère spécial ; une lettre accentuée compte pour les majuscules et minuscules.
    expect(level('abcd efg1')).toBe('Moyen');
    expect(level('Éabcdefg1')).toBe('Bon');
    expect(strengthLabel(passwordStrength('Fourvi3re!x'))).toBe('Solidité du mot de passe : Solide');
  });

  it('chaque niveau remplit autant de segments, de sa propre couleur', () => {
    expect(PASSWORD_STRENGTHS.map((strength) => strength.level)).toEqual([1, 2, 3, 4]);
    expect(PASSWORD_STRENGTHS.map((strength) => strength.label)).toEqual(['Faible', 'Moyen', 'Bon', 'Solide']);
    expect(PASSWORD_STRENGTHS[0].color).toBe('#D64545');
    expect(PASSWORD_STRENGTHS[3].color).toBe('#1C9A5B');
    expect(new Set(PASSWORD_STRENGTHS.map((strength) => strength.color)).size).toBe(4);
  });

  it('règle : 8 caractères, avec une lettre a-z et un chiffre 0-9 (comme Supabase)', () => {
    expect(passwordRuleSatisfied('1234567')).toBe(false);
    expect(passwordRuleSatisfied('1234567a')).toBe(true);
    expect(passwordRuleSatisfied('motdepasse')).toBe(false);
    expect(passwordRuleSatisfied('abcdefgh')).toBe(false);
    expect(passwordRuleSatisfied('12345678')).toBe(false);
    expect(passwordRuleSatisfied('abcdefg1')).toBe(true);
    expect(passwordRuleSatisfied('éééééé12')).toBe(false);
    expect(PASSWORD_HINT).toBe('Au moins 8 caractères, avec des lettres et des chiffres.');
    // « é » écrit avec un accent séparé compte pour un seul caractère, comme dans l'app.
    expect(characters('é')).toHaveLength(1);
    expect(passwordRuleSatisfied('aééééé1')).toBe(false);
  });
});

describe('connexion : inscription (SignUpForm et SignUpName de l’app)', () => {
  it('joint le prénom, le nom et le nom affiché, sans type de compte', () => {
    const data = signUpMetadata(' Camille ', 'Martin ');
    expect(data).toEqual({ first_name: 'Camille', last_name: 'Martin', display_name: 'Camille Martin' });
    expect('account_type' in data).toBe(false);
    expect(signUpMetadata('Camille', '  ').display_name).toBe('Camille');
  });

  it('coupe le nom affiché à 80 caractères', () => {
    const long = 'a'.repeat(70);
    expect(signUpMetadata(long, long).display_name).toHaveLength(80);
  });
});

describe('connexion : étapes, retours et compte à rebours (AuthScreen et AuthResend de l’app)', () => {
  it('la flèche retour ramène à l’étape d’avant', () => {
    expect(screenBack('welcome')).toBeNull();
    expect(screenBack('signIn')).toBe('welcome');
    expect(screenBack('signUp')).toBe('welcome');
    expect(screenBack('forgotPassword')).toBe('signIn');
    expect(screenBack('linkSent')).toBe('signIn');
    expect(screenBack('confirmEmail')).toBe('signIn');
    expect(screenBack('newPassword')).toBeNull();
  });

  it('les titres de l’app', () => {
    expect(SCREEN_TEXTS.welcome.title).toBe('Votre prochain bien commence ici.');
    expect(SCREEN_TEXTS.signIn.title).toBe('Ravi de vous revoir');
    expect(SCREEN_TEXTS.signUp.title).toBe('Créez votre compte');
    expect(SCREEN_TEXTS.forgotPassword.title).toBe('Mot de passe oublié ?');
    expect(SCREEN_TEXTS.linkSent.title).toBe('E-mail envoyé');
    expect(SCREEN_TEXTS.confirmEmail.title).toBe('Confirmez votre adresse e-mail');
    expect(SCREEN_TEXTS.newPassword.title).toBe('Nouveau mot de passe');
  });

  it('le compte à rebours suit le délai du serveur', () => {
    const sent = 1_800_000_000_000;
    expect(resendSecondsLeft(null, sent)).toBe(0);
    expect(resendSecondsLeft(sent, sent)).toBe(60);
    expect(resendSecondsLeft(sent, sent + 18_000)).toBe(42);
    expect(resendSecondsLeft(sent, sent + 59_200)).toBe(1);
    expect(resendSecondsLeft(sent, sent + 75_000)).toBe(0);
    expect(resendLabel(42)).toBe('Renvoyer l\'e-mail dans 42 s');
    expect(resendLabel(0)).toBe('Renvoyer l\'e-mail');
  });
});
