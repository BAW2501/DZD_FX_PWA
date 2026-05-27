/* ═══════════════════════════════════════
   DZD CONVERTER — app.js
   Vanilla JS, no frameworks
   ═══════════════════════════════════════ */

'use strict';

// ─── CONSTANTS ─────────────────────────────────────────────────────────────
const CACHE_KEY      = 'dzd_rates_v2';
const CACHE_TTL_MS   = 12 * 60 * 60 * 1000; // 12 hours

// CORS proxy for APIs without CORS headers
const CORS_PROXY = 'https://api.allorigins.win/raw?url=';

// Official EUR→X rates (free, no API key)
const EUR_API = 'https://open.er-api.com/v6/latest/EUR';

// ExchangeDZ parallel market API
const DZD_CURRENT_API = 'https://www.exchangedz.com/api/rates/latest?assetId=EUR&source=exchangedz';
const DZD_HISTORY_API = (start, end) =>
  `https://www.exchangedz.com/api/rates/historical?assetId=EUR&start=${start}&end=${end}&sources=exchangedz`;

const CURRENCIES = [
  { code: 'DZD', name: 'Algerian Dinar',      flag: '🇩🇿' },
  { code: 'USD', name: 'US Dollar',            flag: '🇺🇸' },
  { code: 'EUR', name: 'Euro',                 flag: '🇪🇺' },
  { code: 'GBP', name: 'British Pound',        flag: '🇬🇧' },
  { code: 'JPY', name: 'Japanese Yen',         flag: '🇯🇵' },
  { code: 'AUD', name: 'Australian Dollar',    flag: '🇦🇺' },
  { code: 'CAD', name: 'Canadian Dollar',      flag: '🇨🇦' },
  { code: 'CHF', name: 'Swiss Franc',          flag: '🇨🇭' },
  { code: 'CNY', name: 'Chinese Yuan',         flag: '🇨🇳' },
  { code: 'INR', name: 'Indian Rupee',         flag: '🇮🇳' },
  { code: 'GHS', name: 'Ghanaian Cedi',        flag: '🇬🇭' },
  { code: 'NGN', name: 'Nigerian Naira',       flag: '🇳🇬' },
  { code: 'XOF', name: 'CFA Franc (BCEAO)',    flag: '🌍' },
  { code: 'SAR', name: 'Saudi Riyal',          flag: '🇸🇦' },
  { code: 'AED', name: 'UAE Dirham',           flag: '🇦🇪' },
  { code: 'TRY', name: 'Turkish Lira',         flag: '🇹🇷' },
  { code: 'MAD', name: 'Moroccan Dirham',      flag: '🇲🇦' },
  { code: 'TND', name: 'Tunisian Dinar',       flag: '🇹🇳' },
  { code: 'HUF', name: 'Hungarian Forint',     flag: '🇭🇺' },
];

// Quick reference amounts: always show 3 useful conversions
const REF_AMOUNTS = [100, 1000, 10000];

// ─── STATE ─────────────────────────────────────────────────────────────────
const state = {
  fromCurrency: 'DZD',
  toCurrency:   'USD',
  eurToDzd:     null,    // parallel market rate
  officialRates: {},     // EUR → X rates
  history:       [],     // 30-day EUR→DZD parallel
  lastUpdate:    null,
  isOnline:      navigator.onLine,
  isFetching:    false,
  activeInput:   'from', // which input the user last typed in
};

// ─── DOM REFS ───────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);
const fromCurrSel  = $('from-currency');
const toCurrSel    = $('to-currency');
const fromAmtInput = $('from-amount');
const toAmtInput   = $('to-amount');
const swapBtn      = $('swap-btn');
const statusBar    = $('status-bar');
const statusDot    = $('status-dot');
const statusText   = $('status-text');
const statusTime   = $('status-time');
const spinner      = $('refresh-spinner');
const rateLine     = $('rate-line');
const refGrid      = $('ref-grid');
const chartCanvas  = $('rate-chart');
const chartOverlay = $('chart-overlay');
const chartStats   = $('chart-stats');
const chartTitle   = $('chart-title');
const chartDates   = $('chart-dates');
const toast        = $('toast');

