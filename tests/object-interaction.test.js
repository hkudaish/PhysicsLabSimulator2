const test = require('node:test');
const assert = require('node:assert/strict');

const {
  getCircuitTerminals,
  transformPoint,
  projectPoint,
  unprojectToPlane
} = require('../js/object-interaction.js');
const {
  createSnapshot: createCircuitSnapshot,
  validateSnapshot: validateCircuitSnapshot,
  partTerminals,
  SCHEMA_VERSION: CIRCUIT_SCHEMA_VERSION
} = require('../js/circuit-persistence.js');
const {
  createSnapshot,
  validateSnapshot,
  SCHEMA_VERSION
} = require('../js/apparatus-persistence.js');

const toolDefs = [
  { en: 'Ring stand' },
  { en: 'Bunsen burner' }
];

test('circuit terminal coordinates follow all four component orientations', () => {
  const expected = [
    [{ i: 2, j: 3 }, { i: 4, j: 3 }],
    [{ i: 2, j: 3 }, { i: 2, j: 5 }],
    [{ i: 2, j: 3 }, { i: 0, j: 3 }],
    [{ i: 2, j: 3 }, { i: 2, j: 1 }]
  ];

  expected.forEach((coordinates, dir) => {
    assert.deepEqual(
      getCircuitTerminals({ i: 2, j: 3, dir }).map(({ i, j }) => ({ i, j })),
      coordinates
    );
  });
});

test('terminal coordinates do not invent polarity for unclassified parts', () => {
  const terminals = getCircuitTerminals({ i: 0, j: 0, dir: 0, type: 'battery' });

  assert.deepEqual(terminals.map(({ label }) => label), ['الطرف A', 'الطرف B']);
});

test('multi-terminal devices report all modelled connection points', () => {
  const transistor = getCircuitTerminals({ i: 1, j: 2, dir: 0, type: 'npn' });
  const relay = getCircuitTerminals({ i: 1, j: 2, dir: 0, type: 'relay' });
  const inverter = getCircuitTerminals({ i: 1, j: 2, dir: 0, type: 'not' });

  assert.deepEqual(transistor.map(({ i, j }) => [i, j]), [[1, 2], [2, 2], [3, 2]]);
  assert.deepEqual(relay.map(({ i, j }) => [i, j]), [[1, 2], [3, 2], [1, 3], [3, 3]]);
  assert.deepEqual(inverter.map(({ i, j }) => [i, j]), [[1, 2], [3, 2]]);
});

test('invalid or incomplete circuit coordinates have no reported terminals', () => {
  assert.deepEqual(getCircuitTerminals(null), []);
  assert.deepEqual(getCircuitTerminals({ i: 1, j: 2, dir: 4 }), []);
  assert.deepEqual(getCircuitTerminals({ i: Number.NaN, j: 2, dir: 1 }), []);
});

test('scene coordinate helpers preserve transforms and camera projection coordinates', () => {
  const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  assert.deepEqual(transformPoint(identity, [2, 3, 4, 1]), [2, 3, 4, 1]);
  assert.deepEqual(projectPoint([2, 3, 4], identity, identity), [2, 3, 4, 1]);
  const intersection = unprojectToPlane(
    { x: 0, y: 0 },
    identity,
    identity,
    { x: 0, y: 2, z: -2 },
    0
  );
  assert.equal(intersection.x, 0);
  assert.ok(Math.abs(intersection.z - 1) < 1e-10);
});

test('circuit snapshots preserve supported parts, wire endpoints and operating state', () => {
  const snapshot = createCircuitSnapshot({
    parts: [{
      type: 'switch',
      i: 0,
      j: 1,
      dir: 0,
      val: 1,
      closed: true,
      removed: false
    }],
    wires: [{ i1: 2, j1: 1, i2: 3, j2: 1 }]
  });

  assert.deepEqual(snapshot, {
    schemaVersion: CIRCUIT_SCHEMA_VERSION,
    parts: [{
      type: 'switch',
      i: 0,
      j: 1,
      dir: 0,
      val: 1,
      closed: true,
      removed: false
    }],
    wires: [{ i1: 2, j1: 1, i2: 3, j2: 1 }]
  });
  assert.equal(validateCircuitSnapshot(snapshot), true);
  assert.deepEqual(partTerminals(snapshot.parts[0]), [{ i: 0, j: 1 }, { i: 2, j: 1 }]);
});

