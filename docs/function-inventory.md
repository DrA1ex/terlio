# Function inventory after library refactor

This inventory was generated before and after the refactor to make sure functions were not dropped while files were split into smaller modules.

- Pre-refactor function/class/arrow count: **249**
- Post-refactor function/class/arrow count: **249**
- Missing function names after refactor: **none**
- Added function names after refactor: **none**
- Removed legacy entry files: `src/lib/ansi.js`, `src/lib/ui/components.js`, `src/lib/ui/layout.js`. Internal imports now target the split modules directly.

## Moved functions
- `Badge`: `src/lib/ui/components.js` → `src/lib/ui/components/display.js`
- `ChipLine`: `src/lib/ui/components.js` → `src/lib/ui/components/display.js`
- `CommandBar`: `src/lib/ui/components.js` → `src/lib/ui/components/display.js`
- `ConfirmPrompt`: `src/lib/ui/components.js` → `src/lib/ui/components/feedback.js`
- `FooterStatusBar`: `src/lib/ui/components.js` → `src/lib/ui/components/display.js`
- `Grid`: `src/lib/ui/components.js` → `src/lib/ui/components/display.js`
- `HelpOverlay`: `src/lib/ui/components.js` → `src/lib/ui/components/feedback.js`
- `Modal`: `src/lib/ui/components.js` → `src/lib/ui/components/feedback.js`
- `ProgressBar`: `src/lib/ui/components.js` → `src/lib/ui/components/feedback.js`
- `PropertyRows`: `src/lib/ui/components.js` → `src/lib/ui/components/display.js`
- `ScrollPane`: `src/lib/ui/components.js` → `src/lib/ui/components/editor.js`
- `SectionTabs`: `src/lib/ui/components.js` → `src/lib/ui/components/display.js`
- `SelectList`: `src/lib/ui/components.js` → `src/lib/ui/components/select.js`
- `Spinner`: `src/lib/ui/components.js` → `src/lib/ui/components/feedback.js`
- `TextEditorView`: `src/lib/ui/components.js` → `src/lib/ui/components/editor.js`
- `Toast`: `src/lib/ui/components.js` → `src/lib/ui/components/feedback.js`
- `ansi256ToRgb`: `src/lib/ui/components.js` → `src/lib/ui/components/feedback.js`
- `ansiToRgb`: `src/lib/ui/components.js` → `src/lib/ui/components/feedback.js`
- `appendActual`: `src/lib/ui/layout.js` → `src/lib/ui/layout/shadowOverlay.js`
- `appendShadow`: `src/lib/ui/layout.js` → `src/lib/ui/layout/shadowOverlay.js`
- `appendSpacesTo`: `src/lib/ui/layout.js` → `src/lib/ui/layout/shadowOverlay.js`
- `applyFixedHeight`: `src/lib/ui/layout.js` → `src/lib/ui/layout/utils.js`
- `borderChar`: `src/lib/ui/layout.js` → `src/lib/ui/layout/grid.js`
- `childForRow`: `src/lib/ui/layout.js` → `src/lib/ui/layout/row.js`
- `clamp`: `src/lib/commandPalette.js`, `src/lib/inputEditor.js`, `src/lib/ui/components.js`, `src/lib/ui/responsive.js` → `src/lib/commandPalette.js`, `src/lib/inputEditor.js`, `src/lib/ui/components/utils.js`, `src/lib/ui/responsive.js`
- `color`: `src/lib/ansi.js` → `src/lib/ansi/text.js`
- `composeShadowOverlayLine`: `src/lib/ui/layout.js` → `src/lib/ui/layout/shadowOverlay.js`
- `darkerAnsiColor`: `src/lib/ui/components.js` → `src/lib/ui/components/feedback.js`
- `defaultDescription`: `src/lib/ui/components.js` → `src/lib/ui/components/select.js`
- `defaultDisabled`: `src/lib/ui/components.js` → `src/lib/ui/components/select.js`
- `defaultGridItem`: `src/lib/ui/components.js` → `src/lib/ui/components/display.js`
- `defaultLabel`: `src/lib/ui/components.js` → `src/lib/ui/components/select.js`
- `distribute`: `src/lib/ui/layout.js` → `src/lib/ui/layout/utils.js`
- `fit`: `src/lib/ui/layout.js` → `src/lib/ui/layout/utils.js`
- `fitInline`: `src/lib/ui/components.js` → `src/lib/ui/components/display.js`
- `fitTitle`: `src/lib/ui/layout.js` → `src/lib/ui/layout/utils.js`
- `formatSelectRow`: `src/lib/ui/components.js` → `src/lib/ui/components/select.js`
- `hasAnsi`: `src/lib/ansi.js` → `src/lib/ansi/text.js`
- `layout`: `src/lib/ui/layout.js` → `src/lib/ui/layout/index.js`
- `line`: `src/lib/ui/layout.js` → `src/lib/ui/layout/grid.js`
- `measureNodeHeight`: `src/lib/ui/layout.js` → `src/lib/ui/layout/index.js`
- `mod`: `src/lib/app.js`, `src/lib/chat/components.js`, `src/lib/focusManager.js`, `src/lib/ui/components.js` → `src/lib/app.js`, `src/lib/chat/components.js`, `src/lib/focusManager.js`, `src/lib/ui/components/utils.js`
- `normalizeItem`: `src/lib/ui/components.js` → `src/lib/ui/components/select.js`
- `normalizeRenderableChildren`: `src/lib/ui/components.js` → `src/lib/ui/components/feedback.js`
- `normalizeRowWidths`: `src/lib/ui/layout.js` → `src/lib/ui/layout/row.js`
- `normalizeSpacing`: `src/lib/ui/layout.js` → `src/lib/ui/layout/utils.js`
- `padEndVisible`: `src/lib/ansi.js`, `src/lib/ui/screen.js` → `src/lib/ansi/text.js`, `src/lib/ui/screen.js`
- `renderBorderedGrid`: `src/lib/ui/layout.js` → `src/lib/ui/layout/grid.js`
- `renderBox`: `src/lib/ui/layout.js` → `src/lib/ui/layout/box.js`
- `renderColumn`: `src/lib/ui/layout.js` → `src/lib/ui/layout/column.js`
- `renderFixedHeightColumn`: `src/lib/ui/layout.js` → `src/lib/ui/layout/column.js`
- `renderGrid`: `src/lib/ui/layout.js` → `src/lib/ui/layout/grid.js`
- `renderNode`: `src/lib/ui/layout.js` → `src/lib/ui/layout/index.js`
- `renderRow`: `src/lib/ui/layout.js` → `src/lib/ui/layout/row.js`
- `renderShadowOverlay`: `src/lib/ui/layout.js` → `src/lib/ui/layout/shadowOverlay.js`
- `renderText`: `src/lib/ui/layout.js` → `src/lib/ui/layout/text.js`
- `renderTextEditorLines`: `src/lib/ui/components.js` → `src/lib/ui/components/editor.js`
- `resolveToastWidth`: `src/lib/ui/components.js` → `src/lib/ui/components/feedback.js`
- `splitLogicalLines`: `src/lib/ui/components.js` → `src/lib/ui/components/editor.js`
- `stitchRows`: `src/lib/ui/layout.js` → `src/lib/ui/layout/row.js`
- `stripAnsi`: `src/lib/ansi.js` → `src/lib/ansi/text.js`
- `takeVisibleAnsi`: `src/lib/ansi.js` → `src/lib/ansi/text.js`
- `toastStyle`: `src/lib/ui/components.js` → `src/lib/ui/components/feedback.js`
- `truncateVisible`: `src/lib/ansi.js` → `src/lib/ansi/text.js`
- `visibleLength`: `src/lib/ansi.js` → `src/lib/ansi/text.js`
- `visibleWindowLines`: `src/lib/ui/components.js` → `src/lib/ui/components/editor.js`
- `withHeight`: `src/lib/ui/layout.js` → `src/lib/ui/layout/utils.js`
- `wrapEditorLine`: `src/lib/ui/components.js` → `src/lib/ui/components/editor.js`
- `wrapPlain`: `src/lib/ui/layout.js` → `src/lib/ui/layout/utils.js`

