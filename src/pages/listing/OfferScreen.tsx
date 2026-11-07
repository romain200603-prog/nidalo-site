import { useRef, useState, type ChangeEvent } from 'react';
import { Icon } from '../../components/Icon';
import { formatPrice } from '../../lib/format';
import {
  amountDigits, counterOfferParams, DEFAULT_OFFER_VALIDITY, groupedAmount, LOAN_CONDITION, lowercasedFirst, makeOfferParams,
  OFFER_VALIDITY_OPTIONS, offerErrorMessage, offerGapLabel, sendCounterOffer, sendOffer,
} from '../../lib/listing/offers';

// « Faire une offre » sur ordinateur, dans une colonne de 640 px (/annonce/?id=…&vue=offre) : la feuille de l'app
// (OfferComposerSheet, Features/Messages/OfferViews.swift) avec ses textes, son ordre et ses règles. L'offre part avec
// make_offer et les mêmes arguments que l'app ; le serveur écrit lui-même la bulle d'offre dans la conversation.
// Dans Messages, la même feuille répond à une offre (contre-offre, counter_offer), comme l'app.

export function OfferScreen({ conversationId, title, price, parent = null, onClose, onSent }: {
  conversationId: string;
  /** Titre et prix du bien enregistrés avec la conversation (ListingSnapshot). */
  title: string;
  price: number;
  /** Offre à laquelle on répond (contre-offre) : son montant est repris. */
  parent?: { id: string; amount: number } | null;
  onClose: () => void;
  /** Offre enregistrée : la fiche relit les offres et revient. */
  onSent: () => Promise<void>;
}) {
  const [amountText, setAmountText] = useState(() => (parent ? groupedAmount(parent.amount) : ''));
  const [conditions, setConditions] = useState('');
  const [validityDays, setValidityDays] = useState<number>(DEFAULT_OFFER_VALIDITY);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const busy = useRef(false);
  const digits = amountDigits(amountText);
  const amount = digits ? Number(digits) : null;

  /** Milliers espacés pendant la saisie, curseur gardé après le même chiffre (FormattedTextField de l'app). */
  const onAmount = (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const caret = input.selectionStart ?? input.value.length;
    const before = amountDigits(input.value.slice(0, caret)).length;
    const next = amountDigits(input.value);
    const text = next ? groupedAmount(Number(next)) : '';
    setAmountText(text);
    window.requestAnimationFrame(() => {
      let position = 0;
      for (let seen = 0; position < text.length && seen < before; position += 1) {
        if (/\d/.test(text[position])) seen += 1;
      }
      if (document.activeElement === input) input.setSelectionRange(position, position);
    });
  };

  const send = async () => {
    if (busy.current) return;
    if (amount === null || !(amount > 0)) {
      setError('Indiquez un montant.');
      return;
    }
    busy.current = true;
    setSending(true);
    try {
      if (parent) {
        await sendCounterOffer(counterOfferParams({ id: crypto.randomUUID(), parentId: parent.id, amount, conditions, validityDays, now: new Date() }));
      } else {
        await sendOffer(makeOfferParams({ id: crypto.randomUUID(), conversationId, amount, conditions, validityDays, now: new Date() }));
      }
    } catch (failure) {
      setError(offerErrorMessage(failure));
      busy.current = false;
      setSending(false);
      return;
    }
    await onSent();
  };

  const gap = amount !== null && price > 0 ? amount / price - 1 : null;

  return (
    <div className="wrap wrap-narrow dl-screen dl-offer-screen">
      <header className="dl-screen-head">
        <div className="dl-screen-titles">
          <h1 tabIndex={-1}>{parent ? 'Faire une contre-offre' : 'Faire une offre'}</h1>
          <p>{title} · prix affiché {formatPrice(price)}</p>
        </div>
        <button type="button" className="dl-screen-close" onClick={onClose} aria-label="Fermer" title="Fermer">
          <Icon name="x" />
        </button>
      </header>

      <form
        className="dl-form-card"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void send();
        }}
      >
        <div className="dl-field">
          <label className="dl-label" htmlFor="offre-montant">Montant proposé</label>
          <div className="dl-amount">
            <input
              id="offre-montant"
              type="text"
              inputMode="numeric"
              autoComplete="off"
              placeholder={groupedAmount(price)}
              value={amountText}
              onChange={onAmount}
              autoFocus
              aria-describedby={gap !== null ? 'offre-ecart' : undefined}
            />
            <span aria-hidden="true">€</span>
          </div>
          {amount !== null && gap !== null && (
            <p id="offre-ecart" className={`dl-gap${gap < 0 ? ' is-below' : ''}`}>
              {formatPrice(amount)} · {lowercasedFirst(offerGapLabel(amount, price))}
            </p>
          )}
        </div>

        <div className="dl-field">
          <label className="dl-label" htmlFor="offre-conditions">Conditions (facultatif)</label>
          <textarea
            id="offre-conditions"
            className="dl-textarea"
            rows={3}
            placeholder="Ex. sous réserve d'obtention du prêt"
            value={conditions}
            onChange={(event) => setConditions(event.currentTarget.value)}
          />
          {!conditions.includes(LOAN_CONDITION) && (
            <button
              type="button"
              className="dl-chip"
              onClick={() => setConditions(conditions === '' ? LOAN_CONDITION : `${conditions}\n${LOAN_CONDITION}`)}
            >
              <Icon name="plus" />
              {LOAN_CONDITION}
            </button>
          )}
        </div>

        <fieldset className="dl-field">
          <legend className="dl-label">Valable</legend>
          <div className="dl-options">
            {OFFER_VALIDITY_OPTIONS.map((days) => (
              <button
                key={days}
                type="button"
                className="dl-option"
                aria-pressed={validityDays === days}
                onClick={() => setValidityDays(days)}
              >
                {days} jours
              </button>
            ))}
          </div>
        </fieldset>

        {error && <p className="dl-error" role="alert">{error}</p>}
        <button type="submit" className={`dl-submit${amount === null ? ' is-dim' : ''}`} aria-busy={sending}>
          {sending ? 'Envoi…' : parent ? 'Envoyer la contre-offre' : 'Envoyer l\'offre'}
        </button>
        <p className="dl-form-note">
          Proposition non engageante : l'accord se formalise ensuite par écrit (offre signée, puis compromis chez le notaire). Ne versez aucune somme à ce stade.
        </p>
      </form>
    </div>
  );
}
