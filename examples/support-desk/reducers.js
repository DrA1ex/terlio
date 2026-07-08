import { createTimelineEvent } from '../../src/lib/index.js';
import { SUPPORT_TEMPLATES, renderTemplate } from './templates.js';
import { SUPPORT_THEME_NAMES } from './themes.js';

export function getVisibleTickets(state) {
  const text = state.filter.text.trim().toLowerCase();
  const queue = state.filter.queue;
  const priority = state.filter.priority;
  const status = state.filter.status;
  const filtered = state.tickets.filter((ticket) => {
    if (queue !== 'all' && ticket.queue.toLowerCase() !== queue) return false;
    if (priority !== 'all' && ticket.priority.toLowerCase() !== priority) return false;
    if (status !== 'all' && ticket.status.toLowerCase() !== status) return false;
    if (!text) return true;
    const haystack = [
      ticket.id,
      ticket.subject,
      ticket.queue,
      ticket.priority,
      ticket.status,
      ticket.assignee,
      ticket.customer.name,
      ticket.customer.contact,
      ticket.tags.join(' '),
      ticket.summary,
    ].join(' ').toLowerCase();
    return haystack.includes(text);
  });

  return sortTickets(filtered, state.sort || 'updated');
}

export function getSelectedTicket(state) {
  const visible = getVisibleTickets(state);
  if (!visible.length) return state.tickets[0];
  const index = clamp(state.selectedIndex, 0, visible.length - 1);
  return visible[index];
}

export function selectTicketByDelta(state, delta) {
  const visible = getVisibleTickets(state);
  if (!visible.length) return null;
  state.selectedIndex = mod(state.selectedIndex + delta, visible.length);
  state.focus = 'inbox';
  return getSelectedTicket(state);
}

export function openTicket(state, id) {
  const normalized = String(id ?? '').toLowerCase();
  const index = state.tickets.findIndex((ticket) => ticket.id.toLowerCase() === normalized);
  if (index < 0) {
    state.toasts.show(`Ticket ${id} not found.`, 'error');
    return { ok: false, reason: 'not-found' };
  }
  const ticket = state.tickets[index];
  resetFilters(state);
  state.activeTab = 'ticket';
  state.focus = 'work';
  pushTicketEvent(state, ticket, 'system_event', `opened ${ticket.id}`, state.agent);
  const visibleIndex = getVisibleTickets(state).findIndex((item) => item.id === ticket.id);
  state.selectedIndex = Math.max(0, visibleIndex);
  state.toasts.show(`Opened ${ticket.id}.`, 'success');
  return { ok: true, ticket };
}

export function setSort(state, sort = 'updated') {
  const next = String(sort || 'updated').toLowerCase();
  const allowed = ['updated', 'sla', 'priority', 'status', 'queue'];
  if (!allowed.includes(next)) {
    state.toasts.show(`Unknown sort: ${sort}`, 'error');
    return { ok: false, reason: 'bad-sort' };
  }
  state.sort = next;
  state.selectedIndex = 0;
  state.activeTab = 'inbox';
  state.focus = 'inbox';
  state.lastWorkflowAction = `Queue sorted by ${next}`;
  state.toasts.show(`Sorted by ${next}.`, 'info');
  return { ok: true };
}

export function setFilter(state, patch = {}) {
  state.filter = { ...state.filter, ...patch };
  state.selectedIndex = 0;
  state.activeTab = 'inbox';
  state.focus = 'inbox';
  const parts = [];
  if (state.filter.text) parts.push(`text=${state.filter.text}`);
  if (state.filter.queue !== 'all') parts.push(`queue=${state.filter.queue}`);
  if (state.filter.priority !== 'all') parts.push(`priority=${state.filter.priority}`);
  if (state.filter.status !== 'all') parts.push(`status=${state.filter.status}`);
  state.lastWorkflowAction = parts.length ? `Filter: ${parts.join(', ')}` : 'Filters cleared';
  state.toasts.show(parts.length ? `Filter applied: ${parts.join(', ')}` : 'Filters cleared.', 'info');
}

export function resetFilters(state) {
  state.filter = { text: '', queue: 'all', priority: 'all', status: 'all' };
  state.selectedIndex = 0;
  state.lastWorkflowAction = 'Filters cleared';
}

export function assignTicket(state, assignee = 'me') {
  const ticket = getSelectedTicket(state);
  const next = assignee === 'me' ? state.agent : normalizeTitle(assignee);
  const previous = ticket.assignee || 'unassigned';
  ticket.assignee = next;
  state.activeTab = 'ticket';
  state.focus = 'work';
  state.lastWorkflowAction = `${ticket.id}: assignee ${previous} → ${next}`;
  pushTicketEvent(state, ticket, 'field_change', `assignee changed ${previous} → ${next}`, state.agent);
  state.toasts.show(`${ticket.id} assigned to ${next}.`, 'success');
  return { ok: true, ticket };
}

