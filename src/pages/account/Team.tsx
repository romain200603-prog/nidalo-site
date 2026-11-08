import { useEffect, useId, useRef, useState } from 'react';
import { Icon } from '../../components/Icon';
import { AlertDialog } from '../listing/Dialogs';
import { setNewAccount, signOut } from '../../lib/account/auth';
import { currentUserId, useStore } from '../../lib/account/session';
import {
  acceptInvite, canManage, cleanToken, createInvite, forgetInvitation, inviteEmailError, inviteLine, inviteMailHref, invitationUrl, inviteTitle,
  leaveTeam, loadTeam, memberLine, memberName, previewInvite, removeMember, revokeInvite, ROLE_LABELS, ROLE_TEXTS, setMemberRole,
  teamStore, type InvitePreview, type InviteRole, type PreviewStatus, type TeamAgency, type TeamInvite, type TeamMember, type TeamRole,
} from '../../lib/account/team';
import { plural } from '../../lib/format';
import { accountPath, AGENCY_FORM_PATH, PATHS, TEAM_INVITE_PATH, TEAM_PATH } from '../../lib/paths';
import { Avatar, EmptyState, ScreenHeader, Spinner, Toast } from './parts';

// « Gestion des équipes » de l'espace professionnel : l'équipe de l'agence (gérant, responsables, agents), les
// invitations en cours, « Inviter un collaborateur » (un lien à copier ou à envoyer par e-mail) et l'invitation
// reçue (`invitation=<jeton>`), à accepter. Mêmes briques que Mes ventes (cartes, puces, boutons).

const SAVED_TOASTS: Record<string, string> = {
  invitation: 'Invitation créée',
  annulee: 'Invitation annulée',
  role: 'Rôle enregistré',
  retire: 'Membre retiré de l\'équipe',
  rejoint: 'Bienvenue dans l\'équipe',
  quitte: 'Vous avez quitté l\'équipe',
};

/** Message bref après une action (`ok=` dans l'adresse), retiré de l'adresse aussitôt lu. */
function useSavedToast(): string | null {
  const [toast, setToast] = useState<string | null>(() => SAVED_TOASTS[new URLSearchParams(window.location.search).get('ok') ?? ''] ?? null);
  useEffect(() => {
    if (!toast) return undefined;
    const params = new URLSearchParams(window.location.search);
    params.delete('ok');
    window.history.replaceState(window.history.state, '', `${window.location.pathname}?${params.toString()}`);
    const timer = window.setTimeout(() => setToast(null), 2500);
    return () => window.clearTimeout(timer);
  }, [toast]);
  return toast;
}

/** Message bref d'un geste sur la page (« Lien copié »). */
function useFlash(): [string | null, (text: string) => void] {
  const [text, setText] = useState<string | null>(null);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  return [text, (value: string) => {
    window.clearTimeout(timer.current);
    setText(value);
    timer.current = window.setTimeout(() => setText(null), 2500);
  }];
}

const ROLES: TeamRole[] = ['owner', 'manager', 'agent'];

export function Team({ screen, invitation }: { screen: string | null; invitation: string | null }) {
  if (invitation === null) return <TeamSpace screen={screen} />;
  const token = cleanToken(invitation);
  if (token) return <InvitationScreen token={token} />;
  return (
    <div className="space team">
      <ScreenHeader title="Invitation" />
      <EmptyState
        icon="link"
        title="Lien d'invitation incomplet"
        text="Vérifiez que le lien a été copié en entier, ou demandez-en un nouveau à l'agence."
        action={<a className="btn btn-light" href={PATHS.account}>Mon compte</a>}
      />
    </div>
  );
}

