import { ansi, themes } from './ansi.js';
import { commands as commandList, findCommand, getSuggestions, parseCommand } from './commands.js';
import { InputEditor } from './inputEditor.js';
import { parseKey } from './keyParser.js';
import { FocusManager } from './focusManager.js';
import { ModeManager } from './modeManager.js';
import { createCommandPaletteState, handleCommandPaletteKey } from './commandPalette.js';
import { TerminalRenderer } from './ui/renderer.js';
import { createProvider } from './providers.js';
import { SessionStore, applySerializedSkillState, serializeSkillState } from './sessionStore.js';
import { createSkillState, enabledSkillNames, skills } from './skills.js';
import { appendMessageBlock, appendMessageChunk, completeMessage, createMessage, lastAssistantMessage, lastUserMessage, trimMessages } from './state.js';
import { StreamCancelled } from './mockModel.js';
import { createChatScreen } from './chat/components.js';

const MIN_COLUMNS = 48;
const MIN_ROWS = 16;
const SUGGESTION_WINDOW_SIZE = 7;
const TRANSCRIPT_SCROLL_STEP = 6;

export function createAppPaletteItems() {
  const commandItems = commandList.map((command) => ({
    id: command.name,
    title: command.description,
    description: command.usage,
    keywords: [command.name.replace(/^\//, ''), command.usage, command.description],
    value: { insert: commandInsert(command) },
  }));

  const themeItems = Object.keys(themes).map((name) => ({
    id: `theme.${name}`,
    title: `Theme: ${name}`,
    description: `Switch visual theme with /theme ${name}`,
    keywords: ['theme', 'color', name],
    value: { insert: `/theme ${name}` },
  }));

  const providerItems = ['mock', 'replay'].map((name) => ({
    id: `provider.${name}`,
    title: `Provider: ${name}`,
    description: `Switch model provider with /provider ${name}`,
    keywords: ['provider', 'model', name],
    value: { insert: `/provider ${name}` },
  }));

  const skillItems = skills.map((skill) => ({
    id: `skill.${skill.id}.toggle`,
    title: `Skill: ${skill.title}`,
    description: `Toggle skill with /skill on ${skill.id}`,
    keywords: ['skill', skill.id, skill.title, skill.description],
    value: { insert: `/skill on ${skill.id}` },
  }));

  return [...commandItems, ...themeItems, ...providerItems, ...skillItems];
}

export class RichTerminalApp {
  constructor({ input = process.stdin, output = process.stdout, onExit = null, sessionStore = new SessionStore() } = {}) {
    this.input = input;
    this.output = output;
    this.onExit = onExit;
    this.sessionStore = sessionStore;

    this.running = false;
    this.busy = false;
    this.abortController = null;

    this.themeName = 'dark';
    this.theme = themes[this.themeName];
    this.skillState = this.createDefaultSkillState();
    this.providerName = 'mock';
    this.provider = createProvider(this.providerName);

    this.sessionId = this.sessionStore.createId();
    this.sessionTitle = 'Untitled session';
    this.sessionCreatedAt = new Date().toISOString();

    this.messages = [];
    this.editor = new InputEditor();
    this.history = [];
    this.historyIndex = null;
    this.status = 'Ready. Type /help for commands.';
    this.suggestionIndex = 0;
    this.scrollOffset = 0;
    this.frame = 0;
    this.debug = { enabled: false, events: [] };
    this.focus = new FocusManager(['input', 'suggestions', 'transcript', 'debug']);
    this.modes = new ModeManager('input');
    this.palette = createCommandPaletteState({ items: createAppPaletteItems(this), windowSize: 7 });
    this.renderer = new TerminalRenderer({ output: this.output });

    this.boundOnData = this.onData.bind(this);
    this.boundOnResize = this.render.bind(this);
  }

  get inputValue() {
    return this.editor.value;
  }

  set inputValue(value) {
    this.editor.set(value);
  }

  get cursor() {
    return this.editor.cursor;
  }

  set cursor(value) {
    this.editor.cursor = Math.max(0, Math.min(Array.from(this.editor.value).length, Number(value) || 0));
  }

  createDefaultSkillState() {
    return createSkillState();
  }

  start() {
    if (!this.input.isTTY || !this.output.isTTY) {
      throw new Error('This app requires an interactive TTY. Run it directly in a terminal.');
    }

    this.running = true;
    this.renderer.reset();
    this.output.write(ansi.altScreen + ansi.hideCursor + ansi.clear + ansi.home);
    this.input.setEncoding('utf8');
    this.input.setRawMode(true);
    this.input.resume();
    this.input.on('data', this.boundOnData);
    this.output.on('resize', this.boundOnResize);

    this.addSystemMessage('Mock AI Terminal запущен. Введите сообщение или начните с / для команд. Подсказки можно листать ↑/↓ и применять через Enter. Сессии доступны через /session. палитра команд: Ctrl+P.');
    this.render();
  }

  stop() {
    if (!this.running) return;
    this.running = false;

    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }

    this.input.off('data', this.boundOnData);
    this.output.off('resize', this.boundOnResize);

    if (this.input.isTTY) this.input.setRawMode(false);
    this.input.pause();

    this.renderer.reset();
    this.output.write(ansi.showCursor + ansi.normalScreen + ansi.reset);
    this.output.write('\n');
  }

  requestExit(code = 0) {
    this.stop();
    if (typeof this.onExit === 'function') this.onExit(code);
  }

  setTheme(name) {
    this.themeName = themes[name] ? name : 'dark';
    this.theme = themes[this.themeName];
  }

  setProvider(name) {
    this.provider = createProvider(name);
    this.providerName = this.provider.name;
  }

  addMessage(role, content, { blocks = null, status = 'complete', meta = {} } = {}) {
    const message = createMessage({ role, content, blocks, status, meta });
    this.messages.push(message);
    this.messages = trimMessages(this.messages);
    this.scrollOffset = 0;
    this.render();
    return message;
  }

  addSystemMessage(content) {
    return this.addMessage('system', content);
  }

  addUserMessage(content) {
    return this.addMessage('user', content);
  }

  addAssistantMessage(content = '', streaming = false, { blocks = null } = {}) {
    return this.addMessage('assistant', content, { blocks, status: streaming ? 'streaming' : 'complete' });
  }

  clearMessages() {
    this.messages = [];
    this.scrollOffset = 0;
    this.render();
  }

  pushHistory(line) {
    if (this.history.at(-1) !== line) this.history.push(line);
    if (this.history.length > 250) this.history = this.history.slice(-250);
  }

  async submitInput() {
    const line = this.editor.value.trim();
    if (!line || this.busy) return;

    this.pushHistory(line);
    this.editor.clear();
    this.resetSuggestionCycle();
    this.historyIndex = null;

    if (line.startsWith('/')) {
      await this.executeCommand(line);
      return;
    }

    this.addUserMessage(line);
    await this.respond(line);
  }

  async executeCommand(line) {
    const { name, args } = parseCommand(line);
    const command = findCommand(name);
    if (!command) {
      this.addSystemMessage(`Неизвестная команда: ${name}. Введите /help.`);
      return;
    }

    try {
      await command.run(this, args);
    } catch (error) {
      this.addSystemMessage(`Команда завершилась ошибкой: ${error.message}`);
    }
    this.render();
  }

  async respond(prompt) {
    this.busy = true;
    this.status = `${this.provider.title} is streaming. Press Esc to cancel.`;
    this.abortController = new AbortController();
    const assistant = this.addAssistantMessage('', true);

    try {
      await this.provider.streamResponse({
        messages: this.messages,
        prompt,
        enabledSkills: enabledSkillNames(this.skillState),
        signal: this.abortController.signal,
        onChunk: (chunk) => {
          appendMessageChunk(assistant, chunk);
          this.render();
        },
        onBlock: (block) => {
          appendMessageBlock(assistant, block);
          this.render();
        },
      });
      completeMessage(assistant, 'complete');
      this.status = 'Ready.';
    } catch (error) {
      completeMessage(assistant, 'cancelled');
      if (error instanceof StreamCancelled || this.abortController?.signal.aborted || error.message === 'stream cancelled') {
        appendMessageChunk(assistant, '\n\n[response cancelled]');
        this.status = 'Stream cancelled.';
      } else {
        appendMessageChunk(assistant, `\n\n[error: ${error.message}]`);
        this.status = 'Streaming failed.';
      }
    } finally {
      this.busy = false;
      this.abortController = null;
      this.render();
    }
  }

  async retryLastUserPrompt() {
    if (this.busy) return;
    const lastUser = lastUserMessage(this.messages);
    if (!lastUser) {
      this.addSystemMessage('Нет пользовательского сообщения для повтора.');
      return;
    }
    await this.respond(lastUser.content);
  }

  async runAssistantAction(action) {
    if (this.busy) return;
    const lastAssistant = lastAssistantMessage(this.messages);
    if (!lastAssistant || !lastAssistant.content.trim()) {
      this.addSystemMessage('Нет последнего ответа ассистента для действия.');
      return;
    }

    const text = buildActionText(action, lastAssistant.content);
    this.busy = true;
    this.status = `Action ${action} is streaming. Press Esc to cancel.`;
    this.abortController = new AbortController();
    const assistant = this.addAssistantMessage('', true);

    try {
      await this.streamPlainText(text, assistant, this.abortController.signal);
      completeMessage(assistant, 'complete');
      this.status = 'Ready.';
    } catch (error) {
      completeMessage(assistant, 'cancelled');
      appendMessageChunk(assistant, '\n\n[action cancelled]');
      this.status = 'Action cancelled.';
    } finally {
      this.busy = false;
      this.abortController = null;
      this.render();
    }
  }

  async streamPlainText(text, message, signal) {
    for (const chunk of chunkText(text)) {
      if (signal?.aborted) throw new StreamCancelled();
      await delay(chunk.includes('\n') ? 60 : /^\s+$/.test(chunk) ? 10 : 24, signal);
      if (signal?.aborted) throw new StreamCancelled();
      appendMessageChunk(message, chunk);
      this.render();
    }
  }

  newSession() {
    this.sessionId = this.sessionStore.createId();
    this.sessionTitle = 'Untitled session';
    this.sessionCreatedAt = new Date().toISOString();
    this.messages = [];
    this.history = [];
    this.historyIndex = null;
    this.editor.clear();
    this.scrollOffset = 0;
    this.addSystemMessage(`Новая сессия создана: ${this.sessionId}`);
  }

  saveSession() {
    const saved = this.sessionStore.save(this.snapshot());
    this.sessionId = saved.id;
    this.sessionTitle = saved.title;
    this.sessionCreatedAt = saved.createdAt;
    return saved;
  }

  loadSession(id) {
    const snapshot = this.sessionStore.load(id);
    this.sessionId = snapshot.id;
    this.sessionTitle = snapshot.title;
    this.sessionCreatedAt = snapshot.createdAt;
    this.messages = snapshot.messages;
    this.history = snapshot.inputHistory;
    this.historyIndex = null;
    this.setTheme(snapshot.themeName);
    this.setProvider(snapshot.providerName);
    this.skillState = this.createDefaultSkillState();
    applySerializedSkillState(this.skillState, snapshot.skillState);
    this.editor.clear();
    this.scrollOffset = 0;
    this.addSystemMessage(`Сессия загружена: ${snapshot.title} (${snapshot.id})`);
  }

  snapshot() {
    return {
      id: this.sessionId,
      title: this.sessionTitle,
      createdAt: this.sessionCreatedAt,
      themeName: this.themeName,
      providerName: this.providerName,
      skillState: serializeSkillState(this.skillState),
      inputHistory: this.history,
      messages: this.messages,
    };
  }

  toggleDebug(enabled = !this.debug.enabled) {
    this.debug.enabled = Boolean(enabled);
    this.logDebug('debug', this.debug.enabled ? 'enabled' : 'disabled');
  }

  logDebug(type, detail) {
    if (!this.debug.enabled && type === 'key') return;
    this.debug.events.push({ at: new Date().toISOString(), type, detail: String(detail ?? '') });
    if (this.debug.events.length > 80) this.debug.events = this.debug.events.slice(-80);
  }

  onData(data) {
    const key = parseKey(data);
    this.logDebug('key', printableKey(key));

    if (key.name === 'ctrl-c') {
      this.requestExit(130);
      return;
    }

    if (key.name === 'ctrl-d') {
      this.requestExit(0);
      return;
    }

    if (key.name === 'command-palette') {
      if (this.modes.is('palette')) {
        this.modes.pop();
        this.status = 'Command palette closed.';
        this.render();
      } else {
        this.openCommandPalette();
      }
      return;
    }

    if (this.modes.is('palette')) {
      this.handleCommandPaletteKey(key);
      return;
    }

    if (key.name === 'escape') {
      if (this.busy && this.abortController) this.abortController.abort();
      else this.resetSuggestionCycle();
      this.render();
      return;
    }

    if (key.name === 'enter') {
      if (this.shouldAcceptSuggestionBeforeSubmit()) this.acceptCurrentSuggestion();
      else this.submitInput();
      return;
    }

    if (key.name === 'tab') {
      this.handleSuggestionTab(key.shift ? -1 : 1);
      return;
    }

    if (key.name === 'paste') {
      this.mutateInput(() => this.editor.insert(key.text));
      return;
    }

    if (key.name === 'backspace') {
      this.mutateInput(() => this.editor.backspace());
      return;
    }

    if (key.name === 'delete') {
      this.mutateInput(() => this.editor.deleteForward());
      return;
    }

    if (key.name === 'home' || (key.cmd && key.name === 'left')) {
      this.editor.home();
      this.render();
      return;
    }

    if (key.name === 'end' || (key.cmd && key.name === 'right')) {
      this.editor.end();
      this.render();
      return;
    }

    if (key.name === 'kill-end') {
      this.mutateInput(() => this.editor.killToEnd());
      return;
    }

    if (key.name === 'kill-start') {
      this.mutateInput(() => this.editor.killToStart());
      return;
    }

    if (key.name === 'delete-word-left') {
      this.mutateInput(() => this.editor.deleteWordBack());
      return;
    }

    if (key.name === 'redraw') {
      this.scrollOffset = 0;
      this.status = 'Screen redrawn.';
      this.renderer.reset();
      this.render();
      return;
    }

    if (key.meta && key.name === 'left') {
      this.editor.moveWord(-1);
      this.render();
      return;
    }

    if (key.meta && key.name === 'right') {
      this.editor.moveWord(1);
      this.render();
      return;
    }

    if (key.name === 'up') {
      if (!this.moveSuggestion(-1)) this.historyUp();
      return;
    }

    if (key.name === 'down') {
      if (!this.moveSuggestion(1)) this.historyDown();
      return;
    }

    if (key.name === 'right') {
      this.editor.move(1);
      this.render();
      return;
    }

    if (key.name === 'left') {
      this.editor.move(-1);
      this.render();
      return;
    }

    if (key.name === 'page-up') {
      this.scrollTranscript(TRANSCRIPT_SCROLL_STEP);
      return;
    }

    if (key.name === 'page-down') {
      this.scrollTranscript(-TRANSCRIPT_SCROLL_STEP);
      return;
    }

    if (key.printable) {
      this.mutateInput(() => this.editor.insert(key.text));
    }
  }

  openCommandPalette() {
    if (this.busy) return;
    this.palette = createCommandPaletteState({ items: createAppPaletteItems(this), windowSize: 7 });
    this.modes.push('palette');
    this.status = 'Command palette opened. Type to filter, Enter inserts selected command, Esc closes.';
    this.render();
  }

  handleCommandPaletteKey(key) {
    const result = handleCommandPaletteKey(this.palette, key);
    if (result.type === 'cancel') {
      this.modes.pop();
      this.status = 'Command palette closed.';
      this.render();
      return;
    }

    if (result.type === 'accept' && result.item) {
      const insert = result.item.value?.insert ?? result.item.id;
      this.editor.set(insert);
      this.modes.pop();
      this.historyIndex = null;
      this.resetSuggestionCycle();
      this.status = `Inserted ${result.item.id}. Press Enter to run or edit arguments.`;
      this.render();
      return;
    }

    this.render();
  }

  mutateInput(fn) {
    fn();
    this.historyIndex = null;
    this.resetSuggestionCycle();
    this.render();
  }

  historyUp() {
    if (this.history.length === 0) return;
    if (this.historyIndex === null) this.historyIndex = this.history.length - 1;
    else this.historyIndex = Math.max(0, this.historyIndex - 1);
    this.editor.set(this.history[this.historyIndex] ?? '');
    this.resetSuggestionCycle();
    this.render();
  }

  historyDown() {
    if (this.history.length === 0 || this.historyIndex === null) return;
    if (this.historyIndex >= this.history.length - 1) {
      this.historyIndex = null;
      this.editor.clear();
    } else {
      this.historyIndex += 1;
      this.editor.set(this.history[this.historyIndex] ?? '');
    }
    this.resetSuggestionCycle();
    this.render();
  }

  resetSuggestionCycle() {
    this.suggestionIndex = 0;
  }

  getCurrentSuggestions() {
    const suggestions = getSuggestions(this.editor.value, this);
    if (suggestions.length === 0) return [];
    this.suggestionIndex = mod(this.suggestionIndex, suggestions.length);
    return suggestions;
  }

  moveSuggestion(delta) {
    if (this.busy || !this.editor.value.trimStart().startsWith('/')) return false;
    const suggestions = this.getCurrentSuggestions();
    if (!suggestions.length) return false;
    this.suggestionIndex = mod(this.suggestionIndex + delta, suggestions.length);
    this.historyIndex = null;
    this.render();
    return true;
  }

  handleSuggestionTab(direction) {
    if (this.busy) return;

    if (!this.editor.value) {
      this.editor.set('/');
      this.resetSuggestionCycle();
      this.render();
      return;
    }

    const suggestions = this.getCurrentSuggestions();
    if (!suggestions.length) return;
    if (suggestions.length === 1) {
      this.acceptCurrentSuggestion();
      return;
    }
    this.moveSuggestion(direction);
  }

  shouldAcceptSuggestionBeforeSubmit() {
    if (this.busy || !this.editor.value.trimStart().startsWith('/')) return false;
    const suggestions = this.getCurrentSuggestions();
    if (!suggestions.length) return false;

    const suggestion = suggestions[this.suggestionIndex];
    if (!suggestion) return false;

    const current = this.editor.value.trim();
    const proposed = suggestion.insert.trim();
    return current !== proposed || /\s$/.test(this.editor.value);
  }

  acceptCurrentSuggestion() {
    const suggestions = this.getCurrentSuggestions();
    if (!suggestions.length) return false;

    const suggestion = suggestions[this.suggestionIndex];
    this.editor.set(suggestion.insert);
    this.resetSuggestionCycle();
    this.historyIndex = null;
    this.render();
    return true;
  }

  scrollTranscript(delta) {
    this.scrollOffset = Math.max(0, this.scrollOffset + delta);
    this.render();
  }

  render() {
    if (!this.running) return;

    const columns = Math.max(MIN_COLUMNS, this.output.columns || 80);
    const rows = Math.max(MIN_ROWS, this.output.rows || 24);
    this.frame += 1;

    const screen = createChatScreen({
      columns,
      rows,
      theme: this.theme,
      themeName: this.themeName,
      providerName: this.providerName,
      sessionId: this.sessionId,
      skillState: this.skillState,
      messages: this.messages,
      inputValue: this.editor.value,
      inputParts: this.editor.getParts(),
      suggestions: this.getCurrentSuggestions(),
      suggestionIndex: this.suggestionIndex,
      suggestionWindowSize: SUGGESTION_WINDOW_SIZE,
      mode: this.modes.current(),
      palette: this.palette,
      debug: this.debug,
      status: this.status,
      busy: this.busy,
      scrollOffset: this.scrollOffset,
      frame: this.frame,
    });

    this.scrollOffset = screen.scrollOffset;
    this.renderer.renderNode(screen.node, { width: columns, height: rows });
    this.output.write(ansi.reset);
  }

}

function commandInsert(command) {
  return /[<[\[]/.test(command.usage) ? `${command.name} ` : command.name;
}

function buildActionText(action, source) {
  const cleaned = source.replace(/\n\s*\[matched:[\s\S]*?\]$/m, '').trim();
  if (action === 'shorter') {
    return `Сокращённая версия:\n\n${firstSentence(cleaned)}\n\nСуть: ${summarize(cleaned, 220)}`;
  }
  if (action === 'longer') {
    return `Расширенная версия:\n\n${cleaned}\n\nДополнение: я бы отдельно проверил состояние ввода, поток ответа, список команд и сохранение сессии. Эти четыре слоя чаще всего конфликтуют в rich-terminal приложениях.`;
  }
  if (action === 'explain') {
    return `Объяснение последнего ответа:\n\n1. Основная мысль: ${summarize(cleaned, 180)}\n\n2. Почему это важно: терминальный UX быстро ломается, если состояние ввода, рендеринг и модель смешаны.\n\n3. Что проверить дальше: команды, стрелки, streaming, отмену через Esc и сохранение сессии.`;
  }
  if (action === 'apply') {
    return 'Автоматическое применение артефактов пока не подключено. В этом прототипе `/apply` только фиксирует UX-путь: когда появится реальный provider/tools layer, команда сможет искать последний применимый artifact и выполнять его через отдельный безопасный адаптер.';
  }
  return cleaned;
}

function firstSentence(text) {
  const match = text.match(/^(.{20,240}?[.!?])(?:\s|$)/s);
  return match ? match[1].trim() : summarize(text, 180);
}

function summarize(text, limit) {
  const single = text.replace(/\s+/g, ' ').trim();
  return single.length > limit ? `${single.slice(0, limit - 1)}…` : single;
}

function streamingMarker(frame) {
  const frames = ['·', '•', '●', '•'];
  return frames[frame % frames.length];
}

function statusMarker(status) {
  if (status === 'cancelled') return '×';
  if (status === 'error') return '!';
  return ' ';
}

function roleLabel(role) {
  if (role === 'user') return 'you';
  if (role === 'assistant') return 'ai';
  return role;
}

function chunkText(text) {
  const pieces = [];
  const regex = /(\s+|[^\s]+)/g;
  let match;
  while ((match = regex.exec(text)) !== null) pieces.push(match[0]);
  return pieces;
}

function delay(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new StreamCancelled());
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

function printableKey(key) {
  if (key && typeof key === 'object') {
    const flags = [key.shift && 'shift', key.ctrl && 'ctrl', key.meta && 'meta', key.cmd && 'cmd'].filter(Boolean).join('+');
    const suffix = flags ? ` (${flags})` : '';
    const sequence = String(key.sequence ?? '')
      .replace(/\x1b/g, 'ESC')
      .replace(/\r/g, 'CR')
      .replace(/\n/g, 'LF')
      .replace(/\t/g, 'TAB');
    return `${key.name}${suffix} ${sequence}`.trim();
  }

  return String(key ?? '')
    .replace(/\x1b/g, 'ESC')
    .replace(/\r/g, 'CR')
    .replace(/\n/g, 'LF')
    .replace(/\t/g, 'TAB');
}

function mod(value, length) {
  return ((value % length) + length) % length;
}
