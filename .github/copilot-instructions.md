# Copilot Instructions — pdv

> **Toda comunicação com o usuário deve ser em português (pt-BR).**

## ⚠️ Leitura obrigatória — agentes e sub-agentes

> **Todo agente que atuar neste projeto DEVE ler os arquivos abaixo como primeira ação, antes de implementar qualquer coisa:**
>
> 1. `C:\Users\Cleiton\Documents\Projetos\contexto.md`
> 2. `C:\Users\Cleiton\Documents\Projetos\pdv\.github\copilot-instructions.md` (este arquivo)
>
> Esses arquivos contêm os **preceitos arquiteturais, convenções e restrições** que devem ser respeitados em toda implementação. Implementar sem ler = risco de violação de padrão.

## O que é este projeto

App PDV (Ponto de Venda) autônomo do sistema **ComercialIA**. Construído com **Tauri 2 + React 19 + TypeScript**. Roda como desktop nativo no Windows, consumindo a API `ComercialIA.Server` na porta **9000**. É lançado pelo `frontend` (ERP principal) passando args na linha de comando.

Stack: Tauri 2 (Rust shell) · React 19 · TypeScript 5 · Vite · Tailwind CSS v4 · TanStack Query v5 · React Hook Form + Zod · Vitest + RTL + MSW

---

## Comandos

```powershell
cd "C:\Users\Cleiton\Documents\Projetos\pdv"

npm run tauri dev    # App Tauri completo em dev (porta 1421)
npm run dev          # Apenas Vite (sem janela nativa)
npm run build        # tsc + vite build
npm run tauri build  # Build nativo de produção

npm test             # Vitest (CI mode, uma vez)
npm run test:watch   # Vitest em modo watch

# Rodar um único arquivo de teste
npx vitest run src/pages/PDVPage.test.tsx
```

> ⚠️ **ANTES DE QUALQUER BUILD** — verificar se o processo está rodando:
> ```powershell
> $proc = Get-Process | Where-Object { $_.Path -like "*pdv*" }
> if ($proc) { Stop-Process -Id $proc.Id -Force; Start-Sleep -Seconds 2 }
> ```

**Estado atual: 106 testes, 0 falhas ✅** (7 suites: `escpos`, `tef`, `PDVPage`, `LicencaPage`, `AberturaTurnoPage`, `ModalValorParcial`, `ModalTroco`)

---

## Arquitetura

### Fluxo de lançamento

O `frontend` lança o executável passando args:
```
pdv.exe --auth-token=<jwt> --estabelecimento=<id> --licenca=<chave>
```
`App.tsx` chama o comando Tauri `get_launch_args` → injeta no `localStorage` → inicia o fluxo de validação.

### Roteamento por estado

**Sem React Router.** Controlado pelo `useState<TelaAtiva>` em `App.tsx`:

```
validando_licenca → aguardando_turno → tela_pdv ⟷ sangria
                                               ⟷ fechamento
                                               ⟷ config_pdv
```

Tipo `TelaAtiva` definido em `src/types/pdv.ts`.

### Estrutura

```
src/
├── pages/          ← Uma página por estado (LicencaPage, PDVPage, etc.)
├── hooks/          ← useTEF.ts (TEF/PINPAD state machine)
├── services/
│   ├── api.ts      ← Wrapper fetch: JWT Bearer auto-inject + interceptor 401
│   ├── escpos.ts   ← Protocolo ESC/POS (funções puras, sem efeitos)
│   ├── tef.ts      ← Tipos + ITefProvider + utils TEF
│   ├── tefMock.ts  ← MockTefProvider (desenvolvimento/testes)
│   ├── tefSitef.ts ← SiTefProvider (skeleton produção)
│   ├── serial.ts   ← Wrappers de invoke() para comandos Tauri seriais
│   └── logger.ts   ← Logging via invoke() Tauri (grava em %APPDATA%)
├── types/pdv.ts    ← Interfaces: LicencaPDV, TurnoCaixa, ItemCarrinho, PagamentoCarrinho, TelaAtiva
├── lib/auth.ts     ← UsuarioPDV, getUsuarioLogado(), isAutenticado(), logout()
└── App.tsx         ← Roteador de estado + parseLaunchArgs()
src-tauri/src/
└── lib.rs          ← Comandos Tauri: get_launch_args, list_serial_ports,
                       print_escpos, open_cash_drawer, read_scale_once,
                       get_log_dir, append_log_line
```

---

## Comandos Tauri (Rust → TypeScript)

Todos expostos via `invoke()`:

| Comando | Descrição |
|---------|-----------|
| `get_launch_args` | Args CLI passados pelo ERP (retorna `string[]`) |
| `list_serial_ports` | Lista portas COM disponíveis |
| `print_escpos(port_name, baud_rate, data)` | Envia bytes ESC/POS à impressora serial |
| `open_cash_drawer(port_name, baud_rate)` | Pulso `ESC p 0 25 250` para abrir gaveta |
| `read_scale_once(port_name, baud_rate)` | Lê uma linha ASCII da balança (Toledo/DP, timeout 2s) |
| `get_log_dir` | Retorna `%APPDATA%/pdvia/logs/` |
| `append_log_line(filename, line)` | Acrescenta linha ao arquivo de log |

---

## TEF / PINPAD

A abstração central é a interface `ITefProvider` (`src/services/tef.ts`):

