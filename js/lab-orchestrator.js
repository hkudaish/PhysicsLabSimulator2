(() => {
  const getLabState = () => {
    if (window.LabState && typeof window.LabState.get === 'function') {
      return window.LabState;
    }
    window.__lab = window.__lab || {};
    if (!window.__lab.U) {
      window.__lab.U = {
        lab: 'chem',
        mode: 'series',
        on: true,
        V: 6,
        R: 12,
        C: 0.25,
        L: 2,
        liquid: 'neutral'
      };
    }
    return null;
  };

  const orchestrator = {
    currentLab() {
      const stateApi = getLabState();
      if (stateApi) {
        return stateApi.get('U.lab', 'chem');
      }
      return (window.__lab && window.__lab.U && window.__lab.U.lab) || 'chem';
    },

    setLab(labName) {
      const target = (labName || 'chem').toLowerCase();
      const stateApi = getLabState();
      if (stateApi) {
        stateApi.patch({ U: { lab: target } });
      } else if (window.__lab && window.__lab.U) {
        window.__lab.U.lab = target;
      }

      const btn = document.querySelector(`[data-lab="${target}"]`);
      if (btn && !btn.classList.contains('on')) {
        btn.click();
      }
    },

    syncFromGlobals() {
      const stateApi = getLabState();
      if (!stateApi) return;
      const legacy = window.__lab && window.__lab.U ? window.__lab.U : {};
      stateApi.patch({ U: {
        lab: legacy.lab || stateApi.get('U.lab', 'chem'),
        mode: legacy.mode || stateApi.get('U.mode', 'series'),
        on: legacy.on !== undefined ? legacy.on : stateApi.get('U.on', true),
        V: legacy.V !== undefined ? legacy.V : stateApi.get('U.V', 6),
        R: legacy.R !== undefined ? legacy.R : stateApi.get('U.R', 12),
        C: legacy.C !== undefined ? legacy.C : stateApi.get('U.C', 0.25),
        L: legacy.L !== undefined ? legacy.L : stateApi.get('U.L', 2),
        liquid: legacy.liquid || stateApi.get('U.liquid', 'neutral')
      }});
    },

    bootstrap() {
      const stateApi = getLabState();
      if (stateApi) {
        stateApi.patch({ U: { lab: stateApi.get('U.lab', 'chem') } });
      }
      this.syncFromGlobals();
      window.__lab = window.__lab || {};
      window.__lab.orchestrator = this;
      window.__lab.sim = window.LabSim || null;
      window.__lab.getCurrentLab = this.currentLab.bind(this);
      window.__lab.setLab = this.setLab.bind(this);
      window.__lab.evaluateSimulation = window.LabSim && window.LabSim.evaluateSnapshot
        ? window.LabSim.evaluateSnapshot.bind(window.LabSim)
        : null;
    }
  };

  if (typeof window !== 'undefined') {
    window.LabOrchestrator = orchestrator;
    window.__lab = window.__lab || {};
    window.__lab.orchestrator = orchestrator;

    if (typeof document !== 'undefined') {
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => orchestrator.bootstrap(), { once: true });
      } else {
        orchestrator.bootstrap();
      }
    }
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { orchestrator };
  }
})();
