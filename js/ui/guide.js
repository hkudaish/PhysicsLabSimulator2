(() => {
  const Guide = {
    setLabel(title, body) {
      const guide = document.getElementById('labGuide');
      if (!guide) return;
      const titleEl = guide.querySelector('#labGuideTitle');
      const bodyEl = guide.querySelector('#labGuideText');
      if (titleEl) titleEl.textContent = title;
      if (bodyEl) bodyEl.textContent = body;
      guide.classList.remove('hidden');
    },

    showDefault() {
      this.setLabel('ابدأ بخطوة صغيرة', 'اختر سائل الكأس، ثم استخدم السحّاحة أو شغّل المفتاح في وضع التوالي.');
    },

    explainCurrentMode(mode) {
      const labels = {
        series: 'الوضع المتسلسل',
        parallel: 'الوضع المتوازي',
        rc: 'وضع شحن المكثف',
        rl: 'وضع الملف',
        rlc: 'وضع الملف والمكثف',
        build: 'وضع البناء الحر'
      };
      this.setLabel('لوحة التشغيل', `أنت الآن في ${labels[mode] || 'وضع مخصص'}. جرّب ضبط الجهد أو المقاومة ثم أضف المادة المناسبة.`);
    }
  };

  window.LabGuide = Guide;
  window.__lab = window.__lab || {};
  window.__lab.guide = Guide;
})();
