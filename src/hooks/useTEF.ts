import { useState, useCallback, useRef } from "react";
import {
  carregarConfigTEF,
  CONFIG_TEF_PADRAO,
  reaisParaCentavos,
  type TransacaoTEF,
  type TipoTransacaoTEF,
  type StatusTransacaoTEF,
  type ITefProvider,
} from "@/services/tef";
import { MockTefProvider } from "@/services/tefMock";
import { SiTefProvider } from "@/services/tefSitef";
import { BackendTefProvider } from "@/services/BackendTefProvider";
import { logInfo, logError } from "@/services/logger";
import type { UsuarioPDV } from "@/lib/auth";

// ─── Factory de provider ──────────────────────────────────────────────────────

function criarProvider(): ITefProvider {
  const cfg = carregarConfigTEF() ?? CONFIG_TEF_PADRAO;
  if (cfg.provider === "sitef") {
    return new SiTefProvider({
      endpoint: cfg.endpointSitef,
      codigoEstabelecimento: cfg.codigoEstabelecimentoSitef,
      codigoTerminal: cfg.codigoTerminalSitef,
      timeoutMs: cfg.timeoutSegundos * 1000,
    });
  }
  if (cfg.provider === "backend") {
    return new BackendTefProvider({
      codigoEstabelecimento: cfg.codigoEstabelecimentoBackend,
    });
  }
  return new MockTefProvider();
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export interface UseTEFResult {
  /** Transação em andamento (null quando idle) */
  transacao: TransacaoTEF | null;
  status: StatusTransacaoTEF;
  /** Inicia o fluxo TEF para um valor e tipo de pagamento */
  iniciarPagamento: (valor: number, tipo: TipoTransacaoTEF, parcelas?: number) => Promise<TransacaoTEF>;
  /** Confirma (finaliza) a transação após salvar a venda */
  confirmar: () => Promise<TransacaoTEF>;
  /** Cancela a transação em andamento */
  cancelar: () => Promise<void>;
  /**
   * Estorna transação pós-confirmação (reversal).
   * Requer idTransacao do backend — use após venda já confirmada.
   */
  estornar: (idTransacao: string) => Promise<TransacaoTEF>;
  /** Reseta o estado para idle (após exibir resultado ao usuário) */
  reset: () => void;
  /** Indica se o TEF está configurado (algum provider ativo) */
  temTEF: boolean;
  /**
   * Verifica se uma forma de pagamento deve acionar o TEF.
   * Compara com a lista codigosFormasPagamentoTEF da config.
   */
  ehPagamentoTEF: (codigoFormaPagamento: number) => boolean;
}

export function useTEF(usuario: UsuarioPDV): UseTEFResult {
  const [transacao, setTransacao] = useState<TransacaoTEF | null>(null);
  const [status, setStatus] = useState<StatusTransacaoTEF>("idle");
  const providerRef = useRef<ITefProvider | null>(null);

  function getProvider(): ITefProvider {
    if (!providerRef.current) {
      providerRef.current = criarProvider();
    }
    return providerRef.current;
  }

  const cfg = carregarConfigTEF() ?? CONFIG_TEF_PADRAO;
  const temTEF = cfg.codigosFormasPagamentoTEF.length > 0 || cfg.provider !== "mock";

  function ehPagamentoTEF(codigoFormaPagamento: number): boolean {
    const c = carregarConfigTEF() ?? CONFIG_TEF_PADRAO;
    return c.codigosFormasPagamentoTEF.includes(codigoFormaPagamento);
  }

  const iniciarPagamento = useCallback(
    async (valor: number, tipo: TipoTransacaoTEF, parcelas = 1): Promise<TransacaoTEF> => {
      setStatus("iniciando");
      try {
        const provider = getProvider();
        const tx = await provider.iniciar(valor, tipo, parcelas);
        setTransacao(tx);
        setStatus(tx.status);
        await logInfo("TEF", usuario.login, "tef_iniciado", `valor=${valor} tipo=${tipo}`);
        return tx;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Erro ao iniciar TEF";
        setStatus("erro");
        await logError("TEF", usuario.login, "tef_erro_iniciar", msg);
        throw err;
      }
    },
    [usuario.login]
  );

  const confirmar = useCallback(async (): Promise<TransacaoTEF> => {
    if (!transacao) throw new Error("Nenhuma transação TEF em andamento");
    setStatus("processando");
    try {
      const provider = getProvider();
      const txFinal = await provider.confirmar(transacao.id);
      setTransacao(txFinal);
      setStatus(txFinal.status);
      if (txFinal.status === "aprovado") {
        await logInfo("TEF", usuario.login, "tef_aprovado", `nsu=${txFinal.nsu} aut=${txFinal.codigoAutorizacao}`);
      } else {
        await logInfo("TEF", usuario.login, "tef_recusado", txFinal.mensagemOperador);
      }
      return txFinal;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erro ao confirmar TEF";
      setStatus("erro");
      await logError("TEF", usuario.login, "tef_erro_confirmar", msg);
      throw err;
    }
  }, [transacao, usuario.login]);

  const cancelar = useCallback(async (): Promise<void> => {
    if (!transacao) return;
    try {
      const provider = getProvider();
      const txCancelada = await provider.cancelar(transacao.id);
      setTransacao(txCancelada);
      setStatus("cancelado");
      await logInfo("TEF", usuario.login, "tef_cancelado", `id=${transacao.id}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erro ao cancelar TEF";
      await logError("TEF", usuario.login, "tef_erro_cancelar", msg);
      setStatus("erro");
    }
  }, [transacao, usuario.login]);

  const estornar = useCallback(async (idTransacao: string): Promise<TransacaoTEF> => {
    setStatus("processando");
    try {
      const provider = getProvider();
      const txEstornada = await provider.estornar(idTransacao);
      setTransacao(txEstornada);
      setStatus("estornado");
      await logInfo("TEF", usuario.login, "tef_estornado", `id=${idTransacao}`);
      return txEstornada;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erro ao estornar TEF";
      await logError("TEF", usuario.login, "tef_erro_estornar", msg);
      setStatus("erro");
      throw err;
    }
  }, [usuario.login]);

  const reset = useCallback(() => {
    setTransacao(null);
    setStatus("idle");
    providerRef.current = null; // força recriação do provider (reload config)
  }, []);

  // Sincroniza status com a transação quando ela muda externamente
  const statusAtual = transacao?.status ?? status;

  return {
    transacao,
    status: statusAtual,
    iniciarPagamento,
    confirmar,
    cancelar,
    estornar,
    reset,
    temTEF,
    ehPagamentoTEF,
  };
}

/** Helper: retorna a descrição legível do status para exibir ao operador. */
export function descricaoStatusTEF(status: StatusTransacaoTEF): string {
  const map: Record<StatusTransacaoTEF, string> = {
    idle: "",
    iniciando: "Iniciando...",
    aguardando_cartao: "Aguardando cartão...",
    aguardando_senha: "Aguardando senha...",
    processando: "Processando...",
    aprovado: "Aprovado ✓",
    recusado: "Recusado ✗",
    cancelado: "Cancelado",
    estornado: "Estornado",
    erro: "Erro de comunicação",
  };
  return map[status] ?? status;
}

/** Helper: cor CSS de acordo com o status. */
export function corStatusTEF(status: StatusTransacaoTEF): string {
  if (status === "aprovado") return "var(--success)";
  if (status === "recusado" || status === "erro") return "var(--destructive)";
  if (status === "cancelado" || status === "estornado") return "var(--muted-foreground)";
  return "var(--foreground)";
}

/** Centavos para label de exibição "R$ X,XX" */
export function labelValorTEF(centavos: number): string {
  return "R$ " + (centavos / 100).toFixed(2).replace(".", ",");
}

// Exporta o tipo de centavos pra uso externo
export { reaisParaCentavos };
