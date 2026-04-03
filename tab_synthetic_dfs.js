// tab_synthetic_dfs.js — Synthetic DFS Prediction Pipeline tab
// Shows drill visualisations and stats for each ticker/target.

let _synthDFSData = null;
const _mineMapInstances = {};

// ── Satellite map base layers ─────────────────────────────────────────────────
// Add or remove entries here to change what appears in the layer switcher.
// 'default: true' marks which base layer is shown on load.
const _SDFS_BASE_LAYERS = [
  {
    name: 'Satellite',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: '© Esri World Imagery',
    maxZoom: 19,
    default: true,
  },
  {
    name: 'Topo',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}',
    attribution: '© Esri World Topo',
    maxZoom: 19,
  },
  {
    name: 'Streets',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}',
    attribution: '© Esri World Street',
    maxZoom: 19,
  },
];

async function initSynthDFSTab() {
  const body = document.getElementById('synth-dfs-body');
  const loading = document.getElementById('synth-dfs-loading');
  if (!body) return;

  try {
    const r = await fetch('synthetic_dfs_data.json?v=' + Date.now());
    if (!r.ok) throw new Error('synthetic_dfs_data.json not found');
    _synthDFSData = await r.json();
  } catch (e) {
    loading.innerHTML = `<div style="color:var(--muted);padding:40px;text-align:center">
      No synthetic DFS data yet.<br>
      <small>Run the pipeline: <code>python scripts/synthetic_dfs/run_pipeline.py --ticker MEK --target fs1</code></small>
    </div>`;
    return;
  }

  loading.style.display = 'none';
  body.style.display = 'block';
  body.innerHTML = buildSynthDFS(_synthDFSData);

  // Attach grade-volume curve data to each target pane so the chart renderer can access it
  const tickers2 = Object.keys(_synthDFSData.tickers || {});
  tickers2.forEach(ticker => {
    const tdata = _synthDFSData.tickers[ticker];
    Object.keys(tdata.targets || {}).forEach((tkey, i) => {
      const t = tdata.targets[tkey];
      const gvc = t.mission1 && t.mission1.grade_volume_curve;
      if (gvc && gvc.length > 1) {
        const pane = document.getElementById(`sdfs-pane-${ticker}-${tkey}`);
        if (pane) pane._gvcData = gvc;
      }
      // Render chart for the initially visible pane
      if (i === 0) _sdfsRenderGVC(ticker, tkey);
    });
  });

  // Init satellite maps for all tickers (first one is visible; others get invalidateSize on switch)
  Object.entries(_synthDFSData.tickers || {}).forEach(([ticker, tdata]) => {
    const mi = tdata.mine_info;
    if (mi && mi.lat != null && mi.lng != null) {
      _sdfsInitMineMap(ticker, mi.lat, mi.lng, mi, tdata.drill_collars);
    }
  });
}

function _sdfsInitMineMap(ticker, lat, lng, mi, drillCollars) {
  if (!window.L) return;
  const containerId = `sdfs-mine-map-${ticker}`;
  const container = document.getElementById(containerId);
  if (!container || _mineMapInstances[ticker]) return;

  const map = L.map(containerId, { zoomControl: true, attributionControl: true })
    .setView([lat, lng], 14);

  // ── Base layers ───────────────────────────────────────────────────────────
  const baseLayers = {};
  _SDFS_BASE_LAYERS.forEach(cfg => {
    const layer = L.tileLayer(cfg.url, { attribution: cfg.attribution, maxZoom: cfg.maxZoom || 19 });
    if (cfg.default) layer.addTo(map);
    baseLayers[cfg.name] = layer;
  });

  // ── Mine-specific tile/WMS overlays from mine_info.map_overlays ───────────
  const overlayLayers = {};
  const mapOverlays = (mi && mi.map_overlays) || [];
  mapOverlays.forEach(ov => {
    let layer;
    if (ov.type === 'wms') {
      layer = L.tileLayer.wms(ov.url, { layers: ov.wms_layers || '', ...(ov.options || {}) });
    } else {
      layer = L.tileLayer(ov.url, { attribution: ov.attribution || '', maxZoom: ov.maxZoom || 19, ...(ov.options || {}) });
    }
    if (ov.default) layer.addTo(map);
    overlayLayers[ov.name] = layer;
  });

  // ── Drill collar layers ───────────────────────────────────────────────────
  // ASX holes: orange — company's announced drill holes (significant intercepts only)
  // WAMEX holes: cyan  — government-registered historical holes (complete assay record)
  const asxCollars   = (drillCollars && drillCollars.asx)   || [];
  const wamexCollars = (drillCollars && drillCollars.wamex) || [];

  function _makeCollarLayer(collars, color, label) {
    const group = L.layerGroup();
    collars.forEach(c => {
      L.circleMarker([c.lat, c.lng], {
        radius: 4, color: color, fillColor: color,
        fillOpacity: 0.75, weight: 1.5,
      }).bindTooltip(
        `<b>${c.hole_id}</b><br>Depth: ${c.depth_m}m<br><span style="color:${color}">${label}</span>`,
        { sticky: true, direction: 'top', offset: [0, -4] }
      ).addTo(group);
    });
    return group;
  }

  if (asxCollars.length) {
    const layer = _makeCollarLayer(asxCollars, '#ff8c00', `ASX drill (${asxCollars.length} holes)`);
    layer.addTo(map);
    overlayLayers[`ASX Drill Holes (${asxCollars.length})`] = layer;
  }
  if (wamexCollars.length) {
    const layer = _makeCollarLayer(wamexCollars, '#00bcd4', `WAMEX historical (${wamexCollars.length} holes)`);
    layer.addTo(map);
    overlayLayers[`WAMEX Historical Holes (${wamexCollars.length})`] = layer;
  }

  // ── Layer control ─────────────────────────────────────────────────────────
  if (_SDFS_BASE_LAYERS.length > 1 || Object.keys(overlayLayers).length) {
    L.control.layers(baseLayers, overlayLayers, { collapsed: false }).addTo(map);
  }

  // Mine site centre marker
  L.circleMarker([lat, lng], {
    radius: 7, color: '#8bc34a', fillColor: '#8bc34a', fillOpacity: 0.55, weight: 2
  }).bindTooltip(`${ticker} — ${mi.project || ''}`, { permanent: false }).addTo(map);

  _mineMapInstances[ticker] = map;
}

function buildSynthDFS(data) {
  const tickers = Object.keys(data.tickers || {});
  if (!tickers.length) return '<p style="color:var(--muted)">No pipeline outputs found.</p>';

  // Ticker toggle buttons
  const toggleBtns = tickers.map((t, i) =>
    `<button class="sdfs-ticker-btn ${i === 0 ? 'sdfs-ticker-active' : ''}"
       id="sdfs-ticker-btn-${t}"
       onclick="sdfsSelectTicker('${t}')">${t}</button>`
  ).join('');

  let sections = '';
  for (const ticker of tickers) {
    const tdata = data.tickers[ticker];
    const visible = tickers.indexOf(ticker) === 0;
    sections += `<div id="sdfs-ticker-section-${ticker}" style="display:${visible ? 'block' : 'none'}">
      ${buildTickerSection(ticker, tdata)}
    </div>`;
  }

  return `
    <div style="margin-bottom:20px;display:flex;align-items:center;gap:16px;flex-wrap:wrap">
      <div style="display:flex;gap:6px">${toggleBtns}</div>
      <span style="color:var(--muted);font-size:12px">Updated: ${data.updated_at ? data.updated_at.slice(0,19).replace('T',' ') + ' UTC' : '—'}</span>
    </div>
    ${sections}`;
}

