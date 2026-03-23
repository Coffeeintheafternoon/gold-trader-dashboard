// tab_chatter.js — Chatter tab: 6-source market intelligence feed

let _chatterSortable  = null;
let _scrapeJobId      = null;
let _scrapePoller     = null;
let _chatterLiveMode  = false;   // true = Flask server available, false = static Netlify

let _glossaryItems    = [];      // full YouTube glossary dataset
let _hcItems          = [];      // HotCopper thread dataset
let _glFiltered       = [];      // current filtered view (used by modal)
let _tickerFilter     = '';      // ticker search string (e.g. "WAF")
let _enabledSources   = new Set(['youtube', 'hotcopper']);  // toggled by source bar

async function initChatterTab() {
  const elLoading = document.getElementById('chatter-loading');
  const elOffline = document.getElementById('chatter-offline');
  const elBody    = document.getElementById('chatter-body');

  // ── Try Flask server first ─────────────────────────────────────────────────
  try {
    const resp = await fetch('/api/channels', { signal: AbortSignal.timeout(1500) });
    if (!resp.ok) throw new Error('server error');
    const channels = await resp.json();
    _chatterLiveMode = true;
    elLoading.style.display = 'none';
    document.getElementById('chatter-content').style.display = '';
    _buildChatterPage([], [], channels, [], true);
    return;
  } catch (_e) {}

  // ── Fall back to static chatter_data.json (Netlify mode) ──────────────────
  try {
    const resp = await fetch(`./chatter_data.json?v=${_CV}`);
    if (!resp.ok) throw new Error('no data');
    const data = await resp.json();
    elLoading.style.display = 'none';
    document.getElementById('chatter-content').style.display = '';
    _buildChatterPage(data.glossary || [], data.broken_transcripts || [], data.channels || [], data.hotcopper || [], false);
  } catch (_e) {
    elLoading.style.display = 'none';
    elOffline.style.display = '';
  }
}

// ── Main layout builder ────────────────────────────────────────────────────────

function _buildChatterPage(glossary, broken, channels, hotcopper, interactive) {
  const body = document.getElementById('chatter-body');
  _glossaryItems = glossary;
  _hcItems       = hotcopper;

  body.innerHTML = `
    ${_buildTickerBar()}
    ${_buildSourceBar(glossary.length, hotcopper.length)}
    ${_buildFilterBar(glossary)}
    <div id="chatter-feed" style="margin-bottom:32px"></div>
    ${_buildManageSection(interactive)}
  `;

  // Wire ticker search
  const tickerInput = document.getElementById('chatter-ticker-input');
  if (tickerInput) {
    tickerInput.addEventListener('input', () => {
      _tickerFilter = tickerInput.value.trim().toUpperCase();
      _applyFeedFilter();
    });
    document.getElementById('chatter-ticker-clear').addEventListener('click', () => {
      tickerInput.value = '';
      _tickerFilter = '';
      _applyFeedFilter();
    });
  }

  // Wire filter bar
  ['chatter-filter-source','chatter-filter-score','chatter-filter-sort'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('change', _applyFeedFilter);
  });
  const searchEl = document.getElementById('chatter-filter-search');
  if (searchEl) searchEl.addEventListener('input', _applyFeedFilter);

  // Render YouTube feed + management
  _applyFeedFilter();
  _renderChannelList(channels, interactive);
  _renderScrapePanel(interactive);

  // Transcript modal (appended once to body)
  if (!document.getElementById('gl-modal')) {
    const m = document.createElement('div');
    m.id = 'gl-modal';
    m.style.cssText = 'display:none;position:fixed;inset:0;background:rgba(0,0,0,0.82);z-index:9999;overflow-y:auto;padding:32px 16px';
    m.innerHTML = `
      <div style="max-width:760px;margin:0 auto;background:#111;border:1px solid #2a2a2a;border-radius:6px;padding:28px 32px;position:relative">
        <button onclick="_closeGlModal()" style="position:absolute;top:14px;right:18px;background:none;border:none;color:var(--muted);font-size:20px;cursor:pointer;line-height:1">✕</button>
        <div id="gl-modal-body"></div>
      </div>`;
    m.addEventListener('click', e => { if (e.target === m) _closeGlModal(); });
    document.body.appendChild(m);
  }

  // Broken transcripts (appended to feed area after render)
  if (broken && broken.length) {
    setTimeout(() => _appendBrokenSection(broken), 0);
  }
}

// ── Ticker search bar ──────────────────────────────────────────────────────────

