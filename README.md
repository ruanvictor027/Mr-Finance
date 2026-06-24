# MR Finance Mobile

App financeiro pessoal mobile, isolado do Desktop.

## Como usar

1. Abra `mobile.html` no browser do celular
2. Para instalar como PWA: Menu → "Adicionar à tela inicial"
3. Para testar no PC: abra `mobile.html` e use DevTools em modo mobile

## Estrutura

```
MRFinance-Mobile/
├── mobile.html              ← Entry point
├── mobile.css               ← Design system completo (dark/light)
├── mobile.js                ← Toda a lógica (router, páginas, CRUD)
├── manifest.webmanifest     ← PWA manifest
├── service-worker.js        ← Cache offline
├── icon-192.png             ← Ícone PWA (192px)
├── icon-512.png             ← Ícone PWA (512px)
└── shared/
    └── core/
        ├── formatting.js    ← money, parseBRL, norm, esc, etc.
        ├── calculations.js  ← agg, mtx, balance, score, etc.
        ├── categorization.js ← catOf, BASE_CATS, DRE_GROUPS
        ├── business-rules.js ← commitmentStatus, glPct, etc.
        ├── parsers.js       ← parseOFX, parseCSV, etc.
        ├── scoring.js       ← scoring engine conciliação
        └── state.js         ← CRUD state, persistência
```

## Funcionalidades (14 páginas)

| Página | Recursos |
|--------|----------|
| Início | Dashboard KPIs, donuts SVG, highlights, score, metas, patrimônio |
| Fluxo de Caixa | Equação, projeções 30/60/90d, timeline, diagnóstico |
| Transações | Lista, CRUD, filtros, busca, status |
| Lançamentos | Calendário, contas a pagar/receber, confirmar |
| Categorias | CRUD, busca, detalhe, grupos DRE |
| Metas | CRUD, aportes, progresso, conquistas |
| Análises | Score gauge, insights, ranking, comparativo |
| Relatórios | DRE 9 linhas, evolução, gauge, export CSV/JSON |
| Destino/Origem | Ranking categorias, percentuais |
| Conciliação | Scoring, matching, reconciliação manual/automática |
| Patrimônio | CRUD, evolução SVG, donut, export |
| Bancos | CRUD, saldos, transferências, conciliação saldo |
| Configurações | Tema, privacidade, backup, PWA, apagar dados |
| Mais | Menu de navegação |

## Tech Stack

- HTML/CSS/JS puro (sem frameworks)
- ESM modules (shared/core)
- SVG inline para gráficos
- localStorage para persistência
- Dark/Light theme via CSS custom properties
- Safe area inset para iPhone

## Testes

```bash
node test-mobile.js    # 256 asserts
```
