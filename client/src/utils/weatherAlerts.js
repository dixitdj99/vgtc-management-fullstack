/**
 * weatherAlerts.js — turn the weather feed into warnings worth acting on.
 *
 * Cement and rain do not mix, so the yard needs telling *before* a load goes
 * out, not after. This reads WeatherAPI's condition codes and the next few
 * forecast hours and raises an alert for rain, thunderstorms and the like.
 *
 * Two things keep it from becoming noise:
 *  - the weather is polled every five minutes, so an alert's id is built from
 *    the event and the hour it belongs to. The same storm raises one alert, not
 *    twelve an hour.
 *  - alerts are stored, so "read" and "cleared" survive a page reload. A
 *    warning that reappears after every refresh gets ignored, which defeats it.
 */

const STORE_KEY = 'vgtc-weather-alerts';
const DISMISSED_KEY = 'vgtc-weather-dismissed';
const MAX_KEPT = 30;
// How long a dismissal is honoured. Alert ids are bucketed by hour, so a day is
// long enough that the same storm cannot return, and short enough that the
// record does not grow without end.
const DISMISS_TTL_MS = 24 * 3600 * 1000;

/* WeatherAPI condition codes. https://www.weatherapi.com/docs/ */
const THUNDER = [1087, 1273, 1276, 1279, 1282];
const HEAVY_RAIN = [1192, 1195, 1201, 1243, 1246, 1252];
const RAIN = [
  1063, 1150, 1153, 1168, 1171, 1180, 1183, 1186, 1189, 1198,
  1204, 1207, 1240, 1249,
];
const SNOW_ICE = [1066, 1069, 1072, 1114, 1117, 1210, 1213, 1216, 1219, 1222, 1225, 1237, 1255, 1258, 1261, 1264];

export const SEVERITY = { severe: 3, high: 2, moderate: 1 };

const hourKey = (iso) => {
  const d = iso ? new Date(iso) : new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}-${d.getHours()}`;
};

const timeLabel = (d) => d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });

/**
 * @param {object} data WeatherAPI forecast.json payload (also works with current.json)
 * @returns {object|null} the alert to raise, or null when the weather is fine
 */
export function detectWeatherAlert(data) {
  const cur = data?.current;
  if (!cur) return null;
  const code = cur.condition?.code;
  const text = cur.condition?.text || 'Bad weather';
  const now = new Date();

  const raise = (severity, title, message, key) => ({
    id: `wx-${key}`,
    severity,
    title,
    message,
    at: now.toISOString(),
    timeLabel: timeLabel(now),
    read: false,
  });

  // Happening now — most urgent, and specific about what to do.
  if (THUNDER.includes(code)) {
    return raise('severe', 'Thunderstorm now',
      `${text} at the yard. Stop loading, cover open bags and keep drivers out of the open.`,
      `thunder-${hourKey()}`);
  }
  if (HEAVY_RAIN.includes(code)) {
    return raise('high', 'Heavy rain now',
      `${text}. Cover the stock — bags left out will set.`,
      `heavy-${hourKey()}`);
  }
  if (RAIN.includes(code)) {
    return raise('moderate', 'Rain now',
      `${text}. Keep loaded trucks sheeted before they leave.`,
      `rain-${hourKey()}`);
  }
  if (SNOW_ICE.includes(code)) {
    return raise('high', 'Ice or sleet', `${text}. Roads may be unsafe.`, `ice-${hourKey()}`);
  }

  // Nothing yet — look ahead a few hours so there is time to react.
  const hours = data?.forecast?.forecastday?.[0]?.hour || [];
  const upcoming = hours
    .filter(h => new Date(h.time) > now && new Date(h.time) - now <= 6 * 3600 * 1000)
    .find(h => THUNDER.includes(h.condition?.code) || (h.chance_of_rain ?? 0) >= 50);

  if (upcoming) {
    const when = new Date(upcoming.time);
    const isStorm = THUNDER.includes(upcoming.condition?.code);
    return raise(
      isStorm ? 'high' : 'moderate',
      isStorm ? `Thunderstorm expected ${timeLabel(when)}` : `Rain likely ${timeLabel(when)}`,
      `${upcoming.condition?.text || 'Rain'} · ${upcoming.chance_of_rain ?? 0}% chance. Plan loading before then.`,
      `fc-${hourKey(upcoming.time)}`
    );
  }

  return null;
}

/* ── Storage ─────────────────────────────────────────────────────────────── */

export function loadAlerts() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORE_KEY) || '[]');
    return Array.isArray(raw) ? raw : [];
  } catch { return []; }
}

function save(list) {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(list.slice(0, MAX_KEPT))); } catch { /* quota — not worth failing over */ }
  return list;
}

/**
 * Ids the user has cleared.
 *
 * Without this, clearing an alert only removed it from the list and the very
 * next poll — five minutes later — raised the same storm again, chime and all.
 * A dismissal that does not survive is not a dismissal.
 */
function loadDismissed() {
  try {
    const raw = JSON.parse(localStorage.getItem(DISMISSED_KEY) || '{}');
    const cutoff = Date.now() - DISMISS_TTL_MS;
    return Object.fromEntries(Object.entries(raw).filter(([, t]) => t > cutoff));
  } catch { return {}; }
}

function remember(ids) {
  const map = loadDismissed();
  ids.forEach(id => { map[id] = Date.now(); });
  try { localStorage.setItem(DISMISSED_KEY, JSON.stringify(map)); } catch { /* ignore */ }
}

/**
 * Adds the alert unless it is already known — including one the user cleared,
 * which must not come back on the next poll.
 * @returns {{list: object[], added: boolean}}
 */
export function addAlert(existing, alert) {
  if (!alert) return { list: existing, added: false };
  if (existing.some(a => a.id === alert.id)) return { list: existing, added: false };
  if (loadDismissed()[alert.id]) return { list: existing, added: false };
  const list = save([alert, ...existing]);
  return { list, added: true };
}

export const markRead = (list, id) => save(list.map(a => (a.id === id ? { ...a, read: true } : a)));
export const markAllRead = (list) => save(list.map(a => ({ ...a, read: true })));
export const clearAlert = (list, id) => { remember([id]); return save(list.filter(a => a.id !== id)); };
export const clearAll = (list) => { remember(list.map(a => a.id)); return save([]); };
export const unreadCount = (list) => list.filter(a => !a.read).length;

/**
 * A short two-note chime. Built with WebAudio so there is no asset to ship and
 * nothing to 404. Browsers refuse audio until the user has interacted with the
 * page; by the time anyone is logged in that has happened, and a failure here
 * must never break the alert itself.
 */
export function playAlertChime() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const play = (freq, start, dur) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, ctx.currentTime + start);
      gain.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + start + dur);
      osc.connect(gain).connect(ctx.destination);
      osc.start(ctx.currentTime + start);
      osc.stop(ctx.currentTime + start + dur + 0.02);
    };
    play(880, 0, 0.18);
    play(1320, 0.2, 0.28);
    setTimeout(() => ctx.close().catch(() => {}), 1200);
  } catch { /* audio blocked — the panel still shows the alert */ }
}
