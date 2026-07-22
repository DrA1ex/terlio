import { ansi, mouseReportingSequence } from './ansi/codes.js';
import { themes } from './ansi/themes.js';
import { findCommand, getSuggestions, parseCommand } from './commands.js';
import { InputEditor } from './inputEditor.js';
import { TerminalInputDecoder } from './inputParser.js';
import { FocusManager } from './focusManager.js';
import { ModeManager } from './modeManager.js';
import { createCommandPaletteState, handleCommandPaletteKey } from './commandPalette.js';
import { TerminalRenderer } from './ui/renderer.js';
import { createProvider } from './providers.js';
import { SessionStore, applySerializedSkillState, serializeSkillState } from './sessionStore.js';
import { createSkillState, enabledSkillNames } from './skills.js';
import { appendMessageBlock, appendMessageChunk, completeMessage, createMessage, lastAssistantMessage, lastUserMessage, trimMessages } from './state.js';
import { createChatScreen } from './chat/components.js';
import { createOverlayManager } from './overlayHost.js';
import { createAppPaletteItems } from './app/palette.js';
import { buildAssistantActionText, errorMessage, isStreamCancellation, streamTextChunks } from './app/assistantActions.js';
import { formatDebugKey, routeRichTerminalKey } from './app/inputRouter.js';
import { requestsPointerReporting } from './pointer.js';
import { clearTextSelection, copyTextToClipboard, createTextSelectionState } from './textSelection.js';

const SUGGESTION_WINDOW_SIZE = 7;

export { createAppPaletteItems };

