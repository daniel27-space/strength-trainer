// Shared helpers: sun/Earth direction (from data/ephem.json if loaded, else analytic approximation) and elevation at a site.
const D2R = Math.PI / 180, DAY = 86400000;
let EPH = null;
export function setEphem(e) { if (e && e.sun && e.sun.length) { EPH = { ...e, t0: Date.parse(e.start), step: e.step_hours * 3600000 }; } }
export function ephemSource() { return EPH ? 'ephem' : 'analytic'; }
function unit(lat, lon) { const c = Math.cos(lat * D2R); return [c * Math.cos(lon * D2R), c * Math.sin(lon * D2R), Math.sin(lat * D2R)]; }
function interp(arr, t) {
  const f = (t - EPH.t0) / EPH.step, i = Math.max(0, Math.min(arr.length - 2, Math.floor(f))), a = Math.max(0, Math.min(1, f - i));
  const p = arr[i], q = arr[i + 1], v = [p[0] + (q[0] - p[0]) * a, p[1] + (q[1] - p[1]) * a, p[2] + (q[2] - p[2]) * a];
  const n = Math.hypot(...v) || 1; return v.map(x => x / n);
}
const NM = Date.parse('2000-01-06T18:14:00Z');
function analytic(t) {
  const d = (t - NM) / DAY;
  const sunLon = 180 - 360 * (d / 29.530589), sunLat = 1.54 * Math.sin(2 * Math.PI * d / 346.62);
  const eLat = 6.7 * Math.sin(2 * Math.PI * d / 27.212), eLon = 7.9 * Math.sin(2 * Math.PI * d / 27.555);
  return { sun: unit(sunLat, sunLon), earth: unit(eLat, eLon) };
}
export function dirs(tMs) {
  if (EPH) { const t1 = EPH.t0 + EPH.step * (EPH.sun.length - 1); if (tMs >= EPH.t0 && tMs <= t1) return { sun: interp(EPH.sun, tMs), earth: interp(EPH.earth, tMs) }; }
  return analytic(tMs);
}
export function elev(lat, lon, v) { const u = unit(lat, lon); return Math.asin(Math.max(-1, Math.min(1, u[0] * v[0] + u[1] * v[1] + u[2] * v[2]))) / D2R; }
export function azim(lat, lon, v) { // azimuth deg from north, clockwise
  const la = lat * D2R, lo = lon * D2R;
  const e = [-Math.sin(lo), Math.cos(lo), 0], n = [-Math.sin(la) * Math.cos(lo), -Math.sin(la) * Math.sin(lo), Math.cos(la)];
  return (Math.atan2(v[0] * e[0] + v[1] * e[1], v[0] * n[0] + v[1] * n[1] + v[2] * n[2]) / D2R + 360) % 360;
}
export function sample(lat, lon, startMs, days, stepH = 3) {
  const out = [];
  for (let t = startMs; t <= startMs + days * DAY; t += stepH * 3600000) {
    const d = dirs(t), se = elev(lat, lon, d.sun), ee = elev(lat, lon, d.earth);
    out.push({ t, sun: se, earth: ee, lit: se > 0, ev: ee > 0 });
  }
  return out;
}
export { DAY };
