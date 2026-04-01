// tab_mines_3d.js — Interactive 3D drill intercept viewer (Three.js)
// Uses real coordinates if available, otherwise arranges holes synthetically.

let _3dRenderer  = null;
let _3dAnimFrame = null;

function minesRender3D(holes, containerId) {
  const wrap = document.getElementById(containerId || 'mines-3d-wrap');
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

  // Robust median helper — immune to outlier parsing artifacts
  const _median = arr => { const s = [...arr].sort((a,b)=>a-b); const m = s.length>>1; return s.length%2 ? s[m] : (s[m-1]+s[m])/2; };
  const _iqrFilter = (arr, vals, k=3) => {
    const med = _median(arr);
    const devs = arr.map(v => Math.abs(v - med));
    const mad  = _median(devs) || 1;
    return vals.filter((_, i) => Math.abs(arr[i] - med) <= k * mad * 1.4826);
  };

  let cx = 0, cy = 0;
  if (hasCoords) {
    const es = holesWithData.map(h => h.easting);
    const ns = holesWithData.map(h => h.northing);
    cx = _median(es);
    cy = _median(ns);
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
    // Dip is stored negative-downward (convention) OR positive-downward (some companies).
    // Always treat as downward: negate so dipRad is always negative (below horizontal).
    const az  = ((h.azimuth || (i % 4) * 90) * Math.PI) / 180;
    const dip = (-Math.abs(h.dip || 60)      * Math.PI) / 180;
    const dep = h.total_depth_m ||
      Math.max(...h.intervals.map(iv => iv.to_m || 0), 150);
    holePos[h.id] = { x, z, azRad: az, dipRad: dip, depth: dep };
  });

  // ── Scene setup ──────────────────────────────────────────────────────────
  wrap.innerHTML = '';
  const W = wrap.clientWidth || 900;
  const H = wrap.clientHeight || 520;

  // Pre-compute scene extent to scale grid/fog/camera correctly
  // Use IQR-filtered coords so one bad parse can't blow out the scale
  const _extE = hasCoords ? holesWithData.map(h => h.easting  - cx) : holesWithData.map((_,i) => (i % COLS) * HOLE_SPACING);
  const _extN = hasCoords ? holesWithData.map(h => h.northing - cy) : holesWithData.map((_,i) => Math.floor(i / COLS) * HOLE_SPACING);
  const _filtE = hasCoords ? _iqrFilter(_extE, _extE) : _extE;
  const _filtN = hasCoords ? _iqrFilter(_extN, _extN) : _extN;
  const sceneSpan = Math.max(
    Math.max(..._filtE) - Math.min(..._filtE),
    Math.max(..._filtN) - Math.min(..._filtN),
    500
  );

  const scene    = new THREE.Scene();
  scene.background = new THREE.Color(0x0a0a12);

  const camera = new THREE.PerspectiveCamera(50, W / H, sceneSpan * 0.0001, sceneSpan * 20);
  _3dRenderer = new THREE.WebGLRenderer({ antialias: true });
  _3dRenderer.setSize(W, H);
  _3dRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  wrap.appendChild(_3dRenderer.domElement);

  // Grid — scales to scene, capped at 100 divisions to avoid GPU overload
  const gridSize = Math.ceil(sceneSpan * 1.1 / 100) * 100;
  const gridDivs = Math.min(Math.round(sceneSpan / 200), 100);
  const grid = new THREE.GridHelper(gridSize, gridDivs, 0x334455, 0x1a2233);
  scene.add(grid);

  // Ground plane — semi-opaque so drill holes visibly pierce the surface
  const groundMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(gridSize, gridSize),
    new THREE.MeshLambertMaterial({
      color: 0x1a2233, transparent: true, opacity: 0.25, side: THREE.DoubleSide,
    })
  );
  groundMesh.rotation.x = -Math.PI / 2;
  scene.add(groundMesh);

  // Neutral white lights so all colours render correctly
  scene.add(new THREE.AmbientLight(0xffffff, 0.6));
  const sun = new THREE.DirectionalLight(0xffffff, 0.8);
  sun.position.set(sceneSpan * 0.3, sceneSpan * 0.5, sceneSpan * 0.2);
  scene.add(sun);

  // ── Build geometry ───────────────────────────────────────────────────────
  // geomScale drives collar sphere + cylinder radius.
  // Large UTM scenes (PDI ~23km): 0.00025 → ~5.75m — tuned to avoid clipping at 40m spacing.
  // Small mine-grid scenes (BGL ~1.6km): needs ~0.5% of sceneSpan to be visible at all.
  const geomScale = sceneSpan < 5000
    ? Math.max(sceneSpan * 0.01, 5)    // mine-grid scale
    : sceneSpan * 0.00025;             // UTM scale

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
    scene.add(new THREE.Line(lineGeo, new THREE.LineBasicMaterial({ color: 0x8899bb })));
    allPoints.push(...pts);

    // Collar sphere — scaled to scene
    const collar = new THREE.Mesh(
      new THREE.SphereGeometry(geomScale * 0.6, 8, 8),
      new THREE.MeshLambertMaterial({ color: 0xddcc55, emissive: 0x443300 })
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

      const radius = geomScale * (0.3 + Math.min(iv.grade / 25, 0.7));
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
  // Filter outlier points before fitting camera so one bad coord can't push the camera miles back
  const _apx = allPoints.map(p => p.x), _apz = allPoints.map(p => p.z);
  const _mX = _median(_apx), _mZ = _median(_apz);
  const _dX = (_median(_apx.map(v => Math.abs(v - _mX))) || 1) * 1.4826 * 3;
  const _dZ = (_median(_apz.map(v => Math.abs(v - _mZ))) || 1) * 1.4826 * 3;
  const _corePoints = allPoints.filter((p, i) =>
    Math.abs(_apx[i] - _mX) <= _dX && Math.abs(_apz[i] - _mZ) <= _dZ
  );
  const bbox = new THREE.Box3();
  (_corePoints.length ? _corePoints : allPoints).forEach(p => bbox.expandByPoint(p));
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
    [null, null],                               // separator
    ['#ff3300', '— Fault / shear zone'],
    ['#8B7355', '▪ Sedimentary'],
    ['#4a6741', '▪ Volcanic / greenstone'],
    ['#ff6633', '▪ Intrusive / granite'],
    ['#557799', '▪ Metamorphic'],
  ].map(([c, l]) => !c ? '<div style="border-top:1px solid #1a2a1a;margin:4px 0"></div>' : `
    <div style="display:flex;align-items:center;gap:6px;margin-bottom:3px">
      <span style="width:10px;height:10px;border-radius:${l.startsWith('—') ? '0' : '50%'};background:${c};display:inline-block"></span>
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

  // Store scene context on the container so callers can overlay meshes after render
  wrap._threeScene = scene;
  wrap._threeCx    = hasCoords ? cx : 0;
  wrap._threeCy    = hasCoords ? cy : 0;
  // Median collar RL → Y=0 reference elevation for 3D scene
  const _rls = holesWithData.filter(h => h.rl != null).map(h => h.rl);
  wrap._threeZRef  = _rls.length > 0 ? _median(_rls) : 0;
  // If a pending ore body mesh was queued (e.g. from DFS Pred tab), add it now
  if (wrap._pendingMesh && typeof sdfsAddOreMesh === 'function') {
    sdfsAddOreMesh(wrap.id, wrap._pendingMesh);
    delete wrap._pendingMesh;
  }
  // If a pending ground surface terrain mesh was queued, add it now
  if (wrap._pendingGround && typeof sdfsAddGroundSurface === 'function') {
    sdfsAddGroundSurface(wrap.id, wrap._pendingGround);
    delete wrap._pendingGround;
  }

  // Geology overlay — async, non-blocking. Only fires for tickers with real UTM coords.
  _overlayGeology(scene, groundMesh, cx, cy, gridSize, holesWithData, badge).catch(() => {});

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
      // Left drag → rotate; sensitivity scales with zoom so close-up stays controllable
      const sens = Math.max(0.0003, 0.003 * Math.min(_r / sceneSize, 1));
      _velTheta -= dx * sens;
      _velPhi   -= dy * sens;
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
    // Normalise across mouse wheel (deltaY ~100/tick) and trackpad (deltaY ~3/tick)
    const delta = e.deltaMode === 0 ? e.deltaY * 0.003 : e.deltaY * 0.3;
    _r = Math.max(50, Math.min(sceneSize * 8, _r * (1 + delta)));
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

// ── Geology overlay functions ─────────────────────────────────────────────────

function _detectUTMZone(holes) {
  // Return EPSG number if we can identify a real UTM zone from collar coordinates.
  // UTM 29N (Guinea / PDI): eastings ~300k-500k, northings ~900k-1.5M
  const h = (holes || []).find(h => h.easting != null && h.northing != null);
  if (!h) return null;
  const e = h.easting, n = h.northing;
  if (e > 300000 && e < 500000 && n > 900000 && n < 1500000) return 32629;
  // Mine-grid (BGL): small relative coords — no reprojection without datum origin
  return null;
}

function _loadProj4() {
  if (window.proj4) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/proj4js/2.9.0/proj4.min.js';
    s.onload = () => {
      // Define UTM 29N for Guinea (PDI.AX)
      if (window.proj4) {
        proj4.defs('EPSG:32629', '+proj=utm +zone=29 +datum=WGS84 +units=m +no_defs');
      }
      resolve();
    };
    s.onerror = () => reject(new Error('proj4.js load failed'));
    document.head.appendChild(s);
  });
}

async function _overlayGeology(scene, groundMesh, cx, cy, gridSize, holes, badge) {
  const THREE = window.THREE;
  const utmZone = _detectUTMZone(holes);
  if (!utmZone) return;  // Mine-grid tickers can't be overlaid without datum origin

  await _loadProj4();

  // Convert scene centre (UTM metres) to lat/lng for WMS/WFS requests
  const pad = gridSize * 0.05;
  const [lng1, lat1] = proj4('EPSG:' + utmZone, 'EPSG:4326', [cx - gridSize/2 - pad, cy - gridSize/2 - pad]);
  const [lng2, lat2] = proj4('EPSG:' + utmZone, 'EPSG:4326', [cx + gridSize/2 + pad, cy + gridSize/2 + pad]);

  // ── WMS texture on ground plane ───────────────────────────────────────────
  // USGS GSC World: open CORS, returns PNG with geology + faults
  const wmsUrl = `https://mrdata.usgs.gov/services/gscworld`
    + `?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap`
    + `&LAYERS=geology,flt`
    + `&CRS=EPSG:4326`
    + `&BBOX=${lat1},${lng1},${lat2},${lng2}`
    + `&WIDTH=512&HEIGHT=512`
    + `&FORMAT=image/png&TRANSPARENT=TRUE`;

  const loader = new THREE.TextureLoader();
  loader.setCrossOrigin('anonymous');
  loader.load(
    wmsUrl,
    (tex) => {
      // Apply texture to existing ground plane
      groundMesh.material.map = tex;
      groundMesh.material.color.set(0xffffff);  // don't tint the texture
      groundMesh.material.opacity = 0.65;
      groundMesh.material.needsUpdate = true;

      // Update badge to show geology loaded
      if (badge) {
        const cur = badge.textContent || '';
        if (!cur.includes('geo')) badge.textContent = cur + ' · geo';
      }
    },
    undefined,
    () => {}  // silently ignore WMS errors (optional overlay)
  );

  // ── WFS fault lines ───────────────────────────────────────────────────────
  const wfsUrl = `https://mrdata.usgs.gov/services/gscworld`
    + `?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetFeature`
    + `&TYPENAMES=flt&COUNT=100&OUTPUTFORMAT=application/json`
    + `&BBOX=${lat1},${lng1},${lat2},${lng2},EPSG:4326`;

  try {
    const r = await fetch(wfsUrl);
    if (r.ok) {
      const gj = await r.json();
      _add3DFaultLines(scene, gj, cx, cy, utmZone);
    }
  } catch (_) {}
}

