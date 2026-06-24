// mobile.js — MRFinance Mobile: Router, Navegação e Motor de Renderização
import {
  loadState, saveState, addTx, confirmTx, undoTx, deleteTx,
  cancelParcela, patchTx, addGoal, deleteGoal, addAsset, deleteAsset,
  setInitialBalance, getInitialBalance, uid, createTransaction, createGoal, createAsset
} from './shared/core/state.js';
import {
  money, parseBRL, norm, esc, shortDesc, titleName, isCPF, isCNPJ,
  addMonthsISO, daysUntil, monthKey, parseMoneyInput, csvCell
} from './shared/core/formatting.js';
import {
  agg, mtx, months, balance, runningBalance, balanceMonths,
  pendingTotalsForMonth, calcScore, detAvg, detSeriesIn, detSeriesOut, detSeriesNet, getInitialBalance as getIB
} from './shared/core/calculations.js';
import {
  BASE_CATS, BASE_CAT_IDS, DRE_GROUPS, catOf, catTypeOf, catById, isInterno,
  merchantName, cleanEntity, sanitizeCatId, defaultDreGroup,
  applyCategorySettings
} from './shared/core/categorization.js';
import {
  commitmentStatus, glPct, glDone, glAutoConclude, glColor, assetsTotal, ptVariation, recurringKey
} from './shared/core/business-rules.js';
import {
  parseOFX, parseCSV, parseMoney, parseCsvDate, splitCsvLine,
  txContentKey, txKey, impKey, impLoose, impIsEdited
} from './shared/core/parsers.js';
import { score, crit, descSim, digits, daysBetween, klass, klassLabel } from './shared/core/scoring.js';

// ======================================================================
// STATE
// ======================================================================
let state = loadState();
let cats = applyCategorySettings(state);
let view = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
let currentPage = 'visao';
let pageHistory = [];

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const moneyFmt = money;

// ======================================================================
// PERSISTENCE
// ======================================================================
function save() {
  saveState(state);
  cats = applyCategorySettings(state);
  render();
}

// ======================================================================
// ROUTER
// ======================================================================
const MAIN_PAGES = ['visao', 'fluxo', 'transacoes', 'lancamentos', 'mais'];

function showPage(page, isSubPage = false) {
  if (!hasData() && page !== 'visao' && page !== 'mais') {
    showToast('Importe um OFX ou cadastre lançamentos');
    return;
  }
  if (!isSubPage) pageHistory = [];
  currentPage = page;
  $$('.page').forEach(p => p.classList.remove('active'));
  const el = $(`#page-${page}`);
  if (el) {
    el.classList.add('active');
    $('#pages').scrollTop = 0;
  }
  $$('.bn-item').forEach(b => b.classList.toggle('active', b.dataset.page === page));
  updateTitle(page);
  renderPage(page);
}

function goBack() {
  if (pageHistory.length > 0) {
    showPage(pageHistory.pop(), true);
  } else {
    showPage('visao');
  }
}

function pushPage(page) {
  pageHistory.push(currentPage);
  showPage(page, true);
}

function updateTitle(page) {
  const titles = {
    visao: 'MR Finance',
    fluxo: 'Fluxo de Caixa',
    transacoes: 'Transações',
    lancamentos: 'Lançamentos',
    mais: 'Mais',
    categorias: 'Categorias',
    metas: 'Metas',
    analises: 'Análises',
    relatorios: 'Relatórios',
    destino: 'Para Onde Foi',
    patrimonio: 'Patrimônio',
    bancos: 'Bancos',
    conciliacao: 'Conciliação',
    config: 'Configurações',
  };
  $('#pageTitle').textContent = titles[page] || 'MR Finance';
}

// ======================================================================
// DATA HELPERS
// ======================================================================
function hasData() { return state.tx.length > 0 || Object.keys(state.balances).length > 0; }
function k() { return monthKey(view); }
function a() { return agg(state, k()); }
function p() { return pendingTotalsForMonth(state, k()); }

// ======================================================================
// RENDER PAGE
// ======================================================================
function renderPage(page) {
  switch (page) {
    case 'visao': renderVisao(); break;
    case 'fluxo': renderFluxo(); break;
    case 'transacoes': renderTransacoes(); break;
    case 'lancamentos': renderLancamentos(); break;
    case 'mais': renderMais(); break;
    case 'categorias': renderCategorias(); break;
    case 'metas': renderMetas(); break;
    case 'analises': renderAnalises(); break;
    case 'relatorios': renderRelatorios(); break;
    case 'destino': renderDestino(); break;
    case 'patrimonio': renderPatrimonio(); break;
    case 'bancos': renderBancos(); break;
    case 'conciliacao': renderConciliacao(); break;
    case 'config': renderConfig(); break;
  }
}

function render() {
  renderPage(currentPage);
}

// ======================================================================
// SVG HELPERS
// ======================================================================
const DONUT_COLORS = ['#7448ff','#ff416d','#20df9a','#ffbd3d','#2d8cff','#ff6fa3','#18d2d2','#9b6dff'];

function donutSVG(data, size = 120) {
  const total = data.reduce((s, d) => s + d.val, 0) || 1;
  let cum = 0;
  const r = 42, cx = 60, cy = 60;
  const paths = data.map(d => {
    const pct = d.val / total;
    if (pct < 0.005) return '';
    const start = cum;
    cum += pct;
    const end = cum;
    const large = pct > 0.5 ? 1 : 0;
    const x1 = cx + r * Math.cos(2 * Math.PI * start - Math.PI / 2);
    const y1 = cy + r * Math.sin(2 * Math.PI * start - Math.PI / 2);
    const x2 = cx + r * Math.cos(2 * Math.PI * end - Math.PI / 2);
    const y2 = cy + r * Math.sin(2 * Math.PI * end - Math.PI / 2);
    return `<path d="M${x1},${y1} A${r},${r} 0 ${large},1 ${x2},${y2}" fill="none" stroke="${d.color}" stroke-width="16" />`;
  }).join('');
  return `<svg width="${size}" height="${size}" viewBox="0 0 120 120">${paths}<circle cx="${cx}" cy="${cy}" r="30" fill="var(--bg2, var(--bg))"/></svg>`;
}

function lineChartSVG(values, opts = {}) {
  const { w = 320, h = 120, pad = 12, color = '#7448ff', fill = true } = opts;
  if (!values.length) return '';
  const minV = Math.min(...values.map(v => v.val));
  const maxV = Math.max(...values.map(v => v.val));
  const range = maxV - minV || 1;
  const pts = values.map((v, i) => {
    const x = pad + (i / (values.length - 1 || 1)) * (w - pad * 2);
    const y = pad + (1 - (v.val - minV) / range) * (h - pad * 2);
    return { x, y, v };
  });
  const poly = pts.map(p => `${p.x},${p.y}`).join(' ');
  const fillPoly = `${pts[0].x},${h - pad} ${poly} ${pts[pts.length - 1].x},${h - pad}`;
  const first = pts[0], last = pts[pts.length - 1];
  return `<svg width="100%" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">
    ${fill ? `<polygon points="${fillPoly}" fill="${color}" opacity="0.12"/>` : ''}
    <polyline points="${poly}" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="${first.x}" cy="${first.y}" r="3" fill="${color}"/>
    <circle cx="${last.x}" cy="${last.y}" r="3" fill="${color}"/>
    <text x="${first.x}" y="${first.y - 8}" fill="${color}" font-size="10" text-anchor="middle">${shortDesc(values[0].label, 7)}</text>
    <text x="${last.x}" y="${last.y - 8}" fill="${color}" font-size="10" text-anchor="middle">${shortDesc(values[values.length - 1].label, 7)}</text>
  </svg>`;
}

// ======================================================================
// VISÃO GERAL (ENHANCED)
// ======================================================================
function renderVisao() {
  const data = a();
  const prevMonth = new Date(view);
  prevMonth.setMonth(prevMonth.getMonth() - 1);
  const prev = agg(state, monthKey(prevMonth));
  const rb = runningBalance(state, k());
  const sc = calcScore(data);
  const goals = (state.goals || []).slice(0, 3);
  const pt = assetsTotal(state.patrimonio);

  // --- Highlights ---
  const economyPct = prev.in > 0 && prev.out > 0
    ? Math.round((1 - data.out / prev.out) * 100) : null;
  const txs = mtx(state, k()).filter(t => !t.interno);
  const expTx = txs.filter(t => t.tipo === 'despesa');
  const biggest = expTx.length ? expTx.reduce((a, b) => a.valor > b.valor ? a : b) : null;
  const micro = expTx.filter(t => t.valor < 50);
  const microTotal = micro.reduce((s, t) => s + t.valor, 0);
  const daysInMonth = new Date(view.getFullYear(), view.getMonth() + 1, 0).getDate();
  const dayNow = Math.min(new Date().getDate(), daysInMonth);
  const avgDaily = dayNow > 0 ? data.out / dayNow : 0;

  // --- Donuts: categorias de entradas e saídas ---
  const inByCat = {}, outByCat = {};
  txs.forEach(t => {
    const cid = t.cat || 'outros';
    if (t.tipo === 'receita') inByCat[cid] = (inByCat[cid] || 0) + t.valor;
    else outByCat[cid] = (outByCat[cid] || 0) + t.valor;
  });
  const inData = Object.entries(inByCat).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([cid, val], i) => {
    const cat = catById(cid, cats);
    return { label: cat ? cat.name : cid, icon: cat ? cat.icon : '📦', val, color: DONUT_COLORS[i % DONUT_COLORS.length] };
  });
  const outData = Object.entries(outByCat).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([cid, val], i) => {
    const cat = catById(cid, cats);
    return { label: cat ? cat.name : cid, icon: cat ? cat.icon : '📦', val, color: DONUT_COLORS[i % DONUT_COLORS.length] };
  });

  // --- Evolução do saldo (6 meses) ---
  const ms = months(state);
  const evoData = ms.slice(-6).map(m => ({ label: m.k, val: m.net }));

  // --- Recorrências detectadas ---
  const allTxs = mtx(state, k()).filter(t => !t.interno);
  const recurrMap = {};
  allTxs.forEach(t => {
    const rk = recurringKey(t);
    if (!recurrMap[rk]) recurrMap[rk] = { count: 0, total: 0, desc: t.desc || t.memo || t.cat, tipo: t.tipo, cat: t.cat };
    recurrMap[rk].count++;
    recurrMap[rk].total += t.valor;
  });
  const recurrList = Object.entries(recurrMap).filter(([, v]) => v.count >= 2).sort((a, b) => b[1].count - a[1].count).slice(0, 3);

  // --- Contas a pagar/receber ---
  const pending = p();
  const pendingAll = (state.tx || []).filter(t => t && t.pending && !t.canceled);
  const payCount = pendingAll.filter(t => t.tipo === 'despesa').length;
  const recvCount = pendingAll.filter(t => t.tipo === 'receita').length;

  // --- Notificações ---
  const overdue = pendingAll.filter(t => t.date && daysUntil(t.date) < 0).length;
  const goalAlert = (state.goals || []).filter(g => glPct(g) >= 80 && glPct(g) < 100).length;

  // --- Mini calendar ---
  const pendingThis = pendingAll.filter(t => t.date && t.date.startsWith(k() + '-'));

  const page = $('#page-visao');
  page.innerHTML = `
    <!-- Month nav -->
    <div class="flex items-center justify-between mb-16">
      <button class="icon-btn" id="prevMonth">◀</button>
      <h2 class="fz-lg fw-800" id="monthLabel">${view.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}</h2>
      <button class="icon-btn" id="nextMonth">▶</button>
    </div>

    ${overdue > 0 || goalAlert > 0 ? `
    <div class="card" style="border-left:3px solid var(--accent,#ff416d)">
      <div class="flex items-center gap-8">
        <span style="font-size:18px">🔔</span>
        <div class="flex-1">
          ${overdue > 0 ? `<div class="fz-sm fw-600 text-red">${overdue} pendência(s) atrasada(s)</div>` : ''}
          ${goalAlert > 0 ? `<div class="fz-sm fw-600" style="color:#a855f7">${goalAlert} meta(s) próxima(s) de bater</div>` : ''}
        </div>
      </div>
    </div>` : ''}

    <!-- KPIs -->
    <div class="kpi-grid">
      <div class="card">
        <div class="card-title">Entradas</div>
        <div class="card-value text-green">${moneyFmt(data.in)}</div>
      </div>
      <div class="card">
        <div class="card-title">Saídas</div>
        <div class="card-value text-red">${moneyFmt(data.out)}</div>
      </div>
      <div class="card">
        <div class="card-title">Resultado</div>
        <div class="card-value ${data.net >= 0 ? 'text-green' : 'text-red'}">${moneyFmt(data.net)}</div>
      </div>
      <div class="card">
        <div class="card-title">Saldo Acumulado</div>
        <div class="card-value">${moneyFmt(rb)}</div>
      </div>
    </div>

    <!-- Highlights -->
    <div class="section-header mt-16">
      <span class="section-title">Destaques do Mês</span>
    </div>
    <div class="kpi-grid">
      <div class="card">
        <div class="card-title">Economia vs Mês Ant.</div>
        <div class="card-value ${economyPct !== null && economyPct >= 0 ? 'text-green' : 'text-red'}">${economyPct !== null ? (economyPct >= 0 ? '+' : '') + economyPct + '%' : '—'}</div>
        <div class="card-sub">${economyPct !== null ? (economyPct >= 0 ? 'Menos gastos' : 'Mais gastos') : 'Sem dados anteriores'}</div>
      </div>
      <div class="card">
        <div class="card-title">Maior Gasto</div>
        <div class="card-value text-red">${biggest ? moneyFmt(biggest.valor) : '—'}</div>
        <div class="card-sub">${biggest ? shortDesc(biggest.desc || biggest.memo || '', 22) : 'Nenhum'}</div>
      </div>
      <div class="card">
        <div class="card-title">Microgastos (&lt;R$50)</div>
        <div class="card-value">${micro.length} <span class="fz-sm text-dim">compras</span></div>
        <div class="card-sub">${moneyFmt(microTotal)}</div>
      </div>
      <div class="card">
        <div class="card-title">Média Diária</div>
        <div class="card-value text-red">${moneyFmt(avgDaily)}</div>
        <div class="card-sub">${dayNow} dia(s) do mês</div>
      </div>
    </div>

    <!-- Donuts: Entradas por Categoria -->
    ${inData.length ? `
    <div class="section-header mt-16">
      <span class="section-title">Entradas por Categoria</span>
    </div>
    <div class="card">
      <div class="flex items-center gap-12">
        ${donutSVG(inData)}
        <div class="flex-1" style="min-width:0">
          ${inData.slice(0, 5).map(d => `
            <div class="flex items-center gap-6 mb-4">
              <span style="width:10px;height:10px;border-radius:50%;background:${d.color};flex-shrink:0"></span>
              <span class="fz-sm flex-1" style="min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${d.icon} ${d.label}</span>
              <span class="fz-sm fw-700">${moneyFmt(d.val)}</span>
            </div>
          `).join('')}
        </div>
      </div>
    </div>` : ''}

    <!-- Donuts: Saídas por Categoria -->
    ${outData.length ? `
    <div class="section-header mt-16">
      <span class="section-title">Saídas por Categoria</span>
    </div>
    <div class="card">
      <div class="flex items-center gap-12">
        ${donutSVG(outData)}
        <div class="flex-1" style="min-width:0">
          ${outData.slice(0, 5).map(d => `
            <div class="flex items-center gap-6 mb-4">
              <span style="width:10px;height:10px;border-radius:50%;background:${d.color};flex-shrink:0"></span>
              <span class="fz-sm flex-1" style="min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${d.icon} ${d.label}</span>
              <span class="fz-sm fw-700">${moneyFmt(d.val)}</span>
            </div>
          `).join('')}
        </div>
      </div>
    </div>` : ''}

    <!-- Evolução do Saldo -->
    <div class="section-header mt-16">
      <span class="section-title">Evolução do Saldo</span>
    </div>
    <div class="card">
      ${evoData.length >= 2 ? lineChartSVG(evoData, { color: '#7448ff' }) : '<div class="text-dim fz-sm">Dados insuficientes</div>'}
    </div>

    <!-- Score -->
    <div class="card mt-12" id="scoreCard">
      <div class="flex items-center justify-between">
        <div>
          <div class="card-title">Nota Financeira</div>
          <div class="card-value" id="scoreNum">${sc !== null ? sc : '—'}</div>
        </div>
        <div class="text-dim fz-sm" id="scoreText">${scoreText(sc)}</div>
      </div>
      <div class="progress-bar"><div class="progress-fill ${sc >= 70 ? 'green' : sc >= 45 ? '' : 'red'}" style="width:${sc || 0}%"></div></div>
    </div>

    <!-- Resumo de Contas -->
    <div class="section-header mt-16">
      <span class="section-title">Resumo de Contas</span>
    </div>
    <div class="kpi-grid">
      <div class="card">
        <div class="card-title">A Pagar</div>
        <div class="card-value text-red">${moneyFmt(pending.out)}</div>
        <div class="card-sub">${payCount} conta(s)</div>
      </div>
      <div class="card">
        <div class="card-title">A Receber</div>
        <div class="card-value text-green">${moneyFmt(pending.in)}</div>
        <div class="card-sub">${recvCount} conta(s)</div>
      </div>
    </div>

    <!-- Recorrências Detectadas -->
    ${recurrList.length ? `
    <div class="section-header mt-16">
      <span class="section-title">Recorrências Detectadas</span>
    </div>
    ${recurrList.map(([, v]) => {
      const cat = catById(v.cat, cats);
      return `<div class="list-item">
        <div class="list-icon">${cat ? cat.icon : '🔄'}</div>
        <div class="list-body">
          <div class="list-title">${esc(shortDesc(v.desc, 30))}</div>
          <div class="list-sub">${v.count}x este mês · ${v.tipo === 'receita' ? 'Entrada' : 'Saída'}</div>
        </div>
        <div class="list-value">
          <div class="list-amount ${v.tipo === 'receita' ? 'income' : 'expense'}">${moneyFmt(v.total)}</div>
        </div>
      </div>`;
    }).join('')}` : ''}

    <!-- Patrimônio -->
    <div class="card mt-12" id="patrCard">
      <div class="card-title">Patrimônio Total</div>
      <div class="card-value">${moneyFmt(pt)}</div>
    </div>

    <!-- Goals preview -->
    ${goals.length ? `
    <div class="section-header mt-16">
      <span class="section-title">Metas</span>
      <button class="section-link" onclick="window.__mob.goPage('metas')">Ver todas</button>
    </div>
    ${goals.map(g => `
      <div class="card">
        <div class="flex items-center justify-between mb-8">
          <span class="fw-700">${g.icon} ${g.name}</span>
          <span class="badge" style="background:${glColor(glPct(g))}22;color:${glColor(glPct(g))}">${glPct(g)}%</span>
        </div>
        <div class="progress-bar"><div class="progress-fill" style="width:${glPct(g)}%;background:${glColor(glPct(g))}"></div></div>
      </div>
    `).join('')}` : ''}

    <!-- Mini Calendar -->
    <div class="section-header mt-16">
      <span class="section-title">📅 Calendário</span>
    </div>
    ${renderMiniCalendar(pendingThis)}

    <!-- Quick actions -->
    <div class="section-header mt-16">
      <span class="section-title">Ações Rápidas</span>
    </div>
    <div class="flex gap-8 flex-wrap">
      <button class="btn btn-primary btn-sm" onclick="window.__mob.goPage('transacoes')">+ Transação</button>
      <button class="btn btn-secondary btn-sm" onclick="window.__mob.goPage('lancamentos')">📅 Lançamentos</button>
    </div>
  `;

  // Month navigation
  $('#prevMonth').onclick = () => { view.setMonth(view.getMonth() - 1); render(); };
  $('#nextMonth').onclick = () => { view.setMonth(view.getMonth() + 1); render(); };
}

function scoreText(s) {
  if (s === null) return 'Importe dados';
  if (s >= 80) return 'Excelente!';
  if (s >= 60) return 'Saudável';
  if (s >= 45) return 'Atenção';
  return 'Saídas > Entradas';
}

// ======================================================================
// FLUXO DE CAIXA (ENHANCED — PARITY WITH DESKTOP)
// ======================================================================

function barChartSVG6M(data, w = 300, h = 120) {
  if (!data.length) return '';
  const max = Math.max(...data.map(d => Math.max(d.in, d.out)), 1);
  const barW = Math.floor((w - 20) / data.length / 2);
  const bars = data.map((d, i) => {
    const x = 10 + i * ((w - 20) / data.length);
    const hIn = (d.in / max) * (h - 30);
    const hOut = (d.out / max) * (h - 30);
    return `<rect x="${x}" y="${h - 10 - hIn}" width="${barW}" height="${hIn}" fill="#22c55e" rx="3" />` +
      `<rect x="${x + barW + 2}" y="${h - 10 - hOut}" width="${barW}" height="${hOut}" fill="#ff416d" rx="3" />` +
      `<text x="${x + barW}" y="${h}" text-anchor="middle" fill="var(--txt3)" font-size="9">${d.label}</text>`;
  }).join('');
  return `<svg width="100%" height="${h}" viewBox="0 0 ${w} ${h}">${bars}</svg>`;
}

function renderFluxo() {
  const data = a();
  const pending = p();
  const rb = runningBalance(state, k());
  const projEnd = rb + pending.in - pending.out;
  const ms = months(state);

  const txs = mtx(state, k()).filter(t => !t.interno);
  const expTxs = txs.filter(t => t.tipo === 'despesa');
  const incTxs = txs.filter(t => t.tipo === 'receita');

  const biggestIn = incTxs.length ? incTxs.reduce((a, b) => a.valor > b.valor ? a : b) : null;
  const biggestOut = expTxs.length ? expTxs.reduce((a, b) => a.valor > b.valor ? a : b) : null;
  const ticketAvg = txs.length ? data.in / txs.length : 0;
  const savingsRate = data.in > 0 ? Math.round((data.net / data.in) * 100) : 0;

  const daysInMonth = new Date(view.getFullYear(), view.getMonth() + 1, 0).getDate();
  const txDays = new Set(txs.filter(t => t.date).map(t => t.date.slice(8, 10)));
  const daysNoMov = Math.max(0, daysInMonth - txDays.size);

  const chartData = ms.slice(-6).map(m => ({
    label: m.k.slice(5, 7),
    in: m.in,
    out: m.out
  }));

  const page = $('#page-fluxo');
  page.innerHTML = `
    <!-- Month nav -->
    <div class="flex items-center justify-between mb-16">
      <button class="icon-btn" id="prevMonth">◀</button>
      <h2 class="fz-lg fw-800">${view.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}</h2>
      <button class="icon-btn" id="nextMonth">▶</button>
    </div>

    <!-- 1. Equação visual step-by-step -->
    <div class="card">
      <div class="card-title">Equação do Fluxo</div>
      <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;padding:8px 0">
        <span class="badge badge-gray badge-lg">${moneyFmt(rb)}</span>
        <span style="color:var(--txt3);font-size:18px">→</span>
        <span class="badge badge-green badge-lg">+${moneyFmt(data.in)}</span>
        <span style="color:var(--txt3);font-size:18px">→</span>
        <span class="badge badge-red badge-lg">-${moneyFmt(data.out)}</span>
        <span style="color:var(--txt3);font-size:18px">=</span>
        <span class="badge ${data.net >= 0 ? 'badge-green' : 'badge-red'} badge-lg fw-700">${data.net >= 0 ? '+' : ''}${moneyFmt(data.net)}</span>
      </div>
    </div>

    <!-- 2. KPI grid 2x4 -->
    <div class="kpi-grid">
      <div class="card">
        <div class="card-title">Saldo Projetado</div>
        <div class="card-value ${projEnd >= 0 ? 'text-green' : 'text-red'}">${moneyFmt(projEnd)}</div>
        <div class="card-sub">Com pendentes</div>
      </div>
      <div class="card">
        <div class="card-title">Pendentes</div>
        <div class="card-value">${pending.count}</div>
        <div class="card-sub">${moneyFmt(pending.in)} in · ${moneyFmt(pending.out)} out</div>
      </div>
      <div class="card">
        <div class="card-title">Maior Entrada</div>
        <div class="card-value sm text-green">${biggestIn ? moneyFmt(biggestIn.valor) : '—'}</div>
        <div class="card-sub">${biggestIn ? shortDesc(biggestIn.desc || biggestIn.memo || '', 20) : 'Nenhuma'}</div>
      </div>
      <div class="card">
        <div class="card-title">Maior Saída</div>
        <div class="card-value sm text-red">${biggestOut ? moneyFmt(biggestOut.valor) : '—'}</div>
        <div class="card-sub">${biggestOut ? shortDesc(biggestOut.desc || biggestOut.memo || '', 20) : 'Nenhuma'}</div>
      </div>
      <div class="card">
        <div class="card-title">Ticket Médio</div>
        <div class="card-value sm">${moneyFmt(ticketAvg)}</div>
        <div class="card-sub">${txs.length} transações</div>
      </div>
      <div class="card">
        <div class="card-title">Dias s/ Movimento</div>
        <div class="card-value sm">${daysNoMov}</div>
        <div class="card-sub">${txDays.size} de ${daysInMonth} dias</div>
      </div>
      <div class="card">
        <div class="card-title">Taxa de Poupança</div>
        <div class="card-value sm ${savingsRate >= 0 ? 'text-green' : 'text-red'}">${savingsRate}%</div>
        <div class="card-sub">${savingsRate >= 0 ? 'Economizando' : 'Acima da renda'}</div>
      </div>
    </div>

    <!-- 3. Gráfico barras mensal SVG -->
    <div class="section-header mt-16"><span class="section-title">Entradas vs Saídas (6 meses)</span></div>
    <div class="card" style="padding:12px">
      ${barChartSVG6M(chartData)}
      <div class="flex items-center justify-center gap-12 mt-8 fz-sm">
        <span><span style="display:inline-block;width:10px;height:10px;background:#22c55e;border-radius:2px;margin-right:4px"></span>Entradas</span>
        <span><span style="display:inline-block;width:10px;height:10px;background:#ff416d;border-radius:2px;margin-right:4px"></span>Saídas</span>
      </div>
    </div>

    <!-- 4. Projeções 30/60/90 dias -->
    <div class="section-header mt-16"><span class="section-title">Projeções</span></div>
    ${renderProjections(data, rb)}

    <!-- 5. Diagnóstico -->
    <div class="section-header mt-16"><span class="section-title">Diagnóstico</span></div>
    ${renderDiagnostico(data, rb, ms)}

    <!-- 6. Timeline por dia (expand/collapse) -->
    <div class="section-header mt-16"><span class="section-title">Timeline</span></div>
    ${renderTimeline()}
  `;

  $('#prevMonth').onclick = () => { view.setMonth(view.getMonth() - 1); render(); };
  $('#nextMonth').onclick = () => { view.setMonth(view.getMonth() + 1); render(); };

  page.querySelectorAll('.tl-day').forEach(el => {
    el.onclick = () => el.classList.toggle('expanded');
  });
}

function renderProjections(data, rb) {
  const ms = months(state);
  if (ms.length < 2) return '<div class="card text-dim">Dados insuficientes para projeções</div>';
  const avgIn = ms.reduce((s, m) => s + m.in, 0) / ms.length;
  const avgOut = ms.reduce((s, m) => s + m.out, 0) / ms.length;
  const netN = avgIn - avgOut;
  const netO = avgIn * 1.1 - avgOut * 0.9;
  const netP = avgIn * 0.9 - avgOut * 1.1;

  function projIndicator(v) {
    const icon = v >= 0 ? '▲' : '▼';
    const cls = v >= 0 ? 'text-green' : 'text-red';
    return `<span class="${cls}" style="font-size:10px">${icon}</span>`;
  }

  const rows = [30, 60, 90].map(d => {
    const vN = rb + netN * (d / 30);
    const vO = rb + netO * (d / 30);
    const vP = rb + netP * (d / 30);
    return `
      <div class="flex items-center justify-between gap-4" style="padding:10px 0;border-bottom:1px solid var(--line)">
        <span class="fz-sm text-dim fw-700" style="min-width:60px">${d} dias</span>
        <span class="flex items-center gap-4">
          ${projIndicator(vN)}
          <span class="text-dim fz-sm">${moneyFmt(vN)}</span>
        </span>
        <span class="flex items-center gap-4">
          ${projIndicator(vO)}
          <span class="fz-sm">${moneyFmt(vO)}</span>
        </span>
        <span class="flex items-center gap-4">
          ${projIndicator(vP)}
          <span class="text-red fz-sm">${moneyFmt(vP)}</span>
        </span>
      </div>`;
  }).join('');

  return `
    <div class="card">
      <div class="flex items-center justify-between mb-8">
        <span class="badge badge-blue badge-sm">Neutro</span>
        <span class="badge badge-green badge-sm">Otimista</span>
        <span class="badge badge-red badge-sm">Pessimista</span>
      </div>
      ${rows}
    </div>
  `;
}

function renderDiagnostico(data, rb, ms) {
  const caixaCard = data.net >= 0
    ? '<div class="card card-success"><div class="card-title">Caixa</div><div class="card-value sm text-green">Positivo</div><div class="card-sub">Entradas superam saídas</div></div>'
    : '<div class="card card-danger"><div class="card-title">Caixa</div><div class="card-value sm text-red">Pressionado</div><div class="card-sub">Saídas superam entradas</div></div>';

  const expTxs = mtx(state, k()).filter(t => !t.interno && t.tipo === 'despesa');
  const catTotals = {};
  expTxs.forEach(t => {
    const cid = t.cat || 'outros';
    catTotals[cid] = (catTotals[cid] || 0) + t.valor;
  });
  const topCat = Object.entries(catTotals).sort((a, b) => b[1] - a[1])[0];
  const topCatInfo = topCat ? catById(topCat[0], cats) : null;
  const topCatLabel = topCatInfo ? `${topCatInfo.icon || ''} ${topCatInfo.name}` : '—';

  let tendencia = 'Sem dados';
  let tendenciaCls = '';
  if (ms.length >= 3) {
    const last3 = ms.slice(-3);
    const nets = last3.map(m => m.net);
    if (nets[2] > nets[1] && nets[1] > nets[0]) { tendencia = 'Melhorando ↑'; tendenciaCls = 'text-green'; }
    else if (nets[2] < nets[1] && nets[1] < nets[0]) { tendencia = 'Piorando ↓'; tendenciaCls = 'text-red'; }
    else { tendencia = 'Estável →'; tendenciaCls = ''; }
  }

  const avgNet = ms.length ? ms.reduce((s, m) => s + m.net, 0) / ms.length : 0;
  const previsao = avgNet > 0 ? 'Superávit' : avgNet < 0 ? 'Déficit' : 'Neutro';
  const previsaoCls = avgNet > 0 ? 'text-green' : avgNet < 0 ? 'text-red' : '';

  return `
    <div class="kpi-grid">
      ${caixaCard}
      <div class="card">
        <div class="card-title">Maior Categoria Gasto</div>
        <div class="card-value sm">${topCatLabel}</div>
        <div class="card-sub">${topCat ? moneyFmt(topCat[1]) : 'Sem dados'}</div>
      </div>
      <div class="card">
        <div class="card-title">Tendência</div>
        <div class="card-value sm ${tendenciaCls}">${tendencia}</div>
        <div class="card-sub">Últimos 3 meses</div>
      </div>
      <div class="card">
        <div class="card-title">Previsão</div>
        <div class="card-value sm ${previsaoCls}">${previsao}</div>
        <div class="card-sub">Média mensal: ${moneyFmt(avgNet)}</div>
      </div>
    </div>
  `;
}

