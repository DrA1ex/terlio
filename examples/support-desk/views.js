import {
  Box,
  Column,
  ConfirmPrompt,
  FooterStatusBar,
  HelpOverlay,
  Lines,
  Modal,
  ProgressBar,
  Row,
  Text,
  color,
  formatTimelineTime,
  getResponsiveMode,
  padEndVisible,
  renderCommandPalette,
  renderNode,
  responsiveColumns,
  stripAnsi,
  takeVisible,
  truncateVisible,
  visibleLength,
} from '../../src/lib/index.js';
import { getActivityEvents, getSelectedTicket, getVisibleTickets } from './reducers.js';
import { getSupportTheme, SUPPORT_THEME_NAMES } from './themes.js';
import { SUPPORT_TEMPLATES, renderTemplate } from './templates.js';

export const SUPPORT_TABS = [
  { id: 'inbox', label: 'Inbox' },
  { id: 'ticket', label: 'Ticket' },
  { id: 'reply', label: 'Reply' },
  { id: 'customer', label: 'Customer' },
  { id: 'activity', label: 'Activity' },
];

export function createSupportDeskView({ state, width = 118, height = 34 } = {}) {
  const mode = getResponsiveMode(width);
  const theme = getSupportTheme(state.themeName);
  const node = mode === 'wide'
    ? wideLayout({ state, width, height, theme })
    : mode === 'medium'
      ? mediumLayout({ state, width, height, theme })
      : narrowLayout({ state, width, height, theme });

  return Column(node, overlayLayer({ state, theme }));
}

function wideLayout({ state, width, height, theme }) {
  const columns = responsiveColumns(width, 'wide');
  const header = appHeader({ state, width, theme });
  const tabs = tabsBar({ state, theme });
  const command = commandArea({ state, theme });
  const activity = activityStrip({ state, theme });
  const footer = footerBar({ state, theme });
  const mainHeight = fixedMainHeight({ width, height, fixed: [header, tabs, command, activity, footer] });
  const main = Box({ border: false, height: mainHeight },
    Row({ gap: 2, widths: [columns.left, columns.middle, columns.right] },
      inboxPane({ state, theme, width: columns.left, height: mainHeight }),
      activeWorkArea({ state, theme, mode: 'wide', width: columns.middle, height: mainHeight }),
      contextRail({ state, theme, width: columns.right }),
    ),
  );
  return Column(header, tabs, main, command, activity, footer);
}

function mediumLayout({ state, width, height, theme }) {
  const columns = responsiveColumns(width, 'medium');
  const header = appHeader({ state, width, theme, compact: true });
  const tabs = tabsBar({ state, theme });
  const command = commandArea({ state, theme });
  const activity = activityStrip({ state, theme, compact: true });
  const footer = footerBar({ state, theme, compact: true });
  const mainHeight = fixedMainHeight({ width, height, fixed: [header, tabs, command, activity, footer] });
  const main = Box({ border: false, height: mainHeight },
    Row({ gap: 2, widths: [columns.left, columns.middle] },
      inboxPane({ state, theme, width: columns.left, height: mainHeight, compact: true }),
      activeWorkArea({ state, theme, mode: 'medium', width: columns.middle, height: mainHeight }),
    ),
  );
  return Column(header, tabs, main, command, activity, footer);
}

function narrowLayout({ state, width, height, theme }) {
  const header = appHeader({ state, width, theme, compact: true });
  const tabs = tabsBar({ state, theme, compact: true });
  const command = commandArea({ state, theme, compact: true });
  const footer = footerBar({ state, theme, compact: true });
  const mainHeight = fixedMainHeight({ width, height, fixed: [header, tabs, command, footer] });
  const main = Box({ border: false, height: mainHeight },
    activeWorkArea({ state, theme, mode: 'narrow', width, height: mainHeight }),
  );
  return Column(header, tabs, main, command, footer);
}

function fixedMainHeight({ width, height, fixed }) {
  const reserved = fixed.reduce((sum, node) => sum + renderNode(node, width).length, 0);
  return Math.max(1, Math.max(1, Number(height) || 1) - reserved);
}

function appHeader({ state, width, theme, compact = false }) {
  const selected = getSelectedTicket(state);
  const atRisk = state.tickets.filter((ticket) => slaState(ticket) === 'risk').length;
  const open = state.tickets.filter((ticket) => ticket.status === 'open').length;
  const unassigned = state.tickets.filter((ticket) => !ticket.assignee).length;
  const mode = getResponsiveMode(width);
  const live = state.frame % 2 === 0 ? '●' : '○';

  const queueLabel = state.filter.queue === 'all' ? 'All Queues' : titleCase(state.filter.queue);
  const main = compact
    ? `${brand(theme)}  Queue ${tag(queueLabel, theme, 'accent')}  Open ${color(theme, 'ok', open)}  Risk ${color(theme, 'error', atRisk)}  ${color(theme, 'muted', mode)}`
    : `${brand(theme)}  │  Queue ${tag(queueLabel, theme, 'accent')}  │  Open ${color(theme, 'ok', open)}  │  Unassigned ${color(theme, 'system', unassigned)}  │  SLA at Risk ${color(theme, 'error', atRisk)}  │  ${color(theme, 'ok', live)} Agent ${color(theme, 'accent', state.agent)}  │  Theme ${color(theme, 'accent', state.themeName)}`;
  const secondary = compact
    ? `Focus ${color(theme, 'accent', state.focus)} · Selected ${color(theme, 'accent', selected.id)} ${truncateVisible(selected.subject, Math.max(22, width - 46))}`
    : `Focus ${color(theme, 'accent', state.focus)}${state.commandActive ? color(theme, 'system', ' · COMMAND') : ''}   │   Shortcuts: / Command   Tab Focus   [/] Tabs   Ctrl+P Palette   ? Help   q Quit   │   Selected ${color(theme, 'accent', selected.id)} ${truncateVisible(selected.subject, 38)}`;

  return pane({ title: ' support-desk — Support Triage Desk ', theme },
    Text(main, { wrap: false }),
    Text(color(theme, 'muted', secondary), { wrap: false }),
  );
}

