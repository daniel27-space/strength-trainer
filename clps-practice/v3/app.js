// Lunar Landing Site Navigator v3 — UI layer (practice code). Scene: scene.js. Numbers: plan.js (one code path for every figure).
import * as P from './plan.js';
const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
const DAY = P.DAY, HOUR = P.HOUR, DAYS = [30, 60, 90, 180, 365];
const MCOL = { landed: '#f4f6fb', partial: '#c792ea', failed: '#ff6b81', planned: '#a7b0bf', cancelled: '#6b7280' };
const st = { view: 'pole', sel: null, start: Date.parse('2026-11-14T00:00:00Z'), days: 60, t: null, w: { sun: 40, comms: 40, slope: 20 }, tab: 'site', cmp: [], layer: 'none', filter: 'all' };
let scene, SITES = [], REGIONS = [], FEATS = [], VAL = null, RANGE = null, EX = null, sceneOk = false;
const isPhone = () => innerWidth < 1000;
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const fD = ms => { const d = new Date(ms); return `${d.getUTCDate()} ${MON[d.getUTCMonth()]} ${d.getUTCFullYear()}`; };
const fDs = ms => { const d = new Date(ms); return `${d.getUTCDate()} ${MON[d.getUTCMonth()]}`; };
const fT = ms => { const d = new Date(ms); return `${fD(ms)} ${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')} UTC`; };
const iso = ms => new Date(ms).toISOString().slice(0, 10);
const pc = v => v == null ? '—' : (v >= 99.95 ? '100' : v < 0.05 ? '0' : v < 10 ? v.toFixed(1) : v.toFixed(0)) + '%';
const dur = h => h == null ? '—' : h < 48 ? `${Math.round(h)} h` : `${(h / 24).toFixed(h < 240 ? 1 : 0)} days`;
const statusOf = s => s.cancelled || s.status === 'cancelled' ? 'cancelled' : s.status;
const SVGI = {
  pick: '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="7" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="2" fill="currentColor"/><path d="M12 1v5M12 18v5M1 12h5M18 12h5" stroke="currentColor" stroke-width="2"/></svg>',
  play: '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4l13 8-13 8z" fill="currentColor"/></svg>',
  pause: '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 4h4v16H6zM14 4h4v16h-4z" fill="currentColor"/></svg>',
  share: '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12M7 8l5-5 5 5M5 13v7h14v-7" fill="none" stroke="currentColor" stroke-width="2"/></svg>',
  tour: '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><path d="M10 8l6 4-6 4z" fill="currentColor"/></svg>',
};
const markSVG = k => `<svg class="mk" viewBox="0 0 20 20" aria-hidden="true">${{ landed: `<circle cx="10" cy="10" r="6" fill="${MCOL.landed}" stroke="#11141b" stroke-width="1.5"/>`, partial: `<circle cx="10" cy="10" r="6" fill="none" stroke="${MCOL.partial}" stroke-width="2.4"/><path d="M10 4a6 6 0 0 1 0 12z" fill="${MCOL.partial}"/>`, failed: `<path d="M5 5l10 10M15 5L5 15" stroke="${MCOL.failed}" stroke-width="3" stroke-linecap="round"/>`, planned: `<circle cx="10" cy="10" r="6" fill="none" stroke="${MCOL.planned}" stroke-width="2.2" stroke-dasharray="3 2"/>`, cancelled: `<circle cx="10" cy="10" r="6" fill="none" stroke="${MCOL.cancelled}" stroke-width="2.2"/><path d="M6 14L14 6" stroke="${MCOL.cancelled}" stroke-width="2.2"/>`, region: `<circle cx="10" cy="10" r="6.5" fill="rgba(230,225,255,.25)" stroke="#e6e1ff" stroke-width="2"/>`, sun: '<circle cx="10" cy="10" r="4" fill="#ffc44d"/><g stroke="#ffc44d" stroke-width="1.6"><path d="M10 1v3M10 16v3M1 10h3M16 10h3M3.6 3.6l2 2M14.4 14.4l2 2M3.6 16.4l2-2M14.4 5.6l2-2"/></g>', earth: '<circle cx="10" cy="10" r="6" fill="#59b6ff"/><ellipse cx="8" cy="8" rx="2.5" ry="1.4" fill="#fff" opacity=".85"/>', nodata: '<rect x="3" y="3" width="14" height="14" rx="2" fill="#07080b" stroke="rgba(255,255,255,.35)" stroke-dasharray="2 2"/>' }[k] || ''}</svg>`;
function badge(url, kind = 'src', title = '') {
  const lbl = { src: 'src', unc: '± est', calc: 'calc', flat: 'flat est' }[kind] || 'src';
  const t = title || { src: 'Open the source', unc: 'Approximate value; open the source', calc: 'Our calculation (LOLA terrain + JPL ephemeris). Checked on 4 published points, see Method', flat: 'No terrain data: flat 0° horizon estimate' }[kind];
  return `<a class="src ${kind === 'unc' || kind === 'flat' ? 'unc' : ''}" href="${esc(url || 'data/validation_v3.json')}" target="_blank" rel="noopener" title="${esc(t)}">${lbl}</a>`;
}
const getJSON = u => fetch(u).then(r => r.ok ? r.json() : null).catch(() => null);

// ---------- selection ----------
// st.sel: { kind:'site'|'region'|'point', id?, lat, lon }
function selObj() {
  const s = st.sel; if (!s) return null;
  if (s.kind === 'site') { const m = SITES.find(x => x.id === s.id); return m && { ...s, name: m.mission, lat: m.lat, lon: m.lon, obj: m }; }
  if (s.kind === 'region') { const r = REGIONS.find(x => x.id === s.id); return r && { ...s, name: r.name, lat: r.lat, lon: r.lon, obj: r }; }
  return { ...s, name: 'Your pick', obj: null };
}
const exampleTarget = () => ({ kind: 'example', name: 'Shackleton rim (example)', lat: EX.lat, lon: EX.lon });
function target() { return selObj() || exampleTarget(); }

// ---------- window + cached results ----------
let winCache = null;
function win() { const k = st.start + ':' + st.days; if (winCache?.k !== k) winCache = { k, w: P.makeWindow(st.start, st.days) }; return winCache.w; }
const resCache = new Map();
function result(lat, lon) {
  const w = win(), k = `${lat.toFixed(5)},${lon.toFixed(5)}|${w.i0}|${w.n}|${st.w.sun},${st.w.comms},${st.w.slope}|${P.gridReady()}`;
  if (resCache.has(k)) return resCache.get(k);
  const loc = P.locate(lat, lon);
  if (loc.source === 'pending') { P.ensureGrid().then(() => { resCache.clear(); renderAll(); }).catch(e => console.warn(e)); return null; }
  if (resCache.size > 60) resCache.clear();
  const r = P.evaluate(lat, lon, w, st.w, loc); resCache.set(k, r); return r;
}

