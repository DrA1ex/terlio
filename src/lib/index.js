export { RichTerminalApp, createAppPaletteItems } from './app.js';
export { ansi, mouseReportingSequence } from './ansi/codes.js';
export { themes } from './ansi/themes.js';
export { color, stripAnsi, visibleLength, wcwidth, padEndVisible, truncateVisible } from './ansi/text.js';
export { commands, findCommand, getSuggestions, helpText, parseCommand } from './commands.js';
export { FocusManager } from './focusManager.js';
export { InputEditor, handleInputEditorKey } from './inputEditor.js';
export { parseKey, isPrintable } from './keyParser.js';
export { TerminalInputDecoder, parseInputEvent, parseInputEvents } from './inputParser.js';
export { parsePointer, isPointerEvent, hitTestPointerRegions, dispatchPointerEvent, requestsPointerReporting } from './pointer.js';
export { buildMockBlocks, buildMockReply, replyRules, selectRule, streamMockBlocks, streamMockReply, StreamCancelled } from './mockModel.js';
export { createProvider, listProviders, MockProvider, ReplayProvider } from './providers.js';
export { SessionStore, applySerializedSkillState, serializeSkillState } from './sessionStore.js';
export { createSkillState, enabledSkillNames, formatSkillList, getSkill, skills } from './skills.js';
export { appendMessageBlock, appendMessageChunk, completeMessage, createMessage, lastAssistantMessage, lastUserMessage, normalizeMessages, setMessageBlocks, trimMessages, visibleConversationMessages } from './state.js';
export { BLOCK_TYPES, appendBlockContent, blockToText, blocksToText, createBlock, ensureTextBlock, normalizeBlock, normalizeBlocks } from './blocks.js';
export { wrapText } from './wrap.js';
export { createTextSelectionState, clearTextSelection, beginTextSelection, updateTextSelection, completeTextSelection, selectedText, renderTextSelectionLines, selectionContainsPoint, normalizeSelectionRange, styleVisibleRange, osc52ClipboardSequence, copyTextToClipboard, writeClipboardText } from './textSelection.js';

export { Box, Column, Panel, PointerRegion, Row, Text, createNode, normalizeChildren } from './ui/node.js';
export { createWorkspaceApp, WorkspaceApp } from './workspaceApp.js';
export { ActionRegistry, createActionRegistry, normalizeAction, keyMatches, parseKeySpec } from './actionRegistry.js';
export { OverlayManager, OverlayHost, createOverlayManager } from './overlayHost.js';
export { createListState, updateListItems, handleListKey, getListWindow } from './listState.js';
export { createScrollState, updateScrollState, handleScrollKey, appendScrollRows } from './smartScrollState.js';
export { layout, renderNode, measureNodeHeight } from './ui/layout/index.js';
export { SplitPane, resolvePaneSizes } from './ui/layout/splitPane.js';
export { Docked } from './ui/layout/docked.js';
export { BottomOverlay } from './ui/layout/bottomOverlay.js';
export { RequireViewport } from './ui/requireViewport.js';
export { Frame, createFrame, normalizeLines, padEndVisible as padFrameLine, truncateVisibleText } from './ui/screen.js';
export { diffFrames, patchFrames } from './ui/diff.js';
export { TerminalRenderer, renderToFrame, renderToString } from './ui/renderer.js';

export {
  SelectList,
  ConfirmPrompt,
  Modal,
  Toast,
  ProgressBar,
  Spinner,
  HelpOverlay,
  Badge,
  Chip,
  SectionTabs,
  CommandBar,
  FooterStatusBar,
  Grid,
  PropertyRows,
  ChipLine,
  TextEditorView,
  renderTextEditorLines,
  renderCursorCell,
  visibleWindowLines,
  ScrollPane,
  SelectableText,
  fitInline,
} from './ui/components/index.js';
export { ModeManager } from './modeManager.js';
export {
  createCommandPaletteState,
  getCommandPaletteMatches,
  getPaletteQuery,
  handleCommandPaletteKey,
  renderCommandPalette,
  normalizePaletteItems,
} from './commandPalette.js';

export {
  ChatScreen,
  Header as ChatHeader,
  Transcript as ChatTranscript,
  SuggestionsPanel,
  PalettePanel,
  DebugPanel,
  StatusBar,
  InputBar,
  Lines,
  Clip,
  createChatScreen,
  renderTranscriptLines,
  renderMessageContentLines,
  renderBlocksLines,
  renderBlockLines,
} from './chat/components.js';
export { createCommandRegistry, normalizeCommandEntry } from './commands/registry.js';
export { parseSlashCommand, tokenizeCommand, commandRest } from './commands/parser.js';
export { getResponsiveMode, responsiveColumns, takeVisible } from './ui/responsive.js';
export { Timeline, createTimelineEvent, formatTimelineTime } from './ui/timeline.js';
export { MetricBlock, KeyValueBlock, LiveJobBlock } from './ui/liveBlocks.js';
export { createToastManager } from './toastManager.js';

export { clampScrollOffset, scrollBy, scrollLine, scrollPage, normalizeScrollMap, scrollMax, isScrollAtBottom, resolveAutoScrollOffset, resolveScrollKeyOffset } from './scrollState.js';

export {
  WorkspaceHeader,
  WorkspaceTabs,
  WorkspacePane,
  KeyHintBar,
  WorkspaceCommandBar,
  WorkspaceFooter,
  WorkspaceShell,
  resolveWorkspaceShellLayout,
  SummaryList,
  splitWorkspaceColumns,
} from './ui/workspace.js';

