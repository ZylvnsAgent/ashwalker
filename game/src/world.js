// CARGO GRID: a bright late-afternoon container yard in the style of the Point Blank /
// Counter-Strike container yard — shipping containers in rust red, blue and
// grey, stacked 1–2 high, sand ground, perimeter fencing and a yellow car.
// Two bomb sites (A west, B east), three lanes (A-long, mid double-doors,
// B-lane) and a defender connector south. Every box is a collider for
// players and a surface bullets stop on. The waypoint graph is what the
// bots walk: nodes at spawns, corners, sites and holds. Container footprints
// never move onto a waypoint node or edge, so bots never walk through one.
//
// Surfaces are procedural canvas textures (textures.js): sand yard, weathered
// concrete, rusted corrugated metal in four colours, crate wood. Texture
// density is constant because box UVs are scaled by the box's own dimensions
// (one tile = 2 m). All dressing — container ribs and trim, wall caps and
// pilasters, door frames, props, skyline roofs — is visual only: it sits on
// or beside a collider and never moves or shrinks a collision box.
//
// Surfaces are procedural canvas textures (textures.js): asphalt yard, weathered
// concrete, rusted corrugated metal, crate wood. Texture density is constant
// because box UVs are scaled by the box's own dimensions (one tile = 2 m).
// All dressing — container ribs and trim, wall caps and pilasters, door frames,
// props, skyline roofs — is visual only: it sits on or beside a collider and
// never moves or shrinks a collision box.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { createTextures } from './textures.js';

// Waypoint nodes [x, z]. 0-2 + 32-33 ASH spawn, 25-27 + 34-35 EMBER spawn,
// 6/11 plant spots.
const NODES = [
  [-6, -16], [0, -16], [6, -16], [-19, -15], [-19, -10], [-18, -6], [-16, -9],
  [-14, -8], [19, -15], [19, -10], [18, -6], [16, -9], [14, -8], [0, -14],
  [0, -8], [0, -4], [0, 0], [0, 4], [0, 8], [-8, -8], [8, -8], [-8, 0],
  [8, 0], [-8, 8], [8, 8], [-6, 16], [0, 16], [6, 16], [-11, -9], [11, -9],
  [-16, 12], [16, 12], [-12, -16], [12, -16], [-12, 16], [12, 16],
];
const EDGES = [
  [0, 1], [1, 2], [0, 3], [1, 13], [2, 8], [3, 4], [4, 5], [5, 7], [4, 6],
  [6, 7], [5, 28], [7, 28], [28, 19], [28, 14], [8, 9], [9, 10], [10, 12],
  [9, 11], [11, 12], [10, 29], [12, 29], [29, 20], [29, 14], [13, 14], [14, 15],
  [15, 16], [16, 17], [17, 18], [13, 19], [13, 20], [14, 19], [14, 20],
  [19, 21], [20, 22], [15, 21], [15, 22], [16, 21], [16, 22], [21, 23],
  [22, 24], [17, 23], [17, 24], [18, 23], [18, 24], [23, 30], [24, 31],
  [30, 25], [31, 27], [25, 26], [26, 27], [23, 25], [24, 27], [18, 26],
  [5, 21], [10, 22], [32, 0], [33, 2], [34, 25], [35, 27],
];

