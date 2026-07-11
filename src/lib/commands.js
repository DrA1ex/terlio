import { parseSlashCommand, tokenizeCommand } from './commands/parser.js';

export { commands, helpText } from './commands/catalog.js';
export { getSuggestions } from './commands/suggestions.js';

import { commands } from './commands/catalog.js';

export function parseCommand(line) {
  const parsed = parseSlashCommand(line);
  if (parsed.isCommand) {
    return {
      name: parsed.name ? `/${parsed.name}` : '',
      args: parsed.args,
    };
  }
  const tokens = tokenizeCommand(parsed.raw);
  return {
    name: tokens.shift() ?? '',
    args: tokens,
  };
}

export function findCommand(name) {
  return commands.find((command) => command.name === name);
}
