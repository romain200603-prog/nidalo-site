// Lancement en boucle de l'écran de connexion, comme l'app (ImmoDomain/Launch/LaunchLoop.swift et LaunchIntro.swift) :
// le logo maison, « NIDΛLO » lettre par lettre et les 4 pavés des catégories, rejoués toutes les 9 s, les catégories
// allumées une par une, puis tout se replie. Une seule horloge : l'état de chaque élément se calcule à partir du temps
// du tour (secondes, 0 → 9). Tout est en points de l'app (1 pt = 1 px ici).

/** Durée d'un tour. */
export const LOOP_PERIOD = 9;

/** Temps dans le tour, à partir du temps écoulé depuis le premier tour (aucun décalage après plusieurs tours). */
export function loopTime(elapsed: number): number {
  if (!(elapsed > 0)) return 0;
  return elapsed % LOOP_PERIOD;
}

// MARK: - Courbes (LaunchIntro.Curve : courbes de Bézier cubiques, comme `.timingCurve`)

export type Curve = { x1: number; y1: number; x2: number; y2: number };

export const C1: Curve = { x1: 0.2, y1: 0.8, x2: 0.2, y2: 1 };
/** Léger dépassement au-delà de 1. */
export const C2: Curve = { x1: 0.34, y1: 1.45, x2: 0.64, y2: 1 };
export const C3: Curve = { x1: 0.5, y1: 0, x2: 0.15, y2: 1 };
/** Sortie (`.easeIn` de SwiftUI). */
export const EASE_IN: Curve = { x1: 0.42, y1: 0, x2: 1, y2: 1 };

function bezier(t: number, p1: number, p2: number): number {
  const u = 1 - t;
  return 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t;
}

function derivative(t: number, p1: number, p2: number): number {
  const u = 1 - t;
  return 3 * u * u * p1 + 6 * u * t * (p2 - p1) + 3 * t * t * (1 - p2);
}

/** Valeur de la courbe pour un temps relatif `x` (0 → 1) : t tel que bezierX(t) = x (Newton puis dichotomie), puis bezierY(t). */
export function curveValue(curve: Curve, x: number): number {
  if (!(x > 0)) return 0;
  if (x >= 1) return 1;
  const { x1, y1, x2, y2 } = curve;
  let t = x;
  for (let i = 0; i < 8; i += 1) {
    const error = bezier(t, x1, x2) - x;
    const slope = derivative(t, x1, x2);
    if (Math.abs(error) < 1e-6) return bezier(t, y1, y2);
    if (Math.abs(slope) < 1e-6) break;
    t -= error / slope;
  }
  let low = 0;
  let high = 1;
  t = x;
  for (let i = 0; i < 40; i += 1) {
    const value = bezier(t, x1, x2);
    if (Math.abs(value - x) < 1e-7) break;
    if (value < x) low = t;
    else high = t;
    t = (low + high) / 2;
  }
  return bezier(t, y1, y2);
}

/** Avancement (0 → 1) d'un mouvement qui démarre à `start` et dure `duration`, selon `curve`. */
export function progress(time: number, start: number, duration: number, curve: Curve): number {
  if (!(duration > 0)) return time >= start ? 1 : 0;
  const x = Math.min(Math.max((time - start) / duration, 0), 1);
  return curveValue(curve, x);
}

// MARK: - Mesures (LaunchIntro et LaunchLoop)

/** Étape 1 du lancement : « NIDΛLO » lettre par lettre ; étape 2 : les 4 pavés. */
const LETTERS = { start: 0.09, step: 0.04, duration: 0.34 };
const TILES = { start: 0.33, step: 0.055 };

