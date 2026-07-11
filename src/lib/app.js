import { ansi } from './ansi/codes.js';
import { themes } from './ansi/themes.js';
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
import { createOverlayManager } from './overlayHost.js';

const SUGGESTION_WINDOW_SIZE = 7;

export function createAppPaletteItems() {
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

    this.themeName = 'ocean';
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
    this.status = 'Ready. Type / for commands or Ctrl+P for the palette.';
    this.suggestionIndex = 0;
    this.suggestionsDismissed = false;
    this.scrollOffset = 0;
    this.transcriptHeight = 6;
    this.transcriptTotalRows = 0;
    this.lastViewportWidth = null;
    this.frame = 0;
    this.debug = { enabled: false, events: [] };
    this.focus = new FocusManager(['input', 'suggestions', 'transcript', 'debug']);
    this.modes = new ModeManager('input');
    this.palette = createCommandPaletteState({ items: createAppPaletteItems(this), windowSize: 7 });
    this.overlays = createOverlayManager();
    this.tickTimer = null;
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

    this.tickTimer = setInterval(() => {
      if (this.overlays.tick(0.25)) this.render();
    }, 250);
    this.tickTimer.unref?.();
    this.render();
  }

  stop() {
    if (!this.running) return;
    this.running = false;

    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }

    if (this.tickTimer) {
      clearInterval(this.tickTimer);
      this.tickTimer = null;
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
    this.themeName = themes[name] ? name : 'ocean';
    this.theme = themes[this.themeName];
  }

  setProvider(name) {
    this.provider = createProvider(name);
    this.providerName = this.provider.name;
  }

  notify(message, level = 'info', detail = '') {
    this.overlays.toast(message, level, 3, detail);
    this.render();
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
    if (this.sessionTitle === 'Untitled session') {
      const title = String(content ?? '').replace(/\s+/g, ' ').trim();
      if (title) this.sessionTitle = title.slice(0, 64);
    }
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
    this.suggestionsDismissed = false;
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
      this.status = `Unknown command: ${name}.`;
      this.notify(`Unknown command: ${name}`, 'error', 'Type / to browse available commands.');
      return;
    }

    try {
      await command.run(this, args);
    } catch (error) {
      this.status = `Command failed: ${error.message}`;
      this.notify('Command failed', 'error', error.message);
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
      this.status = 'Nothing to retry.';
      this.notify('Nothing to retry', 'warning', 'Send a message first.');
      return;
    }
    await this.respond(lastUser.content);
  }

  async runAssistantAction(action) {
    if (this.busy) return;
    const lastAssistant = lastAssistantMessage(this.messages);
    if (!lastAssistant || !lastAssistant.content.trim()) {
      this.status = 'No assistant response is available.';
      this.notify('No assistant response', 'warning', 'Run a prompt before using this action.');
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
    this.status = 'New session created.';
    this.notify('New session', 'success', shortSessionLabel(this.sessionId));
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
    this.status = `Session loaded: ${snapshot.title}.`;
    this.notify('Session loaded', 'success', snapshot.title);
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
      if (this.busy && this.abortController) {
        this.abortController.abort();
        this.status = 'Cancelling response…';
      } else if (this.isSuggestionMode()) {
        this.suggestionsDismissed = true;
        this.status = 'Command suggestions dismissed. Edit the input to reopen them.';
      } else if (this.scrollOffset > 0) {
        this.scrollOffset = 0;
        this.status = 'Returned to the latest response.';
      } else {
        this.resetSuggestionCycle();
      }
      this.render();
      return;
    }

    if (key.name === 'enter') {
      if (key.ctrl) {
        this.mutateInput(() => this.editor.insertLineBreak());
      } else if (this.shouldAcceptSuggestionBeforeSubmit()) this.acceptCurrentSuggestion();
      else this.submitInput();
      return;
    }

    if (key.name === 'tab') {
      if (this.isSuggestionMode()) {
        if (key.shift) this.moveSuggestion(-1);
        else this.acceptCurrentSuggestion();
      }
      return;
    }

    if (key.name === 'paste') {
      this.mutateInput(() => {
        if (typeof this.editor.insertPaste === 'function') this.editor.insertPaste(key.text);
        else this.editor.insert(key.text);
      });
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
      if (key.cmd) this.editor.home();
      else this.editor.lineStart();
      this.render();
      return;
    }

    if (key.name === 'end' || (key.cmd && key.name === 'right')) {
      if (key.cmd) this.editor.end();
      else this.editor.lineEnd();
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
      if (key.ctrl || key.meta) this.scrollTranscript(1);
      else if (this.isSuggestionMode()) this.moveSuggestion(-1);
      else if (this.editor.value.includes('\n')) { this.editor.moveVertical(-1); this.render(); }
      else this.historyUp();
      return;
    }

    if (key.name === 'down') {
      if (key.ctrl || key.meta) this.scrollTranscript(-1);
      else if (this.isSuggestionMode()) this.moveSuggestion(1);
      else if (this.editor.value.includes('\n')) { this.editor.moveVertical(1); this.render(); }
      else this.historyDown();
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
      this.scrollTranscript(Math.max(3, this.transcriptHeight - 2));
      return;
    }

    if (key.name === 'page-down') {
      this.scrollTranscript(-Math.max(3, this.transcriptHeight - 2));
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
      this.overlays.toast(`Inserted ${result.item.id}`, 'success', 3, 'Edit arguments or press Enter to run.');
      this.render();
      return;
    }

    this.render();
  }

  mutateInput(fn) {
    fn();
    this.suggestionsDismissed = false;
    this.historyIndex = null;
    this.resetSuggestionCycle();
    this.render();
  }

  historyUp() {
    if (this.history.length === 0) return;
    if (this.historyIndex === null) this.historyIndex = this.history.length - 1;
    else this.historyIndex = Math.max(0, this.historyIndex - 1);
    this.editor.set(this.history[this.historyIndex] ?? '');
    this.suggestionsDismissed = false;
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
    this.suggestionsDismissed = false;
    this.resetSuggestionCycle();
    this.render();
  }

  resetSuggestionCycle() {
    this.suggestionIndex = 0;
  }

  isSuggestionMode() {
    return !this.busy && !this.suggestionsDismissed && this.editor.value.trimStart().startsWith('/');
  }

  getCurrentSuggestions() {
    if (!this.isSuggestionMode()) return [];
    const suggestions = getSuggestions(this.editor.value, this);
    if (suggestions.length === 0) return [];
    this.suggestionIndex = mod(this.suggestionIndex, suggestions.length);
    return suggestions;
  }

  moveSuggestion(delta) {
    if (!this.isSuggestionMode()) return false;
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
    if (!this.isSuggestionMode()) return false;
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
    this.suggestionsDismissed = false;
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

    const columns = Math.max(1, this.output.columns || 80);
    const rows = Math.max(1, this.output.rows || 24);
    this.frame += 1;

    const buildScreen = (scrollOffset = this.scrollOffset) => createChatScreen({
      columns,
      rows,
      theme: this.theme,
      themeName: this.themeName,
      providerName: this.providerName,
      sessionId: this.sessionId,
      sessionTitle: this.sessionTitle,
      skillState: this.skillState,
      messages: this.messages,
      inputValue: this.editor.value,
      inputCursor: this.editor.cursor,
      inputParts: this.editor.getParts(),
      suggestions: this.getCurrentSuggestions(),
      suggestionsVisible: this.isSuggestionMode(),
      suggestionIndex: this.suggestionIndex,
      suggestionWindowSize: SUGGESTION_WINDOW_SIZE,
      mode: this.modes.current(),
      palette: this.palette,
      overlays: this.overlays,
      debug: this.debug,
      status: this.status,
      busy: this.busy,
      scrollOffset,
      frame: this.frame,
    });

    let screen = buildScreen();
    const sameWidth = this.lastViewportWidth === columns;
    const grew = sameWidth && screen.transcriptTotalRows > this.transcriptTotalRows;
    if (grew && this.scrollOffset > 0) {
      this.scrollOffset += screen.transcriptTotalRows - this.transcriptTotalRows;
      screen = buildScreen(this.scrollOffset);
    }

    this.scrollOffset = screen.scrollOffset;
    this.transcriptHeight = Math.max(1, screen.transcriptHeight || this.transcriptHeight);
    this.transcriptTotalRows = screen.transcriptTotalRows;
    this.lastViewportWidth = columns;
    this.renderer.renderNode(screen.node, { width: columns, height: rows });
    this.output.write(ansi.reset);
  }

}