function tabsBar({ state, theme, compact = false }) {
  const parts = SUPPORT_TABS.map((tab) => {
    const active = tab.id === state.activeTab;
    const label = active ? `[${tab.label}]` : ` ${tab.label} `;
    return active ? color(theme, state.focus === 'tabs' ? 'selected' : 'accent', label) : color(theme, 'muted', label);
  });
  const help = compact ? '[/] tabs · /goto <tab>' : '[/] tabs · / command · Tab focus · Enter acts in focused pane';
  return pane({ title: state.focus === 'tabs' ? ' TABS FOCUSED ' : '', theme },
    Text(`${parts.join('   ')}${compact ? '' : `       ${color(theme, 'muted', help)}`}`, { wrap: false }),
  );
}

function inboxPane({ state, theme, width, height = 36, compact = false }) {
  const visible = getVisibleTickets(state);
  const windowSize = compact ? 10 : Math.max(8, Math.min(12, height - 19));
  const slice = takeVisible(visible, state.selectedIndex, windowSize);
  const inner = Math.max(32, width - 4);
  const rows = slice.items.map((ticket, offset) => ticketRow({ ticket, selected: slice.start + offset === slice.selected, theme, width: inner }));

  return pane({ title: `${state.focus === 'inbox' ? '▶' : ' '} INBOX ${spinner(state.frame)} Live `, theme },
    Text(filterLine(state, theme, inner), { wrap: false }),
    Text(quickFilterLine(state, theme, inner), { wrap: false }),
    Text(searchLine(state, theme, inner), { wrap: false }),
    Text(color(theme, 'muted', ticketTableHeader(inner)), { wrap: false }),
    ...rows.map((row) => Text(row, { wrap: false })),
    Text(color(theme, 'muted', truncateVisible(`${slice.start + 1}-${slice.start + slice.items.length} of ${visible.length}     Updated ${clockTime()}`, inner)), { wrap: false }),
  );
}

function activeWorkArea({ state, theme, mode, width, height }) {
  const ticket = getSelectedTicket(state);
  if (state.activeTab === 'inbox') return inboxFocusView({ state, ticket, theme, width, mode });
  if (state.activeTab === 'reply') return replyView({ state, ticket, theme, width, mode });
  if (state.activeTab === 'customer') return customerFocusView({ ticket, theme, width, mode });
  if (state.activeTab === 'activity') return activityFocusView({ state, ticket, theme, width, mode });
  return ticketView({ state, ticket, theme, mode, width, height });
}

function inboxFocusView({ state, ticket, theme, width, mode }) {
  return pane({ title: `${state.focus === 'work' ? '▶' : ' '} QUEUE OVERVIEW `, theme },
    Text(`Visible ${color(theme, 'accent', getVisibleTickets(state).length)} / ${state.tickets.length} tickets`, { wrap: false }),
    Text(`Queue ${tag(state.filter.queue, theme, 'accent')}  Status ${tag(state.filter.status, theme, 'muted')}  Priority ${tag(state.filter.priority, theme, 'muted')}`, { wrap: false }),
    Text(color(theme, 'muted', 'Use ↑/↓ to move, Enter to open, /search or /filter to narrow the queue.'), { wrap: false }),
    divider(theme, width - 4),
    ...ticketSnapshotLines({ ticket, theme, width, mode }),
  );
}

function ticketView({ state, ticket, theme, mode, width }) {
  const inner = Math.max(48, width - 4);
  const limit = mode === 'wide' ? 9 : mode === 'medium' ? 8 : 6;
  return pane({ title: `${state.focus === 'work' ? '▶' : ' '} TICKET ${ticket.id} `, theme },
    Text(`${color(theme, 'title', truncateVisible(ticket.subject, Math.max(18, inner - 36)))}  ${queueBadge(ticket.queue, theme)}  ${color(theme, 'muted', `Created ${relativeAge(ticket)} · Updated ${clockTime()}`)}`, { wrap: false }),
    Text(`Status ${statusBadge(ticket.status, theme)}  Priority ${priorityBadge(ticket.priority, theme)}  Assignee ${color(theme, 'accent', ticket.assignee || 'unassigned')}  Customer ${color(theme, 'accent', ticket.customer.contact)}`, { wrap: false }),
    Text(`Tags ${ticket.tags.map((item) => tag(item, theme, 'muted')).join(' ')}  ${color(theme, 'muted', '+ Add tag')}`, { wrap: false }),
    ...wrapTextLines(ticket.summary, inner).slice(0, 2).map((line) => Text(color(theme, 'subtle', line), { wrap: false })),
    divider(theme, inner),
    Text(color(theme, 'muted', 'THREAD'), { wrap: false }),
    ...threadRows({ ticket, theme, width: inner, limit }),
    divider(theme, inner),
    quickReplyStripLine({ state, theme, width: inner }),
  );
}