function _buildTickerBar() {
  return `
    <div style="margin-bottom:16px;display:flex;align-items:center;gap:10px">
      <div style="position:relative;flex:0 0 260px">
        <span style="position:absolute;left:10px;top:50%;transform:translateY(-50%);font-size:12px;color:var(--muted);pointer-events:none;font-family:monospace">TICKER</span>
        <input id="chatter-ticker-input" type="text" placeholder="e.g. WAF, EVN, LYC…"
          style="width:100%;background:#0d0d0d;border:1px solid #2a2a2a;color:var(--text);
                 padding:8px 36px 8px 60px;border-radius:3px;font-size:13px;font-family:monospace;
                 outline:none;transition:border-color 0.15s"
          onfocus="this.style.borderColor='var(--gold)'" onblur="this.style.borderColor='#2a2a2a'">
        <button id="chatter-ticker-clear"
          style="position:absolute;right:8px;top:50%;transform:translateY(-50%);
                 background:none;border:none;color:var(--muted);font-size:15px;cursor:pointer;
                 padding:2px 4px;line-height:1">✕</button>
      </div>
      <span style="font-size:12px;color:var(--muted)">Filter all sources by ticker mention</span>
    </div>
  `;
}

// ── Source status bar ──────────────────────────────────────────────────────────

function _buildSourceBar(ytCount, hcCount) {
  const hcActive = hcCount > 0;
  const sources = [
    { key: 'youtube',      label: 'YouTube',           live: true,     count: ytCount },
    { key: 'hotcopper',    label: 'HotCopper',          live: hcActive, count: hcActive ? hcCount : null },
    { key: 'twitter',      label: 'Twitter / X',       live: false,    count: null },
    { key: 'news',         label: 'News',               live: false,    count: null },
    { key: 'broker',       label: 'Broker Reports',     live: false,    count: null },
    { key: 'asx_announce', label: 'ASX Announcements',  live: false,    count: null },
  ];

  const cards = sources.map(s => {
    const isOn      = s.live && _enabledSources.has(s.key);
    const clickable = s.live;

    const border  = isOn  ? '1px solid rgba(0,255,65,0.35)' : (s.live ? '1px solid #2a2a2a' : '1px solid #1a1a1a');
    const opacity = s.live && !isOn ? '0.4' : '1';
    const cursor  = clickable ? 'cursor:pointer' : '';
    const bg      = isOn ? 'background:rgba(0,255,65,0.04)' : 'background:var(--card)';

    const dot  = s.live
      ? `<span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:var(--green);${isOn ? 'box-shadow:0 0 6px var(--green)' : 'opacity:0.4'};margin-right:5px"></span>`
      : `<span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:#333;margin-right:5px"></span>`;
    const pill = s.live
      ? `<span style="font-size:10px;color:${isOn ? 'var(--green)' : '#555'};letter-spacing:0.5px">LIVE</span>`
      : `<span style="font-size:10px;color:#444;letter-spacing:0.5px">SOON</span>`;
    const countEl = s.live && s.count != null
      ? `<span style="font-size:18px;font-weight:700;font-family:monospace;color:${isOn ? 'var(--green)' : '#555'}">${s.count}</span>`
      : `<span style="font-size:18px;font-weight:700;font-family:monospace;color:#333">—</span>`;
    const sub = s.live
      ? `<div style="font-size:10px;color:var(--muted);margin-top:2px">${isOn ? 'showing' : 'hidden'}</div>`
      : `<div style="font-size:10px;color:#333;margin-top:2px">not connected</div>`;

    const onclick = clickable ? `onclick="_toggleSource('${s.key}')"` : '';

    return `
      <div id="src-card-${s.key}" ${onclick}
           style="${bg};border:${border};border-radius:4px;padding:12px 16px;min-width:0;
                  opacity:${opacity};${cursor};transition:opacity 0.15s,border-color 0.15s,background 0.15s;
                  user-select:none">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
          <span style="font-size:11px;font-weight:700;color:${s.live ? 'var(--text)' : '#555'};text-transform:uppercase;letter-spacing:0.5px">${s.label}</span>
          <div style="display:flex;align-items:center">${dot}${pill}</div>
        </div>
        ${countEl}
        ${sub}
      </div>`;
  }).join('');

  return `
    <div style="display:grid;grid-template-columns:repeat(6,1fr);gap:10px;margin-bottom:20px">
      ${cards}
    </div>
  `;
}

function _toggleSource(key) {
  if (_enabledSources.has(key)) {
    _enabledSources.delete(key);
  } else {
    _enabledSources.add(key);
  }
  // Update card appearance
  const card = document.getElementById(`src-card-${key}`);
  if (card) {
    const isOn = _enabledSources.has(key);
    card.style.opacity     = isOn ? '1' : '0.4';
    card.style.background  = isOn ? 'rgba(0,255,65,0.04)' : 'var(--card)';
    card.style.borderColor = isOn ? 'rgba(0,255,65,0.35)' : '#2a2a2a';
    const dot  = card.querySelector('span[style*="border-radius:50%"]');
    const pill = card.querySelectorAll('span')[1];
    const cnt  = card.querySelectorAll('span')[2];
    const sub  = card.querySelector('div > div:last-child');
    if (dot)  dot.style.boxShadow  = isOn ? '0 0 6px var(--green)' : 'none';
    if (dot)  dot.style.opacity    = isOn ? '1' : '0.4';
    if (pill) pill.style.color     = isOn ? 'var(--green)' : '#555';
    if (cnt)  cnt.style.color      = isOn ? 'var(--green)' : '#555';
    if (sub)  sub.textContent      = isOn ? 'showing' : 'hidden';
  }
  _applyFeedFilter();
}

