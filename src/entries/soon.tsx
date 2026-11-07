import { Page } from '../components/Layout';
import { SoonCard } from '../components/SoonCard';
import { SOON_PAGES } from '../components/soonPages';
import { mount } from './mount';

// Publier arrive sur le site à une étape suivante ; en attendant, dans l'app.
const page = document.body.dataset.section === 'publish' ? SOON_PAGES.publish : SOON_PAGES.messages;

mount(
  <Page section={page.section}>
    <SoonCard icon={page.icon} title={page.title} text={page.text} />
  </Page>,
);
