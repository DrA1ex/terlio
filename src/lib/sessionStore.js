import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { packageHomeDirectoryName, packageHomeEnv } from './packageMetadata.js';
import { normalizeMessages } from './state.js';

const SESSION_DIR_NAME = 'sessions';

export class SessionStore {
  constructor({ rootDir = defaultRootDir() } = {}) {
    this.rootDir = rootDir;
    this.sessionDir = path.join(rootDir, SESSION_DIR_NAME);
  }

  ensure() {
    fs.mkdirSync(this.sessionDir, { recursive: true });
  }

  createId() {
    const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
    const random = Math.random().toString(36).slice(2, 7);
    return `${stamp}_${random}`;
  }

  list() {
    this.ensure();
    return fs.readdirSync(this.sessionDir)
      .filter((file) => file.endsWith('.json'))
      .map((file) => this.safeReadSummary(path.join(this.sessionDir, file)))
      .filter(Boolean)
      .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  }

  load(id) {
    const file = this.pathFor(id);
    if (!fs.existsSync(file)) throw new Error(`Session not found: ${id}`);
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    return {
      id: raw.id || sanitizeId(id),
      title: raw.title || 'Untitled session',
      createdAt: raw.createdAt || new Date().toISOString(),
      updatedAt: raw.updatedAt || raw.createdAt || new Date().toISOString(),
      themeName: raw.themeName || 'ocean',
      providerName: raw.providerName || 'mock',
      skillState: raw.skillState && typeof raw.skillState === 'object' ? raw.skillState : {},
      inputHistory: Array.isArray(raw.inputHistory) ? raw.inputHistory.filter((item) => typeof item === 'string') : [],
      messages: normalizeMessages(raw.messages),
    };
  }

  save(snapshot) {
    this.ensure();
    const id = sanitizeId(snapshot.id || this.createId());
    const now = new Date().toISOString();
    const payload = {
      id,
      title: snapshot.title || inferTitle(snapshot.messages),
      createdAt: snapshot.createdAt || now,
      updatedAt: now,
      themeName: snapshot.themeName || 'ocean',
      providerName: snapshot.providerName || 'mock',
      skillState: snapshot.skillState || {},
      inputHistory: snapshot.inputHistory || [],
      messages: snapshot.messages || [],
    };

    fs.writeFileSync(this.pathFor(id), `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
    return payload;
  }

  remove(id) {
    const file = this.pathFor(id);
    if (fs.existsSync(file)) fs.unlinkSync(file);
  }

  pathFor(id) {
    return path.join(this.sessionDir, `${sanitizeId(id)}.json`);
  }

  safeReadSummary(file) {
    try {
      const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
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
}

export function serializeSkillState(skillState) {
  return Object.fromEntries(skillState.entries());
}

export function applySerializedSkillState(skillState, serialized = {}) {
  for (const [name, value] of Object.entries(serialized)) {
    if (skillState.has(name)) skillState.set(name, Boolean(value));
  }
}

function defaultRootDir() {
  if (process.env[packageHomeEnv]) return process.env[packageHomeEnv];
  return path.join(os.homedir(), packageHomeDirectoryName);
}

function sanitizeId(id) {
  return String(id ?? '').replace(/[^a-zA-Z0-9_.-]/g, '_').slice(0, 120) || 'session';
}

function inferTitle(messages = []) {
  const firstUser = messages.find((message) => message.role === 'user' && message.content.trim());
  if (!firstUser) return 'Untitled session';
  return firstUser.content.replace(/\s+/g, ' ').trim().slice(0, 80);
}
