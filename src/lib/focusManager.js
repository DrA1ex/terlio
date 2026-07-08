export class FocusManager {
  constructor(targets = []) {
    if (!Array.isArray(targets) || targets.length === 0) {
      throw new Error('FocusManager requires at least one focus target.');
    }
    this.targets = targets.map((id) => ({ id: String(id), enabled: true }));
    this.currentId = this.targets[0].id;
  }

  current() {
    return this.currentId;
  }

  has(id) {
    return this.targets.some((target) => target.id === id);
  }

  isEnabled(id) {
    const target = this.get(id);
    return Boolean(target?.enabled);
  }

  focus(id) {
    const target = this.get(id);
    if (!target) throw new Error(`Unknown focus target: ${id}`);
    if (!target.enabled) return this.currentId;
    this.currentId = target.id;
    return this.currentId;
  }

  enable(id) {
    const target = this.require(id);
    target.enabled = true;
    return this;
  }

  disable(id) {
    const target = this.require(id);
    target.enabled = false;
    return this;
  }

  next() {
    return this.move(1);
  }

  previous() {
    return this.move(-1);
  }

  move(delta) {
    const enabled = this.targets.filter((target) => target.enabled);
    if (enabled.length === 0) return this.currentId;
    const currentIndex = Math.max(0, enabled.findIndex((target) => target.id === this.currentId));
    const nextIndex = mod(currentIndex + delta, enabled.length);
    this.currentId = enabled[nextIndex].id;
    return this.currentId;
  }

  get(id) {
    return this.targets.find((target) => target.id === id);
  }

  require(id) {
    const target = this.get(id);
    if (!target) throw new Error(`Unknown focus target: ${id}`);
    return target;
  }
}

function mod(value, size) {
  return ((value % size) + size) % size;
}
