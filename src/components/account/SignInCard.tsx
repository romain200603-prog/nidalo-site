import {
  useEffect, useId, useLayoutEffect, useRef, useState, type FormEvent, type MouseEvent, type ReactNode,
} from 'react';
import { Icon } from '../Icon';
import type { IconName } from '../iconPaths';
import { cameFromSite } from '../PageHeader';
import { AuthLaunchLoop } from './AuthLaunchLoop';
import { LegalSheet, openLegalOnClick, type LegalPage } from './LegalSheet';
import { ScreenMotion, shake, type MotionElements } from './authMotion';
import {
  ACCOUNT_EXISTS_MESSAGE, authMessage, canSubmitSignUp, cleanEmail, emailError, INVALID_CREDENTIALS_MESSAGE, isNetworkError,
  passwordError, providerMessage, resendConfirmation, sendPasswordReset, signIn, signInWithProvider, signUp, updatePassword,
  type Provider,
} from '../../lib/account/auth';
import {
  PASSWORD_HINT, passwordRuleSatisfied, passwordStrength, resendLabel, resendSecondsLeft, SCREEN_TEXTS, screenBack, strengthLabel,
  type AuthScreen,
} from '../../lib/account/authFlow';
import { recoveryStore } from '../../lib/account/session';
import { PATHS } from '../../lib/paths';
import '../../styles/connexion-app.css';
import '../../styles/connexion-ordinateur.css';

// Écran de connexion de l'app (Features/Account/AuthView.swift) : l'accueil sur le fond clair avec le lancement en
// boucle, « Continuer avec Apple / Google / l'e-mail », puis les étapes par e-mail dans la feuille blanche (se
// connecter, créer un compte, mot de passe oublié, e-mail envoyé, nouveau mot de passe). Apple et Google ouvrent la page
// du service, qui revient sur Mon compte. Sur toutes les largeurs, l'écran prend toute la page, sans barre d'onglets ni
// pied de page, et sa croix ramène à la page d'avant ; dans la fenêtre d'une action (`onClose`), le même écran. À partir
// de 1024 px (maquette 13-connexion.html, connexion-ordinateur.css) : le même écran dans une colonne de 440 px, centrée
// dans la fenêtre ; rien ne change dans le code.
// L'étape « Vérifiez votre e-mail » (code à 6 chiffres) de l'app n'est pas reprise : les e-mails ne contiennent qu'un lien.

type Props = {
  /** Dans la fenêtre d'une action qui demande un compte : la croix de l'accueil la ferme. */
  onClose?: () => void;
  /** Connexion réussie (la session est déjà là). */
  onSignedIn?: () => void;
  /** Lien d'e-mail qui n'a pas pu servir : l'étape « Ravi de vous revoir », avec le message. */
  linkError?: string | null;
  /** Retour de Google ou d'Apple sans connexion : le message sur l'accueil, sous les boutons. */
  providerError?: string | null;
  /** Lien « Mot de passe oublié » ouvert : demander le nouveau mot de passe. */
  recovery?: boolean;
  /** Nouveau mot de passe enregistré. */
  onPasswordSaved?: () => void;
  /** Mot sous le titre (une invitation d'équipe qui attend la connexion, par exemple). */
  notice?: ReactNode;
};

/** Champs mis en rouge par un échec. */
type Field = 'email' | 'password' | 'newPassword';

/** E-mail parti : l'adresse et l'heure d'envoi (compte à rebours de « Renvoyer l'e-mail »). */
type Sent = { email: string; at: number };

const NO_FIELDS: ReadonlySet<Field> = new Set();

