#!/usr/bin/env python3
"""Generates layout.json for the "Home" layout from the measurements in plans/floorplan_home/home.png.

All wall positions below are in FEET (wall centre-lines; inside measurements + 0.4 ft per wall).
To fix a measurement: edit the number here, then run
    python3 layouts/home/generate.py && node tools/validate-layout.mjs layouts/home/layout.json
"""
import json, sys
from pathlib import Path
FT = 0.3048
r2 = lambda v: round(v * FT, 2)          # feet -> meters (0.01 m)
CLR = 0.175                               # furniture clearance from wall centre-line (m)

NOTES = "Draft hand sketch, measurements by the iOS Measure app (inside dimensions; +0.4 ft per wall added). Assumptions: (1) Bedroom 1 '11'30\"' read as 11'3\" for the part below Bathroom 1, which matches the drawing proportions and the overall house length. (2) Hallway beside the garage made 9'4\" instead of the labelled 7'1\", so the family-room door fits next to the front door. (3) Closet 3 depth 3'3\" (2'8\" from labels is too narrow to walk into); its sliding door is on the west side because the queen bed blocks the rest. Closet 2 size and the hallway widths taken from drawing proportions. (4) Family room labelled 15'5\" so its west wall sits 0.4 ft west of Bedroom 2's (drawing shows it slightly east). (5) Yard, front yard, driveway and sidewalk sizes come from drawing scale - no measurements given. (6) Windows are holes in the wall (sill 0.9 m, top 2.1 m; bathrooms sill 1.2 m), placed where the sketch draws them. The porch 'Window 3\'2\"' is drawn next to both the family room and garage walls, so both got one. Furniture uses standard sizes (queen 60x80\", twin 39x75\") placed where the sketch shows them."

# ---------- wall centre-lines in feet (from labels; +0.4 ft per wall for thickness) ----------
XF_L, X_FAMW, X0, X_B1W, X_H1, X_H2, X_K, X_LV, X_E, XF_R = -9.1, -0.42, 0, 3.75, 12.15, 15.4, 21.22, 26.55, 40.62, 51.1
YF_T, Y0, Y_C2, Y_B2, Y_B3, Y_C3, Y_BA2, Y_KT, Y_BA1, Y_KB, Y_FAMT, Y_FD, Y_FB, Y_GB, Y_FAMB, Y_FY, Y_SW = \
    -34.7, 0, 5.3, 10.4, 10.75, 14.0, 16.8, 17.8, 21.62, 27.87, 33.27, 37.2, 47.8, 51.27, 52.17, 86.6, 93.8

