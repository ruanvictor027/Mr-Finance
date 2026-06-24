// scoring.js — Engine de scoring de conciliação bancária
// Extraído do MRFinance IIFE principal (L5408-5430)
import { norm } from './formatting.js';

export function daysBetween(a, b) {
  if (!a || !b) return 999;
  const da = new Date(a + 'T00:00:00'), db = new Date(b + 'T00:00:00');
  if (isNaN(da) || isNaN(db)) return 999;
  return Math.round(Math.abs(da - db) / 86400000);
}

export function digits(s) {
  const n = (s || '').replace(/\D/g, '');
  if (n.length >= 11) return n;
  return '';
}

export function descSim(a, b) {
  const sa = new Set(norm(a).split(/\s+/));
  const sb = new Set(norm(b).split(/\s+/));
  if (!sa.size || !sb.size) return 0;
  let inter = 0;
  sa.forEach(w => { if (sb.has(w)) inter++; });
  return inter / Math.max(sa.size, sb.size);
}

export function crit(b, l) {
  const vb = +(b.valor || 0), vl = +(l.valor || 0);
  const valor = vb === vl;
  const tipo = b.tipo === l.tipo;
  const dd = daysBetween(b.date, l.date);
  const sim = descSim(b.desc || b.memo || '', l.desc || l.memo || '');
  const doc = !!(digits(b.desc || b.memo || '') && digits(b.desc || b.memo || '') === digits(l.desc || l.memo || ''));
  return { valor, tipo, dd, sim, doc };
}

export function score(b, l) {
  let p = 0;
  const c = crit(b, l);
  const dv = Math.abs((+b.valor || 0) - (+l.valor || 0));
  const base = Math.max(Math.abs(+b.valor || 0), 1);
  
  if (c.valor) p += 40;
  else if (dv <= base * 0.05) p += 28;
  else if (dv <= base * 0.15) p += 14;
  
  if (c.tipo) p += 20;
  
  if (c.dd <= 1) p += 20;
  else if (c.dd <= 3) p += 14;
  else if (c.dd <= 7) p += 8;
  
  if (c.sim >= 0.5) p += 20;
  else if (c.sim >= 0.25) p += 12;
  else if (c.sim > 0) p += 5;
  
  if (c.doc) p += 10;
  
  return Math.min(100, Math.round(p));
}

export function klass(p) {
  if (p >= 90) return 'alta';
  if (p >= 70) return 'media';
  return 'baixa';
}

export function klassLabel(k) {
  return k === 'alta' ? 'Alta confiança' : k === 'media' ? 'Média confiança' : 'Baixa confiança';
}