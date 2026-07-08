# Mock AI Terminal

Самодостаточный rich-terminal прототип на чистом Node.js без внешних библиотек.

Теперь проект организован как библиотека + example-приложение. Библиотечный код находится в `src/lib`, публичный entrypoint — `src/lib/index.js`, а `npm start` запускает пример из `examples/mock-ai-terminal.js`.

Приложение имитирует общение с AI: модель пока не обращается к настоящему API, но отвечает постепенно, как streaming-модель. Ответ выбирается через regex-интенты и активные скилы. Архитектура разделена на message log, input editor, provider interface, session store, key parser, focus manager и UI-runtime для терминального рендера.

## Запуск example

```bash
npm start
```

или напрямую:

```bash
node examples/mock-ai-terminal.js
```

Проверка:

```bash
npm test
npm run check
```


## Examples

Проект содержит несколько типов runnable examples: business demos как полноценные TUI-приложения, product examples для сценариев редактора/агента, а также library diagnostics/showcases для проверки отдельных слоёв renderer-а.

```bash
npm run examples
npm run demo:chat
npm run demo:support-desk
npm run example:chat
npm run example:composer
npm run example:code-review
npm run example:command-center
npm run example:sessions
npm run example:agent-stream
npm run example:keys
npm run example:themes
npm run example:blocks
npm run example:components
```

Business demos:

- `demo:chat` — основной AI chat workspace с командами, скилами, сессиями, palette, streaming и structured blocks.
- `demo:support-desk` — Support Triage Desk: очередь тикетов, карточка клиента, SLA live block, reply composer, templates, эскалация и timeline обращения.

Product examples:

- `example:chat` — основной mock AI terminal с командами, скилами, сессиями, palette, streaming и structured blocks.
- `example:composer` — Prompt Composer: несколько редактируемых секций prompt, templates, preview, intent/block inference и submit history.
- `example:code-review` — AI Code Review Terminal: structured response, выбор блоков, mock copy/apply/run и confirm flow.
- `example:command-center` — dashboard с command palette, mode stack, modal, toast, progress и active skills.
- `example:sessions` — session browser: фильтр, preview, создание, mock export и удаление через confirmation.
- `example:agent-stream` — structured streaming playground: cancel, retry, regenerate, shorter/longer/explain actions.

Diagnostics/showcases:

- `example:keys` — Key Inspector: raw escape sequences, normalized key object и действие редактора.
- `example:themes` — Theme Gallery: одна и та же structured-сцена во всех темах.
- `example:blocks` — Blocks Gallery: `text/code/diff/command/warning/tool_result`, выбор блоков и mock actions.
- `example:components` — неинтерактивный UI-runtime showcase: declarative nodes, virtual frame и diff operations.

Старые focused labs также остались: `example:editor`, `example:palette`, `example:stream`, `example:kit`. Интерактивные examples требуют настоящий TTY. `example:components` можно запускать в обычном stdout, поэтому он удобен для быстрого smoke-check.

## Использование как библиотеки

```js
import {
  RichTerminalApp,
  Text,
  Box,
  renderToString,
  parseKey,
  createProvider,
} from 'mock-ai-terminal';

const frame = renderToString(
  Box({ border: true, padding: 1 }, Text('Hello terminal')),
  { width: 24, height: 5 },
);

console.log(frame);
```

Для локальной разработки внутри репозитория можно импортировать напрямую:

```js
import { RichTerminalApp } from './src/lib/index.js';
```

## Что добавлено в текущем инкременте

