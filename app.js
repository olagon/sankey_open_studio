/* Sankey Open Studio — a free, open source sankey diagram builder.
   Pure HTML/CSS/JS. Everything runs and stays in your browser.
   MIT licensed. */

'use strict';

/* =========================================================
   Constants
   ========================================================= */

const PALETTE = [
  '#2a78d6', // blue
  '#eb6834', // orange
  '#1baf7a', // aqua green
  '#eda100', // yellow
  '#e87ba4', // magenta
  '#008300', // green
  '#4a3aa7', // violet
  '#e34948', // red
];

const NEUTRAL_NODE = '#55534f';
const NEUTRAL_LINK = '#c9c8c1';
const TITLE_COLOR = '#1c5cab';
const INK = '#0b0b0b';
const INK_2 = '#52514e';
const MUTED = '#898781';

const INDEX_KEY = 'sos.index.v1';
const DOC_PREFIX = 'sos.doc.v1.';
const LAST_KEY = 'sos.lastOpen.v1';

function rememberOpen(id) {
  try { localStorage.setItem(LAST_KEY, id); } catch (e) { /* non-fatal */ }
}

const DEFAULT_SETTINGS = {
  width: 960,
  height: 600,
  nodeWidth: 14,
  nodePadding: 24,
  linkOpacity: 0.45,
  linkColorMode: 'neutral', // neutral | source | target
  defaultNodeColor: NEUTRAL_NODE,
  fontSize: 13,
  labelPosition: 'outside', // outside | inside
  decimals: 'auto',         // auto | 0 | 1 | 2
  prefix: '',
  suffix: '',
  showValues: true,
  showCredit: true,
};

const CREDIT_TEXT = 'Created with https://olagon.github.io/sankey_open_studio/';

/* =========================================================
   Storage (localStorage)
   ========================================================= */

function newId() {
  return 'd' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function loadIndex() {
  try {
    return JSON.parse(localStorage.getItem(INDEX_KEY)) || [];
  } catch (e) {
    return [];
  }
}

function saveIndex(index) {
  localStorage.setItem(INDEX_KEY, JSON.stringify(index));
}

function loadDoc(id) {
  try {
    const doc = JSON.parse(localStorage.getItem(DOC_PREFIX + id));
    if (!doc) return null;
    doc.settings = Object.assign({}, DEFAULT_SETTINGS, doc.settings);
    doc.nodes = doc.nodes || {};
    doc.links = doc.links || [];
    return doc;
  } catch (e) {
    return null;
  }
}

function persistDoc(doc) {
  try {
    doc.updatedAt = Date.now();
    localStorage.setItem(DOC_PREFIX + doc.id, JSON.stringify(doc));
    const index = loadIndex();
    const entry = index.find((d) => d.id === doc.id);
    if (entry) {
      entry.name = doc.name;
      entry.updatedAt = doc.updatedAt;
    } else {
      index.push({ id: doc.id, name: doc.name, updatedAt: doc.updatedAt });
    }
    saveIndex(index);
  } catch (e) {
    alert('Could not save. Your browser storage may be full. Download a JSON backup, then delete old diagrams.');
  }
}

function removeDoc(id) {
  localStorage.removeItem(DOC_PREFIX + id);
  saveIndex(loadIndex().filter((d) => d.id !== id));
}

/* =========================================================
   State
   ========================================================= */

let doc = null;          // current diagram document
let layoutCache = null;  // last computed layout
let saveTimer = null;
let popoverNode = null;  // node name currently edited in the popover

function markDirty(rerenderTable) {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => persistDoc(doc), 400);
  render();
  if (rerenderTable) renderTable();
}

/* =========================================================
   Sample diagram (first run)
   ========================================================= */

function sampleDoc() {
  const d = {
    id: newId(),
    name: 'Island Coffee Co — FY25 Income',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    links: [
      { from: 'Retail Sales', to: 'Revenue', amount: 4200 },
      { from: 'Wholesale', to: 'Revenue', amount: 1800 },
      { from: 'Online Orders', to: 'Revenue', amount: 950 },
      { from: 'Revenue', to: 'Cost of Goods', amount: 2600 },
      { from: 'Revenue', to: 'Payroll', amount: 1900 },
      { from: 'Revenue', to: 'Rent & Utilities', amount: 600 },
      { from: 'Revenue', to: 'Marketing', amount: 350 },
      { from: 'Revenue', to: 'Taxes', amount: 300 },
      { from: 'Revenue', to: 'Net Profit', amount: 1200 },
    ],
    nodes: {
      'Net Profit': { color: '#008300' },
      'Revenue': { color: '#2a78d6' },
    },
    settings: Object.assign({}, DEFAULT_SETTINGS, { prefix: '$', suffix: 'K' }),
  };
  return d;
}

function blankDoc() {
  return {
    id: newId(),
    name: '',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    links: [],
    nodes: {},
    settings: Object.assign({}, DEFAULT_SETTINGS),
  };
}

/* =========================================================
   Data parsing (paste from spreadsheet / CSV)
   ========================================================= */

function detectDelimiter(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim()).slice(0, 10);
  const score = { '\t': 0, ',': 0, ';': 0 };
  for (const line of lines) {
    if (line.includes('\t')) score['\t']++;
    if (line.includes(',')) score[',']++;
    if (line.includes(';')) score[';']++;
  }
  if (score['\t'] >= score[','] && score['\t'] >= score[';'] && score['\t'] > 0) return '\t';
  if (score[';'] > score[',']) return ';';
  return ',';
}

