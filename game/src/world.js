// Ember Yard: an original dusk-lit container yard. Two bomb sites (A west, B east),
// three lanes (A-long, mid double-doors, B-lane) and a defender connector south.
// Every box is a collider for players and a surface bullets stop on. The waypoint
// graph is what the bots walk: nodes at spawns, corners, sites and holds.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

// Waypoint nodes [x, z]. 0-2 ASH spawn, 25-27 EMBER spawn, 6/11 plant spots.
const NODES = [
  [-6, -16], [0, -16], [6, -16], [-19, -15], [-19, -10], [-18, -6], [-16, -9],
  [-14, -8], [19, -15], [19, -10], [18, -6], [16, -9], [14, -8], [0, -14],
  [0, -8], [0, -4], [0, 0], [0, 4], [0, 8], [-8, -8], [8, -8], [-8, 0],
  [8, 0], [-8, 8], [8, 8], [-6, 16], [0, 16], [6, 16], [-11, -9], [11, -9],
  [-16, 12], [16, 12],
];
const EDGES = [
  [0, 1], [1, 2], [0, 3], [1, 13], [2, 8], [3, 4], [4, 5], [5, 7], [4, 6],
  [6, 7], [5, 28], [7, 28], [28, 19], [28, 14], [8, 9], [9, 10], [10, 12],
  [9, 11], [11, 12], [10, 29], [12, 29], [29, 20], [29, 14], [13, 14], [14, 15],
  [15, 16], [16, 17], [17, 18], [13, 19], [13, 20], [14, 19], [14, 20],
  [19, 21], [20, 22], [15, 21], [15, 22], [16, 21], [16, 22], [21, 23],
  [22, 24], [17, 23], [17, 24], [18, 23], [18, 24], [23, 30], [24, 31],
  [30, 25], [31, 27], [25, 26], [26, 27], [23, 25], [24, 27], [18, 26],
  [5, 21], [10, 22],
];

