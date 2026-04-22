# pdv-comercial

> Aplicação PDV (Ponto de Venda) autônoma para o sistema **ComercialIA**, construída com Tauri 2 + React 19 + TypeScript.  
> Roda como app desktop nativo no Windows, comunicando-se com o backend **Spring Boot 3.5** (Java 25 + PostgreSQL 17) na porta `9000` e com o microserviço fiscal Pascal/ACBr na porta `9001` (via backend).

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

**Estado atual: 135 testes, 0 falhas ✅** (10 suites — v75)

Cobertura inclui: ESC/POS, TEF (mock + backend + sitef esqueleto), PDVPage com split payment, NFCe automática, ModalPixPdv (PSP/PIX), comprovante TEF 2 vias, validação de licença, abertura de turno.

> ⚠️ **Bug ambiente local conhecido:** `vitest` falha com `ERR_REQUIRE_ESM` em `html-encoding-sniffer` no Windows local. CI funciona normalmente. Workaround em investigação (Sprint C.3 do roadmap).

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
- Abstração `ITefProvider` com três provedores:
  - `MockTefProvider` — simulação local para desenvolvimento e testes
  - `BackendTefProvider` (**recomendado em produção**) — delega ao backend Spring que orquestra com fiscal/ACBrTEF (ver ADR-0008)
  - `SiTefProvider` (esqueleto) — integração futura com `intSiTef.dll` (Windows)
- Hook `useTEF` para gerenciamento do fluxo TEF (debito, crédito, voucher)
- `TEFModal` — UI de interação durante transação TEF
- Configuração TEF na tela `ConfigPDVPage`
- Suporte a parcelamento em cartão de crédito
- **Regra crítica:** `confirmar(id)` só após `POST /vendas` retornar `201` (ver ADR-0008)
- **Comprovante ESC/POS em 2 vias** (estabelecimento + cliente)

### PDV-5 — Multi-pagamento com NSU
- Carrinho de pagamentos com múltiplas formas (dinheiro + TEF + vale + PIX)
- Persistência de NSU, código de autorização, bandeira e tipo de transação
- Tabela `VENDAS_PAGAMENTOS` no backend Spring (PostgreSQL)
- Auditoria TEF em `TRANSACOES_TEF` (V26)
- Dados TEF propagados do `tef.transacao` → `PagamentoCarrinho` → `POST /vendas`

### PDV-6 — NFCe automática
- Após `POST /vendas` retornar `201`, o backend dispara emissão NFCe via fiscal
- Falha de emissão **não bloqueia a venda** (operador continua atendendo)
- Cupom ESC/POS recebe rodapé com chave NFCe + QR code consulta SEFAZ

### PDV-7 — PIX via PSP (PIX online no balcão)
- `ModalPixPdv` — gera QR code PIX via backend (PSP EFÍ/MercadoPago — ver ADR-0007)
- Polling de status até confirmação ou timeout
- Confirmação dispara conclusão da venda

### PDV-8 — PIX via PINPAD (F2.13, no roadmap Sprint C)
- Roteamento de PIX via PINPAD usando enum TEF + QR no display
- Aguarda implementação real do provider Stone/SiTef

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

- **backend** (Spring Boot 3.5 + Java 25 + PostgreSQL 17) na porta `9000`
- Operações fiscais delegadas ao microserviço **fiscal** (Free Pascal + ACBr) na porta `9001` via backend
- `src/services/api.ts` injeta automaticamente o JWT Bearer em toda requisição
- Resposta `401` → limpa localStorage → redireciona ao login

### Lançamento via ERP

O ERP (`frontend`) lança o `pdv.exe` passando args CLI:
```
pdv.exe --auth-token=<jwt> --estabelecimento=<id> --licenca=<chave>
```

`App.tsx` chama `get_launch_args` (comando Tauri) → injeta no `localStorage` → inicia validação de licença.

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

- [backend](https://github.com/ProCleiton/backend) — Backend Spring Boot 3.5 + PostgreSQL 17 (porta 9000)
- [fiscal](https://github.com/ProCleiton/fiscal) — Microserviço Free Pascal + ACBr (porta 9001) — emissão NFe/NFCe/CTe + TEF + SPED EFD
- [frontend](https://github.com/ProCleiton/frontend) — ERP principal Tauri (lança este app)
- [comercialia-meta](https://github.com/ProCleiton/comercialia-meta) — Documentação central (ADRs, runbooks, roadmap, contexto)
  - **ADR-0008** — Arquitetura TEF (PDV → Spring → fiscal → PINPAD)
  - **ADR-0007** — PSP factory + criptografia AES-256-GCM

---

*Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>*