/** Du haut de la ligne logo + nom jusqu'au bas des noms de catégories. */
export const GROUP_HEIGHT = 144;
/** Milieu de la ligne logo + nom, depuis le haut du groupe (le logo de la ligne fait 46 de haut). */
export const LINE_CENTER_FROM_TOP = 23;
/** Logo seul (84 × 70), son centre sous le milieu de la ligne. */
export const LOGO_ALONE_BELOW_LINE = 34;
/** Centre des pavés sous le milieu de la ligne, et leur écart de centre à centre. */
export const TILES_BELOW_LINE = 34 + 42;
export const TILE_SPACING = 50;
/** Pavé : de 12 à 36 (60 % des pavés de l'accueil, de 60). */
export const TILE_START_SIDE = 12;
export const TILE_SIDE = 36;
export const HOME_TILE_SIDE = 60;
/** Nom de la catégorie allumée : son haut 9 sous le pavé ; son centre 8 plus bas (texte de 16 de haut). */
export const NAME_BELOW_TILE = 9;
/** Ligne : 1,7 fois la barre du haut de l'accueil (logo 32 × 27, 10 d'écart, nom en 19 très gras). */
export const LINE_SCALE = 1.7;
export const HEADER_LOGO = { width: 32, height: 27 };
export const HEADER_GAP = 10;
export const LOGO_ALONE = { width: 84, height: 70 };
/** Glissement des lettres. */
export const LETTER_SLIDE = 17;
/**
 * « NIDΛLO » du site (public/assets/wordmark-accueil.svg, boîte de 9774 × 1500) : 13,85 de haut pour le nom en 19 très
 * gras de la barre du haut de l'accueil (styles/accueil-app.css), donc 90,25 de large.
 */
export const WORDMARK_BOX = { x: 140, y: -1470, width: 9774, height: 1500 };
export const WORDMARK_HEIGHT = 13.85;
export const WORDMARK_WIDTH = (WORDMARK_HEIGHT * WORDMARK_BOX.width) / WORDMARK_BOX.height;

/** Zone trop basse (moins de 176) : le groupe rétrécit pour garder 16 en haut et en bas. */
export function loopScale(zoneHeight: number): number {
  const minimum = GROUP_HEIGHT + 2 * 16;
  if (zoneHeight >= minimum) return 1;
  return Math.max(0, (zoneHeight - 2 * 16) / GROUP_HEIGHT);
}

// MARK: - Temps

/** Le lancement « Tout en clair » rejoué 0,5 s plus tard (le logo apparaît d'abord en fondu). */
export const LOOP_DELAY = 0.5;
/** Allumage des catégories (Résidentiel, Location, Investir, Hôtels) ; Hôtels s'éteint à 6,80. */
export const LIT_TIMES = [1.45, 2.85, 4.25, 5.65];
export const LAST_OFF_TIME = 6.8;

/** Extinction de la catégorie n° `index` : quand la suivante s'allume. */
export function offTime(index: number): number {
  return index + 1 < LIT_TIMES.length ? LIT_TIMES[index + 1] : LAST_OFF_TIME;
}

// MARK: - États

/** Logo : `toLine` 0 = seul au centre (84 × 70), 1 = à gauche du nom (54 × 46). */
export type LogoState = { opacity: number; scale: number; toLine: number };
export type LetterState = { opacity: number; offsetX: number };
export type TileState = {
  opacity: number;
  /** Côté du pavé (12 → 36). */
  side: number;
  /** 0 = état normal, 1 = pleine couleur (pictogramme blanc, ombre). */
  lit: number;
  /** Agrandissement de la catégorie allumée (1 → 1,1). */
  litScale: number;
  nameOpacity: number;
  /** Décalage vertical du nom (positif : plus bas). */
  nameOffsetY: number;
};

/** « Réduire les animations » : logo + nom et 4 pavés, immobiles, sans noms. */
export const STATIC_LOGO: LogoState = { opacity: 1, scale: 1, toLine: 1 };
export const STATIC_LETTER: LetterState = { opacity: 1, offsetX: 0 };
export const STATIC_TILE: TileState = { opacity: 1, side: TILE_SIDE, lit: 0, litScale: 1, nameOpacity: 0, nameOffsetY: 0 };

export function logoAt(t: number): LogoState {
  const appear = progress(t, 0, 0.38, C2);
  const toLine = progress(t, 0.5, 0.55, C1);
  const back = progress(t, 7.8, 0.5, C3);
  const exit = progress(t, 8.3, 0.35, EASE_IN);
  return {
    opacity: Math.min(Math.max(appear, 0), 1) * (1 - exit),
    scale: (0.77 + 0.23 * appear) * (1 - 0.13 * exit),
    toLine: toLine * (1 - back),
  };
}

