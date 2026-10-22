// Placeholder 2D scene with the same API as scene.js (CONTRACT-v2 Scene API). Used only if scene.js is missing or fails.
import { dirs, elev } from './astro.js';
const D2R = Math.PI / 180;
let C, ctx, el, S = { sites: [], regions: [] }, view = 'globe', tMs = Date.now(), focus = null, picker = null, handlers = {}, quality = 'high', buf, bctx, pickMark = null;
const COL = { landed: '#2ecc71', partial: '#f1c40f', failed: '#e74c3c', planned: '#3498db' };
const POLE_MIN = -80;
function emit(e, d) { (handlers[e] || []).forEach(f => f(d)); }
function geom() { const w = C.width, h = C.height, r = Math.min(w, h) * 0.38; return { w, h, r, cx: w / 2, cy: h * 0.45 }; }
// globe: orthographic centred lat0=-25, lon0=0
const LAT0 = -25 * D2R;
function projG(lat, lon) { const la = lat * D2R, lo = lon * D2R; const x = Math.cos(la) * Math.sin(lo), y = Math.cos(LAT0) * Math.sin(la) - Math.sin(LAT0) * Math.cos(la) * Math.cos(lo), z = Math.sin(LAT0) * Math.sin(la) + Math.cos(LAT0) * Math.cos(la) * Math.cos(lo); return { x, y, vis: z > 0 }; }
function unprojG(x, y) { const z = Math.sqrt(Math.max(0, 1 - x * x - y * y)); const la = Math.asin(y * Math.cos(LAT0) + z * Math.sin(LAT0)); const lo = Math.atan2(x, z * Math.cos(LAT0) - y * Math.sin(LAT0)); return [la / D2R, lo / D2R]; }
function projP(lat, lon) { const rr = (90 + lat) / (90 + POLE_MIN); return { x: rr * Math.sin(lon * D2R), y: rr * Math.cos(lon * D2R) * 1, vis: lat <= POLE_MIN }; } // lon 0 at bottom (towards Earth)
function unprojP(x, y) { const rr = Math.hypot(x, y); return [-90 + rr * (90 + POLE_MIN), Math.atan2(x, y) / D2R]; }
function noise(a, b) { let v = 0; for (let k = 1; k < 5; k++) v += Math.sin(a * 3.1 * k + Math.cos(b * 2.3 * k)) * Math.cos(b * 2.7 * k + k) / k; return v; }
function render() {
  if (!C) return; const g = geom(), d = dirs(tMs), N = quality === 'low' ? 140 : 220;
  ctx.fillStyle = '#05060a'; ctx.fillRect(0, 0, g.w, g.h);
  const img = bctx.createImageData(N, N);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const x = i / N * 2 - 1, y = 1 - j / N * 2; if (x * x + y * y > 1) continue;
    const [la, lo] = view === 'globe' ? unprojG(x, y) : unprojP(x, y);
    const n = noise(la * (view === 'pole' ? 1.2 : 0.15), lo * (view === 'pole' ? 0.12 : 0.05));
    let s = Math.sin(elev(la, lo, d.sun) * D2R + n * (view === 'pole' ? 0.06 : 0.02));
    let v = s > 0 ? 40 + 190 * Math.min(1, s * (view === 'pole' ? 8 : 1.4)) : 14 + 6 * n;
    const k = (j * N + i) * 4; img.data[k] = v; img.data[k + 1] = v * 0.97; img.data[k + 2] = v * 0.92; img.data[k + 3] = 255;
  }
  bctx.putImageData(img, 0, 0);
  ctx.imageSmoothingEnabled = true; ctx.drawImage(buf, g.cx - g.r, g.cy - g.r, g.r * 2, g.r * 2);
  ctx.strokeStyle = 'rgba(255,255,255,.12)'; ctx.beginPath(); ctx.arc(g.cx, g.cy, g.r, 0, 7); ctx.stroke();
  const P = (la, lo) => { const p = view === 'globe' ? projG(la, lo) : projP(la, lo); return { X: g.cx + p.x * g.r, Y: g.cy - p.y * g.r, vis: p.vis }; };
  if (view === 'pole') { // Earth arrow along lon of sub-Earth point
    const eLon = Math.atan2(d.earth[1], d.earth[0]) / D2R, p = P(-80, eLon), up = elev(-89, eLon, d.earth) > -2;
    ctx.fillStyle = up ? '#4da3ff' : 'rgba(77,163,255,.35)'; ctx.font = '12px JetBrains Mono, monospace'; ctx.textAlign = 'center';
    ctx.beginPath(); ctx.arc(p.X, p.Y, 7, 0, 7); ctx.fill(); ctx.fillText('EARTH', p.X, p.Y + (p.Y > g.cy ? 20 : -12));
    const sLon = Math.atan2(d.sun[1], d.sun[0]) / D2R, q = P(-80, sLon); ctx.fillStyle = '#ffb547'; ctx.beginPath(); ctx.arc(q.X, q.Y, 7, 0, 7); ctx.fill(); ctx.fillText('SUN', q.X, q.Y + (q.Y > g.cy ? 20 : -12));
  }
  S.regions.forEach(r => { const p = P(r.lat, r.lon); if (!p.vis) return; ctx.strokeStyle = 'rgba(255,181,71,.55)'; ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.arc(p.X, p.Y, view === 'pole' ? g.r * 0.09 : 4, 0, 7); ctx.stroke(); ctx.setLineDash([]); });
  S.sites.forEach(s => { if (s.lat == null) return; const p = P(s.lat, s.lon); if (!p.vis) return; const f = focus === s.id;
    ctx.fillStyle = s.cancelled ? '#777' : COL[s.status] || '#aaa'; ctx.strokeStyle = f ? '#fff' : 'rgba(0,0,0,.6)'; ctx.lineWidth = f ? 3 : 1.5;
    ctx.beginPath(); ctx.arc(p.X, p.Y, f ? 9 : 6, 0, 7); ctx.fill(); ctx.stroke(); ctx.lineWidth = 1;
    if (f || view === 'pole') { ctx.fillStyle = '#e8ecf3'; ctx.font = '12px Inter, sans-serif'; ctx.textAlign = 'left'; ctx.fillText(s.mission, p.X + 11, p.Y + 4); } });
  if (pickMark) { const p = P(pickMark.lat, pickMark.lon); ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(p.X - 9, p.Y); ctx.lineTo(p.X + 9, p.Y); ctx.moveTo(p.X, p.Y - 9); ctx.lineTo(p.X, p.Y + 9); ctx.stroke(); ctx.lineWidth = 1; }
  ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.font = '11px JetBrains Mono, monospace'; ctx.textAlign = 'left'; ctx.fillText('2D placeholder scene', 12, g.h - 8);
}
function size() { const dpr = Math.min(2, devicePixelRatio || 1); C.width = el.clientWidth * dpr; C.height = el.clientHeight * dpr; C.style.width = '100%'; C.style.height = '100%'; render(); }
function click(ev) {
  const g = geom(), b = C.getBoundingClientRect(), sx = C.width / b.width, X = (ev.clientX - b.left) * sx, Y = (ev.clientY - b.top) * sx;
  const x = (X - g.cx) / g.r, y = -(Y - g.cy) / g.r;
  if (picker && view === 'pole' && x * x + y * y <= 1) { const [lat, lon] = unprojP(x, y); pickMark = { lat, lon }; render(); picker({ lat, lon }); return; }
  let best = null, bd = 22 * sx;
  S.sites.forEach(s => { if (s.lat == null) return; const p = view === 'globe' ? projG(s.lat, s.lon) : projP(s.lat, s.lon); if (!p.vis) return; const dd = Math.hypot(g.cx + p.x * g.r - X, g.cy - p.y * g.r - Y); if (dd < bd) { bd = dd; best = s.id; } });
  if (best) emit('siteclick', { id: best });
}
export async function init(container, data) {
  el = container; S = { sites: data.sites || [], regions: data.regions || [] };
  C = document.createElement('canvas'); el.appendChild(C); ctx = C.getContext('2d');
  buf = document.createElement('canvas'); buf.width = buf.height = 220; bctx = buf.getContext('2d');
  addEventListener('resize', size); C.addEventListener('click', click); size(); setTimeout(() => emit('ready', {}), 0);
}
export function setView(v) { view = v; render(); }
export function setTime(iso) { tMs = Date.parse(iso); render(); }
export function focusSite(id) { focus = id; const s = S.sites.find(x => x.id === id); if (s && s.lat <= POLE_MIN && view !== 'pole') view = 'pole'; render(); }
export function pickPoint(cb) { picker = cb; if (!cb) pickMark = null; render(); }
export function setPickMarker(p) { pickMark = p; render(); }
export function on(e, cb) { (handlers[e] = handlers[e] || []).push(cb); }
export function setQuality(q) { quality = q; buf.width = buf.height = q === 'low' ? 140 : 220; render(); }
export const isStub = true;
