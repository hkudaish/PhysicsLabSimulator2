(() => {
  const Circuits = {
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
    },

    normalizeCircuitState(input) {
      const safe = input || {};
      return {
        lab: safe.lab || 'circuit',
        mode: safe.mode || 'series',
        on: !!safe.on,
        V: Number(safe.V) || 6,
        R: Number(safe.R) || 12,
        C: Number(safe.C) || 0.25,
        L: Number(safe.L) || 2
      };
    }
  };

  if (typeof window !== 'undefined') {
    window.LabCircuits = Circuits;
    window.__lab = window.__lab || {};
    window.__lab.circuits = Circuits;
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { Circuits };
  }
})();
