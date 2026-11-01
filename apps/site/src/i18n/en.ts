export const en = {
  redesign: {
    heroLine: 'Agents work.',
    heroAccent: 'You decide.',
    heroIntro:
      'Turn a Work Item into a pull request with AI agents, explicit budgets and evidence you can inspect. You decide what gets merged.',
    explore: 'Explore a Shift',
    source: 'Read the source',
    category: 'Self-hosted agent orchestration',
    assemblyCaption: 'One Work Item. Unfolded into evidence.',
    unfoldAgain: 'Unfold again',
    architecture: 'Architecture',
    menu: 'Menu',
    recorded: 'Recorded demo',
    handoff: 'The handoff is yours.',
    handoffNote: 'Code, checks and a review. Nothing merged.',
    implementation: 'Implementer',
    independent: 'Reviewer',
    testsPass: '3 checks pass',
    localResult: 'Local demo result',
    oneChange: '1 file changed',
    demoBadge: 'Deterministic demo · no model calls · no spend',
    proof: [
      'Apache-2.0 licensed',
      'Self-hosted on Kubernetes',
      'Your models via LiteLLM',
      'Experimental · 0.x',
    ],
    howKicker: '01 / THE WORK, MADE VISIBLE',
    howTitle: 'One Shift. Every step in view.',
    howIntro:
      'A rounding bug. An implementer. An independent reviewer. Explore the recorded evidence from the deterministic demo that ships with Unfold.',
    stageLabel: 'Explore the recorded Shift',
    play: 'Play the Shift',
    pause: 'Pause',
    replay: 'Replay the Shift',
    complete: 'Shift complete. The result is ready for human review.',
    stages: [
      {
        label: 'The Work Item',
        title: 'Start with a clear piece of work.',
        text: 'The order service rounds 1.005 to 1.00 instead of 1.01. The Work Item asks for a minimal fix and independent verification.',
      },
      {
        label: 'The implementer',
        title: 'Reproduce. Change. Check.',
        text: 'The implementer reproduces the failing tests, changes one line, then runs the checks again. The outputs stay with the Shift.',
      },
      {
        label: 'The reviewer',
        title: 'A second Run checks the work.',
        text: 'The reviewer independently runs the checks and approves the change. That approval is evidence for a person to assess.',
      },
      {
        label: 'Your decision',
        title: 'The agents stop. You decide.',
        text: 'When you run the local demo, the change stays on your machine. Ploeg’s unattended worker workflow can open a pull request on your forge. Human review, merging and release stay with you.',
      },
    ],
    baseline: 'Before the fix',
    after: 'After the fix',
    reviewChecks: 'Independent review',
    passed: 'passed',
    failed: 'failed',
    command: 'Recorded command',
    diff: 'Recorded change · src/order.js',
    objective: 'Work Item objective',
    budget: 'Authorized demo budget',
    spent: 'Demo spend',
    reviewVerdict: 'Reviewer verdict',
    approved: 'Approved',
    merged: 'Merged',
    no: 'No',
    recording: 'Inspect the complete recording',
    recordingNote: 'Every event, its recorded timing and the original Unfold interface.',
    controlLine: 'The last word',
    controlAccent: 'is yours.',
    controlNote: 'Agents propose changes. People accept, merge and release.',
    guardKicker: '02 / BOUNDED BY DESIGN',
    guardTitle: 'Give agents work. Keep control.',
    guardIntro:
      'Inspect the change, trace the checks and decide whether the result is ready. When a Shift cannot finish, it stops for human attention.',
    archKicker: '03 / UNDER THE SURFACE',
    archTitle: 'One product. Clear responsibilities.',
    archIntro:
      'Ploeg authorizes and budgets managed execution. Unfold is where you start, steer and inspect the work. Both ship from one repository, under one Unfold version.',
    cluster: 'MANAGED EXECUTION',
    front: 'Browser / VS Code',
    engine: 'Authorization · budgets · orchestration',
    store: 'Shift record',
    gateway: 'Model gateway',
    providers: 'Your model providers',
    forge: 'Your forge',
    pullRequest: 'Pull request + evidence',
    architectureNote:
      'Conceptual view. Pull request publication is available in Ploeg’s unattended worker workflow; Unfold’s managed candidate path does not publish yet.',
    workerPath: 'Unattended worker workflow',
    openKicker: '04 / BUILD WITH YOUR EYES OPEN',
    openTitle: 'Open source. On your terms.',
    openIntro:
      'Run Unfold on your infrastructure, inspect its source and connect your own providers through LiteLLM. It is experimental software, used on its owner’s backlog.',
    statusTitle: 'What exists. What comes next.',
    pricingTitle: 'A clear model for hosted work.',
    signupKicker: 'FOLLOW THE WORK',
    signupTitle: 'Be part of what unfolds next.',
  },
  meta: {
    homeTitle: 'Unfold: from Work Item to a pull request you review',
    homeDescription:
      'Unfold runs AI agents on your Work Items within a budget set before work starts, and stops at a pull request for a person to review. Self-hosted, open source, experimental.',
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
    featuresTitle: 'Every feature, with its status',
    featuresDescription:
      'The full list of what Unfold and Ploeg do today and what is planned, tagged Available, In Labs, Experimental or Planned, and filterable by audience and category.',
    integrationsTitle: 'Integrations, and how to add your own',
    integrationsDescription:
      'What Unfold connects to today, the open standards it speaks, the adapters planned next, and how a new tracker, forge or billing tool plugs in as an adapter.',
    agenciesTitle: 'Unfold for agencies',
    agenciesDescription:
      'Hand client work to AI agents within a budget set first, see the cost per client, and send one billing line per accepted Work Item. Self-hosted today; hosted for agencies is planned.',
    teamsTitle: 'Unfold for engineering leads',
    teamsDescription:
      'Budgets approved before any model call, a plain reason for every Work Item that waits on a person, a tamper-evident audit trail and every AI-written change marked.',
    developersTitle: 'Unfold for developers',
    developersDescription:
      'Hand a tracker task to AI agents from your tracker, VS Code, Claude Code or an MCP app, follow every Run, and take over the branch and hand it back.',
    platformTitle: 'Unfold for platform engineers',
    platformDescription:
      'One Helm chart on your own Kubernetes. Per-Run model keys capped to a budget, a push proxy to the Run’s own branch, default-deny network policies and signed Ploeg releases.',
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
    audiences: 'Who it’s for',
    features: 'Features',
    integrations: 'Integrations',
  },
  hero: {
    eyebrow: 'Open source · self-hosted · experimental',
    title: 'Turn Work Items into pull requests that are ready for review.',
    lede: 'You give Unfold a unit of work. It runs AI agents on it within a budget set before work starts, and stops when a pull request is ready for a person to read. Merging stays with you.',
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
        text: 'Something you have decided to do, or a problem described well enough that a solution can be conceived. It comes from your tracker or from Unfold.',
      },
      {
        term: 'Shift',
        text: 'Ploeg opens a Shift and puts a Team on the Work Item. Each Run is one Role at work, a writer or a reviewer, with its own budget and, by default, its own model key.',
      },
      {
        term: 'Pull request',
        text: 'In Ploeg’s unattended worker workflow, the Shift ends with a pull request on your forge. The actual change and the output of the checks that ran come with it as evidence.',
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
      'The same small job, shown two ways. An order service rounds 1.005 to 1.00 instead of 1.01. Both come from the deterministic demo that ships with Unfold, so you can run it yourself and get the same result.',
    walkthrough: {
      title: 'Step by step',
      badge: 'Simulation of the deterministic demo — no model calls, no spend',
      lead: 'Each line is an event the demo recorded when it ran, with its original timing alongside.',
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
        'Running the local demo leaves the change on your machine. Ploeg’s unattended worker workflow can publish a pull request on your forge.',
      diff: 'The change the demo made',
    },
    video: {
      title: 'In the workbench',
      lead: 'The same demo in Unfold, recorded by a script that clicks through it. Nothing was set up by hand.',
      caption:
        'Recording of the deterministic demo in Unfold: no model calls, no spend. Recorded with Unfold',
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
        text: 'Ploeg sets a budget before a Run starts. By default the Run’s model key carries that budget, and the gateway refuses further calls once it is spent. Raising a budget is an administrator’s decision.',
      },
      {
        title: 'Credentials',
        text: 'By default each managed Run gets its own model key with a budget and an expiry, reviewers get a read-only forge token, and management keys stay in Ploeg. Writers share one push token unless you give Ploeg a Forgejo bot password; then each writing Run gets a token for its own repository, revoked when the Run ends. Keeping keys and tokens out of the agent’s reach is a setting you turn on.',
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
    matrix: 'Which settings each claim needs',
  },
  pricing: {
    title: 'How hosted Unfold will be priced',
    badge: 'Planned · not on sale yet',
    intro:
      'Hosted Unfold does not exist yet. This is the price model we have decided on. We will publish prices after the pilot’s first validation milestone.',
    items: [
      {
        title: 'Pay for accepted work',
        text: 'The planned delivery fee follows accepted work and ticket size. Acceptance can be explicit or deemed after 10 working days; the full terms will accompany the price list.',
      },
      {
        title: 'Model usage is charged per attempt',
        text: 'Model tokens are charged at cost plus a published fixed markup, including for rejected work. Attempts that fail because of Unfold’s infrastructure or bugs are exempt.',
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
        title: 'No Unfold licence fee',
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
        text: 'Ploeg authorizes and budgets managed agent Runs. With its executor enabled, it runs the Work Items it takes from trackers such as Vikunja and ClickUp. It decides who may write each branch and keeps the record of every Shift in PostgreSQL. Ploeg is Dutch for crew.',
      },
      {
        name: 'Unfold',
        role: 'The workbench',
        text: 'Unfold is the front end, in the browser or in VS Code. You start work there, steer agents while they run and review what they produced. With shared execution turned on, Ploeg authorizes and budgets the Runs you start there, and Unfold still executes them itself; without it, Unfold runs sessions on its own. Planned: Ploeg executes every Run, and Unfold on its own runs only the deterministic demo. Unfold is Dutch for floor, as in shop floor.',
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
  catalogue: {
    status: {
      available: 'Available',
      labs: 'In Labs',
      experimental: 'Experimental',
      planned: 'Planned',
    },
    statusHelp: {
      available: 'Built, and on by default or once you configure it.',
      labs: 'Built, behind a feature flag that is off until a person or an administrator turns it on.',
      experimental:
        'Built, but not yet proven against the real tool, or outside the supported profile.',
      planned: 'Decided or proposed, and not built. No dates.',
    },
    categories: {
      integrations: 'Integrations',
      control: 'Control',
      security: 'Security and isolation',
      cost: 'Cost',
      visibility: 'Visibility and evidence',
      where: 'Where you work',
      open: 'Open and self-hosted',
      new: 'What’s new here',
      next: 'Coming next',
    },
    audiences: {
      agencies: 'Agencies',
      teams: 'Engineering leads',
      developers: 'Developers',
      platform: 'Platform engineers',
    },
    from: {
      unfold: 'Unfold',
      ploeg: 'Ploeg',
    },
    fromLabel: 'Built into',
    statusLabel: 'Status',
    items: {
      intHandoff: {
        title: 'Hand off from ClickUp and Vikunja',
        text: 'Assign a task to an agent Team in the tracker you already use, and it comes back as a pull request.',
      },
      intGithubIssues: {
        title: 'GitHub Issues as a work queue',
        text: 'A ploeg:<team> label or an assignee hands an issue to a Team, and comments and closing are written back. Qualified live against github.com.',
      },
      intTrackerReads: {
        title: 'Read tasks from Forgejo, GitHub, GitLab and Jira Cloud',
        text: 'Find and read a task before you hand it off. Jira, GitLab and Forgejo issues have no hand-off yet.',
      },
      intForges: {
        title: 'Pull requests on Forgejo, GitHub and GitLab',
        text: 'Each forge has its own publisher. On GitLab the result is a merge request.',
      },
      intModels: {
        title: 'Any model provider behind LiteLLM',
        text: 'Every model call goes through your own LiteLLM gateway, so any provider it supports can sit behind it.',
      },
      intAgentPlugins: {
        title: 'Plugins for Claude Code, OpenCode and ACP agents',
        text: 'A Claude Code plugin that also installs as an Agent Plugin in Codex, Copilot, VS Code, Cursor and Kiro, an OpenCode 1.x plugin, and a pass-through proxy for any Agent Client Protocol agent.',
      },
      intCodex: {
        title: 'Codex CLI reporting',
        text: 'Codex sessions report to Unfold. Tested with recorded payloads only.',
      },
      intHarness: {
        title: 'OpenHands, or a program of your own',
        text: 'Ploeg runs OpenHands through ACP, or any binary that reads the published Task Spec and writes an Outcome Report. Both are in the supported profile.',
      },
      intHarnessOthers: {
        title: 'OpenCode, Qwen Code, Goose, Claude Code, Codex and Gemini CLI',
        text: 'Their adapters are in Ploeg’s source and run in the scheduled attack drill, but they sit outside the supported profile.',
      },
      intChat: {
        title: 'Slack, Microsoft Teams, ntfy and Web Push',
        text: 'Notices with quiet hours, and Slack can answer an agent’s permission request. Browser and VS Code notifications are available without the flag.',
      },
      intFocus: {
        title: 'Model cost as FinOps FOCUS files',
        text: 'FOCUS 1.4 cost and usage rows as CSV, JSON Lines or Parquet, readable by any FinOps tool.',
      },
      intBilling: {
        title: 'Billing lines into Simplicate, or as files',
        text: 'One line per accepted Work Item into Simplicate, or as CSV and UBL 2.1 files for any other billing tool.',
      },
      intIdentity: {
        title: 'Single sign-on with any OIDC provider',
        text: 'People sign in through your identity provider, and local sign-in can be turned off.',
      },
      intScim: {
        title: 'Provisioning with SCIM 2.0 and Shared Signals',
        text: 'Your identity provider adds and removes people, and ends their sessions when it has to.',
      },
      intIntake: {
        title: 'Requests from feedback tools and email',
        text: 'Marker.io, BugHerd, Userback, Freshdesk, Zendesk, a web form or an email become requests in Unfold.',
      },
      intObservability: {
        title: 'Grafana, Prometheus, VictoriaLogs and Sentry',
        text: 'Logs and telemetry go to your own stack, and errors to any tracker that speaks the Sentry protocol, such as GlitchTip or Bugsink.',
      },
      ctlBudget: {
        title: 'Budgets set before any spend',
        text: 'Ploeg authorizes each Run’s budget before its first model call. The hand-off shows the Team’s limit per day, week or month and what is left.',
      },
      ctlTeamCaps: {
        title: 'Spend caps and concurrency limits per Team',
        text: 'A Team stops claiming new work once its daily, weekly or monthly cap would be passed, and a limit caps how many Runs it has going at once.',
      },
      ctlNoRespend: {
        title: 'No silent re-spend',
        text: 'Resuming or running work again first checks that Ploeg will pay for it. Money held by unfinished Runs is shown apart from money spent.',
      },
      ctlConfirm: {
        title: 'Confirm before anything changes',
        text: 'Actions from AI apps and editors show their effect and cost, and wait for your yes.',
      },
      ctlStop: {
        title: 'Stop work with one confirmation',
        text: 'Stopping lists what it will do (stop Runs, revoke keys, comment on the task) and what was spent so far.',
      },
      ctlTakeOver: {
        title: 'Take over and hand back',
        text: 'Pause a running Run at its next safe point, finish the job on its branch yourself, then hand it back with a note.',
      },
      ctlSteer: {
        title: 'Steer running work',
        text: 'Leave a note the next Run reads, or answer an agent’s question and choose to resume or start over, each with its cost shown.',
      },
      ctlPermissions: {
        title: 'Answer permission requests',
        text: 'Allow once, allow matching requests or deny an agent’s tool request. If you opt in, approve your own Claude Code session’s prompts remotely.',
      },
      ctlProposed: {
        title: 'Approve work agents propose',
        text: 'Work Items an agent suggests wait for a person to approve or reject them.',
      },
      ctlBriefCheck: {
        title: 'Check the brief first',
        text: 'A cheap model checks that a task can be acted on, and asks its questions before the first Run.',
      },
      ctlRouting: {
        title: 'Routing you define',
        text: 'Rules map each board and label to an allowed repository and Team. A ticket no rule covers is refused, with a comment that says how to fix it.',
      },
      ctlMerge: {
        title: 'Merging stays with people',
        text: 'Unfold opens the pull request. Your forge and your reviewers decide the merge.',
      },
      ctlRoles: {
        title: 'Who sees what',
        text: 'Viewer, operator and administrator access from your identity provider, and a per-person limit on which Teams someone sees.',
      },
      ctlSignOff: {
        title: 'Client Sign-off on the exact commit',
        text: 'Record a client’s “looks good” or “needs changes” against the commit under review. API only for now.',
      },
      secSandbox: {
        title: 'Agents work in sandboxes',
        text: 'Each workspace runs in a limited Docker container, a Kubernetes pod with egress rules, or a pre-warmed Kata sandbox, which is a lightweight virtual machine.',
      },
      secScopedKey: {
        title: 'No master keys inside a workspace',
        text: 'A workspace gets a scoped model key from Ploeg that is blocked when the work ends, and never your Kubernetes or another person’s credentials.',
      },
      secProxies: {
        title: 'The agent never sees the credentials',
        text: 'Loopback proxies hold the model key and the push token, so the agent’s container holds only placeholders. Qualified live against a hostile agent for one agent tool and one Role.',
      },
      secOwnBranch: {
        title: 'Pushes only to its own branch',
        text: 'The push proxy refuses pushes to any other branch, and refuses branch deletions.',
      },
      secCanary: {
        title: 'A canary credential in every Run',
        text: 'If the canary or a real credential shows up in pushed commits, the Run stops and its pull requests are closed.',
      },
      secWorkerPods: {
        title: 'Worker pods without a way out',
        text: 'A worker pod holds no Kubernetes token and reaches no metadata endpoint, API server or unapproved service. Qualified live on one cluster with Cilium.',
      },
      secNetworkPolicy: {
        title: 'Default-deny network policies',
        text: 'The chart renders a policy for every pod it creates. Your CNI has to enforce them.',
      },
      secKata: {
        title: 'A virtual machine per Run',
        text: 'The sandbox executor runs each Run in its own Kata Containers VM. Supported with guest seccomp on, though no probe has passed in that configuration yet.',
      },
      secVerifyOutside: {
        title: 'Changes checked outside the agent',
        text: 'Before publishing, the change is rebuilt outside the agent’s workspace and its checks run in network-less containers from a pinned image.',
      },
      secSigned: {
        title: 'Signed changes',
        text: 'Each captured change carries an in-toto attestation you can verify offline. Changes that touch secret files are refused.',
      },
      secSecretScan: {
        title: 'Secrets stopped at hand-off',
        text: 'Handing your own uncommitted change to a Team is refused on any secret-scanner hit.',
      },
      secPersonProof: {
        title: 'The person is proven to Ploeg',
        text: 'Once configured, each change made for you carries a token exchanged from your own sign-in.',
      },
      secTenants: {
        title: 'Separate organisations and clients',
        text: 'With the Tenant boundary on, people reach only the repositories, tasks and Work Items of their own organisation and client.',
      },
      secUntrusted: {
        title: 'Tracker text treated as data',
        text: 'Text from trackers and agents reaches AI apps marked as untrusted, so it is not followed as instructions.',
      },
      secRepository: {
        title: 'The repository cannot steer the agent',
        text: 'Ticket and forge text is framed as untrusted data, the repository’s own hooks, plugins and MCP servers are switched off, and a reviewer reads the base branch’s instructions.',
      },
      secReleases: {
        title: 'Releases you can verify',
        text: 'Ploeg’s images and chart are signed keyless with cosign and carry an SBOM, build provenance, an OpenVEX document and a CVE budget verdict anyone can check.',
      },
      secThreatModel: {
        title: 'A published threat model',
        text: 'STRIDE per element, attack trees and open findings, plus a CNCF-style security self-assessment.',
      },
      secHardened: {
        title: 'Hardened by default',
        text: 'A strict content security policy, cross-site request checks, rate limits, secret redaction in every answer and encrypted internal state.',
      },
      secLeavers: {
        title: 'Leavers lose access at once',
        text: 'Deprovisioning a person in your identity provider ends every session and credential they hold.',
      },
      costRun: {
        title: 'Spend per Run',
        text: 'Each Run shows its spend, model and tokens, live against its budget.',
      },
      costSettled: {
        title: 'Authorized, held, then settled',
        text: 'A Run’s budget is held when it starts and its real cost settles later from the gateway’s own logs. Every figure says whether it is observed, provisional, settled or unknown.',
      },
      costMerged: {
        title: 'Cost per merged Work Item',
        text: 'Insights leads with merge rate and cost per merged Work Item, and says so when there is too little data.',
      },
      costLedger: {
        title: 'Delivery ledger',
        text: 'Each Work Item agents tried, whether it was accepted and what every attempt cost, as CSV or JSON.',
      },
      costClient: {
        title: 'Cost per client',
        text: 'A FOCUS export per Run, or per Work Item and day, with your organisation as billing account and the client as sub-account.',
      },
      costAlerts: {
        title: 'Spend alerts in the editor',
        text: 'The VS Code Agents window tells you at 50, 80 and 100 % of a budget.',
      },
      costAskFree: {
        title: 'Questions answered free when possible',
        text: 'Asking about a Work Item answers from the record at no cost, and states the cost before any model call.',
      },
      costOwnAgents: {
        title: 'Your own agents’ cost too',
        text: 'Your Claude Code sessions show an estimate at API prices beside the Runs Ploeg pays for.',
      },
      costBill: {
        title: 'Bill accepted work',
        text: 'Send one line per accepted Work Item to your billing tool, at your own price per client.',
      },
      visNeedsYou: {
        title: 'Know what waits on you, and why',
        text: 'Stopped work is grouped by a plain reason, each with the one action that fixes it.',
      },
      visTranscript: {
        title: 'Full Run transcript',
        text: 'The agent’s messages, tool calls, edits as diffs and its plan, followed live.',
      },
      visEvidence: {
        title: 'Evidence before merge',
        text: 'The reviewer’s verdict, CI, the settled spend and the agent’s own account of what it changed and why.',
      },
      visFindings: {
        title: 'Reviewer findings with answers',
        text: 'Every finding with the writing agent’s reply, unanswered ones first.',
      },
      visProduction: {
        title: 'From pull request to production',
        text: 'Pull request, CI, approval, merge and first deploy per environment, each with its time.',
      },
      visAudit: {
        title: 'A tamper-evident record of who did what',
        text: 'Every action is recorded with the person, the app they used and their confirmation, in a hash-chained OCSF audit trail you can export as CSV or JSON.',
      },
      visAiMarked: {
        title: 'Every AI-written change is marked',
        text: 'Pull requests, comments and commits say an agent wrote them, and Agent Trace records which lines an agent wrote in each commit.',
      },
      visHealth: {
        title: 'Run health',
        text: 'Running Runs are marked On track, Watch or Off track from their own behaviour.',
      },
      visJudge: {
        title: 'Second opinions on running work',
        text: 'A free model judges a Run’s health, and a tripwire flags risky tool calls. Both only advise; neither acts.',
      },
      visStatus: {
        title: 'Can new work start?',
        text: 'A status page answers in plain words and names what to fix.',
      },
      visOwnSessions: {
        title: 'Your own sessions in the picture',
        text: 'Claude Code, OpenCode and Codex sessions report their state and commits next to Ploeg’s Runs, never their prompt text.',
      },
      visBrief: {
        title: 'A delivery brief you can hand on',
        text: 'The Claude Code plugin turns the commands that proved a change into one page per audience, each claim marked verified or not.',
      },
      visCards: {
        title: 'Run Cards',
        text: 'Each delivered change becomes a card with its cost, flow figures and life in production. A card describes a change, never a person.',
      },
      visMetrics: {
        title: 'Metrics and alerts with runbooks',
        text: 'Prometheus metrics, a ServiceMonitor and alert rules for Ploeg, each linked to a runbook.',
      },
      visSiem: {
        title: 'Audit to your SIEM',
        text: 'Audit records leave as OTLP logs or NDJSON.',
      },
      visEvents: {
        title: 'Events to your systems',
        text: 'Work Item, pull request and Run events as signed CloudEvents webhooks.',
      },
      whereBrowser: {
        title: 'Browser',
        text: 'One app for desktop and phone, with keyboard shortcuts and a command palette.',
      },
      whereVsCode: {
        title: 'VS Code',
        text: 'Now, Tasks and Work views, hand-off, review and branch checkout, plus Work Items in the Agents window.',
      },
      whereClaudeCode: {
        title: 'Claude Code',
        text: 'Commands to claim a Run on your own seat, hand off your uncommitted change, take over and hand back.',
      },
      whereMcp: {
        title: 'AI apps over MCP',
        text: 'Find, follow, hand off and approve work from Claude Code, claude.ai, ChatGPT or Copilot, with Work Item cards where the app shows them.',
      },
      whereChat: {
        title: 'Chat with Unfold in VS Code',
        text: 'Ask the Unfold agent in the Agents window. It acts only after you confirm.',
      },
      whereMessages: {
        title: 'Messages to your own session',
        text: 'Send a note to a running Claude Code session, and it picks it up on its next prompt.',
      },
      whereAcp: {
        title: 'JetBrains IDEs, Zed and Neovim',
        text: 'Use “unfold” as an ACP agent in PhpStorm or another ACP editor. It follows one Work Item, streams its Run and asks before spending. Not yet tried in a real install of those editors.',
      },
      whereMcpTask: {
        title: 'Follow a hand-off as an MCP task',
        text: 'Claude Code’s terminal follows a hand-off until its pull request is ready.',
      },
      whereMcpEvents: {
        title: 'Tell your AI app when work needs you',
        text: 'Apps such as ChatGPT subscribe to “needs you”, “pull request ready” and “Run finished”.',
      },
      openSource: {
        title: 'Open source',
        text: 'Apache-2.0, with no feature held back from the open code.',
      },
      openHelm: {
        title: 'Runs on your own cluster',
        text: 'One Helm chart carries the Ploeg it was tested with, and Docker Compose covers local use. A guide covers self-hosting the whole stack in the EU.',
      },
      openModels: {
        title: 'Choose your models',
        text: 'Any provider behind your LiteLLM gateway, an allow-list of providers and regions for work started in Unfold, and a “Where your data goes” view.',
      },
      openDemo: {
        title: 'Try it without spending',
        text: 'A deterministic demo with illustrative records. It makes no model calls and spends nothing.',
      },
      openSupport: {
        title: 'On the Kubernetes and PostgreSQL you run',
        text: 'Kubernetes 1.30 and 1.37 are tested in CI and 1.31 to 1.36 are supported; PostgreSQL 17 and 18 are tested. No CRDs: all state lives in PostgreSQL.',
      },
      openQuickstart: {
        title: 'A first Run on your laptop, for free',
        text: 'The quickstart installs the signed chart on a local kind cluster and completes one Run against a mock model that calls no provider and spends nothing.',
      },
      openScaleToZero: {
        title: 'Workers scale to zero',
        text: 'KEDA starts workers from the queue depth, and idle queue checks make no model calls. A CronJob executor works without KEDA.',
      },
      openDrills: {
        title: 'Restore and upgrade drills in CI',
        text: 'Restoring the database from a backup and upgrading it from earlier releases run as CI drills.',
      },
      openContracts: {
        title: 'Published, versioned contracts',
        text: 'The operator API, the Run API, the executor contract and the agent’s Task Spec are published as schemas, and CI refuses a breaking change that names no decision record.',
      },
      openUpgrade: {
        title: 'Chart upgrade and rollback between releases',
        text: 'Promised by Ploeg’s compatibility policy, not yet exercised by any job.',
      },
      openExport: {
        title: 'Take your data with you',
        text: 'Export everything Unfold holds for an organisation as JSON Lines, with a schema per file.',
      },
      newBudget: {
        title: 'A budget before the spend',
        text: 'A stuck agent cannot run up a bill nobody approved: the money is held before the first call and settled from the gateway afterwards.',
      },
      newRunKey: {
        title: 'One capped model key per Run',
        text: 'A leaked key is worth one Run’s budget and dies with the Run, because each Run gets its own key at a proxy the agent cannot bypass.',
      },
      newVerified: {
        title: 'Changes verified outside the agent, and signed',
        text: 'The agent does not mark its own homework. Checks run again outside its workspace, and the change carries a signed attestation.',
      },
      newForgejo: {
        title: 'Forgejo as a first-class forge',
        text: 'For teams that host their own code, Forgejo gets the same treatment as GitHub and GitLab.',
      },
      newInHouse: {
        title: 'Control plane and agents both in your cluster',
        text: 'When code and transcripts must stay in-house, nothing of Unfold or Ploeg has to run anywhere else.',
      },
      newTakeOver: {
        title: 'Take a running agent’s work and give it back',
        text: 'When an agent is close but stuck, you finish the hard part on its branch and the next Run continues from your commit.',
      },
      newOwnSessions: {
        title: 'Your sessions beside the agents’ Runs',
        text: 'People and agents work the same backlog, so collisions on one branch are flagged.',
      },
      newClientApproves: {
        title: 'A client approves the exact commit',
        text: 'For agencies whose clients sign off on work, the approval is tied to the commit a developer reviewed. The Client Portal that would collect it is planned.',
      },
      newBillPerItem: {
        title: 'Billing per accepted Work Item',
        text: 'An agency charges for delivered work, so the billing line follows acceptance, not seats, credits or tokens.',
      },
      newMcpTask: {
        title: 'A hand-off your AI app follows',
        text: 'The hand-off is an MCP task, so your AI app keeps track of it until the pull request is ready.',
      },
      nextJira: {
        title: 'Hand off from Jira',
        text: 'Next in the tracker order, as an Atlassian Forge app. Today Unfold reads Jira Cloud tasks but cannot hand them off.',
      },
      nextIssues: {
        title: 'Hand off GitHub Issues and GitLab issues from Unfold',
        text: 'Today GitHub Issues hand off through Ploeg by label or assignee, and GitLab issues can only be read.',
      },
      nextLinear: {
        title: 'Linear, as a Linear agent',
        text: 'An Unfold Team that shows up in Linear as an agent, on Linear’s agent sessions.',
      },
      nextTrackers: {
        title: 'Other trackers on demand',
        text: 'Each one an adapter in the tracker registry, so adding one touches no shared code.',
      },
      nextPsa: {
        title: 'Billing lines into Teamleader, Moneybird and Exact',
        text: 'After Simplicate, in that order. Your own tool sends the e-invoice over Peppol; Unfold never sends one.',
      },
      nextGateway: {
        title: 'A second model gateway',
        text: 'Envoy AI Gateway beside LiteLLM, through one gateway contract in Ploeg for minting a capped key and reading its spend.',
      },
      nextPreview: {
        title: 'A preview environment per pull request',
        text: 'Every pull request gets a running preview to look at, in your own pipeline.',
      },
      nextPortal: {
        title: 'Client Portal',
        text: 'Clients send requests, approve Work Items and sign off ready work in one place, with an approver per client.',
      },
      nextHosted: {
        title: 'Hosted Unfold for agencies',
        text: 'A hosted service on a rented EU cluster, one Tenant per agency, running the same open code.',
      },
      nextQuotes: {
        title: 'Quotes per Work Item',
        text: 'A size and a price agreed before work starts, with the fee charged only on acceptance. No prices are published.',
      },
      nextKnowledge: {
        title: 'Knowledge per organisation',
        text: 'Agents briefed from a knowledge base kept per organisation.',
      },
      nextHarnessPick: {
        title: 'Choose the agent tool per Work Item',
        text: 'Work started in Unfold runs inside Ploeg, with the agent tool picked per Work Item.',
      },
      nextSharedAccounts: {
        title: 'Shared accounts within an organisation',
        text: 'Projects share tracker accounts and repositories inside one organisation, and each Work Item keeps one origin.',
      },
      nextTrackerSuite: {
        title: 'One test suite for every tracker adapter',
        text: 'A conformance suite in Unfold that every tracker adapter has to pass, like the one Ploeg already runs.',
      },
      nextTls: {
        title: 'TLS served by Ploeg itself',
        text: 'Today Ploeg speaks plain HTTP inside the cluster and its supported profile requires CNI or mesh encryption.',
      },
      nextIsolationFloor: {
        title: 'An isolation floor per Run',
        text: 'A Run declares the strictest isolation it needs, and runs only where that can be honoured.',
      },
    },
  },
  audienceNav: {
    agencies: 'For agencies',
    teams: 'For engineering leads',
    developers: 'For developers',
    platform: 'For platform engineers',
  },
  chooser: {
    kicker: 'Who it’s for',
    title: 'Who are you?',
    intro:
      'The same Work Item looks different from each chair. Pick yours and see the proof that matters to you.',
    doors: {
      agencies: {
        role: 'I run an agency',
        job: 'Hand client work to agents and know what each client costs.',
      },
      teams: {
        role: 'I lead an engineering team',
        job: 'Let agents spend and push without losing control.',
      },
      developers: {
        role: 'I write the code',
        job: 'Hand off from the tracker, and take the branch back when the agent is stuck.',
      },
      platform: {
        role: 'I run the platform',
        job: 'Run it on your own cluster, with no real keys inside the agent.',
      },
    },
    features: 'Every feature, with its status',
    integrations: 'What it connects to, and how to add your own',
  },
  tenLines: {
    kicker: 'In ten lines',
    title: 'What it does today.',
    intro:
      'All ten are available today. The full list has everything else, each line with its status.',
    items: [
      {
        title: 'Hand off from the tracker you already use.',
        text: 'Assign a ClickUp or Vikunja task to an agent Team and it comes back as a pull request.',
      },
      {
        title: 'Spending is authorized before it happens.',
        text: 'Every Run gets a budget before its first model call, and the hand-off shows the Team’s limit and what is left.',
      },
      {
        title: 'Agents propose, people merge.',
        text: 'Work arrives as a pull request on your forge, and Unfold never merges it.',
      },
      {
        title: 'Know what waits on you, and why.',
        text: 'Stopped work is grouped by a plain reason, each with the one action that fixes it.',
      },
      {
        title: 'Take over a running agent and hand it back.',
        text: 'Pause a Run at its next safe point, finish the job in your own editor, then return it on the same branch.',
      },
      {
        title: 'Every AI-written change is marked.',
        text: 'Pull requests, comments and commits say an agent wrote them, and AI-written lines are recorded per commit.',
      },
      {
        title: 'See the cost of every Run, Work Item and client.',
        text: 'Spend, tokens and models per Run, cost per merged Work Item, and a FinOps FOCUS export.',
      },
      {
        title: 'A tamper-evident record of who did what.',
        text: 'Every action is recorded with the person, the app they used and their confirmation, in a hash-chained OCSF audit trail.',
      },
      {
        title: 'Work from VS Code, Claude Code or your AI app.',
        text: 'Follow, answer and steer the same Work Item from the tool you have open.',
      },
      {
        title: 'Self-hosted and open source.',
        text: 'Apache-2.0, installed with one Helm chart that carries the Ploeg it was tested with.',
      },
    ],
    features: 'See all features',
    integrations: 'See the integrations',
  },
  audience: {
    decisionKicker: 'Your first question',
    proofKicker: 'The proof',
    featuresKicker: 'Your feature list',
    featuresTitle: 'The features that matter most to you.',
    featuresIntro:
      'Everything here is available unless it is marked In Labs or Experimental. The full list has the rest.',
    allFeatures: 'See every feature',
    nextKicker: 'Coming next',
    nextTitle: 'Planned for you, not built yet.',
    nextIntro: 'Decided or proposed, in the order we mean to build them. No dates.',
    others: 'Also see',
    today: 'Today Unfold is self-hosted, open source and experimental (0.x).',
    sources: 'Where these claims come from',
  },
  agencies: {
    eyebrow: 'For agencies of 5 to 80 people',
    hookLine: 'One accepted Work Item.',
    hookAccent: 'One line to bill.',
    category:
      'Unfold is self-hosted agent orchestration for agencies. AI agents turn your clients’ Work Items into pull requests within a budget set before work starts. You see what each client costs, and your developers decide what is accepted.',
    decision: 'Can I hand client work to agents without losing money, or my client’s trust?',
    decisionText:
      'Money first: nothing is spent before a budget is approved, and every Run’s cost lands on the client it was for. Then trust: a developer reviews every pull request, and the client can approve the exact commit that was reviewed.',
    object: {
      label: 'A Work Item becoming one billing line',
      caption:
        'Illustration, not a real invoice. The Work Item title comes from the deterministic demo. Billing lines are In Labs, and no price is shown because you set it.',
      client: 'Client',
      clientValue: 'Your client',
      workItem: 'Work Item',
      accepted: 'Accepted',
      acceptedValue: 'Merged by your developer',
      cost: 'Model cost',
      costValue: 'Settled from the gateway, booked to this client',
      price: 'Price',
      priceValue: 'Yours to set',
      destination: 'Goes to',
      destinationValue: 'Simplicate, or a CSV or UBL file',
      stamp: 'Accepted',
    },
    ctaTitle: 'Hosted Unfold for agencies is planned.',
    ctaText:
      'Leave your address and we write when there is something to try, or when we look for design partners. Today you can run Unfold on your own cluster.',
    flow: {
      kicker: 'Cost per client',
      title: 'Where one Run’s money goes.',
      intro:
        'From the budget held before the first call to the line your client sees, every step is a record you can export.',
      steps: [
        {
          title: 'Held before the Run',
          text: 'Ploeg holds the Run’s budget before its first model call.',
        },
        {
          title: 'Settled from the gateway',
          text: 'The real cost settles later from the gateway’s own spend logs.',
        },
        {
          title: 'Booked to the client',
          text: 'A FOCUS export puts your organisation as billing account and the client as sub-account.',
        },
        {
          title: 'One line when accepted',
          text: 'An accepted Work Item becomes one line in your billing tool, at your price.',
        },
      ],
    },
  },
  teams: {
    eyebrow: 'For engineering leads',
    hookLine: 'Every spend approved.',
    hookAccent: 'Every stop explained.',
    category:
      'Unfold lets engineering leads hand work to AI agents with a budget approved before the first model call, a plain reason for every Work Item that waits on a person, and every change marked as AI-written for someone to review.',
    decision: 'Can I let agents spend money and push to our repositories without losing control?',
    decisionText:
      'Control here means things you can check. Ploeg approves the money before work starts. A stopped Work Item tells you why and what fixes it. Every change records who asked for it, from which app, and which lines an agent wrote.',
    object: {
      label: 'The Needs you board',
      caption:
        'Reasons as Unfold’s Now view names them, with the action each one asks for. Illustration, with no live data and no counts.',
      title: 'Needs you',
      fixLabel: 'What fixes it',
      reasons: [
        {
          chip: 'Question for you',
          fix: 'Answer it here. The Work Item restarts with your answer, so its next Runs read it.',
        },
        {
          chip: 'Budget ran out',
          fix: 'Finish the work by hand, or raise the Team’s budget in its configuration.',
        },
        {
          chip: 'Reviewer still wants changes',
          fix: 'Read the findings. Finish the branch by hand, or sharpen the ticket.',
        },
        {
          chip: 'Checks did not pass',
          fix: 'Run the Team’s checks on the branch to see which one fails, then fix the branch or the flaky check.',
        },
        {
          chip: 'Approved: merge it',
          fix: 'Read the pull request and merge it on the forge. Merging finishes the Work Item.',
        },
      ],
    },
    ctaTitle: 'Try it on your own backlog.',
    ctaText:
      'Unfold is self-hosted and open source. Start with the deterministic demo, then follow the guide to run the whole stack on your own cluster.',
    cta: 'Read the self-hosting guide',
    record: {
      kicker: 'Evidence on every change',
      title: 'Who did what, and which lines a machine wrote.',
      intro: 'Two records answer the questions an auditor or a reviewer asks first.',
      auditTitle: 'In the audit trail',
      audit: [
        'The person who acted, from your identity provider',
        'The app they used: browser, editor or an AI app',
        'Whether they confirmed, and what the confirmation said',
        'Hash-chained OCSF records, exportable as CSV or JSON',
      ],
      changeTitle: 'On the change itself',
      change: [
        'The pull request says an agent wrote it',
        'Comments and commits carry the same mark',
        'Agent Trace records which lines an agent wrote, per commit',
        'Reviewer findings sit next to the writer’s answers',
      ],
    },
  },
  developers: {
    eyebrow: 'For developers',
    hookLine: 'Hand it off.',
    hookAccent: 'Take it back.',
    category:
      'Unfold hands a tracker task to a Team of AI agents from your tracker, VS Code, Claude Code or any MCP app. You follow every Run as it happens, take over the branch at a safe point, and hand it back.',
    decision: 'Does this fit how I already work, and can I step in when the agent gets stuck?',
    decisionText:
      'You hand off from where the task already lives. When a Run is close but stuck, it pauses at its next safe point. You finish the hard part on its branch, and the next Run continues from your commit.',
    object: {
      label: 'One branch, handed back and forth',
      caption:
        'Illustration of the take-over flow. The branch and commits are not from a real run.',
      agent: 'Agents',
      you: 'You',
      paused: 'Run paused at a safe point',
      steps: [
        { lane: 'agent', text: 'Assigned to the Team in ClickUp' },
        { lane: 'agent', text: 'Writer Run commits on the branch' },
        { lane: 'you', text: 'You take over: the Run pauses at its next safe point' },
        { lane: 'you', text: 'Your commits, on the same branch' },
        { lane: 'you', text: 'Hand back with a note' },
        { lane: 'agent', text: 'The next Run continues from your commit' },
        { lane: 'agent', text: 'Pull request, marked as AI-written' },
      ],
    },
    ctaTitle: 'See a Shift on your own machine.',
    ctaText:
      'The deterministic demo applies a recorded fix to a sample repository and runs real checks. It calls no model and spends nothing.',
    cta: 'Run the demo yourself',
    surfaces: {
      kicker: 'Where you work',
      title: 'The same Work Item in every tool you have open.',
      intro:
        'Follow it, answer it and steer it from wherever you are. Each one asks before it spends.',
    },
  },
  platform: {
    eyebrow: 'For platform engineers',
    hookLine: 'The agent never',
    hookAccent: 'holds the key.',
    category:
      'Unfold and Ploeg install on your own Kubernetes with one Helm chart. Each Run gets a model key capped to its budget, a push proxy that reaches only its own branch, and a pod behind a default-deny network policy.',
    decision: 'Can I run this on our cluster without handing agents our credentials?',
    decisionText:
      'The agent’s container holds placeholders. The real keys sit in loopback proxies beside it, are minted for one Run and are revoked when it ends. Ploeg is 0.x and experimental, and its support matrix names exactly which paths are supported and tested.',
    object: {
      label: 'What one Run is allowed to touch',
      caption:
        'Diagram of one Run in Ploeg’s supported profile. Credential isolation was qualified live for one agent tool and one Role; network lockdown on one cluster with Cilium.',
      namespace: 'Namespace',
      namespaceNote: 'Default-deny network policy for every pod',
      pod: 'Worker pod',
      podNote: 'No Kubernetes token, no metadata endpoint',
      vm: 'Optional: its own Kata VM',
      agent: 'Agent container',
      agentNote: 'Placeholders only',
      modelProxy: 'Model-key proxy',
      modelProxyNote: 'Key capped to this Run’s budget, revoked at the end',
      pushProxy: 'Push proxy',
      pushProxyNote: 'This Run’s branch only, no deletions',
      canary: 'Canary credential',
      canaryNote: 'If it shows up in a commit, the Run stops',
      gateway: 'Your LiteLLM gateway',
      forge: 'Your forge',
    },
    ctaTitle: 'Install it where your code already lives.',
    ctaText:
      'The guide takes you through the whole stack on your own cluster, in the EU if you want. Ploeg’s quickstart runs a first Run on a local kind cluster against a mock model, for free.',
    cta: 'Read the self-hosting guide',
    matrix: 'Ploeg’s support matrix',
    quickstart: 'Ploeg’s quickstart',
    verify: 'Verify a Ploeg release',
    scope: {
      kicker: 'Support scope',
      title: 'What is supported, and what is not yet.',
      intro:
        'Taken from Ploeg’s support matrix and feature list. Ploeg is 0.x and has no stable release yet.',
      supported: {
        title: 'Supported and tested',
        items: [
          'Kubernetes 1.30 and 1.37 tested in CI; 1.31 to 1.36 supported',
          'PostgreSQL 17 and 18 tested',
          'OpenHands, or any program that reads the Task Spec',
          'GitHub through a GitHub App, and Forgejo 15 or later',
          'Credential isolation, qualified live for one agent tool and one Role',
        ],
      },
      experimental: {
        title: 'Experimental',
        items: [
          'GitLab as a forge: no per-Run token broker yet',
          'OpenCode, Qwen Code, Goose, Claude Code, Codex and Gemini CLI',
          'Chart upgrade and rollback between releases',
          'Confirmed actions through ploeg-mcp',
        ],
      },
      planned: {
        title: 'Planned',
        items: [
          'TLS served by Ploeg itself',
          'Connections stored in OpenBao or Vault',
          'An isolation floor per Run',
          'The first stable release',
        ],
      },
    },
  },
  featuresPage: {
    kicker: 'Features',
    hookLine: 'Everything it does today.',
    hookAccent: 'And what comes next.',
    category:
      'The full list for Unfold and Ploeg, the open-source engine it runs on. Every line carries its status, so you can tell what is built from what is planned.',
    legend: 'What the status tags mean',
    legendAvailable: 'Every feature is available unless it carries a tag.',
    filters: 'Filter the list',
    audience: 'Who for',
    everyone: 'Everyone',
    categoryFilter: 'Category',
    allCategories: 'All',
    shown: 'Showing {shown} of {total} features.',
    noscript: 'Filtering needs JavaScript. Every feature is listed below, grouped by category.',
    jump: 'Categories',
    empty: 'No feature matches both filters.',
    reset: 'Show everything',
    sources: 'Each line is checked against the lists in the source code:',
    sourceUnfold: 'Unfold at a glance',
    sourcePloeg: 'Ploeg at a glance',
    sourceEngineering: 'Unfold features by bounded context',
  },
  integrationsPage: {
    kicker: 'Integrations',
    hookLine: 'Plug in what you run.',
    hookAccent: 'Or write the plug.',
    category:
      'Unfold reaches your tracker, forge, models, editors, chat and billing tools through ports: small interfaces written in Unfold’s or Ploeg’s own words. Each tool is an adapter registered by name behind its port. Use the ones that ship, follow the ones planned next, or add your own.',
    boardKicker: 'Works with today',
    boardTitle: 'The port board.',
    boardIntro:
      'Each row is a port and each tab an adapter plugged into it. Tabs are available unless tagged; dashed tabs are planned, and the open socket is where your own adapter goes.',
    registry: 'Adapter registry',
    standard: 'Open standards',
    contract: 'Contract planned',
    yours: 'Your adapter',
    ports: {
      trackers: { name: 'Trackers', job: 'Where work comes from, and where it is handed off.' },
      forges: { name: 'Forges', job: 'Where the pull request lands.' },
      links: { name: 'Account links', job: 'A person’s own token for a tracker or forge.' },
      agents: { name: 'Agent tools', job: 'The agent a Run drives, inside Ploeg.' },
      gateway: { name: 'Model gateway', job: 'Where every model call and every key goes.' },
      editors: { name: 'Editors and AI apps', job: 'Where people follow and steer the work.' },
      notify: { name: 'Notifications', job: 'How a person hears that work needs them.' },
      billing: { name: 'Billing tools', job: 'Where accepted work becomes a billing line.' },
      intake: { name: 'Request intake', job: 'How a client’s request becomes a Work Item.' },
      identity: { name: 'Identity', job: 'Who someone is, and when they leave.' },
      telemetry: { name: 'Telemetry and audit', job: 'What leaves for your own monitoring.' },
    },
    notes: {
      handoff: 'hand-off',
      read: 'read only',
      viaPloeg: 'through Ploeg',
      mergeRequest: 'merge request',
      anyProgram: 'Any program that reads the Task Spec',
      files: 'CSV and UBL 2.1 files',
      form: 'Web form',
      email: 'Email',
      browser: 'Browser',
      agentPlugin: 'Codex, Copilot, Cursor and Kiro, as an Agent Plugin',
      acpEditors: 'JetBrains, Zed and Neovim over ACP',
      mcpApps: 'claude.ai, ChatGPT and Copilot over MCP',
      focus: 'FinOps FOCUS 1.4 export',
      ocsf: 'OCSF audit trail',
      events: 'CloudEvents webhooks',
      reporting: 'reporting',
    },
    standardsKicker: 'On the wire',
    standardsTitle: 'Open standards, so one implementation reaches every tool.',
    standardsIntro:
      'Where a standard exists, Unfold speaks it instead of inventing its own format. These are built today.',
    standards: {
      mcp: 'AI apps call Unfold’s tools, with confirmation before any change. Revision 2026-07-28, with the Apps extension.',
      acp: 'Editors such as Zed, Neovim and JetBrains IDEs talk to Unfold as an agent.',
      openapi: 'Unfold’s own HTTP API is described in OpenAPI 3.1 and served by every install.',
      oidc: 'Sign-in with any OIDC provider, and RFC 8693 token exchange to prove the person to Ploeg.',
      cloudevents:
        'Work Item, pull request and Run events as CloudEvents 1.0, signed as Standard Webhooks.',
      ocsf: 'Audit records in OCSF 1.9.0, hash-chained so tampering shows.',
      focus: 'Model cost and usage as FinOps FOCUS 1.4, per Run or per Work Item and day.',
      openfeature: 'Feature flags behind OpenFeature, evaluated over OFREP.',
      scim: 'Your identity provider adds and removes people through SCIM 2.0.',
      otlp: 'Telemetry and audit export as OpenTelemetry (OTLP).',
      intoto:
        'Each captured change carries an in-toto attestation, and Agent Trace records AI-written lines.',
    },
    extendKicker: 'Built to be extended',
    extendTitle: 'Add your own adapter.',
    extendIntro:
      'A new tool is a new adapter behind an existing port, registered by name. Shared code never names a vendor, and a guard test in Unfold fails when it does. Some ports have a shared test suite every adapter must pass; for others it is proposed. Here is which is which.',
    extendSteps: [
      {
        title: 'Pick the port.',
        text: 'Trackers, forges, account links, notification channels, billing tools and request intake each have a registry in Unfold. Agent tools and Ploeg’s own tracker intake are ports in Ploeg.',
      },
      {
        title: 'Write the adapter and register it.',
        text: 'Implement the port’s interface and register the adapter by name. Optional capabilities, such as hand-off for a tracker, are declared, and shared code asks before it uses one.',
      },
      {
        title: 'Run the shared tests, where they exist.',
        text: 'Where a conformance suite exists, your adapter must pass it. The table says where that is true today.',
      },
    ],
    table: {
      caption: 'How a new adapter arrives, port by port',
      port: 'Port',
      how: 'How a new one arrives',
      tests: 'Shared tests today',
    },
    rows: {
      trackersUnfold: {
        port: 'Trackers, in Unfold',
        how: 'An adapter in the tracker registry, declaring the capabilities it has.',
        tests:
          'A guard test keeps tracker names out of shared code. A conformance suite is proposed in Unfold ADR 0063.',
      },
      trackersPloeg: {
        port: 'Trackers, in Ploeg',
        how: 'An adapter on Ploeg’s tracker port, for intake and write-back.',
        tests: 'A conformance suite in Ploeg. ClickUp passes it.',
      },
      forges: {
        port: 'Forges',
        how: 'A publisher in Unfold’s registry, and a forge adapter in Ploeg.',
        tests: 'A forge conformance suite is proposed in Ploeg.',
      },
      agents: {
        port: 'Agent tools',
        how: 'An ACP adapter in Ploeg, or any program that reads the Task Spec and writes an Outcome Report.',
        tests: 'A shared conformance kernel, plus a scheduled drill against a hostile repository.',
      },
      others: {
        port: 'Notifications, billing tools, request intake, account links',
        how: 'An adapter registered by name in that port’s registry.',
        tests: 'No shared suite yet.',
      },
      gateway: {
        port: 'Model gateway',
        how: 'A gateway contract in Ploeg, with LiteLLM and Envoy AI Gateway behind it.',
        tests: 'Not built yet.',
      },
    },
    rulesKicker: 'Rules we hold ourselves to',
    rulesTitle: 'No lock-in, by decision.',
    rulesIntro:
      'An accepted architecture decision (ADR-0050) sets these rules for every integration. They are rules for new work, not a claim that every one is finished.',
    rules: [
      {
        title: 'A new tool is a new adapter.',
        text: 'Every integration sits behind an interface. Adding a vendor never means editing a hard-coded list.',
      },
      {
        title: 'Standards on the wire.',
        text: 'Unfold writes its own interface only where no standard exists, such as pull request operations or tracker APIs.',
      },
      {
        title: 'What leaves, leaves in a standard format.',
        text: 'Events as CloudEvents, telemetry as OTLP, audit as OCSF, cost as FOCUS.',
      },
      {
        title: 'Your model key, your gateway.',
        text: 'Every feature works with your own model credential through your own gateway. None needs credits bought from Unfold.',
      },
      {
        title: 'The hosted service will run the same code.',
        text: 'Nothing is held back from the self-hosted build. Hosting is operation, not a fork.',
      },
    ],
    leaveTitle: 'Your data can leave.',
    leaveText:
      'An administrator exports everything Unfold holds for an organisation as JSON Lines: one file per kind of record, each with a JSON Schema, plus a pointer to what Ploeg holds. It takes no support ticket.',
    nextKicker: 'Coming next',
    nextTitle: 'The integrations we build next, in order.',
    nextIntro: 'Each one is planned, which means decided but not built, and none has a date.',
    nextGroups: {
      trackers: 'Trackers',
      billing: 'Billing tools',
      gateway: 'Model gateway',
      delivery: 'Delivery and clients',
      tests: 'Shared tests',
    },
    editorsNote:
      'PhpStorm and the other JetBrains IDEs already connect over ACP. That path is Experimental until it is tried in a real install.',
    ctaTitle: 'Need an adapter that is not here?',
    ctaText:
      'Tell us which tool. A tracker or billing tool is one adapter in a registry, and the source is open if you would rather write it yourself.',
    ctaSource: 'Read the source',
    adr: 'Read the decision (ADR-0050)',
    portsAdr: 'Read the ports decision (ADR 0063)',
  },
};

export type Dictionary = typeof en;