function sdfsSelectTicker(ticker) {
  document.querySelectorAll('[id^="sdfs-ticker-section-"]').forEach(el => el.style.display = 'none');
  document.querySelectorAll('.sdfs-ticker-btn').forEach(el => el.classList.remove('sdfs-ticker-active'));
  const section = document.getElementById(`sdfs-ticker-section-${ticker}`);
  const btn     = document.getElementById(`sdfs-ticker-btn-${ticker}`);
  if (section) section.style.display = 'block';
  if (btn) btn.classList.add('sdfs-ticker-active');
  // Leaflet needs a size refresh after container becomes visible
  setTimeout(() => { _mineMapInstances[ticker]?.invalidateSize(); }, 50);
}

function buildMineInfoPanel(mi) {
  if (!mi || typeof mi !== 'object') return '';
  const fv = (v, dp) => v == null ? '—' : (typeof v === 'number' ? (dp != null ? v.toFixed(dp) : v) : String(v));
  const chip = (txt, col='#8bc34a', bg='#1a2a1a', border='#2a3a2a') =>
    `<span style="font-size:10px;padding:2px 8px;border-radius:3px;background:${bg};border:1px solid ${border};color:${col};margin-right:5px;white-space:nowrap">${txt}</span>`;

  // ── Header chips ──────────────────────────────────────────────────────────
  const chips = [];
  if (mi.commodity)     chips.push(chip(mi.commodity, '#f5c518', '#1a1800', '#3a3200'));
  if (mi.deposit_style) chips.push(chip(mi.deposit_style));
  if (mi.depth_range_m) chips.push(chip('Depth: ' + mi.depth_range_m, '#88aacc', '#0a1a2a', '#1a2a3a'));
  const chipsHtml = chips.length ? `<div style="margin-bottom:10px">${chips.join('')}</div>` : '';

  // ── Location row ──────────────────────────────────────────────────────────
  const lat = mi.lat, lng = mi.lng;
  const hasCoords = lat != null && lng != null && (lat !== 0 || lng !== 0);
  const mapsUrl = hasCoords ? `https://www.google.com/maps/search/?api=1&query=${lat},${lng}` : null;
  const locationHtml = `
    <div style="display:flex;flex-wrap:wrap;gap:16px;margin-bottom:12px;font-size:11px;color:#aaa">
      ${hasCoords ? `<span>📍 ${lat.toFixed(4)}°, ${lng.toFixed(4)}° ${mi.state || ''}
        <a href="${mapsUrl}" target="_blank" style="color:var(--accent);text-decoration:none;margin-left:4px">map ↗</a></span>` : ''}
      ${mi.location_description ? `<span>📌 ${mi.location_description}</span>` : ''}
      ${mi.rock_type ? `<span>🪨 ${mi.rock_type}</span>` : ''}
      ${mi.structural_setting ? `<span>⚡ ${mi.structural_setting}</span>` : ''}
      ${mi.discovery ? `<span>🔍 Discovered ${mi.discovery}</span>` : ''}
    </div>`;

  // ── Resource comparison table ─────────────────────────────────────────────
  const pub = mi.published_mre;
  const mdl = mi.our_model;
  let resourceHtml = '';
  if (pub || mdl) {
    const errColor = mdl && mdl.pass === true ? '#44bb88' : mdl && mdl.pass === false ? '#ff6666' : '#888';
    const errLabel = mdl && mdl.error_pct != null
      ? `<span style="color:${errColor};font-size:10px">${mdl.error_pct > 0 ? '+' : ''}${mdl.error_pct.toFixed(1)}% ${mdl.pass ? '✓ PASS' : '✗ OUTSIDE'}</span>` : '';

    // JORC split mini-bar
    let jorcHtml = '';
    if (mdl && mdl.jorc_split) {
      const j = mdl.jorc_split;
      const total = j.Total || 1;
      jorcHtml = `
        <div style="margin-top:10px">
          <div style="font-size:9px;color:#666;margin-bottom:4px;text-transform:uppercase;letter-spacing:0.06em">JORC Classification (model)</div>
          <div style="display:flex;gap:12px;flex-wrap:wrap">
            ${[['Measured','#44bb88'], ['Indicated','#f5c518'], ['Inferred','#888']].map(([cat, col]) => j[cat] != null ? `
              <div style="text-align:center">
                <div style="font-size:13px;font-weight:bold;color:${col}">${j[cat].toFixed(0)}</div>
                <div style="font-size:9px;color:#666">${cat} koz</div>
                <div style="font-size:9px;color:#555">${(j[cat]/total*100).toFixed(0)}%</div>
              </div>` : '').join('')}
          </div>
        </div>`;
    }

    resourceHtml = `
      <div style="margin-bottom:12px">
        <div style="font-size:10px;font-weight:600;color:#8888aa;text-transform:uppercase;letter-spacing:0.07em;margin-bottom:8px">Resource Estimate</div>
        <table style="border-collapse:collapse;width:100%;font-size:11px">
          <thead>
            <tr style="border-bottom:1px solid #2a2a2a">
              <th style="text-align:left;padding:3px 12px 3px 0;color:#666;font-weight:normal"></th>
              <th style="text-align:right;padding:3px 10px;color:#666;font-weight:normal">Tonnes (Mt)</th>
              <th style="text-align:right;padding:3px 10px;color:#666;font-weight:normal">Grade (g/t Au)</th>
              <th style="text-align:right;padding:3px 10px;color:#666;font-weight:normal">Contained</th>
              <th style="text-align:right;padding:3px 10px;color:#666;font-weight:normal">Cutoff</th>
            </tr>
          </thead>
          <tbody>
            ${pub ? `<tr style="border-bottom:1px solid #1a1a1a">
              <td style="padding:5px 12px 5px 0;color:#aaa">Published MRE</td>
              <td style="padding:5px 10px;color:#c9d1d9;text-align:right">${fv(pub.tonnes_mt, 1)}</td>
              <td style="padding:5px 10px;color:#f5c518;text-align:right">${fv(pub.grade_gt, 3)}</td>
              <td style="padding:5px 10px;color:#f5c518;text-align:right;font-weight:bold">${pub.contained_moz != null ? pub.contained_moz.toFixed(2) + ' Moz' : '—'}</td>
              <td style="padding:5px 10px;color:#666;text-align:right">${fv(pub.cutoff_gt, 1)} g/t</td>
            </tr>` : ''}
            ${mdl ? `<tr>
              <td style="padding:5px 12px 5px 0;color:#aaa">Our Model ${errLabel}</td>
              <td style="padding:5px 10px;color:#c9d1d9;text-align:right">${fv(mdl.tonnes_mt, 1)}</td>
              <td style="padding:5px 10px;color:#f5c518;text-align:right">${fv(mdl.grade_gt, 3)}</td>
              <td style="padding:5px 10px;color:#f5c518;text-align:right;font-weight:bold">${mdl.contained_koz != null ? (mdl.contained_koz/1000).toFixed(2) + ' Moz' : '—'}</td>
              <td style="padding:5px 10px;color:#666;text-align:right">—</td>
            </tr>` : ''}
          </tbody>
        </table>
        ${pub ? `<div style="font-size:9px;color:#444;margin-top:4px">${pub.source || ''}</div>` : ''}
        ${jorcHtml}
      </div>`;
  }

  // ── Regional context (Wikipedia) ─────────────────────────────────────────
  let wikiHtml = '';
  if (mi.wikipedia_summary) {
    let extract = mi.wikipedia_summary.replace(/\n/g, ' ').trim();
    if (extract.length > 250) extract = extract.slice(0, 247) + '…';
    wikiHtml = `
      <div style="font-size:10px;color:#666;border-top:1px solid #1a1a1a;padding-top:8px;margin-top:4px;line-height:1.5">
        <span style="color:#444">Regional context: </span>${extract}
        ${mi.wikipedia_url ? `<a href="${mi.wikipedia_url}" target="_blank" style="color:#555;margin-left:4px">↗</a>` : ''}
      </div>`;
  }

  if (!chipsHtml && !locationHtml && !resourceHtml) return '';

  const panelId = `mi-panel-${Math.random().toString(36).slice(2, 8)}`;
  return `
    <div style="background:#0d1117;border:1px solid #1a2a1a;border-radius:6px;margin-bottom:16px;overflow:hidden">
      <div onclick="const p=document.getElementById('${panelId}');p.style.display=p.style.display==='none'?'block':'none';this.querySelector('.mi-chev').style.transform=p.style.display==='none'?'rotate(0deg)':'rotate(90deg)'"
           style="display:flex;align-items:center;justify-content:space-between;padding:10px 14px;cursor:pointer;user-select:none;border-bottom:1px solid #1a2a1a">
        <span style="font-size:12px;font-weight:600;color:#8bc34a">Mine Info — ${mi.project || mi.company || ''}</span>
        <span class="mi-chev" style="color:#8bc34a;font-size:12px;transition:transform 0.2s;transform:rotate(90deg)">▶</span>
      </div>
      <div id="${panelId}" style="padding:14px">
        ${chipsHtml}
        ${locationHtml}
        ${resourceHtml}
        ${wikiHtml}
      </div>
    </div>`;
}

