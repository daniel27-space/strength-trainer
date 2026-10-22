// v2 plan.js — client-side "plan a landing" for the south pole (practice code).
// Uses data/ephem.json (Sun/Earth unit vectors, MOON_ME), data/plan_grid.json (cells + pins), data/plan_horizon.json (64-az uint8 horizon masks).
// API: await initPlan(baseUrl?)  then  await planLanding(lat, lon, startIso, weights?, opts?)
const R = 1737400, S = 240, C0 = 1905.5, DEG = Math.PI / 180;
let D = null, loading = null;
export const DEFAULT_WEIGHTS = { sun: 1, comms: 1, slope: 1 };
export const WINDOW_DAYS = 60, MIN_SUN_AHEAD_H = 48;

function b64ToBytes(s) {
  if (typeof atob === 'function') { const b = atob(s), u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; }
  return new Uint8Array(Buffer.from(s, 'base64'));
}
export function setPlanData(ephem, grid, horizon) {
  const naz = horizon.naz, levels = grid.levels.map((l, k) => ({ ...l, masks: b64ToBytes(horizon.levels[k].b64), index: new Map() }));
  grid.cells.forEach((c, n) => { const L = levels[c[0]]; L.index.set(c[1] + ',' + c[2], n - L.offset); });
  const pins = grid.pins.map((p, k) => ({ ...p, mask: b64ToBytes(horizon.pins[k].b64) }));
  D = { ephem, grid, naz, levels, pins, t0: Date.parse(ephem.start) };
  return D;
}
export function initPlan(base = new URL('./data/', import.meta.url).href) {
  if (D) return Promise.resolve(D);
  if (!loading) loading = Promise.all(['ephem.json', 'plan_grid.json', 'plan_horizon.json'].map(f => fetch(base + f).then(r => r.json())))
    .then(([e, g, h]) => setPlanData(e, g, h));
  return loading;
}
// polar stereographic pixel (sample s, line l) of a lat/lon — same convention as calc/terrain.py
function toPx(lat, lon) { const k = 2 * R * Math.tan(Math.PI / 4 + lat * DEG / 2); return [k * Math.sin(lon * DEG) / S + C0, -k * Math.cos(lon * DEG) / S + C0]; }
function distKm(a1, o1, a2, o2) { const [s1, l1] = toPx(a1, o1), [s2, l2] = toPx(a2, o2); return Math.hypot(s1 - s2, l1 - l2) * S / 1000; }

export function lookupCell(lat, lon) {
  if (lat > -75) return null;
  const pin = D.pins.map(p => [p, distKm(lat, lon, p.lat, p.lon)]).sort((a, b) => a[1] - b[1])[0];
  const [s, l] = toPx(lat, lon);
  let cell = null;
  for (const L of [...D.levels].reverse()) {
    if (lat > L.lat_max) continue;
    const i = Math.round((l - C0) / L.cell_px), j = Math.round((s - C0) / L.cell_px), k = L.index.get(i + ',' + j);
    if (k !== undefined) { const row = D.grid.cells[L.offset + k]; cell = { level: L.level, row, mask: L.masks.subarray(k * D.naz, (k + 1) * D.naz), distKm: distKm(lat, lon, row[3], row[4]), cell_m: L.cell_m }; break; }
  }
  if (pin && pin[1] < 0.5) { const p = pin[0]; // exact named-point mask (works outside the grid, down to lat -75)
    return { level: cell ? cell.level : null, row: [null, null, null, p.lat, p.lon, p.slope_deg, p.pct_lit, p.pct_earth, p.pct_both, p.longest_night_h], pin: p, mask: p.mask, distKm: pin[1], cell_m: null }; }
  if (!cell) return null;
  return cell;
}
function localFrame(lat, lon) {
  const la = lat * DEG, lo = lon * DEG;
  return { up: [Math.cos(la) * Math.cos(lo), Math.cos(la) * Math.sin(lo), Math.sin(la)], east: [-Math.sin(lo), Math.cos(lo), 0],
           north: [-Math.sin(la) * Math.cos(lo), -Math.sin(la) * Math.sin(lo), Math.cos(la)] };
}
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export function elevAz(lat, lon, v) { const f = localFrame(lat, lon); return [Math.asin(Math.max(-1, Math.min(1, dot(f.up, v)))) / DEG, ((Math.atan2(dot(f.east, v), dot(f.north, v)) / DEG) % 360 + 360) % 360]; }
function maskAt(mask, az, naz) { const f = az / 360 * naz, i0 = Math.floor(f) % naz, w = f - Math.floor(f), i1 = (i0 + 1) % naz; return (mask[i0] * (1 - w) + mask[i1] * w) * 0.05 - 2; }

