// CLPS South Pole Browser v2 — UI layer. Scene: scene.js (real 3D) or scene-stub.js. Planner: data/plan.js | plan.js | mock-plan.js.
import { setEphem, ephemSource, sample, dirs, elev, DAY } from './astro.js';
const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
const COL = { landed: '#2ecc71', partial: '#f1c40f', failed: '#e74c3c', planned: '#3498db' };
const T0 = Date.parse('2026-11-14T00:00:00Z'), SPAN = 60 * DAY;
const POLAR = -80;
const st = { view: 'globe', site: null, t: T0, w: { sun: 40, comms: 40, slope: 20 }, tab: 'missions', cmp: [null, null], p: null, date: '2026-11-14', filter: 'all', layer: 'none' };
let hashHasT = false;
let scene, planner, mockPlanner, sceneKind = 'stub', plannerKind = 'mock', SITES = [], REGIONS = [], TL = {}, UPDATED = '2026-10-22';
const isPhone = () => innerWidth < 1000;
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmtT = ms => new Date(ms).toISOString().slice(0, 16).replace('T', ' ') + ' UTC';
const fmtD = ms => new Date(ms).toISOString().slice(0, 10);
const pct = v => v == null ? '—' : (+v).toFixed(0) + '%';
const statusOf = s => s.cancelled ? 'cancelled' : s.status;
const colOf = s => s.cancelled ? '#777' : COL[s.status] || '#aaa';

// provenance badge: kind 'src' (sourced), 'unc' (uncertain/approx), 'calc' (our calc), 'mock' (placeholder data)
function badge(url, kind = 'src', title = '') {
  const lbl = { src: 'src', unc: '± est', calc: 'calc', mock: 'mock' }[kind] || 'src';
  const t = title || { src: 'Open source', unc: 'Approximate / uncertain value. Open source', calc: 'Our calculation, validated within ~4 pts vs published polar lighting (see validation)', mock: 'Placeholder model, no terrain. Real calc not loaded yet' }[kind];
  return `<a class="src ${kind === 'src' || kind === 'calc' ? '' : kind}" href="${esc(url || 'data/validation_results.json')}" target="_blank" rel="noopener" title="${esc(t)}">${lbl}</a>`;
}

async function getJSON(names) { for (const n of names) { try { const r = await fetch(n); if (r.ok) return await r.json(); } catch (e) { } } return null; }
async function tryImport(paths) { for (const p of paths) { try { const head = await fetch(p, { method: 'HEAD' }); if (!head.ok) continue; return [await import(p), p]; } catch (e) { console.warn('import failed', p, e); } } return [null, null]; }

// ---------- state <-> URL hash ----------
function readHash() {
  const h = new URLSearchParams(location.hash.slice(1));
  if (h.get('view')) st.view = h.get('view') === 'pole' ? 'pole' : 'globe';
  if (h.get('site')) st.site = h.get('site');
  if (h.get('t')) { const t = Date.parse(h.get('t')); if (!isNaN(t)) hashHasT = true, st.t = Math.min(T0 + SPAN, Math.max(T0, t)); }
  if (h.get('w')) { const [a, b, c] = h.get('w').split(',').map(Number); if ([a, b, c].every(x => x >= 0)) st.w = { sun: a, comms: b, slope: c }; }
  if (h.get('tab')) st.tab = h.get('tab');
  if (h.get('cmp')) st.cmp = h.get('cmp').split(',').slice(0, 2);
  if (h.get('p')) { const [la, lo] = h.get('p').split(',').map(Number); if (!isNaN(la) && !isNaN(lo)) st.p = { lat: la, lon: lo }; }
  if (h.get('date')) st.date = h.get('date');
  if (h.get('layer')) st.layer = ['lit', 'earth'].includes(h.get('layer')) ? h.get('layer') : 'none';
  return h.get('tour') === '1';
}
let hashTimer;
function writeHash() {
  clearTimeout(hashTimer); hashTimer = setTimeout(() => {
    const h = new URLSearchParams({ view: st.view, t: new Date(st.t).toISOString().slice(0, 16) + 'Z', w: `${st.w.sun},${st.w.comms},${st.w.slope}`, tab: st.tab });
    if (st.site) h.set('site', st.site);
    if (st.layer !== 'none') h.set('layer', st.layer);
    if (st.cmp[0] || st.cmp[1]) h.set('cmp', st.cmp.join(','));
    if (st.p) { h.set('p', st.p.lat.toFixed(3) + ',' + st.p.lon.toFixed(3)); h.set('date', st.date); }
    history.replaceState(null, '', '#' + h.toString());
  }, 150);
}