function buildTickerSection(ticker, tdata) {
  const targets = Object.keys(tdata.targets || {});
  if (!targets.length) return '';

  let tabBtns = '', tabPanes = '';
  targets.forEach((tkey, i) => {
    const t = tdata.targets[tkey];
    const active = i === 0 ? 'sdfs-tab-active' : '';
    tabBtns += `<button class="sdfs-tab-btn ${active}" onclick="sdfsSelectTarget('${ticker}','${tkey}')" id="sdfs-btn-${ticker}-${tkey}">${tkey.toUpperCase()}</button>`;
    tabPanes += buildTargetPane(ticker, tkey, t, i === 0);
  });

  const pdfGallery = buildPdfGallery(ticker, tdata.source_pdfs || []);
  const mineInfoPanel = buildMineInfoPanel(tdata.mine_info);

  const mi = tdata.mine_info;
  const hasCoords = mi && mi.lat != null && mi.lng != null && (mi.lat !== 0 || mi.lng !== 0);
  const satLabel = mi && (mi.project || mi.location_description) || '';
  const satMapHtml = hasCoords ? `
    <div class="sdfs-sat-map-wrap" style="margin-bottom:16px;border:1px solid #1a2a1a;border-radius:6px;overflow:hidden;position:relative;z-index:10000">
      <div style="padding:6px 12px;background:#0d1117;border-bottom:1px solid #1a2a1a;font-size:10px;color:#666;text-transform:uppercase;letter-spacing:0.07em">
        Satellite View${satLabel ? ' — ' + satLabel : ''}
      </div>
      <div id="sdfs-mine-map-${ticker}" style="height:480px;width:100%"></div>
    </div>` : '';

  return `
    <div style="margin-bottom:36px">
      <div style="display:flex;align-items:baseline;gap:12px;margin-bottom:12px">
        <h2 style="margin:0;font-size:18px;color:var(--accent)">${ticker}</h2>
        <span style="color:var(--muted);font-size:13px">${tdata.company || ''}</span>
      </div>
      ${mineInfoPanel}
      ${satMapHtml}
      <div style="display:flex;gap:8px;margin-bottom:16px">${tabBtns}</div>
      ${tabPanes}
      ${pdfGallery}
    </div>`;
}

function buildPdfGallery(ticker, pdfs) {
  if (!pdfs || !pdfs.length) return '';

  const cards = pdfs.map((p, i) => {
    const isHO = p.is_holdout;
    const badgeColor = isHO ? '#c0392b' : '#27ae60';
    const badgeText  = isHO ? 'HO' : 'IS';
    const dateStr    = p.date || '—';
    const safeName   = (p.label || p.filename).replace(/'/g, "\\'");
    const safeUrl    = (p.url  || '').replace(/'/g, "\\'");
    return `<div class="sdfs-pdf-card" onclick="sdfsPdfOpen('${safeUrl}','${safeName}')" title="${p.filename}">
      <div class="sdfs-pdf-thumb">
        <svg viewBox="0 0 32 40" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect width="32" height="40" rx="2" fill="#1e1e2e"/>
          <path d="M6 0h16l10 10v30H6z" fill="#252536"/>
          <path d="M22 0l10 10H22V0z" fill="#3a3a5c"/>
          <text x="16" y="28" font-family="monospace" font-size="7" fill="#e07b00" text-anchor="middle">PDF</text>
        </svg>
      </div>
      <div class="sdfs-pdf-meta">
        <div style="font-size:10px;color:#ddd;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:110px" title="${safeName}">${p.label || p.filename.replace('.pdf','')}</div>
        <div style="font-size:9px;color:#888;margin-top:2px">${dateStr}</div>
        <div style="margin-top:3px"><span style="font-size:9px;padding:1px 5px;border-radius:3px;background:${badgeColor};color:#fff;font-weight:bold">${badgeText}</span></div>
      </div>
    </div>`;
  }).join('');

  return `
    <div style="margin-top:20px">
      <div style="font-size:12px;font-weight:600;color:var(--accent);margin-bottom:10px">Source PDFs (${pdfs.length})</div>
      <div class="sdfs-pdf-gallery">${cards}</div>
    </div>`;
}

function sdfsPdfOpen(url, label) {
  // Remove any existing modal
  const existing = document.getElementById('sdfs-pdf-modal');
  if (existing) { sdfsPdfClose(); return; }

  const modal = document.createElement('div');
  modal.id = 'sdfs-pdf-modal';
  modal.innerHTML = `
    <div id="sdfs-pdf-backdrop" onclick="sdfsPdfClose()" style="
      position:fixed;inset:0;background:rgba(0,0,0,0.0);z-index:9990;
      transition:background 0.25s ease;cursor:zoom-out"></div>
    <div id="sdfs-pdf-panel" style="
      position:fixed;top:50%;left:50%;transform:translate(-50%,-50%) scale(0.05);
      width:min(95vw,1100px);height:min(92vh,900px);
      background:#111;border:1px solid #444;border-radius:8px;
      z-index:9991;display:flex;flex-direction:column;
      box-shadow:0 24px 80px rgba(0,0,0,0.9);
      transition:transform 0.3s cubic-bezier(0.34,1.56,0.64,1),opacity 0.25s ease;
      opacity:0;overflow:hidden;">
      <div style="display:flex;justify-content:space-between;align-items:center;
                  padding:10px 16px;border-bottom:1px solid #333;background:#1a1a1a;flex-shrink:0">
        <span style="font-size:12px;color:#ccc;font-weight:600">${label}</span>
        <div style="display:flex;gap:8px;align-items:center">
          <a href="${url}" target="_blank" style="
            font-size:11px;color:var(--accent,#4a9eff);text-decoration:none;
            padding:2px 8px;border:1px solid var(--accent,#4a9eff);border-radius:3px">
            Open in tab ↗
          </a>
          <button onclick="sdfsPdfClose()" style="
            background:none;border:none;color:#888;font-size:18px;cursor:pointer;
            padding:2px 8px;border-radius:4px;line-height:1" title="Close">✕</button>
        </div>
      </div>
      <iframe src="${url}" style="flex:1;border:none;background:#fff" loading="lazy"></iframe>
    </div>`;
  document.body.appendChild(modal);

  // Animate open on next frame
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      const backdrop = document.getElementById('sdfs-pdf-backdrop');
      const panel    = document.getElementById('sdfs-pdf-panel');
      if (backdrop) backdrop.style.background = 'rgba(0,0,0,0.75)';
      if (panel) { panel.style.transform = 'translate(-50%,-50%) scale(1)'; panel.style.opacity = '1'; }
    });
  });
}