// ---------- hash ----------
function readHash() {
  const h = new URLSearchParams(location.hash.slice(1));
  if (h.get('view')) st.view = h.get('view') === 'globe' ? 'globe' : 'pole';
  const id = h.get('site'); if (id) { if (SITES.some(x => x.id === id)) st.sel = { kind: 'site', id }; else if (REGIONS.some(x => x.id === id)) st.sel = { kind: 'region', id }; }
  if (h.get('p')) { const [la, lo] = h.get('p').split(',').map(Number); if (isFinite(la) && isFinite(lo) && Math.abs(la) <= 90) st.sel = { kind: 'point', lat: la, lon: lo }; }
  if (h.get('start')) { const t = Date.parse(h.get('start') + 'T00:00:00Z'); if (!isNaN(t)) st.start = t; }
  if (h.get('days') && DAYS.includes(+h.get('days'))) st.days = +h.get('days');
  if (h.get('t')) { const t = Date.parse(h.get('t')); if (!isNaN(t)) st.t = t; }
  if (h.get('w')) { const [a, b, c] = h.get('w').split(',').map(Number); if ([a, b, c].every(x => x >= 0 && x <= 100)) st.w = { sun: a, comms: b, slope: c }; }
  if (['site', 'compare', 'missions', 'method'].includes(h.get('tab'))) st.tab = h.get('tab');
  if (h.get('cmp')) st.cmp = h.get('cmp').split(',').filter(Boolean).slice(0, 3);
  if (['lit', 'earth'].includes(h.get('layer'))) st.layer = h.get('layer');
  return h.get('tour') === '1';
}
let hashTimer;
function writeHash() {
  if (touring) return; clearTimeout(hashTimer); hashTimer = setTimeout(() => {
    const h = new URLSearchParams({ view: st.view });
    const s = st.sel; if (s?.kind === 'point') h.set('p', s.lat.toFixed(4) + ',' + s.lon.toFixed(4)); else if (s) h.set('site', s.id);
    h.set('start', iso(st.start)); h.set('days', st.days); h.set('t', new Date(st.t).toISOString().slice(0, 16) + 'Z');
    if (st.w.sun !== 40 || st.w.comms !== 40 || st.w.slope !== 20) h.set('w', `${st.w.sun},${st.w.comms},${st.w.slope}`);
    h.set('tab', st.tab); if (st.cmp.length) h.set('cmp', st.cmp.join(',')); if (st.layer !== 'none') h.set('layer', st.layer);
    history.replaceState(null, '', '#' + h.toString());
  }, 150);
}

// ---------- view / tabs / sheet ----------
function setView(v) { st.view = v; $$('.seg button').forEach(b => b.setAttribute('aria-pressed', b.dataset.view === v)); scene?.setView(v); writeHash(); }
function setTab(t, keepScroll) {
  st.tab = t; $$('.tabs button').forEach(b => { b.classList.toggle('on', b.dataset.tab === t); b.setAttribute('aria-selected', b.dataset.tab === t); });
  $$('section[data-pane]').forEach(s => s.classList.toggle('on', s.dataset.pane === t)); renderPane(); if (!keepScroll) $('#pbody').scrollTop = 0; writeHash();
}
const SNAP = { peek: () => 96, half: () => Math.round(innerHeight * 0.52), full: () => innerHeight - 62 };
function syncInsets() { if (!scene?.setInsets) return; const sc = $('#scrub').getBoundingClientRect(); if (isPhone()) scene.setInsets({ bottom: Math.max(0, innerHeight - sc.top) }); else scene.setInsets({ right: Math.max(0, innerWidth - $('#panel').getBoundingClientRect().left), bottom: Math.max(0, innerHeight - sc.top) }); }
function setSnap(s) {
  const p = $('#panel'); p.dataset.snap = s; requestAnimationFrame(syncInsets);
  if (!isPhone()) { p.style.height = ''; $('#scrub').style.bottom = ''; document.body.classList.remove('sheet-up'); return; }
  const h = SNAP[s](); p.style.height = h + 'px'; $('#scrub').style.bottom = (s === 'full' ? -300 : h + 6) + 'px'; document.body.classList.toggle('sheet-up', s === 'full');
  setTimeout(syncInsets, 280);
}
function sheetDrag() {
  const p = $('#panel'); let y0, h0, drag = false, moved = 0;
  const start = e => { if (!isPhone()) return; drag = true; moved = 0; y0 = e.clientY; h0 = p.getBoundingClientRect().height; p.classList.add('dragging'); };
  const move = e => { if (!drag) return; moved = Math.max(moved, Math.abs(e.clientY - y0)); if (moved > 6) p.style.height = Math.max(70, Math.min(SNAP.full(), h0 - (e.clientY - y0))) + 'px'; };
  const end = e => { if (!drag) return; drag = false; p.classList.remove('dragging'); if (moved < 6) { if (e.target.closest('#grab')) setSnap(p.dataset.snap === 'peek' ? 'half' : p.dataset.snap === 'half' ? 'full' : 'peek'); else setSnap(p.dataset.snap); return; }
    const h = p.getBoundingClientRect().height; let best = 'peek', bd = 1e9; for (const k in SNAP) { const d = Math.abs(SNAP[k]() - h); if (d < bd) { bd = d; best = k; } } setSnap(best); };
  $('#grab').addEventListener('pointerdown', start); addEventListener('pointermove', move); addEventListener('pointerup', end); addEventListener('pointercancel', end);
}

// ---------- time (the bar always spans the current window) ----------
let playing = false, speedIdx = 0, lastFrame = 0;
const SPEEDS = [{ l: '1 d/s', v: DAY }, { l: '4 d/s', v: 4 * DAY }, { l: '6 h/s', v: DAY / 4 }];
function setTime(ms, src) {
  const w = win(); st.t = Math.min(w.end - 1, Math.max(w.start, ms));
  if (src !== 'slider') $('#time').value = Math.round((st.t - w.start) / (w.end - w.start) * 1000);
  $('#tlabel').textContent = fT(st.t); scene?.setTime(st.t); updateNow(); writeHash();
}
function loop(ts) {
  if (playing) { const dt = Math.min(0.1, (ts - lastFrame) / 1000), w = win(); let t = st.t + dt * SPEEDS[speedIdx].v; if (t >= w.end - 1) t = w.start; setTime(t); }
  lastFrame = ts; requestAnimationFrame(loop);
}
function setPlaying(p) { playing = p; $('#play').innerHTML = p ? SVGI.pause : SVGI.play; $('#play').setAttribute('aria-label', p ? 'Pause' : 'Play'); }
function setSpeed(i) { speedIdx = i; $('#speed').textContent = SPEEDS[i].l; }
function setWindow(start, days, keepT) {
  st.start = start; st.days = days; winCache = null; resCache.clear(); const w = win(); st.start = w.start;
  if (!keepT || st.t < w.start || st.t >= w.end) st.t = w.start;
  renderAll(); setTime(st.t);
}
function drawBands() {
  const f = target(), r = result(f.lat, f.lon), svg = $('#bands'), w = win();
  $('#wlabel').textContent = `${fD(w.start)} → ${fD(w.end)} · ${w.days.toFixed(0)} d${w.truncated ? ' (cut short)' : ''}`;
  $('#tnow').textContent = 'Bands: ' + f.name;
  if (!r) { svg.innerHTML = ''; return; }
  svg.setAttribute('viewBox', `0 0 ${r.n} 3`); let html = '';
  const row = (y, arr, c) => { let s0 = -1; for (let i = 0; i <= r.n; i++) { const on = i < r.n && arr(i); if (on && s0 < 0) s0 = i; if (!on && s0 >= 0) { html += `<rect x="${s0}" y="${y}" width="${i - s0}" height="1" fill="${c}"/>`; s0 = -1; } } };
  row(0, i => r.lit[i], 'rgba(255,196,77,.9)'); row(1, i => r.ev[i], 'rgba(89,182,255,.85)'); row(2, i => r.lit[i] && r.ev[i], 'rgba(95,224,176,.95)');
  svg.innerHTML = html;
}

// ---------- the "right now" readout + live chart markers ----------
function updateNow() {
  const f = target(), r = result(f.lat, f.lon); if (!r) return;
  const s = P.skyAt(f.lat, f.lon, st.t, r.loc);
  const el = $('#nowline'); if (el) el.innerHTML = `${fT(st.t)}: <b style="color:${s.lit ? 'var(--sun)' : 'var(--mut)'}">${s.lit ? 'Sun up' : 'Sun hidden'}</b> (${(s.sunEl - s.sunHz).toFixed(1)}° vs ${r.loc?.source === 'flat' ? 'flat horizon' : 'skyline'}) · <b style="color:${s.ev ? 'var(--earth)' : 'var(--mut)'}">${s.ev ? 'Earth in view' : 'Earth hidden'}</b>`;
  const sky = $('svg.sky'); if (sky) { const g = sky._geo; if (g) { const pS = g.p(s.sunAz, s.sunEl), pE = g.p(s.earthAz, s.earthEl);
    sky.querySelector('.nowS').setAttribute('transform', `translate(${pS[0]},${pS[1]})`); sky.querySelector('.nowE').setAttribute('transform', `translate(${pE[0]},${pE[1]})`); } }
  for (const tl of $$('svg.tl')) { const g = tl._geo; if (g) { const x = g.x(st.t); const c = tl.querySelector('.cur'); c.setAttribute('x1', x); c.setAttribute('x2', x); } }
  for (const cal of $$('svg.cal')) { const g = cal._geo; if (g) { const x = g.x(st.t); const c = cal.querySelector('.cur'); c.setAttribute('x1', x); c.setAttribute('x2', x); } }
}