// ─── INIT ───────────────────────────────────────────────────────────────────
async function init() {
  populateCurrencySelects();
  bindEvents();
  registerServiceWorker();

  // Load cached data first for instant display
  const cached = loadCache();
  if (cached) {
    applyRates(cached);
    updateStatus('cached');
  }

  // Then fetch fresh data
  await fetchRates();
}

// ─── CURRENCY SELECTS ───────────────────────────────────────────────────────
function populateCurrencySelects() {
  [fromCurrSel, toCurrSel].forEach(sel => {
    CURRENCIES.forEach(c => {
      const opt = document.createElement('option');
      opt.value = c.code;
      opt.textContent = `${c.flag} ${c.code}`;
      opt.title = c.name;
      sel.appendChild(opt);
    });
  });

  fromCurrSel.value = state.fromCurrency;
  toCurrSel.value   = state.toCurrency;
}

// ─── EVENT BINDING ──────────────────────────────────────────────────────────
function bindEvents() {
  // Currency changes
  fromCurrSel.addEventListener('change', () => {
    state.fromCurrency = fromCurrSel.value;
    if (state.fromCurrency === state.toCurrency) flipOtherCurrency('from');
    recalculate();
    updateQuickRef();
    updateChartTitle();
    renderChart();
  });

  toCurrSel.addEventListener('change', () => {
    state.toCurrency = toCurrSel.value;
    if (state.fromCurrency === state.toCurrency) flipOtherCurrency('to');
    recalculate();
    updateQuickRef();
    updateChartTitle();
    renderChart();
  });

  // Bidirectional amount inputs
  fromAmtInput.addEventListener('input', () => {
    state.activeInput = 'from';
    recalculate();
  });

  toAmtInput.addEventListener('input', () => {
    state.activeInput = 'to';
    recalculate();
  });

  // Swap
  swapBtn.addEventListener('click', handleSwap);

  // Status bar = refresh on tap
  statusBar.addEventListener('click', () => fetchRates(true));
  statusBar.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fetchRates(true); }
  });

  // Online/offline events
  window.addEventListener('online',  () => { state.isOnline = true;  fetchRates(); });
  window.addEventListener('offline', () => { state.isOnline = false; updateStatus('offline'); });

  // Resize: re-render chart
  window.addEventListener('resize', debounce(renderChart, 200));
}

function flipOtherCurrency(changedSide) {
  // If user picks same currency on both sides, auto-pick a sensible default for the other
  if (changedSide === 'from') {
    const fallback = state.fromCurrency === 'DZD' ? 'USD' : 'DZD';
    state.toCurrency = fallback;
    toCurrSel.value  = fallback;
  } else {
    const fallback = state.toCurrency === 'DZD' ? 'USD' : 'DZD';
    state.fromCurrency = fallback;
    fromCurrSel.value  = fallback;
  }
}

// ─── SWAP HANDLER ───────────────────────────────────────────────────────────
function handleSwap() {
  // Animate
  swapBtn.classList.add('swapping');
  setTimeout(() => swapBtn.classList.remove('swapping'), 250);

  // Swap currencies
  [state.fromCurrency, state.toCurrency] = [state.toCurrency, state.fromCurrency];
  fromCurrSel.value = state.fromCurrency;
  toCurrSel.value   = state.toCurrency;

  // Swap amounts (keeping the one the user typed)
  const fromVal = fromAmtInput.value;
  const toVal   = toAmtInput.value;
  fromAmtInput.value = toVal;
  toAmtInput.value   = fromVal;

  // Flip activeInput
  state.activeInput = state.activeInput === 'from' ? 'to' : 'from';

  recalculate();
  updateQuickRef();
  updateChartTitle();
  renderChart();
}

// ─── CONVERSION MATH ────────────────────────────────────────────────────────

/** Convert amount of fromCurrency to toCurrency via EUR bridge.
 *  For DZD we use the parallel market eurToDzd rate.
 *  For everything else we use official EUR rates. */
