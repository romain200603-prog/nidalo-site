import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Icon } from '../Icon';
import { SEARCH_MODES } from '../../lib/labels';
import {
  HOME_TILE_SIDE, letterAt, LINE_SCALE, logoAt, logoFrame, LOGO_ALONE, loopLayout, loopScale, loopTime, STATIC_LETTER, STATIC_LOGO,
  STATIC_TILE, tileAt, WORDMARK_BOX, WORDMARK_HEIGHT, WORDMARK_WIDTH,
} from '../../lib/launchLoop';
import '../../styles/pieces-app.css';

// Lancement en boucle en haut de l'écran de connexion, comme l'app (AuthLaunchLoop.swift) : le logo maison, « NIDΛLO »
// lettre par lettre et les 4 pavés de l'accueil, rejoués toutes les 9 s. Une seule horloge (requestAnimationFrame) :
// chaque image se calcule à partir du temps du tour (lib/launchLoop). Décoratif : caché aux lecteurs d'écran, sans
// clic. « Réduire les animations » : l'image immobile du logo, du nom et des 4 pavés.

/** Les 6 lettres de « NIDΛLO » du site (public/assets/wordmark-accueil.svg), chacune à sa place dans le nom. */
const LETTERS = [
  'M140 0V-1440H416L1042 -480V-1440H1318V0H1042L416 -960V0Z',
  'M2138 0V-1440H2410V0Z',
  'M3230 0V-1440H3696Q3713 -1440 3766 -1439Q3819 -1438 3868 -1432Q4042 -1411 4163 -1311Q4284 -1211 4347 -1057Q4410 -903 4410 -720Q4410 -537 4347 -383Q4284 -229 4163 -129Q4042 -29 3868 -8Q3819 -2 3766 -1Q3713 0 3696 0ZM3506 -256H3696Q3723 -256 3769 -257.5Q3815 -259 3852 -266Q3946 -285 4005.5 -354Q4065 -423 4093.5 -520Q4122 -617 4122 -720Q4122 -828 4092.5 -925Q4063 -1022 4003 -1089Q3943 -1156 3852 -1174Q3815 -1182 3769 -1183Q3723 -1184 3696 -1184H3506Z',
  'M5480 -1440H5886L6326 0H6046L5680 -1184L5320 0H5040Z',
  'M7016 0V-1440H7288V-254H7908V0Z',
  'M9216 30Q9000 30 8843.5 -64Q8687 -158 8602.5 -327Q8518 -496 8518 -720Q8518 -944 8602.5 -1113Q8687 -1282 8843.5 -1376Q9000 -1470 9216 -1470Q9432 -1470 9588.5 -1376Q9745 -1282 9829.5 -1113Q9914 -944 9914 -720Q9914 -496 9829.5 -327Q9745 -158 9588.5 -64Q9432 30 9216 30ZM9216 -226Q9353 -224 9444 -285Q9535 -346 9580.5 -458Q9626 -570 9626 -720Q9626 -870 9580.5 -980Q9535 -1090 9444 -1151Q9353 -1212 9216 -1214Q9079 -1216 8988 -1155Q8897 -1094 8851.5 -982Q8806 -870 8806 -720Q8806 -570 8851.5 -460Q8897 -350 8988 -289Q9079 -228 9216 -226Z',
];

const LETTER_BOX = `${WORDMARK_BOX.x} ${WORDMARK_BOX.y} ${WORDMARK_BOX.width} ${WORDMARK_BOX.height}`;
const WORD_WIDTH = WORDMARK_WIDTH * LINE_SCALE;
const WORD_HEIGHT = WORDMARK_HEIGHT * LINE_SCALE;
const REDUCED_MOTION = '(prefers-reduced-motion: reduce)';

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => typeof window.matchMedia === 'function' && window.matchMedia(REDUCED_MOTION).matches);
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const query = window.matchMedia(REDUCED_MOTION);
    const update = () => setReduced(query.matches);
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  return reduced;
}

/** L'onglet est à l'écran (l'app : `scenePhase == .active`). */
function usePageVisible(): boolean {
  const [visible, setVisible] = useState(() => document.visibilityState !== 'hidden');
  useEffect(() => {
    const update = () => setVisible(document.visibilityState !== 'hidden');
    document.addEventListener('visibilitychange', update);
    return () => document.removeEventListener('visibilitychange', update);
  }, []);
  return visible;
}

/**
 * La zone du lancement (entre la croix et le titre de l'accueil). `running` : l'écran est ouvert et l'accueil affiché ;
 * la boucle repart du début à chaque reprise (retour sur l'accueil, onglet de nouveau à l'écran).
 */
