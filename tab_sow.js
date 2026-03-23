// tab_sow.js — State of the World map tab

'use strict';

let _sowMap = null;
let _sowData = null;

// Layer groups — each toggle controls one group
const _sowLayers = {
  geopolitical: { label: 'Geopolitical Risks', color: '#e05252', group: null, enabled: true },
  shipping:     { label: 'Shipping Lanes',      color: '#f5a520', group: null, enabled: true },
  mining:       { label: 'Mining Regions',      color: '#52c4a0', group: null, enabled: false },
  australia:    { label: 'Australia — Minerals', color: '#a78bfa', group: null, enabled: false },
};

// Australia type → colour + label
const _auTypes = {
  au_gold:     { color: '#f5a520', label: 'Gold' },
  au_iron:     { color: '#e07a52', label: 'Iron Ore' },
  au_port:     { color: '#7a9ae0', label: 'Port' },
  au_critical: { color: '#a78bfa', label: 'Critical Mineral' },
  au_copper:   { color: '#e0b452', label: 'Copper/Base Metal' },
};

// Severity → border colour
const _sevColour = { high: '#e05252', medium: '#f5a520', low: '#7a7060' };

// Impact badge colour
function _impactColour(v) {
  if (!v) return '#7a7060';
  if (v.startsWith('bull'))      return '#52c4a0';
  if (v.startsWith('mild_bull')) return '#a0c4a0';
  if (v.startsWith('bear'))      return '#e05252';
  if (v.startsWith('mild_bear')) return '#c4a0a0';
  return '#7a7060';
}

function _impactLabel(v) {
  const map = { bullish: '▲ Bullish', mild_bullish: '▲ Mild', bearish: '▼ Bearish', mild_bearish: '▼ Mild', neutral: '● Neutral' };
  return map[v] || v || '—';
}

