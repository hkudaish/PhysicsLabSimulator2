/**
 * Virtual Lab - Guided Interactive Experiments & Scenarios
 * مهام وتجارب مخبرية موجّهة مع التحقق التلقائي من الخطوات والنتائج
 */
(() => {
  const Experiments = {
    activeExpId: null,
    completed: {}, // { expId: true }
    modal: null,

    list: [
      // Chemistry Experiments
      {
        id: 'chem_titration',
        lab: 'chem',
        title: '🧪 معايرة حمض وقاعدة وتحديد نقطة التعادل',
        desc: 'تعلم كيفية استخدام السحّاحة وكاشف الفينول فثالين للوصول إلى نقطة التكافؤ بدقة متناهية.',
        steps: [
          {
            id: 's1',
            text: 'اختر سائل الكأس ليكون "حمض HCl".',
            check: (data) => data.U && data.U.liquid === 'acid'
          },
          {
            id: 's2',
            text: 'فعّل كاشف الفينول فثالين من زر "فينول فثالين" في لوحة السحّاحة.',
            check: () => {
              const b = document.getElementById('indBtn');
              return b && b.classList.contains('on');
            }
          },
          {
            id: 's3',
            text: 'افتح صنبور السحّاحة لإنزال محلول NaOH حتى يقترب الـ pH من التعادل.',
            check: (data) => data.Te && data.Te.vol > 0.5
          },
          {
            id: 's4',
            text: 'أوقف الصنبور فور ثبات المحلول في النطاق القلوي الخفيف (pH بين 7.5 و 10.0).',
            check: (data) => data.G && data.G.ph >= 7.5 && data.G.ph <= 10.2 && (!data.Te || !data.Te.tap)
          }
        ]
      },
      {
        id: 'chem_golden_rain',
        lab: 'chem',
        title: '🧪 تفاعل المطر الذهبي (ترسيب يوديد الرصاص PbI₂)',
        desc: 'اخلط محلولي يوديد البوتاسيوم ونترات الرصاص لمشاهدة بلورات يوديد الرصاص الذهبية.',
        steps: [
          {
            id: 's1',
            text: 'اختر الكاشف "KI" وأضف جرعة (+0.05 mol) إلى الكأس.',
            check: () => true, // will be verified via action listener or precipitate
            done: false
          },
          {
            id: 's2',
            text: 'اختر الكاشف "PbNO3" وأضف جرعة (+0.05 mol) لتكوين الراسب.',
            check: (data) => data.G && data.Oe && data.Oe.mass > 0.05
          },
          {
            id: 's3',
            text: 'أشعل الموقد (زر "إشعال اللهب") وسخّن المحلول حتى ترتفع الحرارة فوق 60°C.',
            check: (data) => data.G && data.G.temp >= 60
          }
        ]
      },
      {
        id: 'chem_alkali_react',
        lab: 'chem',
        title: '🧪 نشاط الفلزات القلوية مع الماء',
        desc: 'اختبر نشاط عناصر المجموعة الأولى (الصوديوم Na أو البوتاسيوم K) مع الماء وانطلاق الهيدروجين.',
        steps: [
          {
            id: 's1',
            text: 'تأكد من أن سائل الكأس هو "ماء" متعادل.',
            check: (data) => data.U && data.U.liquid === 'neutral'
          },
          {
            id: 's2',
            text: 'افتح الجدول الدوري وأسقط قطعة صوديوم (Na) أو بوتاسيوم (K) في الكأس.',
            check: (data) => {
              if (data.ri && data.ri.some((p) => p.sym === 'Na' || p.sym === 'K')) {
                return true;
              }
              return false;
            }
          },
          {
            id: 's3',
            text: 'تحقق من ارتفاع قلوية المحلول لتتجاوز pH 11.0 بسبب تكوّن هيدروكسيد الفلز.',
            check: (data) => data.G && data.G.ph >= 11.0
          }
        ]
      },

      // Circuits Experiments
      {
        id: 'circuit_ohms_law',
        lab: 'circuit',
        title: '⚡ قانون أوم وتشغيل المصباح الاسمي',
        desc: 'اضبط قيم الجهد والمقاومة في الدارة المتوالية لتشغيل المصباح بقدرته المثالية دون حرقه.',
        steps: [
          {
            id: 's1',
            text: 'اضبط طريقة التوصيل على "توالٍ".',
            check: (data) => data.U && data.U.mode === 'series'
          },
          {
            id: 's2',
            text: 'اضبط جهد البطارية على 6.0 V (الجهد المقنن للمصباح).',
            check: (data) => data.U && Math.abs(data.U.V - 6.0) < 0.2
          },
          {
            id: 's3',
            text: 'اضبط المقاومة R1 على 12 Ω.',
            check: (data) => data.U && Math.abs(data.U.R - 12) < 1.0
          },
          {
            id: 's4',
            text: 'شغّل المفتاح وتأكد من عمل المصباح (القدرة ≈ 1.5 W إلى 3 W) دون احتراقه.',
            check: (data) => {
              const sim = data.simResult;
              return data.U && data.U.on && !data.U.burnt && sim && sim.pB >= 1.0 && sim.pB <= 3.5;
            }
          }
        ]
      },
      {
        id: 'circuit_rc_tau',
        lab: 'circuit',
        title: '⚡ شحن وتفريغ المكثف وثابت الزمن τ',
        desc: 'راقب الشحن الأسي للمكثف حتى يصل إلى 63% من جهد المصدر، ثم فحص عملية التفريغ.',
        steps: [
          {
            id: 's1',
            text: 'اختر طريقة التوصيل "RC".',
            check: (data) => data.U && data.U.mode === 'rc'
          },
          {
            id: 's2',
            text: 'اضغط زر "شحن" وانتظر شحن المكثف حتى يتجاوز 60% من جهد البطارية.',
            check: (data) => {
              const sim = data.simResult;
              return data.U && data.U.sw === 'charge' && sim && sim.vC >= (data.U.V * 0.6);
            }
          },
          {
            id: 's3',
            text: 'اضغط زر "تفريغ" لمشاهدة تفريغ الطاقة في المقاومة والمصباح.',
            check: (data) => data.U && data.U.sw === 'discharge'
          }
        ]
      },
      {
        id: 'circuit_logic_gates',
        lab: 'circuit',
        title: '⚡ دوائر البوابات المنطقية الرقمية',
        desc: 'استكشف البوابات المنطقية AND / OR / NOT في وضع البناء الحر وتحقق من جدول الحقيقة.',
        steps: [
          {
            id: 's1',
            text: 'ادخل إلى وضع "🛠 بناء" (لوحة التوصيل الحرة).',
            check: (data) => data.U && data.U.mode === 'build'
          },
          {
            id: 's2',
            text: 'اختر قالباً جاهزاً لبوابة منطقية من أزرار القوالب (AND أو OR أو NOT).',
            check: (data) => {
              const BD = window.__lab && window.__lab.BD;
              return BD && BD.parts && BD.parts.some((p) => ['and', 'or', 'not', 'nand', 'nor', 'xor'].includes(p.type));
            }
          },
          {
            id: 's3',
            text: 'فعّل المفتاح ولاحظ تغير حالة الخرج المنطقي وإضاءة المؤشر.',
            check: (data) => data.U && data.U.on
          }
        ]
      }
    ],

    getCurrentStateSnapshot() {
      const stateApi = window.LabState;
      const baseState = stateApi && typeof stateApi.getState === 'function'
        ? stateApi.getState()
        : (window.__lab && window.__lab.state ? window.__lab.state : { U: {}, ui: {}, experiments: { completed: {} } });
      const legacyState = (window.__lab && window.__lab.U) || (baseState && baseState.U) || {};
      const snapshot = {
        ...(baseState || {}),
        U: { ...(baseState && baseState.U ? baseState.U : {}), ...(legacyState || {}) }
      };

      if (window.__lab && window.__lab.sim && typeof window.__lab.sim.evaluateSnapshot === 'function') {
        const sim = window.__lab.sim.evaluateSnapshot(snapshot.U || {});
        snapshot.simResult = sim.circuit || {};
        snapshot.G = sim.chemistry || {};
      }

      if (snapshot.U && !snapshot.U.lab && legacyState.lab) {
        snapshot.U.lab = legacyState.lab;
      }

      return snapshot;
    },

    init() {
      this.loadProgress();
      this.createUI();
      this.attachHooks();
      this.evaluateActiveExperiment(this.getCurrentStateSnapshot());
    },

    loadProgress() {
      try {
        const saved = localStorage.getItem('lab_exp_completed');
        if (saved) {
          this.completed = JSON.parse(saved);
        }
      } catch (e) {
        this.completed = {};
      }

      const stateApi = window.LabState;
      if (stateApi) {
        stateApi.patch({ experiments: { completed: this.completed } });
      }
    },

    saveProgress() {
      try {
        localStorage.setItem('lab_exp_completed', JSON.stringify(this.completed));
      } catch (e) {}

      const stateApi = window.LabState;
      if (stateApi) {
        stateApi.patch({ experiments: { completed: this.completed } });
      }

      if (window.__lab) {
        window.__lab.completedExperiments = this.completed;
      }
    },

    createUI() {
      // 1. Add "التجارب الموجّهة" button to Tabs header
      const tabs = document.getElementById('tabs');
      if (tabs) {
        const btn = document.createElement('button');
        btn.id = 'openExpModalBtn';
        btn.style.flex = '0 0 auto';
        btn.innerHTML = `🎓 <b>التجارب الموجّهة</b>`;
        btn.onclick = () => this.openModal();
        tabs.appendChild(btn);
      }

      // 2. Active Quest Floating HUD Banner
      const hud = document.getElementById('hud');
      if (hud) {
        const questBanner = document.createElement('div');
        questBanner.id = 'questBanner';
        questBanner.className = 'quest-hud-banner';
        questBanner.style.display = 'none';
        questBanner.innerHTML = `
          <div class="qb-header">
            <span class="qb-badge">مهمة نشطة</span>
            <b id="qbTitle">—</b>
            <button id="qbMinimizeBtn">✕</button>
          </div>
          <div class="qb-step" id="qbCurStep">الخطوة: —</div>
          <div class="qb-progress-bar"><div id="qbProgressFill" class="qb-fill"></div></div>
        `;
        document.body.appendChild(questBanner);

        document.getElementById('qbMinimizeBtn').onclick = () => {
          this.activeExpId = null;
          questBanner.style.display = 'none';
        };
      }

      // 3. Main Experiments Modal
      const modal = document.createElement('div');
      modal.id = 'expModal';
      modal.className = 'modal-backdrop';
      modal.style.display = 'none';
      modal.innerHTML = `
        <div class="modal-card exp-card">
          <div class="modal-header">
            <div class="exp-modal-title">
              <h3>🎓 دليل التجارب المخبرية الموجّهة</h3>
              <p>اختر تجربة لمتابعة خطواتها عملياً مع التحقق الآلي من النتائج والشروط الفيزيائية والكيميائية</p>
            </div>
            <button id="closeExpBtn" class="modal-close">✕</button>
          </div>
          <div class="exp-tabs-nav">
            <button id="expFilterAll" class="on">جميع التجارب (${this.list.length})</button>
            <button id="expFilterChem">🧪 الكيمياء</button>
            <button id="expFilterCircuit">⚡ الدارات والفيزياء</button>
          </div>
          <div class="modal-body exp-grid" id="expListContainer"></div>
        </div>
      `;
      document.body.appendChild(modal);

      this.modal = modal;
      document.getElementById('closeExpBtn').onclick = () => (modal.style.display = 'none');

      // Filter tabs
      const setFilter = (btnId, filterLab) => {
        ['expFilterAll', 'expFilterChem', 'expFilterCircuit'].forEach((id) => {
          document.getElementById(id).classList.toggle('on', id === btnId);
        });
        this.renderList(filterLab);
      };

      document.getElementById('expFilterAll').onclick = () => setFilter('expFilterAll', null);
      document.getElementById('expFilterChem').onclick = () => setFilter('expFilterChem', 'chem');
      document.getElementById('expFilterCircuit').onclick = () => setFilter('expFilterCircuit', 'circuit');

      // Listen for Reagent dosing in Golden rain
      document.querySelectorAll('[data-dose]').forEach((b) => {
        b.addEventListener('click', () => {
          const reagent = document.getElementById('reagent')?.value;
          if (reagent === 'KI' && this.activeExpId === 'chem_golden_rain') {
            const exp = this.list.find((x) => x.id === 'chem_golden_rain');
            if (exp && exp.steps[0]) exp.steps[0].done = true;
          }
        });
      });
    },

    openModal() {
      this.renderList();
      this.modal.style.display = 'flex';
    },

    renderList(filterLab = null) {
      const container = document.getElementById('expListContainer');
      if (!container) return;

      const items = filterLab ? this.list.filter((x) => x.lab === filterLab) : this.list;

      container.innerHTML = items
        .map((exp) => {
          const isDone = !!this.completed[exp.id];
          const isActive = this.activeExpId === exp.id;
          return `
          <div class="exp-item-card ${isDone ? 'completed' : ''} ${isActive ? 'active-exp' : ''}">
            <div class="exp-card-header">
              <h4>${exp.title}</h4>
              <span class="exp-status-badge">${isDone ? '✓ مكتملة' : isActive ? 'قيد التنفيذ...' : 'متاحة'}</span>
            </div>
            <p class="exp-desc">${exp.desc}</p>
            <div class="exp-steps-preview">
              ${exp.steps
                .map(
                  (s, idx) => `
                <div class="exp-step-row">
                  <span class="step-num">${idx + 1}</span>
                  <span class="step-text">${s.text}</span>
                </div>
              `
                )
                .join('')}
            </div>
            <div class="exp-footer">
              <button class="pri start-exp-btn" data-id="${exp.id}">
                ${isActive ? 'متابعة التجربة الآن ◀' : isDone ? 'إعادة إجراء التجربة' : 'بدء التجربة 🚀'}
              </button>
            </div>
          </div>
        `;
        })
        .join('');

      container.querySelectorAll('.start-exp-btn').forEach((b) => {
        b.onclick = () => this.startExperiment(b.dataset.id);
      });
    },

    startExperiment(id) {
      this.activeExpId = id;
      const exp = this.list.find((x) => x.id === id);
      if (!exp) return;

      // Switch to proper lab mode if needed
      const currentLab = window.LabOrchestrator ? window.LabOrchestrator.currentLab() : (window.__lab && window.__lab.U ? window.__lab.U.lab : 'chem');
      if (exp.lab !== currentLab) {
        if (window.LabOrchestrator) {
          window.LabOrchestrator.setLab(exp.lab);
        } else {
          const targetBtn = document.querySelector(`[data-lab="${exp.lab}"]`);
          if (targetBtn) targetBtn.click();
        }
      }

      this.modal.style.display = 'none';

      // Show floating quest banner
      const banner = document.getElementById('questBanner');
      const title = document.getElementById('qbTitle');
      if (banner && title) {
        title.textContent = exp.title;
        banner.style.display = 'flex';
      }

      if (window.__lab && window.__lab.triggerAlert) {
        window.__lab.triggerAlert('exp_start', `بدأت تجربة: ${exp.title}. اتبع التعليمات في الشريط العلوي.`, 'info', 5);
      }
    },

    attachHooks() {
      const self = this;
      const runtime = window.LabRuntime;

      const runEvaluation = (data = self.getCurrentStateSnapshot()) => {
        self.evaluateActiveExperiment(data);
      };

      if (runtime && typeof runtime.onTick === 'function') {
        runtime.onTick((data) => {
          runEvaluation({ ...self.getCurrentStateSnapshot(), ...(data || {}) });
        });
        return;
      }

      const prevTick = window.__lab && window.__lab.onTick;
      if (!window.__lab) window.__lab = {};
      window.__lab.onTick = function(data) {
        if (prevTick) {
          try {
            prevTick(data);
          } catch (error) {
            console.error('Previous __lab.onTick failed:', error);
          }
        }
        runEvaluation({ ...self.getCurrentStateSnapshot(), ...(data || {}) });
      };
    },

    evaluateActiveExperiment(data) {
      if (!this.activeExpId) return;

      const exp = this.list.find((x) => x.id === this.activeExpId);
      if (!exp) return;

      const snapshot = data && typeof data === 'object' ? { ...this.getCurrentStateSnapshot(), ...data } : this.getCurrentStateSnapshot();
      let allDone = true;
      let curStepIndex = 0;

      for (let i = 0; i < exp.steps.length; i++) {
        const step = exp.steps[i];
        if (step.done) continue;

        let passed = false;
        try {
          passed = Boolean(step.check(snapshot));
        } catch (error) {
          console.error(`Experiment step failed for ${exp.id}:`, error);
          passed = false;
        }

        if (passed) {
          step.done = true;
          if (window.__lab && window.__lab.P0) {
            window.__lab.P0.chime('warn');
          }
        } else {
          allDone = false;
          curStepIndex = i;
          break;
        }
      }

      const qbStep = document.getElementById('qbCurStep');
      const qbFill = document.getElementById('qbProgressFill');
      if (qbStep) {
        const nextStep = exp.steps.find((step) => !step.done) || exp.steps[exp.steps.length - 1];
        if (nextStep) {
          qbStep.textContent = `الخطوة ${exp.steps.indexOf(nextStep) + 1}/${exp.steps.length}: ${nextStep.text}`;
        }
      }
      if (qbFill) {
        const completedCount = exp.steps.filter((step) => step.done).length;
        qbFill.style.width = `${(completedCount / exp.steps.length) * 100}%`;
      }

      if (allDone) {
        this.onExperimentCompleted(exp);
      }
    },

    onExperimentCompleted(exp) {
      this.completed[exp.id] = true;
      this.saveProgress();
      this.activeExpId = null;

      const banner = document.getElementById('questBanner');
      if (banner) banner.style.display = 'none';

      // Celebration sound!
      if (window.__lab && window.__lab.P0) {
        window.__lab.P0.chime('info');
        setTimeout(() => window.__lab.P0.chime('info'), 250);
      }

      // Show completion notice
      if (window.__lab && window.__lab.triggerAlert) {
        window.__lab.triggerAlert(
          'exp_complete_' + Date.now(),
          `🎉 رائع! تم إنجاز التجربة (${exp.title}) بنجاح تام! تم حفظ تقدمك.`,
          'info',
          12
        );
      }

      // Reset step states for next run
      exp.steps.forEach((s) => (s.done = false));
    }
  };

  window.Experiments = Experiments;
  window.addEventListener('DOMContentLoaded', () => Experiments.init());
})();
