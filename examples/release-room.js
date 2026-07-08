#!/usr/bin/env node
import {
  Box,
  Column,
  ConfirmPrompt,
  HelpOverlay,
  InputEditor,
  ModeManager,
  Panel,
  ProgressBar,
  Row,
  SelectList,
  Text,
  Toast,
} from '../src/lib/index.js';
import { isDirectRun, runInteractiveDemo } from './_demoRuntime.js';

export const RELEASE_COMMANDS = [
  { command: '/release new v0.9.0', description: 'Create a new release draft' },
  { command: '/checklist', description: 'Show release readiness checklist' },
  { command: '/migration check', description: 'Run migration compatibility checks' },
  { command: '/tests run', description: 'Run the release test suite' },
  { command: '/deploy staging', description: 'Run the staging deployment pipeline' },
  { command: '/deploy production', description: 'Request production deployment confirmation' },
  { command: '/rollback plan', description: 'Generate rollback plan' },
  { command: '/rollback execute', description: 'Execute mock rollback with confirmation' },
  { command: '/approve', description: 'Approve the active production gate' },
  { command: '/blockers', description: 'List current release blockers' },
  { command: '/changelog', description: 'Show release changelog' },
  { command: '/timeline', description: 'Append a timeline audit checkpoint' },
];

const PIPELINE_TEMPLATES = {
  staging: [
    ['Build image', 15],
    ['Run unit tests', 40],
    ['Apply staging migration', 62],
    ['Deploy staging pods', 82],
    ['Smoke check staging', 100],
  ],
  production: [
    ['Freeze deploy window', 12],
    ['Build immutable artifact', 30],
    ['Verify migration lock', 48],
    ['Roll out canary', 72],
    ['Promote production traffic', 100],
  ],
  rollback: [
    ['Lock production deploys', 20],
    ['Restore previous artifact', 48],
    ['Rollback migration marker', 76],
    ['Verify customer traffic', 100],
  ],
};

export function createReleaseRoomState() {
  return {
    input: new InputEditor('/deploy staging'),
    modes: new ModeManager('input'),
    confirmSelected: 'confirm',
    release: {
      project: 'terminal-core',
      version: 'v0.8.0',
      env: 'staging',
      owner: 'Alex',
      risk: 'medium',
      status: 'Ready for staging deploy',
      approved: false,
    },
    checklist: [
      { label: 'Changelog reviewed', done: true },
      { label: 'Migration checked', done: false },
      { label: 'Tests passed', done: false },
      { label: 'Rollback plan ready', done: false },
      { label: 'Production approval granted', done: false },
    ],
    pipeline: createPipeline('staging', 'idle'),
    timeline: [
      event('created release draft'),
      event('changelog generated'),
      event('waiting for migration check'),
    ],
    changelog: [
      'Refactor terminal renderer to component runtime.',
      'Add structured assistant blocks and block actions.',
      'Add command palette and session persistence.',
    ],
    blockers: ['Migration check has not run.', 'Production approval is missing.'],
    toast: { level: 'info', message: 'Release room ready. Use slash commands or run /deploy staging.' },
    commandLog: [],
    scheduled: [],
  };
}

export function createReleaseRoomView({ state, width = 118, height = 34 } = {}) {
  const confirm = state.modes.current() === 'confirm'
    ? ConfirmPrompt({
        title: ' Release approval ',
        message: state.modes.currentEntry().data?.message ?? 'Continue?',
        selected: state.confirmSelected,
        confirmLabel: 'Approve',
        cancelLabel: 'Cancel',
      })
    : null;

  return Column(
    releaseHeader(state),
    Row({ gap: 2, distribute: true },
      Column(
        releaseTimelinePanel(state, height),
        releaseInputPanel(state),
      ),
      Column(
        Toast(state.toast),
        releasePipelinePanel(state),
        releaseChecklistPanel(state),
      ),
    ),
    Row({ gap: 2, distribute: true },
      releaseCommandPanel(state, width),
      releaseChangelogPanel(state),
    ),
    ...(confirm ? [confirm] : []),
  );
}