// Minimal CSV line splitter that honors double quotes.
function splitLine(line, delim) {
  const out = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; }
        else inQuotes = false;
      } else cur += ch;
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === delim) {
      out.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

function parseAmount(s) {
  if (typeof s !== 'string') return NaN;
  const cleaned = s.replace(/[$€£¥,%\s]/g, '').replace(/[()]/g, '');
  const v = parseFloat(cleaned);
  return Number.isFinite(v) ? v : NaN;
}

function parsePasted(text) {
  const delim = detectDelimiter(text);
  const lines = text.split(/\r?\n/).map((l) => l.replace(/ /g, ' ')).filter((l) => l.trim());
  const links = [];
  let skipped = 0;
  lines.forEach((line, i) => {
    const cells = splitLine(line, delim);
    if (cells.length < 3) { skipped++; return; }
    const from = cells[0];
    const to = cells[1];
    const amount = parseAmount(cells[2]);
    if (!from || !to || !Number.isFinite(amount)) {
      // A non-numeric third cell on an early row is almost surely a header.
      if (i > 1) skipped++;
      return;
    }
    links.push({ from, to, amount });
  });
  return { links, skipped };
}

/* =========================================================
   Sankey layout (hand rolled, no dependencies)
   ========================================================= */

function estTextWidth(str, fontSize) {
  return String(str || '').length * fontSize * 0.62;
}

// Greedy word wrap to at most 3 lines, based on the estimated width.
function wrapText(str, fontSize, maxW) {
  const words = String(str).split(/\s+/).filter(Boolean);
  if (!words.length) return [''];
  const lines = [];
  let cur = words[0];
  for (let i = 1; i < words.length; i++) {
    const test = cur + ' ' + words[i];
    if (estTextWidth(test, fontSize) > maxW && lines.length < 2) {
      lines.push(cur);
      cur = words[i];
    } else {
      cur = test;
    }
  }
  lines.push(cur);
  return lines;
}

function computeLayout(d) {
  const s = d.settings;
  const links = d.links.filter(
    (l) => l.from && l.to && Number.isFinite(l.amount) && l.amount > 0 && l.from !== l.to
  );
  if (!links.length) return null;

  // ---- Collect nodes in order of first appearance ----
  const order = new Map();
  for (const l of links) {
    if (!order.has(l.from)) order.set(l.from, order.size);
    if (!order.has(l.to)) order.set(l.to, order.size);
  }
  const names = [...order.keys()];
  const nodeMap = new Map();
  names.forEach((name) => {
    nodeMap.set(name, {
      name,
      sourceLinks: [],
      targetLinks: [],
      valueOut: 0,
      valueIn: 0,
      order: order.get(name),
    });
  });

  const layoutLinks = links.map((l) => {
    const link = {
      source: nodeMap.get(l.from),
      target: nodeMap.get(l.to),
      value: l.amount,
    };
    link.source.sourceLinks.push(link);
    link.target.targetLinks.push(link);
    link.source.valueOut += l.amount;
    link.target.valueIn += l.amount;
    return link;
  });

  const nodes = [...nodeMap.values()];
  nodes.forEach((n) => { n.value = Math.max(n.valueIn, n.valueOut); });

  // ---- Depth via Kahn's algorithm (cycle tolerant) ----
  const inDegree = new Map(nodes.map((n) => [n, n.targetLinks.length]));
  let queue = nodes.filter((n) => inDegree.get(n) === 0);
  nodes.forEach((n) => { n.depth = 0; });
  let processed = 0;
  while (queue.length) {
    const next = [];
    for (const n of queue) {
      processed++;
      for (const l of n.sourceLinks) {
        l.target.depth = Math.max(l.target.depth, n.depth + 1);
        inDegree.set(l.target, inDegree.get(l.target) - 1);
        if (inDegree.get(l.target) === 0) next.push(l.target);
      }
    }
    queue = next;
  }
  const hasCycle = processed < nodes.length;
  if (hasCycle) {
    // Nodes stuck in cycles keep depth 0-or-current; nudge them after their
    // processed predecessors so the diagram still draws.
    nodes.forEach((n) => {
      if (inDegree.get(n) > 0) {
        let best = 0;
        for (const l of n.targetLinks) best = Math.max(best, l.source.depth + 1);
        n.depth = best;
      }
    });
  }

  let maxDepth = 0;
  nodes.forEach((n) => { maxDepth = Math.max(maxDepth, n.depth); });
  // Justify: pure sinks sit in the last column.
  nodes.forEach((n) => {
    if (!n.sourceLinks.length) n.depth = maxDepth;
  });

  // ---- Margins ----
  const fs = s.fontSize;
  let maxLabelW = 40;
  nodes.forEach((n) => {
    const o = d.nodes[n.name] || {};
    const lines = [o.label || n.name, o.line2 || 'X', o.line3 || ''];
    lines.forEach((t) => { maxLabelW = Math.max(maxLabelW, estTextWidth(t, fs)); });
  });
  maxLabelW = Math.min(maxLabelW + 14, s.width * 0.3);
  const outside = s.labelPosition === 'outside';
  const marginL = outside ? maxLabelW : 16;
  const marginR = outside ? maxLabelW : 16;
  const marginT = (d.name ? fs * 2.2 + 34 : 0) + 22;
  const marginB = s.showCredit ? 38 : 26;

  const innerW = Math.max(80, s.width - marginL - marginR);
  const innerH = Math.max(80, s.height - marginT - marginB);

  // ---- Horizontal positions ----
  const colX = (depth) =>
    marginL + (maxDepth === 0 ? innerW / 2 : (depth / maxDepth) * (innerW - s.nodeWidth));
  nodes.forEach((n) => {
    n.x0 = colX(n.depth);
    n.x1 = n.x0 + s.nodeWidth;
  });

  // ---- Vertical scale ----
  const columns = [];
  for (let i = 0; i <= maxDepth; i++) columns.push([]);
  nodes.forEach((n) => columns[n.depth].push(n));
  columns.forEach((col) => col.sort((a, b) => a.order - b.order));

  const maxCount = Math.max(...columns.map((c) => c.length));
  const pad = Math.min(s.nodePadding, maxCount > 1 ? (innerH * 0.6) / (maxCount - 1) : s.nodePadding);

  let k = Infinity;
  columns.forEach((col) => {
    const sum = col.reduce((acc, n) => acc + n.value, 0);
    if (sum > 0) k = Math.min(k, (innerH - (col.length - 1) * pad) / sum);
  });
  if (!Number.isFinite(k) || k <= 0) return null;

  // ---- Initial stacking (input order), centered ----
  columns.forEach((col) => {
    const totalH = col.reduce((acc, n) => acc + n.value * k, 0) + (col.length - 1) * pad;
    let y = marginT + (innerH - totalH) / 2;
    col.forEach((n) => {
      n.y0 = y;
      n.y1 = y + Math.max(1, n.value * k);
      y = n.y1 + pad;
    });
  });

  // ---- Relaxation to reduce crossings ----
  const center = (n) => (n.y0 + n.y1) / 2;

  function relaxLeft(alpha) {
    columns.forEach((col) => {
      col.forEach((n) => {
        if (!n.targetLinks.length) return;
        let num = 0;
        let den = 0;
        n.targetLinks.forEach((l) => { num += center(l.source) * l.value; den += l.value; });
        const dy = (num / den - center(n)) * alpha;
        n.y0 += dy;
        n.y1 += dy;
      });
    });
  }

  function relaxRight(alpha) {
    for (let i = columns.length - 1; i >= 0; i--) {
      columns[i].forEach((n) => {
        if (!n.sourceLinks.length) return;
        let num = 0;
        let den = 0;
        n.sourceLinks.forEach((l) => { num += center(l.target) * l.value; den += l.value; });
        const dy = (num / den - center(n)) * alpha;
        n.y0 += dy;
        n.y1 += dy;
      });
    }
  }

  function resolveCollisions() {
    columns.forEach((col) => {
      col.sort((a, b) => a.y0 - b.y0);
      let y = marginT;
      // Push down.
      col.forEach((n) => {
        const dy = y - n.y0;
        if (dy > 0) { n.y0 += dy; n.y1 += dy; }
        y = n.y1 + pad;
      });
      // Push back up if we overflowed the bottom.
      let overflow = y - pad - (marginT + innerH);
      if (overflow > 0) {
        y = marginT + innerH;
        for (let i = col.length - 1; i >= 0; i--) {
          const n = col[i];
          const dy = n.y1 - y;
          if (dy > 0) { n.y0 -= dy; n.y1 -= dy; }
          y = n.y0 - pad;
        }
      }
    });
  }

  let alpha = 0.9;
  for (let i = 0; i < 8; i++) {
    relaxRight(alpha);
    resolveCollisions();
    relaxLeft(alpha);
    resolveCollisions();
    alpha *= 0.8;
  }

  // ---- Apply manual drag offsets ----
  nodes.forEach((n) => {
    const o = d.nodes[n.name];
    if (o && (o.dx || o.dy)) {
      n.x0 += o.dx || 0;
      n.x1 += o.dx || 0;
      n.y0 += o.dy || 0;
      n.y1 += o.dy || 0;
    }
  });

  // ---- Link vertical offsets at each node ----
  nodes.forEach((n) => {
    n.sourceLinks.sort((a, b) => center(a.target) - center(b.target));
    n.targetLinks.sort((a, b) => center(a.source) - center(b.source));
    let sy = n.y0;
    n.sourceLinks.forEach((l) => {
      l.width = Math.max(1, l.value * k);
      l.sy = sy + l.width / 2;
      sy += l.width;
    });
    let ty = n.y0;
    n.targetLinks.forEach((l) => {
      l.width = Math.max(1, l.value * k);
      l.ty = ty + l.width / 2;
      ty += l.width;
    });
  });

  return { nodes, links: layoutLinks, k, maxDepth, hasCycle, marginT, marginL, innerH, innerW, maxLabelW };
}

/* =========================================================
   Number formatting
   ========================================================= */

function formatAmount(v, s) {
  let dec;
  if (s.decimals === 'auto') dec = Number.isInteger(v) ? 0 : 1;
  else dec = parseInt(s.decimals, 10);
  const num = v.toLocaleString('en-US', {
    minimumFractionDigits: dec,
    maximumFractionDigits: dec,
  });
  return (s.prefix || '') + num + (s.suffix || '');
}

/* =========================================================
   Rendering
   ========================================================= */

const svg = document.getElementById('chart');
const SVG_NS = 'http://www.w3.org/2000/svg';

function el(name, attrs, parent) {
  const node = document.createElementNS(SVG_NS, name);
  for (const key in attrs) node.setAttribute(key, attrs[key]);
  if (parent) parent.appendChild(node);
  return node;
}

function nodeColor(n) {
  const o = doc.nodes[n.name];
  return (o && o.color) || doc.settings.defaultNodeColor;
}

function linkColor(l) {
  const mode = doc.settings.linkColorMode;
  if (mode === 'source') return nodeColor(l.source);
  if (mode === 'target') return nodeColor(l.target);
  return NEUTRAL_LINK;
}

function linkPath(l) {
  const x0 = l.source.x1;
  const x1 = l.target.x0;
  const midX = (x0 + x1) / 2;
  return `M${x0},${l.sy}C${midX},${l.sy} ${midX},${l.ty} ${x1},${l.ty}`;
}

function render() {
  const s = doc.settings;
  svg.setAttribute('viewBox', `0 0 ${s.width} ${s.height}`);
  svg.setAttribute('width', s.width);
  svg.setAttribute('font-family', 'system-ui, -apple-system, "Segoe UI", sans-serif');
  svg.innerHTML = '';

  el('rect', { x: 0, y: 0, width: s.width, height: s.height, fill: '#fcfcfb' }, svg);

  layoutCache = computeLayout(doc);
  document.getElementById('emptyHint').hidden = !!layoutCache;

  // Title
  if (doc.name) {
    el('text', {
      x: s.width / 2,
      y: s.fontSize * 1.4 + 26,
      'text-anchor': 'middle',
      'font-size': Math.round(s.fontSize * 2),
      'font-weight': 700,
      fill: TITLE_COLOR,
    }, svg).textContent = doc.name;
  }

  // Credit line inside the image (appears in exports, can be turned off).
  if (s.showCredit) {
    el('text', {
      x: s.width / 2,
      y: s.height - 12,
      'text-anchor': 'middle',
      'font-size': 11,
      fill: MUTED,
    }, svg).textContent = CREDIT_TEXT;
  }

  if (!layoutCache) return;
  const { nodes, links } = layoutCache;

  // ---- Links ----
  const gLinks = el('g', {}, svg);
  links.forEach((l) => {
    const path = el('path', {
      class: 'link',
      d: linkPath(l),
      stroke: linkColor(l),
      'stroke-width': l.width,
      'stroke-opacity': s.linkOpacity,
      fill: 'none',
    }, gLinks);
    path.addEventListener('mousemove', (e) => {
      showTooltip(e, `${displayLabel(l.source)} → ${displayLabel(l.target)}<br><strong>${formatAmount(l.value, s)}</strong>`);
    });
    path.addEventListener('mouseleave', hideTooltip);
    path.addEventListener('mouseenter', () => highlight((x) => x === l));
    path.addEventListener('mouseout', unhighlight);
  });

  // ---- Nodes ----
  const gNodes = el('g', {}, svg);
  nodes.forEach((n) => {
    const rect = el('rect', {
      class: 'node-rect',
      x: n.x0,
      y: n.y0,
      width: n.x1 - n.x0,
      height: Math.max(1, n.y1 - n.y0),
      fill: nodeColor(n),
      rx: 1,
    }, gNodes);
    rect.dataset.node = n.name;
    rect.addEventListener('mouseenter', () => highlight((l) => l.source === n || l.target === n));
    rect.addEventListener('mouseleave', unhighlight);
    rect.addEventListener('mousemove', (e) => {
      showTooltip(e, `<strong>${displayLabel(n)}</strong><br>${formatAmount(n.value, s)}`);
    });
    rect.addEventListener('mouseout', hideTooltip);
  });

  // ---- Labels ----
  const gLabels = el('g', {}, svg);
  const lastDepth = layoutCache.maxDepth;
  const maxLabelW = layoutCache.maxLabelW;
  const lineH = s.fontSize * 1.35;

  // Build one label block per node.
  const blocks = nodes.map((n) => {
    const o = doc.nodes[n.name] || {};
    const label = o.label || n.name;
    const line2 = o.line2 || (s.showValues ? formatAmount(n.value, s) : '');
    const line3 = o.line3 || '';

    const lines = wrapText(label, s.fontSize, maxLabelW - 16).map((t) => ({ t, kind: 'name' }));
    if (line2) lines.push({ t: line2, kind: 'value' });
    if (line3) lines.push({ t: line3, kind: 'note' });

    let x;
    let anchor;
    const onRight = n.depth === lastDepth;
    if (s.labelPosition === 'outside') {
      x = onRight ? n.x1 + 8 : n.x0 - 8;
      anchor = onRight ? 'start' : 'end';
    } else {
      x = onRight ? n.x0 - 8 : n.x1 + 8;
      anchor = onRight ? 'end' : 'start';
    }

    const height = lines.length * lineH;
    return {
      node: n,
      lines,
      x,
      anchor,
      cy: (n.y0 + n.y1) / 2,
      height,
      group: n.depth + ':' + anchor,
    };
  });

  // Nudge overlapping label blocks apart within each column/side group.
  const groups = new Map();
  blocks.forEach((b) => {
    if (!groups.has(b.group)) groups.set(b.group, []);
    groups.get(b.group).push(b);
  });
  const gap = 4;
  groups.forEach((list) => {
    list.sort((a, b) => a.cy - b.cy);
    // Push down.
    let y = 6;
    list.forEach((b) => {
      const top = b.cy - b.height / 2;
      if (top < y) b.cy += y - top;
      y = b.cy + b.height / 2 + gap;
    });
    // Push back up if we ran past the bottom.
    let bottom = s.height - 6;
    for (let i = list.length - 1; i >= 0; i--) {
      const b = list[i];
      const bot = b.cy + b.height / 2;
      if (bot > bottom) b.cy -= bot - bottom;
      bottom = b.cy - b.height / 2 - gap;
    }
  });

  blocks.forEach((b) => {
    const y = b.cy - b.height / 2 + s.fontSize;
    const text = el('text', {
      x: b.x,
      y,
      'text-anchor': b.anchor,
      'font-size': s.fontSize,
      fill: INK,
    }, gLabels);
    b.lines.forEach((line, i) => {
      const tspan = el('tspan', { x: b.x, dy: i === 0 ? 0 : lineH }, text);
      if (line.kind === 'name') tspan.setAttribute('font-weight', 700);
      else if (line.kind === 'value') tspan.setAttribute('fill', INK_2);
      else {
        tspan.setAttribute('fill', MUTED);
        tspan.setAttribute('font-size', Math.max(9, s.fontSize - 2));
      }
      tspan.textContent = line.t;
    });
  });

  bindDrag(gNodes);
}

function displayLabel(n) {
  const o = doc.nodes[n.name];
  return (o && o.label) || n.name;
}

function highlight(match) {
  const s = doc.settings;
  svg.querySelectorAll('.link').forEach((p, i) => {
    const l = layoutCache.links[i];
    p.setAttribute('stroke-opacity', match(l) ? Math.min(1, s.linkOpacity + 0.25) : s.linkOpacity * 0.35);
  });
}

function unhighlight() {
  svg.querySelectorAll('.link').forEach((p) => {
    p.setAttribute('stroke-opacity', doc.settings.linkOpacity);
  });
}

/* ---------- Tooltip ---------- */

const tooltip = document.getElementById('tooltip');

function showTooltip(e, html) {
  tooltip.innerHTML = html;
  tooltip.hidden = false;
  const pad = 14;
  let x = e.clientX + pad;
  let y = e.clientY + pad;
  const r = tooltip.getBoundingClientRect();
  if (x + r.width > window.innerWidth - 8) x = e.clientX - r.width - pad;
  if (y + r.height > window.innerHeight - 8) y = e.clientY - r.height - pad;
  tooltip.style.left = x + 'px';
  tooltip.style.top = y + 'px';
}

function hideTooltip() {
  tooltip.hidden = true;
}

/* =========================================================
   Node dragging + click-to-edit
   ========================================================= */

function svgScale() {
  const rect = svg.getBoundingClientRect();
  return doc.settings.width / rect.width;
}

function bindDrag(gNodes) {
  gNodes.querySelectorAll('.node-rect').forEach((rect) => {
    rect.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      const name = rect.dataset.node;
      const scale = svgScale();
      const startX = e.clientX;
      const startY = e.clientY;
      const o = doc.nodes[name] || (doc.nodes[name] = {});
      const baseDx = o.dx || 0;
      const baseDy = o.dy || 0;
      let moved = false;
      let raf = null;

      function onMove(ev) {
        const dx = (ev.clientX - startX) * scale;
        const dy = (ev.clientY - startY) * scale;
        if (!moved && Math.abs(ev.clientX - startX) + Math.abs(ev.clientY - startY) > 3) moved = true;
        if (!moved) return;
        o.dx = baseDx + dx;
        o.dy = baseDy + dy;
        if (!raf) {
          raf = requestAnimationFrame(() => { raf = null; render(); });
        }
      }

      function onUp(ev) {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        hideTooltip();
        if (moved) {
          if (Math.abs(o.dx) < 2) delete o.dx;
          if (Math.abs(o.dy) < 2) delete o.dy;
          markDirty();
        } else {
          openNodePopover(name, ev.clientX, ev.clientY);
        }
      }

      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    });
  });
}

