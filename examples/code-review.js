#!/usr/bin/env node
import {
  InputEditor,
  KeyHintBar,
  Modal,
  ModeManager,
  OverlayHost,
  ScrollPane,
  SelectList,
  Text,
  WorkspacePane,
  WorkspaceShell,
  appendMessageBlock,
  color,
  createMessage,
  createToastManager,
  fitInline,
  measureNodeHeight,
  renderTextEditorLines,
  resolveAutoScrollOffset,
  resolveScrollKeyOffset,
  resolveWorkspaceShellLayout,
  scrollMax,
  truncateVisible,
  visibleLength,
  wrapText,
} from '../src/lib/index.js';
import { isDirectRun, runInteractiveDemo } from './_demoRuntime.js';
import {
  EXAMPLE_THEME,
  cycleTab,
  isShiftLineScroll,
  responsiveTabHint,
  responsiveTabs,
  wheelScrollDelta,
} from './_workspaceExampleUtils.js';
import { createInitialLiveDelay, createNextLiveDelay, LIVE_COMMENT_TEMPLATES, PULL_REQUESTS } from './code-review/data.js';

const TABS = [
  { id: 'general', label: 'General' },
  { id: 'commits', label: 'Commits' },
  { id: 'diff', label: 'Diff' },
  { id: 'comments', label: 'Comments' },
];

const TOAST_TTL = 3;

export function createCodeReviewState() {
  const pr = clonePullRequest(PULL_REQUESTS[0]);
  const modes = new ModeManager('review');
  modes.push('pr-picker');
  return {
    pullRequests: clonePullRequests(),
    selectedPrIndex: 0,
    pr,
    descriptionEditor: new InputEditor(pr.description),
    commentEditor: new InputEditor(''),
    commentMode: 'list',
    activeTab: 'general',
    selectedCommitIndex: 0,
    selectedCommentIndex: Math.max(0, pr.comments.length - 1),
    commentLineAnchors: [],
    commitLineAnchors: [],
    commentDetailScroll: 0,
    commentDetailMetrics: { totalRows: 0, visibleRows: 1 },
    modes,
    confirmSelected: 'confirm',
    messages: [],
    reviewBlocks: buildReviewBlocks(pr.title),
    paneScroll: { general: 0, commits: 0, diff: 0, comments: 0 },
    scrollMetrics: {
      general: { totalRows: 0, visibleRows: 1 },
      commits: { totalRows: 0, visibleRows: 1 },
      diff: { totalRows: 0, visibleRows: 1 },
      comments: { totalRows: 0, visibleRows: 1 },
    },
    commentsSticky: true,
    toasts: createToastManager(),
    toastTarget: null,
    liveCommentCursor: 0,
    liveCommentCountdown: createInitialLiveDelay(),
    viewport: { width: 110, height: 32 },
    status: 'Choose a pull request. Ctrl+O opens this picker again.',
  };
}

export function createCodeReviewView({ state, width = 110, height = 32 } = {}) {
  ensurePullRequest(state);
  state.viewport = { width, height };
  const visibleTabs = responsiveTabs(TABS, state.activeTab, width, { pinned: ['general'] });
  const help = KeyHintBar({
    title: ' LOCAL HELP ',
    hints: contextHelpHints(state),
    theme: EXAMPLE_THEME,
    adaptive: true,
    columns: 'auto',
    maxColumns: width >= 118 ? 3 : 2,
    minColumnWidth: width >= 118 ? 22 : 18,
    gap: width >= 100 ? 2 : 1,
  });
  const statusFooter = Text(color(EXAMPLE_THEME, 'textMuted', fitInline(`Status: ${state.status}`, Math.max(1, width))), { wrap: false });
  const focus = state.modes.current() === 'review' ? state.activeTab : state.modes.current();
  const narrow = width < 118;
  const stats = [
    { label: 'PR', value: `#${state.pr.number}` },
    { label: 'Checks', value: state.pr.checks },
    { label: 'Comments', value: state.pr.comments.length },
    ...(!narrow ? [{ label: 'Mode', value: state.modes.current() }] : []),
  ];
  const right = [
    { label: 'Risk', value: state.pr.risk },
    ...(!narrow ? [{ label: 'Review', value: state.pr.status }] : []),
  ];
  const tabHint = responsiveTabHint(
    width < 118
      ? 'Tab panes · Ctrl+O PRs · Enter action · J live · PgUp/PgDn page'
      : 'Tab panes · Ctrl+O pull requests · Enter primary action · J jump to live comment · PgUp/PgDn page',
    TABS,
    visibleTabs,
  );
  const { mainHeight } = resolveWorkspaceShellLayout({
    width,
    height,
    title: 'AI Code Review Terminal',
    subtitle: 'pull request review workspace',
    stats,
    right,
    focus: narrow ? '' : focus,
    tabs: visibleTabs,
    activeTab: state.activeTab,
    onTabSelect: (id) => {
      state.activeTab = id;
      state.status = `Focus moved to ${id}.`;
    },
    tabHint,
    activity: help,
    footer: statusFooter,
    theme: EXAMPLE_THEME,
    minMainHeight: 6,
  });

  const main = mainPaneBody(state, width, mainHeight);
  const shell = WorkspaceShell({
    title: 'AI Code Review Terminal',
    subtitle: 'pull request review workspace',
    stats,
    right,
    focus: narrow ? '' : focus,
    tabs: visibleTabs,
    activeTab: state.activeTab,
    onTabSelect: (id) => {
      state.activeTab = id;
      state.status = `Focus moved to ${id}.`;
    },
    tabHint,
    main,
    activity: help,
    footer: statusFooter,
    height,
    theme: EXAMPLE_THEME,
  });

  return OverlayHost({
    content: shell,
    manager: reviewOverlayManager(state),
    theme: EXAMPLE_THEME,
    width,
    height,
    // Keep transient overlays inside the main content area. The extra rows
    // protect the pane footer and closing border from being overwritten.
    toastBottomMargin: measureNodeHeight(help, width) + measureNodeHeight(statusFooter, width) + 2,
  });
}

