(() => {
  const state = {
    U: {
      lab: 'chem',
      mode: 'series',
      on: true,
      V: 6,
      R: 12,
      C: 0.25,
      L: 2,
      liquid: 'neutral'
    },
    ui: {},
    experiments: {
      completed: {}
    }
  };

  const subscribers = new Set();

  function deepMerge(target, source) {
    if (!source || typeof source !== 'object') return target;
    Object.keys(source).forEach((key) => {
      const current = target[key];
      const next = source[key];
      const isObject = next && typeof next === 'object' && !Array.isArray(next);
      if (isObject && current && typeof current === 'object' && !Array.isArray(current)) {
        deepMerge(current, next);
      } else {
        target[key] = next;
      }
    });
    return target;
  }

  function notify() {
    subscribers.forEach((handler) => handler(state));
  }

  const syncLegacy = () => {
    if (typeof window.U !== 'undefined') {
      deepMerge(state.U, window.U);
      window.U = state.U;
    }
    const lab = window.__lab || {};
    lab.state = state;
    lab.U = state.U;
    lab.getState = api.getState.bind(api);
    lab.dispatch = api.patch.bind(api);
    window.__lab = lab;
    return state;
  };

  const replaceState = (nextState) => {
    const baseState = nextState && typeof nextState === 'object' ? nextState : {};
    const cleanState = {
      U: baseState.U || {},
      ui: baseState.ui || {},
      experiments: baseState.experiments || { completed: {} }
    };

    if (baseState.experiments && baseState.experiments.completed) {
      cleanState.experiments.completed = baseState.experiments.completed;
    }

    Object.keys(state).forEach((key) => delete state[key]);
    Object.keys(cleanState).forEach((key) => {
      state[key] = cleanState[key];
    });

    Object.keys(baseState).forEach((key) => {
      if (!(key in state)) {
        state[key] = baseState[key];
      }
    });

    syncLegacy();
    notify();
    return state;
  };

  const api = {
    getState() {
      return state;
    },
    get(path, fallback) {
      const keys = path.split('.');
      let value = state;
      for (const key of keys) {
        if (value && Object.prototype.hasOwnProperty.call(value, key)) {
          value = value[key];
        } else {
          return fallback;
        }
      }
      return value === undefined ? fallback : value;
    },
    set(path, value) {
      const keys = path.split('.');
      let ref = state;
      for (let index = 0; index < keys.length - 1; index += 1) {
        const key = keys[index];
        if (!ref[key] || typeof ref[key] !== 'object') {
          ref[key] = {};
        }
        ref = ref[key];
      }
      ref[keys[keys.length - 1]] = value;
      syncLegacy();
      notify();
      return value;
    },
    patch(partialState) {
      deepMerge(state, partialState || {});
      if (partialState && partialState.U) {
        deepMerge(state.U, partialState.U);
      }
      syncLegacy();
      notify();
      return state;
    },
    subscribe(handler) {
      subscribers.add(handler);
      return () => subscribers.delete(handler);
    },
    capture() {
      return JSON.parse(JSON.stringify(state));
    },
    replaceState,
    restore(snapshot) {
      if (!snapshot || typeof snapshot !== 'object') return null;
      replaceState(snapshot);
      return state;
    },
    syncLegacy
  };

  if (typeof window !== 'undefined') {
    window.LabState = api;
    window.__lab = window.__lab || {};
    syncLegacy();
    window.addEventListener('DOMContentLoaded', () => {
      syncLegacy();
    }, { once: true });
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { api, state, syncLegacy };
  }
})();