// Returns the result synchronously once data is loaded (initPlan resolved); before that it returns a Promise. `await` works either way.
export function planLanding(lat, lon, startIso, weights = DEFAULT_WEIGHTS, opts = {}) {
  if (!D) return initPlan(opts.base).then(() => planLanding(lat, lon, startIso, weights, opts));
  const days = opts.days || WINDOW_DAYS, e = D.ephem, st = e.step_hours;
  const cell = lookupCell(lat, lon);
  if (!cell) return { error: 'Outside south-pole planning area (lat <= -84, or within 0.5 km of a named polar site down to -75)' };
  const i0 = Math.max(0, Math.round((Date.parse(startIso) - D.t0) / 3.6e6 / st));
  const n = Math.min(Math.round(days * 24 / st), e.sun.length - i0);
  if (n <= 0) return { error: 'Date outside ephemeris range 2026-11-01..2027-04-30' };
  const lit = [], ev = [], sunEl = [], earthEl = [];
  for (let k = 0; k < n; k++) {
    const [se, sa] = elevAz(lat, lon, e.sun[i0 + k]), [ee, ea] = elevAz(lat, lon, e.earth[i0 + k]);
    sunEl.push(se); earthEl.push(ee); lit.push(se > maskAt(cell.mask, sa, D.naz)); ev.push(ee > maskAt(cell.mask, ea, D.naz));
  }
  const rem = new Array(n); for (let k = n - 1, r = 0; k >= 0; k--) { r = lit[k] ? r + st : 0; rem[k] = r; }
  let longest = 0, cur = 0; for (const x of lit) { cur = x ? 0 : cur + st; longest = Math.max(longest, cur); }
  // landing window: Sun above terrain, Earth above terrain, >= 48 h of continuous sunlight ahead. score = min(sun ahead / 10 d, 1)
  const iso = k => new Date(D.t0 + (i0 + k) * st * 3.6e6).toISOString().replace('.000', '');
  const windows = []; for (let k = 0; k < n;) {
    if (lit[k] && ev[k] && rem[k] >= MIN_SUN_AHEAD_H) { let j = k, s = 0; while (j + 1 < n && lit[j + 1] && ev[j + 1] && rem[j + 1] >= MIN_SUN_AHEAD_H) j++;
      for (let q = k; q <= j; q++) s += Math.min(rem[q] / 240, 1);
      windows.push({ start: iso(k), end: iso(j), hours: (j - k + 1) * st, sunAheadHours: rem[k], score: +(s / (j - k + 1)).toFixed(3) }); k = j + 1; } else k++;
  }
  windows.sort((a, b) => b.score - a.score || Date.parse(a.start) - Date.parse(b.start));
  const sunHours = lit.filter(Boolean).length * st, earthHours = ev.filter(Boolean).length * st;
  const slopeDeg = cell.row[5];
  // components: unweighted 0..1. breakdown: weighted contributions (sum = score, 0..1) — same semantics as mock-plan.js
  const components = { sun: sunHours / (n * st), comms: earthHours / (n * st), slope: Math.max(0, Math.min(1, 1 - slopeDeg / 15)) };
  const w = { ...DEFAULT_WEIGHTS, ...weights }, wsum = (w.sun + w.comms + w.slope) || 1;
  const breakdown = { sun: components.sun * w.sun / wsum, comms: components.comms * w.comms / wsum, slope: components.slope * w.slope / wsum };
  const score = breakdown.sun + breakdown.comms + breakdown.slope;
  return { lat, lon, start: iso(0), end: iso(n - 1), days: n * st / 24, windows: windows.slice(0, 5), windowCount: windows.length,
    sunHours, earthHours, bothHours: lit.filter((x, k) => x && ev[k]).length * st, longestNight: longest, longestNightIsLowerBound: !lit[0] || !lit[n - 1],
    score, breakdown, components, weights: w, slopeDeg, slope_deg: slopeDeg, mock: false,
    samples: lit.map((x, k) => ({ t: D.t0 + (i0 + k) * st * 3.6e6, sun: sunEl[k], earth: earthEl[k], lit: x, ev: ev[k] })),
    cell: { level: cell.level, lat: cell.row[3], lon: cell.row[4], cell_m: cell.cell_m, distKm: +cell.distKm.toFixed(2), pin: cell.pin ? cell.pin.id : null,
      stats180d: { pct_lit: cell.pin ? cell.pin.pct_lit : cell.row[6], pct_earth: cell.pin ? cell.pin.pct_earth : cell.row[7], pct_both: cell.pin ? cell.pin.pct_both : cell.row[8], longest_night_h: cell.pin ? cell.pin.longest_night_h : cell.row[9] } },
    notes: 'Score 0-1 (show as 0-100) is a weighted index, NOT a probability. sun/comms = % of the window with Sun/Earth above the terrain horizon; slope: 0 deg = 100, >=15 deg = 0.',
    source_url: D.grid.source_url, uncertainty: D.grid.uncertainty };
}

if (typeof window !== 'undefined') initPlan().catch(e => console.warn('plan data load failed', e));
