# Product Brain Lab — Notas de laboratório

Este arquivo é da nossa camada de laboratório (Product Brain Lab). **Não faz parte do
IDURAR original.** Serve para registrar decisões, ajustes locais e bugs encontrados
no produto durante a montagem do ambiente.

Base do laboratório: IDURAR ERP/CRM, release estável **4.1.1** (tag `4.1.1`,
commit `82ff5d1b`, publicada em 2026-03-16). Branch de trabalho: `lab/4.1.1`.

---

## Ajustes locais aplicados (não alteram regra de negócio)

| # | Ajuste | Onde | Motivo |
|---|--------|------|--------|
| 1 | `.node-version` = `20.9.0` | raiz do repo | O IDURAR declara `"node": "20.9.0"` no `engines` de `backend/package.json` e `frontend/package.json`, mas não versiona `.nvmrc`/`.node-version`. Arquivo só registra a mesma versão para o `fnm` selecionar automaticamente. Commitado. |
| 2 | `git update-index --skip-worktree` em `backend/.env` e `frontend/.env` | índice local do Git | O IDURAR versiona esses `.env` (com valores de exemplo) e o `.gitignore` só ignora `.env.local`. Como nosso fork é público, isso protege contra commit acidental de segredos. Config local, reversível com `--no-skip-worktree`. |
| 3 | Segredos reais em `backend/.env.local` | máquina local, **fora do Git** (`.gitignore`) | O `backend/src/server.js` carrega `.env` e depois `.env.local`. A chave `DATABASE` vem comentada no `.env`, então o valor do `.env.local` é o que vale. Contém a connection string do MongoDB Atlas. |

---

## BUG-001 — Scripts de setup/reset do IDURAR referenciam modelos removidos

**Status:** identificado, **ainda não corrigido** (decisão adiada — "só documentar por enquanto").
**Afeta:** release 4.1.1 **e** `master` atual do upstream (não corrigido lá).
**Gravidade:** média. Impede `npm run setup` e `npm run reset` de completarem. O
runtime do app **não** é afetado.

### Sintoma

```
$ npm run setup
👍 Admin created : Done!
👍 Settings created : Done!
🚫 Error! The Error info is below
Error: Cannot find module '../models/appModels/PaymentMode'
    at setupApp (.../backend/src/setup/setup.js:54:25)
  code: 'MODULE_NOT_FOUND'
```

### Causa raiz

O commit **`3518aee2`** ("init update", autor `Salah <lalami.sdn@gmail.com>`,
2025-07-27) removeu três módulos do IDURAR — **Quote** (orçamentos), **Taxes**
(impostos) e **PaymentMode** (formas de pagamento) — apagando modelos e controllers:

- `backend/src/models/appModels/PaymentMode.js` → deletado
- `backend/src/models/appModels/Taxes.js` → deletado
- `backend/src/models/appModels/Quote.js` → deletado
- `backend/src/controllers/appControllers/paymentModeController/` → deletado
- `backend/src/controllers/appControllers/taxesController/` → deletado
- `backend/src/controllers/appControllers/quoteController/` → deletado

O wiring dinâmico de rotas (`backend/src/models/utils/index.js`, que faz `globSync`
dos modelos existentes) foi ajustado, então o app sobe sem essas telas. Mas os
scripts de manutenção continuam com `require()` fixo para os modelos apagados.

### Arquivos ainda quebrados (na 4.1.1 e no master)

| Arquivo | Comando/rota | Linhas problemáticas |
|---------|--------------|----------------------|
| `backend/src/setup/setup.js` | `npm run setup` | `require('../models/appModels/PaymentMode')`, `require('../models/appModels/Taxes')` + os respectivos `insertMany` |
| `backend/src/setup/reset.js` | `npm run reset` | mesmos dois `require` no topo de `deleteData()` |
| `backend/src/controllers/coreControllers/setup.js` | `POST /api/setup` | `mongoose.model('PaymentMode')`, `mongoose.model('Taxes')` |

(`backend/src/setup/upgrade.js` não verificado em detalhe — pode ter o mesmo padrão.)

### Impacto real

- O **app roda normalmente**. As rotas `/api/taxes/*` e `/api/paymentMode/*`
  simplesmente não existem mais; não há erro de inicialização.
- O `npm run setup` deixou de inserir apenas dois registros-semente
  (`Tax 0%` e `Default Payment`) que pertenciam a módulos que não existem mais.
- A criar/validar depois: se a tela de **criação de fatura (Invoice)** ainda espera
  um imposto padrão para funcionar. `backend/src/models/appModels/Invoice.js` tem
  campo de taxRate — verificar se quebra sem um Tax default.

### Estado atual do banco `idurar` (MongoDB Atlas)

Após o `npm run setup` parcial:

- ✅ `admins` — 1 doc (`admin@admin.com`, senha `admin123`)
- ✅ `adminpasswords` — 1 doc
- ✅ `settings` — settings padrão inseridas
- ❌ `taxes` — não criada (módulo removido)
- ❌ `paymentmodes` — não criada (módulo removido)

### Opções de tratamento (decisão pendente)

1. **Correção mínima + re-setup limpo (recomendada):** remover de `setup.js` e
   `reset.js` as referências aos modelos apagados (código morto, não é regra de
   negócio); apagar o banco meio-populado; rodar `npm run setup` até o fim; commit
   pequeno identificado como correção de bug do upstream; opcionalmente abrir PR
   para o IDURAR.
2. **Não modificar o IDURAR; contornar por fora:** subir o app com o admin/settings
   que já existem e conviver com os scripts quebrados.
3. **Só documentar (atual):** registrar aqui e no Confluence; decidir depois, antes
   de rodar o app.

### Referência

- Commit da remoção: `git show 3518aee2`
- Comparar: `git show 4.1.1:backend/src/setup/setup.js`