// ── Filter bar ─────────────────────────────────────────────────────────────────

function _buildFilterBar(items) {
  const channels = [...new Set((items || []).map(i => i.channel_name))].sort();
  const channelOpts = channels.map(c => `<option value="yt:${c}">${c}</option>`).join('');
  const selectStyle = 'background:#111;border:1px solid #2a2a2a;color:var(--text);padding:6px 10px;border-radius:3px;font-size:12px;cursor:pointer;outline:none';

  return `
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px;align-items:center">
      <input id="chatter-filter-search" type="text" placeholder="Search titles & summaries…"
        style="flex:1;min-width:180px;background:#111;border:1px solid #2a2a2a;color:var(--text);
               padding:6px 10px;border-radius:3px;font-size:12px;outline:none;transition:border-color 0.15s"
        onfocus="this.style.borderColor='var(--gold)'" onblur="this.style.borderColor='#2a2a2a'">
      <select id="chatter-filter-source" style="${selectStyle}">
        <option value="">All sources</option>
        <option value="youtube">YouTube</option>
        <option value="hotcopper">HotCopper</option>
        <option value="twitter" disabled>Twitter (soon)</option>
        <option value="news" disabled>News (soon)</option>
        <option value="broker" disabled>Broker Reports (soon)</option>
        <option value="asx_announce" disabled>ASX Announcements (soon)</option>
      </select>
      <select id="chatter-filter-score" style="${selectStyle}">
        <option value="0">Min score: any</option>
        <option value="5">Min score: 5+</option>
        <option value="7">Min score: 7+</option>
        <option value="9">Min score: 9+</option>
      </select>
      <select id="chatter-filter-sort" style="${selectStyle}">
        <option value="date">Newest first</option>
        <option value="score">Highest score</option>
        <option value="channel">Channel A–Z</option>
      </select>
      <span id="chatter-feed-count" style="font-size:11px;color:var(--muted);margin-left:auto;white-space:nowrap"></span>
    </div>
  `;
}

// ── Feed rendering ─────────────────────────────────────────────────────────────

function _applyFeedFilter() {
  const search  = (document.getElementById('chatter-filter-search')?.value || '').toLowerCase();
  const source  = document.getElementById('chatter-filter-source')?.value || '';
  const minSc   = parseFloat(document.getElementById('chatter-filter-score')?.value || '0');
  const sort    = document.getElementById('chatter-filter-sort')?.value || 'date';
  const ticker  = _tickerFilter;  // already upper-case

  // ── YouTube items ──────────────────────────────────────────────────────────
  let ytItems = [];
  if (_enabledSources.has('youtube') && (!source || source === 'youtube')) {
    ytItems = _glossaryItems.filter(item => {
      if (item.llm_score != null && item.llm_score < minSc) return false;
      if (search) {
        const h = `${item.title} ${item.llm_summary || ''}`.toLowerCase();
        if (!h.includes(search)) return false;
      }
      if (ticker) {
        const h = `${item.title} ${item.llm_summary || ''} ${item.transcript_text || ''}`.toUpperCase();
        if (!h.includes(ticker)) return false;
      }
      return true;
    }).map(i => ({ ...i, _source: 'youtube', _date: i.published_at }));
  }

  // ── HotCopper items ────────────────────────────────────────────────────────
  let hcFiltered = [];
  if (_enabledSources.has('hotcopper') && (!source || source === 'hotcopper')) {
    hcFiltered = _hcItems.filter(item => {
      // Score filter doesn't apply to HC (no LLM score)
      if (search) {
        const h = `${item.title} ${item.ticker}`.toLowerCase();
        if (!h.includes(search)) return false;
      }
      if (ticker) {
        // HC: match exact ticker OR ticker mention in title
        const exactMatch = item.ticker.toUpperCase() === ticker;
        const titleMatch = item.title.toUpperCase().includes(ticker);
        if (!exactMatch && !titleMatch) return false;
      }
      return true;
    }).map(i => ({ ...i, _source: 'hotcopper', _date: i.posted_at }));
  }

  // ── Merge + sort ───────────────────────────────────────────────────────────
  let merged = [...ytItems, ...hcFiltered];

  if (sort === 'score') {
    // HC items go after YouTube (no score); YT sorted by score desc
    const yt = merged.filter(i => i._source === 'youtube').sort((a, b) => (b.llm_score || 0) - (a.llm_score || 0));
    const hc = merged.filter(i => i._source === 'hotcopper');
    merged = [...yt, ...hc];
  } else if (sort === 'channel') {
    merged.sort((a, b) => {
      const aName = a._source === 'youtube' ? (a.channel_name || '') : `HC:${a.ticker}`;
      const bName = b._source === 'youtube' ? (b.channel_name || '') : `HC:${b.ticker}`;
      return aName.localeCompare(bName);
    });
  } else {
    // Default: newest first
    merged.sort((a, b) => (b._date || '').localeCompare(a._date || ''));
  }

  // YouTube-only items stored for modal (by index into merged yt-only slice)
  _glFiltered = merged.filter(i => i._source === 'youtube');
  window._glFiltered = _glFiltered;

  const total = _glossaryItems.length + _hcItems.length;
  const countEl = document.getElementById('chatter-feed-count');
  if (countEl) {
    countEl.textContent = ticker
      ? `${merged.length} of ${total} mention "${ticker}"`
      : `${merged.length} of ${total}`;
  }

  _renderFeed(merged);
}