function sdfsPdfClose() {
  const panel    = document.getElementById('sdfs-pdf-panel');
  const backdrop = document.getElementById('sdfs-pdf-backdrop');
  if (!panel) return;
  panel.style.transform = 'translate(-50%,-50%) scale(0.05)';
  panel.style.opacity = '0';
  if (backdrop) backdrop.style.background = 'rgba(0,0,0,0.0)';
  setTimeout(() => {
    const modal = document.getElementById('sdfs-pdf-modal');
    if (modal) modal.remove();
  }, 300);
}

function buildTargetPane(ticker, tkey, t, visible) {
  const display = visible ? 'block' : 'none';
  const s = t.stats || {};
  const bb = s.bounding_box || {};
  const gs = s.grade_stats || {};
  const v  = Date.now();

  // Grade colour helper
  const gradeColour = g => g >= 5 ? '#cc0000' : g >= 2 ? '#e07b00' : g >= 0.5 ? '#f5c518' : '#888';

  // Top holes table
  let holeRows = '';
  const holes = Object.entries(s.holes_with_grade || {}).slice(0, 15);
  for (const [hid, g] of holes) {
    const colour = gradeColour(g);
    holeRows += `<tr>
      <td style="font-family:monospace;font-size:11px">${hid}</td>
      <td style="color:${colour};font-weight:bold;text-align:right">${g.toFixed(2)}</td>
    </tr>`;
  }

  const imgStyle = 'width:100%;border-radius:6px;border:1px solid #333;cursor:pointer';

  const imgHtml = (key, label) => {
    const src = t.images?.[key];
    if (!src) return `<div style="color:var(--muted);font-size:11px;padding:20px;text-align:center;border:1px dashed #333;border-radius:6px">${label} — not yet generated</div>`;
    return `<div>
      <div style="color:var(--muted);font-size:11px;margin-bottom:6px">${label}</div>
      <img src="${src}?v=${v}" alt="${label}" style="${imgStyle}" onclick="sdfsExpandImg(this)">
    </div>`;
  };

  const imgHtml2 = (key, label) => {
    const src = t.model_sections?.[key];
    if (!src) return `<div style="color:var(--muted);font-size:11px;padding:20px;text-align:center;border:1px dashed #333;border-radius:6px">${label} — not yet generated</div>`;
    return `<div>
      <div style="color:var(--muted);font-size:11px;margin-bottom:6px">${label}</div>
      <img src="${src}?v=${v}" alt="${label}" style="${imgStyle}" onclick="sdfsExpandImg(this)">
    </div>`;
  };

  const has3d       = !!t.drill_holes_url;
  const hasMesh     = !!t.ore_body_mesh_url;
  const hasMeshBase = !!t.ore_body_mesh_base_url;
  const m1 = t.mission1 || {};

  // Resource estimate panel (Mission 1 GemPy)
  const errColor = m1.pass === true ? '#44bb88' : m1.pass === false ? '#ff6666' : '#888';
  const m1Panel = m1.contained_koz != null ? `
    <div style="background:#1a1a1a;border:1px solid #333;border-radius:6px;padding:16px;margin-bottom:20px">
      <div style="font-size:12px;font-weight:600;color:var(--accent);margin-bottom:10px">
        Mission 1 — GemPy Resource Estimate
        <span style="font-weight:normal;color:var(--muted);margin-left:8px">(IS data only)</span>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:12px">
        <div style="text-align:center">
          <div style="font-size:20px;font-weight:bold;color:#f5c518">${m1.contained_koz.toFixed(1)}</div>
          <div style="font-size:11px;color:var(--muted)">Predicted koz Au</div>
        </div>
        <div style="text-align:center">
          <div style="font-size:20px;font-weight:bold;color:#888">${m1.ho_koz != null ? m1.ho_koz.toFixed(0) : '—'}</div>
          <div style="font-size:11px;color:var(--muted)">HO Target koz</div>
        </div>
        <div style="text-align:center">
          <div style="font-size:20px;font-weight:bold;color:${errColor}">${m1.error_pct != null ? (m1.error_pct > 0 ? '+' : '') + m1.error_pct.toFixed(1) + '%' : '—'}</div>
          <div style="font-size:11px;color:var(--muted)">Error vs HO</div>
        </div>
        <div style="text-align:center">
          <div style="font-size:20px;font-weight:bold;color:#aaa">${m1.grade_gt != null ? m1.grade_gt.toFixed(3) : '—'}</div>
          <div style="font-size:11px;color:var(--muted)">Grade g/t Au</div>
        </div>
      </div>
      ${m1.ho_label ? `<div style="font-size:11px;color:var(--muted);margin-top:10px;border-top:1px solid #333;padding-top:8px">HO: ${m1.ho_label} | Gate: ${m1.pass_gate || '±30%'} | Method: ${m1.method || 'gempy'}${m1.model_version ? ' v' + m1.model_version : ''}</div>` : ''}
    </div>` : '';

  // ── Model Assumptions Panel ──────────────────────────────────────────────
  // Every judgement call, hardcoded number, and pipeline parameter that produced
  // the koz number — grouped by category. Always visible, fully auditable.
  const a = m1.assumptions || {};
  const v_ = m1.variogram || a.variogram || {};
  const fmtN = (v, dp=2) => (v == null || v === '' || v === undefined) ? '—' : (typeof v === 'number' ? v.toFixed(dp) : String(v));
  const fmtS = v => (v == null || v === '' || v === undefined) ? '—' : String(v);
  const nuggetPct = (v_.nugget != null && v_.sill != null && v_.sill > 0)
    ? (v_.nugget / v_.sill * 100).toFixed(0) + '%' : '—';

  function aRow(label, value, unit='', warn=false) {
    const col = warn ? '#ffaa44' : '#ccc';
    return `<tr>
      <td style="padding:2px 12px 2px 0;color:var(--muted);font-size:10px;white-space:nowrap;vertical-align:top">${label}</td>
      <td style="padding:2px 0;color:${col};font-family:monospace;font-size:10px">${value}${unit ? `<span style="color:#555;margin-left:3px">${unit}</span>` : ''}</td>
    </tr>`;
  }
  function aSection(title, color, rows) {
    return `<div style="margin-bottom:14px">
      <div style="font-size:9px;font-weight:600;letter-spacing:0.08em;color:${color};text-transform:uppercase;margin-bottom:5px;border-bottom:1px solid #222;padding-bottom:3px">${title}</div>
      <table style="border-collapse:collapse;width:100%">${rows}</table>
    </div>`;
  }

  const gradeMethod = fmtS(a.grade_method);
  const nuggetRatio = (a.variogram && a.variogram.sill > 0) ? a.variogram.nugget / a.variogram.sill : null;
  const highNugget = nuggetRatio != null && nuggetRatio > 0.6;

  const assumptionsPanel = m1.model_version ? `
    <div style="background:#0f0f1a;border:1px solid #2a2a3a;border-radius:6px;padding:16px;margin-bottom:20px">
      <div style="font-size:12px;font-weight:600;color:#8888cc;margin-bottom:14px">
        Model Assumptions
        <span style="font-weight:normal;color:var(--muted);margin-left:8px;font-size:10px">v${m1.model_version || '?'} — every judgement call that produced the koz number</span>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:20px">

        <!-- Col 1: Data inputs + geometry -->
        <div>
          ${aSection('Data & Inputs', '#6699cc', [
            aRow('IS cutoff date',       fmtS(t.cutoff_date)),
            aRow('Composite length',     fmtN(a.composite_length_m, 0), 'm'),
            aRow('Grade cutoff',         fmtN(a.grade_cutoff_gt, 2), 'g/t Au'),
            aRow('Cutoff source',        fmtS(a.grade_cutoff_source)),
            aRow('Grade cap (top-cut)',  a.grade_cap_gt != null ? fmtN(a.grade_cap_gt, 1) : 'none', a.grade_cap_gt != null ? 'g/t Au' : ''),
            aRow('Bulk density',         fmtN(a.bulk_density_tm3, 2), 't/m³'),
            aRow('Assay intervals total', fmtS(a.assay_intervals_total)),
            aRow('Intervals above cutoff', fmtS(a.assay_intervals_above_cutoff)),
          ].join(''))}

          ${aSection('Geometry / Ore Zone', '#88aa66', [
            aRow('Ore zone method',      fmtS(a.ore_zone_method || m1.method || '—')),
            aRow('Orientation strategy', fmtS(a.orientation_strategy)),
            aRow('Dip direction',        fmtN(a.orientation_dip_direction_deg, 1), '°'),
            aRow('Dip angle',            fmtN(a.orientation_dip_deg, 1), '°'),
            aRow('Interval buffer',      fmtN(a.interval_buffer_m, 1), 'm each side'),
            aRow('Influence clip',       fmtN(a.influence_clip_m, 0), 'm radius'),
            aRow('Northing filter (min)', fmtS(a.northing_min), 'm'),
            aRow('Volume correction',    fmtN(a.correction_factor, 4)),
          ].join(''))}
        </div>

        <!-- Col 2: Model grid + JORC -->
        <div>
          ${aSection('Model Grid', '#aa8844', [
            aRow('Grid resolution',  Array.isArray(a.model_resolution) ? a.model_resolution.join(' × ') : fmtS(a.model_resolution), 'voxels'),
            aRow('Pad XY',          fmtN(a.model_pad_xy_m, 0), 'm'),
            aRow('Pad Z',           fmtN(a.model_pad_z_m, 0), 'm'),
          ].join(''))}

          ${aSection('JORC Classification', '#9966aa', [
            aRow('Method',          'Nearest collar (XY plane)'),
            aRow('Measured radius', fmtN(a.jorc_measured_threshold_m, 1), 'm to collar'),
            aRow('Indicated radius',fmtN(a.jorc_indicated_threshold_m, 1), 'm to collar'),
            aRow('Inferred',        'Beyond Indicated radius'),
            ...(m1.jorc_split ? [
              aRow('Measured koz',  fmtN(m1.jorc_split.Measured, 1), 'koz'),
              aRow('Indicated koz', fmtN(m1.jorc_split.Indicated, 1), 'koz'),
              aRow('Inferred koz',  fmtN(m1.jorc_split.Inferred, 1), 'koz'),
            ] : []).join(''),
          ].join(''))}

          ${aSection('Layers Active', '#557799', (a.layers_enabled || []).map(l =>
            aRow('', l)
          ).join('') || aRow('', '—'))}
        </div>

        <!-- Col 3: Grade estimation + variogram -->
        <div>
          ${aSection('Grade Estimation', '#cc8866', [
            aRow('Method',      gradeMethod === 'kriging_ok3d' ? 'Ordinary Kriging (OK3D)' :
                                gradeMethod === 'idw_fallback' ? 'IDW (fallback — kriging failed)' : fmtS(gradeMethod),
                                '', gradeMethod === 'idw_fallback'),
          ].join(''))}

          ${a.variogram ? aSection('Variogram (Spherical)', highNugget ? '#ffaa44' : '#cc8866', [
            aRow('Model',       fmtS(a.variogram.model)),
            aRow('Range',       fmtN(a.variogram.range, 1), 'm', a.variogram.range < 30),
            aRow('Nugget',      fmtN(a.variogram.nugget, 4), '', false),
            aRow('Sill',        fmtN(a.variogram.sill, 4), '', false),
            aRow('Nugget ratio',nuggetPct, '', highNugget),
            highNugget ? aRow('⚠ High nugget', 'Grade has little spatial structure at drill spacing — kriging approaches weighted mean', '', true) : '',
          ].join('')) : ''}

          ${aSection('Scoring', '#66aa88', [
            aRow('Pass gate',           fmtS(m1.pass_gate || '±30%')),
            aRow('Predicted koz',       fmtN(m1.contained_koz, 1), 'koz'),
            aRow('HO target koz',       fmtN(m1.ho_koz, 1), 'koz'),
            aRow('Error',               m1.error_pct != null ? (m1.error_pct > 0 ? '+' : '') + m1.error_pct.toFixed(1) + '%' : '—', '',
                                        m1.pass === false),
            aRow('Result',              m1.pass === true ? '✓ PASS' : m1.pass === false ? '✗ FAIL' : '—', '',
                                        m1.pass === false),
          ].join(''))}
        </div>

      </div>
    </div>` : '';

  return `
    <div id="sdfs-pane-${ticker}-${tkey}" style="display:${display}">
      <div style="color:var(--muted);font-size:12px;margin-bottom:14px">${t.label || tkey} | cutoff ${t.cutoff_date || '—'}</div>

      ${m1Panel}

      ${assumptionsPanel}

      <!-- 2D section plots -->
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px;margin-bottom:20px">
        ${imgHtml('plan_view', 'Plan View (X–Y)')}
        ${imgHtml('section_ns', 'N–S Section (looking east)')}
        ${imgHtml('section_ew', 'E–W Section (looking north) — true dip visible')}
      </div>

      <!-- GemPy lith+grade section images -->
      ${(t.model_sections && Object.keys(t.model_sections).length > 0) ? `
      <div style="margin-bottom:20px">
        <div style="font-size:11px;color:var(--muted);margin-bottom:8px">GemPy Block Model Sections — lith + grade</div>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px">
          ${imgHtml2('model_section_ns', 'N\u2013S Section (GemPy)')}
          ${imgHtml2('model_section_ew', 'E\u2013W Section (GemPy)')}
          ${imgHtml2('model_plan', 'Plan View (GemPy)')}
        </div>
      </div>` : ''}

      <!-- Grade-volume curve — shown when mission1 has grade_volume_curve data -->
      ${m1.grade_volume_curve && m1.grade_volume_curve.length > 1 ? `
      <div style="background:#0f0f1a;border:1px solid #2a2a3a;border-radius:6px;padding:16px;margin-bottom:20px">
        <div style="font-size:12px;font-weight:600;color:#8888cc;margin-bottom:4px">Grade-Tonnage Curve</div>
        <div style="font-size:10px;color:var(--muted);margin-bottom:10px">Resource at each minimum cutoff grade — shows sensitivity to cutoff selection</div>
        <canvas id="gvc-${ticker}-${tkey}" height="160" style="width:100%;max-width:700px"></canvas>
      </div>` : ''}

      <!-- 3D viewer -->
      ${has3d ? `
      <div style="margin-bottom:20px">
        <div style="font-size:12px;font-weight:600;color:var(--accent);margin-bottom:8px">3D Drill Intercept + Ore Body Viewer</div>
        <div id="sdfs-3d-wrap-${ticker}-${tkey}"
             style="width:100%;height:480px;border-radius:6px;border:1px solid #333;background:#0a0a12;position:relative">
          <div style="height:100%;display:flex;align-items:center;justify-content:center;color:var(--muted);font-size:12px;flex-direction:column;gap:8px">
            <div>
              Click <strong style="color:var(--accent);margin:0 4px;cursor:pointer"
                onclick="sdfsLoad3D('${ticker}','${tkey}','${t.drill_holes_url}','${hasMesh ? t.ore_body_mesh_url : ''}','${hasMeshBase ? t.ore_body_mesh_base_url : ''}')">Load 3D View</strong> to render drill intercepts${hasMesh || hasMeshBase ? ' + ore body mesh' : ''}
            </div>
          </div>
        </div>
      </div>` : ''}

      <div style="display:grid;grid-template-columns:auto 1fr;gap:20px">
        <!-- Stats -->
        <div style="background:#1a1a1a;border:1px solid #333;border-radius:6px;padding:16px;min-width:260px">
          <div style="font-size:12px;font-weight:600;color:var(--accent);margin-bottom:10px">Pipeline Stats</div>
          ${statRow('Assay intervals', s.assay_count ?? '—')}
          ${statRow('Unique holes', s.unique_holes ?? '—')}
          ${statRow('Dry holes', s.dry_hole_count ?? '—')}
          ${statRow('Grade min', gs.min_gt != null ? gs.min_gt.toFixed(2) + ' g/t' : '—')}
          ${statRow('Grade max', gs.max_gt != null ? `<span style="color:${gradeColour(gs.max_gt)};font-weight:bold">${gs.max_gt.toFixed(2)} g/t</span>` : '—')}
          ${statRow('Grade mean', gs.mean_gt != null ? gs.mean_gt.toFixed(2) + ' g/t' : '—')}
          ${statRow('Above 0.5 g/t', gs.n_above_cutoff_0p5 != null ? `${gs.n_above_cutoff_0p5} / ${s.assay_count}` : '—')}
          ${statRow('Above 1.0 g/t', gs.n_above_cutoff_1p0 != null ? `${gs.n_above_cutoff_1p0} / ${s.assay_count}` : '—')}
          <div style="margin-top:10px;border-top:1px solid #333;padding-top:10px;font-size:11px;color:var(--muted)">Bounding box (MGA94 Z${t.mga_zone || 50})</div>
          ${statRow('Easting', bb.x_min != null ? `${bb.x_min.toFixed(0)} – ${bb.x_max.toFixed(0)}` : '—')}
          ${statRow('Northing', bb.y_min != null ? `${bb.y_min.toFixed(0)} – ${bb.y_max.toFixed(0)}` : '—')}
          ${statRow('RL', bb.z_min != null ? `${bb.z_min.toFixed(0)} – ${bb.z_max.toFixed(0)} m` : '—')}
        </div>

        <!-- Hole table -->
        <div style="background:#1a1a1a;border:1px solid #333;border-radius:6px;padding:16px;overflow:auto">
          <div style="font-size:12px;font-weight:600;color:var(--accent);margin-bottom:10px">Top holes by peak grade</div>
          <table style="width:100%;border-collapse:collapse;font-size:12px">
            <thead>
              <tr style="color:var(--muted);border-bottom:1px solid #333">
                <th style="text-align:left;padding:4px 8px">Hole ID</th>
                <th style="text-align:right;padding:4px 8px">Au g/t</th>
              </tr>
            </thead>
            <tbody>${holeRows}</tbody>
          </table>
        </div>
      </div>
    </div>`;
}

