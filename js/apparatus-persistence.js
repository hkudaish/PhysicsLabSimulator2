(() => {
  const STORAGE_KEY = 'lab.apparatus.v1';
  const SCHEMA_VERSION = 1;
  const MAX_ITEMS = 100;
  const MIN_X = 187.4;
  const MAX_X = 212.6;
  const MIN_Z = -4.6;
  const MAX_Z = 5.6;
  const MAX_HISTORY = 30;

  const createSnapshot = (items) => ({
    schemaVersion: SCHEMA_VERSION,
    items: items.map((item) => ({
      tool: item.d.en,
      x: item.grp.position.x,
      z: item.grp.position.z,
      rotationY: item.grp.rotation.y,
      lit: Boolean(item.grp.userData.lit)
    }))
  });

  const validateSnapshot = (snapshot, toolDefs) => {
    if (!snapshot || snapshot.schemaVersion !== SCHEMA_VERSION ||
        !Array.isArray(snapshot.items) || snapshot.items.length > MAX_ITEMS) {
      return false;
    }

    const tools = new Set(toolDefs.map((tool) => tool.en));
    const occupied = [];
    for (const item of snapshot.items) {
      if (!item || !tools.has(item.tool) ||
          !Number.isFinite(item.x) || item.x < MIN_X || item.x > MAX_X ||
          !Number.isFinite(item.z) || item.z < MIN_Z || item.z > MAX_Z ||
          !Number.isFinite(item.rotationY) ||
          typeof item.lit !== 'boolean') {
        return false;
      }

      if (occupied.some((position) => Math.hypot(position.x - item.x, position.z - item.z) < 1.7)) {
        return false;
      }
      occupied.push({ x: item.x, z: item.z });
    }
    return true;
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { createSnapshot, validateSnapshot, STORAGE_KEY, SCHEMA_VERSION };
  }

  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  const chemistry = window.__lab?.chem;
  if (!chemistry?.PLACED || !chemistry?.toolDefs || !chemistry?.placeTool ||
      !chemistry?.removePlaced || !chemistry?.selectPlaced) {
    console.error('Apparatus persistence could not initialize: chemistry apparatus APIs are unavailable.');
    return;
  }

  const history = [];
  let historyIndex = -1;
  let restoring = false;
  let disabled = false;
  let lastSnapshotText = '';
  let lastInvalidSnapshotText = '';
  let reportedError = false;

  const reportFailure = (message, error) => {
    console.error(message, error);
    if (reportedError) return;
    reportedError = true;
    window.__lab?.triggerAlert?.(
      'apparatus-storage',
      'تعذر حفظ بعض أدوات المختبر أو استعادتها. قد لا تُحفظ التغييرات الحالية.',
      'warn',
      6
    );
  };

  const saveSnapshot = (snapshot) => {
    if (disabled) return false;
    try {
      const text = JSON.stringify(snapshot);
      if (text !== lastSnapshotText) {
        window.localStorage.setItem(STORAGE_KEY, text);
        lastSnapshotText = text;
      }
      return true;
    } catch (error) {
      disabled = true;
      reportFailure('Apparatus persistence save failed.', error);
      return false;
    }
  };

  const currentSnapshot = () => createSnapshot(chemistry.PLACED);

  const applySnapshot = (snapshot) => {
    if (!validateSnapshot(snapshot, chemistry.toolDefs)) {
      throw new TypeError('Invalid apparatus snapshot; no apparatus were restored.');
    }

    restoring = true;
    try {
      chemistry.selectPlaced(null);
      [...chemistry.PLACED].forEach((item) => chemistry.removePlaced(item));
      for (const record of snapshot.items) {
        const index = chemistry.toolDefs.findIndex((tool) => tool.en === record.tool);
        if (index < 0) throw new Error(`Unknown apparatus type: ${record.tool}`);

        chemistry.CHT.armed = index;
        const previousCount = chemistry.PLACED.length;
        chemistry.placeTool({ x: record.x, z: record.z });
        const restoredItem = chemistry.PLACED[chemistry.PLACED.length - 1];
        if (chemistry.PLACED.length !== previousCount + 1 || !restoredItem) {
          throw new Error(`Failed to restore apparatus: ${record.tool}`);
        }

        restoredItem.grp.position.set(record.x, 0, record.z);
        restoredItem.grp.rotation.y = record.rotationY;
        const flame = restoredItem.grp.userData.flame;
        if (flame) {
          restoredItem.grp.userData.lit = record.lit;
          flame.forEach((mesh) => { mesh.visible = record.lit; });
        }
      }
      chemistry.selectPlaced(null);
    } finally {
      restoring = false;
    }
  };

  const addHistoryEntry = (snapshot) => {
    const text = JSON.stringify(snapshot);
    if (historyIndex >= 0 && JSON.stringify(history[historyIndex]) === text) return;

    history.splice(historyIndex + 1);
    history.push(snapshot);
    if (history.length > MAX_HISTORY) history.shift();
    historyIndex = history.length - 1;
  };

  const capture = () => {
    if (disabled || restoring) return;
    const snapshot = currentSnapshot();
    if (!validateSnapshot(snapshot, chemistry.toolDefs)) {
      const invalidText = JSON.stringify(snapshot);
      if (invalidText !== lastInvalidSnapshotText) {
        lastInvalidSnapshotText = invalidText;
        reportFailure('Apparatus state is invalid and was not saved.', new TypeError('Invalid apparatus state.'));
      }
      return;
    }
    lastInvalidSnapshotText = '';

    const text = JSON.stringify(snapshot);
    if (text === lastSnapshotText) return;
    addHistoryEntry(snapshot);
    saveSnapshot(snapshot);
    updateHistoryControls();
  };

  const moveHistory = (direction) => {
    capture();
    const target = historyIndex + direction;
    if (target < 0 || target >= history.length) return false;

    const snapshot = history[target];
    applySnapshot(snapshot);
    historyIndex = target;
    saveSnapshot(snapshot);
    updateHistoryControls();
    return true;
  };

  const undo = () => moveHistory(-1);
  const redo = () => moveHistory(1);
  const canUndo = () => historyIndex > 0;
  const canRedo = () => historyIndex >= 0 && historyIndex < history.length - 1;

  const updateHistoryControls = () => {
    document.querySelectorAll('[data-apparatus-history]').forEach((button) => {
      button.disabled = button.dataset.apparatusHistory === 'undo' ? !canUndo() : !canRedo();
    });
  };

  const addHistoryControls = () => {
    const toolbar = document.getElementById('toolsbar');
    if (!toolbar || toolbar.querySelector('.apparatus-history-actions')) return;

    const controls = document.createElement('div');
    controls.className = 'apparatus-history-actions';
    [
      { action: 'undo', label: '↶ تراجع الأداة', title: 'التراجع عن آخر تغيير للأدوات' },
      { action: 'redo', label: '↷ إعادة الأداة', title: 'إعادة آخر تغيير للأدوات' }
    ].forEach(({ action, label, title }) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.apparatusHistory = action;
      button.textContent = label;
      button.title = title;
      button.addEventListener('click', () => { api[action](); });
      controls.appendChild(button);
    });
    toolbar.prepend(controls);
  };

  const loadSavedSnapshot = () => {
    let text;
    try {
      text = window.localStorage.getItem(STORAGE_KEY);
    } catch (error) {
      disabled = true;
      reportFailure('Apparatus persistence load failed.', error);
      return null;
    }
    if (!text) return null;

    let snapshot;
    try {
      snapshot = JSON.parse(text);
    } catch (error) {
      reportFailure('Saved apparatus data is malformed and was ignored.', error);
      return null;
    }
    if (!validateSnapshot(snapshot, chemistry.toolDefs)) {
      reportFailure('Saved apparatus data did not match the supported schema and was ignored.', new TypeError('Invalid saved apparatus snapshot.'));
      return null;
    }
    lastSnapshotText = text;
    return snapshot;
  };

  const initialize = () => {
    const savedSnapshot = loadSavedSnapshot();
    if (savedSnapshot) {
      try {
        applySnapshot(savedSnapshot);
      } catch (error) {
        reportFailure('Saved apparatus could not be restored.', error);
      }
    }

    const initialSnapshot = currentSnapshot();
    history.push(initialSnapshot);
    historyIndex = 0;
    if (!savedSnapshot) lastSnapshotText = '';
    saveSnapshot(initialSnapshot);
    addHistoryControls();
    updateHistoryControls();
    window.setInterval(capture, 250);
  };

  const api = { capture, undo, redo, canUndo, canRedo, applySnapshot, currentSnapshot, validateSnapshot };
  window.ApparatusPersistence = api;
  document.addEventListener('keydown', (event) => {
    if (!(event.ctrlKey || event.metaKey) || (event.target instanceof HTMLElement &&
        event.target.closest('input, textarea, select, [contenteditable="true"]'))) return;
    if (appIsChemistry() && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      undo();
    } else if (appIsChemistry() && event.key.toLowerCase() === 'y') {
      event.preventDefault();
      redo();
    }
  });

  function appIsChemistry() {
    return document.getElementById('app')?.classList.contains('lab-chem') === true;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize, { once: true });
  } else {
    initialize();
  }
})();