function _renderFeed(items) {
  const container = document.getElementById('chatter-feed');
  if (!container) return;

  if (!_glossaryItems.length && !_tickerFilter) {
    container.innerHTML = _buildComingSoonPlaceholders();
    return;
  }

  if (!items.length) {
    const msg = _tickerFilter
      ? `No items mention <span style="color:var(--gold);font-family:monospace">${_tickerFilter}</span> across active sources.`
      : 'No items match the selected filters.';
    container.innerHTML = `<div class="chart-card" style="padding:24px;text-align:center">
      <div style="font-size:13px;color:var(--muted);line-height:1.7">${msg}</div>
    </div>`;
    return;
  }

  // Track per-source modal indices
  let ytIdx = 0;

  const rows = items.map((item) => {
    if (item._source === 'hotcopper') {
      return _renderHCRow(item);
    } else {
      return _renderYTRow(item, ytIdx++);
    }
  }).join('');

  container.innerHTML = `<div class="chart-card" style="padding:0;overflow:hidden">${rows}</div>`;
}

function _renderYTRow(item, modalIdx) {
  const score      = item.llm_score != null ? item.llm_score.toFixed(1) : '—';
  const scoreColor = item.llm_score >= 7 ? 'var(--green)' : item.llm_score >= 4 ? 'var(--gold)' : 'var(--muted)';
  const date       = (item.published_at || '').slice(0, 10);
  const summary    = item.llm_summary || '';

  let summaryHtml = summary;
  if (_tickerFilter && summary) {
    const re = new RegExp(`(${_tickerFilter})`, 'gi');
    summaryHtml = summary.replace(re, `<mark style="background:rgba(245,165,32,0.25);color:var(--gold);border-radius:2px;padding:0 2px">$1</mark>`);
  }

  return `
    <div onclick="_openGlModal(${modalIdx})"
         style="padding:14px 16px;border-bottom:1px solid #141414;cursor:pointer;
                display:flex;gap:14px;align-items:flex-start;transition:background 0.1s"
         onmouseover="this.style.background='rgba(255,255,255,0.02)'"
         onmouseout="this.style.background='none'">
      <div style="display:flex;flex-direction:column;align-items:center;gap:6px;min-width:40px">
        <span style="font-family:monospace;font-size:14px;font-weight:700;color:${scoreColor}">${score}</span>
        <span style="font-size:9px;padding:2px 5px;border-radius:2px;
                     background:rgba(0,255,65,0.08);color:var(--green);
                     border:1px solid rgba(0,255,65,0.15);white-space:nowrap;letter-spacing:0.3px">YT</span>
      </div>
      <div style="flex:1;min-width:0">
        <div style="font-size:11px;color:var(--muted);margin-bottom:3px">
          ${item.channel_name} &nbsp;·&nbsp; ${date}
        </div>
        <div style="font-size:13px;font-weight:600;color:var(--text);
                    white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-bottom:4px">
          ${item.title}
        </div>
        ${summaryHtml ? `<div style="font-size:12px;color:var(--muted);line-height:1.5;
          display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">${summaryHtml}</div>` : ''}
      </div>
      <span style="font-size:11px;color:#333;white-space:nowrap;padding-top:2px;align-self:center">read ›</span>
    </div>`;
}

function _renderHCRow(item) {
  const date = (item.posted_at || '').slice(0, 10);
  const stats = [
    item.reply_count ? `${item.reply_count} replies` : null,
    item.like_count  ? `${item.like_count} likes`   : null,
    item.view_count && item.view_count !== '0' ? `${item.view_count} views` : null,
  ].filter(Boolean).join(' &nbsp;·&nbsp; ');

  let titleHtml = item.title;
  if (_tickerFilter) {
    const re = new RegExp(`(${_tickerFilter})`, 'gi');
    titleHtml = titleHtml.replace(re, `<mark style="background:rgba(245,165,32,0.25);color:var(--gold);border-radius:2px;padding:0 2px">$1</mark>`);
  }

  return `
    <a href="${item.url}" target="_blank" style="text-decoration:none;color:inherit">
      <div style="padding:14px 16px;border-bottom:1px solid #141414;
                  display:flex;gap:14px;align-items:flex-start;transition:background 0.1s"
           onmouseover="this.style.background='rgba(255,255,255,0.02)'"
           onmouseout="this.style.background='none'">
        <div style="display:flex;flex-direction:column;align-items:center;gap:6px;min-width:40px">
          <span style="font-family:monospace;font-size:11px;font-weight:700;color:var(--gold)">${item.ticker}</span>
          <span style="font-size:9px;padding:2px 5px;border-radius:2px;
                       background:rgba(245,165,32,0.08);color:var(--gold);
                       border:1px solid rgba(245,165,32,0.2);white-space:nowrap;letter-spacing:0.3px">HC</span>
        </div>
        <div style="flex:1;min-width:0">
          <div style="font-size:11px;color:var(--muted);margin-bottom:3px">
            ${item.author} &nbsp;·&nbsp; ${date}
          </div>
          <div style="font-size:13px;font-weight:600;color:var(--text);
                      white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-bottom:4px">
            ${titleHtml}
          </div>
          ${stats ? `<div style="font-size:11px;color:#555">${stats}</div>` : ''}
        </div>
        <span style="font-size:11px;color:#333;white-space:nowrap;padding-top:2px;align-self:center">open ›</span>
      </div>
    </a>`;
}

function _buildComingSoonPlaceholders() {
  const placeholders = [
    { key: 'twitter',      label: 'Twitter / X',       desc: 'High-signal finance accounts — @KitcoNews, @ZeroHedge, @MacroAlf and more' },
    { key: 'news',         label: 'News',               desc: 'Reuters, BBC, Al Jazeera, MarketWatch RSS feeds — geopolitical + macro events' },
    { key: 'broker',       label: 'Broker Reports',     desc: 'Research notes from Macquarie, Bell Potter, Ord Minnett on gold sector' },
    { key: 'asx_announce', label: 'ASX Announcements',  desc: 'Real-time company announcements filtered for gold & resources tickers' },
  ];

  const cards = placeholders.map(p => `
    <div style="background:var(--card);border:1px solid #1a1a1a;border-radius:4px;padding:16px 20px;
                display:flex;align-items:flex-start;gap:14px">
      <div style="width:40px;height:40px;border-radius:4px;background:#111;border:1px solid #222;
                  display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0">⋯</div>
      <div>
        <div style="font-size:13px;font-weight:700;color:#444;margin-bottom:4px">${p.label}</div>
        <div style="font-size:12px;color:#333;line-height:1.5">${p.desc}</div>
        <div style="margin-top:8px;display:inline-block;font-size:10px;padding:2px 8px;border-radius:2px;
                    background:#111;border:1px solid #222;color:#444;letter-spacing:0.5px">COMING SOON</div>
      </div>
    </div>`).join('');

  return `
    <div style="margin-bottom:20px">
      <div style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:0.8px;margin-bottom:10px">
        YouTube feed is live above. More sources coming soon:
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">${cards}</div>
    </div>`;
}

function _appendBrokenSection(broken) {
  const feed = document.getElementById('chatter-feed');
  if (!feed || !broken.length) return;
  const brokenHtml = broken.map(b => {
    const date = (b.published_at || '').slice(0, 10);
    return `
      <div style="padding:10px 0;border-bottom:1px solid #141414;display:flex;gap:10px;align-items:flex-start">
        <span style="font-family:monospace;font-size:13px;font-weight:700;color:#444;min-width:32px;padding-top:1px">—</span>
        <div style="flex:1;min-width:0">
          <div style="font-size:11px;color:var(--muted);margin-bottom:3px">${b.channel_name} &nbsp;·&nbsp; ${date}</div>
          <a href="${b.url}" target="_blank"
             style="color:var(--text);text-decoration:none;font-size:13px;font-weight:600;display:block;
                    white-space:nowrap;overflow:hidden;text-overflow:ellipsis"
             onmouseover="this.style.color='var(--gold)'" onmouseout="this.style.color='var(--text)'">${b.title}</a>
          <div style="font-size:11px;color:#664400;margin-top:3px">⚠ No transcript available — captions missing or broken</div>
        </div>
      </div>`;
  }).join('');

  const section = document.createElement('div');
  section.style.cssText = 'margin-top:8px';
  section.innerHTML = `
    <div class="chart-card">
      <div style="font-size:10px;color:#555;text-transform:uppercase;letter-spacing:0.8px;margin-bottom:10px">
        Broken Captions (${broken.length})
      </div>
      ${brokenHtml}
    </div>`;
  feed.appendChild(section);
}

// ── Manage section (collapsible) ───────────────────────────────────────────────

function _buildManageSection(interactive) {
  return `
    <div style="margin-top:8px">
      <button onclick="_toggleManageSection()" id="chatter-manage-btn"
        style="display:flex;align-items:center;gap:8px;width:100%;background:none;
               border:1px solid #222;border-radius:3px;padding:10px 16px;cursor:pointer;
               color:var(--muted);font-size:12px;font-weight:600;letter-spacing:0.4px;
               text-transform:uppercase;text-align:left;transition:border-color 0.15s"
        onmouseover="this.style.borderColor='var(--gold)';this.style.color='var(--gold)'"
        onmouseout="this.style.borderColor='#222';this.style.color='var(--muted)'">
        <span id="chatter-manage-arrow" style="font-size:10px;transition:transform 0.2s">▶</span>
        Manage YouTube Sources
      </button>
      <div id="chatter-manage-body" style="display:none;margin-top:12px">
        <div style="display:grid;grid-template-columns:360px 1fr;gap:20px;align-items:start">
          <div id="chatter-channels-panel"></div>
          <div id="chatter-scrape-panel"></div>
        </div>
      </div>
    </div>
  `;
}

function _toggleManageSection() {
  const body  = document.getElementById('chatter-manage-body');
  const arrow = document.getElementById('chatter-manage-arrow');
  const open  = body.style.display === 'none';
  body.style.display  = open ? '' : 'none';
  arrow.style.transform = open ? 'rotate(90deg)' : '';
}

// ── Channel list ───────────────────────────────────────────────────────────────

function _renderChannelList(channels, interactive) {
  const panel = document.getElementById('chatter-channels-panel');
  if (!panel) return;
  const subtitle = interactive
    ? 'Drag to reorder — top = scraped first when quota is limited'
    : 'Read-only on Netlify — run locally to reorder';

  panel.innerHTML = `
    <div class="chart-card">
      <div class="chart-title" style="margin-bottom:4px">Channel Priority</div>
      <div class="chart-subtitle" style="margin-bottom:14px">${subtitle}</div>
      <ul id="chatter-ch-list" style="list-style:none;padding:0;margin:0"></ul>
      ${interactive ? `<p style="margin-top:14px;font-size:11px;color:var(--muted);line-height:1.5">Order is saved automatically on drop. Toggle active/inactive to exclude a channel.</p>` : ''}
    </div>
  `;

  const ul = document.getElementById('chatter-ch-list');
  channels.forEach((ch, i) => ul.appendChild(_makeChannelRow(ch, i + 1, interactive)));

  if (!interactive) return;

  ul.querySelectorAll('.ch-toggle').forEach(cb => {
    cb.addEventListener('change', () => {
      fetch('/api/channels/toggle', {
        method:  'POST',
        headers: {'Content-Type': 'application/json'},
        body:    JSON.stringify({ channel_id: cb.dataset.cid, active: cb.checked }),
      });
      cb.closest('li').style.opacity = cb.checked ? '1' : '0.45';
    });
  });

  if (typeof Sortable !== 'undefined') {
    if (_chatterSortable) _chatterSortable.destroy();
    _chatterSortable = Sortable.create(ul, {
      animation:  150,
      handle:     '.drag-handle',
      ghostClass: 'sortable-ghost',
      onEnd: async () => {
        ul.querySelectorAll('li').forEach((li, i) => {
          const badge = li.querySelector('.ch-priority');
          if (badge) badge.textContent = `#${i + 1}`;
        });
        const order = [...ul.querySelectorAll('li')].map(li => li.dataset.cid);
        await fetch('/api/channels/reorder', {
          method:  'POST',
          headers: {'Content-Type': 'application/json'},
          body:    JSON.stringify({ order }),
        });
      },
    });
  }
}

