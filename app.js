'use strict';
/* TruckBook — inventory, purchases, sales & expenses for a food truck.
   All data is stored in this browser (localStorage). Use More → Data to back up. */

// ---------- Constants ----------
const STORE_KEY = 'truckbook.v1';
const CATEGORIES = [
  { id: 'seafood', label: 'Seafood', emoji: '🦐' },
  { id: 'produce', label: 'Produce', emoji: '🥬' },
  { id: 'sauces', label: 'Dairy & Sauces', emoji: '🧴' },
  { id: 'dry', label: 'Dry goods & Tortillas', emoji: '🌽' },
  { id: 'drinks', label: 'Drinks', emoji: '🥤' },
  { id: 'packaging', label: 'Packaging & Supplies', emoji: '🥡' },
  { id: 'other', label: 'Other', emoji: '•' },
];
const UNITS = ['lb', 'oz', 'kg', 'g', 'each', 'dozen', 'bunch', 'head', 'bag', 'box', 'case', 'pack', 'gal', 'L', 'bottle', 'can', 'jar'];
const EXPENSE_CATS = ['Ingredients', 'Fuel', 'Propane', 'Commissary / Parking', 'Permits & Licenses', 'Insurance',
  'Repairs & Maintenance', 'Packaging & Supplies', 'Wages', 'Card / App fees', 'Event fees', 'Marketing', 'Equipment', 'Other'];
const WASTE_REASONS = ['Expired / spoiled', 'Dropped / damaged', 'Cooking mistake', 'Leftover end of day', 'Other'];

// ---------- Utilities ----------
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-5);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const r3 = n => Math.round((+n || 0) * 1000) / 1000;
const num = v => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };
const optNum = v => (v === '' || v == null || !Number.isFinite(parseFloat(v))) ? null : parseFloat(v);
const sum = (arr, f = x => x) => arr.reduce((a, x) => a + (+f(x) || 0), 0);
const pad2 = n => String(n).padStart(2, '0');
const toISO = d => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const parseISO = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const today = () => toISO(new Date());
const addDays = (s, n) => { const d = parseISO(s); d.setDate(d.getDate() + n); return toISO(d); };
const daysBetween = (a, b) => Math.round((parseISO(b) - parseISO(a)) / 86400000);
const shortDate = s => parseISO(s).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
const longDate = s => parseISO(s).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
const fmtQty = (n, d = 2) => (+n || 0).toLocaleString(undefined, { maximumFractionDigits: d });
const pct = (x, d = 0) => x == null || !Number.isFinite(x) ? '—' : (x * 100).toFixed(d) + '%';
const byDate = (a, b) => a.date.localeCompare(b.date) || (a.ts || 0) - (b.ts || 0);
function money(n) {
  try { return new Intl.NumberFormat(undefined, { style: 'currency', currency: S.settings.currency || 'USD' }).format(n || 0); }
  catch { return '$' + (n || 0).toFixed(2); }
}

// ---------- State ----------
function emptyState() {
  return {
    version: 1,
    settings: { name: 'My Seafood Truck', currency: 'USD', weekStart: 1, foodCostTarget: 30 },
    products: [], prices: [], purchases: [], expenses: [], sales: [], waste: [], menu: [], suppliers: [], locations: [],
  };
}
function load() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) {
      const s = Object.assign(emptyState(), JSON.parse(raw));
      s.settings = Object.assign(emptyState().settings, s.settings);
      return s;
    }
  } catch (e) { console.error(e); }
  return emptyState();
}
let S = load();
function save() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(S)); }
  catch (e) { toast('⚠️ Could not save — storage full?'); }
}

const ui = {
  tab: (location.hash.slice(1) || 'home'),
  weekOffset: 0,
  invFilter: 'all',
  invSearch: '',
  draft: null,
  expPeriod: 'week',
  expOffset: 0,
  salesOffset: 0,
  moreTab: 'waste',
};

// ---------- Domain helpers ----------
const P = id => S.products.find(p => p.id === id);
const pname = id => P(id)?.name || '(deleted item)';
const catOf = id => CATEGORIES.find(c => c.id === id) || CATEGORIES[CATEGORIES.length - 1];
const dish = id => S.menu.find(m => m.id === id);

function expiry(p) { return p.shelfLife > 0 && p.lastRestock ? addDays(p.lastRestock, +p.shelfLife) : null; }
function daysLeft(p) { const e = expiry(p); return e ? daysBetween(today(), e) : null; }
function isExpiring(p) { const d = daysLeft(p); return p.qty > 0 && d != null && d <= 2; }
function isLow(p) { return p.low != null && +p.qty <= +p.low; }
function priceHistory(pid) { return S.prices.filter(x => x.productId === pid).sort(byDate); }
function lastPrice(pid) { const h = priceHistory(pid); return h[h.length - 1] || null; }
function priceTrend(pid) {
  const h = priceHistory(pid);
  if (h.length < 2) return null;
  const a = h[h.length - 2].unitCost, b = h[h.length - 1].unitCost;
  return a > 0 ? (b - a) / a : null;
}
function dishCost(d) { return sum(d.ingredients || [], i => (P(i.productId)?.cost || 0) * i.qty); }

function weekStartOf(dateStr, offset = 0) {
  const d = parseISO(dateStr);
  const diff = (d.getDay() - (+S.settings.weekStart || 0) + 7) % 7;
  d.setDate(d.getDate() - diff + offset * 7);
  return toISO(d);
}
function periodRange(kind, offset = 0) {
  if (kind === 'week') { const f = weekStartOf(today(), offset); return [f, addDays(f, 6)]; }
  if (kind === 'month') {
    const n = new Date(); const d = new Date(n.getFullYear(), n.getMonth() + offset, 1);
    return [toISO(d), toISO(new Date(d.getFullYear(), d.getMonth() + 1, 0))];
  }
  return ['0000-01-01', '9999-12-31'];
}
const inRange = (date, [from, to]) => date >= from && date <= to;
function rangeLabel(kind, offset) {
  const [f, t] = periodRange(kind, offset);
  if (kind === 'all') return 'All time';
  if (kind === 'month') return parseISO(f).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  const pre = offset === 0 ? 'This week · ' : offset === -1 ? 'Last week · ' : '';
  return `${pre}${shortDate(f)} – ${shortDate(t)}`;
}
function totals(range) {
  const sales = S.sales.filter(s => inRange(s.date, range));
  const exps = S.expenses.filter(e => inRange(e.date, range));
  const rev = sum(sales, s => s.total);
  const exp = sum(exps, e => e.amount);
  const ingredients = sum(exps.filter(e => e.category === 'Ingredients'), e => e.amount);
  const waste = sum(S.waste.filter(w => inRange(w.date, range)), w => w.cost);
  return { rev, exp, profit: rev - exp, ingredients, waste, foodCost: rev > 0 ? ingredients / rev : null, days: new Set(sales.map(s => s.date)).size };
}

// Remove up to q from stock; logs what was really taken so it can be restored exactly.
function takeStock(pid, q, log) {
  const p = P(pid); if (!p || !(q > 0)) return 0;
  const take = r3(Math.min(+p.qty, q));
  p.qty = r3(p.qty - take);
  if (log && take > 0) {
    const ex = log.find(x => x.productId === pid);
    ex ? (ex.qty = r3(ex.qty + take)) : log.push({ productId: pid, qty: take });
  }
  return take;
}
function restoreStock(log) { (log || []).forEach(x => { const p = P(x.productId); if (p) p.qty = r3(+p.qty + x.qty); }); }

function recomputeLatestPrice(p) {
  const last = lastPrice(p.id);
  if (last) p.cost = last.unitCost;
  const buys = S.prices.filter(x => x.productId === p.id && x.purchaseId).sort(byDate);
  p.lastRestock = buys.length ? buys[buys.length - 1].date : p.lastRestock;
}

function applyPurchase(pur) {
  pur.lines.forEach(l => {
    const p = P(l.productId); if (!p) return;
    const latest = lastPrice(p.id);
    p.qty = r3(+p.qty + +l.qty);
    if (!latest || pur.date >= latest.date) p.cost = +l.unitCost;
    if (!p.lastRestock || pur.date >= p.lastRestock) p.lastRestock = pur.date;
    if (pur.supplier && !p.supplier) p.supplier = pur.supplier;
    S.prices.push({ id: uid(), productId: p.id, date: pur.date, unitCost: +l.unitCost, qty: +l.qty, supplier: pur.supplier, purchaseId: pur.id, ts: Date.now() });
  });
  S.expenses.push({ id: uid(), date: pur.date, category: 'Ingredients', amount: pur.total, note: `Restock${pur.supplier ? ' – ' + pur.supplier : ''}`, purchaseId: pur.id, ts: Date.now() });
  if (pur.supplier && !S.suppliers.includes(pur.supplier)) S.suppliers.push(pur.supplier);
  S.purchases.push(pur);
}
function deletePurchase(id) {
  const pur = S.purchases.find(x => x.id === id); if (!pur) return;
  pur.lines.forEach(l => { const p = P(l.productId); if (p) p.qty = r3(Math.max(0, p.qty - l.qty)); });
  S.prices = S.prices.filter(x => x.purchaseId !== id);
  S.expenses = S.expenses.filter(x => x.purchaseId !== id);
  S.purchases = S.purchases.filter(x => x.id !== id);
  pur.lines.forEach(l => { const p = P(l.productId); if (p) recomputeLatestPrice(p); });
}

