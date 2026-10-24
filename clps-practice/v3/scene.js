// Lunar Landing Site Navigator v3 — 3D scene (three.js). Practice code.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const BASE = new URL('.', import.meta.url).href;
const RK = 1737.4;                       // Moon radius, km
// marker palette avoids the Sun (amber), Earth (blue) and lit+Earth (green) colours used for results
export const MCOL = { landed: '#f4f6fb', partial: '#c792ea', failed: '#ff6b81', planned: '#a7b0bf', cancelled: '#6b7280' };
const SUNC = '#ffc44d', EARTHC = '#59b6ff';
const ems = {}; const on = (e, cb) => ((ems[e] ||= []).push(cb)); const emit = (e, d) => (ems[e] || []).forEach(f => f(d));
let R, scene, cam, ctl, globe, pole, sunLight, meta, H = null, hTex, terr, terrMat, stars, sunSpr, earthSpr, earthRing, fade;
let view = 'pole', quality = 'high', exag = 1, ephem = null, sites = [], regions = [], dirty = true, tween = null, pickCb = null, focusId = null;
const gMarkers = [], pMarkers = []; let labelEl, mapui, labels = [], sunIcon, earthIcon, selLL = null;
const sunME = new THREE.Vector3(1, 0, 0), earthME = new THREE.Vector3(1, 0, 0);

// ---------- frames ----------
const meToGlobe = v => new THREE.Vector3(v.x, v.z, -v.y);           // matches SphereGeometry equirect UVs (lon0 -> +X, north +Y)
const meToPole = v => new THREE.Vector3(v.y, -v.z, -v.x);           // pole scene: X=x_ps, Y=up, Z=-y_ps (km)
const llGlobe = (la, lo, r = 1) => { la *= Math.PI / 180; lo *= Math.PI / 180; return new THREE.Vector3(r * Math.cos(la) * Math.cos(lo), r * Math.sin(la), -r * Math.cos(la) * Math.sin(lo)); };
const llPS = (la, lo) => { const k = 2 * RK * Math.tan(Math.PI / 4 + la * Math.PI / 360); lo *= Math.PI / 180; return { X: k * Math.sin(lo), Z: -k * Math.cos(lo) }; };
const psLL = (X, Z) => ({ lat: (2 * Math.atan(Math.hypot(X, Z) / (2 * RK)) - Math.PI / 2) * 180 / Math.PI, lon: Math.atan2(X, -Z) * 180 / Math.PI });
const curv = (X, Z) => (X * X + Z * Z) / (2 * RK);
function hAt(X, Z) { // real height km (bilinear), null outside patch
  const n = meta.width, s = meta.half_size_km, u = Math.min(Math.max((X + s) / (2 * s) * n - .5, 0), n - 1), v = Math.min(Math.max((Z + s) / (2 * s) * n - .5, 0), n - 1); // pixel centres, matches GPU sampling
  if (Math.abs(X) > s || Math.abs(Z) > s) return null;
  const i = Math.floor(u), j = Math.floor(v), fu = u - i, fv = v - j, i1 = Math.min(i + 1, n - 1), j1 = Math.min(j + 1, n - 1);
  return (H[j * n + i] * (1 - fu) * (1 - fv) + H[j * n + i1] * fu * (1 - fv) + H[j1 * n + i] * (1 - fu) * fv + H[j1 * n + i1] * fu * fv);
}
const terrY = (X, Z) => (hAt(X, Z) ?? 0) * exag - curv(X, Z);

// ---------- ephemeris ----------
function simpleSun(t) { // fallback: synodic rotation, ±1.54° declination over draconic-ish year
  const d = (t - Date.UTC(2026, 10, 1)) / 864e5, L = (-d / 29.5306 * 360 + 180) * Math.PI / 180, B = 1.54 * Math.sin(2 * Math.PI * d / 346.6) * Math.PI / 180;
  return new THREE.Vector3(Math.cos(B) * Math.cos(L), Math.cos(B) * Math.sin(L), Math.sin(B));
}
function ephAt(t) {
  if (!ephem) return { sun: simpleSun(t), earth: new THREE.Vector3(1, 0, 0) };
  const f = (t - Date.parse(ephem.start)) / (ephem.step_hours * 36e5), n = ephem.sun.length;
  const i = Math.max(0, Math.min(n - 2, Math.floor(f))), a = Math.max(0, Math.min(1, f - i));
  const lerp = k => new THREE.Vector3(...ephem[k][i]).lerp(new THREE.Vector3(...ephem[k][i + 1]), a).normalize();
  return { sun: lerp('sun'), earth: lerp('earth') };
}