## Current function list
### `src/lib/ansi/text.js`
- `export function color`
- `export function stripAnsi`
- `export function visibleLength`
- `export function padEndVisible`
- `export function truncateVisible`
- `export function takeVisibleAnsi`
- `function hasAnsi`

### `src/lib/app.js`
- `export function createAppPaletteItems`
- `export class RichTerminalApp`
- `function commandInsert`
- `function buildActionText`
- `function firstSentence`
- `function summarize`
- `function streamingMarker`
- `function statusMarker`
- `function roleLabel`
- `function chunkText`
- `function delay`
- `function onAbort`
- `function printableKey`
- `function mod`

### `src/lib/blocks.js`
- `export function createBlock`
- `export function normalizeBlock`
- `export function normalizeBlocks`
- `export function appendBlockContent`
- `export function blockToText`
- `export function blocksToText`
- `export function ensureTextBlock`
- `function blockView`

### `src/lib/chat/components.js`
- `export function createChatScreen`
- `export function ChatScreen`
- `export function Header`
- `export function Transcript`
- `export function renderTranscriptLines`
- `export function renderMessageContentLines`
- `export function renderBlocksLines`
- `export function renderBlockLines`
- `function renderCodeBlock`
- `function renderDiffBlock`
- `function diffLineToken`
- `function renderCommandBlock`
- `function renderWarningBlock`
- `function renderToolResultBlock`
- `export function SuggestionsPanel`
- `export function PalettePanel`
- `export function DebugPanel`
- `export function StatusBar`
- `export function InputBar`
- `export function Lines`
- `export function Clip`
- `function componentHeight`
- `function streamingMarker`
- `function statusMarker`
- `function roleLabel`
- `function mod`
- `export function resetAnsiLine`