// ---------- charts ----------
// Sky chart: 360° skyline (terrain horizon) with the Sun and Earth tracks over the window. x = azimuth centred on north.
function skySVG(r) {
  const W = 360, Hh = 170, L = 30, Rr = 6, T = 10, B = 26, prof = r.loc.mask ? P.horizonProfile(r.loc, 1) : new Array(360).fill(0);
  let top = Math.max(4, ...prof.map(x => x + 1)); for (let i = 0; i < r.n; i++) { top = Math.max(top, Math.min(90, r.sunEl[i] + 1), Math.min(90, r.earthEl[i] + 1)); }
  top = top <= 10 ? Math.ceil(top) : top <= 30 ? Math.ceil(top / 5) * 5 : Math.ceil(top / 10) * 10; const bot = -5;
  const az2x = a => L + ((((a + 180) % 360) + 360) % 360) / 360 * (W - L - Rr), el2y = e => T + (top - Math.max(bot, Math.min(top, e))) / (top - bot) * (Hh - T - B);
  const p = (a, e) => [az2x(a).toFixed(1), el2y(e).toFixed(1)];
  let sky = `<path d="M${az2x(180)},${el2y(bot)} ${prof.map((_, k) => { const a = (k + 180) % 360; return 'L' + p(a, prof[a]).join(','); }).join(' ')} L${W - Rr},${el2y(prof[179])} L${W - Rr},${el2y(bot)}Z" fill="#3a3f4b" stroke="#9aa3b2" stroke-width=".8"/>`;
  const stepK = Math.max(1, Math.round(r.n / 900)); let dots = '';
  for (let i = 0; i < r.n; i += stepK) { const [sx, sy] = p(r.sunAz[i], r.sunEl[i]), [ex, ey] = p(r.earthAz[i], r.earthEl[i]);
    dots += `<circle cx="${sx}" cy="${sy}" r="${r.lit[i] ? 1.3 : .8}" fill="${r.lit[i] ? '#ffc44d' : 'rgba(255,196,77,.28)'}"/><circle cx="${ex}" cy="${ey}" r="${r.ev[i] ? 1.3 : .8}" fill="${r.ev[i] ? '#59b6ff' : 'rgba(89,182,255,.28)'}"/>`; }
  const step = top - bot <= 16 ? 2 : top - bot <= 40 ? 5 : top - bot <= 70 ? 10 : 15; let yt = '';
  for (let e = Math.ceil(bot / step) * step; e <= top; e += step) yt += `<line x1="${L}" x2="${W - Rr}" y1="${el2y(e)}" y2="${el2y(e)}" stroke="rgba(255,255,255,${e === 0 ? .55 : .08})" ${e === 0 ? 'stroke-dasharray="4 3"' : ''}/><text x="${L - 4}" y="${el2y(e) + 3}" text-anchor="end">${e}°</text>`;
  const dirs = [[180, 'S'], [225, 'SW'], [270, 'W'], [315, 'NW'], [0, 'N'], [45, 'NE'], [90, 'E'], [135, 'SE']];
  const southPole = r.lat < -60, xt = dirs.map(([a, l]) => `<line x1="${az2x(a)}" x2="${az2x(a)}" y1="${Hh - B}" y2="${Hh - B + 4}" stroke="rgba(255,255,255,.4)"/><text x="${az2x(a)}" y="${Hh - B + 14}" text-anchor="middle">${l}${a === 180 && southPole ? ' (pole)' : ''}</text>`).join('') + `<line x1="${W - Rr - .5}" x2="${W - Rr - .5}" y1="${Hh - B}" y2="${Hh - B + 4}" stroke="rgba(255,255,255,.4)"/>`;
  const svg = `<svg class="sky" viewBox="0 0 ${W} ${Hh}" role="img" aria-label="Sky chart: terrain skyline with Sun and Earth paths"><text x="${L}" y="7" class="axl">elevation</text>${yt}${sky}${dots}${xt}<text x="${W - Rr}" y="${Hh - 1}" text-anchor="end" class="axl">azimuth (direction you face)</text>
   <g class="nowS"><circle r="6" fill="none" stroke="#fff" stroke-width="1.5"/><circle r="3.5" fill="#ffc44d"/></g><g class="nowE"><circle r="6" fill="none" stroke="#fff" stroke-width="1.5"/><circle r="3.5" fill="#59b6ff"/></g></svg>`;
  return { svg, geo: { p: (a, e) => [az2x(a), el2y(e)] } };
}
// Timeline: Sun elevation vs the skyline at the Sun's direction, plus Sun / Earth / both bands. x = date.
function tlSVG(r, id) {
  const W = 360, L = 30, Rr = 6, T = 8, CH = 70, BY = T + CH + 8, BH = 9, Hh = BY + 3 * (BH + 3) + 16, n = r.n, t0 = r.T[0], t1 = r.T[n - 1] + r.stepH * HOUR;
  const x = t => L + (t - t0) / (t1 - t0) * (W - L - Rr);
  let mn = 0, mx = 0; for (let i = 0; i < n; i++) { mn = Math.min(mn, r.sunEl[i], r.sunHz[i]); mx = Math.max(mx, r.sunEl[i], r.sunHz[i]); }
  mn = Math.max(-90, Math.floor(mn - .5)); mx = Math.min(90, Math.ceil(mx + .5)); const y = e => T + (mx - e) / (mx - mn) * CH;
  const kstep = Math.max(1, Math.round(n / 600)); let ps = '', ph = '';
  for (let i = 0; i < n; i += kstep) { const xi = x(r.T[i]).toFixed(1); ps += (i ? 'L' : 'M') + xi + ',' + y(r.sunEl[i]).toFixed(1); ph += (i ? 'L' : 'M') + xi + ',' + y(r.sunHz[i]).toFixed(1); }
  let bands = ''; const row = (yy, f, c) => { let s0 = -1; for (let i = 0; i <= n; i++) { const on = i < n && f(i); if (on && s0 < 0) s0 = i; if (!on && s0 >= 0) { bands += `<rect x="${x(r.T[s0]).toFixed(1)}" y="${yy}" width="${Math.max(.6, x(r.T[i - 1] + r.stepH * HOUR) - x(r.T[s0])).toFixed(1)}" height="${BH}" fill="${c}"/>`; s0 = -1; } } };
  row(BY, i => r.lit[i], '#ffc44d'); row(BY + BH + 3, i => r.ev[i], '#59b6ff'); row(BY + 2 * (BH + 3), i => r.lit[i] && r.ev[i], '#5fe0b0');
  const es = mx - mn <= 8 ? 2 : mx - mn <= 20 ? 5 : mx - mn <= 60 ? 15 : 30; let yt = '';
  for (let e = Math.ceil(mn / es) * es; e <= mx; e += es) yt += `<line x1="${L}" x2="${W - Rr}" y1="${y(e)}" y2="${y(e)}" stroke="rgba(255,255,255,${e === 0 ? .5 : .08})" ${e === 0 ? 'stroke-dasharray="4 3"' : ''}/><text x="${L - 4}" y="${y(e) + 3}" text-anchor="end">${e}°</text>`;
  const days = (t1 - t0) / DAY, tick = days <= 31 ? 7 : days <= 95 ? 14 : days <= 190 ? 30 : 61; let xt = '';
  for (let t = t0; t <= t1 + 1; t += tick * DAY) xt += `<line x1="${x(t)}" x2="${x(t)}" y1="${T}" y2="${Hh - 12}" stroke="rgba(255,255,255,.07)"/><text x="${x(t)}" y="${Hh - 2}" text-anchor="middle">${fDs(t)}</text>`;
  const lab = ['Sun', 'Earth', 'Both'].map((l, k) => `<text x="${L - 4}" y="${BY + k * (BH + 3) + 8}" text-anchor="end" fill="${['#ffc44d', '#59b6ff', '#5fe0b0'][k]}">${l}</text>`).join('');
  const svg = `<svg class="tl" data-tl="${id}" viewBox="0 0 ${W} ${Hh}" role="img" aria-label="Timeline of Sun elevation and visibility; tap to set the time">${xt}${yt}<rect x="${L}" y="${BY - 1}" width="${W - L - Rr}" height="${3 * (BH + 3) - 1}" fill="rgba(255,255,255,.04)"/>${bands}${lab}
   <path d="${ph}" fill="none" stroke="#9aa3b2" stroke-width="1" stroke-dasharray="2 2"/><path d="${ps}" fill="none" stroke="#ffc44d" stroke-width="1.4"/><line class="cur" x1="0" x2="0" y1="${T}" y2="${Hh - 12}" stroke="#fff" stroke-width="1.5"/></svg>`;
  return { svg, geo: { x: t => x(t).toFixed(1), t0, t1, L, R: W - Rr, W } };
}
function mountGeo(sel, geo) { const el = $(sel); if (el) el._geo = geo; }
function chartTap(e) { const s = e.target.closest('svg.tl, svg.cal'); if (!s?._geo) return false; const b = s.getBoundingClientRect(), g = s._geo, vx = (e.clientX - b.left) / b.width * g.W; if (vx < g.L) return false;
  const t = g.t0 + (vx - g.L) / (g.R - g.L) * (g.t1 - g.t0); setPlaying(false); setTime(t); return s; }