function replyView({ state, ticket, theme, mode, width }) {
  const inner = Math.max(48, width - 4);
  const draft = draftText(state, ticket);
  const editorLimit = mode === 'wide' ? 9 : 7;
  const previewLimit = mode === 'wide' ? 5 : 3;
  const templateNames = Object.keys(SUPPORT_TEMPLATES).slice(0, 4);

  return pane({ title: `${state.focus === 'work' ? '▶' : ' '} REPLY TO ${ticket.id} `, theme },
    Text(`${color(theme, 'title', truncateVisible(ticket.subject, Math.max(20, inner - 34)))}  ${color(theme, 'ok', '●')} Autosaved ${clockTime()}  Tone ${tag('Empathetic ▾', theme, 'accent')}`, { wrap: false }),
    Text(`Template  ${templateNames.map((name) => tag(name, theme, state.composerTemplate === name ? 'ok' : 'muted')).join(' ')}`, { wrap: false }),
    divider(theme, inner),
    Text(color(theme, 'subtle', 'Internal context (not visible to customer)'), { wrap: false }),
    ...wrapTextLines(internalContext(ticket), inner).slice(0, 3).map((line) => Text(line, { wrap: false })),
    divider(theme, inner),
    Text(color(theme, 'muted', 'DRAFT REPLY — Markdown supported'), { wrap: false }),
    ...editorLines(draft, editorLimit, inner).map((line) => Text(line, { wrap: false })),
    Text(color(theme, 'muted', `Lines ${draft.split('\n').length} · Words ${wordCount(draft)} · Chars ${draft.length}`), { wrap: false }),
    divider(theme, inner),
    Text(color(theme, 'muted', 'PREVIEW'), { wrap: false }),
    ...wrapTextLines(draft, inner).filter(Boolean).slice(0, previewLimit).map((line) => Text(line, { wrap: false })),
    divider(theme, inner),
    Text(`${color(theme, 'system', 'Internal note')} ${truncateVisible(ticket.notes[0]?.body || 'No note yet. Use /note.', Math.max(20, inner - 34))}`, { wrap: false }),
    Text(`${sendReady(draft) ? color(theme, 'ok', '✓ Ready to send') : color(theme, 'system', '○ Draft incomplete')}    ${color(theme, 'accent', 'Send Reply ↵')}    ${color(theme, 'muted', '/send /save-draft /insert macro')}`, { wrap: false }),
  );
}

function customerFocusView({ ticket, theme, width }) {
  const inner = Math.max(48, width - 4);
  return pane({ title: ' CUSTOMER PROFILE ', theme },
    Text(`${color(theme, 'title', ticket.customer.name)}  ${color(theme, 'accent', ticket.customer.contact)}  ${color(theme, 'muted', ticket.customer.timezone)}`, { wrap: false }),
    Text(`${ticket.customer.email}  ·  Plan ${color(theme, 'accent', ticket.customer.plan)}  MRR ${ticket.customer.mrr}  Health ${healthText(ticket.customer.health, theme)}`, { wrap: false }),
    divider(theme, inner),
    Text(color(theme, 'muted', 'Open tickets'), { wrap: false }),
    Text(`${ticket.id}  ${truncateVisible(ticket.subject, inner - 18)}  ${statusBadge(ticket.status, theme)}`, { wrap: false }),
    Text(`#SD-5090  Update billing address                 ${color(theme, 'ok', 'Solved')}`, { wrap: false }),
    Text(`#SD-5031  Invoice not available                  ${color(theme, 'ok', 'Solved')}`, { wrap: false }),
    divider(theme, inner),
    Text(color(theme, 'muted', 'Conversation summary'), { wrap: false }),
    ...wrapTextLines(ticket.summary, inner).slice(0, 4).map((line) => Text(line, { wrap: false })),
  );
}

function activityFocusView({ state, ticket, theme, width, mode }) {
  const inner = Math.max(48, width - 4);
  const allEvents = buildActivityEvents(state, ticket);
  const pageSize = mode === 'wide' ? 7 : 6;
  const maxPage = Math.max(0, Math.ceil(allEvents.length / pageSize) - 1);
  const page = clamp(state.activityPage || 0, 0, maxPage);
  const start = page * pageSize;
  const events = allEvents.slice(start, start + pageSize);
  return pane({ title: `${state.focus === 'activity' || state.focus === 'work' ? '▶' : ' '} ACTIVITY TIMELINE ${spinner(state.frame)} Live `, theme },
    Text(`Time [Last 24h]  Queues [All]  Types [All]  Agents [All]  Search ${state.filter.text || '<none>'}`, { wrap: false }),
    Text(metricLine({ state, theme }), { wrap: false }),
    divider(theme, inner),
    Text(color(theme, 'muted', activityHeader(inner)), { wrap: false }),
    ...events.map((event, index) => Text(activityRow({ event, theme, width: inner, selected: start + index === state.activitySelectedIndex }), { wrap: false })),
    divider(theme, inner),
    Text(color(theme, 'muted', `Page ${page + 1}/${maxPage + 1}  Rows ${start + 1}-${start + events.length} of ${allEvents.length}    ←/→ or PgUp/PgDn paginate    ↑/↓ select event`), { wrap: false }),
  );
}