R = lambda x0, z0, x1, z1: [r2(x0), r2(z0), r2(x1), r2(z1)]
rooms = [
  dict(name="Bedroom 2 (Kid's)", rect=R(X0, Y0, X_H1, Y_B2), floor="#ffc8dd", pattern="carpet"),
  dict(name="Closet 2", rect=R(X_H1, Y0, X_H2, Y_C2), floor="#e2cfea", pattern="carpet"),
  dict(name="Bathroom 2", rect=R(X0, Y_B2, X_H1, Y_BA2), floor="#bde0fe", pattern="tile"),
  dict(name="Bedroom 3 (Women's)", rect=R(X_H2, Y0, X_LV, Y_B3), floor="#ffd6a5", pattern="carpet"),
  dict(name="Closet 3", rect=R(X_H2, Y_B3, X_LV, Y_C3), floor="#f8e1c4", pattern="carpet"),
  dict(name="Living Room", rect=R(X_LV, Y0, X_E, Y_KT), floor="#e0b98a", pattern="wood"),
  dict(name="Hallway", rects=[R(X_H1, Y_C2, X_H2, Y_BA2), R(X_H2, Y_C3, X_LV, Y_KT), R(X_H2, Y_KT, X_K, Y_FD)], floor="#e9c46a", pattern="wood"),
  dict(name="Kitchen", rect=R(X_K, Y_KT, X_E, Y_KB), floor="#fdffb6", pattern="tile"),
  dict(name="Garage", rect=R(X_K, Y_KB, X_E, Y_GB), floor="#c9ccd1", pattern="concrete", allowBike=True),
  dict(name="Bathroom 1", rect=R(X_B1W, Y_BA2, X_H1, Y_BA1), floor="#a2d2ff", pattern="tile"),
  dict(name="Bedroom 1 (Men's)", rects=[R(X_B1W, Y_BA1, X_H2, Y_FAMT), R(X_H1, Y_BA2, X_H2, Y_BA1)], floor="#cdb4db", pattern="carpet"),
  dict(name="Family Room", rect=R(X_FAMW, Y_FAMT, X_H2, Y_FAMB), floor="#d4a373", pattern="wood"),
  dict(name="Backyard", outdoor=True, floor="#8bd16a", pattern="grass", rects=[
      R(XF_L, YF_T, XF_R, Y0), R(XF_L, Y0, X0, Y_BA2), R(XF_L, Y_BA2, X_B1W, Y_FAMT),
      R(XF_L, Y_FAMT, X_FAMW, Y_FB), R(X_E, Y0, XF_R, Y_FB)]),
  dict(name="Front Yard", outdoor=True, floor="#8bd16a", pattern="grass", rects=[
      R(XF_L, Y_FB, X_FAMW, Y_FAMB), R(XF_L, Y_FAMB, X_K, Y_FY), R(X_H2, Y_FD, X_K, Y_FAMB), R(X_E, Y_FB, XF_R, Y_FY)]),
  dict(name="Driveway", outdoor=True, rect=R(X_K, Y_GB, X_E, Y_FY), floor="#d6d3cc", pattern="concrete"),
  dict(name="Sidewalk", outdoor=True, rect=R(XF_L, Y_FY, XF_R, Y_SW), floor="#e5e5e5", pattern="concrete"),
]
D = lambda x, z, w: dict(at=[r2(x), r2(z)], width=r2(w))
doors = [
  D(X_H1, 7.7, 3),      # Bedroom 2 -> hallway
  D(X_H1, 2.65, 3),     # Bedroom 2 -> its closet
  D(X_H1, 12.6, 3),     # Bathroom 2 -> hallway
  D(X_H2, 8.3, 3),      # Bedroom 3 -> hallway
  D(18.4, Y_B3, 5),     # Bedroom 3 -> closet (sliding, beside the bed)
  D(13.775, Y_BA2, 2.8),# Bedroom 1 -> hallway
  D(5.4, Y_BA1, 3),     # Bathroom 1 -> Bedroom 1
  D(X_LV, (Y_C3 + Y_KT) / 2, Y_KT - Y_C3 - 0.5),  # hallway -> living room (open)
  D(X_K, 19.6, 3),      # hallway -> kitchen
  D(30.84, Y_KT, 3),    # kitchen -> living room
  D(31.5, Y_KB, 3),     # kitchen -> garage
  D(X_H2, 35.2, 3),     # hallway -> family room
  D((X_H2 + X_K) / 2, Y_FD, 3),  # front door
  D(1.67, Y_FAMT, 3),   # family room -> backyard
  D(X_E, 34.2, 3),      # garage -> backyard (side)
  D(34.6, Y0, 8),       # living room glass back door
  D(31.0, Y_GB, 16),    # garage door
  D((XF_L + X_FAMW) / 2, Y_FB, 6),  # backyard fence gate (west)
  D((X_E + XF_R) / 2, Y_FB, 6),     # backyard fence gate (east)
]
# Windows: centre position from where the sketch draws them along each wall (proportional within the room)
def W(x, z, w, **extra):
    return dict(at=[r2(x), r2(z)], width=r2(w), **extra)
frac = lambda p, a, b: (p - a) / (b - a)
windows = [
  W(X0 + frac(270, 196, 348) * (X_H1 - X0), Y0, 7),                       # Bedroom 2, back wall
  W(X_H2 + frac(477, 405, 575) * (X_LV - X_H2), Y0, 7),                   # Bedroom 3, back wall
  W(X0, Y_B2 + frac(614, 577, 657) * (Y_BA2 - Y_B2), 3 + 2 / 12, sill=1.2),     # Bathroom 2, west (sill 1.2 m)
  W(X_B1W, Y_BA2 + frac(674, 657, 688) * (Y_BA1 - Y_BA2), 3 + 2 / 12, sill=1.2),  # Bathroom 1, west (sill 1.2 m)
  W(X_B1W, Y_BA1 + frac(760, 688, 844) * (Y_FAMT - Y_BA1), 7),            # Bedroom 1, west
  W(X_E, Y0 + frac(633, 452, 664) * (Y_KT - Y0), 3 + 2 / 12),             # Living room, east
  W(X_E, Y_KT + frac(728, 664, 792) * (Y_KB - Y_KT), 3 + 2 / 12),         # Kitchen, east
  W(X_FAMW + frac(308, 212, 406) * (X_H2 - X_FAMW), Y_FAMB, 8),           # Family room, front wall
  W(X_H2, Y_FAMT + frac(958, 844, 1078) * (Y_FAMB - Y_FAMT), 3 + 2 / 12),  # Family room, porch side
  W(X_K, Y_KB + frac(958, 792, 1078) * (Y_GB - Y_KB), 3 + 2 / 12),        # Garage, porch side
]