function shortSessionLabel(id) {
  const raw = String(id ?? 'session');
  const parts = raw.split('_');
  return parts.length > 1 ? `${parts[0].slice(-8)}-${parts.at(-1).slice(-5)}` : raw.slice(-14);
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

function buildActionText(action, source) {
  const cleaned = source.replace(/\n\s*\[matched:[\s\S]*?\]$/m, '').trim();
  if (action === 'shorter') {
    return `Shortened version:\n\n${firstSentence(cleaned)}\n\nSummary: ${summarize(cleaned, 220)}`;
  }
  if (action === 'longer') {
    return `Expanded version:\n\n${cleaned}\n\nAdditional note: I would separately verify input state, response streaming, command list behavior, and session persistence. These four layers are the most common conflict points in rich terminal applications.`;
  }
  if (action === 'explain') {
    return `Explanation of the last response:\n\n1. Main idea: ${summarize(cleaned, 180)}\n\n2. Why it matters: terminal UX breaks quickly when input state, rendering, and model logic are mixed.\n\n3. What to check next: commands, arrow keys, streaming, cancellation with Esc, and session saving.`;
  }
  if (action === 'apply') {
    return 'Automatic artifact application is not connected yet. In this prototype, `/apply` only records the UX path: once a real provider/tools layer exists, the command can find the last applicable artifact and execute it through a separate safe adapter.';
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
