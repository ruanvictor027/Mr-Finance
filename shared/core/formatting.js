// formatting.js — Funções de formatação e validação puras
// Extraídas do MRFinance IIFE principal

export const fmt = new Intl.NumberFormat('pt-BR', {style:'currency', currency:'BRL'});
export function money(v) { return fmt.format(Number(v) || 0); }

export function parseBRL(v) {
  if (v == null) return 0;
  let s = '' + v;
  s = s.replace(/R\$\s*/gi, '').trim();
  const neg = s.startsWith('(') && s.endsWith(')');
  if (neg) s = s.slice(1, -1);
  s = s.replace(/\./g, '').replace(',', '.');
  const n = parseFloat(s);
  return !Number.isFinite(n) ? 0 : neg ? -n : n;
}

export function parseMoneyInput(v) {
  if (v == null) return NaN;
  let s = ('' + v).trim();
  if (!s) return NaN;
  const neg = s.startsWith('-');
  if (neg) s = s.slice(1);
  s = s.replace(/[^\d,.]/g, '');
  if (!s) return neg ? -0 : 0;
  if (s.includes(',') && s.includes('.')) {
    if (s.lastIndexOf(',') > s.lastIndexOf('.'))
      s = s.replace(/\./g, '').replace(',', '.');
    else s = s.replace(/,/g, '');
  } else if (s.includes(',')) s = s.replace(',', '.');
  const n = parseFloat(s);
  return isNaN(n) ? (neg ? -0 : 0) : neg ? -n : n;
}

export function norm(s) {
  return (s == null ? '' : '' + s)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}

export function csvCell(v) {
  return '"' + String(v == null ? '' : v).replaceAll('"', '""') + '"';
}

export function shortDesc(s, max = 44) {
  s = (s == null ? '' : '' + s).replace(/\s+/g, ' ').trim();
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}

const STOP = new Set(['de', 'da', 'do', 'dos', 'das', 'e']);
export function titleName(s) {
  return (s || '').toLowerCase().split(' ').map((w, i) =>
    STOP.has(w) && i > 0 ? w : w.charAt(0).toUpperCase() + w.slice(1)
  ).join(' ').replace(/\bS A\b/g, 'S.A.').trim();
}

export function isCPF(s) { return /\u2022\u2022\u2022|\d{3}\.\d{3}\.\d{3}-/.test(s || ''); }
export function isCNPJ(s) { return /\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/.test(s || ''); }

export function addMonthsISO(dateStr, n) {
  if (!dateStr || typeof dateStr !== 'string') return '';
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1 + n, 1);
  const daysInMonth = new Date(dt.getFullYear(), dt.getMonth() + 1, 0).getDate();
  const dd = Math.min(d || 1, daysInMonth);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
}

export function daysUntil(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') return 0;
  const parts = dateStr.split('-').map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) return 0;
  const d = new Date(parts[0], parts[1] - 1, parts[2]);
  const t = new Date(); t.setHours(0, 0, 0, 0); d.setHours(0, 0, 0, 0);
  return Math.round((d - t) / (1000 * 60 * 60 * 24));
}

export function monthKey(d) {
  if (!(d instanceof Date) || isNaN(d.getTime())) return '';
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
}
