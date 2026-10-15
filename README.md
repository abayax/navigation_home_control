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
| Walk forward | ↑ (or W), hold | ▲ button, hold |
| Walk back toward the camera (see her face) | ↓ (or S), hold | ▼ button, hold |
| Turn 90° left / right | ← / → (or A / D), one tap = 90° | ↰ / ↱ buttons |
| Walk + steer smoothly | drag on the view with the mouse | drag on the view like a joystick: up = forward, down = back, left/right = steer |
| Jump | Space | ⤒ button |
| Get on / off the bike (stand next to it) | Space | ⤒ button |
| Climb a tree / climb down (stand next to it) | Space | ⤒ button |
| Run (2.6× faster) | double-tap ↑ and hold (or hold Shift) | double-tap ▲ and hold, or tap the view then drag |
| Map view (top-down overview) | M | 🗺️ button or tap the minimap |
| Switch layout | 🏠 button | 🏠 button |

Jumping: the kid jumps about 1 m and can land on beds, couches, chairs, tables, desks, counters and benches. Walk off the edge to get down. Taller things (fridge, bookshelves, TV, cars, trees) are out of reach, and walls and fences always block. The trampoline keeps bouncing; jump while bouncing to go much higher.

Bike: the green bike starts in the garage. Stand next to it and jump to ride (faster than walking); jump again to get off, and it stays where you left it. Bikes only go in outdoor areas and rooms marked `"allowBike": true` (the garage); they stop at doors into the house.

## Family (Mom and Dad)

Mom and Dad walk around the whole place on their own: rooms, backyard, front yard, driveway. Every so often each picks something to do: sit on a chair, couch, bed or bench; stand at the kitchen counter, fridge, sink, a bookshelf or in front of the TV; sit in the car (you can see them through the window); or wander somewhere and pause. They show up as coloured dots on the minimap.

When the kid gets close (about 2 m, not through a wall), a speech bubble pops up with something they say. Stay close and they say something new every few seconds.

**Changing what they say:** edit `npcs/mom.txt` or `npcs/dad.txt`, one phrase per line (lines starting with `#` are comments), then push. The game reads these files fresh every time it loads (GitHub Pages may take up to ~10 minutes to serve the new version). Their look (colours, height, hair, glasses) is in `npcs/npcs.json`; add another entry there with its own phrase file to add another family member.

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
| `src/input.js` | Keyboard, touch buttons, drag-to-walk joystick |
| `src/collision.js` | Solid walls and furniture, keeps the camera inside rooms |
| `src/physics.js` | Jumping, gravity, landing on furniture, trampoline bounces |
| `src/person.js` | The kid and the adults (shared cartoon person model, walking/sitting/jumping poses) |
| `src/npc.js` | Mom and Dad: choosing what to do, walking, sitting, the car, speech bubbles |
| `src/nav.js` | Walkable grid + A* path finding used by the NPCs |
| `npcs/npcs.json` | Who the NPCs are and what they look like |
| `npcs/*.txt` | What each NPC says (one phrase per line) |
| `src/hud.js` | Room-name badge and minimap |

## Layouts

Each floor plan becomes its own layout and is saved locally. New visitors start in the `default` layout from `layouts/index.json` (currently **Home**). After that, the game remembers the last one each device used. You can also open a specific one directly with `?layout=<id>`, e.g. `http://localhost:5173/?layout=office`.

**Adding a new layout:**
1. Put the floor plan (photo, sketch, screenshot or PDF, with measurements) in `plans/`.
2. Ask Claude: *"import plans/office.jpg as office"* (or run `/import-floorplan`).
3. Claude writes `layouts/office/layout.json`, adds it to `layouts/index.json`, and runs the validator.
4. Reload the game. The new layout is in the 🏠 picker.

Check all layouts (and the NPC files) any time with `node tools/validate-layout.mjs`.

**Measuring with the iOS Measure app:**
- Sketch the floor plan on paper (or in Notes), roughly to shape. Boxes for rooms are fine.
- Measure each room wall to wall (length and width) and write the numbers on the sketch.
- For each door or opening: its width, and its distance from the nearest corner.
- Mark which way is the top of the page, and write the unit (ft or m).
- Take a clear, straight-on photo of the sketch.

### `layout.json` format

Units are **meters**. `x` grows to the east, `z` grows to the south. The top-left corner of the house is (0, 0).

- `rooms[]`: `rect: [x0, z0, x1, z1]` (or `rects: [[...], [...]]` for L-shaped rooms), `floor` color, `pattern` (`wood`, `tile`, `carpet`, `concrete`, `grass`). Add `"outdoor": true` for yards, which get a fence instead of walls, and `"allowBike": true` for indoor rooms where the bike may go (e.g. a garage).
- Walls are painted per room: each side gets a light tint of that room's floor colour (or set `"wall": "#hex"` on a room), with a white baseboard. `"exteriorWall": "#hex"` at the top level sets the outside colour.
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
