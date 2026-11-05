import { useEffect, useState, type FormEvent } from 'react';
import { Icon } from '../components/Icon';
import { Page } from '../components/Layout';
import { ModeTabs } from '../components/ModeTabs';
import { PlaceField } from '../components/PlaceField';
import { ListingPhoto } from '../components/PhotoPager';
import { SelectionDialog } from '../components/SelectionDialog';
import { FiltersDialog } from './FiltersDialog';
import { GOOD_YIELD, grossYieldText } from '../lib/cardContent';
import { formatArea, formatFraction, formatPrice } from '../lib/format';
import { highlightsFor } from '../lib/highlights';
import { homeTiles, moreCriteriaHint, type CriterionTileSpec } from '../lib/homeCriteria';
import { homeTag, loadHomeFeed, priceDrop, type HomeFeed } from '../lib/homeFeed';
import type { SearchMode } from '../lib/labels';
import { sortedPhotos, type ListingRow } from '../lib/listings';
import { listingPath, PATHS } from '../lib/paths';
import { placeShortName, type PlaceSuggestion } from '../lib/places';
import { defaultDraft, paramsFromDraft, switchMode, type Highlights, type SearchDraft } from '../lib/search';

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

export function HomePage() {
  const [mode, setMode] = useState<SearchMode>('buy');
  const [drafts, setDrafts] = useState<Record<SearchMode, SearchDraft>>(
    () => Object.fromEntries(MODES.map((m) => [m, defaultDraft(m)])) as Record<SearchMode, SearchDraft>,
  );
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [feed, setFeed] = useState<HomeFeed | null>(null);
  const draft = drafts[mode];

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

  return (
    <Page section="home">
      <section className="home-band" aria-labelledby="accueil-titre">
        <div className="wrap home-band-inner">
          <h1 id="accueil-titre">Bienvenue sur Nidalo</h1>
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