export function handleCodeReviewKey({ key, state, runtime = { exit() {} } }) {
  ensurePullRequest(state);

  if (key.name === 'c' && key.ctrl || key.name === 'ctrl-c') {
    runtime.exit(0);
    return;
  }

  const mode = state.modes.current();
  // Blocking review modes own every key except the emergency quit shortcut.
  // This prevents global actions from opening a second surface behind a modal.
  if (mode === 'confirm') return handleConfirmKey(key, state);
  if (mode === 'comment-detail') return handleCommentDetailKey(key, state);

  if ((key.name === 'o' && key.ctrl) || key.name === 'ctrl-o' || key.name === 'open') {
    openPullRequestPicker(state);
    return;
  }

  if (mode === 'pr-picker') return handlePullRequestPickerKey(key, state);

  const keyName = String(key.name ?? '').toLowerCase();
  if (state.commentMode !== 'editor' && state.toastTarget && (keyName === 'j' || keyName === 'g')) {
    jumpToToastComment(state);
    return;
  }

  // The comment composer owns editing keys, including Tab. Global pane
  // navigation must not steal focus while the user is writing a review note.
  if (state.activeTab === 'comments' && state.commentMode === 'editor') {
    return handleCommentsKey({ key, state });
  }

  if (isShiftLineScroll(key)) {
    scrollPaneByKey(state, state.activeTab, key.name);
    return;
  }

  if (key.name === 'tab') {
    cycleTab(state, TABS, key.shift ? -1 : 1, { statusPrefix: 'Focus moved to' });
    return;
  }

  if (state.activeTab === 'general') return handleGeneralKey({ key, state });
  if (state.activeTab === 'commits') return handleCommitsKey({ key, state });
  if (state.activeTab === 'diff') return handleDiffKey({ key, state });
  if (state.activeTab === 'comments') return handleCommentsKey({ key, state });
}

export function submitReview(state) {
  ensurePullRequest(state);
  const assistant = createMessage({ role: 'assistant', content: '', blocks: [] });
  for (const block of buildReviewBlocks(`${state.pr.title} ${state.pr.description}`)) appendMessageBlock(assistant, block);
  state.messages.push(assistant);
  state.reviewBlocks = assistant.blocks;
  state.status = 'Mock review summary generated for the current pull request.';
  return assistant.blocks;
}

export function tickCodeReview({ state }) {
  ensurePullRequest(state);
  const hadToast = Boolean(state.toasts?.toast);
  const previousTtl = Number(state.toasts?.toast?.ttl ?? 0);
  state.toasts?.tick(1);
  const toastChanged = hadToast && (!state.toasts?.toast || Number(state.toasts.toast.ttl) !== previousTtl);
  if (state.modes.current() !== 'review' || state.commentMode === 'editor') return toastChanged;
  state.liveCommentCountdown = Math.max(0, Number(state.liveCommentCountdown ?? createInitialLiveDelay()) - 1);
  if (state.liveCommentCountdown > 0) return toastChanged;
  const comment = addIncomingReviewComment(state);
  state.liveCommentCountdown = createNextLiveDelay(state);
  return comment ?? toastChanged;
}

export function addIncomingReviewComment(state) {
  ensurePullRequest(state);
  const template = LIVE_COMMENT_TEMPLATES[mod(state.liveCommentCursor ?? 0, LIVE_COMMENT_TEMPLATES.length)];
  const commit = state.pr.commits[mod((state.liveCommentCursor ?? 0) + state.selectedCommitIndex, state.pr.commits.length)];
  const file = commit.files[mod(state.liveCommentCursor ?? 0, commit.files.length)] ?? 'general';
  const comment = {
    author: template.author,
    location: `${file}:${72 + state.pr.comments.length * 3}`,
    body: template.body,
    status: template.status,
    live: true,
  };
  const shouldFollow = state.activeTab === 'comments' && state.commentMode === 'list' && state.commentsSticky;
  state.pr.comments.push(comment);
  state.liveCommentCursor = (state.liveCommentCursor ?? 0) + 1;
  state.toastTarget = { prId: state.pr.id, commentIndex: state.pr.comments.length - 1 };
  if (shouldFollow) {
    state.selectedCommentIndex = state.pr.comments.length - 1;
    state.commentsSticky = true;
  }
  syncCurrentPullRequest(state);
  state.toasts?.show(`New review comment from ${comment.author} at ${comment.location}.`, 'info', TOAST_TTL);
  state.status = `New review comment added at ${comment.location}.`;
  return comment;
}

export function jumpToToastComment(state) {
  ensurePullRequest(state);
  const target = state.toastTarget;
  if (!target) {
    state.status = 'No live comment target to jump to.';
    return null;
  }

  if (target.prId !== state.pr.id) {
    const index = state.pullRequests.findIndex((pr) => pr.id === target.prId);
    if (index < 0) {
      state.status = 'Live comment target is no longer available.';
      state.toastTarget = null;
      return null;
    }
    openPullRequestByIndex(state, index, { preserveToast: true });
  }

  const commentIndex = Math.min(target.commentIndex, Math.max(0, state.pr.comments.length - 1));
  state.modes.reset();
  state.activeTab = 'comments';
  state.commentMode = 'list';
  state.selectedCommentIndex = commentIndex;
  state.commentsSticky = false;
  state.paneScroll.comments = Math.max(0, state.commentLineAnchors?.[commentIndex] ?? state.paneScroll.comments ?? 0);
  const comment = state.pr.comments[commentIndex] ?? null;
  if (comment) {
    state.toasts?.clear();
    state.toastTarget = null;
    state.status = `Jumped to comment from ${comment.author} at ${comment.location}.`;
  }
  return comment;
}


export function buildReviewBlocks(prompt) {
  const topic = String(prompt || 'selected pull request');
  const lower = topic.toLowerCase();
  const layoutRisk = /layout|resize|scroll|terminal|pane/.test(lower);
  const inputRisk = /key|input|editor|newline|backspace|ctrl/.test(lower);
  const warning = layoutRisk
    ? 'Check measured layout against the actual rendered height, especially when bordered help grids are visible.'
    : inputRisk
      ? 'Keep keyboard handling scoped to the active pane and cover macOS escape-sequence regressions.'
      : 'Review the changed files, comments and tests before approving.';
  return [
    { type: 'text', title: 'Review summary', content: `Review target: ${topic}\nVerdict: needs focused PR-level review before merge.` },
    { type: 'warning', title: 'Primary risk', content: warning },
    { type: 'diff', title: 'Suggested review note', content: '--- a/review.md\n+++ b/review.md\n@@\n+ Add a regression test that reproduces the behavior described in the PR comments.' },
    { type: 'command', title: 'Verification', command: 'npm test && npm run check' },
  ];
}

function mainPaneBody(state, width, height) {
  const mode = state.modes.current();
  if (mode === 'pr-picker') return pullRequestPicker(state, width, height);
  if (mode === 'confirm') return commentsPane(state, width, height, { showEditor: false });
  if (mode === 'comment-detail') return commentDetailModal(state, width, height);
  if (state.activeTab === 'commits') return commitsPane(state, width, height);
  if (state.activeTab === 'diff') return diffPane(state, width, height);
  if (state.activeTab === 'comments') return commentsPane(state, width, height);
  return generalPane(state, width, height);
}

