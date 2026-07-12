import { StreamCancelled } from '../mockModel.js';

export function buildAssistantActionText(action, source) {
  const cleaned = String(source ?? '').replace(/\n\s*\[matched:[\s\S]*?\]$/m, '').trim();
  if (action === 'shorter') {
    return `Shortened version:\n\n${firstSentence(cleaned)}\n\nSummary: ${summarize(cleaned, 220)}`;
  }
  if (action === 'longer') {
    return `Expanded version:\n\n${cleaned}\n\nAdditional note: I would separately verify input state, response streaming, command list behavior, and session persistence. These four layers are the most common conflict points in rich terminal applications.`;
  }
  if (action === 'explain') {
    return `Explanation of the last response:\n\n1. Main idea: ${summarize(cleaned, 180)}\n\n2. Why it matters: terminal UX breaks quickly when input state, rendering, and model logic are mixed.\n\n3. What to check next: commands, arrow keys, streaming, cancellation with Esc, and session saving.`;
  }
  if (action === 'apply') {
    return 'Automatic artifact application is not connected yet. In this reference application, `/apply` only records the UX path: once a real provider/tools layer exists, the command can find the last applicable artifact and execute it through a separate safe adapter.';
  }
  return cleaned;
}

export async function streamTextChunks(text, { signal = null, onChunk = () => {}, delayScale = 1 } = {}) {
  for (const chunk of chunkText(text)) {
    if (signal?.aborted) throw new StreamCancelled();
    const baseDelay = chunk.includes('\n') ? 60 : /^\s+$/.test(chunk) ? 10 : 24;
    await delay(Math.max(0, baseDelay * delayScale), signal);
    if (signal?.aborted) throw new StreamCancelled();
    onChunk(chunk);
  }
}


export function errorMessage(error) {
  if (error instanceof Error && error.message) return error.message;
  const message = String(error ?? '').trim();
  return message || 'Unknown error';
}

export function isStreamCancellation(error, signal = null) {
  return error instanceof StreamCancelled || Boolean(signal?.aborted) || error?.message === 'stream cancelled';
}

function firstSentence(text) {
  const match = text.match(/^(.{20,240}?[.!?])(?:\s|$)/s);
  return match ? match[1].trim() : summarize(text, 180);
}

function summarize(text, limit) {
  const single = String(text ?? '').replace(/\s+/g, ' ').trim();
  return single.length > limit ? `${single.slice(0, limit - 1)}…` : single;
}

function chunkText(text) {
  return String(text ?? '').match(/(\s+|[^\s]+)/g) ?? [];
}

function delay(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new StreamCancelled());
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    function onAbort() {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      reject(new StreamCancelled());
    }
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}
