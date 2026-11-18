import { useLayoutEffect, useRef, type ReactNode } from 'react';
import '../styles/pieces-app.css';

/**
 * Grand titre de page de l'app (NidaloLargeHeader) : titre de 30 px très gras sur une ligne, sous-titre gris
 * facultatif, élément à droite (bouton rond). Comme `minimumScaleFactor(0.75)`, un titre trop long rapetisse
 * jusqu'aux trois quarts de sa taille au lieu d'être coupé.
 */
export function LargeHeader({ title, subtitle, trailing, className }: {
  title: string;
  subtitle?: string;
  trailing?: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLHeadingElement>(null);
  useLayoutEffect(() => {
    const heading = ref.current;
    if (!heading) return undefined;
    const fit = () => {
      heading.style.fontSize = '';
      const full = parseFloat(getComputedStyle(heading).fontSize) || 30;
      let size = full;
      while (heading.scrollWidth > heading.clientWidth + 0.5 && size > full * 0.75) {
        size = Math.max(full * 0.75, size - 0.5);
        heading.style.fontSize = `${size}px`;
      }
    };
    fit();
    // Seule la largeur compte : changer la taille du titre change sa hauteur, pas sa largeur.
    let width = heading.clientWidth;
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => {
      if (heading.clientWidth === width) return;
      width = heading.clientWidth;
      fit();
    });
    observer?.observe(heading);
    void document.fonts?.ready.then(fit).catch(() => undefined);
    return () => observer?.disconnect();
  }, [title]);
  return (
    <div className={className ? `app-large-header ${className}` : 'app-large-header'}>
      <div className="app-large-titles">
        <h1 ref={ref}>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {trailing}
    </div>
  );
}