function reviewOverlayManager(state) {
  const mode = state.modes.current();
  if (mode === 'confirm') {
    const preview = truncateVisible(state.commentEditor.value.trim().replace(/\s+/g, ' '), 88, '…');
    return {
      top: () => ({
        type: 'confirm',
        title: ' Post comment ',
        message: preview ? `Post this review comment? “${preview}”` : 'Post this review comment?',
        confirmLabel: 'Post',
        cancelLabel: 'Cancel',
        selected: state.confirmSelected,
      }),
      toasts: [],
    };
  }

  const current = state.toasts?.toast ?? null;
  const blocking = mode === 'comment-detail';
  if (!current || blocking) return { top: () => null, toasts: [] };

  const target = state.toastTarget?.prId === state.pr.id
    ? state.pr.comments[state.toastTarget.commentIndex] ?? null
    : null;
  if (!target) {
    return {
      top: () => null,
      toasts: [{ id: 'code-review.toast', ...current }],
    };
  }

  const location = String(target.location ?? 'general');
  const file = location.includes(':') ? location.split(':')[0] : location;
  return {
    top: () => null,
    toasts: [{
      id: 'code-review.live-comment',
      ...current,
      message: 'New review comment — Press J to jump',
      detail: `${target.author} commented on ${file} at ${target.location}`,
    }],
  };
}

function pullRequestPicker(state, width, height = undefined) {
  const selected = state.pullRequests[state.selectedPrIndex] ?? state.pullRequests[0];
  const compact = width < 100 || Number(height) < 15;
  const children = [];
  if (!compact) children.push(Text('Select a pull request to review. Ctrl+O opens this picker again from any pane.', { wrap: false }));
  children.push(SelectList({
    title: 'Pull Requests',
    items: state.pullRequests,
    selectedIndex: state.selectedPrIndex,
    windowSize: Math.max(2, Math.min(compact ? 3 : 5, state.pullRequests.length)),
    getLabel: (pr) => `#${pr.number} ${pr.title}`,
    getDescription: (pr) => compact ? '' : `${pr.status} · ${pr.checks} · ${pr.author}`,
    wrapItems: !compact,
    rowLines: compact ? 1 : 2,
    reserveItemLines: !compact,
    theme: EXAMPLE_THEME,
    pointerId: 'code-review:pr-picker',
    onSelect: (_pr, index) => {
      state.selectedPrIndex = index;
      state.status = `Selected PR ${index + 1}/${state.pullRequests.length}. Press Enter to open.`;
    },
    onWheel: (event) => {
      state.selectedPrIndex = clampIndex(state.selectedPrIndex + (event.deltaY < 0 ? -1 : 1), state.pullRequests.length);
      event.preventDefault();
    },
  }));
  if (selected && !compact) {
    const detailWidth = Math.max(20, width - 10);
    const descriptionLines = wrapText(selected.description, detailWidth, '  ');
    children.push(
      Text(''),
      Text(fitInline(`Selected: #${selected.number} ${selected.title}`, detailWidth), { wrap: false }),
      Text(fitInline(`Branch: ${selected.branch} → ${selected.base} · Checks: ${selected.checks} · Comments: ${selected.comments.length}`, detailWidth), { wrap: false }),
      ...descriptionLines.slice(0, 3).map((line) => Text(line, { wrap: false })),
      descriptionLines.length > 3 ? Text(color(EXAMPLE_THEME, 'textMuted', `  … ${descriptionLines.length - 3} more description line${descriptionLines.length - 3 === 1 ? '' : 's'}`), { wrap: false }) : null,
    );
  }
  children.push(Text(fitInline('↑/↓ select · PgUp/PgDn page · Home/End edges · Enter open · Esc close', Math.max(24, width - 8)), { wrap: false }));
  return Modal({ title: ' Open Pull Request ', children, ...(height !== undefined ? { height } : {}) });
}

function generalPane(state, width, height) {
  const bodyWidth = Math.max(18, width - 6);
  const lines = [
    `#${state.pr.number} ${state.pr.title}`,
    '',
    `Author: ${state.pr.author}`,
    `Branch: ${state.pr.branch} → ${state.pr.base}`,
    `Status: ${state.pr.status}`,
    `Checks: ${state.pr.checks}`,
    `Risk: ${state.pr.risk}`,
    '',
    'Description (read-only)',
    ...wrapText(state.pr.description, bodyWidth, '  ').map((line) => `  ${line}`),
    '',
    `Commits (${state.pr.commits.length})`,
    ...state.pr.commits.map((commit, index) => `  ${index + 1}. ${commit.sha} ${fitInline(commit.title, Math.max(12, bodyWidth - 14)).trimEnd()} · ${commit.files.length} files`),
    '',
    `Comments (${state.pr.comments.length})`,
    ...state.pr.comments.slice(0, 5).flatMap((comment, index) => [
      `  ${index + 1}. ${comment.author} @ ${comment.location} [${comment.status}]`,
      ...wrapText(comment.body, Math.max(12, bodyWidth - 4), '    ').slice(0, 2).map((line) => `    ${line}`),
    ]),
    state.pr.comments.length > 5 ? `  … ${state.pr.comments.length - 5} more` : '',
    '',
    'Review flow',
    '  Tab switches the central pane. Commits chooses a commit, Diff reads patch changes, Comments opens discussion blocks.',
  ];
  return scrollablePane({
    title: ` GENERAL #${state.pr.number} `,
    pane: 'general',
    state,
    lines,
    width,
    height,
    active: state.activeTab === 'general',
    footerLabel: '↑/↓ line · PgUp/PgDn page · read-only',
  });
}

