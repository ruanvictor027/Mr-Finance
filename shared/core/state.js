// state.js — Gerenciamento de state e persistência
// Extraído do MRFinance IIFE principal
// Substitui o acesso direto a `state` por uma interface limpa

export const DEFAULT_STATE = {
  tx: [],
  balances: {},
  initialBalances: {},
  goals: [],
  budgets: {},
  rules: {},
  patrimonio: [],
  customCats: [],
  catOverrides: {},
  catDreByType: {},
  reservePct: 50,
  reserveTarget: 0,
  reserveValor: 0,
  theme: 'dark',
  privacy: false,
  seenNotifications: false,
  catVer: 0,
};

const KEY = 'finania_v4_clean';

export function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (saved && typeof saved === 'object') {
      return { ...DEFAULT_STATE, ...saved };
    }
  } catch (e) {
    console.error('[state] loadState failed:', e);
  }
  return { ...DEFAULT_STATE };
}

export function saveState(state) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
    return true;
  } catch (e) {
    console.error('[state] saveState failed:', e);
    return false;
  }
}

export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export function createTransaction(overrides) {
  return {
    id: overrides.id || 'adj:' + uid(),
    date: '',
    tipo: 'despesa',
    valor: 0,
    desc: '',
    memo: '',
    cat: '',
    interno: false,
    pending: false,
    manual: false,
    canceled: false,
    status: '',
    paidAt: '',
    seriesId: '',
    installmentIndex: 1,
    installmentTotal: 1,
    originalDesc: '',
    originalCat: '',
    originalValor: 0,
    originalDate: '',
    fitid: '',
    note: '',
    recurring: false,
    account: '',
    editedManual: false,
    origin: null,
    splitFrom: '',
    ...overrides,
  };
}

export function createGoal(overrides) {
  return {
    id: overrides.id || uid(),
    name: '',
    target: 0,
    current: 0,
    icon: '🎯',
    color: '#7448ff',
    cat: '',
    date: '',
    desc: '',
    paused: false,
    doneAt: null,
    createdAt: new Date().toISOString(),
    contribs: [],
    ...overrides,
  };
}

export function createAsset(overrides) {
  return {
    id: overrides.id || 'pat:' + uid(),
    name: '',
    valor: 0,
    pcat: 'outros',
    date: '',
    desc: '',
    note: '',
    color: '#7448ff',
    icon: '📦',
    hist: [],
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

export function addTx(state, t) {
  if (!t || typeof t !== 'object') return null;
  if (!t.id) t.id = 'adj:' + uid();
  state.tx.push(t);
  return t.id;
}

export function confirmTx(state, id) {
  const t = state.tx.find(x => x && x.id === id);
  if (!t) return false;
  t.pending = false;
  t.status = t.tipo === 'receita' ? 'recebido' : 'pago';
  t.paidAt = new Date().toISOString();
  return true;
}

export function undoTx(state, id) {
  const t = state.tx.find(x => x && x.id === id);
  if (!t) return false;
  t.pending = true;
  t.status = 'pendente';
  delete t.paidAt;
  return true;
}

export function deleteTx(state, id) {
  const before = state.tx.length;
  state.tx = state.tx.filter(t => t && t.id !== id);
  return state.tx.length < before;
}

export function cancelParcela(state, id) {
  const t = state.tx.find(x => x && x.id === id);
  if (!t) return false;
  t.canceled = true;
  t.pending = false;
  t.status = 'cancelado';
  return true;
}

export function patchTx(state, id, patchOrFn) {
  const t = state.tx.find(x => x && x.id === id);
  if (!t) return false;
  if (typeof patchOrFn === 'function') patchOrFn(t);
  else Object.assign(t, patchOrFn);
  return true;
}

export function addGoal(state, data) {
  const g = createGoal(data);
  state.goals.push(g);
  return g.id;
}

export function deleteGoal(state, id) {
  state.goals = state.goals.filter(g => g.id !== id);
}

export function addAsset(state, data) {
  const a = createAsset(data);
  state.patrimonio.push(a);
  return a.id;
}

export function deleteAsset(state, id) {
  state.patrimonio = state.patrimonio.filter(a => a.id !== id);
}

export function setInitialBalance(state, value, k, account) {
  state.initialBalances = state.initialBalances || {};
  const key = k + '|' + (account || 'geral');
  state.initialBalances[key] = {
    valor: Number(value) || 0,
    mes: +k.slice(5, 7),
    ano: +k.slice(0, 4),
    conta: account || 'geral',
    atualizado_em: new Date().toISOString(),
  };
}

export function getInitialBalance(state, k, account) {
  state.initialBalances = state.initialBalances || {};
  const key = k + '|' + (account || 'geral');
  const rec = state.initialBalances[key];
  if (rec && Number.isFinite(Number(rec.valor))) return Number(rec.valor);
  return 0;
}
