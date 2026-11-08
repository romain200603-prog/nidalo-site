import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '../../components/Icon';
import { AlertDialog } from '../listing/Dialogs';
import {
  fileSlug, posterPrice, publicListingUrl, qrMatrix, qrPath, qrPng, qrViewSize, saveFile, socialText,
} from '../../lib/account/diffusion';
import { loadMyListings, myListingsStore, ONLINE_STATUSES } from '../../lib/account/myListings';
import { useStore } from '../../lib/account/session';
import { formatArea } from '../../lib/format';
import { shareListing } from '../../lib/listing/share';
import { photoUrl, sortedPhotos, type ListingRow } from '../../lib/listings';
import { accountPath } from '../../lib/paths';
import { EmptyState, ScreenHeader, Spinner, Toast } from './parts';

// « Outils de diffusion » de l'espace professionnel : chaque annonce en ligne avec son lien, son QR code, un texte
// prêt pour les réseaux sociaux et une affiche à imprimer pour la vitrine.

export const posterPath = (id: string): string => accountPath('affiche', { annonce: id });

type Open = { kind: 'qr' | 'text' | 'link'; row: ListingRow } | null;

export function Diffusion() {
  const state = useStore(myListingsStore);
  const [open, setOpen] = useState<Open>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    void loadMyListings();
  }, []);

  function flash(text: string) {
    setToast(text);
    window.setTimeout(() => setToast(null), 2500);
  }

  /** « Lien » : le partage du téléphone (texte et lien), sinon le lien copié, sinon le lien à copier à la main. */
  async function shareLink(row: ListingRow) {
    const outcome = await shareListing(row, null);
    if (outcome === 'copied') flash('Lien copié');
    else if (outcome !== 'done') setOpen({ kind: 'link', row });
  }

  const online = state.status === 'ready' ? state.items.filter((row) => ONLINE_STATUSES.includes(row.status)) : [];

  return (
    <div className="space diffusion">
      <Toast text={toast} />
      <ScreenHeader title="Outils de diffusion" />
      {state.status === 'error' ? (
        <>
          <p className="signin-error" role="alert">{state.message}</p>
          <button type="button" className="btn btn-light" onClick={() => void loadMyListings()}>Réessayer</button>
        </>
      ) : state.status !== 'ready' ? (
        <Spinner />
      ) : online.length === 0 ? (
        <EmptyState
          icon="megaphone"
          title="Aucune annonce en ligne"
          text="Vos annonces en ligne apparaîtront ici, avec leur lien, leur QR code, un texte à partager et une affiche pour la vitrine."
        />
      ) : (
        <>
          <p className="diffusion-intro">
            Pour chaque annonce en ligne : son lien, son QR code, un texte prêt pour les réseaux sociaux et une affiche à imprimer pour la vitrine.
          </p>
          {online.map((row) => (
            <DiffusionCard key={row.id} row={row} onLink={() => void shareLink(row)} onOpen={(kind) => setOpen({ kind, row })} />
          ))}
        </>
      )}
      <QrDialog row={open?.kind === 'qr' ? open.row : null} onClose={() => setOpen(null)} />
      <TextDialog row={open?.kind === 'text' ? open.row : null} onClose={() => setOpen(null)} onCopied={() => { setOpen(null); flash('Texte copié'); }} />
      <AlertDialog
        open={open?.kind === 'link'}
        onClose={() => setOpen(null)}
        title="Lien de l'annonce"
        message="Copiez ce lien pour le partager."
        actions={[{ label: 'Fermer', onClick: () => setOpen(null), tone: 'primary' }]}
      >
        {open?.kind === 'link' && <input className="text-input diffusion-link" readOnly value={publicListingUrl(open.row.id)} onFocus={(event) => event.target.select()} />}
      </AlertDialog>
    </div>
  );
}