export function AuthLaunchLoop({ running }: { running: boolean }) {
  const zone = useRef<HTMLDivElement>(null);
  const group = useRef<HTMLDivElement>(null);
  const logo = useRef<HTMLImageElement>(null);
  const letters = useRef<(SVGSVGElement | null)[]>([]);
  const tiles = useRef<(HTMLSpanElement | null)[]>([]);
  const lits = useRef<(HTMLSpanElement | null)[]>([]);
  const names = useRef<(HTMLSpanElement | null)[]>([]);
  const width = useRef(0);
  /** Temps de la dernière image (`null` : immobile), redessinée si la zone change de taille. */
  const shown = useRef<number | null>(0);
  const reduced = useReducedMotion();
  const visible = usePageVisible();

  const draw = useCallback((time: number | null) => {
    shown.current = time;
    const layout = loopLayout(width.current);
    const logoState = time === null ? STATIC_LOGO : logoAt(time);
    const frame = logoFrame(layout, logoState);
    if (logo.current) {
      const scaleX = (frame.width * logoState.scale) / LOGO_ALONE.width;
      const scaleY = (frame.height * logoState.scale) / LOGO_ALONE.height;
      logo.current.style.transform = `translate(${frame.center.x - LOGO_ALONE.width / 2}px, ${frame.center.y - LOGO_ALONE.height / 2}px) scale(${scaleX}, ${scaleY})`;
      logo.current.style.opacity = String(logoState.opacity);
    }
    const wordLeft = layout.word.x - WORD_WIDTH / 2;
    const wordTop = layout.word.y - WORD_HEIGHT / 2;
    letters.current.forEach((letter, index) => {
      if (!letter) return;
      const state = time === null ? STATIC_LETTER : letterAt(index, time);
      letter.style.transform = `translate(${wordLeft + state.offsetX}px, ${wordTop}px)`;
      letter.style.opacity = String(state.opacity);
    });
    layout.tiles.forEach((center, index) => {
      const state = time === null ? STATIC_TILE : tileAt(index, time);
      const tile = tiles.current[index];
      if (tile) {
        const scale = (Math.max(state.side, 0.01) / HOME_TILE_SIDE) * state.litScale;
        tile.style.transform = `translate(${center.x - HOME_TILE_SIDE / 2}px, ${center.y - HOME_TILE_SIDE / 2}px) scale(${scale})`;
        tile.style.opacity = String(state.opacity);
      }
      const lit = lits.current[index];
      if (lit) lit.style.opacity = String(state.lit);
      const name = names.current[index];
      if (name) {
        name.style.transform = `translate(${center.x}px, ${layout.nameY + state.nameOffsetY}px) translate(-50%, -50%)`;
        name.style.opacity = String(state.nameOpacity);
      }
    });
  }, []);

  // Largeur de la zone (placement) et hauteur (zone trop basse : le groupe rétrécit).
  useLayoutEffect(() => {
    const element = zone.current;
    if (!element) return;
    const measure = () => {
      const box = element.getBoundingClientRect();
      width.current = box.width;
      if (group.current) group.current.style.transform = `scale(${loopScale(box.height)})`;
      draw(shown.current);
    };
    measure();
    if (typeof ResizeObserver !== 'function') return;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [draw]);

  // Une seule horloge : le tour repart de 0 à chaque départ ; à l'arrêt, rien n'est affiché (comme l'app).
  useEffect(() => {
    if (reduced) {
      draw(null);
      return;
    }
    if (!running || !visible) {
      draw(0);
      return;
    }
    let start: number | null = null;
    let frame = window.requestAnimationFrame(function tick(now) {
      if (start === null) start = now;
      draw(loopTime((now - start) / 1000));
      frame = window.requestAnimationFrame(tick);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [running, visible, reduced, draw]);

  return (
    <div ref={zone} className="auth-loop-zone" aria-hidden="true">
      <div ref={group} className="auth-loop">
        <img ref={logo} className="auth-loop-logo" src="/assets/logo-maison.svg" width={LOGO_ALONE.width} height={LOGO_ALONE.height} alt="" />
        {LETTERS.map((path, index) => (
          <svg
            key={path}
            ref={(element) => { letters.current[index] = element; }}
            className="auth-loop-letter"
            viewBox={LETTER_BOX}
            width={WORD_WIDTH}
            height={WORD_HEIGHT}
            focusable="false"
          >
            <path d={path} />
          </svg>
        ))}
        {SEARCH_MODES.map(({ mode, label, icon }, index) => (
          <span key={mode} className={`mode-tab mode-tab-${mode}`}>
            <span ref={(element) => { tiles.current[index] = element; }} className="auth-loop-tile">
              <span className="mode-tile"><Icon name={icon} /></span>
              <span ref={(element) => { lits.current[index] = element; }} className={`auth-loop-lit mode-tab mode-tab-${mode} is-open`}>
                <span className="mode-tile"><Icon name={icon} /></span>
              </span>
            </span>
            <span ref={(element) => { names.current[index] = element; }} className="auth-loop-name">{label}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