function renderTimeline() {
  const txs = mtx(state, k()).filter(t => !t.interno).sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  if (!txs.length) return '<div class="card text-dim">Nenhuma movimentação este mês</div>';
  let acc = getIB(state, k());
  const byDay = {};
  txs.forEach(t => {
    const d = t.date ? t.date.slice(8, 10) : '?';
    if (!byDay[d]) byDay[d] = { in: 0, out: 0, txs: [] };
    if (t.tipo === 'receita') byDay[d].in += t.valor;
    else byDay[d].out += t.valor;
    byDay[d].txs.push(t);
  });
  return Object.entries(byDay).map(([d, v]) => {
    acc += v.in - v.out;
    const detailRows = v.txs.map(t => {
      const catInfo = catById(t.cat || 'outros', cats);
      const catLabel = catInfo ? catInfo.icon || '' : '';
      return `<div class="flex items-center gap-8" style="padding:6px 0;border-top:1px solid var(--line2)">
        <span class="fz-sm">${catLabel}</span>
        <span class="flex-1 fz-sm" style="color:var(--txt2)">${shortDesc(t.desc || t.memo || '', 30)}</span>
        <span class="fz-sm fw-700 ${t.tipo === 'receita' ? 'text-green' : 'text-red'}">${moneyFmt(t.valor)}</span>
      </div>`;
    }).join('');
    return `<div class="tl-day" style="background:var(--card);border:1px solid var(--line);border-radius:var(--radius);margin-bottom:8px;overflow:hidden">
      <div style="display:flex;align-items:center;gap:12px;padding:12px 16px;cursor:pointer">
        <span class="list-icon" style="width:36px;height:36px;font-size:14px;font-weight:700">${d}</span>
        <div class="flex-1">
          <div class="fz-sm fw-600" style="color:#fff">${d}/${k().slice(5, 7)}</div>
          <div class="fz-sm" style="color:var(--txt3)">${v.txs.length} transação(ões)</div>
        </div>
        <div style="text-align:right">
          <div class="list-amount ${v.in - v.out >= 0 ? 'income' : 'expense'}" style="font-size:14px">${moneyFmt(v.in - v.out)}</div>
          <div class="fz-sm" style="color:var(--txt3)">Saldo: ${moneyFmt(acc)}</div>
        </div>
        <span class="tl-arrow fz-sm" style="color:var(--txt3);transition:transform .2s">▶</span>
      </div>
      <div class="tl-details" style="max-height:0;overflow:hidden;transition:max-height .3s ease;padding:0 16px">
        ${detailRows}
      </div>
    </div>`;
  }).join('');
}

// ======================================================================
// TRANSAÇÕES
// ======================================================================
const txFilters = { search: '', tipo: 'todos', cat: 'todas', period: 'mes', sort: 'data_desc' };

function txPeriodKeys() {
  const now = new Date();
  const cur = monthKey(now);
  if (txFilters.period === 'mes') return [cur];
  if (txFilters.period === '3meses') {
    const keys = [];
    for (let i = 0; i < 3; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      keys.push(monthKey(d));
    }
    return keys;
  }
  if (txFilters.period === '6meses') {
    const keys = [];
    for (let i = 0; i < 6; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      keys.push(monthKey(d));
    }
    return keys;
  }
  const all = new Set();
  (state.tx || []).forEach(t => { if (t && t.date) all.add(t.date.slice(0, 7)); });
  return [...all];
}

function txAllFiltered() {
  const keys = new Set(txPeriodKeys());
  let list = (state.tx || []).filter(t => t && t.date && keys.has(t.date.slice(0, 7)) && !t.canceled);
  if (txFilters.tipo === 'receita') list = list.filter(t => t.tipo === 'receita');
  else if (txFilters.tipo === 'despesa') list = list.filter(t => t.tipo === 'despesa');
  if (txFilters.cat !== 'todas') list = list.filter(t => t.cat === txFilters.cat);
  if (txFilters.search) {
    const q = norm(txFilters.search);
    list = list.filter(t => norm(t.desc || t.memo || '').includes(q) || norm(t.note || '').includes(q));
  }
  const [field, dir] = txFilters.sort.split('_');
  const mul = dir === 'asc' ? 1 : -1;
  if (field === 'data') list.sort((a, b) => mul * (a.date || '').localeCompare(b.date || ''));
  else list.sort((a, b) => mul * ((Number(a.valor) || 0) - (Number(b.valor) || 0)));
  return list;
}

function txStatusBadge(t) {
  if (t.canceled) return '<span class="badge badge-gray badge-sm">Cancelado</span>';
  if (t.pending) return '<span class="badge badge-orange badge-sm">Pendente</span>';
  if (t.interno) return '<span class="badge badge-purple badge-sm">Interno</span>';
  if (t.tipo === 'receita') return '<span class="badge badge-green badge-sm">Recebido</span>';
  return '<span class="badge badge-blue badge-sm">Pago</span>';
}

function txGroupByDate(txs) {
  const groups = {};
  const dayNames = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
  txs.forEach(t => {
    const d = t.date || 'sem-data';
    if (!groups[d]) groups[d] = [];
    groups[d].push(t);
  });
  return Object.keys(groups).sort((a, b) => b.localeCompare(a)).map(date => {
    const parts = date.split('-');
    let label = date;
    if (parts.length === 3) {
      const dt = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
      label = `${parts[2]} ${dt.toLocaleDateString('pt-BR', { month: 'short' })} - ${dayNames[dt.getDay()]}`;
    }
    const entradas = groups[date].filter(t => t.tipo === 'receita').reduce((s, t) => s + (Number(t.valor) || 0), 0);
    const saidas = groups[date].filter(t => t.tipo === 'despesa').reduce((s, t) => s + (Number(t.valor) || 0), 0);
    return { date, label, items: groups[date], entradas, saidas, sub: entradas - saidas };
  });
}

function txCatSummary(txs) {
  const byCat = {};
  txs.forEach(t => {
    if (t.interno) return;
    const cid = t.cat || 'outros';
    if (!byCat[cid]) byCat[cid] = { receita: 0, despesa: 0 };
    if (t.tipo === 'receita') byCat[cid].receita += Number(t.valor) || 0;
    else byCat[cid].despesa += Number(t.valor) || 0;
  });
  return Object.entries(byCat).map(([cid, v]) => {
    const c = catById(cid, cats);
    return { cid, name: c ? c.name : cid, icon: c ? c.icon : '📦', receita: v.receita, despesa: v.despesa, total: v.receita + v.despesa };
  }).sort((a, b) => b.total - a.total);
}

function txDonutData(txs) {
  const summary = txCatSummary(txs.filter(t => t.tipo === 'despesa'));
  return summary.slice(0, 8).map((s, i) => ({
    label: s.name, icon: s.icon, val: s.despesa, color: DONUT_COLORS[i % DONUT_COLORS.length]
  }));
}

function renderTransacoes() {
  const allTxs = txAllFiltered();
  const groups = txGroupByDate(allTxs);
  const aggData = agg(state, k());
  const totalReceitas = allTxs.filter(t => t.tipo === 'receita' && !t.interno).reduce((s, t) => s + (Number(t.valor) || 0), 0);
  const totalDespesas = allTxs.filter(t => t.tipo === 'despesa' && !t.interno).reduce((s, t) => s + (Number(t.valor) || 0), 0);
  const catsUsed = new Set(allTxs.filter(t => !t.interno).map(t => t.cat).filter(Boolean)).size;
  const catOptions = cats.filter(c => !c.inactive).map(c => `<option value="${c.id}" ${txFilters.cat === c.id ? 'selected' : ''}>${c.icon} ${esc(c.name)}</option>`).join('');
  const page = $('#page-transacoes');

  page.innerHTML = `
    <div class="flex items-center justify-between mb-12">
      <button class="icon-btn" id="prevMonth">◀</button>
      <h2 class="fz-lg fw-800">${view.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}</h2>
      <button class="icon-btn" id="nextMonth">▶</button>
    </div>

    <div class="kpi-grid mb-12">
      <div class="card">
        <div class="card-title">Total</div>
        <div class="card-value sm">${allTxs.length}</div>
        <div class="card-sub">transações</div>
      </div>
      <div class="card">
        <div class="card-title">Receitas</div>
        <div class="card-value text-green sm">${moneyFmt(totalReceitas)}</div>
      </div>
      <div class="card">
        <div class="card-title">Despesas</div>
        <div class="card-value text-red sm">${moneyFmt(totalDespesas)}</div>
      </div>
      <div class="card">
        <div class="card-title">Resultado</div>
        <div class="card-value ${aggData.net >= 0 ? 'text-green' : 'text-red'} sm">${moneyFmt(aggData.net)}</div>
      </div>
    </div>

    <div class="kpi-grid mb-12">
      <div class="card" style="grid-column:span 2">
        <div class="card-title">Categorias usadas</div>
        <div class="card-value sm">${catsUsed}</div>
      </div>
    </div>

    <div class="search-bar mb-8">
      <span>🔍</span>
      <input type="text" placeholder="Buscar transação..." id="txSearch" value="${esc(txFilters.search)}"/>
    </div>

    <div class="flex gap-8 mb-8 flex-wrap">
      <div class="chip-group" id="txTipoFilter">
        <button class="chip${txFilters.tipo === 'todos' ? ' active' : ''}" data-tipo="todos">Todos</button>
        <button class="chip${txFilters.tipo === 'receita' ? ' active' : ''}" data-tipo="receita">Receita</button>
        <button class="chip${txFilters.tipo === 'despesa' ? ' active' : ''}" data-tipo="despesa">Despesa</button>
      </div>
    </div>

    <div class="flex gap-8 mb-8 items-center" style="flex-wrap:wrap">
      <select class="form-select" id="txCatFilter" style="flex:1;min-width:120px;height:34px;font-size:12px">
        <option value="todas">Todas categorias</option>
        ${catOptions}
      </select>
      <select class="form-select" id="txPeriodFilter" style="flex:1;min-width:100px;height:34px;font-size:12px">
        <option value="mes" ${txFilters.period === 'mes' ? 'selected' : ''}>Mês atual</option>
        <option value="3meses" ${txFilters.period === '3meses' ? 'selected' : ''}>Últimos 3</option>
        <option value="6meses" ${txFilters.period === '6meses' ? 'selected' : ''}>Últimos 6</option>
        <option value="todos" ${txFilters.period === 'todos' ? 'selected' : ''}>Todos</option>
      </select>
      <select class="form-select" id="txSortFilter" style="flex:1;min-width:100px;height:34px;font-size:12px">
        <option value="data_desc" ${txFilters.sort === 'data_desc' ? 'selected' : ''}>Data ↓</option>
        <option value="data_asc" ${txFilters.sort === 'data_asc' ? 'selected' : ''}>Data ↑</option>
        <option value="valor_desc" ${txFilters.sort === 'valor_desc' ? 'selected' : ''}>Valor ↓</option>
        <option value="valor_asc" ${txFilters.sort === 'valor_asc' ? 'selected' : ''}>Valor ↑</option>
      </select>
    </div>

    <div class="section-header mt-12">
      <span class="section-title">Resumo por Categoria</span>
    </div>
    <div class="flex gap-12 mb-16" style="overflow-x:auto;padding:4px 0">
      ${txCatSummary(allTxs).slice(0, 6).map(s => {
        const pct = totalDespesas > 0 && s.despesa > 0 ? Math.round(s.despesa / totalDespesas * 100) : 0;
        return `<div class="card" style="min-width:130px;flex-shrink:0">
          <div class="flex items-center gap-4 mb-4">
            <span style="font-size:18px">${s.icon}</span>
            <span class="fz-sm fw-800" style="color:var(--txt2)">${esc(s.name)}</span>
          </div>
          <div class="card-value sm" style="font-size:14px">${moneyFmt(s.total)}</div>
          ${s.despesa > 0 ? `<div class="card-sub">${pct}% das despesas</div>` : ''}
        </div>`;
      }).join('') || '<div class="text-dim fz-sm" style="padding:8px">Sem dados no período</div>'}
    </div>

    ${txDonutData(allTxs).length > 0 ? `
    <div class="card mb-16" style="display:flex;align-items:center;gap:16px">
      <div style="flex-shrink:0">${donutSVG(txDonutData(allTxs), 90)}</div>
      <div style="flex:1;min-width:0">
        <div class="card-title mb-4">Distribuição de despesas</div>
        ${txDonutData(allTxs).slice(0, 4).map(d => `<div class="flex items-center gap-4 mb-4" style="font-size:12px"><span style="width:10px;height:10px;border-radius:50%;background:${d.color};flex-shrink:0"></span><span class="text-dim" style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(d.label)}</span><span class="fw-800">${moneyFmt(d.val)}</span></div>`).join('')}
      </div>
    </div>` : ''}

    <div id="txList">
      ${groups.length ? groups.map(g => `
        <div class="section-header">
          <span class="section-title" style="font-size:13px">${esc(g.label)}</span>
          <span class="badge ${g.sub >= 0 ? 'badge-green' : 'badge-red'} badge-sm">${g.sub >= 0 ? '+' : ''}${moneyFmt(g.sub)}</span>
        </div>
        ${g.items.map(t => {
          const cat = catById(t.cat, cats);
          const isCanceled = t.canceled;
          return `<div class="list-item" data-tx="${t.id}" style="${isCanceled ? 'opacity:.5' : ''}">
            <div class="list-icon" style="${t.tipo === 'receita' ? 'background:rgba(32,223,154,.15)' : 'background:rgba(255,65,109,.12)'}">${cat ? cat.icon : '📦'}</div>
            <div class="list-body">
              <div class="list-title" style="font-size:13px">${esc(shortDesc(t.desc || t.memo || 'Lançamento', 28))}</div>
              <div class="list-sub">${esc(cat ? cat.name : 'Sem categoria')} · ${txStatusBadge(t)}${t.note ? ' · 📝' : ''}</div>
            </div>
            <div class="list-value">
              <div class="list-amount ${t.tipo === 'receita' ? 'income' : 'expense'}" style="font-size:14px">${t.tipo === 'receita' ? '+' : '−'}${moneyFmt(t.valor)}</div>
              <div class="fz-sm" style="color:var(--txt3);margin-top:2px">${t.date ? t.date.slice(8, 10) + '/' + t.date.slice(5, 7) : ''}</div>
            </div>
          </div>`;
        }).join('')}
      `).join('') : `
        <div class="empty-state">
          <div class="empty-icon">📋</div>
          <div class="empty-title">Sem transações</div>
          <div class="empty-text">Importe um extrato ou crie manualmente</div>
          <button class="btn btn-primary" id="txEmptyCreate" style="margin-top:12px">+ Criar transação</button>
        </div>
      `}
    </div>

    <button class="btn btn-primary" id="txCreateBtn" style="position:fixed;bottom:72px;right:16px;width:56px;height:56px;border-radius:50%;font-size:24px;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 16px rgba(116,72,255,.4);z-index:50;padding:0">+</button>
  `;

  $('#prevMonth').onclick = () => { view.setMonth(view.getMonth() - 1); render(); };
  $('#nextMonth').onclick = () => { view.setMonth(view.getMonth() + 1); render(); };
  $('#txSearch').oninput = (e) => { txFilters.search = e.target.value; render(); };

  $('#txTipoFilter').querySelectorAll('.chip').forEach(btn => {
    btn.onclick = () => { txFilters.tipo = btn.dataset.tipo; render(); };
  });
  $('#txCatFilter').onchange = (e) => { txFilters.cat = e.target.value; render(); };
  $('#txPeriodFilter').onchange = (e) => { txFilters.period = e.target.value; render(); };
  $('#txSortFilter').onchange = (e) => { txFilters.sort = e.target.value; render(); };

  const createBtn = $('#txCreateBtn');
  if (createBtn) createBtn.onclick = () => txOpenCreate();
  const emptyCreateBtn = $('#txEmptyCreate');
  if (emptyCreateBtn) emptyCreateBtn.onclick = () => txOpenCreate();

  page.querySelectorAll('[data-tx]').forEach(el => {
    el.onclick = () => txOpenDetail(el.dataset.tx);
  });
}

function txOpenCreate() {
  const tipo = 'despesa';
  const today = new Date().toISOString().slice(0, 10);
  const filteredCats = cats.filter(c => !c.inactive && (!c.type || c.type === tipo || c.type === 'ambos'));
  const optionsHtml = filteredCats.map(c => `<option value="${c.id}">${c.icon} ${esc(c.name)}</option>`).join('');

  const html = `
    <div class="modal-header">
      <div class="modal-title">Nova Transação</div>
    </div>
    <form id="txForm" autocomplete="off">
      <div class="form-group">
        <label class="form-label">Tipo</label>
        <div class="flex gap-8">
          <button type="button" class="btn btn-secondary" id="txTypeDespesa" style="flex:1;height:36px;font-size:13px">Despesa</button>
          <button type="button" class="btn btn-secondary" id="txTypeReceita" style="flex:1;height:36px;font-size:13px">Receita</button>
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Descrição *</label>
        <input type="text" class="form-input" id="f-desc" placeholder="Ex: Supermercado" autocomplete="off"/>
      </div>
      <div class="form-group">
        <label class="form-label">Valor (R$) *</label>
        <input type="text" class="form-input" id="f-valor" placeholder="0,00" inputmode="decimal"/>
      </div>
      <div class="form-group">
        <label class="form-label">Data *</label>
        <input type="date" class="form-input" id="f-date" value="${today}"/>
      </div>
      <div class="form-group">
        <label class="form-label">Categoria</label>
        <select class="form-select" id="f-cat">${optionsHtml}</select>
      </div>
      <div class="form-group">
        <label class="form-label">Conta bancária</label>
        <input type="text" class="form-input" id="f-account" placeholder="Ex: Nubank, Itaú..." autocomplete="off"/>
      </div>
      <div class="form-group">
        <label class="form-label">Observação</label>
        <textarea class="form-textarea" id="f-note" placeholder="Nota opcional..." rows="2"></textarea>
      </div>
      <div class="flex gap-8 mt-16">
        <button class="btn btn-secondary" type="button" id="txFormCancel" style="flex:1">Cancelar</button>
        <button class="btn btn-primary" type="submit" id="txFormSubmit" style="flex:2">Salvar</button>
      </div>
    </form>
  `;
  openModal(html);

  setTimeout(() => {
    let currentTipo = tipo;
    const typeD = $('#txTypeDespesa');
    const typeR = $('#txTypeReceita');
    const catSel = $('#f-cat');

    function updateTypeBtns() {
      typeD.className = 'btn' + (currentTipo === 'despesa' ? ' btn-primary' : ' btn-secondary');
      typeR.className = 'btn' + (currentTipo === 'receita' ? ' btn-primary' : ' btn-secondary');
    }
    function updateCats() {
      const filtered = cats.filter(c => !c.inactive && (!c.type || c.type === currentTipo || c.type === 'ambos'));
      catSel.innerHTML = filtered.map(c => `<option value="${c.id}">${c.icon} ${esc(c.name)}</option>`).join('');
    }
    updateTypeBtns();
    typeD.onclick = () => { currentTipo = 'despesa'; updateTypeBtns(); updateCats(); };
    typeR.onclick = () => { currentTipo = 'receita'; updateTypeBtns(); updateCats(); };

    const valorInput = $('#f-valor');
    valorInput.oninput = () => {
      let v = valorInput.value.replace(/[^\d,\.]/g, '');
      v = v.replace(',', '.');
      if (v && !isNaN(Number(v))) valorInput.dataset.raw = v;
    };

    $('#txFormCancel').onclick = closeModal;
    $('#txForm').onsubmit = (e) => {
      e.preventDefault();
      const desc = ($('#f-desc') || {}).value || '';
      const raw = (valorInput.dataset.raw || valorInput.value || '').replace(',', '.');
      const valor = Number(raw);
      const date = ($('#f-date') || {}).value || '';
      if (!desc.trim()) { showToast('Informe a descrição'); return; }
      if (!valor || valor <= 0) { showToast('Informe um valor válido'); return; }
      if (!date) { showToast('Informe a data'); return; }
      const cat = ($('#f-cat') || {}).value || 'outros';
      const account = ($('#f-account') || {}).value || '';
      const note = ($('#f-note') || {}).value || '';
      const tx = {
        id: 'man:' + uid(),
        date,
        tipo: currentTipo,
        valor: Math.abs(valor),
        desc: desc.trim(),
        memo: desc.trim(),
        cat,
        pending: false,
        canceled: false,
        status: currentTipo === 'receita' ? 'recebido' : 'pago',
        paidAt: new Date().toISOString(),
        manual: true,
        interno: false,
        account,
        note,
        installmentIndex: 0,
        installmentTotal: 0,
        seriesId: '',
      };
      addTx(state, tx);
      save();
      closeModal();
      showToast('Transação criada!');
    };
  }, 50);
}

function txOpenDetail(id) {
  const t = (state.tx || []).find(x => x && x.id === id);
  if (!t) return;
  const cat = catById(t.cat, cats);
  const st = commitmentStatus(t);

  const html = `
    <div class="modal-header">
      <div class="modal-title">Detalhe da Transação</div>
    </div>
    <div class="card mb-12" style="text-align:center;padding:20px">
      <div style="font-size:32px;margin-bottom:8px">${cat ? cat.icon : '📦'}</div>
      <div style="font-size:18px;font-weight:800;color:#fff;margin-bottom:4px">${esc(t.desc || t.memo || 'Sem descrição')}</div>
      <div class="list-amount ${t.tipo === 'receita' ? 'income' : 'expense'}" style="font-size:28px;margin-bottom:8px">
        ${t.tipo === 'receita' ? '+' : '−'}${moneyFmt(t.valor)}
      </div>
      <div class="flex gap-8 items-center" style="justify-content:center;flex-wrap:wrap">
        ${txStatusBadge(t)}
        <span class="badge badge-sm" style="background:${t.tipo === 'receita' ? 'rgba(32,223,154,.15)' : 'rgba(255,65,109,.12)'};color:${t.tipo === 'receita' ? 'var(--green)' : 'var(--red)'}">${t.tipo === 'receita' ? 'Receita' : 'Despesa'}</span>
      </div>
    </div>

    <div class="card mb-8">
      <div class="flex justify-between items-center mb-8">
        <span class="text-dim fz-sm">Categoria</span>
        <span class="fz-sm fw-800">${cat ? cat.icon + ' ' + esc(cat.name) : 'Sem categoria'}</span>
      </div>
      <div class="flex justify-between items-center mb-8">
        <span class="text-dim fz-sm">Data</span>
        <span class="fz-sm fw-800">${t.date || '—'}</span>
      </div>
      <div class="flex justify-between items-center mb-8">
        <span class="text-dim fz-sm">Status</span>
        <span class="fz-sm fw-800">${st.label}</span>
      </div>
      ${t.account ? `<div class="flex justify-between items-center mb-8"><span class="text-dim fz-sm">Conta</span><span class="fz-sm fw-800">${esc(t.account)}</span></div>` : ''}
      ${t.paidAt ? `<div class="flex justify-between items-center mb-8"><span class="text-dim fz-sm">Confirmado em</span><span class="fz-sm fw-800">${t.paidAt.slice(0, 10)}</span></div>` : ''}
      ${t.note ? `<div class="flex justify-between items-center mb-8"><span class="text-dim fz-sm">Obs</span><span class="fz-sm" style="text-align:right;max-width:60%">${esc(t.note)}</span></div>` : ''}
      ${t.manual ? '<div class="flex justify-between items-center"><span class="text-dim fz-sm">Origem</span><span class="fz-sm fw-800">Manual</span></div>' : ''}
    </div>

    <div class="flex gap-8 mt-16">
      <button class="btn btn-secondary" id="txDetailEdit" style="flex:1">✏️ Editar</button>
      ${t.pending ? `<button class="btn btn-primary" id="txDetailConfirm" style="flex:1">✅ Confirmar</button>` : ''}
      <button class="btn btn-danger" id="txDetailDelete" style="flex:1">🗑️ Excluir</button>
    </div>
  `;
  openModal(html);

  setTimeout(() => {
    $('#txDetailEdit').onclick = () => { closeModal(); setTimeout(() => txOpenEdit(id), 350); };
    const confirmBtn = $('#txDetailConfirm');
    if (confirmBtn) confirmBtn.onclick = () => { confirmTx(state, id); save(); closeModal(); showToast('Pagamento confirmado!'); };
    $('#txDetailDelete').onclick = () => {
      closeModal();
      setTimeout(() => txConfirmDelete(id), 350);
    };
  }, 50);
}

function txOpenEdit(id) {
  const t = (state.tx || []).find(x => x && x.id === id);
  if (!t) return;
  const today = t.date || new Date().toISOString().slice(0, 10);
  const currentTipo = t.tipo || 'despesa';
  const filteredCats = cats.filter(c => !c.inactive && (!c.type || c.type === currentTipo || c.type === 'ambos'));
  const optionsHtml = filteredCats.map(c => `<option value="${c.id}" ${c.id === t.cat ? 'selected' : ''}>${c.icon} ${esc(c.name)}</option>`).join('');

  const html = `
    <div class="modal-header">
      <div class="modal-title">Editar Transação</div>
    </div>
    <form id="txEditForm" autocomplete="off">
      <div class="form-group">
        <label class="form-label">Tipo</label>
        <div class="flex gap-8">
          <button type="button" class="btn${currentTipo === 'despesa' ? ' btn-primary' : ' btn-secondary'}" id="txEditTypeD" style="flex:1;height:36px;font-size:13px">Despesa</button>
          <button type="button" class="btn${currentTipo === 'receita' ? ' btn-primary' : ' btn-secondary'}" id="txEditTypeR" style="flex:1;height:36px;font-size:13px">Receita</button>
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Descrição *</label>
        <input type="text" class="form-input" id="f-desc" value="${esc(t.desc || '')}" autocomplete="off"/>
      </div>
      <div class="form-group">
        <label class="form-label">Valor (R$) *</label>
        <input type="text" class="form-input" id="f-valor" value="${(Number(t.valor) || 0).toFixed(2).replace('.', ',')}" inputmode="decimal"/>
      </div>
      <div class="form-group">
        <label class="form-label">Data *</label>
        <input type="date" class="form-input" id="f-date" value="${today}"/>
      </div>
      <div class="form-group">
        <label class="form-label">Categoria</label>
        <select class="form-select" id="f-cat">${optionsHtml}</select>
      </div>
      <div class="form-group">
        <label class="form-label">Conta bancária</label>
        <input type="text" class="form-input" id="f-account" value="${esc(t.account || '')}" autocomplete="off"/>
      </div>
      <div class="form-group">
        <label class="form-label">Observação</label>
        <textarea class="form-textarea" id="f-note" rows="2">${esc(t.note || '')}</textarea>
      </div>
      <div class="flex gap-8 mt-16">
        <button class="btn btn-secondary" type="button" id="txEditCancel" style="flex:1">Cancelar</button>
        <button class="btn btn-primary" type="submit" style="flex:2">Salvar</button>
      </div>
    </form>
  `;
  openModal(html);

  setTimeout(() => {
    let editTipo = currentTipo;
    const typeD = $('#txEditTypeD');
    const typeR = $('#txEditTypeR');
    const catSel = $('#f-cat');
    const valorInput = $('#f-valor');

    function updateTypeBtns() {
      typeD.className = 'btn' + (editTipo === 'despesa' ? ' btn-primary' : ' btn-secondary');
      typeR.className = 'btn' + (editTipo === 'receita' ? ' btn-primary' : ' btn-secondary');
    }
    function updateCats() {
      const filtered = cats.filter(c => !c.inactive && (!c.type || c.type === editTipo || c.type === 'ambos'));
      const prev = catSel.value;
      catSel.innerHTML = filtered.map(c => `<option value="${c.id}">${c.icon} ${esc(c.name)}</option>`).join('');
      if (filtered.some(c => c.id === prev)) catSel.value = prev;
    }
    typeD.onclick = () => { editTipo = 'despesa'; updateTypeBtns(); updateCats(); };
    typeR.onclick = () => { editTipo = 'receita'; updateTypeBtns(); updateCats(); };

    valorInput.oninput = () => {
      let v = valorInput.value.replace(/[^\d,\.]/g, '').replace(',', '.');
      if (v && !isNaN(Number(v))) valorInput.dataset.raw = v;
    };
    valorInput.dataset.raw = String(Number(t.valor) || 0);

    $('#txEditCancel').onclick = closeModal;
    $('#txEditForm').onsubmit = (e) => {
      e.preventDefault();
      const desc = ($('#f-desc') || {}).value || '';
      const raw = (valorInput.dataset.raw || valorInput.value || '').replace(',', '.');
      const valor = Number(raw);
      const date = ($('#f-date') || {}).value || '';
      if (!desc.trim()) { showToast('Informe a descrição'); return; }
      if (!valor || valor <= 0) { showToast('Informe um valor válido'); return; }
      if (!date) { showToast('Informe a data'); return; }
      t.desc = desc.trim();
      t.memo = t.memo || desc.trim();
      t.valor = Math.abs(valor);
      t.date = date;
      t.tipo = editTipo;
      t.cat = ($('#f-cat') || {}).value || 'outros';
      t.account = ($('#f-account') || {}).value || '';
      t.note = ($('#f-note') || {}).value || '';
      save();
      closeModal();
      showToast('Transação atualizada!');
    };
  }, 50);
}

function txConfirmDelete(id) {
  const html = `
    <div class="modal-header">
      <div class="modal-title">Excluir transação?</div>
    </div>
    <p class="text-dim fz-sm mb-16" style="line-height:1.6">Esta ação não pode ser desfeita.</p>
    <div class="flex gap-8">
      <button class="btn btn-secondary" id="txDelCancel" style="flex:1">Cancelar</button>
      <button class="btn btn-danger" id="txDelConfirm" style="flex:1">Excluir</button>
    </div>
  `;
  openModal(html);
  setTimeout(() => {
    $('#txDelCancel').onclick = closeModal;
    $('#txDelConfirm').onclick = () => { deleteTx(state, id); save(); closeModal(); showToast('Transação excluída!'); };
  }, 50);
}

// ======================================================================
// LANÇAMENTOS
// ======================================================================
function renderLancamentos() {
  const pending = state.tx.filter(t => t && t.pending && !t.canceled);
  const pendingThis = pending.filter(t => t.date && t.date.startsWith(k() + '-'));
  const page = $('#page-lancamentos');
  page.innerHTML = `
    <div class="flex items-center justify-between mb-16">
      <button class="icon-btn" id="prevMonth">◀</button>
      <h2 class="fz-lg fw-800">${view.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}</h2>
      <button class="icon-btn" id="nextMonth">▶</button>
    </div>

    <div class="section-header">
      <span class="section-title">📅 Calendário</span>
    </div>
    ${renderMiniCalendar(pendingThis)}

    <div class="section-header mt-16">
      <span class="section-title">Contas a Pagar</span>
      <span class="badge badge-red">${pendingThis.filter(t => t.tipo === 'despesa').length} abertas</span>
    </div>
    ${renderLancList(pendingThis.filter(t => t.tipo === 'despesa'), 'despesa')}

    <div class="section-header mt-16">
      <span class="section-title">Contas a Receber</span>
      <span class="badge badge-green">${pendingThis.filter(t => t.tipo === 'receita').length} abertas</span>
    </div>
    ${renderLancList(pendingThis.filter(t => t.tipo === 'receita'), 'receita')}
  `;

  $('#prevMonth').onclick = () => { view.setMonth(view.getMonth() - 1); render(); };
  $('#nextMonth').onclick = () => { view.setMonth(view.getMonth() + 1); render(); };

  // Bind actions
  page.querySelectorAll('[data-confirm]').forEach(b => b.onclick = () => { confirmTx(state, b.dataset.confirm); save(); });
  page.querySelectorAll('[data-cancel]').forEach(b => b.onclick = () => { cancelParcela(state, b.dataset.cancel); save(); });
  page.querySelectorAll('[data-delete]').forEach(b => b.onclick = () => { deleteTx(state, b.dataset.delete); save(); });
}