/* =========================================================
   Node popover
   ========================================================= */

const popover = document.getElementById('nodePopover');
const npLabel = document.getElementById('npLabel');
const npColor = document.getElementById('npColor');
const npLine2 = document.getElementById('npLine2');
const npLine3 = document.getElementById('npLine3');
const npSwatches = document.getElementById('npSwatches');

function buildSwatches() {
  npSwatches.innerHTML = '';
  [NEUTRAL_NODE, ...PALETTE].forEach((color) => {
    const b = document.createElement('button');
    b.className = 'swatch';
    b.style.background = color;
    b.dataset.color = color;
    b.title = color;
    b.addEventListener('click', () => {
      setNodeOverride(popoverNode, 'color', color === NEUTRAL_NODE ? undefined : color);
      npColor.value = color;
      refreshSwatchSelection(color);
    });
    npSwatches.appendChild(b);
  });
}

function refreshSwatchSelection(color) {
  npSwatches.querySelectorAll('.swatch').forEach((b) => {
    b.classList.toggle('selected', b.dataset.color.toLowerCase() === String(color).toLowerCase());
  });
}

function setNodeOverride(name, key, value) {
  if (!name) return;
  const o = doc.nodes[name] || (doc.nodes[name] = {});
  if (value === undefined || value === '') delete o[key];
  else o[key] = value;
  if (!Object.keys(o).length) delete doc.nodes[name];
  markDirty();
}

