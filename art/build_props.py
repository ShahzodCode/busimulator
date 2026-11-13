"""
Builds the city props (bus stop shelter, tree species, bus terminal) and exports them for the game.

Run headless:
  blender -b --factory-startup --python art/build_props.py
or inside an open Blender (e.g. sent through the Blender MCP add-on): it then builds into its
own "Props" scene, leaves the user's file alone and skips saving art/props.blend.
Outputs:
  art/props.blend            (editable source, assets laid out in a row)
  public/models/props.glb    (what the game loads; one root node per asset)

Conventions
  * Blender is Z-up; the road side of the bus stop faces -Y (becomes +Z in three.js).
  * Each asset is an Empty named after the asset ("BusStop", "Tree_chinor", ...)
    with one mesh child per material. The game swaps materials for its shared
    palette materials by colour, so keep the colour count small.
  * Budget: trees stay under ~600 triangles, the shelter under ~1500, the terminal under ~9000
    (it is baked into the static city, so it costs no extra draw calls).
"""

import math
import os
import random

import bmesh
import bpy
from mathutils import Matrix, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
BLEND_OUT = os.path.join(HERE, "props.blend")
GLB_OUT = os.path.join(ROOT, "public", "models", "props.glb")

# ---------------------------------------------------------------- palette (sRGB hex)
PAL = {
    # shared with src/view/palette.ts
    "curb": 0xE2CFA6,
    "gold": 0xFFC94D,
    "stopRoof": 0x3A8FE0,
    "white": 0xFFFFFF,
    "window": 0x7FD0EE,
    "wood": 0xB57C4E,
    "trunk": 0x8C5B3A,
    "turquoise": 0x35C2D4,
    "turquoiseDeep": 0x1F9FB8,
    "metroBlue": 0x2F6FD6,
    "cream": 0xF7EAD2,
    "peach": 0xFFD3B0,
    "leaf": 0x5CBF4B,
    "leafLight": 0x7FD65A,
    "poplar": 0x63B84A,
    # new for the props
    "frame": 0x4B5A70,  # painted steel
    "lightbox": 0xFFF6E0,  # glowing ad panel
    "trunkDark": 0x6E4630,
    "trunkPale": 0xC9B79C,  # plane-tree bark
    "leafDeep": 0x3F9A46,
    "leafDark": 0x3A8A3E,
    "conifer": 0x2F8A63,
    "coniferLight": 0x3FA074,
    "willow": 0x9CCF5A,
    "willowDeep": 0x86C24E,
    "acacia": 0x8FCF4F,
    "apricot": 0xFFA53D,
    "blossom": 0xFFB7C9,
    # terminal
    "sidewalk": 0xF3E6C9,
    "board": 0x2B3442,  # dark departure-board face
    "steel": 0xDFE5EC,  # pale steel pipes holding up the terminal roof
    "roofGlass": 0xF4FAFF,  # see-through roof shell; src/view/props.ts swaps it for a transparent material
}


def lin(c):
    c /= 255.0
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


_mats = {}


def mat(key):
    if key in _mats:
        return _mats[key]
    h = PAL[key]
    rgba = (lin((h >> 16) & 255), lin((h >> 8) & 255), lin(h & 255), 1.0)
    m = bpy.data.materials.new(key)
    m.diffuse_color = rgba
    m.use_nodes = True
    bsdf = m.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = rgba
    bsdf.inputs["Roughness"].default_value = 0.85
    bsdf.inputs["Metallic"].default_value = 0.0
    _mats[key] = m
    return m


# ---------------------------------------------------------------- bmesh primitives
def _mark_sharp(bm, angle_deg=40):
    lim = math.radians(angle_deg)
    for e in bm.edges:
        if len(e.link_faces) == 2 and e.calc_face_angle(0) > lim:
            e.smooth = False


def _place(bm, loc=(0, 0, 0), rot=None):
    if rot is not None:
        bmesh.ops.rotate(bm, cent=(0, 0, 0), matrix=rot, verts=bm.verts)
    bmesh.ops.translate(bm, vec=Vector(loc), verts=bm.verts)
    return bm


def box(sx, sy, sz, loc=(0, 0, 0), bevel=0.0, rot=None):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=(sx, sy, sz), verts=bm.verts)
    if bevel > 0:
        b = min(bevel, sx * 0.45, sy * 0.45, sz * 0.45)
        bmesh.ops.bevel(bm, geom=bm.edges[:], offset=b, segments=1, profile=0.5, affect="EDGES", clamp_overlap=True)
    return _place(bm, loc, rot)


def cyl(r0, r1, h, segs=8, loc=(0, 0, 0), rot=None):
    """Cone/cylinder standing on z=0 (before placement)."""
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=segs, radius1=r0, radius2=r1, depth=h)
    bmesh.ops.translate(bm, vec=(0, 0, h / 2), verts=bm.verts)
    return _place(bm, loc, rot)


def limb(p0, p1, r0, r1, segs=6):
    """A tapered branch from p0 to p1."""
    p0, p1 = Vector(p0), Vector(p1)
    d = p1 - p0
    bm = cyl(r0, r1, d.length, segs)
    rot = Vector((0, 0, 1)).rotation_difference(d.normalized()).to_matrix().to_4x4()
    return _place(bm, p0, rot)


