import type { IconName } from './iconPaths';
import type { Section } from './Layout';

// Pages « bientôt sur le site » sur téléphone (Messages, Publier) : leur texte, affiché par ces deux pages en dessous
// de 1024 px.
export type SoonPage = { section: Section; icon: IconName; title: string; text: string };

export const SOON_PAGES: Record<'messages' | 'publish', SoonPage> = {
  messages: {
    section: 'messages', icon: 'messages', title: 'Vos messages',
    text: 'Bientôt sur le site : vos conversations avec les vendeurs et les acheteurs, comme dans l’app.',
  },
  publish: {
    section: 'publish', icon: 'plus', title: 'Publier une annonce',
    text: 'Bientôt sur le site. Pour l’instant, une annonce se publie dans l’app : touchez le bouton + au centre de la barre du bas.',
  },
};