// ---------- helpers ----------
function glowTex(rgb = '255,255,255') {
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, `rgba(${rgb},1)`); gr.addColorStop(.25, `rgba(${rgb},.6)`); gr.addColorStop(1, `rgba(${rgb},0)`);
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c);
}
const GLOW = {};
// canvas-drawn marker icons (status shape + colour), constant screen size
const ICON = {};
function iconTex(kind) {
  if (ICON[kind]) return ICON[kind];
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'); g.lineWidth = 7; g.lineCap = 'round';
  const col = MCOL[kind] || '#fff'; g.shadowColor = 'rgba(0,0,0,.9)'; g.shadowBlur = 6;
  if (kind === 'landed') { g.fillStyle = col; g.beginPath(); g.arc(32, 32, 17, 0, 7); g.fill(); g.strokeStyle = '#11141b'; g.lineWidth = 4; g.stroke(); }
  else if (kind === 'partial') { g.strokeStyle = col; g.beginPath(); g.arc(32, 32, 16, 0, 7); g.stroke(); g.fillStyle = col; g.beginPath(); g.moveTo(32, 32); g.arc(32, 32, 16, -Math.PI / 2, Math.PI / 2); g.fill(); }
  else if (kind === 'failed') { g.strokeStyle = col; g.lineWidth = 8; g.beginPath(); g.moveTo(17, 17); g.lineTo(47, 47); g.moveTo(47, 17); g.lineTo(17, 47); g.stroke(); }
  else if (kind === 'planned') { g.strokeStyle = col; g.setLineDash([9, 6]); g.beginPath(); g.arc(32, 32, 17, 0, 7); g.stroke(); }
  else if (kind === 'cancelled') { g.strokeStyle = col; g.beginPath(); g.arc(32, 32, 16, 0, 7); g.moveTo(20, 44); g.lineTo(44, 20); g.stroke(); }
  else if (kind === 'region') { g.strokeStyle = '#e6e1ff'; g.lineWidth = 5; g.beginPath(); g.arc(32, 32, 20, 0, 7); g.stroke(); g.fillStyle = 'rgba(230,225,255,.25)'; g.fill(); }
  else if (kind === 'sun') { g.shadowBlur = 0; g.fillStyle = SUNC; g.strokeStyle = SUNC; g.lineWidth = 4; g.beginPath(); g.arc(32, 32, 12, 0, 7); g.fill(); for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; g.beginPath(); g.moveTo(32 + 17 * Math.cos(a), 32 + 17 * Math.sin(a)); g.lineTo(32 + 27 * Math.cos(a), 32 + 27 * Math.sin(a)); g.stroke(); } }
  else if (kind === 'earth') { g.shadowBlur = 0; g.fillStyle = EARTHC; g.beginPath(); g.arc(32, 32, 17, 0, 7); g.fill(); g.fillStyle = 'rgba(255,255,255,.85)'; g.beginPath(); g.ellipse(25, 27, 7, 4, -.5, 0, 7); g.fill(); g.beginPath(); g.ellipse(39, 40, 5, 3, .4, 0, 7); g.fill(); g.strokeStyle = '#d8eeff'; g.lineWidth = 3; g.beginPath(); g.arc(32, 32, 24, 0, 7); g.stroke(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return ICON[kind] = t;
}
const iconSpr = (kind, size = .045, depth = true) => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: iconTex(kind), transparent: true, depthWrite: false, depthTest: depth, sizeAttenuation: false })); s.scale.setScalar(size); s.renderOrder = 5; return s; };
const kindOf = s => s.cancelled || s.status === 'cancelled' ? 'cancelled' : s.status;
const spr = (rgb, size, op = 1) => { const m = new THREE.SpriteMaterial({ map: GLOW[rgb] ||= glowTex(rgb), color: 0xffffff, transparent: true, opacity: op, depthWrite: false, blending: THREE.AdditiveBlending }); const s = new THREE.Sprite(m); s.scale.setScalar(size); return s; };
const hexRgb = h => `${(h >> 16) & 255},${(h >> 8) & 255},${h & 255}`;
const loadImg = src => new Promise((ok, err) => { const i = new Image(); i.crossOrigin = 'anonymous'; i.onload = () => ok(i); i.onerror = err; i.src = src; });
const ease = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
function fly(pos, target, ms = 1400) { return new Promise(ok => { tween = { p0: cam.position.clone(), t0: ctl.target.clone(), p1: pos.clone(), t1: target.clone(), s: performance.now(), ms, ok }; dirty = true; }); }

// ---------- globe ----------
function buildGlobe(tex) {
  globe = new THREE.Group(); scene.add(globe);
  const m = new THREE.Mesh(new THREE.SphereGeometry(1, 128, 64), new THREE.MeshStandardMaterial({ map: tex, roughness: 1, metalness: 0 }));
  m.name = 'moon'; globe.add(m);
  const halo = spr('120,150,200', 2.6, .12); globe.add(halo);
  for (const s of sites) {
    if (s.lat == null || s.lon == null) continue;
    const g = new THREE.Group(); g.position.copy(llGlobe(s.lat, s.lon, 1.004)); g.userData.id = s.id;
    const ic = iconSpr(kindOf(s), .04); ic.userData.id = s.id; g.add(ic); globe.add(g); gMarkers.push(g);
  }
  for (const r of regions) { const g = iconSpr('region', .022); g.position.copy(llGlobe(r.lat, r.lon, 1.004)); g.userData.region = r.id; globe.add(g); gMarkers.push(Object.assign(new THREE.Group(), { userData: { region: r.id } })); }
  const ring = new THREE.Mesh(new THREE.RingGeometry(.1, .104, 96), new THREE.MeshBasicMaterial({ color: 0xe6e1ff, transparent: true, opacity: .45, side: THREE.DoubleSide }));
  ring.rotation.x = Math.PI / 2; ring.position.y = -0.996; globe.add(ring); // ~84°S circle = pole patch
}