- `demo:support-desk` получил доработанный interaction layer: активная видимая зона теперь выделяется цветом рамки, а не только текстом в header.
- `Tab` теперь переключает только реально видимые focus zones: tabs/inbox/work/rail/command в wide, tabs/inbox/work/command в medium, tabs/work/command в narrow.
- `Ctrl+P` и `/help` теперь открываются как видимые modal overlays, закрываются через `Esc` и не рендерятся ниже viewport.
- `Esc` в command mode очищает текущую команду и оставляет focus на command bar, чтобы состояние не терялось.
- Idle command bar теперь выглядит как поле ввода и явно подсказывает, что нужно нажать `/` для slash-команд.
- Inbox получил визуальные controls для `Tickets / Queue / Priority / Status / Sort`; ими можно управлять стрелками и Enter, не только slash-командами.
- Workflow-команды вроде `/assign me`, `/status pending`, `/priority high`, `/tag ...` теперь переключают UI на Ticket tab, показывают изменённые поля и оставляют last-action строку в ticket pane.

- `demo:support-desk` визуально пересобран под дизайн-цель из reference mockup: top header, product tabs, пропорциональный main area, command bar, live activity feed и footer status bar.
- Responsive breakpoints обновлены под реальные размеры терминала: `wide >= 160` показывает 3 колонки, `medium 120–159` показывает 2 колонки, `narrow < 120` переключается в single-pane tab workflow.
- В medium/narrow больше не рендерится third context rail: `TICKET PROPERTIES`, SLA/customer/actions rail появляется только в действительно широком терминале.
- Wide layout получил нормальные пропорции: inbox слева, более широкая рабочая область в центре, compact context rail справа.
- Табовая навигация упрощена до читаемых product tabs без «сломанных» pseudo-icons.
- Ticket list теперь рендерится как контролируемая таблица с фиксированными колонками и ellipsis для subject, вместо случайного обрезания строк.
- `Ticket` tab стал цельным ticket pane: header/meta/tags, thread/timeline и quick reply strip внутри одной рабочей области, а не набор равнозначных рамок.
- `Reply` tab стал полноценным рабочим экраном: templates, tone, internal context, multiline draft, live preview, internal note, send status и suggested macros.
- `Activity` tab стал отдельным dashboard/timeline экраном с filters, metrics, event details и operational feed.
- `Box` получил опциональный `borderColor`, а Support Desk использует muted theme borders вместо ярко-белой «стены рамок».
- В library UI добавлены reusable primitives: `Badge`, `SectionTabs`, `CommandBar`, `FooterStatusBar`, `PropertyRows`, `ChipLine`; `Row` поддерживает explicit `widths`, чтобы делать нормальные pane proportions.
- Добавлены render-тесты на breakpoints: 119/140/159 columns не показывают третий rail, а 160 columns уже показывает wide layout.

- `demo:support-desk` переписан из короткой тех-демки в полноценное mini-product TUI-приложение для support triage.
- Добавлена отдельная структура `examples/support-desk/`: `app.js`, `data.js`, `commands.js`, `reducers.js`, `views.js`, `themes.js`, `templates.js`. Старый `examples/support-desk.js` теперь thin launcher/re-export.
- Support Desk получил реалистичную модель тикетов: queue, status, priority, assignee, customer profile, SLA, tags, messages, notes, activity, custom fields и typed timeline events.
- Добавлен responsive UI: wide layout с inbox/ticket/customer side rail, medium layout с двумя колонками, narrow layout с tab-based single-pane режимом.
- Добавлены полноценные workflows: выбор тикета стрелками, `/ticket`, `/search`, `/filter`, `/assign`, `/status`, `/priority`, `/tag`, `/untag`, `/reply`, `/note`, `/edit`, `/escalate`, `/snooze`, `/close`, `/reopen`, `/theme`.
- Reply/note/edit flows теперь используют редактор ввода, templates, подтверждения опасных действий, toast-сообщения и обновляют timeline.
- Добавлены support-specific темы: `support-ocean`, `support-dark`, `support-paper`, `support-contrast`, `support-slate`.
- Добавлен animation/live tick runtime для interactive demos: transient toast TTL, spinner/pulse frames и mock background job progress.
- В библиотеку вынесены общие слои, которые нужны не только support demo: `commands/parser.js`, `commands/registry.js`, `ui/responsive.js`, `ui/timeline.js`, `ui/liveBlocks.js`, `toastManager.js`.
- Добавлены тесты `test/supportDeskDemo.test.js`: responsive render smoke, workflow commands, confirmation, reply composer, filters, theme switching и live tick.

