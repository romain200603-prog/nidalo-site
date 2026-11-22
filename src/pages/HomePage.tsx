import { useEffect, useId, useLayoutEffect, useRef, useState, type FormEvent } from 'react';
import { CompactListingCard, HomeListingCard, SimilarListingCard } from '../components/HomeListingCard';
import { Icon } from '../components/Icon';
import type { IconName } from '../components/iconPaths';
import { Page } from '../components/Layout';
import { ModeTabs } from '../components/ModeTabs';
import { PlaceField } from '../components/PlaceField';
import { SelectionDialog } from '../components/SelectionDialog';
import { FiltersDialog } from './FiltersDialog';
import { countFor, runPath } from './account/SavedSearchesList';
import { accountStore, greetingName, loadAccount } from '../lib/account/profile';
import { loadSavedSearches, markViewed, resumeSummaryOf, savedSearchesStore, type SavedSearch } from '../lib/account/savedSearches';
import { useSession, useStore } from '../lib/account/session';
import { notificationsLabel } from '../lib/badges';
import { highlightsFor } from '../lib/highlights';
import { categoryFields, categoryMoreHint, categorySearchTitle, homeTiles, moreCriteriaHint, type CriterionTileSpec } from '../lib/homeCriteria';
import { loadHomeFeed, type HomeFeed } from '../lib/homeFeed';
import type { SearchMode } from '../lib/labels';
import type { ListingRow } from '../lib/listings';
import { loadNotifications, notificationsStore, unreadNotificationCount } from '../lib/notifications';
import { accountPath, listingPath, PATHS } from '../lib/paths';
import type { PlaceSuggestion } from '../lib/places';
import { chosenFromSuggestion, defaultDraft, paramsFromDraft, search, switchMode, type Result, type SearchDraft } from '../lib/search';
import { useDesktop } from '../lib/desktop';
import { loadProjectSearch, loadViewedListings, SIMILAR_LIMIT } from '../lib/homeDesktop';
import { recentlyViewedIds } from '../lib/recentlyViewed';
import '../styles/ordinateur-accueil.css';
import '../styles/accueil-app.css';

// Accueil. Sous 1024 px, celui de l'app (Features/Home : HomeView.swift, HomeCategoryCard.swift, HomeSections.swift) :
// barre du haut sans fond (logo, nom, cloche), carte des catégories dont les filtres s'ouvrent dans la carte,
// « Reprendre ma recherche », puis les sections de biens réels, chacune avec la carte d'annonce que l'app y montre
// (HomeListingCard, CompactListingCard, SimilarListingCard). Sur ordinateur, la mise en page de la maquette 1 de
// Romain, avec les cartes de l'app.

const MODES: SearchMode[] = ['buy', 'rent', 'invest', 'hotel'];

/** Villes de « Explorer par ville » (HomeView.exploredCities, liste de Romain du 16/11/2026). */
const EXPLORED_CITIES = ['Lyon', 'Annecy', 'Annemasse', 'Thonon-les-Bains'];

function searchHref(draft: SearchDraft, mapOpen = false): string {
  const params = paramsFromDraft(draft);
  if (mapOpen) params.set('vue', 'carte');
  return `${PATHS.search}?${params.toString()}`;
}

function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

/**
 * Tuile de critère : icône, petit libellé, valeur en gras ; ouvre le menu de sélection. `app` : champ de la carte des
 * catégories du téléphone (HomeFilterField), sans chevron sauf sur toute la largeur ; sinon la tuile de l'ordinateur.
 */