function openNodePopover(name, clientX, clientY) {
  popoverNode = name;
  const o = doc.nodes[name] || {};
  npLabel.value = o.label || name;
  npColor.value = o.color || doc.settings.defaultNodeColor;
  npLine2.value = o.line2 || '';
  npLine3.value = o.line3 || '';
  const n = layoutCache && layoutCache.nodes.find((x) => x.name === name);
  npLine2.placeholder = n ? formatAmount(n.value, doc.settings) : '';
  refreshSwatchSelection(o.color || NEUTRAL_NODE);

  popover.hidden = false;
  const wrap = document.getElementById('canvasWrap');
  const wrapRect = wrap.getBoundingClientRect();
  let x = clientX - wrapRect.left + wrap.scrollLeft + 12;
  let y = clientY - wrapRect.top + wrap.scrollTop + 12;
  const pw = popover.offsetWidth;
  const ph = popover.offsetHeight;
  if (x + pw > wrap.scrollLeft + wrap.clientWidth - 8) x = Math.max(8, x - pw - 24);
  if (y + ph > wrap.scrollTop + wrap.clientHeight - 8) y = Math.max(8, y - ph - 24);
  popover.style.left = x + 'px';
  popover.style.top = y + 'px';
  npLabel.focus();
}

function closePopover() {
  popover.hidden = true;
  popoverNode = null;
}