## Что было добавлено в предыдущем инкременте

- Добавлены product-level examples, которые показывают не отдельные widgets, а полноценные сценарии использования редактора и UI-runtime.
- `example:composer`: multi-section prompt editor с templates, preview, inferred intent/block plan и submit history.
- `example:code-review`: structured code review workflow с выбором `code/diff/command` blocks и confirm flow для apply/run.
- `example:command-center`: dashboard поверх reusable command palette, `ModeManager`, `Modal`, `Toast`, `ProgressBar`, active skills и theme switching.
- `example:sessions`: session browser с фильтрацией, preview, create/export/delete и confirmation prompt.
- `example:agent-stream`: structured streaming с cancel/retry/regenerate/shorter/longer/explain actions.
- `example:keys`: terminal compatibility lab для raw key sequences, normalized keys и editor actions.
- `example:themes`: gallery, которая показывает одну и ту же structured transcript сцену во всех темах.
- `example:blocks`: gallery для всех structured block types и mock block actions.
- Добавлены тесты `test/examplesAdvanced.test.js`, которые проверяют новые examples через pure state/view helpers без настоящего TTY.

## Что было добавлено до этого

- Добавлен structured assistant blocks слой: `text`, `code`, `diff`, `command`, `warning`, `tool_result`.
- Добавлен модуль `src/lib/blocks.js`: `createBlock`, `normalizeBlock(s)`, `blockToText`, `blocksToText`, `appendBlockContent`.
- Message log теперь хранит не только `content: string`, но и опциональный `blocks: []`. При этом `content` остаётся plain-text представлением для `/copy-last`, `/history`, сессий и старых сценариев.
- `Transcript` научился рендерить структурированные блоки: код в отдельной рамке, diff с выделением `+/-`, command block, warning block и tool result block.
- `MockProvider` теперь поддерживает расширенный streaming contract: `onChunk(chunk)` для обычного текста и `onBlock(block)` для структурированных блоков.
- Добавлены `buildMockBlocks()` и `streamMockBlocks()`. Regex-мок может возвращать не только строку, но и структурированный ответ.
- Добавлена команда `/blocks [prompt]`, чтобы вручную вставить demo structured assistant response в основной example.
- Добавлены тесты на block normalization, session compatibility, transcript rendering и structured streaming.

## Что было добавлено до этого

- Основной экран `RichTerminalApp` переведён с ручной сборки строк на компонентный `ChatScreen`.
- Добавлен слой `src/lib/chat/components.js`: `Header`, `Transcript`, `InputBar`, `StatusBar`, `SuggestionsPanel`, `DebugPanel`, `PalettePanel`.
- `RichTerminalApp.render()` теперь только собирает состояние приложения, вызывает `createChatScreen()` и отдаёт UI-tree в `TerminalRenderer`.
- Старые `renderHeader/renderTranscript/renderSuggestions/renderStatus/renderInputBlock` удалены из `app.js`, чтобы не держать два параллельных UI-пути.
- `TerminalRenderer` получил метод `renderNode(node, options)`, чтобы приложения могли рендерить декларативное дерево напрямую.
- Добавлены render-тесты для chat screen: обычный transcript, suggestions, command palette, debug overlay, scroll clamp и интеграция с `RichTerminalApp`.

## Что было добавлено ранее

- Добавлены reusable UI-компоненты: `SelectList`, `ConfirmPrompt`, `Modal`, `Toast`, `ProgressBar`, `Spinner`, `HelpOverlay`.
- Добавлен библиотечный `CommandPalette`: состояние, фильтрация, обработка клавиш и render helper.
- Добавлен `ModeManager` для stack-based режимов `input → palette → modal/confirm`.
- Основной chat example получил `Ctrl+P` command palette: можно искать команды, темы, provider и скилы, затем вставлять выбранную команду в input.
- Добавлен `example:kit`, который показывает interaction primitives вместе: palette, modal, confirm, toast, progress и mode stack.
- Добавлены тесты для UI-компонентов, command palette, mode manager и palette-интеграции приложения.