export function SignInCard({ onClose, onSignedIn, linkError = null, providerError = null, recovery = false, onPasswordSaved, notice }: Props) {
  const inDialog = Boolean(onClose);
  const [screen, setScreen] = useState<AuthScreen>(() => (recovery ? 'newPassword' : linkError ? 'signIn' : 'welcome'));
  const [sent, setSent] = useState<Sent | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [showsPassword, setShowsPassword] = useState(false);
  /** Message sous le formulaire (identifiants incorrects, réseau, Google ou Apple…). */
  const [authError, setAuthError] = useState<string | null>(providerError);
  /** Lien de l'e-mail refusé : affiché dans la feuille jusqu'au prochain changement d'étape choisi. */
  const [linkMessage, setLinkMessage] = useState<string | null>(linkError);
  const [errorFields, setErrorFields] = useState<ReadonlySet<Field>>(NO_FIELDS);
  /** Message rouge sous l'e-mail de l'inscription (adresse déjà inscrite) ; `accountExists` : lien « Se connecter ». */
  const [emailMessage, setEmailMessage] = useState<string | null>(null);
  const [accountExists, setAccountExists] = useState(false);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  /** Départ vers la page de Google ou d'Apple en cours : son bouton attend, les autres ne répondent plus. */
  const [leaving, setLeaving] = useState<Provider | null>(null);
  /** L'écran a fini de s'ouvrir : le premier tour du lancement peut démarrer (0,5 s, comme l'app). */
  const [opened, setOpened] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  /** Chaque échec secoue les champs en rouge. */
  const [failures, setFailures] = useState(0);
  const [motion] = useState(() => new ScreenMotion());
  const titleId = useId();

  const root = useRef<HTMLElement>(null);
  const title = useRef<HTMLHeadingElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const stageGhosts = useRef<HTMLDivElement>(null);
  const layer = useRef<HTMLDivElement>(null);
  const headGhosts = useRef<HTMLDivElement>(null);
  const head = useRef<HTMLDivElement>(null);
  const sheet = useRef<HTMLDivElement>(null);
  const contentGhosts = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLElement | null>(null);
  // Champs (pour la secousse et pour passer au suivant avec Entrée).
  const fields = useRef<Partial<Record<Field | 'lastName', HTMLDivElement | null>>>({});
  const current = useRef(screen);
  useLayoutEffect(() => { current.current = screen; });

  const elements = (): MotionElements => ({
    stage: stage.current, stageGhosts: stageGhosts.current, layer: layer.current, headGhosts: headGhosts.current,
    head: head.current, sheet: sheet.current, contentGhosts: contentGhosts.current, content: content.current,
  });

  /** Changement d'étape : les messages et les champs rouges s'effacent, comme dans l'app. */
  function changeScreen(next: AuthScreen) {
    const from = current.current;
    if (next === from) return;
    motion.capture(elements(), from === 'welcome', next === 'welcome');
    current.current = next;
    if (from === 'newPassword') setNewPassword('');
    setAuthError(null);
    setErrorFields(NO_FIELDS);
    setEmailMessage(null);
    setAccountExists(false);
    setInfo(null);
    setScreen(next);
  }

  /** Étape choisie (bouton, retour) : l'e-mail envoyé et le lien refusé sont oubliés, le mot de passe effacé. */
  function go(next: AuthScreen) {
    blur();
    setSent(null);
    setLinkMessage(null);
    setPassword('');
    setShowsPassword(false);
    changeScreen(next);
  }

  function showSent(next: 'linkSent' | 'confirmEmail', address: string) {
    const at = Date.now();
    setSent({ email: address, at });
    setNow(at);
    changeScreen(next);
  }

  function fail(failed: Field[], message: string | null) {
    setErrorFields(failed.length ? new Set(failed) : NO_FIELDS);
    if (message !== null) setAuthError(message);
    setFailures((count) => count + 1);
  }

  // Après chaque changement d'étape : les mouvements, puis le titre de l'étape reçoit le focus ; le bas de l'écran
  // reste visible (comme l'ancrage en bas de l'app).
  useLayoutEffect(() => {
    if (!motion.play(elements())) return;
    const scroller = root.current;
    if (scroller && scroller.scrollHeight > scroller.clientHeight && getComputedStyle(scroller).overflowY !== 'visible') {
      scroller.scrollTop = scroller.scrollHeight;
    }
    title.current?.focus({ preventScroll: true });
  }, [screen]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => motion.stop(), [motion]);

  useEffect(() => {
    const timer = window.setTimeout(() => setOpened(true), 500);
    return () => window.clearTimeout(timer);
  }, []);

  // Props reçues après coup : le lien refusé ouvre « Ravi de vous revoir » ; le retour de Google ou d'Apple, l'accueil.
  useEffect(() => {
    if (linkError === null) return;
    setLinkMessage(linkError);
    if (current.current === 'welcome') changeScreen('signIn');
  }, [linkError]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (providerError !== null) setAuthError(providerError);
  }, [providerError]);
  useEffect(() => {
    if (recovery) changeScreen('newPassword');
  }, [recovery]); // eslint-disable-line react-hooks/exhaustive-deps

  // Retour arrière depuis la page de Google ou d'Apple : le navigateur peut remontrer cette page telle quelle ; elle
  // se réveille.
  useEffect(() => {
    const wake = (event: PageTransitionEvent) => {
      if (!event.persisted) return;
      setLeaving(null);
      setBusy(false);
    };
    window.addEventListener('pageshow', wake);
    return () => window.removeEventListener('pageshow', wake);
  }, []);

  // Compte à rebours de « Renvoyer l'e-mail ».
  useEffect(() => {
    if (!sent) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [sent]);

  // Chaque échec : les champs en rouge se secouent (sauf « Réduire les animations »).
  useEffect(() => {
    if (!failures) return;
    for (const field of errorFields) shake(fields.current[field] ?? null);
    if (emailMessage !== null) shake(fields.current.email ?? null);
  }, [failures]); // eslint-disable-line react-hooks/exhaustive-deps

  function blur() {
    const active = document.activeElement;
    if (active instanceof HTMLElement && root.current?.contains(active)) active.blur();
  }

  function editEmail(value: string) {
    setEmail(value);
    setErrorFields((previous) => without(previous, 'email'));
    setEmailMessage(null);
    setAccountExists(false);
  }

  function editPassword(value: string) {
    setPassword(value);
    setErrorFields((previous) => without(previous, 'password'));
  }

  function editNewPassword(value: string) {
    setNewPassword(value);
    setErrorFields((previous) => without(previous, 'newPassword'));
  }

  // MARK: Croix et retour

  /** Croix de l'accueil : la fenêtre se ferme ; la page revient en arrière (l'accueil du site sans page d'avant). */
  function closeWelcome() {
    if (onClose) {
      onClose();
      return;
    }
    if (cameFromSite()) window.history.back();
    else window.location.assign(PATHS.home);
  }

  /** Croix du nouveau mot de passe : le remet à plus tard (le compte garde l'ancien). */
  function postponeNewPassword() {
    recoveryStore.set(false);
    onClose?.();
  }

  // MARK: Actions

  async function submitSignIn(event?: FormEvent) {
    event?.preventDefault();
    if (busy) return;
    setAuthError(null);
    setErrorFields(NO_FIELDS);
    const emailProblem = emailError(email);
    if (emailProblem) {
      fail(['email'], emailProblem);
      return;
    }
    // Connexion : seulement un champ vide ; le reste est laissé au serveur (n° 40).
    const passwordProblem = passwordError(password);
    if (passwordProblem) {
      fail(['password'], passwordProblem);
      return;
    }
    blur();
    setBusy(true);
    try {
      await signIn(email, password);
      setPassword('');
      // L'écran attend que le compte soit prêt, puis laisse la place (n° 41) : le bouton reste en attente.
      onSignedIn?.();
      return;
    } catch (failure) {
      if ((failure as { code?: string } | null)?.code === 'email_not_confirmed') {
        // Adresse pas encore confirmée : un nouvel e-mail de confirmation, puis « Confirmez votre adresse e-mail ».
        try {
          await resendConfirmation(email);
          setPassword('');
          showSent('confirmEmail', cleanEmail(email));
        } catch (resendFailure) {
          fail([], authMessage(resendFailure));
        }
      } else {
        setPassword('');
        const message = authMessage(failure);
        fail(message === INVALID_CREDENTIALS_MESSAGE ? ['email', 'password'] : [], message);
      }
    }
    setBusy(false);
  }

  async function submitSignUp(event?: FormEvent) {
    event?.preventDefault();
    if (busy) return;
    setAuthError(null);
    if (!canSubmitSignUp({ firstName, lastName, email, password })) return;
    blur();
    setBusy(true);
    try {
      const outcome = await signUp(email, password, firstName, lastName);
      setPassword('');
      if (outcome === 'signedIn') {
        onSignedIn?.();
        return;
      }
      if (outcome === 'checkEmail') {
        showSent('confirmEmail', cleanEmail(email));
      } else {
        setEmailMessage(ACCOUNT_EXISTS_MESSAGE);
        setAccountExists(true);
        setFailures((count) => count + 1);
      }
    } catch (failure) {
      const message = authMessage(failure);
      if (message === ACCOUNT_EXISTS_MESSAGE) {
        setEmailMessage(message);
        setAccountExists(true);
        setFailures((count) => count + 1);
      } else {
        fail([], message);
      }
    }
    setBusy(false);
  }

  async function submitForgot(event?: FormEvent) {
    event?.preventDefault();
    if (busy) return;
    setAuthError(null);
    const emailProblem = emailError(email);
    if (emailProblem) {
      fail(['email'], emailProblem);
      fields.current.email?.querySelector('input')?.focus();
      return;
    }
    blur();
    setBusy(true);
    try {
      await sendPasswordReset(email);
      showSent('linkSent', cleanEmail(email));
    } catch (failure) {
      fail([], authMessage(failure));
    }
    setBusy(false);
  }

  async function resend() {
    if (!sent || busy || resendSecondsLeft(sent.at, Date.now()) > 0) return;
    setBusy(true);
    try {
      if (screen === 'linkSent') await sendPasswordReset(sent.email);
      else await resendConfirmation(sent.email);
      const at = Date.now();
      setSent({ email: sent.email, at });
      setNow(at);
      setAuthError(null);
      setInfo('Nouvel e-mail envoyé.');
    } catch (failure) {
      setInfo(null);
      fail([], authMessage(failure));
    }
    setBusy(false);
  }

  async function submitNewPassword(event?: FormEvent) {
    event?.preventDefault();
    if (busy) return;
    if (!passwordRuleSatisfied(newPassword)) {
      fail(['newPassword'], null);
      return;
    }
    blur();
    setBusy(true);
    try {
      await updatePassword(newPassword);
      setNewPassword('');
      recoveryStore.set(false);
      onPasswordSaved?.();
      return;
    } catch (failure) {
      fail([], authMessage(failure));
    }
    setBusy(false);
  }

  async function continueWith(provider: Provider) {
    if (busy) return;
    blur();
    setAuthError(null);
    setBusy(true);
    setLeaving(provider);
    try {
      // On revient ensuite sur cette page (fiche, favoris…), comme après une connexion dans la fenêtre.
      await signInWithProvider(provider, `${window.location.pathname}${window.location.search}`);
    } catch (failure) {
      setLeaving(null);
      setBusy(false);
      fail([], isNetworkError(failure) ? authMessage(failure) : providerMessage(provider));
    }
  }

  // MARK: Affichage

  const texts = SCREEN_TEXTS[screen];
  const back = screenBack(screen);
  const message = authError ?? linkMessage;
  const fieldRef = (field: Field) => (element: HTMLDivElement | null) => { fields.current[field] = element; };
  const providers = (
    <>
      <button type="button" className="auth-provider auth-apple" onClick={() => void continueWith('apple')} disabled={busy} aria-busy={leaving === 'apple' || undefined}>
        {leaving === 'apple' ? <span className="spinner spinner-white" aria-hidden="true" /> : <AppleLogo />}
        Continuer avec Apple
      </button>
      <button type="button" className="auth-provider auth-google" onClick={() => void continueWith('google')} disabled={busy} aria-busy={leaving === 'google' || undefined}>
        {leaving === 'google' ? <span className="spinner" aria-hidden="true" /> : <GoogleLogo />}
        Continuer avec Google
      </button>
    </>
  );
  const emailField = (onEnter: () => void, autoComplete: string) => (
    <AuthField
      fieldRef={fieldRef('email')}
      label="Adresse e-mail"
      icon="mail"
      type="email"
      inputMode="email"
      autoComplete={autoComplete}
      focusedPlaceholder="nom@exemple.fr"
      value={email}
      onChange={editEmail}
      error={errorFields.has('email') || emailMessage !== null}
      onEnter={onEnter}
    />
  );
  const passwordField = (field: 'password' | 'newPassword', label: string, value: string, onChange: (value: string) => void,
    autoComplete: string, onEnter: () => void) => (
    <AuthField
      fieldRef={fieldRef(field)}
      label={label}
      icon="lock"
      type={showsPassword ? 'text' : 'password'}
      autoComplete={autoComplete}
      value={value}
      onChange={onChange}
      error={errorFields.has(field)}
      onEnter={onEnter}
      trailing={(focused) => (
        <button
          type="button"
          className="auth-eye"
          aria-label={showsPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
          onMouseDown={(event) => { if (focused) event.preventDefault(); }}
          onClick={() => setShowsPassword(!showsPassword)}
        >
          <Icon name={showsPassword ? 'eyeOff' : 'eye'} />
        </button>
      )}
    />
  );

  let sheetContent: ReactNode = null;
  if (screen === 'signIn') {
    sheetContent = (
      <form ref={(element) => { content.current = element; }} key="signIn" className="auth-sheet-content" onSubmit={(event) => void submitSignIn(event)} noValidate>
        <div className="auth-fields">
          {emailField(() => fields.current.password?.querySelector('input')?.focus(), 'username')}
          {passwordField('password', 'Mot de passe', password, editPassword, 'current-password', () => void submitSignIn())}
        </div>
        {message && <ErrorLine className="auth-g10" message={message} />}
        <button type="button" className="auth-forgot auth-g12" onClick={() => go('forgotPassword')}>Mot de passe oublié ?</button>
        <PrimaryButton className="auth-g19" busy={busy}>Se connecter</PrimaryButton>
        <div className="auth-divider auth-g20">ou</div>
        <div className="auth-providers auth-g15">{providers}</div>
        <SwitchLink className="auth-g19" prompt="Pas encore de compte ?" action="Créer un compte" onClick={() => go('signUp')} />
      </form>
    );
  } else if (screen === 'signUp') {
    const canSubmit = canSubmitSignUp({ firstName, lastName, email, password });
    sheetContent = (
      <form ref={(element) => { content.current = element; }} key="signUp" className="auth-sheet-content" onSubmit={(event) => void submitSignUp(event)} noValidate>
        <div className="auth-names">
          <AuthField label="Prénom" autoComplete="given-name" autoCapitalize="words" value={firstName} onChange={setFirstName}
            onEnter={() => fields.current.lastName?.querySelector('input')?.focus()} />
          <AuthField fieldRef={(element) => { fields.current.lastName = element; }} label="Nom" autoComplete="family-name" autoCapitalize="words"
            value={lastName} onChange={setLastName} onEnter={() => fields.current.email?.querySelector('input')?.focus()} />
        </div>
        <div className="auth-email-block auth-g12">
          {emailField(() => fields.current.password?.querySelector('input')?.focus(), 'email')}
          {emailMessage && (
            <p className="auth-email-error" role="alert">
              {emailMessage}
              {accountExists && <>{' '}<button type="button" onClick={() => go('signIn')}>Se connecter</button></>}
            </p>
          )}
        </div>
        <div className="auth-g12">
          {passwordField('password', 'Mot de passe', password, editPassword, 'new-password', () => void submitSignUp())}
        </div>
        <StrengthGauge className="auth-g18" password={password} />
        <p className="auth-hint auth-g10">{PASSWORD_HINT}</p>
        {authError && <ErrorLine className="auth-g10" message={authError} />}
        <PrimaryButton className="auth-g21" busy={busy} enabled={canSubmit}>Créer mon compte</PrimaryButton>
        <Mentions className="auth-g22" prefix="En créant un compte, vous acceptez nos" />
        <SwitchLink className="auth-g16" prompt="Déjà un compte ?" action="Se connecter" onClick={() => go('signIn')} />
      </form>
    );
  } else if (screen === 'forgotPassword') {
    sheetContent = (
      <form ref={(element) => { content.current = element; }} key="forgotPassword" className="auth-sheet-content" onSubmit={(event) => void submitForgot(event)} noValidate>
        {emailField(() => void submitForgot(), 'email')}
        {authError && <ErrorLine className="auth-g10" message={authError} />}
        <PrimaryButton className="auth-g18" busy={busy}>Envoyer le lien</PrimaryButton>
        <p className="auth-note auth-g20">Vous recevrez un e-mail avec un lien sécurisé pour choisir un nouveau mot de passe.</p>
        <BackToSignIn className="auth-g25" onClick={() => go('signIn')} />
      </form>
    );
  } else if ((screen === 'linkSent' || screen === 'confirmEmail') && sent) {
    const secondsLeft = resendSecondsLeft(sent.at, Math.max(now, sent.at));
    sheetContent = (
      <div ref={(element) => { content.current = element; }} key={screen} className="auth-sheet-content">
        <span className="auth-sent-icon" aria-hidden="true">
          <Icon name="mail" />
          <span className="auth-sent-check"><Icon name="check" /></span>
        </span>
        <p className="auth-sent-text auth-g6">
          {screen === 'linkSent' ? (
            <>Si un compte existe pour <strong>{sent.email}</strong>, vous allez recevoir un lien pour choisir un nouveau mot de passe. Ouvrez-le dans ce navigateur : dans <Keep>l&apos;e-mail</Keep>, cliquez sur <Keep>« Choisir un nouveau mot de passe »</Keep>.</>
          ) : (
            <>Nous avons envoyé un lien à <strong>{sent.email}</strong>. Ouvrez-le dans ce navigateur pour activer votre compte : dans <Keep>l&apos;e-mail</Keep>, cliquez sur <Keep>« Confirmer mon adresse e-mail »</Keep>.</>
          )}
        </p>
        {message && <ErrorLine className="auth-g12" message={message} />}
        {info && <p className="auth-info auth-g12" role="status">{info}</p>}
        <div className="auth-resend auth-g18">
          {secondsLeft > 0 ? (
            <span className="auth-resend-wait">{resendLabel(secondsLeft)}</span>
          ) : (
            <button type="button" onClick={() => void resend()} disabled={busy}>{resendLabel(0)}</button>
          )}
        </div>
        <BackToSignIn className="auth-g20" onClick={() => go('signIn')} />
      </div>
    );
  } else if (screen === 'newPassword') {
    sheetContent = (
      <form ref={(element) => { content.current = element; }} key="newPassword" className="auth-sheet-content" onSubmit={(event) => void submitNewPassword(event)} noValidate>
        {passwordField('newPassword', 'Nouveau mot de passe', newPassword, editNewPassword, 'new-password', () => void submitNewPassword())}
        <StrengthGauge className="auth-g18" password={newPassword} />
        <p className="auth-hint auth-g10">{PASSWORD_HINT}</p>
        {authError && <ErrorLine className="auth-g10" message={authError} />}
        <PrimaryButton className="auth-g21" busy={busy} enabled={passwordRuleSatisfied(newPassword)}>Enregistrer</PrimaryButton>
      </form>
    );
  }

  return (
    <section ref={root} className={`signin-card auth ${inDialog ? 'is-dialog' : 'is-page'}`} aria-labelledby={titleId}>
      <div className="auth-column">
        <div className="auth-bar">
          {screen === 'welcome' ? (
            <AuthRoundButton icon="x" label="Fermer" className={inDialog ? 'is-close is-end' : 'is-close is-end is-welcome-close'} onClick={closeWelcome} />
          ) : back ? (
            <AuthRoundButton icon="chevronLeft" label="Retour" onClick={() => go(back)} />
          ) : (
            // Nouveau mot de passe : la croix le remet à plus tard.
            <AuthRoundButton icon="x" label="Fermer" className="is-close" onClick={postponeNewPassword} />
          )}
        </div>
        <div ref={stage} className="auth-stage">
          <div ref={stageGhosts} className="auth-ghosts" />
          {screen === 'welcome' ? (
            <div ref={layer} key="welcome" className="auth-layer auth-welcome">
              <AuthLaunchLoop running={opened} />
              <div className="auth-welcome-head">
                <h1 ref={title} id={titleId} className="auth-hero-title" tabIndex={-1}>{texts.title}</h1>
                <p className="auth-hero-subtitle">{texts.subtitle}</p>
                {notice}
                <div className="auth-hero-space" />
              </div>
              <div className="auth-welcome-actions">
                <div className="auth-providers auth-g20">
                  {providers}
                  <button type="button" className="auth-provider auth-email" onClick={() => go('signIn')} disabled={busy}>
                    <Icon name="mail" />
                    Continuer avec l&apos;e-mail
                  </button>
                </div>
                {authError && <ErrorLine className="auth-g10" message={authError} />}
                <SwitchLink className="auth-g19" prompt="Nouveau sur Nidalo ?" action="Créer un compte" onClick={() => go('signUp')} />
                <Mentions className="auth-g18" prefix="En continuant, vous acceptez nos" />
              </div>
            </div>
          ) : (
            <div ref={layer} key="steps" className="auth-layer auth-steps">
              <div className="auth-head-box">
                <div ref={headGhosts} className="auth-ghosts" />
                <div ref={head} key={screen} className="auth-step-head">
                  <h1 ref={title} id={titleId} className="auth-step-title" tabIndex={-1}>{texts.title}</h1>
                  <p className="auth-step-subtitle">{texts.subtitle}</p>
                  {(screen === 'signIn' || screen === 'signUp') && notice}
                </div>
              </div>
              <div ref={sheet} className={screen === 'signUp' ? 'auth-sheet is-signup' : 'auth-sheet'}>
                <div ref={contentGhosts} className="auth-ghosts" />
                {sheetContent}
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function without(set: ReadonlySet<Field>, field: Field): ReadonlySet<Field> {
  if (!set.has(field)) return set;
  const next = new Set(set);
  next.delete(field);
  return next.size ? next : NO_FIELDS;
}

/** Rond blanc de 38 bordé (croix et retour de l'écran de connexion de l'app). */
function AuthRoundButton({ icon, label, onClick, className }: { icon: IconName; label: string; onClick: () => void; className?: string }) {
  return (
    <button type="button" className={className ? `auth-round ${className}` : 'auth-round'} aria-label={label} onClick={onClick}>
      <Icon name={icon} />
    </button>
  );
}

/**
 * Champ de l'écran de connexion : icône, libellé flottant (dès que le champ est actif ou rempli), mot de passe avec
 * l'œil. Un clic n'importe où dans le champ place le curseur.
 */
function AuthField({
  label, icon, type = 'text', inputMode, autoComplete, autoCapitalize = 'none', focusedPlaceholder, value, onChange, error = false,
  onEnter, trailing, fieldRef,
}: {
  label: string;
  icon?: IconName;
  type?: 'text' | 'email' | 'password';
  inputMode?: 'email' | 'text';
  autoComplete: string;
  autoCapitalize?: 'none' | 'words';
  /** Texte d'exemple quand le champ est actif (« nom@exemple.fr ») ; sinon le libellé. */
  focusedPlaceholder?: string;
  value: string;
  onChange: (value: string) => void;
  error?: boolean;
  /** Touche Entrée : champ suivant, ou envoi. */
  onEnter?: () => void;
  trailing?: (focused: boolean) => ReactNode;
  fieldRef?: (element: HTMLDivElement | null) => void;
}) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [focused, setFocused] = useState(false);
  const classes = ['auth-field'];
  if (focused) classes.push('is-focused');
  if (error) classes.push('is-error');
  if (focused || value !== '') classes.push('shows-label');
  if (trailing) classes.push('has-trailing');
  const place = (event: MouseEvent<HTMLDivElement>) => {
    if (event.target instanceof Element && event.target.closest('input, button')) return;
    event.preventDefault();
    input.current?.focus();
  };
  return (
    <div ref={fieldRef} className={classes.join(' ')} onMouseDown={place}>
      {icon && <span className="auth-field-icon" aria-hidden="true"><Icon name={icon} /></span>}
      <span className="auth-field-body">
        <label className="auth-field-label" htmlFor={id}>{label}</label>
        <input
          ref={input}
          id={id}
          type={type}
          inputMode={inputMode}
          autoComplete={autoComplete}
          autoCapitalize={autoCapitalize}
          autoCorrect="off"
          spellCheck={false}
          placeholder={focused && focusedPlaceholder ? focusedPlaceholder : label}
          aria-invalid={error || undefined}
          value={value}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== 'Enter' || !onEnter || event.nativeEvent.isComposing) return;
            event.preventDefault();
            onEnter();
          }}
        />
      </span>
      {trailing?.(focused)}
    </div>
  );
}

/** Bouton plein bleu ; inactif (formulaire incomplet) plus pâle ; pendant l'envoi, la roue et le texte. */
function PrimaryButton({ children, busy, enabled = true, className }: { children: ReactNode; busy: boolean; enabled?: boolean; className: string }) {
  return (
    <button type="submit" className={`auth-primary ${className}${enabled ? '' : ' is-inactive'}`} disabled={busy || !enabled} aria-busy={busy || undefined}>
      {busy && <span className="spinner spinner-white" aria-hidden="true" />}
      {children}
    </button>
  );
}

/** Message d'erreur : pastille pleine et texte rouges. */
function ErrorLine({ message, className }: { message: string; className: string }) {
  return (
    <p className={`auth-error ${className}`} role="alert">
      <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
        <circle cx="8" cy="8" r="8" fill="currentColor" />
        <path d="M8 4.3v4.6" stroke="#FFFFFF" strokeWidth="1.9" strokeLinecap="round" />
        <circle cx="8" cy="11.7" r="1.15" fill="#FFFFFF" />
      </svg>
      <span>{message}</span>
    </p>
  );
}

/** Jauge du mot de passe : quatre segments, autant de remplis que le niveau, tous de sa couleur. */
function StrengthGauge({ password, className }: { password: string; className: string }) {
  const strength = passwordStrength(password);
  return (
    <div className={`auth-gauge ${className}`} role="img" aria-label={strengthLabel(strength)}>
      {[1, 2, 3, 4].map((segment) => (
        <span key={segment} className="auth-gauge-segment" style={strength && segment <= strength.level ? { backgroundColor: strength.color } : undefined} />
      ))}
      <span className="auth-gauge-label" style={strength ? { color: strength.color } : undefined}>{strength?.label ?? ''}</span>
    </div>
  );
}

/** « Nouveau sur Nidalo ? Créer un compte » : la question, puis l'action en gras. */
function SwitchLink({ prompt, action, onClick, className }: { prompt: string; action: string; onClick: () => void; className: string }) {
  return (
    <button type="button" className={`auth-switch ${className}`} onClick={onClick}>
      {prompt} <strong>{action}</strong>
    </button>
  );
}

/** Mots gardés sur une seule ligne (le nom d'un bouton de l'e-mail et ses guillemets, « e-mail »). */
function Keep({ children }: { children: ReactNode }) {
  return <span className="auth-keep">{children}</span>;
}

function BackToSignIn({ onClick, className }: { onClick: () => void; className: string }) {
  return <button type="button" className={`auth-back-link ${className}`} onClick={onClick}>Retour à la connexion</button>;
}

/** Conditions et confidentialité : elles s'ouvrent dans une feuille par-dessus l'écran (LegalSheet), comme dans l'app. */
function Mentions({ prefix, className }: { prefix: string; className: string }) {
  const [legal, setLegal] = useState<LegalPage | null>(null);
  return (
    <>
      <p className={`auth-mentions ${className}`}>
        {prefix} <a href={PATHS.terms} onClick={(event) => openLegalOnClick(event, 'terms', setLegal)}>Conditions d&apos;utilisation</a> et
        notre <a href={PATHS.privacy} onClick={(event) => openLegalOnClick(event, 'privacy', setLegal)}>Politique de confidentialité</a>.
      </p>
      <LegalSheet page={legal} onClose={() => setLegal(null)} />
    </>
  );
}

function AppleLogo() {
  return (
    <svg className="auth-provider-logo" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path fill="currentColor" d="M16.37 12.6c-.02-2.2 1.8-3.26 1.88-3.31-1.03-1.5-2.62-1.7-3.18-1.73-1.35-.14-2.64.8-3.33.8-.69 0-1.74-.78-2.86-.76-1.47.02-2.83.86-3.59 2.17-1.53 2.65-.39 6.58 1.1 8.73.73 1.05 1.6 2.23 2.73 2.19 1.1-.04 1.51-.71 2.84-.71 1.32 0 1.7.71 2.86.69 1.18-.02 1.93-1.07 2.65-2.13.84-1.22 1.18-2.4 1.2-2.46-.03-.01-2.3-.88-2.3-3.48ZM14.2 6.13c.6-.73 1.01-1.75.9-2.76-.87.04-1.92.58-2.54 1.31-.56.65-1.05 1.68-.92 2.67.97.08 1.96-.49 2.56-1.22Z" />
    </svg>
  );
}

function GoogleLogo() {
  return (
    <svg className="auth-provider-logo" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1Z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z" />
      <path fill="#FBBC05" d="M5.84 14.1A6.6 6.6 0 0 1 5.49 12c0-.73.13-1.44.35-2.1V7.06H2.18A11 11 0 0 0 1 12c0 1.78.43 3.45 1.18 4.94l3.66-2.84Z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.06L5.84 9.9C6.71 7.31 9.14 5.38 12 5.38Z" />
    </svg>
  );
}
