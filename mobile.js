/* ============================================================================
   MR Finance — MOBILE (mobile.js)
   App mobile PRÓPRIO. Consome o núcleo MRCore (mesmos dados/regras/storage do
   desktop). Nenhuma regra de negócio nova — apenas UI/navegação mobile.
   Arquitetura: host único (#mView) + registro de telas (BUILD) + bottom-sheets.
   ============================================================================ */
(function () {
  'use strict';
  var C = window.MRCore;
  if (!C) { document.body.innerHTML = '<p style="padding:30px;color:#fff">Erro: mr-core.js não carregou.</p>'; return; }

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };

  var screen = 'visao';
  var txFilter = 'todas';
  var repYear = String(new Date().getFullYear());
  var graphTab = 'poupanca';
  var payTab = 'aberto';
  var recTab = 'aberto';
  var concilTab = 'pendencias';
  var notifTab = 'pay';
  var view = new Date();

  /* mapeia cada tela -> botão raiz da bottom nav que fica destacado */
  var ROOT = {
    visao: 'visao', transacoes: 'transacoes', graficos: 'graficos', mais: 'mais',
    lancamentos: 'mais', fluxo: 'mais', categorias: 'mais', metas: 'mais', analises: 'mais',
    relatorios: 'mais', destino: 'mais', conciliacao: 'mais', patrimonio: 'mais', bancos: 'mais', config: 'mais'
  };

  /* categorias de patrimônio (espelho do desktop, p/ rótulo e ícone) */
  var PCATS = [
    { id: 'imovel', name: 'Imóvel', icon: '🏠' }, { id: 'veiculo', name: 'Veículo', icon: '🚗' },
    { id: 'cripto', name: 'Criptoativo', icon: '🪙' }, { id: 'reserva', name: 'Reserva', icon: '🛡️' },
    { id: 'empresa', name: 'Empresa', icon: '🏢' }, { id: 'equipamento', name: 'Equipamento', icon: '💻' },
    { id: 'outros', name: 'Outros', icon: '📦' }
  ];
  function pcatOf(id) { return PCATS.find(function (c) { return c.id === id; }) || PCATS[PCATS.length - 1]; }

  /* ---- helpers ---- */
  function mk() { return C.monthKey(view); }
  function shiftMonth(n) { view = new Date(view.getFullYear(), view.getMonth() + n, 1); render(); }
  function dateBR(d) { return new Date(d + 'T00:00:00').toLocaleDateString('pt-BR'); }
  function parseMoney(s) { var v = parseFloat(String(s).replace(/\s/g, '').replace(/\./g, '').replace(',', '.')); return isFinite(v) ? v : 0; }
  function toast(msg) {
    var t = $('#mToast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(toast._t); toast._t = setTimeout(function () { t.classList.remove('show'); }, 2200);
  }
  function go(s) { screen = s; render(); }
  function bankIcon(b) { return /^(data:|https?:)/.test(b.icon || '') ? '🏦' : esc(b.icon || '🏦'); }
  function money0(v) { return 'R$ ' + Math.round(+v || 0).toLocaleString('pt-BR'); }
  /* painel titulado uniforme (estrutura consistente em todas as telas) */
  function panel(title, action, body, pad) {
    return '<section class="m-panel"><div class="m-panel-h"><h3>' + esc(title) + '</h3>' + (action || '') + '</div>' +
      '<div class="m-panel-b' + (pad ? ' pad' : '') + '">' + body + '</div></section>';
  }
  var PAL = ['#7c4dff', '#2787ff', '#22e68b', '#ffb238', '#ff416d', '#20d6d2', '#9d6bff', '#ff6fa3'];

  /* ============================ RENDER ============================ */
  var BUILD = {
    visao: buildVisao, transacoes: buildTransacoes, lancamentos: buildLancamentos, graficos: buildGraficos,
    mais: buildMais, fluxo: buildFluxo, categorias: buildCategorias, metas: buildMetas, analises: buildAnalises,
    relatorios: buildRelatorios, destino: buildDestino, conciliacao: buildConciliacao,
    patrimonio: buildPatrimonio, bancos: buildBancos, config: buildConfig
  };

  /* telas sem contexto de mês: escondem o seletor de mês da barra superior */
  var MONTHLESS = { mais: 1, categorias: 1, metas: 1, patrimonio: 1, config: 1, relatorios: 1 };

  function render() {
    var st = C.load();
    $('#mMonthLabel').textContent = C.monthName(mk());
    document.body.classList.toggle('m-nomonth', !!MONTHLESS[screen]);
    var root = ROOT[screen] || 'mais';
    $$('#mBotnav button[data-go]').forEach(function (b) { b.classList.toggle('on', b.getAttribute('data-go') === root); });
    $('#mView').innerHTML = (BUILD[screen] || buildVisao)(st);
    try { var nb = C.notifications(st, mk()).counts.urgent, bell = $('#mBell'); if (bell) { bell.textContent = nb; bell.classList.toggle('hidden', !(nb > 0)); } } catch (e) {}
    window.scrollTo(0, 0);
  }

  function shead(title, sub, opts) {
    opts = opts || {};
    var add = opts.add ? '<button class="m-addbtn" ' + opts.add + '>＋ ' + esc(opts.addLabel || 'Novo') + '</button>' : '';
    return '<div class="m-shead"><button class="m-back" data-back aria-label="Voltar">‹</button>' +
      '<div class="ttl"><b>' + esc(title) + '</b>' + (sub ? '<span>' + esc(sub) + '</span>' : '') + '</div>' + add + '</div>';
  }
  function emptyMonth() {
    return '<div class="m-empty"><div class="e">📭</div>Sem lançamentos em <b>' + esc(C.monthName(mk())) + '</b>.<br>Toque no <b>＋</b> para adicionar.</div>';
  }

  /* ---- KPIs / linhas reutilizáveis ---- */
  function kpi(tone, ic, lab, val, vc) {
    return '<div class="m-kpi ' + tone + '"><div class="lab"><span class="ic">' + ic + '</span>' + lab + '</div>' +
      '<div class="val num ' + (vc || '') + '">' + val + '</div></div>';
  }
  function kpiFull(tone, ic, lab, val, sub) {
    return '<div class="m-kpi ' + tone + ' full"><div class="lab"><span class="ic">' + ic + '</span>' + lab + '</div>' +
      '<div class="val num">' + val + '</div>' + (sub ? '<div class="sub">' + esc(sub) + '</div>' : '') + '</div>';
  }
  // KPI 2-col com sub-linha (cards do desktop: Patrimônio/Bancos)
  function kpiS(tone, ic, lab, val, sub, vc) {
    return '<div class="m-kpi ' + tone + '"><div class="lab"><span class="ic">' + ic + '</span>' + lab + '</div>' +
      '<div class="val num ' + (vc || '') + '">' + val + '</div>' + (sub ? '<div class="sub">' + esc(sub) + '</div>' : '') + '</div>';
  }
  function statTile(label, val, cls, sub) {
    return '<div class="m-stat"><small>' + esc(label) + '</small><b class="num ' + (cls || '') + '">' + val + '</b>' +
      (sub ? '<span class="sub">' + esc(sub) + '</span>' : '') + '</div>';
  }
  function catRow(r, total, i) {
    var pct = Math.round(r.value / total * 100), col = PAL[i % PAL.length];
    return '<div class="m-cat"><span class="ci">' + esc(r.cat.icon) + '</span>' +
      '<div class="cm"><b>' + esc(r.cat.name) + '</b><div class="cbar"><i style="width:' + Math.max(3, pct) + '%;background:' + col + '"></i></div></div>' +
      '<strong>' + C.money(r.value) + '</strong></div>';
  }
  function txRow(st, t) {
    var c = C.catById(t.cat, st), isIn = t.tipo === 'receita';
    return '<div class="m-row" data-tx="' + esc(t.id) + '"><span class="av">' + esc(c.icon) + '</span>' +
      '<div class="info"><b>' + esc(t.desc || c.name) + '</b><span>' + dateBR(t.date) + ' · ' + esc(c.name) + (t.pending ? ' · previsto' : '') + '</span></div>' +
      '<strong class="' + (isIn ? 'up' : 'down') + '">' + (isIn ? '+' : '−') + C.money(t.valor) + '</strong></div>';
  }
  function tool(act, ic, label, em) {
    return '<button class="m-tool" data-act="' + act + '"><i>' + ic + '</i>' + esc(label) + '<em>' + em + '</em></button>';
  }
  // 'YYYY-MM' do mês anterior
  function prevMonthKey(k) {
    var y = +k.slice(0, 4), m = +k.slice(5, 7) - 1; if (m < 1) { m = 12; y--; }
    return y + '-' + (m < 10 ? '0' : '') + m;
  }
  // linha de gasto recorrente (nome + barra proporcional + média/mês) — fiel ao desktop
  function recRow(st, r, max, i) {
    var c = C.catById(r.cat, st), w = Math.max(8, Math.round(r.avg / max * 100));
    return '<div class="m-cat"><span class="ci">' + esc(c.icon) + '</span>' +
      '<div class="cm"><b>' + esc(trunc(r.name || c.name, 28)) + '</b>' +
      '<small>' + r.months + ' ' + (r.months > 1 ? 'meses' : 'mês') + ' · ' + esc(c.name) + '</small>' +
      '<div class="cbar"><i style="width:' + w + '%;background:' + PAL[i % PAL.length] + '"></i></div></div>' +
      '<strong class="down">' + C.money(r.avg) + '/mês</strong></div>';
  }

  /* ============================ TELAS ============================ */

  /* ---- INÍCIO ---- */
  function buildVisao(st) {
    var a = C.agg(st, mk()), saldo = C.runningBalance(st, mk()), patr = C.assetsTotal(st);
    var rate = a.in > 0 ? Math.round(a.net / a.in * 100) : 0;
    var chip = a.in > 0
      ? '<span class="m-chip ' + (rate >= 20 ? 'good' : rate >= 0 ? 'warn' : 'bad') + '">' + (rate >= 0 ? '🐷 ' + rate + '%' : '🚨 ' + Math.abs(rate) + '%') + '</span>'
      : '';
    var hero = '<div class="m-hero"><div class="m-hero-top"><div>' +
      '<div class="m-hero-lab">💼 Saldo atual</div>' +
      '<div class="m-hero-val num">' + C.money(saldo) + '</div>' +
      '<div class="m-hero-sub">saldo inicial + lançamentos</div></div>' + chip + '</div>' +
      '<div class="m-hero-stats">' +
      '<div><i>⬆ Entradas</i><b class="up num">' + money0(a.in) + '</b></div>' +
      '<div><i>⬇ Saídas</i><b class="down num">' + money0(a.out) + '</b></div>' +
      '<div><i>↗ Resultado</i><b class="num ' + (a.net >= 0 ? 'up' : 'down') + '">' + money0(a.net) + '</b></div>' +
      '</div>' +
      (patr > 0 ? '<div class="m-hero-patr">🏛️ Patrimônio <b class="num">' + C.money(patr) + '</b> · à parte do saldo</div>' : '') +
      '</div>';
    // Contas previstas (4 KPIs, como no desktop)
    var p = C.pendingTotals(st, mk());
    var pendMonth = C.txOfMonth(st, mk(), { pending: true }).filter(function (t) { return !t.canceled; });
    var parcelado = pendMonth.filter(function (t) { return (+t.installmentTotal > 1) || t.recurring; }).reduce(function (s, t) { return s + (+t.valor || 0); }, 0);
    var payCount = pendMonth.filter(function (t) { return t.tipo === 'despesa'; }).length;
    var recCount = pendMonth.filter(function (t) { return t.tipo === 'receita'; }).length;
    var previstas = panel('📌 Contas previstas', '<button class="act" data-go="lancamentos">Ver</button>',
      '<div class="m-kpis">' +
      kpiS('red', '📤', 'A pagar', C.money(p.out), payCount + ' compromisso(s)', 'down') +
      kpiS('green', '📥', 'A receber', C.money(p.in), recCount + ' recebimento(s)', 'up') +
      kpiS('purple', '🧮', 'Saldo previsto', C.money(p.in - p.out), 'receber − pagar', (p.in - p.out) >= 0 ? 'up' : 'down') +
      kpiS('orange', '💳', 'Total parcelado', C.money(parcelado), 'dívidas/recorrências') + '</div>', true);

    // De onde veio o dinheiro (receitas) + Para onde foi (despesas) — donut, sempre visíveis
    var inc = C.incomeBreakdown(st, mk());
    var incPanel = panel('💰 De onde veio o dinheiro', '', a.in ? donutBlock(inc, a.in) : '<div class="m-panel-empty">Sem entradas neste mês.</div>', true);
    var cats = C.categoryBreakdown(st, mk());
    var catsPanel = panel('💸 Para onde foi seu dinheiro', '<button class="act" data-go="destino">Ver tudo</button>', a.out ? donutBlock(cats, a.out) : '<div class="m-panel-empty">Sem saídas neste mês.</div>', true);

    // Principais destaques do mês (4 cards, fiel ao desktop)
    var k = mk(), pk = prevMonthKey(k), pAgg = C.agg(st, pk);
    var outTx = C.txOfMonth(st, k).filter(function (t) { return t.tipo === 'despesa' && !t.interno; });
    var top = outTx.slice().sort(function (x, y) { return (+y.valor || 0) - (+x.valor || 0); })[0];
    var small = outTx.filter(function (t) { return (+t.valor || 0) < 20; });
    var smallTot = small.reduce(function (s, t) { return s + (+t.valor || 0); }, 0);
    var econ = Math.max(0, pAgg.out - a.out);
    var dias = new Date(+k.slice(0, 4), +k.slice(5, 7), 0).getDate();
    var prevNm = C.monthName(pk).replace(/ de \d+$/, '');
    var topCat = top ? C.catById(top.cat, st) : null, topPct = (top && a.out) ? Math.round(top.valor / a.out * 100) : 0;
    var destaques = panel('💡 Principais destaques do mês', '', '<div class="m-kpis">' +
      kpiS('green', '📈', 'Você economizou', money0(econ), 'em relação a ' + prevNm, 'up') +
      kpiS('red', '👥', 'Maior gasto', top ? money0(top.valor) : '—', top ? (trunc(top.desc || topCat.name, 16) + (a.out ? ' · ' + topPct + '%' : '')) : 'sem gastos', 'down') +
      kpiS('orange', '🛒', 'Compras pequenas', String(small.length), '< R$ 20 · ' + money0(smallTot)) +
      kpiS('purple', '↗️', 'Média diária', money0(a.out / dias), 'em ' + dias + ' dias') +
      '</div>', true);

    // ♻️ Gastos recorrentes (detecção igual desktop: despesa repetida em ≥2 meses)
    var rec = C.recurring(st).slice(0, 5);
    var recMax = Math.max.apply(null, rec.map(function (r) { return r.avg; }).concat([1]));
    var recBody = rec.length
      ? '<div class="m-list">' + rec.map(function (r, i) { return recRow(st, r, recMax, i); }).join('') + '</div>'
      : '<div class="m-panel-empty">Sem recorrências detectadas ainda. Importe mais meses de extrato.</div>';
    var recPanel = panel('♻️ Gastos recorrentes', '<button class="act" data-go="transacoes">Ver todos</button>', recBody, true);
    return hero + previstas + incPanel + catsPanel + destaques + recPanel;
  }

  /* ---- TRANSAÇÕES ---- */
  function buildTransacoes(st) {
    var seg = '<div class="m-seg" id="tSeg">' +
      ['todas|Todas', 'receita|Entradas', 'despesa|Saídas'].map(function (o) {
        var p = o.split('|'); return '<button data-f="' + p[0] + '" class="' + (txFilter === p[0] ? 'on' : '') + '">' + p[1] + '</button>';
      }).join('') + '</div>';
    var list = C.txOfMonth(st, mk()).filter(function (t) { return txFilter === 'todas' || t.tipo === txFilter; });
    if (!list.length) return seg + emptyMonth();
    var byDay = {};
    list.forEach(function (t) { (byDay[t.date] = byDay[t.date] || []).push(t); });
    var html = Object.keys(byDay).sort(function (a, b) { return b.localeCompare(a); }).map(function (d) {
      var rows = '<div class="m-list">' + byDay[d].map(function (t) { return txRow(st, t); }).join('') + '</div>';
      var n = byDay[d].length;
      return panel(dateBR(d), '<span class="act" style="color:var(--mut)">' + n + ' lanç.</span>', rows);
    }).join('');
    return seg + html;
  }

  /* ---- LANÇAMENTOS (centro de gestão, fiel ao desktop) ---- */
  function buildLancamentos(st) {
    var k = mk(), p = C.pendingTotals(st, k);
    var pend = C.txOfMonth(st, k, { pending: true }).filter(function (t) { return !t.canceled; });
    var pay = pend.filter(function (t) { return t.tipo === 'despesa'; });
    var rec = pend.filter(function (t) { return t.tipo === 'receita'; });
    var confLanc = C.mtx(st, k).filter(function (t) { return !t.interno && (t.paidAt || t.status === 'pago' || t.status === 'recebido' || t.seriesId || t.manual); });
    var payConf = confLanc.filter(function (t) { return t.tipo === 'despesa'; });
    var recConf = confLanc.filter(function (t) { return t.tipo === 'receita'; });
    var todayStr = new Date().toISOString().slice(0, 10);
    var overdue = function (t) { return (t.date || '') < todayStr; };

    var head = shead('Lançamentos', 'contas previstas, parcelas e compromissos');
    // Resumo + novo lançamento
    var resumo = panel('📌 Resumo dos lançamentos', '',
      '<div class="m-note" style="margin-top:0">Base: lançamentos em aberto com vencimento em <b>' + esc(C.monthName(k)) + '</b>. O valor só entra no caixa real depois da confirmação.</div>' +
      '<button class="m-btn" data-newlanc style="margin-top:12px">＋ Novo lançamento</button>', true);
    // KPIs
    var kpis = '<div class="m-kpis">' +
      kpi('red', '📤', 'A pagar em aberto', C.money(p.out), '') +
      kpi('green', '📥', 'A receber em aberto', C.money(p.in), '') +
      kpiFull('purple', '🧮', 'Resultado previsto', C.money(p.in - p.out), 'receber − pagar') + '</div>';
    // Próximo vencimento
    var nextDue = pend.slice().sort(function (a, b) { return (a.date || '').localeCompare(b.date || ''); })[0];
    var nextCard = nextDue
      ? kpiFull('blue', '📅', 'Próximo vencimento', C.money(nextDue.valor), dateBR(nextDue.date) + ' · ' + esc(nextDue.desc || C.catById(nextDue.cat, st).name))
      : kpiFull('blue', '📅', 'Próximo vencimento', '—', 'Este mês não possui contas em aberto.');
    // Próximos 30 dias (global)
    var d30 = new Date(); var lim = new Date(d30.getFullYear(), d30.getMonth(), d30.getDate() + 30).toISOString().slice(0, 10);
    var fut = (st.tx || []).filter(function (t) { return t && t.pending && !t.canceled && (t.date || '') >= todayStr && (t.date || '') <= lim; });
    var f30in = fut.filter(function (t) { return t.tipo === 'receita'; }).reduce(function (s, t) { return s + (+t.valor || 0); }, 0);
    var f30out = fut.filter(function (t) { return t.tipo === 'despesa'; }).reduce(function (s, t) { return s + (+t.valor || 0); }, 0);
    var next30 = panel('⏱️ Próximos 30 dias', '<span class="act" style="color:var(--mut)">' + fut.length + ' venc.</span>',
      '<div class="m-next30">' +
      '<div class="ln"><span>A receber</span><b class="up">' + C.money(f30in) + '</b></div>' +
      '<div class="ln"><span>A pagar</span><b class="down">' + C.money(f30out) + '</b></div>' +
      '<div class="ln"><span>Saldo projetado (30d)</span><b class="' + ((f30in - f30out) >= 0 ? 'up' : 'down') + '">' + C.money(f30in - f30out) + '</b></div></div>', true);
    // Listas Contas a Pagar / Receber com sub-abas
    var payPanel = lancListPanel('📤 Contas a Pagar', 'Saídas previstas, aguardando confirmação.', pay, payConf, payTab, 'paytab', st, overdue);
    var recPanel = lancListPanel('📥 Contas a Receber', 'Entradas previstas, aguardando confirmação.', rec, recConf, recTab, 'rectab', st, overdue);
    // Compromissos futuros (vencimento após o mês selecionado)
    var monthEnd = k + '-31';
    var compromissos = (st.tx || []).filter(function (t) { return t && t.pending && !t.canceled && (t.date || '') > monthEnd; })
      .sort(function (a, b) { return (a.date || '').localeCompare(b.date || ''); });
    var compTot = compromissos.reduce(function (s, t) { return s + (+t.valor || 0); }, 0);
    var compBody = compromissos.length
      ? '<div class="m-list">' + compromissos.slice(0, 12).map(function (t) { return txRow(st, t); }).join('') + '</div>'
      : '<div class="m-panel-empty">Nenhum compromisso futuro após este mês.</div>';
    var compPanel = panel('📅 Compromissos futuros', compromissos.length ? '<span class="act" style="color:var(--mut)">' + C.money(compTot) + '</span>' : '', compBody);

    return head + resumo + kpis + '<div style="margin-top:14px"></div>' + nextCard + next30 + payPanel + recPanel + compPanel;
  }

  // barra de progresso da dívida (parcelas pagas da série)
  function debtBar(st, t) {
    if (!(+t.installmentTotal > 1) || !t.seriesId) return '';
    var series = (st.tx || []).filter(function (x) { return x.seriesId === t.seriesId; });
    var paid = series.filter(function (x) { return !x.pending && !x.canceled; }).length;
    var total = +t.installmentTotal || series.length || 1, pct = Math.round(paid / total * 100);
    return '<div class="m-debt" title="' + pct + '% quitado"><i style="width:' + pct + '%"></i></div>';
  }
  // linha de lançamento com ações (Paguei/Recebi · Data · Valor · Cancelar / Reabrir)
  function lancItemRow(st, t, pend) {
    var c = C.catById(t.cat, st), isIn = t.tipo === 'receita';
    var parc = (+t.installmentTotal > 1) ? ' · ' + (t.installmentIndex || 1) + '/' + t.installmentTotal : (t.recurring ? ' · recorrente' : '');
    var actions = pend
      ? '<div class="m-lancact"><button class="conf" data-conf="' + esc(t.id) + '">' + (isIn ? '✓ Recebi' : '✓ Paguei') + '</button>' +
        '<button data-editdue="' + esc(t.id) + '">📅 Data</button><button data-editval="' + esc(t.id) + '">✏️ Valor</button>' +
        '<button class="warn" data-cancelparc="' + esc(t.id) + '">✕ Cancelar</button></div>'
      : '<div class="m-lancact"><button data-undo="' + esc(t.id) + '">↩ Reabrir</button></div>';
    return '<div class="m-lanc"><div class="m-lanc-top"><span class="av">' + esc(c.icon) + '</span>' +
      '<div class="info"><b>' + esc(t.originalDesc || t.desc || c.name) + '</b><span>' + dateBR(t.date) + ' · ' + esc(c.name) + parc + (pend ? '' : ' · ' + (isIn ? 'recebido' : 'pago')) + '</span></div>' +
      '<strong class="' + (isIn ? 'up' : 'down') + '">' + C.money(t.valor) + '</strong></div>' + debtBar(st, t) + actions + '</div>';
  }
  function lancListPanel(title, sub, pendItems, confItems, tab, attr, st, overdue) {
    var aberto = pendItems.filter(function (t) { return !overdue(t); });
    var atras = pendItems.filter(overdue);
    var lbl = title.indexOf('Pagar') >= 0 ? 'Pagas' : 'Recebidas';
    var sel = tab === 'atrasadas' ? atras : tab === 'pagas' ? confItems : aberto;
    var isPend = tab !== 'pagas';
    var seg = '<div class="m-seg">' +
      '<button class="' + (tab === 'aberto' ? 'on' : '') + '" data-' + attr + '="aberto">Em aberto <b>' + aberto.length + '</b></button>' +
      '<button class="' + (tab === 'atrasadas' ? 'on' : '') + '" data-' + attr + '="atrasadas">Atrasadas <b>' + atras.length + '</b></button>' +
      '<button class="' + (tab === 'pagas' ? 'on' : '') + '" data-' + attr + '="pagas">' + lbl + ' <b>' + confItems.length + '</b></button></div>';
    var tot = pendItems.reduce(function (s, t) { return s + (+t.valor || 0); }, 0);
    var body = sel.length
      ? sel.slice().sort(function (a, b) { return (a.date || '').localeCompare(b.date || ''); }).map(function (t) { return lancItemRow(st, t, isPend); }).join('')
      : '<div class="m-panel-empty">Nenhuma conta ' + (tab === 'atrasadas' ? 'atrasada' : tab === 'pagas' ? lbl.toLowerCase() : 'em aberto') + ' neste mês.</div>';
    return panel(title, '<span class="act" style="color:var(--mut)">' + C.money(tot) + '</span>',
      '<div class="m-note" style="margin-top:0;margin-bottom:10px">' + esc(sub) + '</div>' + seg + body, true);
  }

  /* ---- GRÁFICOS (seletor de chips + 5 gráficos, fiel ao desktop) ---- */
  function buildGraficos(st) { return graphsSection(st); }
  function evoSvg(ms) {
    var W = 340, H = 180, L = 30, R = 10, T = 14, B = 30, iw = W - L - R, ih = H - T - B;
    var max = Math.max.apply(null, ms.map(function (m) { return Math.max(m.in, m.out, 1); }));
    var gap = iw / ms.length, bw = Math.min(16, gap / 3 - 1);
    var bars = '', y = function (v) { return T + ih - v / max * ih; };
    ms.forEach(function (m, i) {
      var cx = L + gap * i + gap / 2;
      var hi = ih - (y(m.in) - T), ho = ih - (y(m.out) - T);
      bars += '<rect x="' + (cx - bw - 1).toFixed(1) + '" y="' + y(m.in).toFixed(1) + '" width="' + bw + '" height="' + Math.max(1, hi).toFixed(1) + '" rx="2" fill="#22e68b"></rect>';
      bars += '<rect x="' + (cx + 1).toFixed(1) + '" y="' + y(m.out).toFixed(1) + '" width="' + bw + '" height="' + Math.max(1, ho).toFixed(1) + '" rx="2" fill="#ff416d"></rect>';
      bars += '<text x="' + cx.toFixed(1) + '" y="' + (H - 12) + '" fill="#8fa0cb" font-size="9.5" text-anchor="middle">' + C.monthShort(m.k) + '</text>';
    });
    return '<svg class="m-svg" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="xMidYMid meet">' +
      '<g font-size="9" font-weight="700"><circle cx="14" cy="10" r="3" fill="#22e68b"/><text x="20" y="13" fill="#b8c4ea">Entradas</text>' +
      '<circle cx="76" cy="10" r="3" fill="#ff416d"/><text x="82" y="13" fill="#b8c4ea">Saídas</text></g>' +
      '<line x1="' + L + '" y1="' + (T + ih) + '" x2="' + (W - R) + '" y2="' + (T + ih) + '" stroke="#1c294b"/>' + bars + '</svg>';
  }
  function multiLineSvg(series, labels) {
    var W = 340, H = 200, L = 40, R = 12, T = 30, B = 30, iw = W - L - R, ih = H - T - B;
    var allv = []; series.forEach(function (s) { (s.pts || []).forEach(function (v) { allv.push(+v || 0); }); });
    if (!allv.length) return '<div class="m-note">Sem dados para projetar.</div>';
    var max = Math.max.apply(null, allv), min = Math.min.apply(null, allv);
    if (max === min) { max += 1; min -= 1; }
    var pad = (max - min) * 0.12; max += pad; min -= pad;
    var n = labels.length;
    var x = function (i) { return L + (n <= 1 ? iw / 2 : iw * i / (n - 1)); };
    var y = function (v) { return T + ih - ((+v || 0) - min) / (max - min) * ih; };
    var g = '';
    if (min < 0 && max > 0) { var yz = y(0).toFixed(1); g += '<line x1="' + L + '" y1="' + yz + '" x2="' + (W - R) + '" y2="' + yz + '" stroke="#42527d" stroke-dasharray="3 3"/>'; }
    labels.forEach(function (lb, i) { g += '<text x="' + x(i).toFixed(1) + '" y="' + (H - 10) + '" fill="#8fa0cb" font-size="9.5" text-anchor="middle">' + esc(lb) + '</text>'; });
    series.forEach(function (s) {
      var d = (s.pts || []).map(function (v, i) { return (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(v).toFixed(1); }).join(' ');
      g += '<path d="' + d + '" fill="none" stroke="' + s.color + '" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"/>';
      (s.pts || []).forEach(function (v, i) { g += '<circle cx="' + x(i).toFixed(1) + '" cy="' + y(v).toFixed(1) + '" r="2.6" fill="' + s.color + '"/>'; });
    });
    var lg = '', lx = L;
    series.forEach(function (s) { lg += '<circle cx="' + lx + '" cy="14" r="3" fill="' + s.color + '"/><text x="' + (lx + 6) + '" y="17" fill="#b8c4ea" font-size="9" font-weight="700">' + esc(s.name) + '</text>'; lx += Math.min(98, s.name.length * 6 + 28); });
    return '<svg class="m-svg" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="xMidYMid meet">' + lg + g + '</svg>';
  }

  /* ============ GRÁFICOS — porta fiel dos 5 SVG do desktop (mobile dims) ============ */
  function grK(v) { var a = Math.abs(v), sg = v < 0 ? '-' : ''; if (a >= 1e6) return sg + (a / 1e6).toFixed(1).replace('.', ',') + 'M'; if (a >= 1000) return sg + (a / 1000).toFixed(a >= 10000 ? 0 : 1).replace('.', ',') + 'k'; return String(Math.round(v)); }
  function trunc(s, n) { s = s == null ? '' : '' + s; return s.length > n ? s.slice(0, n - 1) + '…' : s; }
  function grEmpty(msg) { return '<div class="gr-empty"><div class="gr-empty-ic">📭</div><p>' + msg + '</p></div>'; }
  var GRAPH_TABS = [['poupanca', '📈', 'Poupança'], ['projecao', '🔮', 'Projeção de caixa'], ['orcado', '🍩', 'Por categoria'], ['heatmap', '🗓️', 'Mapa de gastos'], ['composicao', '🧱', 'Composição']];

  // 1) Poupança — gauge
  function grPoupanca(st) {
    var a = C.agg(st, mk()), curK = mk();
    if (!a.in && !a.out) return grEmpty('Sem lançamentos em ' + C.monthName(curK) + ' para medir a poupança.');
    var rate = a.in > 0 ? (a.net / a.in * 100) : 0;
    var prior = C.months(st).filter(function (m) { return m.k <= curK && (m.in > 0 || m.out > 0); }), last12 = prior.slice(-12);
    var avg = last12.length ? Math.round(last12.reduce(function (s, m) { return s + (m.in > 0 ? m.net / m.in * 100 : 0); }, 0) / last12.length) : Math.round(rate);
    var trend = last12.length >= 2 ? (rate - (last12[0].in > 0 ? last12[0].net / last12[0].in * 100 : 0)) : 0;
    var W = 340, H = 212, cx = 170, cy = 162, Rr = 122, sw = 22, MIN = -20, MAX = 60;
    var clamp = function (v) { return Math.max(MIN, Math.min(MAX, v)); };
    var ang = function (v) { return 180 - ((clamp(v) - MIN) / (MAX - MIN)) * 180; };
    var pt = function (d, r) { return [cx + r * Math.cos(d * Math.PI / 180), cy - r * Math.sin(d * Math.PI / 180)]; };
    var arc = function (from, to, r, steps) { var p = ''; for (var i = 0; i <= steps; i++) { var d = from + (to - from) * i / steps, q = pt(d, r); p += (i ? 'L' : 'M') + q[0].toFixed(1) + ',' + q[1].toFixed(1); } return p; };
    var col = rate >= 20 ? '#22e68b' : rate >= 0 ? '#ffb238' : '#ff416d';
    var bg = '<path d="' + arc(180, 0, Rr, 64) + '" fill="none" stroke="#172238" stroke-width="' + sw + '" stroke-linecap="round"/>';
    var val = '<path d="' + arc(180, ang(rate), Rr, 64) + '" fill="none" stroke="' + col + '" stroke-width="' + sw + '" stroke-linecap="round"/>';
    var m1 = pt(ang(20), Rr - sw / 2 - 3), m2 = pt(ang(20), Rr + sw / 2 + 3);
    var meta = '<line x1="' + m1[0].toFixed(1) + '" y1="' + m1[1].toFixed(1) + '" x2="' + m2[0].toFixed(1) + '" y2="' + m2[1].toFixed(1) + '" stroke="#9d6bff" stroke-width="3"/><text x="' + m2[0].toFixed(1) + '" y="' + (m2[1] - 6).toFixed(1) + '" fill="#b7a2ff" font-size="10" font-weight="800" text-anchor="middle">meta 20%</text>';
    var pv = pt(ang(rate), Rr), dot = '<circle cx="' + pv[0].toFixed(1) + '" cy="' + pv[1].toFixed(1) + '" r="7" fill="' + col + '" stroke="#0b1225" stroke-width="3"/>';
    var center = '<text x="' + cx + '" y="' + (cy - 26) + '" fill="' + col + '" font-size="46" font-weight="800" text-anchor="middle">' + Math.round(rate) + '%</text><text x="' + cx + '" y="' + (cy - 2) + '" fill="#aab7df" font-size="12" text-anchor="middle">poupança · ' + C.monthShort(curK) + '</text><text x="' + cx + '" y="' + (cy + 18) + '" fill="#7e8db5" font-size="11" text-anchor="middle">resultado ' + C.money(a.net) + '</text>';
    var cls = rate >= 20 ? 'good' : rate >= 0 ? 'warn' : 'bad';
    var note = '<div class="gr-note ' + cls + '">Este mês você ' + (rate >= 0 ? 'poupou <b>' + Math.round(rate) + '%</b> das entradas' : 'gastou <b>' + Math.abs(Math.round(rate)) + '%</b> além das entradas') + '. Média dos últimos meses: <b>' + avg + '%</b> · ' + (trend >= 0 ? 'tendência de melhora ▲' : 'tendência de queda ▼') + '. A marca roxa é a meta saudável de 20%.</div>';
    return '<svg class="gr-svg" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="xMidYMid meet">' + bg + val + meta + dot + center + '</svg>' + note;
  }

  // 2) Projeção de caixa — barras agrupadas 3 cenários
  function grProjecao(st) {
    var f = C.flowForecast(st, mk()), a = f.agg, base = f.projected, oti = f.otimista, neu = f.neutro, pes = f.pessimista;
    if (!a.in && !a.out && !base) return grEmpty('Sem histórico suficiente para projetar o caixa. Importe ou registre alguns meses de movimento.');
    var all = oti.concat(neu, pes, [0]), max = Math.max.apply(null, all), min = Math.min.apply(null, all), span = Math.max(1, max - min);
    var W = 348, H = 244, L = 36, R = 10, T = 20, B = 42, iw = W - L - R, ih = H - T - B;
    var y = function (v) { return T + ih - ((v - min) / span) * ih; };
    var groupW = iw / 4, barW = 16, ig = 3;
    var grid = ''; [0, .25, .5, .75, 1].forEach(function (ff) { var vv = min + span * ff; grid += '<line x1="' + L + '" y1="' + y(vv).toFixed(1) + '" x2="' + (W - R) + '" y2="' + y(vv).toFixed(1) + '" stroke="#1c294b" stroke-dasharray="3 5"/><text x="' + (L - 5) + '" y="' + (y(vv) + 3).toFixed(1) + '" fill="#5b6b92" font-size="8.5" text-anchor="end">' + grK(vv) + '</text>'; });
    var zero = (min < 0 && max > 0) ? '<line x1="' + L + '" y1="' + y(0).toFixed(1) + '" x2="' + (W - R) + '" y2="' + y(0).toFixed(1) + '" stroke="#ff416d" stroke-width="1.3" stroke-dasharray="6 4"/>' : '';
    var SC = ['#22e68b', '#2787ff', '#ff416d'], SN = ['Otimista', 'Neutro', 'Pessimista'];
    var groups = [['Hoje', [base], ['#9d6bff'], ['Saldo de hoje']], ['30 dias', [oti[1], neu[1], pes[1]], SC, SN], ['60 dias', [oti[2], neu[2], pes[2]], SC, SN], ['90 dias', [oti[3], neu[3], pes[3]], SC, SN]];
    var bars = '';
    groups.forEach(function (grp, g) {
      var lab = grp[0], vals = grp[1], cols = grp[2], cluster = vals.length * barW + (vals.length - 1) * ig, gx = L + groupW * (g + 0.5), cs = gx - cluster / 2;
      vals.forEach(function (v, si) { var bx = cs + si * (barW + ig), yv = y(v), y0 = y(0), ry = Math.min(yv, y0), rh = Math.max(1, Math.abs(yv - y0)); bars += '<rect x="' + bx.toFixed(1) + '" y="' + ry.toFixed(1) + '" width="' + barW + '" height="' + rh.toFixed(1) + '" rx="3" fill="' + cols[si] + '"/>'; bars += '<text x="' + (bx + barW / 2).toFixed(1) + '" y="' + (v >= 0 ? ry - 3 : ry + rh + 9).toFixed(1) + '" fill="' + (v < 0 ? '#ff9bb2' : '#cbd6f5') + '" font-size="7.5" font-weight="700" text-anchor="middle">' + grK(v) + '</text>'; });
      bars += '<text x="' + gx.toFixed(1) + '" y="' + (H - 14) + '" fill="' + (g === 0 ? '#b7a2ff' : '#abb6df') + '" font-size="9.5" font-weight="' + (g === 0 ? '800' : '700') + '" text-anchor="middle">' + lab + '</text>';
    });
    var legend = '<div class="gr-legend-row"><span class="gr-leg"><i style="background:#22e68b"></i>Otimista</span><span class="gr-leg"><i style="background:#2787ff"></i>Neutro (provável)</span><span class="gr-leg"><i style="background:#ff416d"></i>Pessimista</span><span class="gr-leg"><i style="background:#9d6bff"></i>Saldo de hoje</span></div>';
    var negIdx = pes.findIndex(function (v) { return v < 0; }), cls = pes[3] < 0 ? 'bad' : neu[3] < 0 ? 'warn' : 'good';
    var txt = pes[3] < 0 ? ('No cenário <b>pessimista</b> o caixa fica negativo ' + (negIdx > 0 ? 'em ~' + (negIdx * 30) + ' dias' : 'já de início') + ' (' + C.money(pes[3]) + ' em 90d).') : neu[3] < 0 ? ('No cenário <b>neutro</b> o caixa tende a ' + C.money(neu[3]) + ' em 90 dias — atenção.') : ('Projeção saudável: mesmo no pessimista o caixa fica em ' + C.money(pes[3]) + ' em 90 dias.');
    return '<svg class="gr-svg" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="xMidYMid meet">' + grid + zero + bars + '</svg>' + legend + '<div class="gr-note ' + cls + '">Começa no <b>saldo de hoje</b> (' + C.money(base) + ', já com previstos do mês) e projeta 30/60/90 dias em 3 cenários pela sua média de 6 meses. ' + txt + '</div>';
  }

  // 3) Por categoria — anéis (donut por categoria)
  function grOrcado(st) {
    var cb = C.categoryBreakdown(st, mk());
    if (!cb.length) return grEmpty('Sem despesas lançadas neste mês para mostrar por categoria.');
    var total = cb.reduce(function (a, r) { return a + r.value; }, 0) || 1, curK = mk();
    var prior = C.months(st).filter(function (m) { return m.k < curK; });
    function avgOf(id) { var vals = prior.map(function (m) { var s = 0; C.categoryBreakdown(st, m.k).forEach(function (r) { if (r.cat.id === id) s = r.value; }); return s; }).filter(function (v) { return v > 0; }); return vals.length ? vals.reduce(function (a, b) { return a + b; }, 0) / vals.length : null; }
    var rows = cb.slice(0, 8).map(function (r) { var avg = avgOf(r.cat.id); return { c: r.cat, s: r.value, share: r.value / total * 100, vs: (avg != null && avg > 0) ? (r.value / avg - 1) * 100 : null }; });
    var ring = function (r, i) {
      var Rr = 30, Cc = 2 * Math.PI * Rr, p = Math.min(100, Math.max(4, r.share)), off = Cc * (1 - p / 100), col = PAL[i % PAL.length];
      var tag = r.vs == null ? '<span class="gr-ring-tag new">novo</span>' : r.vs > 8 ? '<span class="gr-ring-tag up">▲ ' + Math.round(r.vs) + '%</span>' : r.vs < -8 ? '<span class="gr-ring-tag down">▼ ' + Math.abs(Math.round(r.vs)) + '%</span>' : '<span class="gr-ring-tag flat">≈ média</span>';
      return '<div class="gr-ring-card vivid" style="--rc:' + col + '"><svg viewBox="0 0 72 72" class="gr-ring"><circle cx="36" cy="36" r="' + Rr + '" fill="none" stroke="rgba(255,255,255,.08)" stroke-width="8"/><circle cx="36" cy="36" r="' + Rr + '" fill="none" stroke="' + col + '" stroke-width="8" stroke-linecap="round" stroke-dasharray="' + Cc.toFixed(1) + '" stroke-dashoffset="' + off.toFixed(1) + '" transform="rotate(-90 36 36)"/><text x="36" y="34" text-anchor="middle" font-size="15" font-weight="800" fill="' + col + '">' + Math.round(r.share) + '%</text><text x="36" y="48" text-anchor="middle" font-size="8" fill="#9fb0de">do total</text></svg><div class="gr-ring-name">' + esc(r.c.icon) + ' ' + esc(trunc(r.c.name, 14)) + '</div><div class="gr-ring-val">' + C.money(r.s) + '</div>' + tag + '</div>';
    };
    var top = rows[0], subiu = rows.filter(function (r) { return r.vs != null && r.vs > 15; });
    var note = '<div class="gr-note">Lido direto dos seus <b>lançamentos/OFX</b>. O anel é a fatia da categoria no total de despesas do mês; a etiqueta compara com a sua <b>média dos meses anteriores</b>. ' + (top ? 'Maior gasto: <b>' + esc(top.c.name) + '</b> (' + C.money(top.s) + ').' : '') + (subiu.length ? ' Acima do normal: <b>' + subiu.map(function (r) { return esc(r.c.name); }).join(', ') + '</b>.' : '') + '</div>';
    return '<div class="gr-rings">' + rows.map(function (r, i) { return ring(r, i); }).join('') + '</div>' + note;
  }

  // 4) Mapa de gastos — heatmap do mês
  function grHeatmap(st) {
    var yy = view.getFullYear(), mm = view.getMonth(), dim = new Date(yy, mm + 1, 0).getDate();
    var outs = C.txOfMonth(st, mk()).filter(function (t) { return t.tipo === 'despesa' && !t.interno; });
    if (!outs.length) return grEmpty('Sem despesas neste mês para o mapa de calor.');
    var dayOut = []; for (var z = 0; z <= dim; z++) dayOut.push(0);
    outs.forEach(function (t) { var d = +(t.date || '').slice(8, 10); if (d >= 1 && d <= dim) dayOut[d] += (+t.valor || 0); });
    var max = Math.max.apply(null, dayOut.slice(1).concat([0])), monthTotal = dayOut.reduce(function (a, b) { return a + b; }, 0), activeDays = dayOut.slice(1).filter(function (v) { return v > 0; }).length;
    var wdNames = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'], wdTot = [0, 0, 0, 0, 0, 0, 0];
    for (var d = 1; d <= dim; d++) wdTot[new Date(yy, mm, d).getDay()] += dayOut[d];
    var W = 348, gap = 5, cw = (W - 6 * gap) / 7, chh = 44, top = 22, cells = [], row = 0;
    for (var d3 = 1; d3 <= dim; d3++) { var wd = new Date(yy, mm, d3).getDay(); if (d3 > 1 && wd === 0) row++; cells.push({ d: d3, wd: wd, row: row }); }
    var gridBottom = top + (row + 1) * (chh + gap), topDay = dayOut.indexOf(max), maxWdIdx = wdTot.indexOf(Math.max.apply(null, wdTot));
    var svg = wdNames.map(function (n, i) { return '<text x="' + (i * (cw + gap) + cw / 2).toFixed(1) + '" y="14" fill="#8fa0cb" font-size="9.5" font-weight="800" text-anchor="middle">' + n + '</text>'; }).join('');
    cells.forEach(function (o) {
      var cx = o.wd * (cw + gap), cy = top + o.row * (chh + gap), v = dayOut[o.d], f = max > 0 ? v / max : 0, isTop = o.d === topDay && v > 0;
      var bgc = v > 0 ? 'rgba(255,65,109,' + (0.10 + f * 0.62).toFixed(2) + ')' : 'rgba(255,255,255,.025)', bd = isTop ? '#ffd54a' : (v > 0 ? 'rgba(255,65,109,' + (0.30 + f * 0.5).toFixed(2) + ')' : 'rgba(255,255,255,.08)');
      svg += '<rect x="' + cx.toFixed(1) + '" y="' + cy.toFixed(1) + '" width="' + cw.toFixed(1) + '" height="' + chh + '" rx="9" fill="' + bgc + '" stroke="' + bd + '" stroke-width="' + (isTop ? 2 : 1) + '"/><text x="' + (cx + 6).toFixed(1) + '" y="' + (cy + 16).toFixed(1) + '" fill="#dbe3ff" font-size="10.5" font-weight="800">' + String(o.d).padStart(2, '0') + '</text>' + (v > 0 ? '<text x="' + (cx + 6).toFixed(1) + '" y="' + (cy + 31).toFixed(1) + '" fill="#ffc2d0" font-size="8.5" font-weight="700">' + grK(v) + '</text>' : '');
    });
    var H = gridBottom + 6;
    var sw = [0.12, 0.30, 0.48, 0.66, 0.82].map(function (a) { return '<i style="background:rgba(255,65,109,' + a + ')"></i>'; }).join('');
    var legend = '<div class="gr-heat-legend"><span>menos</span>' + sw + '<span>mais</span><span class="gr-heat-top">▣ dia mais pesado</span></div>';
    var topWd = wdNames[maxWdIdx], avgDay = activeDays ? monthTotal / activeDays : 0;
    var note = '<div class="gr-note">Total gasto no mês: <b>' + C.money(monthTotal) + '</b> em <b>' + activeDays + '</b> dia(s) com movimento (≈ ' + C.money(avgDay) + '/dia ativo). Dia mais pesado: <b>' + String(topDay).padStart(2, '0') + '</b> (' + C.money(max) + ', contornado em dourado) · você costuma gastar mais às <b>' + topWd + '</b>.</div>';
    return '<svg class="gr-svg" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="xMidYMid meet">' + svg + '</svg>' + legend + note;
  }

  // 5) Composição — barras empilhadas por categoria no tempo
  function grComposicao(st) {
    var curK = mk(), ms = C.months(st).filter(function (m) { return m.out > 0 && m.k <= curK; }).slice(-6);
    if (ms.length < 2) return grEmpty('Sem meses suficientes com despesas para mostrar a composição ao longo do tempo.');
    var monthCat = ms.map(function (m) { var by = {}; C.categoryBreakdown(st, m.k).forEach(function (r) { by[r.cat.id] = r.value; }); return { k: m.k, by: by, out: m.out }; });
    var totalBy = {}; monthCat.forEach(function (mc) { Object.keys(mc.by).forEach(function (id) { totalBy[id] = (totalBy[id] || 0) + mc.by[id]; }); });
    var topIds = Object.keys(totalBy).sort(function (x, y) { return totalBy[y] - totalBy[x]; }).slice(0, 5);
    var W = 348, H = 238, L = 34, R = 10, T = 16, B = 40, iw = W - L - R, ih = H - T - B, maxOut = Math.max.apply(null, monthCat.map(function (mc) { return mc.out; }).concat([1]));
    var gap = iw / monthCat.length, bw = Math.min(46, gap - 12), y = function (v) { return T + ih - (v / maxOut) * ih; };
    var grid = ''; [0, .5, 1].forEach(function (ff) { grid += '<line x1="' + L + '" y1="' + y(maxOut * ff).toFixed(1) + '" x2="' + (W - R) + '" y2="' + y(maxOut * ff).toFixed(1) + '" stroke="#1c294b" stroke-dasharray="3 5"/><text x="' + (L - 5) + '" y="' + (y(maxOut * ff) + 3).toFixed(1) + '" fill="#5b6b92" font-size="8.5" text-anchor="end">' + grK(maxOut * ff) + '</text>'; });
    var bars = ''; monthCat.forEach(function (mc, i) {
      var cx = L + gap * i + gap / 2, bx = cx - bw / 2, acc = 0;
      topIds.forEach(function (id, ci) { var v = mc.by[id] || 0; if (v <= 0) return; var h = (v / maxOut) * ih; bars += '<rect x="' + bx.toFixed(1) + '" y="' + y(acc + v).toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + h.toFixed(1) + '" fill="' + PAL[ci % PAL.length] + '"/>'; acc += v; });
      var known = topIds.reduce(function (s, id) { return s + (mc.by[id] || 0); }, 0), other = Math.max(0, mc.out - known);
      if (other > 0) { var h2 = (other / maxOut) * ih; bars += '<rect x="' + bx.toFixed(1) + '" y="' + y(acc + other).toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + h2.toFixed(1) + '" fill="#3a4a6b"/>'; }
      bars += '<text x="' + cx.toFixed(1) + '" y="' + (H - 14) + '" fill="#abb6df" font-size="9.5" text-anchor="middle">' + C.monthShort(mc.k) + '</text>';
    });
    var legend = topIds.map(function (id, ci) { return '<span class="gr-leg"><i style="background:' + PAL[ci % PAL.length] + '"></i>' + esc(trunc(C.catById(id, st).name, 16)) + '</span>'; }).join('') + '<span class="gr-leg"><i style="background:#3a4a6b"></i>Outros</span>';
    var f0 = monthCat[0], f1 = monthCat[monthCat.length - 1], c1 = topIds[0], v0 = f0.by[c1] || 0, v1 = f1.by[c1] || 0, nm = C.catById(c1, st).name;
    var grow = v0 > 0 ? ('A maior categoria (' + esc(nm) + ') foi de ' + C.money(v0) + ' para ' + C.money(v1) + ' (' + (v1 >= v0 ? '+' : '') + Math.round((v1 / v0 - 1) * 100) + '%) entre ' + C.monthShort(f0.k) + ' e ' + C.monthShort(f1.k) + '.') : 'Acompanhe como o peso de cada categoria evolui mês a mês.';
    return '<svg class="gr-svg" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="xMidYMid meet">' + grid + bars + '</svg><div class="gr-legend-row">' + legend + '</div><div class="gr-note">Cada barra é o total de despesas do mês, empilhado pelas maiores categorias. ' + grow + '</div>';
  }

  function graphsSection(st) {
    var chips = '<div class="gr-tabs">' + GRAPH_TABS.map(function (t) { return '<button class="gr-tab' + (graphTab === t[0] ? ' active' : '') + '" data-graph="' + t[0] + '">' + t[1] + ' ' + t[2] + '</button>'; }).join('') + '</div>';
    var body;
    if (C.txOfMonth(st, mk()).length === 0) body = grEmpty('Sem lançamentos em <b>' + esc(C.monthName(mk())) + '</b>. Selecione um mês com movimentações para ver os gráficos.');
    else { try { body = graphTab === 'projecao' ? grProjecao(st) : graphTab === 'orcado' ? grOrcado(st) : graphTab === 'heatmap' ? grHeatmap(st) : graphTab === 'composicao' ? grComposicao(st) : grPoupanca(st); } catch (e) { body = grEmpty('Não foi possível montar este gráfico agora. Seus dados estão preservados.'); } }
    var intro = '<div class="gr-intro">Visualizações para decisão — atualizam automaticamente conforme seus lançamentos e o mês selecionado.</div>';
    return panel('📊 Gráficos', '', intro + chips + body, true);
  }

  /* donut de composição (De onde veio / Para onde foi) */
  function donutBlock(items, total) {
    if (!total || !items.length) return '<div class="m-panel-empty">Sem dados neste mês.</div>';
    var top = items.slice(0, 5), sumTop = top.reduce(function (s, r) { return s + r.value; }, 0);
    var outros = Math.max(0, total - sumTop);
    var parts = top.map(function (r, i) { return { v: r.value, col: PAL[i % PAL.length] }; });
    if (outros > 0.005) parts.push({ v: outros, col: '#3a4a6b' });
    var R = 44, Cc = 2 * Math.PI * R, off = 0;
    var segs = parts.map(function (p) { var len = p.v / total * Cc; var s = '<circle cx="58" cy="58" r="' + R + '" fill="none" stroke="' + p.col + '" stroke-width="15" stroke-dasharray="' + len.toFixed(1) + ' ' + (Cc - len).toFixed(1) + '" stroke-dashoffset="' + (-off).toFixed(1) + '" transform="rotate(-90 58 58)"/>'; off += len; return s; }).join('');
    var svg = '<svg viewBox="0 0 116 116" width="108" height="108">' + segs + '<text x="58" y="53" text-anchor="middle" font-size="9" fill="#9fb0de">total</text><text x="58" y="70" text-anchor="middle" font-size="12.5" font-weight="800" fill="#eef3ff">' + grK(total) + '</text></svg>';
    var leg = top.map(function (r, i) { return '<span class="gr-leg"><i style="background:' + PAL[i % PAL.length] + '"></i>' + esc(r.cat.icon) + ' ' + esc(trunc(r.cat.name, 15)) + ' · ' + Math.round(r.value / total * 100) + '%</span>'; }).join('') +
      (outros > 0.005 ? '<span class="gr-leg"><i style="background:#3a4a6b"></i>Outros · ' + Math.round(outros / total * 100) + '%</span>' : '');
    return '<div class="m-donut-wrap">' + svg + '<div class="m-donut-leg">' + leg + '</div></div>';
  }

  /* linha do tempo do fluxo (saldo acumulado dia a dia) */
  function flowTimeline(st, k) {
    var txs = C.mtx(st, k).filter(function (t) { return !t.interno; }).sort(function (a, b) { return (a.date || '').localeCompare(b.date || ''); });
    if (!txs.length) return panel('📆 Linha do tempo do mês', '', '<div class="m-panel-empty">Sem movimentações neste mês.</div>', true);
    var start = C.runningBalance(st, k) - C.agg(st, k).net;
    var byDay = {};
    txs.forEach(function (t) { var o = byDay[t.date] = byDay[t.date] || { in: 0, out: 0, n: 0 }; if (t.tipo === 'receita') o.in += (+t.valor || 0); else o.out += (+t.valor || 0); o.n++; });
    var acc = start, rows = '';
    Object.keys(byDay).sort().forEach(function (d) {
      var o = byDay[d]; acc += o.in - o.out; var dd = new Date(d + 'T00:00:00');
      rows += '<div class="m-tl-row"><div class="d"><b>' + dd.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) + '</b><small>' + dd.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '') + '</small></div>' +
        '<div class="mv">' + (o.in ? '<span class="up">↑ ' + grK(o.in) + '</span> ' : '') + (o.out ? '<span class="down">↓ ' + grK(o.out) + '</span> ' : '') + '· ' + o.n + ' mov</div>' +
        '<strong class="acc ' + (acc >= 0 ? 'up' : 'down') + '">' + C.money(acc) + '</strong></div>';
    });
    var mini = '<div class="m-tl-mini"><span>Inicial: <b>' + C.money(start) + '</b></span><span>' + txs.length + ' mov</span><span>Final: <b>' + C.money(acc) + '</b></span></div>';
    return panel('📆 Linha do tempo do mês', '', mini + '<div class="m-tl">' + rows + '</div>', true);
  }

  /* evolução do patrimônio (área) */
  function patrEvoSvg(series) {
    if (series.length < 2) return '<div class="m-panel-empty">Atualize seus bens em meses diferentes para ver a evolução ao longo do tempo.</div>';
    var W = 340, H = 168, L = 36, R = 12, T = 14, B = 26, iw = W - L - R, ih = H - T - B;
    var vals = series.map(function (s) { return s.total; });
    var max = Math.max.apply(null, vals), min = Math.min.apply(null, vals); if (max === min) { max += 1; min -= 1; }
    var pad = (max - min) * 0.1; max += pad; min = Math.max(0, min - pad);
    var n = series.length, x = function (i) { return L + (n <= 1 ? iw / 2 : iw * i / (n - 1)); }, y = function (v) { return T + ih - ((v - min) / (max - min)) * ih; };
    var line = series.map(function (s, i) { return (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(s.total).toFixed(1); }).join(' ');
    var area = line + ' L' + x(n - 1).toFixed(1) + ' ' + (T + ih) + ' L' + x(0).toFixed(1) + ' ' + (T + ih) + ' Z';
    var labels = series.map(function (s, i) { return '<text x="' + x(i).toFixed(1) + '" y="' + (H - 9) + '" fill="#8fa0cb" font-size="9" text-anchor="middle">' + C.monthShort(s.k) + '</text>'; }).join('');
    var dots = series.map(function (s, i) { return '<circle cx="' + x(i).toFixed(1) + '" cy="' + y(s.total).toFixed(1) + '" r="2.6" fill="#9d6bff"/>'; }).join('');
    return '<svg class="m-svg" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="xMidYMid meet"><path d="' + area + '" fill="rgba(124,77,255,.14)"/><path d="' + line + '" fill="none" stroke="#9d6bff" stroke-width="2.4" stroke-linejoin="round"/>' + dots + labels + '</svg>';
  }

  /* ---- FLUXO DE CAIXA ---- */
  function buildFluxo(st) {
    var f = C.flowForecast(st, mk()), ind = C.flowIndicators(st, mk());
    var head = shead('Fluxo de Caixa', 'projeção e indicadores');
    var kpis = '<div class="m-kpis">' +
      kpi('blue', '💼', 'Saldo realizado', C.money(f.realEnd)) +
      kpi('purple', '🔮', 'Saldo projetado', C.money(f.projected), f.projected >= 0 ? 'up' : 'down') +
      kpi('green', '📥', 'A receber', C.money(f.pendIn)) +
      kpi('red', '📤', 'A pagar', C.money(f.pendOut)) + '</div>';
    var scen = panel('🔮 Projeção de caixa', '', grProjecao(st), true);
    var stats = '<div class="m-h2">Indicadores do mês</div><div class="m-stats">' +
      statTile('Taxa de poupança', ind.rate + '%', ind.rate >= 0 ? 'up' : 'down', 'resultado ÷ entradas') +
      statTile('Ticket médio (saída)', C.money(ind.ticket), '', 'por lançamento') +
      statTile('Maior entrada', ind.maxIn ? C.money(ind.maxIn.valor) : '—', 'up', ind.maxIn ? (ind.maxIn.desc || '') : '') +
      statTile('Maior saída', ind.maxOut ? C.money(ind.maxOut.valor) : '—', 'down', ind.maxOut ? (ind.maxOut.desc || '') : '') +
      statTile('Dia de maior gasto', ind.maxDay ? ('Dia ' + ind.maxDay) : '—', '', ind.maxDayVal ? C.money(ind.maxDayVal) : '') +
      statTile('Dias sem movimento', String(ind.noMove), '', 'de ' + ind.dim + ' dias') + '</div>';
    return head + kpis + scen + stats + flowTimeline(st, mk());
  }

  /* ---- CATEGORIAS (CRUD) ---- */
  function buildCategorias(st) {
    var cats = C.allCats(st);
    var head = shead('Categorias', cats.length + ' categorias', { add: 'data-cat-add', addLabel: 'Categoria' });
    var rows = cats.map(function (c) {
      var base = C.isBaseCat(c.id), uso = C.catUsage(st, c.id);
      var typ = c.type === 'receita' ? 'Receita' : (c.type === 'despesa' ? 'Despesa' : 'Geral');
      var btns = base ? '' : '<div class="m-rowbtns"><button class="danger" data-cat-del="' + esc(c.id) + '" data-cat-uso="' + uso + '">🗑️ Excluir</button></div>';
      return '<div class="m-item"><div class="m-item-top"><span class="av">' + esc(c.icon) + '</span>' +
        '<div class="nm"><b>' + esc(c.name) + '</b><span>' + typ + ' · ' + (base ? 'base' : 'personalizada') + ' · ' + uso + ' lanç.</span></div>' +
        (base ? '<span class="m-chip">base</span>' : '') + '</div>' + btns + '</div>';
    }).join('');
    return head + rows;
  }

  /* ---- METAS (CRUD) ---- */
  function buildMetas(st) {
    var goals = st.goals || [];
    var head = shead('Metas', goals.length + ' meta(s)', { add: 'data-goal-add', addLabel: 'Meta' });
    if (!goals.length) return head + '<div class="m-empty"><div class="e">🎯</div>Nenhuma meta ainda.<br>Crie sua primeira meta de poupança.</div>';
    var rows = goals.map(function (g) {
      var pct = C.goalPct(g), done = C.goalDone(g);
      return '<div class="m-item"><div class="m-item-top"><span class="av">' + (done ? '🏆' : '🎯') + '</span>' +
        '<div class="nm"><b>' + esc(g.name || 'Meta') + '</b><span>' + C.money(g.current || 0) + ' de ' + C.money(g.target || 0) + (g.deadline ? ' · até ' + dateBR(g.deadline) : '') + '</span></div>' +
        '<span class="amt ' + (done ? 'up' : '') + '">' + pct + '%</span></div>' +
        '<div class="m-prog"><i style="width:' + pct + '%"></i></div>' +
        '<div class="m-rowbtns"><button data-goal-edit="' + esc(g.id) + '">✏️ Editar</button><button class="danger" data-goal-del="' + esc(g.id) + '">🗑️ Excluir</button></div></div>';
    }).join('');
    return head + rows;
  }

  /* ---- ANÁLISES (fiel ao desktop: banner + grade de insight cards) ---- */
  function buildAnalises(st) {
    var head = shead('Análises', C.monthName(mk()));
    var dl = C.dailyLimit(st, mk());
    var banner = '<div class="m-banner"><div class="bic">📅</div><div class="bbd">' +
      '<b>Limite sugerido: ' + C.money(dl.teto) + '/dia</b>' +
      '<span>Seu gasto médio atual é ' + C.money(dl.medio) + '/dia.</span></div></div>';
    var anhead = '<div class="m-anhead"><span class="ic">🔍</span>ANÁLISE AUTOMÁTICA</div>';
    var ins = C.insights(st, mk());
    var grid = ins.length
      ? '<div class="insights">' + ins.map(function (o) {
          return '<div class="insight ' + o.tone + '"><span class="i-ic">' + o.icon + '</span><div><b>' + esc(o.title) + '</b><p>' + esc(o.text) + '</p></div></div>';
        }).join('') + '</div>'
      : '<div class="insight good"><span class="i-ic">💡</span><div><b>Sem dados suficientes</b><p>Importe OFX/CSV/PDF ou confirme lançamentos para ver alertas automáticos.</p></div></div>';
    return head + banner + anhead + grid;
  }

  /* ---- RELATÓRIOS E GRÁFICOS (hub financeiro + 5 gráficos, fiel ao desktop) ---- */
  function repRow(bg, ic, title, desc, act) {
    return '<button class="rep-row" data-rep="' + act + '"><span class="ic" style="background:' + bg + '">' + ic + '</span>' +
      '<span class="bd"><b>' + esc(title) + '</b><p>' + esc(desc) + '</p></span><i class="chev">›</i></button>';
  }
  // tabela DRE (reutilizada inline e no sheet)
  function dreTable(st) {
    var dre = C.dreYear(st, repYear);
    var rows = '<div class="m-dre"><div class="m-dre-row head"><span class="mn">Mês</span><span class="v">Entradas</span><span class="v">Saídas</span><span class="v">Result.</span></div>';
    if (!dre.rows.length) rows += '<div class="m-dre-row"><span class="mn">Sem dados</span><span class="v">—</span><span class="v">—</span><span class="v">—</span></div>';
    dre.rows.forEach(function (r) {
      var mn = C.monthName(r.k).replace(' de ' + repYear, '');
      rows += '<div class="m-dre-row"><span class="mn">' + esc(mn) + '</span><span class="v up">' + C.compact(r.in) + '</span><span class="v down">' + C.compact(r.out) + '</span><span class="v ' + (r.net >= 0 ? 'up' : 'down') + '">' + C.compact(r.net) + '</span></div>';
    });
    rows += '<div class="m-dre-row tot"><span class="mn">Total ' + repYear + '</span><span class="v up">' + C.compact(dre.total.in) + '</span><span class="v down">' + C.compact(dre.total.out) + '</span><span class="v ' + (dre.total.net >= 0 ? 'up' : 'down') + '">' + C.compact(dre.total.net) + '</span></div></div>';
    return { html: rows, total: dre.total };
  }
  // RELATÓRIOS E DRE — modelos de relatório (DRE inline + atalhos). SEM gráficos (esses ficam na aba Gráficos).
  function buildRelatorios(st) {
    var yrs = C.years(st);
    if (yrs.indexOf(repYear) < 0) repYear = yrs[0];
    var head = shead('Relatórios e DRE', 'demonstrativo de resultado e relatórios');
    var tools = '<div class="rep-tools"><select class="m-input" id="repYear">' +
      yrs.map(function (y) { return '<option' + (y === repYear ? ' selected' : '') + '>' + y + '</option>'; }).join('') +
      '</select><button class="rep-csv" data-rep="dre-csv">⬇ Exportar DRE CSV</button></div>';
    var rows =
      repRow('rgba(124,77,255,.2)', '📄', 'DRE — Demonstrativo de Resultado', 'Receitas, despesas e resultado por mês.', 'dre') +
      repRow('rgba(255,178,56,.2)', '📅', 'Resumo anual', 'Entradas × saídas mês a mês do ano.', 'resumo') +
      repRow('rgba(34,230,139,.2)', '🏷️', 'Gastos por categoria', 'Ranking de quanto cada categoria consumiu.', 'gastos');
    var repPanel = panel('Relatórios financeiros', '', tools + rows, true);
    return head + repPanel;
  }
  // DRE em bottom-sheet
  function openDRE(st) {
    var dt = dreTable(st);
    openSheet(sheetHead('DRE ' + repYear) + dt.html +
      '<div class="m-note" style="margin-top:12px">Entradas <b>' + C.money(dt.total.in) + '</b> · Saídas <b>' + C.money(dt.total.out) + '</b> · Resultado <b>' + C.money(dt.total.net) + '</b></div>' +
      '<button class="m-btn ghost" data-rep="dre-csv" style="margin-top:14px">⬇ Exportar CSV</button>');
  }
  // Resumo anual (gráfico) em bottom-sheet
  function openResumo(st) {
    var ms = C.months(st).filter(function (m) { return m.k.slice(0, 4) === repYear; });
    openSheet(sheetHead('Resumo anual ' + repYear) +
      (ms.length ? evoSvg(ms.slice(-12)) : '<div class="m-panel-empty">Sem movimento em ' + repYear + '.</div>') +
      '<div class="m-note" style="margin-top:12px">Entradas × saídas mês a mês de ' + repYear + '.</div>');
  }
  function exportDreCsv(st) {
    var dre = C.dreYear(st, repYear), lines = ['Mês;Entradas;Saídas;Resultado'];
    dre.rows.forEach(function (r) { lines.push(C.monthName(r.k) + ';' + (r.in).toFixed(2) + ';' + (r.out).toFixed(2) + ';' + (r.net).toFixed(2)); });
    lines.push('Total ' + repYear + ';' + dre.total.in.toFixed(2) + ';' + dre.total.out.toFixed(2) + ';' + dre.total.net.toFixed(2));
    var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8' }));
    a.download = 'mrfinance-dre-' + repYear + '.csv'; a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000); toast('DRE exportado');
  }

  /* ---- PARA ONDE FOI ---- */
  function buildDestino(st) {
    var head = shead('Para onde foi', 'de onde veio · para onde foi');
    var a = C.agg(st, mk()), total = a.out || 1;
    // "De onde veio" e "Para onde foi" exibidos do MESMO jeito (lista de barras via catRow)
    var inc = C.incomeBreakdown(st, mk());
    var incBody = inc.length ? inc.map(function (r, i) { return catRow(r, a.in || 1, i); }).join('') : '<div class="m-panel-empty">Sem entradas neste mês.</div>';
    var incPanel = panel('💰 De onde veio o dinheiro', '', incBody);
    var cats = C.categoryBreakdown(st, mk());
    var catBody = cats.length ? cats.map(function (r, i) { return catRow(r, total, i); }).join('') : '<div class="m-panel-empty">Sem saídas neste mês.</div>';
    var catPanel = panel('💸 Para onde foi seu dinheiro', '', catBody);
    var ben = C.beneficiaryRanking(st, mk()), benHtml = '';
    if (ben.length) {
      var benBody = '<div class="m-list">' + ben.slice(0, 10).map(function (r, i) {
        return '<div class="m-row"><span class="av">' + (i + 1) + '</span><div class="info"><b>' + esc(r.name) + '</b><span>' + Math.round(r.value / total * 100) + '% das saídas</span></div><strong class="down">' + C.money(r.value) + '</strong></div>';
      }).join('') + '</div>';
      benHtml = panel('Maiores destinos', '', benBody);
    }
    return head + incPanel + catPanel + benHtml;
  }

  /* ---- CONCILIAÇÃO (fiel-possível: movimento confirmado ↔ banco) ---- */
  function movRow(st, t, withConcilBtn) {
    var c = C.catById(t.cat, st), isIn = t.tipo === 'receita';
    var bank = t.account ? C.getBanks(true).find(function (b) { return b.id === t.account; }) : null;
    var right = '<span class="amt ' + (isIn ? 'up' : 'down') + '">' + (isIn ? '+' : '−') + C.money(t.valor) + '</span>' +
      (withConcilBtn ? '<button class="mconc" data-concil="' + esc(t.id) + '">Conciliar</button>'
        : '<span class="mbank">🏦 ' + esc(bank ? bank.name : '—') + '</span>');
    return '<div class="m-mov" data-movtext="' + esc(((t.desc || c.name) + ' ' + dateBR(t.date)).toLowerCase()) + '">' +
      '<div class="mi"><b>' + esc(t.desc || c.name) + '</b><small>' + dateBR(t.date) + ' · ' + esc(c.name) +
      ' <span class="m-tchip ' + (isIn ? 'in' : 'out') + '">' + (isIn ? '↑ ENTRADA' : '↓ SAÍDA') + '</span></small></div>' +
      '<div class="mr">' + right + '</div></div>';
  }
  function buildConciliacao(st) {
    var head = shead('Conciliação Financeira', 'movimentos × contas de banco');
    var k = mk();
    var confirmed = C.mtx(st, k).filter(function (t) { return !t.interno; });
    var withAcct = confirmed.filter(function (t) { return t.account; });
    var without = confirmed.filter(function (t) { return !t.account; });
    var abs = function (arr) { return arr.reduce(function (s, t) { return s + Math.abs(+t.valor || 0); }, 0); };
    var importTot = abs(confirmed), concilTot = abs(withAcct), pendTot = abs(without);
    var rate = importTot > 0 ? Math.round(concilTot / importTot * 100) : 0;
    var recC = withAcct.filter(function (t) { return t.tipo === 'receita'; }).reduce(function (s, t) { return s + (+t.valor || 0); }, 0);
    var despC = withAcct.filter(function (t) { return t.tipo === 'despesa'; }).reduce(function (s, t) { return s + (+t.valor || 0); }, 0);
    var fluxo = C.runningBalance(st, k), cons = C.banksConsolidated(st, k), diff = cons.total - fluxo;

    var intro = '<div class="m-note" style="margin-top:0">Compare suas movimentações com as contas de banco e evite saldos órfãos. <b>No mobile, conciliar = atribuir um movimento confirmado a um banco</b>; o que fica sem banco gera a diferença para o fluxo.</div>';
    var kpis = '<div class="m-kpis">' +
      kpiS('purple', '📥', 'Total movimentado', C.money(importTot), confirmed.length + ' movimentação(ões)') +
      kpiS('green', '✅', 'Conciliado', C.money(concilTot), withAcct.length + ' com banco', 'up') +
      kpiS('red', '⏳', 'Pendentes', C.money(pendTot), without.length + ' sem banco', without.length ? 'down' : '') +
      kpiS('blue', '📊', 'Taxa de conciliação', rate + '%', rate >= 100 ? 'tudo conciliado' : 'atenção', rate >= 100 ? 'up' : '') +
      kpiS('cyan', '🧾', 'Conciliado (líquido)', C.money(recC - despC), 'rec ' + C.money(recC) + ' · desp ' + C.money(despC)) +
      kpiS('orange', '⚖️', 'Diferença p/ o fluxo', C.money(diff), Math.abs(diff) < 0.01 ? 'conciliado' : without.length + ' ajuste(s)', Math.abs(diff) < 0.01 ? 'up' : 'down') + '</div>';

    var tabs = '<div class="m-seg">' +
      '<button class="' + (concilTab === 'pendencias' ? 'on' : '') + '" data-conciltab="pendencias">Pendências <b>' + without.length + '</b></button>' +
      '<button class="' + (concilTab === 'conciliadas' ? 'on' : '') + '" data-conciltab="conciliadas">Conciliadas <b>' + withAcct.length + '</b></button></div>';
    var sel = (concilTab === 'conciliadas' ? withAcct : without).slice().sort(function (a, b) { return (b.date || '').localeCompare(a.date || ''); });
    var search = '<div class="m-searchwrap"><input class="m-input" id="concilSearch" placeholder="🔎 Buscar movimentações…"></div>';
    var listBody = sel.length
      ? search + sel.slice(0, 40).map(function (t) { return movRow(st, t, concilTab === 'pendencias'); }).join('') +
      (sel.length > 40 ? '<div class="m-panel-empty">Mostrando 40 de ' + sel.length + ' — use a busca para filtrar.</div>' : '')
      : '<div class="m-panel-empty">' + (concilTab === 'pendencias' ? 'Nenhuma movimentação pendente. Tudo atribuído a um banco. ✅' : 'Nenhuma movimentação conciliada ainda.') + '</div>';
    var listPanel = panel('🏦 Movimentações do mês', concilTab === 'pendencias' ? '<span class="act" style="color:var(--mut)">' + without.length + ' pendentes</span>' : '', tabs + listBody, true);

    var acoes = panel('⚡ Ações rápidas', '',
      '<button class="m-tool" data-concil-export><i>⬇️</i>Exportar pendências (CSV)<em>›</em></button>' +
      '<button class="m-tool" data-go="bancos"><i>🏦</i>Ir para Bancos<em>›</em></button>', true);

    return head + intro + kpis + listPanel + acoes;
  }
  // Sheet: atribuir um movimento a um banco
  function openConcil(id) {
    var st = C.load(), t = (st.tx || []).find(function (x) { return x.id === id; });
    if (!t) { toast('Movimento não encontrado.'); return; }
    var banks = C.getBanks(true);
    if (!banks.length) { toast('Cadastre um banco primeiro.'); go('bancos'); return; }
    var c = C.catById(t.cat, st);
    openSheet(sheetHead('Conciliar movimento') +
      '<div class="m-detail-meta">' + esc(t.desc || c.name) + ' · ' + dateBR(t.date) + ' · <b>' + C.money(t.valor) + '</b></div>' +
      '<div class="m-field"><label>Atribuir a qual banco?</label></div>' +
      '<div class="m-tools">' + banks.map(function (b) { return '<button class="m-tool" data-pickbank="' + esc(b.id) + '"><i>' + bankIcon(b) + '</i>' + esc(b.name) + '<em>›</em></button>'; }).join('') + '</div>');
    $$('#mSheetBody [data-pickbank]').forEach(function (btn) {
      btn.onclick = function () { C.updateTx(id, { account: btn.getAttribute('data-pickbank') }); closeSheet(); toast('Movimento conciliado'); render(); };
    });
  }
  function exportConcilCsv(st) {
    var k = mk(), without = C.mtx(st, k).filter(function (t) { return !t.interno && !t.account; });
    var lines = ['Data;Descrição;Categoria;Tipo;Valor'];
    without.forEach(function (t) { lines.push([t.date, (t.desc || '').replace(/;/g, ','), C.catById(t.cat, st).name, t.tipo, (+t.valor || 0).toFixed(2)].join(';')); });
    var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8' }));
    a.download = 'mrfinance-pendencias-' + k + '.csv'; a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000); toast('Pendências exportadas');
  }

  /* ---- PATRIMÔNIO (rico: 4 KPIs + distribuição + CRUD) ---- */
  function patrSeries(assets) {
    var set = {};
    assets.forEach(function (a) { (a.hist || [{ date: a.date, valor: a.valor }]).forEach(function (h) { var k = (h.date || '').slice(0, 7); if (k) set[k] = 1; }); });
    return Object.keys(set).sort().map(function (k) {
      var tot = 0; assets.forEach(function (a) { var v = null; (a.hist || [{ date: a.date, valor: a.valor }]).forEach(function (h) { if ((h.date || '').slice(0, 7) <= k) v = +h.valor || 0; }); if (v != null) tot += v; });
      return { k: k, total: tot };
    });
  }
  function patrDonut(st, assets) {
    if (!assets.length) return panel('📊 Distribuição do patrimônio', '', '<div class="m-panel-empty">Cadastre bens para ver a distribuição.</div>', true);
    var by = {}; assets.forEach(function (a) { var id = a.pcat || 'outros'; by[id] = (by[id] || 0) + (+a.valor || 0); });
    var ids = Object.keys(by).sort(function (x, y) { return by[y] - by[x]; });
    var total = ids.reduce(function (s, id) { return s + by[id]; }, 0) || 1, R = 44, Cc = 2 * Math.PI * R, off = 0;
    var segs = ids.map(function (id, i) { var len = by[id] / total * Cc, col = PAL[i % PAL.length]; var s = '<circle cx="58" cy="58" r="' + R + '" fill="none" stroke="' + col + '" stroke-width="15" stroke-dasharray="' + len.toFixed(1) + ' ' + (Cc - len).toFixed(1) + '" stroke-dashoffset="' + (-off).toFixed(1) + '" transform="rotate(-90 58 58)"/>'; off += len; return s; }).join('');
    var svg = '<svg viewBox="0 0 116 116" width="112" height="112">' + segs + '<text x="58" y="54" text-anchor="middle" font-size="10" fill="#9fb0de">total</text><text x="58" y="71" text-anchor="middle" font-size="13" font-weight="800" fill="#eef3ff">' + grK(total) + '</text></svg>';
    var legend = ids.map(function (id, i) { return '<span class="gr-leg"><i style="background:' + PAL[i % PAL.length] + '"></i>' + esc(pcatOf(id).name) + ' · ' + C.money(by[id]) + ' (' + Math.round(by[id] / total * 100) + '%)</span>'; }).join('');
    return panel('📊 Distribuição do patrimônio', '', '<div class="m-donut-wrap">' + svg + '<div class="m-donut-leg">' + legend + '</div></div>', true);
  }
  function buildPatrimonio(st) {
    var assets = st.patrimonio || [], total = C.assetsTotal(st);
    var head = shead('Patrimônio', 'bens, valores e evolução');
    var intro = '<div class="m-note" style="margin-top:0">Acompanhe seus bens, valores e a evolução do seu patrimônio. Não entra nas Entradas nem no saldo — só totaliza aqui.</div>' +
      '<button class="m-btn" data-asset-add style="margin-top:12px">＋ Novo patrimônio</button>';
    var biggest = assets.slice().sort(function (a, b) { return (+b.valor || 0) - (+a.valor || 0); })[0];
    var ser = patrSeries(assets), growth = null;
    if (ser.length >= 2) { var last = ser[ser.length - 1], prev = ser[ser.length - 2]; if (prev.total > 0) growth = (last.total - prev.total) / prev.total * 100; }
    var kpis = '<div class="m-kpis">' +
      kpiS('purple', '🏛️', 'Patrimônio total', C.money(total), 'distribuído em ' + assets.length + ' ativo(s)') +
      kpiS('blue', '💼', 'Total de bens', String(assets.length), 'bens cadastrados') +
      kpiS('green', '🏆', 'Maior patrimônio', biggest ? C.money(biggest.valor) : '—', biggest ? trunc(biggest.name || 'Bem', 18) : 'cadastre um bem') +
      kpiS('orange', '📈', 'Crescimento', growth == null ? '—' : (growth >= 0 ? '+' : '') + growth.toFixed(1) + '%', growth == null ? 'sem histórico anterior' : 'vs período anterior', growth == null ? '' : (growth >= 0 ? 'up' : 'down')) + '</div>';
    var donut = patrDonut(st, assets);
    var evo = assets.length ? panel('📈 Evolução do patrimônio', '', patrEvoSvg(ser), true) : '';
    var list = assets.length
      ? '<div class="m-h2">Meus bens</div>' + assets.map(function (b) {
        var pc = pcatOf(b.pcat);
        return '<div class="m-item"><div class="m-item-top"><span class="av">' + esc(b.icon || pc.icon) + '</span>' +
          '<div class="nm"><b>' + esc(b.name || 'Bem') + '</b><span>' + esc(pc.name) + '</span></div>' +
          '<span class="amt num">' + C.money(b.valor || 0) + '</span></div>' +
          '<div class="m-rowbtns"><button data-asset-edit="' + esc(b.id) + '">✏️ Editar</button><button class="danger" data-asset-del="' + esc(b.id) + '">🗑️ Excluir</button></div></div>';
      }).join('')
      : '<div class="m-empty"><div class="e">🏛️</div>Nenhum bem cadastrado.<br>Adicione imóveis, veículos, investimentos…</div>';
    return head + intro + kpis + donut + evo + list;
  }

  /* ---- BANCOS (rico: 4 KPIs + diferença para o fluxo + CRUD) ---- */
  function buildBancos(st) {
    var k = mk(), cons = C.banksConsolidated(st, k);
    var head = shead('Bancos', 'contas, carteiras e saldos');
    var intro = '<div class="m-note" style="margin-top:0">Seus bancos, carteiras e saldos em um só lugar.</div>' +
      '<button class="m-btn" data-bank-add style="margin-top:12px">＋ Adicionar banco</button>';
    var used = cons.rows.filter(function (x) { return x.r.bal !== 0 || x.r.pin !== 0 || x.r.pout !== 0 || x.r.init !== 0; }).length;
    var kpis = '<div class="m-kpis">' +
      kpiS('green', '🏦', 'Saldo total consolidado', C.money(cons.total), used + ' conta(s) com saldo/movimento', cons.total >= 0 ? 'up' : 'down') +
      kpiS('green', '📥', 'Entradas do período', C.money(cons.pin), k, 'up') +
      kpiS('red', '📤', 'Saídas do período', C.money(cons.pout), k, 'down') +
      kpiS('purple', '🧮', 'Saldo líquido (período)', C.money(cons.net), 'entradas − saídas', cons.net >= 0 ? 'up' : 'down') + '</div>';
    var fluxo = C.runningBalance(st, k), diff = cons.total - fluxo, ok = Math.abs(diff) < 0.01;
    var diffCard = '<div class="m-warncard' + (ok ? ' ok' : '') + '"><div class="t">' + (ok ? '✅ Saldo conciliado' : '⚠️ Diferença para o saldo do fluxo') + '</div>' +
      '<div class="v">' + C.money(ok ? cons.total : diff) + '</div>' +
      '<p>' + (ok ? 'A soma das contas bate com o saldo do fluxo/extrato.' : 'Contas: <b>' + C.money(cons.total) + '</b> · Fluxo/extrato: <b>' + C.money(fluxo) + '</b>. Geralmente são lançamentos sem conta atribuída ou saldo inicial não informado.') + '</p></div>';
    var list = cons.rows.length
      ? '<div class="m-h2">Minhas contas</div>' + cons.rows.map(function (x) {
        var b = x.bank, r = x.r;
        return '<div class="m-item"><div class="m-item-top"><span class="av">' + bankIcon(b) + '</span>' +
          '<div class="nm"><b>' + esc(b.name) + '</b><span>' + esc(b.type || 'Conta') + ' · inicial ' + C.money(r.init) + '</span></div>' +
          '<span class="amt num ' + (r.bal >= 0 ? 'up' : 'down') + '">' + C.money(r.bal) + '</span></div>' +
          '<div class="m-rowbtns"><button data-bank-edit="' + esc(b.id) + '">✏️ Editar</button><button data-bank-adj="' + esc(b.id) + '">⚖️ Ajustar</button><button class="danger" data-bank-del="' + esc(b.id) + '">🗑️</button></div></div>';
      }).join('')
      : '<div class="m-empty"><div class="e">🏦</div>Nenhuma conta cadastrada.<br>Toque em <b>＋ Adicionar banco</b> para começar.</div>';
    return head + intro + kpis + diffCard + list;
  }

  /* ---- CONFIGURAÇÕES ---- */
  function buildConfig(st) {
    var dark = (st.theme || 'dark') !== 'light';
    var priv = document.body.classList.contains('m-priv');
    var head = shead('Configurações', 'Preferências e dados');
    var prefs = '<div class="m-h2">Aparência</div><div class="m-tools">' +
      tool('theme', dark ? '🌙' : '☀️', 'Tema: ' + (dark ? 'escuro' : 'claro'), '↔') +
      tool('privacy', priv ? '👁️' : '🙈', 'Privacidade: ' + (priv ? 'ocultando valores' : 'valores visíveis'), '↔') +
      tool('reserve', '🐷', 'Meta de reserva: ' + (st.reservePct || 0) + '%', '›') + '</div>';
    var data = '<div class="m-h2">Dados</div><div class="m-tools">' +
      tool('export', '⬇️', 'Exportar backup (JSON)', '›') +
      tool('import', '⬆️', 'Importar backup (JSON)', '›') +
      tool('reload', '🔄', 'Recarregar dados', '›') +
      tool('clear', '🧨', 'Apagar todos os dados', '›') + '</div>';
    var about = '<div class="m-note" style="margin-top:16px">Seus dados ficam <b>neste aparelho</b> (armazenamento local). Exportar/Apagar afeta os dados deste dispositivo.</div>';
    return head + prefs + data + about;
  }

  /* ---- MAIS (hub de navegação) ---- */
  function buildMais(st) {
    function link(g, ic, label) { return '<button class="m-tool" data-go="' + g + '"><i>' + ic + '</i>' + label + '<em>›</em></button>'; }
    return '' +
      '<div class="m-hubgrp"><h4>Planejamento</h4><div class="m-tools">' +
      link('fluxo', '🔗', 'Fluxo de Caixa') +
      link('lancamentos', '📌', 'Lançamentos previstos') +
      link('metas', '🎯', 'Metas') +
      link('categorias', '🗂️', 'Categorias') + '</div></div>' +
      '<div class="m-hubgrp"><h4>Análise</h4><div class="m-tools">' +
      link('analises', '📈', 'Análises') +
      link('relatorios', '📊', 'Relatórios e DRE') +
      link('destino', '💸', 'Para onde foi seu dinheiro') +
      link('conciliacao', '✅', 'Conciliação') + '</div></div>' +
      '<div class="m-hubgrp"><h4>Contas &amp; bens</h4><div class="m-tools">' +
      link('bancos', '🏦', 'Bancos') +
      link('patrimonio', '🏛️', 'Patrimônio') + '</div></div>' +
      '<div class="m-hubgrp"><h4>Conta</h4><div class="m-tools">' +
      link('config', '⚙️', 'Configurações') +
      tool('export', '⬇️', 'Exportar backup (JSON)', '›') + '</div></div>' +
      '<div class="m-note" style="margin-top:16px">Seus dados ficam salvos <b>neste aparelho</b>. Faça backup pelas Configurações para não perder.</div>';
  }

  /* ============================ SHEET ============================ */
  function openSheet(html) {
    $('#mSheetBody').innerHTML = html;
    $('#mSheet').classList.add('open'); $('#mBackdrop').classList.add('open');
    document.body.style.overflow = 'hidden';
  }
  function closeSheet() {
    $('#mSheet').classList.remove('open'); $('#mBackdrop').classList.remove('open');
    document.body.style.overflow = '';
  }
  function sheetHead(title) {
    return '<div class="m-sheet-head"><h3>' + esc(title) + '</h3><button class="m-sheet-x" data-close>✕</button></div>';
  }

  /* ---- Detalhe de transação ---- */
  function openTxDetail(id) {
    var st = C.load(); var t = st.tx.find(function (x) { return x.id === id; });
    if (!t) { toast('Transação não encontrada.'); render(); return; }
    var c = C.catById(t.cat, st), isIn = t.tipo === 'receita';
    openSheet(
      sheetHead('Detalhe') +
      '<div class="m-detail-amt ' + (isIn ? 'up' : 'down') + '">' + (isIn ? '+' : '−') + C.money(t.valor) + '</div>' +
      '<div class="m-detail-meta">' + esc(t.desc || c.name) + '</div>' +
      '<div class="m-kv"><span>Categoria</span><b>' + esc(c.icon + ' ' + c.name) + '</b></div>' +
      '<div class="m-kv"><span>Tipo</span><b>' + (isIn ? 'Receita' : 'Despesa') + (t.pending ? ' · previsto' : '') + '</b></div>' +
      '<div class="m-kv"><span>Data</span><b>' + dateBR(t.date) + '</b></div>' +
      '<div style="margin-top:18px;display:grid;gap:10px">' +
      '<button class="m-btn ghost" data-edit="' + esc(id) + '">✏️ Editar</button>' +
      '<button class="m-btn danger" data-del="' + esc(id) + '">🗑️ Excluir</button></div>'
    );
    $('[data-del]').onclick = function () { if (!confirm('Excluir esta transação?')) return; C.delTx(id); closeSheet(); toast('Transação excluída'); render(); };
    $('[data-edit]').onclick = function () { openTxForm(t); };
  }

  /* ---- Form de transação (add/edit) ---- */
  function openTxForm(existing, presetPending) {
    var st = C.load(), editing = !!existing;
    var draft = editing ? {
      id: existing.id, tipo: existing.tipo, valor: existing.valor, cat: existing.cat,
      date: existing.date, desc: existing.desc || '', pending: !!existing.pending,
      parcelas: '1', repeat: false, account: existing.account || '', juros: '', note: existing.note || '', adv: false
    } : { tipo: 'despesa', valor: '', cat: '', date: defaultDate(), desc: '', pending: !!presetPending,
      parcelas: '1', repeat: false, account: '', juros: '', note: '', adv: false };
    function catsFor(tipo) { return C.allCats(st).filter(function (c) { return !c.type || c.type === tipo; }); }
    function bankOptions() {
      return '<option value="">Não vincular a um banco</option>' + C.getBanks(true).map(function (b) {
        return '<option value="' + esc(b.id) + '"' + (draft.account === b.id ? ' selected' : '') + '>' + esc(b.name) + '</option>';
      }).join('');
    }
    function build() {
      var list = catsFor(draft.tipo);
      if (draft.cat && !list.some(function (c) { return c.id === draft.cat; })) draft.cat = '';
      var nParc = Math.max(1, parseInt(draft.parcelas, 10) || 1);
      var parcelado = !editing && (nParc > 1 || draft.repeat);
      var catGrid = '<div class="m-field"><label>Categoria</label><div class="m-catgrid" id="fCats">' +
        list.map(function (c) { return '<button data-cat="' + c.id + '" class="' + (draft.cat === c.id ? 'on' : '') + '"><i>' + esc(c.icon) + '</i>' + esc(c.name) + '</button>'; }).join('') + '</div></div>';
      var html = sheetHead((editing ? 'Editar' : 'Novo') + ' lançamento') +
        '<div class="m-typetoggle">' +
        '<button class="desp ' + (draft.tipo === 'despesa' ? 'on' : '') + '" data-tipo="despesa">⬇ Saída</button>' +
        '<button class="rec ' + (draft.tipo === 'receita' ? 'on' : '') + '" data-tipo="receita">⬆ Entrada</button></div>';
      if (editing) {
        html +=
          '<div class="m-field"><label>Valor (R$)</label><input class="m-input num" id="fValor" inputmode="decimal" placeholder="0,00" value="' + (draft.valor ? String(draft.valor).replace('.', ',') : '') + '"></div>' +
          '<div class="m-row2"><div class="m-field"><label>Data</label><input class="m-input" id="fData" type="date" value="' + draft.date + '"></div>' +
          '<div class="m-field"><label>Situação</label><select class="m-input" id="fPend"><option value="0"' + (!draft.pending ? ' selected' : '') + '>Confirmado</option><option value="1"' + (draft.pending ? ' selected' : '') + '>Previsto</option></select></div></div>' +
          '<div class="m-field"><label>Descrição</label><input class="m-input" id="fDesc" placeholder="Ex.: Mercado, Salário…" value="' + esc(draft.desc) + '"></div>' +
          catGrid;
      } else {
        html +=
          // valor + parcelas
          '<div class="m-row2"><div class="m-field"><label>Valor total (R$)</label><input class="m-input num" id="fValor" inputmode="decimal" placeholder="0,00" value="' + (draft.valor ? String(draft.valor).replace('.', ',') : '') + '"></div>' +
          '<div class="m-field"><label>Parcelas</label><input class="m-input num" id="fParc" inputmode="numeric" value="' + esc(draft.parcelas) + '"></div></div>' +
          '<p class="m-help" style="margin:0 0 16px">Use <b>1 parcela</b> para um lançamento simples. Acima de 1, criamos parcelas futuras <b>provisionadas</b> (só entram no caixa ao confirmar “Paguei/Recebi”).</p>' +
          // descrição + categoria
          '<div class="m-field"><label>Descrição</label><input class="m-input" id="fDesc" placeholder="Ex.: Financiamento, Cartão, Aluguel…" value="' + esc(draft.desc) + '"></div>' +
          catGrid +
          // quando + situação
          '<div class="m-row2"><div class="m-field"><label>' + (parcelado ? '1º vencimento' : 'Data') + '</label><input class="m-input" id="fData" type="date" value="' + draft.date + '"></div>' +
          (parcelado
            ? '<div class="m-field"><label>Situação</label><div class="m-input m-input-ro">📌 Previsto</div></div>'
            : '<div class="m-field"><label>Situação</label><select class="m-input" id="fPend"><option value="0"' + (!draft.pending ? ' selected' : '') + '>Confirmado</option><option value="1"' + (draft.pending ? ' selected' : '') + '>Previsto</option></select></div>') + '</div>' +
          // banco
          '<div class="m-field"><label>Banco / conta (opcional)</label><select class="m-input" id="fBank">' + bankOptions() + '</select></div>' +
          // repetir
          '<label class="m-check"><input type="checkbox" id="fRepeat"' + (draft.repeat ? ' checked' : '') + '><span>🔁 Repetir mensalmente <small>· provisiona 12 meses</small></span></label>' +
          // mais opções (juros, observação) — recolhível
          '<button type="button" class="m-advtoggle" id="fAdv">' + (draft.adv ? '▴ Menos opções' : '▾ Mais opções (juros, observação)') + '</button>' +
          (draft.adv
            ? '<div class="m-row2"><div class="m-field"><label>Juros (% a.m.)</label><input class="m-input num" id="fJuros" inputmode="decimal" placeholder="0,00" value="' + esc(draft.juros) + '"></div>' +
              '<div class="m-field"><label>Observação</label><input class="m-input" id="fNote" placeholder="Contrato, origem…" value="' + esc(draft.note) + '"></div></div>'
            : '');
      }
      html += '<button class="m-btn" id="fSave">' + (editing ? 'Salvar alterações' : (parcelado ? 'Adicionar ' + nParc + ' parcela(s)' : 'Adicionar')) + '</button>';
      openSheet(html);
      $$('#mSheetBody [data-tipo]').forEach(function (b) { b.onclick = function () { draft.tipo = b.getAttribute('data-tipo'); syncDraft(); build(); }; });
      $$('#fCats [data-cat]').forEach(function (b) { b.onclick = function () { draft.cat = b.getAttribute('data-cat'); $$('#fCats [data-cat]').forEach(function (x) { x.classList.toggle('on', x === b); }); }; });
      var fp = $('#fParc'); if (fp) fp.oninput = function () { syncDraft(); build(); };
      var fr = $('#fRepeat'); if (fr) fr.onchange = function () { syncDraft(); build(); };
      var fa = $('#fAdv'); if (fa) fa.onclick = function () { syncDraft(); draft.adv = !draft.adv; build(); };
      $('#fSave').onclick = save;
    }
    function syncDraft() {
      var v = $('#fValor'); if (v) draft.valor = v.value;
      var d = $('#fData'); if (d) draft.date = d.value;
      var de = $('#fDesc'); if (de) draft.desc = de.value;
      var p = $('#fPend'); if (p) draft.pending = p.value === '1';
      var pc = $('#fParc'); if (pc) draft.parcelas = pc.value;
      var bk = $('#fBank'); if (bk) draft.account = bk.value;
      var rp = $('#fRepeat'); if (rp) draft.repeat = rp.checked;
      var jr = $('#fJuros'); if (jr) draft.juros = jr.value;
      var nt = $('#fNote'); if (nt) draft.note = nt.value;
    }
    function save() {
      syncDraft();
      var valor = parseMoney(draft.valor);
      if (!valor || valor <= 0) { toast('Informe um valor válido.'); return; }
      if (!draft.date) { toast(editing ? 'Informe a data.' : 'Informe o 1º vencimento.'); return; }
      if (!draft.cat) { toast('Escolha uma categoria.'); return; }
      var c = C.catById(draft.cat, st), desc = draft.desc || c.name;
      if (editing) {
        C.updateTx(draft.id, { date: draft.date, tipo: draft.tipo, valor: valor, cat: draft.cat, desc: desc, memo: desc, pending: !!draft.pending, account: draft.account || undefined, note: draft.note || undefined });
        toast('Lançamento atualizado');
      } else {
        var n = Math.max(1, Math.floor(parseInt(draft.parcelas, 10) || 1));
        var repeat = !!draft.repeat; if (repeat && n < 12) n = 12;
        var account = draft.account || '', juros = Math.max(0, parseMoney(draft.juros) || 0), note = (draft.note || '').trim();
        if (n > 1 || repeat) {
          var seriesId = 'series:' + C.uid(), parcela = +(valor / n).toFixed(2), restante = valor, batch = [];
          for (var i = 1; i <= n; i++) {
            var v = i === n ? +(restante).toFixed(2) : parcela; restante = +(restante - v).toFixed(2);
            batch.push({ id: 'm:' + C.uid(), date: addMonthsISO(draft.date, i - 1), tipo: draft.tipo, valor: v, memo: desc, desc: repeat ? desc : (desc + ' (' + i + '/' + n + ')'), cat: draft.cat, manual: true, pending: true, seriesId: seriesId, installmentIndex: i, installmentTotal: n, originalDesc: desc, originalTotal: valor, interestRate: juros, debtBalance: valor, note: note, recurring: repeat, status: 'pendente', account: account });
          }
          var s2 = C.load(); s2.tx.push.apply(s2.tx, batch); C.save(s2);
          toast((repeat ? 'Recorrência' : 'Lançamento') + ' criado: ' + n + ' parcela(s) provisionada(s).');
        } else {
          C.addTx({ date: draft.date, tipo: draft.tipo, valor: valor, cat: draft.cat, desc: desc, memo: desc, pending: !!draft.pending, manual: true, account: account || undefined, note: note || undefined });
          toast('Lançamento adicionado');
        }
      }
      view = new Date(draft.date + 'T00:00:00'); view = new Date(view.getFullYear(), view.getMonth(), 1);
      closeSheet(); render();
    }
    build();
  }
  function defaultDate() {
    var now = new Date();
    if (C.monthKey(now) === mk()) return now.toISOString().slice(0, 10);
    return mk() + '-01';
  }
  function addMonthsISO(iso, n) {
    var d = new Date(iso + 'T00:00:00'), day = d.getDate();
    d.setDate(1); d.setMonth(d.getMonth() + n);
    var dim = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    d.setDate(Math.min(day, dim));
    return d.toISOString().slice(0, 10);
  }

  /* ---- Form de categoria ---- */
  function openCatForm() {
    var draft = { name: '', icon: '🏷️', type: 'despesa' };
    var icons = ['🏷️', '🐶', '📚', '🎓', '🏋️', '🎮', '✈️', '🎁', '🍔', '☕', '💡', '🔧', '👶', '💄', '🌳', '🎵'];
    function build() {
      openSheet(
        sheetHead('Nova categoria') +
        '<div class="m-typetoggle">' +
        '<button class="desp ' + (draft.type === 'despesa' ? 'on' : '') + '" data-ctype="despesa">Despesa</button>' +
        '<button class="rec ' + (draft.type === 'receita' ? 'on' : '') + '" data-ctype="receita">Receita</button></div>' +
        '<div class="m-field"><label>Nome</label><input class="m-input" id="cName" placeholder="Ex.: Pets, Educação…" value="' + esc(draft.name) + '"></div>' +
        '<div class="m-field"><label>Ícone</label><div class="m-iconpick" id="cIcons">' +
        icons.map(function (e) { return '<button data-icon="' + e + '" class="' + (draft.icon === e ? 'on' : '') + '">' + e + '</button>'; }).join('') + '</div></div>' +
        '<button class="m-btn" id="cSave">Criar categoria</button>'
      );
      $$('#mSheetBody [data-ctype]').forEach(function (b) { b.onclick = function () { draft.name = ($('#cName') || {}).value || draft.name; draft.type = b.getAttribute('data-ctype'); build(); }; });
      $$('#cIcons [data-icon]').forEach(function (b) { b.onclick = function () { draft.icon = b.getAttribute('data-icon'); $$('#cIcons [data-icon]').forEach(function (x) { x.classList.toggle('on', x === b); }); }; });
      $('#cSave').onclick = function () {
        var name = ($('#cName').value || '').trim();
        if (!name) { toast('Informe um nome.'); return; }
        C.addCat({ name: name, icon: draft.icon, type: draft.type }); closeSheet(); toast('Categoria criada'); render();
      };
    }
    build();
  }

  /* ---- Form de meta ---- */
  function openGoalForm(g) {
    var editing = !!g;
    var d = editing ? { id: g.id, name: g.name || '', target: g.target || '', current: g.current || '', deadline: g.deadline || '' } : { name: '', target: '', current: '', deadline: '' };
    openSheet(
      sheetHead((editing ? 'Editar' : 'Nova') + ' meta') +
      '<div class="m-field"><label>Nome da meta</label><input class="m-input" id="gName" placeholder="Ex.: Reserva de emergência" value="' + esc(d.name) + '"></div>' +
      '<div class="m-row2"><div class="m-field"><label>Valor alvo (R$)</label><input class="m-input num" id="gTarget" inputmode="decimal" value="' + (d.target ? String(d.target).replace('.', ',') : '') + '"></div>' +
      '<div class="m-field"><label>Já guardado (R$)</label><input class="m-input num" id="gCurrent" inputmode="decimal" value="' + (d.current ? String(d.current).replace('.', ',') : '') + '"></div></div>' +
      '<div class="m-field"><label>Prazo (opcional)</label><input class="m-input" id="gDead" type="date" value="' + esc(d.deadline) + '"></div>' +
      '<button class="m-btn" id="gSave">' + (editing ? 'Salvar' : 'Criar meta') + '</button>'
    );
    $('#gSave').onclick = function () {
      var name = ($('#gName').value || '').trim(), target = parseMoney($('#gTarget').value), current = parseMoney($('#gCurrent').value);
      if (!name) { toast('Informe um nome.'); return; }
      if (!target || target <= 0) { toast('Informe o valor alvo.'); return; }
      var payload = { name: name, target: target, current: current, deadline: $('#gDead').value || '' };
      if (editing) { C.updateGoal(d.id, payload); toast('Meta atualizada'); } else { C.addGoal(payload); toast('Meta criada'); }
      closeSheet(); render();
    };
  }

  /* ---- Form de patrimônio ---- */
  function openAssetForm(a) {
    var editing = !!a;
    var d = editing ? { id: a.id, name: a.name || '', valor: a.valor || '', pcat: a.pcat || 'outros', icon: a.icon || pcatOf(a.pcat).icon }
      : { name: '', valor: '', pcat: 'imovel', icon: pcatOf('imovel').icon };
    function build() {
      openSheet(
        sheetHead((editing ? 'Editar' : 'Novo') + ' patrimônio') +
        '<div class="m-field"><label>Nome do bem</label><input class="m-input" id="aName" placeholder="Ex.: Apartamento, Carro…" value="' + esc(d.name) + '"></div>' +
        '<div class="m-field"><label>Valor atual (R$)</label><input class="m-input num" id="aVal" inputmode="decimal" value="' + (d.valor ? String(d.valor).replace('.', ',') : '') + '"></div>' +
        '<div class="m-field"><label>Categoria</label><div class="m-catgrid" id="aCats">' +
        PCATS.map(function (c) { return '<button data-pcat="' + c.id + '" class="' + (d.pcat === c.id ? 'on' : '') + '"><i>' + c.icon + '</i>' + c.name + '</button>'; }).join('') + '</div></div>' +
        '<button class="m-btn" id="aSave">' + (editing ? 'Salvar' : 'Adicionar ao patrimônio') + '</button>'
      );
      $$('#aCats [data-pcat]').forEach(function (b) {
        b.onclick = function () { d.pcat = b.getAttribute('data-pcat'); d.icon = pcatOf(d.pcat).icon; $$('#aCats [data-pcat]').forEach(function (x) { x.classList.toggle('on', x === b); }); };
      });
      $('#aSave').onclick = function () {
        var name = ($('#aName').value || '').trim(), valor = Math.abs(parseMoney($('#aVal').value));
        if (!name || !valor) { toast('Preencha nome e valor.'); return; }
        if (editing) {
          var st = C.load(), ex = (st.patrimonio || []).find(function (x) { return x.id === d.id; });
          var hist = (ex && Array.isArray(ex.hist)) ? ex.hist.slice() : [{ date: new Date().toISOString().slice(0, 10), valor: valor }];
          if (ex && Math.abs((+ex.valor || 0) - valor) > 0.004) hist.push({ date: new Date().toISOString().slice(0, 10), valor: valor, note: 'Edição do bem' });
          C.updateAsset(d.id, { name: name, valor: valor, pcat: d.pcat, icon: d.icon, hist: hist }); toast('Patrimônio atualizado');
        } else {
          C.addAsset({ name: name, valor: valor, pcat: d.pcat, icon: d.icon, cat: 'outros', date: new Date().toISOString().slice(0, 10) }); toast('Adicionado ao patrimônio');
        }
        closeSheet(); render();
      };
    }
    build();
  }

  /* ---- Form de banco ---- */
  function openBankForm(b) {
    var editing = !!b;
    var d = editing ? { id: b.id, name: b.name || '', type: b.type || 'Banco', icon: b.icon || '🏦', initial: (C.bankCalc(C.load(), b.id, mk()).init) }
      : { name: '', type: 'Banco', icon: '🏦', initial: '' };
    function build() {
      openSheet(
        sheetHead((editing ? 'Editar' : 'Novo') + ' banco') +
        '<div class="m-field"><label>Nome</label><input class="m-input" id="bName" placeholder="Ex.: Nubank, Carteira…" value="' + esc(d.name) + '"></div>' +
        '<div class="m-row2"><div class="m-field"><label>Tipo</label><select class="m-input" id="bType">' +
        C.BANK_TYPES.map(function (t) { return '<option' + (d.type === t ? ' selected' : '') + '>' + t + '</option>'; }).join('') + '</select></div>' +
        '<div class="m-field"><label>Saldo inicial (R$)</label><input class="m-input num" id="bInit" inputmode="decimal" value="' + (d.initial !== '' && d.initial != null ? String(d.initial).replace('.', ',') : '') + '"></div></div>' +
        '<div class="m-field"><label>Ícone</label><div class="m-iconpick" id="bIcons">' +
        C.BANK_EMOJIS.map(function (e) { return '<button data-icon="' + e + '" class="' + (d.icon === e ? 'on' : '') + '">' + e + '</button>'; }).join('') + '</div></div>' +
        '<button class="m-btn" id="bSave">' + (editing ? 'Salvar' : 'Adicionar banco') + '</button>'
      );
      $$('#bIcons [data-icon]').forEach(function (x) { x.onclick = function () { d.icon = x.getAttribute('data-icon'); $$('#bIcons [data-icon]').forEach(function (y) { y.classList.toggle('on', y === x); }); }; });
      $('#bSave').onclick = function () {
        var name = ($('#bName').value || '').trim();
        if (!name) { toast('Informe um nome.'); return; }
        var type = $('#bType').value, initial = parseMoney($('#bInit').value);
        if (editing) { C.updateBank(d.id, { name: name, type: type, icon: d.icon, initial: initial }); toast('Banco atualizado'); }
        else { C.addBank({ name: name, type: type, icon: d.icon, initial: initial }); toast('Banco adicionado'); }
        closeSheet(); render();
      };
    }
    build();
  }

  /* ---- Ajuste de saldo (cria movimento rastreável, como no desktop) ---- */
  function openBankAdjust(id) {
    var st = C.load(), b = C.getBanks(true).find(function (x) { return x.id === id; });
    if (!b) { toast('Conta não encontrada.'); return; }
    var cur = C.bankCalc(st, id, mk()).bal;
    openSheet(
      sheetHead('Ajustar saldo') +
      '<div class="m-detail-meta">' + esc(b.name) + ' · saldo atual <b>' + C.money(cur) + '</b></div>' +
      '<div class="m-field"><label>Saldo real hoje (R$)</label><input class="m-input num" id="adjVal" inputmode="decimal" placeholder="0,00"></div>' +
      '<p class="m-help">Será criado um lançamento de ajuste vinculado a esta conta, para o saldo bater com o valor informado.</p>' +
      '<button class="m-btn" id="adjSave">Ajustar saldo</button>'
    );
    $('#adjSave').onclick = function () {
      var target = parseMoney($('#adjVal').value);
      if (!$('#adjVal').value) { toast('Informe o saldo real.'); return; }
      var diff = target - cur;
      if (Math.abs(diff) < 0.005) { toast('Saldo já está correto.'); closeSheet(); return; }
      C.addTx({ date: new Date().toISOString().slice(0, 10), tipo: diff > 0 ? 'receita' : 'despesa', valor: Math.abs(diff), cat: 'outros', desc: 'Ajuste de saldo — ' + b.name, memo: 'Ajuste de saldo', pending: false, account: id });
      closeSheet(); toast('Saldo ajustado'); render();
    };
  }

  /* ---- Reserva (config) ---- */
  function openReserveForm() {
    var st = C.load();
    openSheet(
      sheetHead('Meta de reserva') +
      '<div class="m-field"><label>% das entradas para guardar</label><input class="m-input num" id="rvPct" inputmode="numeric" value="' + (st.reservePct || 0) + '"></div>' +
      '<p class="m-help">Usado como referência para sugerir quanto poupar por mês.</p>' +
      '<button class="m-btn" id="rvSave">Salvar</button>'
    );
    $('#rvSave').onclick = function () {
      var pct = Math.max(0, Math.min(100, parseInt($('#rvPct').value, 10) || 0));
      C.setReserve(pct, null); closeSheet(); toast('Reserva salva'); render();
    };
  }

  /* ---- Importar backup ---- */
  // Importar backup = seletor de arquivo .json (igual ao desktop), não colar texto
  function openImport() {
    var inp = document.createElement('input');
    inp.type = 'file'; inp.accept = '.json,application/json'; inp.style.display = 'none';
    document.body.appendChild(inp);
    inp.onchange = function () {
      var f = inp.files && inp.files[0]; document.body.removeChild(inp);
      if (!f) return;
      if (!confirm('Importar "' + f.name + '"? Isto substitui TODOS os dados atuais (mobile e desktop compartilham o armazenamento).')) return;
      var rd = new FileReader();
      rd.onload = function () { if (C.importBackup(rd.result)) { toast('Backup importado'); init(); } else toast('Arquivo inválido. Use um backup exportado pelo MR Finance.'); };
      rd.onerror = function () { toast('Não foi possível ler o arquivo.'); };
      rd.readAsText(f);
    };
    inp.click();
  }

  /* ---- Notificações (sino) ---- */
  function openNotif() {
    var st = C.load(), m = C.notifications(st, mk());
    var tabs = '<div class="m-seg">' +
      '<button class="' + (notifTab === 'pay' ? 'on' : '') + '" data-ntab="pay">A pagar <b>' + m.counts.pay + '</b></button>' +
      '<button class="' + (notifTab === 'rec' ? 'on' : '') + '" data-ntab="rec">A receber <b>' + m.counts.rec + '</b></button>' +
      '<button class="' + (notifTab === 'alertas' ? 'on' : '') + '" data-ntab="alertas">Alertas <b>' + m.counts.alerts + '</b></button></div>';
    function nfRow(t) {
      var c = C.catById(t.cat, st), isIn = t.tipo === 'receita';
      return '<button class="nf-card" data-notnav="lancamentos"><span class="nf-ic">' + esc(c.icon) + '</span>' +
        '<div class="nf-bd"><b>' + esc(t.originalDesc || t.desc || c.name) + '</b><small>' + (isIn ? 'receber' : 'vence') + ' ' + dateBR(t.date) + '</small></div>' +
        '<strong class="nf-val ' + (isIn ? 'up' : 'down') + '">' + C.money(t.valor) + '</strong></button>';
    }
    function sec(l, arr) { return arr.length ? '<div class="nf-sec">' + l + ' <span>' + arr.length + '</span></div>' + arr.slice().sort(function (a, b) { return (a.date || '').localeCompare(b.date || ''); }).map(nfRow).join('') : ''; }
    var body;
    if (notifTab === 'pay') {
      var g = m.payG, has = g.vencidas.length + g.hoje.length + g.d7.length + g.d30.length + g.fut.length;
      body = has ? sec('🔴 Vencidas', g.vencidas) + sec('🟡 Vencem hoje', g.hoje) + sec('🟢 Próximos 7 dias', g.d7) + sec('📅 Até 30 dias', g.d30) + sec('🗓️ Futuras', g.fut)
        : '<div class="nf-empty">Nenhuma conta a pagar pendente neste mês. 🎉</div>';
    } else if (notifTab === 'rec') {
      var r = m.recG, has2 = r.atraso.length + r.hoje.length + r.prox.length;
      body = has2 ? sec('🔴 Atrasadas', r.atraso) + sec('🟡 Hoje', r.hoje) + sec('🟢 Próximas', r.prox)
        : '<div class="nf-empty">Nenhum recebimento previsto neste mês.</div>';
    } else {
      body = m.alerts.length ? m.alerts.map(function (al) {
        return '<button class="nf-card ' + al.tone + '" data-notnav="' + al.nav + '"><span class="nf-ic">' + al.icon + '</span><div class="nf-bd"><b>' + esc(al.title) + '</b><small>' + esc(al.sub) + '</small></div><span class="nf-val" style="color:var(--mut)">›</span></button>';
      }).join('') : '<div class="nf-empty">Sem alertas no momento. 👍</div>';
    }
    openSheet(sheetHead('🔔 Notificações') + tabs + body);
    $$('#mSheetBody [data-ntab]').forEach(function (b) { b.onclick = function () { notifTab = b.getAttribute('data-ntab'); openNotif(); }; });
    $$('#mSheetBody [data-notnav]').forEach(function (b) { b.onclick = function () { closeSheet(); go(b.getAttribute('data-notnav')); }; });
  }

  /* ============================ AÇÕES (tela Mais/Config) ============================ */
  function handleAct(act) {
    if (act === 'theme') {
      var st = C.load(), nv = (st.theme || 'dark') === 'light' ? 'dark' : 'light';
      C.setTheme(nv); document.body.setAttribute('data-theme', nv); render();
    } else if (act === 'privacy') {
      var on = document.body.classList.toggle('m-priv');
      C.setPrivacy(on); $('#mPrivacy').textContent = on ? '👁️' : '🙈'; render();
    } else if (act === 'reserve') { openReserveForm(); }
    else if (act === 'export') {
      var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([C.exportBackup()], { type: 'application/json' }));
      a.download = 'mrfinance-backup-' + new Date().toISOString().slice(0, 10) + '.json'; a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000); toast('Backup exportado (dados + bancos)');
    } else if (act === 'import') { openImport(); }
    else if (act === 'reload') { render(); toast('Dados recarregados'); }
    else if (act === 'clear') {
      if (!confirm('Apagar TODOS os dados? Isto afeta também o desktop.')) return;
      if (!confirm('Tem certeza? Esta ação não pode ser desfeita.')) return;
      C.clearAll(); toast('Dados apagados'); init();
    }
  }

  /* ============================ EVENTOS ============================ */
  /* ---- Ações de Lançamentos (porta fiel do desktop) ---- */
  function confirmConta(id) {
    var st = C.load(), t = (st.tx || []).find(function (x) { return x.id === id; }); if (!t) return;
    C.updateTx(id, { pending: false, status: t.tipo === 'receita' ? 'recebido' : 'pago', paidAt: new Date().toISOString() });
    view = new Date(+t.date.slice(0, 4), +t.date.slice(5, 7) - 1, 1);
    toast((t.tipo === 'receita' ? 'Recebimento' : 'Pagamento') + ' confirmado: ' + C.money(t.valor)); render();
  }
  function undoConta(id) {
    var st = C.load(), t = (st.tx || []).find(function (x) { return x.id === id; }); if (!t) return;
    C.updateTx(id, { pending: true, status: 'pendente', paidAt: undefined });
    toast('Voltou para contas a ' + (t.tipo === 'receita' ? 'receber' : 'pagar')); render();
  }
  function cancelParcela(id) {
    if (!confirm('Cancelar esta parcela? Ela não entrará nas provisões.')) return;
    C.updateTx(id, { canceled: true, pending: false, status: 'cancelado' }); toast('Parcela cancelada'); render();
  }
  function openEditDue(id) {
    var st = C.load(), t = (st.tx || []).find(function (x) { return x.id === id; }); if (!t) return;
    openSheet(sheetHead('Editar vencimento') + '<div class="m-detail-meta">' + esc(t.desc || 'Parcela') + ' · ' + C.money(t.valor) + '</div>' +
      '<div class="m-field"><label>Novo vencimento</label><input class="m-input" id="edDue" type="date" value="' + t.date + '"></div>' +
      '<button class="m-btn" id="edSave">Salvar alteração</button>');
    $('#edSave').onclick = function () { var v = $('#edDue').value; if (!v) { toast('Informe uma data.'); return; } C.updateTx(id, { date: v }); closeSheet(); toast('Vencimento atualizado'); render(); };
  }
  function openEditVal(id) {
    var st = C.load(), t = (st.tx || []).find(function (x) { return x.id === id; }); if (!t) return;
    openSheet(sheetHead('Editar valor') + '<div class="m-detail-meta">' + esc(t.desc || 'Parcela') + ' · ' + dateBR(t.date) + '</div>' +
      '<div class="m-field"><label>Novo valor (R$)</label><input class="m-input num" id="edVal" inputmode="decimal" value="' + String(t.valor).replace('.', ',') + '"></div>' +
      '<button class="m-btn" id="edSave">Salvar alteração</button>');
    $('#edSave').onclick = function () { var n = parseMoney($('#edVal').value); if (!n || n <= 0) { toast('Valor inválido.'); return; } C.updateTx(id, { valor: Math.abs(n) }); closeSheet(); toast('Valor atualizado'); render(); };
  }

  /* botões fixos (app bar / bottom nav / FAB) */
  $('#mAdd').onclick = function () { openTxForm(null); };
  $('#mPrev').onclick = function () { shiftMonth(-1); };
  $('#mNext').onclick = function () { shiftMonth(1); };
  $('#mBackdrop').onclick = closeSheet;
  $('#mPrivacy').onclick = function () { handleAct('privacy'); };
  $('#mNotif').onclick = openNotif;

  /* delegação única para todo o conteúdo dinâmico */
  document.addEventListener('click', function (e) {
    var el;
    if (e.target.closest('#mSheet')) {
      if ((el = e.target.closest('[data-rep]')) && el.getAttribute('data-rep') === 'dre-csv') { exportDreCsv(C.load()); return; }
      if ((el = e.target.closest('[data-close]'))) { closeSheet(); }
      return; // dentro do sheet: handlers próprios cuidam do resto
    }
    if ((el = e.target.closest('[data-back]'))) { go('mais'); return; }
    if ((el = e.target.closest('[data-newlanc]'))) { openTxForm(null, true); return; }
    if ((el = e.target.closest('[data-paytab]'))) { payTab = el.getAttribute('data-paytab'); render(); return; }
    if ((el = e.target.closest('[data-rectab]'))) { recTab = el.getAttribute('data-rectab'); render(); return; }
    if ((el = e.target.closest('[data-conf]'))) { confirmConta(el.getAttribute('data-conf')); return; }
    if ((el = e.target.closest('[data-undo]'))) { undoConta(el.getAttribute('data-undo')); return; }
    if ((el = e.target.closest('[data-editdue]'))) { openEditDue(el.getAttribute('data-editdue')); return; }
    if ((el = e.target.closest('[data-editval]'))) { openEditVal(el.getAttribute('data-editval')); return; }
    if ((el = e.target.closest('[data-cancelparc]'))) { cancelParcela(el.getAttribute('data-cancelparc')); return; }
    if ((el = e.target.closest('[data-conciltab]'))) { concilTab = el.getAttribute('data-conciltab'); render(); return; }
    if ((el = e.target.closest('[data-concil]'))) { openConcil(el.getAttribute('data-concil')); return; }
    if ((el = e.target.closest('[data-concil-export]'))) { exportConcilCsv(C.load()); return; }
    if ((el = e.target.closest('[data-graph]'))) { graphTab = el.getAttribute('data-graph'); render(); return; }
    if ((el = e.target.closest('[data-rep]'))) {
      var rep = el.getAttribute('data-rep'), str = C.load();
      if (rep === 'dre') openDRE(str); else if (rep === 'resumo') openResumo(str); else if (rep === 'gastos') go('destino'); else if (rep === 'dre-csv') exportDreCsv(str);
      return;
    }
    if ((el = e.target.closest('[data-go]'))) { go(el.getAttribute('data-go')); return; }
    if ((el = e.target.closest('[data-tx]'))) { openTxDetail(el.getAttribute('data-tx')); return; }
    if ((el = e.target.closest('[data-f]'))) { txFilter = el.getAttribute('data-f'); render(); return; }
    if ((el = e.target.closest('[data-year]'))) { repYear = el.getAttribute('data-year'); render(); return; }
    if ((el = e.target.closest('[data-act]'))) { handleAct(el.getAttribute('data-act')); return; }
    if ((el = e.target.closest('[data-goal-add]'))) { openGoalForm(null); return; }
    if ((el = e.target.closest('[data-goal-edit]'))) { var st1 = C.load(); openGoalForm((st1.goals || []).find(function (g) { return g.id === el.getAttribute('data-goal-edit'); })); return; }
    if ((el = e.target.closest('[data-goal-del]'))) { if (confirm('Excluir esta meta?')) { C.delGoal(el.getAttribute('data-goal-del')); toast('Meta excluída'); render(); } return; }
    if ((el = e.target.closest('[data-cat-add]'))) { openCatForm(); return; }
    if ((el = e.target.closest('[data-cat-del]'))) {
      var uso = +el.getAttribute('data-cat-uso') || 0;
      if (confirm('Excluir esta categoria?' + (uso ? ' Há ' + uso + ' lançamento(s) usando-a (continuarão existindo).' : ''))) { C.delCat(el.getAttribute('data-cat-del')); toast('Categoria excluída'); render(); }
      return;
    }
    if ((el = e.target.closest('[data-asset-add]'))) { openAssetForm(null); return; }
    if ((el = e.target.closest('[data-asset-edit]'))) { var st2 = C.load(); openAssetForm((st2.patrimonio || []).find(function (a) { return a.id === el.getAttribute('data-asset-edit'); })); return; }
    if ((el = e.target.closest('[data-asset-del]'))) { if (confirm('Remover este item do patrimônio?')) { C.delAsset(el.getAttribute('data-asset-del')); toast('Item removido'); render(); } return; }
    if ((el = e.target.closest('[data-bank-add]'))) { openBankForm(null); return; }
    if ((el = e.target.closest('[data-bank-edit]'))) { openBankForm(C.getBanks(true).find(function (b) { return b.id === el.getAttribute('data-bank-edit'); })); return; }
    if ((el = e.target.closest('[data-bank-adj]'))) { openBankAdjust(el.getAttribute('data-bank-adj')); return; }
    if ((el = e.target.closest('[data-bank-del]'))) { if (confirm('Excluir esta conta? (os lançamentos vinculados permanecem)')) { C.delBank(el.getAttribute('data-bank-del')); toast('Conta excluída'); render(); } return; }
  });

  /* seletor de ano (select) nos Relatórios */
  document.addEventListener('change', function (e) {
    var s = e.target.closest('#repYear'); if (s) { repYear = s.value; render(); }
  });
  /* busca de movimentações na Conciliação (filtro em tempo real, sem re-render) */
  document.addEventListener('input', function (e) {
    var s = e.target.closest('#concilSearch'); if (!s) return;
    var q = (s.value || '').toLowerCase().trim();
    $$('#mView .m-mov').forEach(function (r) { r.style.display = (!q || (r.getAttribute('data-movtext') || '').indexOf(q) >= 0) ? '' : 'none'; });
  });

  /* ============================ INIT ============================ */
  function init() {
    var st = C.load();
    document.body.setAttribute('data-theme', (st.theme === 'light') ? 'light' : 'dark');
    if (st.privacy) { document.body.classList.add('m-priv'); $('#mPrivacy').textContent = '👁️'; }
    var ms = C.months(st);
    view = ms.length ? new Date(ms[ms.length - 1].k + '-01T00:00:00') : new Date();
    view = new Date(view.getFullYear(), view.getMonth(), 1);
    repYear = C.years(st)[0];
    render();
  }
  init();
})();
