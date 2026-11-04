(() => {
  const maxHistory = 25;
  const history = {
    stack: [],
    index: -1,
    enabled: true,
    locked: false,
    bound: false
  };

  const clone = (value) => JSON.parse(JSON.stringify(value));

  const getCurrentState = () => {
    if (typeof window === 'undefined') return null;
    if (window.LabState && typeof window.LabState.getState === 'function') {
      return clone(window.LabState.getState());
    }
    if (window.__lab && window.__lab.state) {
      return clone(window.__lab.state);
    }
    return null;
  };

  const defaultState = () => ({
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
    experiments: { completed: {} }
  });

  const capture = (snapshot = getCurrentState()) => {
    if (!snapshot || typeof snapshot !== 'object') return null;
    if (history.locked) return null;

    const current = clone(snapshot);
    const last = history.stack[history.index];
    const isDuplicate = history.stack.length && last && JSON.stringify(last) === JSON.stringify(current);
    if (isDuplicate) return null;

    history.stack = history.stack.slice(0, history.index + 1);
    history.stack.push(current);
    if (history.stack.length > maxHistory) {
      history.stack.shift();
    }
    history.index = history.stack.length - 1;
    return current;
  };

  const restore = (target) => {
    if (typeof target === 'number') {
      if (!history.stack.length || target < 0 || target >= history.stack.length) return null;
      target = history.stack[target];
    }
    if (!target || typeof target !== 'object') return null;

    const snapshot = clone(target);
    history.locked = true;
    try {
      if (window.LabState && typeof window.LabState.restore === 'function') {
        window.LabState.restore(snapshot);
      } else if (window.__lab) {
        window.__lab.state = snapshot;
        if (snapshot.U) window.__lab.U = snapshot.U;
      }
      if (window.__lab) {
        window.__lab.state = snapshot;
        if (snapshot.U) window.__lab.U = snapshot.U;
      }
    } finally {
      history.locked = false;
    }

    const nextIndex = history.stack.findIndex((entry) => JSON.stringify(entry) === JSON.stringify(snapshot));
    if (nextIndex >= 0) history.index = nextIndex;
    return snapshot;
  };

  const undo = () => {
    if (!history.enabled) return null;
    const targetIndex = history.index > 0 ? history.index - 1 : -1;
    if (targetIndex < 0) return null;
    return restore(targetIndex);
  };

  const redo = () => {
    if (!history.enabled) return null;
    const targetIndex = history.index < history.stack.length - 1 ? history.index + 1 : history.index;
    if (targetIndex === history.index) return null;
    return restore(targetIndex);
  };

  const reset = () => {
    const baseline = defaultState();
    history.locked = true;
    try {
      if (window.LabState && typeof window.LabState.restore === 'function') {
        window.LabState.restore(baseline);
      } else if (window.__lab) {
        window.__lab.state = baseline;
        window.__lab.U = baseline.U;
      }
      if (window.__lab) {
        window.__lab.state = baseline;
        window.__lab.U = baseline.U;
      }
    } finally {
      history.locked = false;
    }
    capture(baseline);
    return baseline;
  };

  const subscribeToState = () => {
    if (history.bound || typeof window === 'undefined' || !window.LabState || typeof window.LabState.subscribe !== 'function') return;
    window.LabState.subscribe(() => {
      if (!history.enabled || history.locked) return;
      capture();
    });
    history.bound = true;
  };

  const wireActions = () => {
    if (typeof document === 'undefined') return;
    const bind = (id, action) => {
      const node = document.getElementById(id);
      if (!node) return;
      node.addEventListener('click', () => {
        const result = action();
        if (result && typeof result === 'object' && result.U && window.__lab && window.__lab.triggerAlert) {
          window.__lab.triggerAlert('history', 'تم تحديث الحالة بنجاح.', 'info', 2);
        }
      });
    };

    bind('undoBtn', undo);
    bind('redoBtn', redo);
    bind('resetBk', reset);
    bind('clearB', reset);
  };

  const api = { history, capture, restore, undo, redo, reset, wireActions, defaultState, subscribeToState };
  if (typeof window !== 'undefined') {
    window.LabHistory = api;
    window.__lab = window.__lab || {};
    window.__lab.history = api;

    if (typeof document !== 'undefined') {
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
          wireActions();
          subscribeToState();
          capture(getCurrentState());
        }, { once: true });
      } else {
        wireActions();
        subscribeToState();
        capture(getCurrentState());
      }
    }
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { api, history, capture, restore, undo, redo, reset, defaultState, subscribeToState };
  }
})();
