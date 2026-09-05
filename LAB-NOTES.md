# Product Brain Lab — Notas de laboratório

Este arquivo é da nossa camada de laboratório (Product Brain Lab). **Não faz parte do
IDURAR original.** Serve para registrar decisões, ajustes locais e bugs encontrados
no produto durante a montagem do ambiente.

Base do laboratório: IDURAR ERP/CRM, release estável **4.1.1** (tag `4.1.1`,
commit `82ff5d1b`, publicada em 2026-03-16). Branch de trabalho: `lab/4.1.1`.

---

## Como rodar o laboratório localmente

Pré-requisitos já resolvidos nesta máquina: `fnm` instalado e ligado no perfil do
PowerShell; Node `20.9.0` + npm `10.2.4` instalados via `fnm`; `backend/.env.local`
com a `DATABASE` do MongoDB Atlas; dependências instaladas nos dois lados.

Precisa de **dois terminais** (o `fnm` seleciona o Node 20.9.0 sozinho ao entrar na pasta):

```powershell
# Terminal 1 - backend (API em http://localhost:8888)
cd C:\product-brain-lab\idurar-erp-crm\backend
npm run dev

# Terminal 2 - frontend (UI em http://localhost:3000)
cd C:\product-brain-lab\idurar-erp-crm\frontend
npm run dev
```

Abrir `http://localhost:3000` e logar com **`admin@admin.com` / `admin123`**
(usuário de demonstração criado pelo `npm run setup`).

Recriar os dados de demonstração do zero: `cd backend; npm run reset; npm run setup`.

---

## Ajustes locais aplicados (não alteram regra de negócio)

| # | Ajuste | Onde | Motivo |
|---|--------|------|--------|
| 1 | `.node-version` = `20.9.0` | raiz do repo | O IDURAR declara `"node": "20.9.0"` no `engines` de `backend/package.json` e `frontend/package.json`, mas não versiona `.nvmrc`/`.node-version`. Arquivo só registra a mesma versão para o `fnm` selecionar automaticamente. Commitado. |
| 2 | `git update-index --skip-worktree` em `backend/.env` e `frontend/.env` | índice local do Git | O IDURAR versiona esses `.env` (com valores de exemplo) e o `.gitignore` só ignora `.env.local`. Como nosso fork é público, isso protege contra commit acidental de segredos. Config local, reversível com `--no-skip-worktree`. |
| 3 | Segredos reais em `backend/.env.local` | máquina local, **fora do Git** (`.gitignore`) | O `backend/src/server.js` carrega `.env` e depois `.env.local`. A chave `DATABASE` vem comentada no `.env`, então o valor do `.env.local` é o que vale. Contém a connection string do MongoDB Atlas. |

---

## BUG-001 — Scripts de setup/reset do IDURAR referenciam modelos removidos

**Status:** **corrigido no laboratório** em 2026-09-05 (Opção 1). Upstream continua quebrado.
**Afeta:** release 4.1.1 **e** `master` atual do upstream (não corrigido lá).
**Gravidade:** média. Impedia `npm run setup` e `npm run reset` de completarem. O
runtime do app **não** era afetado.

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

### Correção aplicada (Opção 1)

Mudança **mínima**: retiradas apenas as referências aos modelos `PaymentMode` e
`Taxes` (arquivos que o próprio upstream apagou). Nenhuma regra de negócio alterada
— o que saiu foi seed de módulos inexistentes. Cada trecho removido tem comentário
`[Product Brain Lab / BUG-001]` no lugar.

- `backend/src/setup/setup.js` — removidos os `require` e os `insertMany` de Taxes/PaymentMode; o script agora chega em "Setup completed :Success!".
- `backend/src/setup/reset.js` — removidos os `require` e os `deleteMany` de Taxes/PaymentMode.
- `backend/src/controllers/coreControllers/setup.js` — removidos os `mongoose.model('PaymentMode'/'Taxes')` e os `insertMany` correspondentes.

Observações fora do escopo desta correção (não tocadas):
- `backend/src/controllers/coreControllers/setup.js` usa `Joi` sem importar (bug latente próprio).
- `package.json` tem script `upgrade` → `src/setup/upgrade.js`, mas esse arquivo não existe no repo.

### Arquivos que estavam quebrados (na 4.1.1 e no master)

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

### Decisão

Escolhida a **Opção 1** (correção mínima + re-setup limpo). Ver "Correção aplicada" acima.
Fica pendente, se quisermos: abrir PR para o IDURAR upstream com a mesma correção.

### Referência

- Commit da remoção: `git show 3518aee2`
- Comparar: `git show 4.1.1:backend/src/setup/setup.js`