function recordSale({ date, location, cash, card, plates, deduct, note }) {
  const plateTotal = sum(plates, x => x.count * x.price);
  const total = cash + card > 0 ? cash + card : plateTotal;
  const sale = { id: uid(), date, location, cash, card, total, plates, note, deductions: [], ts: Date.now() };
  if (deduct) plates.forEach(pl => {
    const d = dish(pl.menuId);
    (d?.ingredients || []).forEach(i => takeStock(i.productId, i.qty * pl.count, sale.deductions));
  });
  if (location && !S.locations.includes(location)) S.locations.push(location);
  S.sales.push(sale);
  return sale;
}
function recordWaste(pid, qty, reason, date = today()) {
  const p = P(pid); if (!p) return null;
  const log = [];
  const taken = takeStock(pid, qty, log);
  const w = { id: uid(), date, productId: pid, qty: taken, reason, cost: r3(taken * (p.cost || 0)), ts: Date.now() };
  S.waste.push(w);
  return w;
}

// ---------- Rendering helpers ----------
const badge = (t, cls = '') => `<span class="badge ${cls}">${esc(t)}</span>`;
function freshBadge(p) {
  if (!(p.qty > 0)) return '';
  const d = daysLeft(p);
  if (d == null) return '';
  if (d < 0) return badge('Expired', 'bad');
  if (d === 0) return badge('Use today', 'bad');
  if (d <= 2) return badge(`${d}d left`, 'warn');
  return badge(`${d}d left`, 'ok');
}
function trendHTML(t) {
  if (t == null || Math.abs(t) < 0.005) return '';
  return `<span class="trend ${t > 0 ? 'up' : 'down'}">${t > 0 ? '▲' : '▼'}${Math.abs(t * 100).toFixed(0)}%</span>`;
}
const empty = (msg, extra = '') => `<div class="empty">${msg}${extra}</div>`;
function productOptions(selected = '', placeholder = 'Choose item…') {
  return `<option value="">${placeholder}</option>` + CATEGORIES.map(c => {
    const items = S.products.filter(p => (catOf(p.category).id) === c.id).sort((a, b) => a.name.localeCompare(b.name));
    if (!items.length) return '';
    return `<optgroup label="${c.emoji} ${esc(c.label)}">${items.map(p => `<option value="${p.id}" ${p.id === selected ? 'selected' : ''}>${esc(p.name)} (${esc(p.unit)})</option>`).join('')}</optgroup>`;
  }).join('');
}
function periodNav(kind, offset, action) {
  return `<div class="period">
    <button class="btn ghost sm" data-action="${action}" data-d="-1" ${kind === 'all' ? 'disabled' : ''} aria-label="Previous">‹</button>
    <strong>${rangeLabel(kind, offset)}</strong>
    <button class="btn ghost sm" data-action="${action}" data-d="1" ${kind === 'all' || offset >= 0 ? 'disabled' : ''} aria-label="Next">›</button>
  </div>`;
}
function kpi(label, value, sub = '', cls = '') {
  return `<div class="kpi ${cls}"><div class="kpi-label">${label}</div><div class="kpi-value">${value}</div><div class="kpi-sub">${sub}</div></div>`;
}
function delta(cur, prev, upIsGood = true) {
  if (!prev) return '';
  const d = (cur - prev) / Math.abs(prev), up = d >= 0;
  return `<span class="delta ${up === upIsGood ? 'good' : 'bad'}">${up ? '▲' : '▼'} ${Math.abs(d * 100).toFixed(0)}% vs prior</span>`;
}
const isEmpty = () => !S.products.length && !S.sales.length && !S.expenses.length && !S.menu.length;

// ---------- Views ----------
const views = {};

views.home = () => {
  if (isEmpty()) return `
    <section class="card hero">
      <h1>Welcome aboard! 🦐</h1>
      <p>TruckBook keeps track of your <b>stock</b>, your <b>weekly produce prices</b>, what you <b>sell</b>, what you <b>spend</b> and what each plate really <b>costs</b> you.</p>
      <ol class="steps">
        <li><b>Stock:</b> add the things you buy (shrimp, tomatoes, tortillas…).</li>
        <li><b>Buy:</b> every time you shop, log it — prices are remembered week by week.</li>
        <li><b>Menu:</b> add your dishes and their ingredients to see food cost per plate.</li>
        <li><b>Sales:</b> at the end of each day, enter what you made.</li>
      </ol>
      <div class="row wrap gap">
        <button class="btn primary" data-action="start-fresh">Start with my products</button>
        <button class="btn" data-action="load-sample">Explore with sample data</button>
      </div>
      <p class="muted small">Your data is saved on this device only. Make backups in More → Data.</p>
    </section>`;

  const range = periodRange('week', ui.weekOffset);
  const t = totals(range), pt = totals(periodRange('week', ui.weekOffset - 1));
  const target = S.settings.foodCostTarget / 100;
  const fc4 = totals([addDays(range[1], -27), range[1]]).foodCost; // rolling 4 weeks smooths out weekly shopping
  const expiring = S.products.filter(isExpiring).sort((a, b) => daysLeft(a) - daysLeft(b));
  const low = S.products.filter(isLow);
  const movers = S.products.map(p => ({ p, t: priceTrend(p.id) })).filter(x => x.t != null && Math.abs(x.t) >= 0.05)
    .sort((a, b) => Math.abs(b.t) - Math.abs(a.t)).slice(0, 6);
  const badDishes = S.menu.filter(d => d.price > 0 && dishCost(d) / d.price > target);

  return `
  <section class="card">
    ${periodNav('week', ui.weekOffset, 'week-nav')}
    <div class="kpis">
      ${kpi('Sales', money(t.rev), delta(t.rev, pt.rev) || `${t.days} service day${t.days === 1 ? '' : 's'}`)}
      ${kpi('Expenses', money(t.exp), delta(t.exp, pt.exp, false))}
      ${kpi('Profit', money(t.profit), t.rev ? `${pct(t.profit / t.rev)} margin` : '', t.profit < 0 ? 'neg' : 'pos')}
      ${kpi('Food cost', pct(fc4), `last 4 weeks · goal ≤ ${S.settings.foodCostTarget}%`, fc4 > target ? 'neg' : fc4 != null ? 'pos' : '')}
    </div>
    ${t.waste > 0 ? `<p class="muted small">🗑️ Waste this week: <b>${money(t.waste)}</b></p>` : ''}
  </section>

  <section class="quick">
    <button class="btn primary" data-action="goto" data-tab="buy">🛒 Log shopping</button>
    <button class="btn primary" data-action="goto" data-tab="sales">💵 Log sales</button>
    <button class="btn" data-action="add-expense">🧾 Add expense</button>
  </section>

  ${expiring.length ? `<section class="card alert-card">
    <h2>⏰ Use it or lose it</h2>
    <p class="muted small">Perishables close to their shelf life. Push them as a special today, or log them as waste.</p>
    ${expiring.map(p => `<div class="alert-row"><div><b>${esc(p.name)}</b> ${freshBadge(p)}<div class="muted small">${fmtQty(p.qty)} ${esc(p.unit)} · ${money(p.qty * p.cost)} at risk</div></div>
      <button class="btn sm danger-ghost" data-action="toss" data-id="${p.id}">Toss</button></div>`).join('')}
  </section>` : ''}

  ${low.length ? `<section class="card">
    <div class="row between"><h2>📉 Running low</h2><button class="btn sm" data-action="goto" data-tab="buy">Shopping list →</button></div>
    <div class="chips">${low.map(p => `<span class="chip warn">${esc(p.name)} · ${fmtQty(p.qty)} ${esc(p.unit)}</span>`).join('')}</div>
  </section>` : ''}

  ${movers.length ? `<section class="card">
    <h2>💲 Price changes (last two buys)</h2>
    ${movers.map(({ p, t }) => { const h = priceHistory(p.id); const a = h[h.length - 2].unitCost, b = h[h.length - 1].unitCost;
      return `<div class="alert-row"><span>${esc(p.name)}</span><span>${money(a)} → <b>${money(b)}</b>/${esc(p.unit)} ${trendHTML(t)}</span></div>`; }).join('')}
  </section>` : ''}

  ${badDishes.length ? `<section class="card">
    <h2>🍽️ Dishes over food-cost goal</h2>
    <p class="muted small">With this week's prices these plates cost more than ${S.settings.foodCostTarget}% of their price. Consider a price bump or smaller portion.</p>
    ${badDishes.map(d => `<div class="alert-row"><span>${esc(d.name)}</span><span>${pct(dishCost(d) / d.price)} · suggest ${money(dishCost(d) / target)}</span></div>`).join('')}
  </section>` : ''}

  <section class="card">
    <h2>Last 8 weeks</h2>
    ${weeksChart(8)}
  </section>`;
};

function weeksChart(n) {
  const data = [];
  for (let i = n - 1; i >= 0; i--) {
    const r = periodRange('week', -i), x = totals(r);
    data.push({ label: shortDate(r[0]), rev: x.rev, exp: x.exp });
  }
  const max = Math.max(1, ...data.flatMap(d => [d.rev, d.exp]));
  const W = 340, H = 170, top = 10, bottom = 22, left = 4, ch = H - top - bottom, slot = (W - left) / n, bw = Math.min(14, slot / 2 - 3);
  const bars = data.map((d, i) => {
    const x = left + i * slot + slot / 2;
    const hr = (d.rev / max) * ch, he = (d.exp / max) * ch;
    return `<g><title>${d.label}: sales ${money(d.rev)}, expenses ${money(d.exp)}</title>
      <rect x="${x - bw - 1}" y="${top + ch - hr}" width="${bw}" height="${hr}" rx="3" class="bar-rev"/>
      <rect x="${x + 1}" y="${top + ch - he}" width="${bw}" height="${he}" rx="3" class="bar-exp"/>
      <text x="${x}" y="${H - 6}" text-anchor="middle" class="axis">${d.label}</text></g>`;
  }).join('');
  return `<div class="legend"><span><i class="sw rev"></i>Sales</span><span><i class="sw exp"></i>Expenses</span></div>
    <svg viewBox="0 0 ${W} ${H}" class="chart" role="img" aria-label="Weekly sales and expenses">
      <line x1="0" x2="${W}" y1="${top + ch}" y2="${top + ch}" class="baseline"/>${bars}</svg>`;
}

