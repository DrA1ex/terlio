import { themes } from '../ansi/themes.js';
import { commands as commandList } from '../commands.js';
import { skills } from '../skills.js';

export function createAppPaletteItems(app = null) {
  const commandItems = commandList.map((command) => ({
    id: command.name,
    title: command.description,
    description: command.usage,
    category: commandCategory(command.name),
    keywords: [command.name.replace(/^\//, ''), command.usage, command.description],
    aliases: commandAliases(command.name),
    value: { insert: commandInsert(command) },
  }));

  const themeItems = Object.keys(themes).map((name) => ({
    id: `theme.${name}`,
    title: `Theme: ${name}`,
    description: `Switch visual theme with /theme ${name}`,
    category: 'Appearance',
    keywords: ['theme', 'color', name],
    value: { insert: `/theme ${name}` },
  }));

  const providerItems = ['mock', 'replay'].map((name) => ({
    id: `provider.${name}`,
    title: `Provider: ${name}`,
    description: `Switch model provider with /provider ${name}`,
    category: 'Model',
    keywords: ['provider', 'model', name],
    value: { insert: `/provider ${name}` },
  }));

  const skillItems = skills.map((skill) => ({
    id: `skill.${skill.name}.toggle`,
    title: `Skill: ${skill.title}`,
    description: `Enable with /skill on ${skill.name}`,
    category: 'Skills',
    keywords: ['skill', skill.name, skill.title, skill.description],
    value: { insert: `/skill on ${skill.name}` },
  }));

  const selectionItems = [{
    id: 'selection.copy',
    title: 'Copy selected transcript text',
    description: 'Explicitly copy the current in-app selection. Ctrl+C remains SIGINT.',
    category: 'Selection',
    keywords: ['copy', 'selection', 'clipboard', 'transcript'],
    aliases: ['copy selected text'],
    disabled: !String(app?.transcriptSelection?.text ?? ''),
    value: { action: 'copy-selection' },
  }];

  return [...selectionItems, ...commandItems, ...themeItems, ...providerItems, ...skillItems];
}

function commandCategory(name) {
  if (['/help', '/about'].includes(name)) return 'Help';
  if (['/theme', '/themes'].includes(name)) return 'Appearance';
  if (['/provider', '/skills', '/skill'].includes(name)) return 'Configuration';
  if (name === '/session') return 'Sessions';
  if (['/retry', '/regenerate', '/shorter', '/longer', '/explain', '/apply', '/copy-last', '/blocks'].includes(name)) return 'Assistant';
  if (['/debug', '/status', '/intents', '/history'].includes(name)) return 'Diagnostics';
  return 'Workspace';
}

function commandAliases(name) {
  return {
    '/help': ['commands', 'shortcuts'],
    '/session': ['save', 'open', 'conversation'],
    '/provider': ['model'],
    '/theme': ['color', 'appearance'],
    '/retry': ['again'],
    '/regenerate': ['redo'],
    '/clear': ['clean'],
    '/exit': ['quit'],
  }[name] ?? [];
}

function commandInsert(command) {
  return /[<[\[]/.test(command.usage) ? `${command.name} ` : command.name;
}