function _makeChannelRow(ch, priority, interactive) {
  const li = document.createElement('li');
  li.dataset.cid = ch.channel_id;
  li.style.cssText = [
    'display:flex', 'align-items:center', 'gap:10px',
    'padding:10px 12px', 'margin-bottom:6px',
    'background:var(--card2)', 'border:1px solid #1e1e1e',
    'border-radius:4px', `opacity:${ch.active ? '1' : '0.45'}`,
  ].join(';');

  const lastFetched = ch.last_fetched ? toAWST(ch.last_fetched) : 'Never';
  const handle = interactive
    ? `<span class="drag-handle" style="color:var(--muted);font-size:18px;cursor:grab;line-height:1;user-select:none">⠿</span>`
    : `<span style="color:#333;font-size:18px;line-height:1">⠿</span>`;
  const toggle = interactive
    ? `<label style="display:flex;align-items:center;gap:5px;cursor:pointer;font-size:11px;color:var(--muted);white-space:nowrap">
         <input type="checkbox" class="ch-toggle" data-cid="${ch.channel_id}" ${ch.active ? 'checked' : ''}
                style="cursor:pointer;accent-color:var(--gold)"> Active
       </label>`
    : `<span style="font-size:11px;color:var(--muted);white-space:nowrap">${ch.active ? 'Active' : 'Inactive'}</span>`;

  li.innerHTML = `
    ${handle}
    <span class="ch-priority" style="color:var(--gold);font-family:monospace;font-size:11px;min-width:22px">#${priority}</span>
    <div style="flex:1;min-width:0">
      <div style="font-weight:600;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${ch.name}</div>
      <div style="font-size:11px;color:var(--muted);margin-top:2px">
        ${ch.video_count} in DB &nbsp;·&nbsp; last: ${lastFetched}
      </div>
    </div>
    ${toggle}
  `;
  return li;
}

