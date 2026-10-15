---
name: import-floorplan
description: Convert a floor plan (photo, sketch, screenshot or PDF with measurements) into a saved Home Explorer layout under layouts/<id>/ and register it in layouts/index.json. Use when the user provides a floor plan or room measurements, or asks to add, update or re-generate a layout.
---

# Import a floor plan into Home Explorer

Turn a floor plan image or PDF into `layouts/<id>/layout.json`, register it, and validate it.

## 1. Gather inputs

- Source files are usually in `plans/` (any image or PDF). Read every page or image with the Read tool.
- Layout **id**: short kebab-case (`office`, `home`, `grandma-house`). Use the user's name for it if given; otherwise derive one and tell them.
- If `layouts/<id>/` already exists, this is an **update**: keep the existing furniture and colors unless asked otherwise, and re-check them against the new walls.
- If a measurement is unreadable or rooms clearly can't fit together, ask the user rather than inventing numbers. Small inconsistencies (< ~0.3 m) you can resolve yourself; record them in `notes`.

## 2. Coordinate system and units

- Units are **meters**. Convert feet/inches: 1 ft = 0.3048 m, 1 in = 0.0254 m. Round to 0.05 m.
- `x` grows to the right (east) and `z` grows downward (south), exactly as the drawing looks on screen. Top of the image = north.
- Origin (0, 0) = top-left corner of the bounding box of all rooms.

## 3. Rooms

- Each room is one rectangle `"rect": [x0, z0, x1, z1]`, or several for L/T shapes: `"rects": [[...], [...]]`. Rectangles of one room must touch along edges, not overlap.
- **Rooms tile the floor plan.** Neighbouring rooms must share the exact same coordinate on their common wall. Walls are generated on room edges (0.15 m thick, centred on the edge), so measurements go wall-centre to wall-centre. Add roughly 0.1 m per wall to inside measurements from the Measure app.
- Hallways, corridors and entry areas are rooms too. Give them names ("Hallway", "Entry"), otherwise there are gaps.
- Work out the overall outer size first, then place rooms row by row. Check that the sums of room widths match the outer dimensions.
- Outdoor areas (yard, patio, balcony, driveway, sidewalk) get `"outdoor": true`. Their edges become a fence, except where they touch a house wall or **another outdoor area** (a lawn next to a driveway stays open).
- A fence that isn't on an outdoor area's outer edge (e.g. a backyard fence between the house and the side fence) goes in `"fences": [{ "from": [x, z], "to": [x, z] }]`. Gates in it are ordinary doors placed on that line.
- If the drawing includes the surrounding lot (yards, driveway, sidewalk), model it. Tile the whole lot with outdoor rectangles so there are no gaps, and close it with the outer fence.
- Diagonal or curved walls: approximate with rectangles and mention it in `notes`.
- Floors: `floor` = a pastel kid-friendly hex color; `pattern` is one of `wood`, `tile`, `carpet`, `concrete`, `grass`.
  - Suggested: bedrooms carpet (pink / lavender / peach), bathrooms and kitchen tile (light blue / yellow), living areas and hallways wood, garage concrete, outdoor grass, offices carpet (soft blue / green / grey).

## 4. Doors and openings

- `{ "at": [x, z], "width": w }`. `at` is the centre of the opening, **exactly on** a shared wall line (x or z equals a room edge).
- Width defaults: interior door 0.9, double door 1.5, opening without a door = its real width. Openings ≥ 2.5 m are drawn open-plan, with no lintel.
- Every room must be reachable from the spawn point.
- Do **not** put doors in outer walls unless they lead to an `outdoor` room. The player is 0.5 m wide, so every path needs a clear gap of at least ~0.65 m between wall faces. Otherwise the player can walk out into the void and the validator fails. Leave out the front door.

## 4b. Windows

- `{ "at": [x, z], "width": w }` with optional `sill` and `top` (meters above the floor, defaults 0.9 and 2.1). Like doors, `at` must be **exactly on** a wall line.
- They are holes in the wall with a white frame. You can see through them but not walk through.
- Bathrooms usually get `"sill": 1.2`. Place each window centred where the sketch draws it along its wall. Use the labelled width.

