"""Écrit les fichiers HTML du site (un par adresse). Les pages d'information reprennent le texte de la
première version du site (domia/site). Lancer : python3 -I scripts/make-pages.py /mnt/project-files/domia/site"""
import html
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
STATIC_SITE = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else None

def page(path, title, description, entry, *, og_title=None, canonical=True, noindex=False, body='<div id="root"></div>', section=None):
    url = 'https://nidalo.fr/' + ('' if path in ('index', '404') else path.removesuffix('index'))
    head = [
        '<!doctype html>',
        '<html lang="fr">',
        '<head>',
        '<meta charset="utf-8">',
        '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">',
        '<!-- nidalo:csp -->',
        f'<title>{html.escape(title, quote=False)}</title>',
        f'<meta name="description" content="{html.escape(description)}">',
    ]
    if noindex:
        head.append('<meta name="robots" content="noindex">')
    if canonical and not noindex:
        head.append(f'<link rel="canonical" href="{url}">')
    head += [
        f'<meta property="og:title" content="{html.escape(og_title or title)}">',
        f'<meta property="og:description" content="{html.escape(description)}">',
        '<!-- nidalo:head -->',
        '</head>',
    ]
    body_open = f'<body data-section="{section}">' if section else '<body>'
    noscript = ('<noscript><p class="noscript">Pour chercher un bien et voir les annonces, '
                'activez JavaScript dans votre navigateur.</p></noscript>')
    lines = head + [body_open, body, noscript, f'<script type="module" src="/src/entries/{entry}.tsx"></script>', '</body>', '</html>', '']
    out = ROOT / f'{path}.html'
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text('\n'.join(lines), encoding='utf-8')

APP_DESC = 'Nidalo, l’immobilier entre particuliers et professionnels : acheter, louer, investir selon le rendement locatif ou trouver un hôtel à vendre.'
page('index', 'Nidalo, l’immobilier simple et rentable', APP_DESC, 'home', og_title='Nidalo')
page('recherche/index', 'Rechercher un bien · Nidalo', 'Cherchez un bien à acheter, à louer ou à rentabiliser, sur la liste ou sur la carte.', 'search')
page('annonce/index', 'Annonce · Nidalo', 'Une annonce immobilière sur Nidalo.', 'listing', og_title='Annonce sur Nidalo', canonical=False)
for path, section, title in [
    ('favoris/index', 'favorites', 'Favoris'),
    ('messages/index', 'messages', 'Messages'),
    ('publier/index', 'publish', 'Publier une annonce'),
    ('compte/index', 'account', 'Mon compte'),
]:
    page(path, f'{title} · Nidalo', f'{title} sur Nidalo.', 'soon', section=section, noindex=True)
page('404', 'Page introuvable · Nidalo', 'Cette page n’existe pas.', 'notfound', noindex=True)

# Pages d'information : texte de la première version, liens rendus absolus.
INFO = [
    ('aide/index', 'Aide · Nidalo', 'Questions fréquentes et contact de Nidalo.', 'Aide de Nidalo'),
    ('confidentialite/index', 'Politique de confidentialité · Nidalo',
     'Les données utilisées par l’app Nidalo et le site nidalo.fr, et comment vous gardez la main dessus.',
     'Politique de confidentialité de Nidalo'),
    ('mentions-legales/index', 'Mentions légales · Nidalo',
     'Éditeur, hébergeurs et crédits du site nidalo.fr et de l’app Nidalo.', 'Mentions légales de Nidalo'),
]
for path, title, description, og_title in INFO:
    target = ROOT / f'{path}.html'
    if STATIC_SITE:
        source = (STATIC_SITE / f'{path}.html').read_text(encoding='utf-8')
        article = re.search(r'<main>\s*(.*?)\s*</main>', source, re.S).group(1)
        article = article.replace('href="../', 'href="/')
        (ROOT / 'src' / 'content').mkdir(parents=True, exist_ok=True)
        (ROOT / 'src' / 'content' / f'{path.split("/")[0]}.html').write_text(article + '\n', encoding='utf-8')
    article = (ROOT / 'src' / 'content' / f'{path.split("/")[0]}.html').read_text(encoding='utf-8')
    body = '<div id="header"></div>\n<main id="contenu" tabindex="-1">\n' + article.rstrip() + '\n</main>\n<div id="footer"></div>'
    page(path, title, description, 'info', og_title=og_title, body=body)
print('pages écrites')
