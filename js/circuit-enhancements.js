/**
 * Virtual Lab - Circuit Enhancements
 * 1. Virtual Digital Multimeter (DMM) with dual Red/Black test leads
 * 2. Short-Circuit Safety Guard & Virtual Fuse / Breaker
 * 3. SPICE Netlist & Circuit Schematic Exporter
 */
(() => {
  const CircuitEnhancements = {
    // Fuse & Short-circuit Guard
    fuseTripped: false,
    maxSafeCurrent: 12.0, // Amperes
    lastShortAlert: 0,

    // Multimeter State
    dmm: {
      active: false,
      mode: 'V', // 'V' (Voltage), 'I' (Current), 'R' (Resistance), 'CONT' (Continuity)
      leadA: null, // Red Probe { node: id, name: label, v: volts }
      leadB: null, // Black Probe { node: id, name: label, v: volts }
      reading: '0.00 V',
      subText: 'جاهز للقياس',
      activeLead: 'red', // 'red' or 'black'
      beepPlaying: false
    },

    init() {
      this.createDMMUI();
      this.createExportModal();
      this.attachHooks();
    },

    createDMMUI() {
      // 1. Digital Multimeter Floating Panel
      const panel = document.createElement('div');
      panel.id = 'dmmPanel';
      panel.className = 'dmm-panel';
      panel.style.display = 'none';
      panel.innerHTML = `
        <div class="dmm-header">
          <span class="dmm-logo">⚡ DMM-9000</span>
          <span class="dmm-model">الملتيميتر الرقمي</span>
          <button id="dmmCloseBtn" class="dmm-close">✕</button>
        </div>
        <div class="dmm-lcd">
          <div class="dmm-mode-ind" id="dmmModeInd">DC V</div>
          <div class="dmm-digits" id="dmmDigits">0.00 V</div>
          <div class="dmm-status" id="dmmStatus">ضع طرفي القياس على نقطتين</div>
        </div>
        <div class="dmm-rotary">
          <button data-m="V" class="dmm-btn on">V الجهد</button>
          <button data-m="I" class="dmm-btn">A التيار</button>
          <button data-m="R" class="dmm-btn">Ω المقاومة</button>
          <button data-m="CONT" class="dmm-btn">🔊 التوصيل</button>
        </div>
        <div class="dmm-jacks">
          <div class="dmm-jack red-jack" id="dmmJackRed">
            <span class="dmm-probe-tag">🔴 الطرف الموجب (+)</span>
            <b id="dmmLeadRed">غير متصل</b>
          </div>
          <div class="dmm-jack black-jack" id="dmmJackBlack">
            <span class="dmm-probe-tag">⚫ الطرف السالب (COM)</span>
            <b id="dmmLeadBlack">المشترك (الأرضي)</b>
          </div>
        </div>
        <div class="dmm-actions">
          <button id="dmmResetProbes">إعادة ضبط الأطراف</button>
        </div>
      `;
      document.body.appendChild(panel);

      // Add DMM button in circuit toolbar
      const partsbar = document.getElementById('partsbar');
      if (partsbar) {
        const dmmBtn = document.createElement('button');
        dmmBtn.id = 'toggleDmmBtn';
        dmmBtn.innerHTML = `📟<i>ملتيميتر</i>`;
        dmmBtn.title = 'تشغيل جهاز القياس المتعدد';
        dmmBtn.onclick = () => this.toggleDMM();
        partsbar.insertBefore(dmmBtn, partsbar.children[3] || null);
      }

      // Add Export Netlist button in circuit toolbar
      if (partsbar) {
        const expBtn = document.createElement('button');
        expBtn.id = 'exportSpiceBtn';
        expBtn.innerHTML = `📋<i>تصدير</i>`;
        expBtn.title = 'تصدير مخطط الدارة و SPICE Netlist';
        expBtn.onclick = () => this.showExportModal();
        partsbar.appendChild(expBtn);
      }

      // Mode selectors
      panel.querySelectorAll('.dmm-btn').forEach((b) => {
        b.onclick = () => {
          panel.querySelectorAll('.dmm-btn').forEach((x) => x.classList.remove('on'));
          b.classList.add('on');
          this.setDMMMode(b.dataset.m);
        };
      });

      document.getElementById('dmmCloseBtn').onclick = () => this.toggleDMM(false);
      document.getElementById('dmmResetProbes').onclick = () => this.resetProbes();

      document.getElementById('dmmJackRed').onclick = () => {
        this.dmm.activeLead = 'red';
        this.highlightActiveLead();
      };
      document.getElementById('dmmJackBlack').onclick = () => {
        this.dmm.activeLead = 'black';
        this.highlightActiveLead();
      };
      this.highlightActiveLead();
    },

    createExportModal() {
      const modal = document.createElement('div');
      modal.id = 'spiceModal';
      modal.className = 'modal-backdrop';
      modal.style.display = 'none';
      modal.innerHTML = `
        <div class="modal-card">
          <div class="modal-header">
            <h3>📋 تصدير الدارة ومخطط SPICE Netlist</h3>
            <button id="closeSpiceBtn" class="modal-close">✕</button>
          </div>
          <div class="modal-body">
            <p>كود مخطط الدارة القياسي متوافق مع برامج المحاكاة (SPICE / LTspice / KiCad / Proteus):</p>
            <textarea id="spiceOutput" readonly spellcheck="false" class="code-area"></textarea>
            <div class="modal-stats" id="circuitSummaryStats"></div>
          </div>
          <div class="modal-footer">
            <button id="copySpiceBtn" class="pri">📋 نسخ إلى الحافظة</button>
            <button id="downloadSpiceBtn">💾 تنزيل ملف (.cir)</button>
          </div>
        </div>
      `;
      document.body.appendChild(modal);

      document.getElementById('closeSpiceBtn').onclick = () => {
        modal.style.display = 'none';
      };
      document.getElementById('copySpiceBtn').onclick = () => {
        const text = document.getElementById('spiceOutput').value;
        navigator.clipboard.writeText(text).then(() => {
          const btn = document.getElementById('copySpiceBtn');
          btn.textContent = '✓ تم النسخ بنجاح!';
          setTimeout(() => (btn.textContent = '📋 نسخ إلى الحافظة'), 2000);
        });
      };
      document.getElementById('downloadSpiceBtn').onclick = () => {
        const text = document.getElementById('spiceOutput').value;
        const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `circuit-${new Date().toISOString().slice(0, 10)}.cir`;
        a.click();
        URL.revokeObjectURL(url);
      };
    },

    toggleDMM(forceState) {
      this.dmm.active = forceState !== undefined ? forceState : !this.dmm.active;
      const panel = document.getElementById('dmmPanel');
      if (panel) {
        panel.style.display = this.dmm.active ? 'flex' : 'none';
      }
      const btn = document.getElementById('toggleDmmBtn');
      if (btn) btn.classList.toggle('on', this.dmm.active);

      if (this.dmm.active && !this.dmm.leadB) {
        // Default ground probe to node 0
        this.dmm.leadB = { node: 0, name: 'الأرضي (GND)', v: 0 };
        this.updateProbesUI();
      }
    },

    setDMMMode(mode) {
      this.dmm.mode = mode;
      const ind = document.getElementById('dmmModeInd');
      if (ind) {
        const labels = {
          V: 'DC VOLTS (جهد مستمر)',
          I: 'DC AMPS (تيار مستمر)',
          R: 'OHMS (مقاومة كهربائية)',
          CONT: 'CONTINUITY (فحص التوصيل)'
        };
        ind.textContent = labels[mode] || mode;
      }
      this.updateDMMReadings();
    },

    highlightActiveLead() {
      const red = document.getElementById('dmmJackRed');
      const black = document.getElementById('dmmJackBlack');
      if (red && black) {
        red.classList.toggle('selected-lead', this.dmm.activeLead === 'red');
        black.classList.toggle('selected-lead', this.dmm.activeLead === 'black');
      }
    },

    resetProbes() {
      this.dmm.leadA = null;
      this.dmm.leadB = { node: 0, name: 'الأرضي (GND)', v: 0 };
      this.updateProbesUI();
      this.updateDMMReadings();
    },

    updateProbesUI() {
      const redText = document.getElementById('dmmLeadRed');
      const blackText = document.getElementById('dmmLeadBlack');
      if (redText) {
        redText.textContent = this.dmm.leadA ? this.dmm.leadA.name : 'المس طرفاً بالماوس/اللمس';
      }
      if (blackText) {
        blackText.textContent = this.dmm.leadB ? this.dmm.leadB.name : 'غير متصل';
      }
    },

    attachHooks() {
      const self = this;
      const prevTick = window.__lab && window.__lab.onTick;

      if (!window.__lab) window.__lab = {};
      window.__lab.onTick = function(data) {
        if (prevTick) prevTick(data);
        self.onLabTick(data);
      };

      // Handle clicking on parts/breadboard to connect DMM leads
      window.addEventListener('pointerup', (e) => {
        if (!self.dmm.active) return;
        self.handleScenePointer(e);
      });
    },

    handleScenePointer(e) {
      // Connect probe to tapped circuit component terminal if DMM is active
      if (!window.__lab || !window.__lab.U || window.__lab.U.lab !== 'circuit') return;

      const U = window.__lab.U;
      const sim = window.__lab.sim ? window.__lab.sim(0) : null;
      if (!sim) return;

      // In preset modes: simple cycling between key nodes
      const targetLead = this.dmm.activeLead;
      const nodes = [
        { node: 1, name: 'القطب الموجب للبطارية (+)', v: U.V },
        { node: 2, name: 'طرف المقاومة R1', v: sim.vR },
        { node: 3, name: 'طرف المصباح / المكثف', v: sim.vB || sim.vC },
        { node: 0, name: 'القطب السالب / الأرضي (GND)', v: 0 }
      ];

      // Cycle selection
      const current = targetLead === 'red' ? this.dmm.leadA : this.dmm.leadB;
      const currIdx = nodes.findIndex((n) => current && n.node === current.node);
      const nextNode = nodes[(currIdx + 1) % nodes.length];

      if (targetLead === 'red') {
        this.dmm.leadA = nextNode;
        this.dmm.activeLead = 'black'; // auto-advance to black
      } else {
        this.dmm.leadB = nextNode;
        this.dmm.activeLead = 'red';
      }

      this.highlightActiveLead();
      this.updateProbesUI();
      this.updateDMMReadings();
    },

    onLabTick(data) {
      if (!data || !data.U || data.U.lab !== 'circuit') return;

      const sim = data.simResult || (window.__lab.sim ? window.__lab.sim(0) : null);
      if (!sim) return;

      // 1. Check Short-Circuit & Overload Protection
      this.checkShortCircuit(sim, data.U);

      // 2. Update DMM Readout if active
      if (this.dmm.active) {
        this.updateDMMReadings(sim, data.U);
      }
    },

    checkShortCircuit(sim, U) {
      const totalCurrent = Math.abs(sim.iTotal || 0);

      // Condition: Current exceeds safe limit or ideal short circuit detected
      if ((totalCurrent > this.maxSafeCurrent || (U.R < 0.2 && U.on && !U.bulbIn)) && !this.fuseTripped) {
        const now = performance.now();
        if (now - this.lastShortAlert > 4000) {
          this.lastShortAlert = now;
          this.fuseTripped = true;

          // Sound alarm & spark
          if (window.__lab.P0) {
            window.__lab.P0.burn();
            window.__lab.P0.chime('err');
          }

          // Trigger Alert Banner with Breaker Trip Notice
          if (window.__lab.triggerAlert) {
            window.__lab.triggerAlert(
              'short_circuit',
              `⚠️ ماس كهربائي مباشر (قصر في الدارة)! التيار بلغ ${totalCurrent.toFixed(1)} A. فُصل القاطع الآلي لحماية المكونات. ارفع المقاومة ثم اضغط لإعادة تشغيل الدارة.`,
              'err',
              10
            );
          }

          // Automatically turn switch off for safety
          U.on = false;
          const swBtn = document.getElementById('swBtn');
          if (swBtn) {
            swBtn.textContent = '⏻ المفتاح: فصل (القاطع تريّب)';
            swBtn.classList.remove('on');
          }
        }
      }
    },

    updateDMMReadings(sim, U) {
      if (!U) U = window.__lab.U;
      if (!sim) sim = window.__lab.sim ? window.__lab.sim(0) : { vB: 0, vR: 0, iTotal: 0, vC: 0 };

      const digits = document.getElementById('dmmDigits');
      const status = document.getElementById('dmmStatus');
      if (!digits || !status) return;

      // Get potentials of probes
      const va = this.dmm.leadA ? (this.dmm.leadA.v !== undefined ? this.dmm.leadA.v : 0) : 0;
      const vb = this.dmm.leadB ? (this.dmm.leadB.v !== undefined ? this.dmm.leadB.v : 0) : 0;
      const vDiff = va - vb;

      switch (this.dmm.mode) {
        case 'V': {
          const val = Math.abs(vDiff) < 0.001 ? 0 : vDiff;
          digits.textContent = `${val.toFixed(2)} V`;
          status.textContent = `فرق الجهد بين ${this.dmm.leadA ? this.dmm.leadA.name : '—'} و ${this.dmm.leadB ? this.dmm.leadB.name : '—'}`;
          break;
        }
        case 'I': {
          const current = sim.iTotal || 0;
          if (Math.abs(current) < 1.0) {
            digits.textContent = `${(current * 1000).toFixed(1)} mA`;
          } else {
            digits.textContent = `${current.toFixed(2)} A`;
          }
          status.textContent = 'شدة التيار الكلي المار في الفرع الرئيسي';
          break;
        }
        case 'R': {
          const res = U.R + (U.bulbIn && !U.burnt ? (window.__lab.kt ? window.__lab.kt.r : 12) : 0);
          if (res > 1e6) {
            digits.textContent = '0.L (دائرة مفتوحة)';
          } else if (res >= 1000) {
            digits.textContent = `${(res / 1000).toFixed(2)} kΩ`;
          } else {
            digits.textContent = `${res.toFixed(1)} Ω`;
          }
          status.textContent = `المقاومة المقاسة بين الطرفين (R_eq)`;
          break;
        }
        case 'CONT': {
          // Continuity test: checks if path has low resistance (< 5 ohms)
          const isContinuous = U.on && !U.burnt && (U.mode === 'series' || U.mode === 'parallel');
          if (isContinuous) {
            digits.textContent = '00.2 Ω 🔊';
            status.textContent = 'توصيل سليم (مسار مغلق - CONTINUOUS)';
            if (window.__lab.P0 && !this.dmm.beepPlaying) {
              window.__lab.P0.click();
            }
          } else {
            digits.textContent = '0.L (مقطوع)';
            status.textContent = 'لا يوجد اتصال كهربائي (مسار مفتوح)';
          }
          break;
        }
      }
    },

    showExportModal() {
      const modal = document.getElementById('spiceModal');
      const output = document.getElementById('spiceOutput');
      const stats = document.getElementById('circuitSummaryStats');
      if (!modal || !output) return;

      const U = window.__lab.U || { mode: 'series', V: 6, R: 12, C: 0.25, L: 2 };
      const kt = window.__lab.kt || { r: 12, ratedP: 3 };
      const sim = window.__lab.sim ? window.__lab.sim(0) : { iTotal: 0, vB: 0, vR: 0, pB: 0 };

      // Generate SPICE Netlist
      let netlist = `* Virtual Lab Circuit Simulation Netlist\n`;
      netlist += `* Mode: ${U.mode.toUpperCase()} Circuit\n`;
      netlist += `* Generated: ${new Date().toISOString()}\n\n`;

      netlist += `* Power Supply\n`;
      netlist += `V1 in 0 DC ${U.V.toFixed(2)}\n\n`;

      if (U.mode === 'series') {
        netlist += `* Series Resistor and Lamp\n`;
        netlist += `R1 in n1 ${U.R.toFixed(2)}\n`;
        netlist += `Rbulb n1 0 ${kt.r.toFixed(2)} ; 6V/3W Lamp\n`;
      } else if (U.mode === 'parallel') {
        netlist += `* Parallel Branches\n`;
        netlist += `R1 in 0 ${U.R.toFixed(2)}\n`;
        netlist += `Rbulb in 0 ${kt.r.toFixed(2)} ; 6V/3W Lamp\n`;
      } else if (U.mode === 'rc') {
        netlist += `* RC Transient Circuit\n`;
        netlist += `R1 in n1 ${U.R.toFixed(2)}\n`;
        netlist += `C1 n1 0 ${U.C.toFixed(4)} IC=0.0\n`;
      } else if (U.mode === 'rl') {
        netlist += `* RL Circuit\n`;
        netlist += `R1 in n1 ${U.R.toFixed(2)}\n`;
        netlist += `L1 n1 0 ${U.L.toFixed(3)}\n`;
      } else if (U.mode === 'rlc') {
        netlist += `* RLC Resonant Tank\n`;
        netlist += `R1 in n1 ${U.R.toFixed(2)}\n`;
        netlist += `L1 n1 n2 ${U.L.toFixed(3)}\n`;
        netlist += `C1 n2 0 ${U.C.toFixed(4)}\n`;
      }

      netlist += `\n* Transient Analysis Directive\n`;
      netlist += `.tran 100u 2s\n`;
      netlist += `.print tran V(in) V(n1) I(V1)\n`;
      netlist += `.end\n`;

      output.value = netlist;

      // Stats
      if (stats) {
        stats.innerHTML = `
          <span><b>الجهد V:</b> ${U.V.toFixed(1)} V</span>
          <span><b>التيار الكلي I:</b> ${(sim.iTotal || 0).toFixed(3)} A</span>
          <span><b>القدرة المستهلكة P:</b> ${(U.V * (sim.iTotal || 0)).toFixed(2)} W</span>
          <span><b>مقاومة الحمل R:</b> ${U.R.toFixed(1)} Ω</span>
        `;
      }

      modal.style.display = 'flex';
    }
  };

  window.CircuitEnhancements = CircuitEnhancements;
  window.addEventListener('DOMContentLoaded', () => CircuitEnhancements.init());
})();
