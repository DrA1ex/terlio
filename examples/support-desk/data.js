import { createTimelineEvent } from '../../src/lib/index.js';

export function createSupportTickets() {
  return [
    ticket({
      id: 'TCK-1042',
      subject: 'Billing failed after upgrade',
      queue: 'Billing',
      status: 'open',
      priority: 'High',
      assignee: '',
      tags: ['billing', 'upgrade', 'receipt'],
      slaMinutes: 14,
      customer: customer('Acme Tools', 'Mira Chen', 'Pro', 'Healthy', 'mira@acme.example', 'UTC+1'),
      summary: 'Customer upgraded to Pro, payment succeeded, but the workspace still shows the old plan and a duplicate authorization is visible on the receipt.',
      messages: [
        msg('customer', 'Mira Chen', 'We upgraded to Pro this morning. The card was charged twice, but the workspace is still locked on the old plan.'),
        msg('system', 'Billing bot', 'Asked for invoice id and last four digits of the card.'),
        msg('customer', 'Mira Chen', 'Invoice INV-2049, card ending 4421. I attached the receipt screenshot.'),
      ],
      timeline: [
        event('customer_message', 'customer opened billing ticket', 'Mira Chen', -32),
        event('system_event', 'bot requested invoice id', 'Billing bot', -29),
        event('customer_message', 'customer attached receipt', 'Mira Chen', -18),
      ],
      activity: ['Receipt screenshot attached', 'Payment event pay_9D4 matched', 'Workspace plan sync pending'],
    }),
    ticket({
      id: 'TCK-1043',
      subject: 'Cannot export workspace',
      queue: 'Product',
      status: 'open',
      priority: 'Medium',
      assignee: 'Priya',
      tags: ['export', 'workspace'],
      slaMinutes: 80,
      customer: customer('Northwind Labs', 'Jon Bell', 'Team', 'Watch', 'jon@northwind.example', 'UTC-5'),
      summary: 'Workspace export starts, shows a spinner, and never produces a downloadable archive.',
      messages: [
        msg('customer', 'Jon Bell', 'Our legal team needs the full workspace export today. The export has been spinning for more than an hour.'),
        msg('agent', 'Priya', 'I am checking the export job queue and will update you shortly.'),
      ],
      timeline: [
        event('customer_message', 'customer opened export ticket', 'Jon Bell', -75),
        event('agent_reply', 'agent acknowledged export delay', 'Priya', -60),
        event('system_event', 'export worker retry observed', 'system', -42),
      ],
      activity: ['Export job exp_21F stuck in retry', 'Archive size estimate 1.8GB', 'Legal workspace flag enabled'],
    }),
    ticket({
      id: 'TCK-1044',
      subject: 'Login loop on Safari',
      queue: 'Auth',
      status: 'pending',
      priority: 'Medium',
      assignee: 'Alex',
      tags: ['auth', 'safari', 'session'],
      slaMinutes: 125,
      customer: customer('Pixel Foundry', 'Rae Stone', 'Business', 'Healthy', 'rae@pixel.example', 'UTC+0'),
      summary: 'Customer can sign in on Chrome, but Safari redirects back to the login screen after MFA.',
      messages: [
        msg('customer', 'Rae Stone', 'Safari keeps sending me back to login after MFA. Chrome works, but our designers use Safari.'),
        msg('agent', 'Alex', 'Thanks, I am checking whether a stale session cookie is still active.'),
      ],
      timeline: [
        event('customer_message', 'customer opened auth ticket', 'Rae Stone', -120),
        event('agent_reply', 'agent requested browser version', 'Alex', -111),
        event('system_event', 'session diagnostics attached', 'system', -97),
      ],
      activity: ['Safari 17.4', 'MFA passed', 'Session renewal fails on callback'],
    }),
    ticket({
      id: 'TCK-1045',
      subject: 'API rate limit unexpectedly low',
      queue: 'Platform',
      status: 'open',
      priority: 'High',
      assignee: '',
      tags: ['api', 'rate-limit', 'regression'],
      slaMinutes: 23,
      customer: customer('Greenbyte', 'Samir Patel', 'Enterprise', 'At risk', 'samir@greenbyte.example', 'UTC+3'),
      summary: 'Enterprise customer sees Team-plan API limits after contract renewal.',
      messages: [
        msg('customer', 'Samir Patel', 'Our integration is being throttled at 120 requests/minute. Contract says 1200.'),
        msg('system', 'Plan sync', 'Detected stale entitlement cache for account ent_71C.'),
      ],
      timeline: [
        event('customer_message', 'customer opened platform ticket', 'Samir Patel', -45),
        event('system_event', 'entitlement cache mismatch detected', 'system', -36),
      ],
      activity: ['Contract renewed yesterday', 'Entitlement cache stale', 'Affected API key key_82'],
    }),
    ticket({
      id: 'TCK-1046',
      subject: 'Invoice address change request',
      queue: 'Billing',
      status: 'open',
      priority: 'Low',
      assignee: 'Nora',
      tags: ['billing', 'invoice'],
      slaMinutes: 190,
      customer: customer('Cedar Clinic', 'Elena Morris', 'Pro', 'Healthy', 'elena@cedar.example', 'UTC-8'),
      summary: 'Customer needs the billing address updated on the last two invoices.',
      messages: [msg('customer', 'Elena Morris', 'Can you update the address on our March and April invoices?')],
      timeline: [event('customer_message', 'customer opened invoice ticket', 'Elena Morris', -90)],
      activity: ['Billing address verified', 'Two invoices need regeneration'],
    }),
    ticket({
      id: 'TCK-1047',
      subject: 'Webhook retries not visible',
      queue: 'Platform',
      status: 'pending',
      priority: 'Medium',
      assignee: '',
      tags: ['webhook', 'observability'],
      slaMinutes: 58,
      customer: customer('OrbitOps', 'Tara Young', 'Team', 'Watch', 'tara@orbit.example', 'UTC+2'),
      summary: 'Delivery retries happen, but the UI does not show retry attempts in the webhook log.',
      messages: [msg('customer', 'Tara Young', 'The endpoint received retries, but your UI still says 0 retries. Can you check?')],
      timeline: [event('customer_message', 'customer opened webhook ticket', 'Tara Young', -70)],
      activity: ['Endpoint 503 observed', 'Retry worker succeeded on third attempt', 'UI log projection delayed'],
    }),
  ];
}

export function createInitialTimeline() {
  return [
    createTimelineEvent({ type: 'system_event', actor: 'system', text: 'support desk opened' }),
  ];
}

function customer(name, contact, plan, health, email, timezone) {
  return { name, contact, plan, health, email, timezone, mrr: plan === 'Enterprise' ? '$8.4k' : plan === 'Business' ? '$1.9k' : plan === 'Team' ? '$740' : '$290' };
}

function ticket(input) {
  return {
    ...input,
    originalSlaMinutes: Math.max(120, input.slaMinutes),
    notes: [],
    linkedTickets: [],
    customFields: {
      productArea: input.queue,
      impact: input.priority === 'High' ? 'Multiple users affected' : 'Single workspace',
      source: 'Email',
    },
  };
}

function msg(role, author, body) {
  return { id: `msg_${Math.random().toString(36).slice(2, 8)}`, role, author, body, time: new Date().toISOString() };
}

function event(type, text, actor, minutesAgo) {
  const date = new Date(Date.now() + minutesAgo * 60 * 1000);
  return createTimelineEvent({ type, text, actor, time: date });
}
