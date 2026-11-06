import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Icon } from '../Icon';
import type { IconName } from '../iconPaths';
import { AlertDialog } from '../../pages/listing/Dialogs';
import {
  authMessage, cleanEmail, emailError, passwordError, RESEND_DELAY_SECONDS, resendConfirmation, sendPasswordReset, signIn,
  signUp, updatePassword, type LinkPurpose,
} from '../../lib/account/auth';
import { recoveryStore } from '../../lib/account/session';
import { PATHS } from '../../lib/paths';

// Carte de connexion de l'app (Features/Account/AccountSignInView.swift) : se connecter, créer un compte,
// mot de passe oublié, « Vérifiez votre boîte mail » et « Nouveau mot de passe ».

type Flow = { kind: 'form' } | { kind: 'checkEmail'; email: string; purpose: LinkPurpose } | { kind: 'newPassword' };

type Props = {
  /** Dans la fenêtre d'une action qui demande un compte : bouton « Fermer ». */
  onClose?: () => void;
  /** Connexion réussie (la session est déjà là). */
  onSignedIn?: () => void;
  /** Lien d'e-mail qui n'a pas pu servir. */
  linkError?: string | null;
  /** Lien « Mot de passe oublié » ouvert : demander le nouveau mot de passe. */
  recovery?: boolean;
  /** Nouveau mot de passe enregistré. */
  onPasswordSaved?: () => void;
};

