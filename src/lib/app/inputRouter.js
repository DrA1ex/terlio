export function routeRichTerminalKey(app, key) {
  if (key.name === 'ctrl-c') {
    app.requestExit(130);
    return true;
  }

  if (key.name === 'ctrl-d') {
    app.requestExit(0);
    return true;
  }

  if (key.ctrl && key.name === 't') {
    app.toggleSelectionMode();
    return true;
  }

  if (key.name === 'command-palette') {
    if (app.modes.is('palette')) {
      app.modes.pop();
      app.status = 'Command palette closed.';
      app.render();
    } else app.openCommandPalette();
    return true;
  }

  if (app.modes.is('palette')) {
    app.handleCommandPaletteKey(key);
    return true;
  }

  if (key.shift && key.name === 'up') {
    app.scrollTranscript(1);
    return true;
  }

  if (key.shift && key.name === 'down') {
    app.scrollTranscript(-1);
    return true;
  }

  if (key.name === 'escape') {
    if (app.busy && app.abortController) {
      app.abortController.abort();
      app.status = 'Cancelling response…';
    } else if (app.isSuggestionMode()) {
      app.suggestionsDismissed = true;
      app.status = 'Command suggestions dismissed. Edit the input to reopen them.';
    } else if (app.scrollOffset > 0) {
      app.scrollOffset = 0;
      app.status = 'Returned to the latest response.';
    } else app.resetSuggestionCycle();
    app.render();
    return true;
  }

  if (key.name === 'enter') {
    if (key.ctrl) app.mutateInput(() => app.editor.insertLineBreak());
    else if (app.shouldAcceptSuggestionBeforeSubmit()) app.acceptCurrentSuggestion();
    else void app.submitInput();
    return true;
  }

  if (key.name === 'tab') {
    if (app.isSuggestionMode()) {
      if (key.shift) app.moveSuggestion(-1);
      else app.acceptCurrentSuggestion();
    }
    return true;
  }

  if (key.name === 'paste') {
    app.mutateInput(() => app.editor.insertPaste(key.text));
    return true;
  }

  if (key.name === 'backspace') {
    app.mutateInput(() => app.editor.backspace());
    return true;
  }

  if (key.name === 'delete') {
    app.mutateInput(() => app.editor.deleteForward());
    return true;
  }

  if (key.name === 'home' || (key.cmd && key.name === 'left')) {
    if (key.cmd) app.editor.home();
    else app.editor.lineStart();
    app.render();
    return true;
  }

  if (key.name === 'end' || (key.cmd && key.name === 'right')) {
    if (key.cmd) app.editor.end();
    else app.editor.lineEnd();
    app.render();
    return true;
  }

  if (key.name === 'kill-end') {
    app.mutateInput(() => app.editor.killToEnd());
    return true;
  }

  if (key.name === 'kill-start') {
    app.mutateInput(() => app.editor.killToStart());
    return true;
  }

  if (key.name === 'delete-word-left') {
    app.mutateInput(() => app.editor.deleteWordBack());
    return true;
  }

  if (key.name === 'redraw') {
    app.scrollOffset = 0;
    app.status = 'Screen redrawn.';
    app.renderer.reset();
    app.render();
    return true;
  }

  if (key.meta && key.name === 'left') {
    app.editor.moveWord(-1);
    app.render();
    return true;
  }

  if (key.meta && key.name === 'right') {
    app.editor.moveWord(1);
    app.render();
    return true;
  }

  if (key.name === 'up') {
    if (key.ctrl || key.meta) app.scrollTranscript(1);
    else if (app.isSuggestionMode()) app.moveSuggestion(-1);
    else if (app.editor.value.includes('\n')) { app.editor.moveVertical(-1); app.render(); }
    else app.historyUp();
    return true;
  }

  if (key.name === 'down') {
    if (key.ctrl || key.meta) app.scrollTranscript(-1);
    else if (app.isSuggestionMode()) app.moveSuggestion(1);
    else if (app.editor.value.includes('\n')) { app.editor.moveVertical(1); app.render(); }
    else app.historyDown();
    return true;
  }

  if (key.name === 'right') {
    app.editor.move(1);
    app.render();
    return true;
  }

  if (key.name === 'left') {
    app.editor.move(-1);
    app.render();
    return true;
  }

  if (key.name === 'page-up') {
    app.scrollTranscript(Math.max(3, app.transcriptHeight - 2));
    return true;
  }

  if (key.name === 'page-down') {
    app.scrollTranscript(-Math.max(3, app.transcriptHeight - 2));
    return true;
  }

  if (key.printable) {
    app.mutateInput(() => app.editor.insert(key.text));
    return true;
  }

  return false;
}

export function formatDebugKey(key) {
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
