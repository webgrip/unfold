import type { Dictionary } from './en.ts';

export const nl: Dictionary = {
  redesign: {
    heroLine: 'Agents werken.',
    heroAccent: 'Jij beslist.',
    heroIntro:
      'Van Work Item naar pull request, met AI-agents, expliciete budgetten en bewijs dat je kunt inspecteren. Jij beslist wat wordt gemerged.',
    explore: 'Verken een Shift',
    source: 'Bekijk de broncode',
    category: 'Zelf gehoste agentorkestratie',
    assemblyCaption: 'Eén Work Item. Ontvouwen tot bewijs.',
    unfoldAgain: 'Opnieuw ontvouwen',
    architecture: 'Architectuur',
    menu: 'Menu',
    recorded: 'Opgenomen demo',
    handoff: 'De beslissing is aan jou.',
    handoffNote: 'Code, checks en een review. Niets gemerged.',
    implementation: 'Implementer',
    independent: 'Reviewer',
    testsPass: '3 checks slagen',
    localResult: 'Lokaal demoresultaat',
    oneChange: '1 bestand gewijzigd',
    demoBadge: 'Deterministische demo · geen modelaanroepen · geen kosten',
    proof: [
      'Apache-2.0-licentie',
      'Zelf gehost op Kubernetes',
      'Je modellen via LiteLLM',
      'Experimenteel · 0.x',
    ],
    howKicker: '01 / HET WERK ZICHTBAAR',
    howTitle: 'Eén Shift. Elke stap in beeld.',
    howIntro:
      'Een afrondingsfout. Een implementer. Een onafhankelijke reviewer. Verken het opgenomen bewijs uit de deterministische demo die bij Vloer hoort.',
    stageLabel: 'Verken de opgenomen Shift',
    play: 'Speel de Shift af',
    pause: 'Pauzeren',
    replay: 'Speel opnieuw',
    complete: 'Shift afgerond. Het resultaat is klaar voor menselijke review.',
    stages: [
      {
        label: 'Het Work Item',
        title: 'Begin met een helder stuk werk.',
        text: 'De orderservice rondt 1.005 af naar 1.00 in plaats van 1.01. Het Work Item vraagt om een minimale oplossing en onafhankelijke verificatie.',
      },
      {
        label: 'De implementer',
        title: 'Reproduceren. Wijzigen. Controleren.',
        text: 'De implementer reproduceert de falende tests, wijzigt één regel en voert de checks opnieuw uit. De uitvoer blijft bij de Shift.',
      },
      {
        label: 'De reviewer',
        title: 'Een tweede Run controleert het werk.',
        text: 'De reviewer voert de checks onafhankelijk uit en keurt de wijziging goed. Die goedkeuring is bewijs dat een mens beoordeelt.',
      },
      {
        label: 'Jouw beslissing',
        title: 'De agents stoppen. Jij beslist.',
        text: 'Als je de lokale demo draait, blijft de wijziging op je machine. De zelfstandige workerworkflow van Ploeg kan een pull request op je forge openen. Menselijke review, mergen en releasen blijven bij jou.',
      },
    ],
    baseline: 'Vóór de oplossing',
    after: 'Na de oplossing',
    reviewChecks: 'Onafhankelijke review',
    passed: 'geslaagd',
    failed: 'gefaald',
    command: 'Opgenomen opdracht',
    diff: 'Opgenomen wijziging · src/order.js',
    objective: 'Doel van het Work Item',
    budget: 'Goedgekeurd demobudget',
    spent: 'Demokosten',
    reviewVerdict: 'Revieweroordeel',
    approved: 'Goedgekeurd',
    merged: 'Gemerged',
    no: 'Nee',
    recording: 'Bekijk de volledige opname',
    recordingNote: 'Elke gebeurtenis, de opgenomen timing en de originele Vloer-interface.',
    controlLine: 'Het laatste woord',
    controlAccent: 'is aan jou.',
    controlNote: 'Agents stellen wijzigingen voor. Mensen accepteren, mergen en releasen.',
    guardKicker: '02 / BEGRENZD ONTWORPEN',
    guardTitle: 'Geef agents werk. Houd controle.',
    guardIntro:
      'Inspecteer de wijziging, volg de checks en beslis of het resultaat klaar is. Kan een Shift niet afronden, dan stopt die voor menselijke aandacht.',
    archKicker: '03 / ONDER DE MOTORKAP',
    archTitle: 'Eén product. Heldere rollen.',
    archIntro:
      'Ploeg beheert de uitvoering. In Vloer start, stuur en inspecteer je het werk. Beide staan in één repository en delen één Unfold-versie.',
    cluster: 'BEHEERDE UITVOERING',
    front: 'Browser / VS Code',
    engine: 'Autorisatie · budgetten · orkestratie',
    store: 'Shift-registratie',
    gateway: 'Modelgateway',
    providers: 'Je modelproviders',
    forge: 'Je forge',
    pullRequest: 'Pull request + bewijs',
    architectureNote:
      'Conceptueel overzicht. De zelfstandige workerworkflow van Ploeg kan pull requests publiceren; het beheerde kandidaatpad van Vloer publiceert nog niet.',
    workerPath: 'Zelfstandige workerworkflow',
    openKicker: '04 / BOUW MET OPEN OGEN',
    openTitle: 'Open source. Op jouw voorwaarden.',
    openIntro:
      'Draai Unfold op je eigen infrastructuur, inspecteer de broncode en sluit je eigen providers aan via LiteLLM. Het is experimentele software, in gebruik voor de backlog van de eigenaar.',
    statusTitle: 'Wat er is. Wat nog komt.',
    pricingTitle: 'Een helder model voor gehost werk.',
    signupKicker: 'VOLG HET WERK',
    signupTitle: 'Bouw mee aan wat zich ontvouwt.',
  },
  meta: {
    homeTitle: 'Unfold: van Work Item naar een pull request dat je zelf beoordeelt',
    homeDescription:
      'Unfold laat AI-agents aan je Work Items werken, met een budget en kortlevende toegang, en stopt bij een pull request dat een mens beoordeelt. Zelf te hosten, open source, experimenteel.',
    privacyTitle: 'Privacyverklaring',
    privacyDescription:
      'Wat het aanmeldformulier van Unfold bewaart, waarom, hoe lang en hoe je je afmeldt.',
    thanksTitle: 'Je staat op de lijst',
    thanksDescription: 'Je aanmelding voor nieuws over Unfold is opgeslagen.',
    problemTitle: 'Je aanmelding is niet opgeslagen',
    problemDescription: 'Het aanmeldformulier kon je gegevens niet opslaan.',
    notFoundTitle: 'Pagina niet gevonden',
    notFoundDescription: 'Deze pagina bestaat niet.',
    ogImageAlt: 'Unfold',
  },
  a11y: {
    skipLink: 'Direct naar de inhoud',
    mainNav: 'Hoofdnavigatie',
    homeLink: 'Unfold, startpagina',
    themeToggle: 'Donker thema',
    switchLocale: 'Read this page in English',
  },
  nav: {
    how: 'Werking',
    pricing: 'Prijzen',
    status: 'Status',
    signup: 'Aanmelden',
    source: 'Broncode',
  },
  hero: {
    eyebrow: 'Open source · zelf te hosten · experimenteel',
    title: 'Van Work Item naar een pull request dat klaarligt voor review.',
    lede: 'Je geeft Unfold een stuk werk. Unfold zet er AI-agents op, met een budget en toegangsgegevens die verlopen, en stopt zodra er een pull request ligt dat een mens kan lezen. Mergen doe je zelf.',
    primary: 'Zet me op de lijst',
    secondary: 'Zo werkt het',
    source: 'Of lees de broncode',
    demoNote:
      'De animaties en de opname op deze pagina komen uit de deterministische demo. Die draait een vaste testopstelling, roept geen model aan en kost niets.',
    visual: {
      label:
        'Animatie: een Work Item vertrekt als papieren vliegtuigje, komt langs een schrijvende Run, de checks en een reviewende Run, en landt als pull request dat op een mens wacht.',
      workItem: 'Work Item',
      writer: 'Schrijvende Run',
      checks: 'Checks slagen',
      reviewer: 'Reviewer keurt goed',
      pullRequest: 'Pull request',
      waiting: 'Wacht op jouw review',
      merge: 'Mergen beslis jij',
    },
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
        text: 'Iemand leest het pull request en beslist. Unfold merget nooit en zet nooit iets in productie.',
      },
    ],
    planned:
      'Gepland, nog niet gebouwd: een previewomgeving bij elk pull request, en groottegrenzen zodat elk pull request in één keer te begrijpen is.',
  },
  how: {
    title: 'Kijk mee met één Shift',
    intro:
      'Hetzelfde kleine klusje, op twee manieren. Een orderservice rondt 1,005 af op 1,00 in plaats van 1,01. Beide komen uit de deterministische demo die bij Vloer hoort. Je kunt hem zelf draaien en krijgt dezelfde uitkomst.',
    walkthrough: {
      title: 'Stap voor stap',
      badge: 'Simulatie van de deterministische demo: geen modelaanroepen, geen kosten',
      lead: 'Elke regel is een gebeurtenis die de demo vastlegde, met de oorspronkelijke timing ernaast.',
      play: 'Afspelen',
      replay: 'Opnieuw afspelen',
      clock: 'Verstreken',
      seconds: 's',
      workItem: 'Work Item',
      repository: 'Repository',
      budget: 'Budget',
      spent: 'Uitgegeven',
      budgetNote:
        'Vastgelegd voordat de Shift begint. De demo roept geen model aan, dus er wordt niets uitgegeven.',
      events: {
        workItem: 'Work Item aangemaakt',
        shiftStarted: 'Shift gestart',
        runStarted: 'Run gestart',
        runFinished: 'Run klaar',
        approved: 'De reviewer keurt de wijziging goed',
        baseline: 'Checks vóór de fix, die zoals verwacht falen:',
        verification: 'Checks na de fix:',
        review: 'De reviewer draait de checks zelf nog een keer:',
        passed: 'geslaagd',
        failed: 'gefaald',
        edit: 'Past aan',
        changeReady: 'Wijziging klaar voor review',
        shiftFinished: 'Shift klaar. Er is niets gemerged.',
      },
      result: 'Klaar voor jouw review',
      resultNote:
        'Als je de lokale demo draait, blijft de wijziging op je machine. De zelfstandige workerworkflow van Ploeg kan een pull request op je forge publiceren.',
      diff: 'De wijziging die de demo maakte',
    },
    video: {
      title: 'In de werkbank',
      lead: 'Dezelfde demo in Vloer, opgenomen door een script dat erdoorheen klikt. Er is niets met de hand klaargezet.',
      caption:
        'Opname van de deterministische demo in Vloer: geen modelaanroepen, geen kosten. Opgenomen met Vloer',
      fallback: 'Je browser kan deze video niet afspelen. Download hem:',
    },
    replay: {
      title: 'Elke gebeurtenis',
      text: 'Een volledige herhaling van de demo, waarin je in je eigen tempo door een hele Shift stapt.',
      link: 'Open de volledige herhaling',
      soon: 'Komt binnenkort.',
    },
    runIt: 'Draai de demo zelf',
  },
  guards: {
    title: 'Waar Unfold op let',
    items: [
      {
        title: 'Budgetten',
        text: 'Ploeg legt het budget vast voordat een Run begint en sluit de toegang tot het model af zodra het op is. Een budget verhogen is een beslissing van een beheerder.',
      },
      {
        title: 'Beperkte toegang',
        text: 'Beheerde Runs krijgen kortlevende modelsleutels met een budget. Schrijftoegang is beperkt tot het werk; beheersleutels blijven in de controller.',
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
  pricing: {
    title: 'Zo gaat gehoste Unfold kosten',
    badge: 'Gepland · nog niet te koop',
    intro:
      'Gehoste Unfold bestaat nog niet. Dit is het prijsmodel waarvoor we hebben gekozen. We publiceren de prijzen na het eerste toetsmoment van de pilot.',
    items: [
      {
        title: 'Je betaalt voor geaccepteerd werk',
        text: 'De geplande leveringsvergoeding volgt geaccepteerd werk en ticketomvang. Acceptatie kan expliciet zijn of na 10 werkdagen worden verondersteld; de volledige voorwaarden verschijnen samen met de prijslijst.',
      },
      {
        title: 'Modelgebruik wordt per poging gerekend',
        text: 'Modeltokens kosten de kostprijs plus een gepubliceerde vaste opslag, ook bij afgewezen werk. Pogingen die mislukken door de infrastructuur of bugs van Unfold zijn uitgezonderd.',
      },
      {
        title: 'Eerst het Budget',
        text: 'Elk Work Item krijgt een Budget voordat het werk begint, en dat wordt nooit zonder overleg verhoogd. Een Shift die het Budget bereikt, stopt en stelt voor het werk op te splitsen.',
      },
      {
        title: 'Je eigen prijzen',
        text: 'Een bureau bepaalt zelf wat het zijn klanten rekent. Unfold bemoeit zich niet met die prijzen.',
      },
      {
        title: 'Geen Unfold-licentiekosten',
        text: 'Draai je Unfold op je eigen cluster, dan rekent Unfold je niets. Je betaalt je eigen modelprovider en je eigen infrastructuur.',
      },
    ],
    ticket:
      'Een ticket is een Work Item met een omvang en een prijs die je klant heeft goedgekeurd.',
    cta: 'Wil je horen wanneer de prijzen bekend zijn, of als designpartner meedenken?',
    button: 'Zet me op de lijst',
  },
  parts: {
    title: 'Twee applicaties, één versie',
    items: [
      {
        name: 'Ploeg',
        role: 'De motor',
        text: 'Ploeg autoriseert beheerde Runs van agents, kent budgetten toe en orkestreert de uitvoering. Ploeg haalt Work Items uit trackers zoals Vikunja en ClickUp, bepaalt wie op welke branch mag schrijven en legt elke Shift vast in PostgreSQL.',
      },
      {
        name: 'Vloer',
        role: 'De werkbank',
        text: 'Vloer is de voorkant, in de browser of in VS Code. Daar start je werk, stuur je agents bij terwijl ze bezig zijn en bekijk je wat ze hebben gemaakt. Beheerde Runs lopen via Ploeg; de lokale demo is deterministisch.',
      },
    ],
    version: 'Beide staan in één repository en krijgen samen één Unfold-versienummer.',
  },
  open: {
    title: 'Zelf te hosten en open source',
    text: 'Unfold draait op je eigen Kubernetes-cluster. Het host zelf geen modellen, maar bereikt je providers via je eigen LiteLLM-gateway. De code valt onder de Apache-2.0-licentie.',
    license: 'Lees de licentie',
    docs: 'Lees de documentatie',
    source: 'Bekijk de broncode',
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
        text: 'De maker draait Unfold op eigen infrastructuur, voor de eigen backlog.',
      },
      {
        label: 'Gepland',
        text: 'Een gehoste Unfold voor bureaus, waarbij de kosten van elk Work Item vastliggen voordat het werk begint. Daarvan bestaat nog niets.',
      },
    ],
  },
  signup: {
    title: 'Hoor het als eerste',
    lead: 'Laat je e-mailadres achter en vertel wat je interesseert. We mailen als er iets is om uit te proberen, en gebruiken je adres nergens anders voor.',
    email: 'E-mailadres',
    interest: 'Wat interesseert je?',
    interests: {
      hosted: 'Gehoste Unfold',
      agency: 'Als bureau, voor je klanten',
      both: 'Allebei',
      selfHost: 'Zelf hosten met ondersteuning',
    },
    consentBefore:
      'Ik geef toestemming dat Unfold mijn e-mailadres en mijn keuze bewaart om mij over Unfold te informeren, zoals de',
    consentLink: 'privacyverklaring',
    consentAfter: 'beschrijft. Ik kan me altijd afmelden.',
    honeypot: 'Laat dit veld leeg',
    submit: 'Aanmelden',
    sending: 'Versturen…',
    note: 'Geen cookies en geen trackers. Je adres wordt in de EU opgeslagen.',
    success: 'Bedankt, je staat op de lijst.',
    successText: 'Wil je later weer van de lijst af, mail dan naar',
    errors: {
      invalid_email: 'Controleer het e-mailadres; het lijkt niet compleet.',
      invalid_interest: 'Kies wat je interesseert.',
      consent_required: 'Vink het vakje aan. Zonder toestemming kunnen we je adres niet bewaren.',
      unavailable: 'Opslaan lukte niet aan onze kant. Probeer het later opnieuw, of mail naar',
      network: 'De server is niet bereikbaar. Controleer je verbinding en probeer het opnieuw.',
    },
  },
  thanks: {
    title: 'Je staat op de lijst',
    text: 'Bedankt voor je aanmelding. We mailen als er iets is om uit te proberen.',
    withdraw: 'Toch liever niet? Mail naar',
    home: 'Terug naar de startpagina',
  },
  problem: {
    title: 'Je aanmelding is niet opgeslagen',
    text: 'Controleer of het e-mailadres compleet is, of je hebt gekozen wat je interesseert en of je het vakje voor toestemming hebt aangevinkt. Probeer het daarna opnieuw.',
    retry: 'Terug naar het formulier',
    contact: 'Lukt het steeds niet, mail dan naar',
  },
  privacy: {
    title: 'Privacyverklaring',
    version: 'Versie van 2 oktober 2026',
    intro:
      'Deze verklaring gaat over het aanmeldformulier op deze site. De site plaatst geen cookies en gebruikt geen analytics of trackers.',
    sections: [
      {
        title: 'Wie is verantwoordelijk',
        text: 'WebGrip, de onderneming van Ryan Grippeling in Enschede, is de verwerkingsverantwoordelijke. KvK-nummer 75281120. Contact: ryan@webgrip.nl.',
      },
      {
        title: 'Wat we bewaren',
        text: 'Je e-mailadres, de interesse die je koos, de taal van de pagina die je gebruikte, de versie van deze verklaring waarmee je instemde en wanneer je je aanmeldde. We bewaren je IP-adres niet, en ook niets over je browser of apparaat.',
      },
      {
        title: 'Waarvoor',
        text: 'Om je te informeren over Unfold: wanneer gehoste Unfold of ondersteuning bij zelf hosten beschikbaar komt, en om te vragen of je designpartner wilt worden. We gebruiken je adres nergens anders voor, en we verkopen of delen het niet.',
      },
      {
        title: 'Grondslag',
        text: 'Je toestemming, die je geeft door het vakje aan te vinken (artikel 6, lid 1, onder a AVG). Je kunt die altijd intrekken. Intrekken maakt eerder gebruik niet onrechtmatig.',
      },
      {
        title: 'Hoe lang we het bewaren',
        text: 'Tot je je afmeldt, en hooguit 24 maanden na je laatste aanmelding. Elke dag draait een taak die oudere aanmeldingen verwijdert.',
      },
      {
        title: 'Wie het voor ons verwerkt',
        text: 'Deze site en het formulier draaien op Cloudflare, dat optreedt als onze verwerker. Je aanmelding wordt opgeslagen in een Cloudflare D1-database die beperkt is tot de EU-jurisdictie. De code die het formulier ontvangt, kan in elk datacenter van Cloudflare draaien, en zoals bij elke website ziet Cloudflare je IP-adres om de pagina te leveren. Het formulier bewaart dat adres niet, en het loggen van verzoeken staat voor het formulier uit.',
      },
      {
        title: 'Je rechten',
        text: 'Je kunt vragen om je gegevens in te zien, te verbeteren of te verwijderen, om het gebruik te beperken of er bezwaar tegen te maken, en om ze in een overdraagbare vorm te krijgen. Mail naar ryan@webgrip.nl; je krijgt binnen een maand antwoord. Je kunt ook een klacht indienen bij de Autoriteit Persoonsgegevens.',
      },
      {
        title: 'Afmelden',
        text: 'Mail naar ryan@webgrip.nl vanaf het adres waarmee je je aanmeldde, dan verwijderen we het. Je kunt je later altijd opnieuw aanmelden.',
      },
      {
        title: 'Op je eigen apparaat',
        text: 'Wissel je tussen het lichte en donkere thema, dan onthoudt je browser die keuze in zijn lokale opslag. Die keuze blijft op je apparaat en wordt nooit naar ons gestuurd.',
      },
    ],
  },
  footer: {
    summary: 'Unfold maakt van Work Items pull requests die klaarliggen voor review door een mens.',
    source: 'Broncode',
    docs: 'Documentatie',
    license: 'Apache-2.0-licentie',
    fontLicense: 'Licentie van het lettertype Archivo',
    privacy: 'Privacy',
    origin: 'Gemaakt in Nederland.',
  },
  notFound: {
    title: 'Deze pagina bestaat niet',
    text: 'De link is misschien verouderd, of er zit een typefout in het adres.',
    home: 'Naar de startpagina',
  },
};