```typescript
interface ITefProvider {
  iniciar(valor: number, tipo: TipoTransacaoTEF, parcelas?: number): Promise<TransacaoTEF>;
  confirmar(id: string): Promise<TransacaoTEF>;  // chamar APÓS salvar a venda
  cancelar(id: string): Promise<TransacaoTEF>;
  consultar(id: string): Promise<TransacaoTEF>;
}
```

**Regra crítica:** `confirmar()` deve ser chamado **somente após** o POST `/vendas` ter retornado 201. Se a venda falhar, chamar `cancelar()`.

**Valores em centavos:** toda transação TEF usa centavos internamente. Usar `reaisParaCentavos()` / `centavosParaReais()` de `services/tef.ts`.

**Config no localStorage:** chave `pdv:config:tef` — carregar com `carregarConfigTEF()`, salvar com `salvarConfigTEF()`. Provider padrão é `mock`.

**Fluxo no hook `useTEF`:** lê a config, instancia o provider correto via factory interna `criarProvider()`. O provider é cacheado em `useRef` durante o ciclo de vida do componente.

---

## ESC/POS

`src/services/escpos.ts` é **puro** (sem efeitos colaterais, sem `invoke`). Exporta:
- Constantes de comandos: `CMD_INIT`, `CMD_CUT`, `CMD_ALIGN_*`, `CMD_BOLD_*`, etc.
- Funções de formatação: `formatarCupom(dados)` → `number[]` (bytes prontos para `print_escpos`)
- Codificação CP850 para caracteres acentuados do português

Para imprimir: gerar bytes com `escpos.ts` → passar para `print_escpos` via `invoke`.

---

## localStorage — chaves usadas

| Chave | Conteúdo |
|-------|----------|
| `token` | JWT Bearer |
| `usuario` | JSON de `UsuarioPDV` |
| `pdv:licencaChave` | Chave de licença injetada via arg |
| `pdv:estabelecimento` | ID do estabelecimento (string) |
| `pdv:licenca` | Objeto `LicencaPDV` serializado |
| `pdv:turnoId` | ID do turno ativo |
| `pdv:config:tef` | JSON de `ConfigTEF` |

---

## Convenções TypeScript

- **Sem React.FC** — funções com tipagem explícita no retorno
- **Error handling:** `catch (err: unknown) { err instanceof Error ? err.message : "..." }`
- **Tailwind CSS v4** — sem `tailwind.config.js`, configurado via `@import "tailwindcss"` no CSS; dark mode via classe `.dark` no `<html>`
- **`cn()`** de `lib/utils.ts` para classes condicionais (clsx + tailwind-merge)
- **TanStack Query** com `staleTime: 30_000` como padrão global (configurado no `queryClient` de `App.tsx`)
- **Alias `@/`** aponta para `src/` (configurado no `vite.config.ts`)

---

## Testes (Vitest + RTL + MSW)

**Setup global** (`src/test/setup.ts`):
- `@tauri-apps/api/core` é mockado automaticamente (`invoke` retorna `[]`)
- `localStorage.clear()` antes de cada teste

**MSW handlers** centralizados em `src/test/mocks/handlers.ts`. API base: `http://localhost:9000`.

**Padrão obrigatório em testes de página:**

```typescript
import { server } from "@/test/mocks/server";
import { http, HttpResponse } from "msw";

beforeAll(() => server.listen({ onUnhandledRequest: "warn" }));
afterEach(() => { server.resetHandlers(); localStorage.clear(); vi.clearAllMocks(); });
afterAll(() => server.close());

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <XxxPage {...props} />
    </QueryClientProvider>
  );
}
```

- **Nunca** usar `@/test/utils` — não existe. Sempre `QueryClient + QueryClientProvider` diretamente.
- Para sobrescrever um handler em um teste específico: `server.use(http.get(...))` dentro do `it()`.
- `invoke` do Tauri **não funciona** em jsdom — sempre mockado via `vi.mock("@tauri-apps/api/core", ...)`.

---

## Integração com o ERP (frontend)

- O ERP detecta se o estabelecimento tem licença PDV via `GET /licencas-pdv/estabelecimento/:id`
- Se sim, exibe botão "Abrir PDV" que lança o executável `pdv.exe` com os args de auth
- O PDV é completamente autônomo — não depende do ERP para funcionar após lançado

---

## Regras de workflow

- **Sem push autônomo** — 0 falhas + aprovação explícita antes de `git push`
- **Commits:** `feat:`, `fix:`, `refactor:`, `test:` + descrição em português
- **Co-authored-by:** `Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>`
- **Nunca `Stop-Process -Name`** — sempre `Stop-Process -Id <PID> -Force`

---

## Roadmap futuro do PDV

### 🔴 Fase 1 — Crítico
- **Integração tabela de preços**: ao buscar produto, verificar se cliente tem tabela de preços vinculada e aplicar preço especial
- **Grade de produtos**: seleção de variação (cor/tamanho) no carrinho após scan de código de barras

### 🟡 Fase 2 — Importante
- **PIX via TEF**: integração com PSP para pagamento PIX no caixa (QR Code na tela)
- **NFCe automática**: emissão de NFCe ao concluir venda (sem intervenção manual)
- **Fila de atendimento**: modo balcão com múltiplos clientes em espera

### 🔵 Fase 3 — Diferenciação
- **Delivery integrado**: receber pedidos online diretamente no PDV
- **Balança de check-out**: integração balança serial ao fechar carrinho
