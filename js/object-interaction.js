(() => {
  const directions = [
    { i: 1, j: 0 },
    { i: 0, j: 1 },
    { i: -1, j: 0 },
    { i: 0, j: -1 }
  ];

  const circuitNames = {
    battery: 'بطارية',
    resistor: 'مقاومة',
    bulb: 'مصباح',
    cap: 'مكثف',
    ind: 'ملف',
    switch: 'مفتاح',
    led: 'LED',
    diode: 'ثنائي',
    relay: 'ترحيل',
    sig: 'مولّد إشارة',
    npn: 'ترانزستور NPN',
    and: 'بوابة AND',
    or: 'بوابة OR',
    not: 'بوابة NOT',
    nand: 'بوابة NAND',
    nor: 'بوابة NOR',
    xor: 'بوابة XOR'
  };
  const circuitUnits = {
    battery: 'V',
    resistor: 'Ω',
    bulb: 'Ω',
    cap: 'F',
    ind: 'H',
    sig: 'Hz'
  };

  const transformPoint = (elements, point) => {
    const [x, y, z, w = 1] = point;
    const tx = elements[0] * x + elements[4] * y + elements[8] * z + elements[12] * w;
    const ty = elements[1] * x + elements[5] * y + elements[9] * z + elements[13] * w;
    const tz = elements[2] * x + elements[6] * y + elements[10] * z + elements[14] * w;
    const tw = elements[3] * x + elements[7] * y + elements[11] * z + elements[15] * w;
    return tw && tw !== 1 ? [tx / tw, ty / tw, tz / tw, 1] : [tx, ty, tz, tw];
  };

  const projectPoint = (point, viewElements, projectionElements) => {
    const view = transformPoint(viewElements, [...point, 1]);
    const [x, y, z, w] = view;
    return [
      projectionElements[0] * x + projectionElements[4] * y + projectionElements[8] * z + projectionElements[12] * w,
      projectionElements[1] * x + projectionElements[5] * y + projectionElements[9] * z + projectionElements[13] * w,
      projectionElements[2] * x + projectionElements[6] * y + projectionElements[10] * z + projectionElements[14] * w,
      projectionElements[3] * x + projectionElements[7] * y + projectionElements[11] * z + projectionElements[15] * w
    ];
  };

  const unprojectToPlane = (ndc, cameraWorld, projectionInverse, cameraPosition, planeY) => {
    const cameraPoint = transformPoint(projectionInverse, [ndc.x, ndc.y, 1, 1]);
    const worldPoint = transformPoint(cameraWorld, cameraPoint);
    const direction = [
      worldPoint[0] - cameraPosition.x,
      worldPoint[1] - cameraPosition.y,
      worldPoint[2] - cameraPosition.z
    ];
    const magnitude = Math.hypot(...direction);
    if (!magnitude) return null;
    direction.forEach((value, index) => { direction[index] = value / magnitude; });
    if (Math.abs(direction[1]) < 1e-8) return null;
    const distance = (planeY - cameraPosition.y) / direction[1];
    if (distance < 0) return null;
    return {
      x: cameraPosition.x + direction[0] * distance,
      z: cameraPosition.z + direction[2] * distance
    };
  };

  const getCircuitTerminals = (part) => {
    if (!part || !Number.isInteger(part.dir) || !directions[part.dir] ||
        !Number.isFinite(part.i) || !Number.isFinite(part.j)) {
      return [];
    }

    const direction = directions[part.dir];
    const start = { i: part.i, j: part.j };
    const end = { i: part.i + direction.i * 2, j: part.j + direction.j * 2 };
    if (part.type === 'relay') {
      const perpendicular = directions[(part.dir + 1) % directions.length];
      return [
        { label: 'الطرف A', ...start },
        { label: 'الطرف B', ...end },
        { label: 'الطرف C', i: start.i + perpendicular.i, j: start.j + perpendicular.j },
        { label: 'الطرف D', i: end.i + perpendicular.i, j: end.j + perpendicular.j }
      ];
    }

    if (['npn', 'and', 'or', 'nand', 'nor', 'xor'].includes(part.type)) {
      return [
        { label: 'الطرف A', ...start },
        { label: 'الطرف B', i: start.i + direction.i, j: start.j + direction.j },
        { label: 'الطرف C', ...end }
      ];
    }

    return [{ label: 'الطرف A', ...start }, { label: 'الطرف B', ...end }];
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { getCircuitTerminals, transformPoint, projectPoint, unprojectToPlane };
  }

  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  const stage = document.getElementById('c');
  const app = document.getElementById('app');
  const controlPanel = document.getElementById('panel');
  const canvas = stage?.querySelector('canvas:not(#scope)');
  const lab = window.__lab;
  if (!stage || !app || !controlPanel || !canvas || !lab?.circuit?.BD || !lab?.chem?.CHT) return;
  if (canvas.tabIndex < 0) canvas.tabIndex = 0;
  canvas.setAttribute('aria-label', 'مساحة المختبر؛ اختر أداة لعرض معلوماتها');

  const panel = document.createElement('aside');
  panel.className = 'object-inspector';
  panel.hidden = true;
  panel.setAttribute('aria-label', 'معلومات وأدوات العنصر المحدد');
  panel.setAttribute('aria-live', 'polite');
  panel.innerHTML = `
    <div class="object-inspector-header">
      <h2 class="object-inspector-title"></h2>
      <button type="button" class="object-inspector-close" aria-label="إغلاق معلومات العنصر">✕</button>
    </div>
    <dl class="object-inspector-details"></dl>
    <div class="object-inspector-terminals" hidden></div>
    <div class="object-inspector-actions"></div>
    <p class="object-inspector-status" role="status"></p>
  `;
  stage.appendChild(panel);

  const title = panel.querySelector('.object-inspector-title');
  const details = panel.querySelector('.object-inspector-details');
  const terminals = panel.querySelector('.object-inspector-terminals');
  const actions = panel.querySelector('.object-inspector-actions');
  const status = panel.querySelector('.object-inspector-status');
  const closeButton = panel.querySelector('.object-inspector-close');
  const dragPreview = document.createElement('div');
  dragPreview.className = 'object-drag-preview';
  dragPreview.hidden = true;
  dragPreview.setAttribute('aria-hidden', 'true');
  stage.appendChild(dragPreview);
  const worldLabels = new Map();
  const controls = lab.ctl;
  let dismissedSelection = null;
  let selected = null;
  let pointerStart = null;
  let longPressTimer = null;
  let anchor = null;
  let statusMessage = '';
  let renderedSignature = null;
  let drag = null;
  let replayingCircuitClick = false;

  const currentLab = () => app.classList.contains('lab-circuit') ? 'circuit' : 'chem';

  const currentSelection = () => {
    if (currentLab() === 'circuit') {
      const state = lab.circuit.BD;
      return state.sel || state.selW || null;
    }
    return lab.chem.CHT.sel || null;
  };

  const inSupportedView = () => currentLab() === 'circuit'
    ? controlPanel.classList.contains('bdon')
    : !app.classList.contains('view-shelf');

  const isMovePending = () => currentLab() === 'circuit'
    ? lab.circuit.BD.tool === 'move'
    : lab.chem.CHT.move;

  const setStatus = (message) => {
    statusMessage = message;
    status.textContent = statusMessage;
  };

  const positionPanel = (clientX, clientY) => {
    const bounds = stage.getBoundingClientRect();
    const x = clientX === undefined ? bounds.width - panel.offsetWidth - 12 : clientX - bounds.left;
    const y = clientY === undefined ? 118 : clientY - bounds.top;
    panel.style.left = `${Math.max(8, Math.min(x, bounds.width - panel.offsetWidth - 8))}px`;
    panel.style.top = `${Math.max(8, Math.min(y, bounds.height - panel.offsetHeight - 8))}px`;
  };

  const camera = () => {
    const activeCamera = lab.cam;
    if (!activeCamera) return null;
    activeCamera.updateMatrixWorld(true);
    return {
      world: activeCamera.matrixWorld.elements,
      view: activeCamera.matrixWorldInverse.elements,
      projection: activeCamera.projectionMatrix.elements,
      projectionInverse: activeCamera.projectionMatrixInverse.elements,
      position: activeCamera.position
    };
  };

  const projectWorld = (x, y, z, cameraData) => {
    const clip = projectPoint(
      [x, y, z],
      cameraData.view,
      cameraData.projection
    );
    if (clip[3] <= 0) return null;
    const ndc = clip.slice(0, 3).map((value) => value / clip[3]);
    if (ndc[2] < -1 || ndc[2] > 1) return null;
    const rect = canvas.getBoundingClientRect();
    return {
      x: rect.left + (ndc[0] + 1) * 0.5 * rect.width,
      y: rect.top + (1 - ndc[1]) * 0.5 * rect.height
    };
  };

  const worldAtPointer = (event, planeY) => {
    const rect = canvas.getBoundingClientRect();
    const cameraData = camera();
    if (!cameraData || !rect.width || !rect.height) return null;
    return unprojectToPlane({
      x: (event.clientX - rect.left) / rect.width * 2 - 1,
      y: -((event.clientY - rect.top) / rect.height) * 2 + 1
    }, cameraData.world, lab.cam.projectionMatrixInverse.elements, cameraData.position, planeY);
  };

  const getScreenBounds = (group) => {
    if (!group || !lab.cam) return null;
    group.updateMatrixWorld(true);
    const cameraData = camera();
    if (!cameraData) return null;
    const points = [];
    group.traverse((object) => {
      if (!object.isMesh || !object.geometry || object.visible === false) return;
      if (!object.geometry.boundingBox) object.geometry.computeBoundingBox();
      const bounds = object.geometry.boundingBox;
      if (!bounds) return;
      for (const x of [bounds.min.x, bounds.max.x]) {
        for (const y of [bounds.min.y, bounds.max.y]) {
          for (const z of [bounds.min.z, bounds.max.z]) {
            const world = transformPoint(object.matrixWorld.elements, [x, y, z, 1]);
            const screen = projectWorld(world[0], world[1], world[2], cameraData);
            if (screen) points.push(screen);
          }
        }
      }
    });
    if (!points.length) {
      const position = group.position;
      const center = projectWorld(position.x, position.y + 0.5, position.z, cameraData);
      return center ? { left: center.x - 24, right: center.x + 24, top: center.y - 24, bottom: center.y + 24 } : null;
    }
    return {
      left: Math.min(...points.map((point) => point.x)) - 14,
      right: Math.max(...points.map((point) => point.x)) + 14,
      top: Math.min(...points.map((point) => point.y)) - 14,
      bottom: Math.max(...points.map((point) => point.y)) + 14
    };
  };

  const hitSelectedObject = (item, event) => {
    const group = currentLab() === 'circuit' ? item?.g : item?.grp;
    const bounds = getScreenBounds(group);
    return Boolean(bounds && event.clientX >= bounds.left && event.clientX <= bounds.right &&
      event.clientY >= bounds.top && event.clientY <= bounds.bottom);
  };

  const currentLabelEntries = () => {
    if (currentLab() === 'circuit') {
      if (!controlPanel.classList.contains('bdon')) return [];
      return lab.circuit.BD.parts.filter((part) => part.g?.visible !== false && !part.removed).map((part) => ({
        item: part,
        group: part.g,
        text: `${circuitNames[part.type] || part.type}${Number.isFinite(part.val) && circuitUnits[part.type] ? ` · ${part.val} ${circuitUnits[part.type]}` : ''}`,
        yOffset: 1.35
      }));
    }
    if (app.classList.contains('view-shelf')) return [];
    return lab.chem.PLACED.filter((item) => item.grp?.visible !== false).map((item) => ({
      item,
      group: item.grp,
      text: item.d.ar,
      yOffset: Math.max(1.1, item.d.h * 0.55 + 0.4)
    }));
  };

  const updateWorldLabels = () => {
    const entries = currentLabelEntries();
    const visibleItems = new Set(entries.map(({ item }) => item));
    for (const [item, label] of worldLabels) {
      if (!visibleItems.has(item)) {
        label.remove();
        worldLabels.delete(item);
      }
    }

    const cameraData = camera();
    if (!cameraData) return;
    const stageRect = stage.getBoundingClientRect();
    const canvasRect = canvas.getBoundingClientRect();
    for (const entry of entries) {
      let label = worldLabels.get(entry.item);
      if (!label) {
        label = document.createElement('span');
        label.className = 'object-world-label';
        label.setAttribute('aria-hidden', 'true');
        stage.appendChild(label);
        worldLabels.set(entry.item, label);
      }
      label.textContent = entry.text;
      const point = projectWorld(
        entry.group.position.x,
        entry.group.position.y + entry.yOffset,
        entry.group.position.z,
        cameraData
      );
      if (!point || point.x < canvasRect.left || point.x > canvasRect.right ||
          point.y < canvasRect.top || point.y > canvasRect.bottom) {
        label.hidden = true;
        continue;
      }
      label.hidden = false;
      label.style.left = `${point.x - stageRect.left}px`;
      label.style.top = `${point.y - stageRect.top}px`;
    }
    window.requestAnimationFrame(updateWorldLabels);
  };

  const chemistryPositionIsFree = (position, item) => {
    if (!position || position.x < 187.4 || position.x > 212.6 ||
        position.z < -4.6 || position.z > 5.6) return false;
    return lab.chem.PLACED.every((other) => other === item ||
      Math.hypot(other.grp.position.x - position.x, other.grp.position.z - position.z) >= 1.7);
  };

  const findFreeChemistryPosition = (position, item) => {
    if (chemistryPositionIsFree(position, item)) return position;
    for (let radius = 1.7; radius <= 6; radius += 0.85) {
      for (let angle = 0; angle < Math.PI * 2; angle += 0.4) {
        const candidate = {
          x: position.x + Math.cos(angle) * radius,
          z: position.z + Math.sin(angle) * radius
        };
        if (chemistryPositionIsFree(candidate, item)) return candidate;
      }
    }
    return null;
  };

  const beginDrag = (event, item) => {
    drag = {
      item,
      lab: currentLab(),
      startX: event.clientX,
      startY: event.clientY,
      moved: false,
      original: currentLab() === 'chem'
        ? { x: item.grp.position.x, y: item.grp.position.y, z: item.grp.position.z }
        : null,
      target: null
    };
    anchor = null;
    dismissedSelection = item;
    panel.hidden = true;
    canvas.setPointerCapture?.(event.pointerId);
    event.preventDefault();
    event.stopImmediatePropagation();
  };

  const beginCircuitDrag = (event, item) => {
    drag = {
      item,
      lab: 'circuit',
      startX: event.clientX,
      startY: event.clientY,
      moved: false,
      original: null,
      target: null
    };
    document.querySelector('[data-tool="move"]')?.click();
    canvas.setPointerCapture?.(event.pointerId);
    if (controls) controls.enabled = false;
    dismissedSelection = item;
    panel.hidden = true;
    anchor = null;
  };

  const finishDrag = (event, cancelled = false) => {
    if (!drag) return;
    const activeDrag = drag;
    drag = null;
    dragPreview.hidden = true;
    canvas.style.cursor = '';
    if (controls) controls.enabled = true;

    if (activeDrag.lab === 'chem') {
      activeDrag.item.grp.position.set(activeDrag.original.x, activeDrag.original.y, activeDrag.original.z);
      if (!cancelled && activeDrag.moved && activeDrag.target &&
          Math.hypot(activeDrag.target.x - activeDrag.original.x, activeDrag.target.z - activeDrag.original.z) >= 0.4) {
        lab.chem.movePlaced(activeDrag.target);
        window.ApparatusPersistence?.capture();
      } else {
        render();
      }
    } else {
      openAt(event.clientX, event.clientY);
    }
  };

  const addDetail = (label, value) => {
    const cell = document.createElement('div');
    const term = document.createElement('dt');
    const description = document.createElement('dd');
    term.textContent = label;
    description.textContent = value;
    cell.append(term, description);
    details.appendChild(cell);
  };

  const runAction = (action) => {
    const item = selected;
    if (!item) return;

    if (currentLab() === 'circuit') {
      const state = lab.circuit.BD;
      if (action === 'move') {
        const button = document.querySelector('[data-tool="move"]');
        if (button) {
          button.click();
          dismissedSelection = item;
          anchor = null;
          setStatus('اختر موضعًا جديدًا على لوحة التركيب لإكمال النقل.');
        }
      } else if (action === 'rotate') {
        document.getElementById('rotBtn')?.click();
        setStatus('تم طلب تدوير القطعة؛ يتحقق المحاكي من المساحة المتاحة.');
      } else if (action === 'flip') {
        const rotateButton = document.getElementById('rotBtn');
        const targetDirection = (item.dir + 2) % directions.length;
        for (
          let attempt = 0;
          rotateButton && item.dir !== targetDirection && attempt < directions.length;
          attempt += 1
        ) {
          rotateButton.click();
        }
        setStatus(item.dir === targetDirection
          ? 'تم عكس اتجاه القطعة بتدويرها 180 درجة.'
          : 'لا يتوفر اتجاه معاكس صالح في الموضع الحالي.');
      } else if (action === 'remove') {
        document.querySelector('#partsbar [data-act="delsel"]')?.click();
        setStatus('أزيل العنصر المحدد. يمكن استخدام التراجع لاستعادته.');
      } else if (action === 'undo') {
        document.getElementById('undoBtn')?.click();
        setStatus('تم التراجع عن آخر تعديل.');
      }
      if (state.sel !== item && state.selW !== item) selected = null;
    } else {
      if (action === 'move') {
        const button = [...document.querySelectorAll('#toolsbar button')]
          .find((candidate) => candidate.textContent.includes('نقل'));
        if (button) {
          button.click();
          dismissedSelection = item;
          anchor = null;
          setStatus('المس موضعًا جديدًا على الطاولة لنقل الأداة.');
        } else {
          setStatus('النقل غير متاح في العرض الحالي.');
        }
      } else if (action === 'rotate') {
        const button = [...document.querySelectorAll('#toolsbar button')]
          .find((candidate) => candidate.textContent.includes('تدوير'));
        if (button) {
          button.click();
          setStatus('تم تدوير الأداة باستخدام تحكم المختبر.');
        } else {
          setStatus('التدوير غير متاح لهذه الأداة في العرض الحالي.');
        }
      } else if (action === 'remove') {
        lab.chem.removePlaced(item);
        setStatus('أزيلت الأداة من الطاولة.');
        selected = null;
      } else if (action === 'undo' || action === 'redo') {
        const persistence = window.ApparatusPersistence;
        const changed = persistence?.[action]();
        setStatus(changed
          ? action === 'undo' ? 'تم التراجع عن تعديل الأداة.' : 'تمت إعادة تعديل الأداة.'
          : action === 'undo' ? 'لا يوجد تعديل سابق للتراجع عنه.' : 'لا يوجد تعديل لإعادته.');
      }
    }
    render();
  };

  const addAction = (label, action, shortcut = '') => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = shortcut ? `${label} (${shortcut})` : label;
    button.addEventListener('click', () => runAction(action));
    actions.appendChild(button);
  };

  const selectionSnapshot = () => {
    if (currentLab() === 'circuit') {
      if (selected.type) {
        return [
          selected.type, selected.i, selected.j, selected.dir, selected.val,
          selected.closed, selected.burnt, selected.removed
        ];
      }
      return [selected.i1, selected.j1, selected.i2, selected.j2];
    }

    return [
      selected.d?.ar,
      selected.d?.desc,
      selected.grp?.position.x,
      selected.grp?.position.z,
      selected.grp?.rotation.y
    ];
  };

  const render = () => {
    const current = inSupportedView() ? currentSelection() : null;
    if (current !== selected) {
      selected = current;
      anchor = null;
      statusMessage = '';
      if (selected !== dismissedSelection) dismissedSelection = null;
    }
    if (!selected || selected === dismissedSelection) {
      panel.hidden = true;
      renderedSignature = null;
      return;
    }

    const signature = JSON.stringify([currentLab(), selectionSnapshot(), statusMessage]);
    if (!panel.hidden && signature === renderedSignature) return;
    renderedSignature = signature;
    panel.hidden = false;
    title.textContent = '';
    details.replaceChildren();
    terminals.replaceChildren();
    actions.replaceChildren();
    terminals.hidden = true;
    status.textContent = statusMessage;

    if (currentLab() === 'circuit') {
      const part = selected;
      if (part.type) {
        title.textContent = circuitNames[part.type] || 'قطعة كهربائية';
        addDetail('النوع', part.type);
        if (Number.isFinite(part.val)) {
          addDetail('القيمة', `${part.val} ${circuitUnits[part.type] || ''}`.trim());
        }
        if (part.type === 'switch') addDetail('الحالة', part.closed ? 'مغلق' : 'مفتوح');
        if (part.burnt) addDetail('التلف', 'محترقة');
        const endpoints = getCircuitTerminals(part);
        if (endpoints.length) {
          terminals.hidden = false;
          terminals.textContent = endpoints
            .map((endpoint) => `${endpoint.label}: (${endpoint.i}, ${endpoint.j})`)
            .join('  ·  ');
        }
        addAction('نقل', 'move');
        addAction('تدوير', 'rotate', 'R');
        addAction('عكس الاتجاه 180°', 'flip', 'F');
      } else {
        title.textContent = 'سلك توصيل';
        addDetail('البداية', `(${part.i1}, ${part.j1})`);
        addDetail('النهاية', `(${part.i2}, ${part.j2})`);
      }
      addAction('حذف', 'remove', 'Del');
      addAction('تراجع', 'undo');
    } else {
      const apparatus = selected;
      title.textContent = apparatus.d?.ar || 'أداة مختبر';
      if (apparatus.d?.desc) addDetail('الوصف', apparatus.d.desc);
      if (apparatus.grp?.position) {
        addDetail('الموضع', `${apparatus.grp.position.x.toFixed(2)}, ${apparatus.grp.position.z.toFixed(2)}`);
        addDetail('الاتجاه', `${Math.round((apparatus.grp.rotation.y * 180) / Math.PI)}°`);
      }
      addAction('نقل', 'move');
      addAction('تدوير', 'rotate', 'R');
      addAction('إزالة', 'remove', 'Del');
      addAction('تراجع', 'undo', 'Ctrl+Z');
      addAction('إعادة', 'redo', 'Ctrl+Y');
    }
    positionPanel(anchor?.x, anchor?.y);
  };

  const openAt = (clientX, clientY) => {
    if (!inSupportedView() || !currentSelection() || isMovePending()) return false;
    dismissedSelection = null;
    selected = currentSelection();
    anchor = clientX === undefined || clientY === undefined ? null : { x: clientX, y: clientY };
    render();
    panel.querySelector('button')?.focus({ preventScroll: true });
    return true;
  };

  closeButton.addEventListener('click', () => {
    dismissedSelection = selected;
    panel.hidden = true;
  });

  window.addEventListener('pointerdown', (event) => {
    if (replayingCircuitClick || currentLab() !== 'circuit' || isMovePending() ||
        !event.composedPath().includes(canvas)) return;
    const item = currentSelection();
    if (item && hitSelectedObject(item, event)) beginCircuitDrag(event, item);
  }, true);

  canvas.addEventListener('pointerdown', (event) => {
    if (replayingCircuitClick) return;
    const item = currentSelection();
    if (item && !isMovePending() && hitSelectedObject(item, event)) {
      if (currentLab() === 'circuit') return;
      beginDrag(event, item);
      return;
    }
    pointerStart = {
      x: event.clientX,
      y: event.clientY,
      time: performance.now(),
      selection: currentSelection()
    };
    window.clearTimeout(longPressTimer);
    if (pointerStart.selection && !isMovePending()) {
      longPressTimer = window.setTimeout(() => {
        openAt(event.clientX, event.clientY);
      }, 650);
    }
  }, true);

  canvas.addEventListener('pointermove', (event) => {
    if (drag) {
      if (Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) > 6) {
        const dragStarted = !drag.moved;
        drag.moved = true;
        if (controls) controls.enabled = false;
        canvas.style.cursor = 'grabbing';
        const stageRect = stage.getBoundingClientRect();
        dragPreview.hidden = false;
        dragPreview.textContent = drag.lab === 'chem'
          ? drag.item.d?.ar || 'أداة مختبر'
          : circuitNames[drag.item.type] || 'قطعة دارة';
        dragPreview.style.left = `${event.clientX - stageRect.left + 12}px`;
        dragPreview.style.top = `${event.clientY - stageRect.top + 12}px`;
        if (drag.lab === 'chem') {
          const point = worldAtPointer(event, 0);
          drag.target = findFreeChemistryPosition(point, drag.item);
          if (drag.target) {
            drag.item.grp.position.set(drag.target.x, drag.original.y, drag.target.z);
          }
        } else if (dragStarted) {
          dismissedSelection = drag.item;
          anchor = null;
          panel.hidden = true;
        }
      }
      if (drag.lab === 'circuit') return;
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }
    if (pointerStart && Math.hypot(event.clientX - pointerStart.x, event.clientY - pointerStart.y) > 8) {
      window.clearTimeout(longPressTimer);
    }
  }, true);

  canvas.addEventListener('pointerup', (event) => {
    if (replayingCircuitClick) return;
    if (drag) {
      if (drag.lab === 'circuit') {
        const completedDrag = drag;
        drag = null;
        pointerStart = null;
        event.preventDefault();
        event.stopImmediatePropagation();
        dragPreview.hidden = true;
        canvas.style.cursor = '';
        if (completedDrag.moved) {
          replayingCircuitClick = true;
          try {
            for (const type of ['pointerdown', 'pointerup']) {
              canvas.dispatchEvent(new PointerEvent(type, {
                bubbles: true,
                cancelable: true,
                clientX: event.clientX,
                clientY: event.clientY,
                button: 0,
                buttons: type === 'pointerdown' ? 1 : 0,
                pointerId: event.pointerId || 1,
                pointerType: event.pointerType || 'mouse',
                isPrimary: true
              }));
            }
          } finally {
            replayingCircuitClick = false;
          }
          if (lab.circuit.BD.tool === 'move') document.querySelector('[data-tool="sel"]')?.click();
          if (controls) controls.enabled = true;
          window.CircuitPersistence?.capture();
          render();
        } else {
          document.querySelector('[data-tool="sel"]')?.click();
          if (controls) controls.enabled = true;
          openAt(event.clientX, event.clientY);
        }
        return;
      }
      event.preventDefault();
      event.stopImmediatePropagation();
      finishDrag(event);
      return;
    }
    window.clearTimeout(longPressTimer);
    if (!pointerStart || event.button !== 0) {
      pointerStart = null;
      return;
    }
    const elapsed = performance.now() - pointerStart.time;
    const previousSelection = pointerStart.selection;
    pointerStart = null;
    const nowSelected = currentSelection();
    if (previousSelection && nowSelected === previousSelection && elapsed < 500) {
      openAt(event.clientX, event.clientY);
    }
    if (currentLab() === 'chem') window.ApparatusPersistence?.capture();
  }, true);

  document.getElementById('toolsbar')?.addEventListener('click', (event) => {
    if (currentLab() === 'chem' && event.target instanceof Element && event.target.closest('button')) {
      window.ApparatusPersistence?.capture();
    }
  });

  canvas.addEventListener('pointercancel', (event) => {
    if (drag) {
      if (drag.lab === 'circuit') {
        drag = null;
        pointerStart = null;
        if (controls) controls.enabled = true;
        dragPreview.hidden = true;
        canvas.style.cursor = '';
        render();
        return;
      }
      event.preventDefault();
      event.stopImmediatePropagation();
      finishDrag(event, true);
    }
    window.clearTimeout(longPressTimer);
    pointerStart = null;
  }, true);

  canvas.addEventListener('contextmenu', (event) => {
    if (openAt(event.clientX, event.clientY)) event.preventDefault();
  });

  canvas.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && currentSelection()) {
      event.preventDefault();
      openAt();
    }
  });

  document.addEventListener('keydown', (event) => {
    if (panel.hidden || event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
    if (event.key === 'Escape') {
      dismissedSelection = selected;
      panel.hidden = true;
    } else if (event.key.toLowerCase() === 'r') {
      event.preventDefault();
      runAction('rotate');
    } else if (event.key.toLowerCase() === 'f' && currentLab() === 'circuit') {
      event.preventDefault();
      runAction('flip');
    } else if (event.key === 'Delete') {
      event.preventDefault();
      runAction('remove');
    }
  });

  window.setInterval(() => {
    render();
  }, 250);
  updateWorldLabels();
})();
