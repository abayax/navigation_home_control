#!/usr/bin/env python3
"""Generates layout.json for the Jollyman Park all-inclusive playground (Cupertino)
from the concept sign photo in plans/floorplan_jollyman_park/playground_concept_map.png.

The sign has no measurements: the playground is assumed to be ~70 x 55 m (about an
acre) and positions are traced from the sign's pixels with P(px, py). A 14 m strip
of park lawn surrounds it. To adjust: change W/D (overall size) or any P() point,
then run
    python3 layouts/jollyman-park/generate.py && node tools/validate-layout.mjs layouts/jollyman-park/layout.json
"""
import json, math, random
from pathlib import Path

random.seed(7)  # same trees every time

W, D = 70.0, 55.0          # playground size (m)
M = 14.0                   # park lawn margin around it (m)
PX0, PX1, PY0, PY1 = 50, 690, 95, 545   # playground extent on the sign (pixels)

def P(px, py):
    """Sign pixel -> world metres."""
    return [round(M + (px - PX0) / (PX1 - PX0) * W, 2), round(M + (py - PY0) / (PY1 - PY0) * D, 2)]

def L(x, z):
    """Playground-local metres -> world metres."""
    return [round(M + x, 2), round(M + z, 2)]

def R(x0, z0, x1, z1):
    return [round(M + x0, 2), round(M + z0, 2), round(M + x1, 2), round(M + z1, 2)]

N = 23.8   # where the north zones end (sign y ~290)
rooms = [
    dict(name="Nest Swings",      rect=R(0, 0, 18, N),     floor="#9ad18b", pattern="rubber"),
    dict(name="Climber",          rect=R(18, 0, 37.1, N),  floor="#7cc95f", pattern="rubber"),
    dict(name="Slide Mountain",   rect=R(37.1, 0, 56.7, N), floor="#8bd16a", pattern="grass"),
    dict(name="Garden", rects=[R(56.7, 0, W, 2.5), R(56.7, 6.5, W, N), R(56.7, 2.5, 59, 6.5), R(66, 2.5, W, 6.5)],
         floor="#8bd16a", pattern="grass"),
    dict(name="Sand Play",        rect=R(0, N, 18, D),     floor="#a9d98f", pattern="grass"),
    dict(name="Forest House",     rect=R(18, N, 35, D),    floor="#9ad18b", pattern="rubber"),
    dict(name="Gathering Area",   rect=R(35, N, 47, 39),   floor="#e3cfa8", pattern="rubber"),
    dict(name="Spinner",          rect=R(47, N, 57, 39),   floor="#a8dcc8", pattern="rubber"),
    dict(name="Picnic",           rect=R(57, N, W, 39),    floor="#d8d2c0", pattern="concrete"),
    dict(name="Swings",           rect=R(35, 39, 55, D),   floor="#a8dcc8", pattern="rubber"),
    dict(name="Big Kids Lawn",    rect=R(55, 39, W, D),    floor="#8bd16a", pattern="grass"),
    dict(name="Park", rects=[[0, 0, W + 2 * M, M], [0, M + D, W + 2 * M, D + 2 * M],
                             [0, M, M, M + D], [M + W, M, W + 2 * M, M + D]],
         floor="#7cc45f", pattern="grass"),
]
for r in rooms:
    r["outdoor"] = True
# Restroom: a single-story building with two separate bathrooms, doors facing the playground
rooms += [
    dict(name="Restroom 1", rect=R(59, 2.5, 62.5, 6.5), floor="#d9e2ec", pattern="tile"),
    dict(name="Restroom 2", rect=R(62.5, 2.5, 66, 6.5), floor="#d9e2ec", pattern="tile"),
]

# Fence around the playground, with three entrance gates
corners = [L(0, 0), L(W, 0), L(W, D), L(0, D)]
fences = [{"from": corners[i], "to": corners[(i + 1) % 4]} for i in range(4)]
west_gate, east_gate, north_gate = P(PX0, 262), P(PX1, 215), P(515, PY0)
doors = [
    {"at": [M, west_gate[1]], "width": 3},
    {"at": [M + W, east_gate[1]], "width": 3},
    {"at": [north_gate[0], M], "width": 3},
    {"at": L(60.75, 6.5), "width": 0.95},   # restroom 1
    {"at": L(64.25, 6.5), "width": 0.95},   # restroom 2
]