// ── Scrape panel ───────────────────────────────────────────────────────────────

function _renderScrapePanel(interactive) {
  const panel = document.getElementById('chatter-scrape-panel');
  if (!panel) return;

  if (!interactive) {
    panel.innerHTML = `
      <div class="chart-card">
        <div class="chart-title" style="margin-bottom:4px">Manual Scrape</div>
        <div class="chart-subtitle" style="margin-bottom:16px">
          Scraping requires the bot running on your machine. Paste the command below into a terminal, or ask Claude to run it.
        </div>
        <div style="background:#0d0d0d;border:1px solid #2a2a2a;border-radius:4px;padding:14px 16px;font-family:monospace;font-size:12px;color:var(--gold);line-height:1.8">
          cd gold_geo_trader<br>
          source .venv/bin/activate<br>
          python scripts/fetch_transcripts.py --mode quarterly --days 14
        </div>
        <p style="margin-top:14px;font-size:12px;color:var(--muted);line-height:1.6">
          This fetches the last 14 days of videos from all active channels and skips anything already in the database.
          To ask Claude: <em style="color:var(--text)">"please scrape YouTube"</em> and paste your channel order from the list on the left.
        </p>
      </div>
    `;
    return;
  }

  panel.innerHTML = `
    <div class="chart-card" style="margin-bottom:16px">
      <div class="chart-title" style="margin-bottom:4px">Manual Scrape</div>
      <div class="chart-subtitle" style="margin-bottom:16px">
        Scans the last 14 days of videos from all active channels. Skips videos already in the database.
      </div>
      <button id="chatter-scrape-btn" onclick="triggerScrape()"
        style="padding:10px 28px;background:var(--gold);color:#000;border:none;border-radius:3px;
               font-weight:800;font-size:13px;letter-spacing:0.6px;cursor:pointer;text-transform:uppercase">
        Scrape Now
      </button>
      <div id="chatter-progress" style="display:none;margin-top:18px">
        <div style="display:flex;justify-content:space-between;margin-bottom:6px">
          <span id="chatter-progress-label" style="font-size:12px;color:var(--muted)">Scanning channels…</span>
          <span id="chatter-progress-count" style="font-size:12px;color:var(--muted)"></span>
        </div>
        <div style="height:6px;background:#1e1e1e;border-radius:3px;overflow:hidden">
          <div id="chatter-progress-bar"
               style="height:100%;width:0%;background:var(--gold);border-radius:3px;transition:width 0.3s"></div>
        </div>
      </div>
    </div>
    <div id="chatter-results-card" class="chart-card" style="display:none">
      <div class="chart-title" style="margin-bottom:12px">Results</div>
      <div id="chatter-results-body"></div>
    </div>
  `;
}