function commitsPane(state, width, height) {
  const bodyWidth = Math.max(18, width - 6);
  const lines = [];
  const starts = [];
  state.pr.commits.forEach((commit, index) => {
    starts[index] = lines.length;
    const selected = index === state.selectedCommitIndex;
    const token = selected ? 'selected' : 'text';
    const titleRows = wrapText(`${selected ? '›' : ' '} ${commit.sha} ${commit.title}`, bodyWidth, '  ');
    lines.push(...titleRows.map((row) => color(EXAMPLE_THEME, token, row)));
    lines.push(`    by ${commit.author} · ${commit.files.length} changed file${commit.files.length === 1 ? '' : 's'}`);
    for (const file of commit.files) lines.push(`    • ${fitInline(file, bodyWidth - 6).trimEnd()}`);
    if (index < state.pr.commits.length - 1) lines.push('');
  });
  state.commitLineAnchors = starts;
  const visibleRows = Math.max(1, Number(height) - 3);
  state.paneScroll.commits = ensureSelectedCommentVisible({
    scroll: state.paneScroll.commits ?? 0,
    visibleRows,
    starts,
    selectedIndex: state.selectedCommitIndex,
    totalRows: lines.length,
  });
  return scrollablePane({
    title: ` COMMITS ${state.selectedCommitIndex + 1}/${state.pr.commits.length} `,
    pane: 'commits',
    state,
    lines,
    width,
    height,
    active: state.activeTab === 'commits',
    footerLabel: '↑/↓ select · PgUp/PgDn page · Enter diff',
  });
}

function diffPane(state, width, height) {
  const commit = selectedCommit(state);
  const bodyWidth = Math.max(18, width - 6);
  const lines = [
    `${commit.sha} ${commit.title}`,
    ...wrapText(`Files: ${commit.files.join(', ')}`, bodyWidth, ''),
    '',
    ...commit.diff.map((line) => highlightPatchLine(line)),
  ];
  return scrollablePane({
    title: ` DIFF ${commit.sha} `,
    pane: 'diff',
    state,
    lines,
    width,
    height,
    active: state.activeTab === 'diff',
    footerLabel: '↑/↓ line · PgUp/PgDn page · [ and ] switch commit',
  });
}

function commentsPane(state, width, height, { showEditor = state.commentMode === 'editor' } = {}) {
  const bodyWidth = Math.max(18, width - 4);
  clampSelectedComment(state);
  const { lines, starts } = commentThreadLayout(state, bodyWidth, { showEditor });
  state.commentLineAnchors = starts;
  const visibleRows = Math.max(1, Number(height) - 3);
  const max = scrollMax(lines.length, visibleRows);
  let scroll = state.paneScroll.comments ?? 0;

  if (state.commentsSticky) {
    const previousTotalRows = state.scrollMetrics.comments?.totalRows ?? lines.length;
    scroll = resolveAutoScrollOffset({
      scroll,
      totalRows: lines.length,
      previousTotalRows,
      visibleRows,
      sticky: true,
    });
  } else if (!showEditor || state.commentMode === 'list') {
    scroll = Math.max(0, Math.min(scroll, max));
    scroll = ensureSelectedCommentVisible({
      scroll,
      visibleRows,
      starts,
      selectedIndex: state.selectedCommentIndex,
      totalRows: lines.length,
    });
  }

  state.paneScroll.comments = scroll;
  state.scrollMetrics.comments = { totalRows: lines.length, visibleRows };
  state.commentsSticky = scroll >= max;

  const modeHelp = showEditor
    ? 'Enter post · Ctrl+J newline · PgUp/PgDn thread · Esc cancel'
    : '↑/↓ select · PgUp/PgDn page · Enter read · N new · R reply';

  return WorkspacePane({
    title: ` COMMENTS ${state.pr.comments.length}${showEditor ? ' · writing' : ''} `,
    active: state.activeTab === 'comments',
    height,
    pointerId: 'code-review:comments',
    onClick: () => { state.activeTab = 'comments'; },
    onWheel: (event) => {
      scrollPaneByDelta(state, 'comments', wheelScrollDelta(event));
      event.preventDefault();
    },
    footer: `${modeHelp} · ${state.paneScroll.comments}/${max}`,
    children: [
      ScrollPane({
        title: '',
        lines,
        width: Math.max(10, width - 2),
        height: visibleRows,
        scroll: state.paneScroll.comments,
        footer: false,
        border: false,
      }),
    ],
  });
}

function commentThreadLayout(state, width, { showEditor = state.commentMode === 'editor' } = {}) {
  const safeWidth = Math.max(16, Number(width) || 16);
  const lines = [];
  const starts = [];
  if (!state.pr.comments.length) {
    lines.push('No comments yet. Press N to write the first review comment.');
  }
  state.pr.comments.forEach((comment, index) => {
    starts[index] = lines.length;
    const selected = index === state.selectedCommentIndex;
    const title = `${selected ? '› ' : ''}${comment.author} @ ${comment.location} [${comment.status}]`;
    const borderToken = selected ? 'selected' : 'borderMuted';
    lines.push(color(EXAMPLE_THEME, borderToken, threadTop(title, safeWidth)));
    const body = wrapText(comment.body, Math.max(8, safeWidth - 4), '');
    for (const row of body) lines.push(threadBody(row, safeWidth));
    lines.push(color(EXAMPLE_THEME, borderToken, threadBottom(selected ? 'Enter read' : '', safeWidth)));
    if (index < state.pr.comments.length - 1) lines.push('');
  });
  if (showEditor) {
    if (lines.length) lines.push('');
    lines.push(color(EXAMPLE_THEME, 'selected', threadTop('New review comment', safeWidth)));
    const editorLines = renderTextEditorLines({
      value: state.commentEditor.value,
      cursor: state.commentEditor.cursor,
      width: Math.max(8, safeWidth - 4),
      height: Math.max(3, Math.min(6, 3 + state.commentEditor.value.split('\n').length)),
      placeholder: 'Write a comment. Enter posts, Ctrl+J adds a new line.',
      lineNumbers: false,
    });
    for (const line of editorLines) lines.push(threadBody(line, safeWidth));
    lines.push(color(EXAMPLE_THEME, 'selected', threadBottom('Enter review', safeWidth)));
  }
  return { lines, starts };
}

function threadTop(label, width) {
  const safeWidth = Math.max(8, Number(width) || 8);
  const safeLabel = truncateVisible(String(label ?? ''), Math.max(1, safeWidth - 6));
  const prefix = `┌─ ${safeLabel} `;
  return `${prefix}${'─'.repeat(Math.max(0, safeWidth - visibleLength(prefix) - 1))}┐`;
}

function threadBody(value, width) {
  const safeWidth = Math.max(8, Number(width) || 8);
  const contentWidth = Math.max(1, safeWidth - 4);
  const content = truncateVisible(String(value ?? ''), contentWidth, '…');
  return `│ ${content}${' '.repeat(Math.max(0, contentWidth - visibleLength(content)))} │`;
}

function threadBottom(label, width) {
  const safeWidth = Math.max(8, Number(width) || 8);
  const suffix = label ? ` ${truncateVisible(label, Math.max(1, safeWidth - 5))} ┘` : '┘';
  return `└${'─'.repeat(Math.max(0, safeWidth - visibleLength(suffix) - 1))}${suffix}`;
}

