import { useEffect, useState } from 'react';
import { Page } from '../../components/Layout';
import { SoonCard } from '../../components/SoonCard';
import { SignInCard } from '../../components/account/SignInCard';
import { SOON_PAGES } from '../../components/soonPages';
import { isNewAccount } from '../../lib/account/auth';
import { useSession } from '../../lib/account/session';
import { useDesktop } from '../../lib/desktop';
import { sameId } from '../../lib/messages/inbox';
import { openConversation, useMessaging } from '../../lib/messages/store';
import { canOpenDetails } from '../../lib/messages/thread';
import { PATHS } from '../../lib/paths';
import { Spinner } from '../account/parts';
import { ConversationPane, MissingConversation, NoConversation } from './Conversation';
import { DetailsView, MediaView } from './Details';
import { Inbox } from './Inbox';
import { NewConversationSheet } from './NewConversation';
import { NoticeDialogs } from './parts';
import { useRoute } from './route';

// Messages sur ordinateur (maquette 3) : la boîte de réception à gauche (420 px), la conversation ouverte à droite,
// sur toute la hauteur sous la barre du haut, sans pied de page. Rien n'est ouvert sans ?c= dans l'adresse.
// En dessous de 1024 px, le message « bientôt » du téléphone reste tel quel.

export function MessagesPage() {
  const desktop = useDesktop();
  if (!desktop) {
    const page = SOON_PAGES.messages;
    return (
      <Page section={page.section}>
        <SoonCard icon={page.icon} title={page.title} text={page.text} />
      </Page>
    );
  }
  return <DesktopMessages />;
}

function DesktopMessages() {
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
      {session.status === 'loading' ? <div className="dm dm-starting"><Spinner /></div> : <Messenger userId={session.userId} />}
    </Page>
  );
}

function Messenger({ userId }: { userId: string }) {
  const route = useRoute();
  const { inbox, thread, offers, visits, blocked } = useMessaging(userId);
  const [composing, setComposing] = useState(false);
  const conversations = inbox.status === 'ready' ? inbox.conversations : [];
  const conversation = route.conversationId ? conversations.find((item) => sameId(item.id, route.conversationId)) ?? null : null;

  // La conversation de l'adresse est lue (et marquée lue si elle a des non-lus) ; aucune sans ?c=.
  useEffect(() => { openConversation(route.conversationId); }, [route.conversationId]);
  useEffect(() => () => openConversation(null), []);

  const messages = conversation && thread.status === 'ready' && sameId(thread.conversationId, conversation.id) ? thread.messages : [];
  let pane;
  if (!route.conversationId) {
    pane = <NoConversation />;
  } else if (inbox.status !== 'ready') {
    pane = inbox.status === 'loading' ? <div className="dm-pane dm-pane-empty"><Spinner /></div> : <NoConversation />;
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
        visits={visits.value}
        blocked={blocked}
        me={userId}
      />
    );
  }

  return (
    <div className="dm">
      <Inbox inbox={inbox} visits={visits.value} me={userId} selectedId={route.conversationId} onCompose={() => setComposing(true)} />
      <div className="dm-main">{pane}</div>
      <NewConversationSheet open={composing} conversations={conversations} onClose={() => setComposing(false)} />
      <NoticeDialogs />
    </div>
  );
}
