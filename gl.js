/* ════════════════════════════════════════════════════════════════
   3D layer — one fixed WebGL canvas, several scissored "views":
     · hero  — the four face-button shapes floating behind the player
     · items — one inspectable object in each mode header
               (cricket ball, football, brass round, pickleball, X & O)
   Each view draws into the on-screen rect of its DOM placeholder, so the
   page stays plain HTML and the canvas only ever paints behind it.
   Patterns on the balls are computed per-pixel in the shader from the
   object-space position, so they stay crisp at any size.
   ════════════════════════════════════════════════════════════════ */
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

const root = document.documentElement;
const canvas = document.getElementById('gl');
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

function webglSupported() {
  try {
    const c = document.createElement('canvas');
    return !!(window.WebGL2RenderingContext && c.getContext('webgl2'));
  } catch {
    return false;
  }
}

if (canvas && webglSupported()) {
  try {
    start();
  } catch (err) {
    console.warn('3D layer disabled:', err);
    root.classList.add('no-webgl');
  }
} else {
  root.classList.add('no-webgl');
}

function start() {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.setClearColor(0x000000, 0);
  renderer.autoClear = false;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.05;

  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = new RoomEnvironment();
  const env = pmrem.fromScene(envScene, 0.04).texture;
  pmrem.dispose();

  const disposables = new Set();
  const track = (obj) => { disposables.add(obj); return obj; };

  const COLOR = {
    tri: 0x2fd3a8,
    cir: 0xff5468,
    crs: 0x7aa8ff,
    sqr: 0xf38bd0,
  };

  /* ── Shared helpers ─────────────────────────────────────────── */
  function addLights(scene, envIntensity = 0.85) {
    scene.environment = env;
    scene.environmentIntensity = envIntensity;
    const key = new THREE.DirectionalLight(0xffffff, 2.2);
    key.position.set(3, 4, 6);
    const rim = new THREE.DirectionalLight(0x4b8dff, 3.2);
    rim.position.set(-5, 2, -4);
    const fill = new THREE.HemisphereLight(0xbcd2ff, 0x090b16, 0.45);
    scene.add(key, rim, fill);
  }

  const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
  const easeOutBack = (t) => {
    const c1 = 1.5, c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  };
  const clamp01 = (v) => Math.min(1, Math.max(0, v));
  const damp = (a, b, lambda, dt) => a + (b - a) * (1 - Math.exp(-lambda * dt));

  /* ── Face-button geometry ───────────────────────────────────── */
  const EXTRUDE = { depth: 0.22, bevelEnabled: true, bevelThickness: 0.08, bevelSize: 0.065, bevelSegments: 5, curveSegments: 48 };

  function ringPolygon(sides, radius, rotation, holeRatio) {
    const shape = new THREE.Shape();
    const hole = new THREE.Path();
    for (let i = 0; i < sides; i++) {
      const a = rotation + (i / sides) * Math.PI * 2;
      const x = Math.cos(a) * radius, y = Math.sin(a) * radius;
      i ? shape.lineTo(x, y) : shape.moveTo(x, y);
    }
    shape.closePath();
    for (let i = sides - 1; i >= 0; i--) {
      const a = rotation + (i / sides) * Math.PI * 2;
      const x = Math.cos(a) * radius * holeRatio, y = Math.sin(a) * radius * holeRatio;
      i === sides - 1 ? hole.moveTo(x, y) : hole.lineTo(x, y);
    }
    hole.closePath();
    shape.holes.push(hole);
    return shape;
  }

  function crossShape(arm = 0.8, half = 0.17) {
    const pts = [
      [half, arm], [-half, arm], [-half, half], [-arm, half], [-arm, -half], [-half, -half],
      [-half, -arm], [half, -arm], [half, -half], [arm, -half], [arm, half], [half, half],
    ];
    const r = Math.PI / 4;
    const shape = new THREE.Shape();
    pts.forEach(([x, y], i) => {
      const rx = x * Math.cos(r) - y * Math.sin(r);
      const ry = x * Math.sin(r) + y * Math.cos(r);
      i ? shape.lineTo(rx, ry) : shape.moveTo(rx, ry);
    });
    shape.closePath();
    return shape;
  }

  function extruded(shape) {
    const g = new THREE.ExtrudeGeometry(shape, EXTRUDE);
    g.center();
    return track(g);
  }

  const GEO = {
    tri: extruded(ringPolygon(3, 0.86, Math.PI / 2, 0.5)),
    sqr: extruded(ringPolygon(4, 0.8, Math.PI / 4, 0.6)),
    crs: extruded(crossShape()),
    cir: track(new THREE.TorusGeometry(0.62, 0.17, 40, 128)),
  };

  const glossy = (hex) => track(new THREE.MeshPhysicalMaterial({
    color: hex,
    roughness: 0.24,
    metalness: 0,
    clearcoat: 1,
    clearcoatRoughness: 0.1,
    emissive: hex,
    emissiveIntensity: 0.05,
  }));
  const MAT = { tri: glossy(COLOR.tri), cir: glossy(COLOR.cir), crs: glossy(COLOR.crs), sqr: glossy(COLOR.sqr) };

  /* ── Ball patterns (shader injection) ───────────────────────── */
  const GLSL_HELPERS = `
    vec3 s2l(vec3 c) { return pow(c, vec3(2.2)); }
    float hash3(vec3 p) {
      p = fract(p * 0.3183099 + 0.1);
      p *= 17.0;
      return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
    }
    float vnoise(vec3 x) {
      vec3 i = floor(x), f = fract(x);
      f = f * f * (3.0 - 2.0 * f);
      return mix(
        mix(mix(hash3(i), hash3(i + vec3(1, 0, 0)), f.x), mix(hash3(i + vec3(0, 1, 0)), hash3(i + vec3(1, 1, 0)), f.x), f.y),
        mix(mix(hash3(i + vec3(0, 0, 1)), hash3(i + vec3(1, 0, 1)), f.x), mix(hash3(i + vec3(0, 1, 1)), hash3(i + vec3(1, 1, 1)), f.x), f.y),
        f.z);
    }
    // Screen-space bump from a procedural height (raised stitches, grooves)
    vec3 patBump(vec3 surfPos, vec3 surfNorm, float h, float scale) {
      vec3 dpx = dFdx(surfPos), dpy = dFdy(surfPos);
      vec3 r1 = cross(dpy, surfNorm), r2 = cross(surfNorm, dpx);
      float det = dot(dpx, r1);
      vec2 dh = vec2(dFdx(h), dFdy(h)) * scale;
      vec3 grad = sign(det) * (dh.x * r1 + dh.y * r2);
      return normalize(abs(det) * surfNorm - grad);
    }
  `;

  function withPattern(material, key, uniforms, head, body, { bump = null } = {}) {
    if (bump) uniforms.uBump = bump;
    material.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, uniforms);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vObj;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvObj = position;');
      let frag = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vObj;\n' + GLSL_HELPERS + (bump ? 'uniform float uBump;\n' : '') + head)
        .replace('vec4 diffuseColor = vec4( diffuse, opacity );', body)
        .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, patRough, patRoughMix);');
      if (bump) {
        frag = frag.replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\nnormal = patBump(-vViewPosition, normal, patH, uBump);');
      }
      shader.fragmentShader = frag;
    };
    material.customProgramCacheKey = () => key;
    return material;
  }

  const SPHERE = track(new THREE.SphereGeometry(1, 128, 96));

  // Sphere with a physically raised primary seam (silhouette reads when edge-on)
  function seamedSphere() {
    let g = new THREE.SphereGeometry(1, 256, 320);
    g.deleteAttribute('uv');
    g.deleteAttribute('normal');
    g = mergeVertices(g, 1e-5);
    const pos = g.getAttribute('position');
    const v = new THREE.Vector3();
    const ss = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      const lat = Math.abs(Math.asin(Math.max(-1, Math.min(1, v.y))));
      const ridge = 0.022 * (1 - ss(0.11, 0.15, lat));
      v.multiplyScalar(1 + ridge);
      pos.setXYZ(i, v.x, v.y, v.z);
    }
    g.computeVertexNormals();
    return track(g);
  }

  // Red leather match ball: raised primary seam with six rows of stitching
  // around a centre join, two quarter seams, one polished hemisphere.
  function cricketBall() {
    const bump = { value: 0.01 };
    const mat = withPattern(track(new THREE.MeshPhysicalMaterial({
      color: 0xffffff, roughness: 0.42, clearcoat: 0.28, clearcoatRoughness: 0.35,
    })), 'cricket-v3', {}, '', `
      vec3 p = normalize(vObj);
      float lat = asin(clamp(p.y, -1.0, 1.0));
      float aLat = abs(lat);
      float side = lat >= 0.0 ? 1.0 : -1.0;
      float lon = atan(p.z, p.x);

      float n1 = vnoise(p * 5.0), n2 = vnoise(p * 24.0), n3 = vnoise(p * 95.0);
      vec3 leather = s2l(vec3(0.5, 0.045, 0.06)) * (0.88 + 0.14 * n1 + 0.06 * n2);

      // Primary seam: raised band, three rows of slanted stitches on each side of the join
      float band = 1.0 - smoothstep(0.122, 0.134, aLat);
      float rows = 0.0, rowsH = 0.0;
      for (int k = 0; k < 3; k++) {
        float c = 0.03 + float(k) * 0.033;
        float across = 1.0 - smoothstep(0.008, 0.0135, abs(aLat - c));
        float slant = (k == 1 ? -1.0 : 1.0) * side;
        float u = lon * (62.0 / 6.2831853) + (aLat - c) * 48.0 * slant + float(k) * 0.37;
        float along = abs(fract(u) - 0.5) * 2.0;
        float st = across * (1.0 - smoothstep(0.55, 0.85, along));
        rows = max(rows, st);
        rowsH = max(rowsH, across * (1.0 - along * along));
      }
      float join = 1.0 - smoothstep(0.004, 0.009, aLat);

      // Quarter seams: a fine groove on the x = 0 great circle with tiny stitch marks either side
      float qd = abs(p.x);
      float outside = 1.0 - band;
      float quarter = (1.0 - smoothstep(0.0022, 0.0055, qd)) * outside;
      float qa = atan(p.y, p.z);
      float qdots = (1.0 - smoothstep(0.003, 0.0055, abs(qd - 0.0125)))
                  * (1.0 - smoothstep(0.3, 0.62, abs(fract(qa * (120.0 / 6.2831853)) - 0.5) * 2.0)) * outside;

      vec3 thread = s2l(vec3(0.95, 0.92, 0.84)) * (0.9 + 0.1 * vnoise(p * 160.0));
      vec3 col = leather;
      col = mix(col, leather * 0.7, band);
      col = mix(col, thread, rows);
      col = mix(col, leather * 0.3, join * band);
      col = mix(col, leather * 0.45, quarter);
      col = mix(col, leather * 0.78, qdots);

      // One side polished, the other scuffed
      float shiny = smoothstep(-0.2, 0.25, p.y);
      float patRough = mix(0.55, 0.3, shiny) + n2 * 0.06;
      patRough = mix(patRough, 0.85, rows);
      float patRoughMix = 1.0;

      float patH = band * 0.3 + rowsH * 0.75 - join * 0.55 - quarter * 0.45 + qdots * 0.2 + (n3 - 0.5) * 0.03;
      vec4 diffuseColor = vec4(col, opacity);
    `, { bump });
    const mesh = new THREE.Mesh(seamedSphere(), mat);
    mesh.rotation.set(1.1, 0, 0.4);
    mesh.userData.bump = bump;
    return mesh;
  }

  function football() {
    // Truncated icosahedron: pentagons centred on the 12 icosahedron vertices,
    // hexagons centred on its 20 faces.
    const ico = new THREE.IcosahedronGeometry(1, 0);
    const pos = ico.getAttribute('position');
    const verts = [];
    for (let i = 0; i < pos.count; i++) {
      const v = new THREE.Vector3().fromBufferAttribute(pos, i).normalize();
      if (!verts.some((w) => w.distanceTo(v) < 1e-4)) verts.push(v);
    }
    const hexes = [];
    for (let i = 0; i < pos.count; i += 3) {
      const a = new THREE.Vector3().fromBufferAttribute(pos, i);
      const b = new THREE.Vector3().fromBufferAttribute(pos, i + 1);
      const c = new THREE.Vector3().fromBufferAttribute(pos, i + 2);
      hexes.push(a.add(b).add(c).normalize());
    }
    ico.dispose();
    const neighbours = (c) => verts.filter((v) => v !== c && Math.abs(v.dot(c) - 1 / Math.sqrt(5)) < 1e-3);
    const refs = verts.map((c) => neighbours(c)[0]);

    // Inradius of a pentagon in the gnomonic (tangent-plane) projection
    const c0 = verts[0];
    const n = neighbours(c0);
    const n1 = n[0];
    const n2 = n.find((v) => v !== n1 && Math.abs(v.dot(n1) - 1 / Math.sqrt(5)) < 1e-3);
    const project = (q) => q.clone().divideScalar(q.dot(c0)).sub(c0);
    const q1 = c0.clone().lerp(n1, 1 / 3);
    const q2 = c0.clone().lerp(n2, 1 / 3);
    const rIn = project(q1).add(project(q2)).multiplyScalar(0.5).length();

    const mat = withPattern(track(new THREE.MeshPhysicalMaterial({
      color: 0xffffff, roughness: 0.42, clearcoat: 0.55, clearcoatRoughness: 0.3,
    })), 'football', {
      uPent: { value: verts },
      uPentRef: { value: refs },
      uHex: { value: hexes },
      uRin: { value: rIn },
    }, `
      uniform vec3 uPent[12];
      uniform vec3 uPentRef[12];
      uniform vec3 uHex[20];
      uniform float uRin;
    `, `
      vec3 p = normalize(vObj);
      float best = -2.0; vec3 c = vec3(0.0); vec3 r = vec3(0.0);
      for (int i = 0; i < 12; i++) {
        float d = dot(p, uPent[i]);
        if (d > best) { best = d; c = uPent[i]; r = uPentRef[i]; }
      }
      vec3 ax = normalize(r - c * dot(r, c));
      vec3 ay = cross(c, ax);
      vec3 t = p - c * dot(p, c);
      float rad = length(t) / max(dot(p, c), 1e-3);
      float ang = atan(dot(t, ay), dot(t, ax));
      float seg = 6.2831853 / 5.0;
      float a = mod(ang, seg) - seg * 0.5;
      float edge = uRin / cos(a);
      float pent = 1.0 - smoothstep(edge - 0.008, edge + 0.002, rad);
      float b1 = -2.0, b2 = -2.0;
      for (int i = 0; i < 20; i++) {
        float d = dot(p, uHex[i]);
        if (d > b1) { b2 = b1; b1 = d; } else if (d > b2) { b2 = d; }
      }
      float seam = 1.0 - smoothstep(0.006, 0.013, b1 - b2);
      float ring = (1.0 - smoothstep(0.0, 0.014, abs(rad - edge))) * (1.0 - pent);
      vec3 col = s2l(vec3(0.95, 0.95, 0.96));
      col = mix(col, s2l(vec3(0.62, 0.64, 0.7)), max(seam, ring));
      col = mix(col, s2l(vec3(0.05, 0.055, 0.07)), pent);
      float patRough = 0.6;
      float patRoughMix = max(seam, ring) * 0.8;
      vec4 diffuseColor = vec4(col, opacity);
    `);
    const mesh = new THREE.Mesh(SPHERE, mat);
    mesh.rotation.set(0.4, 0.2, 0.1);
    return mesh;
  }

  function pickleball() {
    // 40 holes spread evenly (Fibonacci sphere)
    const holes = [];
    const N = 40, golden = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < N; i++) {
      const y = 1 - (i / (N - 1)) * 2;
      const rr = Math.sqrt(1 - y * y);
      const th = golden * i;
      holes.push(new THREE.Vector3(Math.cos(th) * rr, y, Math.sin(th) * rr));
    }
    const mat = withPattern(track(new THREE.MeshPhysicalMaterial({
      color: 0xffffff, roughness: 0.5, clearcoat: 0.3, clearcoatRoughness: 0.4, side: THREE.DoubleSide,
    })), 'pickle', { uHoles: { value: holes } }, `
      uniform vec3 uHoles[40];
    `, `
      vec3 p = normalize(vObj);
      float h = -1.0;
      for (int i = 0; i < 40; i++) h = max(h, dot(p, uHoles[i]));
      if (h > 0.9925) discard;
      float rim = smoothstep(0.986, 0.9925, h);
      vec3 col = s2l(vec3(0.86, 0.95, 0.27));
      col *= mix(1.0, 0.7, rim);
      if (!gl_FrontFacing) col *= 0.32;
      float patRough = 0.7;
      float patRoughMix = rim;
      vec4 diffuseColor = vec4(col, opacity);
    `);
    return new THREE.Mesh(SPHERE, mat);
  }

  function brassRound() {
    const toPts = (list) => list.map(([r, y]) => new THREE.Vector2(r, y));
    const casing = track(new THREE.LatheGeometry(toPts([
      [0, -1.1], [0.285, -1.1], [0.3, -1.08], [0.3, -1.0], [0.252, -0.97], [0.252, -0.9],
      [0.29, -0.86], [0.29, 0.28], [0.268, 0.37], [0.25, 0.44], [0.25, 0.52], [0, 0.52],
    ]), 96));
    const tip = track(new THREE.LatheGeometry(toPts([
      [0, 0.45], [0.247, 0.45], [0.247, 0.62], [0.24, 0.72], [0.222, 0.84], [0.186, 0.95],
      [0.142, 1.04], [0.088, 1.1], [0.034, 1.132], [0, 1.136],
    ]), 96));
    const brass = track(new THREE.MeshPhysicalMaterial({ color: 0xd9a845, metalness: 1, roughness: 0.27, clearcoat: 0.4 }));
    const copper = track(new THREE.MeshPhysicalMaterial({ color: 0xc36f40, metalness: 1, roughness: 0.3 }));
    const g = new THREE.Group();
    g.add(new THREE.Mesh(casing, brass), new THREE.Mesh(tip, copper));
    g.rotation.set(0.25, 0, -0.62);
    g.scale.setScalar(0.98);
    return g;
  }

  function xAndO() {
    const g = new THREE.Group();
    const o = new THREE.Mesh(GEO.cir, MAT.cir);
    const x = new THREE.Mesh(GEO.crs, MAT.crs);
    o.position.set(-0.5, 0.2, 0);
    x.position.set(0.5, -0.2, 0);
    o.scale.setScalar(0.68);
    x.scale.setScalar(0.74);
    o.userData.spin = new THREE.Vector3(0.5, 0.8, 0);
    x.userData.spin = new THREE.Vector3(-0.4, 0.6, 0.2);
    o.userData.baseY = o.position.y;
    x.userData.baseY = x.position.y;
    g.add(o, x);
    return g;
  }

  const BUILD = { cricket: cricketBall, football, round: brassRound, pickleball, xo: xAndO };

  /* ── Hero view: face-button shapes behind the player ────────── */
  // [shape, wide x, wide y, z, scale,  tall x, tall y, tall scale] — x/y are -1..1 across the stage
  const HERO_LAYOUT = [
    ['cir',  0.95,  0.5,  -1.6, 1.25,   0.78,  0.78, 0.9],
    ['tri',  0.26,  0.78, -3.0, 1.0,   -0.76,  0.86, 0.85],
    ['sqr',  0.88, -0.36, -2.6, 0.9,    0.74,  0.42, 0.7],
    ['crs',  0.14,  0.05, -4.5, 0.8,   -0.8,   0.5,  0.65],
    ['crs', -0.5,   0.84, -10,  0.6,    0.3,   0.98, 0.7],
    ['tri',  0.57,  0.93, -10,  0.95,   0,     0,    0],
    ['cir', -0.76, -0.66, -6.0, 0.8,    0,     0,    0],
    ['sqr',  0.9,  -0.74, -3.4, 0.7,    0,     0,    0],
  ];

  function heroView(el) {
    const scene = new THREE.Scene();
    addLights(scene, 0.9);
    scene.fog = new THREE.Fog(0x0a1024, 14, 30);
    const camZ = 16;
    const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 60);
    camera.position.set(0, 0, camZ);

    const shapes = HERO_LAYOUT.map((row, i) => {
      const [type] = row;
      const mesh = new THREE.Mesh(GEO[type], MAT[type]);
      mesh.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
      scene.add(mesh);
      return {
        mesh, row, i,
        base: new THREE.Vector3(),
        scale: 1,
        spin: new THREE.Vector3((Math.random() - 0.5) * 0.5, (Math.random() - 0.5) * 0.7, (Math.random() - 0.5) * 0.3),
        phase: Math.random() * Math.PI * 2,
      };
    });

    let aspect = 0;
    const tanHalf = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    function layout() {
      const tall = aspect < 0.78;
      const k = Math.pow(Math.min(1, aspect / 1.27), 0.8);
      shapes.forEach((s) => {
        const [, wx, wy, z, ws, tx, ty, ts] = s.row;
        const nx = tall ? tx : wx, ny = tall ? ty : wy;
        const halfH = tanHalf * (camZ - z);
        s.base.set(nx * halfH * aspect, ny * halfH, z);
        s.scale = (tall ? ts : ws) * k;
        s.mesh.visible = s.scale > 0;
      });
    }

    const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
    const onMove = (e) => {
      if (e.pointerType !== 'mouse') return;
      pointer.tx = (e.clientX / window.innerWidth) * 2 - 1;
      pointer.ty = -((e.clientY / window.innerHeight) * 2 - 1);
    };
    const onLeave = () => { pointer.tx = 0; pointer.ty = 0; };
    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('blur', onLeave);
    document.addEventListener('mouseleave', onLeave);

    let born = -1;

    return {
      el,
      scene,
      camera,
      inView: true,
      update(dt, t, rect) {
        const a = rect.width / rect.height;
        if (Math.abs(a - aspect) > 1e-3) {
          aspect = a;
          camera.aspect = a;
          camera.updateProjectionMatrix();
          layout();
        }
        if (born < 0) born = t;

        const heroH = rect.height / 1.26;
        const leave = reduceMotion ? 0 : clamp01(-rect.top / heroH);

        if (!reduceMotion) {
          pointer.x = damp(pointer.x, pointer.tx, 3, dt);
          pointer.y = damp(pointer.y, pointer.ty, 3, dt);
          camera.position.x = pointer.x * 0.7;
          camera.position.y = pointer.y * 0.45;
          camera.lookAt(0, 0, 0);
        }

        shapes.forEach((s) => {
          const appear = reduceMotion ? 1 : clamp01((t - born - 0.15 - s.i * 0.07) / 1.3);
          const depth = 1 + (-s.base.z) * 0.12;
          const sc = s.scale * (reduceMotion ? 1 : easeOutBack(appear));
          s.mesh.scale.setScalar(Math.max(sc, 1e-4));
          s.mesh.position.set(
            s.base.x,
            s.base.y + (reduceMotion ? 0 : Math.sin(t * 0.6 + s.phase) * 0.14 + leave * 3.2 / depth),
            s.base.z - (1 - easeOutCubic(appear)) * 7,
          );
          if (!reduceMotion) {
            const boost = 1 + leave * 2.5 + (1 - appear) * 4;
            s.mesh.rotation.x += s.spin.x * dt * boost;
            s.mesh.rotation.y += s.spin.y * dt * boost;
            s.mesh.rotation.z += s.spin.z * dt * boost;
          }
        });
      },
      dispose() {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('blur', onLeave);
        document.removeEventListener('mouseleave', onLeave);
      },
    };
  }

  /* ── Props for the section moments ──────────────────────────── */
  const AXIS_X = new THREE.Vector3(1, 0, 0);
  const AXIS_Y = new THREE.Vector3(0, 1, 0);
  const AXIS_Z = new THREE.Vector3(0, 0, 1);

  // Cricket bat (held by the batsman), pivot at the top of the handle; the blade hangs down -y
  function buildBat(mat) {
    const w = 0.5, L = 5.4, r = 0.34;
    const shape = new THREE.Shape();
    shape.moveTo(-w + r, 0);
    shape.lineTo(w - r, 0);
    shape.quadraticCurveTo(w, 0, w, r);
    shape.lineTo(w, L - 0.55);
    shape.quadraticCurveTo(w, L - 0.05, 0.2, L + 0.15);
    shape.lineTo(-0.2, L + 0.15);
    shape.quadraticCurveTo(-w, L - 0.05, -w, L - 0.55);
    shape.lineTo(-w, r);
    shape.quadraticCurveTo(-w, 0, -w + r, 0);
    const blade = new THREE.ExtrudeGeometry(shape, { depth: 0.2, bevelEnabled: true, bevelThickness: 0.13, bevelSize: 0.07, bevelSegments: 5, curveSegments: 20 });
    blade.translate(0, 0, -0.1);
    const handleLen = 2.9;
    const top = L + 0.1 + handleLen;
    const handle = new THREE.CylinderGeometry(0.15, 0.17, handleLen, 40);
    handle.translate(0, L + 0.1 + handleLen / 2, 0);
    const band = new THREE.CylinderGeometry(0.178, 0.178, 0.3, 40);
    band.translate(0, top - 0.55, 0);
    const cap = new THREE.SphereGeometry(0.16, 24, 12);
    cap.translate(0, top, 0);
    [blade, handle, band, cap].forEach((g) => { g.translate(0, -top, 0); track(g); });

    const g = new THREE.Group();
    [blade, handle, band, cap].forEach((geo) => g.add(new THREE.Mesh(geo, mat)));
    g.userData.sweet = top - L * 0.32; // distance from the hands to the sweet spot
    return g;
  }

  // Pickleball paddle (held by the player), pivot at the butt of the handle; the face points up +y
  function buildPaddle(mat) {
    const W = 0.78, H1 = 1.75;
    const shape = new THREE.Shape();
    shape.moveTo(-0.22, 0);
    shape.lineTo(0.22, 0);
    shape.bezierCurveTo(0.5, 0.05, W, 0.22, W, 0.55);
    shape.lineTo(W, 1.3);
    shape.quadraticCurveTo(W, H1, W - 0.42, H1);
    shape.lineTo(-W + 0.42, H1);
    shape.quadraticCurveTo(-W, H1, -W, 1.3);
    shape.lineTo(-W, 0.55);
    shape.bezierCurveTo(-W, 0.22, -0.5, 0.05, -0.22, 0);
    const face = new THREE.ExtrudeGeometry(shape, { depth: 0.07, bevelEnabled: true, bevelThickness: 0.035, bevelSize: 0.03, bevelSegments: 3, curveSegments: 24 });
    face.translate(0, 0, -0.035);
    const handleLen = 1.05;
    const handle = new THREE.CylinderGeometry(0.13, 0.15, handleLen, 32);
    handle.translate(0, -handleLen / 2 + 0.05, 0);
    const cap = new THREE.CylinderGeometry(0.16, 0.16, 0.08, 32);
    cap.translate(0, -handleLen + 0.05, 0);
    const base = handleLen - 0.05;
    [face, handle, cap].forEach((g) => { g.translate(0, base, 0); track(g); });

    const g = new THREE.Group();
    [face, handle, cap].forEach((geo) => g.add(new THREE.Mesh(geo, mat)));
    g.userData.faceCenter = new THREE.Vector3(0, base + 1.05, 0.16);
    return g;
  }

  const glowMat = (color) => track(new THREE.MeshBasicMaterial({
    color, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
  }));

  // Short radial streaks for a hit
  function buildSparks(color, n = 11) {
    const mat = glowMat(color);
    const geo = track(new THREE.BoxGeometry(1, 0.09, 0.02));
    geo.translate(0.5, 0, 0);
    const g = new THREE.Group();
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(geo, mat);
      m.rotation.z = (i / n) * Math.PI * 2 + (Math.random() - 0.5) * 0.45;
      m.userData.speed = 0.7 + Math.random() * 0.6;
      g.add(m);
    }
    g.visible = false;
    g.userData.mat = mat;
    return g;
  }
  function animateSparks(g, u, size) {
    g.visible = u > 0 && u < 1;
    if (!g.visible) return;
    const e = easeOutQuad(u);
    g.children.forEach((m) => {
      const d = size * (0.55 + 1.7 * e * m.userData.speed);
      const a = m.rotation.z;
      m.position.set(Math.cos(a) * d, Math.sin(a) * d, 0);
      m.scale.set(Math.max(0.001, size * 0.8 * (1 - e)), size, 1);
    });
    g.userData.mat.opacity = (1 - u) * 0.95;
  }

  // Lock-on reticle: ring with four ticks
  function buildReticle(color) {
    const mat = glowMat(color);
    const g = new THREE.Group();
    g.add(new THREE.Mesh(track(new THREE.TorusGeometry(1, 0.025, 8, 96)), mat));
    const tick = track(new THREE.BoxGeometry(0.3, 0.05, 0.02));
    for (let i = 0; i < 4; i++) {
      const a = (i * Math.PI) / 2;
      const m = new THREE.Mesh(tick, mat);
      m.position.set(Math.cos(a) * 1.2, Math.sin(a) * 1.2, 0);
      m.rotation.z = a;
      g.add(m);
    }
    g.visible = false;
    g.userData.mat = mat;
    return g;
  }

  // Streak behind a fast-moving object; colour is display sRGB
  function buildTrail(rgb) {
    const mat = track(new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Vector3(...rgb) }, uOpacity: { value: 0 } },
      vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: 'uniform vec3 uColor; uniform float uOpacity; varying vec2 vUv; void main() { float a = pow(vUv.x, 2.5) * (1.0 - pow(abs(vUv.y - 0.5) * 2.0, 2.0)) * uOpacity; gl_FragColor = vec4(uColor * a, a); }',
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }));
    const m = new THREE.Mesh(track(new THREE.PlaneGeometry(1, 1)), mat);
    m.visible = false;
    return m;
  }

  function buildShadow() {
    const m = new THREE.Mesh(
      track(new THREE.CircleGeometry(1, 48)),
      track(new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0, depthWrite: false })),
    );
    m.visible = false;
    return m;
  }


  /* ── Athletes: huge rim-lit silhouettes standing behind each sport section ──
     A jointed figure in metres (ground y = 0, facing +z, left side +x).
     Torso and head are posed with keyframes; arms and legs either use
     keyframed joint angles or two-bone IK onto a target (hands on the bat,
     feet planted). The shader fades the figure into the page colour near the
     edges of its stage so nothing ever looks cropped.                      */
  const hexRGB = (hex) => [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255];
  const PAGE_BG = hexRGB(0x070914);

  // Solid dark body + a soft glow shell (back faces, inflated) that only shows
  // outside the body's outline — the figure reads as backlit, not segmented.
  function silhouetteMaterials(rimHex) {
    const u = {
      uBase: { value: new THREE.Vector3(0.05, 0.066, 0.125) },
      uRim: { value: new THREE.Vector3(...hexRGB(rimHex)) },
      uBg: { value: new THREE.Vector3(...PAGE_BG) },
      uRect: { value: new THREE.Vector4(0, 0, 1, 1) },
      uIntensity: { value: 1 },
      uThick: { value: 0.06 },
    };
    const FADE = `
      float stageFade() {
        vec2 f = (gl_FragCoord.xy - uRect.xy) / uRect.zw;
        return smoothstep(0.0, 0.26, f.y) * (1.0 - smoothstep(0.88, 1.0, f.y))
             * smoothstep(0.0, 0.08, f.x) * (1.0 - smoothstep(0.92, 1.0, f.x));
      }`;
    const solid = track(new THREE.ShaderMaterial({
      uniforms: u,
      vertexShader: `
        varying vec3 vN;
        varying vec3 vV;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vN = normalize(normalMatrix * normal);
          vV = normalize(-mv.xyz);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        uniform vec3 uBase, uRim, uBg;
        uniform vec4 uRect;
        uniform float uIntensity;
        varying vec3 vN;
        varying vec3 vV;
        ${FADE}
        void main() {
          vec3 n = normalize(vN);
          float fres = pow(1.0 - clamp(dot(n, normalize(vV)), 0.0, 1.0), 3.0);
          vec3 col = uBase * (0.9 + 0.12 * max(n.y, 0.0)) + uRim * fres * 0.035;
          gl_FragColor = vec4(mix(uBg, col, stageFade() * uIntensity), 1.0);
        }`,
    }));
    const glow = track(new THREE.ShaderMaterial({
      uniforms: u,
      side: THREE.BackSide,
      transparent: true,
      depthWrite: false,
      blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneFactor,
      blendSrcAlpha: THREE.OneFactor,
      blendDstAlpha: THREE.OneFactor,
      vertexShader: `
        uniform float uThick;
        varying vec3 vN;
        varying vec3 vV;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position + normal * uThick, 1.0);
          vN = normalize(normalMatrix * normal);
          vV = normalize(-mv.xyz);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        uniform vec3 uRim;
        uniform vec4 uRect;
        uniform float uIntensity;
        varying vec3 vN;
        varying vec3 vV;
        ${FADE}
        void main() {
          float d = clamp(-dot(normalize(vN), normalize(vV)), 0.0, 1.0);
          float a = pow(smoothstep(0.0, 0.9, d), 1.7) * 0.7 * stageFade() * uIntensity;
          gl_FragColor = vec4(uRim * a, a);
        }`,
    }));
    return { solid, glow, u };
  }

  function addGlow(root, glow) {
    const meshes = [];
    root.traverse((o) => { if (o.isMesh) meshes.push(o); });
    meshes.forEach((m) => {
      const g = new THREE.Mesh(m.geometry, glow);
      g.renderOrder = -1;
      m.add(g);
    });
  }

  function buildFigure(mat) {
    const fig = new THREE.Group();
    const J = {};
    const joint = (name, parent, x, y, z) => {
      const g = new THREE.Group();
      g.position.set(x, y, z);
      g.rotation.order = 'YXZ';
      parent.add(g);
      J[name] = g;
      return g;
    };
    const caps = (r, len) => track(new THREE.CapsuleGeometry(r, Math.max(0.001, len - 2 * r), 6, 14));
    const ball = (r) => track(new THREE.SphereGeometry(r, 16, 12));
    const part = (parent, geo, o = {}) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(o.x || 0, o.y || 0, o.z || 0);
      m.rotation.set(o.rx || 0, 0, o.rz || 0);
      m.scale.set(o.sx || 1, o.sy || 1, o.sz || 1);
      parent.add(m);
      return m;
    };
    const limb = (j, len, r) => part(j, caps(r, len + r * 0.7), { y: -len / 2 });

    joint('hips', fig, 0, 0.97, 0);
    part(J.hips, caps(0.125, 0.38), { rz: Math.PI / 2, sz: 0.85 });
    joint('spine', J.hips, 0, 0.07, 0);
    part(J.spine, caps(0.118, 0.3), { y: 0.11, sx: 1.05, sz: 0.85 });
    joint('chest', J.spine, 0, 0.2, 0);
    part(J.chest, caps(0.15, 0.36), { y: 0.13, sx: 1.32, sz: 0.82 });
    joint('neck', J.chest, 0, 0.3, 0);
    part(J.neck, caps(0.05, 0.12), { y: 0.04 });
    joint('head', J.neck, 0, 0.09, 0);
    part(J.head, ball(0.105), { y: 0.1, sx: 0.92, sy: 1.12, sz: 1.02 });
    for (const [side, k] of [['l', 1], ['r', -1]]) {
      const S = (n) => side + n;
      joint(S('Shoulder'), J.chest, 0.19 * k, 0.25, -0.01);
      part(J[S('Shoulder')], ball(0.064));
      limb(J[S('Shoulder')], 0.29, 0.052);
      joint(S('Elbow'), J[S('Shoulder')], 0, -0.29, 0);
      limb(J[S('Elbow')], 0.26, 0.042);
      joint(S('Hand'), J[S('Elbow')], 0, -0.26, 0);
      part(J[S('Hand')], ball(0.048), { y: -0.045, sx: 0.75, sy: 1.25, sz: 0.55 });
      joint(S('Hip'), J.hips, 0.1 * k, -0.04, 0);
      limb(J[S('Hip')], 0.46, 0.078);
      joint(S('Knee'), J[S('Hip')], 0, -0.46, 0);
      limb(J[S('Knee')], 0.45, 0.056);
      joint(S('Ankle'), J[S('Knee')], 0, -0.45, 0);
      part(J[S('Ankle')], caps(0.046, 0.25), { y: -0.04, z: 0.06, rx: Math.PI / 2 });
    }
    return { fig, J, len: { upper: 0.29, fore: 0.26, thigh: 0.46, shin: 0.45 } };
  }

  // Hermite interpolation through keyframes (Catmull-Rom tangents, eased ends)
  function sampleKeys(times, vals, t, out) {
    const n = times.length;
    if (t <= times[0]) { for (let k = 0; k < vals[0].length; k++) out[k] = vals[0][k]; return out; }
    if (t >= times[n - 1]) { for (let k = 0; k < vals[0].length; k++) out[k] = vals[n - 1][k]; return out; }
    let i = 0;
    while (t > times[i + 1]) i++;
    const t0 = times[i], t1 = times[i + 1], d = t1 - t0, u = (t - t0) / d;
    const u2 = u * u, u3 = u2 * u;
    const h00 = 2 * u3 - 3 * u2 + 1, h10 = u3 - 2 * u2 + u, h01 = -2 * u3 + 3 * u2, h11 = u3 - u2;
    for (let k = 0; k < vals[i].length; k++) {
      const p0 = vals[i][k], p1 = vals[i + 1][k];
      const m0 = i > 0 ? (p1 - vals[i - 1][k]) / (t1 - times[i - 1]) : 0;
      const m1 = i + 2 < n ? (vals[i + 2][k] - p0) / (times[i + 2] - t0) : 0;
      out[k] = h00 * p0 + h10 * d * m0 + h01 * p1 + h11 * d * m1;
    }
    return out;
  }

  const DOWN = new THREE.Vector3(0, -1, 0);
  const _q = new THREE.Quaternion();
  const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _v4 = new THREE.Vector3();
  const _m = new THREE.Matrix4();

  // Point a bone's -y axis along a world direction
  function aim(bone, dirWorld) {
    bone.parent.getWorldQuaternion(_q).invert();
    _v1.copy(dirWorld).applyQuaternion(_q).normalize();
    bone.quaternion.setFromUnitVectors(DOWN, _v1);
    bone.updateMatrixWorld(true);
  }

  // Analytic two-bone IK in world space; pole picks the bend direction
  function ik2(root, mid, target, pole, a, b) {
    const rp = root.getWorldPosition(_v2);
    const d = _v3.copy(target).sub(rp);
    const L = Math.min(Math.max(d.length(), 1e-4), (a + b) * 0.999);
    d.normalize();
    const x = (a * a - b * b + L * L) / (2 * L);
    const h = Math.sqrt(Math.max(0, a * a - x * x));
    const p = _v4.copy(pole).sub(rp);
    p.addScaledVector(d, -p.dot(d)).normalize();
    const elbow = new THREE.Vector3().copy(rp).addScaledVector(d, x).addScaledVector(p, h);
    aim(root, _v1.copy(elbow).sub(rp));
    const end = new THREE.Vector3().copy(rp).addScaledVector(d, L);
    aim(mid, end.sub(elbow));
  }

  // Orient an object so local -y follows dir and local +z leans toward faceHint
  function orientAlong(obj, dir, faceHint) {
    const y = _v1.copy(dir).negate().normalize();
    const z = _v2.copy(faceHint).addScaledVector(y, -faceHint.dot(y)).normalize();
    const x = _v3.crossVectors(y, z);
    _m.makeBasis(x, y, z);
    obj.quaternion.setFromRotationMatrix(_m);
  }

  // Apply keyframed channels: hips = [x,y,z, rx,ry,rz], others = [rx,ry,rz]
  const POSE_SKIP = new Set(['t', 'bat', 'rifle', 'lFoot', 'rFoot']);
  function applyChannels(F, anim, t, tmp) {
    for (const name in anim) {
      if (POSE_SKIP.has(name)) continue;
      const v = sampleKeys(anim.t, anim[name], t, tmp);
      const j = F.J[name];
      if (name === 'hips') { j.position.set(v[0], v[1], v[2]); j.rotation.set(v[3], v[4], v[5]); }
      else j.rotation.set(v[0], v[1], v[2]);
    }
  }

  // Keep feet flat and pointing forward in figure space
  function flatFeet(F) {
    const figQ = F.fig.getWorldQuaternion(new THREE.Quaternion());
    for (const s of ['l', 'r']) {
      const a = F.J[s + 'Ankle'];
      a.parent.getWorldQuaternion(_q).invert();
      a.quaternion.copy(_q).multiply(figQ);
    }
  }

  // Size the figure so its whole action (extent, in metres) fills the stage height
  function placeFigure(fig, c, { anchorX, z, yaw, extent, fill = 1.32, groundK = 0.42 }) {
    const k = (c.camZ - z) / c.camZ;
    const stageH = 2 * c.hh;
    const scale = (fill * stageH * k) / extent;
    fig.scale.setScalar(scale);
    fig.position.set(anchorX * c.hw * k, (-c.hh - groundK * stageH) * k, z);
    fig.rotation.set(0, yaw, 0);
    fig.updateMatrixWorld(true);
    return scale;
  }

  function setStageUniforms(mats, c, intensity) {
    mats.u.uRect.value.set(...c.rectPx);
    mats.u.uIntensity.value = intensity;
  }

  // Batsman: guard → backlift → lofted straight drive → hold the finish (bowler at +x)
  const DRIVE = {
    t:      [0, 0.28, 0.55, 0.78, 1.25, 2.6],
    hips:   [[0, 0.9, 0, 0.12, 0, 0], [0.03, 0.92, 0, 0.1, -0.12, 0], [0.24, 0.84, 0.02, 0.18, 0.05, -0.08],
             [0.28, 0.86, 0.02, 0.1, 0.25, -0.04], [0.28, 0.87, 0.02, 0.08, 0.3, -0.03], [0.28, 0.87, 0.02, 0.08, 0.3, -0.03]],
    spine:  [[0.1, 0, 0], [0.08, -0.08, 0.04], [0.12, 0, -0.08], [0.04, 0.2, -0.04], [0.03, 0.22, -0.02], [0.03, 0.22, -0.02]],
    chest:  [[0.1, 0, 0], [0.06, -0.18, 0.05], [0.15, 0.08, -0.12], [0.02, 0.3, -0.05], [0.0, 0.32, -0.03], [0.0, 0.32, -0.03]],
    head:   [[0.05, 1.25, 0], [0.05, 1.3, 0], [0.3, 1.2, 0], [0.0, 0.95, 0], [-0.1, 0.9, 0], [-0.1, 0.9, 0]],
    bat:    [[0.02, 0.92, 0.3, -0.15, -1, 0.08], [-0.12, 1.25, 0.16, -0.55, 0.8, -0.15], [0.46, 0.98, 0.26, 0.12, -1, 0.02],
             [0.5, 1.55, 0.28, 0.55, 0.82, -0.12], [0.46, 1.5, 0.3, 0.45, 0.88, -0.15], [0.46, 1.5, 0.3, 0.45, 0.88, -0.15]],
    lFoot:  [[0.22, 0, 0.02], [0.36, 0.12, 0.06], [0.66, 0, 0.08], [0.66, 0, 0.08], [0.66, 0, 0.08], [0.66, 0, 0.08]],
    rFoot:  [[-0.2, 0, -0.02], [-0.2, 0, -0.02], [-0.18, 0, -0.02], [-0.1, 0.07, 0], [-0.1, 0.07, 0], [-0.1, 0.07, 0]],
  };

  function makeBatsman(mat) {
    const F = buildFigure(mat);
    const bat = buildBat(mat);
    bat.scale.setScalar(0.114); // 8.4 model units → 0.96 m
    F.fig.add(bat);
    const tmp = [], H = new THREE.Vector3(), D = new THREE.Vector3();
    const face = new THREE.Vector3(1, 0, 0);
    const W = (v) => F.fig.localToWorld(v.clone());
    const poleL = new THREE.Vector3(0.55, 0.75, -0.6), poleR = new THREE.Vector3(-0.35, 0.65, -0.6);

    function batAt(t) {
      sampleKeys(DRIVE.t, DRIVE.bat, t, tmp);
      H.set(tmp[0], tmp[1], tmp[2]);
      D.set(tmp[3], tmp[4], tmp[5]).normalize();
    }
    function pose(t) {
      applyChannels(F, DRIVE, t, tmp);
      F.fig.updateMatrixWorld(true);
      batAt(t);
      bat.position.copy(H);
      orientAlong(bat, D, face);
      bat.updateMatrixWorld(true);
      const s = F.fig.scale.x;
      ik2(F.J.lShoulder, F.J.lElbow, W(H.clone().addScaledVector(D, 0.02)), W(poleL), F.len.upper * s, F.len.fore * s);
      ik2(F.J.rShoulder, F.J.rElbow, W(H.clone().addScaledVector(D, 0.13)), W(poleR), F.len.upper * s, F.len.fore * s);
      for (const side of ['l', 'r']) {
        const foot = sampleKeys(DRIVE.t, DRIVE[side + 'Foot'], t, []);
        const target = W(new THREE.Vector3(foot[0], foot[1] + 0.09, foot[2]));
        const pole = W(new THREE.Vector3(foot[0] * 0.6, 0.6, 0.9));
        ik2(F.J[side + 'Hip'], F.J[side + 'Knee'], target, pole, F.len.thigh * s, F.len.shin * s);
      }
      flatFeet(F);
    }
    // Sweet spot of the blade in figure space at time t
    function contactLocal(t) { batAt(t); return H.clone().addScaledVector(D, 0.76); }
    return { F, pose, contactLocal };
  }

  // Striker: rises for a high cross, bicycle kick over his head, lands on his back
  const BICYCLE = {
    t:         [0, 0.22, 0.46, 0.72, 1.1, 2.6],
    hips:      [[0, 0.95, 0, 0.15, 0, 0], [0, 1.2, 0, -0.55, 0, 0], [0, 1.55, 0, -1.45, 0, 0],
                [0, 1.2, 0, -1.9, 0, 0], [0, 0.3, 0, -1.55, 0, 0], [0, 0.3, 0, -1.55, 0, 0]],
    spine:     [[0.05, 0, 0], [-0.1, 0, 0], [0.15, 0, 0], [0.1, 0, 0], [0, 0, 0], [0, 0, 0]],
    chest:     [[0.05, 0, 0], [-0.1, 0, 0], [0.2, 0, 0], [0.1, 0, 0], [0, 0, 0], [0, 0, 0]],
    head:      [[-0.5, 0, 0], [-0.7, 0, 0], [0.7, 0, 0], [0.4, 0, 0], [0.2, 0, 0], [0.2, 0, 0]],
    lShoulder: [[-0.3, 0, 0.35], [0.2, 0, 1.2], [0.6, 0, 1.5], [-2.4, 0, 0.6], [-2.0, 0, 1.0], [-2.0, 0, 1.0]],
    rShoulder: [[0.4, 0, -0.35], [0.2, 0, -1.2], [0.6, 0, -1.5], [-2.4, 0, -0.6], [-2.0, 0, -1.0], [-2.0, 0, -1.0]],
    lElbow:    [[-0.6, 0, 0], [-0.4, 0, 0], [-0.3, 0, 0], [-0.2, 0, 0], [-0.3, 0, 0], [-0.3, 0, 0]],
    rElbow:    [[-0.6, 0, 0], [-0.4, 0, 0], [-0.3, 0, 0], [-0.2, 0, 0], [-0.3, 0, 0], [-0.3, 0, 0]],
    lHip:      [[-0.25, 0, 0], [-1.7, 0, 0], [-0.3, 0, 0], [-1.2, 0, 0], [-1.4, 0, 0], [-1.4, 0, 0]],
    lKnee:     [[0.5, 0, 0], [1.1, 0, 0], [0.5, 0, 0], [0.8, 0, 0], [1.2, 0, 0], [1.2, 0, 0]],
    rHip:      [[0.3, 0, 0], [0.1, 0, 0], [-2.7, 0, 0], [-1.6, 0, 0], [-1.0, 0, 0], [-1.0, 0, 0]],
    rKnee:     [[0.6, 0, 0], [0.25, 0, 0], [0.05, 0, 0], [0.4, 0, 0], [0.6, 0, 0], [0.6, 0, 0]],
  };

  function makeStriker(mat) {
    const F = buildFigure(mat);
    const tmp = [];
    function pose(t) { applyChannels(F, BICYCLE, t, tmp); F.fig.updateMatrixWorld(true); }
    function contactLocal(t) {
      pose(t);
      const p = F.J.rAnkle.localToWorld(new THREE.Vector3(0, -0.04, 0.12));
      return F.fig.worldToLocal(p);
    }
    return { F, pose, contactLocal };
  }

  // Pickleball: ready → tracks the lob → jumping overhead smash → follow-through
  const SMASH = {
    t:         [0, 0.3, 0.52, 0.78, 1.3, 2.6],
    hips:      [[0, 0.9, 0, 0.15, 0, 0], [0, 0.95, 0, -0.05, -0.2, 0], [0, 1.12, 0, -0.05, 0.25, 0],
                [0, 0.9, 0, 0.35, 0.45, 0], [0, 0.9, 0, 0.2, 0.3, 0], [0, 0.9, 0, 0.2, 0.3, 0]],
    spine:     [[0.05, 0, 0], [-0.15, -0.15, 0], [0.05, 0.15, 0], [0.2, 0.2, 0], [0.1, 0.1, 0], [0.1, 0.1, 0]],
    chest:     [[0.05, 0, 0], [-0.25, -0.35, 0], [0.1, 0.35, 0], [0.35, 0.4, 0], [0.15, 0.2, 0], [0.15, 0.2, 0]],
    head:      [[-0.2, 0, 0], [-0.6, 0, 0], [-0.5, 0.1, 0], [0.25, 0.2, 0], [0, 0.1, 0], [0, 0.1, 0]],
    rShoulder: [[-0.9, 0, -0.25], [-2.4, 0, -0.7], [-3.0, 0, -0.25], [-0.6, 0, 0.35], [-0.8, 0, 0.1], [-0.8, 0, 0.1]],
    rElbow:    [[-1.3, 0, 0], [-2.2, 0, 0], [-0.15, 0, 0], [-0.5, 0, 0], [-1.0, 0, 0], [-1.0, 0, 0]],
    lShoulder: [[-0.6, 0, 0.3], [-2.7, 0, 0.25], [-1.2, 0, 0.5], [-0.3, 0, 0.5], [-0.5, 0, 0.3], [-0.5, 0, 0.3]],
    lElbow:    [[-1.0, 0, 0], [-0.1, 0, 0], [-0.8, 0, 0], [-1.2, 0, 0], [-1.0, 0, 0], [-1.0, 0, 0]],
    lHip:      [[-0.45, 0, 0.08], [-0.2, 0, 0.08], [-0.6, 0, 0.08], [-0.5, 0, 0.08], [-0.4, 0, 0.08], [-0.4, 0, 0.08]],
    lKnee:     [[0.75, 0, 0], [0.35, 0, 0], [0.9, 0, 0], [0.8, 0, 0], [0.6, 0, 0], [0.6, 0, 0]],
    rHip:      [[-0.45, 0, -0.08], [-0.2, 0, -0.08], [0.1, 0, -0.08], [-0.2, 0, -0.08], [-0.4, 0, -0.08], [-0.4, 0, -0.08]],
    rKnee:     [[0.75, 0, 0], [0.35, 0, 0], [0.7, 0, 0], [0.6, 0, 0], [0.6, 0, 0], [0.6, 0, 0]],
  };

  function makeSmasher(mat) {
    const F = buildFigure(mat);
    const paddle = buildPaddle(mat);
    paddle.scale.setScalar(0.145); // 2.75 model units → 0.4 m
    paddle.position.set(0, -0.05, 0);
    paddle.rotation.set(Math.PI, 0, 0);
    F.J.rHand.add(paddle);
    const tmp = [];
    function pose(t) { applyChannels(F, SMASH, t, tmp); F.fig.updateMatrixWorld(true); }
    function contactLocal(t) {
      pose(t);
      const p = paddle.localToWorld(paddle.userData.faceCenter.clone());
      return F.fig.worldToLocal(p);
    }
    return { F, pose, contactLocal };
  }

  // Bolt-action rifle, origin at the pistol grip, barrel along +z
  function buildRifle(mat) {
    const g = new THREE.Group();
    const box = (w, h, d, x, y, z, rx = 0) => {
      const m = new THREE.Mesh(track(new THREE.BoxGeometry(w, h, d)), mat);
      m.position.set(x, y, z);
      m.rotation.x = rx;
      g.add(m);
    };
    const cyl = (r, len, x, y, z) => {
      const geo = track(new THREE.CylinderGeometry(r, r, len, 16));
      geo.rotateX(Math.PI / 2);
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      g.add(m);
    };
    box(0.07, 0.1, 0.44, 0, 0.03, 0.06);          // receiver
    box(0.06, 0.07, 0.3, 0, 0.025, 0.42);         // handguard
    cyl(0.014, 0.62, 0, 0.045, 0.82);             // barrel
    cyl(0.024, 0.08, 0, 0.045, 1.15);             // muzzle brake
    cyl(0.03, 0.34, 0, 0.14, 0.08);               // scope
    box(0.014, 0.05, 0.03, 0, 0.095, -0.02);      // scope rings
    box(0.014, 0.05, 0.03, 0, 0.095, 0.18);
    box(0.05, 0.13, 0.34, 0, -0.01, -0.31, 0.08); // stock
    box(0.055, 0.17, 0.04, 0, -0.03, -0.49);      // butt pad
    box(0.04, 0.12, 0.05, 0, -0.08, 0.0, 0.35);   // pistol grip
    box(0.045, 0.13, 0.08, 0, -0.07, 0.17);       // magazine
    g.userData.muzzle = new THREE.Vector3(0, 0.045, 1.2);
    g.userData.grip = new THREE.Vector3(0, -0.1, -0.01);
    g.userData.support = new THREE.Vector3(0, -0.01, 0.3);
    return g;
  }

  // Sniper: low ready → shoulders the rifle → aims → fires (recoil) → holds the aim
  const SNIPE = {
    t:      [0, 0.35, 0.68, 0.78, 1.15, 2.6],
    hips:   [[0, 0.93, 0, 0.05, 0, 0], [0, 0.92, 0, 0.08, 0.15, 0], [0, 0.92, 0, 0.08, 0.15, 0],
             [0, 0.93, -0.02, 0.03, 0.15, 0], [0, 0.92, 0, 0.08, 0.15, 0], [0, 0.92, 0, 0.08, 0.15, 0]],
    spine:  [[0.05, 0, 0], [0.06, 0.1, 0], [0.06, 0.1, 0], [0.0, 0.1, 0], [0.06, 0.1, 0], [0.06, 0.1, 0]],
    chest:  [[0.05, 0, 0], [0.1, 0.22, 0.04], [0.1, 0.22, 0.04], [0.0, 0.22, 0.04], [0.1, 0.22, 0.04], [0.1, 0.22, 0.04]],
    head:   [[0.1, 0, 0], [0.28, -0.25, 0.25], [0.28, -0.25, 0.25], [0.18, -0.25, 0.25], [0.28, -0.25, 0.25], [0.28, -0.25, 0.25]],
    rifle:  [[-0.1, 1.05, 0.3, 0.75, 0.1, 0], [-0.15, 1.4, 0.4, 0, 0.05, 0], [-0.15, 1.4, 0.4, 0, 0.05, 0],
             [-0.15, 1.43, 0.33, -0.16, 0.05, 0], [-0.15, 1.4, 0.4, 0, 0.05, 0], [-0.15, 1.4, 0.4, 0, 0.05, 0]],
    lHip:   [[-0.12, 0, 0.12], [-0.15, 0, 0.12], [-0.15, 0, 0.12], [-0.15, 0, 0.12], [-0.15, 0, 0.12], [-0.15, 0, 0.12]],
    lKnee:  [[0.2, 0, 0], [0.25, 0, 0], [0.25, 0, 0], [0.25, 0, 0], [0.25, 0, 0], [0.25, 0, 0]],
    rHip:   [[0.1, 0, -0.12], [0.12, 0, -0.14], [0.12, 0, -0.14], [0.12, 0, -0.14], [0.12, 0, -0.14], [0.12, 0, -0.14]],
    rKnee:  [[0.18, 0, 0], [0.2, 0, 0], [0.2, 0, 0], [0.2, 0, 0], [0.2, 0, 0], [0.2, 0, 0]],
  };

  function makeSniper(mat) {
    const F = buildFigure(mat);
    const rifle = buildRifle(mat);
    F.fig.add(rifle);
    const tmp = [];
    const W = (v) => F.fig.localToWorld(v.clone());
    const poleR = new THREE.Vector3(-0.7, 1.1, 0.1), poleL = new THREE.Vector3(0.45, 0.8, 0.3);
    function rifleAt(t) {
      const v = sampleKeys(SNIPE.t, SNIPE.rifle, t, tmp);
      rifle.position.set(v[0], v[1], v[2]);
      rifle.rotation.set(v[3], v[4], v[5]);
      rifle.updateMatrixWorld(true);
    }
    function pose(t) {
      applyChannels(F, SNIPE, t, tmp);
      F.fig.updateMatrixWorld(true);
      rifleAt(t);
      const s = F.fig.scale.x;
      const grip = rifle.localToWorld(rifle.userData.grip.clone());
      const support = rifle.localToWorld(rifle.userData.support.clone());
      ik2(F.J.rShoulder, F.J.rElbow, grip, W(poleR), F.len.upper * s, F.len.fore * s);
      ik2(F.J.lShoulder, F.J.lElbow, support, W(poleL), F.len.upper * s, F.len.fore * s);
      flatFeet(F);
    }
    function contactLocal(t) {
      F.fig.updateMatrixWorld(true);
      rifleAt(t);
      return F.fig.worldToLocal(rifle.localToWorld(rifle.userData.muzzle.clone()));
    }
    return { F, pose, contactLocal, props: [rifle] };
  }

  /* ── Section moments ────────────────────────────────────────────
     Each one delivers the section's item into its inspect frame.
     ctx: rest (slot centre, world), size (item radius), hw/hh (stage
     half extents), groundY (the line under the section title).      */
  const seg = (t, a, b) => clamp01((t - a) / (b - a));
  const lerp = (a, b, t) => a + (b - a) * t;
  const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const easeOutQuad = (t) => 1 - (1 - t) * (1 - t);
  const easeOutExpo = (t) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t));
  const easeOutBounce = (t) => {
    const n = 7.5625, d = 2.75;
    if (t < 1 / d) return n * t * t;
    if (t < 2 / d) return n * (t -= 1.5 / d) * t + 0.75;
    if (t < 2.5 / d) return n * (t -= 2.25 / d) * t + 0.9375;
    return n * (t -= 2.625 / d) * t + 0.984375;
  };
  const bezier = (out, a, b, c, t) => out.set(
    (1 - t) * (1 - t) * a.x + 2 * (1 - t) * t * b.x + t * t * c.x,
    (1 - t) * (1 - t) * a.y + 2 * (1 - t) * t * b.y + t * t * c.y,
    (1 - t) * (1 - t) * a.z + 2 * (1 - t) * t * b.z + t * t * c.z,
  );
  const settle = (u) => 1 + Math.sin(u * Math.PI) * 0.09 * (1 - u);

  // Screen-plane helpers: (x, y) as seen at z = 0, pushed to depth z
  const atDepth = (out, x, y, z, camZ) => out.set((x * (camZ - z)) / camZ, (y * (camZ - z)) / camZ, z);
  const screenAt = (p, camZ) => new THREE.Vector3((p.x * camZ) / (camZ - p.z), (p.y * camZ) / (camZ - p.z), 0);
  const easeInQuad = (t) => t * t;

  // Head-on: from the contact point the object rushes at the viewer, then drops into its frame
  function headOn(c, from, out, u, { split = 0.55, nearZ = 5, lift = 0.38, rush = (v) => v } = {}) {
    const fs = screenAt(from, c.camZ);
    const near = atDepth(new THREE.Vector3(), lerp(fs.x, c.rest.x, 0.62), c.rest.y + c.hh * lift, nearZ, c.camZ);
    if (u < split) {
      out.lerpVectors(from, near, rush(u / split));
    } else {
      const v = (u - split) / (1 - split);
      const e = easeOutCubic(v);
      out.set(lerp(near.x, c.rest.x, e), lerp(near.y, c.rest.y, easeInQuad(v)), lerp(near.z, 0, e));
    }
  }

  // The athlete acts, the object leaves their world at the contact point and comes at you
  function athleteMoment(scene, cfg) {
    const mats = silhouetteMaterials(cfg.rim);
    const A = cfg.make(mats.solid);
    addGlow(A.F.fig, mats.glow);
    const sparks = buildSparks(cfg.spark, 10);
    scene.add(A.F.fig, sparks);
    const extras = cfg.extras ? cfg.extras(scene) : null;
    const contact = new THREE.Vector3();
    let contactL = null, fadeIn = 0;
    const DIM = 0.55;
    return {
      duration: cfg.duration,
      arrive: cfg.tArrive,
      reset() { contactL = null; fadeIn = 0; sparks.visible = false; extras?.reset(); },
      // Not playing: the opening pose before the moment, the held pose (dimmed) afterwards
      idle(c, after) {
        placeFigure(A.F.fig, c, cfg.place);
        A.pose(after ? cfg.holdT : 0);
        if (after && cfg.crossfade) fadeIn = Math.min(1, fadeIn + (c.dt || 0) / 0.8);
        setStageUniforms(mats, c, after ? DIM * (cfg.crossfade ? fadeIn : 1) : 1);
      },
      apply(t, c, holder, pivot, dt, obj) {
        const scale = placeFigure(A.F.fig, c, cfg.place);
        if (!contactL) contactL = A.contactLocal(cfg.tContact);
        A.pose(t);
        const intensity = cfg.crossfade
          ? 1 - seg(t, cfg.duration - 0.5, cfg.duration)
          : lerp(1, DIM, seg(t, cfg.tArrive + 0.2, cfg.duration));
        setStageUniforms(mats, c, intensity);
        contact.copy(contactL);
        A.F.fig.localToWorld(contact);
        const rBall = cfg.ballR * scale;
        let phase = 2, u = 1;
        if (t < cfg.tContact) {
          phase = 0;
          u = seg(t, 0, cfg.tContact);
          if (cfg.approach) cfg.approach(c, A, contact, holder.position, u);
          holder.scale.setScalar(cfg.approach ? rBall : 1e-4);
        } else if (t < cfg.tArrive) {
          phase = 1;
          u = seg(t, cfg.tContact, cfg.tArrive);
          cfg.flight(c, A, contact, holder.position, u);
          holder.scale.setScalar(lerp(rBall, c.size, easeOutCubic(Math.min(1, u * 1.6))));
        } else {
          holder.position.copy(c.rest);
          holder.scale.setScalar(c.size * settle(seg(t, cfg.tArrive, cfg.tArrive + 0.45)));
        }
        cfg.spin(pivot, dt, phase, u, holder, obj, c);
        extras?.update(t, c, holder, contact, phase, u, rBall);
        sparks.position.copy(contact);
        const depthK = (c.camZ - contact.z) / c.camZ;
        animateSparks(sparks, seg(t, cfg.tContact, cfg.tContact + 0.4), c.size * depthK * (cfg.sparkK || 0.75));
      },
    };
  }

  const MOMENTS = {
    // A sniper fires; the round comes at you in bullet time and settles into the frame
    round(scene) {
      const tipRest = new THREE.Vector3(), dir = new THREE.Vector3(), qFly = new THREE.Quaternion(), qRest = new THREE.Quaternion(), qRoll = new THREE.Quaternion();
      let roll = 0;
      return athleteMoment(scene, {
        make: makeSniper, rim: 0xf2b544, spark: 0xffe2a0, sparkK: 1.0,
        place: { anchorX: -0.2, z: -20, yaw: 0.55, extent: 1.95, fill: 1.4, groundK: 0.55 },
        tContact: 0.74, tArrive: 1.75, holdT: 1.2, duration: 2.6, ballR: 0.045,
        flight(c, A, from, out, u) {
          headOn(c, from, out, u, { split: 0.3, nearZ: 6, lift: 0.3 });
        },
        spin(pivot, dt, phase, u, holder, obj, c) {
          if (phase !== 1) { if (phase === 2) pivot.quaternion.slerp(qRest, Math.min(1, dt * 6)); return; }
          // tip-first toward the viewer while fast, then turn to the display tilt as it slows
          tipRest.set(0, 1, 0).applyQuaternion(obj.quaternion);
          dir.set(0, 0, c.camZ).sub(holder.position).normalize();
          qFly.setFromUnitVectors(tipRest, dir);
          roll += (u < 0.3 ? 40 : 8 * (1 - u)) * dt;
          qRoll.setFromAxisAngle(dir, roll);
          qFly.premultiply(qRoll);
          pivot.quaternion.slerpQuaternions(qFly, qRest, easeInOut(seg(u, 0.45, 1)));
        },
        extras(scene) {
          const trail = buildTrail([0.98, 0.74, 0.3]);
          const reticle = buildReticle(0xf2b544);
          scene.add(trail, reticle);
          const a = new THREE.Vector3(), b = new THREE.Vector3(), mid = new THREE.Vector3();
          return {
            reset() { trail.visible = false; reticle.visible = false; roll = 0; },
            update(t, c, holder, from, phase, u, rBall) {
              // streak from the muzzle to the round while it is fast
              const tu = phase === 1 ? seg(u, 0.22, 0.5) : (phase === 2 ? 1 : 0);
              trail.visible = phase === 1 && tu < 1;
              if (trail.visible) {
                a.copy(screenAt(from, c.camZ)); b.copy(screenAt(holder.position, c.camZ));
                mid.addVectors(a, b).multiplyScalar(0.5);
                trail.position.set(mid.x, mid.y, 0.5);
                trail.scale.set(Math.max(0.001, a.distanceTo(b)), c.size * 0.22, 1);
                trail.rotation.z = Math.atan2(b.y - a.y, b.x - a.x);
                trail.material.uniforms.uOpacity.value = 0.9 * (1 - tu);
              }
              const ru = phase >= 1 ? seg(t, 1.25, 2.05) : 0;
              reticle.visible = ru > 0 && ru < 1;
              reticle.position.set(c.rest.x, c.rest.y, 0.3);
              reticle.scale.setScalar(c.size * lerp(2.5, 1.35, easeOutQuad(Math.min(1, ru * 1.6))));
              reticle.rotation.z = -ru * 1.4;
              reticle.userData.mat.opacity = Math.sin(ru * Math.PI) * 0.95;
            },
          };
        },
      });
    },

    // From the bowler's end: bowled, pitched, driven straight back at you
    cricket(scene) {
      return athleteMoment(scene, {
        make: makeBatsman, rim: 0xff5468, spark: 0xfff1d6,
        place: { anchorX: 0.12, z: -20, yaw: -1.27, extent: 2.35, fill: 1.5, groundK: 0.5 },
        tContact: 0.55, tArrive: 1.5, holdT: 1.25, duration: 2.6, ballR: 0.036,
        approach(c, A, contact, out, u) {
          const start = atDepth(new THREE.Vector3(), c.hw * 0.1, c.hh * 0.5, 7, c.camZ);
          const bounce = A.F.fig.localToWorld(new THREE.Vector3(2.2, 0.03, 0.25));
          if (u < 0.72) out.lerpVectors(start, bounce, u / 0.72);
          else out.lerpVectors(bounce, contact, (u - 0.72) / 0.28);
        },
        flight(c, A, from, out, u) { headOn(c, from, out, u); },
        spin(pivot, dt, phase, u) {
          if (phase === 0) pivot.rotateOnWorldAxis(AXIS_X, -10 * dt);
          else if (phase === 1) pivot.rotateOnWorldAxis(AXIS_X, -(1 - u) * 18 * dt);
        },
      });
    },

    // Goal-camera view: back to us, the striker meets the cross with a bicycle kick over his head
    football(scene) {
      return athleteMoment(scene, {
        make: makeStriker, rim: 0x2fd3a8, spark: 0xd9fff3,
        place: { anchorX: -0.1, z: -20, yaw: -2.39, extent: 2.55, fill: 1.25, groundK: 0.33 },
        tContact: 0.46, tArrive: 1.45, holdT: 0.46, crossfade: true, duration: 2.6, ballR: 0.11,
        approach(c, A, contact, out, u) {
          const start = A.F.fig.localToWorld(new THREE.Vector3(-0.6, 3.2, 6.5));
          const ctl = A.F.fig.localToWorld(new THREE.Vector3(-0.3, 4.3, 3));
          bezier(out, start, ctl, contact, u);
        },
        flight(c, A, from, out, u) { headOn(c, from, out, u, { lift: 0.42 }); },
        spin(pivot, dt, phase, u) {
          if (phase === 0) pivot.rotateOnWorldAxis(AXIS_Z, 4 * dt);
          else if (phase === 1) pivot.rotateOnWorldAxis(AXIS_X, (1 - u) * 20 * dt);
        },
      });
    },

    // The player faces you, jumps and smashes; it bounces once and kicks up into the frame
    pickleball(scene) {
      return athleteMoment(scene, {
        make: makeSmasher, rim: 0xd7f24a, spark: 0xf4ffc2,
        place: { anchorX: 0.02, z: -20, yaw: 0.3, extent: 2.6 },
        tContact: 0.52, tArrive: 1.55, holdT: 1.3, duration: 2.6, ballR: 0.037,
        approach(c, A, contact, out, u) {
          const start = atDepth(new THREE.Vector3(), c.hw * 0.35, c.hh * 0.9, 6, c.camZ);
          const ctl = A.F.fig.localToWorld(new THREE.Vector3(0, 5.2, 2.5));
          bezier(out, start, ctl, contact, u);
        },
        flight(c, A, from, out, u) {
          const bounce = A.F.fig.localToWorld(new THREE.Vector3(0.1, 0.04, 3.6));
          if (u < 0.3) out.lerpVectors(from, bounce, u / 0.3);
          else headOn(c, bounce, out, (u - 0.3) / 0.7, { split: 0.5, lift: 0.4 });
        },
        spin(pivot, dt, phase, u) {
          if (phase < 2) pivot.rotateOnWorldAxis(AXIS_Z, (phase === 0 ? 5 : (1 - u) * 14) * dt);
        },
      });
    },

    // O then X drop into the frame and bounce
    xo() {
      return {
        duration: 1.75,
        arrive: 1.0,
        reset() {},
        apply(t, c, holder, pivot, dt, obj) {
          holder.position.copy(c.rest);
          holder.scale.setScalar(c.size);
          obj.children.forEach((m, i) => {
            const u = seg(t, 0.05 + i * 0.22, 0.9 + i * 0.22);
            m.position.y = m.userData.baseY + (1 - easeOutBounce(u)) * 4.4;
            m.rotation.z += (1 - u) * 9 * dt;
          });
        },
      };
    },
  };

  /* ── Section view: a full-width stage behind each mode header ── */
  function sectionView(section) {
    const slot = section.querySelector('[data-gl-item]');
    const stage = section.querySelector('.mode-stage');
    const head = section.querySelector('.mode-head');
    const kind = slot && slot.dataset.glItem;
    const build = BUILD[kind];
    if (!slot || !stage || !head || !build) return null;

    const scene = new THREE.Scene();
    addLights(scene, kind === 'round' ? 1.3 : 0.85);
    const fov = 22, camZ = 14;
    const camera = new THREE.PerspectiveCamera(fov, 1, 0.1, 140);
    camera.position.set(0, 0, camZ);
    const tanHalf = Math.tan(THREE.MathUtils.degToRad(fov / 2));

    const holder = new THREE.Group();
    const pivot = new THREE.Group();
    const obj = build();
    pivot.add(obj);
    holder.add(pivot);
    scene.add(holder);
    const moment = MOMENTS[kind] ? MOMENTS[kind](scene) : null;

    const ctx = { rest: new THREE.Vector3(), size: 1, hw: 1, hh: 1, groundY: 0, camZ, rectPx: [0, 0, 1, 1] };
    const autoSpin = reduceMotion ? 0 : 0.45;
    const vel = { yaw: autoSpin, pitch: 0 };
    let dragging = false, moved = 0, lastX = 0, lastY = 0, lastT = 0;
    let hover = 0, hoverTarget = 0;
    let started = !moment || reduceMotion, eventT = -1, arrived = false;

    function play() {
      if (!moment || reduceMotion) return;
      moment.reset();
      eventT = 0;
      arrived = false;
      started = true;
    }
    function flash() {
      slot.classList.remove('is-hit');
      void slot.offsetWidth;
      slot.classList.add('is-hit');
    }

    const down = (e) => {
      dragging = true;
      moved = 0;
      lastX = e.clientX; lastY = e.clientY; lastT = performance.now();
      slot.classList.add('is-dragging');
      slot.setPointerCapture?.(e.pointerId);
    };
    const move = (e) => {
      if (!dragging) return;
      const now = performance.now();
      const dx = e.clientX - lastX, dy = e.clientY - lastY;
      moved += Math.abs(dx) + Math.abs(dy);
      if (eventT >= 0) { lastX = e.clientX; lastY = e.clientY; return; }
      const dts = Math.max(0.008, (now - lastT) / 1000);
      const yaw = dx * 0.012, pitch = e.pointerType === 'touch' ? 0 : dy * 0.012;
      pivot.rotateOnWorldAxis(AXIS_Y, yaw);
      pivot.rotateOnWorldAxis(AXIS_X, pitch);
      vel.yaw = damp(vel.yaw, yaw / dts, 18, dts);
      vel.pitch = damp(vel.pitch, pitch / dts, 18, dts);
      lastX = e.clientX; lastY = e.clientY; lastT = now;
    };
    const end = (replay) => {
      if (dragging && replay && moved < 6 && eventT < 0) play(); // a tap replays the moment
      dragging = false;
      slot.classList.remove('is-dragging');
    };
    const up = () => end(true);
    const cancel = () => end(false);
    const enter = () => { hoverTarget = 1; };
    const leave = () => { hoverTarget = 0; end(false); };
    slot.addEventListener('pointerdown', down);
    slot.addEventListener('pointermove', move);
    slot.addEventListener('pointerup', up);
    slot.addEventListener('pointercancel', cancel);
    slot.addEventListener('pointerenter', enter);
    slot.addEventListener('pointerleave', leave);

    return {
      el: stage,
      scene,
      camera,
      inView: false,
      update(dt, t, rect) {
        const a = rect.width / rect.height;
        if (Math.abs(a - camera.aspect) > 1e-3) {
          camera.aspect = a;
          camera.updateProjectionMatrix();
        }
        const hh = tanHalf * camZ, wpp = (2 * hh) / rect.height;
        const s = slot.getBoundingClientRect();
        const cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2;
        ctx.rest.set((s.left + s.width / 2 - cx) * wpp, -(s.top + s.height / 2 - cy) * wpp, 0);
        ctx.size = (s.height / 2 / 1.346) * wpp;
        ctx.hh = hh;
        ctx.hw = hh * camera.aspect;
        ctx.groundY = -(head.getBoundingClientRect().bottom - cy) * wpp;
        ctx.dt = dt;
        const dpr = renderer.getPixelRatio();
        ctx.rectPx = [rect.left * dpr, (height - rect.bottom) * dpr, rect.width * dpr, rect.height * dpr];
        if (obj.userData.bump) obj.userData.bump.value = 0.011 * ctx.size;

        if (!started && s.top < window.innerHeight * 0.78 && s.bottom > 0) play();

        if (eventT >= 0) {
          eventT += dt;
          moment.apply(eventT, ctx, holder, pivot, dt, obj);
          if (!arrived && eventT >= moment.arrive) { arrived = true; flash(); }
          if (eventT >= moment.duration) {
            eventT = -1;
            moment.reset();
            vel.yaw = autoSpin;
          }
          return;
        }
        if (moment && moment.idle) moment.idle(ctx, started);
        if (!started) { holder.scale.setScalar(1e-4); return; }

        holder.position.copy(ctx.rest);
        hover = damp(hover, hoverTarget, 8, dt);
        holder.scale.setScalar(ctx.size * (1 + hover * 0.06));
        if (!dragging) {
          vel.yaw = damp(vel.yaw, autoSpin, 1.6, dt);
          vel.pitch = damp(vel.pitch, 0, 2.2, dt);
          pivot.rotateOnWorldAxis(AXIS_Y, vel.yaw * dt);
          pivot.rotateOnWorldAxis(AXIS_X, vel.pitch * dt);
        }
        if (kind === 'xo' && !reduceMotion) {
          obj.children.forEach((m) => {
            m.rotation.x += m.userData.spin.x * dt;
            m.rotation.y += m.userData.spin.y * dt;
            m.rotation.z += m.userData.spin.z * dt;
          });
        }
      },
      dispose() {
        slot.removeEventListener('pointerdown', down);
        slot.removeEventListener('pointermove', move);
        slot.removeEventListener('pointerup', up);
        slot.removeEventListener('pointercancel', cancel);
        slot.removeEventListener('pointerenter', enter);
        slot.removeEventListener('pointerleave', leave);
      },
    };
  }

  /* ── Views ──────────────────────────────────────────────────── */
  const views = [];
  const heroEl = document.querySelector('[data-gl-view="hero"]');
  if (heroEl) views.push(heroView(heroEl));
  document.querySelectorAll('section.mode').forEach((section) => {
    const v = sectionView(section);
    if (v) views.push(v);
  });

  const byEl = new Map(views.map((v) => [v.el, v]));
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      const v = byEl.get(e.target);
      if (v) v.inView = e.isIntersecting;
    });
  }, { rootMargin: '120px 0px' });
  views.forEach((v) => io.observe(v.el));

  /* ── Render loop ────────────────────────────────────────────── */
  let width = 0, height = 0;
  let last = performance.now();
  let elapsed = 0;
  let painted = true;
  let lost = false;

  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (w === width && h === height) return;
    width = w; height = h;
    renderer.setSize(w, h, false);
  }

  function frame() {
    const now = performance.now();
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (lost || document.hidden) return;
    elapsed += dt;
    resize();

    const active = views.filter((v) => v.inView);
    if (!active.length) {
      if (painted) {
        renderer.setScissorTest(false);
        renderer.clear();
        painted = false;
      }
      return;
    }

    renderer.setScissorTest(false);
    renderer.clear();
    renderer.setScissorTest(true);
    painted = true;

    for (const v of active) {
      const r = v.el.getBoundingClientRect();
      if (r.bottom <= 0 || r.top >= height || r.width < 2 || r.height < 2) continue;
      const y = height - r.bottom;
      renderer.setViewport(r.left, y, r.width, r.height);
      renderer.setScissor(r.left, y, r.width, r.height);
      v.update(dt, elapsed, r);
      renderer.render(v.scene, v.camera);
    }
  }

  // Run after Lenis on the same GSAP tick so the canvas never lags the page
  const useTicker = typeof window.gsap !== 'undefined';
  let rafId = 0;
  if (useTicker) {
    gsap.ticker.add(frame);
  } else {
    const loop = () => { frame(); rafId = requestAnimationFrame(loop); };
    rafId = requestAnimationFrame(loop);
  }

  document.addEventListener('visibilitychange', () => { last = performance.now(); });

  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    lost = true;
    root.classList.add('no-webgl');
  });

  function dispose() {
    if (useTicker) gsap.ticker.remove(frame); else cancelAnimationFrame(rafId);
    io.disconnect();
    views.forEach((v) => {
      v.dispose?.();
      v.scene.traverse((o) => { if (o.isLight) o.dispose?.(); });
    });
    disposables.forEach((d) => d.dispose());
    env.dispose();
    renderer.dispose();
  }
  window.addEventListener('pagehide', (e) => { if (!e.persisted) dispose(); });

  root.classList.add('has-webgl');
}
