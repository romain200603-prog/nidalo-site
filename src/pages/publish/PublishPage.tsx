import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Icon } from '../../components/Icon';
import { Page } from '../../components/Layout';
import { SoonCard } from '../../components/SoonCard';
import { SignInCard } from '../../components/account/SignInCard';
import { SOON_PAGES } from '../../components/soonPages';
import { isNewAccount } from '../../lib/account/auth';
import { accountStore, formFor, loadAccount, publicName, saveProfile, type Account } from '../../lib/account/profile';
import { useSession, useStore } from '../../lib/account/session';
import { useDesktop } from '../../lib/desktop';
import { UUID_PATTERN } from '../../lib/listings';
import { accountPath, PATHS, publishPath } from '../../lib/paths';
import { locateAddress } from '../../lib/places';
import {
  missingRequiredFields, newDraft, PUBLISH_STEPS, stepIsComplete, stepOf, STEP_TITLES, syncBuildingRent,
  type Address, type Coordinate, type PublishDraft, type PublishStep,
} from '../../lib/publish/draft';
import { canSaveDraft, DRAFT_NEEDS, hasChanges, initialStep, sameDraft } from '../../lib/publish/flow';
import { loadListingForEdit, saveListing, type Loaded } from '../../lib/publish/save';
import { knownCityCenter } from '../../lib/search';
import { Modal } from '../listing/Dialogs';
import { ChoiceDialog, ScreenHead } from '../account/DesktopParts';
import { Spinner } from '../account/parts';
import { type Update } from './controls';
import { DescriptionStep, ReviewStep, SuccessView } from './FinalSteps';
import { FinanceStep } from './FinanceStep';
import { ADDRESS_NOT_FOUND, CategoryStep, FeaturesStep, MainStep } from './MainSteps';
import { MediaStep } from './MediaStep';

// « Publier une annonce » sur ordinateur (Features/Publish/PublishFlowView.swift), dans la colonne de 640 px : les
// sept étapes de l'app, « Brouillon » à chaque étape, la vérification, puis la confirmation. /publier/?annonce=…
// reprend un brouillon ou modifie une annonce déjà publiée (« Enregistrer », jamais de brouillon). Tout s'écrit dans
// les tables de l'app (lib/publish/save). En dessous de 1024 px, le message « bientôt » du téléphone reste tel quel.

export function PublishPage() {
  const desktop = useDesktop();
  // Une fois ouverte sur un écran d'ordinateur, la publication reste montée : si la fenêtre passe un instant sous
  // 1024 px (fenêtre rétrécie, tablette tournée), le message du téléphone s'affiche à sa place, puis la saisie
  // revient telle quelle, sans rien perdre. Sur téléphone, elle n'est jamais montée (rien n'est chargé).
  const [opened, setOpened] = useState(desktop);
  if (desktop && !opened) setOpened(true);
  const page = SOON_PAGES.publish;
  return (
    <Page section={page.section}>
      {!desktop && <SoonCard icon={page.icon} title={page.title} text={page.text} />}
      {opened && <div className="dpub-root" hidden={!desktop}><DesktopPublish /></div>}
    </Page>
  );
}

/** `ownerId` : l'auteur d'une annonce existante (moi, ou une personne de l'équipe que je gère). */
type Start = { draft: PublishDraft; listingStatus: string | null; ownerId: string | null };