function contextRail({ state, theme, width }) {
  const ticket = getSelectedTicket(state);
  if (state.activeTab === 'reply') {
    return Column(
      customerCard({ ticket, theme, width }),
      accountCard({ ticket, theme, width }),
      summaryCard({ ticket, theme, width }),
      checklistCard({ ticket, theme, width }),
      macroCard({ theme, width }),
    );
  }
  if (state.activeTab === 'activity') {
    return Column(
      eventDetailsCard({ event: buildActivityEvents(state, ticket)[state.activitySelectedIndex] || buildActivityEvents(state, ticket)[0], ticket, theme, width }),
      liveMetricsCard({ state, theme, width }),
      busyAgentsCard({ theme, width }),
    );
  }
  return Column(
    propertiesCard({ ticket, theme, width }),
    slaCard({ ticket, state, theme, width }),
    customerCard({ ticket, theme, width }),
    actionsCard({ theme, width }),
  );
}

function propertiesCard({ ticket, theme, width }) {
  const inner = Math.max(28, width - 4);
  return pane({ title: ' TICKET PROPERTIES ', theme },
    Text(prop('Status', statusBadge(ticket.status, theme), inner), { wrap: false }),
    Text(prop('Priority', priorityBadge(ticket.priority, theme), inner), { wrap: false }),
    Text(prop('Assignee', color(theme, 'accent', ticket.assignee || 'unassigned'), inner), { wrap: false }),
    Text(prop('Queue', color(theme, 'accent', ticket.queue), inner), { wrap: false }),
    Text(prop('Tags', ticket.tags.map((item) => tag(item, theme, 'muted')).join(' '), inner), { wrap: false }),
    Text(prop('SLA Plan', color(theme, 'accent', 'Standard (24h)'), inner), { wrap: false }),
    Text(prop('Linked', `${ticket.linkedTickets.length || 0} issues  + Link`, inner), { wrap: false }),
  );
}

function slaCard({ ticket, state, theme, width }) {
  const total = Math.max(1, ticket.originalSlaMinutes || 120);
  const elapsed = Math.max(0, total - ticket.slaMinutes);
  const risk = slaState(ticket);
  return pane({ title: ' SLA ', theme },
    Text(`${pulse(state.frame, risk === 'risk')} First response  ${slaText(ticket, theme)}`, { wrap: false }),
    ProgressBar({ value: elapsed, total, width: Math.max(12, Math.min(22, width - 20)), label: 'elapsed' }),
    Text(`Policy       ${ticket.customer.plan} ${ticket.queue} SLA`, { wrap: false }),
    Text(`Resolution   due in 4d 21h`, { wrap: false }),
  );
}

function customerCard({ ticket, theme }) {
  return pane({ title: ' CUSTOMER ', theme },
    Text(`${color(theme, 'title', ticket.customer.name)}  ${color(theme, 'accent', ticket.customer.contact)}`, { wrap: false }),
    Text(`${ticket.customer.email}  ·  ${ticket.customer.timezone}`, { wrap: false }),
    Text(`Plan ${color(theme, 'accent', ticket.customer.plan)}  MRR ${ticket.customer.mrr}  Health ${healthText(ticket.customer.health, theme)}`, { wrap: false }),
  );
}

function accountCard({ ticket, theme }) {
  return pane({ title: ' PLAN & ACCOUNT ', theme },
    Text(`Plan ${color(theme, 'accent', ticket.customer.plan)}  Renewal Jun 12, 2025`, { wrap: false }),
    Text(`Spend MTD ${ticket.customer.mrr}  Health ${healthText(ticket.customer.health, theme)}`, { wrap: false }),
    Text(color(theme, 'muted', 'Recent: 2 open tickets · 4 solved'), { wrap: false }),
  );
}

function summaryCard({ ticket, theme }) {
  return pane({ title: ' CONVERSATION SUMMARY ', theme },
    Text(`› ${truncateVisible(ticket.summary, 48)}`, { wrap: false }),
    Text(`› Last: ${truncateVisible(lastCustomerMessage(ticket), 52)}`, { wrap: false }),
    Text(`› Queue ${ticket.queue}; priority ${ticket.priority}; SLA ${ticket.slaMinutes}m`, { wrap: false }),
  );
}

function checklistCard({ ticket, theme }) {
  const items = responseChecklist(ticket);
  return pane({ title: ` RESPONSE CHECKLIST ${items.filter((item) => item.done).length}/${items.length} `, theme },
    ...items.map((item) => Text(`${item.done ? color(theme, 'ok', '✓') : color(theme, 'muted', '○')} ${item.label}`, { wrap: false })),
  );
}

