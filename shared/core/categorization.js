// categorization.js — Motor de categorização e regras de negócio
import { norm } from './formatting.js';

// BASE_CATS — 17 categorias padrão
export const BASE_CATS = [
  {id:'salario',name:'Salário',icon:'💼',type:'receita',kw:['salario','pagamento recebido','folha','provento','remuneracao','ruan victor vargas porto']},
  {id:'rendimentos',name:'Rendimentos e cashback',icon:'📈',type:'receita',kw:['rendimento','juros sobre','cashback']},
  {id:'reembolso',name:'Reembolsos e estornos',icon:'↩️',type:'receita',kw:['reembolso','estorno']},
  {id:'recebidos',name:'Pix/Transf. recebidos',icon:'💸',type:'receita',kw:['pix recebido','recebida pelo pix','transferencia recebida','ted recebida','doc recebida','deposito recebido','boleto']},
  {id:'pessoas',name:'Pessoas e Pix',icon:'👥',kw:[]},
  {id:'mercado',name:'Alimentação e mercado',icon:'🛒',kw:['mercado','supermercado','padaria','panif','3marias','hortifruti','mercearia','restaurante','spoleto','outback','cacau show','coisas do cacau','burger','burguer','pizzaria','pizza','zamp','acai','lanche','salgados','foodhouse','food house','copao','bar do','bar e restaurante','distribuidora alemao','extrabom','casagran','massaggio','bacio','di latte','comida','parrilla','viladelli','ifood','padoca','padocas','padaria','panificadora','roque do coco','gc food','gabiel']},
  {id:'servicos',name:'Serviços e assinaturas',icon:'🧩',kw:['dlocal','okx','servicos digitais','3rz','stark bank','transfero','asaas','flagship','gowd','quality automacao','kiwify','google','apple','microsoft','latam gateway','pix marketplace','marketplace','shpp brasil','iugu','cosmeticos','inovar']},
  {id:'lazer',name:'Compras e lazer',icon:'✨',kw:['loja','shopping','amazon','mercadolivre','mercado livre','netflix','spotify','cinema','redecine','academia','pro life','imports','kennedy','metal boulevard','livraria','presente']},
  {id:'fatura',name:'Fatura do cartão',icon:'💳',kw:['fatura','pagamento de fatura','cartao de credito']},
  {id:'emprestimos_receita',name:'Empréstimos recebidos',icon:'💸',type:'receita',dreGroup:'receita_variavel',kw:['resgate de emprestimo','emprestimo recebido','empréstimo recebido','recebimento de emprestimo']},
  {id:'emprestimos_despesa',name:'Empréstimos pagos',icon:'💰',type:'despesa',dreGroup:'despesas_fixas',kw:['emprestimo','empréstimo','parcela emprestimo','pagamento emprestimo']},
  {id:'transporte',name:'Transporte',icon:'🚗',kw:['uber','99pop','99 app','posto','auto posto','combustivel','shell','ipiranga','frogpay','estacionamento','leo motos','narciso','postoleme','brasil park','brasilpark']},
  {id:'saude',name:'Saúde',icon:'💊',kw:['farmacia','drogaria','drogasil','vila farma','cibien','marconi','rocha e vilela','hospital','medic','clinica','laboratorio','saude']},
  {id:'moradia',name:'Casa e contas',icon:'🏠',kw:['internet','vivo','claro','telefonica','energia','enel','cemig','agua','aluguel','condominio']},
  {id:'investimentos',name:'Investimentos',icon:'🏦',kw:['aplicacao rdb','resgate rdb','rdb','cofrinho','caixinha','investimento','aplicacao','aplicação']},
  {id:'saque',name:'Saque',icon:'🏧',kw:['saque']},
  {id:'outros',name:'Outros',icon:'📦',kw:[]}
];

export const BASE_CAT_IDS = new Set(BASE_CATS.map(c => c.id));

export const DRE_GROUPS = [
  {id:'receita_bruta',name:'Receita Bruta',desc:'Entradas que aumentam a receita'},
  {id:'receita_fixa',name:'Receita Fixa',desc:'Entradas recorrentes ou previsíveis'},
  {id:'receita_variavel',name:'Receita Variável',desc:'Entradas não recorrentes ou variáveis'},
  {id:'deducoes',name:'Deduções',desc:'Tarifas, impostos, taxas e encargos'},
  {id:'despesas_fixas',name:'Despesas Fixas',desc:'Gastos recorrentes/necessários'},
  {id:'despesas_variaveis',name:'Despesas Variáveis',desc:'Gastos variáveis do mês'},
  {id:'fora_dre',name:'Não entra no DRE',desc:'Movimentos internos ou patrimoniais'}
];

export function defaultDreGroup(id, type) {
  if (['salario','rendimentos'].includes(id)) return 'receita_fixa';
  if (['reembolso','recebidos','emprestimos_receita'].includes(id) || type === 'receita') return 'receita_variavel';
  if (['servicos','moradia','fatura','emprestimos_despesa'].includes(id)) return 'despesas_fixas';
  if (['investimentos'].includes(id)) return 'despesas_variaveis';
  return 'despesas_variaveis';
}

export function sanitizeCatId(name) {
  let base = norm(name).replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '').slice(0, 36) || 'categoria';
  let id = 'custom_' + base, i = 2;
  const allIds = new Set(BASE_CATS.map(c => c.id));
  while (allIds.has(id)) { id = 'custom_' + base + '_' + (i++); allIds.add(id); }
  return id;
}

export function isInterno(m) {
  return m.includes('aplicacao rdb') || m.includes('resgate rdb') || /\brdb\b/.test(m) || m.includes('cofrinho') || m.includes('caixinha');
}

