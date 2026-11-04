(() => {
  const Chemistry = {
    normalizeLiquid(liquid) {
      return ['acid', 'neutral', 'base'].includes(liquid) ? liquid : 'neutral';
    },

    getPh(liquid, volume = 0) {
      const normalized = this.normalizeLiquid(liquid);
      const base = normalized === 'acid' ? 2.6 : normalized === 'base' ? 11.8 : 7.0;
      const drift = Math.max(0, volume - 5) * 0.03;
      if (normalized === 'acid') return Number((base + drift).toFixed(2));
      if (normalized === 'base') return Number((base - drift).toFixed(2));
      return Number((base + (Math.sin(volume / 9) * 0.2)).toFixed(2));
    },

    estimatePhState(liquid, volumeMl = 0, ph = null) {
      if (ph !== null && Number.isFinite(ph)) return Number(ph);
      return this.getPh(liquid, volumeMl);
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
      if (reagent === 'KI' && safeAmount > 0) {
        return 'تكوين راسب يوديد الرصاص أو تفاعل كيميائي مع الأيونات';
      }
      return 'التحليل الكيميائي مستمر في الكأس';
    }
  };

  if (typeof window !== 'undefined') {
    window.LabChemistry = Chemistry;
    window.__lab = window.__lab || {};
    window.__lab.chemistry = Chemistry;
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { Chemistry };
  }
})();
