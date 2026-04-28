import { describe, it, expect, beforeEach } from "vitest";
import {
  reaisParaCentavos,
  centavosParaReais,
  gerarIdTransacao,
  carregarConfigTEF,
  salvarConfigTEF,
  CONFIG_TEF_PADRAO,
} from "./tef";
import { MockTefProvider } from "./tefMock";

// ────────────────────────────────────────────────────────────────────────────
// Utilitários
// ────────────────────────────────────────────────────────────────────────────

describe("reaisParaCentavos", () => {
  it("converte valores inteiros", () => {
    expect(reaisParaCentavos(10)).toBe(1000);
  });
  it("converte valores decimais", () => {
    expect(reaisParaCentavos(10.5)).toBe(1050);
  });
  it("converte dois decimais sem arredondamento", () => {
    expect(reaisParaCentavos(0.99)).toBe(99);
  });
  it("zero retorna zero", () => {
    expect(reaisParaCentavos(0)).toBe(0);
  });
});

describe("centavosParaReais", () => {
  it("converte centavos inteiros", () => {
    expect(centavosParaReais(1000)).toBe(10);
  });
  it("converte com decimais", () => {
    expect(centavosParaReais(1050)).toBe(10.5);
  });
  it("zero retorna zero", () => {
    expect(centavosParaReais(0)).toBe(0);
  });
});

describe("gerarIdTransacao", () => {
  it("começa com TEF-", () => {
    expect(gerarIdTransacao()).toMatch(/^TEF-/);
  });
  it("gera IDs únicos", () => {
    const ids = new Set(Array.from({ length: 50 }, gerarIdTransacao));
    expect(ids.size).toBe(50);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Config TEF (localStorage)
// ────────────────────────────────────────────────────────────────────────────

describe("carregarConfigTEF / salvarConfigTEF", () => {
  beforeEach(() => localStorage.clear());

  it("retorna null quando não há config", () => {
    expect(carregarConfigTEF()).toBeNull();
  });

  it("round-trip: salva e carrega corretamente", () => {
    const cfg = { ...CONFIG_TEF_PADRAO, provider: "sitef" as const };
    salvarConfigTEF(cfg);
    const loaded = carregarConfigTEF();
    expect(loaded).toEqual(cfg);
  });

  it("CONFIG_TEF_PADRAO usa provider mock", () => {
    expect(CONFIG_TEF_PADRAO.provider).toBe("mock");
  });

  it("CONFIG_TEF_PADRAO não tem códigos pré-selecionados", () => {
    expect(CONFIG_TEF_PADRAO.codigosFormasPagamentoTEF).toEqual([]);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// MockTefProvider
// ────────────────────────────────────────────────────────────────────────────

describe("MockTefProvider", () => {
  let mock: MockTefProvider;

  beforeEach(() => {
    mock = new MockTefProvider({ delayMs: 0 });
  });

  it("iniciar() retorna status aguardando_cartao", async () => {
    const tx = await mock.iniciar(5.0, "debito");
    expect(tx.status).toBe("aguardando_cartao");
    expect(tx.valorCentavos).toBe(500);
  });

  it("confirmar() comportamento=aprovar retorna status aprovado", async () => {
    const tx = await mock.iniciar(10.0, "credito_vista");
    expect(tx.status).toBe("aguardando_cartao");
    const aprovado = await mock.confirmar(tx.id);
    expect(aprovado.status).toBe("aprovado");
    expect(aprovado.nsu).toBeTruthy();
    expect(aprovado.codigoAutorizacao).toBeTruthy();
    expect(aprovado.bandeira).toBeTruthy();
  });

  it("confirmar() comportamento=recusar retorna status recusado", async () => {
    mock.setComportamento("recusar");
    const tx = await mock.iniciar(5.0, "debito");
    const recusado = await mock.confirmar(tx.id);
    expect(recusado.status).toBe("recusado");
    expect(recusado.mensagemOperador).toBeTruthy();
  });

  it("cancelar() retorna status cancelado", async () => {
    const tx = await mock.iniciar(5.0, "debito");
    const cancelado = await mock.cancelar(tx.id);
    expect(cancelado.status).toBe("cancelado");
  });

  it("estornar() retorna status estornado", async () => {
    const tx = await mock.iniciar(5.0, "debito");
    const estornado = await mock.estornar(tx.id);
    expect(estornado.status).toBe("estornado");
    expect(estornado.mensagemOperador).toBe("Transação estornada");
  });

  it("estornar() em transação inexistente lança erro", async () => {
    await expect(mock.estornar("nao-existe")).rejects.toThrow();
  });

  it("confirmar() comportamento=erro_comunicacao lança exceção", async () => {
    mock.setComportamento("erro_comunicacao");
    const tx = await mock.iniciar(2.0, "credito_vista");
    await expect(mock.confirmar(tx.id)).rejects.toThrow();
  });

  it("confirmar() comportamento=timeout retorna status erro", async () => {
    const mockTimeout = new MockTefProvider({ delayMs: 0 });
    mockTimeout.setComportamento("timeout");
    const tx = await mockTimeout.iniciar(1.0, "debito");
    const resultado = await mockTimeout.confirmar(tx.id);
    expect(resultado.status).toBe("erro");
  });

  it("parcelas são preservadas na transação", async () => {
    const tx = await mock.iniciar(100.0, "credito_parcelado_loja", 3);
    expect(tx.parcelas).toBe(3);
  });

  it("operações em transação inexistente lançam erro", async () => {
    await expect(mock.confirmar("nao-existe")).rejects.toThrow();
    await expect(mock.cancelar("nao-existe")).rejects.toThrow();
  });

  it("iniciar() tipo pix retorna mensagem QR code", async () => {
    const tx = await mock.iniciar(50.0, "pix");
    expect(tx.status).toBe("aguardando_cartao");
    expect(tx.mensagemOperador).toContain("QR Code");
    expect(tx.mensagemCliente).toContain("QR Code");
    expect(tx.tipo).toBe("pix");
  });

  it("confirmar() tipo pix: bandeira Pix, dadosImpressao PIX, sem linha de parcelas", async () => {
    const tx = await mock.iniciar(50.0, "pix");
    const aprovado = await mock.confirmar(tx.id);
    expect(aprovado.status).toBe("aprovado");
    expect(aprovado.bandeira).toBe("Pix");
    expect(aprovado.mensagemOperador).toContain("PIX");
    expect(aprovado.dadosImpressao).toBeDefined();
    expect(Array.isArray(aprovado.dadosImpressao)).toBe(true);
    const linhas = aprovado.dadosImpressao as string[];
    expect(linhas.some((l) => l.includes("PIX"))).toBe(true);
    // Não deve ter linha de parcelas para PIX
    expect(linhas.every((l) => !l.match(/^\d+x$/))).toBe(true);
  });

  it("confirmar() tipo pix aprovado sem passar por aguardando_senha", async () => {
    const tx = await mock.iniciar(30.0, "pix");
    expect(tx.status).toBe("aguardando_cartao");
    const aprovado = await mock.confirmar(tx.id);
    expect(aprovado.status).toBe("aprovado");
    expect(aprovado.bandeira).toBe("Pix");
  });
});