paths = [
    # main path, west gate -> east gate, curving through the middle (sign's white band)
    dict(points=[[M - 6, west_gate[1]], P(50, 262), P(130, 290), P(230, 312), P(340, 322), P(420, 315),
                 P(480, 295), P(545, 250), P(600, 225), P(690, 215), [M + W + 6, east_gate[1]]], width=2.6),
    # loop around the climber up to slide mountain
    dict(points=[P(210, 300), P(215, 240), P(235, 175), P(280, 155), P(350, 148), L(35.4, 8.6), L(36.0, 11.2)], width=2.2),
    # north path toward the parking lot
    dict(points=[[north_gate[0], M - 6], P(515, 95), L(52, 2.6), L(52.6, 9), L(53.6, 15.5), P(545, 250)], width=2.2),
    # from the main path up to the restroom doors
    dict(points=[L(62.5, 15.4), L(62.5, 11), L(62.5, 8.2)], width=2.0),
    # little paths to the swings and the forest house
    dict(points=[L(44.5, 27), L(45.2, 33), L(46.2, 38.5)], width=1.6),
    dict(points=[L(24, 27.2), L(26, 30.5), L(26.7, 33.2)], width=1.6),
    # ring around the gathering area
    dict(points=[L(40.5 + 4.6 * math.cos(a), 31 + 4.6 * math.sin(a)) for a in [i * math.pi / 4 for i in range(8)]],
         width=1.4, color="#d9c49c", closed=True),
    # walking loop around the playground in the park
    dict(points=[L(-7, -7), L(W / 2, -8), L(W + 7, -7), L(W + 8, D / 2), L(W + 7, D + 7), L(W / 2, D + 8),
                 L(-7, D + 7), L(-8, D / 2)], width=2.4, closed=True),
]

furniture = []
def add(type, at, **kw):
    furniture.append({"type": type, "at": at, **kw})

# Coloured ground patches (walk over them)
add("rug", P(140, 190), radius=5.2, color="#7fd1c7")    # nest swing pad
add("rug", P(118, 378), radius=6.0, color="#ecd6a4")    # sand pit
add("rug", P(545, 340), radius=4.6, color="#7fd1c7")    # spinner pad
add("rug", P(475, 450), radius=6.2, color="#7fd1c7")    # swings pad
add("rug", P(295, 385), radius=4.8, color="#b7e4a0")    # forest house clearing
add("rug", L(40.5, 31), radius=3.6, color="#cdb68e")    # gathering circle

# Equipment, traced from the sign
add("nestSwing", P(140, 190), size=[6, 2.4])
add("ropeClimber", P(280, 245), size=[6, 6], height=4.5)
add("slideMountain", P(455, 190), size=[16, 17], height=2.2)
add("playHouse", P(295, 385), rot=180, size=[3.2, 2.8])
add("spinner", P(545, 340), radius=1.3)
add("swingSet", L(49.6, 42.6), size=[4.4, 1.8], seats=["adaptive", "adaptive"])   # next to the spinner
add("swingSet", L(43.0, 47.6), size=[6, 1.8], seats=["belt", "belt", "bucket"])

# Restroom fixtures: toilet, sink and diaper station in each bathroom; fountain out front
add("toilet", L(59.55, 3.45), rot=90)
add("sink", L(62.05, 3.45), rot=-90)
add("diaperStation", L(60.9, 2.95))
add("toilet", L(65.45, 3.45), rot=-90)
add("sink", L(62.95, 3.45), rot=90)
add("diaperStation", L(64.1, 2.95))
add("fountain", L(62.5, 7.25))                  # between the two restroom doors
add("fountain", L(1.2, 23.2), rot=90)           # by the west entrance, between Sand Play and Nest Swings
add("table", L(11, 31), size=[1.6, 0.8], color="#e9c46a")   # raised sand table (wheelchair height)

# Picnic tables with benches
for x, z in [(60, 27.2), (65.5, 27.6), (62.5, 33.5)]:
    add("picnicTable", L(x, z), size=[1.8, 0.8])
    add("bench", L(x, z - 0.75), size=[1.8, 0.4])
    add("bench", L(x, z + 0.75), size=[1.8, 0.4], rot=180)

