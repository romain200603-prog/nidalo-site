import { describe, expect, it } from 'vitest';
import { AuthError } from '@supabase/supabase-js';
import {
  authMessage, canSubmitSignUp, emailError, linkErrorMessage, NETWORK_MESSAGE, newPasswordError, PASSWORD_RULE, passwordError,
} from './auth';
import { greetingName, normalizedPhone, profileErrors, publicName, type Account, type ProfileForm } from './profile';

describe('connexion (AuthStore et AccountSession de l’app)', () => {
  it('vérifie l’adresse et le mot de passe comme l’app', () => {
    expect(emailError('  ')).toBe('Saisissez votre adresse e-mail.');
    expect(emailError('romain@exemple')).toBe('Cette adresse e-mail n\'est pas valide.');
    expect(emailError(' Romain@Exemple.fr ')).toBeNull();
    // Connexion : seulement un champ vide ; le reste est laissé au serveur (n° 40).
    expect(passwordError('')).toBe('Saisissez votre mot de passe');
    expect(passwordError('1234567')).toBeNull();
    expect(passwordError('12345678')).toBeNull();
  });

  it('nouveau mot de passe : 8 caractères au moins, avec une lettre et un chiffre (règle de Supabase)', () => {
    const refused = 'Le mot de passe doit contenir au moins 8 caractères, dont une lettre et un chiffre.';
    for (const weak of ['', 'abc123', 'abcdefgh', '12345678', 'ÉÉÉÉÉÉÉ1', 'motdepasse', '        ']) {
      expect(newPasswordError(weak)).toBe(refused);
    }
    for (const strong of ['abcdefg1', 'Nidalo2026', '1234567a', 'élan vert 9', 'A1!A1!A1']) expect(newPasswordError(strong)).toBeNull();
    // À la connexion, un ancien mot de passe sans chiffre (ou plus court) reste accepté.
    expect(passwordError('motdepasse')).toBeNull();
    expect(passwordError('abc')).toBeNull();
    expect(PASSWORD_RULE).toBe('Au moins 8 caractères, avec des lettres et des chiffres.');
  });

  it('traduit les erreurs du serveur', () => {
    const wrong = new AuthError('Invalid login credentials', 400, 'invalid_credentials');
    expect(authMessage(wrong)).toBe('E-mail ou mot de passe incorrect.');
    expect(authMessage(new AuthError('Email address not authorized', 400, 'email_address_not_authorized')))
      .toBe('L\'e-mail n\'a pas pu être envoyé à cette adresse. Réessayez plus tard.');
    expect(authMessage(new AuthError('User already registered', 422, 'user_already_exists'))).toBe('Un compte existe déjà avec cette adresse.');
    expect(authMessage(new AuthError('Email not confirmed', 400, 'email_not_confirmed'))).toBe('Votre adresse e-mail n\'est pas encore confirmée.');
    expect(authMessage(new AuthError('Token has expired or is invalid', 403, 'otp_expired'))).toBe('Ce lien a expiré ou a déjà servi. Demandez-en un nouveau.');
    expect(authMessage(new AuthError('code verifier', 400, 'bad_code_verifier')))
      .toBe('Ouvrez le lien dans le navigateur où vous avez fait la demande, puis réessayez.');
    expect(authMessage(new AuthError('Too many', 429, 'over_email_send_rate_limit'))).toBe('Trop d\'e-mails envoyés pour le moment. Réessayez dans une heure.');
    expect(authMessage(new TypeError('Failed to fetch'))).toBe(NETWORK_MESSAGE);
    expect(authMessage(new AuthError('Password should contain at least one character of each: abc…, 0123456789', 422, 'weak_password')))
      .toBe('Ce mot de passe est trop faible : il faut au moins 8 caractères, avec des lettres et des chiffres.');
    expect(authMessage({ code: 'inconnu' })).toBe('L\'opération n\'a pas abouti. Réessayez dans un instant.');
  });

  it('« Créer mon compte » actif comme l’app : prénom, nom, e-mail valide et règle du mot de passe', () => {
    const complete = { firstName: 'Camille', lastName: 'Martin', email: 'camille.martin@exemple.fr', password: 'Fourvi3re!x' };
    expect(canSubmitSignUp(complete)).toBe(true);
    expect(canSubmitSignUp({ ...complete, firstName: '  ' })).toBe(false);
    expect(canSubmitSignUp({ ...complete, lastName: '' })).toBe(false);
    expect(canSubmitSignUp({ ...complete, email: 'camille@exemple' })).toBe(false);
    expect(canSubmitSignUp({ ...complete, password: 'sanschiffre' })).toBe(false);
  });

  it('lit les erreurs des liens d’e-mail', () => {
    expect(linkErrorMessage(new URLSearchParams('error=access_denied&error_code=otp_expired'))).toBe('Ce lien a expiré ou a déjà servi. Demandez-en un nouveau.');
    expect(linkErrorMessage(new URLSearchParams('code=abc'))).toBeNull();
  });
});

