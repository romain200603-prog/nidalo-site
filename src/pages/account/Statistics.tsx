import { useEffect, useState } from 'react';
import { Icon } from '../../components/Icon';
import type { IconName } from '../../components/iconPaths';
import { loadMyListings, myListingsStore } from '../../lib/account/myListings';
import { currentUserId, useStore } from '../../lib/account/session';
import {
  buildStats, favoritesTotalLine, fetchStatsData, periodStartDay, STATS_PERIODS, statsFailure, STATUS_LABELS, VIEWS_COUNTED_SINCE,
  type StatCounts, type StatsData, type StatsPeriod,
} from '../../lib/account/stats';
import { formatDate } from '../../lib/format';
import { photoUrl, sortedPhotos } from '../../lib/listings';
import { listingPath } from '../../lib/paths';
import { EmptyState, ScreenHeader, Spinner } from './parts';

// « Statistiques » de l'espace professionnel : sur 7 ou 30 jours, le total puis chaque annonce publiée.

/** `period` : la période des chiffres affichés (le choix peut déjà être passé à l'autre, le temps de les lire). */
type Load = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; data: StatsData; period: StatsPeriod };

const STATS: { key: keyof StatCounts; label: string; one: string; icon: IconName }[] = [
  { key: 'views', label: 'Vues', one: 'Vue', icon: 'eye' },
  { key: 'favorites', label: 'Favoris', one: 'Favori', icon: 'heart' },
  { key: 'messages', label: 'Messages', one: 'Message', icon: 'messageCircle' },
  { key: 'visits', label: 'Visites', one: 'Visite', icon: 'calendarDays' },
  { key: 'offers', label: 'Offres', one: 'Offre', icon: 'handshake' },
];

const whole = new Intl.NumberFormat('fr-FR');

export function Statistics() {
  const listings = useStore(myListingsStore);
  const [period, setPeriod] = useState<StatsPeriod>(30);
  const [load, setLoad] = useState<Load>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const startDay = periodStartDay(period, new Date());
  const label = (stat: (typeof STATS)[number], count: number) => (count > 1 ? stat.label : stat.one);

  useEffect(() => {
    void loadMyListings();
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoad((current) => (current.status === 'ready' ? current : { status: 'loading' }));
    fetchStatsData(startDay).then(
      (data) => { if (!cancelled) setLoad({ status: 'ready', data, period }); },
      (error: unknown) => { if (!cancelled) setLoad({ status: 'error', message: statsFailure(error) }); },
    );
    return () => { cancelled = true; };
    // `period` change avec `startDay`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startDay, attempt]);

  const failed = listings.status === 'error' ? listings.message : load.status === 'error' ? load.message : null;
  if (failed) {
    return (
      <div className="space">
        <ScreenHeader title="Statistiques" />
        <p className="signin-error" role="alert">{failed}</p>
        <button type="button" className="btn btn-light" onClick={() => { void loadMyListings(); setAttempt((n) => n + 1); }}>Réessayer</button>
      </div>
    );
  }
  const me = currentUserId();
  if (listings.status !== 'ready' || load.status !== 'ready' || !me) return <Spinner />;
  const { totals, items } = buildStats({ me, listings: listings.items, startDay, ...load.data });

  return (
    <div className="space stats-page">
      <ScreenHeader title="Statistiques" />
      {items.length === 0 ? (
        <EmptyState
          icon="chart"
          title="Aucune annonce publiée"
          text="Les vues, favoris, messages, demandes de visite et offres de vos annonces apparaîtront ici dès leur mise en ligne."
        />
      ) : (
        <>
          <div className="stats-periods" role="group" aria-label="Période">
            {STATS_PERIODS.map((item) => (
              <button
                key={item.value}
                type="button"
                className={`select-chip${period === item.value ? ' is-selected' : ''}`}
                aria-pressed={period === item.value}
                onClick={() => setPeriod(item.value)}
              >
                {item.label}
              </button>
            ))}
          </div>
          <section className="stats-card space-card">
            <h2 className="stats-card-title">{load.period === 7 ? 'Sur les 7 derniers jours' : 'Sur les 30 derniers jours'}</h2>
            <dl className="stats-totals">
              {STATS.map((stat) => (
                <div key={stat.key} className="stats-total">
                  <dt><Icon name={stat.icon} />{label(stat, totals[stat.key])}</dt>
                  <dd>{whole.format(totals[stat.key])}</dd>
                </div>
              ))}
            </dl>
          </section>
          <section className="stats-listings">
            <h2 className="stats-listings-title">Par annonce</h2>
            {items.map(({ row, counts, favoritesTotal }) => {
              const photo = sortedPhotos(row)[0];
              const total = favoritesTotalLine(favoritesTotal);
              return (
                <article key={row.id} className="stats-listing space-card">
                  <a className="stats-listing-head" href={listingPath(row.id)}>
                    <span className="stats-thumb" aria-hidden="true">{photo ? <img src={photoUrl(photo.storage_path)} alt="" loading="lazy" /> : <Icon name="image" />}</span>
                    <span className="stats-listing-text">
                      <span className="stats-listing-name">{row.title}</span>
                      <span className="stats-listing-status">{STATUS_LABELS[row.status] ?? row.status}</span>
                    </span>
                    <Icon name="chevronRight" className="icon row-chevron" />
                  </a>
                  <ul className="stats-row">
                    {STATS.map((stat) => (
                      <li key={stat.key} aria-label={`${whole.format(counts[stat.key])} ${label(stat, counts[stat.key]).toLowerCase()}`}>
                        <Icon name={stat.icon} />
                        <strong aria-hidden="true">{whole.format(counts[stat.key])}</strong>
                        <span aria-hidden="true">{label(stat, counts[stat.key])}</span>
                      </li>
                    ))}
                  </ul>
                  {total && <p className="stats-favorites">{total}</p>}
                </article>
              );
            })}
          </section>
          <p className="stats-note">
            Une vue, c&apos;est une ouverture de l&apos;annonce, comptée une fois par jour et par appareil ; connecté à votre compte, vos propres
            ouvertures ne comptent pas. Les vues sont comptées depuis le {formatDate(VIEWS_COUNTED_SINCE)}. Nidalo ne montre jamais qui a vu ou mis
            en favori une annonce.
          </p>
        </>
      )}
    </div>
  );
}
