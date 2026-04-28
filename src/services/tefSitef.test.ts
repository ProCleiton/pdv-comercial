import { vi, describe, it, expect, beforeEach } from "vitest";
import { SiTefProvider } from "./tefSitef";

function makeProvider() {
  return new SiTefProvider({
    endpoint: "http://localhost:4096",
    codigoEstabelecimento: "00000001",
    codigoTerminal: "T001",
    timeoutMs: 5000,
  });
}

function mockFetch(status: number, body: object) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
    })
  );
}

describe("SiTefProvider — PIX via PINPAD", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("iniciar PIX — envia TipoTransacao 500 ao intSiTef", async () => {
    mockFetch(200, {
      Resp: 0,
      TextoOperador: "QR Code exibido no PINPAD",
      TextoPinpad: "Aguardando pagamento PIX...",
    });

    const provider = makeProvider();
    const tx = await provider.iniciar(50.0, "pix");

    expect(tx.tipo).toBe("pix");
    expect(tx.status).toBe("aguardando_cartao");

    const [, opts] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(opts.body as string);
    expect(body.TipoTransacao).toBe("500");
  });

  it("iniciar débito — envia TipoTransacao 300", async () => {
    mockFetch(200, { Resp: 0, TextoOperador: "Insira ou aproxime o cartão" });

    const provider = makeProvider();
    await provider.iniciar(30.0, "debito");

    const [, opts] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(opts.body as string);
    expect(body.TipoTransacao).toBe("300");
  });

  it("iniciar crédito vista — envia TipoTransacao 200", async () => {
    mockFetch(200, { Resp: 0, TextoOperador: "Insira ou aproxime o cartão" });

    const provider = makeProvider();
    await provider.iniciar(100.0, "credito_vista");

    const [, opts] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(opts.body as string);
    expect(body.TipoTransacao).toBe("200");
  });

  it("iniciar crédito parcelado loja — envia TipoTransacao 201", async () => {
    mockFetch(200, { Resp: 0, TextoOperador: "Insira o cartão" });

    const provider = makeProvider();
    await provider.iniciar(300.0, "credito_parcelado_loja", 3);

    const [, opts] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(opts.body as string);
    expect(body.TipoTransacao).toBe("201");
    expect(body.Parcelas).toBe(3);
  });

  it("iniciar — lança erro quando SiTef retorna Resp != 0", async () => {
    mockFetch(200, { Resp: 2, TextoOperador: "Cartão bloqueado" });

    const provider = makeProvider();
    await expect(provider.iniciar(50.0, "credito_vista")).rejects.toThrow("Cartão bloqueado");
  });

  it("confirmar PIX — retorna aprovado com bandeira Pix quando CodigoBandeira é 500", async () => {
    mockFetch(200, { Resp: 0, TextoOperador: "QR Code exibido no PINPAD" });
    const provider = makeProvider();
    const tx = await provider.iniciar(50.0, "pix");

    mockFetch(200, {
      Resp: 0,
      TextoOperador: "PIX aprovado",
      CodigoBandeira: "500",
      NSU: "PIX000001",
      CodAutorizacao: "PIXAUTH",
    });

    const txConfirmada = await provider.confirmar(tx.id);
    expect(txConfirmada.status).toBe("aprovado");
    expect(txConfirmada.bandeira).toBe("Pix");
    expect(txConfirmada.nsu).toBe("PIX000001");
  });
});
