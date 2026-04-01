/**
 * SiTefProvider — integração TEF via SiTef HTTP bridge.
 *
 * Requer o serviço "intSiTef" rodando localmente (Windows service ou exe).
 * O intSiTef expõe uma API HTTP que abstrai a comunicação com o PINPAD via COM/USB.
 *
 * Documentação: https://www.softwareexpress.com.br/intSiTef/
 *
 * ⚠️ Esta implementação é um skeleton funcional.
 * Para usar em produção é necessário:
 *   1. Licença SiTef da Software Express / Cielo
 *   2. PINPAD homologado (ex: Ingenico iPP320, Verifone VX820)
 *   3. Configuração do intSiTef com código de estabelecimento e terminal
 */

import {
  type ITefProvider,
  type TransacaoTEF,
  type TipoTransacaoTEF,
  type BandeiraTEF,
  gerarIdTransacao,
  reaisParaCentavos,
  centavosParaReais,
} from "./tef";

// ─── Mapeamento de tipos para código SiTef ────────────────────────────────────

const TIPO_SITEF: Record<TipoTransacaoTEF, string> = {
  debito:                    "300",  // Débito à vista
  credito_vista:             "200",  // Crédito à vista
  credito_parcelado_loja:    "201",  // Crédito parcelado loja
  credito_parcelado_adm:     "202",  // Crédito parcelado administradora
  pix:                       "500",  // Pix (SiTef 3.0+)
  voucher:                   "400",  // Voucher / benefício
};

// ─── Mapeamento de bandeiras SiTef para nossa enum ────────────────────────────

function parseBandeira(cod?: string): BandeiraTEF {
  const map: Record<string, BandeiraTEF> = {
    "001": "Visa",
    "002": "Master",
    "003": "Elo",
    "004": "Amex",
    "006": "Hipercard",
    "009": "Cabal",
    "500": "Pix",
    "400": "Voucher",
  };
  return (cod && map[cod]) || "Desconhecida";
}

// ─── Tipos de resposta HTTP do intSiTef ──────────────────────────────────────

interface SiTefResponse {
  /** 0 = sucesso; outros = erro */
  Resp: number;
  /** Texto de retorno para o operador */
  TextoPinpad?: string;
  /** Texto para o cliente */
  TextoOperador?: string;
  NSU?: string;
  CodAutorizacao?: string;
  CodigoBandeira?: string;
  /** Dados para impressão (array de linhas) */
  Impressao?: string[];
}

// ─── Provider ────────────────────────────────────────────────────────────────

export interface ConfigSiTef {
  endpoint: string;             // Ex: "http://localhost:4096"
  codigoEstabelecimento: string;
  codigoTerminal: string;
  timeoutMs: number;
}

export class SiTefProvider implements ITefProvider {
  private transacoes: Map<string, TransacaoTEF> = new Map();
  private cfg: ConfigSiTef;

  constructor(config: ConfigSiTef) {
    this.cfg = config;
  }

  private async post<T>(path: string, body: object): Promise<T> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), this.cfg.timeoutMs);
    try {
      const res = await fetch(`${this.cfg.endpoint}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });
      if (!res.ok) throw new Error(`SiTef HTTP ${res.status}`);
      return await res.json() as T;
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "AbortError") {
        throw new Error(`Timeout aguardando SiTef (${this.cfg.timeoutMs / 1000}s)`);
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  async iniciar(valor: number, tipo: TipoTransacaoTEF, parcelas = 1): Promise<TransacaoTEF> {
    const id = gerarIdTransacao();

    // Abre sessão no intSiTef
    const resp = await this.post<SiTefResponse>("/IniciarTransacao", {
      Estabelecimento: this.cfg.codigoEstabelecimento,
      Terminal: this.cfg.codigoTerminal,
      TipoTransacao: TIPO_SITEF[tipo],
      Valor: reaisParaCentavos(valor),
      Parcelas: parcelas,
      IdTransacao: id,
    });

    if (resp.Resp !== 0) {
      throw new Error(resp.TextoOperador ?? `Erro SiTef: ${resp.Resp}`);
    }

    const tx: TransacaoTEF = {
      id,
      valorCentavos: reaisParaCentavos(valor),
      tipo,
      parcelas,
      status: "aguardando_cartao",
      mensagemOperador: resp.TextoOperador ?? "Aguardando cartão...",
      mensagemCliente: resp.TextoPinpad ?? "Aproxime, insira ou passe o cartão",
    };

    this.transacoes.set(id, tx);
    return { ...tx };
  }

  async confirmar(id: string): Promise<TransacaoTEF> {
    const tx = this.transacoes.get(id);
    if (!tx) throw new Error(`Transação ${id} não encontrada`);

    const resp = await this.post<SiTefResponse>("/ConfirmarTransacao", {
      IdTransacao: id,
      Estabelecimento: this.cfg.codigoEstabelecimento,
      Terminal: this.cfg.codigoTerminal,
    });

    let txFinal: TransacaoTEF;

    if (resp.Resp === 0) {
      txFinal = {
        ...tx,
        status: "aprovado",
        mensagemOperador: resp.TextoOperador ?? "Aprovado",
        mensagemCliente: resp.TextoPinpad ?? "Aprovado!",
        bandeira: parseBandeira(resp.CodigoBandeira),
        nsu: resp.NSU,
        codigoAutorizacao: resp.CodAutorizacao,
        dtTransacao: new Date().toISOString(),
        dadosImpressao: resp.Impressao,
      };
    } else {
      txFinal = {
        ...tx,
        status: "recusado",
        mensagemOperador: resp.TextoOperador ?? `Recusado (${resp.Resp})`,
        mensagemCliente: resp.TextoPinpad ?? "Recusado",
      };
    }

    this.transacoes.set(id, txFinal);
    return { ...txFinal };
  }

  async cancelar(id: string): Promise<TransacaoTEF> {
    const tx = this.transacoes.get(id);
    if (!tx) throw new Error(`Transação ${id} não encontrada`);

    await this.post<SiTefResponse>("/CancelarTransacao", {
      IdTransacao: id,
      Estabelecimento: this.cfg.codigoEstabelecimento,
      Terminal: this.cfg.codigoTerminal,
      Valor: centavosParaReais(tx.valorCentavos),
    });

    const txCancelada: TransacaoTEF = {
      ...tx,
      status: "cancelado",
      mensagemOperador: "Cancelado",
      mensagemCliente: "Cancelado",
    };
    this.transacoes.set(id, txCancelada);
    return { ...txCancelada };
  }

  async consultar(id: string): Promise<TransacaoTEF> {
    const tx = this.transacoes.get(id);
    if (!tx) throw new Error(`Transação ${id} não encontrada`);

    const resp = await this.post<SiTefResponse>("/ConsultarTransacao", {
      IdTransacao: id,
      Estabelecimento: this.cfg.codigoEstabelecimento,
      Terminal: this.cfg.codigoTerminal,
    });

    const txAtualizada: TransacaoTEF = {
      ...tx,
      mensagemOperador: resp.TextoOperador ?? tx.mensagemOperador,
      mensagemCliente: resp.TextoPinpad ?? tx.mensagemCliente,
    };
    this.transacoes.set(id, txAtualizada);
    return { ...txAtualizada };
  }
}
