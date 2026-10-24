// v3 plan.js — terrain-aware sunlight / Earth-visibility planner (practice code, runs in the browser).
// Data: data/ephem.json (Sun + Earth unit vectors, Moon ME frame, 3 h steps, 14 Nov 2026 .. 14 Nov 2027),
//       data/pins.json (named points, 360-azimuth horizon masks), and lazily data/plan_grid.json + data/plan_horizon.png
//       (2.9 km / 1 km grid cells south of 84°S, 64-azimuth masks).
// One code path for every number: Sun/Earth centre above the terrain horizon (flat 0° horizon where we have no terrain data).
const R = 1737400, S = 240, C0 = 1905.5, DEG = Math.PI / 180, RM_KM = 1737.4, HOUR = 36e5, DAY = 864e5;
export const MIN_SUN_AHEAD_H = 48, PIN_RADIUS_KM = 0.3;
let E = null, PINS = null, G = null, gridLoading = null, BASE = new URL('./data/', import.meta.url).href;
export const dec = c => c <= 200 ? c * 0.05 - 5 : 5 + (c - 200) * 0.15;

function b64ToBytes(s) { const b = atob(s), u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; }
const getJ = f => fetch(BASE + f).then(r => { if (!r.ok) throw new Error(f + ' ' + r.status); return r.json(); });

export async function initPlan(base) {
  if (base) BASE = base;
  const [e, p] = await Promise.all([getJ('ephem.json'), getJ('pins.json')]);
  E = { ...e, t0: Date.parse(e.start), step: e.step_hours * HOUR, n: e.sun.length };
  PINS = { ...p, pins: p.pins.map(x => ({ ...x, mask: Float32Array.from(b64ToBytes(x.b64), dec), b64: undefined })) };
  return { start: E.t0, end: E.t0 + (E.n - 1) * E.step, step: E.step };
}
export const ready = () => !!E;
export const gridReady = () => !!G;
export const range = () => ({ start: E.t0, end: E.t0 + (E.n - 1) * E.step, stepH: E.step_hours, updated: E.updated });
export const pinMeta = () => PINS;

// Grid (custom points): loaded on first use. Masks are an 8-bit greyscale PNG, one row per cell, 64 azimuths per row.
export function ensureGrid() {
  if (G) return Promise.resolve(G);
  gridLoading ||= (async () => {
    const [g, hm] = await Promise.all([getJ('plan_grid.json'), getJ('plan_horizon.json')]);
    const img = await new Promise((ok, err) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => err(new Error('plan_horizon.png')); i.src = BASE + 'plan_horizon.png'; });
    const cv = document.createElement('canvas'); cv.width = img.width; cv.height = img.height;
    const cx = cv.getContext('2d', { willReadFrequently: true }); cx.drawImage(img, 0, 0);
    const px = cx.getImageData(0, 0, img.width, img.height).data, raw = new Uint8Array(img.width * img.height);
    let sum = 0; for (let i = 0; i < raw.length; i++) { raw[i] = px[4 * i]; sum = (sum + raw[i]) % 4294967296; }
    if (sum !== hm.checksum_sum_mod_2_32) console.warn('plan_horizon.png checksum mismatch (browser colour management?)', sum, hm.checksum_sum_mod_2_32);
    const naz = hm.naz, levels = g.levels.map(l => ({ ...l, index: new Map() }));
    g.cells.forEach((c, n) => { levels[c[0]].index.set(c[1] + ',' + c[2], n); });
    G = { ...g, naz, levels, raw, checksumOk: sum === hm.checksum_sum_mod_2_32 };
    return G;
  })();
  return gridLoading;
}

// polar stereographic pixel (s, l) — same convention as calc/v3/common.py
export function toPx(lat, lon) { const k = 2 * R * Math.tan(Math.PI / 4 + lat * DEG / 2); return [k * Math.sin(lon * DEG) / S + C0, -k * Math.cos(lon * DEG) / S + C0]; }
function pxLL(s, l) { const x = (s - C0) * S, y = -(l - C0) * S, r = Math.hypot(x, y); return [(2 * Math.atan(r / (2 * R)) - Math.PI / 2) / DEG, Math.atan2(x, y) / DEG]; }
export function distKm(a1, o1, a2, o2) { // polar stereographic distance south of -60, great-circle otherwise
  if (a1 < -60 && a2 < -60) { const [s1, l1] = toPx(a1, o1), [s2, l2] = toPx(a2, o2); return Math.hypot(s1 - s2, l1 - l2) * S / 1000; }
  const p1 = a1 * DEG, p2 = a2 * DEG, d = Math.acos(Math.min(1, Math.sin(p1) * Math.sin(p2) + Math.cos(p1) * Math.cos(p2) * Math.cos((o2 - o1) * DEG))); return d * R / 1000;
}