npLabel.addEventListener('input', () => {
  setNodeOverride(popoverNode, 'label', npLabel.value === popoverNode ? undefined : npLabel.value);
});
npColor.addEventListener('input', () => {
  setNodeOverride(popoverNode, 'color', npColor.value);
  refreshSwatchSelection(npColor.value);
});
npLine2.addEventListener('input', () => setNodeOverride(popoverNode, 'line2', npLine2.value));
npLine3.addEventListener('input', () => setNodeOverride(popoverNode, 'line3', npLine3.value));

document.getElementById('btnResetNode').addEventListener('click', () => {
  if (popoverNode) {
    delete doc.nodes[popoverNode];
    markDirty();
  }
  closePopover();
});
document.getElementById('btnDonePopover').addEventListener('click', closePopover);
document.getElementById('btnClosePopover').addEventListener('click', closePopover);

/* =========================================================
   Data table
   ========================================================= */

const dataRows = document.getElementById('dataRows');

function renderTable() {
  dataRows.innerHTML = '';
  doc.links.forEach((link, i) => {
    const tr = document.createElement('tr');

    const mkCell = (value, key, isAmount) => {
      const td = document.createElement('td');
      if (isAmount) td.className = 'amount-cell';
      const input = document.createElement('input');
      input.type = 'text';
      input.value = value;
      input.addEventListener('change', () => {
        if (isAmount) link[key] = parseAmount(input.value);
        else link[key] = input.value.trim();
        markDirty();
      });
      td.appendChild(input);
      tr.appendChild(td);
      return td;
    };

    mkCell(link.from, 'from', false);
    mkCell(link.to, 'to', false);
    mkCell(Number.isFinite(link.amount) ? link.amount : '', 'amount', true);

    const tdDel = document.createElement('td');
    tdDel.className = 'del-cell';
    const del = document.createElement('button');
    del.className = 'del-row';
    del.textContent = '×';
    del.title = 'Delete this flow';
    del.addEventListener('click', () => {
      doc.links.splice(i, 1);
      markDirty(true);
    });
    tdDel.appendChild(del);
    tr.appendChild(tdDel);

    dataRows.appendChild(tr);
  });
}

