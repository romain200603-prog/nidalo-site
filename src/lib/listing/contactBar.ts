// Barre de contact « Duo » de la fiche d'une annonce (ListingContactBar.swift et ImmoDomain/Listing/ContactBarScroll.swift
// de l'app), la partie qui ne dépend pas du navigateur : le repli au défilement, la largeur des deux capsules, le titre
// court « Message » et les courbes de Romain (19 novembre 2026). 1 pt de l'app = 1 px ici.

// MARK: - Repli au défilement (ContactBarScroll)

/** Il faut 12 px dans le même sens pour changer d'état (ContactBarScroll.threshold). */
export const CONTACT_BAR_SCROLL_THRESHOLD = 12;

/** Barre repliée en ronds, et la position où le mouvement en cours a commencé (ou le point extrême du sens courant). */
export type ContactBarScroll = { isCollapsed: boolean; anchor: number | null };

export const CONTACT_BAR_SCROLL: ContactBarScroll = { isCollapsed: false, anchor: null };

/**
 * Nouvelle position du défilement (`offset` : 0 en haut de la fiche), comme `ContactBarScroll.update` : en haut ou tout
 * en bas, dépliée ; repliée, on suit la descente et une remontée de plus de 12 px la déplie ; dépliée, on suit la
 * remontée et une descente de plus de 12 px la replie.
 */
export function nextContactBarScroll(state: ContactBarScroll, offset: number, atTop: boolean, atBottom: boolean): ContactBarScroll {
  if (atTop || atBottom) return { isCollapsed: false, anchor: offset };
  const start = state.anchor;
  if (start === null) return { ...state, anchor: offset };
  if (state.isCollapsed) {
    if (offset > start) return { isCollapsed: true, anchor: offset };
    return start - offset > CONTACT_BAR_SCROLL_THRESHOLD ? { isCollapsed: false, anchor: offset } : state;
  }
  if (offset < start) return { isCollapsed: false, anchor: offset };
  return offset - start > CONTACT_BAR_SCROLL_THRESHOLD ? { isCollapsed: true, anchor: offset } : state;
}

/** Haut et bas de la page, comme la fiche de l'app (visibleRect.minY ≤ 1, visibleRect.maxY ≥ hauteur du contenu − 1). */
export function scrollEdges(offset: number, viewportHeight: number, contentHeight: number): { atTop: boolean; atBottom: boolean } {
  return { atTop: offset <= 1, atBottom: offset + viewportHeight >= contentHeight - 1 };
}

// MARK: - Mesures (ListingContactBar.body)

export const DUO = {
  /** Hauteur des capsules, et diamètre des ronds. */
  height: 56,
  /** Largeur d'« Appeler ». */
  callWidth: 118,
  gap: 10,
  /** Marge de chaque côté de l'écran. */
  side: 20,
  /** 14 px de marge de chaque côté du libellé. */
  labelMargins: 28,
  fullMessageTitle: 'Envoyer un message',
  shortMessageTitle: 'Message',
} as const;

export type DuoLayout = { callWidth: number; messageWidth: number; messageTitle: string };

/**
 * Largeurs dépliées des capsules dans `inner` px (la barre sans ses marges) : « Appeler » fait 118 px, plus seulement si
 * son libellé n'y tient pas ; « Envoyer un message » prend le reste, et devient « Message » si le libellé complet
 * (pictogramme compris) n'y tient pas avec 14 px de chaque côté.
 */
export function duoLayout(inner: number, callLabelWidth: number, fullMessageLabelWidth: number): DuoLayout {
  const callWidth = Math.max(DUO.callWidth, callLabelWidth + DUO.labelMargins);
  const messageWidth = Math.max(DUO.height, Math.max(0, inner) - callWidth - DUO.gap);
  const messageTitle = fullMessageLabelWidth + DUO.labelMargins <= messageWidth ? DUO.fullMessageTitle : DUO.shortMessageTitle;
  return { callWidth, messageWidth, messageTitle };
}

// MARK: - Courbes (DuoCurve)

type Bezier = readonly [number, number, number, number];