// ── Marker icon factory ────────────────────────────────────────────────────────
function _makeIcon(colour, size = 14) {
  return L.divIcon({
    className: '',
    html: `<div style="
      width:${size}px;height:${size}px;border-radius:50%;
      background:${colour};border:2px solid rgba(255,255,255,0.25);
      box-shadow:0 0 8px ${colour}88;
      cursor:pointer;
    "></div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

// ── Detail panel ──────────────────────────────────────────────────────────────
function _showDetail(h) {
  const el = document.getElementById('sow-detail-content');
  if (!el) return;

  const sev   = h.severity || 'low';
  const sevC  = _sevColour[sev] || '#7a7060';
  const type  = (h.type || '').toUpperCase();

  el.innerHTML = `
    <div style="margin-bottom:12px">
      <div style="font-size:14px;font-weight:700;color:#e8d5a0;margin-bottom:4px">${h.name}</div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px">
        <span style="font-size:10px;padding:2px 7px;border-radius:3px;border:1px solid ${sevC};color:${sevC};text-transform:uppercase;letter-spacing:0.8px">${sev}</span>
        <span style="font-size:10px;padding:2px 7px;border-radius:3px;border:1px solid #2a2a2a;color:var(--muted);text-transform:uppercase;letter-spacing:0.8px">${type}</span>
      </div>
      <div style="font-size:12px;color:#b0a080;line-height:1.6">${h.summary || ''}</div>
    </div>

    ${h.gold_impact || h.aud_impact || h.oil_impact ? `
    <div style="margin-bottom:12px;padding:10px;background:#0d0d0d;border-radius:4px;border:1px solid #1a1a1a">
      <div style="font-size:10px;font-weight:700;letter-spacing:1px;color:var(--muted);text-transform:uppercase;margin-bottom:8px">Market Impact</div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;text-align:center">
        <div>
          <div style="font-size:10px;color:var(--muted);margin-bottom:3px">Gold</div>
          <div style="font-size:11px;font-weight:700;color:${_impactColour(h.gold_impact)}">${_impactLabel(h.gold_impact)}</div>
        </div>
        <div>
          <div style="font-size:10px;color:var(--muted);margin-bottom:3px">AUD</div>
          <div style="font-size:11px;font-weight:700;color:${_impactColour(h.aud_impact)}">${_impactLabel(h.aud_impact)}</div>
        </div>
        <div>
          <div style="font-size:10px;color:var(--muted);margin-bottom:3px">Oil</div>
          <div style="font-size:11px;font-weight:700;color:${_impactColour(h.oil_impact)}">${_impactLabel(h.oil_impact)}</div>
        </div>
      </div>
    </div>` : ''}

    ${h.scenario ? `
    <div style="margin-bottom:8px">
      <div style="font-size:10px;font-weight:700;letter-spacing:1px;color:var(--muted);text-transform:uppercase;margin-bottom:6px">Escalation Scenario</div>
      <div style="font-size:11px;color:#9a8a70;line-height:1.6;font-style:italic">${h.scenario}</div>
    </div>` : ''}
  `;

  // Update status bar
  const status = document.getElementById('sow-status');
  if (status) status.textContent = h.name;
}

// ── Build layer: hotspots ──────────────────────────────────────────────────────
function _buildHotspots(data) {
  const geo  = _sowLayers.geopolitical;
  const ship = _sowLayers.shipping;
  geo.group  = L.layerGroup();
  ship.group = L.layerGroup();

  (data.hotspots || []).forEach(h => {
    const isShip = h.type === 'shipping';
    const colour = _sevColour[h.severity] || '#7a7060';
    const size   = h.severity === 'high' ? 16 : h.severity === 'medium' ? 13 : 10;
    const marker = L.marker([h.lat, h.lng], { icon: _makeIcon(colour, size) });

    marker.on('click', () => _showDetail(h));
    marker.bindTooltip(`<b style="color:#e8d5a0">${h.name}</b><br><span style="font-size:11px;color:#9a8a70">${(h.severity||'').toUpperCase()} · ${(h.type||'').toUpperCase()}</span>`, {
      direction: 'top', offset: [0, -8],
      className: 'sow-tooltip',
    });

    if (isShip) {
      ship.group.addLayer(marker);
    } else {
      geo.group.addLayer(marker);
    }
  });
}

// ── Build layer: shipping lanes ───────────────────────────────────────────────
function _buildShippingLanes(data) {
  const ship = _sowLayers.shipping;
  if (!ship.group) ship.group = L.layerGroup();

  (data.shipping_lanes || []).forEach(lane => {
    const line = L.polyline(lane.coords, {
      color: lane.color || '#f5a520',
      weight: 1.5,
      opacity: 0.6,
      dashArray: lane.id === 'cape_route' ? '6 4' : null,
    });
    line.bindTooltip(`<b style="color:#e8d5a0">${lane.name}</b>`, {
      sticky: true, className: 'sow-tooltip',
    });
    ship.group.addLayer(line);
  });
}

// ── Build layer: mining regions ───────────────────────────────────────────────
function _buildMiningRegions(data) {
  const mining = _sowLayers.mining;
  mining.group = L.layerGroup();

  (data.mining_regions || []).forEach(r => {
    const marker = L.circleMarker([r.lat, r.lng], {
      radius: 7,
      fillColor: '#52c4a0',
      color: '#52c4a0',
      weight: 1,
      fillOpacity: 0.6,
    });
    marker.bindTooltip(`<b style="color:#e8d5a0">${r.name}</b><br><span style="font-size:11px;color:#9a8a70">Rank #${r.production_rank} producer</span><br><span style="font-size:11px;color:#7a7060">${r.notes || ''}</span>`, {
      direction: 'top', offset: [0, -8], maxWidth: 240,
      className: 'sow-tooltip',
    });
    marker.on('click', () => {
      const el = document.getElementById('sow-detail-content');
      if (el) el.innerHTML = `
        <div style="font-size:14px;font-weight:700;color:#e8d5a0;margin-bottom:6px">${r.name}</div>
        <div style="font-size:11px;color:#7a7060;margin-bottom:4px">Production rank: <span style="color:#52c4a0">#${r.production_rank} globally</span></div>
        <div style="font-size:12px;color:#9a8a70;line-height:1.6">${r.notes || ''}</div>
      `;
      const status = document.getElementById('sow-status');
      if (status) status.textContent = r.name;
    });
    mining.group.addLayer(marker);
  });
}