// ---------- pole terrain ----------
const TV = `varying vec2 vUv; varying vec3 vP; uniform float uExag; uniform sampler2D uH; uniform float uHalf;
void main(){ vUv=uv; vec4 w=modelMatrix*vec4(position,1.); vP=w.xyz; gl_Position=projectionMatrix*viewMatrix*w; }`;
const TF = `precision highp float; varying vec2 vUv; varying vec3 vP;
uniform sampler2D uH; uniform sampler2D uC; uniform vec3 uSun; uniform float uHalf; uniform float uExag; uniform int uSteps; uniform float uTexel; uniform vec2 uPick; uniform float uPickOn; uniform sampler2D uL; uniform float uLOn; uniform float uLHalf; uniform float uGain; uniform vec3 uEarth; uniform float uNight;
const float RK=1737.4;
float h(vec2 xz){ vec2 uv=(xz+uHalf)/(2.*uHalf); return textureLod(uH,vec2(uv.x,1.-uv.y),0.).r - dot(xz,xz)/(2.*RK); }
void main(){
  vec2 xz=vP.xz; float tx=uTexel;
  float hx=(texture2D(uH,vec2(vUv.x+tx/(2.*uHalf),vUv.y)).r-texture2D(uH,vec2(vUv.x-tx/(2.*uHalf),vUv.y)).r)*uExag;
  float hz=(texture2D(uH,vec2(vUv.x,vUv.y-tx/(2.*uHalf))).r-texture2D(uH,vec2(vUv.x,vUv.y+tx/(2.*uHalf))).r)*uExag;
  vec3 n=normalize(vec3(-hx/(2.*tx),1.,-hz/(2.*tx)) + vec3(xz.x,0.,xz.y)/RK*vec3(1.,0.,1.));
  // terrain shadow: march toward the Sun over the real (unexaggerated) curved surface; sun disc 0.27deg -> soft penumbra
  vec3 p=vec3(xz.x,h(xz)+0.002,xz.y); float sh=1e3; float t=0.25;
  for(int i=0;i<160;i++){ if(i>=uSteps) break; vec3 q=p+uSun*t; if(abs(q.x)>uHalf||abs(q.z)>uHalf) break;
    sh=min(sh,(q.y-h(q.xz))/t); t*=1.075; t+=0.12; if(sh< -0.01) break; }
  float lit=smoothstep(-0.0065,0.0065,sh); // march also catches sun below the local (curved) horizon
  float lam=max(dot(n,uSun),0.);
  vec3 alb=texture2D(uC,vUv).rgb;
  float e=lam*lit; vec3 col=alb*vec3(1.0,0.97,0.92)*(1.-exp(-uGain*e)) + alb*vec3(0.55,0.65,0.85)*uNight*(0.3+0.7*max(dot(n,normalize(vec3(uEarth.x,0.5,uEarth.z))),0.)); // display fill (not physical) so night terrain stays readable // exposure curve: grazing sun stays readable; PSRs near-black
  if(uLOn>0.5){ vec2 lu=(xz+uLHalf)/(2.*uLHalf); vec4 L=texture2D(uL,vec2(lu.x,1.-lu.y)); col=mix(col, L.rgb*(0.45+0.55*(1.-exp(-uGain*e))+0.15), L.a*0.8); }
  if(uPickOn>0.5){ float d=length(xz-uPick); float r=smoothstep(1.,.45,abs(d-3.2)); col=mix(col,vec3(1.),r*.9); col=mix(col,vec3(0.),smoothstep(1.9,1.2,abs(d-3.2))*(1.-r)*.55); }
  gl_FragColor=vec4(pow(col,vec3(1./2.2)),1.);
}`;
function buildTerrain() {
  const seg = quality === 'low' ? 255 : 511, s = meta.half_size_km;
  const geo = new THREE.PlaneGeometry(2 * s, 2 * s, seg, seg); geo.rotateX(-Math.PI / 2);
  if (terr) { terr.geometry.dispose(); terr.geometry = geo; } else {
    terr = new THREE.Mesh(geo, terrMat); terr.name = 'terrain'; pole.add(terr);
  }
  // uv: rotateX maps v=1 (image row 0) to Z=-half; shader samples (u, 1-v) of a flipY=false texture -> row 0 at Z=-half too
  displace();
}
function displace() {
  const p = terr.geometry.attributes.position; for (let i = 0; i < p.count; i++) p.setY(i, terrY(p.getX(i), p.getZ(i)));
  p.needsUpdate = true; terr.geometry.computeBoundingSphere(); terr.geometry.computeBoundingBox(); terrMat.uniforms.uExag.value = exag;
  for (const m of pMarkers) placePin(m); dirty = true;
}
function placePin(m) { const y = terrY(m.userData.X, m.userData.Z); m.position.set(m.userData.X, y, m.userData.Z); }
async function buildPole(colTex) {
  pole = new THREE.Group(); pole.visible = false; scene.add(pole);
  const img = await loadImg(BASE + 'assets/' + (meta.file || 'pole_height.png')); const n = meta.width;
  const cv = document.createElement('canvas'); cv.width = cv.height = n; const g = cv.getContext('2d', { willReadFrequently: true }); g.drawImage(img, 0, 0);
  const d = g.getImageData(0, 0, n, n).data; H = new Float32Array(n * n); const half = new Uint16Array(n * n);
  const hm = meta.h_min_m / 1000, hr = (meta.h_max_m - meta.h_min_m) / 1000;
  for (let i = 0; i < n * n; i++) { H[i] = hm + (d[4 * i] * 256 + d[4 * i + 1]) / 65535 * hr; }
  // GPU texture with rows flipped so texture v=1-uv.y lookup == image row; store km
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) half[(n - 1 - j) * n + i] = THREE.DataUtils.toHalfFloat(H[j * n + i]);
  hTex = new THREE.DataTexture(half, n, n, THREE.RedFormat, THREE.HalfFloatType); hTex.magFilter = hTex.minFilter = THREE.LinearFilter; hTex.needsUpdate = true;
  colTex.flipY = true;
  terrMat = new THREE.ShaderMaterial({ vertexShader: TV, fragmentShader: TF, uniforms: {
    uH: { value: hTex }, uC: { value: colTex }, uSun: { value: new THREE.Vector3(0, .05, 1).normalize() }, uHalf: { value: meta.half_size_km },
    uExag: { value: 1 }, uSteps: { value: 110 }, uTexel: { value: meta.m_per_px / 1000 }, uPick: { value: new THREE.Vector2() }, uPickOn: { value: 0 }, uL: { value: null }, uLOn: { value: 0 }, uLHalf: { value: 185.76 }, uGain: { value: 9 }, uEarth: { value: new THREE.Vector3(0, 0, -1) }, uNight: { value: 0.06 } } });
  buildTerrain();
  for (const s of sites) {
    if (s.lat == null || s.lat > -83.9) continue; const { X, Z } = llPS(s.lat, s.lon); if (hAt(X, Z) == null) continue;
    const m = new THREE.Group(); m.userData = { id: s.id, X, Z };
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(.12, .12, 6, 6), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: .6 })); stem.position.y = 3;
    const ic = iconSpr(kindOf(s), .042); ic.position.y = 6.6; ic.userData.id = s.id; m.add(stem, ic); pole.add(m); placePin(m); pMarkers.push(m);
  }
  for (const r of regions) { const { X, Z } = llPS(r.lat, r.lon); if (hAt(X, Z) == null) continue;
    const m = new THREE.Group(); m.userData = { region: r.id, X, Z };
    const ring = new THREE.Mesh(new THREE.TorusGeometry(6, .28, 8, 64), new THREE.MeshBasicMaterial({ color: 0xe6e1ff, transparent: true, opacity: .9, depthWrite: false }));
    ring.rotation.x = Math.PI / 2; ring.position.y = 1.2;
    const hit = new THREE.Mesh(new THREE.CircleGeometry(7, 24), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })); hit.rotation.x = -Math.PI / 2; hit.position.y = 1.2; hit.userData.region = r.id;
    m.add(ring, hit); pole.add(m); placePin(m); pMarkers.push(m); }
  sunSpr = spr('255,196,77', 90, .55); earthSpr = spr('89,182,255', 50, .45); pole.add(sunSpr, earthSpr);
  sunIcon = iconSpr('sun', .07, false); earthIcon = iconSpr('earth', .06, false); pole.add(sunIcon, earthIcon);
  earthRing = new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), new THREE.Vector3(), 40, 0x59b6ff, 10, 6); pole.add(earthRing);
}