test('circuit snapshot validation rejects bad bounds, types, directions and wire coordinates', () => {
  const valid = {
    schemaVersion: CIRCUIT_SCHEMA_VERSION,
    parts: [{
      type: 'resistor',
      i: 0,
      j: 1,
      dir: 0,
      val: 10,
      closed: false,
      removed: false
    }],
    wires: []
  };
  assert.equal(validateCircuitSnapshot(valid), true);
  assert.equal(validateCircuitSnapshot({ ...valid, schemaVersion: 999 }), false);
  assert.equal(validateCircuitSnapshot({
    ...valid,
    parts: [{ ...valid.parts[0], type: 'unknown' }]
  }), false);
  assert.equal(validateCircuitSnapshot({
    ...valid,
    parts: [{ ...valid.parts[0], dir: 4 }]
  }), false);
  assert.equal(validateCircuitSnapshot({
    ...valid,
    parts: [{ ...valid.parts[0], i: 5 }]
  }), false);
  assert.equal(validateCircuitSnapshot({
    ...valid,
    wires: [{ i1: 0, j1: 0, i2: 6, j2: 0 }]
  }), false);
  assert.equal(validateCircuitSnapshot({
    ...valid,
    wires: [{ i1: 0, j1: 0, i2: 0, j2: 0 }]
  }), false);
});

test('apparatus snapshots preserve stable tool identity, pose and burner state', () => {
  const snapshot = createSnapshot([{
    d: { en: 'Bunsen burner' },
    grp: {
      position: { x: 200, z: 1 },
      rotation: { y: Math.PI / 2 },
      userData: { lit: true }
    }
  }]);

  assert.deepEqual(snapshot, {
    schemaVersion: SCHEMA_VERSION,
    items: [{ tool: 'Bunsen burner', x: 200, z: 1, rotationY: Math.PI / 2, lit: true }]
  });
  assert.equal(validateSnapshot(snapshot, toolDefs), true);
});

test('apparatus snapshot validation rejects unsupported, malformed and overlapping items', () => {
  const valid = {
    schemaVersion: SCHEMA_VERSION,
    items: [{ tool: 'Ring stand', x: 200, z: 0, rotationY: 0, lit: false }]
  };
  assert.equal(validateSnapshot(valid, toolDefs), true);
  assert.equal(validateSnapshot({ ...valid, schemaVersion: 999 }, toolDefs), false);
  assert.equal(validateSnapshot({
    schemaVersion: SCHEMA_VERSION,
    items: [{ ...valid.items[0], tool: 'Unknown apparatus' }]
  }, toolDefs), false);
  assert.equal(validateSnapshot({
    schemaVersion: SCHEMA_VERSION,
    items: [
      valid.items[0],
      { tool: 'Bunsen burner', x: 201, z: 0, rotationY: 0, lit: true }
    ]
  }, toolDefs), false);
  assert.equal(validateSnapshot({
    schemaVersion: SCHEMA_VERSION,
    items: [{ ...valid.items[0], x: Number.NaN }]
  }, toolDefs), false);
  assert.equal(validateSnapshot({
    schemaVersion: SCHEMA_VERSION,
    items: [{ ...valid.items[0], x: 187 }]
  }, toolDefs), false);
  assert.equal(validateSnapshot({
    schemaVersion: SCHEMA_VERSION,
    items: Array.from({ length: 101 }, (_, index) => ({
      tool: 'Ring stand',
      x: 187.4 + (index % 10) * 2,
      z: -4.6 + Math.floor(index / 10) * 2,
      rotationY: 0,
      lit: false
    }))
  }, toolDefs), false);
});
