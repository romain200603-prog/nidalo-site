import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Icon } from '../../components/Icon';
import { Page } from '../../components/Layout';
import { SoonCard } from '../../components/SoonCard';
import { SignInCard } from '../../components/account/SignInCard';
import { SOON_PAGES } from '../../components/soonPages';
import { isNewAccount } from '../../lib/account/auth';
import { accountStore, formFor, loadAccount, publicName, saveProfile, type Account } from '../../lib/account/profile';
import { useSession, useStore } from '../../lib/account/session';
import { DESKTOP_QUERY, useDesktop } from '../../lib/desktop';
import { UUID_PATTERN } from '../../lib/listings';
import { accountPath, PATHS, publishPath } from '../../lib/paths';
import { locateAddress } from '../../lib/places';
import {
  missingRequiredFields, newDraft, PUBLISH_STEPS, STEP_TITLES, syncBuildingRent,
  type Address, type Coordinate, type PublishDraft, type PublishStep,
} from '../../lib/publish/draft';
import {
  canSaveDraft, DRAFT_NEEDS, firstIssue, furthestAtStart, guideForRequired, hasChanges, initialStep, sameDraft, type Guide, type GuideField,
} from '../../lib/publish/flow';
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

const MAIN = PUBLISH_STEPS.indexOf('main');
const LAST = PUBLISH_STEPS.length - 1;

/** Étape d'ouverture : les photos pour « Mettre à jour les photos », sinon la catégorie ou les informations principales. */
function openingStep(start: Start, editing: boolean, photosFirst: boolean): PublishStep {
  return photosFirst && start.listingStatus !== null ? 'media' : initialStep(start.draft, editing);
}

/** Entrée d'historique de la publication : le retour du navigateur revient d'une étape au lieu de quitter la page. */
const HISTORY_MARK = 'nidaloPublication';

function markedEntry(state: unknown): boolean {
  return state !== null && typeof state === 'object' && HISTORY_MARK in state;
}

function pushPublishEntry(url: string) {
  const state: unknown = window.history.state;
  window.history.pushState({ ...(state !== null && typeof state === 'object' ? state : {}), [HISTORY_MARK]: true }, '', url);
}

/** Défilement doux, sauf quand la personne a demandé de réduire les animations. */
function scrollBehavior(): ScrollBehavior {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
}

/**
 * Montre un champ à compléter (son repère `data-guide`, avec le message qui le suit) au centre de la partie visible :
 * entre le haut de l'écran, ou du clavier d'une tablette, et la barre d'actions collée en bas. Un bloc plus haut que
 * cette partie est montré par son début. Avec une souris, le champ reçoit aussi le focus pour taper tout de suite ;
 * pas sur un écran tactile, où le clavier s'ouvrirait par-dessus, ni dans une liste de suggestions d'adresse.
 */
function showField(anchor: HTMLElement) {
  const parts = [anchor];
  const next = anchor.nextElementSibling;
  if (next instanceof HTMLElement && next.classList.contains('field-error')) parts.push(next);
  const rects = parts.map((part) => part.getBoundingClientRect());
  const top = Math.min(...rects.map((rect) => rect.top));
  const bottom = Math.max(...rects.map((rect) => rect.bottom));
  const viewport = window.visualViewport;
  const viewTop = viewport?.offsetTop ?? 0;
  let viewBottom = viewTop + (viewport?.height ?? window.innerHeight);
  const bar = document.querySelector('.dpub .dsc-action-bar');
  if (bar) viewBottom = Math.min(viewBottom, window.innerHeight - bar.getBoundingClientRect().height);
  const offset = bottom - top > viewBottom - viewTop - 32 ? top - viewTop - 16 : (top + bottom) / 2 - (viewTop + viewBottom) / 2;
  window.scrollTo({ top: Math.max(0, window.scrollY + offset), behavior: scrollBehavior() });
  if (!window.matchMedia('(pointer: fine)').matches || anchor.querySelector('[role="combobox"]')) return;
  const control = anchor.querySelector<HTMLElement>('input:not([disabled]), textarea, button:not([disabled])');
  control?.focus({ preventScroll: true });
}