function TeamSpace({ screen }: { screen: string | null }) {
  const state = useStore(teamStore);
  const toast = useSavedToast();

  useEffect(() => {
    void loadTeam();
  }, []);

  if (state.status === 'error') {
    return (
      <div className="space">
        <ScreenHeader title="Gestion des équipes" />
        <p className="signin-error" role="alert">{state.message}</p>
        <button type="button" className="btn btn-light" onClick={() => void loadTeam()}>Réessayer</button>
      </div>
    );
  }
  if (state.status !== 'ready') return <Spinner />;
  if (!state.agency) {
    return (
      <div className="space team">
        <Toast text={toast} />
        <ScreenHeader title="Gestion des équipes" />
        <EmptyState
          icon="users"
          title="Pas encore d'équipe"
          text="Créez la fiche de votre agence pour inviter des collaborateurs. Pour rejoindre l'équipe d'une agence, ouvrez le lien d'invitation qu'elle vous a envoyé."
          action={<a className="btn btn-primary" href={AGENCY_FORM_PATH}>Créer la fiche agence</a>}
        />
      </div>
    );
  }
  if (screen === 'inviter' && canManage(state.agency.role)) return <InviteScreen agency={state.agency} />;
  return <TeamScreen agency={state.agency} members={state.members} invites={state.invites} toast={toast} />;
}

// MARK: - L'équipe

type Confirm = { kind: 'remove'; member: TeamMember } | { kind: 'revoke'; invite: TeamInvite } | { kind: 'leave' } | null;

