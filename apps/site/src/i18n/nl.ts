import type { Dictionary } from './en.ts';

export const nl: Dictionary = {
  meta: {
    homeTitle: 'Glide: van Work Item naar een pull request dat je zelf beoordeelt',
    homeDescription:
      'Glide laat AI-agents aan je Work Items werken, met een budget en kortlevende toegang, en stopt bij een pull request dat een mens beoordeelt. Zelf te hosten, open source, experimenteel.',
    notFoundTitle: 'Pagina niet gevonden',
    notFoundDescription: 'Deze pagina bestaat niet.',
    ogImageAlt: 'Glide',
  },
  a11y: {
    skipLink: 'Direct naar de inhoud',
    mainNav: 'Hoofdnavigatie',
    homeLink: 'Glide, startpagina',
    themeToggle: 'Donker thema',
    switchLocale: 'Read this page in English',
  },
  nav: {
    loop: 'Werking',
    parts: 'Onderdelen',
    status: 'Status',
    source: 'Broncode',
  },
  hero: {
    eyebrow: 'Open source · zelf te hosten · experimenteel',
    title: 'Van Work Item naar een pull request dat klaarligt voor review.',
    lede: 'Je geeft Glide een stuk werk. Glide zet er AI-agents op, met een budget en toegangsgegevens die verlopen, en stopt zodra er een pull request ligt dat een mens kan lezen. Mergen doe je zelf.',
    primary: 'Bekijk de broncode',
    secondary: 'Draai de demo',
    demoNote:
      'De demo is deterministisch. Hij draait een vaste testopstelling, roept geen model aan en kost niets.',
  },
  loop: {
    title: 'Van Work Item naar pull request',
    intro:
      'Een Shift is de hele poging op één Work Item. Die eindigt bij een pull request; daarna is een mens aan zet.',
    steps: [
      {
        term: 'Work Item',
        text: 'Iets wat je hebt besloten te doen, of een probleem dat zo goed beschreven is dat er een oplossing voor te bedenken is. Het komt uit je tracker of uit Vloer.',
      },
      {
        term: 'Shift',
        text: 'Ploeg opent een Shift en zet een Team op het Work Item. Elke Run is één Role aan het werk, een schrijver of een reviewer, met een eigen budget en eigen toegang.',
      },
      {
        term: 'Pull request',
        text: 'De Shift eindigt met een pull request op je forge. De wijziging zelf en de uitvoer van de checks die draaiden gaan mee als bewijs.',
      },
      {
        term: 'Review door een mens',
        text: 'Iemand leest het pull request en beslist. Glide merget nooit en zet nooit iets in productie.',
      },
    ],
    planned:
      'Gepland, nog niet gebouwd: een previewomgeving bij elk pull request, en groottegrenzen zodat elk pull request in één keer te begrijpen is.',
  },
  parts: {
    title: 'Twee applicaties, één versie',
    items: [
      {
        name: 'Ploeg',
        role: 'De motor',
        text: 'Ploeg geeft toestemming voor elke Run van een agent, kent het budget toe en voert de Run uit. Ploeg haalt Work Items uit trackers zoals Vikunja en ClickUp, bepaalt wie op welke branch mag schrijven en legt elke Shift vast in PostgreSQL.',
      },
      {
        name: 'Vloer',
        role: 'De werkbank',
        text: 'Vloer is de voorkant, in de browser of in VS Code. Daar start je werk, stuur je agents bij terwijl ze bezig zijn en bekijk je wat ze hebben gemaakt. Elke Run die Vloer start, loopt via Ploeg.',
      },
    ],
    version: 'Beide staan in één repository en krijgen samen één Glide-versienummer.',
  },
  guards: {
    title: 'Waar Glide op let',
    items: [
      {
        title: 'Budgetten',
        text: 'Ploeg legt het budget vast voordat een Run begint en sluit de toegang tot het model af zodra het op is. Een budget verhogen is een beslissing van een beheerder.',
      },
      {
        title: 'Beperkte toegang',
        text: 'Een Run krijgt alleen toegang tot zijn eigen werk, en die toegang verloopt. Beheersleutels blijven in de controller en komen nooit bij een agent.',
      },
      {
        title: 'Bewijs',
        text: 'Bij elke bewering over een resultaat hoort iets wat je kunt nakijken: de wijziging zelf en de echte uitvoer van de checks.',
      },
      {
        title: 'Een mens beslist',
        text: 'Een goedkeuring van een reviewer-Role telt als bewijs; accepteren doet een mens. Mergen en releasen blijven bij de mensen van wie de repository is.',
      },
    ],
  },
  open: {
    title: 'Zelf te hosten en open source',
    text: 'Glide draait op je eigen Kubernetes-cluster. Het host zelf geen modellen, maar bereikt je providers via je eigen LiteLLM-gateway. De code valt onder de Apache-2.0-licentie.',
    license: 'Lees de licentie',
    docs: 'Lees de documentatie',
  },
  status: {
    title: 'Hoe het ervoor staat',
    items: [
      {
        label: 'Experimenteel',
        text: 'Versies zijn 0.x-release candidates. Elke kwalificatie geldt voor een specifiek getest pad, niet voor elke provider of installatie.',
      },
      {
        label: 'In gebruik',
        text: 'De maker draait Glide op eigen infrastructuur, voor de eigen backlog.',
      },
      {
        label: 'Gepland',
        text: 'Een gehoste Glide voor bureaus, waarbij de kosten van elk Work Item vastliggen voordat het werk begint. Daarvan bestaat nog niets.',
      },
    ],
  },
  cta: {
    title: 'Lees de code, of kijk hoe het werkt',
    text: 'De demo start Ploeg, Vloer en PostgreSQL op je eigen machine en repareert een kleine testrepository. Hij is deterministisch: hij roept geen model aan en heeft geen toegangsgegevens nodig, dus hij kost niets.',
  },
  footer: {
    summary: 'Glide maakt van Work Items pull requests die klaarliggen voor review door een mens.',
    source: 'Broncode',
    docs: 'Documentatie',
    license: 'Apache-2.0-licentie',
    fontLicense: 'Licentie van het lettertype Archivo',
    origin: 'Gemaakt in Nederland.',
  },
  notFound: {
    title: 'Deze pagina bestaat niet',
    text: 'De link is misschien verouderd, of er zit een typefout in het adres.',
    home: 'Naar de startpagina',
  },
};
