function delay(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new StreamCancelled());
      return;
    }
    if (ms <= 0) {
      resolve();
      return;
    }

    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);

    function onAbort() {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      reject(new StreamCancelled());
    }

    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

export class StreamCancelled extends Error {
  constructor() {
    super('stream cancelled');
    this.name = 'StreamCancelled';
  }
}

export async function streamMockReply({ prompt, enabledSkills, onChunk, signal, delayScale = 1 }) {
  const text = buildMockReply(prompt, enabledSkills);
  const chunks = chunkText(text);

  for (const chunk of chunks) {
    if (signal?.aborted) throw new StreamCancelled();
    await delay(Math.max(0, nextDelay(chunk) * delayScale), signal);
    if (signal?.aborted) throw new StreamCancelled();
    onChunk(chunk);
  }
}

export async function streamMockBlocks({ prompt, enabledSkills = [], onChunk, onBlock, signal, delayScale = 1 }) {
  const blocks = buildMockBlocks(prompt, enabledSkills);

  for (const block of blocks) {
    if (signal?.aborted) throw new StreamCancelled();
    if (block.type === 'text') {
      for (const chunk of chunkText(block.content)) {
        if (signal?.aborted) throw new StreamCancelled();
        await delay(Math.max(0, nextDelay(chunk) * delayScale), signal);
        if (signal?.aborted) throw new StreamCancelled();
        onChunk?.(chunk);
      }
      continue;
    }

    await delay(Math.max(0, (block.type === 'command' ? 120 : 220) * delayScale), signal);
    if (signal?.aborted) throw new StreamCancelled();
    onBlock?.(block);
  }
}