function renderMiniCalendar(txs) {
  const y = view.getFullYear(), m = view.getMonth();
  const first = new Date(y, m, 1).getDay();
  const days = new Date(y, m + 1, 0).getDate();
  const tdy = new Date();
  const byDate = {};
  txs.forEach(t => {
    if (t.date && t.date.startsWith(k() + '-')) {
      const d = parseInt(t.date.slice(8, 10));
      if (!byDate[d]) byDate[d] = [];
      byDate[d].push(t);
    }
  });
  const headers = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'];
  let cells = headers.map(h => `<div class="cal-header">${h}</div>`).join('');
  for (let i = 0; i < first; i++) cells += '<div class="cal-day"></div>';
  for (let d = 1; d <= days; d++) {
    const items = byDate[d] || [];
    const isToday = tdy.getFullYear() === y && tdy.getMonth() === m && tdy.getDate() === d;
    const hasIn = items.some(t => t.tipo === 'receita');
    const hasOut = items.some(t => t.tipo === 'despesa');
    cells += `<div class="cal-day${isToday ? ' today' : ''}${items.length ? ' has-tx' : ''}${hasIn ? ' income' : ''}${hasOut ? ' expense' : ''}" title="${items.length} lançamento(s)">${d}</div>`;
  }
  return `<div class="calendar-grid">${cells}</div>`;
}

function renderLancList(txs, tipo) {
  if (!txs.length) return '<div class="card text-dim fz-sm">Nenhum lançamento pendente</div>';
  return txs.map(t => {
    const st = commitmentStatus(t);
    return `<div class="list-item">
      <div class="list-body">
        <div class="list-title">${esc(shortDesc(t.desc || t.memo || 'Lançamento', 30))}</div>
        <div class="list-sub">${t.date || '—'} · <span class="badge badge-${st.cls === 'due-ok' ? 'green' : st.cls === 'due-bad' ? 'red' : 'orange'}">${st.label}</span></div>
      </div>
      <div class="list-value">
        <div class="list-amount ${tipo === 'receita' ? 'income' : 'expense'}">${moneyFmt(t.valor)}</div>
        <div class="flex gap-4 mt-8">
          <button class="btn btn-primary btn-sm" data-confirm="${t.id}" style="width:auto;padding:0 12px;height:32px;font-size:12px">✓ Pago</button>
          <button class="btn btn-danger btn-sm" data-cancel="${t.id}" style="width:auto;padding:0 12px;height:32px;font-size:12px">✕</button>
        </div>
      </div>
    </div>`;
  }).join('');
}

// ======================================================================
// MAIS (menu grid)
// ======================================================================
function renderMais() {
  const items = [
    { icon: '📊', label: 'Análises', page: 'analises' },
    { icon: '📁', label: 'Categorias', page: 'categorias' },
    { icon: '🎯', label: 'Metas', page: 'metas' },
    { icon: '📈', label: 'Relatórios', page: 'relatorios' },
    { icon: '💸', label: 'Destino/Origem', page: 'destino' },
    { icon: '🏠', label: 'Patrimônio', page: 'patrimonio' },
    { icon: '🏦', label: 'Bancos', page: 'bancos' },
    { icon: '🔄', label: 'Conciliação', page: 'conciliacao' },
    { icon: '⚙️', label: 'Configurações', page: 'config' },
  ];
  $('#page-mais').innerHTML = `
    <h2 class="fz-lg fw-800 mb-16">Mais</h2>
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px">
      ${items.map(i => `
        <button class="card" style="text-align:center;cursor:pointer;padding:16px 8px" onclick="window.__mob.goPage('${i.page}')">
          <div style="font-size:28px;margin-bottom:6px">${i.icon}</div>
          <div class="fz-sm fw-600">${i.label}</div>
        </button>
      `).join('')}
    </div>
  `;
}

// ======================================================================
// SUB-PAGES (stubs — implementação completa nas fases seguintes)
// ======================================================================
function renderCategorias() {
  const page = $('#page-categorias');
  const allTxs = (state.tx || []).filter(t => t && !t.canceled);
  const txsMes = mtx(state, k()).filter(t => !t.interno);
  const overrides = (state.catOverrides && typeof state.catOverrides === 'object') ? state.catOverrides : {};

  const CAT_ICONS = ['📦','🏷️','💰','💳','🛒','🧩','✨','🚗','💊','🏠','🏦','📊','🎁','✈️','🎵','📸','📚','👶','🐾','💼','📈','↩️','💸','👥','⚡','🎬','🍳','🏋️','💻','🎮','🧘','🌱','🔧','🎨','🏠','🎓','📦'];

  const DRE_OPTIONS = DRE_GROUPS.map(g => `<option value="${g.id}">${g.name}</option>`).join('');

  let catTab = 'todas';
  let catSearch = '';
  let catSort = 'nome';

  function countUsage(catId) {
    return allTxs.filter(t => t.cat === catId).length;
  }

  function getFilteredCats() {
    let list = cats.slice();
    if (catTab === 'padrao') list = list.filter(c => !c.custom && !c.inactive);
    else if (catTab === 'personalizadas') list = list.filter(c => c.custom && !c.inactive);
    else if (catTab === 'inativas') list = list.filter(c => c.inactive);
    else list = list.filter(c => !c.inactive);
    if (catSearch) {
      const q = norm(catSearch);
      list = list.filter(c => norm(c.name).includes(q));
    }
    list.sort((a, b) => {
      if (catSort === 'uso') return countUsage(b.id) - countUsage(a.id);
      return a.name.localeCompare(b.name, 'pt-BR');
    });
    return list;
  }

  function renderList() {
    const filtered = getFilteredCats();
    const catListEl = page.querySelector('#catList');
    if (!catListEl) return;
    if (!filtered.length) {
      catListEl.innerHTML = '<div class="empty-state" style="padding:32px 0"><div class="empty-icon">📁</div><div class="empty-title">Nenhuma categoria</div><div class="empty-text">Crie uma nova categoria ou ajuste os filtros</div></div>';
      return;
    }
    catListEl.innerHTML = filtered.map(c => {
      const uso = countUsage(c.id);
      const tipoBadge = c.type === 'receita' ? '<span class="badge badge-green badge-sm">Receita</span>' : c.type === 'despesa' ? '<span class="badge badge-red badge-sm">Despesa</span>' : '<span class="badge badge-gray badge-sm">Ambos</span>';
      const actions = c.custom ? `<span class="fz-sm" style="color:var(--txt3);cursor:pointer;padding:4px 8px" data-cat-edit="${c.id}">✏️</span>` : '';
      return `<div class="list-item" data-cat-detail="${c.id}" style="cursor:pointer;${c.inactive ? 'opacity:.5' : ''}">
        <div class="list-icon">${c.icon || '📦'}</div>
        <div class="list-body">
          <div class="list-title">${esc(c.name)} ${c.inactive ? '<span class="badge badge-gray badge-sm">Inativa</span>' : ''}</div>
          <div class="list-sub">${tipoBadge} · ${uso} uso${uso !== 1 ? 's' : ''}</div>
        </div>
        <div style="display:flex;align-items:center;gap:4px">
          ${actions}
          <span style="color:var(--txt3);font-size:12px">›</span>
        </div>
      </div>`;
    }).join('');
    catListEl.querySelectorAll('[data-cat-detail]').forEach(el => {
      el.onclick = (e) => {
        if (e.target.closest('[data-cat-edit]')) return;
        showCatDetail(el.dataset.catDetail);
      };
    });
    catListEl.querySelectorAll('[data-cat-edit]').forEach(el => {
      el.onclick = (e) => {
        e.stopPropagation();
        openCatModal(el.dataset.catEdit);
      };
    });
  }

  function renderHeader() {
    const total = cats.filter(c => !c.inactive).length;
    const padrao = cats.filter(c => !c.custom && !c.inactive).length;
    const pers = cats.filter(c => c.custom && !c.inactive).length;
    const inat = cats.filter(c => c.inactive).length;
    const tabs = [
      { id: 'todas', label: `Todas (${total})` },
      { id: 'padrao', label: `Padrão (${padrao})` },
      { id: 'personalizadas', label: `Pers. (${pers})` },
      { id: 'inativas', label: `Inativas (${inat})` },
    ];
    page.innerHTML = `
      <div class="flex items-center justify-between mb-16">
        <h2 class="fz-lg fw-800">Categorias</h2>
        <button class="btn btn-primary btn-sm" id="addCatBtn" style="width:auto;padding:0 14px;height:32px;font-size:12px">+ Nova</button>
      </div>
      <div class="tabs" id="catTabs">
        ${tabs.map(t => `<button class="tab${t.id === catTab ? ' active' : ''}" data-tab="${t.id}">${t.label}</button>`).join('')}
      </div>
      <div class="search-bar">
        <span>🔍</span>
        <input type="text" placeholder="Buscar categoria..." id="catSearchInput" value="${esc(catSearch)}"/>
      </div>
      <div class="flex items-center justify-between mb-12">
        <span class="fz-sm text-dim">${getFilteredCats().length} categoria(s)</span>
        <select class="form-select" id="catSortSelect" style="width:auto;padding:4px 8px;font-size:12px;height:28px;border-radius:8px">
          <option value="nome"${catSort === 'nome' ? ' selected' : ''}>A-Z</option>
          <option value="uso"${catSort === 'uso' ? ' selected' : ''}>Mais usada</option>
        </select>
      </div>
      <div id="catList"></div>
    `;
    page.querySelector('#addCatBtn').onclick = () => openCatModal(null);
    page.querySelectorAll('[data-tab]').forEach(btn => {
      btn.onclick = () => {
        catTab = btn.dataset.tab;
        renderHeader();
      };
    });
    page.querySelector('#catSearchInput').oninput = (e) => {
      catSearch = e.target.value;
      renderList();
    };
    page.querySelector('#catSortSelect').onchange = (e) => {
      catSort = e.target.value;
      renderList();
    };
    renderList();
  }

  function openCatModal(editId) {
    const editCat = editId ? cats.find(c => c.id === editId) : null;
    const isEdit = !!editCat;
    const title = isEdit ? 'Editar Categoria' : 'Nova Categoria';
    const name = editCat ? editCat.name : '';
    const icon = editCat ? (editCat.icon || '🏷️') : '🏷️';
    const type = editCat ? (editCat.type || 'despesa') : 'despesa';
    const dre = editCat ? (editCat.dreGroup || 'despesas_variaveis') : 'despesas_variaveis';

    const html = `
      <div class="modal-title" style="font-size:18px;font-weight:800;margin-bottom:16px;color:#fff">${title}</div>
      <div class="form-group">
        <label class="form-label">Nome</label>
        <input class="form-input" id="catNameInput" value="${esc(name)}" placeholder="Ex: Alimentação"/>
      </div>
      <div class="form-group">
        <label class="form-label">Ícone</label>
        <div class="flex flex-wrap gap-4" id="catIconPicker">
          ${CAT_ICONS.map(e => `<span data-emoji="${e}" style="font-size:22px;cursor:pointer;padding:4px 6px;border-radius:8px;border:2px solid ${e === icon ? 'var(--accent)' : 'transparent'};transition:border-color .15s">${e}</span>`).join('')}
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Tipo</label>
        <div class="flex gap-8">
          <button class="btn${type === 'despesa' ? ' btn-primary' : ' btn-secondary'}" id="catTypeDespesa" style="flex:1;height:36px;font-size:13px">Despesa</button>
          <button class="btn${type === 'receita' ? ' btn-primary' : ' btn-secondary'}" id="catTypeReceita" style="flex:1;height:36px;font-size:13px">Receita</button>
          <button class="btn${!type || type === 'ambos' ? ' btn-primary' : ' btn-secondary'}" id="catTypeAmbos" style="flex:1;height:36px;font-size:13px">Ambos</button>
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Grupo DRE</label>
        <select class="form-select" id="catDreSelect">${DRE_OPTIONS}</select>
      </div>
      <button class="btn btn-primary" id="catSaveBtn" style="width:100%;margin-top:12px;height:42px">Salvar</button>
    `;
    openModal(html, { draggable: true });

    setTimeout(() => {
      let selectedIcon = icon;
      let selectedType = type;
      const mc = $('#modalContent');

      mc.querySelectorAll('[data-emoji]').forEach(el => {
        el.onclick = () => {
          selectedIcon = el.dataset.emoji;
          mc.querySelectorAll('[data-emoji]').forEach(x => x.style.borderColor = 'transparent');
          el.style.borderColor = 'var(--accent)';
        };
      });

      function updateTypeBtns() {
        const btnD = mc.querySelector('#catTypeDespesa');
        const btnR = mc.querySelector('#catTypeReceita');
        const btnA = mc.querySelector('#catTypeAmbos');
        if (btnD) { btnD.className = 'btn' + (selectedType === 'despesa' ? ' btn-primary' : ' btn-secondary'); }
        if (btnR) { btnR.className = 'btn' + (selectedType === 'receita' ? ' btn-primary' : ' btn-secondary'); }
        if (btnA) { btnA.className = 'btn' + ((!selectedType || selectedType === 'ambos') ? ' btn-primary' : ' btn-secondary'); }
      }

      const btnD = mc.querySelector('#catTypeDespesa');
      const btnR = mc.querySelector('#catTypeReceita');
      const btnA = mc.querySelector('#catTypeAmbos');
      if (btnD) btnD.onclick = () => { selectedType = 'despesa'; updateTypeBtns(); };
      if (btnR) btnR.onclick = () => { selectedType = 'receita'; updateTypeBtns(); };
      if (btnA) btnA.onclick = () => { selectedType = null; updateTypeBtns(); };

      const dreSelect = mc.querySelector('#catDreSelect');
      if (dreSelect) dreSelect.value = dre;

      mc.querySelector('#catSaveBtn').onclick = () => {
        const nameVal = (mc.querySelector('#catNameInput').value || '').trim();
        if (!nameVal) { showToast('Nome obrigatório'); return; }

        const nameLower = nameVal.toLowerCase();
        const duplicate = cats.some(c => c.id !== editId && c.name.toLowerCase() === nameLower);
        if (duplicate) { showToast('Já existe uma categoria com esse nome'); return; }

        const dreVal = dreSelect ? dreSelect.value : 'despesas_variaveis';

        if (isEdit) {
          if (!state.customCats) state.customCats = [];
          const idx = state.customCats.findIndex(c => c.id === editId);
          const catObj = { id: editId, name: nameVal, icon: selectedIcon, type: selectedType, dreGroup: dreVal, custom: true };
          if (idx >= 0) { state.customCats[idx] = catObj; }
          else { state.customCats.push(catObj); }
          if (!state.catOverrides) state.catOverrides = {};
          state.catOverrides[editId] = { name: nameVal, icon: selectedIcon, type: selectedType, dreGroup: dreVal };
        } else {
          const id = sanitizeCatId(nameVal);
          if (!state.customCats) state.customCats = [];
          state.customCats.push({ id, name: nameVal, icon: selectedIcon, type: selectedType, dreGroup: dreVal, custom: true });
        }

        closeModal();
        save();
        showToast(isEdit ? 'Categoria atualizada' : 'Categoria criada');
      };
    }, 60);
  }

  function showCatDetail(catId) {
    const cat = cats.find(c => c.id === catId);
    if (!cat) return;
    const uso = countUsage(catId);
    const catTxs = txsMes.filter(t => t.cat === catId);
    const totalMes = catTxs.reduce((s, t) => s + t.valor, 0);
    const isCustom = !!cat.custom;
    const tipoLabel = cat.type === 'receita' ? '<span class="badge badge-green">Receita</span>' : cat.type === 'despesa' ? '<span class="badge badge-red">Despesa</span>' : '<span class="badge badge-gray">Ambos</span>';
    const dreInfo = DRE_GROUPS.find(g => g.id === cat.dreGroup);

    const txRows = catTxs.slice(0, 8).map(t => `
      <div class="flex items-center gap-8" style="padding:8px 0;border-bottom:1px solid var(--line2)">
        <span class="fz-sm" style="color:var(--txt3)">${t.date || '—'}</span>
        <span class="flex-1 fz-sm" style="color:var(--txt2)">${esc(shortDesc(t.desc || t.memo || '', 25))}</span>
        <span class="fz-sm fw-700 ${t.tipo === 'receita' ? 'text-green' : 'text-red'}">${t.tipo === 'receita' ? '+' : '−'}${moneyFmt(t.valor)}</span>
      </div>
    `).join('');

    const actionsHtml = isCustom ? `
      <div class="flex gap-8 mt-16">
        <button class="btn btn-secondary" id="catDetailEdit" style="flex:1;height:38px;font-size:13px">✏️ Editar</button>
        <button class="btn btn-secondary" id="catDetailDuplicate" style="flex:1;height:38px;font-size:13px">📋 Duplicar</button>
        <button class="btn btn-danger" id="catDetailDelete" style="flex:1;height:38px;font-size:13px">🗑️ ${uso > 0 ? 'Inativar' : 'Excluir'}</button>
      </div>
    ` : `
      <div class="flex gap-8 mt-16">
        <button class="btn btn-secondary" id="catDetailDuplicate" style="flex:1;height:38px;font-size:13px">📋 Duplicar</button>
      </div>
    `;

    const html = `
      <div class="modal-title" style="font-size:18px;font-weight:800;color:#fff;margin-bottom:12px">Detalhe da Categoria</div>
      <div class="flex items-center gap-12 mb-16">
        <div style="font-size:36px;line-height:1">${cat.icon || '📦'}</div>
        <div>
          <div class="fw-700" style="font-size:16px;color:#fff">${esc(cat.name)}</div>
          <div class="flex gap-8 mt-4 items-center">${tipoLabel}${dreInfo ? `<span class="fz-sm" style="color:var(--txt3)">· ${dreInfo.name}</span>` : ''}</div>
        </div>
      </div>
      <div class="kpi-grid" style="grid-template-columns:1fr 1fr;margin-bottom:12px">
        <div class="card"><div class="card-title">Total no mês</div><div class="card-value sm ${cat.type === 'receita' ? 'text-green' : 'text-red'}">${moneyFmt(totalMes)}</div></div>
        <div class="card"><div class="card-title">Transações</div><div class="card-value sm">${catTxs.length}</div><div class="card-sub">${uso} total</div></div>
      </div>
      ${txRows.length ? `
        <div class="fz-sm fw-700 mb-8" style="color:var(--txt2)">Últimas transações</div>
        ${txRows}
      ` : '<div class="text-dim fz-sm" style="padding:16px 0">Nenhuma transação este mês</div>'}
      ${actionsHtml}
    `;
    openModal(html, { draggable: true });

    setTimeout(() => {
      const mc = $('#modalContent');
      const editBtn = mc.querySelector('#catDetailEdit');
      const dupBtn = mc.querySelector('#catDetailDuplicate');
      const delBtn = mc.querySelector('#catDetailDelete');
      if (editBtn) editBtn.onclick = () => { closeModal(); setTimeout(() => openCatModal(catId), 350); };
      if (dupBtn) dupBtn.onclick = () => {
        const newId = sanitizeCatId(cat.name + ' cópia');
        const dupName = cat.name + ' (cópia)';
        if (!state.customCats) state.customCats = [];
        state.customCats.push({ id: newId, name: dupName, icon: cat.icon, type: cat.type, dreGroup: cat.dreGroup, custom: true });
        closeModal();
        save();
        showToast('Categoria duplicada');
      };
      if (delBtn) delBtn.onclick = () => {
        const msg = uso > 0
          ? `Inativar "${cat.name}"? Ela será ocultada mas os dados serão preservados.`
          : `Excluir "${cat.name}" permanentemente?`;
        openModal(`
          <div class="modal-title" style="font-size:16px;font-weight:800;color:#fff;margin-bottom:12px">Confirmar</div>
          <p class="fz-sm" style="color:var(--txt2);margin-bottom:16px">${msg}</p>
          <div class="flex gap-8">
            <button class="btn btn-secondary" id="confirmNo" style="flex:1;height:38px;font-size:13px">Cancelar</button>
            <button class="btn btn-danger" id="confirmYes" style="flex:1;height:38px;font-size:13px">${uso > 0 ? 'Inativar' : 'Excluir'}</button>
          </div>
        `, { draggable: false });
        setTimeout(() => {
          const cmc = $('#modalContent');
          cmc.querySelector('#confirmNo').onclick = closeModal;
          cmc.querySelector('#confirmYes').onclick = () => {
            if (uso > 0) {
              if (!state.catOverrides) state.catOverrides = {};
              if (!state.catOverrides[catId]) state.catOverrides[catId] = {};
              state.catOverrides[catId].inactive = true;
              cats.find(c => c.id === catId).inactive = true;
            } else {
              if (state.customCats) state.customCats = state.customCats.filter(c => c.id !== catId);
              if (state.catOverrides && state.catOverrides[catId]) delete state.catOverrides[catId];
            }
            closeModal();
            save();
            showToast(uso > 0 ? 'Categoria inativada' : 'Categoria excluída');
          };
        }, 60);
      };
    }, 60);
  }

  renderHeader();
}

