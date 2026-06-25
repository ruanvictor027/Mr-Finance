/* ============================================================================
   MR Finance — NÚCLEO COMPARTILHADO (mr-core.js)
   Camada de DADOS + REGRAS DE NEGÓCIO, sem qualquer DOM.
   Lê e grava o MESMO localStorage do desktop ('finania_v4_clean'), então a
   versão MOBILE fica 100% em sincronia com a versão WEB/DESKTOP.
   As regras (ignorar `interno`/`pending` no realizado, saldo acumulado etc.)
   são uma porta FIEL das fórmulas do mrfinance.html — nenhuma regra nova.
   O desktop (mrfinance.html) NÃO é alterado nem depende deste arquivo.
   ============================================================================ */
(function (global) {
  'use strict';

  var KEY = 'finania_v4_clean';

  /* Categorias base — espelho do array `cats` do desktop (id/name/icon/type). */
  var CATS = [
    { id: 'salario', name: 'Salário', icon: '💼', type: 'receita' },
    { id: 'rendimentos', name: 'Rendimentos e cashback', icon: '📈', type: 'receita' },
    { id: 'reembolso', name: 'Reembolsos e estornos', icon: '↩️', type: 'receita' },
    { id: 'recebidos', name: 'Pix/Transf. recebidos', icon: '💸', type: 'receita' },
    { id: 'emprestimos_receita', name: 'Empréstimos recebidos', icon: '💸', type: 'receita' },
    { id: 'pessoas', name: 'Pessoas e Pix', icon: '👥' },
    { id: 'mercado', name: 'Alimentação e mercado', icon: '🛒', type: 'despesa' },
    { id: 'servicos', name: 'Serviços e assinaturas', icon: '🧩', type: 'despesa' },
    { id: 'lazer', name: 'Compras e lazer', icon: '✨', type: 'despesa' },
    { id: 'fatura', name: 'Fatura do cartão', icon: '💳', type: 'despesa' },
    { id: 'emprestimos_despesa', name: 'Empréstimos pagos', icon: '💰', type: 'despesa' },
    { id: 'transporte', name: 'Transporte', icon: '🚗', type: 'despesa' },
    { id: 'saude', name: 'Saúde', icon: '💊', type: 'despesa' },
    { id: 'moradia', name: 'Casa e contas', icon: '🏠', type: 'despesa' },
    { id: 'investimentos', name: 'Investimentos', icon: '🏦', type: 'despesa' },
    { id: 'saque', name: 'Saque', icon: '🏧', type: 'despesa' },
    { id: 'outros', name: 'Outros', icon: '📦' }
  ];

  function defaults() {
    return {
      tx: [], balances: {}, initialBalances: {}, goals: [], budgets: {}, rules: {},
      patrimonio: [], customCats: [], catOverrides: {}, catDreByType: {},
      reservePct: 50, reserveTarget: 0, reserveValor: 0,
      theme: 'dark', privacy: false, seenNotifications: false, catVer: 0
    };
  }

  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }

  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      if (!raw) return defaults();
      var st = JSON.parse(raw);
      return Object.assign(defaults(), st);
    } catch (e) { return defaults(); }
  }

  function save(st) {
    try { localStorage.setItem(KEY, JSON.stringify(st)); return true; }
    catch (e) { return false; }
  }

  function money(v) {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(v) || 0);
  }
  function compact(v) {
    var a = Math.abs(v), s = v < 0 ? '-' : '';
    if (a >= 1e6) return s + 'R$ ' + (a / 1e6).toFixed(1).replace('.', ',') + 'M';
    if (a >= 1000) return s + 'R$ ' + (a / 1000).toFixed(a >= 10000 ? 0 : 1).replace('.', ',') + 'k';
    return money(v);
  }

  function monthKey(d) { d = d || new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); }
  function monthName(k) {
    var d = new Date(k + '-01T00:00:00');
    return d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  }
  function monthShort(k) {
    return new Date(k + '-01T00:00:00').toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '');
  }

  function allCats(st) {
    st = st || load();
    return CATS.concat(Array.isArray(st.customCats) ? st.customCats : []);
  }
  function catById(id, st) {
    var c = allCats(st).find(function (x) { return x.id === id; });
    return c || { id: id || 'outros', name: 'Outros', icon: '📦' };
  }

  /* --- Cálculos (porta fiel do desktop) --- */
  // mtx: transações CONFIRMADAS (não-pendentes) do mês k
  function mtx(st, k) {
    return st.tx.filter(function (t) { return t && t.date && t.date.slice(0, 7) === k && !t.pending; });
  }
  // agg: entradas/saídas/resultado do mês (ignora `interno` = transferência)
  function agg(st, k) {
    var a = { in: 0, out: 0, net: 0 };
    mtx(st, k).forEach(function (t) {
      if (t.interno) return;
      if (t.tipo === 'receita') a.in += (+t.valor || 0); else a.out += (+t.valor || 0);
    });
    a.net = a.in - a.out;
    return a;
  }
  // months: série mensal {k,in,out,net} (ignora interno/pending)
  function months(st) {
    var by = {};
    st.tx.forEach(function (t) {
      if (!t || !t.date || t.interno || t.pending) return;
      var k = t.date.slice(0, 7);
      by[k] = by[k] || { in: 0, out: 0, net: 0 };
      if (t.tipo === 'receita') by[k].in += (+t.valor || 0); else by[k].out += (+t.valor || 0);
      by[k].net = by[k].in - by[k].out;
    });
    return Object.keys(by).sort().map(function (k) { return Object.assign({ k: k }, by[k]); });
  }
  function getInitialBalance(st, k) {
    var rec = (st.initialBalances || {})[k + '|geral'];
    return rec && isFinite(+rec.valor) ? +rec.valor : 0;
  }
  function balanceMonths(st) {
    var set = {};
    st.tx.forEach(function (t) { if (t && t.date && !t.pending && !t.interno) set[t.date.slice(0, 7)] = 1; });
    Object.keys(st.balances || {}).forEach(function (mk) { if (/^\d{4}-\d{2}$/.test(mk)) set[mk] = 1; });
    return Object.keys(set).sort();
  }
  // runningBalance: saldo acumulado até k (ancorado no fechamento OFX quando existir)
  function runningBalance(st, k) {
    var all = balanceMonths(st);
    if (!all.length) {
      var v = st.balances && st.balances[k];
      return isFinite(+v) ? +v : (getInitialBalance(st, k) + agg(st, k).net);
    }
    var run = getInitialBalance(st, all[0]);
    for (var i = 0; i < all.length; i++) {
      var mk = all[i];
      if (mk > k) break;
      var ofx = st.balances && st.balances[mk];
      if (isFinite(+ofx)) run = +ofx; else run += agg(st, mk).net;
    }
    return run;
  }
  // pendingTotals: provisões (a pagar/receber) do mês
  function pendingTotals(st, k) {
    var rows = st.tx.filter(function (t) { return t && t.pending && !t.canceled && t.date && t.date.slice(0, 7) === k; });
    var inn = 0, out = 0;
    rows.forEach(function (t) { if (t.tipo === 'receita') inn += (+t.valor || 0); else out += (+t.valor || 0); });
    return { in: inn, out: out, count: rows.length };
  }
  function categoryBreakdown(st, k) {
    var by = {};
    mtx(st, k).forEach(function (t) { if (t.tipo === 'despesa' && !t.interno) by[t.cat] = (by[t.cat] || 0) + (+t.valor || 0); });
    return Object.keys(by).map(function (id) { return { cat: catById(id, st), value: by[id] }; })
      .sort(function (a, b) { return b.value - a.value; });
  }
  function incomeBreakdown(st, k) {
    var by = {};
    mtx(st, k).forEach(function (t) { if (t.tipo === 'receita' && !t.interno) by[t.cat] = (by[t.cat] || 0) + (+t.valor || 0); });
    return Object.keys(by).map(function (id) { return { cat: catById(id, st), value: by[id] }; })
      .sort(function (a, b) { return b.value - a.value; });
  }
  function savingsRate(st, k) { var a = agg(st, k); return a.in > 0 ? a.net / a.in * 100 : 0; }

  // txOfMonth: lista (confirmadas por padrão, ou pendentes) ordenada por data desc
  function txOfMonth(st, k, opt) {
    opt = opt || {};
    return st.tx.filter(function (t) {
      return t && t.date && t.date.slice(0, 7) === k && (opt.pending ? !!t.pending : !t.pending);
    }).sort(function (a, b) { return (b.date || '').localeCompare(a.date || '') || ((b.valor || 0) - (a.valor || 0)); });
  }

  function hasData(st) { st = st || load(); return (st.tx && st.tx.length > 0) || Object.keys(st.balances || {}).length > 0; }

  /* --- Mutations (gravam no MESMO localStorage do desktop) --- */
  function addTx(t) {
    var st = load(); if (!t.id) t.id = 'm:' + uid();
    st.tx.push(t); save(st); return t.id;
  }
  function delTx(id) { var st = load(); st.tx = st.tx.filter(function (t) { return t.id !== id; }); save(st); }
  function updateTx(id, patch) {
    var st = load(); var t = st.tx.find(function (x) { return x.id === id; });
    if (t) { Object.assign(t, patch); save(st); } return !!t;
  }
  function setTheme(theme) { var st = load(); st.theme = theme; save(st); }

  function norm(s) { return (s == null ? '' : '' + s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim(); }

  /* --- Recorrências (despesas que repetem em ≥2 meses) --- */
  function recurring(st) {
    var by = {};
    st.tx.filter(function (t) { return t.tipo === 'despesa' && !t.interno && !t.pending; }).forEach(function (t) {
      var k = t.cat + ':' + norm(t.desc);
      by[k] = by[k] || { name: t.desc, cat: t.cat, total: 0, months: {}, n: 0 };
      by[k].total += (+t.valor || 0); by[k].months[t.date.slice(0, 7)] = 1; by[k].n++;
    });
    return Object.keys(by).map(function (k) { var r = by[k]; var nm = Object.keys(r.months).length; return { name: r.name, cat: r.cat, months: nm, avg: r.total / Math.max(1, nm) }; })
      .filter(function (r) { return r.months >= 2; }).sort(function (a, b) { return b.avg - a.avg; });
  }
  function avgField(st, field, n) { var ms = months(st).slice(-n); return ms.length ? ms.reduce(function (s, m) { return s + (m[field] || 0); }, 0) / ms.length : 0; }

  /* --- Projeção de caixa (realizado/previsto/projetado + cenários 30/60/90) --- */
  function flowForecast(st, k) {
    var realEnd = runningBalance(st, k), p = pendingTotals(st, k);
    var base = realEnd + (p.in - p.out);
    var ai = avgField(st, 'in', 6), ao = avgField(st, 'out', 6);
    var scN = ai - ao, scO = ai * 1.1 - ao * 0.9, scP = ai * 0.9 - ao * 1.1;
    var ser = function (n) { return [0, 1, 2, 3].map(function (i) { return base + n * i; }); };
    return { realEnd: realEnd, pendIn: p.in, pendOut: p.out, pendCount: p.count, projected: base, agg: agg(st, k),
      otimista: ser(scO), neutro: ser(scN), pessimista: ser(scP) };
  }

  /* --- Indicadores do mês --- */
  function flowIndicators(st, k) {
    var tx = mtx(st, k).filter(function (t) { return !t.interno; });
    var rec = tx.filter(function (t) { return t.tipo === 'receita'; }), desp = tx.filter(function (t) { return t.tipo === 'despesa'; });
    var a = agg(st, k), dim = new Date(+k.slice(0, 4), +k.slice(5, 7), 0).getDate();
    var maxIn = rec.slice().sort(function (x, y) { return y.valor - x.valor; })[0];
    var maxOut = desp.slice().sort(function (x, y) { return y.valor - x.valor; })[0];
    var dayOut = {}; desp.forEach(function (t) { var d = +t.date.slice(8, 10); dayOut[d] = (dayOut[d] || 0) + (+t.valor || 0); });
    var maxDay = 0, maxDayVal = 0; Object.keys(dayOut).forEach(function (d) { if (dayOut[d] > maxDayVal) { maxDayVal = dayOut[d]; maxDay = +d; } });
    var ticket = desp.length ? a.out / desp.length : 0;
    var active = {}; tx.forEach(function (t) { active[t.date] = 1; }); var noMove = Math.max(0, dim - Object.keys(active).length);
    return { agg: a, maxIn: maxIn, maxOut: maxOut, maxDay: maxDay, maxDayVal: maxDayVal, ticket: ticket, noMove: noMove, dim: dim,
      rate: a.in > 0 ? Math.round(a.net / a.in * 100) : 0, recurringCount: recurring(st).length };
  }

  /* --- Insights — porta FIEL do gerador de "Análise automática" do desktop --- */
  function insights(st, k) {
    var a = agg(st, k), out = [], dim = new Date(+k.slice(0, 4), +k.slice(5, 7), 0).getDate();
    var tx = mtx(st, k).filter(function (t) { return !t.interno; });
    var desp = tx.filter(function (t) { return t.tipo === 'despesa'; });
    var inc = tx.filter(function (t) { return t.tipo === 'receita'; });
    if (!tx.length) return out;
    function trunc(s, n) { s = s == null ? '' : '' + s; return s.length > n ? s.slice(0, n - 1) + '…' : s; }
    var curName = monthName(k);
    var pk = monthKey(new Date(+k.slice(0, 4), +k.slice(5, 7) - 2, 1));
    var prevName = monthName(pk).replace(/ de \d{4}/, '');
    var pAgg = agg(st, pk);
    // 1) Sobra / poupança do mês
    var rate = a.in ? a.net / a.in * 100 : 0;
    if (a.in > 0) out.push({ icon: rate >= 20 ? '🌱' : rate >= 0 ? '📊' : '🚨', tone: rate >= 20 ? 'good' : rate >= 0 ? 'warn' : 'bad', title: rate >= 20 ? 'Boa sobra no mês' : rate >= 0 ? 'Sobra baixa no mês' : 'Mês no vermelho', text: rate >= 0 ? ('Você poupou ' + Math.round(rate) + '% das entradas.') : ('Saídas superaram entradas em ' + money(Math.abs(a.net)) + '.') });
    // 2) Categoria dominante / mais pesada
    var cb = categoryBreakdown(st, k);
    if (cb.length) { var top = cb[0], share = a.out ? top.value / a.out : 0; out.push({ icon: share >= .5 ? '⚠️' : '✂️', tone: share >= .5 ? 'bad' : 'warn', title: share >= .5 ? 'Categoria dominante' : 'Categoria mais pesada', text: top.cat.name + ': ' + money(top.value) + (share >= .5 ? (' (' + Math.round(share * 100) + '% das saídas)') : ('. Reduzir 10% libera ' + money(top.value * .1))) + '.' }); }
    // 3) Gastos recorrentes
    var rec = recurring(st);
    if (rec.length) { var tot = rec.reduce(function (s, r) { return s + r.avg; }, 0); out.push({ icon: '🔁', tone: 'warn', title: 'Gastos recorrentes detectados', text: rec.length + ' recorrência(s), cerca de ' + money(tot) + '/mês.' }); }
    // 4) Muitas compras pequenas
    var small = desp.filter(function (t) { return (+t.valor || 0) < 20; }); var smallTot = small.reduce(function (s, t) { return s + (+t.valor || 0); }, 0);
    if (small.length >= 3) out.push({ icon: '🪙', tone: 'warn', title: 'Muitas compras pequenas', text: small.length + ' compras abaixo de R$ 20 somaram ' + money(smallTot) + '.' });
    // 5) Dependência de uma fonte de renda
    if (inc.length && a.in > 0) { var biggest = inc.slice().sort(function (x, y) { return y.valor - x.valor; })[0]; if (biggest.valor / a.in >= .7) out.push({ icon: '🧩', tone: 'warn', title: 'Dependência de uma fonte de renda', text: Math.round(biggest.valor / a.in * 100) + '% das entradas vieram de ' + trunc(biggest.desc || catById(biggest.cat, st).name, 24) + '.' }); }
    // 6) Receita subiu / caiu vs mês anterior
    if (pAgg.in > 0) { var varPct = Math.round((a.in - pAgg.in) / pAgg.in * 100); if (Math.abs(varPct) >= 5) out.push({ icon: varPct >= 0 ? '📈' : '📉', tone: varPct >= 0 ? 'good' : 'bad', title: varPct >= 0 ? ('Receita subiu ' + varPct + '%') : ('Receita caiu ' + Math.abs(varPct) + '%'), text: 'Entradas de ' + curName + ': ' + money(a.in) + ' vs ' + prevName + ': ' + money(pAgg.in) + '.' }); }
    // 7) Melhor / pior mês do ano
    var yr = k.slice(0, 4), yms = months(st).filter(function (m) { return m.k.slice(0, 4) === yr; });
    if (yms.length >= 2) { var best = yms.slice().sort(function (x, y) { return y.net - x.net; })[0], worst = yms.slice().sort(function (x, y) { return x.net - y.net; })[0]; out.push({ icon: '🏆', tone: 'good', title: 'Melhor e pior mês do ano', text: 'Melhor: ' + monthShort(best.k) + ' (' + money(best.net) + ') · Pior: ' + monthShort(worst.k) + ' (' + money(worst.net) + ').' }); }
    // 8) Categoria crescendo (vs média 6m)
    if (cb.length) {
      var tcId = cb[0].cat.id, sum6 = 0, cnt6 = 0;
      for (var i = 6; i >= 1; i--) { var kk = monthKey(new Date(+k.slice(0, 4), +k.slice(5, 7) - 1 - i, 1)), sc = 0; mtx(st, kk).forEach(function (t) { if (t.tipo === 'despesa' && !t.interno && t.cat === tcId) sc += (+t.valor || 0); }); sum6 += sc; cnt6++; }
      var catAvg = cnt6 ? sum6 / cnt6 : 0;
      if (catAvg > 0 && cb[0].value > catAvg * 1.25) out.push({ icon: '🔥', tone: 'warn', title: 'Categoria crescendo', text: cb[0].cat.name + ' está ' + Math.round((cb[0].value / catAvg - 1) * 100) + '% acima da média recente.' });
    }
    // 9) Economia acima / abaixo da média
    var avgNet = avgField(st, 'net', 6);
    if (months(st).length >= 2) out.push({ icon: a.net >= avgNet ? '💎' : '🪫', tone: a.net >= avgNet ? 'good' : 'warn', title: a.net >= avgNet ? 'Economia acima da média' : 'Economia abaixo da média', text: 'Resultado do mês: ' + money(a.net) + ' vs média 6m: ' + money(avgNet) + '.' });
    // 10) Risco de caixa negativo (projeção)
    var p = pendingTotals(st, k), start = runningBalance(st, k), projected = start + (p.in || 0) - (p.out || 0);
    if (p.count && projected < 0) out.push({ icon: '🚨', tone: 'bad', title: 'Risco de caixa negativo', text: 'Após contas previstas, o saldo projetado fica em ' + money(projected) + '.' });
    // 11) Patrimônio registrado
    var assets = st.patrimonio || []; if (assets.length) out.push({ icon: '🏛️', tone: 'good', title: 'Patrimônio registrado', text: 'Total em bens: ' + money(assetsTotal(st)) + ' em ' + assets.length + ' item(ns).' });
    // 12) Parcelas futuras provisionadas
    var today = new Date().toISOString().slice(0, 10);
    var futParc = (st.tx || []).filter(function (t) { return t && t.pending && !t.canceled && (+t.installmentTotal > 1) && (t.date || '') > today; });
    if (futParc.length >= 3) { var totParc = futParc.reduce(function (s, t) { return s + (+t.valor || 0); }, 0); out.push({ icon: '💳', tone: 'warn', title: 'Parcelas futuras provisionadas', text: futParc.length + ' parcela(s) futura(s) somando ' + money(totParc) + '.' }); }
    // 13) Limite diário sugerido
    out.push({ icon: '🎯', tone: 'good', title: 'Limite diário sugerido', text: 'Para gastar até 80% das entradas, use teto de ' + money(a.in * .8 / Math.max(1, dim)) + '/dia.' });
    return out;
  }
  // dailyLimit: banner "Limite sugerido" — teto 80% e gasto médio diário até hoje
  function dailyLimit(st, k) {
    var a = agg(st, k), dim = new Date(+k.slice(0, 4), +k.slice(5, 7), 0).getDate();
    var now = new Date(), elapsed = (monthKey(now) === k) ? Math.max(1, now.getDate()) : dim;
    return { teto: a.in * .8 / Math.max(1, dim), medio: a.out / Math.max(1, elapsed) };
  }

  /* --- Notificações (porta fiel do notifModel do desktop) --- */
  function daysUntil(d) { var t = new Date(); t.setHours(0, 0, 0, 0); var x = new Date(d + 'T00:00:00'); return Math.round((x - t) / 86400000); }
  function notifications(st, k) {
    st = st || load();
    var pend = (st.tx || []).filter(function (t) { return t && t.pending && !t.canceled && t.date && t.date.slice(0, 7) === k; });
    var pays = pend.filter(function (t) { return t.tipo === 'despesa'; });
    var recs = pend.filter(function (t) { return t.tipo === 'receita'; });
    var sum = function (arr) { return arr.reduce(function (s, t) { return s + (+t.valor || 0); }, 0); };
    var payG = { vencidas: [], hoje: [], d7: [], d30: [], fut: [] };
    pays.forEach(function (t) { var d = daysUntil(t.date); if (d < 0) payG.vencidas.push(t); else if (d === 0) payG.hoje.push(t); else if (d <= 7) payG.d7.push(t); else if (d <= 30) payG.d30.push(t); else payG.fut.push(t); });
    var recG = { atraso: [], hoje: [], prox: [] };
    recs.forEach(function (t) { var d = daysUntil(t.date); if (d < 0) recG.atraso.push(t); else if (d === 0) recG.hoje.push(t); else recG.prox.push(t); });
    var a = agg(st, k), alerts = [];
    var vTot = sum(payG.vencidas);
    if (vTot > 0) alerts.push({ tone: 'bad', icon: '⛔', title: 'Contas vencidas', sub: money(vTot) + ' em ' + payG.vencidas.length + ' conta(s).', nav: 'lancamentos' });
    var hojeTot = sum(payG.hoje);
    if (hojeTot > 0) alerts.push({ tone: 'warn', icon: '⏰', title: 'Vencem hoje', sub: money(hojeTot) + ' em ' + payG.hoje.length + ' conta(s).', nav: 'lancamentos' });
    var need7 = vTot + hojeTot + sum(payG.d7);
    if (need7 > 0) { var sal = runningBalance(st, k), okc = sal >= need7; alerts.push({ tone: okc ? 'good' : 'bad', icon: okc ? '✅' : '⚠️', title: okc ? 'Saldo cobre os próximos 7 dias' : 'Saldo pode não cobrir 7 dias', sub: 'Próx. 7 dias: ' + money(need7) + ' · saldo ' + money(sal) + '.', nav: 'fluxo' }); }
    if (a.in > 0) { var comp = a.out + sum(pays), pc = Math.round(comp / a.in * 100); alerts.push({ tone: pc > 90 ? 'bad' : pc > 70 ? 'warn' : 'good', icon: '📊', title: 'Comprometimento da renda', sub: pc + '% das entradas comprometidas com despesas.', nav: 'analises' }); }
    var pendRec = pend.filter(function (t) { return (+t.installmentTotal > 1) || t.recurring; });
    if (pendRec.length) alerts.push({ tone: 'warn', icon: '♻️', title: 'Recorrências a confirmar', sub: pendRec.length + ' parcela(s)/recorrência(s) · ' + money(sum(pendRec)) + '.', nav: 'lancamentos' });
    var recTot = sum(recs);
    if (recTot > 0) alerts.push({ tone: 'good', icon: '📥', title: 'A receber no mês', sub: money(recTot) + ' em ' + recs.length + ' lançamento(s).', nav: 'lancamentos' });
    return { payG: payG, recG: recG, alerts: alerts, counts: { pay: pays.length, rec: recs.length, alerts: alerts.length, urgent: payG.vencidas.length + payG.hoje.length + recG.atraso.length } };
  }

  /* --- DRE simplificado (resultado por mês no ano) --- */
  function dreYear(st, year) {
    var rows = [];
    for (var m = 1; m <= 12; m++) { var k = year + '-' + String(m).padStart(2, '0'); var a = agg(st, k); if (a.in || a.out) rows.push({ k: k, in: a.in, out: a.out, net: a.net }); }
    var tot = rows.reduce(function (s, r) { return { in: s.in + r.in, out: s.out + r.out, net: s.net + r.net }; }, { in: 0, out: 0, net: 0 });
    return { rows: rows, total: tot };
  }
  function years(st) { var y = {}; st.tx.forEach(function (t) { if (t && t.date) y[t.date.slice(0, 4)] = 1; }); var arr = Object.keys(y).sort().reverse(); if (!arr.length) arr = [String(new Date().getFullYear())]; return arr; }

  /* --- Para onde foi: por beneficiário/descrição --- */
  function beneficiaryRanking(st, k) {
    var by = {};
    mtx(st, k).forEach(function (t) { if (t.tipo === 'despesa' && !t.interno) { var nm = t.desc || catById(t.cat, st).name; by[nm] = (by[nm] || 0) + (+t.valor || 0); } });
    return Object.keys(by).map(function (nm) { return { name: nm, value: by[nm] }; }).sort(function (a, b) { return b.value - a.value; });
  }

  /* --- Metas --- */
  function goalPct(g) { var t = +g.target || 0; return t > 0 ? Math.min(100, Math.round((+g.current || 0) / t * 100)) : 0; }
  function goalDone(g) { return (+g.target || 0) > 0 && (+g.current || 0) >= (+g.target || 0); }
  function addGoal(g) { var st = load(); g.id = g.id || 'mg:' + uid(); st.goals = st.goals || []; st.goals.push(g); save(st); return g.id; }
  function updateGoal(id, patch) { var st = load(); var g = (st.goals || []).find(function (x) { return x.id === id; }); if (g) { Object.assign(g, patch); save(st); } return !!g; }
  function delGoal(id) { var st = load(); st.goals = (st.goals || []).filter(function (g) { return g.id !== id; }); save(st); }

  /* --- Patrimônio --- */
  function assetsTotal(st) { st = st || load(); return (st.patrimonio || []).reduce(function (s, b) { return s + (+b.valor || 0); }, 0); }
  function addAsset(b) { var st = load(); b.id = b.id || 'pat:' + uid(); b.createdAt = Date.now(); b.hist = [{ date: b.date || new Date().toISOString().slice(0, 10), valor: +b.valor || 0 }]; st.patrimonio = st.patrimonio || []; st.patrimonio.push(b); save(st); return b.id; }
  function updateAsset(id, patch) { var st = load(); var b = (st.patrimonio || []).find(function (x) { return x.id === id; }); if (b) { Object.assign(b, patch); save(st); } return !!b; }
  function delAsset(id) { var st = load(); st.patrimonio = (st.patrimonio || []).filter(function (b) { return b.id !== id; }); save(st); }

  /* --- Categorias custom --- */
  function isBaseCat(id) { return CATS.some(function (c) { return c.id === id; }); }
  function catUsage(st, id) { st = st || load(); return st.tx.filter(function (t) { return t.cat === id; }).length; }
  function addCat(c) { var st = load(); c.id = c.id || 'cat_' + uid(); st.customCats = st.customCats || []; st.customCats.push(c); save(st); return c.id; }
  function delCat(id) { var st = load(); st.customCats = (st.customCats || []).filter(function (c) { return c.id !== id; }); save(st); }

  /* --- Config / reserva --- */
  function setReserve(pct, valor) { var st = load(); if (pct != null) st.reservePct = pct; if (valor != null) st.reserveValor = valor; save(st); }
  function setPrivacy(v) { var st = load(); st.privacy = !!v; save(st); }
  // exportBackup: pacote com os DOIS armazenamentos (estado + bancos), retrocompatível
  function exportBackup() {
    var main = load();
    var banks; try { banks = JSON.parse(localStorage.getItem('mr_bank_cfg') || 'null'); } catch (e) { banks = null; }
    return JSON.stringify({ _app: 'MRFinance', _v: 1, exportedAt: new Date().toISOString(), finania_v4_clean: main, mr_bank_cfg: banks });
  }
  // importBackup: aceita (a) pacote {finania_v4_clean, mr_bank_cfg} OU (b) estado cru com tx[]
  function importBackup(json) {
    try {
      var obj = (typeof json === 'string') ? JSON.parse(json) : json;
      if (!obj || typeof obj !== 'object') return false;
      if (obj.finania_v4_clean && typeof obj.finania_v4_clean === 'object') {
        save(Object.assign(defaults(), obj.finania_v4_clean));
        if (obj.mr_bank_cfg && typeof obj.mr_bank_cfg === 'object') { try { localStorage.setItem('mr_bank_cfg', JSON.stringify(obj.mr_bank_cfg)); } catch (e) {} }
        return true;
      }
      if (Array.isArray(obj.tx)) { save(Object.assign(defaults(), obj)); return true; }
      return false;
    } catch (e) { return false; }
  }
  function clearAll() { save(defaults()); try { localStorage.removeItem('mr_bank_cfg'); } catch (e) {} }

  /* --- Bancos (porta fiel do desktop; chave SEPARADA 'mr_bank_cfg') --------
     Estrutura: { custom:[{id,name,icon,type,color}], initial:{id:valor},
                  archived:{id:true}, removed:{id:true}, meta:{} }
     Saldo do banco = initial[id] + Σ(tx confirmadas com t.account===id).
     O desktop usa exatamente este mesmo armazenamento, então mobile e desktop
     compartilham as contas. ------------------------------------------------- */
  var BANK_KEY = 'mr_bank_cfg';
  function bankCfg() {
    try {
      var c = JSON.parse(localStorage.getItem(BANK_KEY) || '{}') || {};
      c.custom = Array.isArray(c.custom) ? c.custom : [];
      c.initial = (c.initial && typeof c.initial === 'object') ? c.initial : {};
      c.archived = (c.archived && typeof c.archived === 'object') ? c.archived : {};
      c.removed = (c.removed && typeof c.removed === 'object') ? c.removed : {};
      c.meta = (c.meta && typeof c.meta === 'object') ? c.meta : {};
      return c;
    } catch (e) { return { custom: [], initial: {}, archived: {}, removed: {}, meta: {} }; }
  }
  function saveBankCfg(c) { try { localStorage.setItem(BANK_KEY, JSON.stringify(c)); return true; } catch (e) { return false; } }
  function getBanks(includeArchived) {
    var c = bankCfg();
    var custom = c.custom.filter(function (b) { return b && b.id; }).map(function (b) { return Object.assign({}, b, { custom: true }); });
    var all = custom.filter(function (b) { return !(c.removed && c.removed[b.id]); });
    if (!includeArchived) all = all.filter(function (b) { return !c.archived[b.id]; });
    return all;
  }
  // bankCalc: saldo/movimento de UMA conta (mesmo predicado do desktop: pending===false)
  function bankCalc(st, bankId, k) {
    st = st || load();
    var init = +((bankCfg().initial || {})[bankId]) || 0, bal = init, pin = 0, pout = 0;
    (st.tx || []).forEach(function (t) {
      if (!t || t.account !== bankId || t.canceled || t.pending !== false) return;
      var v = +t.valor || 0;
      if (t.tipo === 'receita') bal += v; else bal -= v;
      if ((t.date || '').slice(0, 7) === k) { if (t.tipo === 'receita') pin += v; else pout += v; }
    });
    return { init: init, bal: bal, pin: pin, pout: pout };
  }
  // banksConsolidated: saldo consolidado de todas as contas ativas no mês k
  function banksConsolidated(st, k) {
    st = st || load();
    var total = 0, pin = 0, pout = 0;
    var rows = getBanks(false).map(function (b) { var r = bankCalc(st, b.id, k); total += r.bal; pin += r.pin; pout += r.pout; return { bank: b, r: r }; });
    return { rows: rows, total: total, pin: pin, pout: pout, net: pin - pout };
  }
  function addBank(b) {
    var c = bankCfg(), id = b.id || 'bk_' + uid();
    c.custom.push({ id: id, name: b.name || 'Conta', icon: b.icon || '🏦', type: b.type || 'Banco', color: b.color || '#7c4dff' });
    if (b.initial != null) c.initial[id] = +b.initial || 0;
    saveBankCfg(c); return id;
  }
  function updateBank(id, patch) {
    var c = bankCfg(), b = c.custom.find(function (x) { return x.id === id; });
    if (b) { ['name', 'icon', 'type', 'color'].forEach(function (f) { if (patch[f] != null) b[f] = patch[f]; }); }
    if (patch.initial != null) c.initial[id] = +patch.initial || 0;
    saveBankCfg(c); return !!b;
  }
  function delBank(id) { var c = bankCfg(); c.custom = c.custom.filter(function (b) { return b.id !== id; }); c.removed = c.removed || {}; c.removed[id] = true; saveBankCfg(c); }
  function archiveBank(id, v) { var c = bankCfg(); c.archived = c.archived || {}; if (v === false) delete c.archived[id]; else c.archived[id] = true; saveBankCfg(c); }
  function setBankInitial(id, valor) { var c = bankCfg(); c.initial[id] = +valor || 0; saveBankCfg(c); }
  var BANK_TYPES = ['Banco', 'Carteira', 'Dinheiro', 'Investimento', 'Cartão', 'Outros'];
  var BANK_EMOJIS = ['💵', '🏦', '💳', '🏧', '👛', '💰', '🐷', '💎', '🪙', '📈', '🛡️', '🏛️', '🟣', '🟢', '🟠', '🔵'];

  global.MRCore = {
    KEY: KEY, CATS: CATS,
    load: load, save: save, defaults: defaults, uid: uid, hasData: hasData, norm: norm,
    money: money, compact: compact, monthKey: monthKey, monthName: monthName, monthShort: monthShort,
    allCats: allCats, catById: catById, isBaseCat: isBaseCat, catUsage: catUsage, addCat: addCat, delCat: delCat,
    mtx: mtx, agg: agg, months: months, runningBalance: runningBalance, getInitialBalance: getInitialBalance,
    pendingTotals: pendingTotals, categoryBreakdown: categoryBreakdown, incomeBreakdown: incomeBreakdown,
    savingsRate: savingsRate, txOfMonth: txOfMonth,
    recurring: recurring, flowForecast: flowForecast, flowIndicators: flowIndicators, insights: insights, dailyLimit: dailyLimit,
    daysUntil: daysUntil, notifications: notifications,
    dreYear: dreYear, years: years, beneficiaryRanking: beneficiaryRanking,
    goalPct: goalPct, goalDone: goalDone, addGoal: addGoal, updateGoal: updateGoal, delGoal: delGoal,
    assetsTotal: assetsTotal, addAsset: addAsset, updateAsset: updateAsset, delAsset: delAsset,
    setReserve: setReserve, setPrivacy: setPrivacy, importBackup: importBackup, exportBackup: exportBackup, clearAll: clearAll,
    BANK_KEY: BANK_KEY, BANK_TYPES: BANK_TYPES, BANK_EMOJIS: BANK_EMOJIS,
    getBanks: getBanks, bankCalc: bankCalc, banksConsolidated: banksConsolidated,
    addBank: addBank, updateBank: updateBank, delBank: delBank, archiveBank: archiveBank, setBankInitial: setBankInitial,
    addTx: addTx, delTx: delTx, updateTx: updateTx, setTheme: setTheme
  };
})(window);