## Более ранние изменения

- Код разделён на библиотеку и example-приложение.
- `npm start` теперь запускает `examples/mock-ai-terminal.js`.
- `src/index.js` больше не стартует TTY-приложение, а экспортирует библиотечный API.
- Добавлен публичный entrypoint `src/lib/index.js`.
- Добавлены тесты через встроенный `node:test` без зависимостей.
- Добавлен `keyParser`, который нормализует raw TTY-последовательности в семантические события.
- Добавлен `FocusManager` для будущих режимов `input`, `suggestions`, `transcript`, `debug`, `modal`.
- Добавлен минимальный UI-runtime: `Text`, `Box`, `Row`, `Column`, `Panel`.
- Добавлен virtual frame: фиксированные ширина/высота, нормализация строк, стабильный `toString()` для тестов.
- Добавлен diff-renderer: сравнение предыдущего и нового frame и генерация ANSI patch только для изменённых строк.
- Текущее приложение переведено на `TerminalRenderer`, поэтому оно больше не обязано каждый раз вручную писать полный экран через один большой buffer.
- Добавлены отдельные examples для демонстрации редактора ввода, command palette, streaming workbench и UI-runtime showcase.
- Examples экспортируют pure view/state helpers, поэтому их можно тестировать через `renderToString()` без настоящего TTY.

## Библиотечная структура

```text
src/
  index.js              re-export публичной библиотеки
  lib/
    index.js            главный library entrypoint
    app.js              RichTerminalApp
    ansi.js             ANSI-утилиты и темы
    commands.js         команды и автодополнение
    focusManager.js     управление focus targets
    modeManager.js      stack-based режимы UI
    commandPalette.js   reusable command palette state/render/key handling
    inputEditor.js      редактор строки ввода
    keyParser.js        нормализация raw TTY key events
    mockModel.js        regex-интенты и streaming mock model
    providers.js        provider interface: mock/replay
    sessionStore.js     локальные JSON-сессии
    skills.js           каталог скилов
    state.js            message log helpers
    blocks.js           structured assistant blocks
    wrap.js             перенос текста
    chat/
      components.js     компонентный ChatScreen для основного приложения
    commands/
      parser.js         reusable slash command parser
      registry.js       reusable command registry/suggestions
    ui/
      node.js           Text, Box, Row, Column, Panel
      layout.js         простой terminal layout
      screen.js         Frame и нормализация строк
      diff.js           frame diff и ANSI patch
      renderer.js       TerminalRenderer
      components.js     SelectList, Modal, Toast, ConfirmPrompt, ProgressBar
      responsive.js     responsive layout helpers
      timeline.js       typed timeline rendering helpers
      liveBlocks.js     metric/live-job/key-value blocks
    toastManager.js     transient toast state helper
examples/
  mock-ai-terminal.js      runnable AI chat example для npm start/bin
  support-desk.js         thin launcher for support desk demo
  support-desk/           full support desk mini-application
    app.js                state lifecycle and key handling
    commands.js           product slash commands and palette actions
    data.js               realistic ticket/customer fixtures
    reducers.js           pure ticket workflow mutations
    views.js              responsive TUI layout
    themes.js             support-specific semantic themes
    templates.js          reply templates
  composer.js             product prompt composer demo
  code-review.js          structured code-review workflow demo
  command-center.js       palette/mode/modal dashboard demo
  sessions.js             session browser demo
  agent-stream.js         structured streaming/cancel/actions demo
  keys.js                 key parser and editor diagnostics
  themes.js               theme gallery
  blocks.js               structured blocks gallery
  editor-lab.js           InputEditor playground
  command-palette.js      searchable palette/list example
  streaming-workbench.js  streaming + cancellation example
  components-showcase.js  non-interactive UI-runtime showcase
  interaction-kit.js      reusable widgets + mode stack demo
  index.js                prints the example catalog
test/
  businessDemos.test.js проверяет release/support business demos
  supportDeskDemo.test.js проверяет full support desk workflow
  *.test.js             node:test тесты
```