// ── Toggle controls ───────────────────────────────────────────────────────────
function _buildToggles() {
  const wrap = document.getElementById('sow-layer-toggles');
  if (!wrap) return;
  wrap.innerHTML = '';

  Object.entries(_sowLayers).forEach(([key, layer]) => {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:7px 10px;background:#0d0d0d;border-radius:4px;border:1px solid #1a1a1a;cursor:pointer';

    const left = `
      <div style="display:flex;align-items:center;gap:8px">
        <div style="width:10px;height:10px;border-radius:50%;background:${layer.color};flex-shrink:0"></div>
        <span style="font-size:12px;color:${layer.enabled ? '#e8d5a0' : 'var(--muted)'}">${layer.label}</span>
      </div>`;

    const toggle = document.createElement('div');
    toggle.id = `sow-toggle-${key}`;
    toggle.style.cssText = `width:32px;height:16px;border-radius:8px;background:${layer.enabled ? layer.color : '#2a2a2a'};position:relative;transition:background 0.2s;flex-shrink:0`;
    toggle.innerHTML = `<div style="position:absolute;top:2px;${layer.enabled ? 'right:2px' : 'left:2px'};width:12px;height:12px;border-radius:50%;background:#fff;transition:left 0.2s,right 0.2s"></div>`;

    row.innerHTML = left;
    row.appendChild(toggle);

    row.addEventListener('click', () => {
      layer.enabled = !layer.enabled;
      if (layer.group) {
        layer.enabled ? _sowMap.addLayer(layer.group) : _sowMap.removeLayer(layer.group);
      }
      // Update toggle visual
      toggle.style.background = layer.enabled ? layer.color : '#2a2a2a';
      toggle.querySelector('div').style.cssText = `position:absolute;top:2px;${layer.enabled ? 'right:2px' : 'left:2px'};width:12px;height:12px;border-radius:50%;background:#fff;transition:left 0.2s,right 0.2s`;
      // Update label colour + refresh legend
      row.querySelector('span').style.color = layer.enabled ? '#e8d5a0' : 'var(--muted)';
      _buildLegend();
    });

    wrap.appendChild(row);
  });
}

// ── OSM polygon fetching via Overpass API ─────────────────────────────────────
const _osmCache = {};  // "lat,lng" → array of polygon objects (or null if pending)

function _polyAreaDeg(coords) {
  // Shoelace formula — returns area in degrees² (for noise filtering only)
  if (!coords || coords.length < 3) return 0;
  let a = 0;
  for (let i = 0, j = coords.length - 1; i < coords.length; j = i++) {
    a += (coords[j][1] + coords[i][1]) * (coords[j][0] - coords[i][0]);
  }
  return Math.abs(a) / 2;
}

async function _fetchOSMPolygons(lat, lng, radius) {
  const key = `${lat.toFixed(3)},${lng.toFixed(3)},${radius}`;
  if (key in _osmCache) return _osmCache[key];
  _osmCache[key] = [];  // mark as requested to prevent duplicate fetches

  const q = `[out:json][timeout:20];`
    + `(way["landuse"="quarry"](around:${radius},${lat},${lng});`
    + `way["landuse"="industrial"](around:${radius},${lat},${lng});`
    + `way["man_made"="mine"](around:${radius},${lat},${lng});`
    + `);out body;>;out skel qt;`;

  try {
    const resp = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      body: 'data=' + encodeURIComponent(q),
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });
    const json = await resp.json();

    // Build node coordinate lookup
    const nodes = {};
    json.elements.filter(e => e.type === 'node').forEach(n => { nodes[n.id] = [n.lat, n.lon]; });

    // Extract closed ways with enough area to be a real mine (filter out roads, buildings)
    const polys = json.elements
      .filter(e => e.type === 'way' && Array.isArray(e.nodes) && e.nodes.length >= 4)
      .map(w => {
        const coords = w.nodes.map(id => nodes[id]).filter(Boolean);
        return { coords, tags: w.tags || {}, area: _polyAreaDeg(coords) };
      })
      .filter(p => p.coords.length >= 4 && p.area > 0.000002)  // ~0.5ha+ at AU latitudes
      .sort((a, b) => b.area - a.area);                         // largest first

    _osmCache[key] = polys;
    return polys;
  } catch (err) {
    console.warn('Overpass fetch failed:', err);
    return [];
  }
}

// Attach tooltip + click detail to any Leaflet layer (marker or polygon)
function _bindSiteInteraction(leafletLayer, name, colour, detailHTML) {
  leafletLayer.bindTooltip(
    `<b style="color:#e8d5a0">${name}</b><br>`
    + `<span style="font-size:11px;color:${colour}">Click for details</span>`,
    { direction: 'top', offset: [0, -8], sticky: true, className: 'sow-tooltip' }
  );
  leafletLayer.on('click', () => {
    const el = document.getElementById('sow-detail-content');
    if (el) el.innerHTML = detailHTML;
    const status = document.getElementById('sow-status');
    if (status) status.textContent = name;
  });
}