function ensureSelectedCommentVisible({ scroll, visibleRows, starts, selectedIndex, totalRows }) {
  if (!starts.length) return scroll;
  const selectedTop = starts[selectedIndex] ?? 0;
  const nextStart = starts[selectedIndex + 1] ?? totalRows;
  const selectedBottom = Math.max(selectedTop, nextStart - 2);
  if (selectedTop < scroll) return selectedTop;
  if (selectedBottom >= scroll + visibleRows) return Math.max(0, selectedBottom - visibleRows + 1);
  return scroll;
}

function commentDetailModal(state, width, height) {
  const comment = selectedComment(state);
  if (!comment) {
    return WorkspacePane({
      title: ' COMMENT ',
      active: true,
      height,
      footer: 'Esc back to Comments',
      children: [Text('No comments to read.')],
    });
  }

  const bodyWidth = Math.max(20, width - 10);
  const lines = [
    `Author: ${comment.author}`,
    `Location: ${comment.location}`,
    `Status: ${comment.status}`,
    '',
    'Body',
    ...wrapText(comment.body, bodyWidth, '  '),
    '',
    `PR: #${state.pr.number} ${state.pr.title}`,
  ];
  const visibleRows = Math.max(1, Number(height) - 3);
  const max = scrollMax(lines.length, visibleRows);
  state.commentDetailScroll = Math.max(0, Math.min(state.commentDetailScroll ?? 0, max));
  state.commentDetailMetrics = { totalRows: lines.length, visibleRows };

  return WorkspacePane({
    title: ` READ COMMENT ${state.selectedCommentIndex + 1}/${state.pr.comments.length} `,
    active: true,
    height,
    pointerId: 'code-review:comment-detail',
    onWheel: (event) => {
      scrollCommentDetailByDelta(state, wheelScrollDelta(event));
      event.preventDefault();
    },
    footer: `↑/↓ line · PgUp/PgDn page · Home/End edges · Enter/Esc back · ${state.commentDetailScroll}/${max}`,
    children: [
      ScrollPane({
        title: '',
        lines,
        width: Math.max(10, width - 2),
        height: visibleRows,
        scroll: state.commentDetailScroll,
        border: false,
        footer: false,
      }),
    ],
  });
}

function scrollablePane({ title, pane, state, lines, width, height, active, footerLabel }) {
  const visibleRows = Math.max(1, Number(height) - 3);
  const metrics = state.scrollMetrics[pane] ?? { totalRows: 0, visibleRows };
  const result = resolveScrollKeyOffset({
    keyName: 'noop',
    scroll: state.paneScroll[pane] ?? 0,
    totalRows: lines.length,
    visibleRows,
    previousTotalRows: metrics.totalRows,
  });
  state.paneScroll[pane] = result.scroll;
  state.scrollMetrics[pane] = { totalRows: lines.length, visibleRows };
  return WorkspacePane({
    title,
    active,
    height,
    pointerId: `code-review:${pane}`,
    onClick: () => { state.activeTab = pane; },
    onWheel: (event) => {
      scrollPaneByDelta(state, pane, wheelScrollDelta(event));
      event.preventDefault();
    },
    footer: `${footerLabel} · ${state.paneScroll[pane] ?? 0}/${result.maxScroll}`,
    children: [
      ScrollPane({
        title: '',
        lines,
        width: Math.max(10, width - 2),
        height: visibleRows,
        scroll: state.paneScroll[pane] ?? 0,
        footer: false,
        border: false,
      }),
    ],
  });
}

function handlePullRequestPickerKey(key, state) {
  if (key.name === 'up') {
    state.selectedPrIndex = clampIndex(state.selectedPrIndex - 1, state.pullRequests.length);
    state.status = `Selected PR #${state.pullRequests[state.selectedPrIndex].number}.`;
    return;
  }
  if (key.name === 'down') {
    state.selectedPrIndex = clampIndex(state.selectedPrIndex + 1, state.pullRequests.length);
    state.status = `Selected PR #${state.pullRequests[state.selectedPrIndex].number}.`;
    return;
  }
  if (key.name === 'page-up') {
    state.selectedPrIndex = clampIndex(state.selectedPrIndex - 3, state.pullRequests.length);
    state.status = `Selected PR #${state.pullRequests[state.selectedPrIndex].number}.`;
    return;
  }
  if (key.name === 'page-down') {
    state.selectedPrIndex = clampIndex(state.selectedPrIndex + 3, state.pullRequests.length);
    state.status = `Selected PR #${state.pullRequests[state.selectedPrIndex].number}.`;
    return;
  }
  if (key.name === 'home') {
    state.selectedPrIndex = 0;
    state.status = `Selected PR #${state.pullRequests[0].number}.`;
    return;
  }
  if (key.name === 'end') {
    state.selectedPrIndex = Math.max(0, state.pullRequests.length - 1);
    state.status = `Selected PR #${state.pullRequests[state.selectedPrIndex].number}.`;
    return;
  }
  if (key.name === 'enter') {
    openSelectedPullRequest(state);
    return;
  }
  if (key.name === 'escape') {
    state.modes.pop();
    state.status = `Reviewing PR #${state.pr.number}.`;
  }
}

function handleConfirmKey(key, state) {
  if (key.name === 'escape') {
    state.modes.pop();
    state.confirmSelected = 'confirm';
    state.status = 'Comment cancelled.';
    return;
  }
  if (key.name === 'left' || key.name === 'right' || key.name === 'tab') {
    state.confirmSelected = state.confirmSelected === 'confirm' ? 'cancel' : 'confirm';
    state.status = `Confirm choice: ${state.confirmSelected}.`;
    return;
  }
  if (key.name !== 'enter') return;
  state.modes.pop();
  if (state.confirmSelected === 'cancel') {
    state.confirmSelected = 'confirm';
    state.status = 'Comment cancelled.';
    return;
  }
  postComment(state);
  state.confirmSelected = 'confirm';
}

function handleGeneralKey({ key, state }) {
  if (isScrollKey(key.name)) return scrollPaneByKey(state, 'general', key.name);
  if (key.name === 'enter') state.status = 'Description is read-only in this PR review view.';
}

