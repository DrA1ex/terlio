import { commandRest, createCommandRegistry } from '../../src/lib/index.js';
import { SUPPORT_THEME_NAMES } from './themes.js';
import { SUPPORT_TEMPLATES } from './templates.js';
import {
  addTag,
  assignTicket,
  openTicket,
  refreshSla,
  removeTag,
  reopenTicket,
  requestConfirm,
  resetFilters,
  setFilter,
  setSort,
  setTicketPriority,
  setTicketStatus,
  startEditField,
  startNote,
  startReply,
  switchTheme,
} from './reducers.js';

export const SUPPORT_COMMANDS = [
  command('ticket', 'ticket <id>', 'Navigation', 'Open a ticket by id.', ({ state, parsed }) => openTicket(state, parsed.args[0]), ['open'], ['/ticket TCK-1042']),
  command('search', 'search <text>', 'Navigation', 'Filter queue by id, customer, subject or tags.', ({ state, parsed }) => { setFilter(state, { text: commandRest(parsed) }); return { ok: true, action: 'search' }; }, [], ['/search billing']),
  command('filter', 'filter <field> <value>', 'Navigation', 'Filter by queue, status or priority. Use /filter clear to reset.', ({ state, parsed }) => runFilterCommand(state, parsed), [], ['/filter priority high', '/filter queue billing', '/filter clear']),
  command('sort', 'sort <updated|sla|priority|status|queue>', 'Navigation', 'Sort the ticket queue.', ({ state, parsed }) => setSort(state, parsed.args[0] || 'updated'), [], ['/sort sla']),
  command('assign', 'assign <me|team>', 'Workflow', 'Assign selected ticket.', ({ state, parsed }) => assignTicket(state, parsed.args[0] ?? 'me'), ['owner'], ['/assign me', '/assign payments team']),
  command('status', 'status <open|pending|solved|closed>', 'Workflow', 'Change selected ticket status.', ({ state, parsed }) => setTicketStatus(state, parsed.args[0]), [], ['/status pending']),
  command('priority', 'priority <low|medium|high|urgent>', 'Workflow', 'Change selected ticket priority.', ({ state, parsed }) => setTicketPriority(state, parsed.args[0]), [], ['/priority high']),
  command('tag', 'tag <name>', 'Workflow', 'Add tag to selected ticket.', ({ state, parsed }) => addTag(state, commandRest(parsed)), [], ['/tag regression']),
  command('untag', 'untag <name>', 'Workflow', 'Remove tag from selected ticket.', ({ state, parsed }) => removeTag(state, commandRest(parsed)), [], ['/untag regression']),
  command('reply', 'reply [template <name>]', 'Composer', 'Open customer reply composer.', ({ state, parsed }) => startReply(state, parsed.args[0] === 'template' ? parsed.args[1] : ''), ['respond'], ['/reply', '/reply template refund']),
  command('note', 'note [text]', 'Composer', 'Open internal note composer or add draft text.', ({ state, parsed }) => startNote(state, commandRest(parsed)), [], ['/note customer attached receipt']),
  command('edit', 'edit <subject|impact|source|productArea>', 'Editing', 'Edit selected ticket field.', ({ state, parsed }) => { startEditField(state, parsed.args[0] || 'subject'); return { ok: true, action: 'edit' }; }, [], ['/edit subject']),
  command('escalate', 'escalate <team>', 'Workflow', 'Escalate selected ticket after confirmation.', ({ state, parsed }) => { const team = commandRest(parsed) || 'support lead'; requestConfirm(state, 'escalate', `Escalate ticket to ${team}?`, { team }); return { ok: true, action: 'escalate-confirm' }; }, [], ['/escalate payments']),
  command('snooze', 'snooze <duration>', 'Workflow', 'Snooze selected ticket after confirmation.', ({ state, parsed }) => { const label = commandRest(parsed) || '2h'; requestConfirm(state, 'snooze', `Snooze ticket for ${label}?`, { label, until: label }); return { ok: true, action: 'snooze-confirm' }; }, [], ['/snooze 2h']),
  command('close', 'close', 'Workflow', 'Close selected ticket after confirmation.', ({ state }) => { requestConfirm(state, 'close', 'Close selected ticket?'); return { ok: true, action: 'close-confirm' }; }, [], ['/close']),
  command('reopen', 'reopen', 'Workflow', 'Reopen selected ticket.', ({ state }) => { reopenTicket(state); return { ok: true, action: 'reopen' }; }, [], ['/reopen']),
  command('sla', 'sla', 'Live blocks', 'Refresh selected ticket SLA block.', ({ state }) => { refreshSla(state); return { ok: true, action: 'sla' }; }, [], ['/sla']),
  command('customer', 'customer', 'Navigation', 'Switch to customer tab.', ({ state }) => { state.activeTab = 'customer'; state.focus = 'work'; state.toasts.show('Customer profile selected.', 'info'); return { ok: true, action: 'customer' }; }, [], ['/customer']),
  command('timeline', 'timeline', 'Navigation', 'Switch to timeline tab.', ({ state }) => { state.activeTab = 'activity'; state.focus = 'work'; state.toasts.show('Activity timeline selected.', 'info'); return { ok: true, action: 'timeline' }; }, [], ['/timeline']),
  command('goto', 'goto <inbox|ticket|reply|customer|activity>', 'Navigation', 'Switch primary product tab.', ({ state, parsed }) => { const tab = String(parsed.args[0] ?? '').toLowerCase(); if (!['inbox','ticket','reply','customer','activity'].includes(tab)) { state.toasts.show(`Unknown tab: ${tab}`, 'error'); return { ok: false, reason: 'bad-tab' }; } state.activeTab = tab; state.focus = tab === 'inbox' ? 'inbox' : 'work'; state.toasts.show(`Opened ${tab} tab.`, 'info'); return { ok: true, action: 'goto' }; }, ['go'], ['/goto reply']),
  command('theme', 'theme <name>', 'Appearance', `Switch support theme: ${SUPPORT_THEME_NAMES.join(', ')}.`, ({ state, parsed }) => switchTheme(state, parsed.args[0]), [], ['/theme support-paper']),
  command('activity', 'activity <next|prev>', 'Navigation', 'Switch to Activity tab or move its pagination.', ({ state, parsed }) => { state.activeTab = 'activity'; const dir = String(parsed.args[0] || '').toLowerCase(); if (dir === 'next') state.activityPage = (state.activityPage || 0) + 1; if (dir === 'prev') state.activityPage = Math.max(0, (state.activityPage || 0) - 1); state.focus = 'work'; state.toasts.show('Activity tab selected.', 'info'); return { ok: true, action: 'activity' }; }, [], ['/activity']),
  command('send', 'send', 'Composer', 'Send the currently open reply or note composer.', ({ state }) => { state.toasts.show('Open /reply or /note, edit the draft, then press Enter to send.', 'info'); return { ok: true, action: 'send-hint' }; }, [], ['/send']),
  command('templates', 'templates', 'Composer', `Show templates: ${Object.keys(SUPPORT_TEMPLATES).join(', ')}.`, ({ state }) => { state.activeTab = 'reply'; state.toasts.show(`Templates: ${Object.keys(SUPPORT_TEMPLATES).join(', ')}`, 'info'); return { ok: true, action: 'templates' }; }, [], ['/templates']),
  command('help', 'help', 'Help', 'Open help overlay.', ({ state }) => { state.modes.push('help'); return { ok: true, action: 'help' }; }, ['?'], ['/help']),
];