/** Ressort, Rebond, Morph, Appui, C1, Balancier (les .timingCurve de Romain). */
export const DUO_CURVES = {
  spring: [0.22, 1.28, 0.36, 1],
  bounce: [0.34, 1.56, 0.64, 1],
  morph: [0.32, 0.72, 0, 1],
  press: [0.2, 0, 0, 1],
  c1: [0.2, 0.8, 0.2, 1],
  swing: [0.45, 0, 0.55, 1],
} as const satisfies Record<string, Bezier>;

export const cssCurve = (curve: Bezier) => `cubic-bezier(${curve.join(', ')})`;

/** Valeur d'une courbe de Bézier à l'instant `t` (de 0 à 1), comme une courbe CSS (UnitCurve.value(at:)). */
export function curveValue([x1, y1, x2, y2]: Bezier, t: number): number {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  const at = (a: number, b: number, s: number) => 3 * a * s * (1 - s) ** 2 + 3 * b * s ** 2 * (1 - s) + s ** 3;
  // Paramètre s dont l'abscisse vaut t : par dichotomie (la courbe est croissante en x pour 0 ≤ x1, x2 ≤ 1).
  let low = 0;
  let high = 1;
  for (let i = 0; i < 40; i += 1) {
    const mid = (low + high) / 2;
    if (at(x1, x2, mid) < t) low = mid;
    else high = mid;
  }
  return at(y1, y2, (low + high) / 2);
}

// MARK: - Points d'attente (DuoDots)

/** Un saut dure 0,36 s, puis une pause de 0,24 s ; les trois points sont décalés de 0,12 s. */
export const DOT_HOP = { period: 0.6, hop: 0.36, height: 2.2, delay: 0.12 } as const;

/** Hauteur d'un point à `time` s (négative : vers le haut), comme DuoDots.hop : un saut en Balancier, puis la pause. */
export function dotHop(time: number): number {
  if (time <= 0) return 0;
  const progress = (time % DOT_HOP.period) / DOT_HOP.hop;
  if (progress >= 1) return 0;
  const height = -DOT_HOP.height * Math.sin(Math.PI * curveValue(DUO_CURVES.swing, progress));
  return height === 0 ? 0 : height;
}

/** Images clés d'un cycle de 0,6 s (`samples` points pendant le saut), pour l'animation du navigateur. */
export function dotHopKeyframes(samples = 18): { offset: number; transform: string }[] {
  const frames: { offset: number; transform: string }[] = [];
  for (let i = 0; i <= samples; i += 1) {
    const time = (DOT_HOP.hop * i) / samples;
    frames.push({ offset: Math.round((time / DOT_HOP.period) * 10_000) / 10_000, transform: `translateY(${i === samples ? 0 : round(dotHop(time))}px)` });
  }
  frames.push({ offset: 1, transform: 'translateY(0px)' });
  return frames;
}

const round = (value: number) => Math.round(value * 1000) / 1000 || 0;

// MARK: - Arrivée (ListingContactBar.arrive)

/**
 * Étapes de l'arrivée, en secondes depuis l'apparition de la barre (temps 0 de Romain : 0,35 s après) : les ronds
 * montent (Ressort 0,52 s), se déplient (Morph 0,38 s) et leur texte paraît (Morph 0,34 s), puis le reflet passe
 * (Balancier 0,75 s).
 */
export const DUO_ARRIVAL = {
  callRisen: 0.35,
  messageRisen: 0.42,
  callUnfolded: 0.87,
  callTextShown: 0.91,
  messageUnfolded: 0.94,
  messageTextShown: 0.98,
  shine: 1.65,
  shineEnd: 2.4,
} as const;

/** Durées (s) : montée, dépli de l'arrivée, texte de l'arrivée, repli (largeur, texte), dépli au défilement, reflet. */
export const DUO_DURATIONS = {
  rise: 0.52,
  reducedRise: 0.3,
  unfold: 0.38,
  text: 0.34,
  fold: 0.35,
  foldText: 0.28,
  refold: 0.4,
  shine: 0.75,
  /** Points dans la bulle après 0,15 s d'attente réelle. */
  dotsDelay: 0.15,
} as const;
