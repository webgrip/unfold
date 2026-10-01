export const en = {
  meta: {
    homeTitle: 'Unfold: from Work Item to a pull request you review',
    homeDescription:
      'Unfold runs AI agents on your Work Items with a budget and short-lived credentials, and stops at a pull request for a person to review. Self-hosted, open source, experimental.',
    notFoundTitle: 'Page not found',
    notFoundDescription: 'This page does not exist.',
    ogImageAlt: 'Unfold',
  },
  a11y: {
    skipLink: 'Skip to content',
    mainNav: 'Main',
    homeLink: 'Unfold home',
    themeToggle: 'Dark theme',
    switchLocale: 'Lees deze pagina in het Nederlands',
  },
  nav: {
    loop: 'How it works',
    parts: 'Parts',
    status: 'Status',
    source: 'Source',
  },
  hero: {
    eyebrow: 'Open source · self-hosted · experimental',
    title: 'Turn Work Items into pull requests that are ready for review.',
    lede: 'You give Unfold a unit of work. It runs AI agents on it with a budget and credentials that expire, and stops when a pull request is ready for a person to read. Merging stays with you.',
    primary: 'View the source',
    secondary: 'Run the demo',
    demoNote:
      'The demo is deterministic. It runs a fixed fixture, makes no model calls and spends nothing.',
  },
  loop: {
    title: 'From Work Item to pull request',
    intro:
      'A Shift is the whole attempt at one Work Item. It ends at a pull request, and a person takes it from there.',
    steps: [
      {
        term: 'Work Item',
        text: 'Something you have decided to do, or a problem described well enough that a solution can be conceived. It comes from your tracker or from Vloer.',
      },
      {
        term: 'Shift',
        text: 'Ploeg opens a Shift and runs a Team against the Work Item. Each Run is one Role at work, a writer or a reviewer, with its own budget and credentials.',
      },
      {
        term: 'Pull request',
        text: 'The Shift ends with a pull request on your forge. The actual change and the output of the checks that ran come with it as evidence.',
      },
      {
        term: 'Human review',
        text: 'A person reads the pull request and decides. Unfold never merges, and it never deploys to production.',
      },
    ],
    planned:
      'Planned, not built yet: a preview environment for every pull request, and size limits that keep each pull request small enough to understand in one sitting.',
  },
  parts: {
    title: 'Two applications, one version',
    items: [
      {
        name: 'Ploeg',
        role: 'The engine',
        text: 'Ploeg authorizes, budgets and runs every agent Run. It takes Work Items from trackers such as Vikunja and ClickUp, decides who may write each branch, and keeps the record of every Shift in PostgreSQL. Ploeg is Dutch for crew.',
      },
      {
        name: 'Vloer',
        role: 'The workbench',
        text: 'Vloer is the front end, in the browser or in VS Code. You start work there, steer agents while they run and review what they produced. Every Run it starts goes through Ploeg. Vloer is Dutch for floor, as in shop floor.',
      },
    ],
    version:
      'Both live in one repository and are released together under one Unfold version number.',
  },
  guards: {
    title: 'What Unfold guards',
    items: [
      {
        title: 'Budgets',
        text: 'Ploeg sets a budget before a Run starts and blocks its model access once the budget is spent. Raising a budget is an administrator’s decision.',
      },
      {
        title: 'Scoped credentials',
        text: 'A Run gets credentials for its own work only, and they expire. Management credentials stay in the controller and never reach an agent.',
      },
      {
        title: 'Evidence',
        text: 'A claim about a Result comes with something you can inspect: the change itself and the real output of the checks that ran.',
      },
      {
        title: 'A person decides',
        text: 'A reviewer Role’s approval counts as evidence, and acceptance is a human call. Merging and releasing stay with the people who own the repository.',
      },
    ],
  },
  open: {
    title: 'Self-hosted and open source',
    text: 'Unfold runs on your own Kubernetes cluster. It does not host models; it reaches your providers through your LiteLLM gateway. The code is Apache-2.0 licensed.',
    license: 'Read the licence',
    docs: 'Read the documentation',
  },
  status: {
    title: 'Where it stands',
    items: [
      {
        label: 'Experimental',
        text: 'Versions are 0.x release candidates. Each qualification covers a specific tested path, not every provider or deployment.',
      },
      {
        label: 'In use',
        text: 'Unfold runs self-hosted for its owner, on the owner’s own backlog.',
      },
      {
        label: 'Planned',
        text: 'A hosted Unfold for agencies, with the cost of each Work Item agreed before work starts. None of it exists yet.',
      },
    ],
  },
  cta: {
    title: 'Read the code, or see it work',
    text: 'The demo starts Ploeg, Vloer and PostgreSQL on your machine and repairs a small fixture repository. It is deterministic: it makes no model calls and needs no credentials, so it costs nothing.',
  },
  footer: {
    summary: 'Unfold turns Work Items into pull requests that are ready for human review.',
    source: 'Source',
    docs: 'Documentation',
    license: 'Apache-2.0 licence',
    fontLicense: 'Archivo font licence',
    origin: 'Made in the Netherlands.',
  },
  notFound: {
    title: 'This page does not exist',
    text: 'The link may be old, or the address may contain a typo.',
    home: 'Go to the home page',
  },
};

export type Dictionary = typeof en;