export function createSupportCommandRegistry() {
  return createCommandRegistry(SUPPORT_COMMANDS);
}

export function createSupportPaletteItems(state) {
  const ticket = state?.tickets ? state.tickets[state.selectedIndex] : null;
  const templateItems = Object.entries(SUPPORT_TEMPLATES).map(([name, template]) => ({
    title: `Reply with template: ${template.title}`,
    description: `Insert ${name} reply template`,
    category: 'Templates',
    command: `/reply template ${name}`,
  }));

  return [
    { title: 'Assign to me', description: 'Take ownership of selected ticket', category: 'Workflow', command: '/assign me' },
    { title: 'Change status to Pending', description: 'Mark that we are waiting for customer', category: 'Workflow', command: '/status pending' },
    { title: 'Raise priority to High', description: 'Mark ticket as high priority', category: 'Workflow', command: '/priority high' },
    { title: 'Add regression tag', description: 'Tag as regression', category: 'Workflow', command: '/tag regression' },
    ...templateItems,
    { title: 'Add internal note', description: 'Open note composer', category: 'Composer', command: '/note' },
    { title: 'Show Activity timeline', description: 'Open the Activity tab with event pagination', category: 'Navigation', command: '/activity' },
    { title: 'Sort by SLA', description: 'Show the most urgent SLA first', category: 'Navigation', command: '/sort sla' },
    { title: 'Filter Billing queue', description: 'Show only billing tickets', category: 'Navigation', command: '/filter queue billing' },
    { title: 'Escalate to Payments', description: 'Requires confirmation', category: 'Workflow', command: '/escalate payments' },
    { title: 'Close ticket', description: `Close ${ticket?.id ?? 'selected ticket'}`, category: 'Workflow', command: '/close' },
    ...SUPPORT_THEME_NAMES.map((name) => ({ title: `Switch theme: ${name}`, description: 'Change support console theme', category: 'Appearance', command: `/theme ${name}` })),
  ];
}


export const SUPPORT_COMMAND_ARGUMENTS = {
  sort: ['updated', 'sla', 'priority', 'status', 'queue'],
  status: ['open', 'pending', 'snoozed', 'solved', 'closed'],
  priority: ['low', 'medium', 'high', 'urgent'],
  assign: ['me', 'payments', 'support lead', 'platform team', 'product team'],
  theme: SUPPORT_THEME_NAMES,
  goto: ['inbox', 'ticket', 'reply', 'customer', 'activity'],
  activity: ['next', 'prev'],
};

