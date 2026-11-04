const test = require('node:test');
const assert = require('node:assert/strict');

const { ScientificSimulation } = require('../js/sim/scientific-engine.js');
const { ScienceEffects } = require('../js/sim/science-effects.js');

const step = (state, action) => ScientificSimulation.stepThermalSimulation(state, action);

test('water saturation temperature follows pressure deterministically', () => {
  const atmospheric = ScientificSimulation.waterBoilingPointC(101.325);
  const lowPressure = ScientificSimulation.waterBoilingPointC(70);
  const highPressure = ScientificSimulation.waterBoilingPointC(200);

  assert.ok(Math.abs(atmospheric - 100) < 0.2);
  assert.ok(lowPressure < atmospheric);
  assert.ok(highPressure > atmospheric);
  assert.equal(ScientificSimulation.waterBoilingPointC(101.325), atmospheric);
});

test('heating water produces stable, deterministic boiling and cumulative evaporation', () => {
  const initial = ScientificSimulation.createThermalState({ volumeMl: 100, heaterPowerW: 500 });
  const first = step(initial, { dtSeconds: 240, heaterOn: true });
  const second = step(initial, { dtSeconds: 240, heaterOn: true });

  assert.deepEqual(first, second);
  assert.ok(first.events.some((event) => event.type === 'boiling_started'));
  assert.ok(first.events.some((event) => event.type === 'steam_started'));
  assert.ok(first.state.contents.evaporatedMassKg > 0);
  assert.ok(Math.abs(first.state.contents.temperatureC - 100) < 0.2);
  assert.ok(Math.abs(
    first.state.contents.massKg +
    first.state.contents.evaporatedMassKg +
    first.state.contents.spilledMassKg -
    initial.contents.massKg
  ) < 1e-9);
});

test('ordinary boiling does not damage borosilicate glass', () => {
  let state = ScientificSimulation.createThermalState({ volumeMl: 100, heaterPowerW: 500 });
  state = step(state, { dtSeconds: 260, heaterOn: true }).state;

  assert.equal(state.vessel.damage, 'intact');
  assert.equal(state.vessel.usable, true);
  assert.ok(state.contents.boiling);
});

test('a configured foaming condition can overflow a nearly full vessel', () => {
  const state = ScientificSimulation.createThermalState({
    volumeMl: 200,
    temperatureC: 100,
    vesselCapacityMl: 250,
    foamExpansionRatio: 2,
    heaterPowerW: 500
  });
  const result = step(state, { dtSeconds: 0.5, heaterOn: true });

  assert.ok(result.events.some((event) => event.type === 'overflow'));
  assert.ok(result.state.contents.spilledMassKg > 0);
  assert.ok(result.state.contents.massKg < state.contents.massKg);
});

test('a material-specific thermal shock damages the vessel and spills its contents', () => {
  const state = ScientificSimulation.createThermalState({
    vesselMaterial: 'soda_lime',
    volumeMl: 100,
    temperatureC: 110,
    wallTemperatureC: 25,
    pressureKPa: 200
  });
  const result = step(state, { dtSeconds: 0.1, heaterOn: false });

  assert.equal(result.state.vessel.damage, 'cracked');
  assert.equal(result.state.vessel.usable, false);
  assert.equal(result.state.contents.phase, 'spilled');
  assert.equal(result.state.contents.massKg, 0);
  assert.ok(result.events.some((event) => event.type === 'vessel_cracked'));
});

test('cooling below saturation stops boiling without creating extra events or mass', () => {
  const state = ScientificSimulation.createThermalState({
    volumeMl: 100,
    temperatureC: 100,
    wallTemperatureC: 100
  });
  state.contents.boiling = true;
  state.contents.boilIntensity = 0.2;
  const result = step(state, { dtSeconds: 1, heaterOn: false });

  assert.equal(result.state.contents.boiling, false);
  assert.ok(result.state.contents.temperatureC < 100);
  assert.ok(result.events.some((event) => event.type === 'boiling_stopped'));
  assert.equal(result.state.contents.massKg, state.contents.massKg);
});

test('a saturated liquid does not begin boiling without added heat', () => {
  const state = ScientificSimulation.createThermalState({
    volumeMl: 100,
    temperatureC: 100,
    wallTemperatureC: 100,
    ambientTemperatureC: 100
  });
  const result = step(state, { dtSeconds: 0.25, heaterOn: false });

  assert.equal(result.state.contents.boiling, false);
  assert.deepEqual(result.events, []);
});

test('thermal state is independent of frame partition at the integration step size', () => {
  const initial = ScientificSimulation.createThermalState({ volumeMl: 100, heaterPowerW: 500 });
  const oneStep = step(initial, { dtSeconds: 1, heaterOn: true });
  let partitioned = initial;
  for (let index = 0; index < 4; index += 1) {
    partitioned = step(partitioned, { dtSeconds: 0.25, heaterOn: true }).state;
  }

  assert.deepEqual(oneStep.state, partitioned);
});

test('only mapped science events reach visual and audio adapters', () => {
  const dispatched = [];
  const calls = [];
  const eventTarget = {
    dispatchEvent(event) {
      dispatched.push(event.detail.type);
      return true;
    }
  };
  const audio = {
    pop() { calls.push('pop'); },
    splash() { calls.push('splash'); }
  };
  const presented = ScienceEffects.present([
    { id: 1, type: 'bubbles_started', intensity: 0.2 },
    { id: 2, type: 'unmapped_event', intensity: 0 }
  ], { eventTarget, audio });

  assert.deepEqual(presented, [1, 2]);
  assert.deepEqual(dispatched, ['bubbles_started', 'unmapped_event']);
  assert.deepEqual(calls, ['pop']);
});

test('invalid model inputs fail explicitly', () => {
  assert.throws(() => ScientificSimulation.createThermalState({ vesselMaterial: 'unknown' }), /Unsupported vessel material/);
  assert.throws(() => step({ schemaVersion: 1 }, { dtSeconds: 0 }), /greater than zero/);
});