function DesktopPublish() {
  const session = useSession();
  const account = useStore(accountStore);
  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const listingId = params.get('annonce');
  // « Mettre à jour les photos » (Mes annonces) : l'annonce s'ouvre sur ses photos.
  const photosFirst = params.get('etape') === 'photos';
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  // Nouvelle annonce : son identifiant est choisi une fois (la saisie survit aux mises à jour du compte).
  const [newId] = useState(() => crypto.randomUUID());
  const userId = session.status === 'signedIn' ? session.userId : null;

  useEffect(() => {
    if (userId) void loadAccount();
  }, [userId]);

  const load = useCallback(() => {
    if (!userId || !listingId) return;
    setLoaded(null);
    if (!UUID_PATTERN.test(listingId)) {
      setLoaded({ status: 'notFound' });
      return;
    }
    void loadListingForEdit(listingId).then(setLoaded);
  }, [userId, listingId]);
  useEffect(load, [load]);

  if (session.status === 'signedOut') {
    // Sans compte : l'invitation à se connecter des autres pages du compte (Favoris, Messages).
    return (
      <div className="wrap favorites-wrap">
        <div className="favorites-signin">
          <SignInCard onSignedIn={() => { if (isNewAccount()) window.location.assign(PATHS.account); }} />
        </div>
      </div>
    );
  }

  let content;
  if (session.status === 'loading' || account.status === 'none' || account.status === 'loading' || (listingId && loaded === null)) {
    content = <Spinner />;
  } else if (account.status === 'error') {
    content = <Problem title="Publier une annonce" text={account.message} onRetry={() => void loadAccount(true)} />;
  } else if (loaded?.status === 'notFound') {
    content = <Problem title="Annonce introuvable" text="Cette annonce n'existe plus ou n'est pas l'une des vôtres." />;
  } else if (loaded?.status === 'error') {
    content = <Problem title="Publier une annonce" text={loaded.message} onRetry={load} />;
  } else {
    const start: Start = loaded?.status === 'ready'
      ? { draft: loaded.draft, listingStatus: loaded.listingStatus, ownerId: loaded.ownerId }
      : { draft: newDraft(newId), listingStatus: null, ownerId: null };
    content = <PublishFlow key={start.draft.id} start={start} account={account.account} fromMyListings={listingId !== null} photosFirst={photosFirst} />;
  }
  return <div className="wrap account-wrap">{content}</div>;
}

function Problem({ title, text, onRetry }: { title: string; text: string; onRetry?: () => void }) {
  return (
    <div className="dsc dpub">
      <ScreenHead title={title} back={accountPath('annonces')} />
      <div className="dsc-empty">
        <Icon name="triangleAlert" />
        <p>{text}</p>
        {onRetry ? (
          <button type="button" className="dsc-button dsc-button-primary" onClick={onRetry}>Réessayer</button>
        ) : (
          <a className="dsc-button dsc-button-primary" href={accountPath('annonces')}>Mes annonces</a>
        )}
      </div>
    </div>
  );
}

/** Page d'où Publier a été ouvert (même site), sinon l'accueil ; Mes annonces pour un brouillon ou une annonce. */
function backPath(fromMyListings: boolean): string {
  if (fromMyListings) return accountPath('annonces');
  try {
    const from = document.referrer ? new URL(document.referrer) : null;
    if (from && from.origin === window.location.origin && from.pathname !== PATHS.publish) return `${from.pathname}${from.search}`;
  } catch {
    // Adresse illisible : l'accueil.
  }
  return PATHS.home;
}

/**
 * Position du bien (PublishFlowView.coordinate(for:)) : Base Adresse Nationale (adresse, rue ou commune), sinon le
 * centre d'une grande ville connue.
 */
async function locate(address: Address): Promise<Coordinate | null> {
  const found = await locateAddress(address).catch(() => null);
  return found ?? knownCityCenter(address.city);
}