// Where do this point's horizon numbers come from?
//   pin  : a named point with its own 360-direction horizon (exact)
//   cell : nearest grid cell (64 directions) — 'pending' until the grid has loaded
//   flat : no terrain data (north of 84°S and not a named point): flat 0° horizon estimate
export function locate(lat, lon) {
  let best = null; for (const p of PINS.pins) { const d = distKm(lat, lon, p.lat, p.lon); if (!best || d < best.d) best = { p, d }; }
  if (best && best.d <= PIN_RADIUS_KM) { const p = best.p;
    return { source: 'pin', id: p.id, naz: PINS.naz, mask: p.mask, distKm: best.d, slope: p.slope_deg, offDemPct: p.rays_off_dem_pct, year: p.year }; }
  if (lat <= -84) {
    if (!G) return { source: 'pending' };
    const [s, l] = toPx(lat, lon);
    for (const L of [...G.levels].reverse()) {
      if (lat > L.lat_max) continue;
      const i = Math.round((l - C0) / L.cell_px), j = Math.round((s - C0) / L.cell_px), k = L.index.get(i + ',' + j);
      if (k === undefined) continue;
      const row = G.cells[k], [cla, clo] = pxLL(C0 + j * L.cell_px, C0 + i * L.cell_px);
      const mask = new Float32Array(G.naz); for (let a = 0; a < G.naz; a++) mask[a] = dec(G.raw[k * G.naz + a]);
      return { source: 'cell', naz: G.naz, mask, cellM: L.cell_m, cellLat: cla, cellLon: clo, distKm: distKm(lat, lon, cla, clo), slope: row[3],
        year: { pct_lit: row[4], pct_earth: row[5], pct_both: row[6], longest_night_h: row[7], longest_night_lower_bound: !!row[8] } };
    }
  }
  return { source: 'flat', naz: 0, mask: null, slope: null };
}
function maskAt(loc, az) { if (!loc.mask) return 0; const n = loc.naz, f = az / 360 * n, i0 = Math.floor(f) % n, w = f - Math.floor(f), i1 = (i0 + 1) % n; return loc.mask[i0] * (1 - w) + loc.mask[i1] * w; }
export function horizonProfile(loc, step = 1) { const out = []; for (let a = 0; a < 360; a += step) out.push(maskAt(loc, a)); return out; }

function frame(lat, lon) { const la = lat * DEG, lo = lon * DEG;
  return { up: [Math.cos(la) * Math.cos(lo), Math.cos(la) * Math.sin(lo), Math.sin(la)], east: [-Math.sin(lo), Math.cos(lo), 0], north: [-Math.sin(la) * Math.cos(lo), -Math.sin(la) * Math.sin(lo), Math.cos(la)] }; }
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
function elAz(f, v) { return [Math.asin(Math.max(-1, Math.min(1, dot(f.up, v)))) / DEG, ((Math.atan2(dot(f.east, v), dot(f.north, v)) / DEG) % 360 + 360) % 360]; }
function earthTopo(i, f) { const d = E.earth_km[i], u = E.earth[i]; const v = [d * u[0] - RM_KM * f.up[0], d * u[1] - RM_KM * f.up[1], d * u[2] - RM_KM * f.up[2]]; const n = Math.hypot(...v); return [v[0] / n, v[1] / n, v[2] / n]; }

// Window: start snapped to the 3 h ephemeris grid, exclusive end, never silently clamped (flags say what happened).
export function makeWindow(startMs, days) {
  const notes = []; let i0 = Math.round((startMs - E.t0) / E.step);
  if (i0 < 0) { notes.push(`Data starts ${fmtDay(E.t0)}; the window was moved to start then.`); i0 = 0; }
  if (i0 > E.n - 9) { notes.push(`Data ends ${fmtDay(E.t0 + (E.n - 1) * E.step)}; the window was moved back.`); i0 = E.n - 9; }
  const want = Math.round(days * 24 / E.step_hours), n = Math.min(want, E.n - 1 - i0);
  const truncated = n < want; if (truncated) notes.push(`Data ends ${fmtDay(E.t0 + (E.n - 1) * E.step)}, so this window is cut to ${(n * E.step_hours / 24).toFixed(0)} of ${days} days.`);
  return { i0, n, start: E.t0 + i0 * E.step, end: E.t0 + (i0 + n) * E.step, days: n * E.step_hours / 24, reqDays: days, truncated, notes, stepH: E.step_hours };
}
const fmtDay = ms => new Date(ms).toUTCString().slice(5, 16);

// Sun / Earth direction at any time (for the "now" marker), linear interpolation between 3 h samples.
export function skyAt(lat, lon, tMs, loc) {
  const f = (tMs - E.t0) / E.step, i = Math.max(0, Math.min(E.n - 2, Math.floor(f))), a = Math.max(0, Math.min(1, f - i)), fr = frame(lat, lon);
  const mix = (p, q) => { const v = [p[0] + (q[0] - p[0]) * a, p[1] + (q[1] - p[1]) * a, p[2] + (q[2] - p[2]) * a], n = Math.hypot(...v); return v.map(x => x / n); };
  const [se, sa] = elAz(fr, mix(E.sun[i], E.sun[i + 1])), [ee, ea] = elAz(fr, mix(earthTopo(i, fr), earthTopo(i + 1, fr)));
  const sh = loc ? maskAt(loc, sa) : 0, eh = loc ? maskAt(loc, ea) : 0;
  return { sunEl: se, sunAz: sa, sunHz: sh, earthEl: ee, earthAz: ea, earthHz: eh, lit: se > sh, ev: ee > eh };
}

