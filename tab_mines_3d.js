// tab_mines_3d.js — Interactive 3D drill intercept viewer (Three.js)
// Uses real coordinates if available, otherwise arranges holes synthetically.

let _3dRenderer  = null;
let _3dAnimFrame = null;

function minesRender3D(holes) {
  const wrap = document.getElementById('mines-3d-wrap');
  if (!wrap) return;

  if (_3dAnimFrame) { cancelAnimationFrame(_3dAnimFrame); _3dAnimFrame = null; }
  if (_3dRenderer)  { _3dRenderer.dispose(); _3dRenderer = null; }

  wrap.innerHTML = `<div style="height:100%;display:flex;align-items:center;justify-content:center;
    color:var(--muted);font-size:12px">Loading 3D engine…</div>`;

  _loadThree().then(() => _minesRender3DInner(wrap, holes)).catch(e => {
    wrap.innerHTML = `<div style="height:100%;display:flex;align-items:center;justify-content:center;
      color:#ff6666;font-size:12px">3D load error: ${e.message}</div>`;
  });
}

function _loadThree() {
  if (window.THREE) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = './three.min.js';
    s.onload = resolve;
    s.onerror = () => reject(new Error('three.min.js not found'));
    document.head.appendChild(s);
  });
}

function _minesRender3DInner(wrap, holes) {
  const THREE = window.THREE;
  if (!THREE) throw new Error('THREE still undefined after load');

  const holesWithData = (holes || []).filter(h => h.intervals && h.intervals.length > 0);
  if (!holesWithData.length) {
    wrap.innerHTML = `<div style="height:100%;display:flex;align-items:center;justify-content:center;
      color:var(--muted);font-size:12px">No intercept data extracted for this ticker</div>`;
    return;
  }

  // ── Assign 3D positions ──────────────────────────────────────────────────
  // Use real coordinates if available, otherwise lay out synthetically.
  const hasCoords = holesWithData.every(h => h.easting != null && h.northing != null);

  let cx = 0, cy = 0;
  if (hasCoords) {
    cx = holesWithData.reduce((s, h) => s + h.easting,  0) / holesWithData.length;
    cy = holesWithData.reduce((s, h) => s + h.northing, 0) / holesWithData.length;
  }

  // Group holes by prefix for section layout
  const sections = {};
  holesWithData.forEach(h => {
    const pfx = (h.hole_id || 'X').replace(/\d+$/, '') || 'X';
    if (!sections[pfx]) sections[pfx] = [];
    sections[pfx].push(h);
  });

  const COLS          = Math.ceil(Math.sqrt(holesWithData.length));
  const HOLE_SPACING  = 60;
  const sectionKeys   = Object.keys(sections);

  const holePos = {};
  holesWithData.forEach((h, i) => {
    let x, z;
    if (hasCoords) {
      x = h.easting  - cx;
      z = h.northing - cy;
    } else {
      // 2D grid — fills X and Z so scene has depth
      x = (i % COLS)              * HOLE_SPACING;
      z = Math.floor(i / COLS)    * HOLE_SPACING;
    }
    // Default dip -60° (realistic exploration angle) and vary azimuth slightly
    const az  = ((h.azimuth || (i % 4) * 90) * Math.PI) / 180;
    const dip = ((h.dip     || -60)           * Math.PI) / 180;
    const dep = h.total_depth_m ||
      Math.max(...h.intervals.map(iv => iv.to_m || 0), 150);
    holePos[h.id] = { x, z, azRad: az, dipRad: dip, depth: dep };
  });

  // ── Scene setup ──────────────────────────────────────────────────────────
  wrap.innerHTML = '';
  const W = wrap.clientWidth || 900;
  const H = wrap.clientHeight || 520;

  // Pre-compute scene extent to scale grid/fog/camera correctly
  const _extE = hasCoords ? holesWithData.map(h => h.easting  - cx) : holesWithData.map((_,i) => (i % COLS) * HOLE_SPACING);
  const _extN = hasCoords ? holesWithData.map(h => h.northing - cy) : holesWithData.map((_,i) => Math.floor(i / COLS) * HOLE_SPACING);
  const sceneSpan = Math.max(
    Math.max(..._extE) - Math.min(..._extE),
    Math.max(..._extN) - Math.min(..._extN),
    500
  );

  const scene    = new THREE.Scene();
  scene.background = new THREE.Color(0x020a02);

  const camera = new THREE.PerspectiveCamera(50, W / H, sceneSpan * 0.0001, sceneSpan * 20);
  _3dRenderer = new THREE.WebGLRenderer({ antialias: true });
  _3dRenderer.setSize(W, H);
  _3dRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  wrap.appendChild(_3dRenderer.domElement);

  // Grid — scales to scene, capped at 100 divisions to avoid GPU overload
  const gridSize = Math.ceil(sceneSpan * 1.1 / 100) * 100;
  const gridDivs = Math.min(Math.round(sceneSpan / 200), 100);
  const grid = new THREE.GridHelper(gridSize, gridDivs, 0x112211, 0x0a150a);
  scene.add(grid);

  // Neutral white lights so all colours render correctly
  scene.add(new THREE.AmbientLight(0xffffff, 0.6));
  const sun = new THREE.DirectionalLight(0xffffff, 0.8);
  sun.position.set(sceneSpan * 0.3, sceneSpan * 0.5, sceneSpan * 0.2);
  scene.add(sun);

  // ── Build geometry ───────────────────────────────────────────────────────
  // Scale all geometry to be visible regardless of scene size.
  // At 23km (PDI), geomScale ≈ 115m — collar spheres and cylinders remain visible.
  const geomScale = Math.max(sceneSpan * 0.005, 3);

  // Red-toned grade colours (bright, easy to see on dark background)
  const gradeColor = (g) => {
    if (!g || g <= 0) return new THREE.Color(0x1a0a0a);
    if (g > 15) return new THREE.Color(0xffffff);   // white — bonanza
    if (g > 10) return new THREE.Color(0xff8800);   // orange
    if (g > 5)  return new THREE.Color(0xff4400);   // red-orange
    if (g > 2)  return new THREE.Color(0xff2200);   // red
    if (g > 0.5)return new THREE.Color(0xcc1100);   // dark red
    return new THREE.Color(0x551100);               // sub-cutoff
  };

  let allPoints = [];
  let meshCount = 0;

  holesWithData.forEach(hole => {
    const pos = holePos[hole.id];
    if (!pos) return;

    const { x, z, azRad, dipRad, depth } = pos;
    const y0 = 0;

    // Direction vector (downward into ground)
    const dx = depth * Math.sin(azRad) * Math.cos(dipRad);
    const dy = depth * Math.sin(dipRad);   // negative = downward
    const dz = depth * Math.cos(azRad) * Math.cos(dipRad);

    // Hole trace line — white-ish so it's visible
    const pts = [new THREE.Vector3(x, y0, z), new THREE.Vector3(x+dx, y0+dy, z+dz)];
    const lineGeo = new THREE.BufferGeometry().setFromPoints(pts);
    scene.add(new THREE.Line(lineGeo, new THREE.LineBasicMaterial({ color: 0x335533 })));
    allPoints.push(...pts);

    // Collar sphere — scaled to scene
    const collar = new THREE.Mesh(
      new THREE.SphereGeometry(geomScale * 0.6, 8, 8),
      new THREE.MeshLambertMaterial({ color: 0x44aa44, emissive: 0x112211 })
    );
    collar.position.set(x, y0, z);
    scene.add(collar);
    meshCount++;

    // Intercept cylinders — scaled to scene, red-toned
    hole.intervals.forEach(iv => {
      if (!iv.grade || iv.grade < 0.1) return;
      const f  = (iv.from_m || 0) / depth;
      const t  = Math.min((iv.to_m   || 0) / depth, 1.0);
      // Minimum visible length = geomScale so intercepts don't vanish
      const len = Math.max((iv.to_m||0) - (iv.from_m||0), geomScale * 0.5);

      const mx = x  + dx * (f + t) / 2;
      const my = y0 + dy * (f + t) / 2;
      const mz = z  + dz * (f + t) / 2;

      const radius = geomScale * (0.4 + Math.min(iv.grade / 15, 1.0));
      const col    = gradeColor(iv.grade);
      const mesh   = new THREE.Mesh(
        new THREE.CylinderGeometry(radius, radius, len, 8),
        new THREE.MeshLambertMaterial({ color: col, emissive: col, emissiveIntensity: 0.8 })
      );

      // Orient cylinder along drill direction
      const dir = new THREE.Vector3(dx, dy, dz).normalize();
      // Guard against degenerate case (straight down)
      const up = Math.abs(dir.dot(new THREE.Vector3(0, 1, 0))) > 0.999
        ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
      mesh.setRotationFromQuaternion(
        new THREE.Quaternion().setFromUnitVectors(up, dir)
      );
      mesh.position.set(mx, my, mz);
      scene.add(mesh);
      allPoints.push(new THREE.Vector3(mx, my, mz));
      meshCount++;
    });
  });

  // ── Camera position — fit to scene ───────────────────────────────────────
  const bbox = new THREE.Box3();
  allPoints.forEach(p => bbox.expandByPoint(p));
  const centre = new THREE.Vector3();
  bbox.getCenter(centre);
  const size   = bbox.getSize(new THREE.Vector3()).length();
  const dist   = size * 1.4;
  camera.position.set(centre.x + dist * 0.6, centre.y + dist * 0.5, centre.z + dist * 0.7);
  camera.lookAt(centre);
  camera.near = Math.max(dist * 0.001, 0.1);
  camera.far  = dist * 20;
  camera.updateProjectionMatrix();

  // ── Inline orbit controls (no CDN dependency) ────────────────────────────
  const _orbit = _makeOrbitControls(camera, _3dRenderer.domElement, centre, dist);

  // ── Overlays ─────────────────────────────────────────────────────────────
  wrap.style.position = 'relative';

  // Grade legend
  const legend = document.createElement('div');
  legend.style.cssText = `position:absolute;bottom:12px;left:12px;font-size:10px;
    font-family:monospace;pointer-events:none;background:rgba(0,0,0,0.55);
    padding:8px 10px;border-radius:3px;border:1px solid #1a2a1a`;
  legend.innerHTML = [
    ['#ffffff', '> 15 g/t'],
    ['#ff8800', '10–15 g/t'],
    ['#ff4400', '5–10 g/t'],
    ['#ff2200', '2–5 g/t'],
    ['#cc1100', '0.5–2 g/t'],
  ].map(([c, l]) => `
    <div style="display:flex;align-items:center;gap:6px;margin-bottom:3px">
      <span style="width:10px;height:10px;border-radius:50%;background:${c};display:inline-block"></span>
      <span style="color:#88aa88">${l}</span>
    </div>`).join('');
  wrap.appendChild(legend);

  // Hole count badge
  const badge = document.createElement('div');
  badge.style.cssText = `position:absolute;top:10px;right:10px;font-size:10px;
    color:var(--muted);font-family:monospace;background:rgba(0,0,0,0.55);
    padding:4px 8px;border-radius:2px;border:1px solid #1a2a1a;pointer-events:none`;
  badge.textContent = `${holesWithData.length} holes · ${
    holesWithData.reduce((s, h) => s + (h.intervals||[]).filter(i=>i.grade>0).length, 0)
  } intercepts · ${meshCount} objects${hasCoords ? ' · real coords' : ' · synthetic layout'}`;
  wrap.appendChild(badge);

  // ── Animation loop ───────────────────────────────────────────────────────
  function animate() {
    _3dAnimFrame = requestAnimationFrame(animate);
    _orbit.update();
    _3dRenderer.render(scene, camera);
  }
  animate();

  // Resize handler
  new ResizeObserver(() => {
    const w = wrap.clientWidth, h = wrap.clientHeight;
    if (!w || !h) return;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    _3dRenderer.setSize(w, h);
  }).observe(wrap);
}

