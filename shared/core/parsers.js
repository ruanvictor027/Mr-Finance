// parsers.js — Parsers de importação e deduplicação
// Extraídos do MRFinance IIFE principal
import { norm } from './formatting.js';

export function splitCsvLine(line, sep = ',') {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"' && line[i + 1] === '"') { current += '"'; i++; }
      else if (c === '"') inQuotes = false;
      else current += c;
    } else {
      if (c === '"') inQuotes = true;
      else if (c === sep) { result.push(current); current = ''; }
      else current += c;
    }
  }
  result.push(current);
  return result;
}

export function parseCsvDate(v) {
  if (!v) return '';
  let s = ('' + v).trim();
  let m;
  if ((m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/))) return `${m[1]}-${m[2]}-${m[3]}`;
  if ((m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/))) return `${m[3]}-${m[2]}-${m[1]}`;
  if ((m = s.match(/^(\d{2})\/(\d{2})\/(\d{2})$/))) {
    const y = 2000 + (+m[3]);
    return `${y}-${m[2]}-${m[1]}`;
  }
  return '';
}

export function parseMoney(v) {
  if (v == null) return 0;
  let s = ('' + v).replace(/R\$\s*/gi, '').trim();
  if (!s) return 0;
  const neg = s.startsWith('(') && s.endsWith(')');
  if (neg) s = s.slice(1, -1);
  s = s.replace(/\./g, '').replace(',', '.');
  const n = parseFloat(s);
  return !Number.isFinite(n) ? 0 : neg ? -n : n;
}

export function txContentKey(t) {
  return [t.tipo, t.cat, t.date, (+t.valor || 0).toFixed(2), t.installmentIndex || 1, norm(t.desc || t.memo || '')].join('|');
}

export function txKey(t) {
  return [t.id, t.date, t.tipo, norm(t.desc || t.memo || ''), (+t.valor || 0).toFixed(2), t.cat].join('|');
}

export function impKey(t) {
  if (t.fitid) return 'ofx:' + t.fitid;
  return [t.date, (+t.originalValor || +t.valor || 0).toFixed(2), t.tipo, norm(t.originalDesc || t.desc || ''), t.account || ''].join('|');
}

export function impLoose(t) {
  return [t.date, (+t.originalValor || +t.valor || 0).toFixed(2), t.tipo].join('|');
}

export function impIsEdited(t) {
  if (!t) return false;
  return t.desc !== t.originalDesc || t.cat !== t.originalCat || t.note || t.editedManual;
}

// parseOFX: parser completo de extratos OFX/OFC
export function parseOFX(text) {
  if (!text || typeof text !== 'string') return [];
  const txs = [];
  const blocks = text.split(/<STMTTRN>/i);
  blocks.shift();
  for (const b of blocks) {
    const get = (tag) => { const m = b.match(new RegExp('<' + tag + '>([^<]*)', 'i')); return m ? m[1].trim() : ''; };
    const fitid = get('FITID');
    const dtposted = get('DTPOSTED');
    const trnamt = get('TRNAMT');
    const memo = get('MEMO') || get('NAME') || '';
    const acctid = get('ACCTID') || '';
    const amt = parseMoney(trnamt);
    if (!Number.isFinite(amt) || !dtposted) continue;
    let date = '';
    const dm = dtposted.match(/(\d{4})(\d{2})(\d{2})/);
    if (dm) date = `${dm[1]}-${dm[2]}-${dm[3]}`;
    if (!date) continue;
    txs.push({
      id: 'ofx:' + (fitid || (Date.now().toString(36) + Math.random().toString(36).slice(2, 7))),
      date, tipo: amt >= 0 ? 'receita' : 'despesa',
      valor: Math.abs(amt), desc: memo,
      memo, cat: '', fitid, account: acctid,
      pending: false, interno: false, manual: false,
      originalDesc: memo, originalCat: '', originalValor: Math.abs(amt),
      originalDate: date, canceled: false, status: '',
      paidAt: '', installmentIndex: 1, installmentTotal: 1, seriesId: '',
      recurring: false, note: '', editedManual: false
    });
  }
  return txs;
}

// parseCSV: parser completo de CSV
export function parseCSV(text) {
  if (!text || typeof text !== 'string') return [];
  text = text.replace(/^\uFEFF/, '');
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return [];
  const sep = lines[0].split(';').length > lines[0].split(',').length ? ';' : ',';
  const headers = splitCsvLine(lines[0], sep).map(h => h.trim().toLowerCase());
  const txs = [];
  for (let i = 1; i < lines.length; i++) {
    const vals = splitCsvLine(lines[i], sep);
    const obj = {};
    headers.forEach((h, idx) => { obj[h] = (vals[idx] || '').trim(); });
    const date = obj.data || obj.date || '';
    const valor = parseMoney(obj.valor || obj.value || obj.amount || '0');
    const tipo = obj.tipo || obj.type || (valor >= 0 ? 'receita' : 'despesa');
    if (!date || !Number.isFinite(valor)) continue;
    txs.push({
      id: 'csv:' + (Date.now().toString(36) + Math.random().toString(36).slice(2, 7)),
      date: parseCsvDate(date), tipo: tipo,
      valor: Math.abs(valor), desc: obj.descricao || obj.desc || obj.memo || obj.description || '',
      memo: obj.memo || obj.descricao || '',
      cat: obj.categoria || obj.cat || '',
      pending: false, interno: false, manual: false,
      originalDesc: obj.descricao || obj.desc || '', originalCat: '',
      originalValor: Math.abs(valor), originalDate: parseCsvDate(date),
      canceled: false, status: '', paidAt: '',
      installmentIndex: 1, installmentTotal: 1, seriesId: '',
      recurring: false, note: '', editedManual: false
    });
  }
  return txs;
}
