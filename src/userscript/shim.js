// Script : les API d'extension utilisées par le code de la page, refaites dans la page. esbuild branche sur ce module
// chaque « chrome » et « OWNER » du code (build.mjs).
// Stockage dans le localStorage du site sous « aqm: » (en mémoire quand il est plein) ; messages traités par handle()
// (bridge.js).
import { handle } from './bridge.js';

export const OWNER = 'userscript';

export const chrome = (() => {
  const PREFIX = 'aqm:';
  const memory = new Map();
  const listeners = [];

  // Valeur gardée d'une clé, ou undefined.
  const read = (key) => {
    if (memory.has(key)) return memory.get(key);
    try {
      const raw = localStorage.getItem(PREFIX + key);
      if (raw != null) {
        const value = JSON.parse(raw);
        memory.set(key, value);
        return value;
      }
    } catch {}
    return undefined;
  };
  const write = (key, value) => {
    memory.set(key, value);
    try {
      localStorage.setItem(PREFIX + key, JSON.stringify(value));
    } catch {} // plein : la valeur reste pour cette page
  };
  const drop = (key) => {
    memory.delete(key);
    try {
      localStorage.removeItem(PREFIX + key);
    } catch {}
  };
  // Prévient les écouteurs de storage.onChanged.
  const emit = (changes) => {
    if (!Object.keys(changes).length) return;
    setTimeout(() =>
      listeners.forEach((fn) => {
        try {
          fn(changes, 'local');
        } catch {}
      })
    );
  };
  const names = (keys) => (typeof keys === 'string' ? [keys] : Array.isArray(keys) ? keys : Object.keys(keys ?? {}));

  // Un autre onglet du site a changé une valeur.
  window.addEventListener('storage', (e) => {
    if (!e.key?.startsWith(PREFIX)) return;
    const key = e.key.slice(PREFIX.length);
    memory.delete(key);
    let newValue;
    try {
      newValue = e.newValue == null ? undefined : JSON.parse(e.newValue);
    } catch {}
    emit({ [key]: { newValue } });
  });

  return {
    runtime: {
      id: OWNER,
      getManifest: () => ({ version: VERSION }),
      sendMessage: (msg) => handle(msg).catch((e) => ({ error: e?.message ?? String(e) }))
    },
    storage: {
      local: {
        async get(keys) {
          const out = {};
          for (const key of names(keys)) {
            const value = read(key);
            if (value !== undefined) out[key] = value;
            else if (keys && typeof keys === 'object' && !Array.isArray(keys)) out[key] = keys[key];
          }
          return out;
        },
        async set(items) {
          const changes = {};
          for (const [key, value] of Object.entries(items)) {
            changes[key] = { oldValue: read(key), newValue: value };
            write(key, value);
          }
          emit(changes);
        },
        async remove(keys) {
          const changes = {};
          for (const key of names(keys)) {
            changes[key] = { oldValue: read(key), newValue: undefined };
            drop(key);
          }
          emit(changes);
        }
      },
      onChanged: { addListener: (fn) => listeners.push(fn) }
    }
  };
})();
