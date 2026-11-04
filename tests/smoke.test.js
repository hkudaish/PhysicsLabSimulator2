const test = require('node:test');
const assert = require('node:assert/strict');

const stateModule = require('../js/app-state.js');
const { Chemistry } = require('../js/sim/chemistry.js');
const { Circuits } = require('../js/sim/circuits.js');
const { LabSim } = require('../js/sim/engine.js');

test('state API patch keeps state synchronized with legacy object', () => {
  const root = { __lab: { U: { lab: 'chem', V: 6 } } };
  global.window = root;
  stateModule.api.patch({ U: { mode: 'rc', V: 12 } });
  assert.equal(global.window.__lab.U.mode, 'rc');
  assert.equal(global.window.__lab.U.V, 12);
  assert.equal(stateModule.api.get('U.mode', 'series'), 'rc');
  delete global.window;
});

test('chemistry module computes reasonable pH values', () => {
  assert.ok(Chemistry.getPh('acid', 0) < 3.5);
  assert.ok(Chemistry.getPh('base', 0) > 11);
  assert.equal(Chemistry.normalizeLiquid('unknown'), 'neutral');
});

test('circuit utility state normalization and labels work', () => {
  const normalized = Circuits.normalizeCircuitState({ lab: 'circuit', mode: 'rc', V: 9, R: 15, C: 0.5, L: 3, on: true });
  assert.equal(normalized.mode, 'rc');
  assert.equal(normalized.V, 9);
  assert.equal(Circuits.getModeLabel('parallel'), 'توازٍ');
  assert.equal(Circuits.getFaultStatus({ burnt: true }, { pB: 2 }), 'فشل في المصباح');
});

test('simulation engine summarizes circuit and chemistry state without touching legacy globals', () => {
  const summary = LabSim.evaluateSnapshot({ lab: 'chem', liquid: 'acid', volume: 12, mode: 'rc', V: 9, R: 12, C: 0.4, L: 2, on: true });
  assert.ok(summary.chemistry.ph <= 3.5);
  assert.equal(summary.circuit.mode, 'rc');
  assert.ok(summary.circuit.power >= 0);
  assert.equal(summary.summary.lab, 'chem');
});

const historyModule = require('../js/app-history.js');

test('history reset clears stale state without retaining completed experiment flags', () => {
  const previousState = {
    U: { lab: 'chem', mode: 'series', V: 8, R: 10, liquid: 'acid', on: true },
    ui: { help: true },
    experiments: { completed: { chem_titration: true } }
  };

  global.window = {
    __lab: {
      state: previousState,
      U: previousState.U
    },
    LabState: {
      getState() { return global.window.__lab.state; },
      restore(snapshot) {
        global.window.__lab.state = snapshot;
        global.window.__lab.U = snapshot.U;
      },
      subscribe() { return () => {}; }
    }
  };

  historyModule.capture(previousState);
  historyModule.reset();

  assert.deepEqual(global.window.__lab.state.experiments.completed, {});
  assert.equal(global.window.__lab.U.lab, 'chem');
  assert.equal(global.window.__lab.U.mode, 'series');

  historyModule.restore(previousState);
  assert.equal(global.window.__lab.U.V, 8);
  delete global.window;
});
