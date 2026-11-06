import type { IconName } from '../components/iconPaths';
import { Page, type Section } from '../components/Layout';
import { SoonCard } from '../components/SoonCard';
import { mount } from './mount';

// Messages et publication arrivent sur le site aux étapes suivantes ; en attendant, dans l'app.
const PAGES: Record<string, { section: Section; icon: IconName; title: string; text: string }> = {
  messages: {
    section: 'messages', icon: 'messages', title: 'Vos messages',
    text: 'Bientôt sur le site : vos conversations avec les vendeurs et les acheteurs, comme dans l’app.',
  },
  publish: {
    section: 'publish', icon: 'plus', title: 'Publier une annonce',
    text: 'Bientôt sur le site. Pour l’instant, une annonce se publie dans l’app : touchez le bouton + au centre de la barre du bas.',
  },
};

const page = PAGES[document.body.dataset.section ?? ''] ?? PAGES.messages;

mount(
  <Page section={page.section}>
    <SoonCard icon={page.icon} title={page.title} text={page.text} />
  </Page>,
);