function DiffusionCard({ row, onLink, onOpen }: { row: ListingRow; onLink: () => void; onOpen: (kind: 'qr' | 'text') => void }) {
  const photo = sortedPhotos(row)[0];
  const url = photo ? photoUrl(photo.storage_path) : null;
  const area = Number(row.living_area);
  return (
    <article className="diffusion-card space-card">
      <div className="diffusion-head">
        <span className="diffusion-thumb" aria-hidden="true">{url ? <img src={url} alt="" loading="lazy" /> : <Icon name="image" />}</span>
        <div className="diffusion-text">
          <h2 className="diffusion-title">{row.title}</h2>
          <p className="diffusion-line">{[row.city, area > 0 ? formatArea(area) : null].filter(Boolean).join(' · ')}</p>
          <p className="diffusion-price">{posterPrice(row)}</p>
        </div>
      </div>
      <div className="diffusion-tools">
        <button type="button" className="diffusion-tool" onClick={onLink}><Icon name="link" />Lien</button>
        <button type="button" className="diffusion-tool" onClick={() => onOpen('qr')}><Icon name="scan" />QR code</button>
        <button type="button" className="diffusion-tool" onClick={() => onOpen('text')}><Icon name="messageSquareText" />Texte</button>
        <a className="diffusion-tool" href={posterPath(row.id)} target="_blank" rel="noopener"><Icon name="fileText" />Affiche</a>
      </div>
    </article>
  );
}

/** QR code de l'annonce, en SVG (net à toutes les tailles), avec son PNG à télécharger. */
export function QrCode({ text, className, label }: { text: string; className?: string; label: string }) {
  const matrix = useMemo(() => qrMatrix(text), [text]);
  const size = qrViewSize(matrix);
  return (
    <svg className={className} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={label} shapeRendering="crispEdges">
      <rect width={size} height={size} fill="#FFFFFF" />
      <path d={qrPath(matrix)} fill="#000000" />
    </svg>
  );
}

function QrDialog({ row, onClose }: { row: ListingRow | null; onClose: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const url = row ? publicListingUrl(row.id) : '';

  async function download() {
    if (!row) return;
    setError(null);
    try {
      saveFile(await qrPng(qrMatrix(url)), `nidalo-qr-${fileSlug(row.title)}.png`);
    } catch {
      setError('Le QR code n\'a pas pu être enregistré. Réessayez dans un instant.');
    }
  }

  return (
    <AlertDialog
      open={row !== null}
      onClose={() => { setError(null); onClose(); }}
      title="QR code de l'annonce"
      message="Scanné avec un téléphone, il ouvre cette annonce sur nidalo.fr."
      actions={[
        { label: 'Télécharger le QR code', onClick: () => void download(), tone: 'primary' },
        { label: 'Fermer', onClick: () => { setError(null); onClose(); } },
      ]}
    >
      {row && (
        <div className="diffusion-qr-box">
          <QrCode text={url} className="diffusion-qr" label={`QR code de l'annonce ${row.title}`} />
          <span className="diffusion-qr-url">{url}</span>
          {error && <p className="field-error">{error}</p>}
        </div>
      )}
    </AlertDialog>
  );
}

function TextDialog({ row, onClose, onCopied }: { row: ListingRow | null; onClose: () => void; onCopied: () => void }) {
  const [hint, setHint] = useState<string | null>(null);
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const text = row ? socialText(row) : '';

  async function copy() {
    setHint(null);
    try {
      await navigator.clipboard.writeText(text);
      onCopied();
    } catch {
      // Sans accès au presse-papiers : le texte est sélectionné, à copier à la main.
      areaRef.current?.focus();
      areaRef.current?.select();
      setHint('Le texte est sélectionné : copiez-le avec le menu ou le clavier.');
    }
  }

  return (
    <AlertDialog
      open={row !== null}
      onClose={() => { setHint(null); onClose(); }}
      title="Texte pour les réseaux sociaux"
      message="À coller dans une publication ou un message, avec le lien de l'annonce."
      actions={[
        { label: 'Copier le texte', onClick: () => void copy(), tone: 'primary' },
        { label: 'Fermer', onClick: () => { setHint(null); onClose(); } },
      ]}
    >
      {row && (
        <>
          <textarea ref={areaRef} className="text-input diffusion-textarea" readOnly rows={6} value={text} aria-label="Texte à partager" />
          {hint && <p className="field-hint">{hint}</p>}
        </>
      )}
    </AlertDialog>
  );
}