function macroCard({ theme }) {
  return pane({ title: ' SUGGESTED MACROS ', theme },
    Text(`${color(theme, 'accent', 'refund_issue')}    Full refund + apology  1`, { wrap: false }),
    Text(`${color(theme, 'accent', 'apology')}         Apology and empathy    2`, { wrap: false }),
    Text(`${color(theme, 'accent', 'need_info')}       Request details        3`, { wrap: false }),
    Text(color(theme, 'subtle', 'View all macros (12) →'), { wrap: false }),
  );
}

function actionsCard({ theme }) {
  return pane({ title: ' ACTIONS ', theme },
    Text(`${color(theme, 'accent', 'Assign (a)')}  ${color(theme, 'accent', 'Close (c)')}  ${color(theme, 'accent', 'Escalate (e)')}`, { wrap: false }),
    Text(color(theme, 'muted', 'More: /reply /note /tag /snooze /merge'), { wrap: false }),
  );
}

function eventDetailsCard({ event, ticket, theme }) {
  const safe = event ?? { id: 'evt_none', type: 'system_event', actor: 'system', text: 'no selected event', time: new Date().toISOString() };
  return pane({ title: ' EVENT DETAILS ', theme },
    Text(`Event ID    ${safe.id}`, { wrap: false }),
    Text(`Type        ${color(theme, 'accent', safe.type)}`, { wrap: false }),
    Text(`Timestamp   ${formatTimelineTime(safe.time)}`, { wrap: false }),
    Text(`Actor       ${safe.actor}`, { wrap: false }),
    Text(`Related     Ticket ${ticket.id}`, { wrap: false }),
    Text(`Description ${truncateVisible(safe.text, 58)}`, { wrap: false }),
  );
}

function liveMetricsCard({ state, theme }) {
  return pane({ title: ' LIVE METRICS — Last 24h ', theme },
    Text(`Avg first response   ${color(theme, 'accent', '18m 42s')}  ${color(theme, 'ok', '↑ 8%')}`, { wrap: false }),
    Text(`Avg resolution       ${color(theme, 'accent', '6h 21m')}   ${color(theme, 'ok', '↓ 5%')}`, { wrap: false }),
    Text(`SLA compliance       ${color(theme, 'error', '91.2%')}   ${color(theme, 'error', '↓ 2.1%')}`, { wrap: false }),
    Text(`Backlog              ${state.tickets.length * 21}       ${color(theme, 'ok', '↑ 11%')}`, { wrap: false }),
  );
}

function busyAgentsCard({ theme }) {
  return pane({ title: ' TOP BUSY AGENTS ', theme },
    Text(`1  alex.morgan   ${color(theme, 'ok', '████████')}  42  91%`, { wrap: false }),
    Text(`2  priya.s       ${color(theme, 'ok', '██████')}    38  88%`, { wrap: false }),
    Text(`3  sam.jones     ${color(theme, 'ok', '████')}      29  85%`, { wrap: false }),
  );
}

function commandArea({ state, theme, compact = false }) {
  const toast = state.toasts.toast ? state.toasts.current() : null;
  const commandNode = state.commandActive
    ? activeCommandArea({ state, theme, compact })
    : idleCommandArea({ state, theme, compact });
  return Column(
    toast ? pane({ title: ` ${toast.level} `, theme }, Text(`${toastIcon(toast.level)} ${toast.message}`, { wrap: false })) : null,
    commandNode,
  );
}

function idleCommandArea({ state, theme }) {
  const focus = state.focus === 'command' ? color(theme, 'selected', 'COMMAND') : 'COMMAND';
  return pane({ title: ` ${focus} `, theme },
    Text(`${color(theme, 'muted', 'Press / to enter slash commands. Ctrl+P opens product palette. Tab switches focus zones.')}`, { wrap: false }),
    Text(color(theme, 'muted', 'Useful: /reply · /note · /assign me · /status pending · /filter queue billing · /sort sla · /activity'), { wrap: false }),
  );
}

function activeCommandArea({ state, theme, compact = false }) {
  const suggestions = slashSuggestionRows(state, theme, compact ? 4 : 6);
  const parts = state.input.getParts?.() ?? { before: state.input.value, current: ' ', after: '' };
  const inputLine = `${parts.before}${color(theme, 'selected', parts.current || ' ')}${parts.after}`;
  return pane({ title: ' COMMAND MODE — slash suggestions ', theme },
    Text(inputLine, { wrap: false }),
    ...suggestions.map((line) => Text(line, { wrap: false })),
    Text(color(theme, 'muted', '↑/↓ choose · Tab insert · Enter execute/apply · Esc cancel'), { wrap: false }),
  );
}

function slashSuggestionRows(state, theme, limit) {
  const suggestions = state.registry.suggestions(state.input.value || '/').slice(0, Math.max(1, limit));
  if (!suggestions.length) return [color(theme, 'muted', 'No matching commands.')];
  return suggestions.map((item, index) => {
    const selected = index === state.commandSuggestionIndex;
    const example = item.entry?.examples?.[0] || `/${item.entry?.name || item.label.replace(/^\//, '')}`;
    const label = `${selected ? '›' : ' '} ${example}`;
    const detail = `${item.detail || item.entry?.category || ''} — ${item.description || ''}`;
    return `${selected ? color(theme, 'selected', label) : color(theme, 'accent', label)}  ${color(theme, 'muted', truncateVisible(detail, 90))}`;
  });
}