function renderMetas() {
  const GOAL_CATS = [
    { id: 'investimentos', name: 'Investimentos', icon: '📈' },
    { id: 'reserva', name: 'Reserva', icon: '🛡️' },
    { id: 'viagem', name: 'Viagem', icon: '✈️' },
    { id: 'imovel', name: 'Imóvel', icon: '🏠' },
    { id: 'veiculo', name: 'Veículos', icon: '🚗' },
    { id: 'estudos', name: 'Estudos', icon: '🎓' },
    { id: 'outros', name: 'Outros', icon: '🎯' },
  ];
  const EMOJI_ICONS = ['🎯','💰','🏠','✈️','🚗','🎓','📈','🛡️','💻','📱','⌚','🎁','🏖️','🎨','🎵','📚','💪','🏥','🐾','💍','🏖️','🏋️','🎮','🎬','🍳','🔧','⚡','🌟','💎','🏆','🥇','📊','💳','🏦'];
  const COLORS = ['#7448ff','#ff416d','#20df9a','#ffbd3d','#2d8cff','#ff6fa3','#18d2d2','#9b6dff','#22c55e','#ff9f43'];

  let _tab = 'todas';
  let _search = '';
  let _editingId = null;

  function goalCatOf(g) {
    if (g.cat) return GOAL_CATS.find(c => c.id === g.cat) || GOAL_CATS[GOAL_CATS.length - 1];
    return GOAL_CATS[GOAL_CATS.length - 1];
  }
  function fmtDateBR(d) {
    if (!d) return '';
    const x = new Date(d + 'T00:00:00');
    return isNaN(x) ? d : x.toLocaleDateString('pt-BR');
  }
  function ringSVG(pct, color) {
    const r = 21, c = 2 * Math.PI * r;
    const p = Math.max(0, Math.min(100, pct));
    const off = c * (1 - p / 100);
    return `<svg width="54" height="54" viewBox="0 0 54 54" style="flex-shrink:0">
      <circle cx="27" cy="27" r="${r}" fill="none" stroke="rgba(255,255,255,.08)" stroke-width="5"/>
      <circle cx="27" cy="27" r="${r}" fill="none" stroke="${color}" stroke-width="5" stroke-linecap="round" stroke-dasharray="${c.toFixed(2)}" stroke-dashoffset="${off.toFixed(2)}" transform="rotate(-90 27 27)" style="transition:stroke-dashoffset .6s ease"/>
      <text x="27" y="31" text-anchor="middle" font-size="12" font-weight="800" fill="#eaf0ff">${Math.round(p)}%</text>
    </svg>`;
  }
  function bigRingSVG(pct, color) {
    const r = 54, c = 2 * Math.PI * r;
    const p = Math.max(0, Math.min(100, pct));
    const off = c * (1 - p / 100);
    return `<svg width="130" height="130" viewBox="0 0 130 130">
      <circle cx="65" cy="65" r="${r}" fill="none" stroke="rgba(255,255,255,.08)" stroke-width="8"/>
      <circle cx="65" cy="65" r="${r}" fill="none" stroke="${color}" stroke-width="8" stroke-linecap="round" stroke-dasharray="${c.toFixed(2)}" stroke-dashoffset="${off.toFixed(2)}" transform="rotate(-90 65 65)" style="transition:stroke-dashoffset .6s ease"/>
      <text x="65" y="61" text-anchor="middle" font-size="24" font-weight="800" fill="#eaf0ff">${Math.round(p)}%</text>
      <text x="65" y="78" text-anchor="middle" font-size="10" fill="#9fb0de">progresso</text>
    </svg>`;
  }

  function getFiltered() {
    const goals = state.goals || [];
    let list = goals.slice();
    if (_tab === 'ativas') list = list.filter(g => !glDone(g) && !g.paused);
    else if (_tab === 'concluidas') list = list.filter(glDone);
    else if (_tab === 'pausadas') list = list.filter(g => !glDone(g) && g.paused);
    if (_search) {
      const q = norm(_search);
      list = list.filter(g => norm(g.name || '').includes(q) || norm(g.desc || '').includes(q));
    }
    list.sort((a, b) => (b.createdAt || 0).localeCompare(a.createdAt || 0) || String(a.name || '').localeCompare(String(b.name || ''), 'pt-BR'));
    return list;
  }

  function openCreateModal() {
    _editingId = null;
    openGoalFormModal(null);
  }

  function openEditModal(id) {
    const g = (state.goals || []).find(x => x.id === id);
    if (g) openGoalFormModal(g);
  }

  function openGoalFormModal(g) {
    const editing = !!g;
    let selIcon = g ? (g.icon || '🎯') : '🎯';
    let selColor = g ? (g.color || '#7448ff') : '#7448ff';

    const fields = [
      { name: 'name', label: 'Nome da Meta', type: 'text', placeholder: 'Ex: Reserva de emergência', rules: [{ required: true, msg: 'Nome é obrigatório' }] },
      { name: 'target', label: 'Valor Alvo (R$)', type: 'number', placeholder: '0,00', step: '0.01', rules: [{ required: true, msg: 'Alvo é obrigatório' }, { min: 0.01, msg: 'Alvo deve ser maior que zero' }] },
      { name: 'current', label: 'Valor Atual (R$)', type: 'number', placeholder: '0,00', step: '0.01' },
      { name: 'date', label: 'Data Limite', type: 'date' },
      { name: 'desc', label: 'Descrição', type: 'textarea', placeholder: 'Opcional...' },
    ];

    const html = `
      <div class="modal-header">
        <div class="modal-title">${editing ? 'Editar Meta' : 'Nova Meta'}</div>
      </div>
      <form id="glFormModal" autocomplete="off">
        ${renderForm(fields, editing ? { name: g.name || '', target: g.target || '', current: g.current || 0, date: g.date || '', desc: g.desc || '' } : { current: 0 })}
        <div class="form-group">
          <label class="form-label">Ícone</label>
          <div id="glIconGrid" style="display:flex;flex-wrap:wrap;gap:6px">${EMOJI_ICONS.map(e => `<button type="button" class="chip${e === selIcon ? ' active' : ''}" data-icon="${e}" style="font-size:18px;padding:6px 8px;min-width:36px;text-align:center">${e}</button>`).join('')}</div>
        </div>
        <div class="form-group">
          <label class="form-label">Cor</label>
          <div id="glColorGrid" style="display:flex;flex-wrap:wrap;gap:8px">${COLORS.map(c => `<button type="button" data-color="${c}" style="width:32px;height:32px;border-radius:50%;background:${c};border:3px solid ${c === selColor ? '#fff' : 'transparent'};cursor:pointer;transition:border-color .2s"></button>`).join('')}</div>
        </div>
        <div class="flex gap-8 mt-16">
          <button class="btn btn-secondary" type="button" id="glFormCancel" style="flex:1">Cancelar</button>
          <button class="btn btn-primary" type="submit" style="flex:2">${editing ? 'Salvar' : 'Criar Meta'}</button>
        </div>
      </form>
    `;
    openModal(html);

    setTimeout(() => {
      document.querySelectorAll('#glIconGrid [data-icon]').forEach(b => {
        b.onclick = (e) => {
          e.preventDefault();
          selIcon = b.dataset.icon;
          document.querySelectorAll('#glIconGrid [data-icon]').forEach(x => x.classList.toggle('active', x.dataset.icon === selIcon));
        };
      });
      document.querySelectorAll('#glColorGrid [data-color]').forEach(b => {
        b.onclick = (e) => {
          e.preventDefault();
          selColor = b.dataset.color;
          document.querySelectorAll('#glColorGrid [data-color]').forEach(x => x.style.borderColor = x.dataset.color === selColor ? '#fff' : 'transparent');
        };
      });
      $('#glFormCancel').onclick = closeModal;
      $('#glFormModal').onsubmit = (e) => {
        e.preventDefault();
        const data = getFormData(fields);
        data.target = parseFloat(data.target) || 0;
        data.current = parseFloat(data.current) || 0;
        data.name = (data.name || '').trim();
        if (!data.name) { showToast('Nome é obrigatório'); return; }
        if (data.target <= 0) { showToast('Alvo deve ser maior que zero'); return; }

        if (editing) {
          g.name = data.name;
          g.target = data.target;
          g.current = data.current;
          g.date = data.date;
          g.desc = data.desc;
          g.icon = selIcon;
          g.color = selColor;
        } else {
          const ng = createGoal({
            name: data.name,
            target: data.target,
            current: data.current,
            icon: selIcon,
            color: selColor,
            date: data.date,
            desc: data.desc,
          });
          if (!state.goals) state.goals = [];
          state.goals.push(ng);
        }
        glAutoConclude(state.goals);
        save();
        closeModal();
        showToast(editing ? 'Meta atualizada' : 'Meta criada');
      };
    }, 50);
  }

  function openAporteModal(id) {
    const g = (state.goals || []).find(x => x.id === id);
    if (!g) return;
    const pct = glPct(g);
    const color = (g.color && /^#/.test(g.color)) ? g.color : glColor(pct);
    const falta = Math.max(0, (+g.target || 0) - (+g.current || 0));

    const html = `
      <div class="modal-header">
        <div class="modal-title">Aporte</div>
      </div>
      <div class="flex items-center gap-12 mb-16" style="background:var(--card);border-radius:var(--radius-sm);padding:12px">
        <div style="font-size:28px;background:${color}22;border-radius:12px;width:48px;height:48px;display:grid;place-items:center;flex-shrink:0">${esc(g.icon || '🎯')}</div>
        <div style="flex:1;min-width:0">
          <div class="fw-700 fz-md" style="color:#fff">${esc(g.name)}</div>
          <div class="fz-sm text-dim">${moneyFmt(g.current)} de ${moneyFmt(g.target)} · faltam ${moneyFmt(falta)}</div>
        </div>
        <div class="badge" style="background:${color}22;color:${color};font-size:13px;font-weight:800">${pct}%</div>
      </div>
      <form id="glAporteForm" autocomplete="off">
        <div class="form-group">
          <label class="form-label">Valor do Aporte (R$)</label>
          <input type="number" class="form-input" id="glAporteVal" placeholder="0,00" step="0.01" min="0.01" required />
        </div>
        <div class="form-group">
          <label class="form-label">Nota (opcional)</label>
          <input type="text" class="form-input" id="glAporteNote" placeholder="Ex: Depósito poupança" />
        </div>
        <div class="flex gap-8 mt-16">
          <button class="btn btn-secondary" type="button" id="glAporteCancel" style="flex:1">Cancelar</button>
          <button class="btn btn-primary" type="submit" style="flex:2">Registrar Aporte</button>
        </div>
      </form>
    `;
    openModal(html);
    setTimeout(() => {
      const v = document.getElementById('glAporteVal');
      if (v) v.focus();
      document.getElementById('glAporteCancel').onclick = closeModal;
      document.getElementById('glAporteForm').onsubmit = (e) => {
        e.preventDefault();
        const val = parseFloat(document.getElementById('glAporteVal').value) || 0;
        if (val <= 0) { showToast('Informe um valor válido'); return; }
        const note = (document.getElementById('glAporteNote').value || '').trim();
        g.current = (+g.current || 0) + val;
        g.contribs = Array.isArray(g.contribs) ? g.contribs : [];
        g.contribs.push({ v: val, date: new Date().toISOString().slice(0, 10), note });
        const wasDone = glDone(g);
        glAutoConclude(state.goals);
        save();
        closeModal();
        showToast(glDone(g) && !wasDone ? `Meta "${g.name}" concluída!` : `Aporte de ${moneyFmt(val)} registrado`);
      };
    }, 50);
  }

  function openDetailModal(id) {
    const g = (state.goals || []).find(x => x.id === id);
    if (!g) return;
    const pct = glPct(g);
    const color = (g.color && /^#/.test(g.color)) ? g.color : glColor(pct);
    const falta = Math.max(0, (+g.target || 0) - (+g.current || 0));
    const isDone = glDone(g);
    const cat = goalCatOf(g);
    const contribs = Array.isArray(g.contribs) ? g.contribs.slice().reverse() : [];
    let statusLabel, statusColor;
    if (isDone) { statusLabel = 'Concluída'; statusColor = '#22c55e'; }
    else if (g.paused) { statusLabel = 'Pausada'; statusColor = '#6b7fa3'; }
    else { statusLabel = 'Ativa'; statusColor = color; }

    const contribsHTML = contribs.length ? contribs.map(c => `
      <div class="flex items-center justify-between" style="padding:10px 0;border-bottom:1px solid var(--line)">
        <div>
          <div class="fw-700" style="color:var(--green)">+${moneyFmt(c.v)}</div>
          <div class="fz-sm text-dim">${fmtDateBR(c.date)}${c.note ? ' · ' + esc(c.note) : ''}</div>
        </div>
      </div>
    `).join('') : '<div class="text-dim fz-sm" style="padding:12px 0;text-align:center">Nenhum aporte registrado</div>';

    const html = `
      <div class="modal-header">
        <div class="modal-title">Detalhe da Meta</div>
      </div>
      <div style="text-align:center;padding:8px 0 16px">
        <div style="font-size:40px;margin-bottom:8px">${esc(g.icon || '🎯')}</div>
        <div class="fw-800" style="font-size:18px;color:#fff;margin-bottom:4px">${esc(g.name || 'Meta')}</div>
        <div class="fz-sm text-dim mb-8">${esc(cat.icon)} ${esc(cat.name)}</div>
        <div style="display:flex;justify-content:center">${bigRingSVG(pct, color)}</div>
      </div>
      <div class="flex items-center justify-between mb-8" style="padding:10px 14px;background:var(--card);border-radius:var(--radius-sm)">
        <div><div class="fz-sm text-dim">Atual</div><div class="fw-700" style="color:${color}">${moneyFmt(g.current)}</div></div>
        <div style="text-align:center"><div class="fz-sm text-dim">Alvo</div><div class="fw-700" style="color:#fff">${moneyFmt(g.target)}</div></div>
        <div style="text-align:right"><div class="fz-sm text-dim">Faltante</div><div class="fw-700" style="color:${falta > 0 ? 'var(--orange)' : 'var(--green)'}">${moneyFmt(falta)}</div></div>
      </div>
      <div class="flex items-center justify-between mb-8 mt-12">
        <span class="badge" style="background:${statusColor}22;color:${statusColor};font-size:12px">${statusLabel}</span>
        <span class="fz-sm text-dim">${g.date ? 'Prazo: ' + fmtDateBR(g.date) : 'Sem prazo'}${g.doneAt ? ' · Concluída em ' + fmtDateBR(g.doneAt) : ''}</span>
      </div>
      ${g.desc ? `<div class="fz-sm text-dim mb-12" style="line-height:1.5">${esc(g.desc)}</div>` : ''}
      <div class="divider"></div>
      <div class="fw-700 mb-8" style="color:#fff">Histórico de Aportes (${contribs.length})</div>
      ${contribsHTML}
      <div class="flex gap-8 mt-16">
        ${!isDone ? `<button class="btn btn-primary" id="glDetAporte" style="flex:1">+ Aporte</button>` : ''}
        <button class="btn btn-secondary" id="glDetClose" style="flex:1">Fechar</button>
      </div>
    `;
    openModal(html);
    setTimeout(() => {
      document.getElementById('glDetClose').onclick = closeModal;
      const apBtn = document.getElementById('glDetAporte');
      if (apBtn) apBtn.onclick = () => { closeModal(); setTimeout(() => openAporteModal(id), 350); };
    }, 50);
  }

  function renderPage() {
    const goals = state.goals || [];
    glAutoConclude(goals);

    const done = goals.filter(glDone);
    const active = goals.filter(g => !glDone(g) && !g.paused);
    const paused = goals.filter(g => !glDone(g) && g.paused);
    const totalTarget = goals.reduce((s, g) => s + (+g.target || 0), 0);
    const totalCurrent = goals.reduce((s, g) => s + (+g.current || 0), 0);
    const avgPct = goals.length ? Math.round(goals.reduce((s, g) => s + glPct(g), 0) / goals.length) : 0;
    const counts = { todas: goals.length,ativas: active.length,concluidas: done.length,pausadas: paused.length };

    const list = getFiltered();

    const kpiHTML = `
      <div class="kpi-grid" style="grid-template-columns:1fr 1fr">
        <div class="card" style="padding:14px">
          <div class="flex items-center gap-8 mb-8">
            <div style="width:36px;height:36px;border-radius:10px;background:rgba(124,77,255,.14);border:1px solid rgba(124,77,255,.35);display:grid;place-items:center;font-size:16px">🎯</div>
            <div class="fz-sm text-dim">Total de Metas</div>
          </div>
          <div class="fw-800" style="font-size:22px;color:#fff">${goals.length}</div>
          <div class="fz-sm text-dim">${active.length} ativa(s) · ${done.length} concluída(s)</div>
        </div>
        <div class="card" style="padding:14px">
          <div class="flex items-center gap-8 mb-8">
            <div style="width:36px;height:36px;border-radius:10px;background:rgba(34,197,94,.12);border:1px solid rgba(34,197,94,.3);display:grid;place-items:center;font-size:16px">🏆</div>
            <div class="fz-sm text-dim">Progresso Geral</div>
          </div>
          <div class="fw-800" style="font-size:22px;color:${glColor(avgPct)}">${avgPct}%</div>
          <div class="progress-bar" style="height:6px;margin-top:6px"><div class="progress-fill" style="width:${Math.min(100, avgPct)}%;background:${glColor(avgPct)}"></div></div>
        </div>
        <div class="card" style="padding:14px">
          <div class="flex items-center gap-8 mb-8">
            <div style="width:36px;height:36px;border-radius:10px;background:rgba(45,140,255,.12);border:1px solid rgba(45,140,255,.3);display:grid;place-items:center;font-size:16px">💰</div>
            <div class="fz-sm text-dim">Investido / Alvo</div>
          </div>
          <div class="fw-800" style="font-size:15px;color:#fff">${moneyFmt(totalCurrent)}</div>
          <div class="fz-sm text-dim">de ${moneyFmt(totalTarget)}</div>
        </div>
        <div class="card" style="padding:14px">
          <div class="flex items-center gap-8 mb-8">
            <div style="width:36px;height:36px;border-radius:10px;background:rgba(255,65,109,.12);border:1px solid rgba(255,65,109,.3);display:grid;place-items:center;font-size:16px">📊</div>
            <div class="fz-sm text-dim">Pausadas</div>
          </div>
          <div class="fw-800" style="font-size:22px;color:#fff">${paused.length}</div>
          <div class="fz-sm text-dim">${paused.length === 0 ? 'Nenhuma pausada' : 'meta(s) pausada(s)'}</div>
        </div>
      </div>
    `;

    const tabsHTML = `
      <div class="chip-group mb-12">
        ${['todas','ativas','concluidas','pausadas'].map(t => {
          const labels = { todas: 'Todas', ativas: 'Ativas', concluidas: 'Concluídas', pausadas: 'Pausadas' };
          return `<button class="chip${_tab === t ? ' active' : ''}" data-tab="${t}">${labels[t]} <b style="margin-left:2px;opacity:.7">${counts[t]}</b></button>`;
        }).join('')}
      </div>
    `;

    const searchHTML = `
      <div class="search-bar mb-16">
        <span style="font-size:16px;opacity:.5">🔍</span>
        <input type="text" id="glSearchInput" placeholder="Buscar meta..." value="${esc(_search)}" />
      </div>
    `;

    let listHTML;
    if (!list.length) {
      listHTML = `<div class="empty-state" style="padding:40px 16px">
        <div class="empty-icon">${goals.length ? '🔍' : '🎯'}</div>
        <div class="empty-title">${goals.length ? 'Nenhum resultado' : 'Nenhuma meta'}</div>
        <div class="empty-text">${goals.length ? 'Tente outros filtros ou termos de busca' : 'Crie sua primeira meta financeira'}</div>
        ${!goals.length ? '<button class="btn btn-primary btn-sm" id="glEmptyCreate" style="width:auto;margin:0 auto">+ Nova Meta</button>' : ''}
      </div>`;
    } else {
      listHTML = list.map(g => {
        const pct = glPct(g);
        const isDone = glDone(g);
        const color = (g.color && /^#/.test(g.color)) ? g.color : glColor(pct);
        const falta = Math.max(0, (+g.target || 0) - (+g.current || 0));
        const cat = goalCatOf(g);
        let tagHTML = '';
        if (isDone) tagHTML = '<span class="badge" style="background:rgba(34,197,94,.15);color:#22c55e;font-size:11px;margin-left:6px">✓ Concluída</span>';
        else if (g.paused) tagHTML = '<span class="badge" style="background:rgba(107,127,163,.15);color:#6b7fa3;font-size:11px;margin-left:6px">⏸ Pausada</span>';

        return `<div class="list-item" data-gl-detail="${g.id}" style="align-items:flex-start;padding:14px">
          ${ringSVG(pct, color)}
          <div class="list-body" style="min-width:0;padding-left:8px">
            <div class="flex items-center" style="flex-wrap:wrap">
              <span class="list-title" style="margin-right:4px">${esc(g.icon || '🎯')} ${esc(g.name || 'Meta')}</span>
              ${tagHTML}
            </div>
            <div class="progress-bar" style="height:6px;margin:6px 0"><div class="progress-fill" style="width:${Math.min(100, pct)}%;background:${color}"></div></div>
            <div class="flex items-center justify-between">
              <span class="fz-sm text-dim">${moneyFmt(g.current)} / ${moneyFmt(g.target)}</span>
              <span class="fz-sm" style="color:${isDone ? 'var(--green)' : falta > 0 ? 'var(--orange)' : 'var(--green)'};font-weight:600">${isDone ? 'Meta atingida!' : 'Faltam ' + moneyFmt(falta)}</span>
            </div>
            <div class="fz-sm text-dim" style="margin-top:4px">${g.date ? 'Prazo: ' + fmtDateBR(g.date) : 'Sem prazo'}${g.desc ? ' · ' + esc(shortDesc(g.desc, 30)) : ''}</div>
            <div class="flex items-center gap-4 mt-8" style="gap:4px">
              ${!isDone ? `<button class="btn btn-primary btn-sm" data-gl-aporte="${g.id}" style="height:28px;font-size:11px;padding:0 10px;width:auto;min-width:0">+ Aporte</button>` : ''}
              <button class="btn btn-secondary btn-sm" data-gl-edit="${g.id}" style="height:28px;font-size:11px;padding:0 8px;width:auto;min-width:0">✏️</button>
              ${!isDone ? `<button class="btn btn-secondary btn-sm" data-gl-pause="${g.id}" style="height:28px;font-size:11px;padding:0 8px;width:auto;min-width:0">${g.paused ? '▶' : '⏸'}</button>` : ''}
              ${!isDone ? `<button class="btn btn-secondary btn-sm" data-gl-done="${g.id}" style="height:28px;font-size:11px;padding:0 8px;width:auto;min-width:0">✓</button>` : ''}
              <button class="btn btn-danger btn-sm" data-gl-del="${g.id}" style="height:28px;font-size:11px;padding:0 8px;width:auto;min-width:0">🗑</button>
            </div>
          </div>
        </div>`;
      }).join('');
    }

    const page = $('#page-metas');
    page.innerHTML = `
      <div class="flex items-center justify-between mb-16">
        <h2 class="fz-lg fw-800">Metas</h2>
        <button class="btn btn-primary btn-sm" id="glNewBtn" style="width:auto;min-width:0">+ Nova Meta</button>
      </div>
      ${goals.length ? kpiHTML : ''}
      ${goals.length ? tabsHTML : ''}
      ${goals.length ? searchHTML : ''}
      <div id="glList">${listHTML}</div>
      <div class="fz-sm text-dim" style="text-align:center;padding:8px 0">Mostrando ${list.length} de ${goals.length} meta(s)</div>
    `;

    page.querySelector('#glNewBtn').onclick = openCreateModal;
    const emptyCreate = page.querySelector('#glEmptyCreate');
    if (emptyCreate) emptyCreate.onclick = openCreateModal;

    page.querySelectorAll('[data-tab]').forEach(b => {
      b.onclick = () => { _tab = b.dataset.tab; renderPage(); };
    });
    const searchInput = page.querySelector('#glSearchInput');
    if (searchInput) {
      let debounce;
      searchInput.oninput = () => {
        clearTimeout(debounce);
        debounce = setTimeout(() => { _search = searchInput.value; renderPage(); }, 200);
      };
    }

    page.querySelectorAll('[data-gl-detail]').forEach(el => {
      el.onclick = (e) => {
        if (e.target.closest('[data-gl-aporte]') || e.target.closest('[data-gl-edit]') || e.target.closest('[data-gl-pause]') || e.target.closest('[data-gl-done]') || e.target.closest('[data-gl-del]')) return;
        openDetailModal(el.dataset.glDetail);
      };
    });
    page.querySelectorAll('[data-gl-aporte]').forEach(b => {
      b.onclick = (e) => { e.stopPropagation(); openAporteModal(b.dataset.glAporte); };
    });
    page.querySelectorAll('[data-gl-edit]').forEach(b => {
      b.onclick = (e) => { e.stopPropagation(); openEditModal(b.dataset.glEdit); };
    });
    page.querySelectorAll('[data-gl-pause]').forEach(b => {
      b.onclick = (e) => {
        e.stopPropagation();
        const g = (state.goals || []).find(x => x.id === b.dataset.glPause);
        if (!g) return;
        g.paused = !g.paused;
        save();
        showToast(g.paused ? 'Meta pausada' : 'Meta retomada');
      };
    });
    page.querySelectorAll('[data-gl-done]').forEach(b => {
      b.onclick = (e) => {
        e.stopPropagation();
        const g = (state.goals || []).find(x => x.id === b.dataset.glDone);
        if (!g) return;
        g.current = Math.max(+g.current || 0, +g.target || 0);
        g.doneAt = new Date().toISOString().slice(0, 10);
        delete g.paused;
        glAutoConclude(state.goals);
        save();
        showToast(`Meta "${g.name}" concluída!`);
      };
    });
    page.querySelectorAll('[data-gl-del]').forEach(b => {
      b.onclick = (e) => {
        e.stopPropagation();
        const g = (state.goals || []).find(x => x.id === b.dataset.glDel);
        if (!g) return;
        openModal(`
          <div class="modal-header"><div class="modal-title">Excluir Meta</div></div>
          <p class="fz-md text-dim" style="line-height:1.6;margin-bottom:20px">Tem certeza que deseja excluir a meta <strong style="color:#fff">"${esc(g.name)}"</strong>?</p>
          <div class="flex gap-8">
            <button class="btn btn-secondary" id="glDelCancel" style="flex:1">Cancelar</button>
            <button class="btn btn-danger" id="glDelConfirm" style="flex:1">Excluir</button>
          </div>
        `);
        setTimeout(() => {
          document.getElementById('glDelCancel').onclick = closeModal;
          document.getElementById('glDelConfirm').onclick = () => {
            state.goals = (state.goals || []).filter(x => x.id !== g.id);
            save();
            closeModal();
            showToast('Meta excluída');
          };
        }, 50);
      };
    });
  }

  renderPage();
}

function renderAnalises() {
  const data = a();
  const score = calcScore(data);
  const ms = months(state);
  const prevMonth = new Date(view);
  prevMonth.setMonth(prevMonth.getMonth() - 1);
  const prev = agg(state, monthKey(prevMonth));
  const txs = mtx(state, k()).filter(t => !t.interno);
  const expTxs = txs.filter(t => t.tipo === 'despesa');
  const incTxs = txs.filter(t => t.tipo === 'receita');

  // Days
  const daysInMonth = new Date(view.getFullYear(), view.getMonth() + 1, 0).getDate();
  const dayNow = Math.min(new Date().getDate(), daysInMonth);
  const daysLeft = Math.max(0, daysInMonth - dayNow);

  // Savings rate
  const savRate = data.in > 0 ? Math.round((data.net / data.in) * 100) : 0;

  // Daily budget: 80% of entries
  const budgetTotal = data.in * 0.8;
  const budgetDaily = dayNow > 0 ? budgetTotal / dayNow : 0;
  const avgDailyOut = dayNow > 0 ? data.out / dayNow : 0;
  const budgetPct = budgetTotal > 0 ? Math.round((data.out / budgetTotal) * 100) : 0;
  const budgetStatus = budgetPct <= 80 ? 'good' : budgetPct <= 100 ? 'warn' : 'bad';

  // Previous month comparison
  const deltaIn = data.in - prev.in;
  const deltaOut = data.out - prev.out;
  const deltaNet = data.net - prev.net;

  // Category spending breakdown
  const catTotals = {};
  expTxs.forEach(t => {
    const cid = t.cat || 'outros';
    catTotals[cid] = (catTotals[cid] || 0) + t.valor;
  });
  const catSorted = Object.entries(catTotals).sort((a, b) => b[1] - a[1]);
  const totalOut = expTxs.reduce((s, t) => s + t.valor, 0) || 1;
  const topCat = catSorted[0];
  const topCatPct = topCat ? Math.round(topCat[1] / totalOut * 100) : 0;
  const topCatInfo = topCat ? catById(topCat[0], cats) : null;

  // Biggest source of income
  const incBySource = {};
  incTxs.forEach(t => {
    const cid = t.cat || 'outros';
    incBySource[cid] = (incBySource[cid] || 0) + t.valor;
  });
  const topInc = Object.entries(incBySource).sort((a, b) => b[1] - a[1])[0];
  const topIncPct = topInc && data.in > 0 ? Math.round(topInc[1] / data.in * 100) : 0;

  // Score color & label
  const scoreColor = score === null ? '#6b7fa3' : score >= 90 ? '#22c55e' : score >= 70 ? '#3b82f6' : score >= 45 ? '#f97316' : '#ef4444';
  const scoreLabel = score === null ? 'Sem dados' : score >= 90 ? 'Excelente' : score >= 70 ? 'Saudável' : score >= 45 ? 'Atenção' : 'Crítico';

  // Previous score
  const prevScore = calcScore(prev);
  const scoreDelta = (score !== null && prevScore !== null) ? score - prevScore : null;

  // Suggested reserve
  const suggestedReserve = data.in > 0 ? Math.round(data.in * 0.2) : 0;
  const savingsGap = data.in > 0 ? Math.round(data.in * 0.2) - data.net : 0;

  // Avg net 6 months
  const avgNet6 = detAvg(state, 'net', 6);

  // --- Score Gauge SVG ---
  function scoreGaugeSVG(val, color) {
    const v = val !== null ? val : 0;
    const r = 54;
    const cx = 64, cy = 60;
    const startAngle = Math.PI;
    const endAngle = 2 * Math.PI;
    const range = endAngle - startAngle;
    const sweepAngle = startAngle + (v / 100) * range;
    const x1 = cx + r * Math.cos(startAngle);
    const y1 = cy + r * Math.sin(startAngle);
    const x2 = cx + r * Math.cos(sweepAngle);
    const y2 = cy + r * Math.sin(sweepAngle);
    const largeArc = (v / 100) > 0.5 ? 1 : 0;
    return `<svg width="128" height="72" viewBox="0 0 128 72">
      <path d="M${cx - r},${cy} A${r},${r} 0 0,1 ${cx + r},${cy}" fill="none" stroke="#1e2a3a" stroke-width="10" stroke-linecap="round"/>
      ${v > 0 ? `<path d="M${x1},${y1} A${r},${r} 0 ${largeArc},1 ${x2},${y2}" fill="none" stroke="${color}" stroke-width="10" stroke-linecap="round"/>` : ''}
      <text x="${cx}" y="${cy - 8}" text-anchor="middle" fill="#fff" font-size="22" font-weight="800" font-family="Sora,sans-serif">${val !== null ? val : '—'}</text>
      <text x="${cx}" y="${cy + 6}" text-anchor="middle" fill="${color}" font-size="10" font-weight="600">${scoreLabel}</text>
    </svg>`;
  }

  // --- Bar Chart SVG 6 Months ---
  function evoBarChart(data6) {
    if (!data6.length) return '<div class="text-dim fz-sm">Sem dados históricos</div>';
    const maxVal = Math.max(...data6.map(d => Math.max(d.in, d.out)), 1);
    const w = 320, h = 130, padL = 10, padR = 10, padT = 16, padB = 28;
    const chartW = w - padL - padR;
    const chartH = h - padT - padB;
    const groupW = chartW / data6.length;
    const barW = Math.min(16, groupW * 0.3);
    let svgBars = '';
    data6.forEach((d, i) => {
      const x = padL + i * groupW + groupW / 2;
      const hIn = (d.in / maxVal) * chartH;
      const hOut = (d.out / maxVal) * chartH;
      svgBars += `<rect x="${x - barW - 1}" y="${padT + chartH - hIn}" width="${barW}" height="${hIn}" fill="#22c55e" rx="3" opacity="0.85"/>`;
      svgBars += `<rect x="${x + 1}" y="${padT + chartH - hOut}" width="${barW}" height="${hOut}" fill="#ff416d" rx="3" opacity="0.85"/>`;
      svgBars += `<text x="${x}" y="${h - 4}" text-anchor="middle" fill="var(--txt3)" font-size="9">${d.label}</text>`;
      if (d.net !== undefined) {
        const netY = padT + chartH - (d.net / maxVal) * chartH;
        const netColor = d.net >= 0 ? '#22c55e' : '#ff416d';
        if (i > 0) {
          const prevD = data6[i - 1];
          const prevX = padL + (i - 1) * groupW + groupW / 2;
          const prevNetY = padT + chartH - (prevD.net / maxVal) * chartH;
          svgBars += `<line x1="${prevX}" y1="${prevNetY}" x2="${x}" y2="${netY}" stroke="${netColor}" stroke-width="1.5" stroke-dasharray="3,2" opacity="0.6"/>`;
        }
        svgBars += `<circle cx="${x}" cy="${netY}" r="3" fill="${netColor}"/>`;
      }
    });
    return `<svg width="100%" viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMid meet">${svgBars}</svg>`;
  }

  // --- Insights ---
  function buildInsights() {
    const insights = [];
    // 1. Sobra / Poupança
    if (data.in > 0) {
      if (savRate >= 20) insights.push({ icon: '💰', title: 'Sobra Positiva', desc: `Você está poupando ${savRate}% da renda. Meta ≥20% atingida!`, cls: 'card-success', tone: 'good' });
      else if (savRate >= 0) insights.push({ icon: '⚠️', title: 'Poupança Baixa', desc: `Taxa de poupança de ${savRate}%. Ideal seria ≥20%.`, cls: 'card-warning', tone: 'warn' });
      else insights.push({ icon: '🚨', title: 'Gastando Acima da Renda', desc: `Déficit de ${Math.abs(savRate)}%. Suas saídas superam as entradas.`, cls: 'card-danger', tone: 'bad' });
    }
    // 2. Categoria dominante
    if (topCatInfo) {
      if (topCatPct > 50) insights.push({ icon: '📊', title: 'Concentração de Gastos', desc: `${topCatInfo.icon} ${topCatInfo.name} responde por ${topCatPct}% do total.`, cls: 'card-danger', tone: 'bad' });
      else if (topCatPct > 30) insights.push({ icon: '📊', title: 'Categoria Relevante', desc: `${topCatInfo.icon} ${topCatInfo.name} representa ${topCatPct}% dos gastos.`, tone: 'warn' });
    }
    // 3. Dependência de renda
    if (topIncPct >= 70 && incTxs.length > 0) {
      const incInfo = catById(topInc[0], cats);
      insights.push({ icon: '🔗', title: 'Dependência de Fonte', desc: `${incInfo ? incInfo.name : topInc[0]} representa ${topIncPct}% da renda.`, tone: 'warn' });
    }
    // 4. Variação receita vs mês anterior
    if (prev.in > 0) {
      const revVar = Math.round(((data.in - prev.in) / prev.in) * 100);
      if (Math.abs(revVar) >= 5) {
        const tone = revVar > 0 ? 'good' : 'bad';
        insights.push({ icon: revVar > 0 ? '📈' : '📉', title: 'Variação de Receita', desc: `Receita ${revVar > 0 ? 'subiu' : 'caiu'} ${Math.abs(revVar)}% vs mês anterior.`, tone });
      }
    }
    // 5. Economia vs média (net vs detAvg('net', 6))
    if (ms.length >= 3) {
      const diffNet = data.net - avgNet6;
      if (diffNet > avgNet6 * 0.1) insights.push({ icon: '🏆', title: 'Acima da Média', desc: `Resultado ${moneyFmt(diffNet)} acima da média de 6 meses.`, cls: 'card-success', tone: 'good' });
      else if (diffNet < -avgNet6 * 0.1 && avgNet6 > 0) insights.push({ icon: '📉', title: 'Abaixo da Média', desc: `Resultado ${moneyFmt(Math.abs(diffNet))} abaixo da média de 6 meses.`, cls: 'card-danger', tone: 'bad' });
    }
    // 6. Melhor/pior mês
    if (ms.length >= 2) {
      const best = ms.reduce((a, b) => a.net > b.net ? a : b);
      const worst = ms.reduce((a, b) => a.net < b.net ? a : b);
      insights.push({ icon: '🌟', title: 'Melhor Mês', desc: `${best.k}: resultado de ${moneyFmt(best.net)}.`, tone: 'good' });
      if (worst.k !== best.k || ms.length === 1) {
        insights.push({ icon: '🔻', title: 'Pior Mês', desc: `${worst.k}: resultado de ${moneyFmt(worst.net)}.`, tone: 'bad' });
      }
    }
    // 7. Orçamento diário estourado
    if (budgetPct > 100) {
      insights.push({ icon: '⏰', title: 'Orçamento Estourado', desc: `Gasto atual é ${budgetPct}% do orçamento mensal.`, cls: 'card-danger', tone: 'bad' });
    }
    // 8. Microgastos
    const micro = expTxs.filter(t => t.valor < 50);
    const microTotal = micro.reduce((s, t) => s + t.valor, 0);
    if (micro.length >= 5) {
      insights.push({ icon: '🪙', title: 'Microgastos Frequentes', desc: `${micro.length} compras abaixo de R$50 totalizam ${moneyFmt(microTotal)}.`, tone: 'warn' });
    }
    return insights;
  }
  const insights = buildInsights();

  // --- Render ---
  const insightToneColor = { good: 'var(--green)', warn: 'var(--orange, #f97316)', bad: 'var(--red)' };
  const insightToneBg = { good: 'rgba(34,197,94,.08)', warn: 'rgba(249,115,22,.08)', bad: 'rgba(239,68,68,.08)' };
  const insightBadgeCls = { good: 'badge-green', warn: 'badge-orange', bad: 'badge-red' };

  const deltaArrow = (val) => val > 0 ? `<span class="text-green" style="font-size:11px">▲</span>` : val < 0 ? `<span class="text-red" style="font-size:11px">▼</span>` : `<span class="text-dim" style="font-size:11px">—</span>`;

  $('#page-analises').innerHTML = `
    <h2 class="fz-lg fw-800 mb-16">Análises</h2>

    <!-- 1. Score Financeiro -->
    <div class="card">
      <div class="flex items-center gap-12">
        ${scoreGaugeSVG(score, scoreColor)}
        <div style="flex:1">
          <div class="card-title">Nota Financeira</div>
          <div class="fz-sm fw-700" style="color:${scoreColor}">${scoreLabel}</div>
          ${scoreDelta !== null ? `<div class="card-sub">${scoreDelta >= 0 ? '+' : ''}${scoreDelta} pts vs mês anterior</div>` : ''}
        </div>
      </div>
    </div>

    <!-- 2. KPI Grid 2x2 -->
    <div class="kpi-grid">
      <div class="card">
        <div class="card-title">Poupança</div>
        <div class="card-value sm ${savRate >= 20 ? 'text-green' : savRate >= 0 ? '' : 'text-red'}">${data.in > 0 ? savRate + '%' : '—'}</div>
        <div class="card-sub">${data.in > 0 ? moneyFmt(data.net) : 'Sem dados'}</div>
      </div>
      <div class="card">
        <div class="card-title">Média Diária</div>
        <div class="card-value sm text-red">${dayNow > 0 ? moneyFmt(avgDailyOut) : '—'}</div>
        <div class="card-sub">${dayNow} dia(s) do mês</div>
      </div>
      <div class="card">
        <div class="card-title">Maior Gasto</div>
        <div class="card-value sm text-red">${topCatInfo ? moneyFmt(topCat[1]) : '—'}</div>
        <div class="card-sub">${topCatInfo ? topCatInfo.icon + ' ' + topCatInfo.name : 'Nenhum'}</div>
      </div>
      <div class="card">
        <div class="card-title">Resultado</div>
        <div class="card-value sm ${data.net >= 0 ? 'text-green' : 'text-red'}">${moneyFmt(data.net)}</div>
        <div class="card-sub">${data.net >= 0 ? 'Superávit' : 'Déficit'}</div>
      </div>
    </div>

    <!-- 3. Ações Recomendadas -->
    <div class="section-header mt-16">
      <span class="section-title">Ações Recomendadas</span>
    </div>
    <div class="kpi-grid">
      <div class="card" style="border-left:3px solid #7448ff">
        <div class="card-title">Guarde este mês</div>
        <div class="card-value sm" style="color:#7448ff">${moneyFmt(suggestedReserve)}</div>
        <div class="card-sub">20% da renda como reserva</div>
      </div>
      <div class="card" style="border-left:3px solid ${savingsGap <= 0 ? 'var(--green)' : 'var(--red)'}">
        <div class="card-title">Para poupar 20%</div>
        <div class="card-value sm ${savingsGap <= 0 ? 'text-green' : 'text-red'}">${savingsGap <= 0 ? 'Meta atingida!' : moneyFmt(savingsGap)}</div>
        <div class="card-sub">${savingsGap <= 0 ? 'Parabéns!' : 'Faltam para a meta'}</div>
      </div>
      <div class="card" style="border-left:3px solid ${data.out > data.in ? 'var(--red)' : 'var(--green)'}">
        <div class="card-title">Controle</div>
        <div class="card-value sm">${data.out > data.in ? 'Atenção: saídas acima' : 'Abra as análises para manter o controle'}</div>
        <div class="card-sub">${data.out > data.in ? 'Gastando mais que entra' : 'Tudo sob controle'}</div>
      </div>
      <div class="card" style="border-left:3px solid #2d8cff">
        <div class="card-title">Limite sugerido/dia</div>
        <div class="card-value sm" style="color:#2d8cff">${dayNow > 0 ? moneyFmt(budgetDaily) : '—'}</div>
        <div class="card-sub">${daysLeft} dia(s) restante(s)</div>
      </div>
    </div>

    <!-- 4. Evolução Mensal (SVG barras) -->
    <div class="section-header mt-16">
      <span class="section-title">Evolução Mensal</span>
    </div>
    <div class="card" style="padding:12px">
      ${evoBarChart(ms.slice(-6).map(m => ({ label: m.k.slice(5), in: m.in, out: m.out, net: m.net })))}
      <div class="flex items-center justify-center gap-12 mt-8 fz-sm">
        <span><span style="display:inline-block;width:10px;height:10px;background:#22c55e;border-radius:2px;margin-right:4px"></span>Entradas</span>
        <span><span style="display:inline-block;width:10px;height:10px;background:#ff416d;border-radius:2px;margin-right:4px"></span>Saídas</span>
        <span><span style="display:inline-block;width:8px;height:8px;background:#7448ff;border-radius:50%;margin-right:4px"></span>Net</span>
      </div>
    </div>

    <!-- 5. Orçamento Diário -->
    <div class="section-header mt-16">
      <span class="section-title">Orçamento Diário</span>
    </div>
    <div class="card">
      <div class="flex items-center justify-between mb-8">
        <div class="card-title" style="margin-bottom:0">Meta: 80% das entradas</div>
        <span class="badge badge-sm ${budgetStatus === 'good' ? 'badge-green' : budgetStatus === 'warn' ? 'badge-orange' : 'badge-red'}">${budgetPct}%</span>
      </div>
      <div class="progress-bar" style="height:8px">
        <div class="progress-fill ${budgetStatus === 'good' ? 'green' : budgetStatus === 'warn' ? '' : 'red'}" style="width:${Math.min(100, budgetPct)}%"></div>
      </div>
      <div class="flex items-center justify-between mt-8">
        <span class="fz-sm text-dim">Gasto: ${moneyFmt(data.out)} / ${moneyFmt(budgetTotal)}</span>
        <span class="fz-sm text-dim">${daysLeft} dia(s) restante(s)</span>
      </div>
      <div class="flex items-center justify-between">
        <span class="fz-sm text-dim">Média/dia atual: ${moneyFmt(avgDailyOut)}</span>
        <span class="fz-sm text-dim">Média/dia ideal: ${dayNow > 0 ? moneyFmt((budgetTotal - data.out) / Math.max(1, daysLeft)) : '—'}</span>
      </div>
    </div>

    <!-- 6. Insights Automáticos -->
    <div class="section-header mt-16">
      <span class="section-title">Insights</span>
    </div>
    ${insights.length ? insights.map(ins => `
      <div class="card" style="border-left:3px solid ${insightToneColor[ins.tone] || 'var(--txt3)'};background:${insightToneBg[ins.tone] || 'transparent'}">
        <div class="flex items-center gap-8 mb-4">
          <span style="font-size:16px">${ins.icon}</span>
          <span class="fw-700 fz-sm" style="flex:1">${ins.title}</span>
          <span class="badge badge-sm ${insightBadgeCls[ins.tone] || 'badge-gray'}">${ins.tone === 'good' ? 'OK' : ins.tone === 'warn' ? 'Atenção' : 'Alerta'}</span>
        </div>
        <div class="fz-sm text-dim">${ins.desc}</div>
      </div>
    `).join('') : '<div class="card text-dim fz-sm">Sem insights disponíveis — importe dados para análises detalhadas.</div>'}

    <!-- 7. Ranking por Categoria (expandível) -->
    <div class="section-header mt-16">
      <span class="section-title">Categorias — Top 5</span>
    </div>
    ${catSorted.length ? catSorted.slice(0, 5).map(([cid, val], i) => {
      const cat = catById(cid, cats);
      const pct = Math.round(val / totalOut * 100);
      return `<div class="card" style="padding:10px 14px">
        <div class="flex items-center gap-8">
          <span class="text-dim fz-sm fw-700" style="min-width:18px">${i + 1}.</span>
          <span style="font-size:16px">${cat ? cat.icon : '📦'}</span>
          <div style="flex:1;min-width:0">
            <div class="flex items-center justify-between mb-4">
              <span class="fw-700 fz-sm" style="min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${cat ? cat.name : cid}</span>
              <span class="fz-sm fw-700 text-red">${moneyFmt(val)}</span>
            </div>
            <div class="progress-bar" style="height:5px">
              <div class="progress-fill" style="width:${pct}%;background:${glColor(pct)}"></div>
            </div>
            <div class="flex items-center justify-between mt-4">
              <span class="fz-sm text-dim">${pct}% do total</span>
              <span class="fz-sm text-dim">${expTxs.filter(t => (t.cat || 'outros') === cid).length} transações</span>
            </div>
          </div>
        </div>
      </div>`;
    }).join('') : '<div class="card text-dim fz-sm">Sem categorias de despesa este mês.</div>'}

    <!-- 8. Comparativo Mês Anterior -->
    <div class="section-header mt-16">
      <span class="section-title">Comparativo Mês Anterior</span>
    </div>
    <div class="card">
      <div class="flex items-center justify-between" style="padding:8px 0;border-bottom:1px solid var(--line)">
        <span class="fz-sm fw-700">Entradas</span>
        <span class="fz-sm">${moneyFmt(prev.in)} → ${moneyFmt(data.in)}</span>
        <span class="fz-sm fw-700">${deltaArrow(deltaIn)} ${deltaIn !== 0 ? (deltaIn > 0 ? '+' : '') + moneyFmt(deltaIn) : '—'}</span>
      </div>
      <div class="flex items-center justify-between" style="padding:8px 0;border-bottom:1px solid var(--line)">
        <span class="fz-sm fw-700">Saídas</span>
        <span class="fz-sm">${moneyFmt(prev.out)} → ${moneyFmt(data.out)}</span>
        <span class="fz-sm fw-700">${deltaArrow(-deltaOut)} ${deltaOut !== 0 ? (deltaOut > 0 ? '+' : '') + moneyFmt(deltaOut) : '—'}</span>
      </div>
      <div class="flex items-center justify-between" style="padding:8px 0">
        <span class="fz-sm fw-700">Resultado</span>
        <span class="fz-sm">${moneyFmt(prev.net)} → ${moneyFmt(data.net)}</span>
        <span class="fz-sm fw-700">${deltaArrow(deltaNet)} ${deltaNet !== 0 ? (deltaNet > 0 ? '+' : '') + moneyFmt(deltaNet) : '—'}</span>
      </div>
    </div>
  `;
}

function renderRelatorios() {
  const page = $('#page-relatorios');
  const ms = months(state);
  const allTx = (state.tx || []).filter(t => t && !t.canceled && !t.interno);
  const currentYear = view.getFullYear();

  const years = new Set();
  years.add(currentYear);
  ms.forEach(m => years.add(Number(m.k.slice(0, 4))));
  (state.tx || []).forEach(t => { if (t && t.date) years.add(Number(t.date.slice(0, 4))); });
  const yearOptions = [...years].sort((a, b) => b - a).map(y =>
    `<option value="${y}" ${y === currentYear ? 'selected' : ''}>${y}</option>`
  ).join('');

  const yearMonths = ms.filter(m => Number(m.k.slice(0, 4)) === currentYear);
  const sortedYearMonths = yearMonths.sort((a, b) => a.k.localeCompare(b.k));

  let totalReceita = 0, totalDeducoes = 0, totalDespVar = 0, totalDespFixa = 0, totalForaDre = 0;
  allTx.forEach(t => {
    if (t.date && Number(t.date.slice(0, 4)) !== currentYear) return;
    const cat = catById(t.cat || 'outros', cats);
    const grp = cat && cat.dreGroup ? cat.dreGroup : (t.tipo === 'receita' ? 'receita_variavel' : 'despesas_variaveis');
    if (t.tipo === 'receita') {
      if (grp === 'receita_bruta') totalReceita += t.valor;
      else if (grp === 'receita_fixa') totalReceita += t.valor;
      else if (grp === 'receita_variavel') totalReceita += t.valor;
      else if (grp === 'deducoes') totalDeducoes += t.valor;
      else totalReceita += t.valor;
    } else {
      if (grp === 'deducoes') totalDeducoes += t.valor;
      else if (grp === 'despesas_variaveis') totalDespVar += t.valor;
      else if (grp === 'despesas_fixas') totalDespFixa += t.valor;
      else if (grp === 'fora_dre') totalForaDre += t.valor;
      else totalDespVar += t.valor;
    }
  });

  const receitaLiq = totalReceita - totalDeducoes;
  const margemContrib = receitaLiq - totalDespVar;
  const resultadoOp = margemContrib - totalDespFixa;
  const resultadoLiq = resultadoOp - totalForaDre;

  const dreRows = [
    { label: 'Receita Bruta', value: totalReceita, pad: 0, result: false },
    { label: '(-) Deduções da Receita', value: totalDeducoes, pad: 1, result: false },
    { label: '= Receita Líquida', value: receitaLiq, pad: 0, result: true },
    { label: '(-) Despesas Variáveis', value: totalDespVar, pad: 1, result: false },
    { label: '= Margem de Contribuição', value: margemContrib, pad: 0, result: true },
    { label: '(-) Despesas Fixas', value: totalDespFixa, pad: 1, result: false },
    { label: '= Resultado Operacional', value: resultadoOp, pad: 0, result: true },
    { label: '(-) Outros / Impostos', value: totalForaDre, pad: 1, result: false },
    { label: '= Resultado Líquido', value: resultadoLiq, pad: 0, result: true },
  ];

  const dreHtml = dreRows.map(r => {
    const pl = 8 + r.pad * 16;
    const border = r.result ? 'border-top:1.5px solid var(--line);border-bottom:1.5px solid var(--line);' : '';
    const cls = r.result ? 'fw-800' : 'fz-sm';
    return `<div class="flex items-center justify-between" style="padding:8px 0 8px ${pl}px;${border}">
      <span class="${cls}" style="color:var(--txt2)">${r.label}</span>
      <span class="fw-700 ${r.value >= 0 ? 'text-green' : 'text-red'}">${moneyFmt(r.value)}</span>
    </div>`;
  }).join('');

  const evo12 = ms.slice(-12);
  let evoSvg = '<div class="text-dim fz-sm">Sem dados para gráfico</div>';
  if (evo12.length >= 2) {
    const evoW = 340, evoH = 160, padX = 8, padY = 12;
    const evoInnerW = evoW - padX * 2, evoInnerH = evoH - padY * 2 - 16;
    const maxEvo = Math.max(...evo12.map(m => Math.max(m.in, m.out)), 1);
    const barGroupW = evoInnerW / evo12.length;
    const barW = Math.max(4, Math.floor(barGroupW * 0.3));

    const bars = evo12.map((m, i) => {
      const x = padX + i * barGroupW + barGroupW * 0.1;
      const hIn = (m.in / maxEvo) * evoInnerH;
      const hOut = (m.out / maxEvo) * evoInnerH;
      const baseY = padY + evoInnerH;
      return `<rect x="${x}" y="${baseY - hIn}" width="${barW}" height="${hIn}" fill="#22c55e" rx="2"/>
        <rect x="${x + barW + 2}" y="${baseY - hOut}" width="${barW}" height="${hOut}" fill="#ff416d" rx="2"/>
        <text x="${x + barW}" y="${padY + evoInnerH + 14}" text-anchor="middle" fill="var(--txt3)" font-size="8">${m.k.slice(5)}</text>`;
    }).join('');

    const netPts = evo12.map((m, i) => {
      const x = padX + i * barGroupW + barGroupW * 0.5;
      const y = padY + evoInnerH - (m.net / maxEvo) * evoInnerH;
      return `${x},${y}`;
    }).join(' ');

    const zeroLineY = padY + evoInnerH;

    evoSvg = `<svg width="100%" viewBox="0 0 ${evoW} ${evoH}" preserveAspectRatio="xMidYMid meet">
      <line x1="${padX}" y1="${zeroLineY}" x2="${evoW - padX}" y2="${zeroLineY}" stroke="var(--line)" stroke-width="0.5"/>
      ${bars}
      <polyline points="${netPts}" fill="none" stroke="#7448ff" stroke-width="1.5" stroke-dasharray="4,3" stroke-linecap="round"/>
    </svg>`;
  }

  const savingsRate = totalReceita > 0 ? Math.round((resultadoLiq / totalReceita) * 100) : 0;
  const gaugePct = Math.min(100, Math.max(-20, savingsRate));
  const gaugeAngle = ((gaugePct + 20) / 120) * 180;
  const gaugeColor = savingsRate >= 20 ? '#22c55e' : savingsRate >= 0 ? '#ffbd3d' : '#ff416d';
  const metaAngle = ((20 + 20) / 120) * 180;
  const gCx = 100, gCy = 80, gR = 60;

  function gaugeArc(angleDeg, color, width) {
    const rad = (180 - angleDeg) * Math.PI / 180;
    const ex = gCx + gR * Math.cos(rad);
    const ey = gCy - gR * Math.sin(rad);
    const large = angleDeg > 180 ? 1 : 0;
    return `<path d="M${gCx - gR},${gCy} A${gR},${gR} 0 ${large},1 ${ex},${ey}" fill="none" stroke="${color}" stroke-width="${width}" stroke-linecap="round"/>`;
  }

  const gaugeSvg = `<svg width="100%" viewBox="0 0 200 110" preserveAspectRatio="xMidYMid meet">
    <path d="M${gCx - gR},${gCy} A${gR},${gR} 0 1,1 ${gCx + gR},${gCy}" fill="none" stroke="var(--line)" stroke-width="12" stroke-linecap="round" opacity="0.3"/>
    ${gaugeArc(Math.max(0, gaugeAngle), gaugeColor, 12)}
    <circle cx="${gCx + gR * Math.cos((180 - metaAngle) * Math.PI / 180)}" cy="${gCy - gR * Math.sin((180 - metaAngle) * Math.PI / 180)}" r="4" fill="#fff" stroke="${gaugeColor}" stroke-width="2"/>
    <line x1="${gCx + (gR - 10) * Math.cos((180 - metaAngle) * Math.PI / 180)}" y1="${gCy - (gR - 10) * Math.sin((180 - metaAngle) * Math.PI / 180)}" x2="${gCx + (gR + 8) * Math.cos((180 - metaAngle) * Math.PI / 180)}" y2="${gCy - (gR + 8) * Math.sin((180 - metaAngle) * Math.PI / 180)}" stroke="#fff" stroke-width="1.5" stroke-dasharray="2,2" opacity="0.7"/>
    <text x="${gCx - gR + 4}" y="${gCy + 14}" fill="var(--txt3)" font-size="9" text-anchor="start">-20%</text>
    <text x="${gCx + gR - 4}" y="${gCy + 14}" fill="var(--txt3)" font-size="9" text-anchor="end">100%</text>
    <text x="${gCx}" y="${gCy - 10}" text-anchor="middle" fill="${gaugeColor}" font-size="22" font-weight="800">${savingsRate}%</text>
    <text x="${gCx}" y="${gCy + 6}" text-anchor="middle" fill="var(--txt3)" font-size="9">Taxa de Poupança</text>
  </svg>`;

  const pending = p();
  const pendingAll = (state.tx || []).filter(t => t && t.pending && !t.canceled);
  const payCount = pendingAll.filter(t => t.tipo === 'despesa').length;
  const recvCount = pendingAll.filter(t => t.tipo === 'receita').length;

  page.innerHTML = `
    <div class="flex items-center justify-between mb-12">
      <button class="icon-btn" id="rptPrevMonth">◀</button>
      <h2 class="fz-lg fw-800">${view.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}</h2>
      <button class="icon-btn" id="rptNextMonth">▶</button>
    </div>

    <div class="flex items-center gap-8 mb-12">
      <span class="fz-sm fw-700" style="color:var(--txt2)">Ano:</span>
      <select class="form-select" id="rptYearSelect" style="height:32px;font-size:12px;min-width:80px">${yearOptions}</select>
    </div>

    <div class="section-header">
      <span class="section-title">DRE — Demonstrativo do Resultado</span>
      <button class="section-link" id="rptExportCsv">📥 CSV</button>
    </div>
    <div class="card">
      ${dreHtml}
    </div>

    <div class="section-header mt-16">
      <span class="section-title">Evolução Mensal</span>
    </div>
    <div class="card" style="padding:12px 8px">
      ${evoSvg}
      <div class="flex items-center justify-center gap-12 mt-8 fz-sm">
        <span><span style="display:inline-block;width:10px;height:10px;background:#22c55e;border-radius:2px;margin-right:4px"></span>Receitas</span>
        <span><span style="display:inline-block;width:10px;height:10px;background:#ff416d;border-radius:2px;margin-right:4px"></span>Despesas</span>
        <span><span style="display:inline-block;width:16px;height:0;border-top:2px dashed #7448ff;margin-right:4px;vertical-align:middle"></span>Líquido</span>
      </div>
    </div>

    <div class="section-header mt-16">
      <span class="section-title">Poupança</span>
    </div>
    <div class="card" style="padding:8px">
      ${gaugeSvg}
      <div class="flex items-center justify-center gap-8 fz-sm" style="margin-top:-4px">
        <span class="text-dim">Meta: 20%</span>
        <span style="width:4px;height:4px;border-radius:50%;background:#fff;opacity:.4"></span>
        <span class="${savingsRate >= 20 ? 'text-green' : savingsRate >= 0 ? '' : 'text-red'} fw-700">${savingsRate >= 20 ? '✓ Meta atingida' : savingsRate >= 0 ? 'Abaixo da meta' : 'Negativo'}</span>
      </div>
    </div>

    <div class="section-header mt-16">
      <span class="section-title">Resumo de Contas</span>
    </div>
    <div class="kpi-grid">
      <div class="card">
        <div class="card-title">A Pagar</div>
        <div class="card-value text-red">${moneyFmt(pending.out)}</div>
        <div class="card-sub">${payCount} conta(s)</div>
      </div>
      <div class="card">
        <div class="card-title">A Receber</div>
        <div class="card-value text-green">${moneyFmt(pending.in)}</div>
        <div class="card-sub">${recvCount} conta(s)</div>
      </div>
    </div>

    <div class="section-header mt-16">
      <span class="section-title">Exportações</span>
    </div>
    <div class="flex gap-8 flex-wrap">
      <button class="btn btn-secondary btn-sm" id="rptExportCsv2">📥 Exportar DRE (CSV)</button>
      <button class="btn btn-secondary btn-sm" id="rptExportJson">📋 Exportar Resumo (JSON)</button>
    </div>
  `;

  $('#rptPrevMonth').onclick = () => { view.setMonth(view.getMonth() - 1); render(); };
  $('#rptNextMonth').onclick = () => { view.setMonth(view.getMonth() + 1); render(); };
  $('#rptYearSelect').onchange = (e) => {
    const y = Number(e.target.value);
    view.setFullYear(y);
    render();
  };

  function downloadCsv() {
    const lines = [
      csvCell('DRE — ' + view.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })),
      csvCell('Linha') + ',' + csvCell('Valor (R$)'),
      csvCell('Receita Bruta') + ',' + totalReceita.toFixed(2),
      csvCell('(-) Deduções da Receita') + ',' + totalDeducoes.toFixed(2),
      csvCell('= Receita Líquida') + ',' + receitaLiq.toFixed(2),
      csvCell('(-) Despesas Variáveis') + ',' + totalDespVar.toFixed(2),
      csvCell('= Margem de Contribuição') + ',' + margemContrib.toFixed(2),
      csvCell('(-) Despesas Fixas') + ',' + totalDespFixa.toFixed(2),
      csvCell('= Resultado Operacional') + ',' + resultadoOp.toFixed(2),
      csvCell('(-) Outros / Impostos') + ',' + totalForaDre.toFixed(2),
      csvCell('= Resultado Líquido') + ',' + resultadoLiq.toFixed(2),
      '',
      csvCell('Taxa de Poupança') + ',' + savingsRate + '%',
      csvCell('A Pagar') + ',' + pending.out.toFixed(2),
      csvCell('A Receber') + ',' + pending.in.toFixed(2),
    ];
    const csv = lines.join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `dre-${view.toISOString().slice(0, 7)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('CSV exportado');
  }

  function downloadJson() {
    const summary = {
      periodo: view.toISOString().slice(0, 7),
      dre: { receitaBruta: totalReceita, deducoes: totalDeducoes, receitaLiquida: receitaLiq, despesasVariaveis: totalDespVar, margemContribuicao: margemContrib, despesasFixas: totalDespFixa, resultadoOperacional: resultadoOp, outrosImpostos: totalForaDre, resultadoLiquido: resultadoLiq },
      taxaPoupanca: savingsRate,
      contas: { aPagar: pending.out, qtdPagar: payCount, aReceber: pending.in, qtdReceber: recvCount },
    };
    const blob = new Blob([JSON.stringify(summary, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `relatorio-${view.toISOString().slice(0, 7)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('JSON exportado');
  }

  const csvBtn1 = $('#rptExportCsv');
  if (csvBtn1) csvBtn1.onclick = downloadCsv;
  const csvBtn2 = $('#rptExportCsv2');
  if (csvBtn2) csvBtn2.onclick = downloadCsv;
  const jsonBtn = $('#rptExportJson');
  if (jsonBtn) jsonBtn.onclick = downloadJson;
}

function renderDestino() {
  const txs = mtx(state, k()).filter(t => t.tipo === 'despesa' && !t.interno);
  const byCat = {};
  txs.forEach(t => { const cid = t.cat || 'outros'; byCat[cid] = (byCat[cid] || 0) + t.valor; });
  const total = txs.reduce((s, t) => s + t.valor, 0) || 1;
  const sorted = Object.entries(byCat).sort((a, b) => b[1] - a[1]);
  $('#page-destino').innerHTML = `
    <h2 class="fz-lg fw-800 mb-16">Para Onde Foi</h2>
    ${sorted.map(([cid, val]) => {
      const cat = catById(cid, cats);
      const pct = Math.round(val / total * 100);
      return `<div class="card">
        <div class="flex items-center justify-between mb-8">
          <span class="fw-700">${cat ? cat.icon : '📦'} ${cat ? cat.name : cid}</span>
          <span class="fz-sm text-dim">${pct}%</span>
        </div>
        <div class="progress-bar"><div class="progress-fill" style="width:${pct}%;background:${glColor(pct)}"></div></div>
        <div class="fz-sm fw-700 mt-8">${moneyFmt(val)}</div>
      </div>`;
    }).join('')}
    ${!sorted.length ? '<div class="empty-state"><div class="empty-icon">💸</div><div class="empty-title">Sem despesas</div></div>' : ''}
  `;
}

function renderPatrimonio() {
  const _PT_CATS = [
    { id: 'imovel', name: 'Imóveis', icon: '🏠', color: '#7c4dff' },
    { id: 'veiculo', name: 'Veículos', icon: '🚗', color: '#2787ff' },
    { id: 'cripto', name: 'Criptoativos', icon: '🪙', color: '#ffb238' },
    { id: 'reserva', name: 'Reserva', icon: '🛡️', color: '#22e68b' },
    { id: 'empresa', name: 'Empresas', icon: '🏢', color: '#ff416d' },
    { id: 'equipamento', name: 'Equipamentos', icon: '💻', color: '#32bcad' },
    { id: 'outros', name: 'Outros', icon: '📦', color: '#6f7da4' }
  ];

  const _PT_ICONS = ['🏠','🚗','🪙','🛡️','🏢','💻','📦','💰','📈','💎','⌚','🎵','🎨','📚','🎮','📱','🏋️','🔧','🐾','💍','🏖️','🏆','🎯','✈️'];
  const _PT_COLORS = ['#7c4dff','#2787ff','#ffb238','#22e68b','#ff416d','#32bcad','#6f7da4','#9b6dff','#22c55e','#ff6fa3'];

  function _ptCatOf(a) {
    const c = _PT_CATS.find(x => x.id === (a && a.pcat));
    if (c) return c;
    const n = norm(((a && a.name) || '') + ' ' + ((a && a.cat) || ''));
    if (/casa|apart|imovel|terreno|sitio|chacara|kitnet/.test(n)) return _PT_CATS[0];
    if (/carro|moto|veic|caminh|bicicleta/.test(n)) return _PT_CATS[1];
    if (/btc|eth|cripto|bitcoin|coin|sol|bnb/.test(n)) return _PT_CATS[2];
    if (/reserva|poupanca|emergencia|cdb|tesouro/.test(n)) return _PT_CATS[3];
    if (/empresa|negocio|cnpj|loja/.test(n)) return _PT_CATS[4];
    if (/notebook|computador|equip|celular|iphone|camera|console/.test(n)) return _PT_CATS[5];
    return _PT_CATS[_PT_CATS.length - 1];
  }

  function _ptHistOf(a) {
    const base = (Array.isArray(a.hist) && a.hist.length)
      ? a.hist.slice()
      : [{ date: a.date || new Date().toISOString().slice(0, 10), valor: +a.valor || 0 }];
    return base.sort((x, z) => String(x.date || '').localeCompare(String(z.date || '')));
  }

  function _ptVar(a) {
    const h = _ptHistOf(a);
    const first = +h[0].valor || 0;
    const cur = +a.valor || 0;
    if (first <= 0) return null;
    return (cur - first) / first * 100;
  }

  function _ptSeries() {
    const items = state.patrimonio || [];
    if (!items.length) return [];
    let min = null;
    items.forEach(a => {
      _ptHistOf(a).forEach(h => {
        const mk = (h.date || '').slice(0, 7);
        if (mk && (!min || mk < min)) min = mk;
      });
    });
    const now = new Date();
    const end = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
    if (!min || min > end) min = end;
    const keys = [];
    let y = +min.slice(0, 4), mo = +min.slice(5, 7);
    for (let i = 0; i < 300; i++) {
      const mk = y + '-' + String(mo).padStart(2, '0');
      keys.push(mk);
      if (mk >= end) break;
      mo++;
      if (mo > 12) { mo = 1; y++; }
    }
    return keys.map(k => {
      let tot = 0;
      items.forEach(a => {
        let v = null;
        _ptHistOf(a).forEach(h => {
          if ((h.date || '').slice(0, 7) <= k) v = +h.valor || 0;
        });
        if (v != null) tot += v;
      });
      return { k, total: tot };
    });
  }

  function _ptEvoChart(series) {
    if (!series.length) return '<div class="empty-state" style="padding:24px 0"><div class="empty-icon">📈</div><div class="empty-title">Sem dados</div><div class="empty-text">Cadastre ativos com valoração para ver evolução</div></div>';
    const w = 320, hgt = 140, pL = 8, pR = 8, pT = 14, pB = 22;
    const vals = series.map(s => s.total);
    const mx = Math.max(...vals, 1), mn = Math.min(...vals, 0);
    const xi = i => pL + (series.length < 2 ? (w - pL - pR) / 2 : i * (w - pL - pR) / (series.length - 1));
    const yy = v => pT + (hgt - pT - pB) * (1 - (v - mn) / Math.max(1, mx - mn));
    const pts = series.map((s, i) => xi(i).toFixed(1) + ',' + yy(s.total).toFixed(1)).join(' ');
    const area = `M${xi(0).toFixed(1)},${hgt - pB} L${pts.split(' ').join(' L')} L${xi(series.length - 1).toFixed(1)},${hgt - pB} Z`;
    const lab = i => { const [yr, m] = series[i].k.split('-'); return ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'][+m - 1] + '/' + yr.slice(2); };
    const ticks = series.length <= 1 ? [0] : (series.length <= 4 ? series.map((_, i) => i) : [0, Math.floor((series.length - 1) / 2), series.length - 1]);
    const last = series[series.length - 1];
    return `<svg viewBox="0 0 ${w} ${hgt}" width="100%" preserveAspectRatio="none" style="display:block">
      <defs><linearGradient id="ptEvoG" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="rgba(124,77,255,.4)"/><stop offset="100%" stop-color="rgba(124,77,255,0)"/></linearGradient></defs>
      <path d="${area}" fill="url(#ptEvoG)"/>
      <polyline points="${pts}" fill="none" stroke="#9b6bff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>
      <circle cx="${xi(series.length - 1).toFixed(1)}" cy="${yy(last.total).toFixed(1)}" r="3.6" fill="#9b6bff" stroke="var(--bg, #050814)" stroke-width="2"/>
      ${ticks.map(i => `<text x="${xi(i).toFixed(1)}" y="${hgt - 6}" text-anchor="${i === 0 ? 'start' : (i === series.length - 1 ? 'end' : 'middle')}" font-size="8.5" fill="var(--txt3, #4a5c80)">${lab(i)}</text>`).join('')}
      <text x="${w - pR}" y="11" text-anchor="end" font-size="9" font-weight="800" fill="var(--txt, #aab7df)">${moneyFmt(last.total)}</text>
    </svg>`;
  }

  function _ptDonutSVG(groups, total, size) {
    const sz = size || 140;
    const r = 42, cx = 70, cy = 70;
    let acc = 0;
    const c2 = 2 * Math.PI * r;
    const segs = groups.map(g => {
      const f = g.v / Math.max(1, total);
      if (f < 0.003) return '';
      const s = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${g.color}" stroke-width="14" stroke-dasharray="${(f * c2).toFixed(2)} ${c2.toFixed(2)}" stroke-dashoffset="${(-acc * c2).toFixed(2)}" transform="rotate(-90 ${cx} ${cy})"/>`;
      acc += f;
      return s;
    }).join('');
    return `<svg viewBox="0 0 140 140" width="${sz}" height="${sz}" style="display:block;margin:0 auto">
      ${segs || `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="var(--line, #1a2540)" stroke-width="14"/>`}
      <text x="${cx}" y="${cy - 4}" text-anchor="middle" font-size="14" font-weight="800" fill="var(--txt, #aab7df)">${moneyFmt(total).replace(',00', '')}</text>
      <text x="${cx}" y="${cy + 12}" text-anchor="middle" font-size="9" fill="var(--txt3, #4a5c80)">Total</text>
    </svg>`;
  }

  const _EMOJI_PICKER = _PT_ICONS;

  const patr = state.patrimonio || [];
  const items = patr.slice().sort((a, b) => (+b.valor || 0) - (+a.valor || 0));
  const total = assetsTotal(patr);
  const top = items[0];
  const serAll = _ptSeries();
  const prev = serAll.length > 1 ? serAll[serAll.length - 2].total : 0;
  const growth = prev > 0 ? ((total - prev) / prev * 100) : null;
  const prevEvoSel = $('#ptEvoSel') ? $('#ptEvoSel').value : '6';

  const groups = _PT_CATS.map(c => ({
    ...c,
    v: items.filter(a => _ptCatOf(a).id === c.id).reduce((s, a) => s + (+a.valor || 0), 0),
    n: items.filter(a => _ptCatOf(a).id === c.id).length
  })).filter(g => g.v > 0).sort((a, b) => b.v - a.v);

  const html = `
    <div class="flex items-center justify-between mb-16">
      <h2 class="fz-lg fw-800">🏛️ Patrimônio</h2>
      <button class="btn btn-primary btn-sm" id="ptNewBtn" style="height:36px">＋ Novo bem</button>
    </div>

    <div class="kpi-grid mb-16">
      <div class="card">
        <div class="card-title">Patrimônio Total</div>
        <div class="card-value">${moneyFmt(total)}</div>
        <div class="card-sub">Distribuído em ${items.length} ativo(s)</div>
      </div>
      <div class="card">
        <div class="card-title">Nº de Ativos</div>
        <div class="card-value">${items.length}</div>
        <div class="card-sub">bens cadastrados</div>
      </div>
      <div class="card">
        <div class="card-title">Variação Total</div>
        <div class="card-value ${growth == null ? '' : (growth >= 0 ? 'text-green' : 'text-red')}">${growth == null ? '—' : (growth >= 0 ? '+' : '') + growth.toFixed(1).replace('.', ',') + '%'}</div>
        <div class="card-sub">${growth == null ? 'Sem histórico' : 'vs. mês anterior'}</div>
      </div>
      <div class="card">
        <div class="card-title">Maior Ativo</div>
        <div class="card-value" style="font-size:16px">${top ? esc(shortDesc(top.name, 18)) : '—'}</div>
        <div class="card-sub">${top ? moneyFmt(top.valor) + (total > 0 ? ' · ' + Math.round((+top.valor || 0) / total * 100) + '%' : '') : 'Cadastre um bem'}</div>
      </div>
    </div>

    <div class="flex gap-12 mb-16" style="flex-wrap:wrap">
      <div class="card" style="flex:1;min-width:200px">
        <div class="card-title mb-8">📊 Distribuição por Categoria</div>
        ${items.length ? `
          <div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap;justify-content:center">
            ${_ptDonutSVG(groups, total)}
            <div style="flex:1;min-width:140px">
              ${groups.map(g => {
                const pct = total > 0 ? Math.round(g.v / total * 100) : 0;
                return `<div class="flex items-center justify-between mb-8" style="gap:6px">
                  <span class="flex items-center gap-4" style="min-width:0">
                    <span style="width:10px;height:10px;border-radius:50%;background:${g.color};flex-shrink:0"></span>
                    <span class="fz-sm" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${g.icon} ${esc(g.name)}</span>
                  </span>
                  <span class="fz-sm fw-700" style="white-space:nowrap">${moneyFmt(g.v)} <span class="text-dim">${pct}%</span></span>
                </div>`;
              }).join('')}
            </div>
          </div>
        ` : '<div class="empty-state" style="padding:24px 0"><div class="empty-icon">📊</div><div class="empty-title">Sem dados</div><div class="empty-text">Cadastre bens para ver a distribuição</div></div>'}
      </div>
      <div class="card" style="flex:1;min-width:200px">
        <div class="flex items-center justify-between mb-8">
          <span class="card-title">📈 Evolução do Patrimônio</span>
          <select class="form-select" id="ptEvoSel" style="width:auto;padding:4px 8px;font-size:12px;height:28px">
            <option value="6" ${prevEvoSel === '6' ? 'selected' : ''}>Últimos 6 meses</option>
            <option value="12" ${prevEvoSel === '12' ? 'selected' : ''}>Últimos 12 meses</option>
            <option value="all" ${prevEvoSel === 'all' ? 'selected' : ''}>Todos</option>
          </select>
        </div>
        ${_ptEvoChart(serAll.slice(-Math.max(2, prevEvoSel === 'all' ? serAll.length : +prevEvoSel)))}
      </div>
    </div>

    ${groups.length ? `
      <div class="card mb-16">
        <div class="card-title mb-12">🗂️ Por Categoria</div>
        ${groups.map(g => {
          const pct = total > 0 ? Math.round(g.v / total * 100) : 0;
          return `<div style="margin-bottom:12px">
            <div class="flex items-center justify-between mb-4">
              <span class="fz-sm">${g.icon} ${esc(g.name)}</span>
              <span class="fz-sm fw-700">${moneyFmt(g.v)} <span class="text-dim">(${pct}%)</span></span>
            </div>
            <div class="progress-bar"><div class="progress-fill" style="width:${pct}%;background:${g.color}"></div></div>
          </div>`;
        }).join('')}
      </div>
    ` : ''}

    <div class="flex items-center justify-between mb-8">
      <span class="section-title">💼 Meus Bens</span>
      <span class="fz-sm text-dim">${items.length} bem(ns)</span>
    </div>

    ${items.length ? items.map(a => {
      const c = _ptCatOf(a);
      const color = (a.color && /^#/.test(a.color)) ? a.color : c.color;
      const v = _ptVar(a);
      const d = a.date ? new Date(a.date + 'T00:00:00').toLocaleDateString('pt-BR') : '—';
      return `<div class="list-item" data-pt-id="${a.id}" style="cursor:pointer">
        <div class="list-icon" style="background:${color}20">${a.icon || c.icon}</div>
        <div class="list-body">
          <div class="list-title">${esc(a.name)}</div>
          <div class="list-sub">${c.icon} ${esc(c.name)} · ${d}</div>
        </div>
        <div class="list-value">
          <div class="list-amount" style="color:var(--txt)">${moneyFmt(a.valor)}</div>
          ${v != null ? `<div class="fz-sm ${v >= 0 ? 'text-green' : 'text-red'}">${v >= 0 ? '▲' : '▼'} ${Math.abs(v).toFixed(1).replace('.', ',')}%</div>` : ''}
        </div>
      </div>`;
    }).join('') : '<div class="empty-state"><div class="empty-icon">🏠</div><div class="empty-title">Sem patrimônio</div><div class="empty-text">Cadastre seus bens</div></div>'}

    <div class="section-header mt-16">
      <span class="section-title">📤 Exportação</span>
    </div>
    <div class="flex gap-8 flex-wrap">
      <button class="btn btn-secondary btn-sm" id="ptExportCsv">📥 CSV</button>
      <button class="btn btn-secondary btn-sm" id="ptExportJson">📋 JSON</button>
    </div>
  `;

  $('#page-patrimonio').innerHTML = html;

  const _today = new Date().toISOString().slice(0, 10);

  function _openAssetModal(editId) {
    const a = editId ? patr.find(x => x.id === editId) : null;
    const isEdit = !!a;
    let selIcon = a ? (a.icon || _ptCatOf(a).icon) : '🏠';
    let selColor = a ? ((a.color && /^#/.test(a.color)) ? a.color : _ptCatOf(a).color) : '#7c4dff';

    const fields = [
      { name: 'name', label: 'Nome', type: 'text', placeholder: 'Ex: Apartamento, Carro...', rules: [{ required: true, msg: 'Nome é obrigatório' }] },
      { name: 'valor', label: 'Valor Atual (R$)', type: 'number', placeholder: '0,00', step: '0.01', rules: [{ required: true, msg: 'Valor é obrigatório' }, { min: 0.01, msg: 'Valor deve ser maior que zero' }] },
      { name: 'pcat', label: 'Categoria', type: 'select', options: _PT_CATS.map(c => ({ value: c.id, label: c.icon + ' ' + c.name })) },
      { name: 'date', label: 'Data de Aquisição', type: 'date' },
      { name: 'desc', label: 'Descrição', type: 'textarea', placeholder: 'Opcional...' },
      { name: 'note', label: 'Observação', type: 'text', placeholder: 'Opcional...' }
    ];

    const modalHtml = `
      <div class="modal-header">
        <div class="modal-title">${isEdit ? 'Editar Bem' : 'Novo Bem'}</div>
      </div>
      <form id="ptAssetForm" autocomplete="off">
        ${renderForm(fields, isEdit ? { name: a.name || '', valor: a.valor || '', pcat: a.pcat || 'outros', date: a.date || '', desc: a.desc || '', note: a.note || '' } : { date: _today })}
        <div class="form-group">
          <label class="form-label">Ícone</label>
          <div id="ptIconGrid" style="display:flex;flex-wrap:wrap;gap:6px">
            ${_EMOJI_PICKER.map(e => `<button type="button" class="chip${e === selIcon ? ' active' : ''}" data-icon="${e}" style="font-size:18px;padding:6px 8px;min-width:36px;text-align:center">${e}</button>`).join('')}
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Cor</label>
          <div id="ptColorGrid" style="display:flex;flex-wrap:wrap;gap:8px">
            ${_PT_COLORS.map(c => `<button type="button" data-color="${c}" style="width:32px;height:32px;border-radius:50%;background:${c};border:3px solid ${c === selColor ? '#fff' : 'transparent'};cursor:pointer;transition:border-color .2s"></button>`).join('')}
          </div>
        </div>
        <div class="flex gap-8 mt-16">
          <button class="btn btn-secondary" type="button" id="ptAssetCancel" style="flex:1">Cancelar</button>
          <button class="btn btn-primary" type="submit" style="flex:2">${isEdit ? 'Salvar' : 'Criar Bem'}</button>
        </div>
      </form>
    `;
    openModal(modalHtml);

    setTimeout(() => {
      document.querySelectorAll('#ptIconGrid [data-icon]').forEach(b => {
        b.onclick = (e) => {
          e.preventDefault();
          selIcon = b.dataset.icon;
          document.querySelectorAll('#ptIconGrid [data-icon]').forEach(x => x.classList.toggle('active', x.dataset.icon === selIcon));
        };
      });
      document.querySelectorAll('#ptColorGrid [data-color]').forEach(b => {
        b.onclick = (e) => {
          e.preventDefault();
          selColor = b.dataset.color;
          document.querySelectorAll('#ptColorGrid [data-color]').forEach(x => x.style.borderColor = x.dataset.color === selColor ? '#fff' : 'transparent');
        };
      });

      const form = $('#ptAssetForm');
      if (form) {
        form.onsubmit = (e) => {
          e.preventDefault();
          const fd = getFormData(fields);
          const name = (fd.name || '').trim();
          const valor = Math.abs(+fd.valor || 0);
          if (!name) { showToast('Nome é obrigatório'); return; }
          if (!valor) { showToast('Valor é obrigatório'); return; }

          const data = {
            name, valor,
            pcat: fd.pcat || 'outros',
            date: fd.date || _today,
            desc: (fd.desc || '').trim(),
            note: (fd.note || '').trim(),
            color: selColor,
            icon: selIcon
          };

          if (isEdit) {
            const oldV = +a.valor || 0;
            a.hist = _ptHistOf(a);
            Object.assign(a, data);
            if (Math.abs(oldV - valor) > 0.004) {
              a.hist.push({ date: _today, valor, note: 'Edição do bem' });
            }
            save();
            closeModal();
            showToast('Patrimônio atualizado');
          } else {
            addAsset(state, {
              ...data,
              hist: [{ date: data.date, valor }]
            });
            save();
            closeModal();
            showToast('Bem adicionado: ' + moneyFmt(valor));
          }
        };
      }
      const cancelBtn = $('#ptAssetCancel');
      if (cancelBtn) cancelBtn.onclick = closeModal;
    }, 50);
  }

  function _openUpdateValue(id) {
    const a = id ? patr.find(x => x.id === id) : null;
    if (!a) {
      if (!patr.length) { showToast('Cadastre um bem primeiro'); return; }
      const html = `
        <div class="modal-header"><div class="modal-title">💲 Atualizar Valor</div></div>
        <div class="form-group">
          <label class="form-label">Selecione o bem</label>
          <select class="form-select" id="ptUpdSel">
            ${patr.map(x => `<option value="${esc(x.id)}">${esc(x.icon || '📦')} ${esc(x.name)}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Novo Valor (R$)</label>
          <input type="number" class="form-input" id="ptUpdVal" step="0.01" placeholder="0,00">
        </div>
        <div id="ptUpdPreview" style="margin:8px 0"></div>
        <div class="form-group">
          <label class="form-label">Observação</label>
          <input type="text" class="form-input" id="ptUpdNote" placeholder="Opcional...">
        </div>
        <div class="flex gap-8 mt-16">
          <button class="btn btn-secondary" type="button" id="ptUpdCancel" style="flex:1">Cancelar</button>
          <button class="btn btn-primary" type="button" id="ptUpdSave" style="flex:2">Salvar</button>
        </div>
      `;
      openModal(html);
      setTimeout(() => {
        const sel = $('#ptUpdSel');
        const valInput = $('#ptUpdVal');
        const preview = $('#ptUpdPreview');
        function _updPreview() {
          const cur = patr.find(x => x.id === sel.value);
          if (!cur || !valInput.value) { preview.innerHTML = ''; return; }
          const nv = +valInput.value || 0;
          const d = nv - (+cur.valor || 0);
          if (Math.abs(d) < 0.005) { preview.innerHTML = '<div class="fz-sm text-dim">Sem alteração</div>'; return; }
          preview.innerHTML = `<div class="fz-sm ${d >= 0 ? 'text-green' : 'text-red'}">${d >= 0 ? '▲ Valorização' : '▼ Desvalorização'}: ${d >= 0 ? '+' : '−'}${moneyFmt(Math.abs(d))}</div>`;
        }
        if (sel && patr.length) { sel.onchange = _updPreview; _updPreview(); }
        if (valInput) valInput.oninput = _updPreview;
        const saveBtn = $('#ptUpdSave');
        if (saveBtn) saveBtn.onclick = () => {
          const cur = patr.find(x => x.id === sel.value);
          if (!cur) return;
          const nv = +valInput.value || 0;
          if (nv <= 0) { showToast('Informe um valor válido'); return; }
          const d = nv - (+cur.valor || 0);
          if (Math.abs(d) < 0.005) { closeModal(); return; }
          cur.hist = _ptHistOf(cur);
          cur.valor = nv;
          cur.hist.push({ date: _today, valor: nv, note: ($('#ptUpdNote') ? $('#ptUpdNote').value : '').trim() });
          save();
          closeModal();
          showToast((d >= 0 ? 'Valorização: +' : 'Desvalorização: −') + moneyFmt(Math.abs(d)));
        };
        const cancelBtn = $('#ptUpdCancel');
        if (cancelBtn) cancelBtn.onclick = closeModal;
      }, 50);
      return;
    }

    const cur = a;
    const html = `
      <div class="modal-header"><div class="modal-title">💲 Atualizar Valor</div></div>
      <div class="flex items-center gap-8 mb-12" style="padding:8px;background:var(--card2);border-radius:var(--radius-sm)">
        <span style="font-size:24px">${esc(cur.icon || _ptCatOf(cur).icon)}</span>
        <div>
          <div class="fw-700">${esc(cur.name)}</div>
          <div class="fz-sm text-dim">Valor atual: ${moneyFmt(cur.valor)}</div>
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Novo Valor (R$)</label>
        <input type="number" class="form-input" id="ptUpdSingle" step="0.01" value="${cur.valor || ''}" placeholder="0,00">
      </div>
      <div id="ptUpdSinglePreview" style="margin:8px 0"></div>
      <div class="form-group">
        <label class="form-label">Observação</label>
        <input type="text" class="form-input" id="ptUpdSingleNote" placeholder="Opcional...">
      </div>
      <div class="flex gap-8 mt-16">
        <button class="btn btn-secondary" type="button" id="ptUpdSingleCancel" style="flex:1">Cancelar</button>
        <button class="btn btn-primary" type="button" id="ptUpdSingleSave" style="flex:2">Salvar</button>
      </div>
    `;
    openModal(html);
    setTimeout(() => {
      const valInput = $('#ptUpdSingle');
      const preview = $('#ptUpdSinglePreview');
      function _preview() {
        const nv = +valInput.value || 0;
        const d = nv - (+cur.valor || 0);
        if (Math.abs(d) < 0.005) { preview.innerHTML = '<div class="fz-sm text-dim">Sem alteração</div>'; return; }
        preview.innerHTML = `<div class="fz-sm ${d >= 0 ? 'text-green' : 'text-red'}">${d >= 0 ? '▲ Valorização' : '▼ Desvalorização'}: ${d >= 0 ? '+' : '−'}${moneyFmt(Math.abs(d))}</div>`;
      }
      if (valInput) { valInput.oninput = _preview; _preview(); }
      const saveBtn = $('#ptUpdSingleSave');
      if (saveBtn) saveBtn.onclick = () => {
        const nv = +valInput.value || 0;
        if (nv <= 0) { showToast('Informe um valor válido'); return; }
        const d = nv - (+cur.valor || 0);
        if (Math.abs(d) < 0.005) { closeModal(); return; }
        cur.hist = _ptHistOf(cur);
        cur.valor = nv;
        cur.hist.push({ date: _today, valor: nv, note: ($('#ptUpdSingleNote') ? $('#ptUpdSingleNote').value : '').trim() });
        save();
        closeModal();
        showToast((d >= 0 ? 'Valorização: +' : 'Desvalorização: −') + moneyFmt(Math.abs(d)));
      };
      const cancelBtn = $('#ptUpdSingleCancel');
      if (cancelBtn) cancelBtn.onclick = closeModal;
      if (valInput) { valInput.focus(); valInput.select(); }
    }, 50);
  }

  function _openDetail(id) {
    const a = patr.find(x => x.id === id);
    if (!a) return;
    const c = _ptCatOf(a);
    const color = (a.color && /^#/.test(a.color)) ? a.color : c.color;
    const hist = _ptHistOf(a).slice().reverse();
    const v = _ptVar(a);
    const d = a.date ? new Date(a.date + 'T00:00:00').toLocaleDateString('pt-BR') : '—';

    const html = `
      <div class="modal-header">
        <div class="modal-title">${esc(a.icon || c.icon)} ${esc(a.name)}</div>
      </div>
      <div class="flex items-center gap-12 mb-16" style="padding:12px;background:var(--card2);border-radius:var(--radius-sm)">
        <div style="width:48px;height:48px;border-radius:50%;background:${color}20;display:flex;align-items:center;justify-content:center;font-size:24px;flex-shrink:0">${esc(a.icon || c.icon)}</div>
        <div style="flex:1;min-width:0">
          <div class="fz-sm text-dim">${c.icon} ${esc(c.name)} · Adquirido em ${d}</div>
          <div style="font:800 22px var(--head, Sora), sans-serif;color:var(--txt,#aab7df);margin-top:4px">${moneyFmt(a.valor)}</div>
          ${v != null ? `<div class="fz-sm ${v >= 0 ? 'text-green' : 'text-red'}">${v >= 0 ? '▲' : '▼'} ${Math.abs(v).toFixed(1).replace('.', ',')}% variação total</div>` : ''}
        </div>
      </div>
      ${a.desc ? `<div class="fz-sm text-dim mb-8">${esc(a.desc)}</div>` : ''}
      ${a.note ? `<div class="fz-sm text-dim mb-8">📝 ${esc(a.note)}</div>` : ''}

      <div class="card-title mb-8">📜 Histórico de Valorações</div>
      ${hist.length ? hist.map((x, i) => {
        const prev = hist[i + 1];
        const dd = prev ? (+x.valor || 0) - (+prev.valor || 0) : null;
        const ddStr = dd == null ? 'Valor inicial' : (dd >= 0 ? '+ ' : '− ') + moneyFmt(Math.abs(dd));
        const ddClass = dd == null ? 'text-dim' : (dd >= 0 ? 'text-green' : 'text-red');
        return `<div class="flex items-center justify-between mb-8" style="padding:8px 12px;background:var(--card2);border-radius:var(--radius-sm)">
          <div>
            <div class="fz-sm fw-600">${x.date ? new Date(x.date + 'T00:00:00').toLocaleDateString('pt-BR') : '—'}</div>
            ${x.note ? `<div class="fz-sm text-dim">${esc(x.note)}</div>` : ''}
          </div>
          <div style="text-align:right">
            <div class="fw-700">${moneyFmt(x.valor)}</div>
            <div class="fz-sm ${ddClass}">${ddStr}</div>
          </div>
        </div>`;
      }).join('') : '<div class="fz-sm text-dim">Sem histórico de valorações</div>'}

      <div class="flex gap-8 mt-16">
        <button class="btn btn-secondary btn-sm" id="ptDetUpdVal" style="flex:1;height:40px">💲 Atualizar Valor</button>
        <button class="btn btn-secondary btn-sm" id="ptDetEdit" style="flex:1;height:40px">✏️ Editar Dados</button>
        <button class="btn btn-danger btn-sm" id="ptDetDel" style="flex:1;height:40px">🗑️ Excluir</button>
      </div>
    `;
    openModal(html);
    setTimeout(() => {
      const updBtn = $('#ptDetUpdVal');
      if (updBtn) updBtn.onclick = () => { closeModal(); setTimeout(() => _openUpdateValue(id), 350); };
      const editBtn = $('#ptDetEdit');
      if (editBtn) editBtn.onclick = () => { closeModal(); setTimeout(() => _openAssetModal(id), 350); };
      const delBtn = $('#ptDetDel');
      if (delBtn) delBtn.onclick = () => {
        closeModal();
        setTimeout(() => {
          openModal(`
            <div class="modal-header"><div class="modal-title">Excluir Bem</div></div>
            <p class="mb-16" style="color:var(--txt)">Excluir <strong>${esc(a.name)}</strong>?</p>
            <div class="flex gap-8">
              <button class="btn btn-secondary" type="button" id="ptDelCancel" style="flex:1">Cancelar</button>
              <button class="btn btn-danger" type="button" id="ptDelConfirm" style="flex:1">Excluir</button>
            </div>
          `);
          setTimeout(() => {
            const cBtn = $('#ptDelCancel');
            if (cBtn) cBtn.onclick = closeModal;
            const dBtn = $('#ptDelConfirm');
            if (dBtn) dBtn.onclick = () => { deleteAsset(state, id); save(); closeModal(); showToast('Bem excluído'); };
          }, 50);
        }, 350);
      };
    }, 50);
  }

  function _exportCsv() {
    if (!items.length) { showToast('Nenhum bem para exportar'); return; }
    const header = ['bem', 'categoria', 'valor_atual', 'data_aquisicao', 'variacao_pct', 'descricao', 'observacao'].map(csvCell).join(';') + '\n';
    const rows = items.map(a => {
      const vv = _ptVar(a);
      return [a.name, _ptCatOf(a).name, String(a.valor).replace('.', ','), a.date || '', vv == null ? '' : vv.toFixed(1).replace('.', ','), a.desc || '', a.note || ''].map(csvCell).join(';');
    }).join('\n');
    const blob = new Blob(['\uFEFF' + header + rows], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'mrfinance-patrimonio.csv';
    link.click();
    URL.revokeObjectURL(url);
    showToast('CSV exportado');
  }

  function _exportJson() {
    if (!items.length) { showToast('Nenhum bem para exportar'); return; }
    const data = items.map(a => ({
      nome: a.name,
      valor: a.valor,
      categoria: _ptCatOf(a).name,
      data_aquisicao: a.date || '',
      variacao: _ptVar(a),
      descricao: a.desc || '',
      observacao: a.note || '',
      historico: _ptHistOf(a)
    }));
    const blob = new Blob([JSON.stringify({ patrimonio: data, total, exportedAt: new Date().toISOString() }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'mrfinance-patrimonio.json';
    link.click();
    URL.revokeObjectURL(url);
    showToast('JSON exportado');
  }

  const ptNewBtn = $('#ptNewBtn');
  if (ptNewBtn) ptNewBtn.onclick = () => _openAssetModal(null);

  const ptExportCsv = $('#ptExportCsv');
  if (ptExportCsv) ptExportCsv.onclick = _exportCsv;
  const ptExportJson = $('#ptExportJson');
  if (ptExportJson) ptExportJson.onclick = _exportJson;

  const ptEvoSelEl = $('#ptEvoSel');
  if (ptEvoSelEl) {
    ptEvoSelEl.onchange = () => { renderPatrimonio(); };
  }

  items.forEach(a => {
    const el = document.querySelector(`[data-pt-id="${a.id}"]`);
    if (el) {
      el.onclick = () => _openDetail(a.id);
    }
  });
}

function renderBancos() {
  if (!Array.isArray(state.banks)) state.banks = [];
  const _BANK_ICONS = ['🏦','💳','🏧','🏛️','💰','🪙','📊','🏢','🔑','💎','🌟','💼','🎁','📦','🏠','🎓','🛒','✈️','🚀','🔑','🛅','🧾'];
  const _BANK_COLORS = ['#7c4dff','#22c55e','#2d8cff','#ff416d','#ff9f43','#18d2d2','#ff6fa3','#9b6dff','#6fda44','#ffb238'];
  const banks = state.banks;
  const mk = k();
  const txs = mtx(state, mk);
  const allTxs = (state.tx || []).filter(t => t && !t.canceled);

  function _bankBalance(bid) {
    const ib = getInitialBalance(state, mk, bid);
    const acctTxs = txs.filter(t => (t.account || '') === bid);
    const aggIn = acctTxs.filter(t => t.tipo === 'receita' && !t.interno).reduce((s, t) => s + (Number(t.valor) || 0), 0);
    const aggOut = acctTxs.filter(t => t.tipo === 'despesa' && !t.interno).reduce((s, t) => s + (Number(t.valor) || 0), 0);
    return ib + aggIn - aggOut;
  }

  function _bankMonthIn(bid) {
    return txs.filter(t => (t.account || '') === bid && t.tipo === 'receita' && !t.interno).reduce((s, t) => s + (Number(t.valor) || 0), 0);
  }

  function _bankMonthOut(bid) {
    return txs.filter(t => (t.account || '') === bid && t.tipo === 'despesa' && !t.interno).reduce((s, t) => s + (Number(t.valor) || 0), 0);
  }

  function _bankAllTx(bid) {
    return allTxs.filter(t => (t.account || '') === bid).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  }

  function _slug(name) {
    return (name || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'conta-' + uid();
  }

  const active = banks.filter(b => !b.archived);
  const archived = banks.filter(b => b.archived);
  const totalSaldo = active.reduce((s, b) => s + _bankBalance(b.id), 0);
  const totalMovMes = txs.filter(t => !t.interno).reduce((s, t) => s + (Number(t.valor) || 0), 0);

  const saldoClass = totalSaldo > 0.005 ? 'text-green' : totalSaldo < -0.005 ? 'text-red' : '';

  const html = `
    <div class="flex items-center justify-between mb-16">
      <h2 class="fz-lg fw-800">🏦 Bancos</h2>
      <button class="btn btn-primary btn-sm" id="bkNewBtn" style="height:36px">＋ Nova conta</button>
    </div>

    <div class="kpi-grid mb-16">
      <div class="card">
        <div class="card-title">Contas</div>
        <div class="card-value sm">${active.length}</div>
        <div class="card-sub">${archived.length > 0 ? archived.length + ' arquivada(s)' : 'Nenhuma arquivada'}</div>
      </div>
      <div class="card">
        <div class="card-title">Saldo Consolidado</div>
        <div class="card-value sm ${saldoClass}">${moneyFmt(totalSaldo)}</div>
        <div class="card-sub">${view.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}</div>
      </div>
      <div class="card">
        <div class="card-title">Movimentações</div>
        <div class="card-value sm">${moneyFmt(totalMovMes)}</div>
        <div class="card-sub">${txs.filter(t => !t.interno).length} transações no mês</div>
      </div>
      <div class="card">
        <div class="card-title">Ativas / Arquivadas</div>
        <div class="card-value sm">${active.length} / ${archived.length}</div>
        <div class="card-sub">contas</div>
      </div>
    </div>

    <div class="flex gap-8 mb-8">
      <button class="btn btn-secondary btn-sm" id="bkTransferBtn" style="flex:1">🔄 Transferir</button>
      <button class="btn btn-secondary btn-sm" id="bkReconBtn" style="flex:1">✅ Conciliar</button>
    </div>

    <div class="section-header mt-16">
      <span class="section-title">💼 Contas Ativas</span>
      <span class="fz-sm text-dim">${active.length} conta(s)</span>
    </div>

    ${active.length ? active.map(b => {
      const sal = _bankBalance(b.id);
      const salCls = sal > 0.005 ? 'badge-green' : sal < -0.005 ? 'badge-red' : 'badge-gray';
      return `<div class="list-item bank-item" data-bid="${b.id}">
        <div class="list-icon" style="background:${b.color || '#7c4dff'}20;color:${b.color || '#7c4dff'}">${b.icon || '🏦'}</div>
        <div class="list-body">
          <div class="list-title">${esc(b.name)}</div>
          <div class="list-sub">${b.id}</div>
        </div>
        <div class="list-value">
          <div class="list-amount ${sal > 0.005 ? 'income' : sal < -0.005 ? 'expense' : ''}">${moneyFmt(sal)}</div>
          <span class="badge badge-sm ${salCls}">${sal > 0.005 ? 'Positivo' : sal < -0.005 ? 'Negativo' : 'Zero'}</span>
        </div>
      </div>`;
    }).join('') : '<div class="empty-state" style="padding:32px 0"><div class="empty-icon">🏦</div><div class="empty-title">Nenhuma conta</div><div class="empty-text">Cadastre suas contas bancárias para acompanhar saldos</div></div>'}

    ${archived.length ? `
      <div class="section-header mt-16">
        <span class="section-title">📦 Arquivadas</span>
        <span class="fz-sm text-dim">${archived.length} conta(s)</span>
      </div>
      ${archived.map(b => {
        const sal = _bankBalance(b.id);
        return `<div class="list-item bank-item" data-bid="${b.id}" style="opacity:.6">
          <div class="list-icon" style="background:var(--card2)">${b.icon || '🏦'}</div>
          <div class="list-body">
            <div class="list-title">${esc(b.name)}</div>
            <div class="list-sub">${b.id} · Arquivada</div>
          </div>
          <div class="list-value">
            <div class="list-amount">${moneyFmt(sal)}</div>
          </div>
        </div>`;
      }).join('')}
    ` : ''}
  `;

  $('#page-bancos').innerHTML = html;

  setTimeout(() => {
    const newBtn = $('#bkNewBtn');
    if (newBtn) newBtn.onclick = () => _openBankModal(null);

    const transferBtn = $('#bkTransferBtn');
    if (transferBtn) transferBtn.onclick = _openTransferModal;

    const reconBtn = $('#bkReconBtn');
    if (reconBtn) reconBtn.onclick = _openReconcileModal;

    document.querySelectorAll('.bank-item').forEach(el => {
      el.onclick = () => _openBankDetail(el.dataset.bid);
    });
  }, 50);

  function _openBankModal(editId) {
    const b = editId ? banks.find(x => x.id === editId) : null;
    const isEdit = !!b;
    let selIcon = b ? (b.icon || '🏦') : '🏦';
    let selColor = b ? (b.color || '#7c4dff') : '#7c4dff';

    const fields = [
      { name: 'name', label: 'Nome da Conta', type: 'text', placeholder: 'Ex: Nubank, Itaú...', rules: [{ required: true, msg: 'Nome é obrigatório' }] },
    ];

    const preData = isEdit ? { name: b.name || '' } : {};

    const iconGrid = _BANK_ICONS.map(e => `<button type="button" class="bk-icon-btn chip${e === selIcon ? ' active' : ''}" data-icon="${e}" style="font-size:18px;padding:6px 8px;min-width:36px;text-align:center">${e}</button>`).join('');
    const colorGrid = _BANK_COLORS.map(c => `<button type="button" class="bk-color-btn" data-color="${c}" style="width:32px;height:32px;border-radius:50%;background:${c};border:3px solid ${c === selColor ? '#fff' : 'transparent'};cursor:pointer;transition:border-color .2s"></button>`).join('');

    const modalHtml = `
      <div class="modal-header">
        <div class="modal-title">${isEdit ? 'Editar Conta' : 'Nova Conta Bancária'}</div>
      </div>
      <form id="bkFormModal" autocomplete="off">
        ${renderForm(fields, preData)}
        <div class="form-group">
          <label class="form-label">Ícone</label>
          <div id="bkIconGrid" style="display:flex;flex-wrap:wrap;gap:6px">${iconGrid}</div>
        </div>
        <div class="form-group">
          <label class="form-label">Cor</label>
          <div id="bkColorGrid" style="display:flex;flex-wrap:wrap;gap:8px">${colorGrid}</div>
        </div>
        ${isEdit ? `
          <div class="form-group">
            <label class="form-label">Saldo Inicial do Mês (R$)</label>
            <input type="number" class="form-input" id="bkInitBal" step="0.01" value="${getInitialBalance(state, mk, b.id) || ''}" placeholder="0,00"/>
          </div>
        ` : ''}
        <div class="flex gap-8 mt-16">
          <button class="btn btn-secondary" type="button" id="bkFormCancel" style="flex:1">Cancelar</button>
          ${isEdit ? `<button class="btn btn-danger" type="button" id="bkFormDelete" style="flex:1">Excluir</button>` : ''}
          <button class="btn btn-primary" type="submit" style="flex:${isEdit ? 2 : 2}">${isEdit ? 'Salvar' : 'Criar Conta'}</button>
        </div>
      </form>
    `;
    openModal(modalHtml);

    setTimeout(() => {
      document.querySelectorAll('#bkIconGrid .bk-icon-btn').forEach(btn => {
        btn.onclick = (e) => {
          e.preventDefault();
          selIcon = btn.dataset.icon;
          document.querySelectorAll('#bkIconGrid .bk-icon-btn').forEach(x => x.classList.toggle('active', x.dataset.icon === selIcon));
        };
      });
      document.querySelectorAll('#bkColorGrid .bk-color-btn').forEach(btn => {
        btn.onclick = (e) => {
          e.preventDefault();
          selColor = btn.dataset.color;
          document.querySelectorAll('#bkColorGrid .bk-color-btn').forEach(x => x.style.borderColor = x.dataset.color === selColor ? '#fff' : 'transparent');
        };
      });

      const cancelBtn = $('#bkFormCancel');
      if (cancelBtn) cancelBtn.onclick = closeModal;

      const delBtn = $('#bkFormDelete');
      if (delBtn) delBtn.onclick = () => {
        closeModal();
        setTimeout(() => _confirmDeleteBank(b.id), 100);
      };

      const form = $('#bkFormModal');
      if (form) {
        form.onsubmit = (e) => {
          e.preventDefault();
          const fd = getFormData(fields);
          const name = (fd.name || '').trim();
          if (!name) { showToast('Nome é obrigatório'); return; }

          if (isEdit) {
            b.name = name;
            b.icon = selIcon;
            b.color = selColor;
            const ibEl = $('#bkInitBal');
            if (ibEl) setInitialBalance(state, Number(ibEl.value) || 0, mk, b.id);
            save();
            closeModal();
            showToast('Conta atualizada');
          } else {
            const id = _slug(name);
            if (banks.some(x => x.id === id)) { showToast('Já existe conta com esse nome'); return; }
            banks.push({
              id,
              name,
              icon: selIcon,
              color: selColor,
              archived: false,
              createdAt: new Date().toISOString()
            });
            save();
            closeModal();
            showToast('Conta criada: ' + name);
          }
        };
      }
    }, 50);
  }

  function _confirmDeleteBank(bid) {
    const b = banks.find(x => x.id === bid);
    if (!b) return;
    const txCount = allTxs.filter(t => (t.account || '') === bid).length;
    openModal(`
      <div class="modal-header">
        <div class="modal-title">Excluir Conta</div>
      </div>
      <div class="card" style="text-align:center;padding:20px">
        <div style="font-size:36px;margin-bottom:12px">${b.icon || '🏦'}</div>
        <div class="fw-700 mb-8">${esc(b.name)}</div>
        ${txCount > 0 ? `<div class="fz-sm text-dim mb-8">Esta conta possui ${txCount} transação(ões) vinculada(s).</div>
        <div class="fz-sm text-dim mb-8">As transações serão desvinculadas da conta.</div>` : ''}
      </div>
      <div class="flex gap-8 mt-16">
        <button class="btn btn-secondary" type="button" id="bkDelCancel" style="flex:1">Cancelar</button>
        <button class="btn btn-danger" type="button" id="bkDelConfirm" style="flex:2">Excluir</button>
      </div>
    `);
    setTimeout(() => {
      const cancelBtn = $('#bkDelCancel');
      if (cancelBtn) cancelBtn.onclick = closeModal;
      const confirmBtn = $('#bkDelConfirm');
      if (confirmBtn) confirmBtn.onclick = () => {
        allTxs.forEach(t => { if ((t.account || '') === bid) t.account = ''; });
        state.banks = banks.filter(x => x.id !== bid);
        save();
        closeModal();
        showToast('Conta excluída');
      };
    }, 50);
  }

  function _openBankDetail(bid) {
    const b = banks.find(x => x.id === bid);
    if (!b) return;
    const sal = _bankBalance(bid);
    const ib = getInitialBalance(state, mk, bid);
    const monthIn = _bankMonthIn(bid);
    const monthOut = _bankMonthOut(bid);
    const recentTxs = _bankAllTx(bid).slice(0, 10);
    const createdDate = b.createdAt ? new Date(b.createdAt).toLocaleDateString('pt-BR') : '—';

    openModal(`
      <div class="modal-header">
        <div class="modal-title">${b.icon || '🏦'} ${esc(b.name)}</div>
      </div>

      <div class="card" style="text-align:center;padding:20px;border-left:4px solid ${b.color || '#7c4dff'}">
        <div class="fz-sm text-dim mb-8">Saldo Atual</div>
        <div class="list-amount ${sal > 0.005 ? 'income' : sal < -0.005 ? 'expense' : ''}" style="font-size:28px">${moneyFmt(sal)}</div>
        <div class="fz-sm text-dim mt-8">${b.id} · Criada em ${createdDate}</div>
      </div>

      <div class="kpi-grid mb-12">
        <div class="card">
          <div class="card-title">Saldo Inicial</div>
          <div class="card-value sm">${moneyFmt(ib)}</div>
        </div>
        <div class="card">
          <div class="card-title">Resultado Mês</div>
          <div class="card-value sm ${monthIn - monthOut >= 0 ? 'text-green' : 'text-red'}">${moneyFmt(monthIn - monthOut)}</div>
        </div>
        <div class="card">
          <div class="card-title">Entradas</div>
          <div class="card-value sm text-green">${moneyFmt(monthIn)}</div>
        </div>
        <div class="card">
          <div class="card-title">Saídas</div>
          <div class="card-value sm text-red">${moneyFmt(monthOut)}</div>
        </div>
      </div>

      <div class="flex gap-8 mb-12">
        <button class="btn btn-secondary btn-sm" id="bkDetEditBal" style="flex:1">💲 Saldo Inicial</button>
        <button class="btn btn-secondary btn-sm" id="bkDetEdit" style="flex:1">✏️ Editar</button>
        <button class="btn btn-secondary btn-sm" id="bkDetAllTx" style="flex:1">📋 Movimentações</button>
      </div>

      ${b.archived ? `<button class="btn btn-primary btn-sm mb-12" id="bkDetRestore" style="height:36px">♻️ Restaurar Conta</button>` : `<button class="btn btn-secondary btn-sm mb-12" id="bkDetArchive" style="height:36px">📦 Arquivar Conta</button>`}

      <div class="section-header mt-8">
        <span class="section-title fz-md">Últimas Movimentações</span>
      </div>
      ${recentTxs.length ? recentTxs.map(t => {
        const cat = catById(t.cat, cats);
        return `<div class="list-item" style="padding:10px 12px;margin-bottom:6px">
          <div class="list-icon" style="width:32px;height:32px;font-size:16px;background:${t.tipo === 'receita' ? 'var(--green2)' : 'var(--red2)'}">${cat ? cat.icon : (t.tipo === 'receita' ? '📈' : '📉')}</div>
          <div class="list-body">
            <div class="list-title" style="font-size:13px">${esc(t.desc || t.memo || 'Sem descrição')}</div>
            <div class="list-sub">${t.date || '—'}</div>
          </div>
          <div class="list-amount ${t.tipo === 'receita' ? 'income' : 'expense'}" style="font-size:13px">${t.tipo === 'receita' ? '+' : '−'}${moneyFmt(t.valor)}</div>
        </div>`;
      }).join('') : '<div class="empty-state" style="padding:20px 0"><div class="fz-sm text-dim">Nenhuma movimentação nesta conta</div></div>'}
    `, { draggable: true });

    setTimeout(() => {
      const editBalBtn = $('#bkDetEditBal');
      if (editBalBtn) editBalBtn.onclick = () => {
        closeModal();
        setTimeout(() => _openEditInitBalance(bid), 100);
      };

      const editBtn = $('#bkDetEdit');
      if (editBtn) editBtn.onclick = () => {
        closeModal();
        setTimeout(() => _openBankModal(bid), 100);
      };

      const allTxBtn = $('#bkDetAllTx');
      if (allTxBtn) allTxBtn.onclick = () => {
        closeModal();
        setTimeout(() => _openBankMovements(bid), 100);
      };

      const archiveBtn = $('#bkDetArchive');
      if (archiveBtn) archiveBtn.onclick = () => {
        b.archived = true;
        save();
        closeModal();
        showToast('Conta arquivada');
      };

      const restoreBtn = $('#bkDetRestore');
      if (restoreBtn) restoreBtn.onclick = () => {
        b.archived = false;
        save();
        closeModal();
        showToast('Conta restaurada');
      };
    }, 50);
  }

  function _openEditInitBalance(bid) {
    const b = banks.find(x => x.id === bid);
    if (!b) return;
    const current = getInitialBalance(state, mk, bid);

    openModal(`
      <div class="modal-header">
        <div class="modal-title"> Saldo Inicial</div>
      </div>
      <div class="fz-sm text-dim mb-12">${b.icon || '🏦'} ${esc(b.name)} · ${view.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}</div>
      <div class="form-group">
        <label class="form-label">Saldo Inicial do Mês (R$)</label>
        <input type="number" class="form-input" id="bkInitBalInput" step="0.01" value="${current || ''}" placeholder="0,00"/>
      </div>
      <div id="bkInitBalPreview" class="mb-8"></div>
      <div class="flex gap-8 mt-16">
        <button class="btn btn-secondary" type="button" id="bkInitBalCancel" style="flex:1">Cancelar</button>
        <button class="btn btn-primary" type="button" id="bkInitBalSave" style="flex:2">Salvar</button>
      </div>
    `);

    setTimeout(() => {
      const input = $('#bkInitBalInput');
      const preview = $('#bkInitBalPreview');
      function _updPreview() {
        if (!input || !preview) return;
        const nv = Number(input.value) || 0;
        const diff = nv - current;
        if (Math.abs(diff) < 0.005) { preview.innerHTML = '<div class="fz-sm text-dim">Sem alteração</div>'; return; }
        preview.innerHTML = `<div class="fz-sm ${diff >= 0 ? 'text-green' : 'text-red'}">${diff >= 0 ? '▲' : '▼'} ${diff >= 0 ? '+' : '−'}${moneyFmt(Math.abs(diff))}</div>`;
      }
      if (input) { input.oninput = _updPreview; _updPreview(); }
      const cancelBtn = $('#bkInitBalCancel');
      if (cancelBtn) cancelBtn.onclick = closeModal;
      const saveBtn = $('#bkInitBalSave');
      if (saveBtn) saveBtn.onclick = () => {
        const val = Number(input.value) || 0;
        setInitialBalance(state, val, mk, bid);
        save();
        closeModal();
        showToast('Saldo inicial atualizado');
      };
    }, 50);
  }

  function _openBankMovements(bid) {
    const b = banks.find(x => x.id === bid);
    if (!b) return;
    const bankTxs = _bankAllTx(bid);
    const monthTxs = bankTxs.filter(t => (t.date || '').slice(0, 7) === mk);
    const totalIn = monthTxs.filter(t => t.tipo === 'receita').reduce((s, t) => s + (Number(t.valor) || 0), 0);
    const totalOut = monthTxs.filter(t => t.tipo === 'despesa').reduce((s, t) => s + (Number(t.valor) || 0), 0);

    openModal(`
      <div class="modal-header">
        <div class="modal-title">${b.icon || '🏦'} ${esc(b.name)}</div>
      </div>

      <div class="kpi-grid mb-12">
        <div class="card">
          <div class="card-title">Entradas</div>
          <div class="card-value sm text-green">${moneyFmt(totalIn)}</div>
          <div class="card-sub">${monthTxs.filter(t => t.tipo === 'receita').length} tx(s)</div>
        </div>
        <div class="card">
          <div class="card-title">Saídas</div>
          <div class="card-value sm text-red">${moneyFmt(totalOut)}</div>
          <div class="card-sub">${monthTxs.filter(t => t.tipo === 'despesa').length} tx(s)</div>
        </div>
      </div>

      <div class="fz-sm text-dim mb-8">${bankTxs.length} transação(ões) total · ${monthTxs.length} no mês</div>

      ${bankTxs.length ? bankTxs.slice(0, 30).map(t => {
        const cat = catById(t.cat, cats);
        return `<div class="list-item" style="padding:10px 12px;margin-bottom:6px">
          <div class="list-icon" style="width:32px;height:32px;font-size:16px;background:${t.tipo === 'receita' ? 'var(--green2)' : 'var(--red2)'}">${cat ? cat.icon : (t.tipo === 'receita' ? '📈' : '📉')}</div>
          <div class="list-body">
            <div class="list-title" style="font-size:13px">${esc(t.desc || t.memo || 'Sem descrição')}</div>
            <div class="list-sub">${t.date || '—'}${cat ? ' · ' + esc(cat.name) : ''}${t.interno ? ' · Interno' : ''}</div>
          </div>
          <div class="list-amount ${t.tipo === 'receita' ? 'income' : 'expense'}" style="font-size:13px">${t.tipo === 'receita' ? '+' : '−'}${moneyFmt(t.valor)}</div>
        </div>`;
      }).join('') : '<div class="empty-state" style="padding:20px 0"><div class="fz-sm text-dim">Nenhuma transação vinculada a esta conta</div></div>'}
      ${bankTxs.length > 30 ? '<div class="fz-sm text-dim" style="text-align:center;padding:12px 0">Mostrando as 30 mais recentes</div>' : ''}
    `, { draggable: true });
  }

  function _openTransferModal() {
    if (active.length < 2) { showToast('Cadastre pelo menos 2 contas ativas'); return; }
    const options = active.map(b => `<option value="${b.id}">${b.icon || '🏦'} ${esc(b.name)} (${moneyFmt(_bankBalance(b.id))})</option>`).join('');

    openModal(`
      <div class="modal-header">
        <div class="modal-title">🔄 Transferência entre Contas</div>
      </div>
      <div class="form-group">
        <label class="form-label">Conta de Origem</label>
        <select class="form-select" id="bkXferFrom">${options}</select>
      </div>
      <div class="form-group">
        <label class="form-label">Conta de Destino</label>
        <select class="form-select" id="bkXferTo">${options}</select>
      </div>
      <div class="form-group">
        <label class="form-label">Valor (R$)</label>
        <input type="number" class="form-input" id="bkXferVal" step="0.01" placeholder="0,00"/>
      </div>
      <div class="form-group">
        <label class="form-label">Descrição</label>
        <input type="text" class="form-input" id="bkXferDesc" placeholder="Transferência entre contas" value="Transferência entre contas"/>
      </div>
      <div class="flex gap-8 mt-16">
        <button class="btn btn-secondary" type="button" id="bkXferCancel" style="flex:1">Cancelar</button>
        <button class="btn btn-primary" type="button" id="bkXferSave" style="flex:2">Transferir</button>
      </div>
    `);

    setTimeout(() => {
      const fromSel = $('#bkXferFrom');
      const toSel = $('#bkXferTo');
      if (active.length >= 2 && toSel) toSel.selectedIndex = 1;
      const cancelBtn = $('#bkXferCancel');
      if (cancelBtn) cancelBtn.onclick = closeModal;
      const saveBtn = $('#bkXferSave');
      if (saveBtn) saveBtn.onclick = () => {
        const fromId = fromSel.value;
        const toId = toSel.value;
        const val = Math.abs(Number($('#bkXferVal').value) || 0);
        const desc = ($('#bkXferDesc') ? $('#bkXferDesc').value : 'Transferência entre contas').trim();
        if (!val) { showToast('Informe o valor'); return; }
        if (fromId === toId) { showToast('Selecione contas diferentes'); return; }
        const txDate = new Date().toISOString().slice(0, 10);
        const txOut = {
          id: 'xfer:' + uid(),
          date: txDate,
          tipo: 'despesa',
          valor: val,
          desc: desc + ' (saída)',
          memo: desc,
          cat: '',
          pending: false,
          canceled: false,
          status: 'pago',
          paidAt: new Date().toISOString(),
          manual: true,
          interno: true,
          account: fromId,
          note: 'Transferência para ' + (active.find(x => x.id === toId) || {}).name,
          installmentIndex: 0,
          installmentTotal: 0,
          seriesId: '',
        };
        const txIn = {
          id: 'xfer:' + uid(),
          date: txDate,
          tipo: 'receita',
          valor: val,
          desc: desc + ' (entrada)',
          memo: desc,
          cat: '',
          pending: false,
          canceled: false,
          status: 'recebido',
          paidAt: new Date().toISOString(),
          manual: true,
          interno: true,
          account: toId,
          note: 'Transferência de ' + (active.find(x => x.id === fromId) || {}).name,
          installmentIndex: 0,
          installmentTotal: 0,
          seriesId: '',
        };
        addTx(state, txOut);
        addTx(state, txIn);
        save();
        closeModal();
        showToast('Transferência realizada: ' + moneyFmt(val));
      };
    }, 50);
  }

  function _openReconcileModal() {
    if (!active.length) { showToast('Cadastre uma conta bancária primeiro'); return; }
    const options = active.map(b => `<option value="${b.id}">${b.icon || '🏦'} ${esc(b.name)}</option>`).join('');

    openModal(`
      <div class="modal-header">
        <div class="modal-title">✅ Conciliação de Saldo</div>
      </div>
      <div class="fz-sm text-dim mb-12">Compare o saldo calculado com o saldo do extrato bancário</div>
      <div class="form-group">
        <label class="form-label">Conta</label>
        <select class="form-select" id="bkRecSel">${options}</select>
      </div>
      <div id="bkRecInfo" style="margin-bottom:12px"></div>
      <div class="form-group">
        <label class="form-label">Saldo Informado (extrato bancário)</label>
        <input type="number" class="form-input" id="bkRecInformed" step="0.01" placeholder="0,00"/>
      </div>
      <div id="bkRecDiff" class="mb-8"></div>
      <div class="flex gap-8 mt-16">
        <button class="btn btn-secondary" type="button" id="bkRecCancel" style="flex:1">Cancelar</button>
        <button class="btn btn-primary" type="button" id="bkRecAdjust" style="flex:2">Ajustar Saldo</button>
      </div>
    `);

    setTimeout(() => {
      const sel = $('#bkRecSel');
      const info = $('#bkRecInfo');
      const diffEl = $('#bkRecDiff');
      const informedInput = $('#bkRecInformed');

      function _updReconInfo() {
        if (!sel || !info) return;
        const bid = sel.value;
        const b = banks.find(x => x.id === bid);
        if (!b) { info.innerHTML = ''; return; }
        const calc = _bankBalance(bid);
        info.innerHTML = `
          <div class="card" style="padding:12px">
            <div class="flex items-center justify-between mb-4">
              <span class="fz-sm">${b.icon || '🏦'} ${esc(b.name)}</span>
              <span class="fz-sm fw-700 ${calc >= 0 ? 'text-green' : 'text-red'}">${moneyFmt(calc)}</span>
            </div>
            <div class="fz-sm text-dim">Saldo calculado pelo sistema</div>
          </div>`;
        _updDiff();
      }

      function _updDiff() {
        if (!sel || !diffEl || !informedInput) return;
        const bid = sel.value;
        const calc = _bankBalance(bid);
        const informed = Number(informedInput.value) || 0;
        if (!informedInput.value) { diffEl.innerHTML = ''; return; }
        const diff = informed - calc;
        if (Math.abs(diff) < 0.005) {
          diffEl.innerHTML = '<div class="card" style="padding:10px;border-left:3px solid var(--green)"><div class="fz-sm text-green fw-700">✅ Saldos conciliados</div></div>';
        } else {
          diffEl.innerHTML = `<div class="card" style="padding:10px;border-left:3px solid ${diff > 0 ? 'var(--green)' : 'var(--red)'}"><div class="fz-sm ${diff > 0 ? 'text-green' : 'text-red'} fw-700">${diff > 0 ? '▲' : '▼'} Divergência: ${diff > 0 ? '+' : '−'}${moneyFmt(Math.abs(diff))}</div></div>`;
        }
      }

      if (sel) { sel.onchange = _updReconInfo; _updReconInfo(); }
      if (informedInput) informedInput.oninput = _updDiff;

      const cancelBtn = $('#bkRecCancel');
      if (cancelBtn) cancelBtn.onclick = closeModal;
      const adjustBtn = $('#bkRecAdjust');
      if (adjustBtn) adjustBtn.onclick = () => {
        const bid = sel.value;
        const calc = _bankBalance(bid);
        const informed = Number(informedInput.value) || 0;
        if (!informedInput.value) { showToast('Informe o saldo do extrato'); return; }
        const diff = informed - calc;
        if (Math.abs(diff) < 0.005) { showToast('Saldos já conciliados'); closeModal(); return; }
        setInitialBalance(state, informed, mk, bid);
        save();
        closeModal();
        showToast('Saldo ajustado: ' + moneyFmt(informed));
      };
    }, 50);
  }
}

function renderConciliacao() {
  if (!state.reconLog) state.reconLog = [];
  let _tab = 'bancos';
  let _selBanks = new Set();
  let _selLancs = new Set();
  let _dismissed = new Set();

  const bankTxs = mtx(state, k()).filter(t => !t.pending && !t.canceled && !t.interno);
  const lancTxs = mtx(state, k()).filter(t => t.pending && !t.canceled);

  const reconLancIds = new Set(state.reconLog.map(r => r.lancId));
  const reconBankIds = new Set(state.reconLog.map(r => r.bankTxId));

  const bankReconTotal = bankTxs.filter(t => reconBankIds.has(t.id)).reduce((s, t) => s + (Number(t.valor) || 0), 0);
  const lancReconTotal = lancTxs.filter(t => reconLancIds.has(t.id)).reduce((s, t) => s + (Number(t.valor) || 0), 0);
  const totalRecon = Math.max(bankReconTotal, lancReconTotal);
  const pendingBankTotal = bankTxs.filter(t => !reconBankIds.has(t.id)).reduce((s, t) => s + (Number(t.valor) || 0), 0);
  const pendingLancTotal = lancTxs.filter(t => !reconLancIds.has(t.id)).reduce((s, t) => s + (Number(t.valor) || 0), 0);

  const matches = [];
  const pendingLancsFiltered = lancTxs.filter(t => !reconLancIds.has(t.id));
  bankTxs.filter(t => !reconBankIds.has(t.id)).forEach(bt => {
    let bestScore = 0, bestLanc = null;
    pendingLancsFiltered.forEach(lt => {
      const s = score(bt, lt);
      if (s > bestScore) { bestScore = s; bestLanc = lt; }
    });
    if (bestLanc && bestScore >= 70 && !_dismissed.has(bt.id + ':' + bestLanc.id)) {
      matches.push({ bank: bt, lanc: bestLanc, score: bestScore, crit: crit(bt, bestLanc) });
    }
  });
  matches.sort((a, b) => b.score - a.score);

  const avgScore = matches.length ? Math.round(matches.reduce((s, m) => s + m.score, 0) / matches.length) : 0;
  const autoCount = state.reconLog.filter(r => r.mode === 'auto').length;
  const reconTotal = state.reconLog.length;
  const reconRate = reconTotal > 0 ? Math.round(autoCount / reconTotal * 100) : 0;

  function renderBankItem(t) {
    const isRecon = reconBankIds.has(t.id);
    const isSel = _selBanks.has(t.id);
    const tipoIcon = t.tipo === 'receita' ? '📈' : '📉';
    return `<div class="list-item" data-id="${t.id}" style="${isSel ? 'border-color:var(--accent);background:var(--accent3)' : ''}">
      <div class="list-icon" style="background:${isRecon ? 'rgba(32,223,154,.15)' : isSel ? 'var(--accent3)' : 'var(--card2)'}">${isRecon ? '✅' : tipoIcon}</div>
      <div class="list-body">
        <div class="list-title">${esc(t.desc || t.memo || 'Sem descrição')}</div>
        <div class="list-sub">${t.date || '—'}${isRecon ? ' · Conciliado' : ''}</div>
      </div>
      <div style="text-align:right;flex-shrink:0">
        <div class="list-amount ${t.tipo === 'receita' ? 'income' : 'expense'}">${moneyFmt(t.valor)}</div>
        <span class="badge badge-sm ${isRecon ? 'badge-green' : 'badge-gray'}">${isRecon ? 'Conciliado' : 'Pendente'}</span>
        ${isRecon ? '<button class="btn btn-danger btn-sm undo-recon" data-id="' + t.id + '" style="margin-top:4px;height:28px;font-size:11px;width:auto;padding:0 8px">Desfazer</button>' : ''}
      </div>
    </div>`;
  }

  function renderLancItem(t) {
    const isRecon = reconLancIds.has(t.id);
    const isSel = _selLancs.has(t.id);
    const cat = catById(t.cat, cats);
    return `<div class="list-item" data-id="${t.id}" style="${isSel ? 'border-color:var(--accent);background:var(--accent3)' : ''}">
      <div class="list-icon" style="background:${isRecon ? 'rgba(32,223,154,.15)' : isSel ? 'var(--accent3)' : 'var(--card2)'}">${isRecon ? '✅' : (cat ? cat.icon : '📦')}</div>
      <div class="list-body">
        <div class="list-title">${esc(t.desc || t.memo || 'Sem descrição')}</div>
        <div class="list-sub">${t.date || '—'}${cat ? ' · ' + esc(cat.name) : ''}${isRecon ? ' · Conciliado' : ''}</div>
      </div>
      <div style="text-align:right;flex-shrink:0">
        <div class="list-amount ${t.tipo === 'receita' ? 'income' : 'expense'}">${moneyFmt(t.valor)}</div>
        <span class="badge badge-sm ${isRecon ? 'badge-green' : 'badge-orange'}">${isRecon ? 'Conciliado' : 'Pendente'}</span>
        ${isRecon ? '<button class="btn btn-danger btn-sm undo-recon" data-id="' + t.id + '" style="margin-top:4px;height:28px;font-size:11px;width:auto;padding:0 8px">Desfazer</button>' : ''}
      </div>
    </div>`;
  }

  function renderMatchCard(m) {
    const bc = crit(m.bank, m.lanc);
    const kLabel = klass(m.score);
    const kColor = kLabel === 'alta' ? 'var(--green)' : kLabel === 'media' ? 'var(--orange)' : 'var(--red)';
    return `<div class="card mb-8" style="border-left:3px solid ${kColor}">
      <div class="flex items-center justify-between mb-8">
        <span class="fz-sm fw-700">${m.score} pts</span>
        <span class="badge badge-sm" style="background:${kColor}20;color:${kColor}">${kLabel === 'alta' ? 'Alta' : kLabel === 'media' ? 'Média' : 'Baixa'}</span>
      </div>
      <div class="flex items-center gap-8 mb-8">
        <div class="flex-1" style="min-width:0">
          <div class="fz-sm fw-600" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">🏦 ${esc(m.bank.desc || m.bank.memo || '')}</div>
          <div class="fz-sm text-dim">${m.bank.date || '—'} · ${moneyFmt(m.bank.valor)}</div>
        </div>
        <div style="font-size:18px;flex-shrink:0">↔</div>
        <div class="flex-1" style="min-width:0">
          <div class="fz-sm fw-600" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">📋 ${esc(m.lanc.desc || m.lanc.memo || '')}</div>
          <div class="fz-sm text-dim">${m.lanc.date || '—'} · ${moneyFmt(m.lanc.valor)}</div>
        </div>
      </div>
      <div class="flex gap-6" style="flex-wrap:wrap;margin-top:8px">
        <span class="badge badge-sm ${bc.valor ? 'badge-green' : 'badge-gray'}">${bc.valor ? '✓ Valor' : '✗ Valor'}</span>
        <span class="badge badge-sm ${bc.tipo ? 'badge-green' : 'badge-gray'}">${bc.tipo ? '✓ Tipo' : '✗ Tipo'}</span>
        <span class="badge badge-sm ${bc.dd <= 3 ? 'badge-green' : 'badge-gray'}">${bc.dd <= 3 ? '✓ ' + bc.dd + 'd' : bc.dd + 'd'}</span>
        <span class="badge badge-sm ${bc.sim >= 0.25 ? 'badge-green' : 'badge-gray'}">${bc.sim >= 0.25 ? '✓ Desc' : '✗ Desc'}</span>
        ${bc.doc ? '<span class="badge badge-green badge-sm">✓ Doc</span>' : ''}
      </div>
      <div class="flex gap-8 mt-8">
        <button class="btn btn-primary btn-sm recon-apply" data-bank="${m.bank.id}" data-lanc="${m.lanc.id}" style="flex:1;height:36px">✅ Conciliar</button>
        <button class="btn btn-secondary btn-sm recon-dismiss" data-bank="${m.bank.id}" data-lanc="${m.lanc.id}" style="flex:1;height:36px">Ignorar</button>
      </div>
    </div>`;
  }

  const page = $('#page-conciliacao');
  page.innerHTML = `
    <div class="flex items-center justify-between mb-12">
      <button class="icon-btn" id="prevMonth">◀</button>
      <h2 class="fz-lg fw-800">${view.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}</h2>
      <button class="icon-btn" id="nextMonth">▶</button>
    </div>

    <div class="kpi-grid mb-12">
      <div class="card">
        <div class="card-title">Mov. Bancárias</div>
        <div class="card-value">${bankTxs.length}</div>
        <div class="card-sub">${moneyFmt(pendingBankTotal)} pendente</div>
      </div>
      <div class="card">
        <div class="card-title">Lançamentos</div>
        <div class="card-value">${lancTxs.length}</div>
        <div class="card-sub">${moneyFmt(pendingLancTotal)} pendente</div>
      </div>
      <div class="card">
        <div class="card-title">Conciliados</div>
        <div class="card-value text-green">${reconTotal}</div>
        <div class="card-sub">${autoCount} automática(s)</div>
      </div>
      <div class="card">
        <div class="card-title">Score Médio</div>
        <div class="card-value text-blue">${avgScore || '—'}</div>
        <div class="card-sub">${reconRate}% auto</div>
      </div>
    </div>

    <div class="tabs mb-12">
      <button class="tab ${_tab === 'bancos' ? 'active' : ''}" data-tab="bancos">🏦 Bancos (${bankTxs.length})</button>
      <button class="tab ${_tab === 'sugestoes' ? 'active' : ''}" data-tab="sugestoes">💡 Sugestões (${matches.length})</button>
      <button class="tab ${_tab === 'sistema' ? 'active' : ''}" data-tab="sistema">📋 Sistema (${lancTxs.length})</button>
    </div>

    <div id="concContent"></div>

    <div class="flex gap-8 mt-16" id="concActions" style="display:none">
      <button class="btn btn-primary" id="concManualBtn" style="flex:2">🔄 Conciliar Selecionados (${_selBanks.size + _selLancs.size})</button>
      <button class="btn btn-secondary" id="concAutoBtn" style="flex:1">⚡ Auto</button>
    </div>
  `;

  function renderTab() {
    const el = $('#concContent');
    const actions = $('#concActions');
    if (_tab === 'bancos') {
      el.innerHTML = bankTxs.length
        ? bankTxs.map(t => renderBankItem(t)).join('')
        : '<div class="empty-state"><div class="empty-icon">🏦</div><div class="empty-title">Sem movimentações</div><div class="empty-text">Nenhuma movimentação bancária no mês</div></div>';
      actions.style.display = (_selBanks.size > 0 || _selLancs.size > 0) ? 'flex' : 'none';
      el.querySelectorAll('.list-item[data-id]').forEach(el2 => {
        el2.onclick = (e) => {
          if (e.target.classList.contains('undo-recon')) return;
          const id = el2.dataset.id;
          if (reconBankIds.has(id)) return;
          if (_selBanks.has(id)) _selBanks.delete(id); else _selBanks.add(id);
          updateConcActions();
          renderTab();
        };
      });
      el.querySelectorAll('.undo-recon').forEach(btn => {
        btn.onclick = (e) => {
          e.stopPropagation();
          doUndo(btn.dataset.id, 'bank');
        };
      });
    } else if (_tab === 'sistema') {
      el.innerHTML = lancTxs.length
        ? lancTxs.map(t => renderLancItem(t)).join('')
        : '<div class="empty-state"><div class="empty-icon">📋</div><div class="empty-title">Sem lançamentos</div><div class="empty-text">Nenhum lançamento pendente no mês</div></div>';
      actions.style.display = (_selBanks.size > 0 || _selLancs.size > 0) ? 'flex' : 'none';
      el.querySelectorAll('.list-item[data-id]').forEach(el2 => {
        el2.onclick = (e) => {
          if (e.target.classList.contains('undo-recon')) return;
          const id = el2.dataset.id;
          if (reconLancIds.has(id)) return;
          if (_selLancs.has(id)) _selLancs.delete(id); else _selLancs.add(id);
          updateConcActions();
          renderTab();
        };
      });
      el.querySelectorAll('.undo-recon').forEach(btn => {
        btn.onclick = (e) => {
          e.stopPropagation();
          doUndo(btn.dataset.id, 'lanc');
        };
      });
    } else {
      el.innerHTML = matches.length
        ? matches.map(m => renderMatchCard(m)).join('')
        : '<div class="empty-state"><div class="empty-icon">💡</div><div class="empty-title">Sem sugestões</div><div class="empty-text">Nenhum match automático encontrado (score ≥ 70)</div></div>';
      actions.style.display = 'none';
      el.querySelectorAll('.recon-apply').forEach(btn => {
        btn.onclick = (e) => {
          e.stopPropagation();
          doConcilia(btn.dataset.bank, btn.dataset.lanc, 70, 'auto');
          renderTab();
        };
      });
      el.querySelectorAll('.recon-dismiss').forEach(btn => {
        btn.onclick = (e) => {
          e.stopPropagation();
          _dismissed.add(btn.dataset.bank + ':' + btn.dataset.lanc);
          renderTab();
        };
      });
    }
  }

  function updateConcActions() {
    const actions = $('#concActions');
    if (!actions) return;
    const manualBtn = $('#concManualBtn');
    if (manualBtn) manualBtn.textContent = `🔄 Conciliar Selecionados (${_selBanks.size + _selLancs.size})`;
    actions.style.display = (_selBanks.size > 0 || _selLancs.size > 0) ? 'flex' : 'none';
  }

  function doConcilia(bankId, lancId, sc, mode) {
    patchTx(state, lancId, t => { t.pending = false; t.status = 'conciliado'; t.paidAt = new Date().toISOString(); });
    state.reconLog.push({ bankTxId: bankId, lancId, score: sc, date: new Date().toISOString(), mode });
    save();
  }

  function doUndo(id, type) {
    if (type === 'lanc') {
      const entry = state.reconLog.find(r => r.lancId === id);
      if (entry) {
        patchTx(state, id, t => { t.pending = true; t.status = 'pendente'; delete t.paidAt; });
        state.reconLog = state.reconLog.filter(r => r.lancId !== id);
        save();
        showToast('Conciliação desfeita');
        renderTab();
        updateConcActions();
      }
    } else {
      const entry = state.reconLog.find(r => r.bankTxId === id);
      if (entry) {
        patchTx(state, entry.lancId, t => { t.pending = true; t.status = 'pendente'; delete t.paidAt; });
        state.reconLog = state.reconLog.filter(r => r.bankTxId !== id);
        save();
        showToast('Conciliação desfeita');
        renderTab();
        updateConcActions();
      }
    }
  }

  function doConciliaManual() {
    const pairs = [];
    const banksArr = [..._selBanks];
    const lancsArr = [..._selLancs];
    const minLen = Math.min(banksArr.length, lancsArr.length);
    for (let i = 0; i < minLen; i++) {
      const bt = bankTxs.find(t => t.id === banksArr[i]);
      const lt = lancTxs.find(t => t.id === lancsArr[i]);
      if (bt && lt) {
        const sc = score(bt, lt);
        doConcilia(banksArr[i], lancsArr[i], Math.max(sc, 100), 'manual');
        pairs.push({ bank: bt, lanc: lt, score: sc });
      }
    }
    const extraBanks = banksArr.slice(minLen);
    const extraLancs = lancsArr.slice(minLen);
    if (extraBanks.length > 0) {
      showToast(`${extraBanks.length} movimentação(ões) sem par — selecione lançamentos`);
    }
    if (extraLancs.length > 0) {
      showToast(`${extraLancs.length} lançamento(s) sem par — selecione movimentações`);
    }
    _selBanks.clear();
    _selLancs.clear();
    if (pairs.length > 0) {
      showToast(`${pairs.length} transação(ões) conciliada(s)`);
    }
    renderTab();
    updateConcActions();
  }

  function doAutoConcilia() {
    let count = 0;
    const pendingL = lancTxs.filter(t => !reconLancIds.has(t.id));
    bankTxs.filter(t => !reconBankIds.has(t.id)).forEach(bt => {
      let bestScore = 0, bestLanc = null;
      pendingL.forEach(lt => {
        const s = score(bt, lt);
        if (s > bestScore) { bestScore = s; bestLanc = lt; }
      });
      if (bestLanc && bestScore >= 90) {
        doConcilia(bt.id, bestLanc.id, bestScore, 'auto');
        pendingL.splice(pendingL.indexOf(bestLanc), 1);
        count++;
      }
    });
    if (count > 0) {
      showToast(`${count} conciliada(s) automaticamente`);
    } else {
      showToast('Nenhum match ≥ 90 para conciliação automática');
    }
    _tab = 'bancos';
    renderTab();
    updateConcActions();
  }

  page.querySelectorAll('.tab').forEach(tab => {
    tab.onclick = () => {
      _tab = tab.dataset.tab;
      page.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === _tab));
      renderTab();
      updateConcActions();
    };
  });

  $('#prevMonth').onclick = () => { view.setMonth(view.getMonth() - 1); render(); };
  $('#nextMonth').onclick = () => { view.setMonth(view.getMonth() + 1); render(); };

  const concManualBtn = $('#concManualBtn');
  const concAutoBtn = $('#concAutoBtn');
  if (concManualBtn) concManualBtn.onclick = doConciliaManual;
  if (concAutoBtn) concAutoBtn.onclick = doAutoConcilia;

  renderTab();
  updateConcActions();
}

function renderConfig() {
  const txCount = (state.tx || []).length;
  const goalCount = (state.goals || []).length;
  const assetCount = (state.patrimonio || []).length;
  const catCount = cats.filter(c => !c.inactive).length;
  let storageKB = '0';
  try {
    const raw = localStorage.getItem('finania_v4_clean') || '';
    storageKB = (new Blob([raw]).size / 1024).toFixed(1);
  } catch (_) { /* ignore */ }
  const lastBackup = state.lastBackup || 'Nunca';

  $('#page-config').innerHTML = `
    <h2 class="fz-lg fw-800 mb-16">Configurações</h2>

    <div class="section-title mb-8">Aparência</div>
    <div class="list-item" id="cfgTheme">
      <div class="list-icon">🎨</div>
      <div class="list-body"><div class="list-title">Tema</div><div class="list-sub">${state.theme === 'dark' ? 'Escuro' : 'Claro'}</div></div>
      <div class="list-value">
        <div class="toggle">
          <div class="toggle-track ${state.theme === 'dark' ? 'active' : ''}" id="cfgThemeTrack">
            <div class="toggle-thumb"></div>
          </div>
        </div>
      </div>
    </div>

    <div class="list-item" id="cfgPrivacy">
      <div class="list-icon">🔒</div>
      <div class="list-body"><div class="list-title">Privacidade</div><div class="list-sub">Ocultar valores sensíveis</div></div>
      <div class="list-value">
        <div class="toggle">
          <div class="toggle-track ${state.privacy ? 'active' : ''}" id="cfgPrivacyTrack">
            <div class="toggle-thumb"></div>
          </div>
        </div>
      </div>
    </div>

    <div class="section-title mb-8" style="margin-top:24px">Dados</div>
    <div class="list-item" id="cfgExport">
      <div class="list-icon">📤</div>
      <div class="list-body"><div class="list-title">Exportar backup</div><div class="list-sub">Baixar todos os dados em JSON</div></div>
      <div class="list-value"><span class="text-accent">›</span></div>
    </div>
    <div class="list-item" id="cfgImport">
      <div class="list-icon">📥</div>
      <div class="list-body"><div class="list-title">Importar backup</div><div class="list-sub">Restaurar dados de um arquivo</div></div>
      <div class="list-value"><span class="text-accent">›</span></div>
    </div>
    <div class="list-item" id="cfgDelete" style="margin-top:4px">
      <div class="list-icon">⚠️</div>
      <div class="list-body"><div class="list-title text-red">Apagar todos os dados</div><div class="list-sub">Ação irreversível</div></div>
      <div class="list-value"><span class="text-red">›</span></div>
    </div>

    <div class="section-title mb-8" style="margin-top:24px">Estatísticas</div>
    <div class="card" style="padding:16px">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
        <div><div class="fz-sm text-dim">Transações</div><div class="fw-800">${txCount}</div></div>
        <div><div class="fz-sm text-dim">Categorias</div><div class="fw-800">${catCount}</div></div>
        <div><div class="fz-sm text-dim">Metas</div><div class="fw-800">${goalCount}</div></div>
        <div><div class="fz-sm text-dim">Patrimônio</div><div class="fw-800">${assetCount}</div></div>
        <div><div class="fz-sm text-dim">Armazenamento</div><div class="fw-800">${storageKB} KB</div></div>
        <div><div class="fz-sm text-dim">Último backup</div><div class="fw-800">${esc(lastBackup)}</div></div>
      </div>
    </div>

    <div class="section-title mb-8" style="margin-top:24px">PWA / Offline</div>
    <div class="list-item" id="cfgSW">
      <div class="list-icon">📱</div>
      <div class="list-body"><div class="list-title">Service Worker</div><div class="list-sub" id="cfgSWStatus">Verificando...</div></div>
    </div>
    <div class="list-item" id="cfgInstall" style="display:none">
      <div class="list-icon">⬇️</div>
      <div class="list-body"><div class="list-title">Instalar aplicativo</div><div class="list-sub">Adicionar à tela inicial</div></div>
      <div class="list-value"><span class="text-accent">›</span></div>
    </div>
    <div class="list-item" id="cfgCache">
      <div class="list-icon">🗃️</div>
      <div class="list-body"><div class="list-title">Cache</div><div class="list-sub" id="cfgCacheStatus">Verificando...</div></div>
      <div class="list-value"><span id="cfgCacheClear" style="color:var(--red);cursor:pointer;display:none">Limpar</span></div>
    </div>

    <div class="section-title mb-8" style="margin-top:24px">Sobre</div>
    <div class="card" style="padding:16px">
      <div style="text-align:center">
        <div style="font-size:28px;margin-bottom:8px">💰</div>
        <div class="fw-800">MR Finance</div>
        <div class="fz-sm text-dim" id="cfgVersion">Carregando...</div>
        <div class="fz-sm text-dim" style="margin-top:4px">Última atualização: 2026-06-24</div>
        <div class="fz-sm text-dim" style="margin-top:12px">Feito com dedicação para<br>simplificar suas finanças.</div>
      </div>
    </div>
  `;

  // --- Aparência ---
  $('#cfgTheme').onclick = () => {
    state.theme = state.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = state.theme;
    save();
    renderConfig();
  };

  $('#cfgPrivacy').onclick = () => {
    state.privacy = !state.privacy;
    save();
    renderConfig();
    showToast(state.privacy ? 'Privacidade ativada' : 'Privacidade desativada');
  };

  // --- Dados ---
  $('#cfgExport').onclick = () => {
    const backup = { ...state, exportedAt: new Date().toISOString() };
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `mrfinance-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    state.lastBackup = new Date().toISOString().slice(0, 10);
    save();
    showToast('Backup exportado com sucesso');
  };

  $('#cfgImport').onclick = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.onchange = (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        let imported;
        try { imported = JSON.parse(ev.target.result); } catch (_) {
          showToast('Arquivo JSON inválido');
          return;
        }
        if (!imported || !Array.isArray(imported.tx)) {
          showToast('Arquivo não contém dados válidos');
          return;
        }
        openModal(`
          <div style="padding:4px 0">
            <div class="fz-lg fw-800 mb-16">Importar backup</div>
            <p class="fz-sm text-dim mb-16">Encontrado: ${imported.tx.length} transações, ${(imported.goals || []).length} metas, ${(imported.patrimonio || []).length} bens.</p>
            <p class="fz-sm text-dim mb-16">Como deseja importar?</p>
            <div class="list-item" id="impMerge" style="margin-bottom:8px">
              <div class="list-icon">🔗</div>
              <div class="list-body"><div class="list-title">Mesclar</div><div class="list-sub">Adicionar aos dados existentes</div></div>
              <div class="list-value"><span class="text-accent">›</span></div>
            </div>
            <div class="list-item" id="impReplace" style="margin-bottom:8px">
              <div class="list-icon">🔄</div>
              <div class="list-body"><div class="list-title text-red">Substituir</div><div class="list-sub">Sobrescrever todos os dados</div></div>
              <div class="list-value"><span class="text-red">›</span></div>
            </div>
            <button class="btn btn-secondary" id="impCancel">Cancelar</button>
          </div>
        `);
        $('#impCancel').onclick = closeModal;
        $('#impMerge').onclick = () => {
          imported.tx.forEach(t => {
            if (!state.tx.find(x => x.id === t.id)) state.tx.push(t);
          });
          if (imported.goals) {
            if (!state.goals) state.goals = [];
            imported.goals.forEach(g => {
              if (!state.goals.find(x => x.id === g.id)) state.goals.push(g);
            });
          }
          if (imported.patrimonio) {
            if (!state.patrimonio) state.patrimonio = [];
            imported.patrimonio.forEach(p => {
              if (!state.patrimonio.find(x => x.id === p.id)) state.patrimonio.push(p);
            });
          }
          save();
          closeModal();
          renderConfig();
          showToast('Dados mesclados com sucesso');
        };
        $('#impReplace').onclick = () => {
          openModal(`
            <div style="padding:4px 0;text-align:center">
              <div style="font-size:40px;margin-bottom:12px">⚠️</div>
              <div class="fz-lg fw-800 mb-8">Tem certeza?</div>
              <p class="fz-sm text-dim mb-16">Todos os seus dados atuais serão substituídos. Esta ação não pode ser desfeita.</p>
              <button class="btn btn-danger mb-8" id="impRepConfirm">Sim, substituir tudo</button>
              <button class="btn btn-secondary" id="impRepCancel">Cancelar</button>
            </div>
          `);
          $('#impRepCancel').onclick = () => { closeModal(); closeModal(); };
          $('#impRepConfirm').onclick = () => {
            Object.keys(state).forEach(k => delete state[k]);
            Object.assign(state, { tx: [], balances: {}, initialBalances: {}, goals: [], budgets: {}, rules: {}, patrimonio: [], customCats: [], catOverrides: {}, catDreByType: {}, reservePct: 50, reserveTarget: 0, reserveValor: 0, theme: 'dark', privacy: false, seenNotifications: false, catVer: 0 });
            Object.assign(state, imported);
            document.documentElement.dataset.theme = state.theme;
            save();
            closeModal();
            closeModal();
            renderConfig();
            showToast('Dados substituídos com sucesso');
          };
        };
      };
      reader.readAsText(file);
    };
    input.click();
  };

  $('#cfgDelete').onclick = () => {
    openModal(`
      <div style="padding:4px 0;text-align:center">
        <div style="font-size:40px;margin-bottom:12px">🚨</div>
        <div class="fz-lg fw-800 mb-8 text-red">Tem certeza?</div>
        <p class="fz-sm text-dim mb-16">Isto irá apagar TODOS os seus dados permanentemente. Esta ação é irreversível.</p>
        <button class="btn btn-danger mb-8" id="cfgDelStep2">Quero continuar</button>
        <button class="btn btn-secondary" id="cfgDelCancel">Cancelar</button>
      </div>
    `);
    $('#cfgDelCancel').onclick = closeModal;
    $('#cfgDelStep2').onclick = () => {
      openModal(`
        <div style="padding:4px 0;text-align:center">
          <div style="font-size:40px;margin-bottom:12px">💀</div>
          <div class="fz-lg fw-800 mb-8 text-red">Última chance</div>
          <p class="fz-sm text-dim mb-8">Digite <strong>APAGAR</strong> para confirmar:</p>
          <input type="text" class="form-input" id="cfgDelInput" placeholder="Digite APAGAR" style="text-align:center;margin-bottom:16px" autocomplete="off"/>
          <button class="btn btn-danger mb-8" id="cfgDelFinal" style="opacity:0.5;pointer-events:none">Apagar tudo</button>
          <button class="btn btn-secondary" id="cfgDelCancel2">Cancelar</button>
        </div>
      `);
      $('#cfgDelCancel2').onclick = () => { closeModal(); closeModal(); };
      const delInput = $('#cfgDelInput');
      const delBtn = $('#cfgDelFinal');
      delInput.oninput = () => {
        const ok = delInput.value.trim().toUpperCase() === 'APAGAR';
        delBtn.style.opacity = ok ? '1' : '0.5';
        delBtn.style.pointerEvents = ok ? 'auto' : 'none';
      };
      delInput.focus();
      delBtn.onclick = () => {
        localStorage.removeItem('finania_v4_clean');
        closeModal();
        closeModal();
        showToast('Todos os dados foram apagados');
        setTimeout(() => location.reload(), 800);
      };
    };
  };

  // --- Service Worker ---
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistration().then(reg => {
      const el = $('#cfgSWStatus');
      if (el) el.textContent = reg ? 'Ativo — modo offline disponível' : 'Não registrado';
    }).catch(() => {
      const el = $('#cfgSWStatus');
      if (el) el.textContent = 'Indisponível';
    });
  } else {
    const el = $('#cfgSWStatus');
    if (el) el.textContent = 'Não suportado pelo navegador';
  }

  // --- PWA Install Prompt ---
  let deferredPrompt = null;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    const el = $('#cfgInstall');
    if (el) el.style.display = '';
  });
  const installEl = $('#cfgInstall');
  if (installEl) {
    installEl.onclick = () => {
      if (!deferredPrompt) { showToast('Instalação não disponível'); return; }
      deferredPrompt.prompt();
      deferredPrompt.userChoice.then(r => {
        if (r.outcome === 'accepted') showToast('App instalado!');
        deferredPrompt = null;
      });
    };
  }

  // --- Cache Status ---
  if ('caches' in window) {
    caches.keys().then(names => {
      const el = $('#cfgCacheStatus');
      const clearEl = $('#cfgCacheClear');
      if (names.length === 0) {
        if (el) el.textContent = 'Sem caches';
      } else {
        let totalEntries = 0;
        Promise.all(names.map(n => caches.open(n).then(c => c.keys().then(k => { totalEntries += k.length; })))).then(() => {
          if (el) el.textContent = `${names.length} cache(s), ${totalEntries} item(s)`;
          if (clearEl) clearEl.style.display = '';
        });
      }
    }).catch(() => {});
  }
  const clearCacheEl = $('#cfgCacheClear');
  if (clearCacheEl) {
    clearCacheEl.onclick = () => {
      caches.keys().then(names => Promise.all(names.map(n => caches.delete(n)))).then(() => {
        showToast('Cache limpo');
        const el = $('#cfgCacheStatus');
        if (el) el.textContent = 'Cache limpo';
        clearCacheEl.style.display = 'none';
      });
    };
  }

  // --- Versão do app ---
  const verEl = $('#cfgVersion');
  if (verEl) {
    const ver = document.querySelector('meta[name="version"]');
    verEl.textContent = ver ? `Versão ${ver.content}` : 'MR Finance Mobile';
  }
}

// ======================================================================
// UTILITIES
// ======================================================================
function filterTx(q) {
  const items = $$(`#txList .list-item`);
  const query = norm(q);
  items.forEach(el => {
    const text = norm(el.textContent);
    el.style.display = !query || text.includes(query) ? '' : 'none';
  });
}

function showToast(msg, opts = {}) {
  let t = document.querySelector('.snackbar');
  if (!t) {
    t = document.createElement('div');
    t.className = 'snackbar';
    document.body.appendChild(t);
  }
  const { action, onAction, duration = 3000 } = opts;
  t.innerHTML = `<span class="snackbar-msg">${esc(msg)}</span>${action ? `<button class="snackbar-action">${esc(action)}</button>` : ''}<button class="snackbar-close">&times;</button>`;
  t.classList.add('show');
  clearTimeout(t._t);
  const closeBtn = t.querySelector('.snackbar-close');
  const actionBtn = t.querySelector('.snackbar-action');
  closeBtn.onclick = () => { t.classList.remove('show'); };
  if (actionBtn && onAction) actionBtn.onclick = () => { t.classList.remove('show'); onAction(); };
  t._t = setTimeout(() => t.classList.remove('show'), duration);
}

// ======================================================================
// MODAL SYSTEM
// ======================================================================
let modalStack = [];
let modalDragState = null;

function openModal(html, opts = {}) {
  const overlay = $('#modalOverlay');
  const sheet = overlay.querySelector('.modal-sheet');
  const content = $('#modalContent');
  content.innerHTML = `<div class="modal-handle"></div>${html}`;
  overlay.classList.remove('hidden');
  overlay.style.opacity = '1';
  sheet.style.transform = 'translateY(0)';
  document.body.style.overflow = 'hidden';
  modalStack.push({ overlay, sheet, opts });

  overlay.onclick = (e) => { if (e.target === overlay && opts.dismissible !== false) closeModal(); };

  const handle = content.querySelector('.modal-handle');
  let startY = 0, currentY = 0, isDragging = false;

  const onPointerDown = (e) => {
    if (opts.draggable === false) return;
    isDragging = true;
    startY = e.touches ? e.touches[0].clientY : e.clientY;
    currentY = 0;
    sheet.classList.add('dragging');
  };
  const onPointerMove = (e) => {
    if (!isDragging) return;
    const y = e.touches ? e.touches[0].clientY : e.clientY;
    currentY = Math.max(0, y - startY);
    sheet.style.transform = `translateY(${currentY}px)`;
    overlay.style.opacity = 1 - (currentY / 400);
  };
  const onPointerUp = () => {
    if (!isDragging) return;
    isDragging = false;
    sheet.classList.remove('dragging');
    if (currentY > 120) {
      closeModal();
    } else {
      sheet.style.transform = 'translateY(0)';
      overlay.style.opacity = '1';
    }
  };

  if (handle) {
    handle.addEventListener('touchstart', onPointerDown, { passive: true });
    handle.addEventListener('touchmove', onPointerMove, { passive: true });
    handle.addEventListener('touchend', onPointerUp);
    handle.addEventListener('mousedown', onPointerDown);
    document.addEventListener('mousemove', onPointerMove);
    document.addEventListener('mouseup', onPointerUp);
    sheet._dragCleanup = () => {
      handle.removeEventListener('touchstart', onPointerDown);
      handle.removeEventListener('touchmove', onPointerMove);
      handle.removeEventListener('touchend', onPointerUp);
      handle.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('mousemove', onPointerMove);
      document.removeEventListener('mouseup', onPointerUp);
    };
  }
}

function closeModal() {
  const entry = modalStack.pop();
  if (!entry) return;
  const { overlay, sheet, opts } = entry;
  sheet.style.transform = 'translateY(100%)';
  overlay.style.opacity = '0';
  if (sheet._dragCleanup) sheet._dragCleanup();
  setTimeout(() => {
    overlay.classList.add('hidden');
    overlay.style.opacity = '';
    sheet.style.transform = '';
    document.body.style.overflow = '';
    if (opts && opts.onClose) opts.onClose();
  }, 300);
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && modalStack.length > 0) closeModal();
});

