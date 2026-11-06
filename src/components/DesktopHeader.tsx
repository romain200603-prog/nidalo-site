import { useEffect } from 'react';
import { Icon } from './Icon';
import type { IconName } from './iconPaths';
import type { Section } from './Layout';
import { accountStore, avatarUrl, initials, loadAccount } from '../lib/account/profile';
import { useSession, useStore } from '../lib/account/session';
import { badgeText, messagesLabel, notificationsLabel, useBadges } from '../lib/badges';
import { SEARCH_MODES, type SearchMode } from '../lib/labels';
import { accountPath, PATHS, searchModePath } from '../lib/paths';

// Barre du haut sur ordinateur (≥ 1024 px), à la place de la barre d'onglets de l'app : le logo, les catégories de
// l'app, « Publier une annonce », Favoris, Messages et Notifications avec les pastilles de l'app, puis « Mon espace ».

function current(active: boolean) {
  return active ? ('page' as const) : undefined;
}

function isNotificationsScreen(): boolean {
  return window.location.pathname === PATHS.account && new URLSearchParams(window.location.search).get('vue') === 'notifications';
}

function RoundLink({ href, icon, label, count = 0, capped = false, active = false }: {
  href: string;
  icon: IconName;
  label: string;
  count?: number;
  capped?: boolean;
  active?: boolean;
}) {
  return (
    <a className="dtop-round" href={href} aria-label={label} aria-current={current(active)}>
      <Icon name={icon} />
      {count > 0 && <span className="dtop-badge" aria-hidden="true">{badgeText(count, capped)}</span>}
    </a>
  );
}

/** « Mon espace » : la photo ou les initiales du compte (comme l'avatar de Mon espace), sinon l'icône du compte. */
function SpaceLink({ active }: { active: boolean }) {
  const session = useSession();
  const account = useStore(accountStore);
  const signedIn = session.status === 'signedIn';
  useEffect(() => {
    if (signedIn) void loadAccount();
  }, [signedIn, signedIn ? session.userId : null]);
  const profile = signedIn && account.status === 'ready' ? account.account.profile : null;
  const photo = profile ? avatarUrl(profile.avatar_path) : null;
  const letters = profile ? initials(profile.display_name) : '';
  return (
    <a className="dtop-space" href={PATHS.account} aria-label="Mon espace" aria-current={current(active)}>
      <span className="dtop-avatar" aria-hidden="true">
        {photo ? <img src={photo} alt="" width={34} height={34} /> : letters || <Icon name="userRound" />}
      </span>
      <span className="dtop-space-label">Mon espace</span>
    </a>
  );
}

export function DesktopHeader({ section, mode = null }: { section: Section; mode?: SearchMode | null }) {
  const badges = useBadges();
  const onNotifications = section === 'account' && isNotificationsScreen();
  return (
    <header className="dtop">
      <div className="dtop-bar">
        <a className="dtop-brand" href={PATHS.home} aria-label="Nidalo, accueil">
          <img className="dtop-tile" src="/assets/logo-tile.svg" width={36} height={36} alt="" />
          <img className="dtop-word" src="/assets/wordmark-navy.svg" width={81} height={13} alt="" />
        </a>
        <nav className="dtop-modes" aria-label="Catégories">
          {SEARCH_MODES.map((item) => (
            <a key={item.mode} className="dtop-mode" href={searchModePath(item.mode)} aria-current={current(section === 'search' && mode === item.mode)}>
              <Icon name={item.icon} />
              {item.label}
            </a>
          ))}
        </nav>
        <div className="dtop-actions">
          <a className="dtop-publish" href={PATHS.publish} aria-label="Publier une annonce" aria-current={current(section === 'publish')}>
            <Icon name="plus" />
            <span>Publier<span className="dtop-publish-end"> une annonce</span></span>
          </a>
          <RoundLink href={PATHS.favorites} icon="heart" label="Favoris" active={section === 'favorites'} />
          <RoundLink href={PATHS.messages} icon="messageSquareText" label={messagesLabel(badges.messages)} count={badges.messages} active={section === 'messages'} />
          <RoundLink href={accountPath('notifications')} icon="bell" label={notificationsLabel(badges.notifications)} count={badges.notifications} capped active={onNotifications} />
          <SpaceLink active={section === 'account' && !onNotifications} />
        </div>
      </div>
    </header>
  );
}
