(() => {
  const fallbackChemistry = {
    normalizeLiquid(liquid) {
      return ['acid', 'neutral', 'base'].includes(liquid) ? liquid : 'neutral';
    },
    getPh(liquid, volume = 0) {
      const normalized = this.normalizeLiquid(liquid);
      const base = normalized === 'acid' ? 2.6 : normalized === 'base' ? 11.8 : 7.0;
      const drift = Math.max(0, Number(volume) - 5) * 0.03;
      if (normalized === 'acid') return Number((base + drift).toFixed(2));
      if (normalized === 'base') return Number((base - drift).toFixed(2));
      return Number((base + (Math.sin(Number(volume) / 9) * 0.2)).toFixed(2));
    },
    describeReaction(liquid, reagent, amount) {
      const normalizedLiquid = this.normalizeLiquid(liquid);
      const safeAmount = Number(amount) || 0;
      if (normalizedLiquid === 'acid' && reagent === 'NaOH') {
        return safeAmount > 0.03 ? 'التحول نحو القلوية' : 'التفاعل يقترب من نقطة التعادل';
      }
      if (normalizedLiquid === 'base' && reagent === 'HCl') {
        return safeAmount > 0.03 ? 'القيمة الهيدروجينية تنخفض' : 'التفاعل یهبط نحو التعادل';
      }
      return 'التحليل الكيميائي مستمر في الكأس';
    }
  };

  const fallbackCircuits = {
    modeLabels: {
      series: 'توالٍ',
      parallel: 'توازٍ',
      rc: 'RC',
      rl: 'RL',
      rlc: 'RLC',
      build: 'بناء حر'
    },
    getModeLabel(mode) {
      return this.modeLabels[mode] || 'مخصص';
    },
    getPowerState(U, simResult) {
      const on = !!(U && U.on);
      const burnt = !!(U && U.burnt);
      const power = simResult && Number.isFinite(simResult.pB) ? simResult.pB : 0;
      if (burnt) return 'تحذير: المصباح متضرر';
      if (!on) return 'المفتاح مغلق';
      if (power > 3.0) return 'المصباح يعمل فوق القدرة الموصى بها';
      if (power > 0.8) return 'المصباح يعمل بشكل طبيعي';
      return 'الدائرة في حالة منخفضة الطاقة';
    },
    getFaultStatus(U, simResult) {
      if (!U) return 'جاهز';
      if (U.burnt) return 'فشل في المصباح';
      if (simResult && simResult.pB > 3.5) return 'استشعار حمل زائد';
      return 'الدائرة مستقرة';
    }
  };

  const chemistry = (typeof window !== 'undefined' && window.LabChemistry) || fallbackChemistry;
  const circuits = (typeof window !== 'undefined' && window.LabCircuits) || fallbackCircuits;

  function normalizeSnapshot(source = {}) {
    const data = source && typeof source === 'object' ? source : {};
    const voltage = Number(data.V ?? data.voltage ?? 6) || 6;
    const resistance = Number(data.R ?? data.resistance ?? 12) || 12;
    const capacitance = Number(data.C ?? data.capacitance ?? 0.25) || 0.25;
    const inductance = Number(data.L ?? data.inductance ?? 2) || 2;

    return {
      lab: data.lab || 'chem',
      mode: data.mode || 'series',
      on: !!data.on,
      V: voltage,
      R: resistance,
      C: capacitance,
      L: inductance,
      liquid: data.liquid || 'neutral',
      pH: Number(data.pH ?? data.ph ?? 7) || 7,
      volume: Number(data.volume ?? data.volumeMl ?? 0) || 0,
      burnt: !!data.burnt
    };
  }

  function evaluateChemistry(snapshot = {}) {
    const normalized = normalizeSnapshot(snapshot);
    const ph = typeof chemistry.getPh === 'function'
      ? chemistry.getPh(normalized.liquid, normalized.volume)
      : 7;
    const reaction = typeof chemistry.describeReaction === 'function'
      ? chemistry.describeReaction(normalized.liquid, 'NaOH', normalized.volume / 100)
      : 'التحليل الكيميائي مستمر في الكأس';

    return {
      liquid: normalized.liquid,
      ph,
      reaction,
      alert: ph < 5 ? 'الوسط حامضي ومتقدم' : ph > 9 ? 'الوسط قلوي ومتقدم' : 'التوازن الكيميائي مستقر'
    };
  }

  function evaluateCircuit(snapshot = {}) {
    const normalized = normalizeSnapshot(snapshot);
    const current = normalized.on ? normalized.V / Math.max(normalized.R, 1) : 0;
    const power = normalized.on ? normalized.V * current : 0;
    const status = typeof circuits.getPowerState === 'function'
      ? circuits.getPowerState({ on: normalized.on, burnt: normalized.burnt }, { pB: power })
      : 'الدائرة مستقرة';
    const fault = typeof circuits.getFaultStatus === 'function'
      ? circuits.getFaultStatus({ on: normalized.on, burnt: normalized.burnt }, { pB: power })
      : 'الدائرة مستقرة';

    return {
      mode: normalized.mode,
      modeLabel: typeof circuits.getModeLabel === 'function' ? circuits.getModeLabel(normalized.mode) : normalized.mode,
      current,
      power,
      voltage: normalized.V,
      status,
      fault
    };
  }

  function evaluateSnapshot(snapshot = {}) {
    const normalized = normalizeSnapshot(snapshot);
    return {
      normalized,
      chemistry: evaluateChemistry(normalized),
      circuit: evaluateCircuit(normalized),
      summary: {
        lab: normalized.lab,
        mode: normalized.mode,
        stable: !normalized.burnt && (normalized.on || normalized.lab !== 'circuit')
      }
    };
  }

  const LabSim = {
    normalizeSnapshot,
    evaluateChemistry,
    evaluateCircuit,
    evaluateSnapshot
  };

  if (typeof window !== 'undefined') {
    window.LabSim = LabSim;
    window.__lab = window.__lab || {};
    window.__lab.sim = LabSim;
    window.__lab.evaluateSimulation = evaluateSnapshot;
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { LabSim, normalizeSnapshot, evaluateChemistry, evaluateCircuit, evaluateSnapshot };
  }
})();
