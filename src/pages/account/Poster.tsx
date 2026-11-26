import { useEffect, useState } from 'react';
import { Icon } from '../../components/Icon';
import { agencyPlace, loadAgency, type AgencyRecord } from '../../lib/account/agency';
import { posterBand, posterPrice, publicListingUrl } from '../../lib/account/diffusion';
import { loadMyListings, myListingsStore, ONLINE_STATUSES } from '../../lib/account/myListings';
import { avatarUrl, initials, phonePairs } from '../../lib/account/profile';
import { useStore } from '../../lib/account/session';
import { DPE_COLORS } from '../../lib/labels';
import { shareFacts } from '../../lib/listing/share';
import { energyInk, energyLetter, energyLines, feesLabel, GEORISQUES, priceFeesNote } from '../../lib/listing/rows';
import { photoUrl, placeLine, sortedPhotos, type ListingRow } from '../../lib/listings';
import { accountPath } from '../../lib/paths';
import { QrCode } from './Diffusion';
import { EmptyState, LoadFailure, ScreenHeader, Spinner } from './parts';

// Affiche de vitrine d'une annonce (Outils de diffusion) : format A4, à imprimer ou à enregistrer en PDF depuis le
// navigateur. La photo principale, le prix, les surfaces, le DPE et les honoraires, un QR code vers l'annonce, et
// l'agence. Elle s'ouvre dans la page, comme dans l'app (retour vers les Outils de diffusion).

type AgencyState = { status: 'loading' } | { status: 'ready'; agency: AgencyRecord | null };

export function Poster({ listingId }: { listingId: string | null }) {
  const listings = useStore(myListingsStore);
  const [agency, setAgency] = useState<AgencyState>({ status: 'loading' });

  useEffect(() => {
    void loadMyListings();
    // Sans fiche lisible, l'affiche se fait sans le bloc de l'agence.
    loadAgency().then((record) => setAgency({ status: 'ready', agency: record }), () => setAgency({ status: 'ready', agency: null }));
  }, []);

  const back = accountPath('diffusion');
  if (listings.status === 'error') {
    return (
      <div className="space">
        <LoadFailure message={listings.message} onRetry={() => void loadMyListings()} />
      </div>
    );
  }
  if (listings.status !== 'ready' || agency.status === 'loading') return <Spinner />;
  const row = listings.items.find((item) => item.id === listingId && ONLINE_STATUSES.includes(item.status));
  if (!row) {
    return (
      <EmptyState
        icon="fileText"
        title="Affiche indisponible"
        text="Cette annonce n'est pas en ligne, ou elle n'est plus dans vos annonces."
        action={<a className="btn btn-primary" href={back}>Outils de diffusion</a>}
      />
    );
  }
  // La page de l'app (PosterView) : l'aperçu de la feuille A4, puis « Imprimer ou enregistrer » (bouton plein) ; la
  // fenêtre d'impression du navigateur remplace la feuille de partage de l'iPhone, d'où la phrase sur le PDF.
  return (
    <div className="space poster-screen">
      <ScreenHeader title="Affiche de vitrine" back={back} />
      <div className="poster-preview">
        <PosterSheet row={row} agency={agency.agency} />
      </div>
      <button type="button" className="btn btn-primary poster-print" onClick={() => window.print()}>
        <Icon name="printer" />Imprimer ou enregistrer
      </button>
      <p className="poster-hint">Format A4. Pour un PDF, choisissez « Enregistrer au format PDF » dans la fenêtre d&apos;impression.</p>
    </div>
  );
}

function PosterSheet({ row, agency }: { row: ListingRow; agency: AgencyRecord | null }) {
  const photo = sortedPhotos(row)[0];
  const facts = shareFacts(row);
  const dpe = energyLetter(row.energy_class);
  const ges = energyLetter(row.climate_class);
  const energy = energyLines(row);
  const fees = feesLabel(row);
  const place = placeLine(row);
  const priceNote = priceFeesNote(row);
  const url = publicListingUrl(row.id);
  return (
    <article className="poster" aria-label={`Affiche : ${row.title}`}>
      <div className="poster-band">{posterBand(row)}</div>
      <div className="poster-photo">
        {photo ? <img src={photoUrl(photo.storage_path)} alt="" /> : <Icon name="image" />}
      </div>
      <div className="poster-body">
        <h2 className="poster-title">{row.title}</h2>
        <p className="poster-place">{place}</p>
        <p className="poster-price">{posterPrice(row)}</p>
        {priceNote && <p className="poster-small">{priceNote}</p>}
        {facts.length > 0 && <p className="poster-facts">{facts.join(' · ')}</p>}
        {(dpe || ges) && (
          <div className="poster-energy">
            {dpe && <span className="poster-chip"><span>DPE</span><b style={{ background: DPE_COLORS[dpe], color: energyInk(dpe) }}>{dpe}</b></span>}
            {ges && <span className="poster-chip"><span>GES</span><b style={{ background: DPE_COLORS[ges], color: energyInk(ges) }}>{ges}</b></span>}
          </div>
        )}
        {/* Mentions obligatoires, serrées pour garder la photo et le pied de l'affiche sur la page. */}
        <div className="poster-legal">
          {energy.map((line) => <p key={line} className="poster-small">{line}</p>)}
          {fees && <p className="poster-small">Honoraires : {fees}</p>}
          <p className="poster-small">{GEORISQUES.text} {GEORISQUES.label}</p>
        </div>
      </div>
      <div className="poster-foot">
        <div className="poster-qr">
          <QrCode text={url} className="poster-qr-code" label="QR code de l'annonce" />
          <p>Scannez pour voir l&apos;annonce et toutes ses photos sur <strong>nidalo.fr</strong></p>
        </div>
        {agency && (
          <div className="poster-agency">
            <span className="poster-agency-logo" aria-hidden="true">
              {agency.logo_path ? <img src={avatarUrl(agency.logo_path) ?? undefined} alt="" /> : initials(agency.agency_name)}
            </span>
            <span className="poster-agency-text">
              <strong>{agency.agency_name}</strong>
              {agencyPlace(agency) && <span>{agencyPlace(agency)}</span>}
              {agency.details?.phone && <span>{phonePairs(agency.details.phone)}</span>}
              {agency.details?.email && <span>{agency.details.email}</span>}
            </span>
          </div>
        )}
      </div>
    </article>
  );
}
