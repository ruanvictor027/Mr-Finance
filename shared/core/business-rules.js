// business-rules.js — Regras de negócio e modelos de dados
import { daysUntil, norm } from './formatting.js';
import { agg, months, pendingTotalsForMonth } from './calculations.js';
import { catById, defaultDreGroup, BASE_CATS } from './categorization.js';

export function commitmentStatus(t) {
  if (t.canceled) return { label: 'Cancelado', cls: 'due-cancel' };
  if (!t.pending) return t.tipo === 'receita'
    ? { label: 'Recebido', cls: 'due-ok' }
    : { label: 'Pago', cls: 'due-ok' };
  if (!t.date) return { label: 'Em dia', cls: 'due-ok' };
  const d = daysUntil(t.date);
  if (d < 0) return { label: 'Atrasado', cls: 'due-bad' };
  if (d === 0) return { label: 'Vence hoje', cls: 'due-soon' };
  if (d === 1) return { label: 'Vence amanhã', cls: 'due-info' };
  if (d <= 7) return { label: 'Próx. 7 dias', cls: 'due-info' };
  if (d <= 30) return { label: 'Próx. 30 dias', cls: 'due-info' };
  return { label: 'Em dia', cls: 'due-ok' };
}

export function glPct(g) { return g.target > 0 ? Math.min(100, Math.round(g.current / g.target * 100)) : 0; }
export function glDone(g) { return g.target > 0 && g.current >= g.target; }
export function glColor(pct) {
  if (pct >= 100) return '#22c55e';
  if (pct >= 76) return '#a855f7';
  if (pct >= 51) return '#3b82f6';
  if (pct >= 26) return '#f97316';
  return '#ef4444';
}

export function glAutoConclude(goals) {
  let changed = false;
  goals.forEach(g => {
    const pct = glPct(g);
    if (pct >= 100 && !g.doneAt) { g.doneAt = new Date().toISOString(); changed = true; }
    else if (pct < 100 && g.doneAt) { delete g.doneAt; changed = true; }
  });
  return changed;
}

export function assetsTotal(patrimonio) {
  return (patrimonio || []).reduce((s, a) => s + (Number(a.valor) || 0), 0);
}

export function ptVariation(a) {
  if (!a.hist || a.hist.length < 2) return null;
  const curr = Number(a.hist[a.hist.length - 1].valor) || 0;
  const prev = Number(a.hist[a.hist.length - 2].valor) || 0;
  if (prev <= 0) return null;
  return ((curr - prev) / prev) * 100;
}

export function recurringKey(t) {
  const m = norm(t.memo);
  if (m.includes('pagamento de fatura')) return 'fatura';
  if (m.includes('resgate de emprestimo') || m.includes('emprestimo')) return 'emprestimo';
  if (/(^| )saque/.test(m)) return 'saque';
  return t.cat + ':' + norm(t.desc);
}
