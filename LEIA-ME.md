# MR Finance — App instalável (PWA → .apk Android)

Esta pasta é o **app pronto para hospedar e instalar**. É uma cópia do `MR Finance.html` transformada em **PWA** (instalável, funciona offline). Tudo continua **local**: seus dados ficam só no aparelho (localStorage), nada vai para servidor.

```
MR-Finance-App/
├─ index.html              ← o app (com as tags de PWA)
├─ manifest.webmanifest    ← nome, ícones, cor, tela cheia
├─ service-worker.js       ← cache offline
├─ icons/                  ← ícone do app (192 e 512)
└─ vendor/                 ← pdf.js local (import de PDF funciona offline)
```

> ✅ Testado: instalável, service worker ativo, **recarrega sem internet**, import de PDF offline, sem erros de console.

---

## Passo 1 — Hospedar de graça (precisa de um link HTTPS)

O Android só instala um PWA a partir de um endereço **https://**. Escolha UMA opção:

### Opção A — Netlify Drop (mais fácil, sem conta técnica)
1. Acesse **https://app.netlify.com/drop**
2. **Arraste a pasta `MR-Finance-App` inteira** para a área indicada.
3. Em segundos você recebe um link tipo `https://algum-nome.netlify.app`.
4. Pronto — esse é o link do seu app. (Crie uma conta grátis se quiser que o link não expire.)

### Opção B — GitHub Pages
1. Crie um repositório no GitHub e suba o **conteúdo** desta pasta (o `index.html` na raiz).
2. Settings → Pages → Branch `main` / `/root` → Save.
3. O link fica `https://SEU-USUARIO.github.io/SEU-REPO/`.

### Opção C — Testar antes na rede Wi-Fi de casa (sem publicar)
No PC, dentro desta pasta:
```
python -m http.server 8077
```
No celular (mesma Wi-Fi), abra `http://IP-DO-PC:8077/`.
*(Observação: para “Adicionar à tela inicial” virar app de tela cheia e o offline funcionar 100%, o ideal é o link https das opções A/B. Em http simples o service worker não registra, só em `localhost` ou `https`.)*

---

## Passo 2 — Gerar o `.apk` (Android) no PWABuilder
1. Abra **https://www.pwabuilder.com**
2. Cole o **link https** do Passo 1 e clique **Start**.
3. Ele analisa o app (manifest, service worker, ícones) — deve passar verde.
4. Clique **Package For Stores → Android**.
5. Em opções, pode deixar o padrão (Package ID ex.: `app.netlify.mrfinance.twa`). Clique **Generate**.
6. Baixe o `.zip` e dentro dele o **`.apk`** (use o `*-signed.apk` se houver; senão o `app-release-unsigned`/o que o guia indicar).

## Passo 3 — Instalar no Android
1. Mande o `.apk` para o celular (cabo, Google Drive, WhatsApp Web…).
2. Abra o arquivo no Android → ele pedirá para permitir **“instalar de fontes desconhecidas”** (Configurações → permitir para o app que está abrindo, ex.: Arquivos/Chrome).
3. Instale. O **MR Finance** aparece na gaveta de apps, com ícone próprio, em tela cheia.

> O `.apk` do PWABuilder é um “TWA”: o app abre o seu link hospedado por baixo. Por isso o **link precisa continuar no ar** (Netlify/GitHub Pages são grátis e permanentes). Os **dados ficam no aparelho**, não no link.

---

## iPhone (sem .apk)
A Apple não permite `.apk`, e gerar `.ipa` exige conta Apple paga. Mas dá para instalar como app mesmo assim:
1. Abra o **link https** no **Safari**.
2. Toque em **Compartilhar** → **Adicionar à Tela de Início**.
3. Vira um ícone que abre em tela cheia, com dados persistentes.

---

## Seus dados (importante)
- Ficam **só neste aparelho** (localStorage da origem). Cada celular/navegador tem a sua base; **não sincroniza** sozinho.
- Para **passar dados entre aparelhos** (ou fazer backup): no app, **Configurações → Exportar backup completo (JSON)** e, no outro, **Importar backup**.
- **Não desinstale** sem exportar antes, e evite “limpar dados do app/navegador”: isso apaga a base. O backup JSON é a sua rede de segurança.

## Atualizar o app depois
1. Editou o `MR Finance.html` original? Rode novamente o gerador para recriar o `index.html` desta pasta:
   ```
   node ".claude/build_pwa.mjs"
   ```
2. **Suba a versão do cache**: em `service-worker.js`, troque `mrfinance-v1` por `mrfinance-v2` (assim o app pega a nova versão).
3. Reenvie a pasta para o host (re-arrasta no Netlify / novo push no GitHub). O app instalado atualiza sozinho na próxima abertura online.

## Observações
- **Offline:** o app, o pdf.js e os ícones são cacheados → abre sem internet. As **fontes (Google Fonts)** vêm de CDN; sem internet o app usa fontes do sistema (visual quase idêntico). Para 100% offline das fontes, dá para embutí-las também — me peça se quiser.
- **OFX/CSV** funcionam offline desde sempre; **PDF** agora também (pdf.js local).