// ======================================================================
// FORM SYSTEM
// ======================================================================
function renderForm(fields, data = {}) {
  return fields.map(f => {
    const val = data[f.name] ?? f.default ?? '';
    const id = `f-${f.name}`;
    let input = '';
    switch (f.type) {
      case 'select':
        input = `<select class="form-select" id="${id}" name="${f.name}">${(f.options || []).map(o => `<option value="${o.value}" ${o.value === val ? 'selected' : ''}>${o.label}</option>`).join('')}</select>`;
        break;
      case 'textarea':
        input = `<textarea class="form-textarea" id="${id}" name="${f.name}" placeholder="${f.placeholder || ''}">${val}</textarea>`;
        break;
      case 'toggle':
        input = `<div class="toggle" data-field="${f.name}"><div class="toggle-track ${val ? 'active' : ''}"><div class="toggle-thumb"></div></div></div>`;
        break;
      case 'date':
        input = `<input type="date" class="form-input" id="${id}" name="${f.name}" value="${val}" ${f.min ? `min="${f.min}"` : ''} ${f.max ? `max="${f.max}"` : ''}/>`;
        break;
      case 'number':
        input = `<input type="number" class="form-input" id="${id}" name="${f.name}" value="${val}" placeholder="${f.placeholder || ''}" ${f.min != null ? `min="${f.min}"` : ''} ${f.max != null ? `max="${f.max}"` : ''} step="${f.step || 'any'}"/>`;
        break;
      default:
        input = `<input type="${f.type || 'text'}" class="form-input" id="${id}" name="${f.name}" value="${val}" placeholder="${f.placeholder || ''}" autocomplete="off"/>`;
    }
    return `<div class="form-group"><label class="form-label" for="${id}">${f.label}</label>${input}<div class="form-helper" id="${id}-err"></div></div>`;
  }).join('');
}

