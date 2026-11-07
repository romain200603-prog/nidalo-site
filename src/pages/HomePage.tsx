import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Icon } from '../components/Icon';
import { Page } from '../components/Layout';
import { ModeTabs } from '../components/ModeTabs';
import { PlaceField } from '../components/PlaceField';
import { ListingPhoto } from '../components/PhotoPager';
import { SelectionDialog } from '../components/SelectionDialog';
import { HeartButton } from '../components/account/HeartButton';
import { FiltersDialog } from './FiltersDialog';
import { accountStore, greetingName, loadAccount } from '../lib/account/profile';
import { useSession, useStore } from '../lib/account/session';
import { GOOD_YIELD, grossYieldText } from '../lib/cardContent';
import { formatArea, formatFraction, formatPrice } from '../lib/format';
import { highlightsFor } from '../lib/highlights';
import { homeTiles, moreCriteriaHint, type CriterionTileSpec } from '../lib/homeCriteria';
import { homeTag, loadHomeFeed, priceDrop, type HomeFeed } from '../lib/homeFeed';
import type { SearchMode } from '../lib/labels';
import { sortedPhotos, type ListingRow } from '../lib/listings';
import { listingPath, PATHS } from '../lib/paths';
import { placeShortName, type PlaceSuggestion } from '../lib/places';
import { defaultDraft, paramsFromDraft, search, switchMode, type Highlights, type Result, type SearchDraft } from '../lib/search';
import { useDesktop } from '../lib/desktop';
import { loadProjectSearch, loadViewedListings, SIMILAR_LIMIT } from '../lib/homeDesktop';
import { recentlyViewedIds } from '../lib/recentlyViewed';
import '../styles/ordinateur-accueil.css';

// Accueil, comme l'app (Features/Home/HomeView.swift) : bandeau bleu, carte de recherche (mode, lieu, critères,
// « Plus de critères », « Rechercher »), puis les sections de biens réels.

const MODES: SearchMode[] = ['buy', 'rent', 'invest', 'hotel'];

function searchHref(draft: SearchDraft, mapOpen = false): string {
  const params = paramsFromDraft(draft);
  if (mapOpen) params.set('vue', 'carte');
  return `${PATHS.search}?${params.toString()}`;
}

