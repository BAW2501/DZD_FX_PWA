'use strict';

const KEY = 'dzd_v3', TTL = 30 * 60 * 1000;
const CUR = [['DZD','🇩🇿'],['EUR','🇪🇺'],['USD','🇺🇸'],['GBP','🇬🇧'],['CAD','🇨🇦'],['CHF','🇨🇭'],['HUF','🇭🇺'],
             ['TRY','🇹🇷'],['CNY','🇨🇳'],['JPY','🇯🇵'],['INR','🇮🇳'],['SAR','🇸🇦'],['MAD','🇲🇦'],['TND','🇹🇳']];
const $ = s => document.querySelector(s);
const S = { from:'EUR', to:'DZD', side:'from', range:90, rows:[], bank:null, off:{}, at:0, v:[], pts:[] };

// ── Math ───────────────────────────────────────────────────────────────────
// rows are [date, buy, sell] of EUR→DZD street rate. DZD goes through that rate,
// every other currency goes through the official EUR rates.
const mid   = r => (r[1] + r[2]) / 2;
const last  = () => S.rows[S.rows.length - 1];
const ready = () => S.rows.length > 0 && !!S.off.USD;
const eur   = (c, row = last()) => c === 'DZD' ? 1 / mid(row) : 1 / S.off[c];
const rate  = (a, b, row) => eur(a, row) / eur(b, row);

const dec  = n => n >= 100 ? 2 : n >= 1 ? 4 : 6;
const grp  = s => s.replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0');           // 1234567 -> 1 234 567
const show = n => {
  if (!Number.isFinite(n)) return '-';
  const [i, f] = (+Math.abs(n).toFixed(dec(Math.abs(n)))).toString().split('.');
  return (n < 0 ? '-' : '') + grp(i) + (f ? '.' + f : '');
};
const num  = s => parseFloat(String(s).replace(/[\s\u00a0\u202f]/g, '').replace(',', '.'));
const fit  = el => { const n = el.value.length; el.style.fontSize = n > 14 ? '22px' : n > 11 ? '28px' : ''; };

// Re-format an input as the user types, keeping the caret next to the same digit.
function typed(el) {
  const keep = el.value.slice(0, el.selectionStart).replace(/[^\d.,]/g, '').length;
  let s = el.value.replace(/,/g, '.').replace(/[^\d.]/g, '');
  const k = s.indexOf('.');
  if (k >= 0) s = s.slice(0, k + 1) + s.slice(k + 1).replace(/\./g, '');
  let [i, f] = s.split('.');
  i = i.replace(/^0+(?=\d)/, '');
  const out = grp(i) + (f !== undefined ? '.' + f : '');
  el.value = out;
  let c = 0, n = 0;
  while (c < out.length && n < keep) { if (/[\d.]/.test(out[c])) n++; c++; }
  el.setSelectionRange(c, c);
  fit(el);
}
const fd   = d => new Date(d).toLocaleDateString('en-GB', { day:'numeric', month:'short', timeZone:'UTC' });

// ── Converter ──────────────────────────────────────────────────────────────
function calc() {
  if (!ready()) return;
  const a = $('#from-amt'), b = $('#to-amt');
  const [src, dst, x, y] = S.side === 'from' ? [a, b, S.from, S.to] : [b, a, S.to, S.from];
  const n = num(src.value);
  const out = n * rate(x, y);
  dst.value = Number.isFinite(out) ? show(out) : '';
  fit(a); fit(b);
}

function drawRate() {
  $('#rate').textContent = ready() ? `1 ${S.from} = ${show(rate(S.from, S.to))} ${S.to}` : '\u00a0';
}

function drawGap() {
  const ok = ready() && S.bank && S.bank[0];
  $('#gap').hidden = !ok;
  if (!ok) return;
  const b = (S.bank[0] + S.bank[1]) / 2, r = mid(last());
  $('#bank').textContent = `${show(b)} DZD`;
  $('#real').textContent = `${show(r)} DZD`;
  $('#gap-note').textContent = `For 1 EUR. The real rate is ${Math.round((r / b - 1) * 100)}% higher than the bank rate.`;
}

function drawRef() {
  if (!ready()) return;
  const amts = S.from === 'DZD' ? [1000, 5000, 10000] : [10, 100, 1000];
  $('#ref').innerHTML = amts.map(a =>
    `<li><span>${show(a)} ${S.from}</span><b>${show(a * rate(S.from, S.to))} ${S.to}</b></li>`).join('');
}