document.getElementById('btnAddRow').addEventListener('click', () => {
  doc.links.push({ from: '', to: '', amount: NaN });
  renderTable();
  const inputs = dataRows.querySelectorAll('input');
  if (inputs.length) inputs[inputs.length - 3].focus();
});

document.getElementById('btnClearData').addEventListener('click', () => {
  if (!doc.links.length || confirm('Remove all flows from this diagram?')) {
    doc.links = [];
    markDirty(true);
  }
});

/* =========================================================
   Paste modal
   ========================================================= */

const pasteModal = document.getElementById('pasteModal');
const pasteBackdrop = document.getElementById('pasteBackdrop');
const pasteArea = document.getElementById('pasteArea');

function openPaste() {
  pasteModal.hidden = false;
  pasteBackdrop.hidden = false;
  pasteArea.value = '';
  pasteArea.focus();
}

function closePaste() {
  pasteModal.hidden = true;
  pasteBackdrop.hidden = true;
}

document.getElementById('btnPaste').addEventListener('click', openPaste);
document.getElementById('btnClosePaste').addEventListener('click', closePaste);
pasteBackdrop.addEventListener('click', closePaste);

document.getElementById('btnDoPaste').addEventListener('click', () => {
  const { links, skipped } = parsePasted(pasteArea.value);
  if (!links.length) {
    alert('No usable rows found. Each row needs three columns: From, To, Amount.');
    return;
  }
  const mode = document.querySelector('input[name="pasteMode"]:checked').value;
  if (mode === 'replace') doc.links = links;
  else doc.links = doc.links.concat(links);
  closePaste();
  markDirty(true);
  if (skipped > 0) {
    console.info(`Sankey Open Studio: skipped ${skipped} row(s) that did not have From, To, Amount.`);
  }
});

/* =========================================================
   Settings bindings
   ========================================================= */

function bindSetting(id, key, opts = {}) {
  const input = document.getElementById(id);
  input.addEventListener(opts.event || 'input', () => {
    let v = input.type === 'checkbox' ? input.checked : input.value;
    if (opts.number) v = parseFloat(v);
    doc.settings[key] = v;
    if (opts.showIn) document.getElementById(opts.showIn).textContent = v;
    markDirty();
  });
  return input;
}