/** Tuile de critère : icône, petit libellé, valeur en gras et chevron ; ouvre le menu de sélection. */
function CriterionTile({ tile, onApply }: { tile: CriterionTileSpec; onApply: (apply: (draft: SearchDraft) => SearchDraft) => void }) {
  const [open, setOpen] = useState(false);
  const value = tile.kind === 'single' ? tile.format(tile.value) : tile.valueLabel;
  return (
    <>
      <button type="button" className="criterion-tile" onClick={() => setOpen(true)} aria-haspopup="dialog"
        aria-label={`${tile.label} : ${value}`}>
        <Icon name={tile.icon} className="icon criterion-icon" />
        <span className="criterion-text">
          <span className="criterion-label">{tile.label}</span>
          <span className="criterion-value">{value}</span>
        </span>
        <Icon name="chevronDown" className="icon criterion-chevron" />
      </button>
      {tile.kind === 'single' ? (
        <SelectionDialog
          open={open}
          onClose={() => setOpen(false)}
          title={tile.sheetTitle ?? tile.label}
          subtitle={tile.subtitle}
          icon={tile.icon}
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
          icon={tile.icon}
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

function SectionHeader({ id, title, subtitle, href }: { id: string; title: string; subtitle?: string; href?: string }) {
  return (
    <div className="home-section-head">
      <div className="home-section-title">
        <h2 id={id}>{title}</h2>
        {href && <a href={href} className="home-section-more">Voir tout<Icon name="chevronRight" /></a>}
      </div>
      {subtitle && <p>{subtitle}</p>}
    </div>
  );
}

function Tag({ text, tone = 'brand' }: { text: string; tone?: 'brand' | 'positive' | 'solid' }) {
  return <span className={`home-tag home-tag-${tone}`}>{text}</span>;
}

function Price({ row }: { row: ListingRow }) {
  return (
    <span className="home-price">
      {formatPrice(Number(row.price))}
      {row.transaction === 'rent' && <small>/mois</small>}
    </span>
  );
}

/** Grande carte « Opportunités du moment » : photo, rentabilité, étiquette, titre, lieu, prix, loyer, point fort. */
function OpportunityCard({ row, highlights }: { row: ListingRow; highlights: Highlights | null }) {
  // Loyer tiré du rendement brut, arrondi à l'euro comme l'app (MonthlyRentLine).
  const monthlyRent = highlights ? highlights.text?.monthlyRentFromYield ?? formatPrice(Math.round((Number(row.price) * highlights.grossYield) / 12)) : null;
  return (
    <article className="home-card opportunity-card">
      <div className="opportunity-photo">
        <ListingPhoto photo={sortedPhotos(row)[0]} />
        {highlights && (
          <span className={`home-yield ${highlights.grossYield >= GOOD_YIELD ? 'tone-positive' : 'tone-caution'}`}
            aria-label={`Rentabilité brute ${grossYieldText(highlights)}`}>
            {grossYieldText(highlights)}
          </span>
        )}
        <HeartButton listingId={row.id} />
      </div>
      <div className="opportunity-body">
        <Tag text={homeTag(row, highlights !== null)} />
        <h3><a className="stretched" href={listingPath(row.id, 'invest')}>{row.title}</a></h3>
        <p className="home-place"><Icon name="pin" />{row.city} · {formatArea(Number(row.living_area))}</p>
        <Price row={row} />
        <div className="opportunity-foot">
          {monthlyRent !== null && (
            <span className="home-rent" aria-label={`Loyer estimé ${monthlyRent} par mois`}>
              <Icon name="chart" />{monthlyRent}/mois
            </span>
          )}
          {highlights && highlights.grossYield >= GOOD_YIELD && <Tag text="Bon rendement" tone="positive" />}
        </div>
      </div>
    </article>
  );
}

/** Carte compacte (nouveautés, baisses de prix) : photo à gauche, texte à droite. */
function CompactCard({ row, accessory }: { row: ListingRow; accessory: 'new' | 'priceDrop' }) {
  const drop = accessory === 'priceDrop' ? priceDrop(row) : null;
  return (
    <article className="home-card compact-card">
      {accessory === 'new' && <HeartButton listingId={row.id} className="heart-button heart-plain" />}
      <div className="compact-photo">
        <ListingPhoto photo={sortedPhotos(row)[0]} />
        {accessory === 'new' && <span className="compact-new"><Tag text="Nouveau" tone="solid" /></span>}
        {drop !== null && <span className="compact-drop">{formatFraction(drop, 0)}</span>}
      </div>
      <div className="compact-body">
        <h3><a className="stretched" href={listingPath(row.id)}>{row.title}</a></h3>
        <p className="home-place">{row.city} · {formatArea(Number(row.living_area))}</p>
        <p className="compact-prices">
          {accessory === 'priceDrop' && row.previous_price !== null && (
            <s aria-label={`Ancien prix ${formatPrice(Number(row.previous_price))}`}>{formatPrice(Number(row.previous_price))}</s>
          )}
          <Price row={row} />
        </p>
      </div>
    </article>
  );
}

// ——— Ordinateur (≥ 1024 px) : mise en page de la maquette 1 de Romain ———
// Même état, mêmes tuiles, même recherche et mêmes filtres que l'accueil du téléphone ci-dessous. S'y ajoutent deux
// sections de l'app absentes du site sur téléphone : « Consultés récemment » et « Biens similaires à vos recherches ».

/** Teinte du fond sans photo, selon le type de bien (DesignSystem/Components/ListingPhoto.swift 54–60). */
function placeholderTint(type: ListingRow['property_type']): string {
  switch (type) {
    case 'apartment': return 'apartment';
    case 'house': return 'house';
    case 'building': case 'commercial': case 'office': case 'hotel': return 'business';
    default: return 'other';
  }
}

/** Première photo ; sans photo, le fond teinté et l'icône photo de l'app (jamais « Photos à venir »). */
function DesktopPhoto({ row }: { row: ListingRow }) {
  const photo = sortedPhotos(row)[0];
  if (photo) return <ListingPhoto photo={photo} />;
  return (
    <div className={`dhome-no-photo tint-${placeholderTint(row.property_type)}`} aria-hidden="true">
      <Icon name="image" />
    </div>
  );
}

function DesktopPrice({ row }: { row: ListingRow }) {
  return (
    <span className="dhome-price">
      {formatPrice(Number(row.price))}
      {row.transaction === 'rent' && <small>/mois</small>}
    </span>
  );
}

function DesktopSectionHead({ id, title, subtitle, href }: { id: string; title: string; subtitle?: string; href: string }) {
  return (
    <div className="dhome-head">
      <div className="dhome-head-text">
        <h2 id={id}>{title}</h2>
        {subtitle && <p>{subtitle}</p>}
      </div>
      <a href={href} className="dhome-see-all">Voir tout<Icon name="chevronRight" /></a>
    </div>
  );
}

/**
 * Carte d'annonce sur ordinateur (Opportunités, Biens similaires) : photo de 196 px, rentabilité brute en pastille
 * blanche, cœur rond, catégorie, titre, ville et surface, prix et, à droite, le loyer tiré du rendement.
 */
function DesktopListingCard({ row, highlights, href, className = '', showsHighlight = false }: {
  row: ListingRow; highlights: Highlights | null; href: string; className?: string; showsHighlight?: boolean;
}) {
  // Loyer tiré du rendement brut, arrondi à l'euro comme l'app (MonthlyRentLine), comme sur le téléphone.
  const monthlyRent = highlights ? highlights.text?.monthlyRentFromYield ?? formatPrice(Math.round((Number(row.price) * highlights.grossYield) / 12)) : null;
  const good = highlights !== null && highlights.grossYield >= GOOD_YIELD;
  return (
    <article className={`dcard ${className}`}>
      <div className="dcard-photo">
        <DesktopPhoto row={row} />
        {highlights && (
          // Couleur de l'app (HomeYieldPill) : verte à partir de 7 %, orange en dessous.
          <span className={`dcard-yield ${good ? 'is-good' : 'is-low'}`}>
            <Icon name="trend" />
            <span className="home-yield" aria-label={`Rentabilité brute ${grossYieldText(highlights)}`}>{grossYieldText(highlights)}</span>
          </span>
        )}
        <HeartButton listingId={row.id} className="heart-button dcard-heart" />
      </div>
      <div className="dcard-body">
        <div className="dcard-tags">
          <span className="dcard-category">{homeTag(row, highlights !== null)}</span>
          {showsHighlight && good && <span className="dcard-highlight">Bon rendement</span>}
        </div>
        <h3><a className="stretched" href={href}>{row.title}</a></h3>
        <p className="dcard-place"><Icon name="pin" />{row.city} · {formatArea(Number(row.living_area))}</p>
        <div className="dcard-foot">
          <DesktopPrice row={row} />
          {monthlyRent !== null && (
            <span className="dcard-rent">
              <span className="dcard-rent-label">Loyer estimé</span>
              <span className="dcard-rent-value">{monthlyRent}/mois</span>
            </span>
          )}
        </div>
      </div>
    </article>
  );
}

/** Petite carte horizontale (Consultés récemment, Nouveautés, Baisses de prix), comme CompactListingCard. */
function DesktopSmallCard({ row, accessory = 'none' }: { row: ListingRow; accessory?: 'none' | 'new' | 'priceDrop' }) {
  const drop = accessory === 'priceDrop' ? priceDrop(row) : null;
  return (
    <article className="dsmall">
      <div className="dsmall-photo">
        <DesktopPhoto row={row} />
        {accessory === 'new' && <span className="dsmall-new">Nouveau</span>}
        {drop !== null && <span className="dsmall-drop">{formatFraction(drop, 0)}</span>}
      </div>
      <div className="dsmall-body">
        <h3><a className="stretched" href={listingPath(row.id)}>{row.title}</a></h3>
        <p className="dsmall-place">{row.city} · {formatArea(Number(row.living_area))}</p>
        <p className="dsmall-prices">
          {accessory === 'priceDrop' && row.previous_price !== null && (
            <s aria-label={`Ancien prix ${formatPrice(Number(row.previous_price))}`}>{formatPrice(Number(row.previous_price))}</s>
          )}
          <DesktopPrice row={row} />
        </p>
      </div>
      {accessory === 'new' && <HeartButton listingId={row.id} className="heart-button dsmall-heart" />}
    </article>
  );
}

type DesktopHomeProps = {
  greeting: string;
  mode: SearchMode;
  draft: SearchDraft;
  drafts: Record<SearchMode, SearchDraft>;
  tiles: CriterionTileSpec[];
  feed: HomeFeed | null;
  update: (change: (current: SearchDraft) => SearchDraft) => void;
  changeMode: (next: SearchMode) => void;
  choosePlace: (place: PlaceSuggestion) => void;
  startSearch: (event?: FormEvent) => void;
  openFilters: () => void;
  applyProject: (mode: SearchMode, next: SearchDraft, untouched: SearchDraft) => void;
};

function DesktopHome({ greeting, mode, draft, drafts, tiles, feed, update, changeMode, choosePlace, startSearch, openFilters, applyProject }: DesktopHomeProps) {
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
  }, [session.status, userId]);

  // « Biens similaires à vos recherches » : la recherche de la catégorie choisie, 10 biens (HomeView.loadFeed),
  // relancée quand la catégorie change (.task(id: router.searchIntent)).
  useEffect(() => {
    if (!projectSettled) return;
    let cancelled = false;
    const current = currentDraft.current;
    search(current, (row) => highlightsFor(row, current.mode === 'invest' ? current.downPayment : null))
      .then((results) => { if (!cancelled) setSimilar(results.slice(0, SIMILAR_LIMIT)); })
      .catch(() => { if (!cancelled) setSimilar([]); });
    return () => { cancelled = true; };
  }, [projectSettled, mode]);

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
                href={searchHref(switchMode(draft, 'invest', drafts.invest))} />
              <div className="dhome-grid">
                {feed.opportunities.map(({ row, highlights }) => (
                  <DesktopListingCard key={row.id} row={row} highlights={highlights} href={listingPath(row.id, 'invest')} className="opportunity-card" showsHighlight />
                ))}
              </div>
            </div>
          </section>
        )}
        {viewed.length > 0 && (
          <section className="home-section dhome-section" aria-labelledby="consultes">
            <div className="dhome-inner">
              <DesktopSectionHead id="consultes" title="Consultés récemment" href={sectionHref} />
              <div className="dhome-list">
                {viewed.map((row) => <DesktopSmallCard key={row.id} row={row} />)}
              </div>
            </div>
          </section>
        )}
        {similar.length > 0 && (
          <section className="home-section dhome-section" aria-labelledby="similaires">
            <div className="dhome-inner">
              <DesktopSectionHead id="similaires" title="Biens similaires à vos recherches" href={sectionHref} />
              <div className="dhome-grid">
                {similar.map(({ row, highlights }) => <DesktopListingCard key={row.id} row={row} highlights={highlights} href={listingPath(row.id)} />)}
              </div>
            </div>
          </section>
        )}
        {feed && feed.newest.length > 0 && (
          <section className="home-section dhome-section" aria-labelledby="nouveautes">
            <div className="dhome-inner">
              <DesktopSectionHead id="nouveautes" title="Nouveautés" subtitle="Les dernières annonces publiées sur Nidalo." href={sectionHref} />
              <div className="dhome-list">
                {feed.newest.map((row) => <DesktopSmallCard key={row.id} row={row} accessory="new" />)}
              </div>
            </div>
          </section>
        )}
        {feed && feed.priceDrops.length > 0 && (
          <section className="home-section dhome-section" aria-labelledby="baisses">
            <div className="dhome-inner">
              <DesktopSectionHead id="baisses" title="Baisses de prix" subtitle="Des biens qui ont récemment baissé leur prix." href={sectionHref} />
              <div className="dhome-list">
                {feed.priceDrops.map((row) => <DesktopSmallCard key={row.id} row={row} accessory="priceDrop" />)}
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

  const update = (change: (current: SearchDraft) => SearchDraft) =>
    setDrafts((all) => ({ ...all, [mode]: change(all[mode]) }));

  function changeMode(next: SearchMode) {
    if (next === mode) return;
    // Chaque mode garde ses critères ; le lieu suit (voir switchMode).
    setDrafts((all) => ({ ...all, [next]: switchMode(all[mode], next, all[next]) }));
    setMode(next);
  }

  function choosePlace(place: PlaceSuggestion) {
    const name = placeShortName(place);
    update((d) => ({ ...d, place: name, area: null, chosen: { kind: place.kind, name, postalCode: place.postalCode, inseeCode: place.inseeCode, coordinate: place.coordinate } }));
  }

  function startSearch(event?: FormEvent) {
    event?.preventDefault();
    window.location.assign(searchHref(draft));
  }

  const tiles = homeTiles(draft);
  const sectionHref = searchHref(draft);
  const name = account.status === 'ready' ? greetingName(account.account) : null;
  // « Bonjour Romain », « Bonjour » sans prénom connu, « Bienvenue sur Nidalo » sans compte (HomeBanner).
  const greeting = session.status === 'signedIn' ? (name ? `Bonjour ${name}` : 'Bonjour') : 'Bienvenue sur Nidalo';
  const desktop = useDesktop();

  if (desktop) {
    // Sur ordinateur, le projet du compte règle la recherche de sa catégorie (AppRouter.applyProject), sauf si elle
    // a déjà été modifiée sur la page.
    const applyProject = (kind: SearchMode, next: SearchDraft, untouched: SearchDraft) =>
      setDrafts((all) => (all[kind] === untouched ? { ...all, [kind]: next } : all));
    return (
      <Page section="home">
        <DesktopHome greeting={greeting} mode={mode} draft={draft} drafts={drafts} tiles={tiles} feed={feed} update={update}
          changeMode={changeMode} choosePlace={choosePlace} startSearch={startSearch} openFilters={() => setFiltersOpen(true)}
          applyProject={applyProject} />
        <FiltersDialog
          open={filtersOpen}
          draft={draft}
          remembered={drafts}
          onClose={() => setFiltersOpen(false)}
          onApply={(next) => {
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

  return (
    <Page section="home">
      <section className="home-band" aria-labelledby="accueil-titre">
        <div className="wrap home-band-inner">
          <h1 id="accueil-titre">{greeting}</h1>
          <p>Que recherchez-vous aujourd’hui ?</p>
        </div>
      </section>
      <div className="wrap home-card-wrap">
        <form className="home-search-card" role="search" aria-label="Rechercher un bien" onSubmit={startSearch}>
          <ModeTabs mode={mode} onChange={changeMode} />
          <PlaceField
            variant="home"
            className="home-place-field"
            label="Où cherchez-vous ?"
            placeholder="Ville, quartier, code postal..."
            value={draft.place}
            onChange={(text) => update((d) => ({ ...d, place: text }))}
            onChoose={choosePlace}
            onSubmit={() => startSearch()}
          />
          <div className="criterion-grid">
            {tiles.map((tile) => (
              <CriterionTile key={`${mode}-${tile.id}`} tile={tile} onApply={update} />
            ))}
          </div>
          <button type="button" className="more-criteria" onClick={() => setFiltersOpen(true)}
            aria-label={`Plus de critères : ${moreCriteriaHint(mode)}`}>
            <Icon name="sliders" />
            <span className="more-criteria-title">Plus de critères</span>
            <span className="more-criteria-hint">{moreCriteriaHint(mode)}</span>
            <Icon name="chevronRight" className="icon more-criteria-chevron" />
          </button>
          <button type="submit" className="home-search-button">
            <Icon name="search" />
            <span>{mode === 'hotel' ? 'Rechercher des hôtels' : 'Rechercher des biens'}</span>
            <Icon name="arrowRight" />
          </button>
        </form>
      </div>

      <div className="home-sections" aria-busy={feed === null}>
        {feed && feed.opportunities.length > 0 && (
          <section className="home-section" aria-labelledby="opportunites">
            <SectionHeader id="opportunites" title="Opportunités du moment" subtitle="Des biens sélectionnés selon vos critères et le marché actuel."
              href={searchHref(switchMode(draft, 'invest', drafts.invest))} />
            <div className="home-carousel">
              {feed.opportunities.map(({ row, highlights }) => <OpportunityCard key={row.id} row={row} highlights={highlights} />)}
            </div>
          </section>
        )}
        {feed && feed.newest.length > 0 && (
          <section className="home-section" aria-labelledby="nouveautes">
            <SectionHeader id="nouveautes" title="Nouveautés" subtitle="Les dernières annonces publiées sur Nidalo." href={sectionHref} />
            <div className="home-carousel">
              {feed.newest.map((row) => <CompactCard key={row.id} row={row} accessory="new" />)}
            </div>
          </section>
        )}
        {feed && feed.priceDrops.length > 0 && (
          <section className="home-section" aria-labelledby="baisses">
            <SectionHeader id="baisses" title="Baisses de prix" subtitle="Des biens qui ont récemment baissé leur prix." href={sectionHref} />
            <div className="home-carousel">
              {feed.priceDrops.map((row) => <CompactCard key={row.id} row={row} accessory="priceDrop" />)}
            </div>
          </section>
        )}
      </div>

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
