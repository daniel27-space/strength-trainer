# Lunar Landing Site Navigator, practice: v3 changes

v3 starts from v2. It covers the review items Daniel accepted. v2 itself was not modified.
Status: **done** / **partial** / **skipped**.

| # | Item | Status | Notes |
|---|------|--------|-------|
| 1 | One honest terrain-masked number per metric, on the time-bar window | done | Sunlit / Earth in view / Both are terrain-masked and cover the selected window. They are always ≤100% and ≤ window hours ("594 of 1440 h"). The flat-horizon figure appears only as a small secondary line. Griffin "57% w/o green" is gone (now 34 / 12 / 0 % over 60 d). BG1 "1443 h" is now "1440 of 1440 h", with a flat-horizon label because it is outside the terrain patch. "Real calc not loaded yet" is gone: named pins load synchronously, and other spots show "computing…" until the grid arrives. |
| 2 | Full-year ephemeris + correct day labels + truncation warning | done | ephem.json covers 14 Nov 2026 → 14 Nov 2027 (2921 × 3 h samples). Windows can be 30/60/90/180/365 d. A window past the data end gets a visible warning with the real length; there is no silent clamp. |
| 3 | Masks -5…+8.75° or more; 360 azimuths for pins | done | Mask encoding covers -5…+13.25°. Named pins use 360 azimuths; grid cells use 64. |
| 4 | "LOLA grid cell , 0 km" template, Shackleton fallback label, lower-bound flag | done | The quality line now names the source: pin, grid cell (cell size and offset in m), or flat. The example is "Shackleton rim (example)". "≥" (lower bound) appears only when the longest dark run touches a window edge. |
| 5 | 11 CLPS + 2 non-CLPS; dates; IM-1 source | done | Missions tab: "11 NASA CLPS missions + 2 non-CLPS landers (ispace)". Awards started Nov 2018; landings began 2024. IM-1 cites the NASA LRO article, with an uncertainty note. |
| 6 | Draper CP-12 and Cabeus B caveats | done | Shown on the result card. |
| 7 | Honest validation panel + toned-down copy | done | Method tab: 4-point table with published / v3 / diff / v2 columns. The v2 2 m failure (62.2 vs 88) and its cause are in a warning box; known gaps are listed, including CR-C1 -12 unexplained and only 4 points. The overclaiming phrases were removed or reworded. |
| 8 | Horizon panorama / sky chart as main result | done | "Sky from this spot" shows the skyline, Sun and Earth tracks for the window, lit/visible dot shading, ringed "now" markers and a caption. |
| 9 | Site × date calendar | done | Compare tab: each row is a site, each column a day, coloured Sun+Earth / Sun / Earth / neither. Tapping a cell selects that site and moves the time bar. The time bar follows the window start/length. |
| 10 | Plain-language result card first + glossary | done | The result card (a sentence plus 3 tiles) is the first thing in the Site tab. On a 390×844 phone it is above the fold. The glossary is on the Site and Method tabs. |
| 11 | Challenge-first landing | done | Title "Lunar Landing Site Navigator, practice". Opens on the labelled south-pole view with a single "Pick a site" CTA and region chips. Missions are a context layer and tab. |
| 12 | Map styling | done | Distinct Sun/Earth sprites and labels. The marker palette avoids the result colours. Legend (Key) includes "no terrain data". Scale bar, pole arrow and Earth-side indicator added. |
| 13 | Chart axes | done | Date ticks, 0° line, elevation scale and labelled shading on the timeline and sky charts. |
| 14 | Normalised weights; date-sorted windows with year | done | Each slider shows its normalised share (%). Windows are sorted by date as "21 Nov 2026 …", with the best one flagged. |
| 15 | Heatmap smoothing / cell size; shadow AA | done | The heatmap is smoothed and its legend states the cell size (2.9 km, 1 km near pole). Shadow edges use a smoothstep penumbra (Sun disc 0.27°). |
| 16 | Tour fixes | done | Panel opacity dimming removed; only pointer events are blocked. Each step frames its subject. View, selection, tab, time, speed, window and scroll are restored afterwards (verified). Escape or "Stop tour" ends it. |
| 17 | Phone | done | App name in the header ("Site Navigator" under 700 px). The result shows in the half sheet after a pick. Touch targets are 44 px; inline "src" chips have an enlarged hit area. Added favicon.svg, meta description and OG/Twitter tags using og.png (1200×630). |
| 18 | ⌖ → SVG; shrink assets | done | Inline SVG icons. pole_height.png 1.64 MB → pole_height.webp 0.96 MB. plan_horizon.json is now metadata only, with masks in plan_horizon.png (0.76 MB). |

## Numbers: v2 → v3

| Item | v2 | v3 |
|---|---|---|
| Blue Ghost 1, Earth hours | "1443 h" (more than the window) | 1440 of 1440 h, labelled flat-horizon (outside terrain patch) |
| Griffin, 60 d from 14 Nov 2026 | "57% w/o green", mixed sources | lit 34%, Earth 12%, both 0% (terrain); flat-horizon 59 / 67 shown as secondary |
| IM-1, year | — | lit 39% terrain vs 51% flat |

Validation (20-yr average sunlight, published → v3, v2):

| Point | Published | v3 | v2 |
|---|---|---|---|
| CR-C1 | 89 | 76.8 (-12.2) | 84.7 |
| Gläser surface | 76 | 77.4 (+1.4) | 71.3 |
| C1, 2 m | 88 | 85.0 (-3.0) | 62.2 (fail) |
| Shackleton rim S | 86.7 | 85.8 (-0.9) | 86.8 |

## QA
Playwright runs at 390×844, 820×1180 and 1440×900 found no overlapping panels, no document overflow and 0 console errors. The only sub-44 px controls are inline citation chips, which have an enlarged hit area. Before/after pairs are in `shots-compare/` (`*_v2.jpg` / `*_v3.jpg`). Inline text links in the Method prose are normal text size.

## Post-review fixes (Opus review, one pass: 7/10)

- Guessed regions are marked "~" and footnoted in the compare table and calendar.
- Flat-horizon sites say "upper bound because no terrain data is loaded here" and compare against a "flat horizon".
- The glossary's flat-horizon entry now agrees with the peak note.
- The IM-1 "± est" date badge is now a normal source chip.
- The slope text says it is averaged over a ~2.9 km cell and is not the slope under a lander.
- The phone calendar groups days so cells stay tappable.
- The Sun and Earth direction labels avoid mission pins, region rings and the scale/compass. When the Sun or Earth icon would sit on a mission pin, the icon is hidden.
- All map labels avoid the scale bar and compass.
- The glossary is a collapsible ("Glossary: what the numbers mean"). It opens by default on the landing screen, so there is no empty heading.
- The heatmap select, Key button, table site links and clear buttons are 44 px.
- Spelling: Gläser.

Still open: the tour opening frames the terrain edge; globe clusters are unlabelled; the date input uses the browser locale format; Mons Mouton Plateau almost duplicates IM-2; the Cabeus B point may be off-peak.