# Benches for grown-ups
add("bench", L(36.4, 31), rot=90)
add("bench", L(44.6, 31), rot=-90)
add("bench", L(40.5, 36.6), rot=180)
add("bench", L(13.8, 39), rot=-90)
add("bench", L(31, 25.4))
add("bench", L(52, 41), rot=180)

# Boulders to climb on
for (x, z), h, sz in [((37.6, 27.9), 0.5, [1.2, 1.0]), ((43.2, 34.4), 0.45, [1.0, 0.9]), ((21, 22), 0.6, [1.4, 1.1]),
                      ((31, 21.5), 0.55, [1.2, 1.2]), ((3.5, 27), 0.5, [1.1, 0.9]), ((15.6, 45), 0.5, [1.3, 1.0])]:
    add("boulder", L(x, z), height=h, size=sz)

# Big white pebble stones (seats) around the spinner and swings
for (x, z), h, sz in [((50.6, 34.6), 0.45, [1.4, 0.9]), ((51.2, 37.6), 0.4, [1.1, 0.8]), ((46.4, 40.4), 0.45, [1.3, 0.9]),
                      ((40.8, 41.6), 0.42, [1.2, 0.85]), ((55.6, 33.2), 0.4, [1.0, 0.8])]:
    add("boulder", L(x, z), height=h, size=sz, color="#e9e6dd")

# Trees inside the playground (shade around the edges)
for x, z in [(3, 3), (16, 3.5), (34, 2.5), (58, 4), (63.5, 9), (67, 21), (2.5, 46), (14, 52), (31, 51),
             (57, 52), (66.5, 46), (67, 36.5), (20.5, 30), (35.6, 21.5), (3, 16)]:
    add("tree", L(x, z))

# Park trees: a loose ring outside the fence, avoiding the gates and the walking loop
def ring(offset, step):
    pts = []
    x0, z0, x1, z1 = -offset, -offset, W + offset, D + offset
    per = 2 * (x1 - x0) + 2 * (z1 - z0)
    t = 0.0
    while t < per:
        if t < x1 - x0: x, z = x0 + t, z0
        elif t < (x1 - x0) + (z1 - z0): x, z = x1, z0 + t - (x1 - x0)
        elif t < 2 * (x1 - x0) + (z1 - z0): x, z = x1 - (t - (x1 - x0) - (z1 - z0)), z1
        else: x, z = x0, z1 - (t - 2 * (x1 - x0) - (z1 - z0))
        pts.append((x + random.uniform(-1, 1), z + random.uniform(-1, 1)))
        t += step * random.uniform(0.8, 1.25)
    return pts

gates_local = [(0, west_gate[1] - M), (W, east_gate[1] - M), (north_gate[0] - M, 0)]
for x, z in ring(3.2, 7) + ring(11, 8):
    if any(math.hypot(x - gx, z - gz) < 6 for gx, gz in gates_local):
        continue
    kind = "pine" if random.random() < 0.35 else "round"
    add("tree", L(x, z), **({"kind": "pine"} if kind == "pine" else {}))

layout = {
    "name": "Jollyman Park Playground",
    "units": "meters. x grows to the east, z grows to the south. rect = [x0, z0, x1, z1]",
    "source": "source.png",
    "notes": ("Traced from the playground's concept sign (no measurements). Assumed ~70 x 55 m (about an acre) with a 14 m "
              "strip of park lawn around it. Zones are rectangles approximating the sign's curved areas; the white paths "
              "are smooth curves through traced points. Parking lot left out. Restroom: two 3.5 x 4 m bathrooms (toilet, sink, diaper station) with "
              "a fountain between the doors; second fountain by the west entrance. Slide Mountain from photos: 2.2 m hill "
              "with a grass slope (front), big stone steps (east, facing the restroom), three slides (west), a raised "
              "'5-12' deck behind at the same height, and shade sails. Forest House: A-frame on a 1.2 m deck with stairs "
              "and a double slide. Globe spinner; swing set by the spinner has two adaptive seats."),
    "spawn": {"at": L(33, 28.5), "facing": "north"},
    "exteriorWall": "#c7c9c4",
    "rooms": rooms,
    "doors": doors,
    "fences": fences,
    "paths": paths,
    "furniture": furniture,
}
out = Path(__file__).with_name("layout.json")
out.write_text(json.dumps(layout, indent=2))
print(f"wrote {out} ({len(furniture)} items)")