function statRow(label, value) {
  return `<div style="display:flex;justify-content:space-between;padding:3px 0;font-size:12px;border-bottom:1px solid #222">
    <span style="color:var(--muted)">${label}</span>
    <span>${value}</span>
  </div>`;
}

function sdfsSelectTarget(ticker, tkey) {
  // Hide all panes + deactivate all buttons for this ticker
  document.querySelectorAll(`[id^="sdfs-pane-${ticker}-"]`).forEach(el => el.style.display = 'none');
  document.querySelectorAll(`[id^="sdfs-btn-${ticker}-"]`).forEach(el => el.classList.remove('sdfs-tab-active'));
  // Show selected
  const pane = document.getElementById(`sdfs-pane-${ticker}-${tkey}`);
  const btn  = document.getElementById(`sdfs-btn-${ticker}-${tkey}`);
  if (pane) pane.style.display = 'block';
  if (btn)  btn.classList.add('sdfs-tab-active');
  // Render grade-volume curve chart if canvas is present and Chart.js is loaded
  _sdfsRenderGVC(ticker, tkey);
}

// Grade-volume curve chart — renders Chart.js dual-axis chart (bars=tonnes, line=grade)
function _sdfsRenderGVC(ticker, tkey) {
  const canvasId = `gvc-${ticker}-${tkey}`;
  const canvas   = document.getElementById(canvasId);
  if (!canvas || !window.Chart || canvas._gvcDone) return;
  canvas._gvcDone = true;

  // Pull data from the pre-parsed target object stored on the pane
  const pane = document.getElementById(`sdfs-pane-${ticker}-${tkey}`);
  if (!pane || !pane._gvcData) return;
  const pts = pane._gvcData;
  if (!pts || pts.length < 2) return;

  const labels   = pts.map(p => p.cutoff_gt.toFixed(1) + ' g/t');
  const tonnes   = pts.map(p => p.tonnes_mt);
  const grades   = pts.map(p => p.grade_gt);
  const koz      = pts.map(p => p.contained_koz);

  new Chart(canvas, {
    data: {
      labels,
      datasets: [
        {
          type: 'bar',
          label: 'Tonnes (Mt)',
          data: tonnes,
          backgroundColor: 'rgba(68,136,204,0.55)',
          borderColor: '#4488cc',
          borderWidth: 1,
          yAxisID: 'yTonnes',
          order: 2,
        },
        {
          type: 'line',
          label: 'Grade (g/t Au)',
          data: grades,
          borderColor: '#f5c518',
          backgroundColor: 'rgba(245,197,24,0.15)',
          borderWidth: 2,
          pointRadius: 4,
          pointBackgroundColor: '#f5c518',
          yAxisID: 'yGrade',
          order: 1,
          tension: 0.3,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { labels: { color: '#aaa', font: { size: 11 } } },
        tooltip: {
          callbacks: {
            afterBody: (items) => {
              const i = items[0]?.dataIndex;
              return i != null ? [`Contained: ${koz[i]} koz`] : [];
            },
          },
        },
      },
      scales: {
        x:       { ticks: { color: '#888', font: { size: 10 } }, grid: { color: '#1a2a1a' } },
        yTonnes: { position: 'left',  ticks: { color: '#4488cc', font: { size: 10 } },
                   grid: { color: '#1a2a1a' }, title: { display: true, text: 'Tonnes (Mt)', color: '#4488cc', font: { size: 10 } } },
        yGrade:  { position: 'right', ticks: { color: '#f5c518', font: { size: 10 } },
                   grid: { drawOnChartArea: false }, title: { display: true, text: 'Grade (g/t)', color: '#f5c518', font: { size: 10 } } },
      },
    },
  });
}

async function sdfsLoad3D(ticker, tkey, url, meshUrl, meshBaseUrl) {
  const containerId = `sdfs-3d-wrap-${ticker}-${tkey}`;
  const wrap = document.getElementById(containerId);
  if (!wrap) return;
  wrap.innerHTML = `<div style="height:100%;display:flex;align-items:center;justify-content:center;color:var(--muted);font-size:12px">Loading…</div>`;

  let holesArray, groundSurface = null, meshData = null, meshDataBase = null;
  try {
    const r = await fetch(url + '?v=' + Date.now());
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const drillData = await r.json();
    // drill_holes JSON may be {holes: [...], ground_surface: {...}} or legacy plain array
    if (Array.isArray(drillData)) {
      holesArray = drillData;
    } else {
      holesArray    = drillData.holes || [];
      groundSurface = drillData.ground_surface || null;
    }
  } catch (e) {
    wrap.innerHTML = `<div style="height:100%;display:flex;align-items:center;justify-content:center;color:#ff6666;font-size:12px">Failed to load drill data: ${e.message}</div>`;
    return;
  }

  // Try to load ore body top mesh (optional — soft fail)
  if (meshUrl) {
    try {
      const mr = await fetch(meshUrl + '?v=' + Date.now());
      if (mr.ok) meshData = await mr.json();
    } catch (e) { /* ignore */ }
  }

  // Try to load ore body base mesh (optional — soft fail)
  if (meshBaseUrl) {
    try {
      const mr = await fetch(meshBaseUrl + '?v=' + Date.now());
      if (mr.ok) meshDataBase = await mr.json();
    } catch (e) { /* ignore */ }
  }

  if (typeof minesRender3D === 'function') {
    // Queue the mesh bundle before calling minesRender3D — it's async and will pick up _pendingMesh
    // once the Three.js scene is fully constructed (_minesRender3DInner stores scene on wrap).
    if (meshData || meshDataBase) {
      wrap._pendingMesh = { top: meshData, base: meshDataBase };
    }
    // Queue ground surface terrain mesh if present
    if (groundSurface && groundSurface.n_points >= 3) {
      wrap._pendingGround = groundSurface;
    }
    minesRender3D(holesArray, containerId);
  } else {
    wrap.innerHTML = `<div style="height:100%;display:flex;align-items:center;justify-content:center;color:#ff6666;font-size:12px">3D engine not loaded — tab_mines_3d.js required</div>`;
  }
}

function sdfsAddOreMesh(containerId, meshBundle) {
  // Overlay the GemPy ore surface meshes in the Three.js scene.
  // meshBundle may be: {top: meshData|null, base: meshData|null}
  // or (legacy) a plain mesh data object — normalise to bundle form.
  // Requires tab_mines_3d.js to have stored _threeScene / _threeCx / _threeCy / _threeZRef on wrap.
  const wrap = document.getElementById(containerId);
  if (!wrap || !wrap._threeScene || !window.THREE) return;
  const scene = wrap._threeScene;

  // Normalise legacy single-mesh call
  if (meshBundle && !('top' in meshBundle) && !('base' in meshBundle)) {
    meshBundle = { top: meshBundle, base: null };
  }

  const cx   = wrap._threeCx  || 0;
  const cy   = wrap._threeCy  || 0;
  const zRef = wrap._threeZRef || 0;

  // Smooth the RL (height) of a voxel mesh by averaging each grid corner's RL
  // with its 4 cardinal neighbours. Handles top and base independently so the
  // ore thickness is preserved. CELL = grid spacing in metres.
  function _smoothVoxelRL(verts, CELL, iters) {
    // Build map: "roundedE,roundedN" → {topRL, topVerts[], baseRL, baseVerts[]}
    const snap  = v => Math.round(v / CELL) * CELL;
    const colMap = {};
    for (let i = 0; i < verts.length; i++) {
      const key = `${snap(verts[i][0])},${snap(verts[i][1])}`;
      const rl  = verts[i][2];
      if (!colMap[key]) colMap[key] = { maxRL: rl, minRL: rl, maxIdx: [], minIdx: [],
                                        eSnap: snap(verts[i][0]), nSnap: snap(verts[i][1]) };
      const c = colMap[key];
      if (rl > c.maxRL + 0.1)      { c.maxRL = rl; c.maxIdx = [i]; }
      else if (rl >= c.maxRL - 0.1) c.maxIdx.push(i);
      if (rl < c.minRL - 0.1)      { c.minRL = rl; c.minIdx = [i]; }
      else if (rl <= c.minRL + 0.1) c.minIdx.push(i);
    }
    // Laplacian iterations — smooth top and base RL independently
    for (let it = 0; it < iters; it++) {
      const newTop = {}, newBase = {};
      for (const [key, c] of Object.entries(colMap)) {
        const nbKeys = [
          `${c.eSnap + CELL},${c.nSnap}`, `${c.eSnap - CELL},${c.nSnap}`,
          `${c.eSnap},${c.nSnap + CELL}`, `${c.eSnap},${c.nSnap - CELL}`,
        ].filter(k => colMap[k]);
        const avgTop  = nbKeys.length ? nbKeys.reduce((s,k)=>s+colMap[k].maxRL,0)/nbKeys.length : c.maxRL;
        const avgBase = nbKeys.length ? nbKeys.reduce((s,k)=>s+colMap[k].minRL,0)/nbKeys.length : c.minRL;
        newTop[key]  = 0.5 * c.maxRL + 0.5 * avgTop;
        newBase[key] = 0.5 * c.minRL + 0.5 * avgBase;
      }
      for (const [key, c] of Object.entries(colMap)) { c.maxRL = newTop[key]; c.minRL = newBase[key]; }
    }
    // Write smoothed RL back onto a copy of the verts array
    const smoothed = verts.map(v => [v[0], v[1], v[2]]);
    for (const c of Object.values(colMap)) {
      for (const i of c.maxIdx) smoothed[i][2] = c.maxRL;
      for (const i of c.minIdx) smoothed[i][2] = c.minRL;
    }
    return smoothed;
  }

  function addMeshToScene(meshData, color, opacity, wireColor, showWireframe, smoothIters) {
    if (!meshData) return false;
    let verts = meshData.vertices;  // [[easting, northing, rl], ...]
    const faces = meshData.faces;   // [[a,b,c], ...]
    if (!verts || !faces || verts.length === 0) return false;

    // Smooth voxel mesh to remove staircase effect before building geometry
    if (smoothIters > 0) verts = _smoothVoxelRL(verts, 50, smoothIters);

    const posArr = new Float32Array(verts.length * 3);
    for (let i = 0; i < verts.length; i++) {
      posArr[i * 3]     = verts[i][0] - cx;    // X = easting  - cx
      posArr[i * 3 + 1] = verts[i][2] - zRef;  // Y = RL       - zRef
      posArr[i * 3 + 2] = verts[i][1] - cy;    // Z = northing - cy
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(posArr, 3));
    geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(faces.flat()), 1));
    geometry.computeVertexNormals();

    // DoubleSide so the solid reads correctly from any angle and when sliced
    const solidMat = new THREE.MeshPhongMaterial({
      color,
      transparent: true,
      opacity,
      side: THREE.DoubleSide,
      shininess: 80,
      depthWrite: false,
    });
    scene.add(new THREE.Mesh(geometry, solidMat));

    // Wireframe overlay — only for open surfaces (base), not closed solid (top)
    if (showWireframe) {
      const wireMat = new THREE.MeshBasicMaterial({
        color: wireColor,
        wireframe: true,
        transparent: true,
        opacity: 0.12,
        depthWrite: false,
      });
      scene.add(new THREE.Mesh(geometry, wireMat));
    }

    return true;
  }

  // Top: voxel solid — smooth 4 Laplacian iterations to round staircase edges; no wireframe
  // Base: marching-cubes surface — already smooth; wireframe shows surface structure
  const hasTop  = addMeshToScene(meshBundle.top,  0xf5c518, 0.72, 0xf5c518, false, 4);
  const hasBase = addMeshToScene(meshBundle.base, 0x4488cc, 0.55, 0x4488cc, true,  0);

  // Add key badge to the 3D viewer
  // Avoid duplicating if already present (re-load case)
  if (!wrap.querySelector('.sdfs-ore-key')) {
    const key = document.createElement('div');
    key.className = 'sdfs-ore-key';
    key.style.cssText = [
      'position:absolute', 'bottom:12px', 'right:12px',
      'font-size:10px', 'font-family:monospace', 'pointer-events:none',
      'background:rgba(0,0,0,0.60)', 'padding:8px 10px',
      'border-radius:3px', 'border:1px solid #333',
    ].join(';');
    const topRow = hasTop ? [
      `<div style="display:flex;align-items:center;gap:6px;color:#f5c518">`,
      `  <span style="width:12px;height:12px;background:rgba(245,197,24,0.35);`,
      `    border:1px solid #f5c518;display:inline-block;border-radius:2px"></span>`,
      `  Ore_Top surface`,
      `</div>`,
    ].join('') : '';
    const baseRow = hasBase ? [
      `<div style="display:flex;align-items:center;gap:6px;color:#4488cc;margin-top:4px">`,
      `  <span style="width:12px;height:12px;background:rgba(68,136,204,0.30);`,
      `    border:1px solid #4488cc;display:inline-block;border-radius:2px"></span>`,
      `  Ore_Base surface`,
      `</div>`,
    ].join('') : '';
    key.innerHTML = [
      `<div style="color:#888;margin-bottom:5px;font-size:9px;letter-spacing:0.05em">GemPy MODEL</div>`,
      topRow,
      baseRow,
      `<div style="font-size:9px;color:#555;margin-top:4px">`,
      `  Implicit GemPy kriging · 1.0 g/t cutoff`,
      `</div>`,
    ].join('');
    wrap.appendChild(key);
  }
}

