import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { SessionStore } from '../../../src/lib/index.js';
import { createLegacySessionBackend } from '../../../src/lib/storage/sessionBackend.js';
import { platformSecurityContractTest, securityContractTest } from '../../../scripts/security-testing/contractHelpers.js';

const SEC006 = { audit: 'TERLIO-SEC-006', outcome: 'reject', phase: 'Phase 7' };

function tempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'terlio-security-contract-'));
}

function snapshot(id = 'sample') {
  return {
    id,
    title: 'Security contract',
    messages: [{ role: 'user', content: 'hello' }],
    inputHistory: [],
    skillState: {},
  };
}

platformSecurityContractTest({ ...SEC006, outcome: 'private' }, 'session directories use mode 0700 and files use mode 0600', process.platform !== 'win32', () => {
  const root = tempRoot();
  try {
    const store = new SessionStore({ rootDir: root });
    const saved = store.save(snapshot());
    const directoryMode = fs.statSync(store.sessionDir).mode & 0o777;
    const fileMode = fs.statSync(store.pathFor(saved.id)).mode & 0o777;
    assert.equal(directoryMode, 0o700);
    assert.equal(fileMode, 0o600);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

platformSecurityContractTest(SEC006, 'session directory symlinks are rejected instead of followed', process.platform !== 'win32', () => {
  const root = tempRoot();
  const outside = tempRoot();
  try {
    fs.symlinkSync(outside, path.join(root, 'sessions'), 'dir');
    const store = new SessionStore({ rootDir: root });
    assert.throws(() => store.save(snapshot()), /symlink|symbolic link/i);
    assert.equal(fs.readdirSync(outside).length, 0);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(outside, { recursive: true, force: true });
  }
});


platformSecurityContractTest({ ...SEC006, outcome: 'allow' }, 'a configured session root may be a symlink to a user-selected directory', process.platform !== 'win32', () => {
  const parent = tempRoot();
  const target = tempRoot();
  const root = path.join(parent, 'terlio-home');
  try {
    fs.symlinkSync(target, root, 'dir');
    const store = new SessionStore({ rootDir: root });
    store.save(snapshot('linked-root'));
    assert.equal(fs.existsSync(path.join(target, 'sessions', 'linked-root.json')), true);
  } finally {
    fs.rmSync(parent, { recursive: true, force: true });
    fs.rmSync(target, { recursive: true, force: true });
  }
});

platformSecurityContractTest(SEC006, 'a session directory replaced by a symlink after initialization is rejected', process.platform !== 'win32', () => {
  const root = tempRoot();
  const outside = tempRoot();
  try {
    const store = new SessionStore({ rootDir: root });
    store.ensure();
    fs.rmSync(store.sessionDir, { recursive: true, force: true });
    fs.symlinkSync(outside, store.sessionDir, 'dir');
    assert.throws(() => store.save(snapshot('replaced-dir')), /symlink|symbolic link/i);
    assert.equal(fs.readdirSync(outside).length, 0);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(outside, { recursive: true, force: true });
  }
});

platformSecurityContractTest(SEC006, 'existing session file symlinks are rejected instead of overwritten', process.platform !== 'win32', () => {
  const root = tempRoot();
  const outside = path.join(tempRoot(), 'outside.json');
  try {
    const store = new SessionStore({ rootDir: root });
    store.ensure();
    fs.writeFileSync(outside, 'outside', 'utf8');
    fs.symlinkSync(outside, store.pathFor('sample'));
    assert.throws(() => store.save(snapshot('sample')), /symlink|symbolic link/i);
    assert.equal(fs.readFileSync(outside, 'utf8'), 'outside');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(path.dirname(outside), { recursive: true, force: true });
  }
});

securityContractTest({ ...SEC006, outcome: 'atomic' }, 'failed writes never leave a partial final session file', () => {
  const root = tempRoot();
  const backend = {
    ensureDirectory(directory) { fs.mkdirSync(directory, { recursive: true }); },
    list(directory) { return fs.readdirSync(directory); },
    exists(file) { return fs.existsSync(file); },
    read(file) { return fs.readFileSync(file, 'utf8'); },
    write(file, data) {
      fs.writeFileSync(file, String(data).slice(0, 20), 'utf8');
      throw new Error('disk full');
    },
    remove(file) { fs.unlinkSync(file); },
  };
  try {
    const store = new SessionStore({ rootDir: root, backend });
    assert.throws(() => store.save(snapshot()), /disk full/);
    assert.equal(fs.existsSync(store.pathFor('sample')), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

securityContractTest({ ...SEC006, outcome: 'reject' }, 'oversized session files are rejected before JSON parsing', () => {
  const root = tempRoot();
  try {
    const store = new SessionStore({ rootDir: root, limits: { sessionBytes: 256 } });
    store.ensure();
    fs.writeFileSync(store.pathFor('large'), JSON.stringify({ messages: [], padding: 'x'.repeat(2048) }));
    assert.throws(() => store.load('large'), (error) => error?.code === 'TERLIO_LIMIT_EXCEEDED' && error.resource === 'sessionBytes');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

securityContractTest({ ...SEC006, outcome: 'reject' }, 'session message count is bounded during load', () => {
  const root = tempRoot();
  try {
    const store = new SessionStore({ rootDir: root, limits: { sessionMessages: 4 } });
    store.ensure();
    fs.writeFileSync(store.pathFor('many'), JSON.stringify({
      version: 1,
      id: 'many',
      messages: Array.from({ length: 10 }, (_, index) => ({ role: 'user', content: String(index) })),
    }));
    assert.throws(() => store.load('many'), (error) => error?.code === 'TERLIO_LIMIT_EXCEEDED' && error.resource === 'sessionMessages');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

securityContractTest({ ...SEC006, outcome: 'version-error' }, 'unsupported session versions fail with a controlled migration error', () => {
  const root = tempRoot();
  try {
    const store = new SessionStore({ rootDir: root });
    store.ensure();
    fs.writeFileSync(store.pathFor('future'), JSON.stringify({ version: 999, id: 'future', messages: [] }));
    assert.throws(() => store.load('future'), (error) => error?.code === 'TERLIO_UNSUPPORTED_SESSION_VERSION');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

securityContractTest({ ...SEC006, outcome: 'allow' }, 'session JSON treats __proto__, constructor and prototype as ordinary data fields', () => {
  const root = tempRoot();
  try {
    const store = new SessionStore({ rootDir: root });
    store.ensure();
    fs.writeFileSync(store.pathFor('metadata'), JSON.stringify({
      version: 1,
      id: 'metadata',
      messages: [{
        role: 'assistant',
        content: 'metadata',
        meta: JSON.parse('{"__proto__":{"polluted":true},"constructor":{"prototype":{"flag":true}},"prototype":"v2"}'),
      }],
    }));
    const loaded = store.load('metadata');
    assert.equal(Object.prototype.hasOwnProperty.call(loaded.messages[0].meta, '__proto__'), true);
    assert.equal(loaded.messages[0].meta.constructor.prototype.flag, true);
    assert.equal(loaded.messages[0].meta.prototype, 'v2');
    assert.equal({}.polluted, undefined);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

securityContractTest({ ...SEC006, outcome: 'configurable' }, 'session fsync is an explicit durability option rather than the default write path', () => {
  const atomicRoot = tempRoot();
  const durableRoot = tempRoot();
  let fsyncCalls = 0;
  const filesystem = new Proxy(fs, {
    get(target, property, receiver) {
      if (property === 'fsyncSync') return () => { fsyncCalls += 1; };
      return Reflect.get(target, property, receiver);
    },
  });

  try {
    const backend = createLegacySessionBackend({ filesystem });
    new SessionStore({ rootDir: atomicRoot, backend }).save(snapshot('atomic'));
    assert.equal(fsyncCalls, 0);

    new SessionStore({ rootDir: durableRoot, backend, durability: 'fsync' }).save(snapshot('durable'));
    assert.equal(fsyncCalls, 1);
  } finally {
    fs.rmSync(atomicRoot, { recursive: true, force: true });
    fs.rmSync(durableRoot, { recursive: true, force: true });
  }
});
