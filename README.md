# pdv-comercial

> Aplicação PDV (Ponto de Venda) autônoma para o sistema **ComercialIA**, construída com Tauri 2 + React 19 + TypeScript.  
> Roda como app desktop nativo no Windows, comunicando-se com a API `ComercialIA.Server` na porta `9000`.

---

## Stack tecnológica

| Camada | Tecnologia | Versão |
|--------|-----------|--------|
| Shell nativo | **Tauri 2** (Rust) | 2.x |
| UI framework | **React** | 19 |
| Linguagem | **TypeScript** | 5.x |
| Build tool | **Vite** | 5.x |
| Estilo | **Tailwind CSS v4** | 4.x |
| Componentes | **shadcn/ui** pattern | — |
| Estado servidor | **TanStack Query** | v5 |
| Formulários | **React Hook Form + Zod** | — |
| Testes | **Vitest + React Testing Library** | — |
| Comunicação serial | **serialport** (via Node.js) | — |

---

## Pré-requisitos

- [Node.js](https://nodejs.org/) 22+
- [Rust](https://rustup.rs/) 1.85+ (`rustup default stable`)
- [Visual Studio Build Tools 2022](https://visualstudio.microsoft.com/visual-cpp-build-tools/) com "Desktop development with C++"
- Windows SDK 10 (22621+)
- Backend `ComercialIA.Server` rodando na porta **9000**
- Licença PDV cadastrada para o estabelecimento

---

## Como rodar

```powershell
# Instalar dependências
npm install

# Modo desenvolvimento Tauri (abre janela nativa com HMR)
npm run tauri dev

# Apenas frontend Vite (sem janela nativa)
npm run dev

# Build para produção
npm run tauri build
```

> O Vite serve o frontend em `http://localhost:1421`.  
> O Rust compila a shell nativa na primeira execução (~2 min); as seguintes são incrementais.

---

## Testes automatizados

```powershell
npm test             # execução única (CI)
npm run test:watch   # modo watch
```

**Estado atual: 76 testes, 0 falhas ✅** (5 suites)

| Suite | Testes | Descrição |
|-------|--------|-----------|
| `escpos.test.ts` | 34 | Protocolo ESC/POS — comandos impressora, gaveta, formatação |
| `tef.test.ts` | 21 | TEF/PINPAD — Mock provider, SiTef skeleton, hook useTEF |
| `PDVPage.test.tsx` | 10 | Tela principal PDV — carrinho, pagamentos, finalização, NSU |
| `LicencaPage.test.tsx` | 6 | Validação de licença PDV |
| `AberturaTurnoPage.test.tsx` | 5 | Abertura de turno de caixa |

---

## Funcionalidades implementadas

### PDV-1 — Licença e Turno de Caixa
- Validação de licença PDV por estabelecimento (endpoint `/licencas-pdv`)
- Abertura e fechamento de turno de caixa (`/turnos-caixa`)
- Registro de sangrias durante o turno (`/sangrias`)
- Tela de abertura de turno com fundo/troco

### PDV-2 — Scaffold e Roteamento
- Estrutura base do app PDV independente
- Roteamento por estado (`paginaAtiva`) — sem React Router
- Layout PDV com sidebar e área de conteúdo

### PDV-3 — Hardware Serial
- Protocolo **ESC/POS** completo (impressão de cupom fiscal/recibo)
- Controle de **gaveta** de dinheiro via pulso serial
- Leitura de **balança** serial (protocolo Toledo/DP)
- Abstração `IEscPosDevice` para múltiplos provedores (serial, USB, rede)

### PDV-4 — TEF/PINPAD
- Abstração `ITefProvider` com dois provedores:
  - `MockTefProvider` — simulação local para desenvolvimento e testes
  - `SiTefProvider` (skeleton) — preparado para integração com SiTef real
- Hook `useTEF` para gerenciamento do fluxo TEF (debito, crédito, PIX, voucher)
- `TEFModal` — UI de interação durante transação TEF
- Configuração TEF na tela `ConfigPDVPage`
- Suporte a parcelamento em cartão de crédito

### PDV-5 — Multi-pagamento com NSU
- Carrinho de pagamentos com múltiplas formas (dinheiro + TEF + vale)
- Persistência de NSU, código de autorização, bandeira e tipo de transação
- Tabela `VENDAS_PAGAMENTOS` no backend (migration `schema_pdv_pagamentos.sql`)
- Dados TEF propagados do `tef.transacao` → `PagamentoCarrinho` → POST `/vendas`

---

## Arquitetura

### Estrutura de pastas

```
pdv-comercial/
├── src-tauri/              ← Shell Rust (tauri.conf.json, capabilities, lib.rs)
│   └── src/
│       └── lib.rs          ← Comandos Tauri
└── src/
    ├── components/
    │   └── ui/             ← Button, Input, Card, Badge (shadcn/ui pattern)
    ├── hooks/
    │   └── useTEF.ts       ← Hook TEF/PINPAD (TanStack Query + state machine)
    ├── pages/
    │   ├── LicencaPage.tsx         ← Validação de licença PDV
    │   ├── AberturaTurnoPage.tsx   ← Abertura de turno
    │   ├── PDVPage.tsx             ← Tela principal (carrinho + pagamentos)
    │   └── ConfigPDVPage.tsx       ← Configurações (impressora, TEF, serial)
    ├── services/
    │   ├── api.ts          ← Wrapper fetch: JWT Bearer auto-inject
    │   ├── escpos.ts       ← Protocolo ESC/POS (comandos impressora/gaveta/balança)
    │   └── tef.ts          ← Tipos + providers TEF/PINPAD
    ├── types/
    │   └── pdv.ts          ← Interfaces: ProdutoPDV, PagamentoCarrinho, TurnoCaixa
    └── App.tsx             ← Roteador de estado
```

### Comunicação com o backend

- **ComercialIA.Server** (Free Pascal + Horse) na porta `9000` — reaproveitado do ERP
- `src/services/api.ts` injeta automaticamente o JWT Bearer em toda requisição
- Resposta `401` → limpa localStorage → redireciona ao login

### Fluxo de pagamento TEF

```
[Operador seleciona TEF] → useTEF.iniciar() → ITefProvider.iniciar()
       → [MockTefProvider simula / SiTefProvider comunica PINPAD]
       → TransacaoTEF { nsu, codigoAutorizacao, bandeira, tipoTransacao }
       → handleTEFFechar() → PagamentoCarrinho (com NSU)
       → finalizarVenda() → POST /vendas { pagamentos: [...] }
       → InserirPagamentos() → VENDAS_PAGAMENTOS (Firebird)
```

---

## Integração com o frontend ERP

O app PDV pode ser aberto diretamente do **frontend-comercial-v2** (ERP principal) quando o estabelecimento possui licença PDV cadastrada. O botão "Abrir PDV" na sidebar do ERP lança o executável `pdv-comercial`.

---

## Workflow de desenvolvimento

```
main (produção)
  └── feat/pdv6-simuladores  ← branch de trabalho atual
```

**Regra:** Jamais commitar diretamente em `main`. Toda mudança vai para branch → PR → aprovação → merge.

---

## Relacionado

- [ComercialIA.Server](https://github.com/ProCleiton/comercial-ia-server) — API REST Free Pascal + Horse (porta 9000)
- [frontend-comercial-v2](https://github.com/ProCleiton/frontend-comercial-v2) — ERP principal (lança este app)

---

*Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>*
