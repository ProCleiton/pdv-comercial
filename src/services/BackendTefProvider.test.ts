import { vi, describe, it, expect, beforeEach } from "vitest";
import { BackendTefProvider } from "./BackendTefProvider";

const BASE = "http://localhost:9000";

function makeProvider() {
  return new BackendTefProvider({ codigoEstabelecimento: 1, endpointBase: BASE });
}

function mockFetch(status: number, body: object) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
      text: async () => JSON.stringify(body),
    })
  );
}

describe("BackendTefProvider", () => {
  beforeEach(() => {
    localStorage.setItem("token", "tok-test");
    vi.restoreAllMocks();
  });

  it("iniciar — retorna transação aprovada quando backend aprova", async () => {
    mockFetch(201, {
      idTransacao: "TEF-123",
      status: "APROVADO",
      nsu: "000001",
      codigoAutorizacao: "AUTH01",
      bandeira: "Visa",
      mensagemOperador: "Aprovado",
      mensagemCliente: "Aprovado",
      parcelas: 1,
      valor: 50.0,
      dadosImpressao: ["COMPROVANTE TEF", "NSU: 000001"],
    });

    const provider = makeProvider();
    const tx = await provider.iniciar(50.0, "credito_vista", 1);

    expect(tx.id).toBe("TEF-123");
    expect(tx.status).toBe("aprovado");
    expect(tx.nsu).toBe("000001");
    expect(tx.bandeira).toBe("Visa");
    expect(tx.dadosImpressao).toHaveLength(2);
  });

  it("iniciar — lança erro quando backend retorna NOT_IMPLEMENTED (stub fiscal)", async () => {
    mockFetch(422, {
      message: "TEF recusado: TEF não configurado — aguardando integração ACBrTEF",
    });

    const provider = makeProvider();
    await expect(provider.iniciar(10.0, "debito")).rejects.toThrow("TEF backend erro");
  });

  it("confirmar — chama POST /tef/confirmar/{id} e retorna status", async () => {
    mockFetch(200, {
      idTransacao: "TEF-123",
      status: "APROVADO",
      nsu: "000001",
      parcelas: 1,
      valor: 50.0,
      tipo: "credito_vista",
      mensagemOperador: "Confirmado",
    });

    const provider = makeProvider();
    const tx = await provider.confirmar("TEF-123");

    expect(tx.status).toBe("aprovado");
    const [url] = (vi.mocked(fetch).mock.calls[0] as [string, ...unknown[]]);
    expect(url).toContain("/tef/confirmar/TEF-123");
  });

  it("cancelar — retorna status cancelado", async () => {
    mockFetch(200, {
      idTransacao: "TEF-456",
      status: "CANCELADO",
      parcelas: 1,
      valor: 25.0,
      tipo: "debito",
      mensagemOperador: "Cancelado pelo operador",
    });

    const provider = makeProvider();
    const tx = await provider.cancelar("TEF-456");

    expect(tx.status).toBe("cancelado");
    const [url] = (vi.mocked(fetch).mock.calls[0] as [string, ...unknown[]]);
    expect(url).toContain("/tef/cancelar/TEF-456");
  });

  it("estornar — retorna status estornado quando backend confirma reversal", async () => {
    mockFetch(200, {
      idTransacao: "TEF-789",
      status: "ESTORNADO",
      parcelas: 1,
      valor: 50.0,
      tipo: "credito_vista",
      mensagemOperador: "Estorno realizado",
    });

    const provider = makeProvider();
    const tx = await provider.estornar("TEF-789");

    expect(tx.status).toBe("estornado");
    const [url] = (vi.mocked(fetch).mock.calls[0] as [string, ...unknown[]]);
    expect(url).toContain("/tef/estornar/TEF-789");
  });

  it("estornar — lança erro quando backend retorna 400", async () => {
    mockFetch(400, { message: "Transação ainda não vinculada a uma venda" });

    const provider = makeProvider();
    await expect(provider.estornar("TEF-SEM-VENDA")).rejects.toThrow("TEF backend erro");
  });

  it("consultar — faz GET /tef/consultar/{id}", async () => {
    mockFetch(200, {
      idTransacao: "TEF-789",
      status: "PENDENTE",
      parcelas: 1,
      valor: 30.0,
      tipo: "debito",
      mensagemOperador: "Aguardando",
    });

    const provider = makeProvider();
    const tx = await provider.consultar("TEF-789");

    expect(tx.status).toBe("iniciando"); // PENDENTE → iniciando
    const [url, opts] = (vi.mocked(fetch).mock.calls[0] as [string, RequestInit]);
    expect(url).toContain("/tef/consultar/TEF-789");
    expect((opts as RequestInit).method).toBeUndefined(); // GET (sem body)
  });
});
