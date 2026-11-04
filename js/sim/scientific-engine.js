(() => {
  const RULE_VERSION = '1.0.0';
  const WATER = Object.freeze({
    id: 'water',
    specificHeatJPerKgK: 4182,
    latentHeatJPerKg: 2256000,
    densityKgPerL: 0.997
  });
  const VESSELS = Object.freeze({
    borosilicate: {
      heatCapacityJPerK: 180,
      wallLagSeconds: 4,
      thermalShockLimitC: 160,
      serviceTemperatureC: 500
    },
    soda_lime: {
      heatCapacityJPerK: 220,
      wallLagSeconds: 7,
      thermalShockLimitC: 45,
      serviceTemperatureC: 150
    }
  });
  const MAX_INTEGRATION_STEP_SECONDS = 0.25;
  const MIN_PRESSURE_KPA = 0.6;
  const MAX_PRESSURE_KPA = 2000;

  const finite = (value, label) => {
    const number = Number(value);
    if (!Number.isFinite(number)) throw new TypeError(`${label} must be a finite number`);
    return number;
  };

  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

  function waterBoilingPointC(pressureKPa) {
    const pressure = clamp(finite(pressureKPa, 'pressureKPa'), MIN_PRESSURE_KPA, MAX_PRESSURE_KPA);
    const pressureMmHg = pressure * 760 / 101.325;
    const constants = pressure <= 101.325
      ? { A: 8.07131, B: 1730.63, C: 233.426 }
      : { A: 8.14019, B: 1810.94, C: 244.485 };
    return constants.B / (constants.A - Math.log10(pressureMmHg)) - constants.C;
  }

  function createThermalState(options = {}) {
    const material = options.vesselMaterial || 'borosilicate';
    const vesselSpec = VESSELS[material];
    if (!vesselSpec) throw new RangeError(`Unsupported vessel material: ${material}`);
    if (options.substanceId && options.substanceId !== WATER.id) {
      throw new RangeError(`Unsupported thermal substance: ${options.substanceId}`);
    }

    const initialTempC = finite(options.temperatureC ?? 25, 'temperatureC');
    const volumeMl = Math.max(0, finite(options.volumeMl ?? 100, 'volumeMl'));
    const massKg = volumeMl / 1000 * WATER.densityKgPerL;
    const wallTempC = finite(options.wallTemperatureC ?? initialTempC, 'wallTemperatureC');

    return {
      schemaVersion: 1,
      ruleVersion: RULE_VERSION,
      timeSeconds: 0,
      environment: {
        ambientTemperatureC: finite(options.ambientTemperatureC ?? 25, 'ambientTemperatureC'),
        pressureKPa: clamp(finite(options.pressureKPa ?? 101.325, 'pressureKPa'), MIN_PRESSURE_KPA, MAX_PRESSURE_KPA),
        heatLossCoefficientWPerK: Math.max(0, finite(options.heatLossCoefficientWPerK ?? 1.5, 'heatLossCoefficientWPerK'))
      },
      heatSource: {
        on: false,
        powerW: Math.max(0, finite(options.heaterPowerW ?? 500, 'heaterPowerW')),
        transferEfficiency: clamp(finite(options.heatTransferEfficiency ?? 0.65, 'heatTransferEfficiency'), 0, 1)
      },
      vessel: {
        material,
        temperatureC: wallTempC,
        capacityMl: Math.max(volumeMl, finite(options.vesselCapacityMl ?? 250, 'vesselCapacityMl')),
        heatCapacityJPerK: vesselSpec.heatCapacityJPerK,
        wallLagSeconds: vesselSpec.wallLagSeconds,
        thermalShockLimitC: vesselSpec.thermalShockLimitC,
        serviceTemperatureC: vesselSpec.serviceTemperatureC,
        damage: 'intact',
        usable: true
      },
      contents: {
        substanceId: WATER.id,
        phase: 'liquid',
        temperatureC: initialTempC,
        volumeMl,
        massKg,
        specificHeatJPerKgK: WATER.specificHeatJPerKgK,
        latentHeatJPerKg: WATER.latentHeatJPerKg,
        boilingPointC: waterBoilingPointC(options.pressureKPa ?? 101.325),
        foamExpansionRatio: Math.max(1, finite(options.foamExpansionRatio ?? 1, 'foamExpansionRatio')),
        boiling: false,
        boilIntensity: 0,
        evaporatedMassKg: 0,
        spilledMassKg: 0
      },
      nextEventId: 1
    };
  }

  function emit(state, type, intensity, data = {}) {
    const event = {
      id: state.nextEventId,
      type,
      timeSeconds: state.timeSeconds,
      intensity: clamp(intensity, 0, 1),
      data
    };
    state.nextEventId += 1;
    return event;
  }

  function applyVesselDamage(state, events) {
    const { vessel, contents } = state;
    if (vessel.damage !== 'intact') return;

    const gradientC = Math.abs(contents.temperatureC - vessel.temperatureC);
    const thermalShock = gradientC > vessel.thermalShockLimitC;
    const overTemperature = vessel.temperatureC > vessel.serviceTemperatureC;
    if (!thermalShock && !overTemperature) return;

    const severity = Math.max(
      gradientC / vessel.thermalShockLimitC,
      vessel.temperatureC / vessel.serviceTemperatureC
    );
    vessel.damage = severity >= 2 ? 'broken' : 'cracked';
    vessel.usable = false;
    state.heatSource.on = false;
    contents.spilledMassKg += contents.massKg;
    contents.massKg = 0;
    contents.volumeMl = 0;
    contents.phase = 'spilled';
    contents.boiling = false;
    contents.boilIntensity = 0;

    events.push(emit(state, vessel.damage === 'broken' ? 'vessel_broken' : 'vessel_cracked', clamp(severity / 2, 0, 1), {
      material: vessel.material,
      temperatureC: vessel.temperatureC,
      thermalGradientC: gradientC,
      spilledMassKg: contents.spilledMassKg
    }));
  }

  function stepSubstep(state, dtSeconds) {
    const events = [];
    const { contents, vessel, environment, heatSource } = state;
    const wasBoiling = contents.boiling;
    const previousIntensity = contents.boilIntensity;
    const initialTempC = contents.temperatureC;
    const heaterPowerW = heatSource.on && vessel.usable ? heatSource.powerW * heatSource.transferEfficiency : 0;
    const heatLossW = environment.heatLossCoefficientWPerK * (initialTempC - environment.ambientTemperatureC);
    const netEnergyJ = (heaterPowerW - heatLossW) * dtSeconds;
    const pressureBoilingPointC = waterBoilingPointC(environment.pressureKPa);
    contents.boilingPointC = pressureBoilingPointC;

    if (contents.massKg > 0 && vessel.usable) {
      const heatCapacityJPerK = contents.massKg * contents.specificHeatJPerKgK + vessel.heatCapacityJPerK;
      const energyToBoilJ = Math.max(0, (pressureBoilingPointC - initialTempC) * heatCapacityJPerK);

      if ((initialTempC >= pressureBoilingPointC && (netEnergyJ > 0 || (wasBoiling && netEnergyJ >= 0))) ||
          (netEnergyJ > 0 && netEnergyJ >= energyToBoilJ)) {
        const latentEnergyJ = initialTempC >= pressureBoilingPointC
          ? netEnergyJ
          : netEnergyJ - energyToBoilJ;
        contents.temperatureC = pressureBoilingPointC;
        contents.boiling = true;
        const evaporatedMassKg = Math.min(contents.massKg, latentEnergyJ / contents.latentHeatJPerKg);
        if (evaporatedMassKg > 0) {
          contents.massKg -= evaporatedMassKg;
          contents.evaporatedMassKg += evaporatedMassKg;
          contents.volumeMl = contents.massKg / WATER.densityKgPerL * 1000;
          contents.phase = contents.massKg > 0 ? 'liquid_and_vapor' : 'vapor';
          events.push(emit(state, 'steam_started', clamp(evaporatedMassKg / (0.00002 * dtSeconds), 0, 1), {
            evaporatedMassKg,
            remainingMassKg: contents.massKg
          }));
        }

        const latentPowerW = evaporatedMassKg * contents.latentHeatJPerKg / dtSeconds;
        contents.boilIntensity = clamp(latentPowerW / 350, 0, 1);
        if (!wasBoiling) events.push(emit(state, 'boiling_started', Math.max(contents.boilIntensity, 0.1), {
          boilingPointC: pressureBoilingPointC,
          pressureKPa: environment.pressureKPa
        }));
        if (contents.boilIntensity >= 0.35 && previousIntensity < 0.35) {
          events.push(emit(state, 'boiling_intensified', contents.boilIntensity, { level: 'vigorous' }));
        }
        if (contents.boilIntensity > 0 && previousIntensity === 0) {
          events.push(emit(state, 'bubbles_started', contents.boilIntensity, {}));
        }

        const foamedVolumeMl = contents.volumeMl * contents.foamExpansionRatio;
        if (foamedVolumeMl > vessel.capacityMl && contents.massKg > 0) {
          const retainedMassKg = vessel.capacityMl / contents.foamExpansionRatio / 1000 * WATER.densityKgPerL;
          const overflowMassKg = Math.max(0, contents.massKg - retainedMassKg);
          if (overflowMassKg > 0) {
            contents.massKg -= overflowMassKg;
            contents.volumeMl = contents.massKg / WATER.densityKgPerL * 1000;
            contents.spilledMassKg += overflowMassKg;
            events.push(emit(state, 'overflow', clamp(overflowMassKg / Math.max(contents.spilledMassKg, 0.001), 0, 1), {
              spilledMassKg: overflowMassKg,
              remainingVolumeMl: contents.volumeMl
            }));
          }
        }
      } else {
        contents.temperatureC += netEnergyJ / heatCapacityJPerK;
        contents.boiling = false;
        contents.boilIntensity = 0;
        contents.phase = 'liquid';
      }
    } else if (vessel.usable) {
      vessel.temperatureC += netEnergyJ / vessel.heatCapacityJPerK;
      contents.boiling = false;
      contents.boilIntensity = 0;
    }

    if (contents.massKg > 0) {
      const wallFollow = 1 - Math.exp(-dtSeconds / vessel.wallLagSeconds);
      vessel.temperatureC += (contents.temperatureC - vessel.temperatureC) * wallFollow;
    }

    state.timeSeconds += dtSeconds;
    applyVesselDamage(state, events);

    if (wasBoiling && !contents.boiling) {
      events.push(emit(state, 'boiling_stopped', 0, { temperatureC: contents.temperatureC }));
    }
    if (wasBoiling && contents.boilIntensity < 0.35 && previousIntensity >= 0.35 && contents.boiling) {
      events.push(emit(state, 'boiling_reduced', contents.boilIntensity, {}));
    }

    return events;
  }

  function stepThermalSimulation(inputState, action = {}) {
    if (!inputState || inputState.schemaVersion !== 1) {
      throw new TypeError('A version 1 scientific state is required');
    }
    const state = JSON.parse(JSON.stringify(inputState));
    const dtSeconds = finite(action.dtSeconds ?? 0, 'dtSeconds');
    if (dtSeconds <= 0) throw new RangeError('dtSeconds must be greater than zero');

    if (action.pressureKPa !== undefined) {
      state.environment.pressureKPa = clamp(finite(action.pressureKPa, 'pressureKPa'), MIN_PRESSURE_KPA, MAX_PRESSURE_KPA);
    }
    if (action.ambientTemperatureC !== undefined) {
      state.environment.ambientTemperatureC = finite(action.ambientTemperatureC, 'ambientTemperatureC');
    }
    if (action.heatLossCoefficientWPerK !== undefined) {
      state.environment.heatLossCoefficientWPerK = Math.max(0, finite(action.heatLossCoefficientWPerK, 'heatLossCoefficientWPerK'));
    }
    if (action.heaterPowerW !== undefined) {
      state.heatSource.powerW = Math.max(0, finite(action.heaterPowerW, 'heaterPowerW'));
    }
    if (action.heatTransferEfficiency !== undefined) {
      state.heatSource.transferEfficiency = clamp(finite(action.heatTransferEfficiency, 'heatTransferEfficiency'), 0, 1);
    }
    if (action.heaterOn !== undefined) state.heatSource.on = Boolean(action.heaterOn);
    if (action.foamExpansionRatio !== undefined) {
      state.contents.foamExpansionRatio = Math.max(1, finite(action.foamExpansionRatio, 'foamExpansionRatio'));
    }

    const events = [];
    let remaining = dtSeconds;
    while (remaining > 0) {
      const substep = Math.min(remaining, MAX_INTEGRATION_STEP_SECONDS);
      events.push(...stepSubstep(state, substep));
      remaining = Math.max(0, remaining - substep);
    }

    return { state, events };
  }

  const ScientificSimulation = Object.freeze({
    RULE_VERSION,
    WATER,
    VESSELS,
    waterBoilingPointC,
    createThermalState,
    stepThermalSimulation
  });

  if (typeof window !== 'undefined') {
    window.LabScientificSimulation = ScientificSimulation;
    window.__lab = window.__lab || {};
    window.__lab.scientificSimulation = ScientificSimulation;
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { ScientificSimulation };
  }
})();