export const replyRules = [
  {
    id: 'greeting',
    title: 'greeting',
    patterns: [
      { re: /^(hi|hello|hey|good\s+(morning|afternoon|evening))/i, weight: 8 },
      { re: /how\s+are\s+you/i, weight: 4 },
    ],
    build: ({ skills, active }) => [
      pick(skills, 'Hi. I am ready. Type a normal request or start with `/` to open commands.', 'Hi. This is a mock AI terminal: commands, themes, skills, and streaming output already work.'),
      skills.has('terminal') ? 'To test the UX, type `/`, move through suggestions with arrow keys, and press Enter to apply the selected command.' : 'For now I answer with templates, but the template is selected by prompt patterns.',
      `Active skills: ${active}.`,
    ],
  },
  {
    id: 'terminal_ux',
    title: 'terminal / CLI / TTY',
    patterns: [
      { re: /(node(?:\.js)?|tty|ansi|cli|terminal|console|raw\s*mode)/i, weight: 8 },
      { re: /(autocomplete|suggestion|arrow|keyboard|hotkey|readline|cursor)/i, weight: 6 },
      { re: /(rich[-\s]?terminal|full[-\s]?screen|redraw|render)/i, weight: 7 },
    ],
    build: ({ skills, active }) => [
      'I would keep the terminal layer separate from the model layer: input, cursor state, history, suggestions, and screen redraws should not depend on whether the model is real or mocked.',
      skills.has('terminal')
        ? 'In this architecture, raw TTY plus full redraw gives predictable UX: streaming output does not break the input line, and suggestions can render as a controlled menu.'
        : 'Even without the terminal skill, it is better not to mix readline with custom output, because streaming will otherwise conflict with the current input line.',
      skills.has('code')
        ? 'A practical extension point is to keep the `streamMockReply({ prompt, enabledSkills, onChunk, signal })` contract and later replace only the text generator.'
        : 'When a real model appears, the interface can stay the same while only the chunk source changes.',
      `Active skills: ${active}.`,
    ],
  },
  {
    id: 'implementation',
    title: 'implementation / code',
    patterns: [
      { re: /(code|implement|make|add|write|fix|repair|extend|rewrite|refactor)/i, weight: 6 },
      { re: /(js|javascript|typescript|module|file|function|class|method)/i, weight: 4 },
      { re: /(no\s+libraries|without\s+libraries|dependency[-\s]?free|pure\s+node)/i, weight: 5 },
    ],
    build: ({ skills, active }) => [
      'I would make the change in small layers: state first, then key handling, then rendering, and only after that the mock model behavior. That makes it harder to break terminal UX.',
      skills.has('code')
        ? 'For code, three contracts matter: a command returns a system message or mutates state, the suggestion provider returns options, and the model returns a stream of chunks.'
        : 'The main point is to preserve a simple boundary between commands, input, and response generation.',
      skills.has('analyst')
        ? 'The risk is not in the logic alone, but in overlapping modes: arrow keys can mean both history navigation and suggestion selection. The open command menu should have priority, and history should only work outside it.'
        : 'After the change, check partial commands, complete commands, and normal text input.',
      `Active skills: ${active}.`,
    ],
  },
  {
    id: 'bug',
    title: 'bug / error',
    patterns: [
      { re: /(bug|broken|does\s+not\s+work|exception|error|stack|trace|timeout|hang|freeze)/i, weight: 8 },
      { re: /(fails|crash|undefined|null|syntaxerror|referenceerror)/i, weight: 7 },
    ],
    build: ({ skills, active }) => [
      'I would first narrow the failure area: key input, application state, rendering, or the mock model layer. For TTY apps this is more useful than changing the whole code path immediately.',
      skills.has('code')
        ? 'Minimal diagnostics: reproduce one key sequence, inspect `inputValue`, `cursor`, and `suggestionIndex`, then check what `getSuggestions()` returns.'
        : 'The best debugging format is a short scenario: what was typed, which key was pressed, what was expected, and what happened.',
      skills.has('analyst')
        ? 'If the issue only appears with suggestions, the likely cause is a conflict between input history and the selection menu. These two modes should be explicitly separated.'
        : 'After the fix, verify normal input, commands, and streaming cancellation with Esc.',
      `Active skills: ${active}.`,
    ],
  },
  {
    id: 'planning',
    title: 'planning',
    patterns: [
      { re: /(plan|order|roadmap|step|architecture|better\s+way|next|priority)/i, weight: 8 },
      { re: /(first|then|after\s+that|break\s+down|structure)/i, weight: 5 },
    ],
    build: ({ skills, active }) => [
      'I would move from a stable shell toward a smarter model: terminal first, then commands, then skills, then a real backend for responses.',
      skills.has('planner')
        ? 'Work order: 1) lock down keyboard scenarios, 2) expand the suggestion engine, 3) move mock model rules into a separate list, 4) add state diagnostics, 5) only then connect real AI.'
        : 'The main rule is not to mix the UX layer and response logic. Then the reference application stays manageable.',
      skills.has('analyst')
        ? 'The no-library tradeoff is clear: more manual TTY code, but no dependency on someone else\'s readline widget and more control over behavior.'
        : 'That is enough as a base for the current stage.',
      `Active skills: ${active}.`,
    ],
  },
  {
    id: 'writing',
    title: 'writing / editing',
    patterns: [
      { re: /(text|letter|message|wording|rewrite|shorten|improve|tone|style|caption|post)/i, weight: 8 },
      { re: /(softer|firmer|professional|shorter|clearer|no\s+cliches)/i, weight: 5 },
    ],
    build: ({ skills, active }) => [
      skills.has('writer')
        ? 'I would simplify the wording: first the main point, then the reason, then the concrete action. This makes the text calmer and less defensive.'
        : 'The text can be clearer: remove extra prefaces, keep the main meaning, and avoid overloading the tone.',
      skills.has('analyst')
        ? 'A common problem in such messages is that they try to explain, defend, and negotiate at the same time. It is better to separate those jobs.'
        : 'The result will be easier to read and harder to misinterpret.',
      `Active skills: ${active}.`,
    ],
  },
  {
    id: 'explain',
    title: 'explanation',
    patterns: [
      { re: /(explain|what\s+is|how\s+does|how\s+works|why|meaning|break\s+down)/i, weight: 7 },
      { re: /\?$/i, weight: 2 },
    ],
    build: ({ skills, active }) => [
      'I would explain it with a simple model: there is user input, terminal state, a set of active skills, and a response generator that streams text gradually.',
      skills.has('analyst')
        ? 'It is important not to mix two layers: the model being smart and the interface behaving like an AI chat. This reference application primarily validates the second layer.'
        : 'This is demo logic for now, but the interaction shape already resembles a real chat.',
      skills.has('terminal')
        ? 'Terminal UX depends on predictable state: what is visible, where the cursor is, which suggestion is active, and whether the current stream can be cancelled.'
        : 'Later, the mock response can be replaced with a real streaming API.',
      `Active skills: ${active}.`,
    ],
  },
  {
    id: 'compare',
    title: 'comparison / choice',
    patterns: [
      { re: /(compare|choose|better|worse|option|alternative|or|vs\.?|trade[-\s]?off)/i, weight: 7 },
      { re: /(pros|cons|advantages|disadvantages)/i, weight: 6 },
    ],
    build: ({ skills, active }) => [
      'I would choose based on what matters most for the reference application: development speed, UX control, or future extensibility.',
      skills.has('analyst')
        ? 'If you need fully controlled terminal UX, manual raw TTY is better. If you need speed, a library is usually better. In this project the no-library constraint makes the manual path reasonable.'
        : 'For the current goal, behavior control matters more than implementation brevity.',
      skills.has('planner')
        ? 'A practical criterion is to keep the solution that is easiest to replace when a real model is connected and does not require rewriting input handling.'
        : 'This can be evolved later without a full rewrite.',
      `Active skills: ${active}.`,
    ],
  },
  {
    id: 'ideas',
    title: 'ideas / brainstorm',
    patterns: [
      { re: /(ideas|brainstorm|what\s+can\s+be\s+added|features)/i, weight: 8 },
      { re: /(ux|visual|pretty|usable|polished|thoughtful)/i, weight: 4 },
    ],
    build: ({ skills, active }) => [
      'For the next layer I would add palette commands, quick actions on Enter, compact/full modes, a streaming event log, and a dedicated state diagnostics screen.',
      skills.has('terminal')
        ? 'Useful UX details include a suggestion counter, an explicit selected row, a hint like "up/down move · Enter accept", and careful list scrolling when there are many commands.'
        : 'Even simple details such as a status line can significantly improve perceived quality.',
      skills.has('code')
        ? 'Technically this is better handled through one state object rather than scattered flags, because input modes become easier to maintain.'
        : 'It is better to finish the base scenarios first and add new modes later.',
      `Active skills: ${active}.`,
    ],
  },
  {
    id: 'testing',
    title: 'testing / verification',
    patterns: [
      { re: /(test|check|qa|case|scenario|regression|broken)/i, weight: 8 },
      { re: /(edge\s+case|validation|manual)/i, weight: 5 },
    ],
    build: ({ skills, active }) => [
      'I would test the reference application with scenarios, not only syntax: a normal message, `/`, command selection with arrows, Enter application, theme switching with `/theme`, skills with `/skill`, and response cancellation with Esc.',
      skills.has('code')
        ? 'The minimum automated check here is `node --check` for all files plus a few direct calls to `buildMockReply()` and `getSuggestions()`.'
        : 'Manual testing matters because raw TTY behavior depends on key sequences.',
      skills.has('analyst')
        ? 'Pay special attention to this conflict: up arrow in normal input should open history, while up arrow after `/` should move the selected suggestion.'
        : 'If these modes do not conflict, the base is already reasonably stable.',
      `Active skills: ${active}.`,
    ],
  },
  {
    id: 'security',
    title: 'security / constraints',
    patterns: [
      { re: /(security|secret|token|password|key|env|injection|shell|sanitize|permission)/i, weight: 7 },
      { re: /(danger|risk|vulnerability)/i, weight: 6 },
    ],
    build: ({ skills, active }) => [
      'For this terminal reference application, I would separate application commands from shell commands immediately. Even if tools are added later, user input must not flow directly into `exec`.',
      skills.has('code')
        ? 'Secrets should not be stored in message history or shown in `/history`. Future API providers should read keys from env and avoid rendering them in status output.'
        : 'The primary safety boundary is not executing user text as a system command.',
      skills.has('analyst')
        ? 'The main risk appears later, when the mock model is replaced by real tools. That is why the tools contract should be designed early.'
        : 'This is a UI reference application for now, but it is useful to define boundaries early.',
      `Active skills: ${active}.`,
    ],
  },
  {
    id: 'performance',
    title: 'performance',
    patterns: [
      { re: /(fast|slow|lag|delay|performance|optimize|speed|fps|render)/i, weight: 7 },
      { re: /(smooth|stream|output|chunk|buffer)/i, weight: 5 },
    ],
    build: ({ skills, active }) => [
      'The main performance concern is frequent full-screen redraw during streaming. This is fine for the reference application, but later a redraw throttle can be added.',
      skills.has('terminal')
        ? 'A practical compromise is that model chunks may arrive often, while the screen updates no more than a fixed interval, for example 30-60 FPS. Input can remain responsive.'
        : 'Current delays intentionally imitate streaming so the AI-chat feeling can be tested.',
      skills.has('code')
        ? 'On large terminals, rendered history rows could be cached while only the latest streaming message is recalculated.'
        : 'At the current project size, full redraw is sufficient.',
      `Active skills: ${active}.`,
    ],
  },
];