function buildStars() {
  const n = 2500, p = new Float32Array(n * 3), c = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { const v = new THREE.Vector3().randomDirection().multiplyScalar(4000); p.set([v.x, v.y, v.z], 3 * i); const b = .35 + Math.random() ** 3 * .65; c.set([b, b, b * 1.05], 3 * i); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(p, 3)); g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  stars = new THREE.Points(g, new THREE.PointsMaterial({ size: 1.6, sizeAttenuation: false, vertexColors: true, depthWrite: false })); scene.add(stars);
}

// ---------- state ----------
// Default: 8 of 9 Artemis III regions sunlit AND Earth in view (calc horizon masks, data/plan_horizon.json); earliest such time >= 14 Nov 2026
export const DEFAULT_TIME = '2026-11-21T00:00:00Z';
let curT = Date.parse(DEFAULT_TIME);
function applyTime() {
  const { sun, earth } = ephAt(curT); sunME.copy(sun); earthME.copy(earth);
  sunLight.position.copy(meToGlobe(sun).multiplyScalar(10));
  if (pole) {
    const s = meToPole(sun), e = meToPole(earth); terrMat.uniforms.uSun.value.copy(s); terrMat.uniforms.uEarth.value.copy(e);
    sunSpr.position.copy(s).multiplyScalar(1500); earthSpr.position.copy(e).multiplyScalar(1500); sunIcon.position.copy(sunSpr.position); earthIcon.position.copy(earthSpr.position);
    const az = new THREE.Vector3(e.x, 0, e.z).normalize(); earthRing.setDirection(az); earthRing.position.copy(az).multiplyScalar(150).setY(e.y > 0 ? 15 : -5);
    earthRing.setColor(e.y > 0 ? 0x59b6ff : 0x2a3a4a);
  }
  dirty = true;
}
function polePose() { // side-lit oblique view from the sunlit side so crater-rim shadows read well
  const s = meToPole(sunME); const a = Math.atan2(s.x, s.z) + Math.PI * 0.35, d = new THREE.Vector3(Math.sin(a), 0, Math.cos(a));
  const sh = new THREE.Vector3(s.x, 0, s.z).normalize().multiplyScalar(25);
  return { pos: d.multiplyScalar(250).add(sh).setY(165), tgt: sh.clone().setY(-4) }; }
