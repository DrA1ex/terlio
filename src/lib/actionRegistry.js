export function createActionRegistry(actions = []) {
  return new ActionRegistry(actions);
}

export class ActionRegistry {
  constructor(actions = []) {
    this.actions = [];
    this.registerMany(actions);
  }

  register(action) {
    const normalized = normalizeAction(action);
    const existing = this.actions.findIndex((item) => item.id === normalized.id);
    if (existing >= 0) this.actions.splice(existing, 1, normalized);
    else this.actions.push(normalized);
    return normalized;
  }

  registerMany(actions = []) {
    for (const action of actions) this.register(action);
    return this;
  }

  remove(id) {
    const before = this.actions.length;
    this.actions = this.actions.filter((action) => action.id !== id);
    return before !== this.actions.length;
  }

  list(ctx = {}, { scopes = undefined, includeHidden = false } = {}) {
    const allowedScopes = scopes ? new Set(Array.isArray(scopes) ? scopes : [scopes]) : null;
    return this.actions.filter((action) => {
      if (!includeHidden && resolveValue(action.hidden, ctx, false)) return false;
      if (allowedScopes && !allowedScopes.has(action.scope)) return false;
      return true;
    });
  }

  enabled(ctx = {}, options = {}) {
    return this.list(ctx, options).filter((action) => !this.isDisabled(action, ctx));
  }

  isDisabled(actionOrId, ctx = {}) {
    const action = typeof actionOrId === 'string' ? this.find(actionOrId) : actionOrId;
    if (!action) return true;
    return Boolean(resolveValue(action.disabled, ctx, false));
  }

  find(id) {
    return this.actions.find((action) => action.id === id) ?? null;
  }

  findByKey(key, ctx = {}, { scopes = ['local', 'global'], localScope = 'local' } = {}) {
    const orderedScopes = Array.isArray(scopes) ? scopes : [scopes];
    const preferred = orderedScopes.includes(localScope)
      ? [localScope, ...orderedScopes.filter((scope) => scope !== localScope)]
      : orderedScopes;
    for (const scope of preferred) {
      const match = this.list(ctx, { scopes: scope }).find((action) => action.keys.some((spec) => keyMatches(spec, key)));
      if (match) return match;
    }
    return null;
  }

  execute(actionOrId, ctx = {}) {
    const action = typeof actionOrId === 'string' ? this.find(actionOrId) : actionOrId;
    if (!action) return { type: 'missing', action: null };
    if (this.isDisabled(action, ctx)) return { type: 'disabled', action };
    const result = action.execute?.(ctx);
    return { type: 'executed', action, result };
  }

  handleKey(key, ctx = {}, options = {}) {
    const action = this.findByKey(key, ctx, options);
    if (!action) return { type: 'unhandled' };
    return this.execute(action, ctx);
  }

  toPaletteItems(ctx = {}, options = {}) {
    return this.list(ctx, { includeHidden: false, ...options }).map((action) => ({
      id: action.id,
      title: action.title,
      description: action.description,
      category: action.category || action.scope,
      keywords: [...action.aliases, action.scope, action.category].filter(Boolean),
      keys: action.keys,
      disabled: this.isDisabled(action, ctx),
      value: { action },
    }));
  }

  toHelpShortcuts(ctx = {}, options = {}) {
    return this.list(ctx, options)
      .filter((action) => action.keys.length)
      .map((action) => [action.keys.join(' / '), this.isDisabled(action, ctx) ? `${action.title} (disabled)` : action.title]);
  }

  toFooterHints(ctx = {}, { limit = 8, scopes = ['global', 'local'] } = {}) {
    return this.list(ctx, { scopes })
      .filter((action) => action.keys.length && !resolveValue(action.hidden, ctx, false))
      .slice(0, limit)
      .map((action) => `${action.keys[0]} ${this.isDisabled(action, ctx) ? `${action.title} disabled` : action.title}`);
  }
}

export function normalizeAction(action = {}) {
  const id = String(action.id ?? action.name ?? action.title ?? '').trim();
  if (!id) throw new Error('Action id is required.');
  return {
    id,
    title: String(action.title ?? action.label ?? id),
    description: String(action.description ?? action.detail ?? ''),
    keys: normalizeKeys(action.keys ?? action.key),
    scope: String(action.scope ?? 'global'),
    category: String(action.category ?? action.group ?? action.scope ?? 'General'),
    aliases: normalizeAliases(action.aliases ?? action.keywords),
    disabled: action.disabled ?? false,
    hidden: action.hidden ?? false,
    execute: typeof action.execute === 'function' ? action.execute : () => undefined,
    value: action.value ?? action,
  };
}

export function normalizeKeys(keys = []) {
  const list = Array.isArray(keys) ? keys : [keys];
  return list.map((key) => String(key ?? '').trim()).filter(Boolean);
}

export function keyMatches(spec, key = {}) {
  if (!spec || !key) return false;
  const parsed = parseKeySpec(spec);
  if (!parsed.name) return false;
  const name = String(key.name ?? '').toLowerCase();
  const text = String(key.text ?? '').toLowerCase();
  const target = parsed.name;
  const nameMatches = target === name || (key.printable && target === text);
  if (!nameMatches) return false;
  if (parsed.ctrl !== undefined && Boolean(key.ctrl) !== parsed.ctrl) return false;
  if (parsed.meta !== undefined && Boolean(key.meta) !== parsed.meta) return false;
  if (parsed.shift !== undefined && Boolean(key.shift) !== parsed.shift) return false;
  if (parsed.cmd !== undefined && Boolean(key.cmd) !== parsed.cmd) return false;
  return true;
}

export function parseKeySpec(spec) {
  const parts = String(spec ?? '').toLowerCase().split('+').map((part) => part.trim()).filter(Boolean);
  const result = { name: '' };
  for (const part of parts) {
    if (part === 'ctrl' || part === 'control') result.ctrl = true;
    else if (part === 'alt' || part === 'option' || part === 'meta') result.meta = true;
    else if (part === 'shift') result.shift = true;
    else if (part === 'cmd' || part === 'command') result.cmd = true;
    else result.name = normalizeKeyName(part);
  }
  if (!parts.some((part) => ['ctrl', 'control'].includes(part))) result.ctrl ??= false;
  if (!parts.some((part) => ['alt', 'option', 'meta'].includes(part))) result.meta ??= false;
  if (!parts.some((part) => part === 'shift')) result.shift ??= false;
  if (!parts.some((part) => part === 'cmd' || part === 'command')) result.cmd ??= false;
  return result;
}

function normalizeKeyName(name) {
  const aliases = {
    esc: 'escape',
    return: 'enter',
    space: ' ',
    pgup: 'page-up',
    pgdn: 'page-down',
    up: 'up', down: 'down', left: 'left', right: 'right',
  };
  return aliases[name] ?? name;
}

function normalizeAliases(aliases = []) {
  return (Array.isArray(aliases) ? aliases : [aliases]).map(String).filter(Boolean);
}

function resolveValue(value, ctx, fallback) {
  if (typeof value === 'function') return value(ctx);
  if (value === undefined) return fallback;
  return value;
}