// ── Scrape trigger + polling (live mode only) ──────────────────────────────────

async function triggerScrape() {
  const btn      = document.getElementById('chatter-scrape-btn');
  const progress = document.getElementById('chatter-progress');
  const bar      = document.getElementById('chatter-progress-bar');

  btn.disabled    = true;
  btn.textContent = 'Running…';
  btn.style.opacity = '0.5';
  progress.style.display = '';
  bar.style.background = 'var(--gold)';

  try {
    const resp = await fetch('/api/scrape', { method: 'POST' });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      alert(err.error || 'Failed to start scrape');
      _resetScrapeBtn();
      return;
    }
    const { job_id } = await resp.json();
    _scrapeJobId  = job_id;
    _scrapePoller = setInterval(() => _pollScrape(job_id), 1500);
  } catch (_e) {
    alert('Could not reach the local server.');
    _resetScrapeBtn();
  }
}

async function _pollScrape(job_id) {
  try {
    const resp = await fetch(`/api/scrape/status/${job_id}`);
    const job  = await resp.json();

    const label = document.getElementById('chatter-progress-label');
    const count = document.getElementById('chatter-progress-count');
    const bar   = document.getElementById('chatter-progress-bar');

    if (job.total === 0 && job.status === 'running') {
      label.textContent = 'Scanning RSS feeds…';
      count.textContent = '';
      bar.style.width   = '5%';
    } else {
      const pct = job.total > 0 ? Math.round((job.done / job.total) * 100) : 0;
      label.textContent = job.status === 'done' ? 'Complete' : 'Fetching transcripts…';
      count.textContent = `${job.done} / ${job.total}`;
      bar.style.width   = `${pct}%`;
    }

    if (job.results && job.results.length) _renderResults(job.results);

    if (job.status === 'done' || job.status === 'error') {
      clearInterval(_scrapePoller);
      _scrapePoller = null;
      _resetScrapeBtn();
      if (job.status === 'error') {
        label.textContent    = `Error: ${job.error}`;
        bar.style.background = 'var(--red)';
      } else {
        bar.style.background = 'var(--green)';
        const chResp = await fetch('/api/channels');
        if (chResp.ok) _renderChannelList(await chResp.json(), true);
      }
    }
  } catch (_e) {}
}