export function buildMockReply(prompt, enabledSkills) {
  const skills = new Set(enabledSkills);
  const active = enabledSkills.length ? enabledSkills.join(', ') : 'none';
  const match = selectRule(prompt);
  const parts = match.rule.build({ prompt, skills, active, score: match.score });
  const suffix = skills.has('analyst')
    ? `\n\n[matched: ${match.rule.title}; score: ${match.score}]`
    : '';

  return parts.filter(Boolean).join('\n\n') + suffix;
}

export function buildMockBlocks(prompt, enabledSkills = []) {
  const skills = new Set(enabledSkills);
  const match = selectRule(prompt);
  const text = buildMockReply(prompt, enabledSkills);
  const blocks = [{ type: 'text', content: text, title: match.rule.title, meta: { intent: match.rule.id, score: match.score } }];

  if (['implementation', 'terminal_ux'].includes(match.rule.id) || skills.has('code')) {
    blocks.push({
      type: 'code',
      language: 'js',
      title: 'provider contract',
      content: [
        'export async function streamResponse({ messages, prompt, signal, onChunk, onBlock }) {',
        '  onChunk("Thinking through the request...\\n");',
        '  onBlock({ type: "command", command: "npm test", title: "Verify changes" });',
        '}',
      ].join('\n'),
    });
    blocks.push({
      type: 'command',
      title: 'Smoke-check the terminal library',
      command: 'npm test && npm run check',
    });
  }

  if (match.rule.id === 'bug') {
    blocks.push({
      type: 'warning',
      title: 'TTY lifecycle',
      content: 'Verify that raw mode, pending timers, and stdin.pause() finish through one shutdown path.',
    });
    blocks.push({
      type: 'diff',
      title: 'example patch shape',
      content: [
        '- this.input.setRawMode(false)',
        '+ if (this.input.isTTY) this.input.setRawMode(false)',
        '+ this.input.pause()',
        '+ this.abortController?.abort()',
      ].join('\n'),
    });
  }

  if (match.rule.id === 'testing') {
    blocks.push({
      type: 'tool_result',
      name: 'test-plan',
      status: 'mocked',
      content: 'Covered: block normalization, transcript rendering, provider structured streaming, session serialization.',
    });
  }

  return blocks;
}