function activityStrip({ state, theme, compact = false }) {
  const events = buildActivityEvents(state, getSelectedTicket(state)).slice(0, compact ? 3 : 5);
  return pane({ title: ` ACTIVITY FEED ${spinner(state.frame)} Live `, theme },
    Text(events.map((event) => `${formatTimelineTime(event.time)} ${color(theme, 'accent', event.related || event.ticketId || '')} ${truncateVisible(event.text, compact ? 22 : 30)}`).join('  │  '), { wrap: false }),
  );
}

function toastIcon(level) {
  return { info: 'i', success: '✓', warning: '!', error: '×' }[level] || 'i';
}

function footerBar({ state, theme, compact = false }) {
  return Box({ border: false, padding: { left: 1, right: 1 } },
    FooterStatusBar({
      left: [color(theme, 'ok', '● Connected'), 'Broker: nats://localhost:4222', 'Env: production'],
      right: compact ? [clockTime()] : [`Uptime: 7d 4h ${Math.floor(state.frame / 4) % 60}m`, `≈≈ ${clockTime()}`],
    }),
  );
}

function overlayLayer({ state, theme }) {
  const mode = state.modes.current();
  if (mode === 'confirm') {
    return ConfirmPrompt({
      title: ' Confirm workflow action ',
      message: state.pendingConfirm?.message || 'Continue?',
      selected: state.confirmSelected,
      confirmLabel: 'Confirm',
      cancelLabel: 'Cancel',
    });
  }
  if (mode === 'help') {
    return HelpOverlay({
      title: ' Support Desk Help ',
      shortcuts: [
        ['Tab / Shift+Tab', 'switch focus zone'],
        ['↑/↓', 'move inside focused zone'],
        ['[/]', 'switch product tabs'],
        ['/', 'open slash-command suggestions'],
        ['Enter', 'open / execute / send in focused mode'],
        ['Ctrl+P', 'product command palette'],
        ['/theme', SUPPORT_THEME_NAMES.join(', ')],
      ],
    });
  }
  if (mode === 'palette') {
    return Modal({ title: ' Command Palette ', children: [renderCommandPalette(state.palette, { title: ' Product actions ', showHelp: true })], footer: 'Type to search · Enter inserts command · Esc closes' });
  }
  if (mode === 'edit') {
    return Modal({ title: ` Editing ${state.editField} `, children: [Text('Enter saves the field. Esc cancels.'), Text(color(theme, 'accent', '› ') + state.fieldEditor.value)] });
  }
  return null;
}

function ticketRow({ ticket, selected, theme, width }) {
  const idWidth = Math.min(9, Math.max(7, width < 45 ? 7 : 9));
  const statusWidth = width >= 46 ? 8 : 4;
  const priorityWidth = 1;
  const slaWidth = width >= 46 ? 5 : 4;
  const gap = 1;
  const subjectWidth = Math.max(8, width - idWidth - statusWidth - priorityWidth - slaWidth - gap * 5 - 2);
  const marker = selected ? '›' : ' ';
  const subject = fitText(ticket.subject, subjectWidth);
  const raw = `${marker} ${fitText(ticket.id, idWidth)} ${subject} ${fitText(ticket.status.toUpperCase(), statusWidth)} ${ticket.priority[0] || '?'} ${fitText(`${ticket.slaMinutes}m`, slaWidth)}`;
  if (selected) return color(theme, 'selected', raw);
  const token = ticket.slaMinutes <= 15 ? 'error' : ticket.slaMinutes <= 60 ? 'system' : 'muted';
  return `${color(theme, 'accent', `${marker} ${fitText(ticket.id, idWidth)}`)} ${subject} ${statusBadge(ticket.status, theme, statusWidth)} ${priorityBadge(ticket.priority, theme)} ${color(theme, token, fitText(`${ticket.slaMinutes}m`, slaWidth))}`;
}

function ticketTableHeader(width) {
  const subjectWidth = Math.max(8, width - 9 - 8 - 1 - 5 - 7);
  return `ID        ${fitText('SUBJECT', subjectWidth)} STATUS   P SLA`;
}

function ticketSnapshotLines({ ticket, theme, width }) {
  const inner = Math.max(42, width - 4);
  return [
    Text(`${color(theme, 'accent', ticket.id)}  ${ticket.subject}`, { wrap: false }),
    Text(`Status ${statusBadge(ticket.status, theme)}  Priority ${priorityBadge(ticket.priority, theme)}  SLA ${slaText(ticket, theme)}`, { wrap: false }),
    ...wrapTextLines(ticket.summary, inner).slice(0, 3).map((line) => Text(color(theme, 'muted', line), { wrap: false })),
  ];
}