function TeamScreen({ agency, members, invites, toast }: { agency: TeamAgency; members: TeamMember[]; invites: TeamInvite[]; toast: string | null }) {
  const [flash, setFlash] = useFlash();
  const [selected, setSelected] = useState<TeamMember | null>(null);
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [manualLink, setManualLink] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const me = currentUserId()?.toLowerCase() ?? null;
  const manager = canManage(agency.role);

  async function run(action: () => Promise<string | null>, ok: string) {
    setConfirm(null);
    setSelected(null);
    setBusy(true);
    setError(null);
    const failure = await action();
    if (failure) {
      setBusy(false);
      setError(failure);
      window.scrollTo(0, 0);
      return;
    }
    window.location.assign(accountPath('equipes', { ok }));
  }

  /** « Copier le lien » : copié, sinon montré dans une fenêtre pour le copier à la main. */
  async function copy(invite: TeamInvite) {
    const url = invitationUrl(invite.token);
    try {
      await navigator.clipboard.writeText(url);
      setFlash('Lien copié');
    } catch {
      setManualLink(url);
    }
  }

  return (
    <div className="space team">
      <Toast text={flash ?? toast} />
      <ScreenHeader title="Gestion des équipes" action={manager ? <a className="save-capsule" href={TEAM_INVITE_PATH}>Inviter</a> : undefined} />
      <section className="sale-head space-card team-head">
        <Avatar name={agency.agency_name} path={agency.logo_path} size={64} />
        <div className="sale-head-text">
          <h2 className="sale-title">{agency.agency_name}</h2>
          <p className="sale-city">{[plural(members.length, 'membre', 'membres'), agency.city?.trim()].filter(Boolean).join(' · ')}</p>
          <p className="sale-state is-active">Votre rôle : {ROLE_LABELS[agency.role]}</p>
        </div>
      </section>
      {error && <p className="signin-error" role="alert">{error}</p>}

      <section className="space-section">
        <h2 className="section-title"><Icon name="users" />L&apos;équipe</h2>
        <ul className="team-list space-card">
          {members.map((member) => {
            const isMe = member.user_id.toLowerCase() === me;
            return (
              <li key={member.user_id} className="team-row">
                <Avatar name={memberName(member)} path={member.avatar_path} size={44} />
                <span className="team-row-text">
                  <span className="team-row-title">{memberName(member)}{isMe && <span className="team-you"> (vous)</span>}</span>
                  <span className="team-row-line">{memberLine(member)}</span>
                </span>
                {manager && member.role !== 'owner' && !isMe && (
                  <button type="button" className="btn btn-light team-row-action" disabled={busy} onClick={() => setSelected(member)}>Gérer</button>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      {manager && (
        <section className="space-section">
          <h2 className="section-title"><Icon name="link" />Invitations en cours</h2>
          {invites.length === 0 ? (
            <div className="team-none space-card">
              <p>Aucune invitation en cours. Invitez un collaborateur avec un lien à lui envoyer.</p>
              <a className="btn btn-primary" href={TEAM_INVITE_PATH}><Icon name="userPlus" />Inviter un collaborateur</a>
            </div>
          ) : (
            <ul className="team-list space-card">
              {invites.map((invite) => (
                <li key={invite.id} className="team-row team-invite">
                  <span className="team-invite-icon" aria-hidden="true"><Icon name={invite.email ? 'mail' : 'link'} /></span>
                  <span className="team-row-text">
                    <span className="team-row-title">{inviteTitle(invite)}</span>
                    <span className="team-row-line">{inviteLine(invite)}</span>
                    {invite.created_by_name && <span className="team-row-note">Créée par {invite.created_by_name}</span>}
                    <span className="team-invite-actions">
                      <button type="button" className="btn btn-light" disabled={busy} onClick={() => void copy(invite)}>Copier le lien</button>
                      <button type="button" className="link-button is-danger" disabled={busy} onClick={() => setConfirm({ kind: 'revoke', invite })}>Annuler</button>
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <section className="space-section">
        <h2 className="section-title"><Icon name="shieldCheck" />Les rôles</h2>
        <dl className="team-roles space-card">
          {ROLES.map((role) => (
            <div key={role}>
              <dt>{ROLE_LABELS[role]}</dt>
              <dd>{ROLE_TEXTS[role]}</dd>
            </div>
          ))}
        </dl>
      </section>

      {agency.role !== 'owner' && (
        <button type="button" className="link-button is-danger team-leave" disabled={busy} onClick={() => setConfirm({ kind: 'leave' })}>
          Quitter l&apos;équipe
        </button>
      )}

      <AlertDialog
        open={selected !== null}
        onClose={() => setSelected(null)}
        title={selected ? memberName(selected) : ''}
        message={selected ? `Rôle actuel : ${ROLE_LABELS[selected.role]}.` : ''}
        actions={selected ? [
          {
            label: selected.role === 'agent' ? 'Passer responsable' : 'Passer agent',
            onClick: () => void run(() => setMemberRole(selected.user_id, selected.role === 'agent' ? 'manager' : 'agent'), 'role'),
            tone: 'primary',
          },
          { label: 'Retirer de l\'équipe', onClick: () => { setConfirm({ kind: 'remove', member: selected }); setSelected(null); } },
          { label: 'Annuler', onClick: () => setSelected(null), tone: 'quiet' },
        ] : []}
      />
      <AlertDialog
        open={confirm?.kind === 'remove'}
        onClose={() => setConfirm(null)}
        title={confirm?.kind === 'remove' ? `Retirer ${memberName(confirm.member)} de l'équipe ?` : ''}
        message="Son compte ne sera plus rattaché à l'agence et reprendra son type d'avant. Ses annonces restent sur son compte."
        actions={[
          { label: 'Retirer de l\'équipe', onClick: () => { if (confirm?.kind === 'remove') void run(() => removeMember(confirm.member.user_id), 'retire'); }, tone: 'primary' },
          { label: 'Annuler', onClick: () => setConfirm(null), tone: 'quiet' },
        ]}
      />
      <AlertDialog
        open={confirm?.kind === 'revoke'}
        onClose={() => setConfirm(null)}
        title="Annuler cette invitation ?"
        message="Le lien ne marchera plus. Vous pourrez en créer un autre."
        actions={[
          { label: 'Annuler l\'invitation', onClick: () => { if (confirm?.kind === 'revoke') void run(() => revokeInvite(confirm.invite.id), 'annulee'); }, tone: 'primary' },
          { label: 'Garder', onClick: () => setConfirm(null), tone: 'quiet' },
        ]}
      />
      <AlertDialog
        open={confirm?.kind === 'leave'}
        onClose={() => setConfirm(null)}
        title="Quitter l'équipe ?"
        message={`Votre compte ne sera plus rattaché à ${agency.agency_name} et reprendra son type d'avant. Vos annonces restent sur votre compte.`}
        actions={[
          { label: 'Quitter l\'équipe', onClick: () => void run(leaveTeam, 'quitte'), tone: 'primary' },
          { label: 'Annuler', onClick: () => setConfirm(null), tone: 'quiet' },
        ]}
      />
      <LinkDialog url={manualLink} onClose={() => setManualLink(null)} />
    </div>
  );
}

/** Sans accès au presse-papiers : le lien, sélectionné, à copier à la main. */
function LinkDialog({ url, onClose }: { url: string | null; onClose: () => void }) {
  return (
    <AlertDialog
      open={url !== null}
      onClose={onClose}
      title="Lien d'invitation"
      message="Le lien est sélectionné : copiez-le avec le menu ou le clavier."
      actions={[{ label: 'Fermer', onClick: onClose, tone: 'primary' }]}
    >
      {url && <input className="text-input team-link-input" readOnly value={url} aria-label="Lien d'invitation" autoFocus onFocus={(event) => event.currentTarget.select()} />}
    </AlertDialog>
  );
}

// MARK: - Inviter un collaborateur

function InviteScreen({ agency }: { agency: TeamAgency }) {
  const [role, setRole] = useState<InviteRole>('agent');
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ token: string; role: InviteRole; email: string | null } | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [flash, setFlash] = useFlash();
  const linkRef = useRef<HTMLInputElement>(null);
  const roleId = useId();
  const emailError = submitted ? inviteEmailError(email) : null;

  async function create() {
    setSubmitted(true);
    setSaveError(null);
    if (inviteEmailError(email)) return;
    setSaving(true);
    const result = await createInvite(role, email);
    setSaving(false);
    if ('error' in result) {
      setSaveError(result.error);
      return;
    }
    setCreated({ token: result.token, role, email: email.trim().toLowerCase() || null });
    window.scrollTo(0, 0);
  }

  if (created) {
    const url = invitationUrl(created.token);
    const copy = async () => {
      setHint(null);
      try {
        await navigator.clipboard.writeText(url);
        setFlash('Lien copié');
      } catch {
        linkRef.current?.focus();
        linkRef.current?.select();
        setHint('Le lien est sélectionné : copiez-le avec le menu ou le clavier.');
      }
    };
    return (
      <div className="space sales team">
        <Toast text={flash} />
        <ScreenHeader title="Inviter un collaborateur" back={TEAM_PATH} />
        <section className="sale-card space-card team-created">
          <h2 className="sale-card-title"><Icon name="circleCheck" />Lien d&apos;invitation prêt</h2>
          <p className="sale-caption">
            {created.email ? `Réservé à ${created.email}` : 'Pour une seule personne'}, comme {ROLE_LABELS[created.role].toLowerCase()}, valable 7 jours.
            Envoyez-le par e-mail ou par message : la personne l&apos;ouvre, se connecte et rejoint l&apos;équipe.
          </p>
          <input ref={linkRef} className="text-input team-link-input" readOnly value={url} aria-label="Lien d'invitation" onFocus={(event) => event.currentTarget.select()} />
          {hint && <p className="field-hint">{hint}</p>}
          <div className="sale-links">
            <button type="button" className="btn btn-primary" onClick={() => void copy()}><Icon name="link" />Copier le lien</button>
            <a className="btn btn-light" href={inviteMailHref(created.email, created.role, agency.agency_name, url)}><Icon name="mail" />Envoyer par e-mail</a>
          </div>
        </section>
        <a className="btn btn-light team-done" href={accountPath('equipes', { ok: 'invitation' })}>Terminé</a>
      </div>
    );
  }

  return (
    <div className="space sales sale-form-screen team">
      <ScreenHeader title="Inviter un collaborateur" back={TEAM_PATH} />
      <form className="info-form" noValidate onSubmit={(event) => { event.preventDefault(); void create(); }}>
        <section className="info-card space-card">
          <h2 className="field-group-title">Son rôle</h2>
          <div className="form-field">
            <span className="field-label" id={roleId}>Rôle</span>
            <div className="mandate-choices" role="radiogroup" aria-labelledby={roleId}>
              {(['agent', 'manager'] as InviteRole[]).map((option) => (
                <button
                  key={option}
                  type="button"
                  role="radio"
                  aria-checked={role === option}
                  className={`select-chip${role === option ? ' is-selected' : ''}`}
                  onClick={() => setRole(option)}
                >
                  {ROLE_LABELS[option]}
                </button>
              ))}
            </div>
            <span className="field-hint">{ROLE_TEXTS[role]}</span>
          </div>
        </section>
        <section className="info-card space-card">
          <h2 className="field-group-title">Son adresse e-mail</h2>
          <label className="form-field">
            <span className="field-label">E-mail (facultatif)</span>
            <input
              className="text-input"
              type="email"
              inputMode="email"
              autoComplete="off"
              maxLength={254}
              value={email}
              aria-invalid={emailError ? true : undefined}
              onChange={(event) => setEmail(event.target.value)}
            />
            {emailError && <span className="field-error">{emailError}</span>}
            <span className="field-hint">Si vous l&apos;indiquez, seul le compte Nidalo de cette adresse pourra utiliser le lien.</span>
          </label>
        </section>
        {saveError && <p className="signin-error" role="alert">{saveError}</p>}
        <button type="submit" className="btn btn-primary sale-save" disabled={saving}>
          {saving ? <span className="spinner spinner-white" aria-label="Création du lien" /> : 'Créer le lien d\'invitation'}
        </button>
        <p className="sale-caption team-caption">Le lien vaut 7 jours, pour une seule personne. Vous pourrez l&apos;annuler dans Gestion des équipes.</p>
      </form>
    </div>
  );
}

// MARK: - Invitation reçue

/** Ce que voit la personne qui ne peut pas rejoindre l'équipe, et le bouton qui l'aide. */
const STATUS_TEXTS: Record<Exclude<PreviewStatus, 'ok'>, string> = {
  owner: 'C\'est un lien de votre agence : envoyez-le à la personne que vous invitez.',
  own_agency: 'Votre compte a déjà sa propre agence : il ne peut pas rejoindre une autre équipe.',
  member: 'Vous faites déjà partie de cette équipe.',
  other_team: 'Vous faites déjà partie d\'une autre équipe. Quittez-la d\'abord pour rejoindre celle-ci.',
  other_email: 'Ce lien est réservé à une autre adresse e-mail. Connectez-vous avec l\'adresse qui a reçu l\'invitation.',
  full: 'Cette équipe compte déjà 50 membres : demandez à l\'agence de libérer une place.',
};

type PreviewState = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; preview: InvitePreview | null };

function InvitationScreen({ token }: { token: string }) {
  const [state, setState] = useState<PreviewState>({ status: 'loading' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setState({ status: 'loading' });
    const result = await previewInvite(token);
    if ('error' in result) {
      setState({ status: 'error', message: result.error });
      return;
    }
    // Un lien qui ne vaut plus, ou auquel ce compte ne peut rien faire, n'est plus gardé ; « autre adresse » reste
    // gardé, le temps de changer de compte.
    const status = result.preview?.status ?? null;
    if (status !== 'ok' && status !== 'other_email') forgetInvitation();
    setState({ status: 'ready', preview: result.preview });
  }

  useEffect(() => {
    void load();
  }, [token]);

  async function join() {
    setBusy(true);
    setError(null);
    const failure = await acceptInvite(token);
    if (failure) {
      setBusy(false);
      setError(failure);
      return;
    }
    forgetInvitation();
    // Un compte tout neuf entre directement dans l'équipe, sans passer par « Quel est votre profil ? ».
    setNewAccount(false);
    window.location.assign(accountPath('equipes', { ok: 'rejoint' }));
  }

  function later() {
    forgetInvitation();
    window.location.assign(PATHS.account);
  }

  if (state.status === 'loading') return <Spinner />;
  if (state.status === 'error') {
    return (
      <div className="space">
        <ScreenHeader title="Invitation" />
        <p className="signin-error" role="alert">{state.message}</p>
        <button type="button" className="btn btn-light" onClick={() => void load()}>Réessayer</button>
      </div>
    );
  }
  const { preview } = state;
  if (!preview) {
    return (
      <div className="space team">
        <ScreenHeader title="Invitation" />
        <EmptyState
          icon="link"
          title="Invitation plus valable"
          text="Ce lien a expiré, a déjà servi ou a été annulé. Demandez un nouveau lien à l'agence."
          action={<a className="btn btn-light" href={PATHS.account}>Mon compte</a>}
        />
      </div>
    );
  }
  const inviter = preview.invited_by_name?.trim() || 'L\'agence';
  return (
    <div className="space team">
      <ScreenHeader title="Invitation" />
      <section className="space-card team-invitation">
        <Avatar name={preview.agency_name} path={preview.agency_logo_path} size={76} />
        <h2 className="team-invitation-name">{preview.agency_name}</h2>
        {preview.agency_city?.trim() && <p className="team-invitation-city">{preview.agency_city.trim()}</p>}
        <p className="team-invitation-text">
          {inviter} vous invite à rejoindre l&apos;équipe de l&apos;agence comme {ROLE_LABELS[preview.role].toLowerCase()}.
        </p>
        <p className="team-invitation-role"><strong>{ROLE_LABELS[preview.role]}</strong> : {ROLE_TEXTS[preview.role]}</p>
      </section>
      {preview.status === 'ok' ? (
        <>
          <p className="sale-caption team-caption">
            En rejoignant l&apos;équipe, votre compte devient professionnel et vos annonces portent le nom et le logo de l&apos;agence.
            Vous pourrez quitter l&apos;équipe à tout moment.
          </p>
          {error && <p className="signin-error" role="alert">{error}</p>}
          <button type="button" className="btn btn-primary team-join" disabled={busy} onClick={() => void join()}>
            {busy ? <span className="spinner spinner-white" aria-label="Arrivée dans l'équipe" /> : 'Rejoindre l\'équipe'}
          </button>
          <button type="button" className="btn btn-light team-join" disabled={busy} onClick={later}>Pas maintenant</button>
        </>
      ) : (
        <>
          <p className="team-status" role="status">{STATUS_TEXTS[preview.status]}</p>
          {preview.status === 'other_email' ? (
            <button type="button" className="btn btn-primary team-join" onClick={() => void signOut()}>Changer de compte</button>
          ) : ['owner', 'member', 'other_team'].includes(preview.status) ? (
            <a className="btn btn-primary team-join" href={TEAM_PATH}>Gestion des équipes</a>
          ) : (
            <a className="btn btn-light team-join" href={PATHS.account}>Mon compte</a>
          )}
        </>
      )}
    </div>
  );
}

/** Dans la carte de connexion, sous le titre, quand l'invitation est ouverte sans être connecté. */
export function InvitationIntro() {
  return (
    <p className="team-intro" role="note">
      <Icon name="users" />
      <span>Une agence vous invite à rejoindre son équipe. Connectez-vous ou créez votre compte : l&apos;invitation s&apos;ouvrira ensuite.</span>
    </p>
  );
}