export function selectRule(prompt) {
  const text = String(prompt ?? '');
  let best = { rule: fallbackRule, score: 0 };

  for (const rule of replyRules) {
    const score = rule.patterns.reduce((sum, pattern) => sum + (pattern.re.test(text) ? pattern.weight : 0), 0);
    if (score > best.score) best = { rule, score };
  }

  return best.score > 0 ? best : { rule: fallbackRule, score: 0 };
}

const fallbackRule = {
  id: 'fallback',
  title: 'general request',
  build: ({ skills, active }) => [
    pick(skills, 'I understand the request. This is a mock model, so I am not trying to solve the task for real, but I select a response through regex rules and active skills.', 'Understood. In this reference application, the answer is not one fixed template; it is selected through rule matching on the prompt.'),
    skills.has('analyst')
      ? 'If no rule matches confidently, I use a general response. That is a useful fallback: terminal UX keeps working, and the intent set can expand without changing the interface.'
      : 'If the prompt does not match any template, the general fallback is used.',
    skills.has('terminal')
      ? 'To test commands, type `/`: the list can be navigated with arrow keys, and Enter applies the selected suggestion.'
      : 'Commands are available through `/`.',
    `Active skills: ${active}.`,
  ],
};

function pick(skills, preferred, fallback) {
  return skills.has('analyst') || skills.has('planner') || skills.has('terminal') ? preferred : fallback;
}

function chunkText(text) {
  const pieces = [];
  const regex = /(\s+|[^\s]+)/g;
  let match;

  while ((match = regex.exec(text)) !== null) {
    const token = match[0];
    if (/^\s+$/.test(token)) {
      pieces.push(token);
    } else if (token.length > 12) {
      const chars = Array.from(token);
      for (let i = 0; i < chars.length; i += 6) {
        pieces.push(chars.slice(i, i + 6).join(''));
      }
    } else {
      pieces.push(token);
    }
  }

  return pieces;
}

function nextDelay(chunk) {
  if (chunk.includes('\n')) return 130;
  if (/^\s+$/.test(chunk)) return 18;
  if (/[.!?]$/.test(chunk)) return 120;
  if (/[,;:]$/.test(chunk)) return 80;
  return 28 + Math.floor(Math.random() * 38);
}