export function setTicketStatus(state, status) {
  const ticket = getSelectedTicket(state);
  const next = normalizeStatus(status);
  if (!next) {
    state.toasts.show(`Unknown status: ${status}`, 'error');
    return { ok: false, reason: 'bad-status' };
  }
  const previous = ticket.status;
  ticket.status = next;
  state.activeTab = 'ticket';
  state.focus = 'work';
  state.lastWorkflowAction = `${ticket.id}: status ${previous} → ${next}`;
  pushTicketEvent(state, ticket, 'field_change', `status changed ${previous} → ${next}`, state.agent);
  state.toasts.show(`${ticket.id} status set to ${next}.`, next === 'solved' || next === 'closed' ? 'success' : 'info');
  return { ok: true, ticket };
}

export function setTicketPriority(state, priority) {
  const ticket = getSelectedTicket(state);
  const next = normalizePriority(priority);
  if (!next) {
    state.toasts.show(`Unknown priority: ${priority}`, 'error');
    return { ok: false, reason: 'bad-priority' };
  }
  const previous = ticket.priority;
  ticket.priority = next;
  state.activeTab = 'ticket';
  state.focus = 'work';
  state.lastWorkflowAction = `${ticket.id}: priority ${previous} → ${next}`;
  pushTicketEvent(state, ticket, 'field_change', `priority changed ${previous} → ${next}`, state.agent);
  state.toasts.show(`${ticket.id} priority set to ${next}.`, next === 'Urgent' || next === 'High' ? 'warning' : 'success');
  return { ok: true, ticket };
}

export function addTag(state, tag) {
  const ticket = getSelectedTicket(state);
  const normalized = String(tag ?? '').trim().toLowerCase();
  if (!normalized) return { ok: false, reason: 'empty-tag' };
  if (!ticket.tags.includes(normalized)) ticket.tags.push(normalized);
  state.activeTab = 'ticket';
  state.focus = 'work';
  state.lastWorkflowAction = `${ticket.id}: tag added ${normalized}`;
  pushTicketEvent(state, ticket, 'field_change', `tag added: ${normalized}`, state.agent);
  state.toasts.show(`Tag ${normalized} added.`, 'success');
  return { ok: true, ticket };
}

export function removeTag(state, tag) {
  const ticket = getSelectedTicket(state);
  const normalized = String(tag ?? '').trim().toLowerCase();
  ticket.tags = ticket.tags.filter((item) => item !== normalized);
  state.activeTab = 'ticket';
  state.focus = 'work';
  state.lastWorkflowAction = `${ticket.id}: tag removed ${normalized}`;
  pushTicketEvent(state, ticket, 'field_change', `tag removed: ${normalized}`, state.agent);
  state.toasts.show(`Tag ${normalized} removed.`, 'success');
  return { ok: true, ticket };
}

export function startReply(state, templateName = '') {
  const ticket = getSelectedTicket(state);
  const text = templateName ? renderTemplate(templateName, ticket) : '';
  state.composer.set(text);
  state.composerMode = 'reply';
  state.composerTemplate = templateName || '';
  state.modes.push('reply', { type: 'reply' });
  state.activeTab = 'reply';
  state.focus = 'composer';
  state.toasts.show(templateName ? `Reply template inserted: ${SUPPORT_TEMPLATES[templateName]?.title ?? templateName}.` : 'Reply composer opened.', 'info');
  return { ok: true, ticket };
}

export function startNote(state, initial = '') {
  state.composer.set(initial);
  state.composerMode = 'note';
  state.composerTemplate = '';
  state.modes.push('note', { type: 'note' });
  state.activeTab = 'reply';
  state.focus = 'composer';
  state.toasts.show('Internal note composer opened.', 'info');
  return { ok: true };
}