// ── Chart ──────────────────────────────────────────────────────────────────
function drawChart() {
  const box = $('#chart'), plot = $('#plot');
  const cut = Date.now() - S.range * 864e5;
  const pts = S.rows.filter(r => new Date(r[0]) >= cut);
  const empty = !(S.from === 'DZD' || S.to === 'DZD') || pts.length < 2 || !ready();
  box.classList.toggle('empty', empty);
  if (empty) return;

  const v = pts.map(r => rate(S.from, S.to, r));
  const lo = Math.min(...v), sp = Math.max(...v) - lo || 1;
  const Y = x => 10 + (1 - (x - lo) / sp) * 140;
  const d = v.map((x, i) => `${i ? 'L' : 'M'}${(i / (v.length - 1) * 600).toFixed(1)} ${Y(x).toFixed(1)}`).join('');
  Object.assign(S, { v, pts, Y });

  plot.innerHTML =
    `<svg viewBox="0 0 600 160" preserveAspectRatio="none" aria-hidden="true">
       <defs><linearGradient id="g" x1="0" x2="0" y1="0" y2="1">
         <stop offset="0" style="stop-color:var(--line);stop-opacity:.22"/><stop offset="1" style="stop-color:var(--line);stop-opacity:0"/>
       </linearGradient></defs>
       <path class="ar" d="${d}L600 160L0 160Z" fill="url(#g)"/><path class="ln" d="${d}"/>
     </svg><em class="hi">${show(Math.max(...v))}</em><em class="lo">${show(lo)}</em><i id="dot"></i>`;
  pick(v.length - 1);
}

function pick(i) {
  const { v, pts, Y } = S, x = v[i], p = (x - v[0]) / v[0] * 100;
  $('#cl').textContent = `1 ${S.from} in ${S.to}`;
  $('#cv').textContent = show(x);
  $('#cp').textContent = `${p >= 0 ? '+' : ''}${p.toFixed(1)}%`;
  $('#cp').className = p >= 0 ? 'up' : 'down';
  $('#cd').textContent = `${fd(pts[i][0])}, since ${fd(pts[0][0])}`;
  const dot = $('#dot');
  dot.style.left = `${i / (v.length - 1) * 100}%`;
  dot.style.top = `${Y(x) / 160 * 100}%`;
}

function bindChart() {
  const plot = $('#plot');
  const at = e => {
    if (S.v.length < 2) return;
    const r = plot.getBoundingClientRect();
    pick(Math.round(Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)) * (S.v.length - 1)));
  };
  plot.addEventListener('pointermove', at);
  plot.addEventListener('pointerleave', () => S.v.length > 1 && pick(S.v.length - 1));
  document.querySelectorAll('.tabs button').forEach(b => b.addEventListener('click', () => {
    S.range = +b.dataset.r;
    document.querySelectorAll('.tabs button').forEach(x => x.setAttribute('aria-pressed', x === b));
    drawChart();
  }));
}

// ── Status + data loading ──────────────────────────────────────────────────
function status(text, off) {
  $('#status span').textContent = text;
  $('#status').classList.toggle('off', !!off);
}

function draw() { calc(); drawRate(); drawGap(); drawChart(); drawRef(); }

async function load(force) {
  if (!S.rows.length) {
    try { Object.assign(S, JSON.parse(localStorage.getItem(KEY)) || {}); } catch {}
  }
  if (ready()) draw();
  if (!force && ready() && Date.now() - S.at < TTL) return status(`Rate from ${fd(last()[0])}`);

  status('Updating');
  try {
    const get = u => fetch(u, { cache: 'no-cache', signal: AbortSignal.timeout(10000) })
      .then(r => { if (!r.ok) throw new Error(r.status); return r.json(); });
    const [r, o] = await Promise.all([get('./rates.json'), get('https://open.er-api.com/v6/latest/EUR')]);
    if (!r.rows || !r.rows.length) throw new Error('empty');
    Object.assign(S, { rows: r.rows, bank: r.bank, off: o.rates, at: Date.now() });
    localStorage.setItem(KEY, JSON.stringify({ rows: S.rows, bank: S.bank, off: S.off, at: S.at }));
    draw();
    status(`Rate from ${fd(last()[0])}`);
  } catch {
    ready() ? status(`Saved rate from ${fd(last()[0])}`, true) : status('Rates unavailable. Tap to retry', true);
  }
}

// ── Wiring ─────────────────────────────────────────────────────────────────
function sync() {
  $('#from').value = S.from;
  $('#to').value = S.to;
  draw();
}

function init() {
  for (const sel of [$('#from'), $('#to')]) {
    sel.innerHTML = CUR.map(([c, f]) => `<option value="${c}">${f} ${c}</option>`).join('');
  }
  $('#from').onchange = e => { if (e.target.value === S.to) S.to = S.from; S.from = e.target.value; sync(); };
  $('#to').onchange   = e => { if (e.target.value === S.from) S.from = S.to; S.to = e.target.value; sync(); };
  for (const el of [$('#from-amt'), $('#to-amt')]) {
    el.onfocus = () => setTimeout(() => el.select());
    el.oninput = () => { S.side = el.id === 'from-amt' ? 'from' : 'to'; typed(el); calc(); };
  }
  $('#swap').onclick = () => {
    [S.from, S.to] = [S.to, S.from];
    const a = $('#from-amt'), b = $('#to-amt');
    [a.value, b.value] = [b.value, a.value];
    S.side = S.side === 'from' ? 'to' : 'from';
    $('#swap').classList.toggle('flip');
    sync();
  };
  $('#status').onclick = () => load(true);
  window.addEventListener('online', () => load(true));
  window.addEventListener('offline', () => ready() && status(`Offline, saved rate from ${fd(last()[0])}`, true));
  bindChart();
  sync();
  load();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('./service-worker.js').catch(() => {});
}

init();
