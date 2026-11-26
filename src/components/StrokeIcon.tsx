// Icônes au trait redessinées de l'app (DesignSystem/Components/Icons.swift, StrokeIcon) : le tracé est décrit en points
// dans sa boîte d'encre d'origine, puis mis à l'échelle pour que l'encre (trait compris) mesure `inkWidth` de large.
// Pour l'instant la maison (toit qui déborde des murs, porte carrée), l'icône Accueil de la barre d'onglets.

type Glyph = 'house';

const DESIGN_SIZE: Record<Glyph, { width: number; height: number }> = {
  house: { width: 14.2, height: 13 },
};

/** Tracé au centre du trait, en points de la boîte d'origine : lignes brisées et rectangles. */
const SEGMENTS: Record<Glyph, { lines: [number, number][][]; rects: [number, number, number, number][] }> = {
  house: {
    lines: [
      [[0, 6.2], [7.1, 0], [14.2, 6.2]],
      [[1.9, 4.54], [1.9, 13], [12.3, 13], [12.3, 4.54]],
    ],
    rects: [[4.7, 8.4, 4.8, 4.6]],
  },
};

const round = (value: number) => Math.round(value * 1000) / 1000;

export function StrokeIcon({ glyph, inkWidth, lineWidth = 1.33, className = 'icon' }: {
  glyph: Glyph;
  inkWidth: number;
  lineWidth?: number;
  className?: string;
}) {
  const size = DESIGN_SIZE[glyph];
  const inkHeight = (inkWidth * size.height) / size.width;
  // Le trait déborde de moitié autour du tracé : le tracé est réduit pour que l'encre fasse inkWidth.
  const sx = (inkWidth - lineWidth) / size.width;
  const sy = (inkHeight - lineWidth) / size.height;
  const x = (value: number) => round(lineWidth / 2 + value * sx);
  const y = (value: number) => round(lineWidth / 2 + value * sy);
  const { lines, rects } = SEGMENTS[glyph];
  const d = [
    ...lines.map((points) => points.map(([px, py], index) => `${index ? 'L' : 'M'}${x(px)} ${y(py)}`).join(' ')),
    ...rects.map(([rx, ry, w, h]) => `M${x(rx)} ${y(ry)} L${x(rx + w)} ${y(ry)} L${x(rx + w)} ${y(ry + h)} L${x(rx)} ${y(ry + h)} Z`),
  ].join(' ');
  return (
    <svg className={className} width={round(inkWidth)} height={round(inkHeight)} viewBox={`0 0 ${round(inkWidth)} ${round(inkHeight)}`}
      fill="none" stroke="currentColor" strokeWidth={lineWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d={d} />
    </svg>
  );
}
