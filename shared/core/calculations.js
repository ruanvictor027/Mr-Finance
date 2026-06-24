// calculations.js — Funções de cálculo financeiro puras
import { norm } from './formatting.js';

export function agg(state, k) {
  const a = { in: 0, out: 0, net: 0 };
  mtx(state, k).forEach(t => {
    if (t.interno) return;
    const v = Number(t.valor) || 0;
    if (t.tipo === 'receita') a.in += v;
    else a.out += v;
  });
  a.net = a.in - a.out;
  return a;
}

export function mtx(state, k) {
  return (state.tx || []).filter(t =>
    t && t.date && t.date.slice(0, 7) === k && !t.pending
  );
}

export function months(state) {
  const by = {};
  (state.tx || []).forEach(t => {
    if (!t || !t.date || t.interno || t.pending) return;
    const k = t.date.slice(0, 7);
    by[k] = by[k] || { in: 0, out: 0, net: 0 };
    if (t.tipo === 'receita') by[k].in += t.valor;
    else by[k].out += t.valor;
    by[k].net = by[k].in - by[k].out;
  });
  return Object.keys(by).sort().map(k => ({ k, ...by[k] }));
}

export function pendingTotalsForMonth(state, k) {
  const rows = (state.tx || []).filter(t =>
    t && t.pending && !t.canceled && t.date && t.date.slice(0, 7) === k
  );
  const inn = rows.filter(t => t.tipo === 'receita').reduce((s, t) => s + (+t.valor || 0), 0);
  const out = rows.filter(t => t.tipo === 'despesa').reduce((s, t) => s + (+t.valor || 0), 0);
  return { in: inn, out: out, count: rows.length };
}

export function balance(state, k) {
  const ib = getInitialBalance(state, k);
  return ib + agg(state, k).net;
}

export function getInitialBalance(state, k) {
  const ib = (state.initialBalances || {})[k];
  if (ib && Number.isFinite(Number(ib.valor))) return Number(ib.valor);
  return 0;
}

export function balanceMonths(state) {
  const set = new Set();
  (state.tx || []).forEach(t => {
    if (t && t.date && !t.pending && !t.interno) set.add(t.date.slice(0, 7));
  });
  Object.keys(state.balances || {}).forEach(mk => {
    if (/^\d{4}-\d{2}$/.test(mk)) set.add(mk);
  });
  return [...set].sort();
}

export function runningBalance(state, k) {
  const all = balanceMonths(state);
  if (!all.length) {
    const v = state.balances && state.balances[k];
    return Number.isFinite(Number(v)) ? Number(v) : balance(state, k);
  }
  let run = getInitialBalance(state, all[0]);
  for (const mk of all) {
    if (mk > k) break;
    const ofx = state.balances && state.balances[mk];
    if (Number.isFinite(Number(ofx))) run = Number(ofx);
    else run += agg(state, mk).net;
  }
  return run;
}

export function calcScore(a) {
  if (!a || (a.in === 0 && a.out === 0)) return null;
  const sav = a.in > 0 ? a.net / a.in : (a.net >= 0 ? 1 : -1);
  let score = Math.round(Math.max(0, Math.min(100, 50 + sav * 200)));
  if (a.net < 0) score = Math.min(score, 44);
  return score;
}

export function detAvg(state, field, n = 6) {
  const ms = months(state).slice(-n);
  return ms.length ? ms.reduce((s, m) => s + (m[field] || 0), 0) / ms.length : 0;
}

export function detSeriesOut(state, n = 6) {
  return months(state).slice(-n).map(m => ({ label: m.k, val: m.out, tone: 'down' }));
}

export function detSeriesIn(state, n = 6) {
  return months(state).slice(-n).map(m => ({ label: m.k, val: m.in, tone: 'up' }));
}

export function detSeriesNet(state, n = 6) {
  return months(state).slice(-n).map(m => ({ label: m.k, val: m.net, tone: m.net >= 0 ? 'up' : 'down' }));
}
