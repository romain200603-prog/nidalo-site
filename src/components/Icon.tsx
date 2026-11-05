import { ICON_PATHS, type IconName } from './iconPaths';

// Les dessins viennent du fichier iconPaths.ts (constantes, jamais de données de l'utilisateur).
export function Icon({ name, className = 'icon', title }: { name: IconName; className?: string; title?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
      aria-label={title}
      focusable="false"
      dangerouslySetInnerHTML={{ __html: ICON_PATHS[name] }}
    />
  );
}