const FILTER_FIELDS = ['queue', 'priority', 'status', 'text'];
const FILTER_VALUES = {
  queue: ['all', 'billing', 'product', 'auth', 'platform'],
  priority: ['all', 'urgent', 'high', 'medium', 'low'],
  status: ['all', 'open', 'pending', 'snoozed', 'solved', 'closed'],
};

export function getSupportSlashSuggestions(state, raw = '/') {
  const input = String(raw || '/');
  const parsed = input.startsWith('/') ? input.slice(1) : input;
  const endsWithSpace = /\s$/.test(input);
  const tokens = parsed.trim().split(/\s+/).filter(Boolean);
  const commandName = tokens[0] || '';
  const argIndex = Math.max(0, endsWithSpace ? tokens.length - 1 : tokens.length - 2);
  const currentArg = endsWithSpace ? '' : (tokens.at(-1) || '');

  if (commandName === 'reply' && (argIndex === 0 || tokens[1] === 'template')) {
    if (argIndex === 0 && !endsWithSpace && currentArg && currentArg !== 'template') return commandMatches(state, input);
    return optionSuggestions('Reply template', Object.keys(SUPPORT_TEMPLATES), currentArg === 'template' ? '' : currentArg, (value) => `/reply template ${value}`);
  }

  if (commandName === 'filter') {
    if (argIndex === 0) return optionSuggestions('Filter field', ['clear', ...FILTER_FIELDS], currentArg, (value) => `/filter ${value}`);
    const field = tokens[1];
    if (FILTER_VALUES[field]) return optionSuggestions(`Filter ${field}`, FILTER_VALUES[field], currentArg, (value) => `/filter ${field} ${value}`);
  }

  if (SUPPORT_COMMAND_ARGUMENTS[commandName]) {
    return optionSuggestions(commandName, SUPPORT_COMMAND_ARGUMENTS[commandName], currentArg, (value) => `/${commandName} ${value}`);
  }

  if (commandName === 'tag' || commandName === 'untag') {
    const ticket = state?.tickets ? state.tickets[state.selectedIndex] : null;
    const values = commandName === 'untag' ? (ticket?.tags || []) : ['billing', 'regression', 'refund', 'safari', 'api', 'vip', 'escalated'];
    return optionSuggestions(commandName, values, currentArg, (value) => `/${commandName} ${value}`);
  }

  if (commandName === 'ticket') {
    const values = (state?.tickets || []).map((ticket) => ticket.id);
    return optionSuggestions('Ticket', values, currentArg, (value) => `/ticket ${value}`);
  }

  return commandMatches(state, input);
}

function commandMatches(state, input) {
  const registry = state?.registry ?? createSupportCommandRegistry();
  return registry.suggestions(input).slice(0, 10).map((item) => {
    const name = item.entry?.name ?? item.label.replace(/^\//, '');
    const needsArgs = /<|\[/.test(String(item.entry?.usage ?? ''));
    return {
      ...item,
      insert: `/${name}${needsArgs ? ' ' : ''}`,
      kind: 'command',
    };
  });
}

function optionSuggestions(category, values, current, insertFor) {
  const needle = String(current || '').toLowerCase();
  return values
    .filter((value) => !needle || String(value).toLowerCase().includes(needle))
    .slice(0, 10)
    .map((value) => ({
      label: String(value),
      detail: category,
      description: `Use ${value}`,
      command: insertFor(value),
      insert: insertFor(value),
      kind: 'argument',
      entry: { name: String(value), category, examples: [insertFor(value)] },
    }));
}

export function executeSupportCommand(state, rawCommand) {
  const registry = state.registry ?? createSupportCommandRegistry();
  const result = registry.execute(rawCommand, { state });
  state.actionLog.unshift(String(rawCommand ?? '').trim());
  if (!result.ok && result.reason === 'unknown') state.toasts.show(`Unknown command: ${rawCommand}`, 'error');
  if (!result.ok && result.reason === 'not-command') state.toasts.show('Type a slash command or use Ctrl+P.', 'warning');
  return result;
}

function command(name, usage, category, description, run, aliases = [], examples = []) {
  return { name, usage, category, description, run, aliases, examples, command: `/${usage}` };
}

function runFilterCommand(state, parsed) {
  const field = String(parsed.args[0] ?? '').toLowerCase();
  const value = parsed.args.slice(1).join(' ').toLowerCase();
  if (!field || field === 'clear') {
    resetFilters(state);
    state.toasts.show('Filters cleared.', 'info');
    return { ok: true, action: 'filter-clear' };
  }
  if (!['queue', 'priority', 'status', 'text'].includes(field)) {
    state.toasts.show(`Unknown filter field: ${field}`, 'error');
    return { ok: false, reason: 'bad-filter' };
  }
  setFilter(state, { [field]: value || 'all' });
  return { ok: true, action: 'filter' };
}
