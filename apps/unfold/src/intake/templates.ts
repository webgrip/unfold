import type { Mapping } from './mapping.ts';
import type { VerifierName } from './signatures.ts';

/**
 * How far a template was checked against the sender's own documentation: `verified` when every pointer names a field
 * the vendor documents, `partly` when the vendor documents the placeholders but the body is one Unfold proposes, and
 * `own` for a payload shape Unfold defines itself.
 */
export type TemplateCheck = 'verified' | 'partly' | 'own';

/** A built-in mapping for one sender, registered by name. */
export type IntakeTemplate = {
  id: string;
  name: string;
  verifier: VerifierName;
  check: TemplateCheck;
  docs: string[];
  notes: string;
  mapping: Mapping;
  senderBody?: Record<string, unknown>;
};

const templates = new Map<string, IntakeTemplate>();

/** Adds a template to the registry; a second template with the same id is refused. */
export function registerTemplate(template: IntakeTemplate): void {
  if (templates.has(template.id)) throw new Error(`Intake template ${template.id} is already registered`);
  templates.set(template.id, template);
}

/** The template registered as `id`, if any. */
export function intakeTemplate(id: string): IntakeTemplate | undefined { return templates.get(id); }

/** Every registered template, in registration order. */
export function intakeTemplates(): IntakeTemplate[] { return [...templates.values()]; }

registerTemplate({
  id: 'marker-io',
  name: 'Marker.io',
  verifier: 'hub-signature-256',
  check: 'verified',
  docs: ['https://help.marker.io/en/articles/3738778-webhooks-integration'],
  notes: 'Subscribe the webhook to issue.created; other events are acknowledged and ignored. Marker.io signs with X-Hub-Signature-256; paste its webhook secret into the source. The element shape of data.attachments is not documented, so only data.screenshotUrl is read. Marker.io has no labels field, so the issue type and priority become labels.',
  mapping: {
    when: [{ pointer: '/type', equals: 'issue.created' }],
    fields: {
      title: '/data/title',
      description: '/data/description',
      reporterName: '/data/reporter/name',
      reporterEmail: '/data/reporter/email',
      externalId: '/data/id',
      links: ['/data/website/url', '/data/publicUrl'],
      attachments: ['/data/screenshotUrl'],
      labels: ['/data/issueType/name', '/data/priority'],
    },
  },
});

registerTemplate({
  id: 'bugherd',
  name: 'BugHerd',
  verifier: 'token',
  check: 'verified',
  docs: ['https://docs.bugherd.com/api', 'https://docs.bugherd.com/api/openapi.yaml'],
  notes: 'Register one webhook for the task_create event. BugHerd neither signs nor sends custom headers, so the token goes in the URL as ?token=, the weakest mode. The page address is the task site joined with its path.',
  mapping: {
    fields: {
      title: '/task/title',
      description: '/task/description',
      reporterName: '/task/requester/display_name',
      reporterEmail: '/task/requester_email',
      externalId: '/task/id',
      links: [{ join: ['/task/site', '/task/url'] }, '/task/site', '/task/secret_link'],
      attachments: ['/task/screenshot_url', '/task/attachments'],
      labels: ['/task/tag_names'],
    },
  },
});

registerTemplate({
  id: 'userback',
  name: 'Userback',
  verifier: 'token',
  check: 'verified',
  docs: ['https://docs.userback.io/docs/webhooks'],
  notes: 'Webhooks need a Userback plan that offers them. Userback neither signs nor sends custom headers, so the token goes in the URL as ?token=, the weakest mode. Only new feedback (action create, type feedback) becomes a Request. The category is a comma-separated text and is split into labels.',
  mapping: {
    when: [{ pointer: '/action', equals: 'create' }, { pointer: '/type', equals: 'feedback' }],
    fields: {
      title: '/data/title',
      description: '/data/description',
      reporterName: '/data/name',
      reporterEmail: '/data/email',
      externalId: '/data/id',
      links: ['/data/page', '/data/share_url'],
      attachments: [{ pointer: '/data/screenshot', each: '/url' }, '/data/attachment', '/data/video'],
      labels: [{ pointer: '/data/category', split: ',' }, '/data/feedback_type'],
    },
  },
});

