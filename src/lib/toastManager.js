export function createToastManager(initial = null) {
  return {
    toast: initial,
    show(message, level = 'info', ttl = 4) {
      this.toast = { message: String(message ?? ''), level, ttl };
      return this.toast;
    },
    clear() {
      this.toast = null;
    },
    tick(delta = 1) {
      if (!this.toast) return null;
      this.toast.ttl = Math.max(0, Number(this.toast.ttl ?? 0) - delta);
      if (this.toast.ttl <= 0) this.toast = null;
      return this.toast;
    },
    current(fallback = { level: 'info', message: '' }) {
      return this.toast ?? fallback;
    },
  };
}