// ---------- panes ----------
function renderAll() { renderPane(); drawBands(); updateNow(); syncLabels(); }
function renderPane() { ({ site: paneSite, compare: paneCompare, missions: paneMissions, method: paneMethod })[st.tab]?.(); updateNow(); }
function qualityLine(r, so) {
  const L = r.loc;
  if (L.source === 'pin') return `Terrain horizon: exact 360-direction skyline for this named point (LOLA 240 m terrain, observer 2 m up). ${badge('data/pins.json', 'calc')}`;
  if (L.source === 'cell') return `Terrain horizon: nearest ${(L.cellM / 1000).toFixed(L.cellM < 1000 ? 2 : 1)} km grid cell (centre ${L.distKm < 0.05 ? 'under this point' : (L.distKm * 1000).toFixed(0) + ' m away'}), 64 directions. Ridge values can change a lot within one cell. ${badge('data/plan_grid.json', 'calc')}`;
  return `<b>No terrain data here — flat-horizon estimate.</b> Real hills would block some Sun and Earth time, so these numbers are upper bounds. ${badge('data/validation_v3.json', 'flat')}`;
}
function caveatsOf(so, r) {
  const c = []; if (so?.obj?.caveat) c.push(so.obj.caveat);
  if (r.loc.offDemPct > 1 && !so?.obj?.caveat) c.push(`${r.loc.offDemPct.toFixed(0)}% of horizon rays leave the terrain map here, so the far horizon in those directions is unknown.`);
  if (so && so.lat <= -83.9 && sceneOk && scene.inPatch && !scene.inPatch(so.lat, so.lon) && !so?.obj?.caveat) c.push('Outside the 3D terrain patch, so the map shows the globe for it.');
  return c;
}
function sentence(r, so) {
  const w = r.win, when = `From ${fD(w.start)}, over ${w.days.toFixed(0)} days`;
  if (r.neverLit) return `${when}, the Sun never clears the skyline here. A solar-powered lander would be dark the whole time.`;
  const flat = r.loc?.source === 'flat';
  const both = flat ? 'an upper bound because no terrain data is loaded here' : r.pctBoth >= 45 ? 'a strong spot' : r.pctBoth >= 25 ? 'a fair spot' : 'a weak spot';
  return `${when}, the Sun is up${flat ? ' above a flat horizon' : ''} here <b class="c-sun">${pc(r.pctLit)}</b> of the time and Earth is in view <b class="c-earth">${pc(r.pctEarth)}</b>. Both together (power <i>and</i> a radio link): <b class="c-both">${pc(r.pctBoth)}</b>, ${both}. The longest dark spell lasts ${r.longestDarkLB ? 'at least ' : ''}${dur(r.longestDarkH)}${r.longestDarkLB ? ' (it runs past the window edge)' : ''}.`;
}
function heroHTML() {
  return `<div class="hero"><div class="disc">Practice build · not mission data</div><h2>Lunar Landing Site Navigator</h2>
  <p>The challenge: find a landing spot near the Moon's south pole where a solar-powered lander gets the most sunlight <i>and</i> can still see Earth to radio home. The Sun stays low here, so hills cast shadows tens of kilometres long.</p>
  <button id="pickBtn" class="cta">${SVGI.pick} Pick a site</button>
  <p class="mut" style="margin:10px 0 6px">Tap anywhere on the terrain, or start from a NASA Artemis III candidate region:</p>
  <div class="chips">${REGIONS.map(r => `<button class="chipb" data-region="${r.id}">${markSVG('region')}${esc(r.name)}</button>`).join('')}</div></div>`;
}
function windowCtl(w) {
  const lo = iso(RANGE.start), hi = iso(RANGE.end - DAY);
  return `<div class="wctl"><label>Start <input type="date" id="wstart" value="${iso(w.start)}" min="${lo}" max="${hi}"></label><label>Length <select id="wdays">${DAYS.map(d => `<option value="${d}" ${d === st.days ? 'selected' : ''}>${d} days</option>`).join('')}</select></label></div>
  ${w.notes.length ? `<div class="warn" role="status">${w.notes.map(esc).join('<br>')}</div>` : ''}`;
}
function resultCard(so, r) {
  const share = r.share, b = r.breakdown, cav = caveatsOf(so, r), flat = r.loc.source === 'flat';
  return `<div class="card">
   <div class="cardhd"><div><h2>${esc(so.name)}</h2><div class="mut mono">${so.lat.toFixed(3)}°, ${so.lon.toFixed(3)}°${so.kind === 'region' ? ' · Artemis III region' : so.kind === 'site' ? ' · ' + esc(so.obj.provider) : ''}</div></div>${so.kind === 'site' ? `<span class="chip">${markSVG(statusOf(so.obj))}${statusOf(so.obj)}</span>` : ''}</div>
   <p class="lead">${sentence(r, so)}</p>
   <div class="tiles"><div class="tile sun"><div class="k">Sunlit</div><div class="v mono">${pc(r.pctLit)}</div><div class="s mono">${Math.round(r.sunH)} of ${Math.round(r.hours)} h</div>${!flat ? `<div class="s">flat-horizon: ${pc(r.flatPctLit)}</div>` : ''}</div>
    <div class="tile earth"><div class="k">Earth in view</div><div class="v mono">${pc(r.pctEarth)}</div><div class="s mono">${Math.round(r.earthH)} of ${Math.round(r.hours)} h</div>${!flat ? `<div class="s">flat-horizon: ${pc(r.flatPctEarth)}</div>` : ''}</div>
    <div class="tile both"><div class="k">Both</div><div class="v mono">${pc(r.pctBoth)}</div><div class="s mono">${Math.round(r.bothH)} h</div></div></div>
   <div class="qline">${qualityLine(r, so)}</div>
   ${cav.map(c => `<div class="warn">${esc(c)}</div>`).join('')}
   ${windowCtl(r.win)}
   <div id="nowline" class="nowline mono"></div>
  </div>`;
}
function paneSite() {
  const el = $('section[data-pane=site]'), so = selObj();
  if (!so) { el.innerHTML = heroHTML() + glossaryHTML(true); return; }
  const r = result(so.lat, so.lon);
  if (!r) { el.innerHTML = `<div class="card"><h2>${esc(so.name)}</h2><p class="mut">Loading the terrain horizon for this spot…</p></div>`; return; }
  const sk = skySVG(r), tl = tlSVG(r, 'site'), w = st.w, m = so.kind === 'site' ? so.obj : null;
  el.innerHTML = `${resultCard(so, r)}
  <h3>Sky from this spot</h3><div class="chart">${sk.svg}</div>
  <p class="cap">Grey is the skyline: the hills you would see turning in a full circle. Dots are where the <span class="c-sun">Sun</span> and <span class="c-earth">Earth</span> sit over the ${r.win.days.toFixed(0)} days; bright dots are above the skyline (visible), faint dots are hidden behind terrain or below the horizon. Ringed dots = the time on the bar.</p>
  <h3>Over time</h3><div class="chart">${tl.svg}</div>
  <p class="cap">Amber line: Sun height. Dashed grey: skyline height in the Sun's direction. The Sun is up when the amber line is above the grey one. Tap the chart to jump in time.</p>
  <h3>Best landing windows <span class="mut" style="text-transform:none;letter-spacing:0">(Sun + Earth, and ≥ ${P.MIN_SUN_AHEAD_H} h of sunlight ahead)</span></h3>
  <ul class="wins">${r.windows.map(x => `<li><button data-win="${x.start}"><span class="mono">${fDs(x.start)} ${new Date(x.start).toISOString().slice(11, 16)} → ${fD(x.end)}</span><span class="mono" style="color:var(--both)">${Math.round(x.hours)} h${x.best ? ' · best' : ''}</span></button></li>`).join('') || '<li class="mut">No time in this window has Sun and Earth together with 2 days of sunlight ahead.</li>'}</ul>
  ${r.windowCount > r.windows.length ? `<p class="mut small">Showing the ${r.windows.length} longest-lasting of ${r.windowCount} windows, in date order.</p>` : ''}
  <h3>Landing index</h3>
  <div style="display:flex;align-items:baseline;gap:8px"><span class="big mono">${Math.round(r.score * 100)}</span><span class="mut">/ 100 · a weighted mix, not a probability</span></div>
  <div class="bar"><i class="b-sun" style="width:${b(r, 'sun')}%"></i><i class="b-comms" style="width:${b(r, 'comms')}%"></i><i class="b-slope" style="width:${b(r, 'slope')}%"></i></div>
  ${['sun', 'comms', 'slope'].map(k => `<label class="sl ${k}"><span>${{ sun: 'Sunlight', comms: 'Earth link', slope: 'Flat ground' }[k]}</span><input type="range" min="0" max="100" value="${w[k]}" data-w="${k}" aria-label="${k} weight"><span class="mono">${Math.round(r.share[k] * 100)}%</span></label>`).join('')}
  <p class="mut small">Percent = each factor's share of the index after normalising. Slope ${r.slope == null ? 'is unknown here, so it is left out' : `here is ${r.slope.toFixed(1)}°, averaged over a ~2.9 km cell, so it is not the slope a lander would sit on (0° scores full, 15°+ scores zero)`}.</p>
  ${m ? `<h3>Mission</h3><dl class="kv"><dt>Lander</dt><dd>${esc(m.lander)} · ${esc(m.provider)}${m.clps === false ? ' · <b>not CLPS</b>' : ' · CLPS'}</dd><dt>Date</dt><dd class="mono">${esc(m.date)} ${badge(m.source_url || m.source, 'src')}</dd><dt>Payloads</dt><dd>${(m.payloads || []).length}</dd></dl>${m.note ? `<p class="mut small">${esc(m.note)}</p>` : ''}` : so.obj?.note ? `<p class="mut small">${esc(so.obj.note)} ${badge(so.obj.source_url || so.obj.source, 'src')}</p>` : ''}
  <div class="btnrow"><button data-cmp-add="1">Add to compare</button><button data-clear="1">Pick another site</button></div>
  ${glossaryHTML()}`;
  mountGeo('svg.sky', sk.geo); mountGeo('svg.tl', tl.geo);
  function b(r, k) { return (r.breakdown[k] * 100).toFixed(1); }
}
function glossaryHTML(open) {
  return `<details class="gloss"${open ? ' open' : ''}><summary>Glossary: what the numbers mean</summary><dl class="kv">
  <dt>Sunlit</dt><dd>Share of time the centre of the Sun is above the local skyline.</dd>
  <dt>Earth in view</dt><dd>Share of time the centre of Earth is above the skyline, so a direct radio link is possible.</dd>
  <dt>Both</dt><dd>Sun and Earth up at the same time: power plus a link home.</dd>
  <dt>Skyline</dt><dd>The terrain horizon: how high the hills rise in each direction, from LOLA laser-altimeter heights.</dd>
  <dt>Flat-horizon</dt><dd>The same calculation pretending the ground is a flat plain. On low ground it usually overstates sunlight; on a high peak the real horizon can dip below 0°, so terrain-masked sunlight can beat it.</dd>
  <dt>Window</dt><dd>The date range every number refers to (the time bar spans it).</dd>
  <dt>Longest dark spell</dt><dd>The longest stretch without the Sun. "At least" means it runs into the window edge.</dd>
  <dt>Landing index</dt><dd>A 0–100 mix of the factors above with your weights. Not a probability of success.</dd></dl></details>`;
}
// Compare: calendar of all candidates over the window + A/B table
function paneCompare() {
  const el = $('section[data-pane=compare]'), w = win(), so = selObj();
  const rows = REGIONS.map(r => ({ key: 'region:' + r.id, unc: !!r.uncertain, name: (r.uncertain ? '~' : '') + r.name, lat: r.lat, lon: r.lon, sel: { kind: 'region', id: r.id } }));
  const extra = [...(so && so.kind !== 'region' ? [so] : []), ...st.cmp.map(id => SITES.find(s => s.id === id)).filter(s => s && s.lat != null).map(s => ({ kind: 'site', id: s.id, name: s.mission, lat: s.lat, lon: s.lon }))];
  for (const e of extra) if (!rows.some(r => r.lat === e.lat && r.lon === e.lon)) rows.unshift({ key: (e.kind || 'point') + ':' + (e.id || ''), name: e.name, lat: e.lat, lon: e.lon, sel: e.kind === 'point' ? { kind: 'point', lat: e.lat, lon: e.lon } : { kind: e.kind, id: e.id } });
  const res = rows.map(r => ({ ...r, r: result(r.lat, r.lon) })).filter(x => x.r);
  const per = Math.max(w.days > 120 ? 7 : w.days > 60 ? 2 : 1, innerWidth < 500 ? Math.ceil(w.days / 24) : 1), nd = Math.ceil(w.days / per), W = 360, L = 118, Rr = 4, rh = 22, Hh = res.length * rh + 22;
  const cx = d => L + d / nd * (W - L - Rr), cw = (W - L - Rr) / nd;
  let cells = '';
  res.forEach((x, ri) => { const c = x.r.cal; for (let d = 0; d < nd; d++) { let a = 0, b = 0, k = 0, m = 0; for (let q = d * per; q < Math.min(c.length, (d + 1) * per); q++) { a += c[q].lit; b += c[q].ev; k += c[q].both; m++; } if (!m) continue; a /= m; b /= m; k /= m;
      const col = k >= .5 ? `rgba(95,224,176,${.35 + .65 * k})` : a >= .5 ? `rgba(255,196,77,${.3 + .6 * a})` : b >= .5 ? `rgba(89,182,255,${.3 + .5 * b})` : '#151821';
      cells += `<rect x="${cx(d).toFixed(2)}" y="${ri * rh + 2}" width="${Math.max(.5, cw - (cw > 3 ? .6 : 0)).toFixed(2)}" height="${rh - 4}" fill="${col}"/>`; }
    const isSel = so && Math.abs(x.lat - so.lat) < 1e-6 && Math.abs(x.lon - so.lon) < 1e-6;
    cells += `<text x="${L - 6}" y="${ri * rh + rh / 2 + 4}" text-anchor="end" class="${isSel ? 'selrow' : ''}">${esc(x.name.length > 19 ? x.name.slice(0, 18) + '…' : x.name)}</text><text x="${L - 6}" y="${ri * rh + rh / 2 + 4}" text-anchor="end" fill="transparent">${''}</text>`; });
  const tick = w.days <= 31 ? 7 : w.days <= 95 ? 14 : w.days <= 190 ? 30 : 61; let xt = '';
  for (let t = w.start; t <= w.end + 1; t += tick * DAY) { const xx = L + (t - w.start) / (w.end - w.start) * (W - L - Rr); xt += `<line x1="${xx}" x2="${xx}" y1="0" y2="${Hh - 16}" stroke="rgba(255,255,255,.12)"/><text x="${xx}" y="${Hh - 4}" text-anchor="middle">${fDs(t)}</text>`; }
  const A = res[0], opts = SITES.filter(s => s.lat != null && s.lat < -60);
  el.innerHTML = `<h2>Compare candidates</h2><p class="mut">Each row is a site, each column ${per === 1 ? 'a day' : per + ' days'} of the window (${fD(w.start)} → ${fD(w.end)}). Tap a cell to select that site and jump to that day.</p>
  <div class="calkey"><span><i style="background:#5fe0b0"></i>Sun + Earth</span><span><i style="background:#ffc44d"></i>Sun only</span><span><i style="background:#59b6ff"></i>Earth only</span><span><i style="background:#151821;border:1px solid #333"></i>neither</span></div>
  <div class="chart"><svg class="cal" viewBox="0 0 ${W} ${Hh}" role="img" aria-label="Site by date calendar">${xt}${cells}<line class="cur" x1="0" x2="0" y1="0" y2="${Hh - 16}" stroke="#fff" stroke-width="1.5"/></svg></div>
  <h3>Totals over the window</h3>
  <table class="ct"><tr><th>Site</th><th>Sun</th><th>Earth</th><th>Both</th><th>Dark</th></tr>
  ${[...res].sort((a, b) => b.r.pctBoth - a.r.pctBoth).map(x => `<tr><td><button class="linkb" data-sel="${esc(JSON.stringify(x.sel))}">${esc(x.name)}</button>${x.r.loc.source === 'flat' ? ' ' + badge('', 'flat') : ''}</td><td class="mono">${pc(x.r.pctLit)}</td><td class="mono">${pc(x.r.pctEarth)}</td><td class="mono" style="color:var(--both)">${pc(x.r.pctBoth)}</td><td class="mono">${x.r.longestDarkLB ? '≥' : ''}${dur(x.r.longestDarkH)}</td></tr>`).join('')}</table>
  <p class="mut small">Dark = longest dark spell. Sorted by Sun + Earth. ${res.some(x => x.unc) ? '<b>~</b> = coordinates not officially published (a guessed point inside the region), so treat that row as one sample, not the region. ' : ''} Add a mission site: <select id="cmpAdd" aria-label="Add a mission to compare"><option value="">choose…</option>${opts.map(s => `<option value="${s.id}">${esc(s.mission)}</option>`).join('')}</select>${st.cmp.length ? ' <button class="linkb" data-cmpclear="1">clear</button>' : ''}</p>
  ${windowCtl(w)}`;
  const svg = $('svg.cal'); svg._geo = { x: t => (L + (t - w.start) / (w.end - w.start) * (W - L - Rr)).toFixed(1), t0: w.start, t1: w.end, L, R: W - Rr, W, rows: res.map(x => x.sel), rh, Hh };
}
function paneMissions() {
  const el = $('section[data-pane=missions]'), counts = {}, clps = SITES.filter(s => s.clps !== false).length, non = SITES.length - clps;
  SITES.forEach(s => counts[statusOf(s)] = (counts[statusOf(s)] || 0) + 1);
  const F = ['all', 'landed', 'partial', 'failed', 'planned', 'cancelled'].filter(k => k === 'all' || counts[k]);
  const list = [...SITES].filter(s => st.filter === 'all' || statusOf(s) === st.filter).sort((a, b) => String(a.date).localeCompare(String(b.date)));
  el.innerHTML = `<h2>Missions for context</h2><p class="mut">${clps} NASA CLPS missions + ${non} non-CLPS landers (ispace). NASA began awarding CLPS contracts to companies in Nov 2018; the first CLPS landings came in 2024. Tap one to fly there and see its sunlight numbers.</p>
  <div class="filters">${F.map(k => `<button data-f="${k}" class="${st.filter === k ? 'on' : ''}">${k === 'all' ? 'All ' + SITES.length : `${markSVG(k)}${k[0].toUpperCase() + k.slice(1)} ${counts[k]}`}</button>`).join('')}</div>
  <ul class="mlist">${list.map(s => `<li><button data-site="${s.id}">${markSVG(statusOf(s))}<span class="nm"><b>${esc(s.mission)}</b><small>${esc(s.provider)}${s.clps === false ? ' · non-CLPS' : ''} · ${s.lat != null ? (s.lat <= -80 ? 'South pole' : s.lat.toFixed(1) + '°') : '—'}</small></span><span class="dt mono">${esc(s.date)}</span></button></li>`).join('')}</ul>
  <h3>Artemis III candidate regions ${badge(REGIONS[0]?.source_url, 'src')}</h3>
  <ul class="mlist">${REGIONS.map(r => `<li><button data-region="${r.id}">${markSVG('region')}<span class="nm"><b>${esc(r.name)}</b><small class="mono">${r.lat.toFixed(2)}°, ${r.lon.toFixed(2)}°</small></span></button></li>`).join('')}</ul>`;
}
function paneMethod() {
  const el = $('section[data-pane=method]'), v = VAL;
  el.innerHTML = `<h2>How the numbers are made</h2>
  <p class="mut">For every 3-hour step we take the Sun and Earth directions (JPL DE421 ephemeris) and compare their height with the terrain skyline in that direction, computed from NASA's LOLA laser-altimeter map (240 m pixels, observer 2 m above ground). Earth's direction includes parallax. Named points use 360 directions; any other spot south of 84°S uses the nearest grid cell (2.9 km, 0.96 km near the pole, 64 directions). North of 84°S without a named point we fall back to a flat horizon and say so.</p>
  <h3>Check against published studies ${badge(v?.source_url, 'src')}</h3>
  <p class="mut small">20-year average sunlight at the 4 points published studies report. Our run: ${esc(v?.window || '')}. Sun treated as a disc.</p>
  <table class="ct"><tr><th>Point</th><th>Published</th><th>Ours</th><th>Diff</th><th>v2</th></tr>
  ${(v?.results || []).map(x => `<tr><td>${esc(x.name)}<br><small class="mut">${esc(x.source)}</small></td><td class="mono">${x.published_pct_lit}%</td><td class="mono">${x.compare_pct}%</td><td class="mono" style="color:${Math.abs(x.diff_pts) > 10 ? 'var(--warn)' : 'var(--tx)'}">${x.diff_pts > 0 ? '+' : ''}${x.diff_pts}</td><td class="mono" style="color:${Math.abs(v.v2_results[x.id] - x.published_pct_lit) > 15 ? 'var(--bad)' : 'var(--mut)'}">${v.v2_results[x.id]}%</td></tr>`).join('')}</table>
  <div class="warn"><b>v2 failed one case:</b> ${esc(v?.v2_results?.failing)}. Cause: ${esc(v?.v2_results?.cause)}. v2 also compared 2 m-mast numbers with surface-level studies; v3 compares like with like. Connecting Ridge C1 still shows a 12-point gap.</div>
  <h3>Known gaps</h3><ul class="gaps">${(v?.gaps || []).map(g => `<li>${esc(g)}</li>`).join('')}</ul>
  <h3>What this is not</h3><p class="mut small">A practice project. Not NASA mission planning, not a landing-success probability, and it does not model ice, rocks, the lander's own shadow or antenna height.</p>
  ${glossaryHTML()}
  <h3>Sources</h3><ul class="gaps"><li>LOLA LDEM_75S_240M <a href="https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr/polar/img/" target="_blank" rel="noopener">PDS</a></li><li>JPL DE421 ephemeris via skyfield <a href="https://naif.jpl.nasa.gov/pub/naif/generic_kernels/spk/planets/" target="_blank" rel="noopener">NAIF</a></li><li>Validation: Gläser et al. 2018, Mazarico et al. 2011 <a href="${esc(v?.source_url)}" target="_blank" rel="noopener">NTRS</a></li><li>Artemis III regions <a href="${esc(REGIONS[0]?.source_url)}" target="_blank" rel="noopener">Wueller et al. 2026</a></li><li>Crater names: <a href="https://planetarynames.wr.usgs.gov/" target="_blank" rel="noopener">IAU Gazetteer</a></li></ul>`;
}