function convert(amount, from, to) {
  if (!state.eurToDzd || !state.officialRates.USD) return null;

  const { eurToDzd: dzdRate, officialRates } = state;

  // Ensure we have both currencies
  if (from !== 'DZD' && !officialRates[from]) return null;
  if (to   !== 'DZD' && !officialRates[to])   return null;

  if (from === 'DZD' && to === 'DZD') return amount;

  // Amount → EUR
  let eur;
  if (from === 'DZD') {
    eur = amount / dzdRate;
  } else {
    eur = amount / officialRates[from];
  }

  // EUR → target
  if (to === 'DZD') {
    return eur * dzdRate;
  } else {
    return eur * officialRates[to];
  }
}

function recalculate() {
  if (!state.eurToDzd) return;

  const { fromCurrency: from, toCurrency: to } = state;

  if (state.activeInput === 'from') {
    const raw  = parseFloat(fromAmtInput.value);
    if (isNaN(raw) || fromAmtInput.value === '') {
      toAmtInput.value = '';
      updateRateLine();
      return;
    }
    const result = convert(raw, from, to);
    toAmtInput.value = result !== null ? formatAmount(result, to) : '';
  } else {
    const raw  = parseFloat(toAmtInput.value);
    if (isNaN(raw) || toAmtInput.value === '') {
      fromAmtInput.value = '';
      updateRateLine();
      return;
    }
    const result = convert(raw, to, from);
    fromAmtInput.value = result !== null ? formatAmount(result, from) : '';
  }

  updateRateLine();
}

function formatAmount(n, currency) {
  if (n === null || isNaN(n)) return '';
  // Use more decimals for currencies with large conversion factors
  const decimals = ['JPY', 'DZD', 'NGN', 'XOF', 'INR', 'GHS'].includes(currency) ? 0 : 4;
  // But cap at a sensible amount for display
  const displayDecimals = n >= 100 ? 2 : n >= 1 ? 4 : 6;
  return parseFloat(n.toFixed(Math.max(decimals, displayDecimals))).toString();
}

function updateRateLine() {
  if (!state.eurToDzd) return;

  const { fromCurrency: from, toCurrency: to } = state;
  const rate = convert(1, from, to);
  if (rate === null) { rateLine.textContent = '—'; return; }

  const rateStr = formatAmount(rate, to);
  rateLine.textContent  = `1 ${from} = ${formatNumber(rateStr)} ${to}`;
  rateLine.classList.add('loaded');
}

function formatNumber(s) {
  // Format with 2 decimal places and space thousand separators
  const n = parseFloat(s);
  if (isNaN(n)) return s;
  
  const parts = n.toFixed(2).split('.');
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return parts.join('.');
}

// ─── QUICK REFERENCE ────────────────────────────────────────────────────────
function updateQuickRef() {
  if (!state.eurToDzd) return;

  const { fromCurrency: from, toCurrency: to } = state;

  // Build 3 reference pairs based on active currencies
  const refs = buildRefAmounts(from, to);

  refGrid.innerHTML = refs.map(({ label, result, labelSuffix }) => `
    <div class="ref-item">
      <div class="ref-amount">${label}</div>
      <div class="ref-result">${result}</div>
      <div class="ref-label">${labelSuffix}</div>
    </div>
  `).join('');
}

function buildRefAmounts(from, to) {
  // Decide sensible reference amounts depending on currency pair
  let amounts;
  if (from === 'DZD') {
    amounts = [1000, 5000, 10000];
  } else if (to === 'DZD') {
    amounts = [1, 100, 1000];
  } else {
    amounts = [1, 10, 100];
  }

  return amounts.map(amt => {
    const result = convert(amt, from, to);
    const fmtAmt  = formatNumber(formatAmount(amt, from));
    const fmtRes  = result !== null ? formatNumber(formatAmount(result, to)) : '—';
    return {
      label:       fmtAmt,
      result:      fmtRes,
      labelSuffix: `${from} → ${to}`,
    };
  });
}

// ─── CHART TITLE ────────────────────────────────────────────────────────────
function updateChartTitle() {
  const { fromCurrency: from, toCurrency: to } = state;
  chartTitle.textContent = `30-Day ${from}/${to} Chart`;
}