function mulberry32(initial) {
  let a = initial;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Box geometry with UVs scaled by face size, so one texture tile always
// covers 2 m of surface no matter how big the box is. BoxGeometry faces are
// px, nx, py, ny, pz, nz; each face's UV axes are its two dimensions.
function uvBox(width, height, depth, tile = 2) {
  const geo = new THREE.BoxGeometry(width, height, depth);
  const uv = geo.attributes.uv;
  const dims = [[depth, height], [depth, height], [width, depth], [width, depth], [width, height], [width, height]];
  for (let f = 0; f < 6; f += 1) {
    for (let v = 0; v < 4; v += 1) {
      const i = f * 4 + v;
      uv.setXY(i, (uv.getX(i) * dims[f][0]) / tile, (uv.getY(i) * dims[f][1]) / tile);
    }
  }
  return geo;
}

export function createWorld(scene) {
  const group = new THREE.Group();
  scene.add(group);
  const tex = createTextures();
  const materials = {
    asphalt: new THREE.MeshStandardMaterial({ map: tex.asphalt, roughness: 0.96, metalness: 0.02 }),
    sand: new THREE.MeshStandardMaterial({ map: tex.sand, roughness: 1, metalness: 0 }),
    yard: new THREE.MeshStandardMaterial({ map: tex.yard, roughness: 0.95, metalness: 0.02 }),
    grime: new THREE.MeshBasicMaterial({ map: tex.grime, transparent: true, depthWrite: false }),
    stencil: new THREE.MeshBasicMaterial({ map: tex.stencil, transparent: true, opacity: 0.9, depthWrite: false }),
    concrete: new THREE.MeshStandardMaterial({ map: tex.concrete, roughness: 0.95, metalness: 0.02 }),
    metal: new THREE.MeshStandardMaterial({ map: tex.corrugated, roughness: 0.68, metalness: 0.28 }),
    metalDark: new THREE.MeshStandardMaterial({ map: tex.corrugatedDark, roughness: 0.72, metalness: 0.32 }),
    metalRed: new THREE.MeshStandardMaterial({ map: tex.corrugatedRed, roughness: 0.68, metalness: 0.28 }),
    metalBlue: new THREE.MeshStandardMaterial({ map: tex.corrugatedBlue, roughness: 0.68, metalness: 0.28 }),
    metalGrey: new THREE.MeshStandardMaterial({ map: tex.corrugatedGrey, roughness: 0.68, metalness: 0.28 }),
    carYellow: new THREE.MeshStandardMaterial({ color: new THREE.Color('#d8a018'), roughness: 0.42, metalness: 0.35 }),
    glass: new THREE.MeshStandardMaterial({ color: new THREE.Color('#23282e'), roughness: 0.15, metalness: 0.6 }),
    tire: new THREE.MeshStandardMaterial({ color: new THREE.Color('#14100c'), roughness: 0.95, metalness: 0 }),
    wood: new THREE.MeshStandardMaterial({ map: tex.wood, roughness: 0.9, metalness: 0.02 }),
    hazard: new THREE.MeshStandardMaterial({ map: tex.hazard, roughness: 0.8, metalness: 0.1 }),
    wire: new THREE.MeshStandardMaterial({ map: tex.wire, transparent: false, alphaTest: 0.4, side: THREE.DoubleSide, metalness: 0.7, roughness: 0.35 }),
    cap: new THREE.MeshStandardMaterial({ color: new THREE.Color('#4a3823'), roughness: 0.9, metalness: 0.05 }),
    trim: new THREE.MeshStandardMaterial({ color: new THREE.Color('#6b4a2a'), roughness: 0.7, metalness: 0.35 }),
    sandbag: new THREE.MeshStandardMaterial({ color: new THREE.Color('#6b5a3a'), roughness: 1, metalness: 0 }),
    canvas: new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.canvas), roughness: 0.95, metalness: 0.04 }),
    hairline: new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.hairline), roughness: 0.95, metalness: 0.04 }),
    surface: new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.surface), roughness: 0.95, metalness: 0.04 }),
  };
  const colliders = [];
  const shootables = [];
  // Top-down layout for the minimap / briefing: one rect per above-ground
  // collider (x/z centre + footprint). The floor (y < 0) is excluded.
  const layout = [];

  // A collider box: textured, casts/receives shadows, stops players and bullets.
  function box(width, height, depth, x, y, z, material, collide = true) {
    const mesh = new THREE.Mesh(uvBox(width, height, depth), materials[material]);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    if (collide) {
      colliders.push(new THREE.Box3().setFromObject(mesh));
      shootables.push(mesh);
      if (y > 0) layout.push({ x, z, w: width, d: depth });
    }
    return mesh;
  }

  // Visual-only dressing: same mesh, no collider, no bullet surface.
  function detail(geo, material, x, y, z, ry = 0) {
    const mesh = new THREE.Mesh(geo, materials[material]);
    mesh.position.set(x, y, z);
    if (ry) mesh.rotation.y = ry;
    mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  }
  function detailBox(width, height, depth, x, y, z, material, ry = 0) {
    return detail(uvBox(width, height, depth), material, x, y, z, ry);
  }

  // Container dressing: corner posts, top edge trim, and a hazard kick strip
  // on the face toward the map centre. Sits proud of the collider by 0.03.
  function dressContainer(cx, cz, w, d, h, faceSign) {
    const hw = w / 2;
    const hd = d / 2;
    const top = h;
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        detailBox(0.1, h, 0.1, cx + sx * (hw + 0.02), top / 2, cz + sz * (hd + 0.02), 'trim');
      }
    }
    if (w >= d) {
      detailBox(w + 0.08, 0.1, 0.14, cx, top + 0.02, cz - hd - 0.02, 'trim');
      detailBox(w + 0.08, 0.1, 0.14, cx, top + 0.02, cz + hd + 0.02, 'trim');
      detailBox(w, 0.28, 0.06, cx, 0.16, cz + faceSign * (hd + 0.03), 'hazard');
    } else {
      detailBox(0.14, 0.1, d + 0.08, cx - hw - 0.02, top + 0.02, cz, 'trim');
      detailBox(0.14, 0.1, d + 0.08, cx + hw + 0.02, top + 0.02, cz, 'trim');
      detailBox(0.06, 0.28, d, cx + faceSign * (hw + 0.03), 0.16, cz, 'hazard');
    }
    // Stencilled cargo label ("NF.U" style) on the face toward the map
    // centre, like the photo's door-end markings.
    const stencilGeo = new THREE.PlaneGeometry(1.1, 1.1);
    if (w >= d) {
      detail(stencilGeo, 'stencil', cx, 1.9, cz + faceSign * (hd + 0.04), faceSign < 0 ? Math.PI : 0);
    } else {
      detail(stencilGeo, 'stencil', cx + faceSign * (hw + 0.04), 1.9, cz, faceSign > 0 ? Math.PI / 2 : -Math.PI / 2);
    }
  }

  // Dressing for a stacked second-level container: corner posts only for
  // the upper level (y 2.6..top) plus the top edge trim, so the two levels
  // read as separate boxes instead of one tall wall.
  function dressStack(cx, cz, w, d, top) {
    const hw = w / 2;
    const hd = d / 2;
    const midY = (2.6 + top) / 2;
    const h = top - 2.6;
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        detailBox(0.1, h, 0.1, cx + sx * (hw + 0.02), midY, cz + sz * (hd + 0.02), 'trim');
      }
    }
    if (w >= d) {
      detailBox(w + 0.08, 0.1, 0.14, cx, top + 0.02, cz - hd - 0.02, 'trim');
      detailBox(w + 0.08, 0.1, 0.14, cx, top + 0.02, cz + hd + 0.02, 'trim');
    } else {
      detailBox(0.14, 0.1, d + 0.08, cx - hw - 0.02, top + 0.02, cz, 'trim');
      detailBox(0.14, 0.1, d + 0.08, cx + hw + 0.02, top + 0.02, cz, 'trim');
    }
  }

  // Floor and perimeter, 44 x 36 m, 4.6 m walls. Concrete-slab yard now
  // (photo floor), not sand. Walls use the lighter hairline so their
  // sun-shadowed faces still read as brown, not black.
  box(44.4, 0.4, 36.4, 0, -0.2, 0, 'yard');
  box(0.4, 4.6, 36.4, -22.2, 2.3, 0, 'concrete');
  box(0.4, 4.6, 36.4, 22.2, 2.3, 0, 'concrete');
  box(44.4, 4.6, 0.4, 0, 2.3, -18.2, 'concrete');
  box(44.4, 4.6, 0.4, 0, 2.3, 18.2, 'concrete');
  // Wall caps and pilasters: the perimeter reads as a built yard wall now.
  detailBox(44.8, 0.18, 0.7, 0, 4.68, -18.2, 'cap');
  detailBox(44.8, 0.18, 0.7, 0, 4.68, 18.2, 'cap');
  detailBox(0.7, 0.18, 36.8, -22.2, 4.68, 0, 'cap');
  detailBox(0.7, 0.18, 36.8, 22.2, 4.68, 0, 'cap');
  for (const x of [-18, -12, -6, 0, 6, 12, 18]) {
    detailBox(0.6, 4.6, 0.14, x, 2.3, -17.93, 'concrete');
    detailBox(0.6, 4.6, 0.14, x, 2.3, 17.93, 'concrete');
  }
  for (const z of [-12, -6, 0, 6, 12]) {
    detailBox(0.14, 4.6, 0.6, -21.93, 2.3, z, 'concrete');
    detailBox(0.14, 4.6, 0.6, 21.93, 2.3, z, 'concrete');
  }
  // Base grime: dark gradient skirts along the inner wall bases, like the
  // photo's grimy wall foot. The grime texture repeats every 2 m (UV scaled
  // per plane), transparent at the top so it fades into the wall.
  function grimePlane(w, x, y, z, ry) {
    const geo = new THREE.PlaneGeometry(w, 1.2);
    const uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i += 1) uv.setX(i, uv.getX(i) * (w / 2));
    const mesh = new THREE.Mesh(geo, materials.grime);
    mesh.position.set(x, y, z);
    mesh.rotation.y = ry;
    mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  }
  grimePlane(44.4, 0, 0.6, -17.96, 0);
  grimePlane(44.4, 0, 0.6, 17.96, Math.PI);
  grimePlane(36.4, -21.96, 0.6, 0, Math.PI / 2);
  grimePlane(36.4, 21.96, 0.6, 0, -Math.PI / 2);

  // A-long (west lane) and site A: rust-red and blue containers, the long
  // one stacked two high.
  box(1.2, 2.6, 6, -18, 1.3, -12, 'metalRed');
  box(6, 2.6, 1.2, -13, 1.3, -13, 'metalBlue');
  box(1.2, 1.1, 2.4, -19.5, 0.55, -8, 'wood');
  box(1.2, 1.1, 1.2, -16, 0.55, -6, 'wood');
  box(1.2, 2.6, 2.4, -19, 1.3, -10, 'metalGrey');
  dressContainer(-18, -12, 1.2, 6, 2.6, 1);
  dressContainer(-13, -13, 6, 1.2, 2.6, 1);
  dressContainer(-19, -10, 1.2, 2.4, 2.6, 1);
  // Second level on the long A container: same footprint, grey, top at 5.2.
  box(6, 2.6, 1.2, -13, 3.9, -13, 'metalGrey');
  dressStack(-13, -13, 6, 1.2, 5.2);
  // B-lane (east lane) and site B: blue and rust-red containers, stacked too.
  box(1.2, 2.6, 6, 18, 1.3, -12, 'metalBlue');
  box(6, 2.6, 1.2, 13, 1.3, -13, 'metalRed');
  box(1.2, 1.1, 2.4, 19.5, 0.55, -8, 'wood');
  box(1.2, 1.1, 1.2, 16, 0.55, -6, 'wood');
  box(1.2, 2.6, 2.4, 19, 1.3, -10, 'metalGrey');
  dressContainer(18, -12, 1.2, 6, 2.6, -1);
  dressContainer(13, -13, 6, 1.2, 2.6, 1);
  dressContainer(19, -10, 1.2, 2.4, 2.6, -1);
  box(6, 2.6, 1.2, 13, 3.9, -13, 'metalBlue');
  dressStack(13, -13, 6, 1.2, 5.2);
  // Corner container stacks, south-west and south-east: clear of every
  // waypoint node and edge, so bots never walk through them.
  box(2.6, 2.6, 6, -20.3, 1.3, 14.5, 'metalRed');
  dressContainer(-20.3, 14.5, 2.6, 6, 2.6, 1);
  box(2.6, 2.6, 6, 20.3, 1.3, 14.5, 'metalBlue');
  dressContainer(20.3, 14.5, 2.6, 6, 2.6, -1);
  // Extra cargo for a denser yard: north-lane containers, mid-lane low
  // barriers, flank crates and south crates. Every footprint was checked
  // against the waypoint graph (rect-vs-edge clearance >= 0.6 m, node
  // clearance >= 1 m), so bots never walk through one.
  box(6, 2.6, 1.2, -6, 1.3, -13.5, 'metalRed');
  box(6, 2.6, 1.2, 6, 1.3, -13.5, 'metalBlue');
  dressContainer(-6, -13.5, 6, 1.2, 2.6, 1);
  dressContainer(6, -13.5, 6, 1.2, 2.6, 1);
  box(2.4, 2.6, 1.2, -17.5, 1.3, 2, 'metalGrey');
  box(2.4, 2.6, 1.2, 17.5, 1.3, 2, 'metalRed');
  dressContainer(-17.5, 2, 2.4, 1.2, 2.6, 1);
  dressContainer(17.5, 2, 2.4, 1.2, 2.6, 1);
  box(2.4, 1.1, 1.2, -3, 0.55, 11, 'metalBlue');
  box(2.4, 1.1, 1.2, 3, 0.55, 11, 'metalRed');
  box(1.2, 1.1, 1.2, -11, 0.55, 6, 'wood');
  box(1.2, 1.1, 1.2, 11, 0.55, 6, 'wood');
  box(2.4, 1.1, 1.2, -4, 0.55, -6, 'metalDark');
  box(2.4, 1.1, 1.2, 4, 0.55, -6, 'metalGrey');
  // Stacked wooden crates, photo-style: second level on the flank crates
  // (same footprints) plus single crates piled against the flank containers.
  box(0.8, 0.8, 0.8, -11, 1.5, 6, 'wood');
  box(0.8, 0.8, 0.8, 11, 1.5, 6, 'wood');
  box(1.2, 1.1, 1.2, -15, 0.55, 0.5, 'wood');
  box(1.2, 1.1, 1.2, 15, 0.55, 0.5, 'wood');
  // Second levels on the corner stacks and the short lane containers: same
  // footprints, so no new lane blockage.
  box(2.6, 2.6, 6, -20.3, 3.9, 14.5, 'metalGrey');
  dressStack(-20.3, 14.5, 2.6, 6, 5.2);
  box(2.6, 2.6, 6, 20.3, 3.9, 14.5, 'metalRed');
  dressStack(20.3, 14.5, 2.6, 6, 5.2);
  box(1.2, 2.6, 2.4, -19, 3.9, -10, 'metalBlue');
  dressStack(-19, -10, 1.2, 2.4, 5.2);
  box(1.2, 2.6, 2.4, 19, 3.9, -10, 'metalRed');
  dressStack(19, -10, 1.2, 2.4, 5.2);
  // Mid double-doors: two pillars with a 6.8 m gap between them.
  box(1.2, 3.4, 5, -4, 1.7, -2, 'concrete');
  box(1.2, 3.4, 5, 4, 1.7, -2, 'concrete');
  box(8, 0.6, 1.2, 0, 3.7, -2, 'concrete'); // lintel over the doors
  // Gate dressing: rusted frame strips on the pillar faces, a hazard header
  // hanging in the gap, a roof slab with vents and an antenna above the lintel.
  detailBox(0.14, 3.4, 0.2, -3.33, 1.7, -2, 'trim');
  detailBox(0.14, 3.4, 0.2, 3.33, 1.7, -2, 'trim');
  detailBox(6.8, 0.3, 1.3, 0, 3.25, -2, 'hazard');
  detailBox(9.5, 0.25, 2.2, 0, 4.12, -2, 'concrete');
  detailBox(0.8, 0.5, 0.8, -2.5, 4.5, -2, 'metalDark');
  detailBox(0.8, 0.5, 0.8, 2.5, 4.5, -2, 'metalDark');
  detail(new THREE.CylinderGeometry(0.03, 0.03, 1.3, 6), 'trim', 3.8, 4.9, -2);
  // Mid cover and connector crates: low container-coloured barriers.
  box(6, 1.1, 1.2, 0, 0.55, -10, 'metalDark');
  box(3, 1.1, 1.2, 0, 0.55, 3, 'wood');
  box(1.2, 1.1, 1.2, -10, 0.55, -6, 'wood');
  box(1.2, 1.1, 1.2, 10, 0.55, -6, 'wood');
  box(2.4, 1.1, 1.2, -8, 0.55, 6, 'metalRed');
  box(2.4, 1.1, 1.2, 8, 0.55, 6, 'metalBlue');
  box(2.4, 1.1, 1.2, -16, 0.55, 10, 'wood');
  box(2.4, 1.1, 1.2, 16, 0.55, 10, 'wood');
  box(1.6, 0.7, 1.6, -7.6, 0.35, 12.4, 'wood');
  box(1.6, 0.7, 1.6, 7.6, 0.35, 12.4, 'wood');

  // The yellow car (Cargo Grid's yard car): body + cabin are colliders, wheels
  // and glass are visual. Parked at (13, 3) — clear of every waypoint edge.
  box(4.4, 0.8, 2.0, 13, 0.5, 3, 'carYellow');
  box(2.3, 0.6, 1.8, 12.6, 1.2, 3, 'carYellow');
  detailBox(0.06, 0.5, 1.7, 11.42, 1.2, 3, 'glass');
  detailBox(0.06, 0.5, 1.7, 13.78, 1.2, 3, 'glass');
  detailBox(0.5, 0.12, 0.06, 12.2, 0.62, 1.97, 'glass');
  detailBox(0.5, 0.12, 0.06, 13.8, 0.62, 1.97, 'glass');
  const wheelGeo = new THREE.CylinderGeometry(0.34, 0.34, 0.24, 12);
  for (const [wx, wz] of [[11.5, 2.05], [11.5, 3.95], [14.5, 2.05], [14.5, 3.95]]) {
    const wheel = new THREE.Mesh(wheelGeo, materials.tire);
    wheel.position.set(wx, 0.34, wz);
    wheel.rotation.x = Math.PI / 2;
    wheel.castShadow = true;
    group.add(wheel);
  }
  // Crate stack opposite the car, same clear-lane check.
  box(1.6, 1.6, 1.6, -13, 0.8, 3, 'wood');
  box(1.0, 1.0, 1.0, -13, 2.1, 3, 'wood');

  // Perimeter fencing: posts + top rail standing on the wall caps, like the
  // tall pole fence around the Cargo Grid yard. Visual only.
  const fencePostGeo = new THREE.BoxGeometry(0.09, 1.3, 0.09);
  for (let x = -20; x <= 20; x += 4) {
    detail(fencePostGeo, 'metalDark', x, 5.25, -18.2);
    detail(fencePostGeo, 'metalDark', x, 5.25, 18.2);
  }
  for (let z = -16; z <= 16; z += 4) {
    detail(fencePostGeo, 'metalDark', -22.2, 5.25, z);
    detail(fencePostGeo, 'metalDark', 22.2, 5.25, z);
  }
  detailBox(44.4, 0.08, 0.08, 0, 5.9, -18.2, 'metalDark');
  detailBox(44.4, 0.08, 0.08, 0, 5.9, 18.2, 'metalDark');
  detailBox(0.08, 0.08, 36.4, -22.2, 5.9, 0, 'metalDark');
  detailBox(0.08, 0.08, 36.4, 22.2, 5.9, 0, 'metalDark');
  // Chain-link mesh panels between the fence posts, so the perimeter reads
  // as a wire fence, not bare poles. Visual only — no new colliders.
  const fencePanelGeo = new THREE.PlaneGeometry(3.9, 1.3);
  for (let x = -18; x <= 18; x += 4) {
    detail(fencePanelGeo, 'wire', x, 5.25, -18.2);
    detail(fencePanelGeo, 'wire', x, 5.25, 18.2);
  }
  for (let z = -14; z <= 14; z += 4) {
    detail(fencePanelGeo, 'wire', -22.2, 5.25, z, Math.PI / 2);
    detail(fencePanelGeo, 'wire', 22.2, 5.25, z, Math.PI / 2);
  }

  // Yard props — visual only, placed clear of the waypoint graph so bots
  // never walk through one. Barrels, pallets, sandbags, wall pipes.
  const barrelGeo = new THREE.CylinderGeometry(0.34, 0.34, 0.92, 14);
  const bandGeo = new THREE.CylinderGeometry(0.355, 0.355, 0.1, 14);
  function barrel(x, z) {
    detail(barrelGeo, 'metalDark', x, 0.46, z);
    detail(bandGeo, 'cap', x, 0.5, z);
  }
  barrel(-20.6, 14.2);
  barrel(-19.8, 15.2);
  barrel(-20.4, 15.6);
  barrel(20.6, 14.6);
  barrel(19.9, 15.5);
  barrel(-20.7, -15.8);
  barrel(20.7, -15.6);
  function pallet(x, z, ry, withCrate) {
    detailBox(1.3, 0.1, 1.1, x, 0.06, z, 'wood', ry);
    if (withCrate) detailBox(0.9, 0.7, 0.9, x, 0.46, z, 'wood', ry + 0.2);
  }
  pallet(-20.6, -16.6, 0.15, false);
  pallet(20.7, -16.4, -0.2, false);
  pallet(20.6, 16.2, 0.4, true);
  pallet(-20.5, 16.4, -0.3, true);
  const bagGeo = uvBox(0.55, 0.26, 0.38);
  function sandbags(x, z, ry) {
    for (let i = 0; i < 3; i += 1) detail(bagGeo, 'sandbag', x + (i - 1) * 0.58, 0.13, z, ry + (i % 2 === 0 ? 0.06 : -0.05));
    for (let i = 0; i < 2; i += 1) detail(bagGeo, 'sandbag', x + (i - 0.5) * 0.58, 0.38, z, ry + 0.1);
  }
  sandbags(4.4, -10.2, 0);
  sandbags(-4.4, -10.2, 0);
  sandbags(14.5, -10.2, 0.3);
  sandbags(-14.5, -10.2, -0.3);
  const pipeGeo = new THREE.CylinderGeometry(0.16, 0.16, 16, 10);
  const pipeGeoShort = new THREE.CylinderGeometry(0.16, 0.16, 8, 10);
  function pipe(geo, x, y, z, rz) {
    const mesh = detail(geo, 'metalDark', x, y, z);
    mesh.rotation.z = rz;
    return mesh;
  }
  pipe(pipeGeo, 0, 0.16, 17.7, Math.PI / 2);
  pipe(pipeGeo, 0, 0.48, 17.7, Math.PI / 2);
  pipe(pipeGeoShort, -16, 0.16, -17.7, Math.PI / 2);
  pipe(pipeGeoShort, -16, 0.48, -17.7, Math.PI / 2);

  // Painted yard markings (photo: yellow lane lines, white directional
  // arrow): flat decals on the ground, no collision.
  const lineMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#d8a018'), transparent: true, opacity: 0.75, depthWrite: false });
  function groundLine(w, d, x, z) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), lineMat);
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, 0.015, z);
    group.add(m);
  }
  groundLine(40, 0.3, 0, 4.3);
  groundLine(40, 0.3, 0, 5.0);
  const arrow = new THREE.Mesh(
    new THREE.PlaneGeometry(2.4, 2.4),
    new THREE.MeshBasicMaterial({ map: tex.arrow, transparent: true, opacity: 0.8, depthWrite: false }),
  );
  arrow.rotation.x = -Math.PI / 2; // canvas-up points north (-z) after this
  arrow.position.set(0, 0.018, -6);
  group.add(arrow);

  // Ground variation: oil stains and worn patches lying on the sand.
  const patchGeo = new THREE.PlaneGeometry(1, 1);
  const patchMat = new THREE.MeshBasicMaterial({ map: tex.decal, transparent: true, opacity: 0.22, depthWrite: false });
  for (const [x, z, s, ry] of [[1.5, -6, 3.2, 0.4], [-3, 4, 2.6, 1.2], [12, -12, 2.8, 2.1], [-13, 2, 3.4, 0.8], [6, 12, 2.4, 1.7], [8, 10, 3.0, 0.9], [-8, 10, 2.8, 2.4], [0, -12, 3.0, 0.6], [-3, 13, 2.6, 0.2]]) {
    const patch = new THREE.Mesh(patchGeo, patchMat);
    patch.rotation.x = -Math.PI / 2;
    patch.rotation.z = ry;
    patch.position.set(x, 0.012, z);
    patch.scale.setScalar(s);
    group.add(patch);
  }
  // Extra worn dark asphalt patches, darker than the standard ground decals.
  const asphaltPatchMat = new THREE.MeshBasicMaterial({ map: tex.decal, transparent: true, opacity: 0.4, depthWrite: false });
  for (const [x, z, s, ry] of [[-6, 8, 4.5, 0.3], [9, -3, 5, 1.1]]) {
    const patch = new THREE.Mesh(patchGeo, asphaltPatchMat);
    patch.rotation.x = -Math.PI / 2;
    patch.rotation.z = ry;
    patch.position.set(x, 0.013, z);
    patch.scale.setScalar(s);
    group.add(patch);
  }

  // Site floor markers: flat accent strips spelling the site, plus a green plant zone.
  function siteMarker(cx, cz, label) {
    const zone = new THREE.Mesh(new THREE.PlaneGeometry(6, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.site), transparent: true, opacity: 0.14 }));
    zone.rotation.x = -Math.PI / 2;
    zone.position.set(cx, 0.02, cz);
    group.add(zone);
    const strip = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0.5 }));
    strip.rotation.x = -Math.PI / 2;
    strip.position.set(cx, 0.03, cz);
    group.add(strip);
    // Painted stencil letter on the ground, so the site reads from any angle.
    const letter = new THREE.Mesh(
      new THREE.PlaneGeometry(3.6, 3.6),
      new THREE.MeshBasicMaterial({ map: label === 'A' ? tex.letterA : tex.letterB, transparent: true, opacity: 0.55, depthWrite: false }),
    );
    letter.rotation.x = -Math.PI / 2;
    letter.position.set(cx, 0.025, cz);
    group.add(letter);
  }
  siteMarker(-16, -9, 'A');
  siteMarker(16, -9, 'B');

  // Distant skyline silhouettes outside the walls, for depth in wide shots.
  // Flat unlit material: they sit outside the sun's shadow frustum, so a lit
  // material would render them near-black; a flat warm brown reads as a city.
  const skylineMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#8a6f4d') });
  const roofMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#6a5638') });
  const skyline = [[-30, -26, 8, 14], [-12, -30, 12, 20], [8, -28, 9, 11], [26, -24, 10, 17], [-34, 4, 9, 12], [34, 8, 8, 15], [-26, 20, 10, 9], [14, 26, 11, 13], [-8, -32, 7, 16], [30, -14, 7, 10]];
  const skyRng = mulberry32(7);
  const winColors = ['#ff9a3c', '#ffd9a0', '#9ab8d8'];
  for (const [x, z, w, h] of skyline) {
    const slab = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), skylineMat);
    slab.position.set(x, h / 2, z);
    group.add(slab);
    // Roof furniture: water tank, antenna or AC box, so no roof is a flat slab.
    const pick = skyRng();
    if (pick < 0.35) {
      const tank = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1.8, 10), roofMat);
      tank.position.set(x - w / 5, h + 0.9, z + w / 5);
      group.add(tank);
    } else if (pick < 0.65) {
      const mast = new THREE.Mesh(new THREE.BoxGeometry(0.16, 3.2, 0.16), roofMat);
      mast.position.set(x + w / 4, h + 1.6, z - w / 4);
      group.add(mast);
      const bar = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.1, 0.1), roofMat);
      bar.position.set(x + w / 4, h + 2.6, z - w / 4);
      group.add(bar);
    } else {
      const ac = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.7, 1.2), roofMat);
      ac.position.set(x + w / 5, h + 0.35, z);
      group.add(ac);
    }
  }
  // Lit windows on the skyline faces toward the yard, so the silhouettes read
  // as a distant city instead of black slabs.
  for (const [x, z, w, h] of skyline) {
    const towardMap = Math.abs(x) > Math.abs(z);
    const count = Math.max(1, Math.floor(h / 3.5));
    for (let i = 0; i < count; i += 1) {
      const winMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(winColors[i % winColors.length]), transparent: true, opacity: 0.55 + (i % 3) * 0.15 });
      const win = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.9), winMat);
      const wy = 2.5 + i * 3.2;
      if (towardMap) {
        const sx = Math.sign(-x);
        win.position.set(x + sx * (w / 2 + 0.06), wy, z + (i % 2 === 0 ? -w / 4 : w / 4));
        win.rotation.y = sx > 0 ? Math.PI / 2 : -Math.PI / 2;
      } else {
        const sz = Math.sign(-z);
        win.position.set(x + (i % 2 === 0 ? -w / 4 : w / 4), wy, z + sz * (w / 2 + 0.06));
        win.rotation.y = sz > 0 ? 0 : Math.PI;
      }
      group.add(win);
    }
  }

  // Bright late-afternoon sky dome: light blue overhead, pale warm tan
  // mid-band, pale warm gold horizon, strongest toward the west where the
  // sun sits. A plain ShaderMaterial ignores scene.fog.
  // NOTE: a raw ShaderMaterial outputs its uniforms without the sRGB
  // re-encode the built-in materials get, while THREE.Color('#hex') stores
  // colours in linear working space — so hex uniforms render darker and
  // more saturated than written. Pass the raw sRGB components via setRGB
  // (no conversion) so the dome displays the intended colours.
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      top: { value: new THREE.Color().setRGB(0.48, 0.64, 0.85) },
      mid: { value: new THREE.Color().setRGB(0.76, 0.66, 0.53) },
      horizon: { value: new THREE.Color().setRGB(0.93, 0.76, 0.50) },
    },
    vertexShader: 'varying vec3 vPos; void main() { vPos = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `varying vec3 vPos; uniform vec3 top; uniform vec3 mid; uniform vec3 horizon;
      void main() {
        vec3 d = normalize(vPos);
        float h = d.y;
        vec3 c = h > 0.12 ? mix(mid, top, smoothstep(0.12, 0.65, h)) : mix(horizon, mid, smoothstep(-0.08, 0.12, h));
        float west = max(0.0, dot(d, normalize(vec3(-1.0, 0.0, 0.25))));
        c += vec3(0.12, 0.05, 0.0) * west * (1.0 - abs(h));
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
  scene.add(new THREE.Mesh(new THREE.SphereGeometry(140, 24, 16), skyMat));

  // Bright sunny light: a strong key sun from the west, lower than before
  // so its shadows are long and crisp like the photo's, with sky fill so
  // the shadowed faces still read. The sun sits high enough that most of
  // the yard stays lit.
  scene.add(new THREE.HemisphereLight(new THREE.Color('#8fb0e0'), new THREE.Color('#9a8a6a'), 2.4));
  const sun = new THREE.DirectionalLight(new THREE.Color('#ffd9a8'), 3.2);
  sun.position.set(-18, 16, 6);
  sun.target.position.set(4, 0, -4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -26;
  sun.shadow.camera.right = 26;
  sun.shadow.camera.top = 24;
  sun.shadow.camera.bottom = -24;
  sun.shadow.camera.far = 60;
  sun.shadow.bias = -0.0006;
  scene.add(sun, sun.target);
  const fill = new THREE.DirectionalLight(new THREE.Color('#8a9cc0'), 1.6);
  fill.position.set(0, 12, 18);
  scene.add(fill);
  // Second cool fill from the east so the west containers' east faces read.
  const fillEast = new THREE.DirectionalLight(new THREE.Color('#9ab0d0'), 1.2);
  fillEast.position.set(18, 10, -2);
  scene.add(fillEast);
  for (const [x, z] of [[-16, -9], [16, -9]]) {
    const lamp = new THREE.PointLight(new THREE.Color(PALETTE.accent), 18, 14, 1.6);
    lamp.position.set(x, 4.4, z);
    scene.add(lamp);
  }

  const adjacency = new Map();
  for (let i = 0; i < NODES.length; i += 1) adjacency.set(i, []);
  for (const [a, b] of EDGES) {
    adjacency.get(a).push(b);
    adjacency.get(b).push(a);
  }

  return {
    colliders,
    shootables,
    group,
    layout,
    bounds: { minX: -22.2, maxX: 22.2, minZ: -18.2, maxZ: 18.2 },
    waypoints: { nodes: NODES, adjacency },
    sites: {
      A: { center: { x: -16, z: -9 }, half: 3, node: 6, label: 'A' },
      B: { center: { x: 16, z: -9 }, half: 3, node: 11, label: 'B' },
    },
    spawns: { ash: [0, 1, 2], ember: [25, 26, 27] },
    siteAt(x, z) {
      for (const key of ['A', 'B']) {
        const s = this.sites[key];
        if (Math.abs(x - s.center.x) <= s.half && Math.abs(z - s.center.z) <= s.half) return key;
      }
      return null;
    },
  };
}

// Breadth-first path on the waypoint graph. Returns node ids from start to goal.
export function findPath(waypoints, start, goal) {
  if (start === goal) return [start];
  const prev = new Map([[start, -1]]);
  const queue = [start];
  while (queue.length) {
    const node = queue.shift();
    for (const next of waypoints.adjacency.get(node)) {
      if (prev.has(next)) continue;
      prev.set(next, node);
      if (next === goal) {
        const path = [goal];
        let at = goal;
        while (prev.get(at) !== -1) { at = prev.get(at); path.unshift(at); }
        return path;
      }
      queue.push(next);
    }
  }
  return [start];
}

export function nearestNode(waypoints, x, z) {
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < waypoints.nodes.length; i += 1) {
    const [nx, nz] = waypoints.nodes[i];
    const d = (nx - x) * (nx - x) + (nz - z) * (nz - z);
    if (d < bestD) { bestD = d; best = i; }
  }
  return best;
}
