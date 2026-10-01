export const en = {
  meta: {
    homeTitle: 'Unfold: from Work Item to a pull request you review',
    homeDescription:
      'Unfold runs AI agents on your Work Items with a budget and short-lived credentials, and stops at a pull request for a person to review. Self-hosted, open source, experimental.',
    privacyTitle: 'Privacy statement',
    privacyDescription:
      'What the Unfold sign-up form stores, why, for how long, and how to withdraw.',
    thanksTitle: 'You are on the list',
    thanksDescription: 'Your sign-up for news about Unfold was saved.',
    problemTitle: 'Your sign-up was not saved',
    problemDescription: 'The sign-up form could not save your details.',
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
    how: 'How it works',
    pricing: 'Pricing',
    status: 'Status',
    signup: 'Join the list',
    source: 'Source',
  },
  hero: {
    eyebrow: 'Open source · self-hosted · experimental',
    title: 'Turn Work Items into pull requests that are ready for review.',
    lede: 'You give Unfold a unit of work. It runs AI agents on it with a budget and credentials that expire, and stops when a pull request is ready for a person to read. Merging stays with you.',
    primary: 'Join the list',
    secondary: 'See how it works',
    source: 'Or read the source',
    demoNote:
      'The animations and the recording on this page come from the deterministic demo. It runs a fixed fixture, makes no model calls and spends nothing.',
    visual: {
      label:
        'Animation: a Work Item takes off as a paper plane, passes a writer Run, the checks and a reviewer Run, and lands as a pull request that waits for a person.',
      workItem: 'Work Item',
      writer: 'Writer Run',
      checks: 'Checks pass',
      reviewer: 'Reviewer approves',
      pullRequest: 'Pull request',
      waiting: 'Waiting for your review',
      merge: 'Merging is your call',
    },
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
  how: {
    title: 'Watch one Shift',
    intro:
      'The same small job, shown two ways. An order service rounds 1.005 to 1.00 instead of 1.01. Both come from the deterministic demo that ships with Vloer, so you can run it yourself and get the same result.',
    walkthrough: {
      title: 'Step by step',
      badge: 'Simulation of the deterministic demo — no model calls, no spend',
      lead: 'Each line is an event the demo recorded when it ran. The page plays them back at the pace they happened.',
      play: 'Play',
      replay: 'Play again',
      clock: 'Elapsed',
      seconds: 's',
      workItem: 'Work Item',
      repository: 'Repository',
      budget: 'Budget',
      spent: 'Spent',
      budgetNote: 'Set before the Shift starts. The demo calls no model, so nothing is spent.',
      events: {
        workItem: 'Work Item created',
        shiftStarted: 'Shift started',
        runStarted: 'Run started',
        runFinished: 'Run finished',
        approved: 'Reviewer approves the change',
        baseline: 'Checks run before the fix, and fail as expected:',
        verification: 'Checks run after the fix:',
        review: 'The reviewer runs the checks again on its own:',
        passed: 'pass',
        failed: 'fail',
        edit: 'Edits',
        changeReady: 'Change ready for review',
        shiftFinished: 'Shift finished. Nothing is merged.',
      },
      result: 'Ready for your review',
      resultNote:
        'In the demo the change stays on your machine. With Ploeg it arrives as a pull request on your forge.',
      diff: 'The change the demo made',
    },
    video: {
      title: 'In the workbench',
      lead: 'The same demo in Vloer, recorded by a script that clicks through it. Nothing was set up by hand.',
      caption:
        'Recording of the deterministic demo in Vloer: no model calls, no spend. Recorded with Vloer',
      fallback: 'Your browser cannot play this video. Download it:',
    },
    replay: {
      title: 'Every event',
      text: 'A full replay of the demo, which lets you step through a whole Shift at your own pace.',
      link: 'Open the full replay',
      soon: 'Coming soon.',
    },
    runIt: 'Run the demo yourself',
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
  pricing: {
    title: 'How hosted Unfold will be priced',
    badge: 'Planned · not on sale yet',
    intro:
      'Hosted Unfold does not exist yet. This is the price model we have decided on. The prices themselves are published after the pilot, not before.',
    items: [
      {
        title: 'Pay for accepted work',
        text: 'A delivery fee is charged only when your reviewer accepts the pull request, by approving or merging it. The fee follows the size of the ticket, not the hours spent.',
      },
      {
        title: 'Every attempt pays its tokens',
        text: 'Model tokens are charged for every attempt, at cost plus a fixed markup that we publish. Rejected work still pays for its tokens, so rejecting is never free.',
      },
      {
        title: 'The Budget comes first',
        text: 'Each Work Item gets a Budget before work starts, and it is never raised silently. A Shift that reaches it stops and offers to split the work.',
      },
      {
        title: 'You set your own prices',
        text: 'An agency decides what it charges its own clients. Unfold does not set those prices.',
      },
      {
        title: 'Self-hosting costs nothing',
        text: 'Run Unfold on your own cluster and Unfold charges you nothing. You pay your own model provider and your own infrastructure.',
      },
    ],
    ticket: 'A ticket is a Work Item with a size and a price that your client approved.',
    cta: 'Want to hear when prices go live, or help shape them as a design partner?',
    button: 'Join the list',
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
  open: {
    title: 'Self-hosted and open source',
    text: 'Unfold runs on your own Kubernetes cluster. It does not host models; it reaches your providers through your LiteLLM gateway. The code is Apache-2.0 licensed.',
    license: 'Read the licence',
    docs: 'Read the documentation',
    source: 'View the source',
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
  signup: {
    title: 'Hear about it first',
    lead: 'Leave your email address and tell us what interests you. We write when there is something for you to try, and we do not use your address for anything else.',
    email: 'Email address',
    interest: 'What interests you?',
    interests: {
      hosted: 'Hosted Unfold',
      agency: 'As an agency, for your clients',
      both: 'Both',
      selfHost: 'Self-host with support',
    },
    consentBefore:
      'I agree that Unfold stores my email address and my choice to tell me about Unfold, as the',
    consentLink: 'privacy statement',
    consentAfter: 'describes. I can withdraw at any time.',
    honeypot: 'Leave this field empty',
    submit: 'Sign up',
    sending: 'Sending…',
    note: 'No cookies and no trackers. Your address is stored in the EU.',
    success: 'Thanks, you are on the list.',
    successText: 'To be removed later, send an email to',
    errors: {
      invalid_email: 'Check the email address; it looks incomplete.',
      invalid_interest: 'Choose what interests you.',
      consent_required: 'Tick the box to agree. Without it we cannot store your address.',
      unavailable: 'Saving failed on our side. Try again later, or send an email to',
      network: 'The server could not be reached. Check your connection and try again.',
    },
  },
  thanks: {
    title: 'You are on the list',
    text: 'Thanks for signing up. We will write when there is something for you to try.',
    withdraw: 'Changed your mind? Send an email to',
    home: 'Back to the home page',
  },
  problem: {
    title: 'Your sign-up was not saved',
    text: 'Check that the email address is complete, that you chose what interests you and that you ticked the consent box. Then try again.',
    retry: 'Back to the form',
    contact: 'If it keeps failing, send an email to',
  },
  privacy: {
    title: 'Privacy statement',
    version: 'Version of 2 October 2026',
    intro:
      'This statement covers the sign-up form on this site. The site sets no cookies and has no analytics or trackers.',
    sections: [
      {
        title: 'Who is responsible',
        text: 'WebGrip, the business of Ryan Grippeling in Enschede, the Netherlands, is the controller. Chamber of Commerce (KvK) number 75281120. Contact: ryan@webgrip.nl.',
      },
      {
        title: 'What we store',
        text: 'Your email address, the interest you chose, the language of the page you used, the version of this statement you agreed to, and when you signed up. We do not store your IP address or anything about your browser or device.',
      },
      {
        title: 'Why',
        text: 'To tell you about Unfold: when hosted Unfold or support for self-hosting becomes available, and to ask whether you want to become a design partner. We use your address for nothing else, and we do not sell or share it.',
      },
      {
        title: 'Legal basis',
        text: 'Your consent, which you give by ticking the box (Article 6(1)(a) of the GDPR). You can withdraw it at any time. Withdrawing does not make earlier use unlawful.',
      },
      {
        title: 'How long we keep it',
        text: 'Until you withdraw, and at most 24 months after you last signed up. A job runs every day and deletes older sign-ups.',
      },
      {
        title: 'Who processes it for us',
        text: 'This site and its form run on Cloudflare, which acts as our processor. Your sign-up is stored in a Cloudflare D1 database restricted to the EU jurisdiction. The code that receives the form can run in any Cloudflare data centre, and like any website Cloudflare sees your IP address to deliver the page; the form does not save it, and request logging is switched off for the form.',
      },
      {
        title: 'Your rights',
        text: 'You can ask to see, correct or delete your data, to restrict its use or object to it, and to receive it in a portable form. Send an email to ryan@webgrip.nl and you get an answer within a month. You can also complain to the Dutch data protection authority, the Autoriteit Persoonsgegevens.',
      },
      {
        title: 'How to withdraw',
        text: 'Send an email to ryan@webgrip.nl from the address you signed up with, and we delete it. You can always sign up again later.',
      },
      {
        title: 'On your device',
        text: 'If you switch between the light and dark theme, your browser remembers that choice in its local storage. It stays on your device and is never sent to us.',
      },
    ],
  },
  footer: {
    summary: 'Unfold turns Work Items into pull requests that are ready for human review.',
    source: 'Source',
    docs: 'Documentation',
    license: 'Apache-2.0 licence',
    fontLicense: 'Archivo font licence',
    privacy: 'Privacy',
    origin: 'Made in the Netherlands.',
  },
  notFound: {
    title: 'This page does not exist',
    text: 'The link may be old, or the address may contain a typo.',
    home: 'Go to the home page',
  },
};

export type Dictionary = typeof en;