function PublishFlow({ start, account, fromMyListings, photosFirst }: { start: Start; account: Account; fromMyListings: boolean; photosFirst: boolean }) {
  const editing = start.listingStatus !== null && start.listingStatus !== 'draft';
  const [draft, setDraft] = useState(start.draft);
  const [saved, setSaved] = useState<PublishDraft | null>(start.listingStatus !== null ? start.draft : null);
  const [step, setStep] = useState<PublishStep>(() => openingStep(start, editing, photosFirst));
  /** Étape la plus loin atteinte : la barre d'étapes reste bleue jusqu'à elle, et chacune de ces étapes s'ouvre d'un clic. */
  const [furthest, setFurthest] = useState(() => furthestAtStart(start.draft, start.listingStatus, openingStep(start, editing, photosFirst)));
  /**
   * Dernière étape vérifiée sans succès (« Continuer », « Publier », « Corriger ») : jusqu'à elle, les champs à compléter
   * restent signalés, et chacun perd son message dès qu'il est rempli.
   */
  const [checkedThrough, setCheckedThrough] = useState(-1);
  const [attempt, setAttempt] = useState(0);
  /** Champ à montrer après une vérification : un seul défilement par clic. */
  const guided = useRef<GuideField | null>(null);
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
  /** Saisie et étape à jour, lues après une attente (recherche de l'adresse). */
  const latest = useRef(draft);
  latest.current = draft;
  const currentStep = useRef(step);
  currentStep.current = step;
  const noticeTimer = useRef<number | undefined>(undefined);
  /** Adresse de la page pour l'entrée d'historique remise après un retour (l'enregistrement d'un brouillon la change). */
  const pageUrl = useRef(`${window.location.pathname}${window.location.search}`);
  const onBrowserBack = useRef<() => void>(() => undefined);

  const update: Update = useCallback((change) => setDraft((current) => change(current)), []);
  const changed = hasChanges(draft, saved);
  const index = PUBLISH_STEPS.indexOf(step);
  const showsErrors = index <= checkedThrough;
  const ready = firstIssue(draft, 'review') === null && missingRequiredFields(draft).length === 0;
  const addressError = unfoundAddress !== null && unfoundAddress === draft.address ? ADDRESS_NOT_FOUND : null;
  const title = editing ? 'Modifier l\'annonce' : start.listingStatus === 'draft' ? 'Reprendre le brouillon' : 'Publier une annonce';
  const busy = publishing || savingDraft;
  const dialogOpen = leaving || askName || refusal !== null;

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

  // Retour du navigateur : comme la flèche de la page, il revient à l'étape précédente, sans question. La publication
  // a sa propre entrée d'historique, remise après chaque retour ; à la première étape, il quitte la page (la question
  // seulement s'il y a des changements).
  useEffect(() => {
    if (!markedEntry(window.history.state)) pushPublishEntry(pageUrl.current);
    const onPop = () => {
      // Arrivée sur l'entrée de la publication (bouton « Suivant » du navigateur) : rien à faire.
      if (markedEntry(window.history.state)) return;
      onBrowserBack.current();
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  // Chaque étape s'ouvre en haut de page.
  useEffect(() => { window.scrollTo({ top: 0 }); }, [step, published]);

  // Après une vérification, l'écran défile une fois jusqu'au premier champ à compléter.
  useEffect(() => {
    if (attempt === 0) return;
    const frame = window.requestAnimationFrame(() => {
      const root = document.querySelector('.dpub');
      const field = guided.current;
      const anchor = (field ? root?.querySelector<HTMLElement>(`[data-guide="${field}"]`) : null) ?? root?.querySelector<HTMLElement>('.field-error');
      if (anchor) showField(anchor);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [attempt]);

  useEffect(() => () => window.clearTimeout(noticeTimer.current), []);

  function leaveNow() {
    leavingNow.current = true;
    window.location.assign(back);
  }

  /** Fermer la publication : la question seulement s'il y a des changements. */
  function leave() {
    if (changed) setLeaving(true);
    else leaveNow();
  }

  /** Ouvre une étape sans rien vérifier (« Retour », flèche, barre d'étapes) : la saisie reste telle quelle. */
  function open(target: PublishStep) {
    setUnfoundAddress(null);
    setStep(target);
  }

  function goBack() {
    open(PUBLISH_STEPS[Math.max(index - 1, 0)]);
  }

  /**
   * Mène au champ à compléter : son étape s'ouvre, les champs à compléter des étapes vérifiées sont signalés, puis
   * l'écran défile jusqu'à lui.
   */
  function guide(target: Guide, checked: number) {
    guided.current = target.field;
    setCheckedThrough((current) => Math.max(current, checked, PUBLISH_STEPS.indexOf(target.step)));
    setStep(target.step);
    setAttempt((count) => count + 1);
  }

  /**
   * « Continuer » : les étapes jusqu'à celle-ci doivent être complètes, sinon la première erreur est montrée. La position
   * du bien est cherchée en quittant l'adresse, ou plus loin si l'adresse a été changée puis laissée par la barre d'étapes.
   */
  async function goForward() {
    const issue = firstIssue(draft, step);
    if (issue) {
      guide(issue, index);
      return;
    }
    if (index >= MAIN && draft.coordinate === null && draft.address) {
      const address = draft.address;
      setResolving(true);
      const coordinate = await locate(address);
      setResolving(false);
      // Adresse ou étape changées pendant la recherche : le résultat ne leur correspond plus.
      if (latest.current.address !== address || currentStep.current !== step) return;
      if (!coordinate) {
        setUnfoundAddress(address);
        guide({ step: 'main', field: 'address' }, index);
        return;
      }
      setDraft((current) => ({ ...current, coordinate }));
    }
    setUnfoundAddress(null);
    setMessage(null);
    const next = Math.min(index + 1, LAST);
    setFurthest((current) => Math.max(current, next));
    setStep(PUBLISH_STEPS[next]);
  }

  onBrowserBack.current = () => {
    if (published || !window.matchMedia(DESKTOP_QUERY).matches || (index === 0 && !changed && !dialogOpen && !busy)) {
      // Plus rien à garder ici : le retour du navigateur quitte la page (avec sa question si la saisie n'est pas enregistrée).
      window.history.back();
      return;
    }
    pushPublishEntry(pageUrl.current);
    if (dialogOpen) {
      // Une fenêtre ouverte : le retour la referme.
      setLeaving(false);
      setAskName(false);
      setRefusal(null);
      return;
    }
    if (busy) return;
    if (index > 0) goBack();
    else setLeaving(true);
  };

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
    pageUrl.current = publishPath(sent.id);
    window.history.replaceState(window.history.state, '', pageUrl.current);
    showNotice('Brouillon enregistré');
    return true;
  }

  /**
   * Publie l'annonce, ou enregistre ses modifications ; la confirmation n'apparaît qu'une fois l'enregistrement
   * confirmé. Rien ne part tant qu'un champ obligatoire manque : son étape s'ouvre sur lui. Le prénom n'est demandé
   * qu'une fois l'annonce complète.
   */
  async function publish({ firstNameSaved = false } = {}) {
    if (publishing || savingDraft) return;
    const issue = firstIssue(draft, 'review');
    if (issue) {
      guide(issue, LAST);
      return;
    }
    setPublishing(true);
    setMessage(null);
    try {
      let current = draft;
      // Adresse modifiée : sa position est recalculée avant d'enregistrer.
      if (current.coordinate === null && current.address) {
        const address = current.address;
        const coordinate = await locate(address);
        if (!coordinate) {
          setUnfoundAddress(address);
          guide({ step: 'main', field: 'address' }, LAST);
          return;
        }
        current = { ...current, coordinate };
        setDraft(current);
      }
      const final = syncBuildingRent(current);
      const missing = missingRequiredFields(final);
      if (missing.length > 0) {
        guide(guideForRequired(missing[0]), LAST);
        return;
      }
      // Annonce réelle : un prénom est montré aux visiteurs (jamais l'e-mail).
      if (!editing && !firstNameSaved && (account.details?.first_name ?? '').trim() === '') {
        setAskName(true);
        return;
      }
      const result = await saveListing(final, editing ? 'edit' : 'publish', {
        ownerId: start.ownerId,
        onProgress: (sent, total) => setProgress(total > 0 ? { sent, total } : null),
      });
      if (!result.ok) {
        if (result.refusal) setRefusal(result.message);
        setPublishError(result.message);
        open('review');
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

  let stepView;
  switch (step) {
    case 'category': stepView = <CategoryStep draft={draft} update={update} showsErrors={showsErrors} />; break;
    case 'main': stepView = <MainStep draft={draft} update={update} showsErrors={showsErrors} addressError={addressError} />; break;
    case 'features': stepView = <FeaturesStep draft={draft} update={update} showsErrors={showsErrors} />; break;
    case 'finance':
      stepView = <FinanceStep draft={draft} update={update} showsErrors={showsErrors} isPro={account.profile.account_type === 'professional'} />;
      break;
    case 'media': stepView = <MediaStep draft={draft} update={update} showsErrors={showsErrors} />; break;
    case 'description': stepView = <DescriptionStep draft={draft} update={update} showsErrors={showsErrors} ownerId={start.ownerId ?? account.profile.id} />; break;
    case 'review':
      stepView = (
        <ReviewStep
          draft={draft}
          errorMessage={publishError}
          onEdit={(target) => {
            setCheckedThrough((current) => Math.max(current, PUBLISH_STEPS.indexOf(target)));
            open(target);
          }}
          onFix={(field) => guide(guideForRequired(field), LAST)}
        />
      );
      break;
  }

  return (
    <div className="dsc dpub">
      <ScreenHead
        title={title}
        subtitle={`Étape ${index + 1} sur ${PUBLISH_STEPS.length} · ${STEP_TITLES[step]}`}
        // La flèche revient à l'étape précédente, comme « Retour » ; à la première étape, elle ferme.
        onBack={() => {
          if (index === 0) leave();
          else if (!busy) goBack();
        }}
        action={(
          <div className="dpub-head-actions">
            {editing ? (
              // Modification : on enregistre l'annonce elle-même, jamais un brouillon.
              <button type="button" className="dsc-button dsc-button-light" onClick={() => void publish()} disabled={busy} aria-label="Enregistrer les modifications">
                Enregistrer
              </button>
            ) : draft.category !== null ? (
              <button type="button" className="dsc-button dsc-button-light" onClick={() => void saveDraft()} disabled={busy} aria-label="Enregistrer en brouillon">
                {savingDraft ? <span className="spinner dpub-spinner" role="status" aria-label="Enregistrement" /> : 'Brouillon'}
              </button>
            ) : null}
            {/* Fermer depuis n'importe quelle étape : le même rond que la flèche. */}
            <button type="button" className="dsc-back dpub-close" onClick={leave} aria-label={editing ? 'Fermer la modification' : 'Fermer la publication'}>
              <Icon name="x" />
            </button>
          </div>
        )}
      />
      <nav className="dpub-progress" aria-label="Étapes">
        {PUBLISH_STEPS.map((item, position) => {
          const current = position === index;
          const className = [position <= furthest ? 'is-done' : '', current ? 'is-current' : ''].filter(Boolean).join(' ') || undefined;
          // Une étape déjà atteinte, avant ou après celle en cours, s'ouvre d'un clic, sans question ni vérification.
          return position <= furthest ? (
            <button key={item} type="button" className={className} aria-current={current ? 'step' : undefined}
              aria-label={`Étape ${position + 1} sur ${PUBLISH_STEPS.length}, ${STEP_TITLES[item]}, ${current ? 'en cours' : 'terminée'}`}
              onClick={() => { if (!current && !busy) open(item); }}>
              <span />
            </button>
          ) : (
            <span key={item} className={className} aria-hidden="true"><span /></span>
          );
        })}
      </nav>
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
            // Atténué tant qu'il manque quelque chose, mais un clic mène au premier champ à compléter.
            <button type="button" className={`dsc-button dsc-button-primary${ready ? '' : ' is-dimmed'}`} onClick={() => void publish()} disabled={busy}>
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