function getFormData(fields) {
  const data = {};
  fields.forEach(f => {
    if (f.type === 'toggle') {
      const el = document.querySelector(`.toggle[data-field="${f.name}"] .toggle-track`);
      data[f.name] = el ? el.classList.contains('active') : false;
    } else {
      const el = document.getElementById(`f-${f.name}`);
      data[f.name] = el ? el.value : '';
    }
  });
  return data;
}

function validateForm(data, rules) {
  const errors = {};
  for (const [field, rulesArr] of Object.entries(rules)) {
    for (const rule of rulesArr) {
      const val = data[field];
      if (rule.required && (!val || val.toString().trim() === '')) {
        errors[field] = rule.msg || 'Obrigatório';
        break;
      }
      if (rule.min != null && val && Number(val) < rule.min) {
        errors[field] = rule.msg || `Mínimo: ${rule.min}`;
        break;
      }
      if (rule.max != null && val && Number(val) > rule.max) {
        errors[field] = rule.msg || `Máximo: ${rule.max}`;
        break;
      }
      if (rule.pattern && val && !rule.pattern.test(val)) {
        errors[field] = rule.msg || 'Formato inválido';
        break;
      }
      if (rule.custom && val) {
        const err = rule.custom(val);
        if (err) { errors[field] = err; break; }
      }
    }
  }
  return Object.keys(errors).length ? errors : null;
}