function PublishFlow({ start, account, fromMyListings, photosFirst }: { start: Start; account: Account; fromMyListings: boolean; photosFirst: boolean }) {
  const editing = start.listingStatus !== null && start.listingStatus !== 'draft';
  const [draft, setDraft] = useState(start.draft);
  const [saved, setSaved] = useState<PublishDraft | null>(start.listingStatus !== null ? start.draft : null);
  const [step, setStep] = useState<PublishStep>(() => (photosFirst && start.listingStatus !== null ? 'media' : initialStep(start.draft, editing)));
  /** Champs signalés après une tentative de passage à l'étape suivante. */
  const [showsErrors, setShowsErrors] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [resolving, setResolving] = useState(false);
  /** Adresse introuvable à la dernière tentative : le message reste affiché tant qu'elle n'a pas été modifiée. */
  const [unfoundAddress, setUnfoundAddress] = useState<Address | null>(null);
  const [savingDraft, setSavingDraft] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [progress, setProgress] = useState<{ sent: number; total: number } | null>(null);
  const [publishError, setPublishError] = useState<string | null>(null);
  /** Refus du serveur (champ manquant, DPE…) : son message, tel quel. */
  const [refusal, setRefusal] = useState<string | null>(null);
  const [askName, setAskName] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [published, setPublished] = useState<{ id: string; title: string } | null>(null);
  const back = useMemo(() => backPath(fromMyListings), [fromMyListings]);
  const leavingNow = useRef(false);
  /** Saisie à jour, lue après une attente (recherche de l'adresse). */
  const latest = useRef(draft);
  latest.current = draft;
  const noticeTimer = useRef<number | undefined>(undefined);

  const update: Update = useCallback((change) => setDraft((current) => change(current)), []);
  const changed = hasChanges(draft, saved);
  const index = PUBLISH_STEPS.indexOf(step);
  const ready = missingRequiredFields(draft).length === 0;
  const addressError = unfoundAddress !== null && unfoundAddress === draft.address ? ADDRESS_NOT_FOUND : null;
  const title = editing ? 'Modifier l\'annonce' : start.listingStatus === 'draft' ? 'Reprendre le brouillon' : 'Publier une annonce';

  // Fermer l'onglet ou suivre un lien avec une saisie non enregistrée : le navigateur demande confirmation.
  useEffect(() => {
    if (!changed || published) return;
    const warn = (event: BeforeUnloadEvent) => {
      if (leavingNow.current) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [changed, published]);

  // Chaque étape s'ouvre en haut de page.
  useEffect(() => { window.scrollTo({ top: 0 }); }, [step, published]);

  // Champs signalés : le premier est montré.
  useEffect(() => {
    if (attempt === 0) return;
    const frame = window.requestAnimationFrame(() => {
      document.querySelector('.dpub .field-error')?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [attempt]);

  useEffect(() => () => window.clearTimeout(noticeTimer.current), []);

  const showErrors = () => {
    setShowsErrors(true);
    setAttempt((count) => count + 1);
  };

  function leaveNow() {
    leavingNow.current = true;
    window.location.assign(back);
  }

  function leave() {
    if (changed) setLeaving(true);
    else leaveNow();
  }

  function goTo(target: PublishStep) {
    setStep(target);
  }

  /** Passe à l'étape suivante si les champs obligatoires de l'étape sont remplis ; la position est trouvée en quittant l'adresse. */
  async function goForward() {
    if (!stepIsComplete(draft, step)) {
      showErrors();
      return;
    }
    if (step === 'main' && draft.coordinate === null && draft.address) {
      const address = draft.address;
      setResolving(true);
      const coordinate = await locate(address);
      setResolving(false);
      if (!coordinate) {
        setUnfoundAddress(address);
        showErrors();
        return;
      }
      // Adresse modifiée pendant la recherche : la position trouvée ne lui correspond plus.
      if (latest.current.address !== address) return;
      setDraft((current) => ({ ...current, coordinate }));
    }
    setShowsErrors(false);
    setUnfoundAddress(null);
    setMessage(null);
    goTo(PUBLISH_STEPS[Math.min(index + 1, PUBLISH_STEPS.length - 1)]);
  }

  function goBack() {
    setShowsErrors(false);
    setUnfoundAddress(null);
    goTo(PUBLISH_STEPS[Math.max(index - 1, 0)]);
  }

  function showNotice(text: string) {
    setNotice(text);
    window.clearTimeout(noticeTimer.current);
    noticeTimer.current = window.setTimeout(() => setNotice(null), 2000);
  }

  /** Brouillon enregistré sur le serveur (statut « brouillon », visible seulement dans Mes annonces). */
  async function saveDraft(): Promise<boolean> {
    if (savingDraft || publishing) return false;
    if (!canSaveDraft(draft)) {
      setMessage(DRAFT_NEEDS);
      return false;
    }
    const sent = draft;
    setSavingDraft(true);
    setMessage(null);
    const result = await saveListing(sent, 'draft', { ownerId: start.ownerId });
    setSavingDraft(false);
    if (!result.ok) {
      setMessage(result.message);
      return false;
    }
    // Saisie inchangée pendant l'envoi : les photos deviennent celles du serveur.
    setDraft((current) => (sameDraft(current, sent) ? result.draft : current));
    setSaved(result.draft);
    window.history.replaceState(null, '', publishPath(sent.id));
    showNotice('Brouillon enregistré');
    return true;
  }

  /**
   * Publie l'annonce, ou enregistre ses modifications ; la confirmation n'apparaît qu'une fois l'enregistrement
   * confirmé. Un champ obligatoire vide ouvre son étape avec l'erreur.
   */
  async function publish({ firstNameSaved = false } = {}) {
    if (publishing || savingDraft) return;
    setPublishing(true);
    setMessage(null);
    try {
      let current = draft;
      // Adresse modifiée : sa position est recalculée avant d'enregistrer.
      if (current.coordinate === null && current.address) {
        const coordinate = await locate(current.address);
        if (coordinate) {
          current = { ...current, coordinate };
          setDraft(current);
        }
      }
      const final = syncBuildingRent(current);
      // Annonce réelle : un prénom est montré aux visiteurs (jamais l'e-mail).
      if (!editing && !firstNameSaved && (account.details?.first_name ?? '').trim() === '') {
        setAskName(true);
        return;
      }
      const missing = missingRequiredFields(final);
      if (missing.length > 0) {
        goTo(stepOf(missing[0]));
        showErrors();
        return;
      }
      const result = await saveListing(final, editing ? 'edit' : 'publish', {
        ownerId: start.ownerId,
        onProgress: (sent, total) => setProgress(total > 0 ? { sent, total } : null),
      });
      if (!result.ok) {
        if (result.refusal) setRefusal(result.message);
        setPublishError(result.message);
        goTo('review');
        return;
      }
      setDraft(result.draft);
      setSaved(result.draft);
      setPublishError(null);
      setPublished({ id: final.id, title: final.title.trim() });
    } finally {
      setPublishing(false);
      setProgress(null);
    }
  }

  /** Prénom saisi : enregistré dans Mes informations (sans toucher au nom du profil), puis la publication reprend. */
  async function saveFirstNameThenPublish(first: string) {
    const error = await saveProfile(
      account,
      { ...formFor(account), firstName: [...first].slice(0, 50).join(''), lastName: account.details?.last_name ?? '' },
      undefined,
      { displayName: account.profile.display_name },
    );
    if (error) {
      setRefusal(error);
      return;
    }
    await publish({ firstNameSaved: true });
  }

  if (published) {
    return (
      <div className="dsc dpub">
        <SuccessView listingId={published.id} title={published.title} editing={editing} back={back} />
      </div>
    );
  }

  const busy = publishing || savingDraft;
  let stepView;
  switch (step) {
    case 'category': stepView = <CategoryStep draft={draft} update={update} showsErrors={showsErrors} />; break;
    case 'main': stepView = <MainStep draft={draft} update={update} showsErrors={showsErrors} addressError={addressError} />; break;
    case 'features': stepView = <FeaturesStep draft={draft} update={update} showsErrors={showsErrors} />; break;
    case 'finance': stepView = <FinanceStep draft={draft} update={update} showsErrors={showsErrors} />; break;
    case 'media': stepView = <MediaStep draft={draft} update={update} showsErrors={showsErrors} />; break;
    case 'description': stepView = <DescriptionStep draft={draft} update={update} showsErrors={showsErrors} ownerId={start.ownerId ?? account.profile.id} />; break;
    case 'review':
      stepView = <ReviewStep draft={draft} errorMessage={publishError} onEdit={(target) => { setShowsErrors(true); goTo(target); }} />;
      break;
  }

  return (
    <div className="dsc dpub">
      <ScreenHead
        title={title}
        subtitle={`Étape ${index + 1} sur ${PUBLISH_STEPS.length} · ${STEP_TITLES[step]}`}
        onBack={leave}
        action={editing ? (
          // Modification : on enregistre l'annonce elle-même, jamais un brouillon.
          <button type="button" className="dsc-button dsc-button-light" onClick={() => void publish()} disabled={busy} aria-label="Enregistrer les modifications">
            Enregistrer
          </button>
        ) : draft.category !== null ? (
          <button type="button" className="dsc-button dsc-button-light" onClick={() => void saveDraft()} disabled={busy} aria-label="Enregistrer en brouillon">
            {savingDraft ? <span className="spinner dpub-spinner" role="status" aria-label="Enregistrement" /> : 'Brouillon'}
          </button>
        ) : undefined}
      />
      <div className="dpub-progress" aria-hidden="true">
        {PUBLISH_STEPS.map((item, position) => <span key={item} className={position <= index ? 'is-done' : undefined} />)}
      </div>
      {notice && <div className="dsc-saved" role="status"><Icon name="check" />{notice}</div>}

      {stepView}

      <div className="dsc-action-bar">
        {message && <p className="dsc-action-message" role="alert">{message}</p>}
        {progress && <p className="dpub-progress-text" role="status">{`Envoi des photos : ${progress.sent} sur ${progress.total}`}</p>}
        <div className={`dsc-action-buttons${step === 'category' ? ' is-single' : ''}`}>
          {step !== 'category' && (
            <button type="button" className="dsc-button dsc-button-light" onClick={goBack} disabled={busy}><Icon name="chevronLeft" />Retour</button>
          )}
          {step === 'review' ? (
            <button type="button" className="dsc-button dsc-button-primary" onClick={() => void publish()} disabled={!ready || busy}>
              {publishing ? (
                <span className="spinner dsc-button-spinner" role="status" aria-label={editing ? 'Enregistrement' : 'Publication'} />
              ) : editing ? 'Enregistrer les modifications' : <><Icon name="send" />Publier mon annonce</>}
            </button>
          ) : (
            <button type="button" className="dsc-button dsc-button-primary" onClick={() => void goForward()}
              disabled={(draft.category === null && draft.propertyType === null) || resolving}>
              {resolving ? <span className="spinner dsc-button-spinner" role="status" aria-label="Recherche de l'adresse" /> : <>Continuer<Icon name="chevronRight" /></>}
            </button>
          )}
        </div>
      </div>

      <ChoiceDialog
        open={refusal !== null}
        title="Publication refusée"
        message={refusal ?? ''}
        onClose={() => setRefusal(null)}
        actions={[{ label: 'Compris', onClick: () => setRefusal(null), tone: 'primary' }]}
      />
      <ChoiceDialog
        open={leaving}
        title={editing ? 'Quitter la modification ?' : 'Quitter la publication ?'}
        message="Vos modifications ne sont pas encore enregistrées."
        onClose={() => setLeaving(false)}
        actions={[
          editing
            ? { label: 'Enregistrer les modifications', tone: 'primary', onClick: () => { setLeaving(false); void publish(); } }
            : { label: 'Enregistrer le brouillon', tone: 'primary', onClick: () => { setLeaving(false); void saveDraft().then((ok) => { if (ok) leaveNow(); }); } },
          { label: 'Quitter sans enregistrer', tone: 'danger', onClick: () => { setLeaving(false); leaveNow(); } },
          { label: 'Continuer', onClick: () => setLeaving(false) },
        ]}
      />
      <FirstNameDialog
        open={askName}
        lastName={account.details?.last_name ?? ''}
        onClose={() => setAskName(false)}
        onPublish={(first) => {
          setAskName(false);
          void saveFirstNameThenPublish(first);
        }}
      />
    </div>
  );
}

/** « Votre prénom » (domiaAlert) : champ « Prénom », « Affiché sur l'annonce : Claire M. », Publier, Annuler. */
function FirstNameDialog({ open, lastName, onClose, onPublish }: { open: boolean; lastName: string; onClose: () => void; onPublish: (first: string) => void }) {
  const id = useId();
  return (
    <Modal open={open} onClose={onClose} className="alert-dialog dsc-dialog" labelledBy={`${id}-titre`} describedBy={`${id}-texte`}>
      <FirstNameForm id={id} lastName={lastName} onClose={onClose} onPublish={onPublish} />
    </Modal>
  );
}

function FirstNameForm({ id, lastName, onClose, onPublish }: { id: string; lastName: string; onClose: () => void; onPublish: (first: string) => void }) {
  const [value, setValue] = useState('');
  const shown = publicName(value === '' ? 'Prénom' : value, lastName, false);
  return (
    <form
      className="alert-body"
      onSubmit={(event) => {
        event.preventDefault();
        const first = value.trim();
        // Comme l'alerte de l'app : « Publier » la referme ; sans prénom, rien n'est publié.
        if (!first) {
          onClose();
          return;
        }
        onPublish(first);
      }}
    >
      <h2 id={`${id}-titre`}>Votre prénom</h2>
      {/* « Claire M. » finit déjà par un point : pas de second point (l'app affiche « Claire M.. »). */}
      <p id={`${id}-texte`}>Affiché sur l'annonce : {shown.endsWith('.') ? shown : `${shown}.`}</p>
      <input className="dsc-input dpub-name-input" value={value} onChange={(event) => setValue(event.currentTarget.value)} placeholder="Prénom"
        aria-label="Prénom" autoComplete="given-name" maxLength={50} autoFocus />
      <div className="alert-actions">
        <button type="submit" className="btn dsc-btn-primary">Publier</button>
        <button type="button" className="btn dsc-btn-quiet" onClick={onClose}>Annuler</button>
      </div>
    </form>
  );
}