describe('Mes informations (ProfileValidation de l’app)', () => {
  it('écrit les numéros par paires, comme les tests de l’app', () => {
    expect(normalizedPhone('0639981234')).toBe('06 39 98 12 34');
    expect(normalizedPhone('+33 6 39 98 12 34')).toBe('06 39 98 12 34');
    expect(normalizedPhone('04.65.71.00.00')).toBe('04 65 71 00 00');
    expect(normalizedPhone('+44 20 7946 0000')).toBe('+44 20 79 46 00 00');
    expect(normalizedPhone('+4179123456')).toBe('+41 79 12 34 56');
    for (const bad of ['063998123', '06399812345', '0039981234', 'abcdefghij', '+44 1234', '+1234567890123456']) {
      expect(normalizedPhone(bad)).toBeNull();
    }
  });

  const valid: ProfileForm = {
    firstName: 'Claire', lastName: 'Martin', birthDate: '', showsFullName: false, email: 'claire@exemple.fr', phone: '',
    street: '', postalCode: '', city: '', situation: null, accountType: 'individual',
  };

  it('accepte un formulaire complet et signale les erreurs champ par champ', () => {
    const now = new Date(2026, 10, 6);
    expect(profileErrors(valid, now)).toEqual({});
    expect(profileErrors({ ...valid, firstName: '' }, now).firstName).toBeDefined();
    expect(profileErrors({ ...valid, lastName: 'M4rtin' }, now).lastName).toBeDefined();
    expect(profileErrors({ ...valid, birthDate: '2027-01-01' }, now).birthDate).toBe('La date de naissance ne peut pas être dans le futur.');
    expect(profileErrors({ ...valid, phone: '1234' }, now).phone).toBeDefined();
    const address = profileErrors({ ...valid, street: '3 rue de la République' }, now);
    expect(address.postalCode).toBe('Indiquez le code postal.');
    expect(address.city).toBe('Indiquez la ville.');
    expect(profileErrors({ ...valid, postalCode: '6900', city: 'Lyon' }, now).postalCode).toBe('Le code postal compte 5 chiffres.');
  });

  it('l’e-mail du compte, en lecture seule, ne bloque jamais l’enregistrement (n° 222)', () => {
    const now = new Date(2026, 10, 6);
    for (const email of ['', '   ', 'claire@exemple', 'pas une adresse']) expect(profileErrors({ ...valid, email }, now)).toEqual({});
  });

  it('montre « Prénom N. » sauf si le nom complet est choisi', () => {
    expect(publicName('Claire', 'martin', false)).toBe('Claire M.');
    expect(publicName('Claire', 'Martin', true)).toBe('Claire Martin');
    expect(publicName('Claire', '', false)).toBe('Claire');
  });

  it('dit bonjour avec le prénom, sauf quand le nom vient de l’e-mail', () => {
    const account = (display: string, first: string | null, email = 'claire.martin@exemple.fr') => ({
      profile: { display_name: display }, details: first === null ? null : { first_name: first }, email,
    }) as unknown as Account;
    expect(greetingName(account('Claire Martin', null))).toBe('Claire');
    expect(greetingName(account('Claire Martin', 'Clara'))).toBe('Clara');
    expect(greetingName(account('claire.martin', null))).toBeNull();
    expect(greetingName(account('Claire.Martin', null))).toBeNull();
  });
});