// ---------- selecting things ----------
function select(sel, opts = {}) {
  st.sel = sel; const so = selObj(); if (!so) return;
  const onPatch = sceneOk && so.lat <= -83.9 && scene.inPatch(so.lat, so.lon);
  const wantView = onPatch ? 'pole' : so.lat != null && so.lat <= -83.9 && !sceneOk ? st.view : 'globe';
  if (wantView !== st.view) setView(wantView);
  if (sceneOk) { if (so.kind === 'site') { scene.setPickMarker(null); scene.focusSite(so.id); } else scene.focusLL(so.lat, so.lon, null); }
  if (!opts.keepTab) setTab('site'); else renderPane(); drawBands(); updateNow(); syncLabels();
  if (isPhone() && !opts.keepSnap) setSnap('half'); if (!opts.keepScroll) $('#pbody').scrollTop = 0; writeHash();
}
function clearSel() { st.sel = null; scene?.setPickMarker(null); scene?.overview(); if (st.view !== 'pole') setView('pole'); renderAll(); writeHash(); }
function syncLabels() {
  if (!sceneOk) return; const so = selObj();
  scene.setLabels([...REGIONS.map(r => ({ text: r.name, lat: r.lat, lon: r.lon, kind: 'region' })), ...FEATS.map(f => ({ text: f.name, lat: f.lat, lon: f.lon, kind: 'crater' })), ...SITES.filter(s => s.lat != null).map(s => ({ text: s.mission.replace(/ (Mission|Odysseus|Athena)/, ''), lat: s.lat, lon: s.lon, kind: 'mission' })), ...(so?.kind === 'point' ? [{ text: 'Your pick', lat: so.lat, lon: so.lon, kind: 'region' }] : [])]);
}
function toast(m) { const t = $('#toast'); t.textContent = m; t.hidden = false; clearTimeout(t._h); t._h = setTimeout(() => t.hidden = true, 2600); }