function _renderResults(results) {
  const card = document.getElementById('chatter-results-card');
  const body = document.getElementById('chatter-results-body');
  card.style.display = '';

  if (!results.length) {
    body.innerHTML = '<div style="color:var(--muted);font-size:13px;padding:8px 0">No new videos found in the last 14 days.</div>';
    return;
  }

  const rows = results.map(r => {
    const impactColor = r.impact >= 6 ? 'var(--green)' : r.impact >= 3 ? 'var(--gold)' : 'var(--muted)';
    const badge = r.had_transcript
      ? `<span style="font-size:10px;padding:2px 6px;border-radius:2px;background:rgba(0,255,65,0.1);color:var(--green);border:1px solid rgba(0,255,65,0.2)">TRANSCRIPT</span>`
      : `<span style="font-size:10px;padding:2px 6px;border-radius:2px;background:rgba(100,100,100,0.1);color:var(--muted);border:1px solid #333">TITLE ONLY</span>`;
    return `
      <div style="padding:10px 0;border-bottom:1px solid #141414;display:flex;gap:12px;align-items:flex-start">
        <span style="font-size:13px;font-weight:700;color:${impactColor};font-family:monospace;min-width:36px;padding-top:1px">${r.impact.toFixed(1)}</span>
        <div style="flex:1;min-width:0">
          <a href="${r.url}" target="_blank"
             style="color:var(--text);text-decoration:none;font-size:13px;font-weight:600;display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis"
             onmouseover="this.style.color='var(--gold)'" onmouseout="this.style.color='var(--text)'">${r.title}</a>
          <div style="font-size:11px;color:var(--muted);margin-top:3px;display:flex;gap:8px;flex-wrap:wrap;align-items:center">
            <span>${r.channel}</span><span>·</span>
            <span>${toAWST(r.published_at)}</span><span>·</span>${badge}
          </div>
        </div>
      </div>`;
  }).join('');

  body.innerHTML = `
    <div style="font-size:12px;color:var(--muted);margin-bottom:12px">${results.length} new video${results.length !== 1 ? 's' : ''} added</div>
    ${rows}`;
}

function _resetScrapeBtn() {
  const btn = document.getElementById('chatter-scrape-btn');
  if (!btn) return;
  btn.disabled    = false;
  btn.textContent = 'Scrape Now';
  btn.style.opacity = '1';
}

// ── Transcript modal ───────────────────────────────────────────────────────────

function _openGlModal(idx) {
  const item = window._glFiltered ? window._glFiltered[idx] : _glossaryItems[idx];
  if (!item) return;

  const score      = item.llm_score != null ? item.llm_score.toFixed(1) : '—';
  const scoreColor = item.llm_score >= 7 ? 'var(--green)' : item.llm_score >= 4 ? 'var(--gold)' : 'var(--muted)';
  const date       = (item.published_at || '').slice(0, 10);
  const summary    = item.llm_summary || '';
  const transcript = item.transcript_text || '';

  const txFormatted = transcript
    ? transcript.split(/\s{2,}|\n/).filter(Boolean).map(p =>
        `<p style="margin:0 0 12px;line-height:1.7;font-size:13px;color:#bbb">${p.trim()}</p>`
      ).join('')
    : '<p style="color:var(--muted);font-size:13px">Full transcript not available.</p>';

  document.getElementById('gl-modal-body').innerHTML = `
    <div style="margin-bottom:4px;font-size:11px;color:var(--muted)">${item.channel_name} &nbsp;·&nbsp; ${date}</div>
    <div style="font-size:17px;font-weight:700;margin-bottom:14px;line-height:1.4">${item.title}</div>
    <div style="display:flex;gap:16px;margin-bottom:18px;flex-wrap:wrap">
      <div style="background:#0d0d0d;border:1px solid #2a2a2a;border-radius:4px;padding:10px 16px;text-align:center;min-width:70px">
        <div style="font-size:22px;font-weight:800;font-family:monospace;color:${scoreColor}">${score}</div>
        <div style="font-size:10px;color:var(--muted);margin-top:2px">Gold Score</div>
      </div>
      <a href="${item.url}" target="_blank"
         style="display:flex;align-items:center;gap:6px;padding:10px 16px;background:#0d0d0d;
                border:1px solid #2a2a2a;border-radius:4px;color:var(--gold);text-decoration:none;
                font-size:12px;font-weight:600"
         onmouseover="this.style.borderColor='var(--gold)'" onmouseout="this.style.borderColor='#2a2a2a'">
        ▶ Watch on YouTube
      </a>
    </div>
    ${summary ? `
    <div style="background:#0d0d0d;border-left:3px solid var(--gold);padding:12px 16px;margin-bottom:20px;border-radius:0 4px 4px 0">
      <div style="font-size:10px;color:var(--muted);margin-bottom:6px;text-transform:uppercase;letter-spacing:0.8px">Claude's Summary</div>
      <div style="font-size:13px;line-height:1.6;color:var(--text)">${summary}</div>
    </div>` : ''}
    <div style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:0.8px;margin-bottom:12px">Full Transcript</div>
    <div style="max-height:420px;overflow-y:auto;padding-right:8px">${txFormatted}</div>
  `;

  document.getElementById('gl-modal').style.display = '';
  document.body.style.overflow = 'hidden';
}

function _closeGlModal() {
  document.getElementById('gl-modal').style.display = 'none';
  document.body.style.overflow = '';
}