export function SignInCard({ onClose, onSignedIn, linkError = null, recovery = false, onPasswordSaved }: Props) {
  const [flow, setFlow] = useState<Flow>(recovery ? { kind: 'newPassword' } : { kind: 'form' });
  const [isSignUp, setSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showsPassword, setShowsPassword] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(linkError);
  const [alreadyExists, setAlreadyExists] = useState(false);
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState<string | null>(null);
  const [resendAt, setResendAt] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [notice, setNotice] = useState<'apple' | 'google' | null>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const titleId = useId();

  useEffect(() => {
    if (recovery) setFlow({ kind: 'newPassword' });
  }, [recovery]);

  // Compte à rebours de « Renvoyer l'e-mail ».
  useEffect(() => {
    if (resendAt <= now) return;
    const timer = window.setTimeout(() => setNow(Date.now()), 1000);
    return () => window.clearTimeout(timer);
  }, [resendAt, now]);

  const fieldErrors = submitted ? { email: emailError(email), password: passwordError(password) } : { email: null, password: null };

  function clearMessages() {
    setError(null);
    setInfo(null);
    setAlreadyExists(false);
  }

  function switchMode(signUpMode: boolean) {
    clearMessages();
    setSubmitted(false);
    setPassword('');
    setSignUp(signUpMode);
  }

  function goBack() {
    clearMessages();
    if (flow.kind !== 'form') {
      if (flow.kind === 'newPassword') recoveryStore.set(false);
      setFlow({ kind: 'form' });
      return;
    }
    switchMode(false);
  }

  function showCheckEmail(address: string, purpose: LinkPurpose) {
    setFlow({ kind: 'checkEmail', email: address, purpose });
    const at = Date.now() + RESEND_DELAY_SECONDS * 1000;
    setNow(Date.now());
    setResendAt(at);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    clearMessages();
    setSubmitted(true);
    if (emailError(email) || passwordError(password)) {
      (emailError(email) ? emailRef : passwordRef).current?.focus();
      return;
    }
    setBusy(true);
    try {
      if (isSignUp) {
        const outcome = await signUp(email, password);
        if (outcome === 'signedIn') {
          setPassword('');
          onSignedIn?.();
        } else if (outcome === 'checkEmail') {
          setPassword('');
          showCheckEmail(cleanEmail(email), 'signup');
        } else {
          setPassword('');
          setError('Un compte existe déjà avec cette adresse. Connectez-vous, ou choisissez un nouveau mot de passe.');
          setAlreadyExists(true);
        }
      } else {
        try {
          await signIn(email, password);
          setPassword('');
          onSignedIn?.();
        } catch (failure) {
          if ((failure as { code?: string }).code === 'email_not_confirmed') {
            // Adresse pas encore confirmée : l'app renvoie l'e-mail de confirmation.
            await resendConfirmation(email);
            setPassword('');
            showCheckEmail(cleanEmail(email), 'signup');
          } else {
            throw failure;
          }
        }
      }
    } catch (failure) {
      setPassword('');
      setError(authMessage(failure));
    } finally {
      setBusy(false);
    }
  }

  async function forgotPassword() {
    if (busy) return;
    clearMessages();
    if (emailError(email)) {
      setError('Saisissez d\'abord votre adresse e-mail.');
      emailRef.current?.focus();
      return;
    }
    setBusy(true);
    try {
      await sendPasswordReset(email);
      setSignUp(false);
      setSubmitted(false);
      showCheckEmail(cleanEmail(email), 'recovery');
    } catch (failure) {
      setError(authMessage(failure));
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    if (flow.kind !== 'checkEmail' || busy || resendAt > Date.now()) return;
    clearMessages();
    setBusy(true);
    try {
      if (flow.purpose === 'signup') await resendConfirmation(flow.email);
      else await sendPasswordReset(flow.email);
      setInfo('Nouvel e-mail envoyé.');
      setNow(Date.now());
      setResendAt(Date.now() + RESEND_DELAY_SECONDS * 1000);
    } catch (failure) {
      setError(authMessage(failure));
    } finally {
      setBusy(false);
    }
  }

  async function saveNewPassword(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    clearMessages();
    setSubmitted(true);
    if (passwordError(password)) {
      passwordRef.current?.focus();
      return;
    }
    setBusy(true);
    try {
      await updatePassword(password);
      setPassword('');
      setSubmitted(false);
      recoveryStore.set(false);
      setFlow({ kind: 'form' });
      onPasswordSaved?.();
    } catch (failure) {
      setError(authMessage(failure));
    } finally {
      setBusy(false);
    }
  }

  const showsBack = isSignUp || flow.kind !== 'form';
  const showsClose = Boolean(onClose) && !showsBack;
  const secondsLeft = Math.max(0, Math.ceil((resendAt - now) / 1000));

  return (
    <div className="signin">
      <div className="signin-band">
        {showsClose && (
          <button type="button" className="band-button" onClick={onClose} aria-label="Fermer">
            <Icon name="x" />
          </button>
        )}
        {showsBack && (
          <button type="button" className="band-button" onClick={goBack} aria-label="Retour">
            <Icon name="arrowLeft" />
          </button>
        )}
        <img className="signin-app-icon" src="/apple-touch-icon.png" width={60} height={60} alt="" />
      </div>
      <section className="signin-card" aria-labelledby={titleId}>
        {flow.kind === 'form' && (
          <form onSubmit={submit} noValidate>
            <h1 id={titleId} className="signin-title">Bienvenue sur NIDALO</h1>
            <p className="signin-subtitle">
              {isSignUp ? 'Créez votre compte en quelques secondes.' : 'Connectez-vous pour retrouver vos projets immobiliers.'}
            </p>
            <div className="signin-fields">
              <AuthField icon="mail" error={fieldErrors.email}>
                <input
                  ref={emailRef}
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  placeholder="Adresse e-mail"
                  aria-label="Adresse e-mail"
                  aria-invalid={fieldErrors.email ? true : undefined}
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
              </AuthField>
              <AuthField icon="lock" error={fieldErrors.password}>
                <input
                  ref={passwordRef}
                  type={showsPassword ? 'text' : 'password'}
                  autoComplete={isSignUp ? 'new-password' : 'current-password'}
                  placeholder="Mot de passe"
                  aria-label="Mot de passe"
                  aria-invalid={fieldErrors.password ? true : undefined}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
                <EyeButton shown={showsPassword} onToggle={() => setShowsPassword(!showsPassword)} />
              </AuthField>
            </div>
            {!isSignUp && (
              <div className="signin-forgot">
                <button type="button" className="link-button" onClick={forgotPassword} disabled={busy}>Mot de passe oublié ?</button>
              </div>
            )}
            {error && <p className="signin-error" role="alert">{error}</p>}
            {alreadyExists && (
              <div className="signin-small-row">
                <button type="button" className="small-button" onClick={() => switchMode(false)}>Se connecter</button>
                <button type="button" className="small-button" onClick={forgotPassword}>Mot de passe oublié ?</button>
              </div>
            )}
            <button type="submit" className="signin-primary" disabled={busy}>
              {busy ? <span className="spinner spinner-white" aria-label="Patientez" /> : isSignUp ? 'Créer mon compte' : 'Se connecter'}
            </button>
            {isSignUp ? <LegalLine /> : (
              <div className="signin-create">
                <p>Vous n&apos;avez pas encore de compte ?</p>
                <button type="button" className="signin-secondary" onClick={() => switchMode(true)}>Créer un compte</button>
              </div>
            )}
            <div className="signin-divider"><span>ou continuer avec</span></div>
            <div className="signin-providers">
              <button type="button" className="provider provider-apple" onClick={() => setNotice('apple')}>
                <AppleLogo />
                Continuer avec Apple
              </button>
              <button type="button" className="provider provider-google" onClick={() => setNotice('google')}>
                <GoogleLogo />
                Continuer avec Google
              </button>
            </div>
            {!isSignUp && <LegalLine />}
          </form>
        )}

        {flow.kind === 'checkEmail' && (
          <div>
            <span className="icon-tile icon-tile-48"><Icon name="mail" /></span>
            <h1 id={titleId} className="signin-title signin-title-gap">Vérifiez votre boîte mail</h1>
            <p className="signin-subtitle">
              {flow.purpose === 'signup'
                ? <>Nous avons envoyé un lien à <strong>{flow.email}</strong>. Choisissez « Confirm email address » dans l&apos;e-mail pour confirmer votre compte : NIDALO s&apos;ouvrira.</>
                : <>Nous avons envoyé un lien à <strong>{flow.email}</strong>. Choisissez « Reset password » dans l&apos;e-mail : NIDALO s&apos;ouvrira pour choisir un nouveau mot de passe.</>}
            </p>
            <ul className="signin-tips">
              <li><Icon name="lock" />Ouvrez l&apos;e-mail sur cet appareil : le lien ne fonctionne que dans le navigateur où vous avez fait la demande.</li>
              <li><Icon name="mail" />L&apos;e-mail est en anglais et peut mettre une minute à arriver. Regardez aussi dans les courriers indésirables.</li>
            </ul>
            {error && <p className="signin-error" role="alert">{error}</p>}
            {info && <p className="signin-info" role="status">{info}</p>}
            <div className="signin-stack">
              <button type="button" className="small-button" onClick={resend} disabled={busy || secondsLeft > 0}>
                {secondsLeft > 0 ? `Renvoyer l'e-mail (${secondsLeft} s)` : 'Renvoyer l\'e-mail'}
              </button>
              <button type="button" className="small-button" onClick={() => { clearMessages(); setEmail(flow.email); setFlow({ kind: 'form' }); }}>
                Modifier l&apos;adresse
              </button>
            </div>
          </div>
        )}

        {flow.kind === 'newPassword' && (
          <form onSubmit={saveNewPassword} noValidate>
            <h1 id={titleId} className="signin-title">Nouveau mot de passe</h1>
            <p className="signin-subtitle">Choisissez un mot de passe d&apos;au moins 8 caractères.</p>
            <div className="signin-fields">
              <AuthField icon="lock" error={fieldErrors.password}>
                <input
                  ref={passwordRef}
                  type={showsPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  placeholder="Nouveau mot de passe"
                  aria-label="Nouveau mot de passe"
                  aria-invalid={fieldErrors.password ? true : undefined}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
                <EyeButton shown={showsPassword} onToggle={() => setShowsPassword(!showsPassword)} />
              </AuthField>
            </div>
            {error && <p className="signin-error" role="alert">{error}</p>}
            <button type="submit" className="signin-primary" disabled={busy}>
              {busy ? <span className="spinner spinner-white" aria-label="Patientez" /> : 'Enregistrer le mot de passe'}
            </button>
          </form>
        )}
      </section>

      <AlertDialog
        open={notice !== null}
        onClose={() => setNotice(null)}
        title="Bientôt disponible"
        message={notice === 'apple'
          ? 'La connexion avec Apple arrivera dans une prochaine version. En attendant, connectez-vous avec votre adresse e-mail.'
          : 'La connexion avec Google arrivera dans une prochaine version. En attendant, connectez-vous avec votre adresse e-mail.'}
        actions={[{ label: 'J\'ai compris', onClick: () => setNotice(null), tone: 'primary' }]}
      />
    </div>
  );
}

function AuthField({ icon, error, children }: { icon: IconName; error: string | null; children: ReactNode }) {
  return (
    <div>
      <label className={`auth-field${error ? ' has-error' : ''}`}>
        <Icon name={icon} />
        {children}
      </label>
      {error && <p className="field-error">{error}</p>}
    </div>
  );
}

function EyeButton({ shown, onToggle }: { shown: boolean; onToggle: () => void }) {
  const label = shown ? 'Masquer le mot de passe' : 'Afficher le mot de passe';
  return (
    <button type="button" className="eye-button" onClick={onToggle} aria-label={label} title={label}>
      <Icon name={shown ? 'eyeOff' : 'eye'} />
    </button>
  );
}

function LegalLine() {
  return (
    <p className="signin-legal">
      En continuant, vous acceptez nos <a href={PATHS.terms}>Conditions d&apos;utilisation</a> et notre{' '}
      <a href={PATHS.privacy}>Politique de confidentialité</a>.
    </p>
  );
}

function AppleLogo() {
  return (
    <svg className="provider-logo" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path fill="currentColor" d="M16.37 12.6c-.02-2.2 1.8-3.26 1.88-3.31-1.03-1.5-2.62-1.7-3.18-1.73-1.35-.14-2.64.8-3.33.8-.69 0-1.74-.78-2.86-.76-1.47.02-2.83.86-3.59 2.17-1.53 2.65-.39 6.58 1.1 8.73.73 1.05 1.6 2.23 2.73 2.19 1.1-.04 1.51-.71 2.84-.71 1.32 0 1.7.71 2.86.69 1.18-.02 1.93-1.07 2.65-2.13.84-1.22 1.18-2.4 1.2-2.46-.03-.01-2.3-.88-2.3-3.48ZM14.2 6.13c.6-.73 1.01-1.75.9-2.76-.87.04-1.92.58-2.54 1.31-.56.65-1.05 1.68-.92 2.67.97.08 1.96-.49 2.56-1.22Z" />
    </svg>
  );
}

function GoogleLogo() {
  return (
    <svg className="provider-logo" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1Z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z" />
      <path fill="#FBBC05" d="M5.84 14.1A6.6 6.6 0 0 1 5.49 12c0-.73.13-1.44.35-2.1V7.06H2.18A11 11 0 0 0 1 12c0 1.78.43 3.45 1.18 4.94l3.66-2.84Z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.06L5.84 9.9C6.71 7.31 9.14 5.38 12 5.38Z" />
    </svg>
  );
}