function _add3DFaultLines(scene, geojson, cx, cy, utmZone, depth) {
  const THREE = window.THREE;
  depth = depth || 600;
  const features = (geojson && geojson.features) || [];
  features.forEach(f => {
    const geom = f.geometry;
    if (!geom) return;
    const lines = geom.type === 'LineString'
      ? [geom.coordinates]
      : geom.type === 'MultiLineString' ? geom.coordinates : [];

    lines.forEach(coords => {
      // Surface trace — bright red
      const pts = coords.map(([lng, lat]) => {
        const [e, n] = proj4('EPSG:4326', 'EPSG:' + utmZone, [lng, lat]);
        return new THREE.Vector3(e - cx, 0, n - cy);
      });
      if (pts.length < 2) return;
      const lineGeo = new THREE.BufferGeometry().setFromPoints(pts);
      scene.add(new THREE.Line(lineGeo, new THREE.LineBasicMaterial({ color: 0xff3300 })));

      // Depth projection — dashed down-dip planes (one vertical line per vertex)
      pts.forEach(p => {
        const vPts = [p.clone(), new THREE.Vector3(p.x, -depth, p.z)];
        const vGeo = new THREE.BufferGeometry().setFromPoints(vPts);
        scene.add(new THREE.Line(vGeo,
          new THREE.LineBasicMaterial({ color: 0xff3300, transparent: true, opacity: 0.25 })
        ));
      });
    });
  });
}