export function handleReleaseRoomKey({ key, state, runtime }) {
  if (state.modes.current() === 'confirm') {
    handleReleaseConfirmKey(key, state, runtime);
    return;
  }

  if (key.name === 'up' || key.name === 'down') {
    cycleReleaseCommand(state, key.name === 'up' ? -1 : 1);
    return;
  }

  if (key.name === 'enter') {
    executeReleaseCommand(state, state.input.value, runtime);
    state.input.clear();
    return;
  }

  editInput(state.input, key);
}

export function executeReleaseCommand(state, rawCommand, runtime = null) {
  const input = String(rawCommand ?? '').trim();
  if (!input) return { ok: false, reason: 'empty' };
  state.commandLog.push(input);

  const releaseMatch = /^\/release\s+new\s+(.+)$/i.exec(input);
  if (releaseMatch) {
    state.release.version = releaseMatch[1].trim();
    state.release.status = 'Draft created';
    state.release.approved = false;
    state.checklist = state.checklist.map((item) => item.label === 'Production approval granted' ? { ...item, done: false } : item);
    state.pipeline = createPipeline('staging', 'idle');
    state.timeline.unshift(event(`created release ${state.release.version}`));
    state.toast = { level: 'success', message: `Release ${state.release.version} created.` };
    recalcBlockers(state);
    return { ok: true, action: 'release-new' };
  }

  if (/^\/checklist$/i.test(input)) {
    state.timeline.unshift(event('readiness checklist opened'));
    state.toast = { level: 'info', message: 'Checklist is visible in the right column.' };
    return { ok: true, action: 'checklist' };
  }

  if (/^\/migration\s+check$/i.test(input)) {
    markChecklist(state, 'Migration checked', true);
    state.timeline.unshift(event('migration check passed'));
    state.release.status = 'Migration verified';
    state.toast = { level: 'success', message: 'Migration compatibility check passed.' };
    recalcBlockers(state);
    return { ok: true, action: 'migration-check' };
  }

  if (/^\/tests\s+run$/i.test(input)) {
    markChecklist(state, 'Tests passed', true);
    state.timeline.unshift(event('release test suite passed'));
    state.release.status = 'Tests passed';
    state.toast = { level: 'success', message: 'Test suite completed successfully.' };
    recalcBlockers(state);
    return { ok: true, action: 'tests-run' };
  }

  if (/^\/deploy\s+staging$/i.test(input)) {
    startReleasePipeline(state, 'staging', runtime);
    return { ok: true, action: 'deploy-staging' };
  }

  if (/^\/deploy\s+production$/i.test(input)) {
    const blockers = recalcBlockers(state);
    if (blockers.length) {
      state.toast = { level: 'warning', message: `Production blocked: ${blockers[0]}` };
      state.timeline.unshift(event('production deploy blocked'));
      return { ok: false, action: 'deploy-production', reason: 'blocked' };
    }
    state.modes.push('confirm', { action: 'production-deploy', message: `Deploy ${state.release.version} to production?` });
    state.toast = { level: 'warning', message: 'Production deploy requires confirmation.' };
    return { ok: true, action: 'deploy-production-confirm' };
  }

  if (/^\/approve$/i.test(input)) {
    state.release.approved = true;
    markChecklist(state, 'Production approval granted', true);
    state.timeline.unshift(event('production gate approved'));
    state.toast = { level: 'success', message: 'Production gate approved.' };
    recalcBlockers(state);
    return { ok: true, action: 'approve' };
  }

  if (/^\/rollback\s+plan$/i.test(input)) {
    markChecklist(state, 'Rollback plan ready', true);
    state.timeline.unshift(event('rollback plan generated'));
    state.toast = { level: 'success', message: 'Rollback plan is ready.' };
    recalcBlockers(state);
    return { ok: true, action: 'rollback-plan' };
  }

  if (/^\/rollback\s+execute$/i.test(input)) {
    state.modes.push('confirm', { action: 'rollback', message: `Execute rollback for ${state.release.version}?` });
    state.toast = { level: 'warning', message: 'Rollback requires confirmation.' };
    return { ok: true, action: 'rollback-confirm' };
  }

  if (/^\/blockers$/i.test(input)) {
    const blockers = recalcBlockers(state);
    state.timeline.unshift(event(`blocker report requested: ${blockers.length} open`));
    state.toast = blockers.length
      ? { level: 'warning', message: `${blockers.length} blockers remain.` }
      : { level: 'success', message: 'No release blockers.' };
    return { ok: true, action: 'blockers' };
  }

  if (/^\/changelog$/i.test(input)) {
    state.timeline.unshift(event('changelog opened'));
    state.toast = { level: 'info', message: `${state.changelog.length} changelog entries visible.` };
    return { ok: true, action: 'changelog' };
  }

  if (/^\/timeline$/i.test(input)) {
    state.timeline.unshift(event('manual audit checkpoint added'));
    state.toast = { level: 'info', message: 'Timeline checkpoint added.' };
    return { ok: true, action: 'timeline' };
  }

  state.toast = { level: 'error', message: `Unknown command: ${input}` };
  state.timeline.unshift(event(`unknown command: ${input}`));
  return { ok: false, reason: 'unknown' };
}