// ---------- view / tabs / sheet ----------
function setView(v, fromScene) {
  st.view = v; $$('.seg button').forEach(b => b.setAttribute('aria-pressed', b.dataset.view === v));
  if (!fromScene) scene?.setView(v); writeHash();
}
function setTab(t) {
  st.tab = t; $$('.tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === t));
  $$('section[data-pane]').forEach(s => s.classList.toggle('on', s.dataset.pane === t));
  if (t !== 'plan') scene?.pickPoint?.(null);
  renderPane(); writeHash();
}
const SNAP = { peek: () => 92, half: () => Math.round(innerHeight * 0.5), full: () => innerHeight - 64 };
function syncInsets() { if (!scene?.setInsets) return; const p = $('#panel'), r = p.getBoundingClientRect(); if (isPhone()) scene.setInsets({ bottom: Math.max(0, innerHeight - $('#scrub').getBoundingClientRect().top) }); else scene.setInsets({ right: Math.max(0, innerWidth - r.left), bottom: Math.max(0, innerHeight - $('#scrub').getBoundingClientRect().top) }); }
function setSnap(s) {
  const p = $('#panel'); p.dataset.snap = s; requestAnimationFrame(syncInsets);
  if (!isPhone()) { p.style.height = ''; $('#scrub').style.bottom = ''; return; }
  const h = SNAP[s](); p.style.height = h + 'px';
  document.documentElement.style.setProperty('--sheetPeek', SNAP.peek() + 'px');
  $('#scrub').style.bottom = (s === 'full' ? -200 : h + 8) + 'px';
  document.body.classList.toggle('sheet-up', s === 'full');
}
function sheetDrag() {
  const p = $('#panel'); let y0, h0, drag = false, moved = 0;
  const start = e => { if (!isPhone() || (e.target.closest('.tabs button') && e.pointerType === 'mouse')) return; drag = true; moved = 0; y0 = e.clientY; h0 = p.getBoundingClientRect().height; p.classList.add('dragging'); };
  const move = e => { if (!drag) return; moved = Math.max(moved, Math.abs(e.clientY - y0)); const h = Math.max(70, Math.min(SNAP.full(), h0 - (e.clientY - y0))); p.style.height = h + 'px'; };
  const end = e => { if (!drag) return; drag = false; p.classList.remove('dragging'); if (moved < 6) { if (e.target.closest('#grab')) setSnap(p.dataset.snap === 'peek' ? 'half' : p.dataset.snap === 'half' ? 'full' : 'peek'); else setSnap(p.dataset.snap); return; }
    const h = p.getBoundingClientRect().height; let best = 'peek', bd = 1e9; for (const k in SNAP) { const d = Math.abs(SNAP[k]() - h); if (d < bd) { bd = d; best = k; } } setSnap(best); };
  [$('#grab'), $('.tabs')].forEach(el => el.addEventListener('pointerdown', start));
  addEventListener('pointermove', move); addEventListener('pointerup', end); addEventListener('pointercancel', end);
}

// ---------- time ----------
let playing = false, speedIdx = 0, lastFrame = 0;
const SPEEDS = [{ l: '1d/s', v: DAY }, { l: '4d/s', v: 4 * DAY }, { l: '12h/s', v: DAY / 2 }];
function setTime(ms, src) {
  st.t = Math.min(T0 + SPAN, Math.max(T0, ms));
  if (src !== 'slider') $('#time').value = Math.round((st.t - T0) / SPAN * 1000);
  $('#tlabel').textContent = fmtT(st.t);
  scene?.setTime(new Date(st.t).toISOString());
  updateNow(); drawCursors(); writeHash();
}
function loop(ts) {
  if (playing) { const dt = Math.min(0.1, (ts - lastFrame) / 1000); let t = st.t + dt * SPEEDS[speedIdx].v; if (t >= T0 + SPAN) t = T0; setTime(t); }
  lastFrame = ts; requestAnimationFrame(loop);
}
function setPlaying(p) { playing = p; $('#play').textContent = p ? '❚❚' : '▶'; $('#play').setAttribute('aria-label', p ? 'Pause' : 'Play'); }
function focusPoint() { // what the scrubber bands describe
  const s = SITES.find(x => x.id === st.site);
  if (st.tab === 'plan' && st.p) return { lat: st.p.lat, lon: st.p.lon, name: 'Plan point' };
  if (s && s.lat != null) return { lat: s.lat, lon: s.lon, name: s.mission };
  return { lat: -89.45, lon: -137.31, name: 'Shackleton rim' };
}
let bandCache = {};
function samplesFor(lat, lon) { const r = runPlan(lat, lon, new Date(T0).toISOString()); return (!r.mock && r.samples?.length) ? r.samples : sample(lat, lon, T0, 60, 3); }
function drawBands() {
  const f = focusPoint(), key = f.lat + ',' + f.lon; const svg = $('#bands');
  const smp = bandCache[key] || (bandCache[key] = samplesFor(f.lat, f.lon));
  svg.setAttribute('viewBox', `0 0 ${smp.length} 3`);
  let html = ''; const row = (y, fn, c) => { let s0 = null; smp.forEach((x, i) => { if (fn(x) && s0 == null) s0 = i; if ((!fn(x) || i === smp.length - 1) && s0 != null) { html += `<rect x="${s0}" y="${y}" width="${i - s0 + 1}" height="1" fill="${c}"/>`; s0 = null; } }); };
  row(0, x => x.lit, 'rgba(255,181,71,.85)'); row(1, x => x.ev, 'rgba(77,163,255,.8)'); row(2, x => x.lit && x.ev, 'rgba(95,224,176,.95)');
  svg.innerHTML = html; $('#tnow').textContent = f.name;
}
function updateNow() {
  const f = focusPoint(), d = dirs(st.t), se = elev(f.lat, f.lon, d.sun), ee = elev(f.lat, f.lon, d.earth);
  const el = $('#nowbox'); if (el) el.innerHTML = `<span style="color:var(--sun)">Sun ${se.toFixed(1)}°</span> · <span style="color:var(--earth)">Earth ${ee.toFixed(1)}°</span> ${badge('data/ephem.json', ephemSource() === 'ephem' ? 'calc' : 'mock', ephemSource() === 'ephem' ? 'Ephemeris from calc (ephem.json); no terrain horizon' : 'Analytic Sun/Earth model until ephem.json lands; no terrain')}`;
}

// ---------- timelines (SVG) ----------
function timelineSVG(lat, lon, id) {
  const smp = samplesFor(lat, lon), n = smp.length, mx = Math.max(5, ...smp.map(x => Math.abs(x.sun)));
  let bands = ''; const row = (y, h, fn, c) => { let s0 = null; smp.forEach((x, i) => { if (fn(x) && s0 == null) s0 = i; if ((!fn(x) || i === n - 1) && s0 != null) { bands += `<rect x="${s0}" y="${y}" width="${i - s0 + 1}" height="${h}" fill="${c}"/>`; s0 = null; } }); };
  row(0, 40, x => x.lit, 'rgba(255,181,71,.13)'); row(40, 8, x => x.ev, 'rgba(77,163,255,.7)'); row(52, 8, x => x.lit && x.ev, 'rgba(95,224,176,.9)');
  const path = smp.map((x, i) => `${i ? 'L' : 'M'}${i},${(20 - x.sun / mx * 18).toFixed(1)}`).join('');
  return `<svg class="tl" data-tl="${id}" viewBox="0 0 ${n} 62" preserveAspectRatio="none"><line x1="0" x2="${n}" y1="20" y2="20" stroke="rgba(255,255,255,.15)" stroke-width=".5" vector-effect="non-scaling-stroke"/>${bands}<path d="${path}" fill="none" stroke="#ffb547" stroke-width="1.5" vector-effect="non-scaling-stroke"/><line class="cur" x1="0" x2="0" y1="0" y2="62" stroke="#fff" stroke-width="1.5" vector-effect="non-scaling-stroke"/></svg>`;
}
function drawCursors() { const n = 60 * 8 + 1, x = (st.t - T0) / SPAN * (n - 1); $$('svg.tl .cur').forEach(l => { l.setAttribute('x1', x); l.setAttribute('x2', x); }); }
document.addEventListener('click', e => { const s = e.target.closest('svg.tl'); if (!s) return; const b = s.getBoundingClientRect(); setTime(T0 + (e.clientX - b.left) / b.width * SPAN); });

// ---------- panes ----------
function renderPane() { ({ missions: paneMissions, site: paneSite, compare: paneCompare, plan: panePlan })[st.tab]?.(); drawBands(); drawCursors(); }
function paneMissions() {
  const el = $('section[data-pane=missions]'), counts = {};
  SITES.forEach(s => counts[statusOf(s)] = (counts[statusOf(s)] || 0) + 1);
  const F = ['all', 'landed', 'partial', 'failed', 'planned', 'cancelled'].filter(k => k === 'all' || counts[k]);
  const list = [...SITES].filter(s => st.filter === 'all' || statusOf(s) === st.filter).sort((a, b) => String(a.date).localeCompare(String(b.date)));
  el.innerHTML = `<h2>${SITES.length} CLPS missions</h2><p class="mut">NASA's Commercial Lunar Payload Services landers, plus Artemis III candidate regions at the south pole. Tap one to fly there.</p>
  <div class="filters">${F.map(k => `<button data-f="${k}" class="${st.filter === k ? 'on' : ''}">${k === 'all' ? 'All' : `<span class="dot" style="background:${k === 'cancelled' ? '#777' : COL[k]}"></span>&nbsp;${k[0].toUpperCase() + k.slice(1)} ${counts[k]}`}</button>`).join('')}</div>
  <ul class="mlist">${list.map(s => `<li><button data-site="${s.id}"><span class="dot" style="background:${colOf(s)}"></span><span class="nm"><b>${esc(s.mission)}</b><small>${esc(s.provider)} · ${s.lat != null ? (s.lat <= POLAR ? 'South pole' : s.lat.toFixed(1) + '°') : '—'}${s.uncertain ? ' · approx.' : ''}</small></span><span class="dt mono">${esc(s.date)}</span></button></li>`).join('')}</ul>
  <h3>Artemis III candidate regions ${badge(REGIONS[0]?.source, 'src')}</h3>
  <ul class="mlist">${REGIONS.map(r => `<li><button data-region="${r.id}"><span class="dot" style="background:transparent;border:1.5px dashed var(--sun)"></span><span class="nm"><b>${esc(r.name)}</b><small class="mono">${r.lat.toFixed(2)}°, ${r.lon.toFixed(2)}°</small></span></button></li>`).join('')}</ul>`;
}
function siteStats(s) { const tl = TL[s.id]; return tl?.summary || null; }
function paneSite() {
  const el = $('section[data-pane=site]'), s = SITES.find(x => x.id === st.site);
  if (!s) { el.innerHTML = `<p class="mut">No site selected. Tap a marker on the Moon or pick one from Missions.</p><button data-tab-go="missions">Browse missions</button>`; return; }
  const sm = siteStats(s), src = s.source_url || s.source, unc = s.uncertain ? 'unc' : 'src';
  const pl = s.lat != null ? runPlan(s.lat, s.lon, new Date(T0).toISOString()) : null;
  el.innerHTML = `<div style="display:flex;justify-content:space-between;gap:8px;align-items:start"><div><h2>${esc(s.mission)}</h2><div class="mut">${esc(s.provider)} · ${esc(s.lander)}</div></div>
   <span class="chip"><span class="dot" style="background:${colOf(s)}"></span>${statusOf(s)}</span></div>
  <dl class="kv" style="margin-top:12px"><dt>Site</dt><dd class="mono">${s.lat == null ? 'unknown' : s.lat.toFixed(3) + '°, ' + s.lon.toFixed(3) + '°'} ${badge(src, unc)}</dd>
  <dt>Date</dt><dd class="mono">${esc(s.date)} ${badge(src, unc)}</dd><dt>Payloads</dt><dd>${(s.payloads || []).length} ${badge(src)}</dd></dl>
  ${s.note ? `<p class="mut">${esc(s.note)}</p>` : ''}
  <h3>First 60 days after landing date</h3>
  ${sm ? `<div class="stats"><div class="stat sun"><div class="k">Sunlit ${badge('data/timeline.json', 'calc')}</div><div class="v mono">${pct(sm.pct_lit)}</div>${sm.pct_lit_terrain != null ? `<div class="mut mono">${pct(sm.pct_lit_terrain)} with terrain ${badge('data/validation_results.json', 'unc', 'Terrain-shadowed, LOLA DEM; coarse grid, ~4 pt agreement with published values')}</div>` : ''}</div>
   <div class="stat earth"><div class="k">Earth in view ${badge('data/timeline.json', 'calc')}</div><div class="v mono">${pct(sm.pct_earth)}</div></div>
   <div class="stat both"><div class="k">Lit + Earth ${badge('data/timeline.json', 'calc')}</div><div class="v mono">${pct(sm.pct_lit_and_earth)}</div></div>
   <div class="stat"><div class="k">Longest night ${badge('data/timeline.json', 'calc')}</div><div class="v mono">${sm.longest_night_hours != null ? Math.round(sm.longest_night_hours / 24 * 10) / 10 + ' d' : '—'}</div></div></div>` : `<p class="mut">No timeline for this mission.</p>`}
  ${pl ? `<h3>Event window · 14 Nov 2026 +60 d</h3><div class="tlwrap">${timelineSVG(s.lat, s.lon, s.id)}</div>
  <div id="nowbox" class="mono" style="font-size:12px"></div>
  <div class="mut" style="font-size:12px;margin-top:4px">Sun above terrain ${Math.round(pl.sunHours)} h · Earth ${Math.round(pl.earthHours)} h · longest night ${pl.longestNightIsLowerBound ? '≥' : ''}${Math.round(pl.longestNight)} h ${badge('data/plan_grid.json', kindOf(pl))}</div>` : ''}
  <div class="btnrow">${s.lat != null ? `<button data-plan-here="${s.id}">Plan a landing here</button>` : ''}<button data-cmp-add="${s.id}">Compare</button>${src ? `<a href="${esc(src)}" target="_blank" rel="noopener"><button>Source ↗</button></a>` : ''}</div>`;
  updateNow();
}
function paneCompare() {
  const el = $('section[data-pane=compare]'), withLoc = SITES.filter(s => s.lat != null);
  if (!st.cmp[0]) st.cmp[0] = st.site || 'im-1'; if (!st.cmp[1]) st.cmp[1] = withLoc.find(s => s.id !== st.cmp[0] && s.lat <= POLAR)?.id;
  const opt = sel => withLoc.map(s => `<option value="${s.id}" ${s.id === sel ? 'selected' : ''}>${esc(s.mission)}</option>`).join('');
  const A = SITES.find(s => s.id === st.cmp[0]), B = SITES.find(s => s.id === st.cmp[1]);
  const row = (k, f, b) => `<tr><td>${k} ${b || ''}</td><td class="mono">${A ? f(A) : ''}</td><td class="mono">${B ? f(B) : ''}</td></tr>`;
  const P = s => runPlan(s.lat, s.lon, new Date(T0).toISOString());
  const pa = A && P(A), pb = B && P(B), pk = kindOf(pa) === 'calc' && kindOf(pb) === 'calc' ? 'calc' : 'mock';
  el.innerHTML = `<h2>Compare sites</h2><p class="mut">Timelines are synced to the scrubber. Tap a timeline to jump in time.</p>
  <div class="cmpsel"><select data-cmp="0" aria-label="Site A">${opt(st.cmp[0])}</select><select data-cmp="1" aria-label="Site B">${opt(st.cmp[1])}</select></div>
  ${[A, B].map((s, i) => s ? `<div class="tlwrap" style="margin-top:12px"><div class="lab"><span><span class="dot" style="background:${colOf(s)}"></span> ${esc(s.mission)}</span><span class="mut mono">${s.lat.toFixed(2)}°</span></div>${timelineSVG(s.lat, s.lon, 'c' + i)}</div>` : '').join('')}
  <table class="ct"><tr><th></th><th>A</th><th>B</th></tr>
  ${row('Sunlit (landing +60d)', s => pct(siteStats(s)?.pct_lit), badge('data/timeline.json', 'calc'))}
  ${row('…with terrain', s => pct(siteStats(s)?.pct_lit_terrain), badge('data/validation_results.json', 'unc'))}
  ${row('Earth in view', s => pct(siteStats(s)?.pct_earth), badge('data/timeline.json', 'calc'))}
  ${row('Sun h (event +60d)', s => Math.round((s === A ? pa : pb).sunHours), badge('data/plan_grid.json', pk))}
  ${row('Longest night h', s => Math.round((s === A ? pa : pb).longestNight), badge('data/plan_grid.json', pk))}
  ${row('Landing index (not prob.)', s => Math.round((s === A ? pa : pb).score * 100), badge('data/plan_grid.json', pk, 'Weighted demo score, not a probability'))}</table>`;
}
function runPlan(lat, lon, iso) {
  const W = { sun: st.w.sun, comms: st.w.comms, slope: st.w.slope };
  try { const r = planner.planLanding(lat, lon, iso, W); if (r && !r.error && !r.then) return r; } catch (e) { console.error(e); }
  const m = mockPlanner.planLanding(lat, lon, iso, W); m.outside = true; return m; // outside terrain grid (lat > -84) or planner not ready
}
const kindOf = r => (!r || r.mock) ? 'mock' : 'calc';
function panePlan() {
  const el = $('section[data-pane=plan]');
  let res = st.p ? runPlan(st.p.lat, st.p.lon, st.date + 'T00:00:00Z') : null; const pk = kindOf(res);
  const w = st.w, W = w.sun + w.comms + w.slope || 1, b = res?.breakdown;
  el.innerHTML = `<h2>Plan a landing</h2><p class="mut">Pick a point on the south-pole terrain and a date. We find the best windows with sunlight and Earth contact.</p>
  <div class="btnrow" style="margin-top:4px"><button id="pickBtn" class="${pickActive ? 'on' : ''}">${pickActive ? 'Tap the terrain…' : '⌖ Pick on terrain'}</button>
  <select id="regionSel" aria-label="Or choose an Artemis III region"><option value="">or Artemis region…</option>${REGIONS.map(r => `<option value="${r.id}">${esc(r.name)}</option>`).join('')}</select></div>
  <div class="sl" style="margin-top:8px"><span>Date</span><input type="date" id="pdate" value="${st.date}" min="2026-11-14" max="2027-04-30" style="grid-column:span 2"></div>
  <h3>What matters to you</h3>
  ${['sun', 'comms', 'slope'].map(k => `<label class="sl ${k}"><span>${{ sun: 'Sunlight', comms: 'Earth comms', slope: 'Flat ground' }[k]}</span><input type="range" min="0" max="100" value="${w[k]}" data-w="${k}"><span class="mono">${Math.round(w[k] / W * 100)}%</span></label>`).join('')}
  ${res ? `<h3>Result · <span class="mono">${st.p.lat.toFixed(2)}°, ${st.p.lon.toFixed(2)}°</span></h3>
   <div style="display:flex;align-items:baseline;gap:8px"><span class="big mono">${Math.round(res.score * 100)}</span><span class="mut">/ 100 · Landing index (not a probability)</span>${badge('data/plan_grid.json', pk, 'Weighted index, not a probability')}</div>
   <div class="bar" title="Score breakdown"><i class="b-sun" style="width:${b.sun * 100}%"></i><i class="b-comms" style="width:${b.comms * 100}%"></i><i class="b-slope" style="width:${b.slope * 100}%"></i></div>
   <div class="disc">Landing index 0–100 · demo score, not a probability</div>
   <div class="mut mono" style="font-size:12px;margin-top:4px"><span style="color:var(--sun)">■ sun ${Math.round(b.sun * 100)}</span> · <span style="color:var(--earth)">■ comms ${Math.round(b.comms * 100)}</span> · <span style="color:#b48cff">■ slope ${Math.round(b.slope * 100)}</span></div>
   <div class="stats" style="margin-top:12px"><div class="stat sun"><div class="k">Sun above terrain, next 60 d ${badge('data/plan_grid.json', pk)}</div><div class="v mono">${Math.round(res.sunHours)} h</div><div class="mut mono">${Math.round(res.sunHours / (res.days ? res.days * 24 : 1440) * 100)}% of time</div></div>
   <div class="stat earth"><div class="k">Earth hours ${badge('data/plan_grid.json', pk)}</div><div class="v mono">${Math.round(res.earthHours)} h</div></div>
   <div class="stat"><div class="k">Longest night ${badge('data/plan_grid.json', pk)}</div><div class="v mono">${res.longestNightIsLowerBound ? '≥' : ''}${Math.round(res.longestNight)} h</div></div>
   <div class="stat"><div class="k">Slope ${badge('data/plan_grid.json', pk)}</div><div class="v mono">${res.slope_deg != null ? res.slope_deg.toFixed(1) + '°' : '—'}</div></div></div>
   ${res.cell?.stats180d ? `<h3>Cell, 180-day stats (separate from window) ${badge(res.source_url || 'data/plan_grid.json', 'calc')}</h3><div class="mut mono" style="font-size:12px">${res.cell.pin ? 'named site (exact)' : 'cell ' + res.cell.cell_m + ' m'} · lit ${pct(res.cell.stats180d.pct_lit)} · Earth ${pct(res.cell.stats180d.pct_earth)} · both ${pct(res.cell.stats180d.pct_both)} · longest night ${Math.round(res.cell.stats180d.longest_night_h)} h</div>` : ''}
   <h3>Best windows (lit + Earth, ≥48 h sun ahead)</h3><ul class="wins">${(res.windows || []).slice(0, 3).map(x => `<li><button data-win="${x.start}"><span class="mono">${x.start.slice(5, 16).replace('T', ' ')} → ${x.end.slice(5, 16).replace('T', ' ')}</span><span class="mono" style="color:var(--both)">${Math.round(x.hours ?? (Date.parse(x.end) - Date.parse(x.start)) / 36e5)} h</span></button></li>`).join('') || '<li class="mut">No window with both sunlight and Earth in view.</li>'}</ul>
   ${res.mock ? `<p class="mut" style="font-size:12px">${res.outside && plannerKind === 'real' ? 'Outside the terrain-aware planning grid (south of 84°S only): flat-Moon estimate.' : 'Placeholder planner (no terrain).'}</p>` : `<p class="mut" style="font-size:12px">Terrain horizon from LOLA grid cell ${res.cell?.cell_m ? res.cell.cell_m + ' m' : ''}, ${res.cell?.distKm ?? '?'} km from the point.${res.longestNightIsLowerBound ? ' Longest night may continue past the window.' : ''}</p>`}`
    : `<div class="pickhint" style="margin-top:12px">No point yet. Tap <b>Pick on terrain</b>, then tap the south-pole map, or choose an Artemis region.</div>`}`;
}

// ---------- picking ----------
let pickActive = false;
function startPick() {
  pickActive = true; setView('pole'); if (isPhone()) setSnap('peek'); panePlan();
  toast('Tap a spot on the south-pole terrain');
  scene.pickPoint(p => { pickActive = false; scene.pickPoint(null); setPlanPoint(p); if (isPhone()) setSnap('half'); });
}
function setPlanPoint(p) { st.p = { lat: p.lat, lon: p.lon }; scene.setPickMarker?.(st.p); bandCache = {}; if (st.tab !== 'plan') setTab('plan'); else renderPane(); writeHash(); }
function selectSite(id, opts = {}) {
  st.site = id; const s = SITES.find(x => x.id === id);
  if (s && s.lat != null && s.lat <= POLAR && st.view !== 'pole') setView('pole');
  else if (s && s.lat != null && s.lat > POLAR && st.view !== 'globe') setView('globe');
  scene?.focusSite(id); if (!opts.keepTab) setTab('site'); if (isPhone() && !opts.keepSnap) setSnap('half'); writeHash();
}
function toast(m) { const t = $('#toast'); t.textContent = m; t.hidden = false; clearTimeout(t._h); t._h = setTimeout(() => t.hidden = true, 2600); }

// ---------- guided tour (60 s) ----------
const TOUR = [
  { at: 0, view: 'globe', site: null, tab: 'missions', cap: 'Since 2024, NASA has paid companies to land science on the Moon. This is every CLPS mission: green landed, yellow partial, red failed, blue planned.' },
  { at: 9, site: 'blue-ghost-m1', cap: 'Firefly\'s Blue Ghost 1 is the fully successful one. It landed in Mare Crisium near local sunrise, which our lighting model reproduces.' },
  { at: 18, view: 'pole', site: null, cap: 'Artemis III is going here: the lunar south pole. The Sun never rises more than a degree or two, so crater rims cast shadows kilometres long.' },
  { at: 27, play: true, cap: 'Watch a month of sunlight in seconds. Rims flicker in and out of light; the floors of permanently shadowed craters stay dark, which is where the water ice is.' },
  { at: 38, site: 'im-1', play: false, cap: 'IM-1 Odysseus: 52% sunlit on a flat Moon, only 35% once crater rims are counted. That gap is why terrain matters, and most tools ignore it.' },
  { at: 47, tab: 'plan', region: 'malapert-massif', cap: 'Plan a landing: pick a spot and date, weigh sunlight, Earth comms and slope, and get the best windows. The score is a demo score, not a probability.' },
  { at: 55, cap: 'Every number links to its source. Scrub time, compare sites, and share the exact view with a link.' },
];
let tourT = null, tourStart = 0, tourIdx = 0;
function startTour() {
  stopTour(true); document.body.classList.add('touring'); $('#caption').hidden = false; tourStart = performance.now(); tourIdx = 0; setTime(T0); setPlaying(false);
  if (isPhone()) setSnap('peek');
  tourT = setInterval(() => {
    const el = (performance.now() - tourStart) / 1000; $('#caption .capbar i').style.width = Math.min(100, el / 60 * 100) + '%';
    while (tourIdx < TOUR.length && TOUR[tourIdx].at <= el) { const s = TOUR[tourIdx++];
      if (s.view) setView(s.view); if (s.tab) setTab(s.tab); if ('site' in s) { if (s.site) selectSite(s.site, { keepSnap: true }); else { st.site = null; scene.focusSite(null); renderPane(); } }
      if (s.region) { const r = REGIONS.find(x => x.id === s.region); if (r) { st.p = { lat: r.lat, lon: r.lon }; scene.setPickMarker?.(st.p); renderPane(); } }
      if ('play' in s) { speedIdx = 1; $('#speed').textContent = SPEEDS[1].l; setPlaying(s.play); }
      $('#captext').textContent = s.cap; }
    if (el >= 60) stopTour();
  }, 100);
}
function stopTour(silent) { if (tourT) clearInterval(tourT); tourT = null; document.body.classList.remove('touring'); $('#caption').hidden = true; if (!silent) setPlaying(false); }

// ---------- events ----------
function wire() {
  $$('.seg button').forEach(b => b.onclick = () => setView(b.dataset.view));
  $$('.tabs button').forEach(b => b.onclick = () => { setTab(b.dataset.tab); if (isPhone() && $('#panel').dataset.snap === 'peek') setSnap('half'); });
  $('#play').onclick = () => setPlaying(!playing);
  $('#speed').onclick = () => { speedIdx = (speedIdx + 1) % SPEEDS.length; $('#speed').textContent = SPEEDS[speedIdx].l; };
  $('#time').oninput = e => { setPlaying(false); setTime(T0 + e.target.value / 1000 * SPAN, 'slider'); };
  $('#tourBtn').onclick = startTour; $('#tourStop').onclick = () => stopTour();
  $('#shareBtn').onclick = async () => { writeHash(); await new Promise(r => setTimeout(r, 200)); try { await navigator.clipboard.writeText(location.href); toast('Link copied'); } catch (e) { toast('Copy this page\'s address to share'); } };
  $('#pbody').addEventListener('click', e => {
    const t = e.target.closest('button'); if (!t) return;
    if (t.dataset.f) { st.filter = t.dataset.f; paneMissions(); }
    else if (t.dataset.site) selectSite(t.dataset.site);
    else if (t.dataset.region) { const r = REGIONS.find(x => x.id === t.dataset.region); setView('pole'); setPlanPoint(r); }
    else if (t.dataset.tabGo) setTab(t.dataset.tabGo);
    else if (t.dataset.planHere) { const s = SITES.find(x => x.id === t.dataset.planHere); setPlanPoint(s); }
    else if (t.dataset.cmpAdd) { st.cmp = [t.dataset.cmpAdd, st.cmp[0] && st.cmp[0] !== t.dataset.cmpAdd ? st.cmp[0] : null]; setTab('compare'); }
    else if (t.dataset.win) { setTime(Date.parse(t.dataset.win)); }
    else if (t.id === 'pickBtn') startPick();
  });
  $('#pbody').addEventListener('change', e => {
    const t = e.target;
    if (t.dataset.cmp) { st.cmp[+t.dataset.cmp] = t.value; paneCompare(); drawCursors(); writeHash(); }
    if (t.id === 'regionSel' && t.value) { const r = REGIONS.find(x => x.id === t.value); setView('pole'); setPlanPoint(r); }
    if (t.id === 'pdate' && t.value) { st.date = t.value; panePlan(); writeHash(); }
  });
  let wTimer; $('#pbody').addEventListener('input', e => { const k = e.target.dataset.w; if (!k) return; st.w[k] = +e.target.value; clearTimeout(wTimer); wTimer = setTimeout(() => { const y = $('#pbody').scrollTop; panePlan(); $('#pbody').scrollTop = y; writeHash(); }, 60); });
  addEventListener('hashchange', () => { if (document.activeElement === document.body) { readHash(); applyState(); } });
  addEventListener('resize', () => setSnap($('#panel').dataset.snap));
  addEventListener('keydown', e => { if (e.target.matches('input,select')) return; if (e.key === ' ') { e.preventDefault(); setPlaying(!playing); } if (e.key === 'ArrowRight') setTime(st.t + DAY / 4); if (e.key === 'ArrowLeft') setTime(st.t - DAY / 4); });
}
function setLayer(l) { st.layer = l; const sel = $('#layer'); if (sel) { sel.value = l; sel.disabled = !scene?.setLayer; } scene?.setLayer?.(l === 'none' ? null : l); const lg = $('#heatlg'); if (lg) { lg.hidden = l === 'none'; lg.querySelector('i').style.background = l === 'earth' ? 'linear-gradient(90deg,#111,#4a9dff)' : 'linear-gradient(90deg,#111,#f0a83a)'; } writeHash(); }
function applyState() { setView(st.view); setLayer(st.layer); if (st.site) scene.focusSite(st.site); if (st.p) scene.setPickMarker?.(st.p); setTab(st.tab); setTime(st.t); }

// ---------- boot ----------
(async function boot() {
  const wantTour = readHash();
  const [sites, regions, tl, eph] = await Promise.all([getJSON(['data/sites.json', '../data/sites.json']), getJSON(['data/artemis_regions.json', '../data/artemis_regions.json']), getJSON(['data/timeline.json', '../data/timeline.json']), getJSON(['data/ephem.json'])]);
  SITES = sites || []; REGIONS = regions || []; TL = tl || {}; if (eph) setEphem(eph);
  const ups = [...SITES, ...REGIONS].map(x => x.updated).filter(Boolean).sort(); if (ups.length) UPDATED = ups.at(-1);
  mockPlanner = await import('./mock-plan.js');
  let [pm, pp] = await tryImport(['./data/plan.js', './plan.js']);
  if (pm?.planLanding) { planner = pm; plannerKind = 'real'; if (pm.initPlan) await pm.initPlan(); else if (pm.init) await pm.init(); } else planner = await import('./mock-plan.js');
  // sanity: real planner must return a result synchronously or we fall back
  if (plannerKind === 'real') { try { const r = planner.planLanding(-89.4, -137, '2026-11-14T00:00:00Z', st.w); if (!r || r.then || r.score == null) throw new Error('bad plan result'); } catch (e) { console.warn('plan.js unusable, using mock', e); planner = await import('./mock-plan.js'); plannerKind = 'mock'; } }
  let [sm] = await tryImport(['./scene.js']);
  try { if (!sm?.init) throw 0; scene = sm; await scene.init($('#scene'), { sites: SITES, regions: REGIONS }); sceneKind = 'real'; if (!hashHasT && sm.DEFAULT_TIME) { const d = Date.parse(sm.DEFAULT_TIME); if (!isNaN(d)) st.t = Math.min(T0 + SPAN, Math.max(T0, d)); } }
  catch (e) { if (e) console.warn('scene.js failed, using stub', e); $('#scene').innerHTML = ''; scene = await import('./scene-stub.js'); await scene.init($('#scene'), { sites: SITES, regions: REGIONS }); sceneKind = 'stub'; }
  if (isPhone() && scene.setQuality) scene.setQuality('low');
  scene.on('siteclick', d => selectSite(d.id));
  $('.dataupd').innerHTML = `Data updated <span class="mono">${UPDATED}</span> · scene: ${sceneKind} · planner: ${plannerKind} · <a class="vlink" href="data/validation_results.json" target="_blank">validation</a>`;
  addEventListener('resize', () => requestAnimationFrame(syncInsets));
  $('#layer').addEventListener('change', e => setLayer(e.target.value));
  if (new URLSearchParams(location.search).has('shots') && sm?._dbg) window.__shot = () => sm._dbg().snap();
  wire(); sheetDrag(); setSnap(isPhone() ? (st.tab === 'missions' && !st.site ? 'peek' : 'half') : 'half'); applyState(); requestAnimationFrame(loop);
  window.__app = { st, sceneKind, plannerKind }; document.body.dataset.ready = '1';
  if (wantTour) startTour();
})();