// ---------- guided tour (~64 s), captions use live numbers ----------
const TOUR = [
  { at: 0, run: () => { clearSel(); setTab('site'); }, cap: () => 'The challenge: land a solar-powered craft near the Moon\'s south pole where it gets sunlight and can still see Earth. The Sun skims the horizon here, so hills cast very long shadows.' },
  { at: 8, run: () => { setSpeed(1); setPlaying(true); }, cap: () => 'Four days pass every second. Watch the shadows sweep around as the Sun circles the sky; some crater floors never see it at all.' },
  { at: 20, run: () => { setPlaying(false); select({ kind: 'region', id: 'malapert-massif' }, { keepSnap: false }); }, cap: () => { const r = REGIONS.find(x => x.id === 'malapert-massif'), q = result(r.lat, r.lon); return q ? `Malapert Massif, an Artemis III candidate: over these ${q.win.days.toFixed(0)} days the Sun is up ${pc(q.pctLit)} of the time and Earth is in view ${pc(q.pctEarth)}; both at once ${pc(q.pctBoth)}.` : 'Malapert Massif, an Artemis III candidate.'; } },
  { at: 30, run: () => { const c = $('svg.sky'); if (c) $('#pbody').scrollTo({ top: c.closest('.chart').offsetTop - 60, behavior: 'smooth' }); }, cap: () => 'The sky chart is the key view: grey is the skyline in every direction. Sun and Earth are only usable while their dots are above it.' },
  { at: 40, run: () => setTab('compare'), cap: () => 'The calendar lines up all nine Artemis III regions day by day. Green means Sun and Earth together. Tap any cell to jump there.' },
  { at: 50, run: () => select({ kind: 'site', id: 'im-2' }), cap: () => { const s = SITES.find(x => x.id === 'im-2'), q = result(s.lat, s.lon); return `Missions are context. IM-2 landed near Mons Mouton in March 2025 and tipped over. At its spot, over this window: Sun ${q ? pc(q.pctLit) : '—'}, Earth ${q ? pc(q.pctEarth) : '—'}.`; } },
  { at: 57, run: () => setTab('method'), cap: () => 'Every number is our own calculation, checked against 4 published points (within 1–12 points, gaps listed). Practice project, not mission data.' },
];
const TOUR_LEN = 64;
let tourT = null, tourStart = 0, tourIdx = 0, touring = false, saved = null;
function startTour() {
  if (touring) stopTour(); saved = { view: st.view, sel: st.sel, tab: st.tab, t: st.t, speedIdx, playing, start: st.start, days: st.days, snap: $('#panel').dataset.snap, scroll: $('#pbody').scrollTop };
  touring = true; document.body.classList.add('touring'); $('#caption').hidden = false; tourStart = performance.now(); tourIdx = 0; setPlaying(false);
  if (st.start !== RANGE.start || st.days !== 60) setWindow(RANGE.start, 60);
  if (isPhone()) setSnap('half');
  tourT = setInterval(() => {
    const el = (performance.now() - tourStart) / 1000; $('#caption .capbar i').style.width = Math.min(100, el / TOUR_LEN * 100) + '%';
    while (tourIdx < TOUR.length && TOUR[tourIdx].at <= el) { const s = TOUR[tourIdx++]; try { s.run(); } catch (e) { console.warn(e); } if (isPhone()) setSnap('half'); const c = s.cap; setTimeout(() => $('#captext').textContent = c(), 30); }
    if (el >= TOUR_LEN) stopTour();
  }, 100);
}
function stopTour() {
  if (tourT) clearInterval(tourT); tourT = null; if (!touring) return; touring = false; document.body.classList.remove('touring'); $('#caption').hidden = true; setPlaying(false);
  const s = saved; saved = null; if (!s) return;
  if (s.start !== st.start || s.days !== st.days) setWindow(s.start, s.days);
  st.sel = s.sel; if (s.sel) select(s.sel, { keepTab: true, keepSnap: true }); else { scene?.setPickMarker(null); scene?.overview(); }
  if (s.view !== st.view) setView(s.view); setTab(s.tab, true); setSpeed(s.speedIdx); setTime(s.t); setPlaying(s.playing); setSnap(s.snap); $('#pbody').scrollTop = s.scroll; writeHash();
}

