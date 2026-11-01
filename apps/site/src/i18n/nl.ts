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
      'Een afrondingsfout. Een implementer. Een onafhankelijke reviewer. Verken het opgenomen bewijs uit de deterministische demo die bij Unfold hoort.',
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
    recordingNote: 'Elke gebeurtenis, de opgenomen timing en de originele Unfold-interface.',
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
      'Ploeg autoriseert de beheerde uitvoering en kent er budget aan toe. In Unfold start, stuur en inspecteer je het werk. Beide staan in één repository en delen één Unfold-versie.',
    cluster: 'BEHEERDE UITVOERING',
    front: 'Browser / VS Code',
    engine: 'Autorisatie · budgetten · orkestratie',
    store: 'Shift-registratie',
    gateway: 'Modelgateway',
    providers: 'Je modelproviders',
    forge: 'Je forge',
    pullRequest: 'Pull request + bewijs',
    architectureNote:
      'Conceptueel overzicht. De zelfstandige workerworkflow van Ploeg kan pull requests publiceren; het beheerde kandidaatpad van Unfold publiceert nog niet.',
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
      'Unfold laat AI-agents aan je Work Items werken binnen een budget dat vooraf vastligt, en stopt bij een pull request dat een mens beoordeelt. Zelf te hosten, open source, experimenteel.',
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
    featuresTitle: 'Alle functies, met hun status',
    featuresDescription:
      'De volledige lijst van wat Unfold en Ploeg nu doen en wat gepland is, met de labels Beschikbaar, In Labs, Experimenteel of Gepland, te filteren op publiek en categorie.',
    integrationsTitle: 'Integraties, en hoe je er zelf een toevoegt',
    integrationsDescription:
      'Waar Unfold nu mee koppelt, welke open standaarden het spreekt, welke adapters eraan komen, en hoe een nieuwe tracker, forge of factuurpakket als adapter inplugt.',
    agenciesTitle: 'Unfold voor bureaus',
    agenciesDescription:
      'Geef klantwerk aan AI-agents binnen een vooraf vastgesteld budget, zie de kosten per klant en stuur één factuurregel per geaccepteerd Work Item. Nu zelf gehost; een gehoste versie voor bureaus is gepland.',
    teamsTitle: 'Unfold voor engineering leads',
    teamsDescription:
      'Budgetten goedgekeurd voor elke modelaanroep, een gewone reden bij elk Work Item dat op iemand wacht, een sluitende audittrail en elke AI-wijziging gemarkeerd.',
    developersTitle: 'Unfold voor developers',
    developersDescription:
      'Draag een taak over aan AI-agents vanuit je tracker, VS Code, Claude Code of een MCP-app, volg elke Run, en neem de branch over en geef hem terug.',
    platformTitle: 'Unfold voor platformengineers',
    platformDescription:
      'Eén Helm-chart op je eigen Kubernetes. Modelsleutels per Run begrensd tot een budget, een pushproxy naar de eigen branch van de Run, netwerkpolicy’s die standaard alles weigeren en ondertekende releases van Ploeg.',
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
    audiences: 'Voor wie',
    features: 'Functies',
    integrations: 'Integraties',
  },
  hero: {
    eyebrow: 'Open source · zelf te hosten · experimenteel',
    title: 'Van Work Item naar een pull request dat klaarligt voor review.',
    lede: 'Je geeft Unfold een stuk werk. Unfold zet er AI-agents op, binnen een budget dat vooraf vastligt, en stopt zodra er een pull request ligt dat een mens kan lezen. Mergen doe je zelf.',
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
        text: 'Iets wat je hebt besloten te doen, of een probleem dat zo goed beschreven is dat er een oplossing voor te bedenken is. Het komt uit je tracker of uit Unfold.',
      },
      {
        term: 'Shift',
        text: 'Ploeg opent een Shift en zet een Team op het Work Item. Elke Run is één Role aan het werk, een schrijver of een reviewer, met een eigen budget en standaard een eigen modelsleutel.',
      },
      {
        term: 'Pull request',
        text: 'In de zelfstandige workerworkflow van Ploeg eindigt de Shift met een pull request op je forge. De wijziging zelf en de uitvoer van de checks die draaiden gaan mee als bewijs.',
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
      'Hetzelfde kleine klusje, op twee manieren. Een orderservice rondt 1,005 af op 1,00 in plaats van 1,01. Beide komen uit de deterministische demo die bij Unfold hoort. Je kunt hem zelf draaien en krijgt dezelfde uitkomst.',
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
      lead: 'Dezelfde demo in Unfold, opgenomen door een script dat erdoorheen klikt. Er is niets met de hand klaargezet.',
      caption:
        'Opname van de deterministische demo in Unfold: geen modelaanroepen, geen kosten. Opgenomen met Unfold',
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
        text: 'Ploeg legt het budget vast voordat een Run begint. Standaard hangt dat budget aan de modelsleutel van de Run, en de gateway weigert verdere aanroepen zodra het op is. Een budget verhogen is een beslissing van een beheerder.',
      },
      {
        title: 'Toegang',
        text: 'Standaard krijgt elke beheerde Run een eigen modelsleutel met een budget en een verlooptijd, krijgen reviewers een forge-token dat alleen mag lezen, en blijven beheersleutels in Ploeg. Schrijvers delen één push-token, tenzij je Ploeg een wachtwoord voor een Forgejo-bot geeft; dan krijgt elke schrijvende Run een token voor alleen zijn eigen repository, dat wordt ingetrokken als de Run klaar is. Sleutels en tokens buiten bereik van de agent houden is een instelling die je zelf aanzet.',
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
    matrix: 'Welke instellingen elke bewering nodig heeft',
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
        text: 'Ploeg autoriseert beheerde Runs van agents en kent er budget aan toe. Staat de executor aan, dan voert Ploeg de Work Items uit die het uit trackers zoals Vikunja en ClickUp haalt. Ploeg bepaalt wie op welke branch mag schrijven en legt elke Shift vast in PostgreSQL.',
      },
      {
        name: 'Unfold',
        role: 'De werkbank',
        text: 'Unfold is de voorkant, in de browser of in VS Code. Daar start je werk, stuur je agents bij terwijl ze bezig zijn en bekijk je wat ze hebben gemaakt. Staat gedeelde uitvoering aan, dan autoriseert Ploeg de Runs die je daar start en kent er budget aan toe, maar voert Unfold ze nog zelf uit; staat die uit, dan draait Unfold sessies op eigen houtje. Gepland: Ploeg voert elke Run uit, en Unfold draait zonder Ploeg alleen nog de deterministische demo.',
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
  catalogue: {
    status: {
      available: 'Beschikbaar',
      labs: 'In Labs',
      experimental: 'Experimenteel',
      planned: 'Gepland',
    },
    statusHelp: {
      available: 'Gebouwd, en standaard aan of aan zodra je het instelt.',
      labs: 'Gebouwd, achter een feature flag die uit staat tot iemand of een beheerder hem aanzet.',
      experimental:
        'Gebouwd, maar nog niet bewezen tegen de echte tool, of buiten het ondersteunde profiel.',
      planned: 'Besloten of voorgesteld, en nog niet gebouwd. Zonder datum.',
    },
    categories: {
      integrations: 'Integraties',
      control: 'Controle',
      security: 'Beveiliging en isolatie',
      cost: 'Kosten',
      visibility: 'Inzicht en bewijs',
      where: 'Waar je werkt',
      open: 'Open en zelf gehost',
      new: 'Wat hier nieuw is',
      next: 'Wat eraan komt',
    },
    audiences: {
      agencies: 'Bureaus',
      teams: 'Engineering leads',
      developers: 'Developers',
      platform: 'Platformengineers',
    },
    from: {
      unfold: 'Unfold',
      ploeg: 'Ploeg',
    },
    fromLabel: 'Zit in',
    statusLabel: 'Status',
    items: {
      intHandoff: {
        title: 'Overdragen vanuit ClickUp en Vikunja',
        text: 'Wijs een taak in je eigen tracker toe aan een agent-Team en je krijgt een pull request terug.',
      },
      intGithubIssues: {
        title: 'GitHub Issues als werkvoorraad',
        text: 'Met een label ploeg:<team> of een assignee gaat een issue naar een Team. Reacties en het sluiten van het issue komen terug in GitHub. Live getest tegen github.com.',
      },
      intTrackerReads: {
        title: 'Taken lezen uit Forgejo, GitHub, GitLab en Jira Cloud',
        text: 'Zoek en lees een taak voordat je hem overdraagt. Issues uit Jira, GitLab en Forgejo kun je nog niet overdragen.',
      },
      intForges: {
        title: 'Pull requests op Forgejo, GitHub en GitLab',
        text: 'Elke forge heeft een eigen publisher. Op GitLab wordt het een merge request.',
      },
      intModels: {
        title: 'Elke modelprovider achter LiteLLM',
        text: 'Elke modelaanroep loopt via je eigen LiteLLM-gateway, dus elke provider die LiteLLM ondersteunt kan erachter.',
      },
      intAgentPlugins: {
        title: 'Plugins voor Claude Code, OpenCode en ACP-agents',
        text: 'Een Claude Code-plugin die ook als Agent Plugin installeert in Codex, Copilot, VS Code, Cursor en Kiro, een plugin voor OpenCode 1.x en een doorgeefproxy voor elke agent die het Agent Client Protocol spreekt.',
      },
      intCodex: {
        title: 'Codex CLI meldt zich',
        text: 'Codex-sessies melden zich bij Unfold. Alleen getest met opgenomen berichten.',
      },
      intHarness: {
        title: 'OpenHands, of een eigen programma',
        text: 'Ploeg draait OpenHands via ACP, of elk programma dat de gepubliceerde Task Spec leest en een Outcome Report schrijft. Beide vallen binnen het ondersteunde profiel.',
      },
      intHarnessOthers: {
        title: 'OpenCode, Qwen Code, Goose, Claude Code, Codex en Gemini CLI',
        text: 'De adapters zitten in de broncode van Ploeg en draaien mee in de geplande aanvalsoefening, maar vallen buiten het ondersteunde profiel.',
      },
      intChat: {
        title: 'Slack, Microsoft Teams, ntfy en Web Push',
        text: 'Meldingen met stille uren, en in Slack kun je een toestemmingsvraag van een agent beantwoorden. Meldingen in de browser en in VS Code werken ook zonder deze vlag.',
      },
      intFocus: {
        title: 'Modelkosten als FinOps FOCUS-bestanden',
        text: 'Kosten- en verbruiksregels in FOCUS 1.4 als CSV, JSON Lines of Parquet, leesbaar voor elke FinOps-tool.',
      },
      intBilling: {
        title: 'Factuurregels in Simplicate, of als bestand',
        text: 'Eén regel per geaccepteerd Work Item in Simplicate, of als CSV- en UBL 2.1-bestanden voor elk ander pakket.',
      },
      intIdentity: {
        title: 'Single sign-on met elke OIDC-provider',
        text: 'Mensen loggen in via je eigen identityprovider, en lokaal inloggen kan uit.',
      },
      intScim: {
        title: 'Accounts beheren met SCIM 2.0 en Shared Signals',
        text: 'Je identityprovider maakt mensen aan en haalt ze weg, en beëindigt hun sessies als dat moet.',
      },
      intIntake: {
        title: 'Verzoeken uit feedbacktools en e-mail',
        text: 'Marker.io, BugHerd, Userback, Freshdesk, Zendesk, een webformulier of een e-mail wordt een verzoek in Unfold.',
      },
      intObservability: {
        title: 'Grafana, Prometheus, VictoriaLogs en Sentry',
        text: 'Logs en telemetrie gaan naar je eigen stack, fouten naar elke tracker die het Sentry-protocol spreekt, zoals GlitchTip of Bugsink.',
      },
      ctlBudget: {
        title: 'Budget vast voordat er iets wordt uitgegeven',
        text: 'Ploeg keurt het budget van elke Run goed voor de eerste modelaanroep. Bij het overdragen zie je de limiet van het Team per dag, week of maand en wat er nog over is.',
      },
      ctlTeamCaps: {
        title: 'Uitgavenplafond en maximum aantal Runs per Team',
        text: 'Een Team pakt geen nieuw werk meer op zodra het plafond voor de dag, week of maand zou worden overschreden, en een limiet bepaalt hoeveel Runs er tegelijk lopen.',
      },
      ctlNoRespend: {
        title: 'Niets stilletjes opnieuw uitgeven',
        text: 'Voordat werk wordt hervat of opnieuw draait, kijkt Unfold of Ploeg het betaalt. Geld dat lopende Runs vasthouden staat apart van wat al is uitgegeven.',
      },
      ctlConfirm: {
        title: 'Eerst bevestigen, dan pas iets veranderen',
        text: 'Acties vanuit AI-apps en editors laten zien wat ze doen en wat het kost, en wachten op jouw ja.',
      },
      ctlStop: {
        title: 'Werk stoppen met één bevestiging',
        text: 'Je ziet vooraf wat stoppen doet (Runs stoppen, sleutels intrekken, een reactie bij de taak) en wat er tot dan toe is uitgegeven.',
      },
      ctlTakeOver: {
        title: 'Overnemen en teruggeven',
        text: 'Laat een lopende Run stoppen op het eerstvolgende veilige punt, maak het werk zelf af op zijn branch en geef het terug met een notitie.',
      },
      ctlSteer: {
        title: 'Lopend werk bijsturen',
        text: 'Laat een notitie achter voor de volgende Run, of beantwoord de vraag van een agent en kies tussen hervatten en opnieuw beginnen. Bij allebei zie je de kosten.',
      },
      ctlPermissions: {
        title: 'Toestemmingsvragen beantwoorden',
        text: 'Sta een toolaanroep van een agent één keer toe, sta vergelijkbare aanroepen toe of weiger hem. Wie dat wil, keurt ook de vragen van zijn eigen Claude Code-sessie op afstand goed.',
      },
      ctlProposed: {
        title: 'Werk dat agents voorstellen goedkeuren',
        text: 'Een Work Item dat een agent voorstelt, wacht tot iemand het goedkeurt of afwijst.',
      },
      ctlBriefCheck: {
        title: 'Eerst de opdracht controleren',
        text: 'Een goedkoop model kijkt of een taak uitvoerbaar is en stelt zijn vragen voor de eerste Run.',
      },
      ctlRouting: {
        title: 'Routering die je zelf bepaalt',
        text: 'Regels koppelen elk bord en label aan een toegestane repository en een Team. Een ticket waar geen regel voor is, wordt geweigerd met een reactie die uitlegt hoe je het oplost.',
      },
      ctlMerge: {
        title: 'Mergen blijft mensenwerk',
        text: 'Unfold opent het pull request. Je forge en je reviewers beslissen over de merge.',
      },
      ctlRoles: {
        title: 'Wie wat ziet',
        text: 'De rollen kijker, operator en beheerder komen uit je identityprovider, en per persoon kun je beperken welke Teams iemand ziet.',
      },
      ctlSignOff: {
        title: 'Akkoord van de klant op de exacte commit',
        text: 'Leg het ‘ziet er goed uit’ of ‘moet anders’ van een klant vast bij de commit die in review is (Client Sign-off). Voorlopig alleen via de API.',
      },
      secSandbox: {
        title: 'Agents werken in een sandbox',
        text: 'Elke werkruimte draait in een beperkte Docker-container, een Kubernetes-pod met egressregels of een voorverwarmde Kata-sandbox, een lichte virtuele machine.',
      },
      secScopedKey: {
        title: 'Geen hoofdsleutels in een werkruimte',
        text: 'Een werkruimte krijgt van Ploeg een beperkte modelsleutel die wordt geblokkeerd zodra het werk klaar is. Je Kubernetes-gegevens en die van anderen komen er nooit in.',
      },
      secProxies: {
        title: 'De agent ziet de sleutels nooit',
        text: 'Lokale proxy’s bewaren de modelsleutel en het pushtoken, dus de container van de agent bevat alleen plaatshouders. Live getest tegen een vijandige agent, voor één agenttool en één Role.',
      },
      secOwnBranch: {
        title: 'Alleen pushen naar de eigen branch',
        text: 'De pushproxy weigert pushes naar elke andere branch en weigert het verwijderen van branches.',
      },
      secCanary: {
        title: 'Een lokaassleutel in elke Run',
        text: 'Duikt die nepsleutel of een echte sleutel op in gepushte commits, dan stopt de Run en worden zijn pull requests gesloten.',
      },
      secWorkerPods: {
        title: 'Workerpods zonder uitweg',
        text: 'Een workerpod heeft geen Kubernetes-token en bereikt geen metadata-endpoint, API-server of niet-goedgekeurde dienst. Live getest op één cluster met Cilium.',
      },
      secNetworkPolicy: {
        title: 'Netwerkpolicy’s die standaard alles weigeren',
        text: 'De chart maakt een policy voor elke pod die hij aanmaakt. Je CNI moet ze wel afdwingen.',
      },
      secKata: {
        title: 'Een virtuele machine per Run',
        text: 'De sandbox-executor draait elke Run in een eigen Kata Containers-VM. Ondersteund met seccomp aan in de gast, al is er in die opstelling nog geen probe geslaagd.',
      },
      secVerifyOutside: {
        title: 'Wijzigingen gecontroleerd buiten de agent',
        text: 'Voor publicatie wordt de wijziging buiten de werkruimte van de agent opnieuw gebouwd, en de checks draaien in containers zonder netwerk, uit een vastgepinde image.',
      },
      secSigned: {
        title: 'Ondertekende wijzigingen',
        text: 'Elke vastgelegde wijziging heeft een in-toto-attestatie die je offline kunt controleren. Wijzigingen aan bestanden met geheimen worden geweigerd.',
      },
      secSecretScan: {
        title: 'Geheimen tegengehouden bij overdracht',
        text: 'Draag je je eigen niet-gecommitte wijziging over aan een Team, dan wordt die geweigerd zodra de secret-scanner iets vindt.',
      },
      secPersonProof: {
        title: 'Ploeg weet wie het vroeg',
        text: 'Als het is ingesteld, draagt elke wijziging die voor jou wordt gemaakt een token dat is ingewisseld tegen je eigen login.',
      },
      secTenants: {
        title: 'Organisaties en klanten gescheiden',
        text: 'Met de Tenant-grens aan zien mensen alleen de repositories, taken en Work Items van hun eigen organisatie en klant.',
      },
      secUntrusted: {
        title: 'Trackertekst geldt als gegevens',
        text: 'Tekst uit trackers en van agents komt bij AI-apps binnen als onbetrouwbaar gemarkeerd, zodat niemand het als opdracht opvolgt.',
      },
      secRepository: {
        title: 'De repository stuurt de agent niet',
        text: 'Tekst uit tickets en de forge geldt als onbetrouwbare invoer, de eigen hooks, plugins en MCP-servers van de repository staan uit, en een reviewer leest de instructies van de basisbranch.',
      },
      secReleases: {
        title: 'Releases die je kunt controleren',
        text: 'De images en de chart van Ploeg zijn keyless ondertekend met cosign en hebben een SBOM, build-herkomst, een OpenVEX-document en een CVE-budgetoordeel dat iedereen kan nagaan.',
      },
      secThreatModel: {
        title: 'Een openbaar dreigingsmodel',
        text: 'STRIDE per onderdeel, aanvalsbomen en openstaande bevindingen, plus een security-zelfevaluatie in CNCF-stijl.',
      },
      secHardened: {
        title: 'Standaard dichtgetimmerd',
        text: 'Een strikte content security policy, controles op cross-site-verzoeken, rate limits, geheimen weggelakt in elk antwoord en versleutelde interne gegevens.',
      },
      secLeavers: {
        title: 'Wie vertrekt, verliest meteen toegang',
        text: 'Haal je iemand weg in je identityprovider, dan vervallen al zijn sessies en sleutels.',
      },
      costRun: {
        title: 'Kosten per Run',
        text: 'Elke Run toont live zijn kosten, model en tokens naast zijn budget.',
      },
      costSettled: {
        title: 'Goedgekeurd, vastgehouden, dan afgerekend',
        text: 'Het budget van een Run wordt bij de start vastgehouden en de echte kosten worden later afgerekend uit de logs van de gateway. Bij elk bedrag staat of het waargenomen, voorlopig, afgerekend of onbekend is.',
      },
      costMerged: {
        title: 'Kosten per gemerged Work Item',
        text: 'Insights opent met het merge-percentage en de kosten per gemerged Work Item, en zegt het eerlijk als er te weinig gegevens zijn.',
      },
      costLedger: {
        title: 'Leveringsoverzicht',
        text: 'Elk Work Item waar agents aan werkten, of het is geaccepteerd en wat elke poging kostte, als CSV of JSON.',
      },
      costClient: {
        title: 'Kosten per klant',
        text: 'Een FOCUS-export per Run, of per Work Item en dag, met je organisatie als factuuraccount en de klant als subaccount.',
      },
      costAlerts: {
        title: 'Budgetwaarschuwingen in de editor',
        text: 'Het Agents-venster van VS Code waarschuwt bij 50, 80 en 100 % van een budget.',
      },
      costAskFree: {
        title: 'Vragen zo mogelijk gratis beantwoord',
        text: 'Een vraag over een Work Item wordt kosteloos uit de administratie beantwoord. Is er toch een model nodig, dan zie je eerst wat het kost.',
      },
      costOwnAgents: {
        title: 'Ook de kosten van je eigen agents',
        text: 'Je Claude Code-sessies tonen een schatting tegen API-prijzen, naast de Runs die Ploeg betaalt.',
      },
      costBill: {
        title: 'Geaccepteerd werk factureren',
        text: 'Stuur per geaccepteerd Work Item één regel naar je factuurpakket, tegen je eigen prijs per klant.',
      },
      visNeedsYou: {
        title: 'Weten wat op je wacht, en waarom',
        text: 'Vastgelopen werk staat gegroepeerd onder een gewone reden, met bij elke reden de ene actie die het oplost.',
      },
      visTranscript: {
        title: 'Het volledige verslag van een Run',
        text: 'De berichten van de agent, zijn toolaanroepen, zijn bewerkingen als diff en zijn plan, live te volgen.',
      },
      visEvidence: {
        title: 'Bewijs voor de merge',
        text: 'Het oordeel van de reviewer, CI, de afgerekende kosten en het eigen verhaal van de agent over wat hij veranderde en waarom.',
      },
      visFindings: {
        title: 'Bevindingen van de reviewer, met antwoord',
        text: 'Elke bevinding met het antwoord van de schrijvende agent, de onbeantwoorde bovenaan.',
      },
      visProduction: {
        title: 'Van pull request tot productie',
        text: 'Pull request, CI, goedkeuring, merge en eerste deploy per omgeving, elk met het tijdstip.',
      },
      visAudit: {
        title: 'Een sluitend verslag van wie wat deed',
        text: 'Elke actie wordt vastgelegd met de persoon, de app die hij gebruikte en zijn bevestiging, in een OCSF-audittrail met hashketen die je als CSV of JSON exporteert.',
      },
      visAiMarked: {
        title: 'Elke AI-wijziging is herkenbaar',
        text: 'Pull requests, reacties en commits melden dat een agent ze schreef, en Agent Trace legt per commit vast welke regels van een agent komen.',
      },
      visHealth: {
        title: 'Gezondheid van een Run',
        text: 'Lopende Runs krijgen het label On track, Watch of Off track op basis van hun eigen gedrag.',
      },
      visJudge: {
        title: 'Een second opinion op lopend werk',
        text: 'Een gratis model beoordeelt hoe een Run ervoor staat, en een struikeldraad markeert riskante toolaanroepen. Ze adviseren alleen en grijpen nooit in.',
      },
      visStatus: {
        title: 'Kan er nieuw werk starten?',
        text: 'Een statuspagina antwoordt in gewone woorden en zegt wat je moet oplossen.',
      },
      visOwnSessions: {
        title: 'Je eigen sessies in beeld',
        text: 'Sessies in Claude Code, OpenCode en Codex melden hun status en commits naast de Runs van Ploeg, maar nooit de tekst van je prompts.',
      },
      visBrief: {
        title: 'Een opleverbrief om door te geven',
        text: 'De Claude Code-plugin maakt van de commando’s die een wijziging bewezen één pagina per publiek, met bij elke bewering of die is gecontroleerd.',
      },
      visCards: {
        title: 'Run Cards',
        text: 'Elke opgeleverde wijziging krijgt een kaart met de kosten, doorlooptijden en hoe het in productie gaat. Een kaart beschrijft een wijziging, nooit een persoon.',
      },
      visMetrics: {
        title: 'Metrics en alerts met runbooks',
        text: 'Prometheus-metrics, een ServiceMonitor en alertregels voor Ploeg, elk met een runbook.',
      },
      visSiem: {
        title: 'Audit naar je SIEM',
        text: 'Auditregels gaan de deur uit als OTLP-logs of NDJSON.',
      },
      visEvents: {
        title: 'Gebeurtenissen naar je eigen systemen',
        text: 'Gebeurtenissen rond Work Items, pull requests en Runs als ondertekende CloudEvents-webhooks.',
      },
      whereBrowser: {
        title: 'Browser',
        text: 'Eén app voor desktop en telefoon, met sneltoetsen en een opdrachtenpalet.',
      },
      whereVsCode: {
        title: 'VS Code',
        text: 'De weergaven Now, Tasks en Work, overdragen, reviewen en een branch uitchecken, plus Work Items in het Agents-venster.',
      },
      whereClaudeCode: {
        title: 'Claude Code',
        text: 'Commando’s om een Run op je eigen plek te claimen, je niet-gecommitte wijziging over te dragen, en werk over te nemen en terug te geven.',
      },
      whereMcp: {
        title: 'AI-apps via MCP',
        text: 'Werk zoeken, volgen, overdragen en goedkeuren vanuit Claude Code, claude.ai, ChatGPT of Copilot, met Work Item-kaarten in apps die ze tonen.',
      },
      whereChat: {
        title: 'Chatten met Unfold in VS Code',
        text: 'Vraag het de Unfold-agent in het Agents-venster. Hij doet pas iets nadat jij hebt bevestigd.',
      },
      whereMessages: {
        title: 'Berichten naar je eigen sessie',
        text: 'Stuur een notitie naar een lopende Claude Code-sessie. Die leest hem bij de volgende prompt.',
      },
      whereAcp: {
        title: 'JetBrains-IDE’s, Zed en Neovim',
        text: 'Gebruik ‘unfold’ als ACP-agent in PhpStorm of een andere ACP-editor. Hij volgt één Work Item, streamt de Run en vraagt toestemming voordat hij iets uitgeeft. Nog niet geprobeerd in een echte installatie van die editors.',
      },
      whereMcpTask: {
        title: 'Een overdracht volgen als MCP-taak',
        text: 'De terminal van Claude Code volgt een overdracht tot het pull request klaarstaat.',
      },
      whereMcpEvents: {
        title: 'Je AI-app laten weten dat er werk op je wacht',
        text: 'Apps zoals ChatGPT abonneren zich op ‘needs you’, ‘pull request ready’ en ‘Run finished’.',
      },
      openSource: {
        title: 'Open source',
        text: 'Apache-2.0, en geen enkele functie wordt achtergehouden uit de open code.',
      },
      openHelm: {
        title: 'Draait op je eigen cluster',
        text: 'Eén Helm-chart bevat de Ploeg waarmee hij is getest, en Docker Compose is er voor lokaal gebruik. Een handleiding beschrijft hoe je de hele stack zelf host in de EU.',
      },
      openModels: {
        title: 'Kies je eigen modellen',
        text: 'Elke provider achter je LiteLLM-gateway, een lijst van toegestane providers en regio’s voor werk dat in Unfold start, en een overzicht ‘Waar je gegevens heen gaan’.',
      },
      openDemo: {
        title: 'Uitproberen zonder kosten',
        text: 'Een deterministische demo met voorbeeldgegevens. Hij roept geen model aan en kost niets.',
      },
      openSupport: {
        title: 'Op de Kubernetes en PostgreSQL die je al draait',
        text: 'Kubernetes 1.30 en 1.37 worden in CI getest en 1.31 tot en met 1.36 worden ondersteund; PostgreSQL 17 en 18 worden getest. Custom resources zijn niet nodig: alle toestand staat in PostgreSQL.',
      },
      openQuickstart: {
        title: 'Een eerste Run op je laptop, gratis',
        text: 'De quickstart installeert de ondertekende chart op een lokaal kind-cluster en voert één Run uit tegen een nepmodel dat geen provider aanroept en niets kost.',
      },
      openScaleToZero: {
        title: 'Workers schalen naar nul',
        text: 'KEDA start workers op basis van de wachtrij, en het controleren van een lege wachtrij kost geen modelaanroep. Zonder KEDA werkt een CronJob-executor.',
      },
      openDrills: {
        title: 'Herstel- en upgradeoefeningen in CI',
        text: 'De database terugzetten uit een back-up en upgraden vanaf eerdere releases draaien als oefening in CI.',
      },
      openContracts: {
        title: 'Gepubliceerde, geversioneerde contracten',
        text: 'De operator-API, de Run-API, het executorcontract en de Task Spec van de agent zijn als schema gepubliceerd, en CI weigert een brekende wijziging zonder beslisdocument.',
      },
      openUpgrade: {
        title: 'Chart upgraden en terugdraaien tussen releases',
        text: 'Toegezegd in het compatibiliteitsbeleid van Ploeg, maar nog door geen enkele job uitgevoerd.',
      },
      openExport: {
        title: 'Je gegevens gaan met je mee',
        text: 'Exporteer alles wat Unfold over een organisatie bewaart als JSON Lines, met een schema per bestand.',
      },
      newBudget: {
        title: 'Een budget voordat er iets wordt uitgegeven',
        text: 'Een vastgelopen agent kan geen rekening opbouwen die niemand heeft goedgekeurd. Het geld wordt voor de eerste aanroep vastgehouden en achteraf afgerekend uit de gateway.',
      },
      newRunKey: {
        title: 'Eén begrensde modelsleutel per Run',
        text: 'Een uitgelekte sleutel is hooguit het budget van één Run waard en vervalt met die Run, want elke Run krijgt een eigen sleutel achter een proxy waar de agent niet omheen kan.',
      },
      newVerified: {
        title: 'Wijzigingen gecontroleerd buiten de agent, en ondertekend',
        text: 'De agent kijkt zijn eigen huiswerk niet na. De checks draaien opnieuw buiten zijn werkruimte en de wijziging krijgt een ondertekende attestatie.',
      },
      newForgejo: {
        title: 'Forgejo als volwaardige forge',
        text: 'Voor teams die hun code zelf hosten, krijgt Forgejo dezelfde behandeling als GitHub en GitLab.',
      },
      newInHouse: {
        title: 'Besturing en agents allebei in je eigen cluster',
        text: 'Moeten code en verslagen binnen de deur blijven, dan hoeft niets van Unfold of Ploeg ergens anders te draaien.',
      },
      newTakeOver: {
        title: 'Werk van een lopende agent overnemen en teruggeven',
        text: 'Zit een agent er dichtbij maar komt hij niet verder, dan maak jij het lastige deel af op zijn branch en gaat de volgende Run verder vanaf jouw commit.',
      },
      newOwnSessions: {
        title: 'Je eigen sessies naast de Runs van de agents',
        text: 'Mensen en agents werken aan dezelfde backlog, dus botsingen op één branch worden gemeld.',
      },
      newClientApproves: {
        title: 'Een klant keurt de exacte commit goed',
        text: 'Voor bureaus van wie de klanten werk aftekenen, hoort het akkoord bij de commit die een developer heeft gereviewd. Het klantportaal dat dit akkoord ophaalt, is gepland.',
      },
      newBillPerItem: {
        title: 'Factureren per geaccepteerd Work Item',
        text: 'Een bureau rekent af op opgeleverd werk, dus de factuurregel volgt de acceptatie en niet het aantal plekken, credits of tokens.',
      },
      newMcpTask: {
        title: 'Een overdracht die je AI-app volgt',
        text: 'De overdracht is een MCP-taak, dus je AI-app houdt hem bij tot het pull request klaarstaat.',
      },
      nextJira: {
        title: 'Overdragen vanuit Jira',
        text: 'Als volgende tracker aan de beurt, als Atlassian Forge-app. Nu leest Unfold taken uit Jira Cloud, maar kan het ze nog niet overdragen.',
      },
      nextIssues: {
        title: 'GitHub Issues en GitLab-issues overdragen vanuit Unfold',
        text: 'Nu gaan GitHub Issues via Ploeg met een label of assignee, en GitLab-issues kun je alleen lezen.',
      },
      nextLinear: {
        title: 'Linear, als Linear-agent',
        text: 'Een Unfold-Team dat in Linear verschijnt als agent, via de agentsessies van Linear.',
      },
      nextTrackers: {
        title: 'Andere trackers op aanvraag',
        text: 'Elk als adapter in het trackerregister, zodat er geen gedeelde code verandert.',
      },
      nextPsa: {
        title: 'Factuurregels in Teamleader, Moneybird en Exact',
        text: 'Na Simplicate, in die volgorde. Je eigen pakket verstuurt de e-factuur via Peppol; Unfold doet dat nooit zelf.',
      },
      nextGateway: {
        title: 'Een tweede modelgateway',
        text: 'Envoy AI Gateway naast LiteLLM, via één gatewaycontract in Ploeg om een begrensde sleutel aan te maken en de kosten uit te lezen.',
      },
      nextPreview: {
        title: 'Een previewomgeving per pull request',
        text: 'Elk pull request krijgt een draaiende preview om te bekijken, in je eigen pipeline.',
      },
      nextPortal: {
        title: 'Klantportaal',
        text: 'Klanten sturen verzoeken in, keuren Work Items goed en tekenen opgeleverd werk af op één plek, met per klant een vaste goedkeurder (Client Portal).',
      },
      nextHosted: {
        title: 'Gehoste Unfold voor bureaus',
        text: 'Een gehoste dienst op een gehuurd cluster in de EU, één Tenant per bureau, met dezelfde open code.',
      },
      nextQuotes: {
        title: 'Een offerte per Work Item',
        text: 'Omvang en prijs liggen vast voordat het werk begint, en de vergoeding wordt alleen bij acceptatie gerekend. Er zijn nog geen prijzen gepubliceerd.',
      },
      nextKnowledge: {
        title: 'Kennis per organisatie',
        text: 'Agents krijgen hun briefing uit een kennisbank die per organisatie wordt bijgehouden.',
      },
      nextHarnessPick: {
        title: 'Per Work Item de agenttool kiezen',
        text: 'Werk dat in Unfold start, draait in Ploeg, met per Work Item een gekozen agenttool.',
      },
      nextSharedAccounts: {
        title: 'Gedeelde accounts binnen een organisatie',
        text: 'Projecten delen trackeraccounts en repositories binnen één organisatie, en elk Work Item houdt één herkomst.',
      },
      nextTrackerSuite: {
        title: 'Eén testsuite voor elke trackeradapter',
        text: 'Een conformiteitssuite in Unfold waar elke trackeradapter doorheen moet, zoals Ploeg die al heeft.',
      },
      nextTls: {
        title: 'TLS door Ploeg zelf',
        text: 'Nu spreekt Ploeg gewoon HTTP binnen het cluster, en het ondersteunde profiel vraagt versleuteling door de CNI of een mesh.',
      },
      nextIsolationFloor: {
        title: 'Een minimale isolatie per Run',
        text: 'Een Run geeft aan welke isolatie hij minimaal nodig heeft, en draait alleen waar dat kan.',
      },
    },
  },
  audienceNav: {
    agencies: 'Voor bureaus',
    teams: 'Voor engineering leads',
    developers: 'Voor developers',
    platform: 'Voor platformengineers',
  },
  chooser: {
    kicker: 'Voor wie',
    title: 'Wie ben jij?',
    intro:
      'Hetzelfde Work Item ziet er vanuit elke stoel anders uit. Kies de jouwe en zie het bewijs dat voor jou telt.',
    doors: {
      agencies: {
        role: 'Ik heb een bureau',
        job: 'Klantwerk aan agents geven en weten wat elke klant kost.',
      },
      teams: {
        role: 'Ik leid een engineeringteam',
        job: 'Agents laten uitgeven en pushen zonder de controle kwijt te raken.',
      },
      developers: {
        role: 'Ik schrijf de code',
        job: 'Overdragen vanuit de tracker, en de branch terugpakken als de agent vastloopt.',
      },
      platform: {
        role: 'Ik beheer het platform',
        job: 'Het op je eigen cluster draaien, zonder echte sleutels in de agent.',
      },
    },
    features: 'Alle functies, met hun status',
    integrations: 'Waar het mee koppelt, en hoe je er zelf een toevoegt',
  },
  tenLines: {
    kicker: 'In tien regels',
    title: 'Wat het nu al doet.',
    intro:
      'Alle tien zijn nu beschikbaar. De volledige lijst heeft de rest, elke regel met zijn status.',
    items: [
      {
        title: 'Overdragen vanuit de tracker die je al gebruikt.',
        text: 'Wijs een taak in ClickUp of Vikunja toe aan een agent-Team en je krijgt een pull request terug.',
      },
      {
        title: 'Uitgaven worden goedgekeurd voordat ze gebeuren.',
        text: 'Elke Run krijgt een budget voor de eerste modelaanroep, en bij het overdragen zie je de limiet van het Team en wat er nog over is.',
      },
      {
        title: 'Agents stellen voor, mensen mergen.',
        text: 'Werk komt binnen als pull request op je forge, en Unfold merget het nooit.',
      },
      {
        title: 'Weten wat op je wacht, en waarom.',
        text: 'Vastgelopen werk staat gegroepeerd onder een gewone reden, met bij elke reden de ene actie die het oplost.',
      },
      {
        title: 'Een lopende agent overnemen en het werk teruggeven.',
        text: 'Laat een Run stoppen op het eerstvolgende veilige punt, maak het af in je eigen editor en geef het terug op dezelfde branch.',
      },
      {
        title: 'Elke AI-wijziging is herkenbaar.',
        text: 'Pull requests, reacties en commits melden dat een agent ze schreef, en per commit staat vast welke regels van AI komen.',
      },
      {
        title: 'Zie wat elke Run, elk Work Item en elke klant kost.',
        text: 'Kosten, tokens en modellen per Run, kosten per gemerged Work Item, en een FinOps FOCUS-export.',
      },
      {
        title: 'Een sluitend verslag van wie wat deed.',
        text: 'Elke actie wordt vastgelegd met de persoon, de app die hij gebruikte en zijn bevestiging, in een OCSF-audittrail met hashketen.',
      },
      {
        title: 'Werken vanuit VS Code, Claude Code of je AI-app.',
        text: 'Volg, beantwoord en stuur hetzelfde Work Item bij vanuit de tool die je open hebt.',
      },
      {
        title: 'Zelf gehost en open source.',
        text: 'Apache-2.0, geïnstalleerd met één Helm-chart die de Ploeg bevat waarmee hij is getest.',
      },
    ],
    features: 'Bekijk alle functies',
    integrations: 'Bekijk de integraties',
  },
  audience: {
    decisionKicker: 'Je eerste vraag',
    proofKicker: 'Het bewijs',
    featuresKicker: 'Jouw functies',
    featuresTitle: 'De functies die voor jou het meest tellen.',
    featuresIntro:
      'Alles hier is beschikbaar, tenzij er In Labs of Experimenteel bij staat. De volledige lijst heeft de rest.',
    allFeatures: 'Bekijk alle functies',
    nextKicker: 'Wat eraan komt',
    nextTitle: 'Gepland voor jou, nog niet gebouwd.',
    nextIntro: 'Besloten of voorgesteld, in de volgorde waarin we het willen bouwen. Zonder data.',
    others: 'Bekijk ook',
    today: 'Unfold is nu zelf gehost, open source en experimenteel (0.x).',
    sources: 'Waar deze beweringen vandaan komen',
  },
  agencies: {
    eyebrow: 'Voor bureaus van 5 tot 80 mensen',
    hookLine: 'Eén geaccepteerd Work Item.',
    hookAccent: 'Eén regel op de factuur.',
    category:
      'Unfold is zelf gehoste agentorkestratie voor bureaus. AI-agents maken van de Work Items van je klanten pull requests, binnen een budget dat vastligt voordat het werk begint. Je ziet wat elke klant kost, en je developers bepalen wat er wordt geaccepteerd.',
    decision:
      'Kan ik klantwerk aan agents geven zonder geld te verliezen, of het vertrouwen van mijn klant?',
    decisionText:
      'Eerst het geld: er gaat niets uit voordat een budget is goedgekeurd, en de kosten van elke Run komen terecht bij de klant voor wie hij draaide. Dan het vertrouwen: een developer reviewt elk pull request, en de klant kan akkoord geven op precies de commit die is gereviewd.',
    object: {
      label: 'Een Work Item wordt één factuurregel',
      caption:
        'Illustratie, geen echte factuur. De titel van het Work Item komt uit de deterministische demo. Factuurregels zitten in Labs, en er staat geen prijs bij omdat jij die bepaalt.',
      client: 'Klant',
      clientValue: 'Jouw klant',
      workItem: 'Work Item',
      accepted: 'Geaccepteerd',
      acceptedValue: 'Gemerged door je developer',
      cost: 'Modelkosten',
      costValue: 'Afgerekend uit de gateway, geboekt op deze klant',
      price: 'Prijs',
      priceValue: 'Bepaal jij',
      destination: 'Gaat naar',
      destinationValue: 'Simplicate, of een CSV- of UBL-bestand',
      stamp: 'Geaccepteerd',
    },
    ctaTitle: 'Gehoste Unfold voor bureaus is gepland.',
    ctaText:
      'Laat je adres achter, dan schrijven we als er iets te proberen valt of als we ontwerppartners zoeken. Nu al kun je Unfold op je eigen cluster draaien.',
    flow: {
      kicker: 'Kosten per klant',
      title: 'Waar het geld van één Run heen gaat.',
      intro:
        'Van het budget dat vastligt voor de eerste aanroep tot de regel die je klant ziet: elke stap is een gegeven dat je kunt exporteren.',
      steps: [
        {
          title: 'Vastgehouden voor de Run',
          text: 'Ploeg houdt het budget van de Run vast voor zijn eerste modelaanroep.',
        },
        {
          title: 'Afgerekend uit de gateway',
          text: 'De echte kosten worden later afgerekend uit de eigen logs van de gateway.',
        },
        {
          title: 'Geboekt op de klant',
          text: 'Een FOCUS-export zet je organisatie als factuuraccount en de klant als subaccount.',
        },
        {
          title: 'Eén regel na acceptatie',
          text: 'Een geaccepteerd Work Item wordt één regel in je factuurpakket, tegen jouw prijs.',
        },
      ],
    },
  },
  teams: {
    eyebrow: 'Voor engineering leads',
    hookLine: 'Elke uitgave goedgekeurd.',
    hookAccent: 'Elke stop uitgelegd.',
    category:
      'Met Unfold geven engineering leads werk aan AI-agents met een budget dat is goedgekeurd voor de eerste modelaanroep, een gewone reden bij elk Work Item dat op iemand wacht, en elke wijziging gemarkeerd als AI-werk voor wie hem reviewt.',
    decision:
      'Kan ik agents geld laten uitgeven en naar onze repositories laten pushen zonder de controle kwijt te raken?',
    decisionText:
      'Controle betekent hier dingen die je kunt nagaan. Ploeg keurt het geld goed voordat het werk begint. Een vastgelopen Work Item zegt waarom en wat het oplost. Bij elke wijziging staat wie erom vroeg, vanuit welke app, en welke regels een agent schreef.',
    object: {
      label: 'Het bord Needs you',
      caption:
        'De redenen zoals ze in de Now-weergave van Unfold staan (de interface is Engelstalig), met de actie die elke reden vraagt. Illustratie, zonder live gegevens en zonder aantallen.',
      title: 'Needs you',
      fixLabel: 'Wat het oplost',
      reasons: [
        {
          chip: 'Question for you',
          fix: 'Beantwoord de vraag. Het Work Item start opnieuw met jouw antwoord, zodat de volgende Runs het lezen.',
        },
        {
          chip: 'Budget ran out',
          fix: 'Maak het werk zelf af, of verhoog het budget van het Team in zijn configuratie.',
        },
        {
          chip: 'Reviewer still wants changes',
          fix: 'Lees de bevindingen. Maak de branch zelf af, of maak het ticket scherper.',
        },
        {
          chip: 'Checks did not pass',
          fix: 'Draai de checks van het Team op de branch om te zien welke faalt, en repareer dan de branch of de wispelturige check.',
        },
        {
          chip: 'Approved: merge it',
          fix: 'Lees het pull request en merge het op de forge. Met de merge is het Work Item klaar.',
        },
      ],
    },
    ctaTitle: 'Probeer het op je eigen backlog.',
    ctaText:
      'Unfold is zelf gehost en open source. Begin met de deterministische demo en volg daarna de handleiding om de hele stack op je eigen cluster te draaien.',
    cta: 'Lees de handleiding voor zelf hosten',
    record: {
      kicker: 'Bewijs bij elke wijziging',
      title: 'Wie wat deed, en welke regels een machine schreef.',
      intro: 'Twee verslagen beantwoorden de eerste vragen van een auditor of een reviewer.',
      auditTitle: 'In de audittrail',
      audit: [
        'Wie het deed, uit je identityprovider',
        'Met welke app: browser, editor of een AI-app',
        'Of diegene bevestigde, en wat er in die bevestiging stond',
        'OCSF-regels met een hashketen, te exporteren als CSV of JSON',
      ],
      changeTitle: 'Bij de wijziging zelf',
      change: [
        'Het pull request meldt dat een agent het schreef',
        'Reacties en commits dragen hetzelfde merkteken',
        'Agent Trace legt per commit vast welke regels van een agent komen',
        'Bevindingen van de reviewer staan naast de antwoorden van de schrijver',
      ],
    },
  },
  developers: {
    eyebrow: 'Voor developers',
    hookLine: 'Geef het weg.',
    hookAccent: 'Pak het terug.',
    category:
      'Unfold geeft een taak uit je tracker aan een Team van AI-agents, vanuit je tracker, VS Code, Claude Code of een MCP-app. Je volgt elke Run terwijl hij loopt, neemt de branch over op een veilig punt en geeft hem weer terug.',
    decision: 'Past dit bij hoe ik nu werk, en kan ik ingrijpen als de agent vastloopt?',
    decisionText:
      'Je draagt over vanaf de plek waar de taak al staat. Zit een Run er dichtbij maar komt hij niet verder, dan stopt hij op het eerstvolgende veilige punt. Jij maakt het lastige deel af op zijn branch, en de volgende Run gaat verder vanaf jouw commit.',
    object: {
      label: 'Eén branch, heen en weer',
      caption:
        'Illustratie van het overnemen en teruggeven. De branch en de commits komen niet uit een echte Run.',
      agent: 'Agents',
      you: 'Jij',
      paused: 'Run staat stil op een veilig punt',
      steps: [
        { lane: 'agent', text: 'In ClickUp toegewezen aan het Team' },
        { lane: 'agent', text: 'De schrijvende Run commit op de branch' },
        { lane: 'you', text: 'Jij neemt over: de Run stopt op het eerstvolgende veilige punt' },
        { lane: 'you', text: 'Jouw commits, op dezelfde branch' },
        { lane: 'you', text: 'Teruggeven met een notitie' },
        { lane: 'agent', text: 'De volgende Run gaat verder vanaf jouw commit' },
        { lane: 'agent', text: 'Pull request, gemarkeerd als AI-werk' },
      ],
    },
    ctaTitle: 'Zie een Shift op je eigen machine.',
    ctaText:
      'De deterministische demo past een opgenomen fix toe op een voorbeeldrepository en draait echte checks. Hij roept geen model aan en kost niets.',
    cta: 'Draai de demo zelf',
    surfaces: {
      kicker: 'Waar je werkt',
      title: 'Hetzelfde Work Item in elke tool die je open hebt.',
      intro:
        'Volg het, beantwoord het en stuur het bij waar je ook zit. Elke tool vraagt eerst voordat er iets wordt uitgegeven.',
    },
  },
  platform: {
    eyebrow: 'Voor platformengineers',
    hookLine: 'De agent heeft nooit',
    hookAccent: 'de sleutel.',
    category:
      'Unfold en Ploeg installeer je met één Helm-chart op je eigen Kubernetes. Elke Run krijgt een modelsleutel die tot zijn budget is begrensd, een pushproxy die alleen zijn eigen branch bereikt, en een pod achter een netwerkpolicy die standaard alles weigert.',
    decision: 'Kan ik dit op ons cluster draaien zonder agents onze sleutels te geven?',
    decisionText:
      'In de container van de agent staan alleen plaatshouders. De echte sleutels zitten in lokale proxy’s ernaast, worden voor één Run aangemaakt en ingetrokken als die klaar is. Ploeg is 0.x en experimenteel, en de supportmatrix zegt precies welke paden worden ondersteund en getest.',
    object: {
      label: 'Waar één Run bij mag',
      caption:
        'Schema van één Run in het ondersteunde profiel van Ploeg. Het afschermen van sleutels is live getest voor één agenttool en één Role, het dichtzetten van het netwerk op één cluster met Cilium.',
      namespace: 'Namespace',
      namespaceNote: 'Netwerkpolicy die standaard alles weigert, voor elke pod',
      pod: 'Workerpod',
      podNote: 'Geen Kubernetes-token, geen metadata-endpoint',
      vm: 'Optioneel: een eigen Kata-VM',
      agent: 'Agentcontainer',
      agentNote: 'Alleen plaatshouders',
      modelProxy: 'Proxy voor de modelsleutel',
      modelProxyNote: 'Sleutel begrensd tot het budget van deze Run, aan het eind ingetrokken',
      pushProxy: 'Pushproxy',
      pushProxyNote: 'Alleen de branch van deze Run, niets verwijderen',
      canary: 'Lokaassleutel',
      canaryNote: 'Duikt hij op in een commit, dan stopt de Run',
      gateway: 'Je LiteLLM-gateway',
      forge: 'Je forge',
    },
    ctaTitle: 'Installeer het waar je code al staat.',
    ctaText:
      'De handleiding loopt de hele stack door op je eigen cluster, desgewenst in de EU. De quickstart van Ploeg draait een eerste Run op een lokaal kind-cluster tegen een nepmodel, gratis.',
    cta: 'Lees de handleiding voor zelf hosten',
    matrix: 'Supportmatrix van Ploeg',
    quickstart: 'Quickstart van Ploeg',
    verify: 'Een release van Ploeg controleren',
    scope: {
      kicker: 'Wat wordt ondersteund',
      title: 'Wat wordt ondersteund, en wat nog niet.',
      intro:
        'Overgenomen uit de supportmatrix en de functielijst van Ploeg. Ploeg is 0.x en heeft nog geen stabiele release.',
      supported: {
        title: 'Ondersteund en getest',
        items: [
          'Kubernetes 1.30 en 1.37 getest in CI; 1.31 tot en met 1.36 ondersteund',
          'PostgreSQL 17 en 18 getest',
          'OpenHands, of elk programma dat de Task Spec leest',
          'GitHub via een GitHub App, en Forgejo 15 of nieuwer',
          'Afgeschermde sleutels, live getest voor één agenttool en één Role',
        ],
      },
      experimental: {
        title: 'Experimenteel',
        items: [
          'GitLab als forge: nog geen tokens per Run',
          'OpenCode, Qwen Code, Goose, Claude Code, Codex en Gemini CLI',
          'De chart upgraden en terugdraaien tussen releases',
          'Bevestigde acties via ploeg-mcp',
        ],
      },
      planned: {
        title: 'Gepland',
        items: [
          'TLS door Ploeg zelf',
          'Koppelingen bewaard in OpenBao of Vault',
          'Een minimale isolatie per Run',
          'De eerste stabiele release',
        ],
      },
    },
  },
  featuresPage: {
    kicker: 'Functies',
    hookLine: 'Alles wat het nu doet.',
    hookAccent: 'En wat eraan komt.',
    category:
      'De volledige lijst voor Unfold en Ploeg, de opensource-engine waar het op draait. Bij elke regel staat de status, zodat je ziet wat gebouwd is en wat gepland.',
    legend: 'Wat de statuslabels betekenen',
    legendAvailable: 'Elke functie is beschikbaar, tenzij er een label bij staat.',
    filters: 'De lijst filteren',
    audience: 'Voor wie',
    everyone: 'Iedereen',
    categoryFilter: 'Categorie',
    allCategories: 'Alles',
    shown: '{shown} van de {total} functies zichtbaar.',
    noscript: 'Filteren werkt alleen met JavaScript. Hieronder staan alle functies, per categorie.',
    jump: 'Categorieën',
    empty: 'Geen functie past bij allebei de filters.',
    reset: 'Toon alles',
    sources: 'Elke regel is nagelopen tegen de lijsten in de broncode:',
    sourceUnfold: 'Unfold at a glance',
    sourcePloeg: 'Ploeg at a glance',
    sourceEngineering: 'Functies van Unfold per bounded context',
  },
  integrationsPage: {
    kicker: 'Integraties',
    hookLine: 'Prik in wat je draait.',
    hookAccent: 'Of maak de stekker zelf.',
    category:
      'Unfold bereikt je tracker, forge, modellen, editors, chat en factuurpakket via poorten: kleine interfaces in de eigen taal van Unfold of Ploeg. Elke tool is een adapter die onder een naam achter zijn poort is geregistreerd. Gebruik wat er al is, volg wat eraan komt, of voeg je eigen adapter toe.',
    boardKicker: 'Werkt nu met',
    boardTitle: 'Het poortenbord.',
    boardIntro:
      'Elke rij is een poort en elk tabje een adapter die erin zit. Tabjes zijn beschikbaar tenzij er een label bij staat; gestippelde tabjes zijn gepland, en in de open aansluiting past je eigen adapter.',
    registry: 'Adapterregister',
    standard: 'Open standaarden',
    contract: 'Contract gepland',
    yours: 'Jouw adapter',
    ports: {
      trackers: { name: 'Trackers', job: 'Waar werk vandaan komt en waar je het overdraagt.' },
      forges: { name: 'Forges', job: 'Waar het pull request terechtkomt.' },
      links: { name: 'Gekoppelde accounts', job: 'Iemands eigen token voor een tracker of forge.' },
      agents: { name: 'Agenttools', job: 'De agent die een Run aanstuurt, binnen Ploeg.' },
      gateway: { name: 'Modelgateway', job: 'Waar elke modelaanroep en elke sleutel langskomt.' },
      editors: { name: 'Editors en AI-apps', job: 'Waar mensen het werk volgen en bijsturen.' },
      notify: { name: 'Meldingen', job: 'Hoe iemand hoort dat er werk op hem wacht.' },
      billing: { name: 'Factuurpakketten', job: 'Waar geaccepteerd werk een factuurregel wordt.' },
      intake: { name: 'Verzoeken', job: 'Hoe het verzoek van een klant een Work Item wordt.' },
      identity: { name: 'Identiteit', job: 'Wie iemand is, en wanneer hij vertrekt.' },
      telemetry: { name: 'Telemetrie en audit', job: 'Wat naar je eigen monitoring gaat.' },
    },
    notes: {
      handoff: 'overdragen',
      read: 'alleen lezen',
      viaPloeg: 'via Ploeg',
      mergeRequest: 'merge request',
      anyProgram: 'Elk programma dat de Task Spec leest',
      files: 'CSV- en UBL 2.1-bestanden',
      form: 'Webformulier',
      email: 'E-mail',
      browser: 'Browser',
      agentPlugin: 'Codex, Copilot, Cursor en Kiro, als Agent Plugin',
      acpEditors: 'JetBrains, Zed en Neovim via ACP',
      mcpApps: 'claude.ai, ChatGPT en Copilot via MCP',
      focus: 'Export in FinOps FOCUS 1.4',
      ocsf: 'OCSF-audittrail',
      events: 'CloudEvents-webhooks',
      reporting: 'meldt zich',
    },
    standardsKicker: 'Op de lijn',
    standardsTitle: 'Open standaarden, zodat één implementatie elke tool bereikt.',
    standardsIntro:
      'Waar een standaard bestaat, spreekt Unfold die in plaats van een eigen formaat te verzinnen. Deze zijn nu gebouwd.',
    standards: {
      mcp: 'AI-apps roepen de tools van Unfold aan, met een bevestiging voor elke wijziging. Revisie 2026-07-28, met de Apps-extensie.',
      acp: 'Editors zoals Zed, Neovim en de JetBrains-IDE’s praten met Unfold als agent.',
      openapi:
        'De HTTP-API van Unfold is beschreven in OpenAPI 3.1 en wordt door elke installatie geserveerd.',
      oidc: 'Inloggen met elke OIDC-provider, en tokenuitwisseling volgens RFC 8693 om Ploeg te laten weten wie het vroeg.',
      cloudevents:
        'Gebeurtenissen rond Work Items, pull requests en Runs als CloudEvents 1.0, ondertekend als Standard Webhooks.',
      ocsf: 'Auditregels in OCSF 1.9.0, aan elkaar gehasht zodat knoeien opvalt.',
      focus: 'Modelkosten en -verbruik als FinOps FOCUS 1.4, per Run of per Work Item en dag.',
      openfeature: 'Feature flags achter OpenFeature, uitgelezen via OFREP.',
      scim: 'Je identityprovider maakt mensen aan en haalt ze weg via SCIM 2.0.',
      otlp: 'Telemetrie en audit gaan de deur uit als OpenTelemetry (OTLP).',
      intoto:
        'Elke vastgelegde wijziging heeft een in-toto-attestatie, en Agent Trace legt vast welke regels van AI komen.',
    },
    extendKicker: 'Gemaakt om uit te breiden',
    extendTitle: 'Voeg je eigen adapter toe.',
    extendIntro:
      'Een nieuwe tool is een nieuwe adapter achter een bestaande poort, geregistreerd onder een naam. Gedeelde code noemt nooit een leverancier, en een bewakingstest in Unfold faalt zodra dat toch gebeurt. Voor sommige poorten is er een gedeelde testsuite waar elke adapter doorheen moet; voor andere is die voorgesteld. Hieronder staat welke welke is.',
    extendSteps: [
      {
        title: 'Kies de poort.',
        text: 'Trackers, forges, gekoppelde accounts, meldingskanalen, factuurpakketten en verzoeken hebben elk een register in Unfold. Agenttools en de eigen tracker-intake van Ploeg zijn poorten in Ploeg.',
      },
      {
        title: 'Schrijf de adapter en registreer hem.',
        text: 'Implementeer de interface van de poort en registreer de adapter onder een naam. Optionele mogelijkheden, zoals overdragen bij een tracker, geef je aan, en gedeelde code vraagt eerst of ze er zijn.',
      },
      {
        title: 'Draai de gedeelde tests, waar die er zijn.',
        text: 'Bestaat er een conformiteitssuite, dan moet je adapter daar doorheen. De tabel laat zien waar dat nu zo is.',
      },
    ],
    table: {
      caption: 'Hoe een nieuwe adapter binnenkomt, per poort',
      port: 'Poort',
      how: 'Hoe een nieuwe binnenkomt',
      tests: 'Gedeelde tests nu',
    },
    rows: {
      trackersUnfold: {
        port: 'Trackers, in Unfold',
        how: 'Een adapter in het trackerregister, die aangeeft wat hij kan.',
        tests:
          'Een bewakingstest houdt trackernamen uit gedeelde code. Een conformiteitssuite is voorgesteld in Unfold ADR 0063.',
      },
      trackersPloeg: {
        port: 'Trackers, in Ploeg',
        how: 'Een adapter op de trackerpoort van Ploeg, voor intake en terugschrijven.',
        tests: 'Een conformiteitssuite in Ploeg. ClickUp komt erdoorheen.',
      },
      forges: {
        port: 'Forges',
        how: 'Een publisher in het register van Unfold, en een forge-adapter in Ploeg.',
        tests: 'Een conformiteitssuite voor forges is voorgesteld in Ploeg.',
      },
      agents: {
        port: 'Agenttools',
        how: 'Een ACP-adapter in Ploeg, of elk programma dat de Task Spec leest en een Outcome Report schrijft.',
        tests:
          'Een gedeelde conformiteitskern, plus een geplande oefening tegen een vijandige repository.',
      },
      others: {
        port: 'Meldingen, factuurpakketten, verzoeken, gekoppelde accounts',
        how: 'Een adapter die onder een naam in het register van die poort staat.',
        tests: 'Nog geen gedeelde suite.',
      },
      gateway: {
        port: 'Modelgateway',
        how: 'Een gatewaycontract in Ploeg, met LiteLLM en Envoy AI Gateway erachter.',
        tests: 'Nog niet gebouwd.',
      },
    },
    rulesKicker: 'Regels waar we ons aan houden',
    rulesTitle: 'Niet vast te zitten, zo is besloten.',
    rulesIntro:
      'Een aangenomen architectuurbesluit (ADR-0050) legt deze regels vast voor elke integratie. Het zijn regels voor nieuw werk, geen bewering dat alles al af is.',
    rules: [
      {
        title: 'Een nieuwe tool is een nieuwe adapter.',
        text: 'Elke integratie zit achter een interface. Een leverancier toevoegen betekent nooit een vaste lijst aanpassen.',
      },
      {
        title: 'Standaarden op de lijn.',
        text: 'Unfold schrijft alleen een eigen interface waar geen standaard bestaat, zoals voor pull requests of tracker-API’s.',
      },
      {
        title: 'Wat de deur uitgaat, gaat in een standaardformaat.',
        text: 'Gebeurtenissen als CloudEvents, telemetrie als OTLP, audit als OCSF, kosten als FOCUS.',
      },
      {
        title: 'Jouw modelsleutel, jouw gateway.',
        text: 'Elke functie werkt met je eigen modelsleutel via je eigen gateway. Je hoeft nergens credits bij Unfold voor te kopen.',
      },
      {
        title: 'De gehoste dienst draait straks dezelfde code.',
        text: 'Niets wordt achtergehouden uit de zelf gehoste versie. Hosten is beheer, geen fork.',
      },
    ],
    leaveTitle: 'Je gegevens kunnen weg.',
    leaveText:
      'Een beheerder exporteert alles wat Unfold over een organisatie bewaart als JSON Lines: één bestand per soort gegeven, elk met een JSON Schema, plus een verwijzing naar wat Ploeg bewaart. Daar is geen supportticket voor nodig.',
    nextKicker: 'Wat eraan komt',
    nextTitle: 'De integraties die we hierna bouwen, op volgorde.',
    nextIntro: 'Alles hieronder is besloten maar nog niet gebouwd. Er staat geen datum bij.',
    nextGroups: {
      trackers: 'Trackers',
      billing: 'Factuurpakketten',
      gateway: 'Modelgateway',
      delivery: 'Oplevering en klanten',
      tests: 'Gedeelde tests',
    },
    editorsNote:
      'PhpStorm en de andere JetBrains-IDE’s koppelen nu al via ACP. Dat blijft Experimenteel tot het in een echte installatie is geprobeerd.',
    ctaTitle: 'Mis je een adapter?',
    ctaText:
      'Laat ons weten welke tool. Een tracker of factuurpakket is één adapter in een register, en de broncode is open als je hem liever zelf schrijft.',
    ctaSource: 'Bekijk de broncode',
    adr: 'Lees het besluit (ADR-0050)',
    portsAdr: 'Lees het besluit over poorten (ADR 0063)',
  },
};