def puff(c, r, sx=1.0, sy=1.0, sz=1.0, sub=1, jitter=0.12, rng=None):
    """Faceted leaf blob: an icosphere with a little noise so no two look the same."""
    rng = rng or random
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=sub, radius=r)
    for v in bm.verts:
        v.co *= 1.0 + rng.uniform(-jitter, jitter)
        v.co.x *= sx
        v.co.y *= sy
        v.co.z *= sz
    bmesh.ops.rotate(bm, cent=(0, 0, 0), matrix=Matrix.Rotation(rng.uniform(0, 6.28), 4, "Z"), verts=bm.verts)
    return _place(bm, c)


def lathe(profile, segs=8, jitter=0.0, rng=None, twist=0.0):
    """Surface of revolution from [(radius, z), ...] bottom to top; radius 0 ends close to a point."""
    rng = rng or random
    bm = bmesh.new()
    rings = []
    for i, (r, z) in enumerate(profile):
        if r <= 1e-4:
            rings.append([bm.verts.new((0, 0, z))])
            continue
        ring = []
        for k in range(segs):
            a = (k + (i % 2) * 0.5 * twist) / segs * math.tau
            rr = r * (1.0 + rng.uniform(-jitter, jitter))
            ring.append(bm.verts.new((math.cos(a) * rr, math.sin(a) * rr, z + rng.uniform(-jitter, jitter) * 0.3)))
        rings.append(ring)
    for a, b in zip(rings, rings[1:]):
        if len(a) == 1:
            for k in range(segs):
                bm.faces.new((a[0], b[(k + 1) % segs], b[k]))
        elif len(b) == 1:
            for k in range(segs):
                bm.faces.new((a[k], a[(k + 1) % segs], b[0]))
        else:
            for k in range(segs):
                bm.faces.new((a[k], a[(k + 1) % segs], b[(k + 1) % segs], b[k]))
    if len(rings[0]) > 1:
        bm.faces.new(list(reversed(rings[0])))
    if len(rings[-1]) > 1:
        bm.faces.new(rings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return bm


def prism_yz(poly, x0, x1):
    """Extrude a closed polygon drawn in the YZ plane along X (used for the curved roof)."""
    bm = bmesh.new()
    a = [bm.verts.new((x0, y, z)) for y, z in poly]
    b = [bm.verts.new((x1, y, z)) for y, z in poly]
    n = len(poly)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((a[i], a[j], b[j], b[i]))
    bm.faces.new(a)
    bm.faces.new(list(reversed(b)))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return bm


# ---------------------------------------------------------------- asset container
class Asset:
    def __init__(self, name):
        self.name = name
        self.parts = {}

    def add(self, bm, key, smooth=False):
        for f in bm.faces:
            f.smooth = smooth
        if smooth:
            _mark_sharp(bm)
        me = bpy.data.meshes.new("_tmp")
        bm.to_mesh(me)
        bm.free()
        dst = self.parts.setdefault(key, bmesh.new())
        dst.from_mesh(me)
        bpy.data.meshes.remove(me)

    def build(self, at):
        root = bpy.data.objects.new(self.name, None)
        root.empty_display_size = 0.5
        bpy.context.scene.collection.objects.link(root)
        tris = 0
        for key, bm in self.parts.items():
            me = bpy.data.meshes.new(f"{self.name}_{key}")
            bm.to_mesh(me)
            bm.free()
            me.materials.append(mat(key))
            tris += sum(len(p.vertices) - 2 for p in me.polygons)
            ob = bpy.data.objects.new(f"{self.name}_{key}", me)
            bpy.context.scene.collection.objects.link(ob)
            ob.parent = root
        root.location = at
        return root, tris


# ---------------------------------------------------------------- bus stop
def bus_stop():
    A = Asset("BusStop")
    # platform + tactile strip along the kerb
    A.add(box(4.4, 1.9, 0.14, (0, 0, 0.07), bevel=0.04), "curb")
    A.add(box(4.1, 0.2, 0.02, (0, -0.72, 0.15)), "gold")

    # canopy: a gentle arch, high in the middle, overhanging the kerb side
    top = []
    for i in range(9):
        t = i / 8
        y = 0.88 - t * 1.88  # back (+y) to front (-y)
        z = 2.46 + math.sin(t * math.pi) * 0.2 - t * 0.04
        top.append((y, z))
    thick = 0.07
    poly = top + [(y, z - thick) for y, z in reversed(top)]
    A.add(prism_yz(poly, -2.25, 2.25), "stopRoof")
    # white trims on the roof edges and the arms that carry it
    A.add(box(4.5, 0.06, 0.12, (0, top[-1][0] - 0.02, top[-1][1] - 0.04)), "white")
    A.add(box(4.5, 0.06, 0.1, (0, top[0][0] + 0.02, top[0][1] - 0.03)), "white")
    arm = [(y, z - thick) for y, z in top] + [(y, z - thick - 0.1) for y, z in reversed(top)]
    for x in (-1.95, 1.95):
        A.add(prism_yz(arm, x - 0.05, x + 0.05), "frame")
    # light strip under the roof
    A.add(box(3.4, 0.12, 0.03, (0, -0.1, 2.5)), "lightbox")

    # rear posts and rails
    for x in (-1.95, 0.0, 1.95):
        A.add(box(0.12, 0.12, 2.42, (x, 0.74, 0.14 + 1.21), bevel=0.02), "frame")
    for z in (0.34, 1.9):
        A.add(box(3.9, 0.07, 0.07, (0, 0.74, z)), "frame")
    # glass: two back panes and one side pane on the queue end
    for x in (-0.975, 0.975):
        A.add(box(1.83, 0.035, 1.5, (x, 0.74, 1.12)), "window")
    A.add(box(0.035, 0.85, 1.5, (1.95, 0.28, 1.12)), "window")
    A.add(box(0.07, 0.07, 1.62, (1.95, -0.16, 1.12)), "frame")

    # illuminated advert box on the far end, with a little Tashkent poster on both faces
    A.add(box(0.2, 1.05, 2.0, (-2.08, 0.18, 0.14 + 1.0), bevel=0.03), "frame")
    for sx in (-1, 1):
        x = -2.08 + sx * 0.105
        A.add(box(0.02, 0.86, 1.66, (x, 0.18, 1.14)), "lightbox")
        A.add(box(0.025, 0.86, 0.5, (x, 0.18, 0.56)), "turquoise")  # ground
        dome = bmesh.new()
        bmesh.ops.create_uvsphere(dome, u_segments=10, v_segments=4, radius=0.26)
        bmesh.ops.delete(dome, geom=[v for v in dome.verts if v.co.z < -1e-4], context="VERTS")
        bmesh.ops.scale(dome, vec=(0.12, 1.0, 1.0), verts=dome.verts)
        A.add(_place(dome, (x, 0.18, 0.81)), "turquoiseDeep")  # a dome, of course
        A.add(cyl(0.13, 0.13, 0.03, 10, (x - sx * 0.015, 0.0, 1.62), Matrix.Rotation(sx * math.pi / 2, 4, "Y")), "gold")  # sun

    # bench: two steel legs, three seat slats, two back slats
    for x in (-0.95, 0.95):
        A.add(box(0.08, 0.46, 0.5, (x, 0.36, 0.14 + 0.25)), "frame")
        A.add(box(0.06, 0.06, 0.5, (x, 0.6, 0.72)), "frame")
    for y in (0.18, 0.34, 0.5):
        A.add(box(2.4, 0.14, 0.05, (0, y, 0.66), bevel=0.015), "wood")
    for z in (0.82, 0.98):
        A.add(box(2.4, 0.04, 0.12, (0, 0.63, z), bevel=0.012), "wood")

    # litter bin beside the bench
    A.add(cyl(0.17, 0.2, 0.55, 10, (1.62, 0.42, 0.14)), "turquoiseDeep", smooth=True)
    A.add(cyl(0.215, 0.2, 0.06, 10, (1.62, 0.42, 0.69)), "frame", smooth=True)

    # route sign at the kerb: bus pictogram and a timetable panel
    A.add(cyl(0.05, 0.05, 2.8, 8, (2.45, -0.62, 0.14)), "frame", smooth=True)
    A.add(box(0.62, 0.06, 0.56, (2.45, -0.62, 2.62), bevel=0.02), "metroBlue")
    A.add(box(0.4, 0.02, 0.24, (2.45, -0.66, 2.64), bevel=0.01), "white")
    A.add(box(0.3, 0.025, 0.07, (2.45, -0.67, 2.68)), "window")
    for x in (-0.11, 0.11):
        A.add(cyl(0.045, 0.045, 0.03, 8, (2.45 + x, -0.66, 2.52), Matrix.Rotation(math.pi / 2, 4, "X")), "frame")
    A.add(box(0.34, 0.04, 0.44, (2.45, -0.67, 1.55), bevel=0.01), "white")
    A.add(box(0.34, 0.045, 0.08, (2.45, -0.675, 1.73)), "gold")
    return A


# ---------------------------------------------------------------- trees
def leafy(A, rng, puffs, colors, sub=2, jitter=0.12):
    for i, p in enumerate(puffs):
        c, r = p[0], p[1]
        s = p[2] if len(p) > 2 else (1, 1, 1)
        A.add(puff(c, r, *s, sub=sub, jitter=jitter, rng=rng), colors[i % len(colors)])


def tree_chinor(rng):
    """Oriental plane (chinor): pale bark, a forked trunk and a broad, layered crown."""
    A = Asset("Tree_chinor")
    A.add(cyl(0.26, 0.18, 1.5, 7), "trunkPale", smooth=True)
    A.add(limb((0, 0, 1.3), (0.6, 0.15, 2.3), 0.15, 0.08), "trunkPale", smooth=True)
    A.add(limb((0, 0, 1.3), (-0.55, -0.2, 2.35), 0.15, 0.08), "trunkPale", smooth=True)
    leafy(A, rng, [
        ((0, 0, 2.75), 1.1, (1.1, 1.1, 0.85)),
        ((0.85, 0.25, 2.4), 0.8),
        ((-0.85, -0.15, 2.45), 0.85),
        ((0.25, -0.75, 2.5), 0.72),
        ((-0.3, 0.6, 3.25), 0.72),
        ((0.35, 0.2, 3.45), 0.55),
    ], ["leafDeep", "leaf"], jitter=0.14)
    return A


def tree_terak(rng):
    """Lombardy poplar (terak): the tall, narrow tree lining Uzbek roads and canals."""
    A = Asset("Tree_terak")
    A.add(cyl(0.13, 0.09, 0.9, 6), "trunk", smooth=True)
    A.add(lathe([(0.22, 0.65), (0.5, 1.2), (0.64, 2.0), (0.6, 2.9), (0.46, 3.7), (0.24, 4.35), (0.0, 4.75)], segs=8, jitter=0.07, rng=rng, twist=1), "poplar")
    for z, a in ((1.7, 0.4), (2.6, 2.6), (3.4, 4.6)):
        A.add(puff((math.cos(a) * 0.5, math.sin(a) * 0.5, z), 0.3, 0.8, 0.8, 1.6, sub=1, jitter=0.1, rng=rng), "leafLight")
    return A


def tree_sarv(rng):
    """Cypress (sarv): a dark green flame, planted in pairs by gates and monuments."""
    A = Asset("Tree_sarv")
    A.add(cyl(0.1, 0.08, 0.5, 6), "trunkDark", smooth=True)
    A.add(lathe([(0.2, 0.3), (0.45, 0.8), (0.52, 1.6), (0.45, 2.6), (0.28, 3.4), (0.0, 4.0)], segs=7, jitter=0.08, rng=rng, twist=1), "leafDark")
    A.add(puff((0.18, -0.15, 1.5), 0.35, 1, 1, 2.2, sub=1, rng=rng), "conifer")
    return A


def tree_qayragoch(rng):
    """Elm (qayrag'och): a tall trunk that fans out into a wide umbrella crown."""
    A = Asset("Tree_qayragoch")
    A.add(cyl(0.2, 0.15, 1.9, 7), "trunk", smooth=True)
    for a in (0.3, 2.4, 4.4):
        A.add(limb((0, 0, 1.7), (math.cos(a) * 0.8, math.sin(a) * 0.8, 2.55), 0.12, 0.06, 5), "trunk", smooth=True)
    ring = []
    for i in range(6):
        a = i / 6 * math.tau + 0.4
        ring.append(((math.cos(a) * 1.05, math.sin(a) * 1.05, 2.75 + rng.uniform(-0.1, 0.1)), 0.72, (1, 1, 0.62)))
    ring.append(((0, 0, 3.05), 0.95, (1, 1, 0.6)))
    leafy(A, rng, ring, ["leafDeep", "leaf"])
    return A


def tree_tut(rng):
    """Mulberry (tut): pollarded, knobbly trunk under a dense round crown."""
    A = Asset("Tree_tut")
    A.add(cyl(0.3, 0.24, 1.0, 7), "trunkDark", smooth=True)
    A.add(puff((0, 0, 1.0), 0.32, 1, 1, 0.6, sub=1, jitter=0.15, rng=rng), "trunkDark")  # the knuckle
    for a in (0.6, 2.7, 4.6):
        A.add(limb((0, 0, 1.0), (math.cos(a) * 0.45, math.sin(a) * 0.45, 1.55), 0.12, 0.08, 5), "trunkDark", smooth=True)
    leafy(A, rng, [
        ((0, 0, 2.05), 1.05, (1.15, 1.15, 0.9)),
        ((0.55, 0.35, 1.8), 0.7),
        ((-0.5, -0.4, 1.85), 0.72),
        ((0.1, -0.1, 2.6), 0.6),
    ], ["leafDark", "leafDeep"])
    return A


def tree_archa(rng):
    """Juniper (archa): stacked blue-green tiers, common in parks and courtyards."""
    A = Asset("Tree_archa")
    A.add(cyl(0.12, 0.1, 0.45, 6), "trunkDark", smooth=True)
    tiers = [(0.3, 1.05, 1.5), (1.05, 0.82, 1.35), (1.8, 0.58, 1.25), (2.45, 0.34, 0.95)]
    for i, (z, r, h) in enumerate(tiers):
        bm = cyl(r, 0.0, h, 7)
        for v in bm.verts:
            if v.co.z < 0.01:
                v.co.z += rng.uniform(-0.06, 0.06)
        bmesh.ops.rotate(bm, cent=(0, 0, 0), matrix=Matrix.Rotation(i * 0.45, 4, "Z"), verts=bm.verts)
        A.add(_place(bm, (0, 0, z)), "conifer" if i % 2 == 0 else "coniferLight")
    return A


def tree_majnuntol(rng):
    """Weeping willow (majnuntol): a soft dome with a curtain of branches, by water and in parks."""
    A = Asset("Tree_majnuntol")
    A.add(cyl(0.22, 0.14, 2.0, 7, rot=Matrix.Rotation(0.08, 4, "X")), "trunk", smooth=True)
    A.add(puff((0, -0.12, 2.7), 1.1, 1.1, 1.1, 0.55, sub=2, rng=rng), "willow")
    # curtain: long drooping strands hanging off the rim of the dome
    n = 11
    for k in range(n):
        a = k / n * math.tau + rng.uniform(-0.12, 0.12)
        r = 1.05 + rng.uniform(-0.05, 0.08)
        length = rng.uniform(0.75, 1.0)
        c = (math.cos(a) * r, math.sin(a) * r - 0.12, 2.45 - length)
        A.add(puff(c, 0.36, 0.95, 0.95, length / 0.36, sub=1, jitter=0.08, rng=rng), "willowDeep" if k % 2 else "willow")
    return A


def tree_orik(rng):
    """Apricot (o'rik): a small orchard tree hung with orange fruit."""
    A = Asset("Tree_orik")
    A.add(cyl(0.16, 0.12, 0.9, 6), "trunk", smooth=True)
    for a in (0.2, 2.3, 4.3):
        A.add(limb((0, 0, 0.8), (math.cos(a) * 0.5, math.sin(a) * 0.5, 1.5), 0.09, 0.05, 5), "trunk", smooth=True)
    crown = [((0, 0, 1.85), 0.85), ((0.55, 0.2, 1.65), 0.6), ((-0.5, -0.25, 1.7), 0.62), ((0.05, 0.1, 2.35), 0.55)]
    leafy(A, rng, crown, ["leafLight", "leaf"])
    for i in range(8):
        a = i / 8 * math.tau + rng.uniform(-0.2, 0.2)
        el = rng.uniform(-0.35, 0.55)
        r = 0.88
        c = (math.cos(a) * math.cos(el) * r, math.sin(a) * math.cos(el) * r, 1.85 + math.sin(el) * r * 0.9)
        A.add(puff(c, 0.1, sub=1, jitter=0.0, rng=rng), "apricot")
    return A


def tree_akatsiya(rng):
    """Black locust (akatsiya): crooked trunk, airy and irregular yellow-green crown."""
    A = Asset("Tree_akatsiya")
    A.add(limb((0, 0, 0), (0.15, 0.05, 1.6), 0.19, 0.13, 6), "trunkDark", smooth=True)
    A.add(limb((0.15, 0.05, 1.5), (0.75, 0.2, 2.6), 0.11, 0.06, 5), "trunkDark", smooth=True)
    A.add(limb((0.15, 0.05, 1.5), (-0.5, -0.1, 2.9), 0.11, 0.06, 5), "trunkDark", smooth=True)
    A.add(limb((0.1, 0.03, 1.1), (-0.4, 0.6, 1.9), 0.07, 0.04, 5), "trunkDark", smooth=True)
    leafy(A, rng, [
        ((0.85, 0.25, 2.75), 0.62, (1, 1, 0.75)),
        ((-0.55, -0.15, 3.1), 0.7, (1, 1, 0.75)),
        ((0.1, 0.1, 3.4), 0.55, (1, 1, 0.75)),
        ((-0.45, 0.7, 2.05), 0.5, (1, 1, 0.75)),
        ((0.25, -0.55, 2.65), 0.48, (1, 1, 0.75)),
        ((0.95, -0.3, 3.2), 0.38, (1, 1, 0.8)),
    ], ["acacia", "leafLight"], jitter=0.16)
    return A


def tree_olcha(rng):
    """Cherry in blossom (olcha): a little pink tree for parks and courtyards."""
    A = Asset("Tree_olcha")
    A.add(cyl(0.14, 0.1, 0.85, 6), "trunkDark", smooth=True)
    for a in (1.0, 3.1, 5.0):
        A.add(limb((0, 0, 0.75), (math.cos(a) * 0.45, math.sin(a) * 0.45, 1.4), 0.08, 0.05, 5), "trunkDark", smooth=True)
    leafy(A, rng, [
        ((0, 0, 1.8), 0.8),
        ((0.5, 0.25, 1.6), 0.55),
        ((-0.45, -0.3, 1.65), 0.58),
        ((0.1, -0.05, 2.3), 0.5),
    ], ["blossom", "white"], jitter=0.14)
    return A


def bush(rng):
    """Low shrub (buta) for parks, verges and gaps between buildings."""
    A = Asset("Tree_buta")
    leafy(A, rng, [
        ((0, 0, 0.42), 0.55, (1.2, 1.0, 0.85)),
        ((0.55, 0.15, 0.32), 0.42),
        ((-0.5, -0.1, 0.34), 0.45),
        ((0.1, 0.35, 0.6), 0.35),
    ], ["leafDeep", "leaf"])
    return A


# ---------------------------------------------------------------- bus terminal
# Island platform between two drive-through bays (see TERMINAL_HALL in src/sim/layout.ts).
# Origin = island centre. +X = east. Line 1's bay runs along -Y (game south, buses drive -X),
# line 2's along +Y (game north, buses drive +X). Both bay roads are centred 7 m from the origin.
T_LEN = 26.0  # island length (m)
T_HALF_W = 3.8  # island half width: kerb to kerb is 7.6 m
T_BAY = 7.0  # road centre of each bay
T_LANE = 1.6  # bus centre sits this far from its road centre, towards the island
T_STOPS = {-1: (-6.0, 1), 1: (8.0, -1)}  # side: (stop x, direction behind the stop along X); match terminalOn() in layout.ts


def arch_band(y0, y1, z0, rise, thick, n=10):
    """Polygon (YZ) of an arched beam from y0 to y1 springing at z0 and rising `rise` at the crown."""
    top = []
    for i in range(n + 1):
        t = i / n
        top.append((y0 + (y1 - y0) * t, z0 + math.sin(t * math.pi) * rise))
    return top + [(y, z - thick) for y, z in reversed(top)]


def half_shell(x0, x1, r, z0, n=18):
    """Open half-cylinder (semicircle across Y) from x0 to x1, springing at height z0. One sheet, no ends."""
    bm = bmesh.new()
    rows = []
    for i in range(n + 1):
        a = math.pi * i / n
        y, z = -r * math.cos(a), z0 + r * math.sin(a)
        rows.append((bm.verts.new((x0, y, z)), bm.verts.new((x1, y, z))))
    for (a0, a1), (b0, b1) in zip(rows, rows[1:]):
        bm.faces.new((a0, a1, b1, b0))
    for f in bm.faces:
        f.normal_update()
        if f.normal.z < 0:
            f.normal_flip()
    return bm


def bay_box(A, x, y, w=5.4, d=2.9, line=0.12):
    """Painted bay outline on the road where a bus stands (yellow, like real bus stands)."""
    z = 0.075
    for sy in (-1, 1):
        A.add(box(w, line, 0.01, (x, y + sy * d / 2, z)), "gold")
    for sx in (-1, 1):
        A.add(box(line, d, 0.01, (x + sx * w / 2, y, z)), "gold")


def terminal():
    A = Asset("Terminal")
    L, H = T_LEN, T_HALF_W
    x0, x1 = -L / 2, L / 2

    # --- island: raised platform, paving, tactile strips along both kerbs
    A.add(box(L, H * 2, 0.22, (0, 0, 0.11), bevel=0.06), "curb")
    A.add(box(L - 0.5, H * 2 - 0.5, 0.02, (0, 0, 0.23)), "sidewalk")
    for sy in (-1, 1):
        A.add(box(L - 1.2, 0.3, 0.02, (0, sy * (H - 0.45), 0.245)), "gold")

    # --- waiting hall: glass box on a cream plinth with a turquoise roof and a tiled frieze
    hx, hy, hh = 5.6, 1.45, 2.9
    A.add(box(hx * 2, hy * 2, 0.3, (0, 0, 0.38), bevel=0.05), "cream")
    for sy in (-1, 1):
        A.add(box(hx * 2 - 0.2, 0.06, hh - 0.5, (0, sy * hy, 0.53 + (hh - 0.5) / 2)), "window")
        for i in range(9):
            x = -hx + 0.1 + i * (hx * 2 - 0.2) / 8
            A.add(box(0.12, 0.12, hh - 0.5, (x, sy * hy, 0.53 + (hh - 0.5) / 2)), "white")
        # sliding doors facing each bay: a frame and a gold header
        A.add(box(1.8, 0.1, 0.12, (0, sy * (hy + 0.04), 2.25)), "gold")
        A.add(box(0.06, 0.08, 1.7, (0, sy * (hy + 0.05), 1.4)), "frame")
    for sx in (-1, 1):
        A.add(box(0.06, hy * 2 - 0.2, hh - 0.5, (sx * hx, 0, 0.53 + (hh - 0.5) / 2)), "window")
    A.add(box(hx * 2 + 0.4, hy * 2 + 0.4, 0.4, (0, 0, hh + 0.2), bevel=0.08), "cream")
    for sy in (-1, 1):
        A.add(box(hx * 2 + 0.42, 0.04, 0.24, (0, sy * (hy + 0.21), hh + 0.2)), "turquoise")
        for i in range(12):  # little girih diamonds on the tile band
            d = box(0.16, 0.03, 0.16, (-hx + 0.45 + i * (hx * 2 - 0.9) / 11, sy * (hy + 0.235), hh + 0.2), rot=Matrix.Rotation(math.pi / 4, 4, "Y"))
            A.add(d, "gold")
    A.add(box(hx * 2 + 0.8, hy * 2 + 0.8, 0.18, (0, 0, hh + 0.49), bevel=0.06), "turquoiseDeep")
    # ticket and info kiosk at the east end of the hall
    A.add(box(1.7, 1.6, 2.3, (hx + 1.6, 0, 0.23 + 1.15), bevel=0.12), "turquoise")
    A.add(box(1.0, 0.04, 0.6, (hx + 1.6, -0.8, 1.55)), "window")
    A.add(box(1.0, 0.04, 0.6, (hx + 1.6, 0.8, 1.55)), "window")
    A.add(box(1.9, 1.8, 0.14, (hx + 1.6, 0, 2.6), bevel=0.05), "white")

    # --- roof: a see-through half-cylinder shell over the island, held up by four steel pipes.
    # It is drawn transparent in the game (props.ts), so the crowd and the far bay stay visible.
    span = H - 0.45  # roof radius: the shell's edges sit right above the pipes
    rx0, rx1 = -8.8, 9.6  # clear of the clock tower (west) and the lamp posts at both ends
    spring = 3.4  # height of the pipes, where the half circle starts
    A.add(half_shell(rx0, rx1, span, spring), "roofGlass")
    for x in (rx0 + 0.4, rx1 - 0.4):
        for sy in (-1, 1):
            A.add(cyl(0.12, 0.12, spring - 0.23, 10, (x, sy * span, 0.23)), "steel", smooth=True)
            A.add(cyl(0.22, 0.22, 0.1, 10, (x, sy * span, 0.23)), "steel")
    # thin rails along both edges carry the shell from pipe to pipe
    for sy in (-1, 1):
        A.add(cyl(0.07, 0.07, rx1 - rx0, 8, (rx0, sy * span, spring), Matrix.Rotation(math.pi / 2, 4, "Y")), "steel", smooth=True)

    # --- departure boards hanging from the roof, one facing each bay
    for side, (sx, _) in T_STOPS.items():
        bx = sx + 2.0 * (1 if side < 0 else -1)
        y = side * (span - 0.4)
        top = spring + math.sqrt(span ** 2 - y ** 2)  # roof height above the board
        A.add(box(2.0, 0.12, 0.62, (bx, y, 3.05), bevel=0.03), "board")
        A.add(box(1.7, 0.02, 0.1, (bx, y + side * 0.07, 3.2)), "gold")
        A.add(box(1.3, 0.02, 0.08, (bx - 0.2, y + side * 0.07, 3.02)), "lightbox")
        A.add(box(1.5, 0.02, 0.08, (bx - 0.1, y + side * 0.07, 2.88)), "lightbox")
        for dx in (-0.8, 0.8):
            A.add(box(0.04, 0.04, top - 3.3, (bx + dx, y, (top + 3.3) / 2)), "steel")

    # --- benches back-to-back with the hall, bins, planters with shrubs, lamp posts
    for sy in (-1, 1):
        for x in (-8.2, 8.0 + 2.6):
            y = sy * (hy + 0.9)
            for k in (0.0, 0.16, 0.32):
                A.add(box(2.2, 0.14, 0.05, (x, y + sy * (k - 0.16), 0.68), bevel=0.015), "wood")
            A.add(box(2.2, 0.04, 0.14, (x, y - sy * 0.27, 0.9), bevel=0.012), "wood")
            for dx in (-0.85, 0.85):
                A.add(box(0.08, 0.42, 0.45, (x + dx, y, 0.45)), "frame")
        for x in (-10.4, 8.6):  # clear of both queues, which line up behind each stop
            A.add(cyl(0.17, 0.2, 0.55, 10, (x, sy * (hy + 0.5), 0.23)), "turquoiseDeep", smooth=True)
            A.add(cyl(0.215, 0.2, 0.06, 10, (x, sy * (hy + 0.5), 0.78)), "frame", smooth=True)
    rng = random.Random(23)
    for px in (x0 + 0.4, x1 - 0.6):
        A.add(cyl(1.5, 1.6, 0.5, 14, (px, 0, 0.22)), "cream", smooth=True)
        A.add(cyl(1.4, 1.4, 0.06, 14, (px, 0, 0.68)), "trunk")
        leafy(A, rng, [
            ((px, 0, 1.05), 0.65, (1.1, 1.1, 0.85)),
            ((px + 0.7, 0.4, 0.95), 0.45),
            ((px - 0.6, -0.5, 0.95), 0.48),
            ((px + 0.2, -0.75, 0.9), 0.4),
            ((px - 0.3, 0.7, 0.92), 0.42),
        ], ["leafDeep", "leaf"])
    for x in (x0 + 2.4, x1 - 2.4):
        for sy in (-1, 1):
            y = sy * (H - 0.35)
            A.add(cyl(0.07, 0.06, 3.9, 8, (x, y, 0.23)), "frame", smooth=True)
            A.add(limb((x, y, 4.05), (x, y - sy * 0.6, 4.15), 0.05, 0.04), "frame")
            A.add(box(0.42, 0.24, 0.1, (x, y - sy * 0.65, 4.1), bevel=0.03), "frame")
            A.add(box(0.34, 0.18, 0.03, (x, y - sy * 0.65, 4.04)), "lightbox")

    # --- clock tower at the west end, Tashkent style: a tiled shaft and a ribbed blue dome
    tx = x0 + 2.4
    A.add(box(2.0, 2.0, 0.5, (tx, 0, 0.48), bevel=0.06), "cream")
    A.add(box(1.5, 1.5, 6.6, (tx, 0, 0.73 + 3.3), bevel=0.1), "cream")
    for z in (2.2, 4.2):
        A.add(box(1.56, 1.56, 0.22, (tx, 0, z)), "turquoise")
    A.add(box(1.8, 1.8, 1.5, (tx, 0, 7.33 + 0.75), bevel=0.12), "turquoiseDeep")
    for a in range(4):  # clock faces on all four sides
        rot = Matrix.Rotation(a * math.pi / 2, 4, "Z")
        face = cyl(0.55, 0.55, 0.06, 20, (0, 0, 0), Matrix.Rotation(math.pi / 2, 4, "X"))
        A.add(_place(face, rot @ Vector((0, -0.93, 8.1)) + Vector((tx, 0, 0)), rot), "white")
        ring = cyl(0.62, 0.62, 0.04, 20, (0, 0, 0), Matrix.Rotation(math.pi / 2, 4, "X"))
        A.add(_place(ring, rot @ Vector((0, -0.91, 8.1)) + Vector((tx, 0, 0)), rot), "gold")
        for hand, (w, h, ang) in enumerate(((0.06, 0.4, 0.6), (0.05, 0.3, -1.9))):
            hb = box(w, 0.02, h, (0, 0, h / 2 - 0.04), rot=Matrix.Rotation(ang, 4, "Y"))
            A.add(_place(hb, rot @ Vector((0, -0.97 - hand * 0.01, 8.1)) + Vector((tx, 0, 0)), rot), "board")
    A.add(box(2.0, 2.0, 0.16, (tx, 0, 8.9), bevel=0.05), "white")
    A.add(_place(lathe([(0.85, 9.0), (0.95, 9.35), (0.85, 9.8), (0.55, 10.2), (0.22, 10.45), (0.0, 10.55)], segs=12), (tx, 0, 0)), "turquoise", smooth=True)
    A.add(cyl(0.05, 0.03, 0.7, 6, (tx, 0, 10.5)), "gold")
    A.add(puff((tx, 0, 11.25), 0.11, sub=1, jitter=0.0), "gold")

    # --- painted bus stands on both bay roads: the stop itself and room for buses queueing behind it
    for side, (sx, back) in T_STOPS.items():
        y = side * (T_BAY - T_LANE)
        for k in range(3):
            bay_box(A, sx + back * k * 6.5, y)
        # "BUS" chevrons pointing the way in
        for k in range(2):
            cx = sx - back * (4.2 + k * 0.9)
            for s in (-1, 1):
                A.add(box(0.7, 0.14, 0.01, (cx + back * 0.22, y + s * 0.25, 0.075), rot=Matrix.Rotation(s * back * 0.7, 4, "Z")), "white")
    return A


# ---------------------------------------------------------------- scene + export
LIVE = not bpy.app.background


def reset():
    if not LIVE:
        bpy.ops.wm.read_factory_settings(use_empty=True)
        return
    # running inside an open Blender (e.g. through the Blender MCP add-on): never wipe the
    # user's file; rebuild a dedicated "Props" scene instead
    old = bpy.data.scenes.get("Props")
    if old:
        for ob in list(old.collection.all_objects):
            bpy.data.objects.remove(ob, do_unlink=True)
        bpy.data.scenes.remove(old)
    for coll in (bpy.data.meshes, bpy.data.materials, bpy.data.cameras):
        for block in list(coll):
            if block.users == 0:
                coll.remove(block)
    bpy.context.window.scene = bpy.data.scenes.new("Props")


def preview_setup(extent):
    scn = bpy.context.scene
    scn.render.engine = "BLENDER_WORKBENCH"
    sh = scn.display.shading
    sh.light = "STUDIO"
    sh.color_type = "MATERIAL"
    sh.show_shadows = True
    sh.show_cavity = False
    scn.render.resolution_x = 1600
    scn.render.resolution_y = 700
    scn.render.film_transparent = False
    world = bpy.data.worlds.new("World")
    world.color = (0.55, 0.75, 0.45)
    scn.world = world
    ground = bpy.data.meshes.new("Ground")
    bm = bmesh.new()
    bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=extent)
    bm.to_mesh(ground)
    bm.free()
    g = bpy.data.objects.new("Ground", ground)
    g.data.materials.append(mat("curb"))
    scn.collection.objects.link(g)
    g.location = (extent * 0.5 - 4, 2, 0)
    cam = bpy.data.objects.new("Cam", bpy.data.cameras.new("Cam"))
    cam.data.type = "ORTHO"
    cam.data.ortho_scale = extent * 0.95
    cam.location = (extent * 0.5 - 4, -40, 30)
    cam.rotation_euler = (math.radians(55), 0, 0)
    scn.collection.objects.link(cam)
    scn.camera = cam
    return g