function threadRows({ ticket, theme, width, limit }) {
  const events = [
    ...ticket.messages.map((message) => ({ kind: message.role, actor: message.author, body: message.body, time: message.time, channel: message.role === 'system' ? 'Auto' : 'via Web' })),
    ...ticket.notes.map((note) => ({ kind: 'note', actor: `${note.author} (Internal)`, body: note.body, time: note.time, channel: 'Internal' })),
  ].sort((a, b) => new Date(a.time) - new Date(b.time)).slice(-limit);

  return events.flatMap((item, index) => threadItemLines({ item, index, theme, width }));
}

function threadItemLines({ item, index, theme, width }) {
  const token = item.kind === 'customer' ? 'user' : item.kind === 'agent' ? 'assistant' : item.kind === 'note' ? 'system' : 'muted';
  const marker = item.kind === 'note' ? '◆' : item.kind === 'system' ? '◇' : '●';
  const header = `${color(theme, token, marker)} ${formatTimelineTime(item.time)}  ${color(theme, token, item.actor)}  ${color(theme, 'muted', item.channel)}`;
  const bodyWidth = Math.max(20, width - 5);
  const lines = [Text(header, { wrap: false })];
  for (const line of wrapTextLines(item.body, bodyWidth).slice(0, 3)) {
    lines.push(Text(`${color(theme, 'muted', '│')}   ${line}`, { wrap: false }));
  }
  if (index < 99) lines.push(Text(color(theme, 'muted', '│'), { wrap: false }));
  return lines;
}

function quickReplyStripLine({ state, theme, width }) {
  const placeholder = state.modes.current() === 'reply'
    ? state.composer.value.replaceAll('\n', ' ')
    : 'Reply · Note · Customer Visible    Use /reply or /note to open composer';
  const actions = 'Actions: /reply  /note  /assign  /status  /close  /escalate';
  return Text(`${truncateVisible(placeholder, Math.max(18, width - 2))}\n${color(theme, 'muted', truncateVisible(actions, Math.max(18, width - 2)))}`, { wrap: false });
}

function filterLine(state, theme, width) {
  const chips = ['all', 'billing', 'platform', 'auth', 'product']
    .map((id) => id === state.filter.queue ? tag(id === 'all' ? 'All' : titleCase(id), theme, 'accent') : color(theme, 'muted', id === 'all' ? 'All' : titleCase(id)))
    .join('  ');
  return truncateVisible(`Filters: ${chips}`, width);
}

function quickFilterLine(state, theme, width) {
  return truncateVisible(`Quick: ${tag('High', theme, state.filter.priority === 'high' ? 'selected' : 'error')}  ${tag('Unassigned', theme, 'system')}  ${tag('SLA Risk', theme, 'error')}`, width);
}

function searchLine(state, theme, width) {
  return truncateVisible(`${color(theme, 'muted', 'Search:')} ${state.filter.text ? color(theme, 'accent', state.filter.text) : color(theme, 'muted', '<none>')}    Sort: ${color(theme, 'accent', titleCase(state.sort || 'updated'))}`, width);
}

function activityHeader(width) {
  const details = Math.max(20, width - 8 - 18 - 14);
  return `${fitText('TIME', 7)} ${fitText('EVENT', 17)} ${fitText('DETAILS', details)} CONTEXT`;
}

function activityRow({ event, theme, width, selected = false }) {
  const token = event.type === 'sla_event' ? 'error' : event.type === 'escalation' ? 'system' : event.type === 'agent_reply' ? 'assistant' : event.type === 'customer_message' ? 'user' : 'muted';
  const details = Math.max(20, width - 8 - 18 - 14);
  const marker = selected ? '›' : ' ';
  return `${marker} ${fitText(formatTimelineTime(event.time), 7)} ${color(theme, token, fitText(event.type.replaceAll('_', ' '), 17))} ${fitText(event.text, details)} ${color(theme, 'accent', truncateVisible(event.related || '', 12))}`;
}

function buildActivityEvents(state, ticket) {
  return getActivityEvents(state, ticket);
}

function metricLine({ state, theme }) {
  const agentActions = state.globalTimeline.filter((event) => event.actor === state.agent).length + 412;
  return [
    `Total ${color(theme, 'accent', '1,248 ↑18%')}`,
    `Agent actions ${color(theme, 'accent', `${agentActions} ↑12%`)}`,
    `SLA events ${color(theme, 'error', '37 ↑3')}`,
    `Escalations ${color(theme, 'system', '14 ↓2')}`,
    `Resolved ${color(theme, 'ok', '189 ↑9%')}`,
  ].join('  │  ');
}

function responseChecklist(ticket) {
  const isBilling = ticket.queue === 'Billing';
  return [
    { label: 'Acknowledge the issue', done: true },
    { label: isBilling ? 'Explain charge cause' : 'Explain current findings', done: true },
    { label: isBilling ? 'Issue refund / next step' : 'Ask for diagnostic detail', done: ticket.messages.some((message) => message.role === 'agent') },
    { label: 'Set expectation and ownership', done: Boolean(ticket.assignee) },
  ];
}