function sdfsAddGroundSurface(containerId, groundSurface) {
  // Render a Delaunay-triangulated ground surface mesh from collar RL points.
  // groundSurface = {vertices: [[easting, northing, rl], ...], faces: [[a,b,c], ...], n_points: N}
  // Uses the same coordinate transform as sdfsAddOreMesh.
  const wrap = document.getElementById(containerId);
  if (!wrap || !wrap._threeScene || !window.THREE) return;
  if (!groundSurface || !groundSurface.vertices || !groundSurface.faces) return;
  if (groundSurface.n_points < 3) return;

  const THREE  = window.THREE;
  const scene  = wrap._threeScene;
  const cx     = wrap._threeCx  || 0;
  const cy     = wrap._threeCy  || 0;
  const zRef   = wrap._threeZRef || 0;

  const verts = groundSurface.vertices;
  const faces = groundSurface.faces;

  const posArr = new Float32Array(verts.length * 3);
  for (let i = 0; i < verts.length; i++) {
    posArr[i * 3]     = verts[i][0] - cx;    // X = easting  - cx
    posArr[i * 3 + 1] = verts[i][2] - zRef;  // Y = RL       - zRef
    posArr[i * 3 + 2] = verts[i][1] - cy;    // Z = northing - cy
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(posArr, 3));
  geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(faces.flat()), 1));
  geometry.computeVertexNormals();

  // Semi-transparent sandy terrain surface — visible from above and below
  const mat = new THREE.MeshPhongMaterial({
    color:       0xc8a86e,
    transparent: true,
    opacity:     0.28,
    side:        THREE.DoubleSide,
    shininess:   10,
    depthWrite:  false,
  });
  scene.add(new THREE.Mesh(geometry, mat));
}

