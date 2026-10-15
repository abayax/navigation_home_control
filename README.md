# Home Explorer 🏠

A kid-friendly 3D game for walking around our home, in the browser.
Three.js loads from a CDN, so there's nothing to install.

## Play online

**https://abayax.github.io/navigation_home_control/**: works on any phone, tablet or computer. It's hosted on GitHub Pages from the `main` branch, so every push updates it within a few minutes.

## Run it locally

```bash
cd navigation_controls
python3 tools/serve.py
```

It opens the game in your default browser and prints the address for the iPad/iPhone. It also turns off browser caching, so a normal reload always picks up new code and layouts.

Options: `--layout office` opens straight into a layout, `--no-browser` just serves, `--port 8080` uses another port.

- On the Mac: http://localhost:5173
- On the iPad / iPhone (same Wi-Fi): http://<mac-ip>:5173. Find the Mac's IP with `ipconfig getifaddr en0`.
- Optional: in Safari, Share → **Add to Home Screen** to open it full-screen like an app.

## Controls

| Action | Keyboard | Touch |
|---|---|---|
| Walk forward / back | ↑ / ↓ (or W / S), hold | ▲ / ▼ buttons, hold |
| Turn 90° left / right | ← / → (or A / D), one tap = 90° | ↰ / ↱ buttons, or swipe left / right |
| Run | Shift | – |
| Map view | M | 🗺️ button or tap the minimap |
| Switch layout | 🏠 button | 🏠 button |

## Files

| File | What it does |
|---|---|
| `layouts/index.json` | List of saved layouts shown in the 🏠 picker |
| `layouts/<id>/layout.json` | One layout: rooms, doors, furniture (plus a copy of its source plan) |
| `plans/` | Drop new floor plan images / PDFs here |
| `tools/validate-layout.mjs` | Checks layouts: doors on walls, every room reachable, no gaps to the outside |
| `.claude/skills/import-floorplan/` | The steps Claude follows to turn a plan into a layout |
| `src/layouts.js` | Loads the chosen layout and builds the 🏠 picker |
| `src/house.js` | Builds floors, walls, door openings and the backyard fence from the JSON |
| `src/furniture.js` | Simple kid-style furniture (bed, sofa, car, tree, slide…) |
| `src/kid.js` | The character and its walking animation |
| `src/input.js` | Keyboard, touch buttons, swipes |
| `src/collision.js` | Solid walls and furniture, keeps the camera inside rooms |
| `src/hud.js` | Room-name badge and minimap |

## Layouts

Each floor plan becomes its own layout and is saved locally. New visitors start in the `default` layout from `layouts/index.json` (currently **Home**). After that, the game remembers the last one each device used. You can also open a specific one directly with `?layout=<id>`, e.g. `http://localhost:5173/?layout=office`.

**Adding a new layout:**
1. Put the floor plan (photo, sketch, screenshot or PDF, with measurements) in `plans/`.
2. Ask Claude: *"import plans/office.jpg as office"* (or run `/import-floorplan`).
3. Claude writes `layouts/office/layout.json`, adds it to `layouts/index.json`, and runs the validator.
4. Reload the game. The new layout is in the 🏠 picker.

Check all layouts any time with `node tools/validate-layout.mjs`.

**Measuring with the iOS Measure app:**
- Sketch the floor plan on paper (or in Notes), roughly to shape. Boxes for rooms are fine.
- Measure each room wall to wall (length and width) and write the numbers on the sketch.
- For each door or opening: its width, and its distance from the nearest corner.
- Mark which way is the top of the page, and write the unit (ft or m).
- Take a clear, straight-on photo of the sketch.

### `layout.json` format

Units are **meters**. `x` grows to the east, `z` grows to the south. The top-left corner of the house is (0, 0).

- `rooms[]`: `rect: [x0, z0, x1, z1]` (or `rects: [[...], [...]]` for L-shaped rooms), `floor` color, `pattern` (`wood`, `tile`, `carpet`, `concrete`, `grass`). Add `"outdoor": true` for yards, which get a fence instead of walls.
- `doors[]`: `at: [x, z]` is a point on the wall, plus `width`. Openings 2.5 m or wider are treated as open-plan, with no lintel above.
- `windows[]` (optional): `at: [x, z]` on a wall, `width`, optional `sill` / `top` heights in meters (default 0.9 / 2.1). Drawn as holes in the wall.
- `fences[]` (optional): extra fence lines `{ from: [x, z], to: [x, z] }`. Gates are doors on them. Outdoor areas that touch each other stay open.
- `furniture[]`: `type`, `at: [x, z]`, optional `rot` (degrees), `size: [w, d]`, `color`. Types are listed in `.claude/skills/import-floorplan/SKILL.md`.
- Big layouts can have a `generate.py` next to them that builds `layout.json` from the measurements (see `layouts/home/`).

## Plan

1. ✅ **Prototype.** Placeholder layout, kid character, keyboard and touch controls, solid walls, minimap, map view.
2. ✅ **Saved layouts.** Any floor plan can be imported as a layout and picked in the game.
3. ⏳ **Real layouts.** Office first, then the home (measured with the Measure app).
4. **Make it look like home.** Real furniture positions, wall and floor colors from photos, photo "posters" on walls.
5. **Game layer.** Missions like "Go to the kitchen!", collectible stars, sounds, a timer.
6. **Later.** Tap-to-walk with pathfinding, opening doors, glass in windows, optional real 3D scan meshes.

## Alternative: LiDAR scanning

If hand measuring gets tedious, a RoomPlan-based iPhone app (Polycam, magicplan, Canvas, 3D Scanner App) can draw the floor plan for you. Free tiers are limited, but a screenshot of the app's floor plan view with measurements is enough. Drop it in `plans/` like any other plan.
