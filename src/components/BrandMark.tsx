/**
 * Logo de l'app (DomiaWordmark) : la maison et « NIDΛLO » en texte (Λ grec), tel que dans la barre du haut de l'accueil.
 * `prefix` donne les classes des deux pièces (`<prefix>-logo`, `<prefix>-word`) : `home-app` pour l'accueil, `site-brand`
 * pour l'en-tête et le pied de page de l'ordinateur. Décoratif : le nom « Nidalo » est donné par l'élément qui l'entoure.
 */
export function BrandMark({ prefix }: { prefix: string }) {
  return (
    <>
      <img className={`${prefix}-logo`} src="/assets/logo-maison.svg" width={32} height={27} alt="" />
      <span className={`${prefix}-word`} aria-hidden="true">NID{'Λ'}LO</span>
    </>
  );
}
