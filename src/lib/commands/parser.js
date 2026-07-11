export function parseSlashCommand(raw = '') {
  const source = String(raw ?? '').trim();
  if (!source) return { raw: source, isCommand: false, name: '', args: [], text: '' };
  if (!source.startsWith('/')) return { raw: source, isCommand: false, name: '', args: [], text: source };

  const tokens = tokenizeCommand(source.slice(1));
  const name = tokens.shift() ?? '';
  return {
    raw: source,
    isCommand: true,
    name: name.toLowerCase(),
    args: tokens,
    text: tokens.join(' '),
  };
}

export function tokenizeCommand(input = '') {
  const tokens = [];
  const text = String(input ?? '');
  let current = '';
  let quote = '';
  let escaping = false;

  for (const char of text) {
    if (escaping) {
      current += char;
      escaping = false;
      continue;
    }
    if (char === '\\') {
      escaping = true;
      continue;
    }
    if (quote) {
      if (char === quote) quote = '';
      else current += char;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (/\s/.test(char)) {
      if (current) {
        tokens.push(current);
        current = '';
      }
      continue;
    }
    current += char;
  }

  if (escaping) current += '\\';
  if (current) tokens.push(current);
  return tokens;
}

export function commandRest(parsed, fromIndex = 0) {
  return parsed.args.slice(fromIndex).join(' ').trim();
}