fences = [dict(**{"from": [r2(XF_L), r2(Y_FB)], "to": [r2(X_FAMW), r2(Y_FB)]}),
          dict(**{"from": [r2(X_E), r2(Y_FB)], "to": [r2(XF_R), r2(Y_FB)]})]

# ---------- furniture ----------
# Drawn room boxes in image pixels, used to map positions proportionally
PX = {'bed2': (196,454,348,577), 'bath2': (196,577,348,657), 'bed3': (405,452,575,574),
      'living': (575,452,732,664), 'kitchen': (475,664,732,792), 'garage': (475,792,732,1078),
      'family': (212,844,406,1078), 'bed1': (252,688,406,844)}
FTR = {'bed2': (X0,Y0,X_H1,Y_B2), 'bath2': (X0,Y_B2,X_H1,Y_BA2), 'bed3': (X_H2,Y0,X_LV,Y_B3),
       'living': (X_LV,Y0,X_E,Y_KT), 'kitchen': (X_K,Y_KT,X_E,Y_KB), 'garage': (X_K,Y_KB,X_E,Y_GB),
       'family': (X_FAMW,Y_FAMT,X_H2,Y_FAMB), 'bed1': (X_B1W,Y_BA1,X_H2,Y_FAMT)}
DEFAULT = {'bike': [0.5, 1.15], 'toilet': [0.45, 0.7], 'chair': [0.5, 0.5], 'tree': [0.5, 0.5], 'plant': [0.5, 0.5]}
furniture, boxes = [], []

def footprint(size, rot):
    return (size[1], size[0]) if abs(rot) % 180 == 90 else tuple(size)

def add(room, typ, px, size=None, rot=0, snap='', **extra):
    rx0, ry0, rx1, ry1 = PX[room]; fx0, fy0, fx1, fy1 = [v * FT for v in FTR[room]]
    cx = (px[0] + px[2]) / 2; cy = (px[1] + px[3]) / 2
    x = fx0 + (cx - rx0) / (rx1 - rx0) * (fx1 - fx0)
    z = fy0 + (cy - ry0) / (ry1 - ry0) * (fy1 - fy0)
    place(room, typ, x, z, size, rot, snap, **extra)

def place(room, typ, x, z, size=None, rot=0, snap='', **extra):
    fx0, fy0, fx1, fy1 = [v * FT for v in FTR[room]] if room in FTR else room
    w, d = footprint(size or DEFAULT.get(typ, [1, 1]), rot)
    if 'N' in snap: z = fy0 + CLR + d / 2
    if 'S' in snap: z = fy1 - CLR - d / 2
    if 'W' in snap: x = fx0 + CLR + w / 2
    if 'E' in snap: x = fx1 - CLR - w / 2
    x = min(max(x, fx0 + CLR + w / 2), fx1 - CLR - w / 2)
    z = min(max(z, fy0 + CLR + d / 2), fy1 - CLR - d / 2)
    item = dict(type=typ, at=[round(x, 2), round(z, 2)])
    if rot: item['rot'] = rot
    if size: item['size'] = size
    item.update(extra)
    furniture.append(item)
    if typ not in ('mat', 'flowers', 'rug', 'whiteboard'):
        boxes.append((typ, room, x - w / 2, z - d / 2, x + w / 2, z + d / 2))
    return x, z