function handleCommitsKey({ key, state }) {
  if (key.name === 'up') return moveCommitSelection(state, -1);
  if (key.name === 'down') return moveCommitSelection(state, 1);
  if (key.name === 'page-up') return moveAnchoredSelection(state, 'commits', -1);
  if (key.name === 'page-down') return moveAnchoredSelection(state, 'commits', 1);
  if (key.name === 'home') return setCommitSelection(state, 0);
  if (key.name === 'end') return setCommitSelection(state, state.pr.commits.length - 1);
  if (key.name === 'enter') {
    state.activeTab = 'diff';
    state.paneScroll.diff = 0;
    state.status = `Opened diff for ${selectedCommit(state).sha}.`;
    return;
  }
  if (key.name === 'escape') {
    state.activeTab = 'general';
    state.status = 'Returned to General.';
  }
}

function handleDiffKey({ key, state }) {
  if (key.name === '[') {
    setCommitSelection(state, state.selectedCommitIndex - 1);
    state.activeTab = 'diff';
    return;
  }
  if (key.name === ']') {
    setCommitSelection(state, state.selectedCommitIndex + 1);
    state.activeTab = 'diff';
    return;
  }
  if (key.name === 'escape') {
    state.activeTab = 'commits';
    state.status = 'Returned to Commits.';
    return;
  }
  if (isScrollKey(key.name)) scrollPaneByKey(state, 'diff', key.name);
}

function handleCommentsKey({ key, state }) {
  if (state.commentMode === 'editor') return handleCommentEditorKey(key, state);
  if (key.name === 'up') return moveCommentSelection(state, -1);
  if (key.name === 'down') return moveCommentSelection(state, 1);
  if (key.name === 'page-up') return moveAnchoredSelection(state, 'comments', -1);
  if (key.name === 'page-down') return moveAnchoredSelection(state, 'comments', 1);
  if (key.name === 'home') return setCommentSelection(state, 0);
  if (key.name === 'end') return setCommentSelection(state, state.pr.comments.length - 1, { sticky: true });
  if (key.name === 'enter') return openSelectedComment(state);
  if (key.name === 'n' || key.name === 'r') {
    const replyTarget = key.name === 'r' ? selectedComment(state) : null;
    state.commentMode = 'editor';
    state.commentEditor.clear();
    if (replyTarget) state.commentEditor.insert(`@${replyTarget.author} `);
    state.commentsSticky = true;
    state.status = replyTarget ? `Replying to ${replyTarget.author}.` : 'Writing a new review comment.';
    return;
  }
  if (key.name === 'escape') {
    state.activeTab = 'general';
    state.status = 'Returned to General.';
  }
}

function handleCommentDetailKey(key, state) {
  if (key.name === 'escape' || key.name === 'enter') {
    state.modes.pop();
    state.activeTab = 'comments';
    state.status = 'Returned to Comments.';
    return;
  }
  if (!isScrollKey(key.name)) return;
  const metrics = state.commentDetailMetrics ?? { totalRows: 0, visibleRows: 1 };
  const result = resolveScrollKeyOffset({
    keyName: key.name,
    scroll: state.commentDetailScroll ?? 0,
    totalRows: metrics.totalRows,
    visibleRows: metrics.visibleRows,
    pageStep: metrics.visibleRows,
    includeHomeEnd: true,
  });
  if (!result.handled) return;
  state.commentDetailScroll = result.scroll;
  state.status = result.maxScroll ? `comment scroll ${result.scroll}/${result.maxScroll}.` : 'Comment fits without scrolling.';
}

function handleCommentEditorKey(key, state) {
  if (key.name === 'escape') {
    state.commentMode = 'list';
    state.status = 'Comment draft cancelled.';
    return;
  }
  if (key.name === 'page-up' || key.name === 'page-down') return scrollPaneByKey(state, 'comments', key.name);
  if (isShiftLineScroll(key)) return scrollPaneByKey(state, 'comments', key.name);
  if (key.name === 'tab') {
    if (!key.shift) state.commentEditor.insert('  ');
    state.commentsSticky = true;
    state.status = key.shift ? 'Shift+Tab is reserved; use Backspace to outdent.' : 'Inserted comment indentation.';
    return;
  }
  if (key.name === 'enter' && !key.ctrl) {
    if (!state.commentEditor.value.trim()) {
      state.status = 'Empty comment ignored.';
      return;
    }
    state.modes.push('confirm');
    state.status = 'Confirm posting the comment.';
    return;
  }
  if ((key.name === 'enter' && key.ctrl) || key.name === 'ctrl-j') {
    state.commentEditor.insertLineBreak();
    state.commentsSticky = true;
    state.status = 'Inserted a new line in the comment.';
    return;
  }
  editInput(state.commentEditor, key, state, 'comment');
  state.commentsSticky = true;
}

function scrollPaneByKey(state, pane, keyName) {
  const metrics = state.scrollMetrics[pane] ?? { totalRows: 0, visibleRows: 1 };
  const result = resolveScrollKeyOffset({
    keyName,
    scroll: state.paneScroll[pane] ?? 0,
    totalRows: metrics.totalRows,
    visibleRows: metrics.visibleRows,
    pageStep: metrics.visibleRows,
    includeHomeEnd: true,
  });
  if (!result.handled) return;
  state.paneScroll[pane] = result.scroll;
  if (pane === 'comments') state.commentsSticky = result.atBottom;
  state.status = result.maxScroll ? `${pane} scroll ${result.scroll}/${result.maxScroll}.` : `${pane} fits without scrolling.`;
}

function scrollPaneByDelta(state, pane, delta) {
  const steps = Math.max(1, Math.abs(delta));
  const keyName = delta < 0 ? 'up' : 'down';
  for (let index = 0; index < steps; index += 1) scrollPaneByKey(state, pane, keyName);
}

function scrollCommentDetailByDelta(state, delta) {
  const metrics = state.commentDetailMetrics ?? { totalRows: 0, visibleRows: 1 };
  const max = scrollMax(metrics.totalRows, metrics.visibleRows);
  state.commentDetailScroll = Math.max(0, Math.min(max, (state.commentDetailScroll ?? 0) + delta));
  state.status = max ? `comment scroll ${state.commentDetailScroll}/${max}.` : 'Comment fits without scrolling.';
}

function openPullRequestPicker(state) {
  if (state.modes.current() !== 'pr-picker') state.modes.push('pr-picker');
  state.status = 'Choose a pull request.';
}

function openSelectedPullRequest(state) {
  return openPullRequestByIndex(state, state.selectedPrIndex);
}

