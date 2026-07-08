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
    title: 'приветствие',
    patterns: [
      { re: /^(hi|hello|hey|привет|здравствуй|добрый\s+(день|вечер|утро))/i, weight: 8 },
      { re: /как\s+дела/i, weight: 4 },
    ],
    build: ({ skills, active }) => [
      pick(skills, 'Привет. Я на месте. Можешь писать обычный запрос или начать с `/`, чтобы открыть команды.', 'Привет. Это моковый AI-терминал: команды, темы, скилы и потоковый вывод уже работают.'),
      skills.has('terminal') ? 'Для проверки UX удобно набрать `/`, пройтись стрелками по подсказкам и нажать Enter для применения выбранной команды.' : 'Пока я отвечаю заготовками, но выбираю их по паттернам запроса.',
      `Активные скилы: ${active}.`,
    ],
  },
  {
    id: 'terminal_ux',
    title: 'терминал / CLI / TTY',
    patterns: [
      { re: /(node(?:\.js)?|tty|ansi|cli|terminal|терминал|консоль|raw\s*mode)/i, weight: 8 },
      { re: /(автодополн|подсказк|стрелк|клавиш|hotkey|readline|cursor)/i, weight: 6 },
      { re: /(rich[-\s]?terminal|полноэкранн|перерисовк)/i, weight: 7 },
    ],
    build: ({ skills, active }) => [
      'Я бы держал терминальный слой отдельно от слоя модели: ввод, курсор, история, меню подсказок и перерисовка экрана не должны зависеть от того, настоящая модель подключена или моковая.',
      skills.has('terminal')
        ? 'В текущей архитектуре raw TTY + полный redraw дают предсказуемый UX: потоковый ответ не ломает строку ввода, а подсказки можно отрисовывать как управляемое меню.'
        : 'Даже без отдельного terminal-скила лучше не смешивать readline и кастомный вывод: иначе streaming начнёт конфликтовать с текущей строкой ввода.',
      skills.has('code')
        ? 'Практичная точка расширения: оставить контракт `streamMockReply({ prompt, enabledSkills, onChunk, signal })`, а затем заменить только генератор текста.'
        : 'Когда появится реальная модель, интерфейс можно оставить прежним и заменить только источник чанков.',
      `Активные скилы: ${active}.`,
    ],
  },
  {
    id: 'implementation',
    title: 'реализация / код',
    patterns: [
      { re: /(код|реализ|сделай|добавь|напиши|почини|доработ|перепиши|refactor|implement|fix)/i, weight: 6 },
      { re: /(js|javascript|typescript|модуль|файл|функц|класс|метод)/i, weight: 4 },
      { re: /(без\s+библиотек|dependency[-\s]?free|pure\s+node)/i, weight: 5 },
    ],
    build: ({ skills, active }) => [
      'Я бы внёс изменение небольшими слоями: сначала состояние, потом обработка клавиш, затем рендеринг и только после этого поведение мок-модели. Так проще не сломать терминальный UX.',
      skills.has('code')
        ? 'Для кода важны три контракта: команда возвращает системное сообщение или меняет состояние, suggestion-provider отдаёт список вариантов, модель отдаёт поток чанков.'
        : 'Главное — сохранить простую границу между командами, вводом и генерацией ответа.',
      skills.has('analyst')
        ? 'Риск здесь не в самой логике, а в пересечении режимов: стрелки могут означать и историю, и выбор подсказки. Поэтому приоритет нужно отдавать открытому меню команд, а историю включать только вне него.'
        : 'После изменения стоит проверить частичные команды, полные команды и обычный текстовый ввод.',
      `Активные скилы: ${active}.`,
    ],
  },
  {
    id: 'bug',
    title: 'ошибка / баг',
    patterns: [
      { re: /(ошибка|баг|сломал|сломалось|не\s+работает|исключени|exception|error|stack|trace|timeout|завис)/i, weight: 8 },
      { re: /(падает|краш|crash|undefined|null|syntaxerror|referenceerror)/i, weight: 7 },
    ],
    build: ({ skills, active }) => [
      'Я бы сначала сузил место сбоя: ввод клавиш, состояние приложения, рендеринг или слой мок-модели. Для TTY-приложений это важнее, чем сразу менять весь код.',
      skills.has('code')
        ? 'Минимальная диагностика: воспроизвести одну последовательность клавиш, проверить текущее `inputValue`, `cursor`, `suggestionIndex`, затем посмотреть, что возвращает `getSuggestions()`.'
        : 'Лучше проверять проблему через короткий сценарий: что ввели, какую клавишу нажали, что ожидали и что получилось.',
      skills.has('analyst')
        ? 'Если проблема проявляется только при подсказках, вероятная причина — конфликт между историей ввода и меню выбора. Эти два режима должны быть явно разделены.'
        : 'После исправления стоит пройтись по обычному вводу, командам и отмене streaming через Esc.',
      `Активные скилы: ${active}.`,
    ],
  },
  {
    id: 'planning',
    title: 'планирование',
    patterns: [
      { re: /(план|порядок|roadmap|этап|архитектур|как\s+лучше|что\s+дальше|приоритет)/i, weight: 8 },
      { re: /(сначала|потом|затем|разложи|структурир)/i, weight: 5 },
    ],
    build: ({ skills, active }) => [
      'Я бы шёл от стабильной оболочки к более умной модели: сначала терминал, затем команды, затем скилы, затем настоящий backend для ответа.',
      skills.has('planner')
        ? 'Порядок работ: 1) зафиксировать клавиатурные сценарии, 2) расширить suggestion engine, 3) вынести правила мок-модели в отдельный список, 4) добавить диагностику состояния, 5) только потом подключать реальный AI.'
        : 'Главное — не смешивать UX-слой и логику ответов. Тогда прототип останется управляемым.',
      skills.has('analyst')
        ? 'Компромисс без библиотек такой: больше ручного кода для TTY, зато нет зависимости от чужого readline-виджета и проще добиться нужного поведения.'
        : 'Для текущего этапа этого достаточно как базы.',
      `Активные скилы: ${active}.`,
    ],
  },
  {
    id: 'writing',
    title: 'текст / письмо / редактура',
    patterns: [
      { re: /(текст|письмо|сообщение|формулировк|перепиши|сократи|улучши|тон|стиль|caption|post)/i, weight: 8 },
      { re: /(мягче|жёстче|профессиональн|короче|понятнее|без\s+клише)/i, weight: 5 },
    ],
    build: ({ skills, active }) => [
      skills.has('writer')
        ? 'Я бы сделал формулировку проще: сначала основная мысль, потом причина, затем конкретное действие. Так текст выглядит спокойнее и не распадается на оправдания.'
        : 'Можно сделать текст яснее: убрать лишние вводные, оставить главный смысл и не перегружать тон.',
      skills.has('analyst')
        ? 'Типичная проблема таких сообщений — в них одновременно пытаются объяснить, защититься и договориться. Лучше разделить эти задачи.'
        : 'В результате сообщение будет легче прочитать и сложнее неверно истолковать.',
      `Активные скилы: ${active}.`,
    ],
  },
  {
    id: 'explain',
    title: 'объяснение',
    patterns: [
      { re: /(объясни|что\s+такое|как\s+работает|почему|зачем|разбер[еи]|meaning|explain)/i, weight: 7 },
      { re: /\?$/i, weight: 2 },
    ],
    build: ({ skills, active }) => [
      'Я бы объяснил это через простую модель: есть вход пользователя, есть состояние терминала, есть набор активных скилов, и есть генератор ответа, который постепенно отдаёт текст.',
      skills.has('analyst')
        ? 'Важно не путать два уровня: “модель отвечает умно” и “интерфейс ведёт себя как AI-чат”. Сейчас прототип в первую очередь проверяет второй уровень.'
        : 'Сейчас это демонстрационная логика, но форма уже похожа на настоящий чат.',
      skills.has('terminal')
        ? 'Терминальный UX строится вокруг предсказуемого состояния: что видно на экране, где курсор, какая подсказка активна и можно ли отменить текущий поток.'
        : 'Позже вместо мок-ответа можно подключить реальный streaming API.',
      `Активные скилы: ${active}.`,
    ],
  },
  {
    id: 'compare',
    title: 'сравнение / выбор',
    patterns: [
      { re: /(сравни|выбери|лучше|хуже|вариант|альтернатив|или|vs\.?|trade[-\s]?off)/i, weight: 7 },
      { re: /(плюсы|минусы|за\s+и\s+против)/i, weight: 6 },
    ],
    build: ({ skills, active }) => [
      'Я бы выбирал по тому, что важнее для прототипа: скорость разработки, контроль UX или будущая расширяемость.',
      skills.has('analyst')
        ? 'Если нужен максимально контролируемый terminal UX, лучше ручной raw TTY. Если нужна скорость, обычно берут библиотеку. Но в этом проекте ограничение “без библиотек”, поэтому ручной путь логичен.'
        : 'Для текущей цели важнее контроль поведения, чем краткость реализации.',
      skills.has('planner')
        ? 'Практичный критерий: оставить то решение, которое проще заменить при подключении реальной модели и не требует переписывать ввод.'
        : 'Потом это можно будет развивать без полной переделки.',
      `Активные скилы: ${active}.`,
    ],
  },
  {
    id: 'ideas',
    title: 'идеи / брейншторм',
    patterns: [
      { re: /(идеи|придумай|brainstorm|что\s+можно\s+добавить|фичи|features)/i, weight: 8 },
      { re: /(ux|оформлен|красив|удобн|продуман)/i, weight: 4 },
    ],
    build: ({ skills, active }) => [
      'Для следующего слоя я бы добавил palette-команды, быстрые actions по Enter, режим compact/full, лог streaming-событий и отдельный экран диагностики состояния.',
      skills.has('terminal')
        ? 'Из UX-мелочей полезны: счётчик подсказок, явный selected-row, подсказка “↑/↓ move · Enter accept”, и аккуратная прокрутка списка, если команд много.'
        : 'Даже простые детали вроде статусной строки сильно меняют ощущение качества.',
      skills.has('code')
        ? 'Технически это лучше делать через один объект состояния, а не через разрозненные флаги: так проще поддерживать режимы ввода.'
        : 'Сначала лучше довести базовые сценарии, а потом добавлять новые режимы.',
      `Активные скилы: ${active}.`,
    ],
  },
  {
    id: 'testing',
    title: 'тестирование / проверка',
    patterns: [
      { re: /(тест|проверь|check|qa|кейсы|сценарии|регресс|сломалось\s+ли)/i, weight: 8 },
      { re: /(пограничн|edge\s+case|валидац|ручн)/i, weight: 5 },
    ],
    build: ({ skills, active }) => [
      'Я бы проверял прототип сценариями, а не только синтаксисом: обычное сообщение, `/`, выбор команды стрелками, применение Enter, тема через `/theme`, скилы через `/skill`, отмена ответа через Esc.',
      skills.has('code')
        ? 'Минимальная автоматическая проверка здесь — `node --check` по всем файлам и несколько прямых вызовов `buildMockReply()` / `getSuggestions()`.'
        : 'Ручная проверка важна, потому что поведение raw TTY зависит от последовательностей клавиш.',
      skills.has('analyst')
        ? 'Особенно стоит проверить конфликт: стрелка вверх в обычном вводе должна открывать историю, а стрелка вверх при `/` должна двигать выбранную подсказку.'
        : 'Если эти режимы не конфликтуют, база уже достаточно устойчива.',
      `Активные скилы: ${active}.`,
    ],
  },
  {
    id: 'security',
    title: 'безопасность / ограничения',
    patterns: [
      { re: /(безопасн|секрет|token|пароль|ключ|env|инъекц|shell|sanitize|permission)/i, weight: 7 },
      { re: /(опасн|риск|уязвим|security)/i, weight: 6 },
    ],
    build: ({ skills, active }) => [
      'Для такого терминального прототипа я бы сразу отделил команды приложения от shell-команд. Даже если позже появятся tools, пользовательский ввод не должен напрямую попадать в `exec`.',
      skills.has('code')
        ? 'Секреты лучше не хранить в истории сообщений и не показывать в `/history`. Для будущих провайдеров API стоит читать ключи из env и не рендерить их в статусе.'
        : 'Главная граница безопасности — не исполнять текст пользователя как команду системы.',
      skills.has('analyst')
        ? 'Риск появится не сейчас, а когда мок-модель заменится реальными инструментами. Поэтому контракт tools лучше проектировать заранее.'
        : 'Пока это только UI-прототип, но границы полезно заложить заранее.',
      `Активные скилы: ${active}.`,
    ],
  },
  {
    id: 'performance',
    title: 'производительность',
    patterns: [
      { re: /(быстр|медлен|лаг|задержк|performance|оптимиз|скорост|fps|render)/i, weight: 7 },
      { re: /(плавн|stream|стрим|вывод|chunk|буфер)/i, weight: 5 },
    ],
    build: ({ skills, active }) => [
      'Главная производительная проблема здесь — частая полная перерисовка экрана при streaming. Для прототипа это нормально, но потом можно добавить throttling redraw.',
      skills.has('terminal')
        ? 'Практичный компромисс: чанки модели приходят часто, но экран обновляется не чаще заданного интервала, например 30–60 FPS. Ввод при этом остаётся отзывчивым.'
        : 'Сейчас задержки специально имитируют поток ответа, чтобы проверить ощущение AI-чата.',
      skills.has('code')
        ? 'Если терминал большой, можно кэшировать отрендеренные строки истории и пересчитывать только последнее streaming-сообщение.'
        : 'На текущем размере проекта полной перерисовки достаточно.',
      `Активные скилы: ${active}.`,
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
        '  onChunk("Thinking through the request...\n");',
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
      content: 'Проверь, что raw mode, pending timers и stdin.pause() завершаются одним shutdown-путём.',
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
  title: 'общий запрос',
  build: ({ skills, active }) => [
    pick(skills, 'Я понял запрос. Сейчас это моковая модель, поэтому я не пытаюсь реально решать задачу, но выбираю ответ по набору regex-правил и активным скилам.', 'Я понял. В этом прототипе ответ строится не одной фиксированной заготовкой, а через rule matching по тексту запроса.'),
    skills.has('analyst')
      ? 'Если ни одно правило не совпало уверенно, я использую общий ответ. Это удобно как fallback: терминальный UX продолжает работать, а набор интентов можно расширять без изменения интерфейса.'
      : 'Если запрос не попал ни в один шаблон, сработает общий fallback.',
    skills.has('terminal')
      ? 'Для проверки команд набери `/`: список можно листать стрелками, а Enter применяет выбранную подсказку.'
      : 'Команды доступны через `/`.',
    `Активные скилы: ${active}.`,
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