export function submitComposer(state) {
  const text = state.composer.value.trim();
  const ticket = getSelectedTicket(state);
  if (!text) {
    state.toasts.show('Composer is empty.', 'warning');
    return { ok: false, reason: 'empty' };
  }

  if (state.composerMode === 'note') {
    ticket.notes.unshift({ author: state.agent, body: text, time: new Date().toISOString() });
    pushTicketEvent(state, ticket, 'internal_note', `internal note added (${text.length} chars)`, state.agent);
    state.actionLog.unshift(`note ${ticket.id}: ${text.slice(0, 48)}`);
    state.lastWorkflowAction = `${ticket.id}: internal note added`;
    state.toasts.show(`Internal note added to ${ticket.id}.`, 'success');
  } else {
    ticket.messages.push({ id: `msg_${Date.now()}`, role: 'agent', author: state.agent, body: text, time: new Date().toISOString() });
    const previous = ticket.status;
    ticket.status = 'pending';
    pushTicketEvent(state, ticket, 'agent_reply', `reply sent to ${ticket.customer.name}`, state.agent);
    if (previous !== 'pending') pushTicketEvent(state, ticket, 'field_change', `status changed ${previous} → pending`, state.agent);
    state.actionLog.unshift(`reply ${ticket.id}: ${text.slice(0, 48)}`);
    state.lastWorkflowAction = `${ticket.id}: reply sent, status ${previous} → pending`;
    state.toasts.show(`Reply sent to ${ticket.customer.name}.`, 'success');
  }

  state.composer.clear();
  state.composerMode = 'reply';
  if (['reply', 'note'].includes(state.modes.current())) state.modes.pop();
  state.activeTab = 'ticket';
  state.focus = 'work';
  return { ok: true, ticket };
}

export function cancelComposer(state) {
  state.composer.clear();
  state.composerMode = 'reply';
  if (['reply', 'note'].includes(state.modes.current())) state.modes.pop();
  state.focus = 'work';
  state.toasts.show('Composer cancelled.', 'info');
}

export function startEditField(state, field) {
  const ticket = getSelectedTicket(state);
  const value = field === 'subject' ? ticket.subject : String(ticket.customFields[field] ?? '');
  state.fieldEditor.set(value);
  state.editField = field;
  state.modes.push('edit', { field });
  state.focus = 'edit';
  state.toasts.show(`Editing ${field}.`, 'info');
}

export function submitFieldEdit(state) {
  const ticket = getSelectedTicket(state);
  const field = state.editField;
  const value = state.fieldEditor.value.trim();
  if (!field) return { ok: false, reason: 'missing-field' };
  if (field === 'subject') ticket.subject = value || ticket.subject;
  else ticket.customFields[field] = value;
  pushTicketEvent(state, ticket, 'field_change', `${field} updated`, state.agent);
  state.fieldEditor.clear();
  state.editField = '';
  if (state.modes.current() === 'edit') state.modes.pop();
  state.toasts.show(`${field} updated.`, 'success');
  return { ok: true, ticket };
}

export function requestConfirm(state, action, message, payload = {}) {
  state.pendingConfirm = { action, message, payload };
  state.confirmSelected = 'confirm';
  state.modes.push('confirm', { action, message, payload });
  state.toasts.show(`${message}`, 'warning');
}

export function applyConfirm(state) {
  const pending = state.pendingConfirm;
  const ticket = getSelectedTicket(state);
  if (!pending) return { ok: false, reason: 'no-confirm' };

  if (pending.action === 'close') {
    const previous = ticket.status;
    ticket.status = 'closed';
    pushTicketEvent(state, ticket, 'field_change', `status changed ${previous} → closed`, state.agent);
    state.toasts.show(`${ticket.id} closed.`, 'success');
  }

  if (pending.action === 'escalate') {
    const team = pending.payload.team;
    ticket.escalatedTo = team;
    if (!ticket.tags.includes('escalated')) ticket.tags.push('escalated');
    ticket.priority = ticket.priority === 'Urgent' ? 'Urgent' : 'High';
    pushTicketEvent(state, ticket, 'escalation', `escalated to ${team}`, state.agent);
    state.toasts.show(`${ticket.id} escalated to ${team}.`, 'success');
  }

  if (pending.action === 'snooze') {
    ticket.status = 'snoozed';
    ticket.snoozedUntil = pending.payload.until;
    pushTicketEvent(state, ticket, 'field_change', `snoozed until ${pending.payload.label}`, state.agent);
    state.toasts.show(`${ticket.id} snoozed for ${pending.payload.label}.`, 'success');
  }

  state.pendingConfirm = null;
  if (state.modes.current() === 'confirm') state.modes.pop();
  return { ok: true, ticket };
}

export function cancelConfirm(state) {
  state.pendingConfirm = null;
  if (state.modes.current() === 'confirm') state.modes.pop();
  state.toasts.show('Action cancelled.', 'info');
}

export function reopenTicket(state) {
  const ticket = getSelectedTicket(state);
  const previous = ticket.status;
  ticket.status = 'open';
  pushTicketEvent(state, ticket, 'field_change', `status changed ${previous} → open`, state.agent);
  state.toasts.show(`${ticket.id} reopened.`, 'success');
}

export function switchTheme(state, themeName) {
  if (!SUPPORT_THEME_NAMES.includes(themeName)) {
    state.toasts.show(`Unknown support theme: ${themeName}`, 'error');
    return { ok: false };
  }
  state.themeName = themeName;
  state.toasts.show(`Theme switched to ${themeName}.`, 'success');
  return { ok: true };
}

