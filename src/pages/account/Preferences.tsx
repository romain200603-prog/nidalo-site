import { useEffect } from 'react';
import { Icon } from '../../components/Icon';
import { PROJECT_KIND_LABELS } from '../../lib/account/project';
import { editableProjectStore, loadEditableProject } from '../../lib/account/projectEditor';
import { loadSavedSearches, savedSearchesStore } from '../../lib/account/savedSearches';
import { useStore } from '../../lib/account/session';
import { accountPath } from '../../lib/paths';
import { AppSection, ScreenHeader } from './parts';

// « Préférences » (Features/Preferences/PreferencesView.swift) : les cartes de l'app qui valent aussi pour le site,
// dans son ordre : Mon projet, Affichage, Langue et région, puis la politique de confidentialité. Restent sur l'iPhone :
// les notifications (rappels de l'iPhone et réglages des notifications push), les autorisations de l'iPhone, « Qui a
// accès à mon dossier ? », l'export du fichier de l'iPhone et « Réinitialiser les préférences » (les rappels).

export function PreferencesScreen() {
  const project = useStore(editableProjectStore);
  const searches = useStore(savedSearchesStore);
  useEffect(() => {
    void loadEditableProject();
    void loadSavedSearches();
  }, []);
  const current = project.status === 'ready' ? project.project : null;
  const count = searches.status === 'ready' ? searches.items.length : 0;
  return (
    <div className="space preferences-screen">
      <ScreenHeader title="Préférences" />
      <AppSection title="Mon projet">
        {current && (
          <div className="preference-project">
            <span className="preference-project-title">{PROJECT_KIND_LABELS[current.kind]}</span>
            <span className="preference-project-line">
              {[current.purpose, current.city || null].filter(Boolean).join(' · ') || 'Ville à préciser'}
            </span>
          </div>
        )}
        <a className="app-button app-button-secondary" href={accountPath('projet')}><Icon name="sliders" />Modifier mon projet</a>
        <a className="app-button app-button-secondary" href={accountPath('recherches')}>
          <Icon name="search" />{count === 0 ? 'Recherches enregistrées' : `Recherches enregistrées (${count})`}
        </a>
      </AppSection>
      <AppSection title="Affichage">
        <div className="preference-line"><span>Thème</span><span>Clair</span></div>
        <p className="preference-note">Le mode sombre n&apos;est pas encore disponible.</p>
      </AppSection>
      <AppSection title="Langue et région">
        <div className="preference-line"><span>Langue</span><span>Français</span></div>
        <div className="preference-line"><span>Région et devise</span><span>France · euro</span></div>
        <p className="preference-note">Nidalo est disponible en français uniquement pour l&apos;instant.</p>
      </AppSection>
      <AppSection title="Confidentialité">
        <a className="app-button app-button-secondary" href={accountPath('legal', { texte: 'confidentialite' })}>
          <Icon name="fileText" />Politique de confidentialité
        </a>
      </AppSection>
    </div>
  );
}