function openPullRequestByIndex(state, index, options = {}) {
  const next = state.pullRequests[index];
  if (!next) return null;
  state.selectedPrIndex = index;
  state.pr = clonePullRequest(next);
  state.descriptionEditor = new InputEditor(state.pr.description);
  state.commentEditor.clear();
  state.commentMode = 'list';
  state.selectedCommitIndex = 0;
  state.selectedCommentIndex = Math.max(0, state.pr.comments.length - 1);
  state.commentLineAnchors = [];
  state.commitLineAnchors = [];
  state.paneScroll = { general: 0, commits: 0, diff: 0, comments: 0 };
  state.scrollMetrics = {
    general: { totalRows: 0, visibleRows: 1 },
    commits: { totalRows: 0, visibleRows: 1 },
    diff: { totalRows: 0, visibleRows: 1 },
    comments: { totalRows: 0, visibleRows: 1 },
  };
  state.commentsSticky = true;
  state.reviewBlocks = buildReviewBlocks(`${state.pr.title} ${state.pr.description}`);
  state.activeTab = 'general';
  state.modes.reset();
  if (!options.preserveToast) {
    state.toastTarget = null;
    state.toasts?.show(`Opened PR #${state.pr.number}. Live comments will appear while you review.`, 'success', TOAST_TTL);
  }
  state.status = `Opened PR #${state.pr.number}.`;
  return state.pr;
}

function postComment(state) {
  const body = state.commentEditor.value.trim();
  if (!body) {
    state.status = 'Empty comment ignored.';
    return;
  }
  const target = selectedCommit(state);
  const comment = {
    author: 'you',
    location: `${target.files[0] ?? 'general'}:${Math.max(1, 40 + state.pr.comments.length)}`,
    body,
    status: 'open',
  };
  state.pr.comments.push(comment);
  state.selectedCommentIndex = state.pr.comments.length - 1;
  state.commentEditor.clear();
  state.commentMode = 'list';
  state.commentsSticky = true;
  syncCurrentPullRequest(state);
  state.toasts?.show(`Posted comment on ${comment.location}.`, 'success', TOAST_TTL);
  state.status = `Posted comment on ${comment.location}.`;
}

function syncCurrentPullRequest(state) {
  const index = state.pullRequests.findIndex((pr) => pr.id === state.pr.id);
  if (index >= 0) state.pullRequests[index] = clonePullRequest(state.pr);
}


function selectedComment(state) {
  clampSelectedComment(state);
  return state.pr.comments[state.selectedCommentIndex] ?? null;
}

function moveCommentSelection(state, delta) {
  const count = state.pr.comments.length;
  const next = clampIndex(state.selectedCommentIndex + delta, count);
  const keepPinned = delta > 0 && next === count - 1 && next === state.selectedCommentIndex;
  setCommentSelection(state, next, { sticky: keepPinned });
}

function setCommentSelection(state, index, { sticky = false } = {}) {
  if (!state.pr.comments.length) {
    state.selectedCommentIndex = 0;
    state.status = 'No comments to select.';
    return;
  }
  state.selectedCommentIndex = clampIndex(index, state.pr.comments.length);
  state.commentsSticky = Boolean(sticky);
  if (state.commentsSticky) {
    const metrics = state.scrollMetrics.comments ?? { totalRows: 0, visibleRows: 1 };
    state.paneScroll.comments = scrollMax(metrics.totalRows, metrics.visibleRows);
  }
  const selected = selectedComment(state);
  state.status = `Selected comment from ${selected.author} at ${selected.location}.`;
}

function openSelectedComment(state) {
  const comment = selectedComment(state);
  if (!comment) {
    state.status = 'No comments to read.';
    return;
  }
  if (state.modes.current() !== 'comment-detail') state.modes.push('comment-detail');
  state.commentDetailScroll = 0;
  state.status = `Reading comment from ${comment.author}.`;
}

function clampSelectedComment(state) {
  const count = state.pr?.comments?.length ?? 0;
  if (!count) {
    state.selectedCommentIndex = 0;
    return;
  }
  state.selectedCommentIndex = clampIndex(state.selectedCommentIndex ?? 0, count);
}

function selectedCommit(state) {
  return state.pr.commits[clampIndex(state.selectedCommitIndex, state.pr.commits.length)] ?? state.pr.commits[0];
}

function moveCommitSelection(state, delta) {
  setCommitSelection(state, state.selectedCommitIndex + delta);
}

function setCommitSelection(state, index) {
  state.selectedCommitIndex = clampIndex(index, state.pr.commits.length);
  state.paneScroll.diff = 0;
  state.status = `Selected commit ${selectedCommit(state).sha}.`;
}

function moveAnchoredSelection(state, pane, direction) {
  const isComments = pane === 'comments';
  const anchors = isComments ? state.commentLineAnchors : state.commitLineAnchors;
  const count = isComments ? state.pr.comments.length : state.pr.commits.length;
  if (!count) return;
  const selectedIndex = isComments ? state.selectedCommentIndex : state.selectedCommitIndex;
  const metrics = state.scrollMetrics[pane] ?? { visibleRows: 1 };
  const pageRows = Math.max(1, Number(metrics.visibleRows) || 1);
  const currentLine = anchors?.[selectedIndex] ?? 0;
  const targetLine = currentLine + (direction < 0 ? -pageRows : pageRows);
  let targetIndex = clampIndex(selectedIndex + (direction < 0 ? -3 : 3), count);

  if (Array.isArray(anchors) && anchors.length) {
    if (direction < 0) {
      for (let index = selectedIndex - 1; index >= 0; index -= 1) {
        targetIndex = index;
        if ((anchors[index] ?? 0) <= targetLine) break;
      }
    } else {
      for (let index = selectedIndex + 1; index < count; index += 1) {
        targetIndex = index;
        if ((anchors[index] ?? 0) >= targetLine) break;
      }
    }
  }

  if (isComments) {
    const keepPinned = direction > 0 && targetIndex === count - 1 && targetIndex === selectedIndex;
    setCommentSelection(state, targetIndex, { sticky: keepPinned });
  } else setCommitSelection(state, targetIndex);
}

