import os from 'node:os';
import path from 'node:path';
import { packageHomeDirectoryName, packageHomeEnv } from './packageMetadata.js';
import { normalizeMessages } from './state.js';
import { createLegacySessionBackend } from './storage/sessionBackend.js';
import { createLimitError, DEFAULT_SECURITY_LIMITS, mergeSecurityLimits, utf8ByteLength } from './securityLimits.js';

const SESSION_DIR_NAME = 'sessions';
const SESSION_VERSION = 1;
export class SessionStore {
  constructor({ rootDir = defaultRootDir(), backend = createLegacySessionBackend(), limits = {}, durability = 'atomic' } = {}) {
    this.rootDir = path.resolve(rootDir);
    this.resolvedRootDir = this.rootDir;
    this.sessionDir = path.join(this.resolvedRootDir, SESSION_DIR_NAME);
    this.backend = backend;
    this.durability = durability === 'fsync' ? 'fsync' : 'atomic';
    this.limits = mergeSecurityLimits(DEFAULT_SECURITY_LIMITS, limits);
    this.ready = false;
  }

  ensure() {
    if (this.ready) {
      if (this.backend.isSymlink?.(this.sessionDir)) throw new Error(`Refusing symbolic link session directory: ${this.sessionDir}`);
      return;
    }

    if (typeof this.backend.ensureRootDirectory === 'function') {
      this.backend.ensureRootDirectory(this.rootDir);
      const resolved = typeof this.backend.realpath === 'function'
        ? this.backend.realpath(this.rootDir)
        : this.rootDir;
      this.resolvedRootDir = path.resolve(resolved);
    } else {
      this.resolvedRootDir = this.rootDir;
    }

    this.sessionDir = path.join(this.resolvedRootDir, SESSION_DIR_NAME);
    this.backend.ensureDirectory(this.sessionDir);
    if (this.backend.isSymlink?.(this.sessionDir)) throw new Error(`Refusing symbolic link session directory: ${this.sessionDir}`);
    this.ready = true;
  }

  createId() {
    const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
    const random = Math.random().toString(36).slice(2, 7);
    return `${stamp}_${random}`;
  }

  list() {
    this.ensure();
    return this.backend.list(this.sessionDir)
      .filter((file) => file.endsWith('.json'))
      .map((file) => this.safeReadSummary(path.join(this.sessionDir, file)))
      .filter(Boolean)
      .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  }

  load(id) {
    const file = this.pathFor(id);
    if (!this.backend.exists(file)) throw new Error(`Session not found: ${id}`);
    this.assertSafeFile(file);
    const measured = this.backend.size?.(file);
    if (Number.isFinite(measured) && measured > this.limits.sessionBytes) {
      throw createLimitError('sessionBytes', this.limits.sessionBytes, measured);
    }
    const source = this.backend.read(file);
    const bytes = utf8ByteLength(source);
    if (bytes > this.limits.sessionBytes) throw createLimitError('sessionBytes', this.limits.sessionBytes, bytes);

    let raw;
    try {
      raw = JSON.parse(source);
    } catch (cause) {
      throw invalidSession(`Session JSON is invalid: ${cause.message}`);
    }
    validateSessionDocument(raw, this.limits);
    return normalizeLoadedSession(raw, sanitizeId(id));
  }

  save(snapshot) {
    this.ensure();
    const id = sanitizeId(snapshot?.id || this.createId());
    const now = new Date().toISOString();
    const payload = {
      version: SESSION_VERSION,
      id,
      title: snapshot?.title || inferTitle(snapshot?.messages),
      createdAt: snapshot?.createdAt || now,
      updatedAt: now,
      themeName: snapshot?.themeName || 'ocean',
      providerName: snapshot?.providerName || 'mock',
      skillState: snapshot?.skillState || {},
      inputHistory: snapshot?.inputHistory || [],
      messages: snapshot?.messages || [],
    };
    validateSessionDocument(payload, this.limits);
    let serialized;
    try {
      serialized = `${JSON.stringify(payload, null, 2)}\n`;
    } catch (cause) {
      throw invalidSession(`Session data is not serializable: ${cause.message}`);
    }
    const bytes = utf8ByteLength(serialized);
    if (bytes > this.limits.sessionBytes) throw createLimitError('sessionBytes', this.limits.sessionBytes, bytes);
    this.atomicWrite(this.pathFor(id), serialized);
    return payload;
  }

  remove(id) {
    const file = this.pathFor(id);
    if (!this.backend.exists(file)) return;
    this.assertSafeFile(file);
    this.backend.remove(file);
  }

  pathFor(id) {
    this.ensure();
    const file = path.resolve(this.sessionDir, `${sanitizeId(id)}.json`);
    const prefix = `${path.resolve(this.sessionDir)}${path.sep}`;
    if (!file.startsWith(prefix)) throw invalidSession('Session path escapes the configured root.');
    return file;
  }

  safeReadSummary(file) {
    try {
      this.assertSafeFile(file);
      const measured = this.backend.size?.(file);
      if (Number.isFinite(measured) && measured > this.limits.sessionBytes) return null;
      const source = this.backend.read(file);
      if (utf8ByteLength(source) > this.limits.sessionBytes) return null;
      const raw = JSON.parse(source);
      validateSessionDocument(raw, this.limits);
      return {
        id: raw.id || path.basename(file, '.json'),
        title: raw.title || 'Untitled session',
        createdAt: raw.createdAt || '',
        updatedAt: raw.updatedAt || '',
        messages: Array.isArray(raw.messages) ? raw.messages.length : 0,
      };
    } catch {
      return null;
    }
  }

