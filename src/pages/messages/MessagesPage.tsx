import { useEffect, useState } from 'react';
import { Page } from '../../components/Layout';
import { SignInCard } from '../../components/account/SignInCard';
import { isNewAccount } from '../../lib/account/auth';
import { useSession } from '../../lib/account/session';
import { sameId } from '../../lib/messages/inbox';
import { MAX_PRESENCE_CHANNELS, usePresence } from '../../lib/messages/presence';
import { openConversation, useMessaging } from '../../lib/messages/store';
import { canOpenDetails } from '../../lib/messages/thread';
import { PATHS } from '../../lib/paths';
import { ConversationPane, MissingConversation, NoConversation, PaneSkeleton } from './Conversation';
import { DetailsView, MediaView } from './Details';
import { Inbox, ListSkeleton } from './Inbox';
import { NewConversationSheet } from './NewConversation';
import { NoticeDialogs } from './parts';
import { useRoute } from './route';

// Page Messages (demande de Romain du 14 novembre 2026) : à partir de 1024 px, la liste à gauche (360 px) et la
// conversation ouverte à droite, sur toute la hauteur sous la barre du haut, sans pied de page. En dessous de 1024 px,
// une seule colonne comme dans l'app : la liste, ou la conversation de l'adresse (?c=…) avec une flèche retour.
// Rien n'est ouvert sans ?c= dans l'adresse.

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
  return (
    <div className={`dm ${route.conversationId ? 'is-thread' : 'is-list'}`}>
      <aside className="dm-side" aria-label="Conversations"><ListSkeleton /></aside>
      <div className="dm-main">{route.conversationId ? <PaneSkeleton /> : <NoConversation />}</div>
    </div>
  );
}

function Messenger({ userId }: { userId: string }) {
  const route = useRoute();
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
  let pane;
  if (!route.conversationId) {
    pane = <NoConversation />;
  } else if (inbox.status !== 'ready') {
    pane = inbox.status === 'loading' ? <PaneSkeleton /> : <NoConversation />;
  } else if (!conversation) {
    pane = <MissingConversation />;
  } else if (route.view === 'details' && canOpenDetails(conversation)) {
    pane = <DetailsView key={conversation.id} conversation={conversation} messages={messages} visits={visits.value} blocked={blocked} me={userId} />;
  } else if (route.view === 'medias' && canOpenDetails(conversation)) {
    pane = <MediaView key={conversation.id} conversation={conversation} messages={messages} tab={route.tab} me={userId} />;
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
    <div className={`dm ${route.conversationId ? 'is-thread' : 'is-list'}`}>
      <Inbox
        inbox={inbox}
        offers={offers.value}
        visitRequests={visitRequests.value}
        me={userId}
        selectedId={route.conversationId}
        onCompose={() => setComposing(true)}
      />
      <div className="dm-main">{pane}</div>
      <NewConversationSheet open={composing} conversations={conversations} onClose={() => setComposing(false)} />
      <NoticeDialogs />
    </div>
  );
}