function contextHelpHints(state) {
  if (state.modes.current() === 'pr-picker') {
    return [['↑/↓', 'select PR'], ['PgUp/PgDn', 'page'], ['Home/End', 'edges'], ['Enter', 'open'], ['Esc', 'close'], ['Ctrl+C', 'exit']];
  }
  if (state.modes.current() === 'confirm') {
    return [['Tab/←/→', 'post/cancel'], ['Enter', 'accept'], ['Esc', 'back'], ['Ctrl+C', 'exit']];
  }
  if (state.modes.current() === 'comment-detail') {
    return [['↑/↓', 'line'], ['PgUp/PgDn', 'page'], ['Home/End', 'edges'], ['Enter/Esc', 'back'], ['Ctrl+C', 'exit']];
  }
  if (state.activeTab === 'general') {
    return [['Shift+↑/↓', 'line'], ['PgUp/PgDn', 'page'], ['Home/End', 'edges'], ['Enter', 'read-only'], ['Ctrl+O', 'PRs'], ['Tab', 'pane']];
  }
  if (state.activeTab === 'commits') {
    return [['↑/↓', 'commit'], ['PgUp/PgDn', 'page'], ['Home/End', 'edges'], ['Enter', 'diff'], ['Ctrl+O', 'PRs'], ['Tab', 'pane']];
  }
  if (state.activeTab === 'diff') {
    return [['Shift+↑/↓', 'line'], ['PgUp/PgDn', 'page'], ['Home/End', 'edges'], ['[/]', 'commit'], ['Esc', 'commits'], ['Tab', 'pane']];
  }
  if (state.commentMode === 'editor') {
    return [['Enter', 'review post'], ['Ctrl+J', 'newline'], ['Tab', 'indent'], ['PgUp/PgDn', 'thread'], ['Esc', 'draft'], ['Ctrl+O', 'PRs']];
  }
  return [['↑/↓', 'comment'], ['PgUp/PgDn', 'page'], ['Home/End', 'edges'], ['Enter', 'read'], ['N', 'new'], ['R', 'reply']];
}

function editInput(editor, key, state, label) {
  if (key.name === 'up') {
    editor.moveVertical(-1);
    state.status = `Moved inside ${label}.`;
    return;
  }
  if (key.name === 'down') {
    editor.moveVertical(1);
    state.status = `Moved inside ${label}.`;
    return;
  }
  if (key.name === 'left') {
    key.meta ? editor.moveWord(-1) : editor.move(-1);
    state.status = `Moved ${label} cursor.`;
    return;
  }
  if (key.name === 'right') {
    key.meta ? editor.moveWord(1) : editor.move(1);
    state.status = `Moved ${label} cursor.`;
    return;
  }
  if (key.name === 'home' || (key.cmd && key.name === 'left')) {
    editor.lineStart();
    state.status = `Moved to ${label} line start.`;
    return;
  }
  if (key.name === 'end' || (key.cmd && key.name === 'right')) {
    editor.lineEnd();
    state.status = `Moved to ${label} line end.`;
    return;
  }
  if (key.name === 'backspace') {
    editor.backspace();
    state.status = `Edited ${label}.`;
    return;
  }
  if (key.name === 'delete') {
    editor.deleteForward();
    state.status = `Edited ${label}.`;
    return;
  }
  if (key.name === 'kill-end') {
    editor.killToEnd();
    state.status = `Edited ${label}.`;
    return;
  }
  if (key.name === 'kill-start') {
    editor.killToStart();
    state.status = `Edited ${label}.`;
    return;
  }
  if (key.name === 'delete-word-left') {
    editor.deleteWordBack();
    state.status = `Edited ${label}.`;
    return;
  }
  if (key.name === 'paste') {
    editor.insert(key.text);
    state.status = `Pasted into ${label}.`;
    return;
  }
  if (key.printable) {
    editor.insert(key.text);
    state.status = `Editing ${label}.`;
  }
}

function highlightPatchLine(line) {
  const value = String(line ?? '');
  if (value.startsWith('+') && !value.startsWith('+++')) return color(EXAMPLE_THEME, 'ok', value);
  if (value.startsWith('-') && !value.startsWith('---')) return color(EXAMPLE_THEME, 'error', value);
  if (value.startsWith('@@')) return color(EXAMPLE_THEME, 'accent', value);
  if (value.startsWith('diff --git')) return color(EXAMPLE_THEME, 'muted', value);
  return value;
}

function isScrollKey(name) {
  return name === 'up' || name === 'down' || name === 'page-up' || name === 'page-down' || name === 'home' || name === 'end';
}

function ensurePullRequest(state) {
  state.pullRequests = state.pullRequests?.length ? state.pullRequests : clonePullRequests();
  if (!state.pr) state.pr = clonePullRequest(state.pullRequests[state.selectedPrIndex || 0] ?? PULL_REQUESTS[0]);
  state.descriptionEditor = state.descriptionEditor ?? new InputEditor(state.pr.description);
  state.commentEditor = state.commentEditor ?? new InputEditor('');
  state.selectedCommentIndex = state.selectedCommentIndex ?? Math.max(0, state.pr.comments.length - 1);
  state.commentLineAnchors = state.commentLineAnchors ?? [];
  state.commitLineAnchors = state.commitLineAnchors ?? [];
  state.commentDetailScroll = state.commentDetailScroll ?? 0;
  state.commentDetailMetrics = state.commentDetailMetrics ?? { totalRows: 0, visibleRows: 1 };
  state.commentMode = state.commentMode ?? 'list';
  state.toasts = state.toasts ?? createToastManager();
  state.toastTarget = state.toastTarget ?? null;
  state.liveCommentCursor = state.liveCommentCursor ?? 0;
  state.liveCommentCountdown = state.liveCommentCountdown ?? createInitialLiveDelay();
  state.paneScroll = state.paneScroll ?? { general: 0, commits: 0, diff: 0, comments: 0 };
  state.scrollMetrics = state.scrollMetrics ?? {
    general: { totalRows: 0, visibleRows: 1 },
    commits: { totalRows: 0, visibleRows: 1 },
    diff: { totalRows: 0, visibleRows: 1 },
    comments: { totalRows: 0, visibleRows: 1 },
  };
  state.viewport = state.viewport ?? { width: 110, height: 32 };
}

function clonePullRequests() {
  return PULL_REQUESTS.map(clonePullRequest);
}

function clonePullRequest(pr) {
  return {
    ...pr,
    commits: pr.commits.map((commit) => ({ ...commit, files: [...commit.files], diff: [...commit.diff] })),
    comments: pr.comments.map((comment) => ({ ...comment })),
  };
}

function mod(value, size) {
  const safeSize = Math.max(1, Number(size) || 1);
  return ((value % safeSize) + safeSize) % safeSize;
}

function clampIndex(value, length) {
  const max = Math.max(0, Number(length) - 1);
  const safe = Number.isFinite(Number(value)) ? Number(value) : 0;
  return Math.max(0, Math.min(max, safe));
}

if (isDirectRun(import.meta.url)) {
  runInteractiveDemo({
    title: 'AI Code Review Terminal',
    state: createCodeReviewState(),
    render: createCodeReviewView,
    onKey: handleCodeReviewKey,
    onTick: tickCodeReview,
    tickMs: 1000,
  });
}