// ── Minimal orbit controls (rotate / zoom / pan) ─────────────────────────────
function _makeOrbitControls(camera, domEl, target, sceneSize) {
  const _t  = target.clone();
  let _phi  = Math.acos((camera.position.y - _t.y) / camera.position.distanceTo(_t));
  let _theta = Math.atan2(camera.position.x - _t.x, camera.position.z - _t.z);
  let _r    = camera.position.distanceTo(_t);
  let _mouse = null, _button = 0;
  let _velPhi = 0, _velTheta = 0;

  const _update = () => {
    _velPhi   *= 0.88;
    _velTheta *= 0.88;
    _phi   += _velPhi;
    _theta += _velTheta;
    _phi = Math.max(0.05, Math.min(Math.PI - 0.05, _phi));
    camera.position.set(
      _t.x + _r * Math.sin(_phi) * Math.sin(_theta),
      _t.y + _r * Math.cos(_phi),
      _t.z + _r * Math.sin(_phi) * Math.cos(_theta),
    );
    camera.lookAt(_t);
  };

  domEl.addEventListener('mousedown', e => { _mouse = { x: e.clientX, y: e.clientY }; _button = e.button; e.preventDefault(); });
  domEl.addEventListener('contextmenu', e => e.preventDefault());

  window.addEventListener('mousemove', e => {
    if (!_mouse) return;
    const dx = e.clientX - _mouse.x, dy = e.clientY - _mouse.y;
    _mouse = { x: e.clientX, y: e.clientY };
    if (_button === 0) {
      // Left drag → rotate
      _velTheta -= dx * 0.008;
      _velPhi   -= dy * 0.008;
    } else if (_button === 2) {
      // Right drag → pan (camera-relative axes)
      const panScale = _r * 0.001;
      const forward = new THREE.Vector3().subVectors(camera.position, _t).normalize();
      const right   = new THREE.Vector3().crossVectors(forward, camera.up).normalize();
      const up      = new THREE.Vector3().crossVectors(right, forward).normalize();
      _t.addScaledVector(right, dx * panScale);
      _t.addScaledVector(up,   -dy * panScale);
    }
  });

  window.addEventListener('mouseup', () => { _mouse = null; });

  domEl.addEventListener('wheel', e => {
    _r = Math.max(50, Math.min(sceneSize * 8, _r * (1 + e.deltaY * 0.001)));
    e.preventDefault();
  }, { passive: false });

  domEl.addEventListener('touchstart', e => {
    if (e.touches.length === 1) _mouse = { x: e.touches[0].clientX, y: e.touches[0].clientY, _button: 0 };
  }, { passive: true });
  domEl.addEventListener('touchmove', e => {
    if (!_mouse || e.touches.length !== 1) return;
    const dx = e.touches[0].clientX - _mouse.x, dy = e.touches[0].clientY - _mouse.y;
    _mouse = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    _velTheta -= dx * 0.008;
    _velPhi   -= dy * 0.008;
  }, { passive: true });
  domEl.addEventListener('touchend', () => { _mouse = null; }, { passive: true });

  return { update: _update };
}