export function startReleasePipeline(state, env, runtime = null) {
  clearReleaseTimers(state);
  state.release.env = env;
  state.release.status = `${env} deployment running`;
  state.pipeline = createPipeline(env, 'running');
  state.pipeline.startedAt = new Date().toISOString();
  state.toast = { level: 'info', message: `${env} pipeline started.` };
  state.timeline.unshift(event(`${env} deploy pipeline started`));

  const steps = PIPELINE_TEMPLATES[env] ?? PIPELINE_TEMPLATES.staging;
  if (!runtime) {
    for (const [name, progress] of steps) applyPipelineStep(state, env, name, progress);
    completePipeline(state, env);
    return;
  }

  steps.forEach(([name, progress], index) => {
    const timer = setTimeout(() => {
      applyPipelineStep(state, env, name, progress);
      if (index === steps.length - 1) completePipeline(state, env);
      runtime.invalidate();
    }, 450 * (index + 1));
    state.scheduled.push(timer);
  });
}

export function clearReleaseTimers(state) {
  for (const timer of state.scheduled ?? []) clearTimeout(timer);
  state.scheduled = [];
}

function handleReleaseConfirmKey(key, state, runtime) {
  if (key.name === 'escape') {
    state.modes.pop();
    state.toast = { level: 'info', message: 'Confirmation cancelled.' };
    return;
  }
  if (key.name === 'left' || key.name === 'right') {
    state.confirmSelected = state.confirmSelected === 'confirm' ? 'cancel' : 'confirm';
    return;
  }
  if (key.name !== 'enter') return;

  const entry = state.modes.currentEntry();
  state.modes.pop();
  if (state.confirmSelected !== 'confirm') {
    state.confirmSelected = 'confirm';
    state.toast = { level: 'info', message: 'Action cancelled.' };
    return;
  }

  if (entry.data?.action === 'production-deploy') startReleasePipeline(state, 'production', runtime);
  if (entry.data?.action === 'rollback') startReleasePipeline(state, 'rollback', runtime);
  state.confirmSelected = 'confirm';
}

function releaseHeader(state) {
  const { project, version, env, owner, risk, status } = state.release;
  return Box({ border: true, padding: { left: 1, right: 1 }, title: ' Release Control Room ' },
    Text(`Project: ${project} · Release: ${version} · Env: ${env} · Owner: ${owner}`),
    Text(`Status : ${status} · Risk: ${risk} · Approval: ${state.release.approved ? 'granted' : 'missing'}`),
  );
}

function releaseTimelinePanel(state, height) {
  const maxRows = Math.max(8, Math.min(14, height - 16));
  return Panel(' Timeline ', ...state.timeline.slice(0, maxRows).map((item) => Text(`${item.time}  ${item.text}`)));
}

function releasePipelinePanel(state) {
  const pipeline = state.pipeline;
  return Panel(' Live deployment block ',
    Text(`${pipeline.name.toUpperCase()} · ${pipeline.status}`),
    ProgressBar({ value: pipeline.progress, total: 100, width: 26, label: 'pipeline' }),
    ...pipeline.steps.map((step) => Text(`${step.done ? '✓' : step.active ? '▶' : '·'} ${step.name}`)),
  );
}

function releaseChecklistPanel(state) {
  return Panel(' Checklist ', ...state.checklist.map((item) => Text(`${item.done ? '✓' : '□'} ${item.label}`)));
}