registerTemplate({
  id: 'freshdesk',
  name: 'Freshdesk',
  verifier: 'token',
  check: 'partly',
  docs: ['https://support.freshdesk.com/support/solutions/articles/52630', 'https://support.freshdesk.com/en/support/solutions/articles/132589'],
  notes: 'Create an automation rule under Ticket Creation with the Trigger webhook action, encoding JSON, Advanced content, and paste the sender body below. Add the custom header X-Unfold-Intake-Token. Freshdesk does not sign webhooks and has no attachment placeholder. The placeholders are documented; the body and the comma between tags are not checked against a live Freshdesk.',
  senderBody: { source: 'freshdesk', ticket: { id: '{{ticket.id}}', subject: '{{ticket.subject}}', description: '{{ticket.description_text}}', url: '{{ticket.url}}', portal_url: '{{ticket.portal_url}}', requester: { name: '{{ticket.requester.name}}', email: '{{ticket.requester.email}}' }, tags: '{{ticket.tags}}', type: '{{ticket.ticket_type}}' } },
  mapping: {
    fields: {
      title: '/ticket/subject',
      description: '/ticket/description',
      reporterName: '/ticket/requester/name',
      reporterEmail: '/ticket/requester/email',
      externalId: '/ticket/id',
      links: ['/ticket/url', '/ticket/portal_url'],
      labels: [{ pointer: '/ticket/tags', split: ',' }, '/ticket/type'],
    },
  },
});

registerTemplate({
  id: 'zendesk',
  name: 'Zendesk',
  verifier: 'zendesk',
  check: 'partly',
  docs: ['https://support.zendesk.com/hc/en-us/articles/4408886858138', 'https://developer.zendesk.com/documentation/webhooks/verifying/'],
  notes: 'Create a webhook connected to a trigger on ticket creation, with the sender body below as its JSON body, and paste the webhook signing secret into the source. Zendesk signs with X-Zendesk-Webhook-Signature over the timestamp and body. The placeholders and the signature are documented; the space between tags is not checked against a live Zendesk. Zendesk event-subscription webhooks carry no requester name or email, so this template reads the trigger body.',
  senderBody: { source: 'zendesk', ticket: { id: '{{ticket.id}}', title: '{{ticket.title}}', description: '{{ticket.latest_comment}}', link: '{{ticket.link}}', requester: { name: '{{ticket.requester.name}}', email: '{{ticket.requester.email}}' }, tags: '{{ticket.tags}}' } },
  mapping: {
    fields: {
      title: '/ticket/title',
      description: '/ticket/description',
      reporterName: '/ticket/requester/name',
      reporterEmail: '/ticket/requester/email',
      externalId: '/ticket/id',
      links: ['/ticket/link'],
      labels: [{ pointer: '/ticket/tags', split: ' ' }],
    },
  },
});

registerTemplate({
  id: 'form',
  name: 'Plain form or n8n',
  verifier: 'standard-webhooks',
  check: 'own',
  docs: [],
  notes: 'Unfold\'s own shape for a web form, a script or an n8n HTTP Request node: id, title, description, reporter {name, email}, links, attachments and labels, each a text or a list of texts. Sign it as a Standard Webhook, or use the token mode when the sender cannot compute an HMAC.',
  senderBody: { id: 'form-123', title: 'The checkout button does nothing', description: 'Clicking Pay on /checkout shows no error.', reporter: { name: 'Jane Smith', email: 'jane@example.com' }, links: ['https://example.com/checkout'], attachments: ['https://example.com/uploads/screenshot.png'], labels: ['bug'] },
  mapping: {
    fields: {
      title: '/title',
      description: '/description',
      reporterName: '/reporter/name',
      reporterEmail: '/reporter/email',
      externalId: '/id',
      links: ['/links'],
      attachments: ['/attachments'],
      labels: ['/labels'],
    },
  },
});
