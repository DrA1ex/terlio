import { parseSlashCommand } from './parser.js';

export function createCommandRegistry(commands = []) {
  const entries = commands.map(normalizeCommandEntry);
  const byName = new Map();
  for (const entry of entries) {
    byName.set(entry.name, entry);
    for (const alias of entry.aliases) byName.set(alias, entry);
  }

  return {
    entries,
    find(name) {
      return byName.get(String(name ?? '').toLowerCase()) ?? null;
    },
    suggestions(query = '') {
      const needle = String(query ?? '').replace(/^\//, '').toLowerCase().trim();
      const ranked = entries.filter((entry) => matchesEntry(entry, needle));
      return ranked.map((entry) => ({
        label: `/${entry.usage || entry.name}`,
        detail: entry.category,
        description: entry.description,
        command: `/${entry.usage || entry.name}`,
        entry,
      }));
    },
    execute(raw, ctx = {}) {
      const parsed = parseSlashCommand(raw);
      if (!parsed.isCommand) return { ok: false, reason: 'not-command', parsed };
      const entry = byName.get(parsed.name);
      if (!entry) return { ok: false, reason: 'unknown', parsed };
      return entry.run({ ...ctx, parsed, raw, registry: this });
    },
  };
}

export function normalizeCommandEntry(command) {
  const name = String(command.name ?? command.command ?? '').replace(/^\//, '').split(/\s+/)[0].toLowerCase();
  return {
    name,
    usage: command.usage ?? name,
    title: command.title ?? name,
    category: command.category ?? 'General',
    description: command.description ?? '',
    examples: command.examples ?? [],
    aliases: (command.aliases ?? []).map((alias) => String(alias).replace(/^\//, '').toLowerCase()),
    run: typeof command.run === 'function' ? command.run : () => ({ ok: true, action: name }),
    meta: command.meta ?? {},
  };
}

function matchesEntry(entry, needle) {
  if (!needle) return true;
  const haystack = [entry.name, entry.usage, entry.title, entry.category, entry.description, ...entry.aliases, ...entry.examples].join(' ').toLowerCase();
  return haystack.includes(needle);
}