## UI-runtime

Минимальные декларативные примитивы:

```js
import { Box, Column, Row, Text, renderToFrame } from './src/lib/index.js';

const view = Column(
  Text('Header'),
  Box({ border: true, padding: 1 }, Text('Body')),
  Row(Text('A'), Text('B')),
);

const frame = renderToFrame(view, { width: 40, height: 10 });
console.log(frame.toString());
```

Сейчас layout намеренно небольшой. Это не полный Flexbox и не clone Ink, а базовый слой для дальнейшего развития: `width`, `height`, border, padding, row/column composition, virtual frame и test renderer.


## Structured assistant blocks

Сообщение ассистента может быть обычной строкой или набором блоков:

```js
import { createMessage, buildMockBlocks } from './src/lib/index.js';

const message = createMessage({
  role: 'assistant',
  blocks: [
    { type: 'text', content: 'Сначала общий ответ.' },
    { type: 'code', language: 'js', title: 'example', content: 'console.log("ok")' },
    { type: 'command', title: 'Run tests', command: 'npm test' },
    { type: 'warning', content: 'Перед apply нужен confirm.' },
  ],
});
```

`content` у такого сообщения всё равно заполняется plain-text представлением блоков. Поэтому старые команды, экспорт истории и JSON-сессии продолжают работать без отдельного migration step.

В основном example можно быстро посмотреть рендер блоков:

```text
/blocks реализуй код и покажи тесты
```

## Chat screen components

Основной AI chat UI теперь также доступен как библиотечный слой:

```js
import {
  ChatScreen,
  createChatScreen,
  ChatTranscript,
  InputBar,
  StatusBar,
  SuggestionsPanel,
} from './src/lib/index.js';
```

`createChatScreen()` возвращает `{ node, scrollOffset, transcriptHeight }`, поэтому приложение может чисто рендерить экран и одновременно получить скорректированный scroll offset после clamp. Это позволяет тестировать основной экран через `renderToString()` без настоящего TTY.

## Reusable interaction components

Библиотека теперь содержит более высокий UI-слой поверх `Text/Box/Row/Column`:

```js
import {
  SelectList,
  ConfirmPrompt,
  Modal,
  Toast,
  ProgressBar,
  Spinner,
  createCommandPaletteState,
  handleCommandPaletteKey,
  renderCommandPalette,
  ModeManager,
} from './src/lib/index.js';
```

`CommandPalette` сделан как reusable primitive: состояние и обработчик клавиш отделены от конкретного приложения. В основном chat example он подключён к `Ctrl+P` и вставляет выбранную команду в input, а `example:kit` показывает его вместе с `Modal`, `ConfirmPrompt`, `Toast`, `ProgressBar` и `ModeManager`.

## Key parser

`parseKey()` превращает raw TTY bytes в объект:

```js
import { parseKey } from './src/lib/index.js';

parseKey('\x1b[1;3D');
// {
//   name: 'left',
//   meta: true,
//   cmd: false,
//   shift: false,
//   ctrl: false,
//   printable: false,
//   ...
// }
```

Поддерживаются обычные символы, `Ctrl+C`, `Ctrl+D`, `Ctrl+P`, `Esc`, `Tab`, `Shift+Tab`, стрелки, `Home/End`, `PageUp/PageDown`, `Alt+Arrow`, часть `Cmd+Arrow` escape-последовательностей и bracketed paste.

## Provider interface

Provider должен иметь метод:

```js
streamResponse({ messages, prompt, enabledSkills, signal, onChunk, onBlock })
```

