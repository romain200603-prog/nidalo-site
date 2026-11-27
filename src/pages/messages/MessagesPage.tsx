import { useEffect, useState } from 'react';
import { Page } from '../../components/Layout';
import { SignInCard } from '../../components/account/SignInCard';
import { isNewAccount } from '../../lib/account/auth';
import { useSession } from '../../lib/account/session';
import { useDesktop } from '../../lib/desktop';
import { sameId } from '../../lib/messages/inbox';
import { MAX_PRESENCE_CHANNELS, usePresence } from '../../lib/messages/presence';
import { openConversation, useMessaging } from '../../lib/messages/store';
import { canOpenDetails } from '../../lib/messages/thread';
import { PATHS } from '../../lib/paths';
import { ConversationPane, MissingConversation, PaneSkeleton } from './Conversation';
import { accessibleCommunity, CommunityView, JoinRequestsView } from './Community';
import { DetailsView, MediaView } from './Details';
import { AddMembersView, EphemeralView, GroupInfoView } from './GroupInfo';
import { Inbox, ListSkeleton } from './Inbox';
import { NewConversationSheet } from './NewConversation';
import { NoticeDialogs } from './parts';
import { useRoute } from './route';

// Page Messages, comme l'app : sous 1024 px, la liste, ou la conversation de l'adresse (?c=…) poussée par-dessus avec
// une flèche retour, comme la pile de navigation de l'app ; la page occupe la fenêtre au-dessus de la barre d'onglets,
// sans pied de page, et une conversation ouverte cache cette barre (hidesTabBar). À partir de 1024 px (version
// ordinateur, étape 5 : messages-ordinateur.css), les mêmes éléments côte à côte sous l'en-tête du site : la liste
// toujours visible à gauche, la conversation à droite, ou une place vide. Rien n'est ouvert sans ?c= dans l'adresse.

export function MessagesPage() {
  const session = useSession();
  if (session.status === 'signedOut') {
    // Sans compte : l'invitation à se connecter des autres pages du compte (Favoris).
    return (
      <Page section="messages">
        <div className="wrap favorites-wrap">
          <div className="favorites-signin">
            <SignInCard onSignedIn={() => { if (isNewAccount()) window.location.assign(PATHS.account); }} />
          </div>
        </div>
      </Page>
    );
  }
  return (
    <Page section="messages" fill>
      {session.status === 'loading' ? <Starting /> : <Messenger userId={session.userId} />}
    </Page>
  );
}

/** Session en cours de lecture : la page en gris, la liste et la conversation de l'adresse s'il y en a une. */
function Starting() {
  const route = useRoute();
  const desktop = useDesktop();
  return (
    <div className={`dm ${route.conversationId ? 'is-thread' : 'is-list'}`}>
      <aside className="dm-side" aria-label="Conversations">
        {/* Ordinateur : la liste reste à l'écran, le titre de la page aussi (masqué, le temps de la lecture). */}
        {desktop && <h1 className="dm-visually-hidden">Messages</h1>}
        <ListSkeleton />
      </aside>
      {route.conversationId && <div className="dm-main"><PaneSkeleton /></div>}
    </div>
  );
}

function Messenger({ userId }: { userId: string }) {
  const route = useRoute();
  const desktop = useDesktop();
  const { inbox, thread, offers, visits, visitRequests, blocked } = useMessaging(userId);
  const [composing, setComposing] = useState(false);
  const conversations = inbox.status === 'ready' ? inbox.conversations : [];
  const conversation = route.conversationId ? conversations.find((item) => sameId(item.id, route.conversationId)) ?? null : null;

  // « En ligne » : la conversation ouverte, puis les conversations à deux les plus récentes.
  const presence = usePresence(userId, [
    ...(conversation && !conversation.isGroup ? [conversation.id] : []),
    ...conversations.filter((item) => !item.isGroup && !item.isArchived && !item.hasLeft).slice(0, MAX_PRESENCE_CHANNELS).map((item) => item.id),
  ]);

  // La conversation de l'adresse est lue (et marquée lue si elle a des non-lus) ; aucune sans ?c=.
  useEffect(() => { openConversation(route.conversationId); }, [route.conversationId]);
  useEffect(() => () => openConversation(null), []);

  const messages = conversation && thread.status === 'ready' && sameId(thread.conversationId, conversation.id) ? thread.messages : [];
  // Conversations jamais lues : la liste reste, avec son état d'erreur et « Réessayer », même avec ?c= dans l'adresse.
  const opened = !!route.conversationId && inbox.status !== 'error';
  let pane;
  if (!opened) {
    pane = null;
  } else if (inbox.status !== 'ready') {
    pane = <PaneSkeleton />;
  } else if (!conversation) {
    pane = <MissingConversation />;
  } else if (route.view === 'details' && canOpenDetails(conversation)) {
    pane = <DetailsView key={conversation.id} conversation={conversation} messages={messages} visits={visits.value} blocked={blocked} me={userId} />;
  } else if (route.view === 'medias' && (canOpenDetails(conversation) || (conversation.isGroup && !conversation.communityId))) {
    pane = <MediaView key={conversation.id} conversation={conversation} messages={messages} tab={route.tab} me={userId} />;
  } else if ((route.view === 'groupe' || route.view === 'communaute') && conversation.isGroup) {
    pane = conversation.communityId
      ? <CommunityView key={conversation.id} conversation={conversation} me={userId} />
      : <GroupInfoView key={conversation.id} conversation={conversation} messages={messages} me={userId} />;
  } else if (route.view === 'ajout' && conversation.isGroup && (!conversation.communityId || accessibleCommunity(conversation, userId))) {
    pane = <AddMembersView key={conversation.id} conversation={conversation} />;
  } else if (route.view === 'ephemeres' && conversation.isGroup && !conversation.communityId) {
    pane = <EphemeralView key={conversation.id} conversation={conversation} />;
  } else if (route.view === 'demandes' && accessibleCommunity(conversation, userId)) {
    pane = <JoinRequestsView key={conversation.id} conversation={conversation} />;
  } else {
    pane = (
      <ConversationPane
        key={conversation.id}
        conversation={conversation}
        thread={thread}
        offers={offers}
        visitRequests={visitRequests.value}
        presence={presence}
        blocked={blocked}
        me={userId}
      />
    );
  }

  return (
    <div className={`dm ${opened ? 'is-thread' : 'is-list'}`}>
      <Inbox inbox={inbox} visits={visits.value} presence={presence} me={userId} onCompose={() => setComposing(true)} />
      {pane ? <div className="dm-main">{pane}</div> : desktop && <EmptyPane hint={conversations.length > 0} />}
      <NewConversationSheet open={composing} conversations={conversations} onClose={() => setComposing(false)} />
      <NoticeDialogs />
    </div>
  );
}

/**
 * Ordinateur, sans conversation ouverte : la place de droite reste vide (rien ne s'ouvre de lui-même), avec
 * « Choisissez une conversation » quand la liste en a.
 */
function EmptyPane({ hint }: { hint: boolean }) {
  return <div className="dm-empty-pane">{hint && <p>Choisissez une conversation</p>}</div>;
}
