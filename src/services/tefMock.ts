/**
 * MockTefProvider — provider TEF para desenvolvimento e testes.
 *
 * Simula o fluxo completo de PINPAD sem hardware real:
 * - Aprovação automática após `delayMs`
 * - Pode ser configurado para rejeitar ou simular timeout
 * - Gera NSU e código de autorização fictícios
 *
 * NUNCA usar em produção.
 */

import {
  type ITefProvider,
  type TransacaoTEF,
  type TipoTransacaoTEF,
  gerarIdTransacao,
  reaisParaCentavos,
} from "./tef";

export type ComportamentoMock = "aprovar" | "recusar" | "timeout" | "erro_comunicacao";

export interface ConfigMockTef {
  /** Comportamento padrão do mock (default: 'aprovar') */
  comportamento: ComportamentoMock;
  /** Delay simulado em ms antes de responder (default: 1500) */
  delayMs: number;
}

function gerarNSU(): string {
  return String(Math.floor(Math.random() * 999999)).padStart(6, "0");
}

function gerarCodAutorizacao(): string {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

function bandeiraPorTipo(tipo: TipoTransacaoTEF): string {
  const bandeiras = ["Visa", "Master", "Elo", "Hipercard"];
  if (tipo === "pix") return "Pix";
  if (tipo === "voucher") return "Voucher";
  return bandeiras[Math.floor(Math.random() * bandeiras.length)];
}

export class MockTefProvider implements ITefProvider {
  private transacoes: Map<string, TransacaoTEF> = new Map();
  private config: ConfigMockTef;

  constructor(config: Partial<ConfigMockTef> = {}) {
    this.config = {
      comportamento: config.comportamento ?? "aprovar",
      delayMs: config.delayMs ?? 1500,
    };
  }

  private esperar(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async iniciar(valor: number, tipo: TipoTransacaoTEF, parcelas = 1): Promise<TransacaoTEF> {
    await this.esperar(200); // simula resposta inicial

    const tx: TransacaoTEF = {
      id: gerarIdTransacao(),
      valorCentavos: reaisParaCentavos(valor),
      tipo,
      parcelas,
      status: "aguardando_cartao",
      mensagemOperador: "Aguardando cartão...",
      mensagemCliente: "Aproxime, insira ou passe o cartão",
    };

    this.transacoes.set(tx.id, tx);
    return { ...tx };
  }

  async confirmar(id: string): Promise<TransacaoTEF> {
    const tx = this.transacoes.get(id);
    if (!tx) throw new Error(`Transação ${id} não encontrada`);

    // Simula processamento
    this.transacoes.set(id, {
      ...tx,
      status: "aguardando_senha",
      mensagemOperador: "Aguardando senha...",
      mensagemCliente: "Digite sua senha",
    });

    await this.esperar(this.config.delayMs / 2);

    this.transacoes.set(id, {
      ...tx,
      status: "processando",
      mensagemOperador: "Processando...",
      mensagemCliente: "Aguarde",
    });

    await this.esperar(this.config.delayMs);

    let txFinal: TransacaoTEF;

    switch (this.config.comportamento) {
      case "aprovar": {
        const bandeira = bandeiraPorTipo(tx.tipo) as TransacaoTEF["bandeira"];
        const nsu = gerarNSU();
        const cod = gerarCodAutorizacao();
        txFinal = {
          ...tx,
          status: "aprovado",
          mensagemOperador: "Transação aprovada",
          mensagemCliente: "Aprovado!",
          bandeira,
          nsu,
          codigoAutorizacao: cod,
          dtTransacao: new Date().toISOString(),
          dadosImpressao: [
            "COMPROVANTE TEF",
            `${bandeira} - ${tx.tipo.replace(/_/g, " ").toUpperCase()}`,
            tx.parcelas > 1 ? `${tx.parcelas}x` : "À VISTA",
            `NSU: ${nsu}`,
            `AUT: ${cod}`,
            `VALOR: R$ ${(tx.valorCentavos / 100).toFixed(2).replace(".", ",")}`,
          ],
        };
        break;
      }
      case "recusar":
        txFinal = {
          ...tx,
          status: "recusado",
          mensagemOperador: "Transação recusada — saldo insuficiente",
          mensagemCliente: "Recusado",
        };
        break;
      case "timeout":
        await this.esperar(this.config.delayMs * 5);
        txFinal = {
          ...tx,
          status: "erro",
          mensagemOperador: "Timeout — PINPAD sem resposta",
          mensagemCliente: "",
        };
        break;
      case "erro_comunicacao":
        throw new Error("Erro de comunicação com o PINPAD (mock)");
    }

    this.transacoes.set(id, txFinal);
    return { ...txFinal };
  }

  async cancelar(id: string): Promise<TransacaoTEF> {
    const tx = this.transacoes.get(id);
    if (!tx) throw new Error(`Transação ${id} não encontrada`);

    await this.esperar(300);

    const txCancelada: TransacaoTEF = {
      ...tx,
      status: "cancelado",
      mensagemOperador: "Transação cancelada",
      mensagemCliente: "Cancelado",
    };
    this.transacoes.set(id, txCancelada);
    return { ...txCancelada };
  }

  async consultar(id: string): Promise<TransacaoTEF> {
    const tx = this.transacoes.get(id);
    if (!tx) throw new Error(`Transação ${id} não encontrada`);
    return { ...tx };
  }

  /** Permite alterar o comportamento em tempo de execução (útil em testes). */
  setComportamento(comportamento: ComportamentoMock): void {
    this.config.comportamento = comportamento;
  }
}
