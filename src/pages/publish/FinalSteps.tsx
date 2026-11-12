import { useId, useMemo, useState } from 'react';
import { InfoLine } from '../../components/FilterControls';
import { Icon } from '../../components/Icon';
import { ListingCard } from '../../components/ListingCard';
import { cardContent } from '../../lib/cardContent';
import { accountPath, listingPath } from '../../lib/paths';
import { missingRequiredFields, type PublishStep, type RequiredField } from '../../lib/publish/draft';
import { missingLabel, previewRow, recapRows } from '../../lib/publish/flow';
import { proposedDescription, proposedTitle } from '../../lib/publish/writing';
import { ChoiceDialog } from '../account/DesktopParts';
import { Card, ErrorLine, TextInput, type StepProps } from './controls';

// Étapes « Description et aperçu » et « Vérification », puis la confirmation (PublishFinalSteps.swift).

/** Titre, description (avec une aide qui reprend seulement les informations saisies) et la vraie carte de résultat. */
export function DescriptionStep({ draft, update, showsErrors, ownerId }: StepProps & { ownerId: string }) {
  const id = useId();
  const [replacing, setReplacing] = useState(false);
  const titleMissing = draft.title.trim() === '';
  const descriptionMissing = showsErrors && draft.description.trim() === '';
  const preview = useMemo(() => previewRow(draft, ownerId), [draft, ownerId]);
  const proposal = proposedTitle(draft);
  const setDescription = (description: string) => update((current) => ({ ...current, description }));
  return (
    <>
      <Card title="Titre">
        <TextInput label="Titre de l'annonce" value={draft.title} maxLength={150} guide="title"
          error={showsErrors && titleMissing ? 'Le titre est obligatoire.' : null}
          onChange={(title) => update((current) => ({ ...current, title }))} />
        {titleMissing && (
          <button type="button" className="dpub-propose" onClick={() => update((current) => ({ ...current, title: proposal }))}>
            {`Proposer : « ${proposal} »`}
          </button>
        )}
      </Card>
      <Card title="Description">
        <div className={`dsc-field${descriptionMissing ? ' has-error' : ''}`} data-guide="description">
          <textarea id={id} className="dsc-input dpub-textarea" value={draft.description} maxLength={10_000} rows={9}
            aria-label="Description de l'annonce" aria-invalid={descriptionMissing ? true : undefined}
            aria-describedby={descriptionMissing ? `${id}-erreur` : undefined}
            onChange={(event) => setDescription(event.target.value)} />
          {descriptionMissing && <p id={`${id}-erreur`} className="field-error">La description est obligatoire.</p>}
        </div>
        <div className="dsc-small-row">
          <button type="button" className="dsc-button dsc-button-light"
            onClick={() => {
              if (draft.description.trim() === '') setDescription(proposedDescription(draft));
              else setReplacing(true);
            }}>
            <Icon name="squarePen" />Rédiger à partir de mes informations
          </button>
        </div>
        <InfoLine>Le texte proposé reprend uniquement les informations que vous avez saisies : relisez-le et complétez-le.</InfoLine>
      </Card>
      <Card title="Aperçu dans les résultats">
        {preview ? (
          // La carte telle qu'elle apparaîtra dans la recherche, sans lien ni favori.
          <div className="dpub-preview" inert>
            <ListingCard row={preview} content={cardContent(preview, null, null)} headingLevel="h3" />
          </div>
        ) : (
          <InfoLine>Complétez les étapes précédentes pour afficher l'aperçu.</InfoLine>
        )}
      </Card>
      <ChoiceDialog
        open={replacing}
        title="Remplacer la description actuelle ?"
        onClose={() => setReplacing(false)}
        actions={[
          { label: 'Remplacer', tone: 'danger', onClick: () => { setDescription(proposedDescription(draft)); setReplacing(false); } },
          { label: 'Annuler', onClick: () => setReplacing(false) },
        ]}
      />
    </>
  );
}

/**
 * Récapitulatif, champs manquants (« Corriger » mène au champ, dans son étape) et avertissement avant publication.
 */
export function ReviewStep({ draft, onEdit, onFix, errorMessage }: {
  draft: StepProps['draft'];
  onEdit: (step: PublishStep) => void;
  onFix: (field: RequiredField) => void;
  errorMessage: string | null;
}) {
  const missing = missingRequiredFields(draft);
  return (
    <>
      {missing.length === 0 ? (
        <Card title="Prête à publier">
          <InfoLine>Toutes les informations obligatoires sont renseignées. Les autres champs restent facultatifs.</InfoLine>
        </Card>
      ) : (
        <Card title="À compléter">
          <ul className="dpub-missing">
            {missing.map((field) => (
              <li key={field}>
                <span>{missingLabel(draft, field)}</span>
                <button type="button" className="dpub-link" onClick={() => onFix(field)}>Corriger</button>
              </li>
            ))}
          </ul>
        </Card>
      )}
      <Card title="Récapitulatif">
        <dl className="dpub-recap">
          {recapRows(draft).map((row) => (
            <div key={row.title} className="dpub-recap-row">
              <dt>{row.title}</dt>
              <dd>
                <span>{row.value}</span>
                <button type="button" className="dpub-recap-edit" aria-label={`Modifier ${row.title}`} onClick={() => onEdit(row.step)}>
                  <Icon name="pen" />
                </button>
              </dd>
            </div>
          ))}
        </dl>
      </Card>
      <InfoLine>Une fois publiée, l'annonce est visible par tous dans Nidalo : recherche, carte et votre profil, avec l'adresse que vous avez choisi de montrer.</InfoLine>
      {errorMessage && <ErrorLine>{errorMessage}</ErrorLine>}
    </>
  );
}

/** Écran affiché quand la publication est confirmée par le serveur (PublishSuccessView). */
export function SuccessView({ listingId, title, editing, back }: { listingId: string; title: string; editing: boolean; back: string }) {
  return (
    <div className="dpub-success">
      <span className="dpub-success-icon" aria-hidden="true"><Icon name="circleCheck" /></span>
      <h1>{editing ? 'Modifications enregistrées' : 'Annonce publiée'}</h1>
      <p>
        {editing
          ? `« ${title} » est à jour pour tous dans Nidalo : fiche, recherche, carte et Mes annonces.`
          : `« ${title} » est en ligne : visible par tous dans la recherche, sur la carte et sur votre profil.`}
      </p>
      <div className="dpub-success-actions">
        <a className="dsc-button dsc-button-primary" href={listingPath(listingId)}><Icon name="eye" />{editing ? 'Voir mon annonce' : 'Voir l\'annonce'}</a>
        <a className="dsc-button dsc-button-light" href={accountPath('annonces')}><Icon name="list" />Mes annonces</a>
        <a className="dsc-button dsc-button-quiet" href={back}>Fermer</a>
      </div>
    </div>
  );
}