## 5. Furniture (optional, only what the plan or user shows)

`{ "type": ..., "at": [x, z], "rot": degrees, "size": [w, d], "color": "#hex" }`. Items face +z (south) at rot 0; rot 90 faces east, 180 north, -90 west. With rot ±90 the footprint swaps width and depth.

| type | default size [w, d] | notes |
|---|---|---|
| bed | [1.6, 2.1] | headboard at the back (-z) |
| sofa | [2.2, 0.9] | |
| coffeeTable | [1.1, 0.6] | |
| table | [1.8, 0.9] | dining/meeting table |
| chair | [0.5, 0.5] | |
| desk | [1.2, 0.6] | |
| bookshelf | [0.9, 0.35] | `height` (default 1.8) |
| counter | [2, 0.65] | kitchen counter / island (set size) |
| fridge | [0.8, 0.75] | |
| tub / toilet / sink | [1.7, 0.8] / [0.45, 0.7] / [0.9, 0.55] | |
| tv | [1.4, 0.45] | on a stand |
| whiteboard | [1.8, 0.05] | wall-mounted, no collision |
| plant / toyBox | [0.5, 0.5] / [0.8, 0.5] | |
| car / tree / slide | [1.9, 4.4] / [0.5, 0.5] / [0.8, 3.0] | |
| suv | [1.92, 4.75] | white Tesla Model Y style, nose faces +z |
| piano | [1.5, 0.6] | upright, keys face +z |
| trampoline | [3.4, 3.4] | round, solid |
| tree | [0.5, 0.5] | `kind: "pine"` for evergreens, `fruit: "#hex"` for fruit trees |
| rug / ball | walk-over | rug uses `radius` |
| mat | walk-over | flat rectangle, `size` + `color`: exercise mat, gravel, lawn or concrete patch |
| flowers | walk-over | flower bed, `size` |
| box | [1, 1] | anything else: set `size`, `height`, `color` |

Each type has a standing height (`TOPS` in `src/furniture.js`). Items under ~1 m can be jumped onto. If you add a new type, add its top there too.

Keep footprints at least 0.1 m inside the room edge, so they don't poke into the 0.15 m walls, and don't block doors.

## 6. Write the layout

For anything bigger than a couple of rooms, write a small `layouts/<id>/generate.py`. Keep the measurements in the plan's own units (feet) as named wall-line constants, and generate rooms, doors and furniture from them. That way shared walls use the exact same numbers, and a corrected measurement is a one-line change. See `layouts/home/generate.py`. It also checks for furniture overlaps. Then render a quick top-down picture of the result with PIL and compare it to the source plan before reporting.


`layouts/<id>/layout.json`:

```json
{
  "name": "Office",
  "units": "meters. x grows to the east, z grows to the south. rect = [x0, z0, x1, z1]",
  "source": "source.jpg",
  "notes": "Assumptions and reconciled measurements go here.",
  "wallHeight": 2.6,
  "spawn": { "at": [x, z], "facing": "north" },
  "rooms": [],
  "doors": [],
  "windows": [],
  "furniture": []
}
```

- Copy the original plan into the layout folder as `source.<ext>` (multiple files: `source-1.jpg`, ...) and list it in `source`.
- Spawn in a main room, in open space, facing `north` / `south` / `east` / `west`.
- Add or update the entry in `layouts/index.json`: `{ "id": "<id>", "name": "<name>", "created": "YYYY-MM-DD" }`. Keep existing entries. The top-level `"default"` is the layout new visitors see first; only change it if the user asks.

## 7. Validate (required)

```bash
node tools/validate-layout.mjs layouts/<id>/layout.json
```

Fix every ✗ error. Fix ⚠ warnings unless there is a reason not to. Re-run until it passes.

## 8. Report to the user

- A table of rooms with sizes (m² and sq ft, from the validator) and the indoor total, so they can sanity-check against reality.
- Every assumption you made: guessed door positions, reconciled measurements, approximated shapes.
- How to open it: the 🏠 picker in the game, or `http://<mac-ip>:5173/?layout=<id>`.
