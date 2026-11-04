(() => {
  const safeStorage = {
    get(key, fallback) {
      try {
        const value = localStorage.getItem(key);
        return value === null ? fallback : value;
      } catch (error) {
        return fallback;
      }
    },
    set(key, value) {
      try {
        localStorage.setItem(key, value);
      } catch (error) {
        // Ignore storage failures in private/strict browsing.
      }
    }
  };

  const applyGuide = () => {
    const hud = document.getElementById('hud');
    if (!hud || document.getElementById('labGuide')) return;

    const guide = document.createElement('div');
    guide.id = 'labGuide';
    guide.className = 'lab-guide';
    guide.setAttribute('role', 'note');
    guide.innerHTML = `
      <div class="lab-guide-header">
        <span>💡 مساعدة سريعة</span>
        <button type="button" class="lab-guide-close" aria-label="إخفاء المساعدة">✕</button>
      </div>
      <div class="lab-guide-body">
        <strong id="labGuideTitle">ابدأ بخطوة صغيرة</strong>
        <p id="labGuideText">اختر سائل الكأس، ثم استخدم السحّاحة أو شغّل المفتاح في وضع التوالي.</p>
      </div>
    `;

    const close = guide.querySelector('.lab-guide-close');
    close.addEventListener('click', () => {
      guide.classList.add('hidden');
      safeStorage.set('lab_guide_hidden', '1');
    });

    hud.appendChild(guide);
    return guide;
  };

  const setGuideTip = (title, text) => {
    const guide = document.getElementById('labGuide');
    if (!guide) return;
    const head = guide.querySelector('#labGuideTitle');
    const body = guide.querySelector('#labGuideText');
    if (head) head.textContent = title;
    if (body) body.textContent = text;
    guide.classList.remove('hidden');
  };

  const bindKeyboardShortcuts = () => {
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        document.querySelectorAll('.modal-backdrop, .titration-drawer').forEach((el) => {
          if (el && el.classList && el.classList.contains('open')) {
            el.classList.remove('open');
          }
          if (el && el.style && el.id === 'expModal') {
            el.style.display = 'none';
          }
        });
      }

      if ((event.key === '?' || event.key === '؟') && !event.shiftKey) {
        event.preventDefault();
        const guide = document.getElementById('labGuide');
        if (guide) {
          guide.classList.toggle('hidden');
        }
      }
    });
  };

  const initHelpfulAlerts = () => {
    const __lab = window.__lab || {};
    const runtime = window.LabRuntime || null;

    if (runtime && typeof runtime.triggerAlert === 'function') {
      __lab.triggerAlert = __lab.triggerAlert || runtime.triggerAlert.bind(runtime);
    } else {
      __lab.triggerAlert = __lab.triggerAlert || ((kind, message, level = 'info', timeout = 4) => {
        const alerts = document.getElementById('alerts');
        if (!alerts) return;
        const item = document.createElement('div');
        item.className = `alert ${level === 'warn' ? 'warn' : ''}${level === 'err' ? ' err' : ''}`.trim();
        item.textContent = message;
        alerts.appendChild(item);
        window.setTimeout(() => item.remove(), timeout * 1000);
      });
    }

    const originalOnTick = __lab.onTick;
    __lab.onTick = (data) => {
      if (typeof originalOnTick === 'function') {
        originalOnTick(data);
      }
      const guide = document.getElementById('labGuide');
      if (data && data.U && data.U.mode && guide && !guide.classList.contains('hidden')) {
        if (window.LabGuide && typeof window.LabGuide.explainCurrentMode === 'function') {
          window.LabGuide.explainCurrentMode(data.U.mode);
        } else {
          const modeText = data.U.mode === 'series' ? 'الوضع المتسلسل' : data.U.mode === 'parallel' ? 'الوضع المتوازي' : 'وضع مخصص';
          setGuideTip('لوحة التشغيل', `أنت الآن في ${modeText}. جرّب ضبط الجهد أو المقاومة ثم أضف المادة المناسبة.`);
        }
      }
    };
  };

  const initFirstVisitGuide = () => {
    const seen = safeStorage.get('lab_guide_hidden', '0');
    const guide = applyGuide();
    if (!guide) return;

    if (seen === '1') {
      guide.classList.add('hidden');
      return;
    }

    setGuideTip('ابدأ بخطوة صغيرة', 'اختر سائل الكأس، ثم استخدم السحّاحة أو شغّل المفتاح في وضع التوالي.');

    window.setTimeout(() => {
      if (!document.getElementById('labGuide').classList.contains('hidden')) {
        setGuideTip('مستوى التجربة', 'إذا واجهت صعوبة، افتح تجارب موجّهة من زر “التجارب الموجّهة” في الأعلى.');
      }
    }, 4500);
  };

  const ensureButtonState = () => {
    const openExpBtn = document.getElementById('openExpModalBtn');
    if (openExpBtn) {
      openExpBtn.setAttribute('aria-label', 'فتح التجارب الموجّهة');
    }

    const soundBtn = document.getElementById('sndBtn');
    if (soundBtn) {
      soundBtn.title = 'الصوت: تشغيل/إيقاف';
    }
  };

  const bootstrap = () => {
    window.__lab = window.__lab || {};
    ensureButtonState();
    initHelpfulAlerts();
    bindKeyboardShortcuts();
    initFirstVisitGuide();
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrap, { once: true });
  } else {
    bootstrap();
  }
})();