// Add a site to a layer group: circle immediately, replaced by OSM polygon when loaded
function _addSiteWithOSM(r, colour, group) {
  // Build detail HTML once
  const cfg = _auTypes[r.type] || { color: colour, label: r.type };
  const detail = `
    <div style="font-size:14px;font-weight:700;color:#e8d5a0;margin-bottom:4px">${r.name}</div>
    <div style="margin-bottom:8px">
      <span style="font-size:10px;padding:2px 7px;border-radius:3px;border:1px solid ${colour};color:${colour};text-transform:uppercase;letter-spacing:0.8px">${cfg.label}</span>
    </div>
    <div style="font-size:12px;color:#b0a080;line-height:1.6;margin-bottom:10px">${r.summary || ''}</div>
    ${r.aud_link ? `
    <div style="padding:8px 10px;background:#0d0d0d;border-radius:4px;border:1px solid #1a1a1a;margin-bottom:8px">
      <div style="font-size:10px;font-weight:700;letter-spacing:1px;color:var(--muted);text-transform:uppercase;margin-bottom:4px">AUD Link</div>
      <div style="font-size:11px;color:#9a8a70;line-height:1.5">${r.aud_link}</div>
    </div>` : ''}
    ${r.key_names ? `<div style="font-size:11px;color:var(--muted)">Key names: <span style="color:#e8d5a0">${r.key_names}</span></div>` : ''}
  `;

  // Immediate fallback: circle marker
  const fallback = L.circleMarker([r.lat, r.lng], {
    radius: 7, fillColor: colour, color: colour, weight: 1.5,
    fillOpacity: 0.55, opacity: 0.8,
  });
  _bindSiteInteraction(fallback, r.name, colour, detail);
  group.addLayer(fallback);

  // Async: fetch OSM polygon, swap in if found
  const radius = r.osm_radius || 4000;
  _fetchOSMPolygons(r.lat, r.lng, radius).then(polys => {
    if (!polys || polys.length === 0) return;  // keep circle
    group.removeLayer(fallback);
    polys.slice(0, 5).forEach(p => {
      const poly = L.polygon(p.coords, {
        color: colour, fillColor: colour,
        weight: 1.5, opacity: 0.85, fillOpacity: 0.2,
      });
      _bindSiteInteraction(poly, r.name, colour, detail);
      group.addLayer(poly);
    });
  });
}

// ── Australia layer ────────────────────────────────────────────────────────────
function _buildAustralia(data) {
  const layer = _sowLayers.australia;
  layer.group = L.layerGroup();

  (data.australia || []).forEach(r => {
    const cfg = _auTypes[r.type] || { color: '#a78bfa', label: r.type };
    _addSiteWithOSM(r, cfg.color, layer.group);
  });
}

// ── Legend — conditional on active layers ─────────────────────────────────────
function _buildLegend() {
  const el = document.getElementById('sow-legend');
  if (!el) return;
  el.innerHTML = '';

  const row = (colour, shape, label) => {
    const d = document.createElement('div');
    d.style.cssText = 'display:flex;align-items:center;gap:8px';
    d.innerHTML = shape === 'line'
      ? `<div style="width:20px;height:2px;background:${colour};border-radius:1px;flex-shrink:0"></div><span>${label}</span>`
      : `<div style="width:10px;height:10px;border-radius:50%;background:${colour};flex-shrink:0"></div><span>${label}</span>`;
    return d;
  };
  const dash = (colour, label) => {
    const d = document.createElement('div');
    d.style.cssText = 'display:flex;align-items:center;gap:8px';
    d.innerHTML = `<div style="width:20px;height:2px;background:repeating-linear-gradient(90deg,${colour} 0,${colour} 4px,transparent 4px,transparent 8px);flex-shrink:0"></div><span>${label}</span>`;
    return d;
  };

  if (_sowLayers.geopolitical.enabled) {
    el.appendChild(row('#e05252', 'dot', '● High severity'));
    el.appendChild(row('#f5a520', 'dot', '● Medium severity'));
    el.appendChild(row('#7a7060', 'dot', '● Low severity'));
  }

  if (_sowLayers.shipping.enabled) {
    el.appendChild(row('#f5a520', 'line', '── Suez Canal route'));
    el.appendChild(dash('#e06c3a',          'Diversion via Cape'));
    el.appendChild(row('#7a7060', 'line', '── Panama route'));
  }

  if (_sowLayers.mining.enabled) {
    el.appendChild(row('#52c4a0', 'dot', '● Gold mining region'));
  }

  if (_sowLayers.australia.enabled) {
    Object.values(_auTypes).forEach(t => el.appendChild(row(t.color, 'dot', `● ${t.label}`)));
  }

  if (el.children.length === 0) {
    el.innerHTML = '<span style="color:#3a3a3a;font-size:11px">Enable a layer to see key</span>';
  }
}