function showFormErrors(errors) {
  Object.entries(errors || {}).forEach(([field, msg]) => {
    const errEl = document.getElementById(`f-${field}-err`);
    const input = document.getElementById(`f-${field}`);
    if (errEl) { errEl.textContent = msg; errEl.classList.add('error'); }
    if (input) input.classList.add('error');
  });
}

function clearFormErrors(fields) {
  fields.forEach(f => {
    const errEl = document.getElementById(`f-${f.name}-err`);
    const input = document.getElementById(`f-${f.name}`);
    if (errEl) { errEl.textContent = ''; errEl.classList.remove('error'); }
    if (input) input.classList.remove('error');
  });
}

function showFormModal(title, fields, onSubmit, data = {}) {
  const html = `
    <div class="modal-header">
      <div class="modal-title">${title}</div>
    </div>
    <form id="formModalForm" autocomplete="off">${renderForm(fields, data)}</form>
    <div class="flex gap-8 mt-16">
      <button class="btn btn-secondary" type="button" id="formCancel" style="flex:1">Cancelar</button>
      <button class="btn btn-primary" type="submit" id="formSubmit" style="flex:2">Salvar</button>
    </div>
  `;
  openModal(html);
  setTimeout(() => {
    document.querySelectorAll('.toggle').forEach(t => {
      t.onclick = () => { const tr = t.querySelector('.toggle-track'); tr.classList.toggle('active'); };
    });
    $('#formCancel').onclick = closeModal;
    $('#formModalForm').onsubmit = (e) => {
      e.preventDefault();
      const formData = getFormData(fields);
      const errors = validateForm(formData, fields.reduce((acc, f) => {
        if (f.rules) acc[f.name] = f.rules;
        return acc;
      }, {}));
      clearFormErrors(fields);
      if (errors) { showFormErrors(errors); return; }
      closeModal();
      onSubmit(formData);
    };
  }, 50);
}

