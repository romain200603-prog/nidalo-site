import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Icon } from '../../components/Icon';
import { gifAddress, gifRatio, isVideoAddress, voiceBars, type Attachment } from '../../lib/messages/content';
import { knownSignedUrl, signedUrl } from '../../lib/messages/files';
import { durationLabel } from '../../lib/messages/format';

// Messages vocaux et GIF envoyés depuis l'app (AttachmentBubble de l'app) : le site les lit, il n'en envoie pas.

/** Nombre de barres d'une bulle vocale (environ 250 px de large, comme l'app). */
const VOICE_BARS = 28;

/** Un seul vocal joue à la fois sur la page. */
let playing: HTMLAudioElement | null = null;

type VoiceState = 'idle' | 'loading' | 'playing' | 'paused' | 'error';

/** Bulle vocale : lecture/pause, barres avec la partie écoutée, durée. Le lien signé est demandé dès l'affichage, comme
 * pour les documents ; le fichier, lui, ne se charge qu'au premier appui, et la lecture part pendant l'appui même
 * (Safari refuse un son lancé plus tard). */
export function VoiceBubble({ item, outgoing }: { item: Attachment; outgoing: boolean }) {
  const audio = useRef<HTMLAudioElement | null>(null);
  const [state, setState] = useState<VoiceState>('idle');
  const [elapsed, setElapsed] = useState(0);
  const [length, setLength] = useState(item.durationSeconds ?? 0);
  const bars = useMemo(() => voiceBars(item.waveform, VOICE_BARS), [item.waveform]);

  useEffect(() => {
    if (item.storagePath) void signedUrl(item.storagePath);
  }, [item.storagePath]);

  // Quitter la conversation arrête la lecture.
  useEffect(() => () => {
    const player = audio.current;
    if (!player) return;
    player.pause();
    if (playing === player) playing = null;
  }, []);

  const start = (player: HTMLAudioElement) => {
    if (playing && playing !== player) playing.pause();
    playing = player;
    player.play().catch(() => setState('error'));
  };

  const toggle = async () => {
    const current = audio.current;
    if (current && state === 'playing') {
      current.pause();
      return;
    }
    if (current && state === 'paused') {
      start(current);
      return;
    }
    if (!item.storagePath) {
      setState('error');
      return;
    }
    const known = knownSignedUrl(item.storagePath);
    if (known) {
      begin(known);
      return;
    }
    setState('loading');
    const url = await signedUrl(item.storagePath);
    if (url) begin(url);
    else setState('error');
  };

  const begin = (url: string) => {
    setState('loading');
    const player = new Audio();
    player.preload = 'auto';
    player.addEventListener('playing', () => setState('playing'));
    player.addEventListener('pause', () => {
      if (!player.ended) setState('paused');
    });
    player.addEventListener('ended', () => {
      if (playing === player) playing = null;
      setElapsed(0);
      setState('idle');
    });
    player.addEventListener('timeupdate', () => setElapsed(player.currentTime));
    player.addEventListener('loadedmetadata', () => {
      if (!item.durationSeconds && Number.isFinite(player.duration)) setLength(player.duration);
    });
    player.addEventListener('error', () => {
      // Lien signé expiré ou fichier illisible : le prochain appui recharge le fichier.
      if (audio.current === player) audio.current = null;
      if (playing === player) playing = null;
      setState('error');
    });
    player.src = url;
    audio.current?.pause();
    audio.current = player;
    start(player);
  };

  const listening = state === 'playing' || state === 'paused';
  const progress = listening && length > 0 ? Math.min(1, elapsed / length) : 0;
  return (
    <div className={`dm-voice${outgoing ? ' is-out' : ''}`} role="group" aria-label={`Message vocal, ${durationLabel(length)}`}>
      <button
        type="button"
        className="dm-voice-play"
        onClick={() => void toggle()}
        disabled={state === 'loading'}
        aria-label={state === 'playing' ? 'Mettre en pause' : 'Écouter le message vocal'}
      >
        {state === 'loading' ? <span className="dm-voice-spinner" aria-hidden="true" /> : <Icon name={state === 'playing' ? 'pause' : 'play'} />}
      </button>
      <span className="dm-voice-bars" aria-hidden="true">
        {bars.map((level, index) => (
          <span key={index} className={(index + 0.5) / bars.length <= progress ? 'is-played' : undefined} style={{ height: `${Math.round(4 + level * 20)}px` }} />
        ))}
      </span>
      <span className="dm-voice-time">{durationLabel(listening ? elapsed : length)}</span>
      {state === 'error' && <span className="dm-voice-error" role="alert">Lecture impossible. Réessayez.</span>}
    </div>
  );
}

const REDUCED_MOTION = '(prefers-reduced-motion: reduce)';

/** Lecture sans son, dès l'affichage (les navigateurs refusent la lecture automatique avec le son). */
function startMuted(video: HTMLVideoElement | null) {
  if (!video) return;
  video.muted = true;
  video.play().catch(() => undefined);
}

/** Bulle GIF : joue seule, sans son, en boucle, à ses proportions, seulement quand elle est visible ; image fixe et
 * lecture à l'appui avec « Réduire les animations » ; case grise pendant le chargement ; « GIF indisponible » en erreur. */
export function GifBubble({ item, status }: { item: Attachment; status: ReactNode }) {
  const address = gifAddress(item.remoteURL);
  const still = gifAddress(item.previewURL);
  const box = useRef<HTMLDivElement | null>(null);
  const [visible, setVisible] = useState(false);
  const [reduced] = useState(() => typeof window.matchMedia === 'function' && window.matchMedia(REDUCED_MOTION).matches);
  const [started, setStarted] = useState(false);
  const [failed, setFailed] = useState(address === null);
  const [stillFailed, setStillFailed] = useState(false);

  useEffect(() => {
    const element = box.current;
    if (!element) return;
    if (typeof IntersectionObserver === 'undefined') {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { rootMargin: '120px 0px' });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const animate = !failed && address !== null && visible && (!reduced || started);
  const label = item.fileName || 'GIF';
  let picture: ReactNode = null;
  if (failed) picture = <span className="dm-gif-error">GIF indisponible</span>;
  else if (animate && isVideoAddress(address)) {
    picture = <video ref={startMuted} src={address} autoPlay loop muted playsInline disablePictureInPicture aria-label={label} onError={() => setFailed(true)} />;
  } else if (animate) picture = <img src={address} alt={label} onError={() => setFailed(true)} />;
  else if (still && !stillFailed && visible) picture = <img src={still} alt={label} onError={() => setStillFailed(true)} />;

  return (
    <div ref={box} className="dm-gif" style={{ aspectRatio: String(gifRatio(item)) }}>
      {picture}
      {reduced && !failed && (
        <button type="button" className="dm-gif-play" onClick={() => setStarted((value) => !value)} aria-label={started ? 'Arrêter le GIF' : 'Lire le GIF'}>
          {!started && <Icon name="play" />}
        </button>
      )}
      {status}
    </div>
  );
}