const inFontSize = bindSetting('setFontSize', 'fontSize', { number: true, showIn: 'fontSizeVal' });
const inLabelPos = bindSetting('setLabelPos', 'labelPosition');
const inShowValues = bindSetting('setShowValues', 'showValues');
const inShowCredit = bindSetting('setShowCredit', 'showCredit');
const inDecimals = bindSetting('setDecimals', 'decimals');
const inPrefix = bindSetting('setPrefix', 'prefix');
const inSuffix = bindSetting('setSuffix', 'suffix');
const inNodeWidth = bindSetting('setNodeWidth', 'nodeWidth', { number: true, showIn: 'nodeWidthVal' });
const inNodePad = bindSetting('setNodePad', 'nodePadding', { number: true, showIn: 'nodePadVal' });
const inLinkOpacity = bindSetting('setLinkOpacity', 'linkOpacity', { number: true, showIn: 'linkOpacityVal' });
const inNodeColor = bindSetting('setNodeColor', 'defaultNodeColor');
const inLinkColorMode = bindSetting('setLinkColorMode', 'linkColorMode');

const inSize = document.getElementById('setSize');
inSize.addEventListener('change', () => {
  const [w, h] = inSize.value.split('x').map(Number);
  doc.settings.width = w;
  doc.settings.height = h;
  markDirty();
});

document.getElementById('btnResetLayout').addEventListener('click', () => {
  for (const name in doc.nodes) {
    delete doc.nodes[name].dx;
    delete doc.nodes[name].dy;
    if (!Object.keys(doc.nodes[name]).length) delete doc.nodes[name];
  }
  markDirty();
});

document.getElementById('btnAutoColor').addEventListener('click', () => {
  if (!layoutCache) return;
  const sources = layoutCache.nodes.filter((n) => n.depth === 0).sort((a, b) => a.order - b.order);
  sources.forEach((n, i) => {
    if (i < PALETTE.length) {
      const o = doc.nodes[n.name] || (doc.nodes[n.name] = {});
      o.color = PALETTE[i];
    }
  });
  markDirty();
});

document.getElementById('btnResetColors').addEventListener('click', () => {
  for (const name in doc.nodes) {
    delete doc.nodes[name].color;
    if (!Object.keys(doc.nodes[name]).length) delete doc.nodes[name];
  }
  doc.settings.defaultNodeColor = NEUTRAL_NODE;
  syncSettingsUI();
  markDirty();
});

function syncSettingsUI() {
  const s = doc.settings;
  inFontSize.value = s.fontSize;
  document.getElementById('fontSizeVal').textContent = s.fontSize;
  inLabelPos.value = s.labelPosition;
  inShowValues.checked = !!s.showValues;
  inShowCredit.checked = !!s.showCredit;
  inDecimals.value = String(s.decimals);
  inPrefix.value = s.prefix;
  inSuffix.value = s.suffix;
  inNodeWidth.value = s.nodeWidth;
  document.getElementById('nodeWidthVal').textContent = s.nodeWidth;
  inNodePad.value = s.nodePadding;
  document.getElementById('nodePadVal').textContent = s.nodePadding;
  inLinkOpacity.value = s.linkOpacity;
  document.getElementById('linkOpacityVal').textContent = s.linkOpacity;
  inNodeColor.value = s.defaultNodeColor;
  inLinkColorMode.value = s.linkColorMode;
  inSize.value = `${s.width}x${s.height}`;
  if (![...inSize.options].some((o) => o.value === inSize.value)) inSize.selectedIndex = 1;
  document.getElementById('diagramName').value = doc.name;
}

/* =========================================================
   Diagram title
   ========================================================= */

document.getElementById('diagramName').addEventListener('input', (e) => {
  doc.name = e.target.value;
  markDirty();
});

/* =========================================================
   My diagrams drawer
   ========================================================= */

const drawer = document.getElementById('drawer');
const drawerBackdrop = document.getElementById('drawerBackdrop');

function openDrawer() {
  renderDiagramList();
  drawer.hidden = false;
  drawerBackdrop.hidden = false;
}

function closeDrawer() {
  drawer.hidden = true;
  drawerBackdrop.hidden = true;
}

function renderDiagramList() {
  const list = document.getElementById('diagramList');
  list.innerHTML = '';
  const index = loadIndex().sort((a, b) => b.updatedAt - a.updatedAt);
  index.forEach((entry) => {
    const li = document.createElement('li');
    if (entry.id === doc.id) li.classList.add('current');

    const nameDiv = document.createElement('div');
    nameDiv.className = 'd-name';
    const strong = document.createElement('strong');
    strong.textContent = entry.name || 'Untitled diagram';
    const small = document.createElement('small');
    small.textContent = new Date(entry.updatedAt).toLocaleString();
    nameDiv.appendChild(strong);
    nameDiv.appendChild(small);
    nameDiv.addEventListener('click', () => {
      openDiagram(entry.id);
      closeDrawer();
    });

    const dup = document.createElement('button');
    dup.className = 'btn';
    dup.textContent = 'Copy';
    dup.title = 'Duplicate';
    dup.addEventListener('click', () => {
      const src = loadDoc(entry.id);
      if (!src) return;
      src.id = newId();
      src.name = (src.name || 'Untitled diagram') + ' copy';
      src.createdAt = Date.now();
      persistDoc(src);
      renderDiagramList();
    });

    const del = document.createElement('button');
    del.className = 'btn btn-danger-ghost';
    del.textContent = 'Delete';
    del.addEventListener('click', () => {
      if (!confirm(`Delete "${entry.name || 'Untitled diagram'}"? This cannot be undone.`)) return;
      removeDoc(entry.id);
      if (entry.id === doc.id) {
        const remaining = loadIndex();
        if (remaining.length) openDiagram(remaining[0].id);
        else {
          doc = blankDoc();
          persistDoc(doc);
          rememberOpen(doc.id);
          syncSettingsUI();
          renderTable();
          render();
        }
      }
      renderDiagramList();
    });

    li.appendChild(nameDiv);
    li.appendChild(dup);
    li.appendChild(del);
    list.appendChild(li);
  });
}

