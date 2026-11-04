(() => {
  const tickHandlers = new Set();

  const emitTick = (data) => {
    tickHandlers.forEach((handler) => {
      try {
        handler(data);
      } catch (error) {
        console.error('LabRuntime tick handler failed:', error);
      }
    });
  };

  const runtime = {
    onTick(handler) {
      if (typeof handler !== 'function') return () => {};
      tickHandlers.add(handler);
      return () => tickHandlers.delete(handler);
    },
    triggerAlert(kind, message, level = 'info', timeout = 4) {
      const alerts = document.getElementById('alerts');
      if (!alerts) return;
      const item = document.createElement('div');
      item.className = `alert ${level === 'warn' ? 'warn' : ''}${level === 'err' ? ' err' : ''}`.trim();
      item.textContent = message;
      alerts.appendChild(item);
      if (timeout > 0) {
        window.setTimeout(() => item.remove(), timeout * 1000);
      }
    },
    notifyTick(data) {
      emitTick(data);
    }
  };

  window.__lab = window.__lab || {};
  const previousOnTick = window.__lab.onTick;
  window.__lab.onTick = function nextTick(data) {
    if (typeof previousOnTick === 'function') {
      try {
        previousOnTick(data);
      } catch (error) {
        console.error('Previous __lab.onTick failed:', error);
      }
    }
    emitTick(data);
  };

  window.__lab.triggerAlert = window.__lab.triggerAlert || runtime.triggerAlert.bind(runtime);
  window.__lab.runtime = runtime;
  window.LabRuntime = runtime;
})();
