# Progress status and controllers

`ProgressBar` is a stateless visual primitive. It renders the `value` and `total` supplied during the current render, but it does not own timers, calculate throughput, or request another frame.

`ProgressStatus` adds the higher-level behavior needed by downloads, build jobs, batch processing, indexing and other long-running work:

- current value and total;
- running, paused, completed, failed and cancelled states;
- active elapsed time;
- rolling throughput;
- estimated time remaining;
- value and rate formatting;
- throttled runtime invalidation;
- immediate rendering of the first update and terminal states.

## Declarative rendering

A status can be rendered from plain data:

```js
import { ProgressStatus } from 'terlio.js';

ProgressStatus({
  progress: {
    value: 42,
    total: 100,
    state: 'running',
    elapsedMs: 12_000,
    rate: 3.5,
    etaMs: 16_500,
    unit: 'files',
  },
  label: 'Build',
  variant: 'inset',
});
```

This form is useful when the application already owns progress state.

## Controller-owned progress

Create a controller through the component family:

```js
const progress = ProgressStatus.create({
  total: 480,
  unit: 'files',
  updateIntervalMs: 50,
});
```

Connect it to a managed runtime after the runtime exists:

```js
const app = createWorkspaceApp({
  state: { progress },
  render: ({ state, animationFrame }) => ProgressStatus({
    progress: state.progress,
    label: 'Index',
    variant: 'inset',
    frame: animationFrame,
  }),
});

progress.setInvalidate(() => app.invalidate());
```

The task updates the controller instead of manually changing UI state and invalidating on every callback:

```js
progress.start();

for (const batch of batches) {
  await indexBatch(batch);
  progress.add(batch.length);
}

progress.complete();
```

The value changes immediately in the controller. Rendering requests are limited by `updateIntervalMs`, so a stream may report thousands of updates without forcing thousands of layout passes. The first update, `pause()`, `resume()`, `complete()`, `fail()` and `cancel()` request an immediate render.

Call `dispose()` when a controller outlives neither its task nor its runtime. It clears a pending invalidation timer and disconnects the callback.

## Controller methods

```js
progress.start();
progress.set(value, optionalTotal);
progress.add(count);
progress.setTotal(total);
progress.pause();
progress.resume();
progress.complete(optionalFinalValue);
progress.fail(error);
progress.cancel();
progress.reset({ value, total, state });
progress.setInvalidate(callback);
progress.snapshot();
progress.dispose();
```

`value` means completed work. `total` means all work. Completion is explicit: reaching `value === total` does not silently change the lifecycle state until `complete()` is called.

`snapshot()` returns immutable render data:

```js
{
  value,
  total,
  ratio,
  state,
  error,
  unit,
  startedAt,
  elapsedMs,
  rate,
  etaMs,
}
```

Paused time is not included in `elapsedMs`. Throughput is calculated from a rolling time window configured by `rateWindowMs`.

## Display options

```js
ProgressStatus({
  progress,
  label: 'Download',
  width: 28,
  variant: 'compact', // compact | line | inset | boxed
  frame: animationFrame,
  format: 'bytes',    // number | metric | bytes | formatter function
  precision: 1,
  rateMode: 'auto',   // per-second | per-item | auto
  perItemLabel: 'file',
  showState: true,
  showValue: true,
  showRate: true,
  showElapsed: true,
  showEta: true,
  compact: false,
});
```

`format: 'bytes'` renders values such as `18 MiB` and rates such as `4.5 MiB/s`. `format: 'metric'` uses SI prefixes. A formatter function receives the raw numeric value.

`rateMode: 'auto'` uses units per second for fast work and time per item for work slower than one item per second.

Set `compact: true` to render only the underlying `ProgressBar` while retaining controller-owned state.

## Batch processing

Batching does not require a separate helper API. Report the number of completed units with `add()`:

```js
const progress = ProgressStatus.create({
  total: files.length,
  unit: 'files',
});

for (const batch of chunk(files, 25)) {
  await processBatch(batch);
  progress.add(batch.length);
}
```

If only batch completion matters, make batches the unit:

```js
const progress = ProgressStatus.create({
  total: batches.length,
  unit: 'batches',
});

for (const batch of batches) {
  await processBatch(batch);
  progress.add(1);
}
```

## LiveJobBlock integration

`LiveJobBlock` accepts either a numeric percentage or a `ProgressStatus` controller:

```js
LiveJobBlock({
  title: ' Build ',
  progress,
  steps: ['Resolve', 'Compile', 'Package'],
  activeIndex: 1,
  frame: animationFrame,
  progressVariant: 'inset',
  showProgressDetails: true,
});
```

When a controller is supplied, `LiveJobBlock` derives its running/completed/failed state and progress total from the controller. Existing numeric usage remains supported.

## Deterministic tests

The controller accepts injected clock and timer functions:

```js
const progress = ProgressStatus.create({
  total: 100,
  now: fakeClock.now,
  setTimeout: fakeClock.setTimeout,
  clearTimeout: fakeClock.clearTimeout,
});
```

This keeps rate, ETA and throttling tests deterministic without waiting for real time.