/** Lettre n° `index` de « NIDΛLO » (6 lettres). */
export function letterAt(index: number, t: number): LetterState {
  const appear = progress(t, LETTERS.start + LOOP_DELAY + index * LETTERS.step, LETTERS.duration, C1);
  const leave = progress(t, 7.6 + (5 - index) * 0.035, 0.22, EASE_IN);
  return { opacity: appear * (1 - leave), offsetX: -LETTER_SLIDE * (1 - appear) - LETTER_SLIDE * leave };
}

/** Pavé n° `index` (Résidentiel, Location, Investir, Hôtels). */
export function tileAt(index: number, t: number): TileState {
  const pop = progress(t, TILES.start + LOOP_DELAY + index * TILES.step, 0.38, C2);
  const fold = progress(t, 7.38 + (3 - index) * 0.045, 0.28, EASE_IN);
  const on = LIT_TIMES[index];
  const off = offTime(index);
  const color = progress(t, on, 0.32, C1);
  const grow = progress(t, on, 0.38, C2);
  const back = progress(t, off, 0.3, C1);
  const nameIn = progress(t, on + 0.06, 0.32, C1);
  const nameOut = progress(t, off, 0.22, EASE_IN);
  const grown = TILE_START_SIDE + (TILE_SIDE - TILE_START_SIDE) * pop;
  return {
    opacity: Math.min(Math.max(pop, 0), 1) * (1 - fold),
    side: grown + (TILE_START_SIDE - grown) * fold,
    lit: color * (1 - back),
    litScale: 1 + 0.1 * grow * (1 - back),
    nameOpacity: nameIn * (1 - nameOut),
    nameOffsetY: 6 * (1 - nameIn) - 4 * nameOut,
  };
}

// MARK: - Placement dans le groupe (largeur de la zone, 144 de haut), comme AuthLaunchLoop.swift

export type Point = { x: number; y: number };

export type LoopLayout = {
  /** Logo seul (84 × 70) et logo de la ligne (54,4 × 45,9) : centres. */
  alone: Point;
  inLine: Point;
  lineLogo: { width: number; height: number };
  /** Nom de la ligne (agrandi 1,7 fois) : centre et taille. */
  word: Point;
  wordSize: { width: number; height: number };
  /** Centres des 4 pavés, et centre vertical des noms. */
  tiles: Point[];
  nameY: number;
};

export function loopLayout(width: number): LoopLayout {
  const k = LINE_SCALE;
  const centerX = width / 2;
  const lineY = LINE_CENTER_FROM_TOP;
  const lineLogo = { width: HEADER_LOGO.width * k, height: HEADER_LOGO.height * k };
  const wordSize = { width: WORDMARK_WIDTH * k, height: WORDMARK_HEIGHT * k };
  const lineWidth = lineLogo.width + HEADER_GAP * k + wordSize.width;
  const left = centerX - lineWidth / 2;
  const tileY = lineY + TILES_BELOW_LINE;
  return {
    alone: { x: centerX, y: lineY + LOGO_ALONE_BELOW_LINE },
    inLine: { x: left + lineLogo.width / 2, y: lineY },
    lineLogo,
    word: { x: left + lineLogo.width + HEADER_GAP * k + wordSize.width / 2, y: lineY },
    wordSize,
    tiles: [0, 1, 2, 3].map((index) => ({ x: centerX + (index - 1.5) * TILE_SPACING, y: tileY })),
    nameY: tileY + TILE_SIDE / 2 + NAME_BELOW_TILE + 8,
  };
}

/** Position et taille du logo pour un état : entre le logo seul et celui de la ligne. */
export function logoFrame(layout: LoopLayout, logo: LogoState): { center: Point; width: number; height: number } {
  const t = logo.toLine;
  return {
    center: { x: layout.alone.x + (layout.inLine.x - layout.alone.x) * t, y: layout.alone.y + (layout.inLine.y - layout.alone.y) * t },
    width: LOGO_ALONE.width + (layout.lineLogo.width - LOGO_ALONE.width) * t,
    height: LOGO_ALONE.height + (layout.lineLogo.height - LOGO_ALONE.height) * t,
  };
}
