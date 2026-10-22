// Fallback planner (no terrain). Same signature as plan.js planLanding. Replaced automatically when data/plan.js exists.
import { sample } from './astro.js';
function hash(a, b) { const s = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453; return s - Math.floor(s); }
export function planLanding(lat, lon, startIso, weights = { sun: 1, comms: 1, slope: 1 }) {
  const s = sample(lat, lon, Date.parse(startIso), 60, 3), H = 3;
  const sunHours = s.filter(x => x.lit).length * H, earthHours = s.filter(x => x.ev).length * H;
  let longest = 0, run = 0; s.forEach(x => { run = x.lit ? 0 : run + H; longest = Math.max(longest, run); });
  const windows = []; let cur = null;
  s.forEach(x => { if (x.lit && x.ev) { if (!cur) cur = { start: x.t, end: x.t }; cur.end = x.t; } else if (cur) { windows.push(cur); cur = null; } });
  if (cur) windows.push(cur);
  windows.forEach(w => w.hours = (w.end - w.start) / 3600000 + H);
  windows.sort((a, b) => b.hours - a.hours);
  const slope = Math.abs(lat) > 84 ? 3 + 12 * hash(lat, lon) : 2 + 6 * hash(lat, lon);
  const tot = s.length * H, comp = { sun: sunHours / tot, comms: earthHours / tot, slope: Math.max(0, 1 - slope / 15) };
  const W = weights.sun + weights.comms + weights.slope || 1;
  const breakdown = { sun: comp.sun * weights.sun / W, comms: comp.comms * weights.comms / W, slope: comp.slope * weights.slope / W };
  return { windows: windows.slice(0, 3).map(w => ({ start: new Date(w.start).toISOString(), end: new Date(w.end).toISOString(), hours: w.hours })),
    sunHours, earthHours, longestNight: longest, score: breakdown.sun + breakdown.comms + breakdown.slope, breakdown,
    slope_deg: slope, mock: true, samples: s };
}
