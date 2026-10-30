import type { TaskSnapshot } from '../tasks.ts';
import type { TaskProviderAdapter, TaskReading } from './registry.ts';
import { field, nativeTaskId, numericId, TaskError } from './shared.ts';
import { vikunjaDetails } from './vikunja.ts';

const demoBrief = (change: string, check: string) => `This is a local demonstration task, not a linked external tracker item.\n\n${change}\n\nAcceptance criteria:\n- ${check}\n- Keep the change ready for human review; do not publish or merge it.\n\nThis fixture makes no model calls and spends nothing.`;
const demoDue = (days: number) => new Date(Math.floor(Date.now() / 86400000 + days) * 86400000).toISOString();
const demoLabels = (...names: string[]) => names.map(title => ({ title }));

function demoTasks(reading: TaskReading): TaskSnapshot[] {
  return [
    { id: '1', title: '[Demo fixture] Fix checkout rounding', priority: 4, due_date: demoDue(2), labels: demoLabels('ready'), description: 'This is a local demonstration task, not a linked external tracker item.\n\nFix the rounding regression in the order-service fixture.\n\nAcceptance criteria:\n- Checkout totals use decimal currency rounding.\n- Run the repository test suite and retain its actual result.\n- Keep the change ready for human review; do not publish or merge it.\n\nThis fixture runs real Git changes and checks without model calls or spend.' },
    { id: '2', title: '[Demo fixture] Show the delivery window on the order summary', priority: 3, labels: demoLabels('ready'), description: demoBrief('Show the expected delivery window on the order summary.', 'The order summary names the delivery window from the warehouse schedule.') },
    { id: '3', title: '[Demo fixture] Refuse negative quantities in the cart', priority: 3, due_date: demoDue(9), labels: demoLabels('ready'), description: demoBrief('Refuse a cart line with a quantity below zero.', 'The cart API answers 400 for a negative quantity.') },
    { id: '4', title: '[Demo fixture] Explain the shipping cost on the cart page', priority: 2, labels: demoLabels('ready'), description: demoBrief('Say on the cart page how the shipping cost is made up.', 'The cart page lists the shipping cost per parcel.') },
    { id: '5', title: '[Demo fixture] Check the postcode format at checkout', priority: 2, labels: demoLabels('ready', 'effort/S'), description: demoBrief('Check the postcode format before checkout accepts an address.', 'Checkout refuses a postcode that does not match the country format.') },
    { id: '6', title: '[Demo fixture] Name the shop in the order confirmation email', labels: demoLabels('ready'), description: demoBrief('Put the shop name in the subject of the order confirmation email.', 'The confirmation email subject starts with the shop name.') },
    { id: '7', title: '[Demo fixture] Interview five shops about delivery windows', priority: 3, labels: demoLabels('ready', 'repo/market-research'), description: demoBrief('Write up five shop interviews about delivery windows.', 'The research notes hold one summary per shop.') },
    { id: '8', title: '[Demo fixture] Order the new packaging boxes from the supplier', priority: 4, labels: demoLabels('repo/warehouse'), description: demoBrief('Order 500 packaging boxes in the new size.', 'The supplier confirms the order.') },
  ].map(value => reading.snapshot(value));
}

/** The deterministic demo's fixture tasks. They are never linked to a tracker or to Ploeg, and only demo mode may configure them. */
export const demo: TaskProviderAdapter = {
  name: 'demo',
  label: 'Demo fixture',
  fixture: true,
  descriptionFormat: 'markdown',
  taskId: numericId,
  apiRoot: () => undefined,
  project: value => value,
  webRoot: source => source.baseUrl.replace(/\/api\/v[1-4]$/, ''),
  taskUrl: (_source, id) => `https://example.invalid/unfold-demo/tasks/${id}`,
  headers(source, headers) { if (source.token) headers.Authorization = `Bearer ${source.token}`; },
  parse: (source, value, limit) => ({ id: nativeTaskId(numericId, value.id), title: field(value.title, 500), description: field(value.description, limit, true), status: 'open', updatedAt: '2026-09-09T00:00:00.000Z', project: source.project }),
  details: (_source, value, read) => vikunjaDetails(value, read),
  list: async (_source, page, reading) => ({ tasks: page === 1 ? demoTasks(reading) : [] }),
  async read(_source, id, _truncate, reading) {
    const task = demoTasks(reading).find(entry => entry.id === id);
    if (!task) throw new TaskError(404, 'task_not_found', 'The demonstration task does not exist.');
    return { task, value: {} };
  },
};
