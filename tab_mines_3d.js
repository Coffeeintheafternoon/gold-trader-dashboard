// tab_mines_3d.js — Interactive 3D drill intercept viewer (Three.js)
// Uses real coordinates if available, otherwise arranges holes synthetically.

let _3dRenderer  = null;
let _3dAnimFrame = null;

function minesRender3D(holes) {
  const wrap = document.getElementById('mines-3d-wrap');
  if (!wrap) return;

  if (_3dAnimFrame) { cancelAnimationFrame(_3dAnimFrame); _3dAnimFrame = null; }
  if (_3dRenderer)  { _3dRenderer.dispose(); _3dRenderer = null; }

  const THREE = window.THREE;
  if (!THREE) {
    wrap.innerHTML = `<div style="height:100%;display:flex;align-items:center;justify-content:center;
      color:var(--muted);font-size:12px">Three.js not loaded — refresh the page</div>`;
    return;
  }

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

  const SECTION_SPACING = 80;   // metres between sections
  const HOLE_SPACING    = 40;   // metres between holes within a section
  const sectionKeys = Object.keys(sections);

  const holePos = {};   // hole_id → {x, z, azRad, dipRad, depth}
  sectionKeys.forEach((pfx, si) => {
    const group = sections[pfx];
    group.forEach((h, hi) => {
      let x, z;
      if (hasCoords) {
        x = h.easting  - cx;
        z = h.northing - cy;
      } else {
        x = si * SECTION_SPACING;
        z = (hi - (group.length - 1) / 2) * HOLE_SPACING;
      }
      const az  = ((h.azimuth || 0)   * Math.PI) / 180;
      const dip = ((h.dip     || -90) * Math.PI) / 180;
      const dep = h.total_depth_m ||
        Math.max(...h.intervals.map(i => i.to_m || 0), 200);
      holePos[h.id] = { x, z, azRad: az, dipRad: dip, depth: dep };
    });
  });

  // ── Scene setup ──────────────────────────────────────────────────────────
  wrap.innerHTML = '';
  const W = wrap.clientWidth || 900;
  const H = wrap.clientHeight || 520;

  const scene    = new THREE.Scene();
  scene.background = new THREE.Color(0x020a02);
  scene.fog = new THREE.FogExp2(0x020a02, 0.0008);

  const camera = new THREE.PerspectiveCamera(50, W / H, 0.5, 20000);
  _3dRenderer = new THREE.WebGLRenderer({ antialias: true });
  _3dRenderer.setSize(W, H);
  _3dRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  wrap.appendChild(_3dRenderer.domElement);

  // Grid
  const grid = new THREE.GridHelper(2000, 40, 0x112211, 0x0a150a);
  scene.add(grid);

  // Lights
  scene.add(new THREE.AmbientLight(0x223322, 1.5));
  const sun = new THREE.DirectionalLight(0xaaffaa, 1.0);
  sun.position.set(600, 1000, 400);
  scene.add(sun);

  // ── Build geometry ───────────────────────────────────────────────────────
  const gradeColor = (g) => {
    if (!g || g <= 0) return new THREE.Color(0x1a2a1a);
    if (g > 15) return new THREE.Color(0xffffff);
    if (g > 10) return new THREE.Color(0xccff00);
    if (g > 5)  return new THREE.Color(0xaaff00);
    if (g > 2)  return new THREE.Color(0xffcc00);
    if (g > 0.5)return new THREE.Color(0x33cc44);
    return new THREE.Color(0x1a4a1a);
  };

  let allPoints = [];

  holesWithData.forEach(hole => {
    const pos = holePos[hole.id];
    if (!pos) return;

    const { x, z, azRad, dipRad, depth } = pos;
    const y0 = 0;

    // Direction vector (downward into ground)
    const dx = depth * Math.sin(azRad) * Math.cos(dipRad);
    const dy = depth * Math.sin(dipRad);   // negative = downward
    const dz = depth * Math.cos(azRad) * Math.cos(dipRad);

    // Hole trace line
    const pts = [new THREE.Vector3(x, y0, z), new THREE.Vector3(x+dx, y0+dy, z+dz)];
    const lineGeo = new THREE.BufferGeometry().setFromPoints(pts);
    scene.add(new THREE.Line(lineGeo, new THREE.LineBasicMaterial({ color: 0x223322, linewidth: 1 })));
    allPoints.push(...pts);

    // Collar sphere
    const collarMesh = new THREE.Mesh(
      new THREE.SphereGeometry(3, 10, 10),
      new THREE.MeshLambertMaterial({ color: 0x55aa55, emissive: 0x112211 })
    );
    collarMesh.position.set(x, y0, z);
    scene.add(collarMesh);

    // Intercept cylinders
    hole.intervals.forEach(iv => {
      if (!iv.grade || iv.grade < 0.1) return;
      const f = (iv.from_m || 0) / depth;
      const t = Math.min((iv.to_m || 0) / depth, 1.0);
      const len = Math.max(((iv.to_m||0) - (iv.from_m||0)), 1);

      const mx = x  + dx * (f + t) / 2;
      const my = y0 + dy * (f + t) / 2;
      const mz = z  + dz * (f + t) / 2;

      // Radius scales with grade
      const radius = Math.min(3 + iv.grade * 0.4, 12);
      const geo  = new THREE.CylinderGeometry(radius, radius, len, 12);
      const col  = gradeColor(iv.grade);
      const mat  = new THREE.MeshLambertMaterial({
        color: col,
        emissive: col,
        emissiveIntensity: 0.2,
        transparent: true,
        opacity: 0.88,
      });
      const mesh = new THREE.Mesh(geo, mat);

      // Orient along drill direction
      const dir = new THREE.Vector3(dx, dy, dz).normalize();
      mesh.setRotationFromQuaternion(
        new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir)
      );
      mesh.position.set(mx, my, mz);
      scene.add(mesh);
      allPoints.push(new THREE.Vector3(mx, my, mz));
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
  camera.near = dist * 0.001;
  camera.far  = dist * 10;
  camera.updateProjectionMatrix();

  // ── Orbit controls ───────────────────────────────────────────────────────
  let controls = null;
  const _tryControls = () => {
    if (window.THREE_OrbitControls && !controls) {
      controls = new window.THREE_OrbitControls(camera, _3dRenderer.domElement);
      controls.target.copy(centre);
      controls.enableDamping = true;
      controls.dampingFactor = 0.06;
      controls.minDistance   = 10;
      controls.maxDistance   = dist * 5;
      controls.update();
    }
  };
  _tryControls();
  // Retry after 1s in case module script hasn't loaded yet
  setTimeout(_tryControls, 1000);

  // ── Overlays ─────────────────────────────────────────────────────────────
  wrap.style.position = 'relative';

  // Grade legend
  const legend = document.createElement('div');
  legend.style.cssText = `position:absolute;bottom:12px;left:12px;font-size:10px;
    font-family:monospace;pointer-events:none;background:rgba(0,0,0,0.55);
    padding:8px 10px;border-radius:3px;border:1px solid #1a2a1a`;
  legend.innerHTML = [
    ['#ffffff', '> 15 g/t'],
    ['#ccff00', '10–15 g/t'],
    ['#aaff00', '5–10 g/t'],
    ['#ffcc00', '2–5 g/t'],
    ['#33cc44', '0.5–2 g/t'],
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
  } intercepts${hasCoords ? '' : ' · synthetic layout'}`;
  wrap.appendChild(badge);

  // ── Animation loop ───────────────────────────────────────────────────────
  function animate() {
    _3dAnimFrame = requestAnimationFrame(animate);
    if (controls) controls.update();
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