// ======================================================================
// LOADING STATES
// ======================================================================
function showLoading(container) {
  if (typeof container === 'string') container = $(container);
  if (!container) return;
  container._prevHTML = container.innerHTML;
  container.innerHTML = `
    <div class="skeleton skeleton-title"></div>
    <div class="skeleton skeleton-text w-full"></div>
    <div class="skeleton skeleton-text w-75"></div>
    <div class="skeleton skeleton-text w-50"></div>
    <div class="skeleton skeleton-rect mt-12"></div>
  `;
}

function hideLoading(container) {
  if (typeof container === 'string') container = $(container);
  if (!container) return;
  if (container._prevHTML != null) {
    container.innerHTML = container._prevHTML;
    container._prevHTML = null;
  }
}

let spinnerEl = null;
function showSpinner() {
  if (spinnerEl) return;
  spinnerEl = document.createElement('div');
  spinnerEl.className = 'spinner-overlay';
  spinnerEl.innerHTML = '<div class="spinner lg"></div>';
  document.body.appendChild(spinnerEl);
}

function hideSpinner() {
  if (spinnerEl) { spinnerEl.remove(); spinnerEl = null; }
}

// ======================================================================
// ANIMATION HELPERS
// ======================================================================
function animateEntrance(el, opts = {}) {
  const { translateY = 20, duration = 300, delay = 0 } = opts;
  el.style.opacity = '0';
  el.style.transform = `translateY(${translateY}px)`;
  el.style.transition = `opacity ${duration}ms ease ${delay}ms, transform ${duration}ms ease ${delay}ms`;
  requestAnimationFrame(() => {
    el.style.opacity = '1';
    el.style.transform = 'translateY(0)';
  });
}

function animateExit(el, opts = {}) {
  return new Promise(resolve => {
    const { translateY = 20, duration = 200 } = opts;
    el.style.transition = `opacity ${duration}ms ease, transform ${duration}ms ease`;
    el.style.opacity = '0';
    el.style.transform = `translateY(${translateY}px)`;
    setTimeout(resolve, duration);
  });
}

function animateCounter(el, target, opts = {}) {
  const { duration = 800, prefix = '', suffix = '' } = opts;
  const start = 0;
  const startTime = performance.now();
  const step = (now) => {
    const elapsed = now - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    const current = Math.round(start + (target - start) * eased);
    el.textContent = prefix + current.toLocaleString('pt-BR') + suffix;
    if (progress < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

// ======================================================================
// THEME
// ======================================================================
document.documentElement.dataset.theme = state.theme;

// ======================================================================
// BOTTOM NAV
// ======================================================================
$$('.bn-item').forEach(btn => {
  btn.onclick = () => {
    $$('.bn-item').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    showPage(btn.dataset.page);
  };
});

// ======================================================================
// GLOBAL API
// ======================================================================
window.__mob = {
  goPage: (p) => {
    $$('.bn-item').forEach(b => b.classList.remove('active'));
    const bn = $(`.bn-item[data-page="${p}"]`);
    if (bn) bn.classList.add('active');
    else $$('.bn-item').forEach(b => b.classList.toggle('active', b.dataset.page === 'mais'));
    showPage(p);
  },
  back: () => {
    if (pageHistory.length) showPage(pageHistory.pop());
    else window.__mob.goPage('visao');
  },
  state: () => state,
  render,
  toast: showToast,
  openModal,
  closeModal,
  showFormModal,
  renderForm,
  getFormData,
  validateForm,
  showLoading,
  hideLoading,
  showSpinner,
  hideSpinner,
  animateEntrance,
  animateExit,
  animateCounter,
};

// ======================================================================
// THEME TOGGLE
// ======================================================================
$('#themeBtn').onclick = () => { state.theme = state.theme === 'dark' ? 'light' : 'dark'; document.documentElement.dataset.theme = state.theme; save(); };

// ======================================================================
// INITIAL RENDER
// ======================================================================
render();
showToast('MR Finance Mobile');
