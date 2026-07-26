import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LiveJobBlock,
  ProgressStatus,
  renderToString,
  stripAnsi,
} from '../src/lib/index.js';

function createFakeClock() {
  let current = 0;
  let nextId = 1;
  const timers = new Map();
  return {
    now: () => current,
    setTimeout(fn, delay) {
      const id = nextId++;
      timers.set(id, { at: current + Math.max(0, delay), fn });
      return id;
    },
    clearTimeout(id) {
      timers.delete(id);
    },
    advance(milliseconds) {
      current += milliseconds;
      while (true) {
        const due = [...timers.entries()]
          .filter(([, timer]) => timer.at <= current)
          .sort((a, b) => a[1].at - b[1].at)[0];
        if (!due) break;
        timers.delete(due[0]);
        due[1].fn();
      }
    },
    pending: () => timers.size,
  };
}

test('ProgressStatus controller tracks value, active elapsed time, rate and ETA', () => {
  const clock = createFakeClock();
  const progress = ProgressStatus.create({ total: 100, now: clock.now, updateIntervalMs: 0 });

  progress.start();
  clock.advance(1000);
  progress.set(20);
  let snapshot = progress.snapshot();
  assert.equal(snapshot.state, 'running');
  assert.equal(snapshot.elapsedMs, 1000);
  assert.equal(snapshot.rate, 20);
  assert.equal(snapshot.etaMs, 4000);

  clock.advance(1000);
  progress.add(30);
  snapshot = progress.snapshot();
  assert.equal(snapshot.value, 50);
  assert.equal(snapshot.rate, 25);
  assert.equal(snapshot.etaMs, 2000);

  progress.pause();
  clock.advance(5000);
  assert.equal(progress.snapshot().elapsedMs, 2000);
  progress.resume();
  clock.advance(1000);
  progress.add(25);
  assert.equal(progress.snapshot().elapsedMs, 3000);

  progress.complete();
  snapshot = progress.snapshot();
  assert.equal(snapshot.state, 'completed');
  assert.equal(snapshot.value, 100);
  assert.equal(snapshot.etaMs, 0);
});

test('ProgressStatus controller throttles invalidation but flushes terminal states immediately', () => {
  const clock = createFakeClock();
  const rendered = [];
  const progress = ProgressStatus.create({
    total: 10,
    now: clock.now,
    setTimeout: clock.setTimeout,
    clearTimeout: clock.clearTimeout,
    updateIntervalMs: 100,
    invalidate: (snapshot) => rendered.push([clock.now(), snapshot.value, snapshot.state]),
  });

  progress.set(1);
  assert.deepEqual(rendered, [[0, 1, 'running']]);
  clock.advance(10);
  progress.set(2);
  clock.advance(10);
  progress.set(3);
  assert.equal(rendered.length, 1);
  assert.equal(clock.pending(), 1);

  clock.advance(80);
  assert.deepEqual(rendered.at(-1), [100, 3, 'running']);

  clock.advance(10);
  progress.complete();
  assert.deepEqual(rendered.at(-1), [110, 10, 'completed']);
  assert.equal(clock.pending(), 0);
});

test('ProgressStatus renders formatted values, rate, elapsed time and ETA', () => {
  const clock = createFakeClock();
  const mib = 1024 * 1024;
  const progress = ProgressStatus.create({ total: 10 * mib, now: clock.now, updateIntervalMs: 0 });
  progress.start();
  clock.advance(1000);
  progress.set(5 * mib);

  const output = stripAnsi(renderToString(ProgressStatus({
    progress,
    label: 'Download',
    width: 18,
    variant: 'inset',
    format: 'bytes',
    frame: 2,
  }), { width: 72, height: 2 }));

  assert.match(output, /Download/);
  assert.match(output, /5 MiB\/10 MiB/);
  assert.match(output, /5 MiB\/s/);
  assert.match(output, /0:01 elapsed/);
  assert.match(output, /0:01 left/);
});


test('ProgressStatus supports automatic per-item rate formatting and singular units', () => {
  const output = stripAnsi(renderToString(ProgressStatus({
    progress: { value: 1, total: 4, state: 'running', elapsedMs: 2500, rate: 0.5, etaMs: 6000, unit: 'items' },
    label: 'Slow task',
    width: 12,
    rateMode: 'auto',
    perItemLabel: 'item',
  }), { width: 64, height: 2 }));
  assert.match(output, /1\/4 items/);
  assert.match(output, /2s\/item/);
});

test('ProgressStatus exposes pause, failure, reset and disposal states', () => {
  const clock = createFakeClock();
  const progress = ProgressStatus.create({ total: 4, now: clock.now, updateIntervalMs: 0 });
  progress.set(1).pause();
  assert.equal(progress.snapshot().state, 'paused');
  progress.resume().fail(new Error('network lost'));
  assert.equal(progress.snapshot().state, 'failed');
  assert.equal(progress.snapshot().error.message, 'network lost');
  progress.reset({ total: 8 });
  assert.deepEqual({ state: progress.state, value: progress.value, total: progress.total }, { state: 'idle', value: 0, total: 8 });
  progress.dispose();
  progress.set(5);
  assert.equal(progress.value, 0);
});

test('LiveJobBlock accepts a ProgressStatus controller and can show controller details', () => {
  const clock = createFakeClock();
  const progress = ProgressStatus.create({ total: 20, now: clock.now, updateIntervalMs: 0, unit: 'files' });
  progress.start();
  clock.advance(2000);
  progress.set(10);

  const running = stripAnsi(renderToString(LiveJobBlock({
    title: ' Build ',
    progress,
    steps: ['Prepare', 'Compile', 'Package'],
    activeIndex: 1,
    frame: 1,
    showProgressDetails: true,
  }), { width: 64, height: 10 }));
  assert.match(running, /running/);
  assert.match(running, /10\/20 files/);
  assert.match(running, /5 files\/s/);

  progress.complete();
  const completed = stripAnsi(renderToString(LiveJobBlock({ progress, steps: ['Prepare'] }), { width: 40, height: 5 }));
  assert.match(completed, /✓ completed/);
  assert.match(completed, /100%/);
});