export function catTypeOf(id, cats) {
  const c = (cats || []).find(x => x.id === id);
  return c && c.type ? c.type : 'despesa';
}

export function catById(id, cats) {
  return (cats || []).find(c => c.id === id) || (cats || []).find(c => c.id === 'outros') || (cats || [(cats||[])[(cats||[]).length-1]])[(cats||[]).length-1];
}

const STOP = new Set(['de','da','do','dos','das','e']);
export function titleName(s) {
  return (s||'').toLowerCase().split(' ').map((w,i) =>
    STOP.has(w) && i > 0 ? w : w.charAt(0).toUpperCase() + w.slice(1)
  ).join(' ').replace(/\bS A\b/g,'S.A.').trim();
}

export function cleanEntity(s) {
  s = (s || '').replace(/\s+/g, ' ').trim();
  s = s.split(/ - (?:•|\d{2}\.\d{3}\.\d{3})/)[0].trim();
  s = s.replace(/\b(Ag[eê]ncia|Conta)\b.*$/i, '').trim();
  s = s.replace(/^(MP|PAYGO|FROGPAY|JIM\.COM|PG|PIX|IUGU|PAGSEGURO|MERCADOPAGO|MERCADO PAGO)\s*\*\s*/i, '');
  s = s.replace(/^\d{2}\.\d{3}\.\d{3}(?:\/\d{4}-\d{2})?\s*-?\s*/, '');
  s = s.replace(/^\d{8,}\s+/, '').replace(/\s+\d{8,}$/, '');
  s = s.replace(/[\s\-*]+$/, '').trim();
  return titleName(s || '(sem descricao)');
}

const PREFIXES = /^(Compra (?:no d[eé]bito|no cr[eé]dito|parcelada no cr[eé]dito)(?: via NuPay)?|Transfer[eê]ncia (?:enviada|recebida)(?: pelo Pix)?|Pix (?:enviado|recebido)|Reembolso recebido(?: pelo Pix)?|Dep[oó]sito Recebido por Boleto|Estorno)\s*-\s*/i;

export function merchantName(memo) {
  let raw = (memo || '').replace(/\s+/g, ' ').trim();
  const n = norm(raw);
  if (n.includes('pagamento de fatura')) return 'Pagamento de fatura';
  if (n.includes('resgate de emprestimo')) return 'Resgate de empréstimo';
  if (n.includes('aplicacao rdb') || (n.includes('aplicacao') && /\brdb\b/.test(n))) return 'Aplicação na reserva';
  if (n.includes('resgate rdb')) return 'Resgate da reserva';
  if (/^saque/.test(n)) return 'Saque';
  if (n.includes('valor adicionado') && n.includes('cartao')) return 'Entrada via cartão de crédito';
  const stripped = raw.replace(PREFIXES, '').trim();
  return cleanEntity(stripped || raw || memo || '(sem descricao)');
}

export function catOf(memo, tipo, cats, rules) {
  const m = norm(memo), d = norm(merchantName(memo));
  if (rules && rules[d]) {
    const r = (cats || []).find(c => c.id === rules[d]);
    if (r) return r;
  }
  if (isInterno(m)) return (cats || []).find(c => c.id === 'investimentos');
  if (m.includes('pagamento de fatura')) return (cats || []).find(c => c.id === 'fatura');
  if (m.includes('resgate de emprestimo') || m.includes('emprestimo'))
    return (cats || []).find(c => c.id === (tipo === 'receita' ? 'emprestimos_receita' : 'emprestimos_despesa'));
  if (/(^| )saque/.test(m)) return (cats || []).find(c => c.id === 'saque');
  if (m.includes('reembolso') || m.startsWith('estorno')) return (cats || []).find(c => c.id === 'reembolso');
  const list = (cats || []).filter(c => !c.interno && (!c.type || c.type === tipo));
  const hit = list.find(c => c.kw.some(k => { const nk = norm(k); return nk && d.includes(nk); }));
  if (hit) return hit;
  if (tipo === 'receita') return (cats || []).find(c => c.id === (m.includes('ruan victor') ? 'salario' : 'recebidos'));
  if (m.includes('enviada pelo pix') || m.includes('pix enviado') || m.includes('transferencia enviada'))
    return (cats || []).find(c => c.id === (m.includes('cnpj') || /\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/.test(memo) ? 'outros' : 'pessoas'));
  return (cats || []).find(c => c.id === 'outros');
}

export function applyCategorySettings(state) {
  const cats = BASE_CATS.map(c => ({...c, kw: [...(c.kw || [])], dreGroup: c.dreGroup || defaultDreGroup(c.id, c.type)}));
  const overrides = (state.catOverrides && typeof state.catOverrides === 'object') ? state.catOverrides : {};
  Object.entries(overrides).forEach(([id, ov]) => {
    const c = cats.find(x => x.id === id);
    if (c && ov) {
      if (ov.name) c.name = ov.name;
      if (ov.icon) c.icon = ov.icon;
      if ('type' in ov) c.type = ov.type || undefined;
      if (Array.isArray(ov.kw)) c.kw = ov.kw;
      if ('dreGroup' in ov) c.dreGroup = ov.dreGroup || defaultDreGroup(c.id, c.type);
      if ('inactive' in ov) c.inactive = !!ov.inactive;
    }
  });
  (state.customCats || []).forEach(c => {
    if (!c || !c.id || !c.name || cats.some(x => x.id === c.id)) return;
    cats.splice(Math.max(0, cats.length - 1), 0, {
      id: c.id, name: c.name, icon: c.icon || '🏷️', type: c.type || undefined,
      kw: Array.isArray(c.kw) ? c.kw : [],
      dreGroup: c.dreGroup || defaultDreGroup(c.id, c.type),
      custom: true, inactive: !!c.inactive
    });
  });
  return cats;
}