`onChunk(chunk)` используется для постепенного текстового ответа. `onBlock(block)` добавляет структурированный блок в transcript: `code`, `diff`, `command`, `warning` или `tool_result`. Благодаря этому terminal UI не зависит от того, откуда пришёл ответ: из regex-мока, replay-provider или будущего реального AI API.

## Команды example-приложения

- `/help` — показать команды и горячие клавиши.
- `/skills` — показать список скилов.
- `/skill on <name>` — включить скил.
- `/skill off <name>` — выключить скил.
- `/skill info <name>` — показать описание скила.
- `/theme <name>` — сменить тему.
- `/themes` — показать все темы.
- `/provider [mock|replay]` — показать или сменить provider модели.
- `/session new` — начать новую сессию.
- `/session save` — сохранить текущую сессию.
- `/session list` — показать сохранённые сессии.
- `/session open <id>` — открыть сохранённую сессию.
- `/session delete <id>` — удалить сохранённую сессию.
- `/retry` — повторить последний пользовательский запрос.
- `/regenerate` — сгенерировать ещё один ответ на последний пользовательский запрос.
- `/shorter` — сократить последний ответ ассистента.
- `/longer` — расширить последний ответ ассистента.
- `/explain` — объяснить логику последнего ответа.
- `/apply` — показать mock-путь применения последнего артефакта.
- `/copy-last` — показать последний ответ отдельным блоком для копирования.
- `/debug on|off|show` — включить overlay или показать debug-события.
- `/blocks [prompt]` — добавить демонстрационный structured assistant response.
- `/intents` — показать regex-интенты мок-модели.
- `/status` — показать состояние приложения.
- `/history [count]` — показать последние сообщения.
- `/clear` — очистить экранную историю.
- `/reset` — сбросить экран, тему, provider, скилы и историю ввода.
- `/about` — кратко описать прототип.
- `/exit` — выйти.

## Горячие клавиши

- `Ctrl+P` — открыть command palette поверх chat example.
- `Tab` — перейти по подсказкам; если подсказка одна, применить её.
- `Shift+Tab` — перейти к предыдущей подсказке.
- `Enter` — применить выбранную подсказку или выполнить введённую команду.
- `↑` / `↓` — выбрать подсказку, если открыт список команд; иначе пройтись по истории ввода.
- `←` / `→` — перемещение курсора.
- `Home` / `End`, `Ctrl+A` / `Ctrl+E` — начало/конец строки.
- `Alt+←` / `Alt+→` — перемещение по словам.
- `Cmd+←` / `Cmd+→` — начало/конец строки в терминалах, которые отдают CSI `1;9D` / `1;9C`.
- `Ctrl+K` — удалить до конца строки.
- `Ctrl+U` — удалить до начала строки.
- `Ctrl+W` — удалить слово слева.
- `PageUp` / `PageDown` — прокрутить transcript.
- `Ctrl+L` — вернуться к нижней части transcript и перерисовать экран.
- `Esc` — отменить активный потоковый ответ.
- `Ctrl+C` / `Ctrl+D` — выйти.

## Темы

```text
dark
mono
amber
ocean
forest
synth
slate
paper
matrix
```

## Сессии

Сессии сохраняются как JSON-файлы в:

```text
~/.mock-ai-terminal/sessions
```

Можно переопределить каталог через переменную окружения:

```bash
MOCK_AI_TERMINAL_HOME=/tmp/mock-ai-terminal npm start
```

## Следующие шаги

Ближайшие логичные доработки после этого рефактора:

- Перевести сам `RichTerminalApp.render*` с ручной сборки строк на `Text/Box/Column/Row` полностью.
- Добавить тесты на `RichTerminalApp` через fake TTY streams.
- Добавить `suspendTerminal()` для запуска внешних команд/editor без поломки raw mode.
- Развить plugin/skill API так, чтобы скилы могли добавлять команды, keybindings и панели.
