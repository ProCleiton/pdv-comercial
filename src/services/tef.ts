/**
 * TEF — Tipos e interface abstrata para integração com PINPAD.
 *
 * A arquitetura é baseada em providers intercambiáveis:
 *   MockTefProvider  → desenvolvimento/testes (sem hardware)
 *   SiTefProvider    → produção via HTTP bridge local (intSiTef.dll service)
 *
 * Fluxo básico:
 *   1. iniciar(valor, tipo) → TransacaoTEF com id
 *   2. Usuário passa o cartão / digita senha no PINPAD
 *   3. confirmar(id) → TransacaoTEF com status aprovado/recusado
 *   4. Em caso de erro: cancelar(id)
 */

// ─── Enums ────────────────────────────────────────────────────────────────────

export type TipoTransacaoTEF =
  | "debito"
  | "credito_vista"
  | "credito_parcelado_loja"
  | "credito_parcelado_adm"
  | "pix"
  | "voucher";

export type StatusTransacaoTEF =
  | "idle"
  | "iniciando"
  | "aguardando_cartao"
  | "aguardando_senha"
  | "processando"
  | "aprovado"
  | "recusado"
  | "cancelado"
  | "erro";

export type BandeiraTEF =
  | "Visa"
  | "Master"
  | "Elo"
  | "Amex"
  | "Hipercard"
  | "Cabal"
  | "Pix"
  | "Voucher"
  | "Desconhecida";

// ─── Interfaces ───────────────────────────────────────────────────────────────

export interface TransacaoTEF {
  /** ID local único gerado pelo provider */
  id: string;
  /** Valor em centavos (ex: R$10,50 → 1050) */
  valorCentavos: number;
  tipo: TipoTransacaoTEF;
  status: StatusTransacaoTEF;
  /** Mensagem de status para exibir ao operador (vinda do PINPAD ou provider) */
  mensagemOperador: string;
  /** Mensagem de status para exibir ao cliente (se display disponível) */
  mensagemCliente?: string;
  /** Número de parcelas (1 para débito/vista) */
  parcelas: number;
  /** Bandeira do cartão (preenchida após aprovação) */
  bandeira?: BandeiraTEF;
  /** NSU (Número Sequencial Único) do autorizador */
  nsu?: string;
  /** Código de autorização */
  codigoAutorizacao?: string;
  /** Data/hora da transação (ISO 8601) */
  dtTransacao?: string;
  /** Dados completos para impressão do comprovante TEF */
  dadosImpressao?: string[];
}

export interface ConfigTEF {
  /** Provider selecionado */
  provider: "mock" | "sitef" | "backend";
  /** Endpoint da bridge SiTef (ex: http://localhost:4096) */
  endpointSitef: string;
  /** Código do estabelecimento no SiTef */
  codigoEstabelecimentoSitef: string;
  /** Código do terminal no SiTef */
  codigoTerminalSitef: string;
  /** Timeout de operação em segundos */
  timeoutSegundos: number;
  /**
   * Código do estabelecimento para o BackendTefProvider.
   * Obrigatório quando provider === "backend".
   */
  codigoEstabelecimentoBackend: number;
  /**
   * IDs das formas de pagamento do sistema que devem acionar o fluxo TEF.
   * Ex: [2, 3] → "Cartão Débito" e "Cartão Crédito" acionam o PINPAD.
   * Formas fora dessa lista continuam com o fluxo direto (dinheiro, PIX manual, etc.)
   */
  codigosFormasPagamentoTEF: number[];
}

/** Interface que todos os providers TEF devem implementar. */
export interface ITefProvider {
  /** Inicia uma transação. Retorna a transação no estado aguardando_cartao. */
  iniciar(valor: number, tipo: TipoTransacaoTEF, parcelas?: number): Promise<TransacaoTEF>;
  /**
   * Confirma a transação (equivale a "finalizar" no SiTef).
   * Deve ser chamado após a venda ser salva com sucesso.
   */
  confirmar(id: string): Promise<TransacaoTEF>;
  /** Cancela/desfaz a transação (antes da confirmação). */
  cancelar(id: string): Promise<TransacaoTEF>;
  /** Consulta o status atual de uma transação em andamento. */
  consultar(id: string): Promise<TransacaoTEF>;
}

// ─── Utils ────────────────────────────────────────────────────────────────────

/** Converte valor em reais para centavos (inteiro). */
export function reaisParaCentavos(valor: number): number {
  return Math.round(valor * 100);
}

/** Converte centavos para reais. */
export function centavosParaReais(centavos: number): number {
  return centavos / 100;
}

/** Gera um ID de transação local simples. */
export function gerarIdTransacao(): string {
  return `TEF-${Date.now()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
}

/** Carrega a config TEF do localStorage. Retorna null se não configurado. */
export function carregarConfigTEF(): ConfigTEF | null {
  try {
    const raw = localStorage.getItem("pdv:config:tef");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/** Salva a config TEF no localStorage. */
export function salvarConfigTEF(cfg: ConfigTEF): void {
  localStorage.setItem("pdv:config:tef", JSON.stringify(cfg));
}

/** Config padrão para desenvolvimento (provider mock). */
export const CONFIG_TEF_PADRAO: ConfigTEF = {
  provider: "mock",
  endpointSitef: "http://localhost:4096",
  codigoEstabelecimentoSitef: "",
  codigoTerminalSitef: "001",
  timeoutSegundos: 60,
  codigoEstabelecimentoBackend: 0,
  codigosFormasPagamentoTEF: [],
};