document.getElementById('btnDiagrams').addEventListener('click', openDrawer);
document.getElementById('btnCloseDrawer').addEventListener('click', closeDrawer);
drawerBackdrop.addEventListener('click', closeDrawer);

function newDiagram() {
  doc = blankDoc();
  persistDoc(doc);
  rememberOpen(doc.id);
  syncSettingsUI();
  renderTable();
  render();
  closeDrawer();
}

document.getElementById('btnNew').addEventListener('click', newDiagram);
document.getElementById('btnNewFromDrawer').addEventListener('click', newDiagram);

function openDiagram(id) {
  const loaded = loadDoc(id);
  if (!loaded) return;
  doc = loaded;
  rememberOpen(doc.id);
  closePopover();
  syncSettingsUI();
  renderTable();
  render();
}

/* =========================================================
   Download / import
   ========================================================= */

const downloadMenu = document.getElementById('downloadMenu');
const btnDownload = document.getElementById('btnDownload');

btnDownload.addEventListener('click', (e) => {
  e.stopPropagation();
  downloadMenu.hidden = !downloadMenu.hidden;
  btnDownload.setAttribute('aria-expanded', String(!downloadMenu.hidden));
});
document.addEventListener('click', (e) => {
  if (!downloadMenu.hidden && !downloadMenu.contains(e.target)) downloadMenu.hidden = true;
});

function fileName(ext) {
  const base = (doc.name || 'sankey-diagram').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  return (base || 'sankey-diagram') + '.' + ext;
}

function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

function svgMarkup() {
  const clone = svg.cloneNode(true);
  clone.setAttribute('xmlns', SVG_NS);
  clone.removeAttribute('class');
  return new XMLSerializer().serializeToString(clone);
}

function exportSVG() {
  downloadBlob(new Blob([svgMarkup()], { type: 'image/svg+xml' }), fileName('svg'));
}

function exportPNG() {
  const s = doc.settings;
  const scale = 2;
  const img = new Image();
  const url = URL.createObjectURL(new Blob([svgMarkup()], { type: 'image/svg+xml' }));
  img.onload = () => {
    const canvas = document.createElement('canvas');
    canvas.width = s.width * scale;
    canvas.height = s.height * scale;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    URL.revokeObjectURL(url);
    canvas.toBlob((blob) => downloadBlob(blob, fileName('png')), 'image/png');
  };
  img.onerror = () => {
    URL.revokeObjectURL(url);
    alert('PNG export failed in this browser. Try the SVG export instead.');
  };
  img.src = url;
}

function exportJSON() {
  const payload = Object.assign({ app: 'sankey-open-studio', version: 1 }, doc);
  downloadBlob(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }), fileName('json'));
}

downloadMenu.addEventListener('click', (e) => {
  const kind = e.target.dataset && e.target.dataset.export;
  if (!kind) return;
  downloadMenu.hidden = true;
  if (kind === 'svg') exportSVG();
  else if (kind === 'png') exportPNG();
  else if (kind === 'json') exportJSON();
});

document.getElementById('importFile').addEventListener('change', (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      if (!Array.isArray(data.links)) throw new Error('bad shape');
      const imported = {
        id: newId(),
        name: data.name || file.name.replace(/\.json$/i, ''),
        createdAt: Date.now(),
        updatedAt: Date.now(),
        links: data.links
          .filter((l) => l && typeof l.from === 'string' && typeof l.to === 'string')
          .map((l) => ({ from: l.from, to: l.to, amount: Number(l.amount) })),
        nodes: (data.nodes && typeof data.nodes === 'object') ? data.nodes : {},
        settings: Object.assign({}, DEFAULT_SETTINGS, data.settings || {}),
      };
      persistDoc(imported);
      openDiagram(imported.id);
    } catch (err) {
      alert('That file does not look like a Sankey Open Studio JSON backup.');
    }
  };
  reader.readAsText(file);
});

/* =========================================================
   Keyboard
   ========================================================= */

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    closePopover();
    closePaste();
    closeDrawer();
    downloadMenu.hidden = true;
  }
});

/* =========================================================
   Init
   ========================================================= */

function init() {
  buildSwatches();
  const index = loadIndex();
  if (!index.length) {
    doc = sampleDoc();
    persistDoc(doc);
  } else {
    const last = localStorage.getItem(LAST_KEY);
    const sorted = [...index].sort((a, b) => b.updatedAt - a.updatedAt);
    doc = (last && loadDoc(last)) || loadDoc(sorted[0].id) || sampleDoc();
  }
  rememberOpen(doc.id);
  syncSettingsUI();
  renderTable();
  render();
}

init();