# Bedroom 2
add('bed2', 'bed', (246,459,303,479), [1.35, 0.75], 0, 'N', color='#ffc6ff')          # crib
add('bed2', 'bed', (200,497,229,571), [0.99, 1.9], 0, 'W', color='#a0c4ff')           # twin bed
add('bed2', 'bookshelf', (246,561,303,570), [1.2, 0.3], 180, 'S', height=1.0, color='#ffd166')
# Bathroom 2
add('bath2', 'toilet', (199,632,231,652), None, 180, 'SW')
add('bath2', 'sink', (233,632,272,652), [0.9, 0.55], 180, 'S')
add('bath2', 'tub', (274,632,343,652), [1.5, 0.75], 0, 'SE')
# Bedroom 3
add('bed3', 'desk', (410,457,439,518), [1.2, 0.6], 90, 'NW')
add('bed3', 'bed', (465,491,550,568), [1.52, 2.03], 0, '', color='#ffadad')
# Living room
add('living', 'bookshelf', (583,459,591,495), [0.9, 0.35], 90, 'NW')
add('living', 'bookshelf', (716,458,725,494), [0.9, 0.35], -90, 'NE')
add('living', 'sofa', (583,511,611,592), [2.2, 0.9], 90, 'W', color='#4895ef')
add('living', 'coffeeTable', (584,604,611,622), [0.6, 0.5], 0, 'W')
add('living', 'tv', (705,500,716,590), [1.4, 0.45], -90, 'E')
add('living', 'bookshelf', (713,597,727,661), [1.5, 0.35], -90, 'SE', height=1.0, color='#ffd166')   # toy shelf
add('living', 'desk', (632,641,674,661), [1.0, 0.5], 180, 'S', color='#caffbf')       # kid's desk
add('living', 'box', (645,620,661,629), [0.45, 0.3], 0, '', height=0.3, color='#ffadad')  # kid's bench
# Kitchen: appliance run along the north wall, from the east wall going west
kx1 = X_E * FT - CLR; kz = Y_KT * FT + CLR + 0.65 / 2
for typ, w, extra in [('fridge', 0.74, {}), ('counter', 0.6, {}), ('box', 0.76, dict(height=0.92, color='#495057')), ('counter', 0.6, {})]:
    place('kitchen', typ, kx1 - w / 2, kz, [w, 0.65 if typ != 'fridge' else 0.75], 0, 'N', **extra); kx1 -= w
add('kitchen', 'bookshelf', (520,668,574,686), [1.2, 0.4], 0, 'N', height=1.6, color='#ffffff')
place('kitchen', 'counter', 0, 0, [2.2, 0.65], 180, 'SE')                             # counter & sink
add('kitchen', 'table', (478,716,493,788), [1.8, 0.5], 90, 'W')
add('kitchen', 'table', (523,728,551,789), [1.5, 0.9], 90)
furniture[-1]['at'][0] = round(X_K * FT + 2.0, 2)   # leave room for chairs beside the wall table
tx, tz = furniture[-1]['at']; b = boxes[-1]; boxes[-1] = (b[0], b[1], tx - 0.45, b[3], tx + 0.45, b[5])
place('kitchen', 'chair', tx - 0.75, tz - 0.35, None, 90)
place('kitchen', 'chair', tx - 0.75, tz + 0.35, None, 90)
place('kitchen', 'chair', tx + 0.75, tz, None, -90, color='#f3722c')
# Garage: washer + dryer against the kitchen wall
gx = (632 + 726) / 2; gx = X_K * FT + (gx - 475) / (732 - 475) * (X_E - X_K) * FT
place('garage', 'box', gx - 0.36, 0, [0.7, 0.7], 0, 'N', height=0.95, color='#f8f9fa')
place('garage', 'box', gx + 0.36, 0, [0.7, 0.7], 0, 'N', height=0.95, color='#e9ecef')
# Kid's green bike, parked against the garage's west wall, facing the garage door
place('garage', 'bike', 0, 11.5, None, 0, 'W', color='#2dc653')
# Bedroom 1
add('bed1', 'desk', (256,778,285,840), [1.4, 0.6], 90, 'SW')
add('bed1', 'bed', (301,779,400,830), [1.52, 2.03], -90, 'SE', color='#90dbf4')
# Family room
add('family', 'mat', (231,856,339,894), [2.4, 1.0], 0, '', color='#9b5de5')            # exercise mat
add('family', 'sofa', (230,898,259,978), [2.2, 0.9], 90, 'W', color='#ef476f')
add('family', 'bookshelf', (392,940,402,976), [0.9, 0.35], -90, 'E')
add('family', 'piano', (215,1000,241,1060), [1.5, 0.6], 90, 'W')
add('family', 'box', (248,1027,258,1041), [0.8, 0.35], 90, '', height=0.5, color='#8d5a3b')  # piano bench
add('family', 'desk', (372,986,402,1047), [1.5, 0.75], -90, 'E')                      # computer desk
add('family', 'chair', (350,1009,360,1028), None, 90)
add('family', 'desk', (270,1052,334,1071), [1.4, 0.55], 180, 'S', color='#caffbf')    # kid's desk
add('family', 'desk', (337,1052,402,1071), [1.4, 0.55], 180, 'SE')
add('family', 'chair', (308,1030,323,1039), None, 0, color='#f3722c')                  # kid's chair

