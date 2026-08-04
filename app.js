/* Sankey Open Studio — a free, open source sankey diagram builder.
   Pure HTML/CSS/JS. Everything runs and stays in your browser.
   MIT licensed. */

'use strict';

/* =========================================================
   Constants
   ========================================================= */

/* Versioning: tiny fixes bump by 0.01 (1.01, 1.02...), decent updates bump
   by 0.1 (1.1, 1.2...), and the major number only changes when the project
   owner says so. */
const APP_VERSION = '1.22';

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
  width: 1200,
  height: 750,
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
  showTitle: true,
  titleSize: 26,
  titleColor: '#1c5cab',
  groupBelowPct: 0, // 0 = off; otherwise combine end nodes under this % of total
  layoutMode: 'flow', // 'flow' hugs the flows; 'spread' fills each column evenly
};

/* 20 color presets. Clicking one colors every node, cycling through the set
   in layout order (left to right, top to bottom). */
const PRESETS = [
  { name: 'Classic', colors: ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#4a3aa7'] },
  { name: 'Ocean', colors: ['#0e7490', '#22d3ee', '#0369a1', '#67e8f9', '#155e75', '#38bdf8'] },
  { name: 'Sunset', colors: ['#f59e0b', '#ef4444', '#ec4899', '#f97316', '#b91c1c', '#fbbf24'] },
  { name: 'Rainforest', colors: ['#166534', '#22c55e', '#84cc16', '#14532d', '#4ade80', '#a3e635'] },
  { name: 'Lava', colors: ['#7f1d1d', '#dc2626', '#f97316', '#fca5a5', '#991b1b', '#fdba74'] },
  { name: 'Pastel', colors: ['#93c5fd', '#f9a8d4', '#a7f3d0', '#fde68a', '#c4b5fd', '#fdba74'] },
  { name: 'Jewel', colors: ['#7c3aed', '#db2777', '#0d9488', '#ca8a04', '#1d4ed8', '#be123c'] },
  { name: 'Earth', colors: ['#78350f', '#a16207', '#4d7c0f', '#92400e', '#57534e', '#b45309'] },
  { name: 'Blues', colors: ['#1e3a8a', '#3b82f6', '#93c5fd', '#1e40af', '#60a5fa', '#bfdbfe'] },
  { name: 'Greens', colors: ['#14532d', '#16a34a', '#86efac', '#15803d', '#4ade80', '#bbf7d0'] },
  { name: 'Warm gray', colors: ['#44403c', '#78716c', '#a8a29e', '#57534e', '#d6d3d1', '#292524'] },
  { name: 'Grayscale', colors: ['#111827', '#4b5563', '#9ca3af', '#374151', '#6b7280', '#d1d5db'] },
  { name: 'Tropical', colors: ['#06b6d4', '#f43f5e', '#fbbf24', '#10b981', '#8b5cf6', '#f97316'] },
  { name: 'Berry', colors: ['#831843', '#be185d', '#ec4899', '#f9a8d4', '#9d174d', '#fbcfe8'] },
  { name: 'Vintage', colors: ['#8c6d46', '#b0532c', '#5c6b52', '#a48b5f', '#7a4f28', '#c2a878'] },
  { name: 'Corporate', colors: ['#0f4c81', '#4f81bd', '#9dc3e6', '#1f6fb2', '#2e75b6', '#bdd7ee'] },
  { name: 'Autumn', colors: ['#7c2d12', '#ea580c', '#eab308', '#a16207', '#dc2626', '#f59e0b'] },
  { name: 'Spring', colors: ['#65a30d', '#fb7185', '#34d399', '#fcd34d', '#a3e635', '#f9a8d4'] },
  { name: 'Wine & gold', colors: ['#581c87', '#a21caf', '#ca8a04', '#6b21a8', '#eab308', '#86198f'] },
  { name: 'Aloha', colors: ['#0e7490', '#f97316', '#16a34a', '#e11d48', '#eab308', '#0369a1'] },
];

const CREDIT_PARTS = ['Created with ', 'Sankey Open Studio', '  ·  OLagon.GitHub.io'];

/* Anonymous usage analytics. Only event names and counts are sent — never
   diagram content, node names, or amounts. No-op when offline or self-hosted
   without the Google tag. */
function track(name, params) {
  try {
    if (typeof gtag === 'function') gtag('event', name, params || {});
  } catch (e) { /* analytics must never break the app */ }
}

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
  // An average 80 year life is about 701,000 hours. Amounts are thousands of hours.
  const d = {
    id: newId(),
    name: 'A Human Life in Hours',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    links: [
      { from: 'Your 80 Years', to: 'Sleep', amount: 233 },
      { from: 'Your 80 Years', to: 'Work & Career', amount: 90 },
      { from: 'Your 80 Years', to: 'Screens', amount: 96 },
      { from: 'Your 80 Years', to: 'Eating & Cooking', amount: 32 },
      { from: 'Your 80 Years', to: 'School & Learning', amount: 24 },
      { from: 'Your 80 Years', to: 'Chores & Errands', amount: 30 },
      { from: 'Your 80 Years', to: 'Hygiene & Grooming', amount: 15 },
      { from: 'Your 80 Years', to: 'Commuting', amount: 15 },
      { from: 'Your 80 Years', to: 'Childhood Play', amount: 20 },
      { from: 'Your 80 Years', to: 'Free Time', amount: 146 },
      { from: 'Screens', to: 'TV & Streaming', amount: 47 },
      { from: 'Screens', to: 'Social Media', amount: 38 },
      { from: 'Screens', to: 'Gaming', amount: 11 },
      { from: 'Free Time', to: 'With People You Love', amount: 60 },
      { from: 'Free Time', to: 'Hobbies & Passions', amount: 36 },
      { from: 'Free Time', to: 'Unclaimed Hours', amount: 50 },
    ],
    nodes: {
      'Your 80 Years': { color: '#0e7490', line3: 'about 701,000 hours in all' },
      'Sleep': { color: '#4a3aa7', line3: '26 years with your eyes closed' },
      'Work & Career': { color: '#1c5cab', line3: 'about 10 years on the clock' },
      'Screens': { color: '#e34948' },
      'TV & Streaming': { color: '#eb6834', line3: '5.4 years of watching' },
      'Social Media': { color: '#e87ba4', line3: '4.3 years of scrolling' },
      'Gaming': { color: '#eda100' },
      'Free Time': { color: '#1baf7a' },
      'With People You Love': { color: '#008300', line3: 'only 7 years. spend them well' },
      'Hobbies & Passions': { color: '#14b8a6' },
      'Unclaimed Hours': { line3: 'waiting rooms, lines, lost time' },
      'Childhood Play': { color: '#b0532c' },
    },
    settings: Object.assign({}, DEFAULT_SETTINGS, {
      suffix: 'K hrs',
      width: 1200,
      height: 900,
      nodePadding: 18,
      linkColorMode: 'source',
      linkOpacity: 0.35,
    }),
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

// Measure text for real using a canvas, so wrapping and margins match what
// actually renders. Falls back to a character estimate if measuring fails.
const measureCtx = document.createElement('canvas').getContext('2d');
const MEASURE_FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

function estTextWidth(str, fontSize, bold) {
  const text = String(str || '');
  try {
    measureCtx.font = (bold ? '700 ' : '400 ') + fontSize + 'px ' + MEASURE_FONT;
    const w = measureCtx.measureText(text).width;
    // Guard against a browser that rejected the font string.
    if (w > text.length * fontSize * 0.25 || !text.length) return w;
  } catch (e) { /* fall through to the estimate */ }
  return text.length * fontSize * 0.62;
}

// Greedy word wrap to at most 3 lines, based on the estimated width.
function wrapText(str, fontSize, maxW) {
  const words = String(str).split(/\s+/).filter(Boolean);
  if (!words.length) return [''];
  const lines = [];
  let cur = words[0];
  for (let i = 1; i < words.length; i++) {
    const test = cur + ' ' + words[i];
    if (estTextWidth(test, fontSize, true) > maxW && lines.length < 2) {
      lines.push(cur);
      cur = words[i];
    } else {
      cur = test;
    }
  }
  lines.push(cur);
  return lines;
}

// A "|" in a label forces a line break there; each piece still auto-wraps.
function labelLines(label, fontSize, maxW) {
  const out = [];
  String(label).split(/\s*\|\s*/).forEach((seg) => {
    if (!seg) return;
    wrapText(seg, fontSize, maxW).forEach((line) => out.push(line));
  });
  return out.length ? out : [''];
}

/* Display-time grouping: end nodes (pure sources or pure sinks) smaller than
   the threshold merge into "Other Sources" / "Other Targets". The data table
   keeps every original row; only the drawing is combined. */
function groupSmallEnds(links, pct) {
  const inSum = new Map();
  const outSum = new Map();
  links.forEach((l) => {
    outSum.set(l.from, (outSum.get(l.from) || 0) + l.amount);
    inSum.set(l.to, (inSum.get(l.to) || 0) + l.amount);
  });
  let total = 0;
  outSum.forEach((v, name) => { if (!inSum.has(name)) total += v; });
  if (!total) total = links.reduce((a, l) => a + l.amount, 0);
  const cut = (total * pct) / 100;
  const smallSources = new Set();
  const smallTargets = new Set();
  outSum.forEach((v, name) => { if (!inSum.has(name) && v < cut) smallSources.add(name); });
  inSum.forEach((v, name) => { if (!outSum.has(name) && v < cut) smallTargets.add(name); });
  // Grouping one lone node has no benefit.
  if (smallSources.size < 2) smallSources.clear();
  if (smallTargets.size < 2) smallTargets.clear();
  if (!smallSources.size && !smallTargets.size) return links;
  const merged = new Map();
  links.forEach((l) => {
    const from = smallSources.has(l.from) ? 'Other Sources' : l.from;
    const to = smallTargets.has(l.to) ? 'Other Targets' : l.to;
    const key = JSON.stringify([from, to]);
    const m = merged.get(key);
    if (m) {
      m.amount += l.amount;
      m.rows.push(l);
    } else {
      merged.set(key, { from, to, amount: l.amount, color: l.color, rows: [l] });
    }
  });
  return [...merged.values()];
}

function computeLayout(d) {
  const s = d.settings;
  let links = d.links.filter(
    (l) => l.from && l.to && Number.isFinite(l.amount) && l.amount > 0 && l.from !== l.to
  );
  if (s.groupBelowPct > 0) links = groupSmallEnds(links, s.groupBelowPct);
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
      ref: l, // the underlying data row, so per-flow overrides persist
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
  // Wrap cap: no label line may run wider than this before wrapping.
  let maxLabelW = 40;
  nodes.forEach((n) => {
    const o = d.nodes[n.name] || {};
    String(o.label || n.name).split(/\s*\|\s*/).forEach((seg) => {
      maxLabelW = Math.max(maxLabelW, estTextWidth(seg, fs, true));
    });
    const line2 = o.line2 || (s.showValues ? formatAmount(n.value, s) : '');
    if (line2) maxLabelW = Math.max(maxLabelW, estTextWidth(line2, fs));
    if (o.line3) maxLabelW = Math.max(maxLabelW, estTextWidth(o.line3, Math.max(9, fs - 2)));
  });
  maxLabelW = Math.min(maxLabelW + 14, s.width * 0.22);

  // Each side only reserves room for its own column's labels (after wrapping),
  // so the flows get as much horizontal span as the labels truly allow.
  function nodeLabelMaxW(n) {
    const o = d.nodes[n.name] || {};
    let m = 0;
    labelLines(o.label || n.name, fs, maxLabelW - 16).forEach((line) => {
      m = Math.max(m, estTextWidth(line, fs, true));
    });
    const line2 = o.line2 || (s.showValues ? formatAmount(n.value, s) : '');
    if (line2) m = Math.max(m, estTextWidth(line2, fs));
    if (o.line3) m = Math.max(m, estTextWidth(o.line3, Math.max(9, fs - 2)));
    return m;
  }
  const outside = s.labelPosition === 'outside';
  let marginL = 16;
  let marginR = 16;
  if (outside) {
    nodes.forEach((n) => {
      const w = Math.min(nodeLabelMaxW(n), maxLabelW - 16) + 14;
      if (n.depth === 0) marginL = Math.max(marginL, w);
      if (n.depth === maxDepth) marginR = Math.max(marginR, w);
    });
  }
  const marginT = (d.name && s.showTitle ? s.titleSize * 1.3 + 30 : 0) + 22;
  const marginB = s.showCredit ? 38 : 26;

  const innerW = Math.max(80, s.width - marginL - marginR);
  const innerH = Math.max(80, s.height - marginT - marginB);

  // Estimated label block height per node, so the layout can keep nodes far
  // enough apart for their labels to sit beside them without drifting.
  const lineH = fs * 1.35;
  nodes.forEach((n) => {
    const o = d.nodes[n.name] || {};
    let count = labelLines(o.label || n.name, fs, maxLabelW - 16).length;
    if (o.line2 || s.showValues) count++;
    if (o.line3) count++;
    n.labelH = count * lineH;
  });

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

  // If a column's labels need more room than its bars leave, gently shrink
  // the scale (down to a floor) so labels can sit beside their own nodes.
  function columnNeeds(kTest) {
    let worst = 0;
    columns.forEach((col) => {
      let total = (col.length - 1) * pad;
      col.forEach((n) => { total += Math.max(1, n.value * kTest, n.labelH); });
      worst = Math.max(worst, total);
    });
    return worst;
  }
  if (columnNeeds(k) > innerH) {
    let lo = k * 0.4;
    let hi = k;
    for (let i = 0; i < 10; i++) {
      const mid = (lo + hi) / 2;
      if (columnNeeds(mid) > innerH) hi = mid;
      else lo = mid;
    }
    k = lo;
  }

  // Node heights are proportional, but never shorter than the sum of their
  // flows' minimum draw widths (each flow renders at least 1px), so ribbons
  // can never overrun a bar.
  nodes.forEach((n) => {
    const sumIn = n.targetLinks.reduce((a, l) => a + Math.max(1, l.value * k), 0);
    const sumOut = n.sourceLinks.reduce((a, l) => a + Math.max(1, l.value * k), 0);
    n.minH = Math.max(1, n.value * k, sumIn, sumOut);
  });

  // ---- Initial stacking (input order), centered ----
  columns.forEach((col) => {
    const totalH = col.reduce((acc, n) => acc + n.minH, 0) + (col.length - 1) * pad;
    let y = marginT + (innerH - totalH) / 2;
    col.forEach((n) => {
      n.y0 = y;
      n.y1 = y + n.minH;
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

  // Minimum gap between two stacked nodes: the regular padding, or enough
  // room for both labels to stay centered on their nodes, whichever is more.
  function gapFor(a, b) {
    const hA = a.y1 - a.y0;
    const hB = b.y1 - b.y0;
    const labelGap = (a.labelH + b.labelH) / 2 + 4 - (hA + hB) / 2;
    return Math.max(pad, labelGap);
  }

  function resolveCollisions() {
    columns.forEach((col) => {
      col.sort((a, b) => a.y0 - b.y0);
      let y = marginT;
      let prev = null;
      // Push down.
      col.forEach((n) => {
        const minY = prev ? prev.y1 + gapFor(prev, n) : y;
        const dy = minY - n.y0;
        if (dy > 0) { n.y0 += dy; n.y1 += dy; }
        prev = n;
      });
      // Push back up if we overflowed the bottom.
      const last = col[col.length - 1];
      if (last && last.y1 > marginT + innerH) {
        let limit = marginT + innerH;
        for (let i = col.length - 1; i >= 0; i--) {
          const n = col[i];
          const dy = n.y1 - limit;
          if (dy > 0) { n.y0 -= dy; n.y1 -= dy; }
          const above = col[i - 1];
          limit = above ? n.y0 - gapFor(above, n) : n.y0;
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

  // ---- Optional smart spread: fill each column top to bottom evenly ----
  if (s.layoutMode === 'spread') {
    columns.forEach((col) => {
      col.sort((a, b) => a.y0 - b.y0); // keep the crossing-minimized order
      const heights = col.map((n) => n.y1 - n.y0);
      const totalH = heights.reduce((a, h) => a + h, 0);
      // Leave room so the first and last labels stay inside the drawing area.
      const topPad = Math.max(0, (col[0].labelH - heights[0]) / 2);
      const botPad = Math.max(0, (col[col.length - 1].labelH - heights[heights.length - 1]) / 2);
      const span = innerH - topPad - botPad;
      if (col.length === 1) {
        const n = col[0];
        n.y0 = marginT + (innerH - heights[0]) / 2;
        n.y1 = n.y0 + heights[0];
        return;
      }
      const gap = (span - totalH) / (col.length - 1);
      if (gap < 2) return; // too crowded to spread; keep the compact layout
      let y = marginT + topPad;
      col.forEach((n, i) => {
        n.y0 = y;
        n.y1 = y + heights[i];
        y = n.y1 + gap;
      });
    });
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

  // Never let a node escape the canvas (e.g. after a title change shrinks
  // the drawing area) or overlap the title. A node that stays on screen
  // stays selectable.
  const topLimit = (d.name && s.showTitle) ? s.titleSize * 1.3 + 26 : 4;
  nodes.forEach((n) => {
    const h = n.y1 - n.y0;
    const w = n.x1 - n.x0;
    if (n.y0 < topLimit) { n.y0 = topLimit; n.y1 = topLimit + h; }
    if (n.y1 > s.height - 4) { n.y1 = s.height - 4; n.y0 = n.y1 - h; }
    if (n.x0 < 2) { n.x0 = 2; n.x1 = 2 + w; }
    if (n.x1 > s.width - 2) { n.x1 = s.width - 2; n.x0 = n.x1 - w; }
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
  if (l.ref && l.ref.color) return l.ref.color;
  const mode = doc.settings.linkColorMode;
  if (mode === 'source') return nodeColor(l.source);
  if (mode === 'target') return nodeColor(l.target);
  return NEUTRAL_LINK;
}

// Colored flows render more transparent than neutral gray ones so labels
// crossing them stay readable.
function linkOpacityEff() {
  return doc.settings.linkOpacity * (doc.settings.linkColorMode === 'neutral' ? 1 : 0.7);
}

function linkPath(l) {
  const x0 = l.source.x1;
  const x1 = l.target.x0;
  const dx = x1 - x0;
  // Ribbons thicker than their horizontal run fold over themselves on a full
  // S-curve. Flatten the curve toward a straight band as thickness grows.
  const ratio = Math.abs(dx) / Math.max(1, l.width);
  const curv = Math.max(0.08, 0.5 * Math.min(1, ratio / 2));
  const cx0 = x0 + dx * curv;
  const cx1 = x1 - dx * curv;
  return `M${x0},${l.sy}C${cx0},${l.sy} ${cx1},${l.ty} ${x1},${l.ty}`;
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
  if (doc.name && s.showTitle) {
    el('text', {
      x: s.width / 2,
      y: s.titleSize + 24,
      'text-anchor': 'middle',
      'font-size': s.titleSize,
      'font-weight': 700,
      fill: s.titleColor || TITLE_COLOR,
    }, svg).textContent = doc.name;
  }

  // Credit line inside the image (appears in exports, can be turned off).
  // The tool name is bolder and darker so it reads as the thing to search for.
  if (s.showCredit) {
    const credit = el('text', {
      x: s.width / 2,
      y: s.height - 12,
      'text-anchor': 'middle',
      'font-size': 11,
      fill: MUTED,
    }, svg);
    el('tspan', {}, credit).textContent = CREDIT_PARTS[0];
    const name = el('tspan', { 'font-weight': 700, fill: INK_2, 'font-size': 12 }, credit);
    name.textContent = CREDIT_PARTS[1];
    el('tspan', {}, credit).textContent = CREDIT_PARTS[2];
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
      'stroke-opacity': linkOpacityEff(),
      fill: 'none',
    }, gLinks);
    path.addEventListener('mousemove', (e) => {
      showTooltip(e, `${displayLabel(l.source)} → ${displayLabel(l.target)}<br><strong>${formatAmount(l.value, s)}</strong>`);
    });
    path.addEventListener('mouseleave', hideTooltip);
    path.addEventListener('mouseenter', () => highlight((x) => x === l));
    path.addEventListener('mouseout', unhighlight);
    path.addEventListener('click', (e) => openLinkPopover(l, e.clientX, e.clientY));
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

    const lines = labelLines(label, s.fontSize, maxLabelW - 16).map((t) => ({ t, kind: 'name' }));
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
      stroke: '#fcfcfb',
      'stroke-width': 3,
      'paint-order': 'stroke',
      'stroke-linejoin': 'round',
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
  // Manual break markers read as plain spaces in tooltips and editor titles.
  return ((o && o.label) || n.name).replace(/\s*\|\s*/g, ' ');
}

// While a node or flow editor is open, freeze hover effects so the browser's
// color picker eyedropper samples the diagram's resting colors.
function editorOpen() {
  return !popover.hidden || !linkPopover.hidden;
}

function highlight(match) {
  if (editorOpen()) return;
  const base = linkOpacityEff();
  svg.querySelectorAll('.link').forEach((p, i) => {
    const l = layoutCache.links[i];
    p.setAttribute('stroke-opacity', match(l) ? Math.min(1, base + 0.25) : base * 0.35);
  });
}

function unhighlight() {
  svg.querySelectorAll('.link').forEach((p) => {
    p.setAttribute('stroke-opacity', linkOpacityEff());
  });
}

/* ---------- Tooltip ---------- */

const tooltip = document.getElementById('tooltip');

function showTooltip(e, html) {
  if (editorOpen()) return;
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
      const ln = layoutCache && layoutCache.nodes.find((x) => x.name === name);
      const startY0 = ln ? ln.y0 : 0;
      const startX0 = ln ? ln.x0 : 0;
      const nodeH = ln ? ln.y1 - ln.y0 : 0;
      const nodeW = ln ? ln.x1 - ln.x0 : 0;
      let moved = false;
      let raf = null;

      function onMove(ev) {
        let dx = (ev.clientX - startX) * scale;
        let dy = (ev.clientY - startY) * scale;
        if (!moved && Math.abs(ev.clientX - startX) + Math.abs(ev.clientY - startY) > 3) moved = true;
        if (!moved) return;
        // Clamp so the node cannot be dragged off the canvas.
        const S = doc.settings;
        const topLimit = (doc.name && S.showTitle) ? S.titleSize * 1.3 + 26 : 4;
        dy = Math.max(topLimit - startY0, Math.min(dy, S.height - 4 - nodeH - startY0));
        dx = Math.max(2 - startX0, Math.min(dx, S.width - 2 - nodeW - startX0));
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
   Shared color helpers: hex parsing + recent custom colors
   ========================================================= */

const RECENT_KEY = 'sos.recentColors.v1';

function parseHex(v) {
  const m = String(v).trim().match(/^#?([0-9a-fA-F]{6}|[0-9a-fA-F]{3})$/);
  if (!m) return null;
  let h = m[1].toLowerCase();
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  return '#' + h;
}

function loadRecent() {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY)) || []; } catch (e) { return []; }
}

function pushRecent(color) {
  const c = parseHex(color);
  if (!c) return;
  // Palette colors already have swatches; only remember true custom picks.
  if (PALETTE.includes(c) || c === NEUTRAL_NODE || c === NEUTRAL_LINK) return;
  const list = [c, ...loadRecent().filter((x) => x !== c)].slice(0, 3);
  try { localStorage.setItem(RECENT_KEY, JSON.stringify(list)); } catch (e) { /* non-fatal */ }
  renderRecentRows();
}

function renderRecentInto(rowId, swId, onPick) {
  const row = document.getElementById(rowId);
  const box = document.getElementById(swId);
  const list = loadRecent();
  row.hidden = !list.length;
  box.innerHTML = '';
  list.forEach((c) => {
    const b = document.createElement('button');
    b.className = 'swatch';
    b.style.background = c;
    b.title = c;
    b.addEventListener('click', () => onPick(c));
    box.appendChild(b);
  });
}

function renderRecentRows() {
  renderRecentInto('npRecent', 'npRecentSwatches', (c) => applyNodeColor(c));
  renderRecentInto('lpRecent', 'lpRecentSwatches', (c) => applyLinkColor(c));
  renderRecentInto('tcRecent', 'tcRecentSwatches', (c) => applyTitleColor(c));
  renderRecentInto('ncRecent', 'ncRecentSwatches', (c) => applyDefaultNodeColor(c));
}

// Generic swatch strip used by the sidebar color fields.
function buildSwatchRow(containerId, colors, onPick) {
  const box = document.getElementById(containerId);
  colors.forEach((color) => {
    const b = document.createElement('button');
    b.className = 'swatch';
    b.style.background = color;
    b.dataset.color = color;
    b.title = color;
    b.addEventListener('click', () => onPick(color));
    box.appendChild(b);
  });
}

function refreshSwatchIn(containerId, color) {
  document.getElementById(containerId).querySelectorAll('.swatch').forEach((b) => {
    b.classList.toggle('selected', b.dataset.color.toLowerCase() === String(color || '').toLowerCase());
  });
}

/* =========================================================
   Flow (link) popover
   ========================================================= */

const linkPopover = document.getElementById('linkPopover');
const lpColor = document.getElementById('lpColor');
const lpHex = document.getElementById('lpHex');
const lpSwatches = document.getElementById('lpSwatches');
let popoverLink = null; // data row of the flow being edited

// Set (or clear) a flow's color. For a grouped ribbon the color is written
// through to every underlying data row so it survives re-rendering.
function setFlowColor(row, c) {
  if (c) row.color = c; else delete row.color;
  if (row.rows) row.rows.forEach((r) => { if (c) r.color = c; else delete r.color; });
}

function applyLinkColor(c) {
  if (!popoverLink) return;
  setFlowColor(popoverLink, c);
  lpColor.value = c;
  lpHex.value = c;
  refreshLinkSwatchSelection(c);
  markDirty();
}

function buildLinkSwatches() {
  lpSwatches.innerHTML = '';
  [NEUTRAL_LINK, ...PALETTE].forEach((color) => {
    const b = document.createElement('button');
    b.className = 'swatch';
    b.style.background = color;
    b.dataset.color = color;
    b.title = color;
    b.addEventListener('click', () => applyLinkColor(color));
    lpSwatches.appendChild(b);
  });
}

function refreshLinkSwatchSelection(color) {
  lpSwatches.querySelectorAll('.swatch').forEach((b) => {
    b.classList.toggle('selected', b.dataset.color.toLowerCase() === String(color).toLowerCase());
  });
}

function openLinkPopover(l, clientX, clientY) {
  closePopover();
  popoverLink = l.ref;
  document.getElementById('lpTitle').textContent = `${displayLabel(l.source)} → ${displayLabel(l.target)}`;
  lpColor.value = popoverLink.color || NEUTRAL_LINK;
  lpHex.value = popoverLink.color || '';
  refreshLinkSwatchSelection(popoverLink.color || '');
  renderRecentRows();
  hideTooltip();

  linkPopover.hidden = false;
  const wrap = document.getElementById('canvasWrap');
  const wrapRect = wrap.getBoundingClientRect();
  let x = clientX - wrapRect.left + wrap.scrollLeft + 12;
  let y = clientY - wrapRect.top + wrap.scrollTop + 12;
  const pw = linkPopover.offsetWidth;
  const ph = linkPopover.offsetHeight;
  if (x + pw > wrap.scrollLeft + wrap.clientWidth - 8) x = Math.max(8, x - pw - 24);
  if (y + ph > wrap.scrollTop + wrap.clientHeight - 8) y = Math.max(8, y - ph - 24);
  linkPopover.style.left = x + 'px';
  linkPopover.style.top = y + 'px';
}

function closeLinkPopover() {
  linkPopover.hidden = true;
  popoverLink = null;
}

lpColor.addEventListener('input', () => applyLinkColor(lpColor.value));
lpColor.addEventListener('change', () => pushRecent(lpColor.value));
lpHex.addEventListener('input', () => {
  const c = parseHex(lpHex.value);
  if (c && popoverLink) {
    setFlowColor(popoverLink, c);
    lpColor.value = c;
    refreshLinkSwatchSelection(c);
    markDirty();
  }
});
lpHex.addEventListener('change', () => pushRecent(lpHex.value));

document.getElementById('btnAutoLink').addEventListener('click', () => {
  if (popoverLink) {
    setFlowColor(popoverLink, undefined);
    markDirty();
  }
  closeLinkPopover();
});
document.getElementById('btnDoneLinkPopover').addEventListener('click', closeLinkPopover);
document.getElementById('btnCloseLinkPopover').addEventListener('click', closeLinkPopover);

/* =========================================================
   Node popover
   ========================================================= */

const popover = document.getElementById('nodePopover');
const npLabel = document.getElementById('npLabel');
const npColor = document.getElementById('npColor');
const npHex = document.getElementById('npHex');
const npLine2 = document.getElementById('npLine2');
const npLine3 = document.getElementById('npLine3');
const npSwatches = document.getElementById('npSwatches');

function applyNodeColor(c) {
  if (!popoverNode) return;
  setNodeOverride(popoverNode, 'color', c === NEUTRAL_NODE ? undefined : c);
  npColor.value = c;
  npHex.value = c === NEUTRAL_NODE ? '' : c;
  refreshSwatchSelection(c);
}

function buildSwatches() {
  npSwatches.innerHTML = '';
  [NEUTRAL_NODE, ...PALETTE].forEach((color) => {
    const b = document.createElement('button');
    b.className = 'swatch';
    b.style.background = color;
    b.dataset.color = color;
    b.title = color;
    b.addEventListener('click', () => applyNodeColor(color));
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
  closeLinkPopover();
  popoverNode = name;
  const o = doc.nodes[name] || {};
  npLabel.value = o.label || name;
  npColor.value = o.color || doc.settings.defaultNodeColor;
  npHex.value = o.color || '';
  npLine2.value = o.line2 || '';
  npLine3.value = o.line3 || '';
  renderRecentRows();
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
  npHex.value = npColor.value;
  refreshSwatchSelection(npColor.value);
});
npColor.addEventListener('change', () => pushRecent(npColor.value));
npHex.addEventListener('input', () => {
  const c = parseHex(npHex.value);
  if (c && popoverNode) {
    setNodeOverride(popoverNode, 'color', c);
    npColor.value = c;
    refreshSwatchSelection(c);
  }
});
npHex.addEventListener('change', () => pushRecent(npHex.value));
npLine2.addEventListener('input', () => setNodeOverride(popoverNode, 'line2', npLine2.value));
npLine3.addEventListener('input', () => setNodeOverride(popoverNode, 'line3', npLine3.value));

// Pressing Enter in any editor field closes the editor, same as Done.
popover.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target.matches('input[type="text"]')) {
    e.preventDefault();
    closePopover();
  }
});
linkPopover.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target.matches('input[type="text"]')) {
    e.preventDefault();
    closeLinkPopover();
  }
});

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
  track('paste_data', { rows: links.length });
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
const inShowTitle = bindSetting('setShowTitle', 'showTitle');
const inTitleSize = bindSetting('setTitleSize', 'titleSize', { number: true, showIn: 'titleSizeVal' });
const inTitleColor = bindSetting('setTitleColor', 'titleColor');
const inDecimals = bindSetting('setDecimals', 'decimals');
const inPrefix = bindSetting('setPrefix', 'prefix');
const inSuffix = bindSetting('setSuffix', 'suffix');
const inNodeWidth = bindSetting('setNodeWidth', 'nodeWidth', { number: true, showIn: 'nodeWidthVal' });
const inNodePad = bindSetting('setNodePad', 'nodePadding', { number: true, showIn: 'nodePadVal' });
const inLinkOpacity = bindSetting('setLinkOpacity', 'linkOpacity', { number: true, showIn: 'linkOpacityVal' });
const inLayoutMode = bindSetting('setLayoutMode', 'layoutMode', { event: 'change' });
inLayoutMode.addEventListener('change', () => {
  // Choosing a layout means "arrange this for me": start from a clean slate.
  for (const name in doc.nodes) {
    delete doc.nodes[name].dx;
    delete doc.nodes[name].dy;
    if (!Object.keys(doc.nodes[name]).length) delete doc.nodes[name];
  }
  markDirty();
});
const inGroupBelow = bindSetting('setGroupBelow', 'groupBelowPct', { number: true, event: 'change' });
const inNodeColor = bindSetting('setNodeColor', 'defaultNodeColor');
const inLinkColorMode = bindSetting('setLinkColorMode', 'linkColorMode');

/* ---------- Title color field (swatches + hex + recent) ---------- */

const tcHex = document.getElementById('tcHex');

function applyTitleColor(c) {
  doc.settings.titleColor = c;
  inTitleColor.value = c;
  tcHex.value = c;
  refreshSwatchIn('tcSwatches', c);
  markDirty();
}

inTitleColor.addEventListener('input', () => {
  tcHex.value = inTitleColor.value;
  refreshSwatchIn('tcSwatches', inTitleColor.value);
});
inTitleColor.addEventListener('change', () => pushRecent(inTitleColor.value));
tcHex.addEventListener('input', () => {
  const c = parseHex(tcHex.value);
  if (c) {
    doc.settings.titleColor = c;
    inTitleColor.value = c;
    refreshSwatchIn('tcSwatches', c);
    markDirty();
  }
});
tcHex.addEventListener('change', () => pushRecent(tcHex.value));

/* ---------- Default node color field (swatches + hex + recent) ---------- */

const ncHex = document.getElementById('ncHex');

function applyDefaultNodeColor(c) {
  doc.settings.defaultNodeColor = c;
  inNodeColor.value = c;
  ncHex.value = c;
  refreshSwatchIn('ncSwatches', c);
  markDirty();
}

inNodeColor.addEventListener('input', () => {
  ncHex.value = inNodeColor.value;
  refreshSwatchIn('ncSwatches', inNodeColor.value);
});
inNodeColor.addEventListener('change', () => pushRecent(inNodeColor.value));
ncHex.addEventListener('input', () => {
  const c = parseHex(ncHex.value);
  if (c) {
    doc.settings.defaultNodeColor = c;
    inNodeColor.value = c;
    refreshSwatchIn('ncSwatches', c);
    markDirty();
  }
});
ncHex.addEventListener('change', () => pushRecent(ncHex.value));

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

function buildPaletteGrid() {
  const grid = document.getElementById('paletteGrid');
  PRESETS.forEach((preset) => {
    const b = document.createElement('button');
    b.className = 'preset';
    b.title = preset.name;
    b.setAttribute('aria-label', 'Apply ' + preset.name + ' colors');
    preset.colors.slice(0, 4).forEach((c) => {
      const chip = document.createElement('span');
      chip.style.background = c;
      b.appendChild(chip);
    });
    b.addEventListener('click', () => {
      applyPreset(preset.colors);
      track('preset_applied', { preset: preset.name });
    });
    grid.appendChild(b);
  });
}

function applyPreset(colors) {
  if (!layoutCache) return;
  const ordered = [...layoutCache.nodes].sort((a, b) => a.depth - b.depth || a.y0 - b.y0);
  ordered.forEach((n, i) => {
    const o = doc.nodes[n.name] || (doc.nodes[n.name] = {});
    o.color = colors[i % colors.length];
  });
  markDirty();
}

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
  doc.links.forEach((l) => { delete l.color; });
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
  inShowTitle.checked = !!s.showTitle;
  inTitleSize.value = s.titleSize;
  document.getElementById('titleSizeVal').textContent = s.titleSize;
  inTitleColor.value = s.titleColor;
  tcHex.value = s.titleColor;
  refreshSwatchIn('tcSwatches', s.titleColor);
  ncHex.value = s.defaultNodeColor;
  refreshSwatchIn('ncSwatches', s.defaultNodeColor);
  inDecimals.value = String(s.decimals);
  inPrefix.value = s.prefix;
  inSuffix.value = s.suffix;
  inNodeWidth.value = s.nodeWidth;
  document.getElementById('nodeWidthVal').textContent = s.nodeWidth;
  inNodePad.value = s.nodePadding;
  document.getElementById('nodePadVal').textContent = s.nodePadding;
  inLinkOpacity.value = s.linkOpacity;
  document.getElementById('linkOpacityVal').textContent = s.linkOpacity;
  inLayoutMode.value = s.layoutMode || 'flow';
  inGroupBelow.value = String(s.groupBelowPct || 0);
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
      track('diagram_duplicated');
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
  track('new_diagram');
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
  closeLinkPopover();
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
  const payload = Object.assign({ app: 'sankey-open-studio', version: 1, appVersion: APP_VERSION }, doc);
  downloadBlob(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }), fileName('json'));
}

downloadMenu.addEventListener('click', (e) => {
  const kind = e.target.dataset && e.target.dataset.export;
  if (!kind) return;
  downloadMenu.hidden = true;
  track('export', { format: kind });
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
          .map((l) => {
            const row = { from: l.from, to: l.to, amount: Number(l.amount) };
            if (typeof l.color === 'string') row.color = l.color;
            return row;
          }),
        nodes: (data.nodes && typeof data.nodes === 'object') ? data.nodes : {},
        settings: Object.assign({}, DEFAULT_SETTINGS, data.settings || {}),
      };
      persistDoc(imported);
      openDiagram(imported.id);
      track('restore_json');
    } catch (err) {
      alert('That file does not look like a Sankey Open Studio JSON backup.');
    }
  };
  reader.readAsText(file);
});

/* =========================================================
   Keyboard
   ========================================================= */

// Clicking anywhere outside an open editor closes it, same as pressing Done.
// Clicks on nodes and flows are exempt because they open or re-target editors.
document.addEventListener('click', (e) => {
  const onDiagramItem = e.target.closest && (e.target.closest('.node-rect') || e.target.closest('.link'));
  if (!popover.hidden && !popover.contains(e.target) && !onDiagramItem) closePopover();
  if (!linkPopover.hidden && !linkPopover.contains(e.target) && !onDiagramItem) closeLinkPopover();
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    closePopover();
    closeLinkPopover();
    closePaste();
    closeDrawer();
    downloadMenu.hidden = true;
  }
});

/* =========================================================
   Init
   ========================================================= */

function init() {
  const versionEl = document.getElementById('appVersion');
  if (versionEl) versionEl.textContent = 'v' + APP_VERSION;
  buildSwatches();
  buildLinkSwatches();
  buildSwatchRow('tcSwatches', ['#0b0b0b', '#1c5cab', ...PALETTE], applyTitleColor);
  buildSwatchRow('ncSwatches', [NEUTRAL_NODE, ...PALETTE], applyDefaultNodeColor);
  buildPaletteGrid();
  renderRecentRows();
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