function globePose() { const k = Math.min(1.8, Math.max(1, 0.9 / (cam.aspect || 1))); return { pos: new THREE.Vector3(0, -1.6, 2.8).multiplyScalar(k), tgt: new THREE.Vector3(0, k > 1 ? -0.25 : 0, 0) }; } // portrait screens: pull back so the whole disc and pole fit
async function setFade(v) { fade.style.opacity = v; await new Promise(r => setTimeout(r, 350)); }
async function setView(v) {
  if (v === view) return; view = v; switching = true;
  if (v === 'pole') {
    await fly(new THREE.Vector3(0, -1.25, 0.25), new THREE.Vector3(0, -1, 0), 1300); await setFade(1);
    globe.visible = false; pole.visible = true; configControls(); const p = polePose(); cam.position.set(0, 900, 60); ctl.target.set(0, 0, 0); ctl.update();
    await setFade(0); await fly(p.pos, p.tgt, 1500);
  } else {
    await fly(new THREE.Vector3(0, 900, 60), new THREE.Vector3(), 900); await setFade(1);
    pole.visible = false; globe.visible = true; configControls(); cam.position.set(0, -1.25, .25); ctl.target.set(0, -1, 0); ctl.update();
    await setFade(0); const p = globePose(); await fly(p.pos, p.tgt, 1300);
  }
  switching = false; if (selLL) focusLL(selLL.lat, selLL.lon, focusId); else if (focusId) focusSite(focusId);
}
function configControls() {
  if (view === 'pole') { cam.near = .5; cam.far = 1e4; ctl.minDistance = 15; ctl.maxDistance = 900; ctl.maxPolarAngle = Math.PI * .47; }
  else { cam.near = .01; cam.far = 1e4; ctl.minDistance = 1.25; ctl.maxDistance = 6; ctl.maxPolarAngle = Math.PI; }
  cam.updateProjectionMatrix();
}
function highlight() {
  for (const m of [...gMarkers, ...pMarkers]) { if (m.userData.region) continue; const k = m.userData.id === focusId ? 1.6 : 1; for (const c of m.children) if (c.isSprite) c.scale.setScalar(c.userData.base ||= c.scale.x).multiplyScalar(k); }
  dirty = true;
}
let switching = false;
const focusK = () => { const a = cam.aspect || 1, w = R?.domElement.clientWidth || innerWidth; return a < 1 ? Math.min(2.4, 1.5 / a) : w < 1000 ? 1.4 : 1; }; // portrait/small screens: back off so ring + surroundings fit
function focusSite(id) {
  focusId = id; highlight(); if (!id || switching) return; // mid view-switch: setView re-focuses when done
  const s = sites.find(x => x.id === id); if (!s || s.lat == null) return;
  if (view === 'pole') {
    const m = pMarkers.find(x => x.userData.id === id); if (!m) { const { X, Z } = llPS(s.lat, s.lon), a = new THREE.Vector3(X, 0, Z).normalize();
      const t = a.clone().multiplyScalar(meta.half_size_km * .75); t.y = terrY(t.x, t.z); fly(t.clone().sub(a.clone().multiplyScalar(150)).add(new THREE.Vector3(0, 230, 0)), t, 1200); return; } // site outside the patch: look down at the patch edge facing it
    const t = m.position.clone(), dir = new THREE.Vector3().subVectors(cam.position, ctl.target).setY(0); if (dir.lengthSq() < 1e-6) dir.set(0, 0, 1); dir.normalize(); // straight-down camera has no horizontal direction
    const k = focusK(); fly(t.clone().add(dir.multiplyScalar(70 * k)).add(new THREE.Vector3(0, 50 * k, 0)), t, 1200);
  } else {
    globe.rotation.y = 0; const p = llGlobe(s.lat, s.lon, 1); fly(p.clone().multiplyScalar(2.2), new THREE.Vector3(), 1200);
  }
}
export function inPatch(lat, lon) { if (!meta || lat > -83) return false; const { X, Z } = llPS(lat, lon); return hAt(X, Z) != null; }
// fly to any lat/lon (regions, picked points). Pole view if the point is on the 3D patch, else globe.
function focusLL(lat, lon, id = null) {
  focusId = id; highlight(); selLL = { lat, lon }; setPickMarker(inPatch(lat, lon) ? selLL : null); if (switching) return;
  if (view === 'pole' && inPatch(lat, lon)) { const { X, Z } = llPS(lat, lon), t = new THREE.Vector3(X, terrY(X, Z), Z);
    const dir = new THREE.Vector3().subVectors(cam.position, ctl.target).setY(0); if (dir.lengthSq() < 1e-6) dir.set(0, 0, 1); dir.normalize();
    const k = focusK(); fly(t.clone().add(dir.multiplyScalar(70 * k)).add(new THREE.Vector3(0, 50 * k, 0)), t, 1200); }
  else if (view === 'globe') { globe.rotation.y = 0; const p = llGlobe(lat, lon, 1); fly(p.clone().multiplyScalar(2.2), new THREE.Vector3(), 1200); }
}
function overview() { focusId = null; highlight(); if (view === 'pole') { const p = polePose(); fly(p.pos, p.tgt, 1200); } else { const p = globePose(); fly(p.pos, p.tgt, 1200); } }
function setQuality(q) {
  quality = q; R.setPixelRatio(q === 'low' ? Math.min(devicePixelRatio, 1.25) : Math.min(devicePixelRatio, 2));
  if (terrMat) { terrMat.uniforms.uSteps.value = q === 'low' ? 48 : 110; buildTerrain(); }
  resize();
}
function setExaggeration(k) { exag = k; if (terr) displace(); }
function resize() { const el = R.domElement.parentElement; const w = el.clientWidth || innerWidth, h = el.clientHeight || innerHeight; R.setSize(w, h, false); R.domElement.style.width = '100%'; R.domElement.style.height = '100%'; cam.aspect = w / h; applyInsets(w, h); dirty = true; }
let insets = { right: 0, bottom: 0 };
function applyInsets(w, h) { const dx = Math.round(insets.right / 2), dy = Math.round(insets.bottom / 2); if (dx || dy) cam.setViewOffset(w, h, dx, dy, w, h); else cam.clearViewOffset(); cam.updateProjectionMatrix(); }
// UI panels covering the canvas: shift the projected centre into the uncovered area (px)
function setInsets(o) { insets = { right: Math.max(0, o.right || 0), bottom: Math.max(0, o.bottom || 0) }; if (R) resize(); }