// ─── API FETCHING ────────────────────────────────────────────────────────────
async function fetchRates(force = false) {
  if (state.isFetching) return;

  // Skip if cache is fresh and not forced
  if (!force && state.lastUpdate && Date.now() - state.lastUpdate < CACHE_TTL_MS) return;

  state.isFetching = true;
  spinner.classList.add('spinning');
  statusText.textContent = 'Updating…';

  try {
    const [dzdData, eurData] = await Promise.all([
      fetchDZDRates(),
      fetchOfficialRates(),
    ]);
    // debug logs
    console.log('Fetched DZD data:', dzdData);
    console.log('Fetched official EUR rates:', eurData);

    if (!dzdData && !state.eurToDzd) {
      updateStatus('error');
      showToast('Could not fetch rates. Using defaults if available.');
      return;
    }

    if (dzdData) {
      state.eurToDzd  = dzdData.current;
      state.history   = dzdData.history;
    }

    if (eurData) {
      state.officialRates = eurData;
    }

    state.lastUpdate = Date.now();
    saveCache();
    applyRates();
    updateStatus('online');
    if (force) showToast('Rates updated ✓');

  } catch (err) {
    console.error('fetchRates error:', err);
    updateStatus(navigator.onLine ? 'error' : 'offline');
  } finally {
    state.isFetching = false;
    spinner.classList.remove('spinning');
  }
}

async function fetchDZDRates() {
  const today = dateStr(new Date());
  const start = dateStr(daysAgo(31));

  try {
    // Try the historical endpoint (includes current)
    const res = await fetchWithTimeout(DZD_HISTORY_API(start, today), 8000);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();

    // Parse response — handle various response shapes
    const rows = Array.isArray(json) ? json
               : json.data           ? json.data
               : json.rates          ? json.rates
               : null;

    if (!rows || rows.length === 0) throw new Error('empty response');

    // Sort by date
    rows.sort((a, b) => new Date(a.date || a.Date) - new Date(b.date || b.Date));

    const history = rows.map(r => ({
      date:  r.date || r.Date || r.dateTime,
      value: parseFloat(
        r.value || r.parallel || r.exchangedz || r.rate || r.close || r.open || r.buyRate || r.sellRate || 0
      ),
    })).filter(r => r.value > 0);

    if (history.length === 0) throw new Error('no valid rows');

    const current = history[history.length - 1].value;
    return { current, history };

  } catch (err) {
    console.warn('ExchangeDZ API error:', err.message);
    // Fallback: try the simpler "latest" endpoint
    try {
      const res2 = await fetchWithTimeout(DZD_CURRENT_API, 5000);
      if (!res2.ok) throw new Error(`HTTP ${res2.status}`);
      const j2 = await res2.json();
      const current = parseFloat(
        j2.rate || j2.parallel || j2.value || j2.close || j2.open || j2.buyRate || j2.sellRate || j2[0]?.value || 0
      );
      if (current > 0) return { current, history: [] };
    } catch (_) { /* fall through */ }

    return null;
  }
}

async function fetchOfficialRates() {
  try {
    const res  = await fetchWithTimeout(EUR_API, 8000);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    const rates = json.rates || json.conversion_rates;
    if (!rates) throw new Error('no rates field');

    // Add DZD official (we'll override with parallel in conversion logic)
    return rates;
  } catch (err) {
    console.warn('EUR API error:', err.message);
    return null;
  }
}

async function fetchWithTimeout(url, ms) {
  const ctrl = new AbortController();
  const id    = setTimeout(() => ctrl.abort(), ms);
  try {
    // Use CORS proxy for exchangedz.com (doesn't have CORS headers)
    const fetchUrl = url.includes('exchangedz.com')
      ? CORS_PROXY + encodeURIComponent(url)
      : url;
    
    const res = await fetch(fetchUrl, { signal: ctrl.signal, mode: 'cors' });
    return res;
  } finally {
    clearTimeout(id);
  }
}

// ─── APPLY RATES TO UI ──────────────────────────────────────────────────────
function applyRates(cached) {
  if (cached) {
    state.eurToDzd      = cached.eurToDzd;
    state.officialRates = cached.officialRates;
    state.history       = cached.history || [];
    state.lastUpdate    = cached.lastUpdate;
  }

  recalculate();
  updateQuickRef();
  updateChartTitle();
  renderChart();
}