  atomicWrite(file, data) {
    this.assertSafeFile(file, { allowMissing: true });
    if (typeof this.backend.writeAtomic === 'function') {
      this.backend.writeAtomic(file, data, { durability: this.durability });
      return;
    }

    const temporary = `${file}.${process.pid}.${Math.random().toString(36).slice(2, 10)}.tmp`;
    let finalWritten = false;
    try {
      this.backend.write(temporary, data, { mode: 0o600, exclusive: true, durability: this.durability });
      if (typeof this.backend.rename === 'function') {
        this.backend.rename(temporary, file);
      } else {
        const staged = typeof this.backend.read === 'function' ? this.backend.read(temporary) : data;
        this.backend.write(file, staged, { mode: 0o600, durability: this.durability });
        finalWritten = true;
        this.backend.remove?.(temporary);
      }
    } catch (error) {
      try { if (this.backend.exists?.(temporary)) this.backend.remove?.(temporary); } catch { /* preserve original failure */ }
      if (finalWritten) {
        try { if (this.backend.exists?.(file)) this.backend.remove?.(file); } catch { /* preserve original failure */ }
      }
      throw error;
    }
  }

  assertSafeFile(file, { allowMissing = false } = {}) {
    if (!this.backend.exists?.(file)) {
      if (allowMissing) return;
      return;
    }
    if (this.backend.isSymlink?.(file)) throw new Error(`Refusing symbolic link session file: ${file}`);
  }
}

export function serializeSkillState(skillState) {
  return Object.fromEntries(skillState.entries());
}

export function applySerializedSkillState(skillState, serialized = {}) {
  for (const [name, value] of Object.entries(serialized)) {
    if (skillState.has(name)) skillState.set(name, Boolean(value));
  }
}

function normalizeLoadedSession(raw, fallbackId) {
  return {
    version: SESSION_VERSION,
    id: raw.id || fallbackId,
    title: raw.title || 'Untitled session',
    createdAt: raw.createdAt || new Date().toISOString(),
    updatedAt: raw.updatedAt || raw.createdAt || new Date().toISOString(),
    themeName: raw.themeName || 'ocean',
    providerName: raw.providerName || 'mock',
    skillState: raw.skillState && isPlainObject(raw.skillState) ? raw.skillState : {},
    inputHistory: Array.isArray(raw.inputHistory) ? raw.inputHistory.filter((item) => typeof item === 'string') : [],
    messages: normalizeMessages(raw.messages),
  };
}

function validateSessionDocument(raw, limits) {
  if (!isPlainObject(raw)) throw invalidSession('Session root must be a plain object.');
  validateObjectDepth(raw, limits);
  const legacyDocument = raw.version === undefined;
  const version = legacyDocument ? SESSION_VERSION : raw.version;
  if (version !== SESSION_VERSION) {
    const error = new Error(`Unsupported session version: ${String(version)}`);
    error.code = 'TERLIO_UNSUPPORTED_SESSION_VERSION';
    error.version = version;
    throw error;
  }
  if (raw.id !== undefined && typeof raw.id !== 'string') throw invalidSession('Session id must be a string.');
  if (raw.title !== undefined && typeof raw.title !== 'string') throw invalidSession('Session title must be a string.');
  if (!legacyDocument && raw.messages !== undefined && !Array.isArray(raw.messages)) {
    throw invalidSession('Session messages must be an array.');
  }
  const count = Array.isArray(raw.messages) ? raw.messages.length : 0;
  if (count > limits.sessionMessages) throw createLimitError('sessionMessages', limits.sessionMessages, count);
  for (const message of Array.isArray(raw.messages) ? raw.messages : []) {
    if (!isPlainObject(message)) throw invalidSession('Session messages must contain plain objects.');
  }
  if (!legacyDocument && raw.inputHistory !== undefined && !Array.isArray(raw.inputHistory)) {
    throw invalidSession('Session inputHistory must be an array.');
  }
  if (!legacyDocument && raw.skillState !== undefined && !isPlainObject(raw.skillState)) {
    throw invalidSession('Session skillState must be a plain object.');
  }
}

function validateObjectDepth(value, limits) {
  if (limits.sessionDepth === Infinity) return;
  const seen = new Set();
  const stack = [{ value, depth: 0 }];
  while (stack.length) {
    const entry = stack.pop();
    if (!entry?.value || typeof entry.value !== 'object' || seen.has(entry.value)) continue;
    seen.add(entry.value);
    if (entry.depth > limits.sessionDepth) {
      throw createLimitError('sessionDepth', limits.sessionDepth, entry.depth);
    }
    for (const child of Object.values(entry.value)) {
      if (child && typeof child === 'object') stack.push({ value: child, depth: entry.depth + 1 });
    }
  }
}

function invalidSession(message) {
  const error = new Error(message);
  error.code = 'TERLIO_INVALID_SESSION';
  return error;
}

function isPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function defaultRootDir() {
  if (process.env[packageHomeEnv]) return process.env[packageHomeEnv];
  return path.join(os.homedir(), packageHomeDirectoryName);
}

function sanitizeId(id) {
  return String(id ?? '').replace(/[^a-zA-Z0-9_.-]/g, '_').slice(0, 120) || 'session';
}

function inferTitle(messages = []) {
  const firstUser = Array.isArray(messages) ? messages.find((message) => message?.role === 'user' && String(message?.content ?? '').trim()) : null;
  if (!firstUser) return 'Untitled session';
  return String(firstUser.content).replace(/\s+/g, ' ').trim().slice(0, 80);
}