function draftText(state, ticket) {
  if (state.modes.current() === 'reply' && state.composer.value) return state.composer.value;
  if (state.composer.value && state.activeTab === 'reply') return state.composer.value;
  const lower = ticket.tags.join(' ');
  if (lower.includes('billing')) return renderTemplate('refund', ticket);
  if (lower.includes('export')) return renderTemplate('export', ticket);
  if (lower.includes('safari')) return renderTemplate('safari', ticket);
  return `Hi ${ticket.customer.contact.split(' ')[0]},\n\nThanks for the details. I reviewed the ticket context and I’m checking the affected account now.\n\nI’ll follow up with the next concrete step shortly.`;
}

function editorLines(text, limit, width) {
  const lines = String(text || '').split('\n').slice(0, limit);
  return lines.map((line, index) => `${String(index + 1).padStart(2)} │ ${truncateVisible(line, Math.max(8, width - 7))}${index === lines.length - 1 ? ' █' : ''}`);
}

function internalContext(ticket) {
  return `${ticket.summary} Policy: ${ticket.queue === 'Billing' ? 'refund eligible if duplicate charge is confirmed' : 'collect diagnostics and provide next checkpoint'}.`;
}

function sendReady(draft) {
  return String(draft || '').trim().length > 24;
}

function lastCustomerMessage(ticket) {
  return [...ticket.messages].reverse().find((message) => message.role === 'customer')?.body || '';
}

function modeStatus(state) {
  if (state.modes.current() === 'reply') return 'reply composer open';
  if (state.modes.current() === 'note') return 'internal note composer open';
  if (state.modes.current() === 'confirm') return state.pendingConfirm?.message || 'confirm action';
  if (state.modes.current() === 'palette') return 'command palette open';
  if (state.modes.current() === 'help') return 'help overlay open';
  if (state.modes.current() === 'edit') return `editing ${state.editField}`;
  return '';
}

function pane({ title = '', theme, padding = { left: 1, right: 1 } } = {}, ...children) {
  return Box({ border: true, borderColor: theme?.border, padding, title }, ...children);
}

function divider(theme, width) {
  return Text(color(theme, 'border', '─'.repeat(Math.max(1, width))), { wrap: false });
}

function brand(theme) {
  return color(theme, 'title', '≈≈≈ Support Desk');
}

function tag(label, theme, token = 'accent') {
  return color(theme, token, `[${label}]`);
}

function statusBadge(status, theme, width = 0) {
  const token = status === 'open' ? 'accent' : status === 'pending' || status === 'snoozed' ? 'system' : status === 'solved' || status === 'closed' ? 'ok' : 'muted';
  const label = String(status).toUpperCase();
  return color(theme, token, width ? fitText(label, width) : `[${label}]`);
}

function priorityBadge(priority, theme) {
  const token = priority === 'Urgent' || priority === 'High' ? 'error' : priority === 'Medium' ? 'system' : 'accent';
  return color(theme, token, priority[0] || '?');
}

function queueBadge(queue, theme) {
  return tag(queue, theme, 'accent');
}

function slaText(ticket, theme) {
  const token = ticket.slaMinutes <= 15 ? 'error' : ticket.slaMinutes <= 60 ? 'system' : 'accent';
  return color(theme, token, `${ticket.slaMinutes}m remaining`);
}

function healthText(value, theme) {
  const token = /risk|watch/i.test(value) ? 'system' : 'ok';
  return color(theme, token, value);
}

function prop(key, value, width) {
  return `${String(key).padEnd(12)} ${truncateVisible(value, Math.max(8, width - 13))}`;
}

function fitText(value, width) {
  const safeWidth = Math.max(0, Number(width) || 0);
  const truncated = truncateVisible(String(value ?? ''), safeWidth);
  return padEndVisible(truncated, safeWidth);
}

function wrapTextLines(value, width) {
  const output = [];
  const max = Math.max(8, Number(width) || 80);
  for (const raw of String(value ?? '').split('\n')) {
    const words = raw.split(/\s+/).filter(Boolean);
    if (!words.length) {
      output.push('');
      continue;
    }
    let line = '';
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (visibleLength(candidate) > max) {
        if (line) output.push(line);
        line = visibleLength(word) > max ? truncateVisible(word, max) : word;
      } else {
        line = candidate;
      }
    }
    if (line) output.push(line);
  }
  return output;
}

function spinner(frame) {
  return ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'][Math.abs(frame || 0) % 10];
}

function pulse(frame, active) {
  if (!active) return '○';
  return frame % 2 === 0 ? '●' : '○';
}

function slaState(ticket) {
  if (ticket.status === 'pending' || ticket.status === 'snoozed') return 'paused';
  if (ticket.slaMinutes <= 15) return 'risk';
  if (ticket.slaMinutes <= 60) return 'watch';
  return 'healthy';
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, Number.isFinite(Number(value)) ? Number(value) : min));
}

function clockTime() {
  return new Date().toTimeString().slice(0, 8);
}

function relativeAge(ticket) {
  const first = ticket.timeline.at(-1)?.time ?? new Date().toISOString();
  const minutes = Math.max(1, Math.round((Date.now() - new Date(first).getTime()) / 60000));
  if (minutes < 60) return `${minutes}m ago`;
  return `${Math.round(minutes / 60)}h ago`;
}

function titleCase(value) {
  return String(value).replace(/\b\w/g, (char) => char.toUpperCase());
}

function wordCount(value) {
  return String(value || '').trim().split(/\s+/).filter(Boolean).length;
}