function sdfsExpandImg(img) {
  // Simple lightbox: open image in a full-screen overlay
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.92);z-index:9999;display:flex;align-items:center;justify-content:center;cursor:zoom-out';
  const imgEl = document.createElement('img');
  imgEl.src = img.src;
  imgEl.style.cssText = 'max-width:95vw;max-height:95vh;border-radius:4px';
  overlay.appendChild(imgEl);
  overlay.onclick = () => document.body.removeChild(overlay);
  document.body.appendChild(overlay);
}

// Inject minimal tab button styles (matches existing dashboard style)
(function() {
  const style = document.createElement('style');
  style.textContent = `
    .sdfs-pdf-gallery {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
    }
    .sdfs-pdf-card {
      display: flex;
      flex-direction: column;
      align-items: center;
      width: 120px;
      padding: 10px 8px 8px;
      background: #1a1a1a;
      border: 1px solid #333;
      border-radius: 6px;
      cursor: pointer;
      transition: border-color 0.15s, background 0.15s, transform 0.15s;
      user-select: none;
    }
    .sdfs-pdf-card:hover {
      border-color: var(--accent, #4a9eff);
      background: #222;
      transform: translateY(-2px);
    }
    .sdfs-pdf-card:active {
      transform: scale(0.97);
    }
    .sdfs-pdf-thumb {
      width: 48px;
      height: 60px;
      margin-bottom: 8px;
    }
    .sdfs-pdf-thumb svg {
      width: 100%;
      height: 100%;
    }
    .sdfs-pdf-meta {
      text-align: center;
      width: 100%;
    }
    .sdfs-ticker-btn {
      background: #1a1a1a;
      border: 1px solid #555;
      color: #aaa;
      padding: 5px 18px;
      border-radius: 20px;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      letter-spacing: 0.04em;
      transition: background 0.15s, color 0.15s, border-color 0.15s;
    }
    .sdfs-ticker-btn:hover {
      border-color: var(--accent, #4a9eff);
      color: #fff;
    }
    .sdfs-ticker-btn.sdfs-ticker-active {
      background: var(--accent, #4a9eff);
      border-color: var(--accent, #4a9eff);
      color: #fff;
    }
    .sdfs-tab-btn {
      background: #2a2a2a;
      border: 1px solid #444;
      color: var(--muted, #888);
      padding: 4px 12px;
      border-radius: 4px;
      font-size: 12px;
      cursor: pointer;
    }
    .sdfs-tab-btn.sdfs-tab-active {
      background: var(--accent, #4a9eff);
      border-color: var(--accent, #4a9eff);
      color: #fff;
    }
  `;
  document.head.appendChild(style);
})();
