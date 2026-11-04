/**
 * Virtual Lab - Interactive Titration Curve Graph
 * رسم بياني تفاعلي لمنحنى المعايرة ورصد نقطة التكافؤ وثابت الحموضة
 */
(() => {
  const TitrationGraph = {
    visible: false,
    points: [], // [{ v: volume_mL, ph: pH, t: timestamp }]
    lastVol: -1,
    lastPh: -1,
    maxVol: 50, // mL
    container: null,
    canvas: null,
    ctx: null,
    tooltip: null,
    equivPoint: null,
    halfEquivPoint: null,

    init() {
      this.createUI();
      this.attachHooks();
    },

    createUI() {
      // 1. Create Drawer Container
      const el = document.createElement('div');
      el.id = 'titrationDrawer';
      el.className = 'titration-drawer';
      el.innerHTML = `
        <div class="td-header">
          <div class="td-title">
            <span class="td-icon">📈</span>
            <b>منحنى المعايرة التفاعلي</b>
            <span class="td-sub">(pH مقابل الحجم المضاف mL)</span>
          </div>
          <div class="td-actions">
            <button id="tgExportBtn" title="تصدير كملف CSV">📥 تصدير CSV</button>
            <button id="tgClearBtn" title="مسح المنحنى">🔄 مسح</button>
            <button id="tgCloseBtn" title="إغلاق">✕</button>
          </div>
        </div>
        <div class="td-body">
          <div class="td-canvas-wrap">
            <canvas id="tgCanvas" width="560" height="300"></canvas>
            <div id="tgTooltip" class="tg-tooltip" style="display:none"></div>
          </div>
          <div class="td-stats">
            <div class="td-stat-card">
              <span>الحجم المسكوب</span>
              <b id="tgCurVol">0.00 mL</b>
            </div>
            <div class="td-stat-card">
              <span>الرقم الهيدروجيني pH</span>
              <b id="tgCurPh">7.00</b>
            </div>
            <div class="td-stat-card highlight">
              <span>نقطة التكافؤ (V_eq)</span>
              <b id="tgEquiv">—</b>
            </div>
            <div class="td-stat-card">
              <span>نصف التكافؤ (pKa)</span>
              <b id="tgPka">—</b>
            </div>
          </div>
          <div class="td-legend">
            <span class="tg-leg-item"><i style="background:#ff79c666"></i> نطاق الفينول فثالين (8.2 - 10)</span>
            <span class="tg-leg-item"><i style="background:#4fa8ff"></i> نقطة التعادل (pH 7)</span>
            <span class="tg-leg-item"><i style="background:#ffb86c"></i> نقطة التكافؤ</span>
          </div>
        </div>
      `;
      document.body.appendChild(el);

      this.container = el;
      this.canvas = document.getElementById('tgCanvas');
      this.ctx = this.canvas.getContext('2d');
      this.tooltip = document.getElementById('tgTooltip');

      // Add Toggle Button to Chemistry HUD / Panel
      const hud = document.getElementById('hud');
      if (hud) {
        const chip = document.createElement('div');
        chip.className = 'chip cc clickable';
        chip.id = 'tgHudBtn';
        chip.style.cursor = 'pointer';
        chip.style.pointerEvents = 'auto';
        chip.innerHTML = `مخطط المعايرة 📈<b id="tgHudStatus">فتح المخطط</b>`;
        chip.onclick = () => this.toggle();
        hud.appendChild(chip);
      }

      // Action buttons
      document.getElementById('tgCloseBtn').onclick = () => this.toggle(false);
      document.getElementById('tgClearBtn').onclick = () => this.clear();
      document.getElementById('tgExportBtn').onclick = () => this.exportCSV();

      // Mouse move on canvas for inspection crosshair
      this.canvas.addEventListener('mousemove', (e) => this.onCanvasMouseMove(e));
      this.canvas.addEventListener('mouseleave', () => {
        this.tooltip.style.display = 'none';
        this.render();
      });

      // Window resize
      window.addEventListener('resize', () => {
        if (this.visible) this.resizeCanvas();
      });
    },

    toggle(forceState) {
      this.visible = forceState !== undefined ? forceState : !this.visible;
      this.container.classList.toggle('open', this.visible);
      const hudStatus = document.getElementById('tgHudStatus');
      if (hudStatus) {
        hudStatus.textContent = this.visible ? 'إخفاء' : 'فتح المخطط';
      }
      if (this.visible) {
        this.resizeCanvas();
        this.render();
      }
    },

    resizeCanvas() {
      const wrap = this.canvas.parentElement;
      if (!wrap) return;
      const rect = wrap.getBoundingClientRect();
      const w = Math.max(340, Math.floor(rect.width));
      const h = Math.max(200, Math.floor(rect.height || 280));
      this.canvas.width = w * (window.devicePixelRatio || 1);
      this.canvas.height = h * (window.devicePixelRatio || 1);
      this.canvas.style.width = w + 'px';
      this.canvas.style.height = h + 'px';
      this.render();
    },

    clear() {
      this.points = [];
      this.lastVol = -1;
      this.lastPh = -1;
      this.equivPoint = null;
      this.halfEquivPoint = null;
      this.updateStats(0, 7);
      this.render();
    },

    attachHooks() {
      const self = this;
      const runtime = window.LabRuntime;

      if (runtime && typeof runtime.onTick === 'function') {
        runtime.onTick(function(data) {
          self.processLabTick(data);
        });
        return;
      }

      const prevTick = window.__lab && window.__lab.onTick;
      if (!window.__lab) window.__lab = {};
      window.__lab.onTick = function(data) {
        if (prevTick) prevTick(data);
        self.processLabTick(data);
      };
    },

    processLabTick(data) {
      if (!data || !data.Te || !data.G) return;
      const vol = data.Te.vol || 0;
      const ph = data.G.ph !== undefined ? data.G.ph : 7.0;

      // Sample when volume changes or pH changes noticeably
      if (Math.abs(vol - this.lastVol) >= 0.05 || (this.points.length === 0 && vol === 0)) {
        this.lastVol = vol;
        this.lastPh = ph;
        this.addPoint(vol, ph);
      } else if (this.points.length > 0 && Math.abs(ph - this.lastPh) > 0.1) {
        // pH change without volume (e.g. indicator/drop)
        this.lastPh = ph;
        this.points[this.points.length - 1].ph = ph;
        this.render();
      }

      this.updateStats(vol, ph);
    },

    addPoint(v, ph) {
      this.points.push({ v, ph, t: Date.now() });
      if (v > this.maxVol - 2) {
        this.maxVol = Math.ceil(v / 10) * 10 + 10;
      }
      this.detectEquivalencePoint();
      if (this.visible) {
        this.render();
      }
    },

    detectEquivalencePoint() {
      if (this.points.length < 5) return;

      // Calculate discrete derivatives d(pH)/dv
      let maxDeriv = 0;
      let maxIdx = -1;

      for (let i = 1; i < this.points.length - 1; i++) {
        const dv = this.points[i + 1].v - this.points[i - 1].v;
        if (dv > 0.01) {
          const dph = Math.abs(this.points[i + 1].ph - this.points[i - 1].ph);
          const deriv = dph / dv;
          if (deriv > maxDeriv && deriv > 0.5) { // Threshold for sharp inflection
            maxDeriv = deriv;
            maxIdx = i;
          }
        }
      }

      if (maxIdx !== -1 && maxDeriv > 0.8) {
        this.equivPoint = {
          v: this.points[maxIdx].v,
          ph: this.points[maxIdx].ph,
          deriv: maxDeriv
        };

        // Half equivalence point: at V_eq / 2
        const halfV = this.equivPoint.v / 2;
        // Find closest point to halfV
        let closest = null;
        let minDiff = Infinity;
        for (const p of this.points) {
          const diff = Math.abs(p.v - halfV);
          if (diff < minDiff) {
            minDiff = diff;
            closest = p;
          }
        }
        if (closest && minDiff < 2.0) {
          this.halfEquivPoint = {
            v: closest.v,
            ph: closest.ph,
            pka: closest.ph
          };
        }
      }
    },

    updateStats(vol, ph) {
      const vEl = document.getElementById('tgCurVol');
      const pEl = document.getElementById('tgCurPh');
      const eqEl = document.getElementById('tgEquiv');
      const pkaEl = document.getElementById('tgPka');

      if (vEl) vEl.textContent = vol.toFixed(2) + ' mL';
      if (pEl) pEl.textContent = ph.toFixed(2);

      if (eqEl) {
        if (this.equivPoint) {
          eqEl.textContent = `${this.equivPoint.v.toFixed(1)} mL (pH ${this.equivPoint.ph.toFixed(1)})`;
          eqEl.style.color = '#ffb86c';
        } else {
          eqEl.textContent = 'قيد الرصد...';
          eqEl.style.color = '#93a0b8';
        }
      }

      if (pkaEl) {
        if (this.halfEquivPoint) {
          pkaEl.textContent = `pKa ≈ ${this.halfEquivPoint.pka.toFixed(2)}`;
          pkaEl.style.color = '#50fa7b';
        } else {
          pkaEl.textContent = '—';
          pkaEl.style.color = '#93a0b8';
        }
      }
    },

    render(hoverPoint = null) {
      if (!this.ctx || !this.visible) return;
      const ctx = this.ctx;
      const dpr = window.devicePixelRatio || 1;
      const W = this.canvas.width / dpr;
      const H = this.canvas.height / dpr;

      ctx.save();
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, W, H);

      // Plot margins
      const padL = 46;
      const padR = 24;
      const padT = 20;
      const padB = 34;
      const plotW = W - padL - padR;
      const plotH = H - padT - padB;

      const toX = (v) => padL + (v / this.maxVol) * plotW;
      const toY = (ph) => padT + ((14 - ph) / 14) * plotH;

      // 1. Background Grid & Styling
      ctx.fillStyle = '#0f1520';
      ctx.fillRect(0, 0, W, H);

      // 2. Phenolphthalein Transition Range (pH 8.2 to 10.0)
      const yPinkTop = toY(10.0);
      const yPinkBottom = toY(8.2);
      const pinkGrad = ctx.createLinearGradient(0, yPinkBottom, 0, yPinkTop);
      pinkGrad.addColorStop(0, 'rgba(255, 105, 180, 0.05)');
      pinkGrad.addColorStop(0.5, 'rgba(255, 105, 180, 0.18)');
      pinkGrad.addColorStop(1, 'rgba(255, 105, 180, 0.28)');
      ctx.fillStyle = pinkGrad;
      ctx.fillRect(padL, yPinkTop, plotW, yPinkBottom - yPinkTop);

      // 3. Grid Lines
      ctx.strokeStyle = '#232c3d';
      ctx.lineWidth = 1;

      // Horizontal pH grid lines (every 2 pH units)
      ctx.fillStyle = '#7a889e';
      ctx.font = '11px sans-serif';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';

      for (let ph = 0; ph <= 14; ph += 2) {
        const y = toY(ph);
        ctx.beginPath();
        ctx.moveTo(padL, y);
        ctx.lineTo(padL + plotW, y);
        ctx.stroke();
        ctx.fillText(ph.toString(), padL - 8, y);
      }

      // Neutral Line (pH 7)
      const yNeutral = toY(7.0);
      ctx.save();
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = 'rgba(79, 168, 255, 0.45)';
      ctx.beginPath();
      ctx.moveTo(padL, yNeutral);
      ctx.lineTo(padL + plotW, yNeutral);
      ctx.stroke();
      ctx.restore();

      // Vertical Volume grid lines (every 10 mL)
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      const vStep = this.maxVol <= 50 ? 5 : 10;
      for (let v = 0; v <= this.maxVol; v += vStep) {
        const x = toX(v);
        ctx.beginPath();
        ctx.moveTo(x, padT);
        ctx.lineTo(x, padT + plotH);
        ctx.stroke();
        ctx.fillText(v.toString(), x, padT + plotH + 6);
      }

      // Axis Labels
      ctx.fillStyle = '#b8c3d6';
      ctx.font = 'bold 11px sans-serif';
      ctx.fillText('الحجم المضاف V (mL)', padL + plotW / 2, H - 12);

      ctx.save();
      ctx.translate(14, padT + plotH / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.textAlign = 'center';
      ctx.fillText('الرقم الهيدروجيني pH', 0, 0);
      ctx.restore();

      // 4. Draw Titration Curve
      if (this.points.length > 1) {
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(toX(this.points[0].v), toY(this.points[0].ph));

        for (let i = 1; i < this.points.length; i++) {
          const pt = this.points[i];
          ctx.lineTo(toX(pt.v), toY(pt.ph));
        }

        // Gradient Stroke for Curve (Acidic Red/Yellow -> Neutral Blue/Green -> Basic Purple/Pink)
        const curveGrad = ctx.createLinearGradient(0, toY(0), 0, toY(14));
        curveGrad.addColorStop(0, '#ff5555'); // strongly basic top (pH 14)
        curveGrad.addColorStop(0.3, '#bd93f9');
        curveGrad.addColorStop(0.5, '#50fa7b'); // neutral (pH 7)
        curveGrad.addColorStop(0.7, '#f1fa8c');
        curveGrad.addColorStop(1, '#ff6e6e'); // strongly acidic bottom (pH 0)

        ctx.strokeStyle = '#4fa8ff';
        ctx.lineWidth = 3;
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        ctx.shadowColor = 'rgba(79, 168, 255, 0.4)';
        ctx.shadowBlur = 8;
        ctx.stroke();
        ctx.restore();

        // Draw points markers
        ctx.fillStyle = '#fff';
        for (let i = 0; i < this.points.length; i += Math.max(1, Math.floor(this.points.length / 40))) {
          const p = this.points[i];
          ctx.beginPath();
          ctx.arc(toX(p.v), toY(p.ph), 2.5, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // 5. Draw Equivalence Point Callout
      if (this.equivPoint) {
        const ex = toX(this.equivPoint.v);
        const ey = toY(this.equivPoint.ph);

        // Halo
        ctx.beginPath();
        ctx.arc(ex, ey, 7, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255, 184, 108, 0.35)';
        ctx.fill();

        ctx.beginPath();
        ctx.arc(ex, ey, 4, 0, Math.PI * 2);
        ctx.fillStyle = '#ffb86c';
        ctx.fill();

        // Text banner
        ctx.fillStyle = '#ffb86c';
        ctx.font = 'bold 11px sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText(`نقطة التكافؤ (${this.equivPoint.v.toFixed(1)} mL)`, ex - 10, ey - 6);
      }

      // 6. Draw Half-Equivalence Point (pKa)
      if (this.halfEquivPoint) {
        const hx = toX(this.halfEquivPoint.v);
        const hy = toY(this.halfEquivPoint.ph);

        ctx.beginPath();
        ctx.arc(hx, hy, 4, 0, Math.PI * 2);
        ctx.fillStyle = '#50fa7b';
        ctx.fill();

        ctx.fillStyle = '#50fa7b';
        ctx.font = 'bold 10px sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(`pKa ≈ ${this.halfEquivPoint.pka.toFixed(1)}`, hx + 8, hy + 4);
      }

      // 7. Hover Crosshair
      if (hoverPoint) {
        const hx = toX(hoverPoint.v);
        const hy = toY(hoverPoint.ph);

        ctx.save();
        ctx.setLineDash([2, 2]);
        ctx.strokeStyle = '#ffffffaa';
        ctx.beginPath();
        ctx.moveTo(hx, padT);
        ctx.lineTo(hx, padT + plotH);
        ctx.moveTo(padL, hy);
        ctx.lineTo(padL + plotW, hy);
        ctx.stroke();

        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(hx, hy, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      ctx.restore();
    },

    onCanvasMouseMove(e) {
      if (!this.points.length) return;
      const rect = this.canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const padL = 46;
      const padR = 24;
      const plotW = rect.width - padL - padR;

      const cursorVol = Math.max(0, Math.min(this.maxVol, ((mouseX - padL) / plotW) * this.maxVol));

      // Find closest recorded point
      let closest = this.points[0];
      let minDiff = Math.abs(closest.v - cursorVol);

      for (let i = 1; i < this.points.length; i++) {
        const diff = Math.abs(this.points[i].v - cursorVol);
        if (diff < minDiff) {
          minDiff = diff;
          closest = this.points[i];
        }
      }

      this.render(closest);

      // Position tooltip
      const dpr = window.devicePixelRatio || 1;
      const toX = (v) => padL + (v / this.maxVol) * plotW;
      const toY = (ph) => 20 + ((14 - ph) / 14) * (rect.height - 20 - 34);

      const px = toX(closest.v);
      const py = toY(closest.ph);

      this.tooltip.style.display = 'block';
      this.tooltip.style.left = `${Math.min(rect.width - 130, Math.max(10, px - 60))}px`;
      this.tooltip.style.top = `${Math.max(10, py - 48)}px`;
      this.tooltip.innerHTML = `<b>V:</b> ${closest.v.toFixed(2)} mL<br><b>pH:</b> ${closest.ph.toFixed(2)}`;
    },

    exportCSV() {
      if (!this.points.length) {
        alert('لا توجد بيانات مسجلة بعد في المنحنى.');
        return;
      }
      let csv = 'Volume_mL,pH,Timestamp_ms\n';
      this.points.forEach((p) => {
        csv += `${p.v.toFixed(3)},${p.ph.toFixed(3)},${p.t}\n`;
      });
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `titration-curve-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
  };

  window.TitrationGraph = TitrationGraph;
  window.addEventListener('DOMContentLoaded', () => TitrationGraph.init());
})();