export class RichTerminalApp {
  constructor({ input = process.stdin, output = process.stdout, onExit = null, onPointer = null, pointer = 'auto', animationMs = 80, syntaxHighlight = false, sessionStore = new SessionStore() } = {}) {
    this.input = input;
    this.output = output;
    this.onExit = onExit;
    this.onPointer = typeof onPointer === 'function' ? onPointer : null;
    this.pointerOptions = normalizePointerOptions(pointer);
    this.pointerOverride = null;
    this.pointerActive = false;
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
    this.transcriptSelection = createTextSelectionState();
    this.transcriptHeight = 6;
    this.transcriptTotalRows = 0;
    this.lastViewportWidth = null;
    this.frame = 0;
    this.animationFrame = 0;
    this.animationMs = Math.max(0, Number(animationMs) || 0);
    this.syntaxHighlight = Boolean(syntaxHighlight);
    this.debug = { enabled: false, events: [] };
    this.focus = new FocusManager(['input', 'suggestions', 'transcript', 'debug']);
    this.modes = new ModeManager('input');
    this.palette = createCommandPaletteState({ items: createAppPaletteItems(this), windowSize: 7 });
    this.overlays = createOverlayManager();
    this.tickTimer = null;
    this.animationTimer = null;
    this.renderBatchDepth = 0;
    this.renderPending = false;
    this.renderer = new TerminalRenderer({ output: this.output });
    this.inputDecoder = new TerminalInputDecoder();

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

  get selectionMode() {
    return this.pointerOverride === false;
  }

  createDefaultSkillState() {
    return createSkillState();
  }

  start() {
    if (this.running) return this;
    if (!this.input.isTTY || !this.output.isTTY) {
      throw new Error('This app requires an interactive TTY. Run it directly in a terminal.');
    }

    this.running = true;
    this.renderer.reset();
    this.output.write(ansi.altScreen + ansi.hideCursor + ansi.autoWrapOff + ansi.clear + ansi.home);
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
    return this;
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
    if (this.animationTimer) {
      clearTimeout(this.animationTimer);
      this.animationTimer = null;
    }

    this.input.off('data', this.boundOnData);
    this.output.off('resize', this.boundOnResize);

    this.setPointerActive(false);
    if (this.input.isTTY) this.input.setRawMode(false);
    this.input.pause();
    this.inputDecoder.reset();

    this.renderer.reset();
    this.output.write(ansi.autoWrapOn + ansi.showCursor + ansi.normalScreen + ansi.reset);
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
    clearTextSelection(this.transcriptSelection);
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
    clearTextSelection(this.transcriptSelection);
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
      const message = errorMessage(error);
      this.status = `Command failed: ${message}`;
      this.notify('Command failed', 'error', message);
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
          clearTextSelection(this.transcriptSelection);
          this.render();
        },
        onBlock: (block) => {
          appendMessageBlock(assistant, block);
          clearTextSelection(this.transcriptSelection);
          this.render();
        },
      });
      completeMessage(assistant, 'complete');
      this.status = 'Ready.';
    } catch (error) {
      const cancelled = isStreamCancellation(error, this.abortController?.signal);
      completeMessage(assistant, cancelled ? 'cancelled' : 'error');
      if (cancelled) {
        appendMessageChunk(assistant, '\n\n[response cancelled]');
        this.status = 'Stream cancelled.';
      } else {
        const message = errorMessage(error);
        appendMessageChunk(assistant, `\n\n[error: ${message}]`);
        this.status = 'Streaming failed.';
        this.notify('Streaming failed', 'error', message);
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

    const text = buildAssistantActionText(action, lastAssistant.content);
    this.busy = true;
    this.status = `Action ${action} is streaming. Press Esc to cancel.`;
    this.abortController = new AbortController();
    const assistant = this.addAssistantMessage('', true);

    try {
      await this.streamPlainText(text, assistant, this.abortController.signal);
      completeMessage(assistant, 'complete');
      this.status = 'Ready.';
    } catch (error) {
      const cancelled = isStreamCancellation(error, this.abortController?.signal);
      completeMessage(assistant, cancelled ? 'cancelled' : 'error');
      const message = errorMessage(error);
      appendMessageChunk(assistant, cancelled ? '\n\n[action cancelled]' : `\n\n[action failed: ${message}]`);
      this.status = cancelled ? 'Action cancelled.' : 'Action failed.';
      if (!cancelled) this.notify('Action failed', 'error', message);
    } finally {
      this.busy = false;
      this.abortController = null;
      this.render();
    }
  }

  async streamPlainText(text, message, signal) {
    await streamTextChunks(text, {
      signal,
      onChunk: (chunk) => {
        appendMessageChunk(message, chunk);
        clearTextSelection(this.transcriptSelection);
        this.render();
      },
    });
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
    clearTextSelection(this.transcriptSelection);
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
    clearTextSelection(this.transcriptSelection);
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
    if (!this.debug.enabled && (type === 'key' || type === 'pointer')) return;
    this.debug.events.push({ at: new Date().toISOString(), type, detail: String(detail ?? '') });
    if (this.debug.events.length > 80) this.debug.events = this.debug.events.slice(-80);
  }

  onData(data) {
    this.renderBatchDepth += 1;
    try {
      for (const event of this.inputDecoder.write(data)) {
        if (event?.type === 'pointer') {
          this.handlePointer(event);
          continue;
        }
        this.logDebug('key', formatDebugKey(event));
        routeRichTerminalKey(this, event);
      }
    } finally {
      this.renderBatchDepth = Math.max(0, this.renderBatchDepth - 1);
      if (this.renderBatchDepth === 0 && this.renderPending) this.render();
    }
  }

  handlePointer(pointer) {
    this.logDebug('pointer', `${pointer.name} @ ${pointer.x},${pointer.y}`);
    const routed = this.renderer.dispatchPointer(pointer, { app: this, runtime: this });
    const event = routed.event;
    if (!event.propagationStopped && this.onPointer) {
      const result = this.onPointer({ pointer: event, app: this, runtime: this });
      if (result !== false) event.handled = true;
    }
    if (event.handled) this.render();
    return event;
  }

  togglePointerOverride() {
    const automatic = this.resolveAutomaticPointerEnabled();
    this.pointerOverride = this.pointerOverride === null ? !automatic : null;
    this.syncPointerMode();
    this.status = this.pointerOverride === null
      ? 'Smart pointer mode restored.'
      : this.pointerOverride
        ? 'Pointer mode forced. Wheel, trackpad, and clicks are active; press Ctrl+T to restore smart mode.'
        : 'Native text selection forced. Drag to select text; press Ctrl+T to restore smart mode.';
    this.render();
    return this.pointerOverride;
  }

  toggleSelectionMode(enabled = !this.selectionMode) {
    this.pointerOverride = Boolean(enabled) ? false : null;
    this.syncPointerMode();
    this.status = this.pointerOverride === false
      ? 'Native text selection forced. Drag to select text; press Ctrl+T to restore smart mode.'
      : 'Smart pointer mode restored.';
    this.render();
    return this.selectionMode;
  }

  setPointerEnabled(value) {
    const requested = value === 'auto' ? 'auto' : Boolean(value);
    this.pointerOptions.enabled = requested;
    this.syncPointerMode();
    return requested;
  }

  resolveAutomaticPointerEnabled() {
    return this.pointerOptions.enabled === true || (
      this.pointerOptions.enabled === 'auto'
      && (Boolean(this.onPointer) || requestsPointerReporting(this.renderer.pointerRegions))
    );
  }

  syncPointerMode() {
    if (!this.running) return false;
    const automatic = this.resolveAutomaticPointerEnabled();
    const enabled = this.pointerOverride === null ? automatic : this.pointerOverride;
    this.setPointerActive(enabled);
    return enabled;
  }

  setPointerActive(enabled) {
    const next = Boolean(enabled);
    if (next === this.pointerActive) return false;
    this.pointerActive = next;
    this.output.write(mouseReportingSequence(next, this.pointerOptions));
    return true;
  }

  openCommandPalette() {
    if (this.busy) return;
    this.palette = createCommandPaletteState({ items: createAppPaletteItems(this), windowSize: 7 });
    this.modes.push('palette');
    this.status = 'Command palette opened. Type to filter, Enter runs the selected action, Esc closes.';
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
      if (result.item.value?.action === 'copy-selection') {
        this.modes.pop();
        this.copyTranscriptSelection();
        this.render();
        return;
      }

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

  acceptCurrentSuggestion({ dismiss = false, render = true } = {}) {
    const suggestions = this.getCurrentSuggestions();
    if (!suggestions.length) return false;

    const suggestion = suggestions[this.suggestionIndex];
    this.editor.set(suggestion.insert);
    this.suggestionsDismissed = Boolean(dismiss);
    this.resetSuggestionCycle();
    this.historyIndex = null;
    if (render) this.render();
    return true;
  }

  scrollTranscript(delta) {
    this.scrollOffset = Math.max(0, this.scrollOffset + delta);
    this.render();
  }

  copyTranscriptSelection(text = this.transcriptSelection?.text) {
    const value = String(text ?? '');
    if (!value) return false;
    const result = copyTextToClipboard(value, { output: this.output });
    if (result.copied) clearTextSelection(this.transcriptSelection);
    this.status = result.copied
      ? `Copied ${Array.from(value).length} selected character${Array.from(value).length === 1 ? '' : 's'} from the transcript${result.method && result.method !== 'osc52' ? ` via ${result.method}` : ''}.`
      : 'Text selected. Clipboard transfer is unavailable in this terminal.';
    return result.copied;
  }

  render() {
    if (!this.running) return;
    if (this.renderBatchDepth > 0) {
      this.renderPending = true;
      return;
    }
    this.renderPending = false;

    const columns = Math.max(1, this.output.columns || 80);
    const rows = Math.max(1, this.output.rows || 24);
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
      selectionMode: this.selectionMode,
      pointerActive: this.pointerActive,
      pointerOverride: this.pointerOverride,
      scrollOffset,
      transcriptSelection: this.transcriptSelection,
      frame: this.animationFrame,
      syntaxHighlight: this.syntaxHighlight,
      onTranscriptWheel: (event) => {
        this.scrollOffset = Math.max(0, this.scrollOffset - event.deltaY);
        event.preventDefault();
      },
      onTranscriptCopy: (text, _selection, event) => {
        const copied = this.copyTranscriptSelection(text);
        event?.preventDefault?.();
        event?.stopPropagation?.();
        return copied;
      },
      onSuggestionSelect: (_suggestion, index) => {
        this.suggestionIndex = index;
        this.acceptCurrentSuggestion({ dismiss: true, render: false });
      },
      onSuggestionWheel: (event) => {
        if (!event.deltaY) return;
        this.moveSuggestion(event.deltaY < 0 ? -1 : 1);
        event.preventDefault();
      },
      onSuggestionDismiss: () => {
        this.suggestionsDismissed = true;
        this.status = 'Command suggestions dismissed. Edit the input to show them again.';
      },
      onPaletteSelect: (_item, index) => {
        this.palette.selectedIndex = index;
        this.handleCommandPaletteKey({ name: 'enter' });
      },
      onPaletteWheel: (event) => {
        if (!event.deltaY) return;
        this.handleCommandPaletteKey({ name: event.deltaY < 0 ? 'up' : 'down' });
        event.preventDefault();
      },
      onPaletteDismiss: () => {
        if (this.modes.is('palette')) this.modes.pop();
        this.status = 'Command palette closed.';
      },
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
    const previousPointerActive = this.pointerActive;
    this.syncPointerMode();
    if (this.pointerActive !== previousPointerActive) {
      const refreshed = buildScreen(this.scrollOffset);
      this.renderer.renderNode(refreshed.node, { width: columns, height: rows });
      this.output.write(ansi.reset);
    }
    this.syncAnimationTimer(this.messages.some((message) => message?.status === 'streaming'));
  }

  syncAnimationTimer(active = false) {
    const shouldRun = this.running && this.animationMs > 0 && Boolean(active);
    if (!shouldRun) {
      if (this.animationTimer) clearTimeout(this.animationTimer);
      this.animationTimer = null;
      return false;
    }
    if (this.animationTimer) return true;
    this.animationTimer = setTimeout(() => {
      this.animationTimer = null;
      if (!this.running) return;
      this.animationFrame = (this.animationFrame + 1) % Number.MAX_SAFE_INTEGER;
      this.frame = this.animationFrame;
      this.render();
    }, this.animationMs);
    this.animationTimer.unref?.();
    return true;
  }

}

function normalizePointerOptions(pointer) {
  if (pointer && typeof pointer === 'object') {
    const requested = pointer.enabled ?? 'auto';
    return {
      enabled: requested === 'auto' ? 'auto' : Boolean(requested),
      drag: pointer.drag !== false,
      motion: Boolean(pointer.motion),
    };
  }
  return {
    enabled: pointer === undefined || pointer === 'auto' ? 'auto' : Boolean(pointer),
    drag: true,
    motion: false,
  };
}

function shortSessionLabel(id) {
  const raw = String(id ?? 'session');
  const parts = raw.split('_');
  return parts.length > 1 ? `${parts[0].slice(-8)}-${parts.at(-1).slice(-5)}` : raw.slice(-14);
}

function mod(value, length) {
  return ((value % length) + length) % length;
}
