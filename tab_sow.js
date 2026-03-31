// tab_sow.js — State of the World map tab

'use strict';

let _sowMap = null;
let _sowData = null;

// Layer groups — each toggle controls one group
// live: true  = data fetched from a real external API at runtime
// live: false = hardcoded / static JSON (shows 🤖 badge in the toggle)
const _sowLayers = {
  geopolitical: { label: 'Geopolitical Risks',   color: '#e05252', group: null, enabled: true,  live: false },
  shipping:     { label: 'Shipping Lanes',        color: '#f5a520', group: null, enabled: true,  live: false },
  conflict:     { label: 'Conflict Events',       color: '#ff6b6b', group: null, enabled: true,  live: true  },
  crises:       { label: 'Humanitarian Crises',   color: '#e07aaa', group: null, enabled: true,  live: true  },
  pipelines:    { label: 'Oil / Gas Pipelines',   color: '#e07a30', group: null, enabled: true,  live: true  },
  ports:        { label: 'Major Ports',           color: '#60cfff', group: null, enabled: false, live: true  },
  tradeflows:   { label: 'Gold Trade Flows',      color: '#f5c842', group: null, enabled: false, live: false },
  heatmap:      { label: 'News Heat Map',         color: '#ff9f43', group: null, enabled: false, live: false },
  airtraffic:   { label: 'Air Traffic',           color: '#60cfff', group: null, enabled: false, live: true  },
  ships:        { label: 'Live Ships',            color: '#e07a30', group: null, enabled: false, live: true  },
  mining:       { label: 'Mining Regions',        color: '#52c4a0', group: null, enabled: false, live: false },
  australia:    { label: 'Australia — Minerals',  color: '#a78bfa', group: null, enabled: false, live: true  },
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

// ── #6: Shipping chokepoints with disruption status ───────────────────────────
const _chokepointStatus = {
  critical: { color: '#e05252', label: 'CRITICAL', icon: '⬛' },
  disrupted:{ color: '#e07a30', label: 'DISRUPTED', icon: '⬛' },
  elevated: { color: '#f5a520', label: 'ELEVATED',  icon: '⬛' },
  reduced:  { color: '#c4c440', label: 'REDUCED',   icon: '⬛' },
  normal:   { color: '#52c4a0', label: 'NORMAL',    icon: '⬛' },
};

function _buildChokepoints(data) {
  const ship = _sowLayers.shipping;
  if (!ship.group) ship.group = L.layerGroup();

  (data.chokepoints || []).forEach(cp => {
    const st   = _chokepointStatus[cp.status] || _chokepointStatus.normal;
    const icon = L.divIcon({
      className: '',
      html: `<div style="
        display:flex;align-items:center;gap:4px;
        background:rgba(0,0,0,0.82);border:1px solid ${st.color};
        border-radius:3px;padding:2px 6px;white-space:nowrap;
        font-size:10px;font-weight:700;color:${st.color};
        letter-spacing:0.6px;box-shadow:0 0 8px ${st.color}55;
        pointer-events:none;
      ">
        <div style="width:6px;height:6px;border-radius:50%;background:${st.color};flex-shrink:0"></div>
        ${cp.name.toUpperCase()}
      </div>`,
      iconSize: null,
      iconAnchor: [0, 8],
    });

    const marker = L.marker([cp.lat, cp.lng], { icon, zIndexOffset: 100 });
    marker.bindTooltip(`
      <b style="color:#e8d5a0">${cp.name}</b>
      <br><span style="color:${st.color};font-weight:700;font-size:11px">${st.label}</span>
      <br><span style="font-size:11px;color:#9a8a70;white-space:normal;max-width:220px;display:block">${cp.note}</span>
    `, { direction: 'top', offset: [40, 0], className: 'sow-tooltip', maxWidth: 240 });

    marker.on('click', () => {
      const el = document.getElementById('sow-detail-content');
      if (el) el.innerHTML = `
        <div style="font-size:14px;font-weight:700;color:#e8d5a0;margin-bottom:6px">${cp.name}</div>
        <div style="margin-bottom:8px">
          <span style="font-size:10px;padding:2px 8px;border-radius:3px;border:1px solid ${st.color};color:${st.color};font-weight:700;letter-spacing:0.8px;text-transform:uppercase">${st.label}</span>
        </div>
        <div style="font-size:12px;color:#b0a080;line-height:1.6;margin-bottom:10px">${cp.note}</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;padding:8px 10px;background:#0d0d0d;border-radius:4px;border:1px solid #1a1a1a">
          <div style="text-align:center">
            <div style="font-size:10px;color:var(--muted);margin-bottom:3px">Gold</div>
            <div style="font-size:11px;font-weight:700;color:${_impactColour(cp.gold_impact)}">${_impactLabel(cp.gold_impact)}</div>
          </div>
          <div style="text-align:center">
            <div style="font-size:10px;color:var(--muted);margin-bottom:3px">Oil</div>
            <div style="font-size:11px;font-weight:700;color:${_impactColour(cp.oil_impact)}">${_impactLabel(cp.oil_impact)}</div>
          </div>
        </div>`;
      const status = document.getElementById('sow-status');
      if (status) status.textContent = `${cp.name} — ${st.label}`;
    });

    ship.group.addLayer(marker);
  });
}

// ── #4: Live conflict events ──────────────────────────────────────────────────
const _conflictFatality = { high: '#e05252', medium: '#f5a520', low: '#f5c842', none: '#7a7060' };
const _conflictType = {
  armed_conflict:    '⚔',
  maritime_attack:   '🚢',
  military_exercise: '⚡',
  protest:           '✊',
  bombing:           '💥',
};

function _buildConflictEvents(data) {
  _sowLayers.conflict.group = L.layerGroup();

  (data.conflict_events || []).forEach(ev => {
    const fatColor = _conflictFatality[ev.fatalities] || _conflictFatality.low;
    const typeIcon = _conflictType[ev.event_type] || '●';
    const sev      = ev.severity || 'medium';
    const dotSize  = sev === 'high' ? 14 : sev === 'medium' ? 11 : 9;

    const icon = L.divIcon({
      className: '',
      html: `<div style="
        width:${dotSize}px;height:${dotSize}px;border-radius:50%;
        background:${fatColor};border:2px solid rgba(255,255,255,0.2);
        box-shadow:0 0 10px ${fatColor}88;cursor:pointer;
        display:flex;align-items:center;justify-content:center;
        font-size:${dotSize - 4}px;line-height:1;
      ">${dotSize >= 12 ? typeIcon : ''}</div>`,
      iconSize: [dotSize, dotSize],
      iconAnchor: [dotSize / 2, dotSize / 2],
    });

    const marker = L.marker([ev.lat, ev.lng], { icon });
    const impactCol = _impactColour(ev.gold_impact);
    marker.bindTooltip(`
      <div style="max-width:260px">
        <div style="font-size:13px;font-weight:700;color:#e8d5a0;margin-bottom:5px">${ev.name}</div>
        <div style="display:flex;gap:5px;flex-wrap:wrap;margin-bottom:6px">
          <span style="font-size:10px;padding:1px 6px;border-radius:3px;border:1px solid ${fatColor};color:${fatColor};text-transform:uppercase;letter-spacing:0.7px">${sev}</span>
          <span style="font-size:10px;padding:1px 6px;border-radius:3px;border:1px solid #2a2a2a;color:var(--muted);text-transform:uppercase;letter-spacing:0.7px">${(ev.event_type || '').replace(/_/g,' ')}</span>
          ${ev.gold_impact ? `<span style="font-size:10px;padding:1px 6px;border-radius:3px;background:#0d0d0d;color:${impactCol}">Gold: ${_impactLabel(ev.gold_impact)}</span>` : ''}
        </div>
        ${ev.actors ? `<div style="font-size:11px;color:#7a9ae0;margin-bottom:5px">⚔ ${ev.actors}</div>` : ''}
        ${ev.note ? `<div style="font-size:11px;color:#9a8a70;line-height:1.55">${ev.note}</div>` : ''}
      </div>
    `, { direction: 'top', offset: [0, -8], className: 'sow-tooltip', maxWidth: 280 });

    marker.on('click', () => {
      const el = document.getElementById('sow-detail-content');
      if (el) el.innerHTML = `
        <div style="font-size:14px;font-weight:700;color:#e8d5a0;margin-bottom:6px">${ev.name}</div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px">
          <span style="font-size:10px;padding:2px 7px;border-radius:3px;border:1px solid ${fatColor};color:${fatColor};text-transform:uppercase;letter-spacing:0.8px">${sev}</span>
          <span style="font-size:10px;padding:2px 7px;border-radius:3px;border:1px solid #2a2a2a;color:var(--muted);text-transform:uppercase;letter-spacing:0.8px">${(ev.event_type || '').replace('_', ' ')}</span>
          ${ev.gold_impact ? `<span style="font-size:10px;padding:2px 7px;border-radius:3px;background:#0d0d0d;color:${_impactColour(ev.gold_impact)}">Gold: ${_impactLabel(ev.gold_impact)}</span>` : ''}
        </div>
        ${ev.actors ? `<div style="font-size:11px;color:#7a9ae0;margin-bottom:8px">⚔ ${ev.actors}</div>` : ''}
        <div style="font-size:12px;color:#b0a080;line-height:1.6">${ev.note || ''}</div>`;
      const s = document.getElementById('sow-status');
      if (s) s.textContent = ev.name;
    });

    _sowLayers.conflict.group.addLayer(marker);
  });
}

// ── #5: Gold trade flow arrows ────────────────────────────────────────────────
function _buildTradeFlows(data) {
  _sowLayers.tradeflows.group = L.layerGroup();

  (data.trade_flows || []).forEach(flow => {
    const weight = flow.weight || 2;
    const opacity = 0.55 + weight * 0.06;

    // Animated flowing dashed line
    const line = L.polyline(flow.coords, {
      color: '#f5c842',
      weight: weight * 0.9,
      opacity,
      dashArray: '10 6',
      lineCap: 'round',
    });

    // Apply flow animation after adding to map
    line.on('add', () => {
      const el = line.getElement ? line.getElement() : (line._path || null);
      if (el) {
        el.classList.add('sow-trade-flow');
        el.style.animationDuration = `${1.8 - weight * 0.15}s`;
      }
    });

    // Arrowhead at destination
    const dest = flow.coords[flow.coords.length - 1];
    const arrowIcon = L.divIcon({
      className: '',
      html: `<div style="
        width:0;height:0;
        border-left:5px solid transparent;
        border-right:5px solid transparent;
        border-bottom:10px solid #f5c842;
        opacity:0.8;
        filter:drop-shadow(0 0 4px #f5c84288);
      "></div>`,
      iconSize: [10, 10],
      iconAnchor: [5, 5],
    });
    const arrowMarker = L.marker(dest, { icon: arrowIcon, interactive: false, zIndexOffset: -50 });

    const tooltip = `<b style="color:#f5c842">${flow.name}</b><br><span style="font-size:11px;color:#9a8a70">${flow.note || ''}</span>`;
    line.bindTooltip(tooltip, { sticky: true, className: 'sow-tooltip', maxWidth: 260 });
    line.on('click', () => {
      const el = document.getElementById('sow-detail-content');
      if (el) el.innerHTML = `
        <div style="font-size:13px;font-weight:700;color:#f5c842;margin-bottom:8px">⟶ ${flow.name}</div>
        <div style="font-size:12px;color:#b0a080;line-height:1.6">${flow.note || ''}</div>`;
      const s = document.getElementById('sow-status');
      if (s) s.textContent = flow.name;
    });

    _sowLayers.tradeflows.group.addLayer(line);
    _sowLayers.tradeflows.group.addLayer(arrowMarker);
  });
}

// ── #8: News heat map ─────────────────────────────────────────────────────────
function _buildNewsHeatmap(data) {
  _sowLayers.heatmap.group = L.layerGroup();
  const items = data.news_heatmap || [];
  if (!items.length) return;

  const maxCount = Math.max(...items.map(c => c.count));

  items.forEach(country => {
    const intensity = country.count / maxCount;
    const radius    = 150000 + intensity * 650000;  // 150–800km radius
    const alpha     = 0.1 + intensity * 0.35;
    const hue       = Math.round(25 + (1 - intensity) * 40);  // orange→yellow scale
    const color     = `hsl(${hue}, 85%, 55%)`;

    const circle = L.circle([country.lat, country.lng], {
      radius,
      color:       color,
      fillColor:   color,
      weight:      1,
      opacity:     0.4,
      fillOpacity: alpha,
    });

    circle.bindTooltip(`
      <b style="color:#e8d5a0">${country.name}</b>
      <br><span style="font-size:11px;color:${color}">${country.count} recent articles</span>
      ${country.keywords ? `<br><span style="font-size:10px;color:#7a7060">${country.keywords.slice(0, 3).join(' · ')}</span>` : ''}
    `, { sticky: true, className: 'sow-tooltip' });

    circle.on('click', () => {
      const el = document.getElementById('sow-detail-content');
      if (el) el.innerHTML = `
        <div style="font-size:14px;font-weight:700;color:#e8d5a0;margin-bottom:6px">${country.name}</div>
        <div style="font-size:11px;color:${color};margin-bottom:8px">${country.count} recent news articles</div>
        <div style="font-size:11px;color:var(--muted)">News intensity heat map — circle size and colour intensity reflects recent article volume for this country/region. Updated by <code>sow_exporter.py</code>.</div>`;
      const s = document.getElementById('sow-status');
      if (s) s.textContent = country.name;
    });

    _sowLayers.heatmap.group.addLayer(circle);
  });
}

// ── Air traffic (OpenSky) ─────────────────────────────────────────────────────
function _makeAircraftIcon(heading, colour, size) {
  // Triangle pointing in direction of travel
  return L.divIcon({
    className: '',
    html: `<div style="
      width:0;height:0;
      border-left:${size/2}px solid transparent;
      border-right:${size/2}px solid transparent;
      border-bottom:${size}px solid ${colour};
      transform:rotate(${heading}deg);
      filter:drop-shadow(0 0 3px ${colour}99);
    "></div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

function _buildAirTraffic(data) {
  _sowLayers.airtraffic.group = L.layerGroup();
  const sky = data.opensky;
  if (!sky) return;

  const fetchedAt = sky.fetched_at ? sky.fetched_at.replace('T', ' ').slice(0, 16) + ' UTC' : '?';

  function _addAircraft(ac, isMilitary) {
    if (!ac.lat || !ac.lng) return;
    const colour  = ac.colour || '#a0a0a0';
    const isMilCall = ac.source === 'military_callsign';
    const size    = isMilCall ? 14 : isMilitary ? 11 : 9;
    const heading = ac.heading || 0;
    const icon    = _makeAircraftIcon(heading, colour, size);
    const marker  = L.marker([ac.lat, ac.lng], { icon, zIndexOffset: isMilitary ? 200 : 0 });

    const altFt   = ac.altitude ? Math.round(ac.altitude * 3.281) : '?';
    const spdKt   = ac.speed    ? Math.round(ac.speed * 1.944)    : '?';
    const callTag = ac.callsign || ac.icao || '(unknown)';
    const milBadge = isMilCall
      ? `<span style="font-size:9px;padding:1px 5px;border-radius:2px;background:#1a1a2a;border:1px solid ${colour};color:${colour};font-weight:700;margin-left:4px">MIL</span>`
      : (ac.source === 'watch_country'
        ? `<span style="font-size:9px;padding:1px 5px;border-radius:2px;background:#1a1a1a;border:1px solid #3a3a3a;color:#7a7060;margin-left:4px">WATCH</span>`
        : '');

    marker.bindTooltip(`
      <div>
        <div style="font-size:12px;font-weight:700;color:#e8d5a0;margin-bottom:3px">${callTag}${milBadge}</div>
        <div style="font-size:11px;color:#9a8a70">${ac.country}</div>
        <div style="font-size:11px;color:var(--muted);margin-top:3px">
          Alt: ${altFt} ft &nbsp;·&nbsp; Spd: ${spdKt} kt &nbsp;·&nbsp; Hdg: ${heading}°
        </div>
        <div style="font-size:10px;color:#3a3a3a;margin-top:3px">ICAO: ${ac.icao} &nbsp;·&nbsp; ${fetchedAt}</div>
      </div>
    `, { direction: 'top', offset: [0, -6], className: 'sow-tooltip', maxWidth: 240 });

    marker.on('click', () => {
      const el = document.getElementById('sow-detail-content');
      if (el) el.innerHTML = `
        <div style="font-size:14px;font-weight:700;color:#e8d5a0;margin-bottom:4px">${callTag}</div>
        <div style="margin-bottom:8px">
          <span style="font-size:10px;padding:2px 7px;border-radius:3px;border:1px solid ${colour};color:${colour}">${ac.country}</span>
          ${isMilitary ? `<span style="font-size:10px;padding:2px 7px;border-radius:3px;border:1px solid #2a4a6a;color:#60cfff;margin-left:4px">MILITARY CALLSIGN</span>` : ''}
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;padding:8px 10px;background:#0d0d0d;border-radius:4px;border:1px solid #1a1a1a;margin-bottom:8px">
          <div><div style="font-size:10px;color:var(--muted)">Altitude</div><div style="font-size:12px;color:#e8d5a0">${altFt} ft</div></div>
          <div><div style="font-size:10px;color:var(--muted)">Speed</div><div style="font-size:12px;color:#e8d5a0">${spdKt} kt</div></div>
          <div><div style="font-size:10px;color:var(--muted)">Heading</div><div style="font-size:12px;color:#e8d5a0">${heading}°</div></div>
          <div><div style="font-size:10px;color:var(--muted)">Squawk</div><div style="font-size:12px;color:#e8d5a0">${ac.squawk || '—'}</div></div>
        </div>
        <div style="font-size:10px;color:#3a3a3a">ICAO24: ${ac.icao} &nbsp;·&nbsp; Snapshot: ${fetchedAt}</div>`;
      const s = document.getElementById('sow-status');
      if (s) s.textContent = `${callTag} — ${ac.country}`;
    });

    _sowLayers.airtraffic.group.addLayer(marker);
  }

  // Military callsigns (global)
  (sky.military || []).forEach(ac => _addAircraft(ac, true));

  // Conflict-zone aircraft (all)
  Object.values(sky.conflict_zones || {}).forEach(zone => {
    (zone.aircraft || []).forEach(ac => _addAircraft(ac, false));
  });

  // All aircraft globally — tiny dots for everyone else
  const renderedIcao = new Set([
    ...(sky.military || []).map(a => a.icao),
    ...Object.values(sky.conflict_zones || {}).flatMap(z => (z.aircraft || []).map(a => a.icao)),
  ]);
  (sky.all_aircraft || []).forEach(ac => {
    if (!ac.lat || !ac.lng || renderedIcao.has(ac.icao)) return;
    const colour  = ac.colour || '#505050';
    const heading = ac.heading || 0;
    const icon    = _makeAircraftIcon(heading, colour, 6);
    const marker  = L.marker([ac.lat, ac.lng], { icon, zIndexOffset: -100 });
    const altFt   = ac.altitude ? Math.round(ac.altitude * 3.281) : '?';
    const spdKt   = ac.speed    ? Math.round(ac.speed * 1.944)    : '?';
    const callTag = ac.callsign || ac.icao || '(unknown)';
    marker.bindTooltip(`
      <div>
        <div style="font-size:12px;font-weight:700;color:#e8d5a0;margin-bottom:3px">${callTag}</div>
        <div style="font-size:11px;color:#9a8a70">${ac.country}</div>
        <div style="font-size:11px;color:var(--muted);margin-top:3px">
          Alt: ${altFt} ft &nbsp;·&nbsp; Spd: ${spdKt} kt &nbsp;·&nbsp; Hdg: ${heading}°
        </div>
        <div style="font-size:10px;color:#3a3a3a;margin-top:3px">ICAO: ${ac.icao} &nbsp;·&nbsp; ${fetchedAt}</div>
      </div>
    `, { direction: 'top', offset: [0, -4], className: 'sow-tooltip', maxWidth: 220 });
    _sowLayers.airtraffic.group.addLayer(marker);
  });
}

// ── Live ships (AISStream) ─────────────────────────────────────────────────────
function _makeShipIcon(heading, colour, size) {
  // Diamond shape — distinguishable from aircraft triangles
  const h = heading || 0;
  return L.divIcon({
    html: `<div style="width:${size}px;height:${size}px;background:${colour};transform:rotate(${h}deg);clip-path:polygon(50% 0%,100% 50%,50% 100%,0% 50%);opacity:0.85"></div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    className: '',
  });
}

function _buildShips(data) {
  _sowLayers.ships.group = L.layerGroup();
  const sd = data.ships;
  if (!sd || !sd.ships) return;

  const fetchedAt = sd.fetched_at ? sd.fetched_at.replace('T', ' ').slice(0, 16) + ' UTC' : '?';

  const catSize = { tanker: 11, cargo: 10, military: 12, passenger: 9, special: 8, fishing: 7, other: 6 };
  const catLabel = { tanker: 'Tanker', cargo: 'Cargo', military: 'Military', passenger: 'Passenger', special: 'Special', fishing: 'Fishing', other: 'Unknown' };
  const statusLabel = {
    0: 'Underway', 1: 'At anchor', 2: 'Not under command', 3: 'Restricted',
    5: 'Moored', 6: 'Aground', 7: 'Fishing', 8: 'Underway (sail)',
  };

  (sd.ships || []).forEach(ship => {
    if (!ship.lat || !ship.lng) return;
    const cat    = ship.category || 'other';
    const colour = ship.colour || '#6a6a6a';
    const size   = catSize[cat] || 6;
    const icon   = _makeShipIcon(ship.heading, colour, size);
    const marker = L.marker([ship.lat, ship.lng], { icon, zIndexOffset: cat === 'military' ? 200 : cat === 'tanker' ? 100 : 0 });

    const spdKt  = ship.speed ?? '?';
    const status = statusLabel[ship.status] || 'Unknown';
    const dest   = ship.dest ? ` → ${ship.dest}` : '';

    const ofacFlag = ship.ofac_sanctioned
      ? `<span style="font-size:9px;padding:1px 5px;border-radius:2px;background:#3a0000;border:1px solid #e05252;color:#e05252;font-weight:700;margin-left:4px">⚠ SANCTIONED</span>`
      : '';

    marker.bindTooltip(`
      <div>
        <div style="font-size:12px;font-weight:700;color:#e8d5a0;margin-bottom:3px">${ship.name}${ofacFlag}</div>
        <div style="display:flex;gap:5px;align-items:center;margin-bottom:3px">
          <span style="font-size:9px;padding:1px 5px;border-radius:2px;background:#1a1a1a;border:1px solid ${colour};color:${colour};font-weight:700">${catLabel[cat] || cat}</span>
          <span style="font-size:10px;color:#7a7060">${status}${dest}</span>
        </div>
        <div style="font-size:11px;color:var(--muted)">Spd: ${spdKt} kt &nbsp;·&nbsp; Hdg: ${ship.heading}°</div>
        <div style="font-size:10px;color:#3a3a3a;margin-top:3px">MMSI: ${ship.mmsi} &nbsp;·&nbsp; ${fetchedAt}</div>
      </div>
    `, { direction: 'top', offset: [0, -6], className: 'sow-tooltip', maxWidth: 240 });

    marker.on('click', () => {
      const el = document.getElementById('sow-detail-content');
      if (el) el.innerHTML = `
        <div style="font-size:14px;font-weight:700;color:#e8d5a0;margin-bottom:4px">${ship.name}</div>
        ${ship.ofac_sanctioned ? `<div style="padding:6px 10px;background:#1a0000;border:1px solid #e05252;border-radius:3px;margin-bottom:8px;font-size:11px;color:#e05252">⚠ OFAC SANCTIONED VESSEL — Program: ${ship.ofac_program || 'Unknown'}</div>` : ''}
        <div style="margin-bottom:8px">
          <span style="font-size:10px;padding:2px 7px;border-radius:3px;border:1px solid ${colour};color:${colour}">${catLabel[cat] || cat}</span>
          ${dest ? `<span style="font-size:10px;color:#7a7060;margin-left:6px">${dest}</span>` : ''}
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;padding:8px 10px;background:#0d0d0d;border-radius:4px;border:1px solid #1a1a1a;margin-bottom:8px">
          <div><div style="font-size:10px;color:var(--muted)">Speed</div><div style="font-size:12px;color:#e8d5a0">${spdKt} kt</div></div>
          <div><div style="font-size:10px;color:var(--muted)">Heading</div><div style="font-size:12px;color:#e8d5a0">${ship.heading}°</div></div>
          <div><div style="font-size:10px;color:var(--muted)">Status</div><div style="font-size:12px;color:#e8d5a0">${status}</div></div>
          <div><div style="font-size:10px;color:var(--muted)">Type</div><div style="font-size:12px;color:#e8d5a0">${ship.type_code || '?'}</div></div>
        </div>
        <div style="font-size:10px;color:#3a3a3a">MMSI: ${ship.mmsi} &nbsp;·&nbsp; Snapshot: ${fetchedAt}</div>`;
      const s = document.getElementById('sow-status');
      if (s) s.textContent = `${ship.name} — ${catLabel[cat] || cat}`;
    });

    _sowLayers.ships.group.addLayer(marker);
  });
}

// ── Build layer: humanitarian crises (ReliefWeb) ─────────────────────────────
function _buildCrises(data) {
  const layer = _sowLayers.crises;
  layer.group = L.layerGroup();

  const typeColour = {
    'Armed Conflict':     '#e05252',
    'Civil Unrest':       '#e07aaa',
    'Political Crisis':   '#c470c4',
    'Humanitarian Crisis':'#aa52c4',
    'Earthquake':         '#c49052',
    'Flood':              '#5288c4',
    'Epidemic':           '#52c488',
    'Drought':            '#c4c452',
  };

  (data.crises || []).forEach(c => {
    const col  = typeColour[c.crisis_type] || '#e07aaa';
    const size = c.severity === 'high' ? 13 : c.severity === 'medium' ? 10 : 8;
    const marker = L.marker([c.lat, c.lng], { icon: _makeIcon(col, size) });

    marker.bindTooltip(
      `<b style="color:#e8d5a0">${c.name}</b><br>`
      + `<span style="font-size:11px;color:${col}">${c.crisis_type || 'Crisis'}</span>`
      + (c.country ? `<br><span style="font-size:10px;color:#7a7060">${c.country}</span>` : ''),
      { direction: 'top', offset: [0, -8], className: 'sow-tooltip' }
    );
    marker.on('click', () => _showDetail({
      ...c,
      name:  c.name,
      type:  c.crisis_type || 'crisis',
    }));
    layer.group.addLayer(marker);
  });
}

// ── Build layer: oil / gas pipelines (Overpass) ───────────────────────────────
function _buildPipelines(data) {
  const layer = _sowLayers.pipelines;
  layer.group = L.layerGroup();

  const substanceStyle = {
    oil:         { color: '#c47820', weight: 2.5, dashArray: null },
    petroleum:   { color: '#c47820', weight: 2.5, dashArray: null },
    crude:       { color: '#c47820', weight: 2.5, dashArray: null },
    gas:         { color: '#f5a520', weight: 2,   dashArray: '6 3' },
    natural_gas: { color: '#f5a520', weight: 2,   dashArray: '6 3' },
    lng:         { color: '#f5c842', weight: 2,   dashArray: '4 4' },
    lpg:         { color: '#f5c842', weight: 1.5, dashArray: '4 4' },
    fuel:        { color: '#c48850', weight: 1.5, dashArray: null },
  };
  const defaultStyle = { color: '#8a6830', weight: 1.5, dashArray: '3 3' };

  (data.pipelines || []).forEach(p => {
    if (!p.coords || p.coords.length < 2) return;
    const style = substanceStyle[p.substance] || defaultStyle;

    const line = L.polyline(p.coords, {
      color:     style.color,
      weight:    style.weight,
      opacity:   0.7,
      dashArray: style.dashArray,
    });

    const nameStr = p.name && p.name !== p.label ? p.name : '';
    const opStr   = p.operator ? ` · ${p.operator}` : '';
    line.bindTooltip(
      `<b style="color:#e8d5a0">${nameStr || p.label}</b>`
      + `<br><span style="font-size:11px;color:${style.color}">${p.label}${opStr}</span>`
      + `<br><span style="font-size:10px;color:#7a7060">${p.region.replace(/_/g, ' ')}</span>`,
      { sticky: true, className: 'sow-tooltip' }
    );
    line.on('click', () => {
      const el = document.getElementById('sow-detail-content');
      if (!el) return;
      el.innerHTML = `
        <div style="font-size:14px;font-weight:700;color:#e8d5a0;margin-bottom:6px">${nameStr || p.label}</div>
        <div style="display:flex;gap:6px;margin-bottom:8px;flex-wrap:wrap">
          <span style="font-size:10px;padding:2px 7px;border-radius:3px;border:1px solid ${style.color};color:${style.color};text-transform:uppercase">${p.label}</span>
          ${p.operator ? `<span style="font-size:10px;padding:2px 7px;border-radius:3px;border:1px solid #2a2a2a;color:var(--muted)">${p.operator}</span>` : ''}
        </div>
        <div style="font-size:12px;color:#9a8a70">Region: ${p.region.replace(/_/g,' ')}</div>
        ${p.ref ? `<div style="font-size:11px;color:#7a7060;margin-top:4px">Ref: ${p.ref}</div>` : ''}
      `;
      const status = document.getElementById('sow-status');
      if (status) status.textContent = nameStr || p.label;
    });

    layer.group.addLayer(line);
  });
}

// ── Build layer: major world ports (NGA WPI) ──────────────────────────────────
function _buildPorts(data) {
  const layer = _sowLayers.ports;
  layer.group = L.layerGroup();

  (data.ports || []).forEach(p => {
    const col  = p.color || '#60cfff';
    const size = p.size === 'V' ? 10 : 7;
    const marker = L.circleMarker([p.lat, p.lng], {
      radius:      size,
      fillColor:   col,
      color:       col,
      weight:      1,
      fillOpacity: 0.65,
    });

    marker.bindTooltip(
      `<b style="color:#e8d5a0">${p.name}</b><br>`
      + `<span style="font-size:11px;color:${col}">${p.size_label} port</span>`
      + (p.country ? `<br><span style="font-size:10px;color:#7a7060">${p.country}</span>` : ''),
      { direction: 'top', offset: [0, -8], className: 'sow-tooltip' }
    );
    marker.on('click', () => {
      const el = document.getElementById('sow-detail-content');
      if (!el) return;
      el.innerHTML = `
        <div style="font-size:14px;font-weight:700;color:#e8d5a0;margin-bottom:6px">${p.name}</div>
        <div style="font-size:12px;color:#9a8a70;margin-bottom:8px">${p.size_label} port · ${p.country}</div>
        ${p.use ? `<div style="font-size:11px;color:#7a7060">Use: ${p.use}</div>` : ''}
        ${p.shelter ? `<div style="font-size:11px;color:#7a7060">Shelter: ${p.shelter}</div>` : ''}
        ${p.wpi ? `<div style="font-size:10px;color:#5a5040;margin-top:4px">WPI #${p.wpi}</div>` : ''}
      `;
      const status = document.getElementById('sow-status');
      if (status) status.textContent = p.name;
    });

    layer.group.addLayer(marker);
  });
}

// ── Regional tone timelines ───────────────────────────────────────────────────
const _toneCharts = {};

function _buildToneTimelines(data) {
  const panel = document.getElementById('sow-tone-panel');
  if (!panel) return;
  const timelines = data.tone_timelines;
  if (!timelines || !Object.keys(timelines).length) {
    panel.innerHTML = '<span style="font-size:11px;color:#3a3a3a">No timeline data — run sow_exporter.py</span>';
    return;
  }

  panel.innerHTML = '';

  // Destroy any old charts first
  Object.values(_toneCharts).forEach(c => { try { c.destroy(); } catch(e) {} });

  Object.entries(timelines).forEach(([regionId, region]) => {
    const points   = region.data || [];
    const labels   = points.map(p => p.date.slice(5));  // MM-DD
    const values   = points.map(p => p.tone);
    const latest   = values.filter(v => v !== null).at(-1) ?? 0;
    const prev     = values.filter(v => v !== null).at(-2) ?? latest;
    const trend    = latest < prev ? '▼' : latest > prev ? '▲' : '●';
    const toneCol  = latest < -5 ? '#e05252' : latest < -3 ? '#f5a520' : latest < -1 ? '#c4c440' : '#52c4a0';

    const wrap = document.createElement('div');
    wrap.style.cssText = 'background:#0d0d0d;border:1px solid #1a1a1a;border-radius:4px;padding:7px 9px';

    const header = document.createElement('div');
    header.style.cssText = 'display:flex;align-items:center;justify-content:space-between;margin-bottom:5px';
    header.innerHTML = `
      <span style="font-size:11px;color:#b0a080">${region.label}</span>
      <span style="font-size:11px;font-weight:700;color:${toneCol}">${trend} ${latest !== null ? latest.toFixed(1) : '—'}</span>
    `;

    const canvasWrap = document.createElement('div');
    canvasWrap.style.cssText = 'height:36px;position:relative';
    const canvas = document.createElement('canvas');
    canvas.id = `sow-tone-${regionId}`;

    canvasWrap.appendChild(canvas);
    wrap.appendChild(header);
    wrap.appendChild(canvasWrap);
    panel.appendChild(wrap);

    // Render Chart.js sparkline
    _toneCharts[regionId] = new Chart(canvas, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          data: values,
          borderColor: toneCol,
          backgroundColor: toneCol + '18',
          borderWidth: 1.5,
          pointRadius: 0,
          pointHoverRadius: 3,
          fill: true,
          tension: 0.3,
          spanGaps: true,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: ctx => `Tone: ${ctx.parsed.y !== null ? ctx.parsed.y.toFixed(1) : '—'}`,
            },
            titleColor: '#e8d5a0',
            bodyColor: toneCol,
            backgroundColor: '#0d0d0d',
            borderColor: '#2a2a2a',
            borderWidth: 1,
          },
        },
        scales: {
          x: { display: false },
          y: {
            display: false,
            suggestedMin: -10,
            suggestedMax: 2,
          },
        },
      },
    });
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

    const badge = layer.live
      ? `<span data-tip="Live API data" style="font-size:9px;padding:1px 5px;border-radius:3px;background:#0d3a1a;border:1px solid #1a5a2a;color:#52c4a0;letter-spacing:0.5px;flex-shrink:0">LIVE</span>`
      : `<span data-tip="Hardcoded / static data" style="font-size:10px;flex-shrink:0" title="Hardcoded data">🤖</span>`;

    const left = `
      <div style="display:flex;align-items:center;gap:8px">
        <div style="width:10px;height:10px;border-radius:50%;background:${layer.color};flex-shrink:0"></div>
        <span style="font-size:12px;color:${layer.enabled ? '#e8d5a0' : 'var(--muted)'}">${layer.label}</span>
        ${badge}
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
    const cpStatuses = [
      ['#e05252', 'CRITICAL chokepoint'],
      ['#e07a30', 'DISRUPTED chokepoint'],
      ['#f5a520', 'ELEVATED chokepoint'],
      ['#c4c440', 'REDUCED capacity'],
      ['#52c4a0', 'NORMAL flow'],
    ];
    cpStatuses.forEach(([c, lbl]) => el.appendChild(row(c, 'dot', `● ${lbl}`)));
  }

  if (_sowLayers.conflict.enabled) {
    el.appendChild(row('#e05252', 'dot', '● High fatalities'));
    el.appendChild(row('#f5a520', 'dot', '● Medium fatalities'));
    el.appendChild(row('#f5c842', 'dot', '● Low fatalities'));
    el.appendChild(row('#7a7060', 'dot', '● No fatalities / exercise'));
  }

  if (_sowLayers.tradeflows.enabled) {
    el.appendChild(row('#f5c842', 'line', '── → Gold trade flow'));
  }

  if (_sowLayers.heatmap.enabled) {
    el.appendChild(row('#ff9f43', 'dot', '● High news volume'));
    el.appendChild(row('#f5c842', 'dot', '● Low news volume'));
  }

  if (_sowLayers.airtraffic.enabled) {
    // Size
    el.appendChild(row('#60cfff', 'dot', '▲ Large = military callsign'));
    el.appendChild(row('#a0a0a0', 'dot', '▲ Small = conflict-zone aircraft'));
    // Divider
    const div = document.createElement('div');
    div.style.cssText = 'border-top:1px solid #1a1a1a;margin:2px 0';
    el.appendChild(div);
    // Country colours
    el.appendChild(row('#4a9af5', 'dot', '▲ US / UK / France / Germany'));
    el.appendChild(row('#e05252', 'dot', '▲ Russia / China'));
    el.appendChild(row('#52c4a0', 'dot', '▲ Israel'));
    el.appendChild(row('#f5a520', 'dot', '▲ Turkey'));
    el.appendChild(row('#e07a30', 'dot', '▲ Iran'));
    el.appendChild(row('#f5c842', 'dot', '▲ Saudi Arabia'));
    el.appendChild(row('#a0a0a0', 'dot', '▲ Other / unknown'));
    // Note
    const note = document.createElement('div');
    note.style.cssText = 'font-size:10px;color:#3a3a3a;margin-top:2px';
    note.textContent = 'Triangle points in direction of travel';
    el.appendChild(note);
  }

  if (_sowLayers.ships.enabled) {
    el.appendChild(divider());
    el.appendChild(label('Live Ships'));
    el.appendChild(row('#e07a30', 'dot', '◆ Tanker (oil/chemical/gas)'));
    el.appendChild(row('#f5c842', 'dot', '◆ Cargo'));
    el.appendChild(row('#e05252', 'dot', '◆ Military'));
    el.appendChild(row('#7a9ae0', 'dot', '◆ Passenger'));
    el.appendChild(row('#a78bfa', 'dot', '◆ Special / SAR / Tug'));
    el.appendChild(row('#52c4a0', 'dot', '◆ Fishing'));
    el.appendChild(row('#6a6a6a', 'dot', '◆ Unknown type'));
    const note2 = document.createElement('div');
    note2.style.cssText = 'font-size:10px;color:#3a3a3a;margin-top:2px';
    note2.textContent = 'Diamond points in direction of travel';
    el.appendChild(note2);

    // Zone counts + skipped note
    const sd = _sowData && _sowData.ships;
    if (sd && sd.zones) {
      const shownTotal   = Object.values(sd.zones).reduce((s, z) => s + (z.count   || 0), 0);
      const skippedTotal = Object.values(sd.zones).reduce((s, z) => s + (z.skipped || 0), 0);
      const zoneEl = document.createElement('div');
      zoneEl.style.cssText = 'margin-top:6px;font-size:10px;color:#5a5a5a;border-top:1px solid #1a1a1a;padding-top:4px';
      let html = Object.entries(sd.zones)
        .filter(([, z]) => z.count > 0)
        .sort(([, a], [, b]) => b.count - a.count)
        .map(([, z]) => `<div>${z.label}: ${z.count}${z.skipped ? ` <span style="color:#3a3a3a">+${z.skipped} not shown</span>` : ''}</div>`)
        .join('');
      if (skippedTotal > 0) {
        html += `<div style="color:#e07a30;margin-top:3px">⚠ ${skippedTotal} ships above zone cap not shown</div>`;
      }
      zoneEl.innerHTML = html;
      el.appendChild(zoneEl);
    }
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
          <div style="font-size:11px;color:#9a8a70">AU state registries • Mining leases = <span style="color:#f5a520">gold</span> • Exploration = <span style="color:#a0c4f0">blue</span></div>
        </div>`;

      // Add fallback centroid dot while loading
      const fallbackLL = company.sites && company.sites[0]
        ? [company.sites[0].lat, company.sites[0].lng] : null;

      const allFiles = [company.tenement_file].concat(company.extra_tenement_files || []);
      Promise.all(allFiles.map(f => fetch(`${f}?v=${Date.now()}`).then(r => r.json())))
        .then(gjs => {
          if (!_asxLayer) return;
          const gj = { features: gjs.flatMap(g => g.features || []) };
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
      @keyframes sow-dash-flow { from { stroke-dashoffset: 32; } to { stroke-dashoffset: 0; } }
      path.sow-trade-flow { animation: sow-dash-flow 1.8s linear infinite; }
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
      _buildChokepoints(data);
      _buildConflictEvents(data);
      _buildCrises(data);
      _buildPipelines(data);
      _buildPorts(data);
      _buildTradeFlows(data);
      _buildNewsHeatmap(data);
      _buildAirTraffic(data);
      _buildShips(data);
      _buildMiningRegions(data);
      _buildAustralia(data);
      _buildToneTimelines(data);

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