export function refreshSla(state, minutes = -5) {
  const ticket = getSelectedTicket(state);
  ticket.slaMinutes = Math.max(0, ticket.slaMinutes + minutes);
  if (ticket.status === 'pending' || ticket.status === 'snoozed') ticket.slaStatus = 'paused';
  else ticket.slaStatus = ticket.slaMinutes <= 15 ? 'at risk' : ticket.slaMinutes <= 60 ? 'watch' : 'healthy';
  pushTicketEvent(state, ticket, 'sla_event', `SLA refreshed: ${ticket.slaStatus}`, 'system');
  state.toasts.show(`${ticket.id} SLA ${ticket.slaStatus}.`, ticket.slaStatus === 'at risk' ? 'warning' : 'info');
}

export function getActivityEvents(state) {
  const ticket = getSelectedTicket(state);
  const ticketEvents = ticket.timeline.map((event) => ({ ...event, ticketId: ticket.id, related: ticket.id }));
  const global = state.globalTimeline.map((event) => ({ ...event, related: event.related || '' }));
  return [...ticketEvents, ...global].sort((a, b) => new Date(b.time) - new Date(a.time));
}

export function selectActivityByDelta(state, delta) {
  const events = getActivityEvents(state);
  if (!events.length) {
    state.activitySelectedIndex = 0;
    state.activityPage = 0;
    return null;
  }
  state.activitySelectedIndex = clamp(state.activitySelectedIndex + delta, 0, events.length - 1);
  const pageSize = 7;
  state.activityPage = Math.floor(state.activitySelectedIndex / pageSize);
  state.focus = 'activity';
  return events[state.activitySelectedIndex];
}

export function moveActivityPage(state, delta) {
  const events = getActivityEvents(state);
  const pageSize = 7;
  const maxPage = Math.max(0, Math.ceil(events.length / pageSize) - 1);
  state.activityPage = clamp((state.activityPage || 0) + delta, 0, maxPage);
  state.activitySelectedIndex = clamp(state.activityPage * pageSize, 0, Math.max(0, events.length - 1));
  state.focus = 'activity';
  state.toasts.show(`Activity page ${state.activityPage + 1}/${maxPage + 1}.`, 'info');
  return events[state.activitySelectedIndex] ?? null;
}

export function tickSupportDesk(state) {
  state.frame = (state.frame + 1) % 100000;
  state.toasts.tick(0.25);
  if (state.pipeline?.status === 'running') {
    state.pipeline.progress = Math.min(100, state.pipeline.progress + 4);
    if (state.pipeline.progress >= 100) {
      state.pipeline.status = 'complete';
      state.pipeline.label = 'escalation packet sent';
      state.toasts.show('Background escalation packet completed.', 'success');
    }
  }
}

export function pushTicketEvent(state, ticket, type, text, actor = 'system') {
  const event = createTimelineEvent({ type, text, actor });
  ticket.timeline.unshift(event);
  state.globalTimeline.unshift(event);
  state.highlightedEventId = event.id;
  return event;
}

function sortTickets(tickets, sort) {
  const priorityRank = { Urgent: 0, High: 1, Medium: 2, Low: 3 };
  return [...tickets].sort((a, b) => {
    if (sort === 'sla') return a.slaMinutes - b.slaMinutes || a.id.localeCompare(b.id);
    if (sort === 'priority') return (priorityRank[a.priority] ?? 9) - (priorityRank[b.priority] ?? 9) || a.slaMinutes - b.slaMinutes;
    if (sort === 'status') return a.status.localeCompare(b.status) || a.slaMinutes - b.slaMinutes;
    if (sort === 'queue') return a.queue.localeCompare(b.queue) || a.slaMinutes - b.slaMinutes;
    const at = new Date(a.timeline[0]?.time || 0).getTime();
    const bt = new Date(b.timeline[0]?.time || 0).getTime();
    return bt - at || a.slaMinutes - b.slaMinutes;
  });
}

function normalizeStatus(value) {
  const map = { open: 'open', pending: 'pending', solved: 'solved', closed: 'closed', snoozed: 'snoozed' };
  return map[String(value ?? '').toLowerCase()] ?? null;
}

function normalizePriority(value) {
  const map = { low: 'Low', medium: 'Medium', normal: 'Medium', high: 'High', urgent: 'Urgent', critical: 'Urgent' };
  return map[String(value ?? '').toLowerCase()] ?? null;
}

function normalizeTitle(value) {
  return String(value ?? '').trim().replace(/[-_]+/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

function mod(value, size) {
  return ((value % size) + size) % size;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, Number.isFinite(value) ? value : min));
}