export function createWorld(scene) {
  const group = new THREE.Group();
  scene.add(group);
  const materials = {};
  for (const name of Object.keys(PALETTE)) {
    materials[name] = new THREE.MeshStandardMaterial({
      color: new THREE.Color(PALETTE[name]),
      roughness: name === 'accent' || name === 'ink' ? 0.5 : 0.95,
      metalness: 0.04,
    });
  }
  const colliders = [];
  const shootables = [];

  function box(width, height, depth, x, y, z, material, collide = true) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), materials[material]);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    if (collide) {
      colliders.push(new THREE.Box3().setFromObject(mesh));
      shootables.push(mesh);
    }
    return mesh;
  }

  // Floor and perimeter, 44 x 36 m, 4.6 m walls. Walls use the lighter hairline
  // so their sun-shadowed faces still read as brown, not black.
  box(44.4, 0.4, 36.4, 0, -0.2, 0, 'canvas');
  box(0.4, 4.6, 36.4, -22.2, 2.3, 0, 'hairline');
  box(0.4, 4.6, 36.4, 22.2, 2.3, 0, 'hairline');
  box(44.4, 4.6, 0.4, 0, 2.3, -18.2, 'hairline');
  box(44.4, 4.6, 0.4, 0, 2.3, 18.2, 'hairline');

  // A-long (west lane) and site A.
  box(1.2, 2.6, 6, -18, 1.3, -12, 'hairline');
  box(6, 2.6, 1.2, -13, 1.3, -13, 'hairline');
  box(1.2, 1.1, 2.4, -19.5, 0.55, -8, 'hairline');
  box(1.2, 1.1, 1.2, -16, 0.55, -6, 'hairline');
  box(1.2, 2.6, 2.4, -19, 1.3, -10, 'surface');
  // B-lane (east lane) and site B.
  box(1.2, 2.6, 6, 18, 1.3, -12, 'hairline');
  box(6, 2.6, 1.2, 13, 1.3, -13, 'hairline');
  box(1.2, 1.1, 2.4, 19.5, 0.55, -8, 'hairline');
  box(1.2, 1.1, 1.2, 16, 0.55, -6, 'hairline');
  box(1.2, 2.6, 2.4, 19, 1.3, -10, 'surface');
  // Mid double-doors: two pillars with a 6.8 m gap between them.
  box(1.2, 3.4, 5, -4, 1.7, -2, 'surface');
  box(1.2, 3.4, 5, 4, 1.7, -2, 'surface');
  box(8, 0.6, 1.2, 0, 3.7, -2, 'surface'); // lintel over the doors
  // Mid cover and connector crates.
  box(6, 1.1, 1.2, 0, 0.55, -10, 'hairline');
  box(3, 1.1, 1.2, 0, 0.55, 3, 'hairline');
  box(1.2, 1.1, 1.2, -10, 0.55, -6, 'hairline');
  box(1.2, 1.1, 1.2, 10, 0.55, -6, 'hairline');
  box(2.4, 1.1, 1.2, -8, 0.55, 6, 'hairline');
  box(2.4, 1.1, 1.2, 8, 0.55, 6, 'hairline');
  box(2.4, 1.1, 1.2, -16, 0.55, 10, 'hairline');
  box(2.4, 1.1, 1.2, 16, 0.55, 10, 'hairline');
  box(1.6, 0.7, 1.6, -7.6, 0.35, 12.4, 'hairline');
  box(1.6, 0.7, 1.6, 7.6, 0.35, 12.4, 'hairline');

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
    void label;
  }
  siteMarker(-16, -9, 'A');
  siteMarker(16, -9, 'B');

  // Distant skyline silhouettes outside the walls, for depth in wide shots.
  // Flat unlit material: they sit outside the sun's shadow frustum, so a lit
  // material would render them near-black; a flat warm brown reads as a city.
  const skylineMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#54402a') });
  const skyline = [[-30, -26, 8, 14], [-12, -30, 12, 20], [8, -28, 9, 11], [26, -24, 10, 17], [-34, 4, 9, 12], [34, 8, 8, 15]];
  for (const [x, z, w, h] of skyline) {
    const slab = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), skylineMat);
    slab.position.set(x, h / 2, z);
    group.add(slab);
  }
  // Lit windows on the skyline faces toward the yard, so the silhouettes read
  // as a distant city instead of black slabs.
  const winMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0.85 });
  for (const [x, z, w, h] of skyline) {
    const towardMap = Math.abs(x) > Math.abs(z);
    const count = Math.max(1, Math.floor(h / 5));
    for (let i = 0; i < count; i += 1) {
      const win = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.9), winMat);
      const wy = 2.5 + i * 4;
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

  // Dusk sky dome: deep blue overhead, warm ember band at the horizon, strongest
  // toward the west where the sun sits. A plain ShaderMaterial ignores scene.fog.
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      top: { value: new THREE.Color('#141c30') },
      mid: { value: new THREE.Color('#3a2a20') },
      horizon: { value: new THREE.Color('#7a4522') },
    },
    vertexShader: 'varying vec3 vPos; void main() { vPos = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `varying vec3 vPos; uniform vec3 top; uniform vec3 mid; uniform vec3 horizon;
      void main() {
        vec3 d = normalize(vPos);
        float h = d.y;
        vec3 c = h > 0.12 ? mix(mid, top, smoothstep(0.12, 0.65, h)) : mix(horizon, mid, smoothstep(-0.08, 0.12, h));
        float west = max(0.0, dot(d, normalize(vec3(-1.0, 0.0, 0.25))));
        c += vec3(0.22, 0.09, 0.0) * west * (1.0 - abs(h));
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
  scene.add(new THREE.Mesh(new THREE.SphereGeometry(140, 24, 16), skyMat));

  // Dusk light: a low warm sun from the west, cool sky fill, ember points at the sites.
  scene.add(new THREE.HemisphereLight(new THREE.Color('#3a4a70'), new THREE.Color(PALETTE.hairline), 1.8));
  const sun = new THREE.DirectionalLight(new THREE.Color('#ffb066'), 2.4);
  sun.position.set(-18, 12, 6);
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
  const fill = new THREE.DirectionalLight(new THREE.Color('#5a6a8a'), 1.4);
  fill.position.set(0, 12, 18);
  scene.add(fill);
  // Second cool fill from the east so the west containers' east faces read.
  const fillEast = new THREE.DirectionalLight(new THREE.Color('#6a7a9a'), 1.0);
  fillEast.position.set(18, 10, -2);
  scene.add(fillEast);
  for (const [x, z] of [[-16, -9], [16, -9]]) {
    const lamp = new THREE.PointLight(new THREE.Color(PALETTE.accent), 14, 14, 1.6);
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
