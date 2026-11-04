(() => {
  const AUDIO_METHODS = Object.freeze({
    bubbles_started: 'pop',
    boiling_started: 'setBoil',
    boiling_intensified: 'setBoil',
    steam_started: 'puff',
    overflow: 'splash',
    vessel_cracked: 'crack',
    vessel_broken: 'boom'
  });
  const AUDIO_COOLDOWNS_SECONDS = Object.freeze({
    bubbles_started: 0.2,
    boiling_started: 0,
    boiling_intensified: 0,
    steam_started: 0.5,
    overflow: 0,
    vessel_cracked: 0,
    vessel_broken: 0
  });
  const lastAudioTime = new Map();

  function dispatchVisualEvents(events, root = typeof window !== 'undefined' ? window : null) {
    if (!Array.isArray(events)) throw new TypeError('Science events must be an array');
    events.forEach((event) => {
      if (!event || typeof event.type !== 'string') {
        throw new TypeError('Each science event must have a type');
      }

      if (root && typeof root.dispatchEvent === 'function') {
        let visualEvent;
        if (typeof CustomEvent !== 'undefined') {
          visualEvent = new CustomEvent('lab:science-event', { detail: event });
        } else if (typeof Event !== 'undefined') {
          visualEvent = new Event('lab:science-event');
          Object.defineProperty(visualEvent, 'detail', { value: event });
        } else {
          visualEvent = { type: 'lab:science-event', detail: event };
        }
        root.dispatchEvent(visualEvent);
      }
    });
    return events.map((event) => event.id);
  }

  function playAudioEvents(events, audio = typeof window !== 'undefined' && window.__lab && window.__lab.P0, deltaSeconds = 0) {
    if (!Array.isArray(events)) throw new TypeError('Science events must be an array');
    events.forEach((event) => {
      if (!event || typeof event.type !== 'string') {
        throw new TypeError('Each science event must have a type');
      }
      const methodName = AUDIO_METHODS[event.type];
      if (methodName && audio && typeof audio[methodName] === 'function') {
        const cooldown = AUDIO_COOLDOWNS_SECONDS[event.type] ?? 0;
        const lastTime = lastAudioTime.get(event.type);
        const canPlay = lastTime === undefined || event.timeSeconds === undefined || event.timeSeconds < lastTime ||
          event.timeSeconds - lastTime >= cooldown;
        if (canPlay) {
          if (methodName === 'setBoil') {
            audio[methodName](event.intensity, deltaSeconds);
          } else {
            audio[methodName]();
          }
          if (Number.isFinite(event.timeSeconds)) lastAudioTime.set(event.type, event.timeSeconds);
        }
      }
    });
  }

  function present(events, options = {}) {
    const root = options.eventTarget || (typeof window !== 'undefined' ? window : null);
    const audio = options.audio || (typeof window !== 'undefined' && window.__lab && window.__lab.P0);
    const deltaSeconds = Number.isFinite(options.deltaSeconds) ? options.deltaSeconds : 0;
    const presented = dispatchVisualEvents(events, root);
    playAudioEvents(events, audio, deltaSeconds);
    return presented;
  }

  const ScienceEffects = Object.freeze({
    present,
    dispatchVisualEvents,
    playAudioEvents,
    AUDIO_METHODS,
    AUDIO_COOLDOWNS_SECONDS
  });

  if (typeof window !== 'undefined') {
    window.LabScienceEffects = ScienceEffects;
    window.__lab = window.__lab || {};
    window.__lab.scienceEffects = ScienceEffects;
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { ScienceEffects };
  }
})();