function releaseCommandPanel(state) {
  return SelectList({
    title: ' Slash commands ',
    items: RELEASE_COMMANDS,
    selectedIndex: findCommandIndex(state.input.value),
    windowSize: 7,
    getLabel: (item) => item.command,
    getDescription: (item) => item.description,
  });
}

function releaseChangelogPanel(state) {
  const blockerRows = state.blockers.length ? state.blockers.map((item) => Text(`! ${item}`)) : [Text('✓ No blockers.')];
  return Panel(' Changelog / blockers ',
    Text('Changelog:'),
    ...state.changelog.map((item) => Text(`- ${item}`)),
    Text(''),
    Text('Blockers:'),
    ...blockerRows,
  );
}

function releaseInputPanel(state) {
  return Panel(' Command input ',
    Text(`› ${state.input.value || '<type slash command>'}`),
    HelpOverlay({
      title: ' Keys ',
      shortcuts: [
        ['Enter', 'execute command'],
        ['↑/↓', 'cycle suggested commands'],
        ['Ctrl+K/U/W', 'edit command line'],
        ['Ctrl+D', 'exit'],
      ],
    }),
  );
}

function createPipeline(name, status) {
  const steps = PIPELINE_TEMPLATES[name] ?? PIPELINE_TEMPLATES.staging;
  return {
    name,
    status,
    progress: status === 'complete' ? 100 : 0,
    steps: steps.map(([stepName]) => ({ name: stepName, done: false, active: false })),
  };
}

function applyPipelineStep(state, env, name, progress) {
  state.pipeline.steps = state.pipeline.steps.map((step) => ({
    ...step,
    active: step.name === name,
    done: step.done || step.name === name,
  }));
  state.pipeline.progress = progress;
  state.pipeline.status = 'running';
  state.timeline.unshift(event(`${env}: ${name}`));
}

function completePipeline(state, env) {
  state.pipeline.steps = state.pipeline.steps.map((step) => ({ ...step, done: true, active: false }));
  state.pipeline.progress = 100;
  state.pipeline.status = 'complete';
  state.release.status = env === 'rollback' ? 'Rollback completed' : `${env} deploy completed`;
  state.toast = { level: 'success', message: `${env} pipeline completed.` };
  state.timeline.unshift(event(`${env} pipeline completed`));
}

function recalcBlockers(state) {
  const blockers = [];
  for (const item of state.checklist) {
    if (!item.done && item.label !== 'Production approval granted') blockers.push(item.label + ' is incomplete.');
  }
  if (!state.release.approved) blockers.push('Production approval is missing.');
  state.blockers = blockers;
  return blockers;
}

function markChecklist(state, label, done) {
  state.checklist = state.checklist.map((item) => item.label === label ? { ...item, done } : item);
}

function event(text) {
  const date = new Date();
  return { time: date.toTimeString().slice(0, 5), text };
}

function cycleReleaseCommand(state, delta) {
  const current = findCommandIndex(state.input.value);
  const next = mod(current + delta, RELEASE_COMMANDS.length);
  state.input.set(RELEASE_COMMANDS[next].command);
}

function findCommandIndex(value) {
  const index = RELEASE_COMMANDS.findIndex((item) => item.command === value);
  return index >= 0 ? index : 0;
}

function editInput(editor, key) {
  if (key.name === 'left') return key.meta ? editor.moveWord(-1) : editor.move(-1);
  if (key.name === 'right') return key.meta ? editor.moveWord(1) : editor.move(1);
  if (key.name === 'home' || (key.cmd && key.name === 'left')) return editor.home();
  if (key.name === 'end' || (key.cmd && key.name === 'right')) return editor.end();
  if (key.name === 'backspace') return editor.backspace();
  if (key.name === 'delete') return editor.deleteForward();
  if (key.name === 'kill-end') return editor.killToEnd();
  if (key.name === 'kill-start') return editor.killToStart();
  if (key.name === 'delete-word-left') return editor.deleteWordBack();
  if (key.name === 'paste') return editor.insert(key.text);
  if (key.printable) return editor.insert(key.text);
}

function mod(value, size) {
  return ((value % size) + size) % size;
}

if (isDirectRun(import.meta.url)) {
  runInteractiveDemo({
    title: 'Release Control Room',
    state: createReleaseRoomState(),
    render: createReleaseRoomView,
    onKey: handleReleaseRoomKey,
  });
}