// ---------- picking ----------
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
function onTap(ev) {
  const r = R.domElement.getBoundingClientRect(); ndc.set((ev.clientX - r.left) / r.width * 2 - 1, -(ev.clientY - r.top) / r.height * 2 + 1); ray.setFromCamera(ndc, cam);
  const marks = (view === 'pole' ? pMarkers.flatMap(m => m.children) : globe.children.flatMap(m => m.isSprite ? [m] : m.children)).filter(o => o.userData.id || o.userData.region);
  const hm = ray.intersectObjects(marks, false).sort((a, b) => (a.object.userData.id ? 0 : 1) - (b.object.userData.id ? 0 : 1) || a.distance - b.distance)[0];
  if (hm?.object.userData.region) { emit('regionclick', { id: hm.object.userData.region }); return; }
  if (pickCb && view === 'pole') { const ht = ray.intersectObject(terr, false)[0];
    if (ht) { const ll = psLL(ht.point.x, ht.point.z); terrMat.uniforms.uPick.value.set(ht.point.x, ht.point.z); terrMat.uniforms.uPickOn.value = 1; dirty = true; pickCb(ll); return; } }
  if (hm) { emit('siteclick', { id: hm.object.userData.id }); return; }
  if (view === 'pole') { const ht = ray.intersectObject(terr, false)[0]; if (ht) { emit('terrainclick', psLL(ht.point.x, ht.point.z)); return; } }
  if (view === 'globe') { const g = ray.intersectObject(globe.getObjectByName('moon'), false)[0]; if (g && g.point.y < -0.97) setView('pole'); }
}
const layerTex = {}; let heatMeta = null;
async function setLayer(name) {
  if (!terrMat) return; if (!name) { terrMat.uniforms.uLOn.value = 0; dirty = true; return; }
  heatMeta ||= await fetch(BASE + 'assets/heat_meta.json').then(r => r.json()).catch(() => ({ half_width_m: 185760 }));
  const t = layerTex[name] ||= await new THREE.TextureLoader().loadAsync(BASE + `assets/heat_pct_${name}.png`); t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.anisotropy = R.capabilities.getMaxAnisotropy(); t.needsUpdate = true;
  // default flipY=true: v=1 is image row 0 (lon 0 / Z=-half), matching the (u,1-v) lookup
  terrMat.uniforms.uL.value = t; terrMat.uniforms.uLHalf.value = heatMeta.half_width_m / 1000; terrMat.uniforms.uLOn.value = 1; dirty = true;
}
function setPickMarker(ll) {
  if (!terrMat) return; if (!ll) { terrMat.uniforms.uPickOn.value = 0; dirty = true; return; }
  const { X, Z } = llPS(ll.lat, ll.lon); terrMat.uniforms.uPick.value.set(X, Z); terrMat.uniforms.uPickOn.value = 1; dirty = true;
}
function pickPoint(cb) { pickCb = cb || null; if (!cb && terrMat) { terrMat.uniforms.uPickOn.value = 0; dirty = true; } }

