import { useState } from 'react';
import { LISTING_REPORT_LIMIT, LISTING_REPORT_REASONS, reportListing, type ListingReportReason } from '../../lib/listing/report';
import { ListingSheet } from './Sheet';

// « Signaler l'annonce » (ReportSheet de l'app, GroupInfoView.swift 1134–1213, ouvert depuis le bas de la fiche) :
// motif, description facultative de 500 caractères, puis « Enregistrer le signalement ». Il part tout de suite dans la
// table reports, comme l'app avec un compte connecté ; le site n'a pas la file de l'iPhone qui le garde sans réseau :
// un échec le dit, et le bouton reste là pour réessayer.

export const REPORT_SENT = 'Signalement envoyé à l\'équipe Nidalo.';

export function ReportListingSheet({ open, listingId, onClose, onSent }: { open: boolean; listingId: string; onClose: () => void; onSent: (notice: string) => void }) {
  return (
    <ListingSheet open={open} onClose={onClose} title="Signaler l'annonce" className="report-sheet">
      <ReportForm listingId={listingId} onSent={onSent} />
    </ListingSheet>
  );
}

function ReportForm({ listingId, onSent }: { listingId: string; onSent: (notice: string) => void }) {
  const [reason, setReason] = useState<ListingReportReason | null>(null);
  const [details, setDetails] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const count = [...details].length;

  const save = async () => {
    if (!reason || saving) return;
    setSaving(true);
    setError(null);
    const text = details.trim();
    try {
      await reportListing(crypto.randomUUID(), listingId, reason, text ? text : null);
    } catch {
      setSaving(false);
      setError('Le signalement n\'a pas pu être enregistré. Réessayez.');
      return;
    }
    onSent(REPORT_SENT);
  };

  return (
    <form className="sheet-form" onSubmit={(event) => { event.preventDefault(); void save(); }}>
      <fieldset className="form-card">
        <legend className="form-label">Motif</legend>
        {LISTING_REPORT_REASONS.map((option) => (
          <label key={option.value} className={`choice-chip${reason === option.value ? ' is-selected' : ''}`}>
            <input type="radio" name="motif" value={option.value} checked={reason === option.value} onChange={() => setReason(option.value)} />
            {option.label}
          </label>
        ))}
      </fieldset>
      <div className="form-card">
        <div className="form-label-row">
          <label className="form-label" htmlFor="signalement-details">Description (facultative)</label>
          <span className="form-count">{count}/{LISTING_REPORT_LIMIT}</span>
        </div>
        <textarea
          id="signalement-details"
          className="form-editor"
          placeholder="Ce qui s'est passé"
          value={details}
          onChange={(event) => setDetails([...event.currentTarget.value].slice(0, LISTING_REPORT_LIMIT).join(''))}
          rows={4}
        />
      </div>
      <p className="sheet-note">Il est transmis à l'équipe Nidalo. Les autres membres ne le voient pas.</p>
      {error && <p className="form-error" role="alert">{error}</p>}
      <button type="submit" className="btn btn-primary sheet-submit" disabled={!reason || saving} aria-busy={saving}>Enregistrer le signalement</button>
    </form>
  );
}