function CriterionTile({ tile, onApply, app = false }: {
  tile: CriterionTileSpec;
  onApply: (apply: (draft: SearchDraft) => SearchDraft) => void;
  app?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const value = tile.kind === 'single' ? tile.format(tile.value) : tile.valueLabel;
  const full = app && tile.fullWidth === true;
  const sheetIcon = tile.sheetIcon ?? tile.icon;
  return (
    <>
      <button type="button" className={`criterion-tile${full ? ' is-full' : ''}`} onClick={() => setOpen(true)} aria-haspopup="dialog"
        aria-label={`${tile.label} : ${value}`}>
        <Icon name={tile.icon} className="icon criterion-icon" />
        <span className="criterion-text">
          <span className="criterion-label">{tile.label}</span>
          <span className="criterion-value">{value}</span>
        </span>
        {(!app || full) && <Icon name={app ? 'chevronRight' : 'chevronDown'} className="icon criterion-chevron" />}
      </button>
      {tile.kind === 'single' ? (
        <SelectionDialog
          open={open}
          onClose={() => setOpen(false)}
          title={tile.sheetTitle ?? tile.label}
          subtitle={tile.subtitle}
          icon={sheetIcon}
          options={tile.options}
          selection={tile.value}
          currentTitle={tile.format}
          customAmount={tile.custom}
          onValidate={(next) => onApply((draft) => tile.apply(draft, next))}
        />
      ) : (
        <SelectionDialog
          multiple
          open={open}
          onClose={() => setOpen(false)}
          title={tile.sheetTitle}
          subtitle={tile.subtitle}
          icon={sheetIcon}
          options={tile.options}
          selection={tile.values}
          anyTitle={tile.anyTitle}
          anySubtitle={tile.anySubtitle}
          onValidate={(next) => onApply((draft) => tile.apply(draft, next))}
        />
      )}
    </>
  );
}

/**
 * Titre trop long pour sa ligne (petit téléphone, pictogramme) : il se resserre jusqu'à 80 % de sa taille au lieu
 * d'être coupé par « … », comme les titres de l'accueil de l'app (minimumScaleFactor 0,8).
 */
function useShrinkToFit() {
  const ref = useRef<HTMLHeadingElement>(null);
  useLayoutEffect(() => {
    const title = ref.current;
    if (!title) return;
    // Largeur exacte du texte entier, mesurée sur un double invisible du titre : scrollWidth est arrondi au pixel, et un
    // titre qui dépasse d'une fraction de pixel serait coupé sans que cela se voie à la mesure.
    const textWidth = () => {
      const probe = document.createElement('span');
      probe.textContent = title.textContent;
      probe.style.cssText = 'position:absolute;left:-10000px;top:0;visibility:hidden;white-space:nowrap';
      title.append(probe);
      const width = probe.getBoundingClientRect().width;
      probe.remove();
      return width;
    };
    const fit = () => {
      title.style.fontSize = '';
      const room = title.getBoundingClientRect().width;
      const full = parseFloat(getComputedStyle(title).fontSize);
      let size = full;
      let width = textWidth();
      while (width > room - 0.5 && size > full * 0.8) {
        size = Math.max(full * 0.8, Math.min(size - 0.25, (size * (room - 1)) / width));
        title.style.fontSize = `${size}px`;
        width = textWidth();
      }
    };
    fit();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(fit);
    observer.observe(title.parentElement ?? title);
    return () => observer.disconnect();
  }, []);
  return ref;
}

// ——— Téléphone et tablette (moins de 1024 px) : l'accueil de l'app ———

/** Couleur d'une rubrique : fond clair du pavé et encre du pictogramme (palette NidaloTint de l'app). */
type SectionTint = 'blue' | 'green' | 'teal' | 'amber' | 'gray' | 'red';

/**
 * En-tête d'une rubrique (HomeSectionHeader) : pavé de 36 (coins 10, fond clair) au pictogramme de 22 dans la couleur
 * de la rubrique, titre 18 gras, « Voir tout » à droite, sous-titre aligné sur le titre.
 */
function AppSectionHeader({ id, title, subtitle, href, icon, tint }: {
  id: string; title: string; subtitle?: string; href?: string; icon: IconName; tint: SectionTint;
}) {
  const titleRef = useShrinkToFit();
  return (
    <div className="home-section-header">
      <span className={`home-section-tile tint-${tint}`} aria-hidden="true"><Icon name={icon} /></span>
      <div className="home-section-text">
        <div className="home-section-row">
          <h2 id={id} ref={titleRef}>{title}</h2>
          {href && (
            <a className="home-section-see-all" href={href} aria-label={`Voir tout : ${title}`}>
              Voir tout<Icon name="chevronRight" />
            </a>
          )}
        </div>
        {subtitle && <p>{subtitle}</p>}
      </div>
    </div>
  );
}

/** Barre du haut sans fond (HomeTopBar) : logo maison et « NIDΛLO », cloche dans un rond blanc avec son point rouge. */
function HomeTopBar({ unread }: { unread: number }) {
  return (
    <div className="home-app-top">
      <h1 className="home-app-brand">
        <img className="home-app-logo" src="/assets/logo-maison.svg" width={32} height={27} alt="" />
        <img className="home-app-word" src="/assets/wordmark-accueil.svg" width={90} height={14} alt="" />
        <span className="visually-hidden">Nidalo</span>
      </h1>
      <a className="home-app-bell" href={accountPath('notifications')} aria-label={notificationsLabel(unread)}>
        <span className="home-app-bell-circle">
          <Icon name="bell" />
          {unread > 0 && <span className="home-app-dot" aria-hidden="true" />}
        </span>
      </a>
    </div>
  );
}

type CategoryCardProps = {
  mode: SearchMode;
  draft: SearchDraft;
  changeMode: (next: SearchMode) => void;
  update: (change: (current: SearchDraft) => SearchDraft) => void;
  choosePlace: (place: PlaceSuggestion) => void;
  startSearch: (event?: FormEvent) => void;
  openFilters: () => void;
};

/**
 * Carte des catégories (HomeCategoryCard) : quatre pavés ; toucher une catégorie ouvre ses filtres dans la carte, en
 * accordéon (lieu, champs de la catégorie, « Plus de critères », recherche, « Réduire »). Une autre catégorie bascule
 * sur ses filtres, la même ou « Réduire » referme. Aucune ouverte au départ. La carte change de hauteur avec la
 * courbe de l'app ; avec « Réduire les animations », sans mouvement.
 */
function HomeCategoryCard({ mode, draft, changeMode, update, choosePlace, startSearch, openFilters }: CategoryCardProps) {
  const filtersId = useId();
  const [open, setOpen] = useState(false);
  const [entering, setEntering] = useState(false);
  /** Filtres en train de se refermer : sortis du flux, à leur place, le temps que la carte rapetisse. */
  const [leavingTop, setLeavingTop] = useState<number | null>(null);
  const card = useRef<HTMLFormElement>(null);
  const filters = useRef<HTMLDivElement>(null);
  const startHeight = useRef<number | null>(null);
  const motion = useRef<Animation | null>(null);

  function rememberHeight() {
    startHeight.current = card.current?.getBoundingClientRect().height ?? null;
  }

  function collapse(fromButton: boolean) {
    rememberHeight();
    const top = filters.current?.offsetTop ?? null;
    setOpen(false);
    setEntering(false);
    setLeavingTop(prefersReducedMotion() ? null : top);
    // « Réduire » disparaît avec les filtres : le pavé de la catégorie reprend le focus.
    if (fromButton) card.current?.querySelector<HTMLButtonElement>(`.mode-tab-${mode}`)?.focus();
  }

  function toggle(next: SearchMode) {
    if (open && next === mode) {
      collapse(false);
      return;
    }
    rememberHeight();
    if (next !== mode) changeMode(next);
    if (!open) setEntering(true);
    setLeavingTop(null);
    setOpen(true);
  }

  // Hauteur de la carte : de l'ancienne à la nouvelle, avec la courbe de l'app (0,45 s).
  useLayoutEffect(() => {
    const element = card.current;
    const from = startHeight.current;
    startHeight.current = null;
    if (!element || from === null) return;
    motion.current?.cancel();
    motion.current = null;
    const to = element.getBoundingClientRect().height;
    if (prefersReducedMotion() || Math.abs(to - from) < 1 || typeof element.animate !== 'function') {
      element.classList.remove('is-moving');
      if (!open) setLeavingTop(null);
      return;
    }
    element.classList.add('is-moving');
    const animation = element.animate([{ height: `${from}px` }, { height: `${to}px` }], {
      duration: 450,
      easing: 'cubic-bezier(0.24, 0.15, 0.2, 1.13)',
    });
    motion.current = animation;
    animation.onfinish = () => {
      if (motion.current !== animation) return;
      motion.current = null;
      element.classList.remove('is-moving');
      if (!open) setLeavingTop(null);
    };
  }, [open, mode]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => motion.current?.cancel(), []);

  const shown = open || leavingTop !== null;
  const fields = categoryFields(draft);
  const hint = categoryMoreHint(mode);
  return (
    <form ref={card} className="home-category" role="search" aria-label="Rechercher un bien" onSubmit={startSearch}>
      <ModeTabs mode={mode} onChange={changeMode} accordion={{ open, controls: filtersId, onToggle: toggle }} />
      {shown && (
        <div
          ref={filters}
          id={filtersId}
          className={`home-category-filters${entering && open ? ' is-entering' : ''}${!open ? ' is-leaving' : ''}`}
          style={!open && leavingTop !== null ? { position: 'absolute', top: leavingTop, left: 10, right: 10 } : undefined}
          inert={!open ? true : undefined}
        >
          <div className="home-category-rule" aria-hidden="true" />
          <PlaceField
            variant="home"
            className="home-category-place"
            label={mode === 'invest' ? 'Où investir ?' : 'Où cherchez-vous ?'}
            placeholder="Ville, quartier, code postal..."
            value={draft.place}
            onChange={(text) => update((d) => ({ ...d, place: text }))}
            onChoose={choosePlace}
            onSubmit={() => startSearch()}
            shortcuts
          />
          <div className="home-category-fields">
            {fields.map((tile) => (
              <CriterionTile key={`${mode}-${tile.id}`} tile={tile} onApply={update} app />
            ))}
          </div>
          <button type="button" className="home-more" onClick={openFilters} aria-label={`Plus de critères : ${hint}`}>
            <Icon name="sliders" />
            <span className="home-more-title">Plus de critères</span>
            <span className="home-more-hint">{hint}</span>
            <Icon name="chevronRight" className="icon home-more-chevron" />
          </button>
          <button type="submit" className="home-search-button">
            <Icon name="search" />
            <span className="home-search-title">{categorySearchTitle(mode)}</span>
            <Icon name="arrowRight" />
          </button>
          <button type="button" className="home-collapse" onClick={() => collapse(true)} aria-label="Réduire les filtres">
            <Icon name="chevronUp" />
            Réduire
          </button>
        </div>
      )}
    </form>
  );
}

/** La recherche enregistrée consultée (ou créée) le plus récemment : celle que « Reprendre ma recherche » relance. */
function lastSavedSearch(items: SavedSearch[]): SavedSearch | null {
  const lastUse = (item: SavedSearch) => new Date(item.last_viewed_at ?? item.created_at).getTime();
  return items.reduce<SavedSearch | null>((best, item) => (best === null || lastUse(item) > lastUse(best) ? item : best), null);
}

/**
 * « Reprendre ma recherche » (HomeResumeSearchCard) : pavé bleu clair à l'icône d'historique, résumé de la recherche,
 * nombre de nouvelles annonces s'il y en a, chevron. La toucher relance la recherche, comme « Mes recherches ».
 */
function ResumeSearchCard({ item }: { item: SavedSearch }) {
  const [news, setNews] = useState(0);
  const key = `${item.id}:${item.last_viewed_at ?? ''}:${JSON.stringify(item.query)}`;
  useEffect(() => {
    let cancelled = false;
    setNews(0);
    countFor(item).then((count) => { if (!cancelled) setNews(count.news); }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  const summary = resumeSummaryOf(item.query);
  const label = news > 0
    ? `Reprendre ma recherche : ${summary}, ${news === 1 ? '1 nouvelle annonce' : `${news} nouvelles annonces`}`
    : `Reprendre ma recherche : ${summary}`;
  async function resume() {
    await markViewed(item.id).catch(() => undefined);
    window.location.assign(runPath(item));
  }
  return (
    <button type="button" className="home-resume" onClick={() => void resume()} aria-label={label}>
      <span className="home-resume-icon" aria-hidden="true"><Icon name="history" /></span>
      <span className="home-resume-text">
        <span className="home-resume-title">Reprendre ma recherche</span>
        <span className="home-resume-summary">{summary}</span>
      </span>
      {news > 0 && <span className="home-resume-new" aria-hidden="true">+{news}</span>}
      <Icon name="chevronRight" className="icon home-resume-chevron" />
    </button>
  );
}

type Extras = { viewed: ListingRow[]; similar: Result[] };

type PhoneHomeProps = CategoryCardProps & {
  drafts: Record<SearchMode, SearchDraft>;
  feed: HomeFeed | null;
  extras: Extras;
};

function PhoneHome({ mode, draft, drafts, feed, extras, changeMode, update, choosePlace, startSearch, openFilters }: PhoneHomeProps) {
  const session = useSession();
  const userId = session.status === 'signedIn' ? session.userId : null;
  const saved = useStore(savedSearchesStore);
  const notifications = useStore(notificationsStore);

  // « Reprendre ma recherche » : les recherches enregistrées du compte (aucune sans compte).
  useEffect(() => {
    if (session.status === 'loading') return;
    void loadSavedSearches();
  }, [session.status, userId]);

  // Cloche : les notifications non lues font le point rouge. Lues une fois, sans temps réel (la barre du haut n'est
  // visible que sous 761 px ; au-dessus, l'en-tête bleu du site prend sa place).
  useEffect(() => {
    if (userId === null) return;
    const phone = () => {
      try { return window.matchMedia('(max-width: 760px)').matches; } catch { return false; }
    };
    if (phone()) void loadNotifications();
    const onShow = (event: PageTransitionEvent) => { if (event.persisted && phone()) void loadNotifications(); };
    window.addEventListener('pageshow', onShow);
    return () => window.removeEventListener('pageshow', onShow);
  }, [userId]);

  const unread = userId !== null && notifications.status === 'ready' ? unreadNotificationCount(notifications.items) : 0;
  const resume = saved.status === 'ready' && userId !== null ? lastSavedSearch(saved.items) : null;
  const sectionHref = searchHref(draft);
  const opportunities = feed?.opportunities ?? [];
  const highlightsOf = (row: ListingRow) => highlightsFor(row, null);
  return (
    <div className="home-app">
      <HomeTopBar unread={unread} />
      <HomeCategoryCard mode={mode} draft={draft} changeMode={changeMode} update={update} choosePlace={choosePlace}
        startSearch={startSearch} openFilters={openFilters} />
      {resume && <ResumeSearchCard item={resume} />}

      <div className="home-app-sections" aria-busy={feed === null}>
        {opportunities.length > 0 && (
          <section className="home-app-section is-first" aria-labelledby="opportunites">
            <AppSectionHeader id="opportunites" title="Opportunités du moment" subtitle="Sélectionnés selon vos critères et le marché."
              href={searchHref(switchMode(draft, 'invest', drafts.invest))} icon="sparkles" tint="blue" />
            <ul className="home-app-carousel">
              {opportunities.map(({ row, highlights }) => (
                <li key={row.id}>
                  <HomeListingCard row={row} highlights={highlights} badge="yield" heart href={listingPath(row.id, 'invest')} investment className="opportunity-card" />
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className={`home-cities${opportunities.length > 0 ? '' : ' is-first'}`} aria-labelledby="villes">
          <AppSectionHeader id="villes" title="Explorer par ville" icon="pin" tint="teal" />
          <ul className="home-app-carousel">
            {EXPLORED_CITIES.map((city) => (
              <li key={city}>
                {/* La ville dans la catégorie choisie, ses autres critères gardés : comme la ville saisie, puis « Rechercher ». */}
                <a className="home-city" href={searchHref({ ...draft, place: city, chosen: null, area: null })} aria-label={`Rechercher à ${city}`}>
                  <Icon name="pin" />
                  {city}
                </a>
              </li>
            ))}
          </ul>
        </section>

        {extras.viewed.length > 0 && (
          <section className="home-app-section" aria-labelledby="consultes">
            <AppSectionHeader id="consultes" title="Consultés récemment" href={sectionHref} icon="clock" tint="gray" />
            <ul className="home-app-carousel">
              {extras.viewed.map((row) => (
                <li key={row.id}>
                  <CompactListingCard row={row} highlights={highlightsOf(row)} accessory="none" href={listingPath(row.id)} />
                </li>
              ))}
            </ul>
          </section>
        )}

        {extras.similar.length > 0 && (
          <section className="home-app-section" aria-labelledby="similaires">
            <AppSectionHeader id="similaires" title="Biens similaires à vos recherches" href={sectionHref} icon="crosshair" tint="green" />
            <ul className="home-app-carousel">
              {extras.similar.map(({ row, highlights }) => (
                <li key={row.id}>
                  <SimilarListingCard row={row} highlights={highlights} href={listingPath(row.id)} />
                </li>
              ))}
            </ul>
          </section>
        )}

        {feed && feed.newest.length > 0 && (
          <section className="home-app-section" aria-labelledby="nouveautes">
            <AppSectionHeader id="nouveautes" title="Nouveautés" subtitle="Les dernières annonces publiées sur Nidalo." href={sectionHref}
              icon="zap" tint="amber" />
            <ul className="home-app-carousel">
              {feed.newest.map((row) => (
                <li key={row.id}>
                  <CompactListingCard row={row} highlights={highlightsOf(row)} accessory="new" href={listingPath(row.id)} />
                </li>
              ))}
            </ul>
          </section>
        )}

        {feed && feed.priceDrops.length > 0 && (
          <section className="home-app-section" aria-labelledby="baisses">
            <AppSectionHeader id="baisses" title="Baisses de prix" subtitle="Des biens qui ont récemment baissé leur prix." href={sectionHref}
              icon="trendingDown" tint="red" />
            <ul className="home-app-carousel">
              {feed.priceDrops.map((row) => (
                <li key={row.id}>
                  <CompactListingCard row={row} highlights={highlightsOf(row)} accessory="priceDrop" href={listingPath(row.id)} />
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}

/** Attente avant de recharger « Biens similaires à vos recherches » après un changement de recherche (n° 61). */
const FEED_RELOAD_DELAY = 600;

/**
 * « Consultés récemment » et « Biens similaires à vos recherches » (HomeView.swift), au téléphone comme sur
 * ordinateur. Le projet du compte règle d'abord la recherche de sa catégorie (AppRouter.applyProject).
 */
function useHomeExtras(mode: SearchMode, draft: SearchDraft, drafts: Record<SearchMode, SearchDraft>,
  applyProject: (mode: SearchMode, next: SearchDraft, untouched: SearchDraft) => void): Extras {
  const session = useSession();
  const userId = session.status === 'signedIn' ? session.userId : null;
  const [projectSettled, setProjectSettled] = useState(false);
  const [viewed, setViewed] = useState<ListingRow[]>([]);
  const [similar, setSimilar] = useState<Result[]>([]);
  const firstDrafts = useRef(drafts);
  const currentDraft = useRef(draft);
  currentDraft.current = draft;

  // Projet du compte : il règle la recherche de sa catégorie dès qu'il a des critères (AppRouter.applyProject).
  useEffect(() => {
    if (session.status === 'loading') return;
    if (userId === null) {
      setProjectSettled(true);
      return;
    }
    let cancelled = false;
    loadProjectSearch(userId)
      .then((project) => { if (!cancelled && project) applyProject(project.mode, project.draft, firstDrafts.current[project.mode]); })
      // Projet illisible : la recherche reste celle de la catégorie, comme sans projet.
      .catch(() => undefined)
      .finally(() => { if (!cancelled) setProjectSettled(true); });
    return () => { cancelled = true; };
  }, [session.status, userId]); // eslint-disable-line react-hooks/exhaustive-deps

  // « Biens similaires à vos recherches » : la recherche de la catégorie choisie, 10 biens (HomeView.loadFeed),
  // relancée quand la catégorie ou la recherche change (HomeFeedKey, n° 61). Après le premier chargement, elle attend
  // 0,6 s sans autre changement : un lieu tapé dans la carte de recherche ne la relance qu'une fois la saisie posée.
  const feedKey = `${mode}?${paramsFromDraft(draft).toString()}`;
  const didLoadFeed = useRef(false);
  useEffect(() => {
    if (!projectSettled) return;
    let cancelled = false;
    const current = currentDraft.current;
    const load = () => {
      didLoadFeed.current = true;
      search(current, (row) => highlightsFor(row, current.mode === 'invest' ? current.downPayment : null))
        .then((results) => { if (!cancelled) setSimilar(results.slice(0, SIMILAR_LIMIT)); })
        .catch(() => { if (!cancelled) setSimilar([]); });
    };
    const timer = didLoadFeed.current ? window.setTimeout(load, FEED_RELOAD_DELAY) : undefined;
    if (timer === undefined) load();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [projectSettled, feedKey]);

  // « Consultés récemment » : fiches ouvertes dans cet onglet, relues au retour par « Précédent ».
  useEffect(() => {
    let cancelled = false;
    const load = () => {
      loadViewedListings(recentlyViewedIds())
        .then((rows) => { if (!cancelled) setViewed(rows); })
        .catch(() => undefined);
    };
    load();
    const onShow = (event: PageTransitionEvent) => { if (event.persisted) load(); };
    window.addEventListener('pageshow', onShow);
    return () => {
      cancelled = true;
      window.removeEventListener('pageshow', onShow);
    };
  }, []);

  return { viewed, similar };
}

// ——— Ordinateur (≥ 1024 px) : mise en page de la maquette 1 de Romain ———
// Même état, mêmes tuiles, même recherche et mêmes filtres que l'accueil du téléphone ; les cartes d'annonce sont
// celles de l'accueil de l'app : HomeListingCard en grille, et CompactListingCard (la carte compacte du téléphone,
// de la largeur de sa colonne) pour les listes.

function DesktopSectionHead({ id, title, subtitle, href, picto }: { id: string; title: string; subtitle?: string; href: string; picto?: IconName }) {
  return (
    <div className="dhome-head">
      <div className="dhome-head-text">
        {picto ? (
          <div className="dhome-title">
            <Icon name={picto} className="icon dhome-picto" />
            <h2 id={id}>{title}</h2>
          </div>
        ) : <h2 id={id}>{title}</h2>}
        {subtitle && <p>{subtitle}</p>}
      </div>
      <a href={href} className="dhome-see-all">Voir tout<Icon name="chevronRight" /></a>
    </div>
  );
}

type DesktopHomeProps = {
  greeting: string;
  mode: SearchMode;
  draft: SearchDraft;
  drafts: Record<SearchMode, SearchDraft>;
  tiles: CriterionTileSpec[];
  feed: HomeFeed | null;
  extras: Extras;
  update: (change: (current: SearchDraft) => SearchDraft) => void;
  changeMode: (next: SearchMode) => void;
  choosePlace: (place: PlaceSuggestion) => void;
  startSearch: (event?: FormEvent) => void;
  openFilters: () => void;
};

function DesktopHome({ greeting, mode, draft, drafts, tiles, feed, extras, update, changeMode, choosePlace, startSearch, openFilters }: DesktopHomeProps) {
  const { viewed, similar } = extras;
  const sectionHref = searchHref(draft);
  return (
    <div className="dhome">
      <section className="dhome-band" aria-labelledby="accueil-titre">
        <div className="dhome-inner">
          <h1 id="accueil-titre">{greeting}</h1>
          <p>Que recherchez-vous aujourd’hui ?</p>
        </div>
      </section>
      <div className="dhome-inner dhome-card-wrap">
        <form className="home-search-card dhome-search" role="search" aria-label="Rechercher un bien" onSubmit={startSearch}>
          <ModeTabs mode={mode} onChange={changeMode} />
          {/* Le lieu sur toute la largeur, puis les critères en blocs en dessous, deux par ligne comme dans l'app
              (demande de Romain du 7 novembre : plus tous les critères côte à côte). */}
          <PlaceField
            variant="home"
            className="home-place-field dhome-place"
            label="Où cherchez-vous ?"
            placeholder="Ville, quartier, code postal..."
            value={draft.place}
            onChange={(text) => update((d) => ({ ...d, place: text }))}
            onChoose={choosePlace}
            onSubmit={() => startSearch()}
            shortcuts
          />
          <div className="dhome-tiles">
            {tiles.map((tile) => (
              <CriterionTile key={`${mode}-${tile.id}`} tile={tile} onApply={update} />
            ))}
          </div>
          <div className="dhome-actions">
            <button type="button" className="dhome-more" onClick={openFilters} aria-label={`Plus de critères : ${moreCriteriaHint(mode)}`}>
              <Icon name="sliders" />
              <span className="dhome-more-title">Plus de critères</span>
              <span className="dhome-more-hint">{moreCriteriaHint(mode)}</span>
              <Icon name="chevronRight" />
            </button>
            <button type="submit" className="home-search-button dhome-submit">
              <Icon name="search" />
              <span>{mode === 'hotel' ? 'Rechercher des hôtels' : 'Rechercher des biens'}</span>
            </button>
          </div>
        </form>
      </div>

      <div className="dhome-sections" aria-busy={feed === null}>
        {feed && feed.opportunities.length > 0 && (
          <section className="home-section dhome-section dhome-opportunities" aria-labelledby="opportunites">
            <div className="dhome-inner">
              <DesktopSectionHead id="opportunites" title="Opportunités du moment" subtitle="Des biens sélectionnés selon vos critères et le marché actuel."
                href={searchHref(switchMode(draft, 'invest', drafts.invest))} picto="pictoOpportunites" />
              <div className="dhome-grid">
                {feed.opportunities.map(({ row, highlights }) => (
                  <HomeListingCard key={row.id} row={row} highlights={highlights} badge="yield" heart href={listingPath(row.id, 'invest')} investment className="opportunity-card" />
                ))}
              </div>
            </div>
          </section>
        )}
        {viewed.length > 0 && (
          <section className="home-section dhome-section" aria-labelledby="consultes">
            <div className="dhome-inner">
              <DesktopSectionHead id="consultes" title="Consultés récemment" href={sectionHref} picto="pictoConsultes" />
              <div className="dhome-list">
                {viewed.map((row) => (
                  <CompactListingCard key={row.id} row={row} highlights={highlightsFor(row, null)} accessory="none" href={listingPath(row.id)} />
                ))}
              </div>
            </div>
          </section>
        )}
        {similar.length > 0 && (
          <section className="home-section dhome-section" aria-labelledby="similaires">
            <div className="dhome-inner">
              <DesktopSectionHead id="similaires" title="Biens similaires à vos recherches" href={sectionHref} picto="pictoSimilaires" />
              <div className="dhome-grid">
                {similar.map(({ row, highlights }) => (
                  <HomeListingCard key={row.id} row={row} highlights={highlights} badge="yield" heart href={listingPath(row.id)} investment={mode === 'invest'} />
                ))}
              </div>
            </div>
          </section>
        )}
        {feed && feed.newest.length > 0 && (
          <section className="home-section dhome-section" aria-labelledby="nouveautes">
            <div className="dhome-inner">
              <DesktopSectionHead id="nouveautes" title="Nouveautés" subtitle="Les dernières annonces publiées sur Nidalo." href={sectionHref} picto="pictoNouveautes" />
              <div className="dhome-list">
                {feed.newest.map((row) => (
                  <CompactListingCard key={row.id} row={row} highlights={highlightsFor(row, null)} accessory="new" href={listingPath(row.id)} />
                ))}
              </div>
            </div>
          </section>
        )}
        {feed && feed.priceDrops.length > 0 && (
          <section className="home-section dhome-section" aria-labelledby="baisses">
            <div className="dhome-inner">
              <DesktopSectionHead id="baisses" title="Baisses de prix" subtitle="Des biens qui ont récemment baissé leur prix." href={sectionHref} picto="pictoBaisses" />
              <div className="dhome-list">
                {feed.priceDrops.map((row) => (
                  <CompactListingCard key={row.id} row={row} highlights={highlightsFor(row, null)} accessory="priceDrop" href={listingPath(row.id)} />
                ))}
              </div>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

export function HomePage() {
  const [mode, setMode] = useState<SearchMode>('buy');
  const [drafts, setDrafts] = useState<Record<SearchMode, SearchDraft>>(
    () => Object.fromEntries(MODES.map((m) => [m, defaultDraft(m)])) as Record<SearchMode, SearchDraft>,
  );
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [feed, setFeed] = useState<HomeFeed | null>(null);
  const draft = drafts[mode];
  const session = useSession();
  const account = useStore(accountStore);

  useEffect(() => {
    if (session.status === 'signedIn') void loadAccount();
  }, [session.status, session.status === 'signedIn' ? session.userId : null]);

  useEffect(() => {
    let cancelled = false;
    loadHomeFeed((row) => highlightsFor(row, null))
      .then((loaded) => { if (!cancelled) setFeed(loaded); })
      // Sections en plus de la recherche : sans réseau, l'accueil reste utilisable sans elles.
      .catch(() => { if (!cancelled) setFeed({ opportunities: [], newest: [], priceDrops: [] }); });
    return () => { cancelled = true; };
  }, []);

  // Le projet du compte règle la recherche de sa catégorie (AppRouter.applyProject), sauf si elle a déjà été
  // modifiée sur la page.
  const applyProject = (kind: SearchMode, next: SearchDraft, untouched: SearchDraft) =>
    setDrafts((all) => (all[kind] === untouched ? { ...all, [kind]: next } : all));
  const extras = useHomeExtras(mode, draft, drafts, applyProject);

  const update = (change: (current: SearchDraft) => SearchDraft) =>
    setDrafts((all) => ({ ...all, [mode]: change(all[mode]) }));

  function changeMode(next: SearchMode) {
    if (next === mode) return;
    // Chaque mode garde ses critères ; le lieu suit (voir switchMode).
    setDrafts((all) => ({ ...all, [next]: switchMode(all[mode], next, all[next]) }));
    setMode(next);
  }

  function choosePlace(place: PlaceSuggestion) {
    const chosen = chosenFromSuggestion(place);
    update((d) => ({ ...d, place: chosen.name, area: null, drawnZone: null, chosen }));
  }

  function startSearch(event?: FormEvent) {
    event?.preventDefault();
    window.location.assign(searchHref(draft));
  }

  const name = account.status === 'ready' ? greetingName(account.account) : null;
  // « Bonjour Romain », « Bonjour » sans prénom connu, « Bienvenue sur Nidalo » sans compte (HomeBanner).
  const greeting = session.status === 'signedIn' ? (name ? `Bonjour ${name}` : 'Bonjour') : 'Bienvenue sur Nidalo';
  const desktop = useDesktop();
  const openFilters = () => setFiltersOpen(true);

  return (
    <Page section="home">
      {desktop ? (
        <DesktopHome greeting={greeting} mode={mode} draft={draft} drafts={drafts} tiles={homeTiles(draft)} feed={feed} extras={extras}
          update={update} changeMode={changeMode} choosePlace={choosePlace} startSearch={startSearch} openFilters={openFilters} />
      ) : (
        <PhoneHome mode={mode} draft={draft} drafts={drafts} feed={feed} extras={extras} changeMode={changeMode} update={update}
          choosePlace={choosePlace} startSearch={startSearch} openFilters={openFilters} />
      )}
      <FiltersDialog
        open={filtersOpen}
        draft={draft}
        remembered={drafts}
        onClose={() => setFiltersOpen(false)}
        onApply={(next) => {
          // Depuis l'accueil, « Afficher N annonces » ouvre la liste des résultats de la catégorie.
          setFiltersOpen(false);
          window.location.assign(searchHref(next));
        }}
        onShowMap={(next) => {
          setFiltersOpen(false);
          window.location.assign(searchHref(next, true));
        }}
      />
    </Page>
  );
}