export function evaluate(lat, lon, win, weights = { sun: 40, comms: 40, slope: 20 }, loc = locate(lat, lon)) {
  const { i0, n } = win, st = E.step_hours, fr = frame(lat, lon);
  const T = new Float64Array(n), sunEl = new Float32Array(n), sunAz = new Float32Array(n), sunHz = new Float32Array(n), earthEl = new Float32Array(n), earthAz = new Float32Array(n), earthHz = new Float32Array(n);
  const lit = new Uint8Array(n), ev = new Uint8Array(n);
  let nl = 0, ne = 0, nb = 0, fl = 0, fe = 0;
  for (let k = 0; k < n; k++) {
    const i = i0 + k; T[k] = E.t0 + i * E.step;
    const [se, sa] = elAz(fr, E.sun[i]), [ee, ea] = elAz(fr, earthTopo(i, fr));
    sunEl[k] = se; sunAz[k] = sa; earthEl[k] = ee; earthAz[k] = ea; sunHz[k] = maskAt(loc, sa); earthHz[k] = maskAt(loc, ea);
    lit[k] = se > sunHz[k] ? 1 : 0; ev[k] = ee > earthHz[k] ? 1 : 0; nl += lit[k]; ne += ev[k]; nb += lit[k] & ev[k]; fl += se > 0; fe += ee > 0;
  }
  // longest dark spell; it is only a lower bound if that spell touches the start or end of the window
  let best = 0, bestLB = false, run = 0, runStart = 0;
  for (let k = 0; k <= n; k++) { if (k < n && !lit[k]) { if (!run) runStart = k; run++; } else if (run) { const lb = runStart === 0 || k === n; if (run > best || (run === best && !lb)) { best = run; bestLB = lb; } run = 0; } }
  const rem = new Float32Array(n); for (let k = n - 1, r = 0; k >= 0; k--) { r = lit[k] ? r + st : 0; rem[k] = r; }
  const remLB = rem[0] !== undefined && lit[n - 1]; // sunlight that continues past the window end is a lower bound
  let windows = []; for (let k = 0; k < n;) {
    if (lit[k] && ev[k] && rem[k] >= MIN_SUN_AHEAD_H) { let j = k, s = 0; while (j + 1 < n && lit[j + 1] && ev[j + 1] && rem[j + 1] >= MIN_SUN_AHEAD_H) j++;
      for (let q = k; q <= j; q++) s += Math.min(rem[q] / 240, 1);
      windows.push({ start: T[k], end: T[j] + st * HOUR, hours: (j - k + 1) * st, sunAheadH: rem[k], sunAheadLB: remLB && rem[k] === (n - k) * st, score: s / (j - k + 1) }); k = j + 1; } else k++;
  }
  const windowCount = windows.length;
  if (windows.length) { const top = windows.reduce((a, b) => b.score > a.score || (b.score === a.score && b.hours > a.hours) ? b : a); top.best = true; }
  if (windows.length > 6) windows = [...windows].sort((a, b) => b.score - a.score).slice(0, 6);
  windows.sort((a, b) => a.start - b.start);
  const hours = n * st, slope = loc.slope;
  const comp = { sun: nl / n, comms: ne / n, slope: slope == null ? null : Math.max(0, Math.min(1, 1 - slope / 15)) };
  const w = { ...weights }; if (comp.slope == null) w.slope = 0; const ws = (w.sun + w.comms + w.slope) || 1;
  const share = { sun: w.sun / ws, comms: w.comms / ws, slope: w.slope / ws };
  const breakdown = { sun: comp.sun * share.sun, comms: comp.comms * share.comms, slope: (comp.slope ?? 0) * share.slope };
  // per-day fractions for the calendar
  const perDay = Math.round(24 / st), nd = Math.ceil(n / perDay), cal = [];
  for (let d = 0; d < nd; d++) { let a = 0, b = 0, c = 0, m = 0; for (let k = d * perDay; k < Math.min(n, (d + 1) * perDay); k++) { a += lit[k]; b += ev[k]; c += lit[k] & ev[k]; m++; } cal.push({ t: T[d * perDay], lit: a / m, ev: b / m, both: c / m }); }
  return { lat, lon, loc, win, n, stepH: st, T, sunEl, sunAz, sunHz, earthEl, earthAz, earthHz, lit, ev, cal,
    pctLit: 100 * nl / n, pctEarth: 100 * ne / n, pctBoth: 100 * nb / n, sunH: nl * st, earthH: ne * st, bothH: nb * st, hours,
    flatPctLit: 100 * fl / n, flatPctEarth: 100 * fe / n,
    longestDarkH: best * st, longestDarkLB: bestLB, neverLit: nl === 0, alwaysLit: nl === n,
    windows, windowCount, score: breakdown.sun + breakdown.comms + breakdown.slope, breakdown, comp, share, slope };
}
export { DAY, HOUR };