def main():
    reset()
    rng = random.Random(11)
    builders = [bus_stop, tree_chinor, tree_terak, tree_sarv, tree_qayragoch, tree_tut, tree_archa, tree_majnuntol, tree_orik, tree_akatsiya, tree_olcha, bush, terminal]
    widths = {bus_stop: 6.0, terminal: 34.0}
    x = 0.0
    report = {}
    for b in builders:
        a = b() if b in (bus_stop, terminal) else b(rng)
        width = widths.get(b, 3.4)
        root, tris = a.build((x + (width / 2 - 1.7 if b is terminal else 0), 0, 0))
        report[a.name] = tris
        x += width
    for k, v in report.items():
        print(f"[props] {k:18s} {v:5d} tris")

    os.makedirs(os.path.dirname(GLB_OUT), exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=GLB_OUT,
        export_format="GLB",
        export_yup=True,
        export_apply=True,
        export_texcoords=False,
        export_normals=True,
        export_materials="EXPORT",
        export_animations=False,
        export_cameras=False,
        export_lights=False,
        use_active_scene=True,
    )
    print("[props] wrote", GLB_OUT, os.path.getsize(GLB_OUT), "bytes")

    ground = preview_setup(x + 2)
    if not LIVE:
        bpy.ops.wm.save_as_mainfile(filepath=BLEND_OUT)
        print("[props] wrote", BLEND_OUT)
    preview = os.environ.get("PROPS_PREVIEW")
    if preview:
        bpy.context.scene.render.filepath = preview
        bpy.ops.render.render(write_still=True)
        print("[props] preview", preview)


main()
