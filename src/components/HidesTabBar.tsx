/**
 * Écran de l'app qui masque la barre d'onglets (hidesTabBar : Mon projet, une demande de visite…) : sa seule présence
 * dans la page cache la barre du bas, sur toutes les largeurs (styles/app.css).
 */
export function HidesTabBar() {
  return <span data-hides-tab-bar="" hidden />;
}