// ---------- init ----------
async function init(el, opts = {}) {
  sites = opts.sites || []; regions = opts.regions || [];
  R = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  R.setClearColor(0x07080b); R.outputColorSpace = THREE.SRGBColorSpace; el.appendChild(R.domElement);
  if (getComputedStyle(el).position === 'static') el.style.position = 'relative';
  fade = Object.assign(document.createElement('div'), { style: 'position:absolute;inset:0;background:#07080b;opacity:0;transition:opacity .35s;pointer-events:none' }); el.appendChild(fade);
  scene = new THREE.Scene(); cam = new THREE.PerspectiveCamera(45, 1, .01, 1e4);
  ctl = new OrbitControls(cam, R.domElement); ctl.enableDamping = true; ctl.dampingFactor = .08; ctl.addEventListener('change', () => dirty = true);
  scene.add(new THREE.AmbientLight(0x9fb4d0, .55)); // earthshine-ish fill for the globe night side (pole terrain uses its own shader)
  sunLight = new THREE.DirectionalLight(0xfff4e6, 3); scene.add(sunLight);
  const [mtex, ptex, m, eph] = await Promise.all([
    new THREE.TextureLoader().loadAsync(BASE + 'assets/moon_color.jpg'), new THREE.TextureLoader().loadAsync(BASE + 'assets/pole_color.jpg'),
    fetch(BASE + 'assets/pole_height.json').then(r => r.json()), fetch(BASE + 'data/ephem.json').then(r => r.ok ? r.json() : null).catch(() => null)]);
  mtex.colorSpace = THREE.SRGBColorSpace; mtex.anisotropy = 4; meta = m; ephem = eph;
  buildStars(); buildGlobe(mtex); await buildPole(ptex);
  setQuality(opts.quality || (matchMedia('(max-width: 800px)').matches || /Mobi/.test(navigator.userAgent) ? 'low' : 'high'));
  view = opts.view === 'globe' ? 'globe' : 'pole'; globe.visible = view === 'globe'; pole.visible = view === 'pole';
  configControls(); applyTime(); const p = view === 'pole' ? polePose() : globePose(); cam.position.copy(p.pos); ctl.target.copy(p.tgt); ctl.update();
  buildMapUI(el);
  let down = null; R.domElement.addEventListener('pointerdown', e => down = [e.clientX, e.clientY]);
  R.domElement.addEventListener('pointerup', e => { if (down && Math.hypot(e.clientX - down[0], e.clientY - down[1]) < 6) onTap(e); down = null; });
  new ResizeObserver(resize).observe(el); resize(); applyTime();
  const loop = now => {
    requestAnimationFrame(loop);
    if (tween) { const k = Math.min(1, (now - tween.s) / tween.ms), e = ease(k); cam.position.lerpVectors(tween.p0, tween.p1, e); ctl.target.lerpVectors(tween.t0, tween.t1, e); dirty = true; if (k >= 1) { const ok = tween.ok; tween = null; ok(); } }
    if (ctl.update()) dirty = true;
    if (view === 'globe' && !tween && !focusId && opts.spin !== false) { globe.rotation.y += 0.0006; dirty = true; }
    if (dirty && !document.hidden) { stars.position.copy(cam.position); R.render(scene, cam); updateOverlay(); dirty = false; }
  };
  requestAnimationFrame(loop); emit('ready', {});
}
function setTime(iso) { curT = typeof iso === 'number' ? iso : Date.parse(iso); if (R) applyTime(); }
const debug = () => ({ sunME: sunME.toArray(), earthME: earthME.toArray(), sunElevPoleDeg: Math.asin(-sunME.z) * 180 / Math.PI, view, quality, exag });
export const _dbg = () => ({ cam, ctl, terrMat, snap: () => { ctl.update(); R.render(scene, cam); return R.domElement.toDataURL("image/png"); } });
// ---------- HTML overlay: labels, Sun/Earth tags, scale bar, pole/Earth-side indicator ----------
function buildMapUI(el) {
  labelEl = Object.assign(document.createElement('div'), { className: 'maplabels' }); el.appendChild(labelEl);
  mapui = Object.assign(document.createElement('div'), { className: 'mapui' });
  mapui.innerHTML = `<div class="scalebar"><i></i><span class="mono"></span></div><svg class="compass" viewBox="-30 -30 60 60" aria-label="Direction to the pole and to the Earth-facing side"><circle r="27" fill="rgba(10,12,18,.7)" stroke="rgba(255,255,255,.25)"/><g class="cp"><line y1="0" y2="-18" stroke="#fff" stroke-width="2.5"/><path d="M0,-25 L-5,-16 L5,-16Z" fill="#fff"/></g><g class="ce"><line y1="0" y2="-15" stroke="${EARTHC}" stroke-width="2" stroke-dasharray="3 2"/><path d="M0,-21 L-4,-13 L4,-13Z" fill="${EARTHC}"/></g><circle r="2.5" fill="#fff"/></svg><div class="cplab mono"><span>▲ pole</span><span style="color:${EARTHC}">▲ 0° lon (Earth side)</span></div>`;
  el.appendChild(mapui);
}
// list: [{text, lat, lon, kind:'region'|'crater'|'mission', id}]
function setLabels(list) { labels = list.map(l => ({ ...l, el: Object.assign(document.createElement('div'), { className: 'ml ml-' + l.kind, textContent: l.text }) })); labelEl.replaceChildren(...labels.map(l => l.el));
  for (const k of ['sun', 'earth']) { const d = Object.assign(document.createElement('div'), { className: 'ml ml-' + k }); labels.push({ kind: k, el: d }); labelEl.appendChild(d); } dirty = true; }
