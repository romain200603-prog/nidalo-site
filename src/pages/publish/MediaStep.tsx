import { useRef, useState } from 'react';
import { InfoLine } from '../../components/FilterControls';
import { Icon } from '../../components/Icon';
import { photoUrl } from '../../lib/listings';
import type { DraftPhoto } from '../../lib/publish/draft';
import { encodePhoto, MAX_PHOTOS } from '../../lib/publish/photos';
import { ActionMenu, type MenuItem } from '../account/DesktopParts';
import { Card, ErrorLine, type StepProps } from './controls';

// Étape « Photos » (PublishMediaStep.swift) : photos choisies sur l'ordinateur (miniatures, photo principale, ordre,
// suppression). Elles sont réencodées sans métadonnées dès le choix et envoyées à l'enregistrement. Les documents de
// l'app restent sur l'iPhone : ils ne sont jamais envoyés en ligne.

const photoSource = (photo: DraftPhoto) => (photo.kind === 'stored' ? photoUrl(photo.storagePath) : photo.url);
const photoKey = (photo: DraftPhoto) => (photo.kind === 'stored' ? photo.id : photo.key);

export function MediaStep({ draft, update, showsErrors }: StepProps) {
  const input = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const photos = draft.photos;

  async function add(files: File[]) {
    const room = MAX_PHOTOS - photos.length;
    const chosen = files.slice(0, Math.max(0, room));
    if (chosen.length === 0) return;
    setImporting(chosen.length);
    let failures = 0;
    for (const file of chosen) {
      try {
        const encoded = await encodePhoto(file);
        const photo: DraftPhoto = {
          kind: 'new', key: crypto.randomUUID(), blob: encoded.blob, url: URL.createObjectURL(encoded.blob), width: encoded.width, height: encoded.height,
        };
        update((current) => (current.photos.length >= MAX_PHOTOS ? current : { ...current, photos: [...current.photos, photo] }));
      } catch {
        failures += 1;
      }
      setImporting((count) => count - 1);
    }
    const skipped = files.length - chosen.length;
    if (failures > 0) {
      setError(`${failures} photo${failures > 1 ? 's n\'ont' : ' n\'a'} pas pu être ajoutée${failures > 1 ? 's' : ''}.`);
    } else {
      setError(skipped > 0 ? `${MAX_PHOTOS} photos au plus par annonce.` : null);
    }
  }

  const move = (from: number, to: number) => update((current) => {
    const next = [...current.photos];
    const [photo] = next.splice(from, 1);
    next.splice(to, 0, photo);
    return { ...current, photos: next };
  });

  /** Retire la photo de l'annonce ; une photo déjà en ligne n'est effacée qu'à l'enregistrement. */
  const remove = (index: number) => update((current) => {
    const photo = current.photos[index];
    if (photo?.kind === 'new') URL.revokeObjectURL(photo.url);
    return { ...current, photos: current.photos.filter((_, position) => position !== index) };
  });

  return (
    <>
      <Card title="Photos">
        {photos.length === 0 ? (
          <p className="dsc-note">Ajoutez au moins une photo. La première est la photo principale de l'annonce.</p>
        ) : (
          <ul className="dpub-photos">
            {photos.map((photo, index) => {
              const items: MenuItem[] = [];
              if (index > 0) items.push({ label: 'Photo principale', icon: 'star', onClick: () => move(index, 0) });
              if (index > 0) items.push({ label: 'Déplacer avant', icon: 'arrowLeft', onClick: () => move(index, index - 1) });
              if (index < photos.length - 1) items.push({ label: 'Déplacer après', icon: 'arrowRight', onClick: () => move(index, index + 1) });
              items.push({ label: 'Supprimer', icon: 'trash', onClick: () => remove(index), danger: true });
              return (
                <li key={photoKey(photo)} className="dpub-photo">
                  <img src={photoSource(photo)} alt={`Photo ${index + 1}`} loading="lazy" />
                  {index === 0 && <span className="dpub-photo-main">Principale</span>}
                  <ActionMenu label={`Options de la photo ${index + 1}`} items={items} triggerClassName="dpub-photo-menu" />
                </li>
              );
            })}
          </ul>
        )}
        {importing > 0 && (
          <p className="dpub-importing" role="status">
            <span className="spinner" aria-hidden="true" />
            {`Ajout de ${importing} photo${importing > 1 ? 's' : ''}…`}
          </p>
        )}
        <div className="dsc-small-row">
          <button type="button" className="dsc-button dsc-button-light" disabled={photos.length >= MAX_PHOTOS || importing > 0}
            onClick={() => input.current?.click()}>
            <Icon name="image" />{photos.length === 0 ? 'Choisir des photos' : 'Ajouter des photos'}
          </button>
        </div>
        <input ref={input} type="file" accept="image/*" multiple hidden
          onChange={(event) => {
            const files = Array.from(event.target.files ?? []);
            event.target.value = '';
            void add(files);
          }} />
        {error && <ErrorLine>{error}</ErrorLine>}
        {showsErrors && photos.length === 0 && <ErrorLine>Ajoutez au moins une photo.</ErrorLine>}
      </Card>
      <InfoLine>Les photos sont envoyées sans leurs données cachées (position GPS, appareil).</InfoLine>
    </>
  );
}
