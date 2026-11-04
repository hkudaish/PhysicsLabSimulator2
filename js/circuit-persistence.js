(() => {
  const STORAGE_KEY = 'lab.circuit-builder.v1';
  const SCHEMA_VERSION = 1;
  const MAX_PARTS = 100;
  const MAX_WIRES = 400;
  const COLUMN_MIN = -5;
  const COLUMN_MAX = 5;
  const ROW_MIN = 0;
  const ROW_MAX = 4;
  const DIRECTIONS = [
    { i: 1, j: 0 },
    { i: 0, j: 1 },
    { i: -1, j: 0 },
    { i: 0, j: -1 }
  ];
  const PART_TYPES = new Set([
    'battery', 'resistor', 'bulb', 'cap', 'ind', 'switch', 'led', 'diode',
    'relay', 'sig', 'npn', 'and', 'or', 'not', 'nand', 'nor', 'xor'
  ]);
  const MULTI_TERMINAL_TYPES = new Set(['npn', 'and', 'or', 'nand', 'nor', 'xor']);

  const partTerminals = (part) => {
    const direction = DIRECTIONS[part.dir];
    const start = { i: part.i, j: part.j };
    const end = { i: part.i + direction.i * 2, j: part.j + direction.j * 2 };
    if (part.type === 'relay') {
      const perpendicular = DIRECTIONS[(part.dir + 1) % DIRECTIONS.length];
      return [
        start,
        end,
        { i: start.i + perpendicular.i, j: start.j + perpendicular.j },
        { i: end.i + perpendicular.i, j: end.j + perpendicular.j }
      ];
    }
    if (MULTI_TERMINAL_TYPES.has(part.type)) {
      return [start, { i: start.i + direction.i, j: start.j + direction.j }, end];
    }
    return [start, end];
  };

  const isGridPoint = (i, j) => Number.isInteger(i) && Number.isInteger(j) &&
    i >= COLUMN_MIN && i <= COLUMN_MAX && j >= ROW_MIN && j <= ROW_MAX;

  const createSnapshot = (state) => ({
    schemaVersion: SCHEMA_VERSION,
    parts: state.parts.map((part) => ({
      type: part.type,
      i: part.i,
      j: part.j,
      dir: part.dir,
      val: part.val,
      closed: Boolean(part.closed),
      removed: Boolean(part.removed)
    })),
    wires: state.wires.map((wire) => ({
      i1: wire.i1,
      j1: wire.j1,
      i2: wire.i2,
      j2: wire.j2
    }))
  });

  const validateSnapshot = (snapshot) => {
    if (!snapshot || snapshot.schemaVersion !== SCHEMA_VERSION ||
        !Array.isArray(snapshot.parts) || snapshot.parts.length > MAX_PARTS ||
        !Array.isArray(snapshot.wires) || snapshot.wires.length > MAX_WIRES) {
      return false;
    }

    for (const part of snapshot.parts) {
      if (!part || !PART_TYPES.has(part.type) || !isGridPoint(part.i, part.j) ||
          !Number.isInteger(part.dir) || !DIRECTIONS[part.dir] ||
          !Number.isFinite(part.val) || typeof part.closed !== 'boolean' ||
          typeof part.removed !== 'boolean' ||
          partTerminals(part).some(({ i, j }) => !isGridPoint(i, j))) {
        return false;
      }
    }

    return snapshot.wires.every((wire) => wire &&
      isGridPoint(wire.i1, wire.j1) &&
      isGridPoint(wire.i2, wire.j2) &&
      (wire.i1 !== wire.i2 || wire.j1 !== wire.j2));
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { createSnapshot, validateSnapshot, partTerminals, STORAGE_KEY, SCHEMA_VERSION };
  }

  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  const lab = window.__lab;
  const circuit = lab?.circuit;
  const state = circuit?.BD;
  const app = document.getElementById('app');
  if (!circuit || !state || !app || !circuit.addPart || !circuit.addWire ||
      !circuit.undoB || !circuit.redoB) {
    console.error('Circuit persistence could not initialize: circuit builder APIs are unavailable.');
    return;
  }

  let disabled = false;
  let restoring = false;
  let lastSnapshotText = '';
  let reportedError = false;

  const reportFailure = (message, error) => {
    console.error(message, error);
    if (reportedError) return;
    reportedError = true;
    lab.triggerAlert?.('circuit-storage', 'تعذر حفظ حالة الدارة أو استعادتها.', 'warn', 6);
  };

  const currentSnapshot = () => createSnapshot(state);

  const save = (snapshot) => {
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
      reportFailure('Circuit persistence save failed.', error);
      return false;
    }
  };

  const restore = (snapshot) => {
    if (!validateSnapshot(snapshot)) {
      throw new TypeError('Invalid circuit snapshot; no circuit was restored.');
    }

    const wasCircuitLab = app.classList.contains('lab-circuit');
    restoring = true;
    try {
      if (!wasCircuitLab) document.querySelector('[data-lab="circuit"]')?.click();
      document.querySelector('[data-mode="build"]')?.click();
      document.getElementById('clearB')?.click();

      for (const record of snapshot.parts) {
        const part = circuit.addPart(
          record.type, record.i, record.j, record.dir, record.val, true
        );
        if (!part) throw new Error(`Could not restore circuit part: ${record.type}`);
        part.closed = record.closed;
        part.removed = record.removed;
      }
      for (const record of snapshot.wires) {
        if (!circuit.addWire([record.i1, record.j1], [record.i2, record.j2])) {
          throw new Error('Could not restore a saved wire.');
        }
      }

      state.hist.length = 0;
      state.redo.length = 0;
      state.sel = null;
      state.selW = null;
      state.tool = 'sel';
      state.place = null;
      lastSnapshotText = JSON.stringify(snapshot);
      save(snapshot);
    } finally {
      restoring = false;
      if (!wasCircuitLab) document.querySelector('[data-lab="chem"]')?.click();
    }
  };

  const capture = () => {
    if (disabled || restoring) return;
    const snapshot = currentSnapshot();
    if (!validateSnapshot(snapshot)) {
      reportFailure('Circuit state is invalid and was not saved.', new TypeError('Invalid circuit state.'));
      return;
    }
    save(snapshot);
  };

  const load = () => {
    let text;
    try {
      text = window.localStorage.getItem(STORAGE_KEY);
    } catch (error) {
      disabled = true;
      reportFailure('Circuit persistence load failed.', error);
      return null;
    }
    if (!text) return null;

    try {
      const snapshot = JSON.parse(text);
      if (!validateSnapshot(snapshot)) {
        throw new TypeError('Saved circuit data does not match the supported schema.');
      }
      return snapshot;
    } catch (error) {
      reportFailure('Saved circuit data is invalid and was ignored.', error);
      return null;
    }
  };

  const initialize = () => {
    const savedSnapshot = load();
    if (savedSnapshot) {
      try {
        restore(savedSnapshot);
      } catch (error) {
        reportFailure('Saved circuit could not be restored.', error);
      }
    } else {
      save(currentSnapshot());
    }
    lastSnapshotText = JSON.stringify(currentSnapshot());
    window.setInterval(capture, 250);
  };

  const api = { capture, restore, currentSnapshot, validateSnapshot };
  window.CircuitPersistence = api;
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize, { once: true });
  } else {
    initialize();
  }
})();
