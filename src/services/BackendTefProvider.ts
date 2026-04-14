import {
  gerarIdTransacao,
  reaisParaCentavos,
  type ITefProvider,
  type TipoTransacaoTEF,
  type TransacaoTEF,
} from "./tef";
import { getApiBaseUrl } from "./api";

/**
 * Provider TEF que delega todas as operações ao backend Spring Boot (/tef/*).
 *
 * Fluxo:
 *   iniciar() → POST /tef/iniciar  (síncrono, timeout 90s no servidor)
 *   confirmar() → POST /tef/confirmar/{id}
 *   cancelar() → POST /tef/cancelar/{id}
 *   consultar() → GET /tef/consultar/{id}
 *
 * O backend audita cada operação na tabela TRANSACOES_TEF e repassa ao
 * microserviço fiscal (ACBrTEF) para comunicação com o PINPAD.
 */
export interface BackendTefConfig {
  codigoEstabelecimento: number;
  /** Sobrescreve a URL base da API (usa getApiBaseUrl() por padrão). */
  endpointBase?: string;
}

export class BackendTefProvider implements ITefProvider {
  private readonly codigoEstabelecimento: number;
  private readonly baseUrl: string;
  private readonly idTransacaoAtual: Map<string, string> = new Map();

  constructor(cfg: BackendTefConfig) {
    this.codigoEstabelecimento = cfg.codigoEstabelecimento;
    this.baseUrl = cfg.endpointBase ?? getApiBaseUrl();
  }

  async iniciar(valor: number, tipo: TipoTransacaoTEF, parcelas = 1): Promise<TransacaoTEF> {
    const idTransacao = gerarIdTransacao();
    const valorReais = valor; // valor já em reais (interface usa reais)

    const res = await this.post("/tef/iniciar", {
      idTransacao,
      codigoEstabelecimento: this.codigoEstabelecimento,
      tipo,
      valor: valorReais,
      parcelas,
    });

    return this.mapResponse(res, valor, tipo, parcelas);
  }

  async confirmar(id: string): Promise<TransacaoTEF> {
    const res = await this.post(`/tef/confirmar/${encodeURIComponent(id)}`, {});
    return this.mapResponse(res, res.valor * 100, res.tipo, res.parcelas);
  }

  async cancelar(id: string): Promise<TransacaoTEF> {
    const res = await this.post(`/tef/cancelar/${encodeURIComponent(id)}`, {});
    return this.mapResponse(res, res.valor * 100, res.tipo, res.parcelas);
  }

  async consultar(id: string): Promise<TransacaoTEF> {
    const token = localStorage.getItem("token");
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (token) headers["Authorization"] = `Bearer ${token}`;

    const response = await fetch(`${this.baseUrl}/tef/consultar/${encodeURIComponent(id)}`, { headers });
    if (!response.ok) {
      const err = await response.text().catch(() => response.statusText);
      throw new Error(`TEF consultar falhou: ${err}`);
    }
    const res = await response.json();
    return this.mapResponse(res, (res.valor ?? 0) * 100, res.tipo ?? "debito", res.parcelas ?? 1);
  }

  // ── helpers privados ─────────────────────────────────────────────────────────

  private async post(path: string, body: object): Promise<BackendTefRaw> {
    const token = localStorage.getItem("token");
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (token) headers["Authorization"] = `Bearer ${token}`;

    const response = await fetch(`${this.baseUrl}${path}`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      const msg = data?.message ?? data?.error ?? `HTTP ${response.status}`;
      throw new Error(`TEF backend erro: ${msg}`);
    }
    return data as BackendTefRaw;
  }

  private mapResponse(
    raw: BackendTefRaw,
    valorCentavos: number,
    tipo: TipoTransacaoTEF,
    parcelas: number
  ): TransacaoTEF {
    const status = mapStatus(raw.status ?? "PENDENTE");
    return {
      id: raw.idTransacao ?? "",
      valorCentavos: typeof valorCentavos === "number" ? valorCentavos : reaisParaCentavos(raw.valor ?? 0),
      tipo,
      status,
      mensagemOperador: raw.mensagemOperador ?? "",
      mensagemCliente: raw.mensagemCliente ?? "",
      parcelas: raw.parcelas ?? parcelas,
      bandeira: raw.bandeira as TransacaoTEF["bandeira"],
      nsu: raw.nsu ?? undefined,
      codigoAutorizacao: raw.codigoAutorizacao ?? undefined,
      dadosImpressao: raw.dadosImpressao ?? [],
    };
  }
}

/** Shape do response do backend (espelha TefResponse.java). */
interface BackendTefRaw {
  codigo?: number;
  idTransacao?: string;
  codigoEstabelecimento?: number;
  codigoVenda?: number;
  tipo?: string;
  parcelas?: number;
  valor?: number;
  status?: string;
  nsu?: string;
  codigoAutorizacao?: string;
  bandeira?: string;
  mensagemOperador?: string;
  mensagemCliente?: string;
  dadosImpressao?: string[];
  // campos de erro
  message?: string;
  error?: string;
}

function mapStatus(backendStatus: string): TransacaoTEF["status"] {
  switch (backendStatus.toUpperCase()) {
    case "APROVADO":    return "aprovado";
    case "RECUSADO":    return "recusado";
    case "CANCELADO":   return "cancelado";
    case "NOT_IMPLEMENTED":
    case "PENDENTE":    return "iniciando";
    default:            return "processando";
  }
}