const _v = new THREE.Vector3();
function scr(v) { _v.copy(v).project(cam); const r = R.domElement; return { x: (_v.x + 1) / 2 * r.clientWidth, y: (1 - _v.y) / 2 * r.clientHeight, z: _v.z }; }
function updateOverlay() {
  if (!labelEl) return; const W = R.domElement.clientWidth, Hh = R.domElement.clientHeight, placed = [];
  const free = (x, y, w, h) => { for (const p of placed) if (x < p.x + p.w && x + w > p.x && y < p.y + p.h && y + h > p.y) return false; placed.push({ x, y, w, h }); return true; };
  if (mapui && view === 'pole') { const c = R.domElement.getBoundingClientRect(); for (const el of mapui.children) { const b = el.getBoundingClientRect(); if (b.width) placed.push({ x: b.left - c.left - 4, y: b.top - c.top - 4, w: b.width + 8, h: b.height + 8 }); } }
  const pr = { sun: 0, earth: 0, region: 1, mission: 2, crater: 3 };
  // mission/region pin icons are obstacles for the Sun/Earth direction labels
  const pins = [];
  if (view === 'pole') for (const l of labels) if ((l.kind === 'mission' || l.kind === 'region') && l.lat <= -83.9) { const { X, Z } = llPS(l.lat, l.lon); if (hAt(X, Z) == null) continue; const p = scr(new THREE.Vector3(X, terrY(X, Z) + (l.kind === 'mission' ? 9 : 2), Z)); if (p.z < 1) pins.push(l.kind === 'mission' ? { x: p.x - 24, y: p.y - 24, w: 48, h: 48, m: 1 } : { x: p.x - 50, y: p.y - 26, w: 100, h: 52 }); }
  const clear = (x, y, w, h) => !pins.some(p => x < p.x + p.w && x + w > p.x && y < p.y + p.h && y + h > p.y);
  const placeDir = (x, y, w, h) => { for (let k = 0; k < 24; k++) { const dy = (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 24, yy = Math.min(Hh - 30, Math.max(70, y + dy)); if (clear(x, yy, w, h) && free(x, yy, w, h)) return yy; } return null; };
  const order = labels.map((l, i) => i).sort((a, b) => pr[labels[a].kind] - pr[labels[b].kind]);
  for (const i of order) { const l = labels[i]; let show = false, x = 0, y = 0;
    if (l.kind === 'sun' || l.kind === 'earth') {
      if (view === 'pole') { const s = l.kind === 'sun' ? meToPole(sunME) : meToPole(earthME), up = s.y > 0;
        const p = scr(s.clone().multiplyScalar(1500)); const on = p.z < 1 && p.x > 10 && p.x < W - 10 && p.y > 10 && p.y < Hh - 10;
        l.el.textContent = (l.kind === 'sun' ? 'Sun' : 'Earth') + (up ? '' : ' (below horizon)') + (on ? '' : ' ↗');
        const ico = l.kind === 'sun' ? sunIcon : earthIcon, near = on && pins.some(q => q.m && Math.hypot(q.x + 24 - p.x, q.y + 24 - p.y) < 40);
        if (ico && ico.visible === near) { ico.visible = !near; dirty = true; }
        if (on) { x = p.x + 18; y = p.y - 8; } else { const c = scr(ctl.target), d = new THREE.Vector2(p.x - c.x, p.y - c.y).multiplyScalar(p.z > 1 ? -1 : 1).normalize();
          x = Math.min(W - 150, Math.max(10, c.x + d.x * W)); y = Math.min(Hh - 30, Math.max(70, c.y + d.y * Hh)); }
        const lw = l.el.textContent.length * 7 + 10, yy = placeDir(x, y, lw, 18); show = yy != null; if (show) y = yy; }
    } else if (view === 'pole' && l.lat <= -83.9) { const { X, Z } = llPS(l.lat, l.lon); const hy = hAt(X, Z); if (hy == null) { l.el.hidden = true; continue; }
      const p = scr(new THREE.Vector3(X, terrY(X, Z) + (l.kind === 'mission' ? 9 : 2), Z)); x = p.x + (l.kind === 'mission' ? 10 : 9); y = p.y - (l.kind === 'crater' ? 6 : 9);
      const dist = cam.position.distanceTo(new THREE.Vector3(X, 0, Z)); const w = l.text.length * (l.kind === 'crater' ? 6.2 : 6.8) + 8;
      show = p.z < 1 && x > -w && x < W && y > 0 && y < Hh && dist < 1400 && (l.kind !== 'crater' || dist < 600) && free(x, y, w, 16);
    } else if (view === 'globe' && l.kind === 'mission' && l.lat != null) { const w3 = globe.localToWorld(llGlobe(l.lat, l.lon, 1.01)); const facing = w3.clone().normalize().dot(cam.position.clone().sub(w3).normalize()) > 0.15;
      const p = scr(w3); x = p.x + 10; y = p.y - 9; show = facing && p.z < 1 && free(x, y, l.text.length * 6.8 + 8, 16); }
    l.el.hidden = !show; if (show) l.el.style.transform = `translate(${x | 0}px,${y | 0}px)`;
  }
  // scale bar + pole / Earth-side indicator (pole view only)
  mapui.classList.toggle('off', view !== 'pole'); if (view !== 'pole') return;
  const t = ctl.target, right = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 0).setY(0).normalize();
  const a = scr(t), b = scr(t.clone().add(right.multiplyScalar(10))), kmpx = 10 / Math.max(1e-3, Math.hypot(b.x - a.x, b.y - a.y));
  const nice = [1, 2, 5, 10, 20, 50, 100].find(k => k / kmpx >= 60) || 100; const sb = mapui.querySelector('.scalebar'); sb.querySelector('i').style.width = Math.round(nice / kmpx) + 'px'; sb.querySelector('span').textContent = nice + ' km' + (kmpx > 0 ? '' : '');
  const ang = (to) => { const q = scr(to); return Math.atan2(q.x - a.x, -(q.y - a.y)) * 180 / Math.PI; };
  const dPole = Math.hypot(t.x, t.z); const toPole = dPole < 3 ? null : ang(new THREE.Vector3(0, t.y, 0).lerp(t, Math.max(0, 1 - 8 / dPole)));
  const cp = mapui.querySelector('.cp'); cp.style.display = toPole == null ? 'none' : ''; if (toPole != null) cp.setAttribute('transform', `rotate(${toPole.toFixed(1)})`);
  mapui.querySelector('.ce').setAttribute('transform', `rotate(${ang(t.clone().add(new THREE.Vector3(0, 0, -8))).toFixed(1)})`);
}
export { setInsets, setLayer, setPickMarker, init, setView, setTime, focusSite, focusLL, overview, pickPoint, on, setQuality, setExaggeration, debug, setLabels };