// ── ASX ticker search ─────────────────────────────────────────────────────────
let _asxLayer = null;  // L.layerGroup for highlighted sites

const _siteTypeColour = {
  gold_mine:  '#f5c842',
  gold_dev:   '#c4a030',
  gold_copper:'#e0b452',
  iron_ore:   '#e07a52',
  lithium:    '#7ab4e0',
  nickel:     '#52c4a0',
  copper:     '#e0b452',
  potash:     '#a78bfa',
  critical:   '#a78bfa',
  processing: '#a0a0a0',
  services:   '#6a6a6a',
  port:       '#7a9ae0',
};

function _siteColour(type) {
  return _siteTypeColour[type] || '#e8d5a0';
}

// Called from inline oninput handler
function sowASXSearch(query) {
  if (!_sowData || !_sowData.asx_projects) return;
  query = (query || '').trim().toUpperCase();

  // Clear existing highlight layer
  if (_asxLayer) { _sowMap.removeLayer(_asxLayer); _asxLayer = null; }

  const resultsEl = document.getElementById('sow-asx-results');

  if (!query || query.length < 2) {
    if (resultsEl) resultsEl.innerHTML = '';
    return;
  }

  // Find matching tickers (partial match on ticker or name)
  const matches = _sowData.asx_projects.filter(p =>
    p.ticker.toUpperCase().includes(query) ||
    p.name.toUpperCase().includes(query)
  );

  if (!matches.length) {
    if (resultsEl) resultsEl.innerHTML = '<span style="color:#5a4a3a">No match found</span>';
    return;
  }

  // Build highlight layer
  _asxLayer = L.layerGroup().addTo(_sowMap);
  const allLatLngs = [];

  matches.forEach(company => {

    // ── Tenement GeoJSON path (DMIRS-sourced data) ─────────────────────────
    if (company.tenement_file) {
      const detailHTML = `
        <div style="font-size:14px;font-weight:700;color:#e8d5a0;margin-bottom:4px">${company.ticker} — ${company.name}</div>
        <div style="font-size:12px;color:#b0a080;line-height:1.6;margin-bottom:10px">${company.summary || ''}</div>
        <div style="padding:8px 10px;background:#0d0d0d;border-radius:4px;border:1px solid #1a1a1a">
          <div style="font-size:10px;font-weight:700;letter-spacing:1px;color:var(--muted);text-transform:uppercase;margin-bottom:4px">Tenement data</div>
          <div style="font-size:11px;color:#9a8a70">Source: WA DMIRS • Mining leases = <span style="color:#f5a520">gold</span> • Exploration = <span style="color:#a0c4f0">blue</span></div>
        </div>`;

      // Add fallback centroid dot while loading
      const fallbackLL = company.sites && company.sites[0]
        ? [company.sites[0].lat, company.sites[0].lng] : null;

      fetch(`${company.tenement_file}?v=${Date.now()}`)
        .then(r => r.json())
        .then(gj => {
          if (!_asxLayer) return;
          const bounds = [];
          (gj.features || []).forEach(feat => {
            const colour = feat.properties._colour || '#f5a520';
            const label  = feat.properties._label  || '';
            const tenid  = feat.properties.fmt_tenid || '';
            const area   = feat.properties.legal_area || '';
            const units  = feat.properties.unit_of_me || '';

            const poly = L.geoJSON(feat, {
              style: { color: colour, fillColor: colour, weight: 1.5, opacity: 0.9, fillOpacity: 0.2 },
            });
            poly.bindTooltip(
              `<b style="color:#e8d5a0">${company.ticker} — ${tenid}</b><br>`
              + `<span style="font-size:11px;color:${colour}">${label}</span>`
              + (area ? `<br><span style="font-size:11px;color:#7a7060">${area} ${units}</span>` : ''),
              { sticky: true, className: 'sow-tooltip' }
            );
            poly.on('click', () => {
              const el = document.getElementById('sow-detail-content');
              if (el) el.innerHTML = detailHTML;
              const status = document.getElementById('sow-status');
              if (status) status.textContent = `${company.ticker} — ${tenid}`;
            });
            poly.addTo(_asxLayer);

            // Collect bounds
            poly.eachLayer(l => { if (l.getBounds) bounds.push(l.getBounds()); });
          });

          // Zoom to fit all tenements
          if (bounds.length) {
            let b = bounds[0];
            bounds.forEach(bb => { b = b.extend(bb); });
            _sowMap.fitBounds(b.pad(0.1));
          }
        })
        .catch(err => console.warn('Tenement GeoJSON load failed:', err));

      // Centroid dot as immediate placeholder
      if (fallbackLL) {
        const icon = L.divIcon({
          className: '',
          html: `<div style="position:relative;width:20px;height:20px">
            <div style="position:absolute;inset:0;border-radius:50%;border:2px solid #f5a520;opacity:0.5;animation:sow-pulse 1.5s ease-out infinite"></div>
            <div style="position:absolute;inset:4px;border-radius:50%;background:#f5a520;box-shadow:0 0 8px #f5a520"></div>
          </div>`,
          iconSize: [20, 20], iconAnchor: [10, 10],
        });
        const dot = L.marker(fallbackLL, { icon });
        dot.bindTooltip(`<b style="color:#e8d5a0">${company.ticker}</b><br><span style="font-size:11px;color:#f5a520">Loading tenements…</span>`, { className: 'sow-tooltip' });
        _asxLayer.addLayer(dot);
        allLatLngs.push(fallbackLL);
        _sowMap.setView(fallbackLL, 9);
      }
      return;  // skip the normal site loop for this company
    }

    // ── Standard site loop (Overpass + fallback dot) ────────────────────────
    (company.sites || []).forEach(site => {
      const colour = _siteColour(site.type);

      // Build shared detail HTML and tooltip for this site
      const detailHTML = `
        <div style="font-size:14px;font-weight:700;color:#e8d5a0;margin-bottom:4px">${company.ticker} — ${company.name}</div>
        <div style="font-size:12px;color:#b0a080;line-height:1.6;margin-bottom:10px">${company.summary || ''}</div>
        <div style="padding:8px 10px;background:#0d0d0d;border-radius:4px;border:1px solid #1a1a1a">
          <div style="font-size:10px;font-weight:700;letter-spacing:1px;color:var(--muted);text-transform:uppercase;margin-bottom:6px">Sites</div>
          ${(company.sites || []).map(s => `
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:5px">
              <div style="width:8px;height:8px;border-radius:50%;background:${_siteColour(s.type)};flex-shrink:0"></div>
              <span style="font-size:11px;color:#9a8a70">${s.name}</span>
            </div>`).join('')}
        </div>
      `;
      const tooltipHTML = `<b style="color:#e8d5a0">${company.ticker}</b><br>`
        + `<span style="font-size:11px;color:${colour}">${site.name}</span>`;

      const bindASX = (layer) => {
        layer.bindTooltip(tooltipHTML, { direction: 'top', offset: [0, -10], sticky: true, className: 'sow-tooltip' });
        layer.on('click', () => {
          const el = document.getElementById('sow-detail-content');
          if (el) el.innerHTML = detailHTML;
          const status = document.getElementById('sow-status');
          if (status) status.textContent = `${company.ticker} — ${site.name}`;
        });
      };

      // Immediate fallback: pulsing dot marker
      const icon = L.divIcon({
        className: '',
        html: `<div style="position:relative;width:20px;height:20px">
          <div style="position:absolute;inset:0;border-radius:50%;border:2px solid ${colour};opacity:0.5;animation:sow-pulse 1.5s ease-out infinite"></div>
          <div style="position:absolute;inset:4px;border-radius:50%;background:${colour};box-shadow:0 0 8px ${colour}"></div>
        </div>`,
        iconSize: [20, 20], iconAnchor: [10, 10],
      });
      const fallback = L.marker([site.lat, site.lng], { icon });
      bindASX(fallback);
      _asxLayer.addLayer(fallback);
      allLatLngs.push([site.lat, site.lng]);

      // Async: swap pulsing dot for real OSM polygon if available
      _fetchOSMPolygons(site.lat, site.lng, 6000).then(polys => {
        if (!polys || polys.length === 0 || !_asxLayer) return;
        _asxLayer.removeLayer(fallback);
        polys.slice(0, 3).forEach(p => {
          const poly = L.polygon(p.coords, {
            color: colour, fillColor: colour,
            weight: 2.5, opacity: 1.0, fillOpacity: 0.30,
          });
          bindASX(poly);
          _asxLayer.addLayer(poly);
        });
      });
    });
  });

  // Zoom map to show all matched sites
  if (allLatLngs.length === 1) {
    _sowMap.setView(allLatLngs[0], 7);
  } else if (allLatLngs.length > 1) {
    _sowMap.fitBounds(L.latLngBounds(allLatLngs).pad(0.4));
  }

  // Show match summary
  if (resultsEl) {
    const names = matches.map(m => `<span style="color:#f5c842">${m.ticker}</span>`).join(', ');
    const siteCount = matches.reduce((n, m) => n + (m.sites || []).length, 0);
    resultsEl.innerHTML = `${names} &mdash; ${siteCount} site${siteCount !== 1 ? 's' : ''} mapped`;
  }
}