### `src/lib/commandPalette.js`
- `export function createCommandPaletteState`
- `export function getCommandPaletteMatches`
- `export function getPaletteQuery`
- `export function handleCommandPaletteKey`
- `export function renderCommandPalette`
- `export function normalizePaletteItems`
- `function ensureEditor`
- `function edit`
- `function moveSelection`
- `function setSelection`
- `function clampSelection`
- `function clamp`

### `src/lib/commands.js`
- `export function parseCommand`
- `export function findCommand`
- `export function getSuggestions`
- `export function helpText`
- `function sessionActionDescription`

### `src/lib/commands/parser.js`
- `export function parseSlashCommand`
- `export function tokenizeCommand`
- `export function commandRest`

### `src/lib/commands/registry.js`
- `export function createCommandRegistry`
- `export function normalizeCommandEntry`
- `function matchesEntry`

### `src/lib/focusManager.js`
- `export class FocusManager`
- `function mod`

### `src/lib/inputEditor.js`
- `export class InputEditor`
- `export function isPrintable`
- `function splitLinesWithOffsets`
- `function charLength`
- `function clamp`

### `src/lib/keyParser.js`
- `export function parseKey`
- `export function isPrintable`
- `function keyFromCsiU`
- `function key`
- `function modifierFlags`

### `src/lib/mockModel.js`
- `function delay`
- `function onAbort`
- `export class StreamCancelled`
- `export function streamMockReply`
- `export function streamMockBlocks`
- `export function buildMockReply`
- `export function buildMockBlocks`
- `export function selectRule`
- `function pick`
- `function chunkText`
- `function nextDelay`

### `src/lib/modeManager.js`
- `export class ModeManager`
- `function normalizeMode`

### `src/lib/providers.js`
- `export class MockProvider`
- `export class ReplayProvider`
- `export function createProvider`
- `export function listProviders`
- `function lastUserPrompt`

### `src/lib/scrollState.js`
- `export function clampScrollOffset`
- `export function scrollBy`
- `export function scrollLine`
- `export function scrollPage`
- `export function normalizeScrollMap`
- `export function scrollMax`
- `export function isScrollAtBottom`
- `export function resolveAutoScrollOffset`
- `export function resolveScrollKeyOffset`

### `src/lib/sessionStore.js`
- `export class SessionStore`
- `export function serializeSkillState`
- `export function applySerializedSkillState`
- `function defaultRootDir`
- `function sanitizeId`
- `function inferTitle`

### `src/lib/skills.js`
- `export function createSkillState`
- `export function getSkill`
- `export function enabledSkillNames`
- `export function formatSkillList`

### `src/lib/state.js`
- `export function createMessage`
- `export function appendMessageChunk`
- `export function appendMessageBlock`
- `export function setMessageBlocks`
- `export function completeMessage`
- `export function trimMessages`
- `export function normalizeMessages`
- `export function visibleConversationMessages`
- `export function lastUserMessage`
- `export function lastAssistantMessage`
- `function syncMessageCounter`