// ----- Stock -----
views.stock = () => {
  const value = sum(S.products, p => p.qty * p.cost);
  const filters = [['all', 'All'], ['low', 'Low'], ['expiring', 'Expiring'], ...CATEGORIES.filter(c => S.products.some(p => catOf(p.category).id === c.id)).map(c => [c.id, c.emoji + ' ' + c.label.split(' ')[0]])];
  return `
  <section class="card">
    <div class="row between"><div><h2>Inventory</h2><div class="muted small">${S.products.length} items · stock value <b>${money(value)}</b></div></div>
      <button class="btn primary" data-action="add-product">+ Item</button></div>
    <input type="search" class="search" placeholder="Search items or suppliers…" data-search="inv" value="${esc(ui.invSearch)}">
    <div class="chips scroll">${filters.map(([id, l]) => `<button class="chip ${ui.invFilter === id ? 'on' : ''}" data-action="inv-filter" data-f="${id}">${esc(l)}</button>`).join('')}</div>
  </section>
  <div id="invList">${invListHTML()}</div>`;
};
function invListHTML() {
  if (!S.products.length) return empty('No items yet. Tap <b>+ Item</b> to add what you stock.');
  let list = S.products.slice();
  const q = ui.invSearch.trim().toLowerCase();
  if (q) list = list.filter(p => p.name.toLowerCase().includes(q) || (p.supplier || '').toLowerCase().includes(q));
  const f = ui.invFilter;
  if (f === 'low') list = list.filter(isLow);
  else if (f === 'expiring') list = list.filter(isExpiring);
  else if (f !== 'all') list = list.filter(p => catOf(p.category).id === f);
  if (!list.length) return empty('Nothing matches.');
  return CATEGORIES.map(c => {
    const items = list.filter(p => catOf(p.category).id === c.id).sort((a, b) => a.name.localeCompare(b.name));
    return items.length ? `<h3 class="group">${c.emoji} ${esc(c.label)}</h3>${items.map(prodCard).join('')}` : '';
  }).join('');
}
function prodCard(p) {
  return `<div class="item ${isLow(p) ? 'is-low' : ''}" id="p-${p.id}">
    <div class="item-main" data-action="edit-product" data-id="${p.id}">
      <div class="item-title">${esc(p.name)} ${isLow(p) ? badge('Low', 'warn') : ''} ${freshBadge(p)}</div>
      <div class="muted small">${money(p.cost)}/${esc(p.unit)} ${trendHTML(priceTrend(p.id))} · value ${money(p.qty * p.cost)}${p.par ? ` · par ${fmtQty(p.par)}` : ''}${p.supplier ? ` · ${esc(p.supplier)}` : ''}</div>
    </div>
    <div class="stepper">
      <button data-action="qty" data-id="${p.id}" data-d="-1" aria-label="Less">−</button>
      <input type="number" inputmode="decimal" step="any" min="0" value="${Math.round(p.qty * 100) / 100}" data-change="set-qty" data-id="${p.id}" aria-label="Quantity of ${esc(p.name)}">
      <button data-action="qty" data-id="${p.id}" data-d="1" aria-label="More">+</button>
      <span class="unit">${esc(p.unit)}</span>
    </div>
  </div>`;
}

function productModal(id) {
  const p = id ? P(id) : { name: '', category: 'produce', unit: 'lb', qty: 0, cost: '', par: '', low: '', shelfLife: '', step: 1, supplier: '', notes: '' };
  const hist = id ? priceHistory(id).slice(-10).reverse() : [];
  openModal(`
  <form data-form="product" class="form">
    <h2>${id ? 'Edit item' : 'New item'}</h2>
    <input type="hidden" name="id" value="${id || ''}">
    <label>Name<input name="name" required value="${esc(p.name)}" placeholder="e.g. Shrimp 21/25, Roma tomatoes"></label>
    <div class="grid2">
      <label>Category<select name="category">${CATEGORIES.map(c => `<option value="${c.id}" ${catOf(p.category).id === c.id ? 'selected' : ''}>${c.emoji} ${c.label}</option>`).join('')}</select></label>
      <label>Unit<input name="unit" list="unitList" required value="${esc(p.unit)}"></label>
      <label>In stock now<input name="qty" type="number" step="any" min="0" inputmode="decimal" value="${r3(p.qty)}"></label>
      <label>Cost per unit<input name="cost" type="number" step="0.01" min="0" inputmode="decimal" value="${p.cost === '' ? '' : r3(p.cost)}" placeholder="0.00"></label>
      <label>Par (stock to have)<input name="par" type="number" step="any" min="0" inputmode="decimal" value="${p.par ?? ''}" placeholder="e.g. 20"></label>
      <label>Warn me at<input name="low" type="number" step="any" min="0" inputmode="decimal" value="${p.low ?? ''}" placeholder="e.g. 5"></label>
      <label>Stays fresh (days)<input name="shelfLife" type="number" step="1" min="0" inputmode="numeric" value="${p.shelfLife ?? ''}" placeholder="blank = doesn't spoil"></label>
      <label>+/− step<input name="step" type="number" step="any" min="0" inputmode="decimal" value="${p.step || 1}"></label>
    </div>
    <label>Usual supplier<input name="supplier" list="supplierList" value="${esc(p.supplier)}" placeholder="e.g. Farmers market"></label>
    <label>Notes<input name="notes" value="${esc(p.notes)}"></label>
    <datalist id="unitList">${UNITS.map(u => `<option value="${u}">`).join('')}</datalist>
    <datalist id="supplierList">${S.suppliers.map(s => `<option value="${esc(s)}">`).join('')}</datalist>
    ${hist.length ? `<h3>Price history</h3>${sparkline(priceHistory(id).map(h => h.unitCost))}
      <table class="table"><tr><th>Date</th><th>Price</th><th>Qty</th><th>From</th></tr>
      ${hist.map(h => `<tr><td>${shortDate(h.date)}</td><td>${money(h.unitCost)}</td><td>${h.qty ? fmtQty(h.qty) : '—'}</td><td>${esc(h.supplier || (h.purchaseId ? '' : 'manual'))}</td></tr>`).join('')}</table>` : ''}
    <div class="row between actions">
      ${id ? `<button type="button" class="btn danger-ghost" data-action="delete-product" data-id="${id}">Delete</button>` : '<span></span>'}
      <div class="row gap"><button type="button" class="btn" data-action="close-modal">Cancel</button><button class="btn primary">Save</button></div>
    </div>
  </form>`);
}
function sparkline(vals) {
  if (vals.length < 2) return '';
  const W = 300, H = 50, min = Math.min(...vals), max = Math.max(...vals), span = max - min || 1;
  const pts = vals.map((v, i) => `${(i / (vals.length - 1)) * (W - 8) + 4},${H - 6 - ((v - min) / span) * (H - 12)}`).join(' ');
  return `<svg viewBox="0 0 ${W} ${H}" class="spark"><polyline points="${pts}" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/></svg>
    <div class="muted small">Low ${money(min)} · High ${money(max)} · Avg ${money(sum(vals) / vals.length)}</div>`;
}

// ----- Buy (shopping list + purchases) -----
const WHOLE_UNITS = ['each', 'dozen', 'bunch', 'head', 'bag', 'box', 'case', 'pack', 'bottle', 'can', 'jar'];
function shoppingList() {
  // Perishables: top up to par every trip. Shelf-stable items: only when low or ≥25% below par.
  return S.products.filter(p => p.par > 0 && p.qty < p.par && (p.shelfLife > 0 || isLow(p) || p.par - p.qty >= p.par * 0.25))
    .map(p => {
      const raw = p.par - p.qty;
      const need = WHOLE_UNITS.includes(p.unit) ? Math.ceil(raw - 0.05) || 1 : Math.ceil(raw * 4) / 4;
      return { p, need, est: need * (p.cost || 0) };
    })
    .sort((a, b) => (a.p.supplier || '~').localeCompare(b.p.supplier || '~') || a.p.name.localeCompare(b.p.name));
}
const blankLine = (pid = '', qty = '') => { const p = P(pid); return { productId: pid, qty, unitCost: p && p.cost !== '' ? r3(p.cost) : '' }; };
const newDraft = (lines) => ({ date: today(), supplier: '', lines: lines && lines.length ? lines : [blankLine()] });
const lineTotal = l => num(l.qty) * num(l.unitCost);