function sowASXClear() {
  const input = document.getElementById('sow-asx-input');
  if (input) input.value = '';
  if (_asxLayer) { _sowMap.removeLayer(_asxLayer); _asxLayer = null; }
  const el = document.getElementById('sow-asx-results');
  if (el) el.innerHTML = '';
}

// ── Init ──────────────────────────────────────────────────────────────────────
function initSOWTab() {
  // Tooltip style injection
  if (!document.getElementById('sow-styles')) {
    const s = document.createElement('style');
    s.id = 'sow-styles';
    s.textContent = `
      .sow-tooltip { background: #0d0d0d !important; border: 1px solid #2a2a2a !important; color: #b0a080 !important; font-size: 12px !important; box-shadow: 0 2px 8px rgba(0,0,0,0.6) !important; }
      .sow-tooltip::before { display: none !important; }
      .leaflet-control-zoom a { background: #0d0d0d !important; color: #b0a080 !important; border-color: #2a2a2a !important; }
      .leaflet-control-zoom a:hover { background: #1a1a1a !important; color: #f5a520 !important; }
      .leaflet-control-attribution { background: rgba(0,0,0,0.6) !important; color: #3a3a3a !important; font-size: 9px !important; }
      .leaflet-control-attribution a { color: #5a5040 !important; }
      @keyframes sow-pulse { 0% { transform:scale(1);opacity:0.6 } 100% { transform:scale(2.4);opacity:0 } }
    `;
    document.head.appendChild(s);
  }

  // Init map (dark tile layer)
  _sowMap = L.map('sow-map', {
    center: [20, 20],
    zoom: 3,
    minZoom: 2,
    maxZoom: 10,
    zoomControl: true,
    maxBounds: [[-85, -180], [85, 180]],
    maxBoundsViscosity: 1.0,
    worldCopyJump: false,
  });

  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    attribution: '© OpenStreetMap © CARTO',
    subdomains: 'abcd',
    maxZoom: 19,
  }).addTo(_sowMap);

  // Load data and build layers
  fetch(`sow_data.json?v=${Date.now()}`)
    .then(r => r.json())
    .then(data => {
      _sowData = data;

      _buildHotspots(data);
      _buildShippingLanes(data);
      _buildMiningRegions(data);
      _buildAustralia(data);

      // Add enabled layers to map
      Object.values(_sowLayers).forEach(layer => {
        if (layer.enabled && layer.group) _sowMap.addLayer(layer.group);
      });

      _buildToggles();
      _buildLegend();

      const updated = document.getElementById('sow-updated');
      if (updated && data.generated_at) {
        updated.textContent = 'Updated ' + data.generated_at.slice(0, 10);
      }
    })
    .catch(err => {
      console.error('SOW data load failed:', err);
      const el = document.getElementById('sow-detail-content');
      if (el) el.textContent = 'Failed to load sow_data.json';
    });

  // Fix Leaflet map size after tab becomes visible
  setTimeout(() => _sowMap && _sowMap.invalidateSize(), 100);
}