### `src/lib/toastManager.js`
- `export function createToastManager`

### `src/lib/ui/components/display.js`
- `export function fitInline`
- `export function Badge`
- `export function SectionTabs`
- `export function CommandBar`
- `export function FooterStatusBar`
- `export function Grid`
- `export function PropertyRows`
- `export function ChipLine`
- `function defaultGridItem`

### `src/lib/ui/components/editor.js`
- `export function renderTextEditorLines`
- `export function TextEditorView`
- `export function visibleWindowLines`
- `export function ScrollPane`
- `function splitLogicalLines`
- `function wrapEditorLine`

### `src/lib/ui/components/feedback.js`
- `export function ConfirmPrompt`
- `export function Modal`
- `export function Toast`
- `export function ProgressBar`
- `export function Spinner`
- `export function HelpOverlay`
- `function toastStyle`
- `function resolveToastWidth`
- `function darkerAnsiColor`
- `function ansiToRgb`
- `function ansi256ToRgb`
- `function normalizeRenderableChildren`

### `src/lib/ui/components/select.js`
- `export function SelectList`
- `function normalizeItem`
- `function defaultLabel`
- `function defaultDescription`
- `function defaultDisabled`
- `function formatSelectRow`

### `src/lib/ui/components/utils.js`
- `export function clamp`
- `export function mod`

### `src/lib/ui/diff.js`
- `export function diffFrames`
- `export function patchFrames`
- `export function makeFrame`

### `src/lib/ui/layout/box.js`
- `export function renderBox`

### `src/lib/ui/layout/column.js`
- `export function renderColumn`
- `function renderFixedHeightColumn`

### `src/lib/ui/layout/grid.js`
- `export function renderGrid`
- `function renderBorderedGrid`
- `arrow line`
- `arrow borderChar`

### `src/lib/ui/layout/index.js`
- `export function layout`
- `export function measureNodeHeight`
- `export function renderNode`

### `src/lib/ui/layout/row.js`
- `export function renderRow`
- `arrow childForRow`
- `function normalizeRowWidths`
- `function stitchRows`

### `src/lib/ui/layout/shadowOverlay.js`
- `export function renderShadowOverlay`
- `function composeShadowOverlayLine`
- `arrow appendSpacesTo`
- `arrow appendShadow`
- `arrow appendActual`

### `src/lib/ui/layout/text.js`
- `export function renderText`

### `src/lib/ui/layout/utils.js`
- `export function applyFixedHeight`
- `export function distribute`
- `export function fit`
- `export function fitTitle`
- `export function normalizeSpacing`
- `export function withHeight`
- `export function wrapPlain`

### `src/lib/ui/liveBlocks.js`
- `export function MetricBlock`
- `export function KeyValueBlock`
- `export function LiveJobBlock`

### `src/lib/ui/node.js`
- `export function createNode`
- `export function Text`
- `export function Box`
- `export function Row`
- `export function Column`
- `export function Panel`
- `export function normalizeChildren`
- `function isProps`

### `src/lib/ui/renderer.js`
- `export function renderToFrame`
- `export function renderToString`
- `export class TerminalRenderer`

### `src/lib/ui/responsive.js`
- `export function getResponsiveMode`
- `export function responsiveColumns`
- `export function takeVisible`
- `function clamp`

### `src/lib/ui/screen.js`
- `export class Frame`
- `export function createFrame`
- `export function normalizeLines`
- `export function truncateVisibleText`
- `export function padEndVisible`

### `src/lib/ui/timeline.js`
- `export function Timeline`
- `export function createTimelineEvent`
- `export function formatTimelineTime`
- `function defaultTimelineLine`

### `src/lib/ui/workspace.js`
- `export function WorkspaceHeader`
- `export function WorkspaceTabs`
- `export function WorkspacePane`
- `export function KeyHintBar`
- `export function WorkspaceCommandBar`
- `export function WorkspaceFooter`
- `export function resolveWorkspaceShellLayout`
- `export function WorkspaceShell`
- `function applyThemeToBorders`
- `export function splitWorkspaceColumns`
- `export function SummaryList`
- `function withGrow`
- `function formatHeaderItem`
- `function formatSummaryItem`
- `function normalizeChildren`

### `src/lib/wrap.js`
- `export function wrapText`
- `function hardWrap`
