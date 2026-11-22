import { useEffect, useId, useLayoutEffect, useRef, useState, useSyncExternalStore, type PointerEvent, type ReactNode } from 'react';
import { Icon } from '../../components/Icon';
import {
  CONTACT_BAR_SCROLL, cssCurve, DUO, DUO_ARRIVAL, DUO_CURVES, DUO_DURATIONS, dotHopKeyframes, DOT_HOP, duoLayout, nextContactBarScroll,
  scrollEdges,
} from '../../lib/listing/contactBar';
import '../../styles/pieces-app.css';

// Barre de contact « Duo » de l'annonce d'un autre (ListingContactBar.swift, demande de Romain du 19 novembre 2026) :
// « Appeler » (capsule blanche) et « Envoyer un message » (capsule bleue, « Message » si le libellé n'y tient pas).
// Téléphone et tablette : flottante en bas de l'écran sur un dégradé, avec l'arrivée en ronds qui montent puis se
// déplient, le reflet une fois, et le repli en ronds quand on descend la fiche. Ordinateur : les deux mêmes capsules,
// côte à côte dans la colonne de droite, dépliées d'emblée et sans repli. Partout : l'appui qui s'enfonce, la
// sonnerie et les ondes d'« Appeler », la bulle qui grossit et les trois points si la conversation tarde plus de
// 0,15 s. « Réduire les animations » (prefers-reduced-motion) : comme l'app, barre dépliée en fondu, sans reflet,
// ondes, rotation ni repli ; l'appui ne change que la couleur. Les actions sont celles de la fiche, inchangées.

const REDUCED_MOTION = '(prefers-reduced-motion: reduce)';

function reducedMotionQuery(): MediaQueryList | null {
  try {
    return typeof window.matchMedia === 'function' ? window.matchMedia(REDUCED_MOTION) : null;
  } catch {
    return null;
  }
}

function subscribeReducedMotion(listener: () => void): () => void {
  const query = reducedMotionQuery();
  if (!query) return () => undefined;
  query.addEventListener('change', listener);
  return () => query.removeEventListener('change', listener);
}

/** « Réduire les animations » de l'appareil (accessibilityReduceMotion de l'app). */
function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribeReducedMotion, () => reducedMotionQuery()?.matches ?? false, () => false);
}

/** État des deux capsules pendant l'arrivée et le repli, et la durée (s) du dernier changement de chacune. */
type Duo = {
  callRisen: boolean;
  messageRisen: boolean;
  callUnfolded: boolean;
  messageUnfolded: boolean;
  callTextShown: boolean;
  messageTextShown: boolean;
  /** Repli au défilement : la largeur, puis le texte. */
  folded: boolean;
  textFolded: boolean;
  callWidthTime: number;
  messageWidthTime: number;
  callTextTime: number;
  messageTextTime: number;
};

const ARRIVED: Duo = {
  callRisen: true, messageRisen: true, callUnfolded: true, messageUnfolded: true, callTextShown: true, messageTextShown: true,
  folded: false, textFolded: false,
  callWidthTime: DUO_DURATIONS.unfold, messageWidthTime: DUO_DURATIONS.unfold, callTextTime: DUO_DURATIONS.text, messageTextTime: DUO_DURATIONS.text,
};

/** Avant l'arrivée : deux ronds de 56 px, 90 px plus bas, à 90 % de leur taille et invisibles. */
const WAITING: Duo = { ...ARRIVED, callRisen: false, messageRisen: false, callUnfolded: false, messageUnfolded: false, callTextShown: false, messageTextShown: false };

/** « Réduire les animations » : déjà dépliées, elles n'ont plus qu'à monter en fondu. */
const RISING: Duo = { ...ARRIVED, callRisen: false, messageRisen: false };

const ms = (seconds: number) => Math.round(seconds * 1000);
const SWING = cssCurve(DUO_CURVES.swing);

/** Largeur des textes, mesurée dans la police de la page (comme les onGeometryChange de l'app). */
type Sizes = { inner: number; callText: number; fullText: number; shortText: number };