// ---------- events ----------
function wire() {
  $$('.seg button').forEach(b => b.onclick = () => setView(b.dataset.view));
  $$('.tabs button').forEach(b => b.onclick = () => { setTab(b.dataset.tab); if (isPhone() && $('#panel').dataset.snap === 'peek') setSnap('half'); });
  $('#play').onclick = () => setPlaying(!playing);
  $('#speed').onclick = () => setSpeed((speedIdx + 1) % SPEEDS.length);
  $('#time').oninput = e => { setPlaying(false); const w = win(); setTime(w.start + e.target.value / 1000 * (w.end - w.start), 'slider'); };
  $('#tourBtn').onclick = () => touring ? stopTour() : startTour(); $('#tourStop').onclick = () => stopTour();
  $('#keyBtn').onclick = () => { const k = $('#maplegend'); k.hidden = !k.hidden; $('#keyBtn').setAttribute('aria-expanded', !k.hidden); };
  $('#shareBtn').onclick = async () => { writeHash(); await new Promise(r => setTimeout(r, 200)); try { await navigator.clipboard.writeText(location.href); toast('Link copied'); } catch (e) { toast('Copy this page\'s address to share'); } };
  $('#pbody').addEventListener('click', e => {
    const svgHit = chartTap(e); if (svgHit) { if (svgHit.classList.contains('cal')) { const g = svgHit._geo, b = svgHit.getBoundingClientRect(), vy = (e.clientY - b.top) / b.height * g.Hh, ri = Math.floor((vy - 2) / g.rh); if (g.rows[ri]) { const t = st.t; select(g.rows[ri], { keepTab: true, keepSnap: true, keepScroll: true }); setTime(t); } } return; }
    const t = e.target.closest('button'); if (!t) return;
    if (t.dataset.f) { st.filter = t.dataset.f; paneMissions(); }
    else if (t.dataset.site) select({ kind: 'site', id: t.dataset.site });
    else if (t.dataset.region) select({ kind: 'region', id: t.dataset.region });
    else if (t.dataset.sel) select(JSON.parse(t.dataset.sel), { keepTab: true, keepScroll: true });
    else if (t.dataset.win) { setPlaying(false); setTime(+t.dataset.win); }
    else if (t.dataset.clear) clearSel();
    else if (t.dataset.cmpclear) { st.cmp = []; paneCompare(); writeHash(); }
    else if (t.dataset.cmpAdd) { const so = selObj(); if (so?.kind === 'site' && !st.cmp.includes(so.id)) st.cmp = [so.id, ...st.cmp].slice(0, 3); setTab('compare'); }
    else if (t.id === 'pickBtn') { setView('pole'); if (isPhone()) setSnap('peek'); toast('Tap a spot on the terrain, or a region ring'); }
  });
  $('#pbody').addEventListener('change', e => {
    const t = e.target;
    if (t.id === 'wstart' && t.value) { const ms = Date.parse(t.value + 'T00:00:00Z'); if (!isNaN(ms)) setWindow(ms, st.days); }
    if (t.id === 'wdays') setWindow(st.start, +t.value, true);
    if (t.id === 'cmpAdd' && t.value) { if (!st.cmp.includes(t.value)) st.cmp = [t.value, ...st.cmp].slice(0, 3); paneCompare(); writeHash(); }
  });
  let wTimer; $('#pbody').addEventListener('input', e => { const k = e.target.dataset.w; if (!k) return; st.w[k] = +e.target.value; clearTimeout(wTimer); wTimer = setTimeout(() => { const y = $('#pbody').scrollTop; resCache.clear(); paneSite(); $('#pbody').scrollTop = y; writeHash(); }, 60); });
  addEventListener('resize', () => { setSnap($('#panel').dataset.snap); requestAnimationFrame(syncInsets); });
  addEventListener('keydown', e => { if (e.target.matches('input,select,textarea')) return; if (e.key === ' ') { e.preventDefault(); setPlaying(!playing); } if (e.key === 'ArrowRight') setTime(st.t + DAY / 4); if (e.key === 'ArrowLeft') setTime(st.t - DAY / 4); if (e.key === 'Escape' && touring) stopTour(); });
  $('#layer').addEventListener('change', e => setLayer(e.target.value));
}
function setLayer(l) { st.layer = l; $('#layer').value = l; scene?.setLayer?.(l === 'none' ? null : l); const lg = $('#heatlg'); lg.hidden = l === 'none'; lg.querySelector('i').style.background = l === 'earth' ? 'linear-gradient(90deg,#111,#4a9dff)' : 'linear-gradient(90deg,#111,#f0a83a)'; writeHash(); }