// ─── CHART RENDERING ────────────────────────────────────────────────────────
function renderChart() {
  const { history, fromCurrency: from, toCurrency: to } = state;

  // Build DZD-relative history for the selected pair
  const data = buildChartData(from, to, history);

  if (!data || data.length < 2) {
    chartOverlay.classList.remove('hidden');
    chartOverlay.querySelector('.chart-overlay-text').textContent =
      history.length === 0 ? 'Historical data unavailable' : 'Loading chart…';
    return;
  }

  chartOverlay.classList.add('hidden');

  const canvas = chartCanvas;
  const dpr    = window.devicePixelRatio || 1;
  const rect   = canvas.parentElement.getBoundingClientRect();
  const W      = Math.floor(rect.width);
  const H      = Math.floor(rect.height || 140);

  canvas.width  = W * dpr;
  canvas.height = H * dpr;
  canvas.style.width  = W + 'px';
  canvas.style.height = H + 'px';

  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, W, H);

  const vals  = data.map(d => d.value);
  const minV  = Math.min(...vals);
  const maxV  = Math.max(...vals);
  const range = maxV - minV || 1;

  const PAD_L = 4, PAD_R = 4, PAD_T = 12, PAD_B = 8;
  const chartW = W - PAD_L - PAD_R;
  const chartH = H - PAD_T - PAD_B;

  const toX = i  => PAD_L + (i / (data.length - 1)) * chartW;
  const toY = v  => PAD_T + (1 - (v - minV) / range) * chartH;

  // Grid lines (subtle)
  ctx.strokeStyle = 'rgba(255,255,255,0.04)';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 3; i++) {
    const y = PAD_T + (i / 3) * chartH;
    ctx.beginPath();
    ctx.moveTo(PAD_L, y);
    ctx.lineTo(W - PAD_R, y);
    ctx.stroke();
  }

  // Gradient fill
  const grad = ctx.createLinearGradient(0, PAD_T, 0, H);
  grad.addColorStop(0,   'rgba(200,169,110,0.25)');
  grad.addColorStop(0.6, 'rgba(200,169,110,0.05)');
  grad.addColorStop(1,   'rgba(200,169,110,0)');

  ctx.beginPath();
  ctx.moveTo(toX(0), toY(data[0].value));
  for (let i = 1; i < data.length; i++) {
    const x0 = toX(i-1), y0 = toY(data[i-1].value);
    const x1 = toX(i),   y1 = toY(data[i].value);
    const cpx = (x0 + x1) / 2;
    ctx.bezierCurveTo(cpx, y0, cpx, y1, x1, y1);
  }
  ctx.lineTo(toX(data.length - 1), H);
  ctx.lineTo(toX(0), H);
  ctx.closePath();
  ctx.fillStyle = grad;
  ctx.fill();

  // Line
  ctx.beginPath();
  ctx.moveTo(toX(0), toY(data[0].value));
  for (let i = 1; i < data.length; i++) {
    const x0 = toX(i-1), y0 = toY(data[i-1].value);
    const x1 = toX(i),   y1 = toY(data[i].value);
    const cpx = (x0 + x1) / 2;
    ctx.bezierCurveTo(cpx, y0, cpx, y1, x1, y1);
  }
  ctx.strokeStyle = '#C8A96E';
  ctx.lineWidth   = 2;
  ctx.lineJoin    = 'round';
  ctx.stroke();

  // Current value dot
  const lastX = toX(data.length - 1);
  const lastY = toY(vals[vals.length - 1]);
  ctx.beginPath();
  ctx.arc(lastX, lastY, 4, 0, Math.PI * 2);
  ctx.fillStyle = '#C8A96E';
  ctx.fill();
  ctx.beginPath();
  ctx.arc(lastX, lastY, 7, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(200,169,110,0.3)';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Stats
  const hiV = Math.max(...vals);
  const loV = Math.min(...vals);
  const cu  = vals[vals.length - 1];
  chartStats.innerHTML = `
    <div class="stat">
      <span style="color:var(--text-3);font-size:9px;letter-spacing:.06em;text-transform:uppercase">High</span>
      <span class="stat-val stat-high">${fmt(hiV, to)}</span>
    </div>
    <div class="stat">
      <span style="color:var(--text-3);font-size:9px;letter-spacing:.06em;text-transform:uppercase">Low</span>
      <span class="stat-val stat-low">${fmt(loV, to)}</span>
    </div>
    <div class="stat">
      <span style="color:var(--text-3);font-size:9px;letter-spacing:.06em;text-transform:uppercase">Now</span>
      <span class="stat-val">${fmt(cu, to)}</span>
    </div>
  `;

  // Date labels
  const first = data[0].date;
  const mid   = data[Math.floor(data.length / 2)].date;
  const last  = data[data.length - 1].date;
  chartDates.innerHTML = [first, mid, last].map(d => `<span>${shortDate(d)}</span>`).join('');
}

