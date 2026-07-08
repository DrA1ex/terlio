export class ModeManager {
  constructor(root = 'input') {
    this.root = normalizeMode(root);
    this.stack = [{ name: this.root, data: {} }];
  }

  current() {
    return this.currentEntry().name;
  }

  currentEntry() {
    return this.stack[this.stack.length - 1];
  }

  is(name) {
    return this.current() === String(name);
  }

  push(name, data = {}) {
    this.stack.push({ name: normalizeMode(name), data: data && typeof data === 'object' ? data : {} });
    return this.current();
  }

  pop() {
    if (this.stack.length === 1) return this.current();
    return this.stack.pop().name;
  }

  replace(name, data = {}) {
    this.stack[this.stack.length - 1] = { name: normalizeMode(name), data: data && typeof data === 'object' ? data : {} };
    return this.current();
  }

  reset() {
    this.stack = [{ name: this.root, data: {} }];
    return this.current();
  }

  toJSON() {
    return this.stack.map((entry) => ({ name: entry.name, data: entry.data }));
  }
}

function normalizeMode(name) {
  const value = String(name ?? '').trim();
  if (!value) throw new Error('Mode name cannot be empty.');
  return value;
}