// ---------- boot ----------
(async function boot() {
  const [sites, regions, feats, val] = await Promise.all([getJSON('data/sites.json'), getJSON('data/artemis_regions.json'), getJSON('data/features.json'), getJSON('data/validation_v3.json')]);
  SITES = sites || []; REGIONS = regions || []; FEATS = feats?.features || []; VAL = val;
  RANGE = await P.initPlan(); const ex = P.pinMeta().pins.find(p => p.id === 'shackleton-s'); EX = { lat: ex.lat, lon: ex.lon };
  const wantTour = readHash();
  setTimeout(() => P.ensureGrid().catch(e => console.warn('grid', e)), 400); // background: custom points need it
  try { scene = await import('./scene.js'); await scene.init($('#scene'), { sites: SITES, regions: REGIONS, view: st.view }); sceneOk = true; }
  catch (e) { console.error('3D scene failed', e); $('#scene').innerHTML = '<p class="noscene">3D view unavailable on this device. Numbers and charts still work.</p>'; scene = null; }
  if (sceneOk) {
    scene.on('siteclick', d => select({ kind: 'site', id: d.id }));
    scene.on('regionclick', d => select({ kind: 'region', id: d.id }));
    scene.on('terrainclick', d => { if (touring) return; select({ kind: 'point', lat: d.lat, lon: d.lon }); });
  }
  const ups = [...SITES, ...REGIONS].map(x => x.updated).filter(Boolean).sort(); 
  $('.dataupd').innerHTML = `Data updated <span class="mono">${ups.at(-1) || ''}</span> · ephemeris ${fD(RANGE.start)} – ${fD(RANGE.end)} · <button class="linkb" data-gotab="method">method &amp; validation</button>`;
  $('.dataupd').addEventListener('click', e => { if (e.target.dataset.gotab) setTab(e.target.dataset.gotab); });
  $('#heatlg small').textContent = 'full year from 14 Nov 2026 · cells 2.9 km (1 km near pole), smoothed';
  $('#maplegend').innerHTML = ['landed', 'partial', 'failed', 'planned', 'cancelled'].map(k => `<span>${markSVG(k)}${k}</span>`).join('') + `<span>${markSVG('region')}Artemis III region</span><span>${markSVG('sun')}Sun</span><span>${markSVG('earth')}Earth</span><span>${markSVG('nodata')}no terrain data</span>`;
  $('#play').innerHTML = SVGI.play; $('#shareBtn').insertAdjacentHTML('afterbegin', SVGI.share); $('#tourBtn').insertAdjacentHTML('afterbegin', SVGI.tour);
  if (new URLSearchParams(location.search).has('shots') && sceneOk) window.__shot = () => scene._dbg().snap();
  wire(); sheetDrag();
  const w = P.makeWindow(st.start, st.days); st.start = w.start; winCache = null;
  if (st.t == null) st.t = Date.parse(scene?.DEFAULT_TIME || '') || w.start;
  setSnap(isPhone() ? (st.sel ? 'half' : 'half') : 'half');
  $$('.seg button').forEach(b => b.setAttribute('aria-pressed', b.dataset.view === st.view));
  setLayer(st.layer); setTab(st.tab); if (st.sel) select(st.sel, { keepTab: true, keepSnap: true }); else syncLabels();
  setTime(st.t); drawBands(); requestAnimationFrame(loop);
  window.__app = { st, sceneOk, P }; document.body.dataset.ready = '1';
  if (wantTour) startTour();
  addEventListener('hashchange', () => { if (touring) return; const v0 = st.view; const tour = readHash(); winCache = null;
    const w2 = P.makeWindow(st.start, st.days); st.start = w2.start; if (st.view !== v0) setView(st.view);
    setLayer(st.layer); setTab(st.tab); if (st.sel) select(st.sel, { keepTab: true }); setTime(st.t); drawBands(); if (tour) startTour(); });
})();