function buildChartData(from, to, history) {
  if (!history || history.length === 0 || !state.eurToDzd) return null;

  // history is EUR→DZD parallel. We have EUR→X official rates.
  // For a from/to pair, we want the equivalent rate over time.
  // We always have the EUR→DZD parallel history.
  // For other rates, we use the current official rate ratio as an approximation.

  if (from === 'DZD' && to === 'EUR') {
    return history.map(h => ({ date: h.date, value: 1 / h.value }));
  }
  if (from === 'EUR' && to === 'DZD') {
    return history.map(h => ({ date: h.date, value: h.value }));
  }

  // Any other pair involving DZD
  const officialRate = to === 'DZD'
    ? (state.officialRates[from] || null)
    : (state.officialRates[to]   || null);

  if (!officialRate) return null;

  return history.map(h => {
    let v;
    if (to === 'DZD') {
      // from → EUR → DZD: 1 unit of `from` = (1/officialRate[from]) EUR = (1/officialRate[from])*h.value DZD
      v = h.value / officialRate;
    } else if (from === 'DZD') {
      // DZD → EUR → to: 1 DZD = (1/h.value) EUR = (1/h.value)*officialRate[to]
      v = officialRate / h.value;
    } else {
      // Both non-DZD: rate doesn't change historically (we only have DZD data)
      // Compute static rate
      v = officialRate / (state.officialRates[from] || 1);
    }
    return { date: h.date, value: v };
  });
}

function fmt(n, currency) {
  if (n == null) return '—';
  const d = ['DZD','JPY','NGN','XOF','INR'].includes(currency) ? 1 : 4;
  return n.toFixed(d);
}

// ─── STATUS BAR ─────────────────────────────────────────────────────────────
function updateStatus(mode) {
  const ts = state.lastUpdate ? formatTime(new Date(state.lastUpdate)) : '';

  statusDot.className  = '';
  switch (mode) {
    case 'online':
      statusDot.classList.add('online');
      statusText.textContent = 'Live Rates';
      statusBar.title = 'Tap to refresh';
      break;
    case 'cached':
      statusDot.classList.add('online');
      statusText.textContent = 'Cached Rates';
      statusBar.title = 'Tap to refresh';
      break;
    case 'offline':
      statusDot.classList.add('offline');
      statusText.textContent = 'Offline — Cached Rates';
      break;
    case 'error':
      statusDot.classList.add('offline');
      statusText.textContent = 'Update Failed';
      break;
    default:
      statusText.textContent = 'Connecting…';
  }

  statusTime.textContent = ts ? `Updated ${ts}` : '';
}

// ─── CACHE ──────────────────────────────────────────────────────────────────
function saveCache() {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({
      eurToDzd:      state.eurToDzd,
      officialRates: state.officialRates,
      history:       state.history,
      lastUpdate:    state.lastUpdate,
    }));
  } catch (_) { /* quota exceeded */ }
}

function loadCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (_) {
    return null;
  }
}

// ─── SERVICE WORKER ─────────────────────────────────────────────────────────
function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('service-worker.js')
      .catch(err => console.warn('SW registration failed:', err));
  }
}

// ─── UTILS ──────────────────────────────────────────────────────────────────
function dateStr(d) {
  return d.toISOString().slice(0, 10);
}

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

function formatTime(d) {
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function shortDate(str) {
  if (!str) return '';
  const d = new Date(str);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

let _toastTimer;
function showToast(msg) {
  toast.textContent = msg;
  toast.classList.add('show');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => toast.classList.remove('show'), 2800);
}

function debounce(fn, delay) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), delay); };
}

// ─── BOOT ───────────────────────────────────────────────────────────────────
init();