/** Pictogramme (21 px) et 8 px avant le texte. */
const ICON_AND_GAP = 21 + 8;

export function ContactCapsules({ floating, collapsed = false, playsArrival = true, onArrived, onCall, callHref, callTitle, onMessage, opening, isRental }: {
  /** Téléphone et tablette : barre flottante (arrivée, repli au défilement). Ordinateur : dans la colonne de droite. */
  floating: boolean;
  /** Barre repliée en ronds (la fiche descend). */
  collapsed?: boolean;
  /** L'arrivée se joue une fois par ouverture de la fiche : après un écran de la fiche, la barre revient dépliée. */
  playsArrival?: boolean;
  onArrived?: () => void;
  /** « Appeler » sans numéro publié (la fenêtre « Numéro non disponible »). */
  onCall: () => void;
  /** Le numéro du vendeur, quand il le communique (tel:…) : « Appeler » l'appelle. */
  callHref: string | null;
  /** Le numéro écrit, en bulle d'aide sur ordinateur. */
  callTitle?: string;
  onMessage: () => void;
  /** La conversation avec le vendeur s'ouvre (isOpeningConversation) : les points dans la bulle après 0,15 s. */
  opening: boolean;
  /** Location : « propriétaire » dans l'indice lu par les lecteurs d'écran (n° 74). */
  isRental: boolean;
}) {
  const reduced = useReducedMotion();
  // L'arrivée lit « Réduire les animations » une fois, à l'apparition de la barre (comme arrive() dans l'app).
  const [start] = useState(() => {
    if (!floating || !playsArrival) return { duo: ARRIVED, reducedRise: false };
    const reduce = reducedMotionQuery()?.matches ?? false;
    return { duo: reduce ? RISING : WAITING, reducedRise: reduce };
  });
  const { reducedRise } = start;
  const [duo, setDuo] = useState<Duo>(start.duo);
  /** Arrivée et reflet finis (data-arrived, que lisent les vérifications du site). */
  const [settled, setSettled] = useState(() => floating && !playsArrival);
  const [sizes, setSizes] = useState<Sizes>({ inner: 0, callText: 0, fullText: 0, shortText: 0 });
  const [pressed, setPressed] = useState<'call' | 'message' | null>(null);
  const [showsDots, setShowsDots] = useState(false);
  const row = useRef<HTMLDivElement>(null);
  const measures = useRef<HTMLSpanElement>(null);
  const phoneIcon = useRef<SVGSVGElement>(null);
  const waves = useRef<HTMLSpanElement>(null);
  const bubble = useRef<HTMLSpanElement>(null);
  const dots = useRef<HTMLSpanElement>(null);
  const shine = useRef<HTMLSpanElement>(null);
  const hintId = `${useId()}-indice`;
  const arrivedRef = useRef(onArrived);
  arrivedRef.current = onArrived;

  // Largeur de la barre et des libellés à la taille de texte de la page, relues quand elles changent (police chargée).
  useLayoutEffect(() => {
    const rowEl = row.current;
    const box = measures.current;
    if (!rowEl || !box) return;
    const measure = () => {
      const [call, full, short] = [...box.children].map((el) => el.getBoundingClientRect().width);
      const next = { inner: rowEl.clientWidth, callText: call ?? 0, fullText: full ?? 0, shortText: short ?? 0 };
      setSizes((current) => (Object.keys(next).every((key) => current[key as keyof Sizes] === next[key as keyof Sizes]) ? current : next));
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(rowEl);
    for (const el of box.children) observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Arrivée (temps 0 : 0,35 s après l'apparition de la barre), puis le reflet, une seule fois par ouverture de la fiche.
  useEffect(() => {
    const timers: number[] = [];
    const at = (seconds: number, run: () => void) => { timers.push(window.setTimeout(run, ms(seconds))); };
    const passShine = () => {
      const band = shine.current;
      if (!band || reducedMotionQuery()?.matches || typeof band.animate !== 'function') return;
      band.animate([{ left: '-70px', visibility: 'visible' }, { left: '100%', visibility: 'visible' }], { duration: ms(DUO_DURATIONS.shine), easing: SWING });
    };
    if (!floating) {
      // Ordinateur : les capsules sont déjà dépliées dans la colonne ; seul le reflet passe, au même moment.
      at(DUO_ARRIVAL.shine, passShine);
      at(DUO_ARRIVAL.shineEnd, () => setSettled(true));
      return () => timers.forEach((timer) => window.clearTimeout(timer));
    }
    if (!playsArrival) return undefined;
    arrivedRef.current?.();
    if (reducedRise) {
      // Dépliée d'emblée, montée en fondu (easeOut 0,3 s), sans reflet : l'image suivante, pour que la transition parte.
      let frame = window.requestAnimationFrame(() => { frame = window.requestAnimationFrame(() => setDuo(ARRIVED)); });
      at(DUO_DURATIONS.reducedRise + 0.1, () => setSettled(true));
      return () => {
        window.cancelAnimationFrame(frame);
        timers.forEach((timer) => window.clearTimeout(timer));
      };
    }
    const step = (seconds: number, change: Partial<Duo>) => at(seconds, () => setDuo((current) => ({ ...current, ...change })));
    step(DUO_ARRIVAL.callRisen, { callRisen: true });
    step(DUO_ARRIVAL.messageRisen, { messageRisen: true });
    step(DUO_ARRIVAL.callUnfolded, { callUnfolded: true, callWidthTime: DUO_DURATIONS.unfold });
    step(DUO_ARRIVAL.callTextShown, { callTextShown: true, callTextTime: DUO_DURATIONS.text });
    step(DUO_ARRIVAL.messageUnfolded, { messageUnfolded: true, messageWidthTime: DUO_DURATIONS.unfold });
    step(DUO_ARRIVAL.messageTextShown, { messageTextShown: true, messageTextTime: DUO_DURATIONS.text });
    at(DUO_ARRIVAL.shine, passShine);
    at(DUO_ARRIVAL.shineEnd, () => setSettled(true));
    return () => timers.forEach((timer) => window.clearTimeout(timer));
    // Une fois, à l'apparition de la barre (le .task de l'app).
  }, []);

  // Repli en ronds (0,35 s, texte en 0,28 s) ou dépli (0,40 s), en Morph. Pas de repli avec « Réduire les animations ».
  useEffect(() => {
    if (!floating || reduced) return;
    setDuo((current) => {
      if (collapsed) {
        if (current.folded && current.textFolded) return current;
        return { ...current, folded: true, textFolded: true, callWidthTime: DUO_DURATIONS.fold, messageWidthTime: DUO_DURATIONS.fold,
          callTextTime: DUO_DURATIONS.foldText, messageTextTime: DUO_DURATIONS.foldText };
      }
      if (!current.folded && !current.textFolded) return current;
      return { ...current, folded: false, textFolded: false, callWidthTime: DUO_DURATIONS.refold, messageWidthTime: DUO_DURATIONS.refold,
        callTextTime: DUO_DURATIONS.refold, messageTextTime: DUO_DURATIONS.refold };
    });
  }, [collapsed, floating, reduced]);

  // Points dans la bulle seulement après 0,15 s d'attente réelle ; retirés dès que l'ouverture finit (ou échoue).
  useEffect(() => {
    if (!opening) {
      setShowsDots(false);
      return;
    }
    const timer = window.setTimeout(() => setShowsDots(true), ms(DUO_DURATIONS.dotsDelay));
    return () => window.clearTimeout(timer);
  }, [opening]);

  // Les points sautillent (0,36 s par saut, décalés de 0,12 s) ; immobiles avec « Réduire les animations ».
  useEffect(() => {
    const box = dots.current;
    if (!showsDots || reduced || !box) return;
    const frames = dotHopKeyframes();
    const running = [...box.children].map((dot, index) => (typeof dot.animate === 'function'
      ? dot.animate(frames, { duration: ms(DOT_HOP.period), delay: ms(DOT_HOP.delay * index), iterations: Infinity })
      : null));
    return () => running.forEach((animation) => animation?.cancel());
  }, [showsDots, reduced]);

  const layout = duoLayout(sizes.inner, ICON_AND_GAP + sizes.callText, ICON_AND_GAP + sizes.fullText);
  const messageText = layout.messageTitle === DUO.fullMessageTitle ? sizes.fullText : sizes.shortText;

  /** La sonnerie (−16°, +14°, −10°, +6°, 0° en 0,4 s, Balancier) et deux ondes de 0,7 s (C1), la seconde 0,25 s après. */
  const ring = () => {
    if (reduced) return;
    const icon = phoneIcon.current;
    if (icon && typeof icon.animate === 'function') {
      icon.animate([0, -16, 14, -10, 6, 0].map((angle) => ({ transform: `rotate(${angle}deg)`, easing: SWING })), { duration: 400 });
    }
    [...(waves.current?.children ?? [])].forEach((wave, index) => {
      if (typeof wave.animate !== 'function') return;
      wave.animate([{ transform: 'scale(0.6)', opacity: 0.55 }, { transform: 'scale(2.1)', opacity: 0 }],
        { duration: 700, delay: index * 250, easing: cssCurve(DUO_CURVES.c1) });
    });
  };

  /** La bulle grossit à 112 % en 0,12 s (Appui), puis revient en 0,38 s (Rebond). */
  const pulse = () => {
    const icon = bubble.current;
    if (reduced || !icon || typeof icon.animate !== 'function') return;
    icon.animate([
      { transform: 'scale(1)', easing: cssCurve(DUO_CURVES.press) },
      { transform: 'scale(1.12)', offset: 0.24, easing: cssCurve(DUO_CURVES.bounce) },
      { transform: 'scale(1)' },
    ], { duration: 500 });
  };

  // Appui : tant que le doigt (ou le bouton de la souris) reste posé ; un défilement l'annule, comme dans l'app.
  const press = (kind: 'call' | 'message') => ({
    onPointerDown: (event: PointerEvent) => { if (event.button === 0) setPressed(kind); },
    onPointerUp: () => setPressed(null),
    onPointerCancel: () => setPressed(null),
    onPointerLeave: () => setPressed(null),
  });

  const callShown = duo.callTextShown && !duo.textFolded;
  const messageShown = duo.messageTextShown && !duo.textFolded;
  const rise = reducedRise ? `${DUO_DURATIONS.reducedRise}s ease-out` : `${DUO_DURATIONS.rise}s ${cssCurve(DUO_CURVES.spring)}`;
  // Avant de monter : 90 px plus bas, à 90 % et invisible (offset, scaleEffect et opacity de l'app), sans toucher.
  const slot = (risen: boolean): Record<string, string> => ({ '--duo-rise': rise, ...(risen ? {} : { transform: 'scale(0.9) translateY(90px)', opacity: '0', '--duo-hit': 'none' }) });
  const capsule = (width: number, widthTime: number, textTime: number) => ({
    width: `${width}px`, '--duo-width-time': `${widthTime}s`, '--duo-text-time': `${textTime}s`,
  }) as Record<string, string>;
  const text = (shown: boolean, width: number, label: ReactNode) => (
    <span className={`duo-text${shown ? ' is-shown' : ''}`} style={{ width: shown ? `${width}px` : '0px' }} aria-hidden="true">
      <span className="duo-text-inner">{label}</span>
    </span>
  );

  const callContent = (
    <>
      <span className="duo-face" aria-hidden="true" />
      <span className="duo-icon" aria-hidden="true">
        <span className="duo-waves" ref={waves}><span className="duo-wave" /><span className="duo-wave" /></span>
        <svg ref={phoneIcon} className="icon duo-phone" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" focusable="false">
          <path d="M13.832 16.568a1 1 0 0 0 1.213-.303l.355-.465A2 2 0 0 1 17 15h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2A18 18 0 0 1 2 4a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v3a2 2 0 0 1-.8 1.6l-.468.351a1 1 0 0 0-.292 1.233 14 14 0 0 0 6.392 6.384" />
        </svg>
      </span>
      {text(callShown, sizes.callText, 'Appeler')}
    </>
  );
  const callClass = `duo-capsule duo-call${pressed === 'call' ? ' is-pressed' : ''}`;
  const callStyle = capsule(duo.callUnfolded && !duo.folded ? layout.callWidth : DUO.height, duo.callWidthTime, duo.callTextTime);

  return (
    <div className="duo-row" ref={row} data-arrived={settled ? 'oui' : undefined}>
      <span className="duo-slot duo-slot-call" style={slot(duo.callRisen)}>
        {callHref ? (
          <a className={callClass} style={callStyle} href={callHref} title={callTitle} aria-label="Appeler" onClick={ring} {...press('call')}>
            {callContent}
          </a>
        ) : (
          <button type="button" className={callClass} style={callStyle} title={callTitle} aria-label="Appeler" onClick={() => { ring(); onCall(); }} {...press('call')}>
            {callContent}
          </button>
        )}
      </span>
      <span className="duo-slot duo-slot-message" style={slot(duo.messageRisen)}>
        <button
          type="button"
          className={`duo-capsule duo-message${pressed === 'message' ? ' is-pressed' : ''}`}
          style={capsule(duo.messageUnfolded && !duo.folded ? layout.messageWidth : DUO.height, duo.messageWidthTime, duo.messageTextTime)}
          aria-label={DUO.fullMessageTitle}
          aria-describedby={hintId}
          onClick={() => { pulse(); onMessage(); }}
          {...press('message')}
        >
          <span className="duo-face" aria-hidden="true" />
          <span className="duo-icon" aria-hidden="true">
            <span className="duo-bubble" ref={bubble}><Icon name="messageCircle" /></span>
            {showsDots && <span className="duo-dots" ref={dots}><i /><i /><i /></span>}
          </span>
          {text(messageShown, messageText, layout.messageTitle)}
          {/* Le reflet passe par-dessus le libellé, sans déborder de la capsule. */}
          <span className="duo-clip" aria-hidden="true"><span className="duo-shine" ref={shine} /></span>
        </button>
      </span>
      <span id={hintId} className="visually-hidden">Ouvre la conversation avec le {isRental ? 'propriétaire' : 'vendeur'}</span>
      {/* Libellés mesurés (Appeler, Envoyer un message, Message), invisibles. */}
      <span className="duo-measure" ref={measures} aria-hidden="true">
        <span>Appeler</span>
        <span>{DUO.fullMessageTitle}</span>
        <span>{DUO.shortMessageTitle}</span>
      </span>
    </div>
  );
}

/**
 * La barre flottante du téléphone et de la tablette : le dégradé des 112 derniers pixels de l'écran, sans toucher, et
 * les capsules, repliées en ronds quand on descend la fiche (12 px dans le même sens), dépliées quand on remonte, en
 * haut ou tout en bas.
 */
export function ContactBar(props: Omit<Parameters<typeof ContactCapsules>[0], 'floating' | 'collapsed' | 'callTitle'>) {
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    let state = CONTACT_BAR_SCROLL;
    const update = () => {
      const offset = window.scrollY;
      const { atTop, atBottom } = scrollEdges(offset, window.innerHeight, document.documentElement.scrollHeight);
      state = nextContactBarScroll(state, offset, atTop, atBottom);
      setCollapsed(state.isCollapsed);
    };
    update();
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, []);
  return (
    <nav className="action-bar duo-bar" aria-label="Contacter">
      <span className="duo-fade" aria-hidden="true" />
      <ContactCapsules {...props} floating collapsed={collapsed} />
    </nav>
  );
}