# Outdoor: global pixel -> feet mapping
gx_ft = lambda p: (p - 196) / 13.2
gy_ft = lambda p: (p - 454) / 12.17
YARD = (XF_L * FT, YF_T * FT, XF_R * FT, Y_FB * FT)
FRONT = (XF_L * FT, Y_FB * FT, XF_R * FT, Y_FY * FT)
def oadd(area, typ, px, size=None, **extra):
    x0, y0, x1, y1 = gx_ft(px[0]) * FT, gy_ft(px[1]) * FT, gx_ft(px[2]) * FT, gy_ft(px[3]) * FT
    if size is None: size = [round(x1 - x0, 2), round(y1 - y0, 2)]
    return place(area, typ, (x0 + x1) / 2, (y0 + y1) / 2, size, 0, '', **extra)
oadd(YARD, 'mat', (83,48,181,431), color='#c9bfa8')          # gravel
oadd(YARD, 'mat', (191,51,399,431), color='#6fbf4a')         # lawn
oadd(YARD, 'mat', (405,115,745,431), color='#d6d3cc')        # concrete
oadd(YARD, 'trampoline', (224,241,368,385), [3.4, 3.4])
for i in range(4):                                           # evergreen trees along the back fence
    x = 413 + (i + 0.5) * (744 - 413) / 4
    oadd(YARD, 'tree', (x, 60, x, 96), [0.5, 0.5], kind='pine')
oadd(YARD, 'flowers', (751,43,861,358))
for i, fruit in enumerate(['#fff275', '#ff9f1c', '#f9c74f']):   # lemon, orange, loquat
    y = 368 + (i + 0.5) * (844 - 368) / 3
    oadd(YARD, 'tree', (829, y, 829, y), [0.5, 0.5], fruit=fruit)
for i, fruit in enumerate(['#f9c74f', '#ffadad']):              # loquat, peach
    y = 454 + (i + 0.5) * (837 - 454) / 2
    oadd(YARD, 'tree', (120, y, 120, y), [0.5, 0.5], fruit=fruit)
oadd(FRONT, 'flowers', (745,1124,868,1502))
# White Tesla Model Y parked nose-in on the driveway, a little left of the garage door centre
DRIVE = (X_K * FT, Y_GB * FT, X_E * FT, Y_FY * FT)
place(DRIVE, 'suv', X_K * FT + 2.2, Y_GB * FT + 0.6 + 4.75 / 2, [1.92, 4.75], 180)

# ---------- overlap check between solid furniture ----------
for i in range(len(boxes)):
    for j in range(i + 1, len(boxes)):
        a, b = boxes[i], boxes[j]
        ox = min(a[4], b[4]) - max(a[2], b[2]); oz = min(a[5], b[5]) - max(a[3], b[3])
        if ox > 0.01 and oz > 0.01:
            print(f"OVERLAP {a[0]} & {b[0]} in {a[1] if isinstance(a[1], str) else 'outdoor'}: {ox:.2f} x {oz:.2f}", file=sys.stderr)

layout = {
  "name": "Home",
  "units": "meters. x grows to the east, z grows to the south. rect = [x0, z0, x1, z1]",
  "source": "source.png",
  "notes": NOTES,
  "wallHeight": 2.6,
  "spawn": {"at": [r2(33.5), r2(9.0)], "facing": "north"},
  "rooms": rooms, "doors": doors, "windows": windows, "fences": fences, "furniture": furniture,
}
out = Path(__file__).with_name('layout.json')
out.write_text(json.dumps(layout, indent=2))
print(f'wrote {out}')