views.buy = () => {
  const list = shoppingList();
  const recent = S.purchases.slice().sort(byDate).reverse().slice(0, 15);
  const d = ui.draft;
  let bySupplier = {};
  list.forEach(x => { (bySupplier[x.p.supplier || 'Anywhere'] ||= []).push(x); });
  return `
  <section class="card">
    <div class="row between"><div><h2>🛒 Shopping list</h2><div class="muted small">Items below their par level</div></div>
    ${list.length ? `<div class="row gap"><button class="btn sm" data-action="share-list">Share</button><button class="btn sm primary" data-action="draft-from-list">Buy these</button></div>` : ''}</div>
    ${list.length ? Object.entries(bySupplier).map(([sup, xs]) => `<h3 class="group">${esc(sup)}</h3>
      ${xs.map(x => `<div class="alert-row"><span>${esc(x.p.name)}</span><span>${fmtQty(x.need)} ${esc(x.p.unit)} <span class="muted">≈ ${money(x.est)}</span></span></div>`).join('')}`).join('')
      + `<div class="alert-row total"><span>Estimated</span><b>${money(sum(list, x => x.est))}</b></div>`
      : empty(S.products.length ? 'All stocked up 👍 (set a <b>par</b> on items to build this list automatically)' : 'Add items in Stock first.')}
  </section>

  <section class="card">
    <div class="row between"><h2>Log a purchase</h2>${!d ? `<button class="btn primary" data-action="draft-new">+ New</button>` : ''}</div>
    ${d ? draftHTML(d) : `<p class="muted small">Every purchase adds to your stock, remembers this week's price and is counted as an <b>Ingredients</b> expense.</p>`}
  </section>

  <section class="card">
    <h2>Recent purchases</h2>
    ${recent.length ? recent.map(pur => `<details class="purchase">
      <summary><span><b>${longDate(pur.date)}</b> ${pur.supplier ? '· ' + esc(pur.supplier) : ''}<span class="muted small"> · ${pur.lines.length} items</span></span><b>${money(pur.total)}</b></summary>
      ${pur.lines.map(l => `<div class="alert-row small"><span>${esc(pname(l.productId))}</span><span>${fmtQty(l.qty)} × ${money(l.unitCost)} = ${money(l.qty * l.unitCost)}</span></div>`).join('')}
      <div class="row end"><button class="btn sm danger-ghost" data-action="delete-purchase" data-id="${pur.id}">Delete & undo stock</button></div>
    </details>`).join('') : empty('No purchases yet.')}
  </section>`;
};
function draftHTML(d) {
  return `<div class="form">
    <div class="grid2">
      <label>Date<input type="date" data-draft="date" value="${d.date}"></label>
      <label>Supplier / store<input data-draft="supplier" list="supplierList" value="${esc(d.supplier)}" placeholder="e.g. Restaurant Depot"></label>
    </div>
    <datalist id="supplierList">${S.suppliers.map(s => `<option value="${esc(s)}">`).join('')}</datalist>
    <div id="lines">${d.lines.map(draftLineHTML).join('')}</div>
    <div class="row wrap gap">
      <button type="button" class="btn sm" data-action="draft-add">+ Line</button>
      <button type="button" class="btn sm" data-action="add-product">+ New item</button>
    </div>
    <div class="alert-row total"><span>Total</span><b id="draftTotal">${money(sum(d.lines, lineTotal))}</b></div>
    <div class="row end gap"><button class="btn" data-action="draft-cancel">Cancel</button><button class="btn primary" data-action="draft-save">Save purchase</button></div>
  </div>`;
}
function draftLineHTML(l, i) {
  const p = P(l.productId), u = p ? esc(p.unit) : 'unit';
  return `<div class="line">
    <div class="row gap"><select data-draft="productId" data-i="${i}">${productOptions(l.productId)}</select>
      <button type="button" class="icon-btn" data-action="draft-remove" data-i="${i}" aria-label="Remove line">✕</button></div>
    <div class="grid3">
      <label>Qty (${u})<input type="number" step="any" min="0" inputmode="decimal" data-draft="qty" data-i="${i}" value="${l.qty}"></label>
      <label>Price / ${u}<input type="number" step="0.01" min="0" inputmode="decimal" data-draft="unitCost" data-i="${i}" value="${l.unitCost}"></label>
      <div class="line-total"><span class="muted small">Line</span><b id="lt${i}">${money(lineTotal(l))}</b></div>
    </div>
    <div class="hint" id="lh${i}">${priceHint(l)}</div>
  </div>`;
}
function priceHint(l) {
  if (!l.productId) return '';
  const last = lastPrice(l.productId), p = P(l.productId);
  if (!last) return '<span class="muted">First time buying this — price will be remembered.</span>';
  let s = `Last paid ${money(last.unitCost)}/${esc(p.unit)} on ${shortDate(last.date)}`;
  const c = optNum(l.unitCost);
  if (c != null && last.unitCost > 0 && Math.abs(c - last.unitCost) > 0.001) s += ` ${trendHTML((c - last.unitCost) / last.unitCost)}`;
  return `<span class="muted">${s}</span>`;
}

// ----- Sales -----
views.sales = () => {
  const range = periodRange('week', ui.salesOffset);
  const sales = S.sales.filter(s => inRange(s.date, range)).sort(byDate).reverse();
  const tot = sum(sales, s => s.total);
  const monthRange = periodRange('month', 0);
  const counts = {};
  S.sales.filter(s => inRange(s.date, monthRange)).forEach(s => (s.plates || []).forEach(pl => {
    counts[pl.name] = counts[pl.name] || { n: 0, rev: 0 }; counts[pl.name].n += pl.count; counts[pl.name].rev += pl.count * pl.price;
  }));
  const best = Object.entries(counts).sort((a, b) => b[1].n - a[1].n);
  const maxN = best[0]?.[1].n || 1;
  const byDay = {};
  S.sales.forEach(s => { const wd = parseISO(s.date).toLocaleDateString(undefined, { weekday: 'short' }); (byDay[wd] ||= { tot: 0, n: 0, dates: new Set() }); byDay[wd].tot += s.total; byDay[wd].dates.add(s.date); });
  const byLoc = {};
  S.sales.forEach(s => { const k = s.location || '—'; (byLoc[k] ||= { tot: 0, dates: new Set() }); byLoc[k].tot += s.total; byLoc[k].dates.add(s.date); });

  return `
  <section class="card">
    <h2>💵 Log a service day</h2>
    <form data-form="sale" data-calc="sale" class="form">
      <div class="grid2">
        <label>Date<input type="date" name="date" value="${today()}" required></label>
        <label>Location / event<input name="location" list="locList" placeholder="e.g. Downtown, Brewery"></label>
        <label>Cash<input type="number" name="cash" step="0.01" min="0" inputmode="decimal" placeholder="0.00"></label>
        <label>Card / apps<input type="number" name="card" step="0.01" min="0" inputmode="decimal" placeholder="0.00"></label>
      </div>
      <datalist id="locList">${S.locations.map(l => `<option value="${esc(l)}">`).join('')}</datalist>
      ${S.menu.length ? `<h3>Plates sold <span class="muted small">(optional — updates stock)</span></h3>
        <div class="plates">${S.menu.map(m => `<label class="plate"><span>${esc(m.name)} <span class="muted small">${money(m.price)}</span></span>
          <input type="number" name="plate_${m.id}" min="0" step="1" inputmode="numeric" placeholder="0"></label>`).join('')}</div>
        <label class="check"><input type="checkbox" name="deduct" checked> Subtract ingredients from stock</label>
        <div class="muted small" id="saleCalc"></div>`
      : `<p class="muted small">Tip: add your dishes in <b>Menu</b> and you can count plates sold here — stock goes down automatically.</p>`}
      <label>Note<input name="note" placeholder="Weather, event, anything worth remembering"></label>
      <div class="row end"><button class="btn primary">Save day</button></div>
    </form>
  </section>

  <section class="card">
    ${periodNav('week', ui.salesOffset, 'sales-nav')}
    <div class="alert-row total"><span>Week total</span><b>${money(tot)}</b></div>
    ${sales.length ? sales.map(s => `<details class="purchase"><summary><span><b>${longDate(s.date)}</b>${s.location ? ' · ' + esc(s.location) : ''}</span><b>${money(s.total)}</b></summary>
      <div class="muted small">Cash ${money(s.cash)} · Card ${money(s.card)}${s.note ? ' · ' + esc(s.note) : ''}</div>
      ${(s.plates || []).filter(p => p.count).map(p => `<div class="alert-row small"><span>${esc(p.name)}</span><span>${p.count} × ${money(p.price)}</span></div>`).join('')}
      <div class="row end"><button class="btn sm danger-ghost" data-action="delete-sale" data-id="${s.id}">Delete${s.deductions?.length ? ' & restore stock' : ''}</button></div>
    </details>`).join('') : empty('No sales logged this week.')}
  </section>

  ${best.length ? `<section class="card"><h2>🏆 Best sellers this month</h2>
    ${best.map(([n, v]) => `<div class="bar-row"><span>${esc(n)}</span><div class="hbar"><i style="width:${(v.n / maxN) * 100}%"></i></div><span class="small">${v.n} · ${money(v.rev)}</span></div>`).join('')}
  </section>` : ''}

  ${Object.keys(byLoc).length > 1 ? `<section class="card"><h2>📍 Average per day by location</h2>
    ${Object.entries(byLoc).map(([k, v]) => [k, v.tot / v.dates.size, v.dates.size]).sort((a, b) => b[1] - a[1]).map(([k, avg, n]) => `<div class="alert-row"><span>${esc(k)} <span class="muted small">${n} day${n > 1 ? 's' : ''}</span></span><b>${money(avg)}</b></div>`).join('')}
  </section>` : ''}

  ${Object.keys(byDay).length > 1 ? `<section class="card"><h2>📅 Average by weekday</h2>
    ${Object.entries(byDay).map(([k, v]) => [k, v.tot / v.dates.size]).sort((a, b) => b[1] - a[1]).map(([k, avg]) => `<div class="alert-row"><span>${k}</span><b>${money(avg)}</b></div>`).join('')}
  </section>` : ''}`;
};
function readSaleForm(form) {
  const fd = new FormData(form);
  const plates = S.menu.map(m => ({ menuId: m.id, name: m.name, price: m.price, count: Math.max(0, Math.round(num(fd.get('plate_' + m.id)))) })).filter(p => p.count > 0);
  return { date: fd.get('date') || today(), location: (fd.get('location') || '').trim(), cash: num(fd.get('cash')), card: num(fd.get('card')), plates, deduct: fd.get('deduct') === 'on', note: (fd.get('note') || '').trim() };
}
function updateSaleCalc(form) {
  const el = $('#saleCalc'); if (!el) return;
  const s = readSaleForm(form);
  const plateTotal = sum(s.plates, p => p.count * p.price);
  const paid = s.cash + s.card;
  const cost = sum(s.plates, p => p.count * (dish(p.menuId) ? dishCost(dish(p.menuId)) : 0));
  if (!plateTotal) { el.innerHTML = ''; return; }
  let msg = `Plates add up to <b>${money(plateTotal)}</b> (ingredients ≈ ${money(cost)}).`;
  if (paid > 0 && Math.abs(paid - plateTotal) > 0.5) msg += ` Cash + card is ${money(paid)} — difference ${money(paid - plateTotal)} (tips? comps?).`;
  if (!paid) msg += ' Leave cash/card empty to use this as the day total.';
  el.innerHTML = msg;
}

// ----- Expenses -----
views.expenses = () => {
  const range = periodRange(ui.expPeriod, ui.expOffset);
  const list = S.expenses.filter(e => inRange(e.date, range)).sort(byDate).reverse();
  const total = sum(list, e => e.amount);
  const byCat = {};
  list.forEach(e => byCat[e.category] = (byCat[e.category] || 0) + e.amount);
  const cats = Object.entries(byCat).sort((a, b) => b[1] - a[1]);
  const max = cats[0]?.[1] || 1;
  return `
  <section class="card">
    <div class="row between"><h2>🧾 Expenses</h2><button class="btn primary" data-action="add-expense">+ Expense</button></div>
    <div class="seg">${['week', 'month', 'all'].map(k => `<button class="${ui.expPeriod === k ? 'on' : ''}" data-action="exp-period" data-k="${k}">${k[0].toUpperCase() + k.slice(1)}</button>`).join('')}</div>
    ${periodNav(ui.expPeriod, ui.expOffset, 'exp-nav')}
    <div class="alert-row total"><span>Total spent</span><b>${money(total)}</b></div>
    ${cats.map(([c, v]) => `<div class="bar-row"><span>${esc(c)}</span><div class="hbar"><i style="width:${(v / max) * 100}%"></i></div><span class="small">${money(v)} · ${pct(v / total)}</span></div>`).join('')}
  </section>
  <section class="card">
    ${list.length ? list.map(e => `<div class="item compact" ${e.purchaseId ? '' : `data-action="edit-expense" data-id="${e.id}"`}>
      <div class="item-main"><div class="item-title">${esc(e.category)} ${e.purchaseId ? badge('from purchase') : ''}</div>
      <div class="muted small">${longDate(e.date)}${e.note ? ' · ' + esc(e.note) : ''}</div></div><b>${money(e.amount)}</b></div>`).join('')
      : empty('No expenses in this period.')}
  </section>`;
};
function expenseModal(id) {
  const e = id ? S.expenses.find(x => x.id === id) : { date: today(), category: 'Fuel', amount: '', note: '' };
  openModal(`<form data-form="expense" class="form">
    <h2>${id ? 'Edit expense' : 'New expense'}</h2>
    <input type="hidden" name="id" value="${id || ''}">
    <div class="grid2">
      <label>Date<input type="date" name="date" value="${e.date}" required></label>
      <label>Amount<input type="number" name="amount" step="0.01" min="0" inputmode="decimal" required value="${e.amount}" placeholder="0.00"></label>
    </div>
    <label>Category<select name="category">${EXPENSE_CATS.map(c => `<option ${c === e.category ? 'selected' : ''}>${c}</option>`).join('')}</select></label>
    <label>Note<input name="note" value="${esc(e.note)}" placeholder="e.g. Shell station, 14 gal"></label>
    <p class="muted small">Buying food or produce? Log it in <b>Buy</b> instead so your stock and prices update too.</p>
    <div class="row between actions">
      ${id ? `<button type="button" class="btn danger-ghost" data-action="delete-expense" data-id="${id}">Delete</button>` : '<span></span>'}
      <div class="row gap"><button type="button" class="btn" data-action="close-modal">Cancel</button><button class="btn primary">Save</button></div>
    </div>
  </form>`);
}

// ----- Menu -----
views.menu = () => {
  const target = S.settings.foodCostTarget / 100;
  return `
  <section class="card">
    <div class="row between"><div><h2>🌮 Menu & plate cost</h2><div class="muted small">Costs use your latest purchase prices, so they move with the market.</div></div>
    <button class="btn primary" data-action="add-dish">+ Dish</button></div>
  </section>
  ${S.menu.length ? S.menu.map(d => {
    const c = dishCost(d), fc = d.price > 0 ? c / d.price : null;
    const cls = fc == null ? '' : fc <= target ? 'ok' : fc <= target + 0.05 ? 'warn' : 'bad';
    return `<div class="item dish" data-action="edit-dish" data-id="${d.id}">
      <div class="item-main"><div class="item-title">${esc(d.name)} ${badge(pct(fc) + ' food cost', cls)}</div>
        <div class="muted small">Sells ${money(d.price)} · costs ${money(c)} · <b>you keep ${money(d.price - c)}</b>/plate</div>
        <div class="muted small">${(d.ingredients || []).map(i => `${esc(pname(i.productId))} ${fmtQty(i.qty, 3)} ${esc(P(i.productId)?.unit || '')}`).join(' · ') || 'No ingredients yet'}</div>
        ${fc != null && fc > target ? `<div class="small warn-text">To hit ${S.settings.foodCostTarget}% charge ${money(c / target)}</div>` : ''}
      </div></div>`;
  }).join('') : empty('No dishes yet. Add one to see what each plate costs you.')}`;
};
function ingRowHTML(i = { productId: '', qty: '' }) {
  return `<div class="ing-row"><select name="ingProduct">${productOptions(i.productId, 'Ingredient…')}</select>
    <input name="ingQty" type="number" step="any" min="0" inputmode="decimal" value="${i.qty}" placeholder="qty">
    <span class="unit">${esc(P(i.productId)?.unit || '')}</span>
    <button type="button" class="icon-btn" data-action="ing-remove" aria-label="Remove">✕</button></div>`;
}
function dishModal(id) {
  const d = id ? dish(id) : { name: '', price: '', ingredients: [] };
  openModal(`<form data-form="dish" data-calc="dish" class="form">
    <h2>${id ? 'Edit dish' : 'New dish'}</h2>
    <input type="hidden" name="id" value="${id || ''}">
    <div class="grid2">
      <label>Name<input name="name" required value="${esc(d.name)}" placeholder="e.g. Shrimp tacos (3)"></label>
      <label>Menu price<input name="price" type="number" step="0.01" min="0" inputmode="decimal" required value="${d.price}"></label>
    </div>
    <h3>Ingredients per plate</h3>
    <p class="muted small">Use the item's unit: ¼ lb of shrimp = 0.25, 3 tortillas from a 30-pack = 0.1. Include packaging (box, napkin) too.</p>
    <div id="ingRows">${(d.ingredients.length ? d.ingredients : [{ productId: '', qty: '' }]).map(ingRowHTML).join('')}</div>
    <button type="button" class="btn sm" data-action="ing-add">+ Ingredient</button>
    <div class="alert-row total" id="dishCalc"></div>
    <div class="row between actions">
      ${id ? `<button type="button" class="btn danger-ghost" data-action="delete-dish" data-id="${id}">Delete</button>` : '<span></span>'}
      <div class="row gap"><button type="button" class="btn" data-action="close-modal">Cancel</button><button class="btn primary">Save</button></div>
    </div>
  </form>`);
  updateDishCalc($('#modal form'));
}
function readDishForm(form) {
  const fd = new FormData(form);
  const ps = fd.getAll('ingProduct'), qs = fd.getAll('ingQty');
  return { name: (fd.get('name') || '').trim(), price: num(fd.get('price')), ingredients: ps.map((p, i) => ({ productId: p, qty: num(qs[i]) })).filter(x => x.productId && x.qty > 0) };
}
function updateDishCalc(form) {
  const el = $('#dishCalc'); if (!el) return;
  const d = readDishForm(form), c = dishCost(d), t = S.settings.foodCostTarget / 100;
  el.innerHTML = `<span>Plate cost <b>${money(c)}</b>${d.price ? ` · ${pct(c / d.price)}` : ''}</span><span class="small">At ${S.settings.foodCostTarget}%: ${money(c / t)}</span>`;
}

// ----- More -----
views.more = () => {
  const tabs = [['waste', '🗑️ Waste'], ['reports', '📊 Reports'], ['data', '💾 Data'], ['settings', '⚙️ Settings']];
  return `<div class="seg">${tabs.map(([k, l]) => `<button class="${ui.moreTab === k ? 'on' : ''}" data-action="more-tab" data-k="${k}">${l}</button>`).join('')}</div>
    ${moreViews[ui.moreTab]()}`;
};
const moreViews = {
  waste() {
    const wk = periodRange('week', 0), mo = periodRange('month', 0);
    const list = S.waste.slice().sort(byDate).reverse().slice(0, 40);
    return `<section class="card"><h2>🗑️ Log waste</h2>
      <p class="muted small">Tracking what you throw away shows where money leaks — and helps you buy less of what spoils.</p>
      <form data-form="waste" class="form">
        <select name="productId" required>${productOptions()}</select>
        <div class="grid2"><label>Quantity<input type="number" name="qty" step="any" min="0" inputmode="decimal" required></label>
        <label>Reason<select name="reason">${WASTE_REASONS.map(r => `<option>${r}</option>`).join('')}</select></label></div>
        <div class="row end"><button class="btn primary">Log waste</button></div>
      </form></section>
      <section class="card">
        <div class="kpis two">${kpi('This week', money(sum(S.waste.filter(w => inRange(w.date, wk)), w => w.cost)))}${kpi('This month', money(sum(S.waste.filter(w => inRange(w.date, mo)), w => w.cost)))}</div>
        ${list.length ? list.map(w => `<div class="item compact"><div class="item-main"><div class="item-title">${esc(pname(w.productId))} · ${fmtQty(w.qty)} ${esc(P(w.productId)?.unit || '')}</div>
          <div class="muted small">${longDate(w.date)} · ${esc(w.reason)}</div></div><b>${money(w.cost)}</b>
          <button class="icon-btn" data-action="delete-waste" data-id="${w.id}" aria-label="Delete">✕</button></div>`).join('') : empty('No waste logged. Nice!')}
      </section>`;
  },
  reports() {
    const rows = [];
    for (let i = 0; i > -6; i--) { const r = periodRange('month', i); rows.push({ label: rangeLabel('month', i), ...totals(r) }); }
    const wk = [];
    for (let i = 0; i > -8; i--) { const r = periodRange('week', i); wk.push({ label: shortDate(r[0]), ...totals(r) }); }
    const tbl = rs => `<div class="table-wrap"><table class="table"><tr><th>Period</th><th>Sales</th><th>Ingred.</th><th>Other</th><th>Profit</th><th>Food %</th></tr>
      ${rs.map(r => `<tr><td>${r.label}</td><td>${money(r.rev)}</td><td>${money(r.ingredients)}</td><td>${money(r.exp - r.ingredients)}</td><td class="${r.profit < 0 ? 'neg' : 'pos'}">${money(r.profit)}</td><td>${pct(r.foodCost)}</td></tr>`).join('')}</table></div>`;
    return `<section class="card"><h2>Profit & loss by month</h2>${tbl(rows)}</section>
      <section class="card"><h2>By week</h2>${tbl(wk)}</section>
      <section class="card"><h2>Export to spreadsheet (CSV)</h2>
        <p class="muted small">Handy for your accountant and taxes.</p>
        <div class="row wrap gap">
          <button class="btn" data-action="csv" data-k="sales">Sales</button>
          <button class="btn" data-action="csv" data-k="expenses">Expenses</button>
          <button class="btn" data-action="csv" data-k="inventory">Inventory</button>
          <button class="btn" data-action="csv" data-k="prices">Price history</button>
          <button class="btn" data-action="csv" data-k="waste">Waste</button>
        </div></section>`;
  },
  data() {
    const last = localStorage.getItem('truckbook.lastBackup');
    return `<section class="card"><h2>💾 Backup</h2>
      <p class="muted small">Everything lives on this device. Download a backup every week (email it to yourself or put it in Google Drive) — if the phone gets lost, you keep your numbers.</p>
      <p class="small">Last backup: <b>${last ? longDate(last) : 'never'}</b></p>
      <div class="row wrap gap"><button class="btn primary" data-action="backup">Download backup</button>
        <label class="btn">Restore from file<input type="file" accept=".json,application/json" data-change="import" hidden></label></div>
    </section>
    <section class="card"><h2>Sample data</h2>
      <p class="muted small">Replace everything with a demo seafood truck to explore the app.</p>
      <button class="btn" data-action="load-sample">Load sample data</button></section>
    <section class="card danger-zone"><h2>Danger zone</h2>
      <button class="btn danger-ghost" data-action="wipe">Erase all data</button></section>`;
  },
  settings() {
    const s = S.settings;
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    return `<section class="card"><h2>Settings</h2><form data-form="settings" class="form">
      <label>Business name<input name="name" value="${esc(s.name)}"></label>
      <div class="grid2">
        <label>Currency code<input name="currency" value="${esc(s.currency)}" maxlength="3" placeholder="USD, MXN, EUR…"></label>
        <label>Week starts on<select name="weekStart">${days.map((d, i) => `<option value="${i}" ${+s.weekStart === i ? 'selected' : ''}>${d}</option>`).join('')}</select></label>
        <label>Food cost goal (%)<input name="foodCostTarget" type="number" min="5" max="80" step="1" value="${s.foodCostTarget}"></label>
      </div>
      <p class="muted small">Most food trucks aim for 28–35% food cost. Seafood often runs a bit higher.</p>
      <div class="row end"><button class="btn primary">Save settings</button></div>
    </form></section>`;
  },
};

// ---------- Modal & toast ----------
function openModal(html) { $('#modalBody').innerHTML = html; const m = $('#modal'); if (!m.open) m.showModal(); }
function closeModal() { const m = $('#modal'); if (m.open) m.close(); }
let toastT;
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2600); }

function render() {
  if (!views[ui.tab]) ui.tab = 'home';
  $('#view').innerHTML = views[ui.tab]();
  $$('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === ui.tab));
  $('#bizName').textContent = S.settings.name || 'TruckBook';
  $('#todayLabel').textContent = longDate(today());
  document.title = `${S.settings.name || 'TruckBook'} · TruckBook`;
}
function go(tab) { ui.tab = tab; history.replaceState(null, '', '#' + tab); render(); window.scrollTo(0, 0); }
const refreshInv = () => { const el = $('#invList'); el ? (el.innerHTML = invListHTML()) : render(); };

// ---------- CSV / files ----------
function download(name, text, type = 'text/csv') {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}
const csvCell = v => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
const toCSV = rows => rows.map(r => r.map(csvCell).join(',')).join('\n');
const CSV = {
  sales: () => [['Date', 'Location', 'Cash', 'Card', 'Total', 'Plates', 'Note'], ...S.sales.slice().sort(byDate).map(s => [s.date, s.location, s.cash, s.card, s.total, (s.plates || []).map(p => `${p.count}x ${p.name}`).join('; '), s.note])],
  expenses: () => [['Date', 'Category', 'Amount', 'Note'], ...S.expenses.slice().sort(byDate).map(e => [e.date, e.category, e.amount, e.note])],
  inventory: () => [['Item', 'Category', 'Qty', 'Unit', 'Unit cost', 'Value', 'Par', 'Supplier', 'Last restock'], ...S.products.map(p => [p.name, catOf(p.category).label, p.qty, p.unit, p.cost, r3(p.qty * p.cost), p.par ?? '', p.supplier, p.lastRestock || ''])],
  prices: () => [['Date', 'Item', 'Unit', 'Unit price', 'Qty', 'Supplier'], ...S.prices.slice().sort(byDate).map(h => [h.date, pname(h.productId), P(h.productId)?.unit || '', h.unitCost, h.qty || '', h.supplier || ''])],
  waste: () => [['Date', 'Item', 'Qty', 'Reason', 'Cost'], ...S.waste.slice().sort(byDate).map(w => [w.date, pname(w.productId), w.qty, w.reason, w.cost])],
};

// ---------- Actions (clicks) ----------
const actions = {
  goto: el => go(el.dataset.tab),
  'week-nav': el => { ui.weekOffset = Math.min(0, ui.weekOffset + +el.dataset.d); render(); },
  'sales-nav': el => { ui.salesOffset = Math.min(0, ui.salesOffset + +el.dataset.d); render(); },
  'exp-nav': el => { ui.expOffset = Math.min(0, ui.expOffset + +el.dataset.d); render(); },
  'exp-period': el => { ui.expPeriod = el.dataset.k; ui.expOffset = 0; render(); },
  'more-tab': el => { ui.moreTab = el.dataset.k; render(); },
  'close-modal': closeModal,
  'start-fresh': () => { go('stock'); productModal(); },
  'load-sample': () => {
    if (!isEmpty() && !confirm('Replace ALL current data with the sample truck?')) return;
    loadSample(); ui.draft = null; go('home'); toast('Sample data loaded — poke around!');
  },
  wipe: () => {
    if (!confirm('Erase ALL data on this device? This cannot be undone.')) return;
    if (!confirm('Really sure? Consider downloading a backup first.')) return;
    S = emptyState(); save(); ui.draft = null; go('home'); toast('All data erased');
  },
  // stock
  'add-product': () => productModal(),
  'edit-product': el => productModal(el.dataset.id),
  'inv-filter': el => { ui.invFilter = el.dataset.f; render(); },
  qty: el => {
    const p = P(el.dataset.id); if (!p) return;
    p.qty = r3(Math.max(0, +p.qty + +el.dataset.d * (+p.step || 1)));
    save(); refreshInv();
  },
  'delete-product': el => {
    const p = P(el.dataset.id); if (!p) return;
    const used = S.menu.filter(d => d.ingredients.some(i => i.productId === p.id));
    if (!confirm(`Delete "${p.name}"?${used.length ? `\nIt will be removed from: ${used.map(d => d.name).join(', ')}` : ''}\nPast purchases and sales stay in your records.`)) return;
    used.forEach(d => d.ingredients = d.ingredients.filter(i => i.productId !== p.id));
    S.products = S.products.filter(x => x.id !== p.id);
    save(); closeModal(); render(); toast('Item deleted');
  },
  toss: el => {
    const p = P(el.dataset.id); if (!p) return;
    if (!confirm(`Log ${fmtQty(p.qty)} ${p.unit} of ${p.name} (${money(p.qty * p.cost)}) as waste?`)) return;
    recordWaste(p.id, p.qty, 'Expired / spoiled'); save(); render(); toast('Logged as waste');
  },
  // buy
  'draft-new': () => { ui.draft = newDraft(); render(); },
  'draft-from-list': () => {
    const list = shoppingList();
    const sups = [...new Set(list.map(x => x.p.supplier).filter(Boolean))];
    ui.draft = newDraft(list.map(x => blankLine(x.p.id, x.need)));
    if (sups.length === 1) ui.draft.supplier = sups[0];
    render(); $('#lines')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  },
  'draft-add': () => { ui.draft.lines.push(blankLine()); render(); },
  'draft-remove': el => { ui.draft.lines.splice(+el.dataset.i, 1); if (!ui.draft.lines.length) ui.draft.lines.push(blankLine()); render(); },
  'draft-cancel': () => { ui.draft = null; render(); },
  'draft-save': () => {
    const d = ui.draft;
    const lines = d.lines.filter(l => l.productId && num(l.qty) > 0).map(l => ({ productId: l.productId, qty: r3(num(l.qty)), unitCost: r3(num(l.unitCost)) }));
    if (!lines.length) return toast('Add at least one item with a quantity');
    if (d.lines.some(l => l.productId && num(l.qty) > 0 && optNum(l.unitCost) == null) && !confirm('Some lines have no price. Save them at $0?')) return;
    const pur = { id: uid(), date: d.date || today(), supplier: (d.supplier || '').trim(), lines, total: r3(sum(lines, l => l.qty * l.unitCost)), ts: Date.now() };
    applyPurchase(pur); save(); ui.draft = null; render(); toast(`Purchase saved · ${money(pur.total)}`);
  },
  'delete-purchase': el => {
    if (!confirm('Delete this purchase? Its quantities will be removed from stock and its expense deleted.')) return;
    deletePurchase(el.dataset.id); save(); render(); toast('Purchase deleted');
  },
  'share-list': async () => {
    const list = shoppingList();
    const groups = {};
    list.forEach(x => (groups[x.p.supplier || 'Anywhere'] ||= []).push(x));
    const text = `🛒 ${S.settings.name} – shopping list (${shortDate(today())})\n` + Object.entries(groups).map(([s, xs]) =>
      `\n${s}:\n` + xs.map(x => `☐ ${x.p.name}: ${fmtQty(x.need)} ${x.p.unit}`).join('\n')).join('\n') + `\n\nEst. ${money(sum(list, x => x.est))}`;
    try {
      if (navigator.share) await navigator.share({ text });
      else { await navigator.clipboard.writeText(text); toast('List copied — paste it in a text message'); }
    } catch (e) { if (e.name !== 'AbortError') { try { await navigator.clipboard.writeText(text); toast('List copied'); } catch { alert(text); } } }
  },
  // sales
  'delete-sale': el => {
    const s = S.sales.find(x => x.id === el.dataset.id); if (!s) return;
    if (!confirm('Delete this sales day?')) return;
    restoreStock(s.deductions); S.sales = S.sales.filter(x => x !== s); save(); render(); toast('Deleted');
  },
  // expenses
  'add-expense': () => expenseModal(),
  'edit-expense': el => expenseModal(el.dataset.id),
  'delete-expense': el => { if (!confirm('Delete this expense?')) return; S.expenses = S.expenses.filter(x => x.id !== el.dataset.id); save(); closeModal(); render(); },
  // menu
  'add-dish': () => { if (!S.products.length) { toast('Add your ingredients in Stock first'); return go('stock'); } dishModal(); },
  'edit-dish': el => dishModal(el.dataset.id),
  'ing-add': () => { $('#ingRows').insertAdjacentHTML('beforeend', ingRowHTML()); },
  'ing-remove': el => { el.closest('.ing-row').remove(); updateDishCalc($('#modal form')); },
  'delete-dish': el => { if (!confirm('Delete this dish?')) return; S.menu = S.menu.filter(d => d.id !== el.dataset.id); save(); closeModal(); render(); },
  // waste
  'delete-waste': el => {
    const w = S.waste.find(x => x.id === el.dataset.id); if (!w || !confirm('Delete this entry and put the quantity back in stock?')) return;
    restoreStock([{ productId: w.productId, qty: w.qty }]); S.waste = S.waste.filter(x => x !== w); save(); render();
  },
  // data
  csv: el => download(`truckbook-${el.dataset.k}-${today()}.csv`, toCSV(CSV[el.dataset.k]())),
  backup: () => {
    download(`truckbook-backup-${today()}.json`, JSON.stringify(S, null, 1), 'application/json');
    localStorage.setItem('truckbook.lastBackup', today()); render();
  },
};

// ---------- Forms ----------
const forms = {
  product(fd) {
    const id = fd.get('id');
    const data = {
      name: fd.get('name').trim(), category: fd.get('category'), unit: (fd.get('unit') || 'each').trim(),
      qty: r3(Math.max(0, num(fd.get('qty')))), cost: r3(num(fd.get('cost'))),
      par: optNum(fd.get('par')), low: optNum(fd.get('low')), shelfLife: optNum(fd.get('shelfLife')),
      step: num(fd.get('step')) || 1, supplier: (fd.get('supplier') || '').trim(), notes: (fd.get('notes') || '').trim(),
    };
    if (!data.name) return toast('Name is required');
    let p = id && P(id);
    const oldCost = p ? p.cost : null;
    if (p) Object.assign(p, data);
    else { p = { id: uid(), lastRestock: data.qty > 0 ? today() : null, ...data }; S.products.push(p); }
    if (data.cost > 0 && data.cost !== oldCost) S.prices.push({ id: uid(), productId: p.id, date: today(), unitCost: data.cost, qty: 0, supplier: '', ts: Date.now() });
    if (data.supplier && !S.suppliers.includes(data.supplier)) S.suppliers.push(data.supplier);
    save(); closeModal();
    if (ui.draft && !id) { const blank = ui.draft.lines.find(l => !l.productId); blank ? Object.assign(blank, blankLine(p.id)) : ui.draft.lines.push(blankLine(p.id)); }
    render(); toast(id ? 'Saved' : `Added ${p.name}`);
  },
  expense(fd) {
    const id = fd.get('id');
    const data = { date: fd.get('date'), category: fd.get('category'), amount: r3(num(fd.get('amount'))), note: (fd.get('note') || '').trim() };
    if (id) Object.assign(S.expenses.find(x => x.id === id), data);
    else S.expenses.push({ id: uid(), ts: Date.now(), ...data });
    save(); closeModal(); render(); toast('Expense saved');
  },
  sale(fd, form) {
    const s = readSaleForm(form);
    if (!(s.cash + s.card) && !s.plates.length) return toast('Enter cash/card amounts or plates sold');
    const sale = recordSale(s); save(); render(); toast(`Saved ${money(sale.total)} for ${shortDate(sale.date)}`);
  },
  dish(fd, form) {
    const id = fd.get('id'), data = readDishForm(form);
    if (id) Object.assign(dish(id), data); else S.menu.push({ id: uid(), ...data });
    save(); closeModal(); render(); toast('Dish saved');
  },
  waste(fd) {
    const w = recordWaste(fd.get('productId'), num(fd.get('qty')), fd.get('reason'));
    if (!w) return toast('Choose an item');
    save(); render(); toast(w.qty ? `Logged ${money(w.cost)} of waste` : 'Nothing in stock to remove');
  },
  settings(fd) {
    const cur = (fd.get('currency') || 'USD').trim().toUpperCase();
    try { new Intl.NumberFormat(undefined, { style: 'currency', currency: cur }); } catch { return toast('Unknown currency code'); }
    Object.assign(S.settings, { name: fd.get('name').trim() || 'My Truck', currency: cur, weekStart: +fd.get('weekStart'), foodCostTarget: Math.min(80, Math.max(5, num(fd.get('foodCostTarget')) || 30)) });
    save(); render(); toast('Settings saved');
  },
};

// ---------- Change handlers ----------
const changes = {
  'set-qty': el => { const p = P(el.dataset.id); if (!p) return; p.qty = r3(Math.max(0, num(el.value))); save(); refreshInv(); },
  import: el => {
    const f = el.files[0]; if (!f) return;
    const rd = new FileReader();
    rd.onload = () => {
      try {
        const data = JSON.parse(rd.result);
        if (!data || !Array.isArray(data.products)) throw new Error('bad');
        if (!confirm('Replace current data with this backup?')) return;
        S = Object.assign(emptyState(), data); S.settings = Object.assign(emptyState().settings, data.settings);
        save(); ui.draft = null; render(); toast('Backup restored');
      } catch { toast('That file is not a TruckBook backup'); }
    };
    rd.readAsText(f);
  },
};

// ---------- Event wiring ----------
document.addEventListener('click', e => {
  const tab = e.target.closest('#tabs button');
  if (tab) return go(tab.dataset.tab);
  const el = e.target.closest('[data-action]');
  if (el && actions[el.dataset.action]) { e.preventDefault(); actions[el.dataset.action](el, e); }
});
document.addEventListener('submit', e => {
  const f = e.target, h = forms[f.dataset.form];
  if (h) { e.preventDefault(); h(new FormData(f), f); }
});
document.addEventListener('input', e => {
  const el = e.target;
  if (el.dataset.search === 'inv') { ui.invSearch = el.value; $('#invList').innerHTML = invListHTML(); return; }
  if (el.dataset.draft && ui.draft) {
    const f = el.dataset.draft;
    if (f === 'date' || f === 'supplier') { ui.draft[f] = el.value; return; }
    if (f === 'productId') return;
    const i = +el.dataset.i, l = ui.draft.lines[i]; l[f] = el.value;
    $('#lt' + i).textContent = money(lineTotal(l));
    $('#lh' + i).innerHTML = priceHint(l);
    $('#draftTotal').textContent = money(sum(ui.draft.lines, lineTotal));
    return;
  }
  const calc = el.closest('[data-calc]');
  if (calc?.dataset.calc === 'sale') updateSaleCalc(calc);
  if (calc?.dataset.calc === 'dish') updateDishCalc(calc);
});
document.addEventListener('change', e => {
  const el = e.target;
  if (el.dataset.draft === 'productId' && ui.draft) {
    const i = +el.dataset.i; ui.draft.lines[i] = { ...blankLine(el.value), qty: ui.draft.lines[i].qty }; render(); return;
  }
  if (el.name === 'ingProduct') { el.parentElement.querySelector('.unit').textContent = P(el.value)?.unit || ''; updateDishCalc(el.form); }
  const h = el.dataset.change && changes[el.dataset.change];
  if (h) h(el);
});
$('#modal').addEventListener('click', e => { if (e.target.id === 'modal') closeModal(); });
window.addEventListener('hashchange', () => { const t = location.hash.slice(1); if (views[t] && t !== ui.tab) { ui.tab = t; render(); } });

// ---------- Sample data ----------
function loadSample() {
  S = emptyState();
  S.settings.name = 'Ocean Tacos';
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const mk = (name, category, unit, cost, par, low, shelfLife, supplier, step = 1) => {
    const p = { id: uid(), name, category, unit, cost, qty: 0, par, low, shelfLife, step, supplier, notes: '', lastRestock: null };
    S.products.push(p); return p;
  };
  const SEA = 'Gulf Seafood Co', MKT = 'Farmers market', DEP = 'Restaurant Depot';
  const p = {
    shrimp: mk('Shrimp 21/25', 'seafood', 'lb', 8.5, 35, 8, 4, SEA),
    fish: mk('Tilapia fillet', 'seafood', 'lb', 4.2, 24, 6, 3, SEA),
    squid: mk('Calamari rings', 'seafood', 'lb', 6, 24, 6, 3, SEA),
    crab: mk('Imitation crab', 'seafood', 'lb', 3.5, 15, 4, 7, SEA),
    tom: mk('Roma tomatoes', 'produce', 'lb', 1.3, 10, 3, 6, MKT),
    onion: mk('Red onion', 'produce', 'lb', 1, 8, 2, 14, MKT),
    cil: mk('Cilantro', 'produce', 'bunch', 0.8, 22, 5, 5, MKT),
    lime: mk('Limes', 'produce', 'lb', 1.6, 20, 5, 14, MKT),
    avo: mk('Avocados', 'produce', 'each', 1.1, 55, 12, 5, MKT),
    cab: mk('Green cabbage', 'produce', 'head', 1.5, 9, 2, 10, MKT),
    jal: mk('Jalapeños', 'produce', 'lb', 1.8, 3, 1, 10, MKT, 0.5),
    cuc: mk('Cucumber', 'produce', 'each', 0.7, 32, 8, 7, MKT),
    tort: mk('Corn tortillas (30 ct)', 'dry', 'pack', 3.2, 15, 4, 10, DEP),
    tost: mk('Tostadas (20 ct)', 'dry', 'pack', 2.8, 8, 2, 60, DEP),
    mayo: mk('Mayonnaise', 'sauces', 'gal', 14, 3, 1, 60, DEP, 0.25),
    chip: mk('Chipotle sauce', 'sauces', 'bottle', 4.5, 6, 2, 90, DEP),
    box: mk('Clamshell boxes (200 ct)', 'packaging', 'case', 32, 3, 1, null, DEP, 0.25),
    nap: mk('Napkins', 'packaging', 'pack', 6, 4, 1, null, DEP),
    water: mk('Bottled water (24 ct)', 'drinks', 'case', 6, 3, 1, null, DEP),
    coke: mk('Mexican Coke (24 ct)', 'drinks', 'case', 28, 3, 1, null, DEP, 0.5),
  };
  const D = (name, price, ings) => S.menu.push({ id: uid(), name, price, ingredients: ings.map(([pp, q]) => ({ productId: pp.id, qty: q })) });
  D('Shrimp tacos (3)', 14, [[p.shrimp, 0.3], [p.tort, 0.1], [p.cab, 0.06], [p.cil, 0.1], [p.lime, 0.06], [p.chip, 0.04], [p.avo, 0.25], [p.box, 0.005], [p.nap, 0.01]]);
  D('Fish tacos (3)', 12, [[p.fish, 0.33], [p.tort, 0.1], [p.cab, 0.06], [p.mayo, 0.012], [p.cil, 0.1], [p.lime, 0.06], [p.box, 0.005], [p.nap, 0.01]]);
  D('Ceviche tostada', 9, [[p.shrimp, 0.18], [p.tost, 0.05], [p.tom, 0.12], [p.onion, 0.05], [p.cuc, 0.25], [p.cil, 0.1], [p.lime, 0.12], [p.avo, 0.25], [p.jal, 0.02], [p.box, 0.005]]);
  D('Fried calamari', 11, [[p.squid, 0.35], [p.lime, 0.05], [p.chip, 0.04], [p.mayo, 0.01], [p.box, 0.005], [p.nap, 0.01]]);
  D('Crab tostada', 8, [[p.crab, 0.2], [p.tost, 0.05], [p.mayo, 0.01], [p.cuc, 0.2], [p.avo, 0.25], [p.box, 0.005]]);
  D('Bottled water', 2, [[p.water, 1 / 24]]);
  D('Mexican Coke', 3.5, [[p.coke, 1 / 24]]);

  // weekly shopping trips; produce prices swing a lot week to week, seafood a little
  const base = Object.fromEntries(Object.entries(p).map(([k, it]) => [k, it.cost]));
  const t0 = today(), START = -44;
  for (let off = START; off <= 0; off++) {
    const date = addDays(t0, off);
    if ((off - START) % 7 === 0) {
      const idx = (off - START) / 7, lastTrip = off > -7;
      const bySup = {};
      Object.keys(p).forEach(k => {
        const it = p[k], need = it.par - it.qty;
        if (need <= 0.01) return;
        if (idx > 0 && !it.shelfLife && it.qty > it.par * 0.5) return; // non-perishables not every week
        if (lastTrip && k === 'squid') return; // skipped → shows up as an expiring/expired alert
        const swingPct = it.category === 'produce' ? 0.35 : it.category === 'seafood' ? 0.1 : 0.03;
        const price = idx === 0 ? base[k] : Math.round(base[k] * (1 - swingPct / 2 + rnd() * swingPct) * 100) / 100;
        (bySup[it.supplier] ||= []).push({ productId: it.id, qty: Math.ceil(need * 4) / 4, unitCost: price });
      });
      Object.entries(bySup).forEach(([sup, lines]) => applyPurchase({ id: uid(), date, supplier: sup, lines, total: r3(sum(lines, l => l.qty * l.unitCost)), ts: Date.now() }));
    }
    const wd = parseISO(date).getDay();
    if (wd !== 1 && off < 0 && off !== START) { // closed Mondays
      const busy = wd === 5 || wd === 6 ? 1.6 : wd === 0 ? 1.3 : 1;
      const plates = S.menu.map(m => ({ menuId: m.id, name: m.name, price: m.price, count: Math.round((m.price > 5 ? 9 : 6) * busy * (0.6 + rnd() * 0.8)) }));
      const total = sum(plates, x => x.count * x.price);
      const card = Math.round(total * (0.6 + rnd() * 0.2));
      const locs = ['Downtown lot', 'Brewery Row', 'Beach Pier'];
      recordSale({ date, location: wd === 5 || wd === 6 ? locs[1 + (wd % 2)] : locs[0], cash: r3(total - card), card, plates, deduct: true, note: '' });
    }
    if (off < 0 && wd === 2) S.expenses.push({ id: uid(), date, category: 'Fuel', amount: r3(55 + rnd() * 25), note: 'Truck gas', ts: Date.now() });
    if (off < 0 && wd === 4) S.expenses.push({ id: uid(), date, category: 'Propane', amount: 38, note: 'Tank refill', ts: Date.now() });
    if (off < 0 && wd === 0) S.expenses.push({ id: uid(), date, category: 'Card / App fees', amount: r3(sum(S.sales.filter(s => daysBetween(s.date, date) < 7 && daysBetween(s.date, date) >= 0), s => s.card) * 0.029), note: 'Weekly processing fees', ts: Date.now() });
  }
  [-40, -10].forEach(o => {
    S.expenses.push({ id: uid(), date: addDays(t0, o), category: 'Commissary / Parking', amount: 450, note: 'Monthly commissary kitchen', ts: Date.now() });
    S.expenses.push({ id: uid(), date: addDays(t0, o + 2), category: 'Insurance', amount: 135, note: 'Monthly liability policy', ts: Date.now() });
  });
  S.expenses.push({ id: uid(), date: addDays(t0, -33), category: 'Permits & Licenses', amount: 180, note: 'Health permit renewal', ts: Date.now() });
  S.expenses.push({ id: uid(), date: addDays(t0, -19), category: 'Repairs & Maintenance', amount: 95, note: 'Fryer thermostat', ts: Date.now() });
  S.expenses.push({ id: uid(), date: addDays(t0, -4), category: 'Event fees', amount: 75, note: 'Brewery Row spot', ts: Date.now() });
  recordWaste(p.cil.id, 1, 'Expired / spoiled', addDays(t0, -9));
  recordWaste(p.avo.id, 3, 'Expired / spoiled', addDays(t0, -2));
  recordWaste(p.fish.id, 0.5, 'Cooking mistake', addDays(t0, -5));
  save();
}

// ---------- Boot ----------
render();
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
