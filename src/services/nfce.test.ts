import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  carregarConfigNFCe,
  salvarConfigNFCe,
  CONFIG_NFCE_PADRAO,
  emitirNFCeParaVenda,
} from "@/services/nfce";

// ─── Mock da API ──────────────────────────────────────────────────────────────

vi.mock("@/services/api", () => ({
  api: {
    post: vi.fn(),
  },
}));

import { api } from "@/services/api";
const apiPost = vi.mocked(api.post);

// ─── Helpers ──────────────────────────────────────────────────────────────────

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
});

afterEach(() => {
  localStorage.clear();
});

// ─── carregarConfigNFCe ───────────────────────────────────────────────────────

describe("carregarConfigNFCe", () => {
  it("retorna config padrão quando localStorage está vazio", () => {
    const cfg = carregarConfigNFCe();
    expect(cfg).toEqual(CONFIG_NFCE_PADRAO);
    expect(cfg.habilitada).toBe(false);
    expect(cfg.ambiente).toBe("2");
  });

  it("retorna config salva no localStorage", () => {
    localStorage.setItem("pdv:config:nfce", JSON.stringify({ habilitada: true, ambiente: "1" }));
    const cfg = carregarConfigNFCe();
    expect(cfg.habilitada).toBe(true);
    expect(cfg.ambiente).toBe("1");
  });

  it("mescla config salva com padrão (campos extras preservados)", () => {
    localStorage.setItem("pdv:config:nfce", JSON.stringify({ habilitada: true }));
    const cfg = carregarConfigNFCe();
    expect(cfg.habilitada).toBe(true);
    expect(cfg.ambiente).toBe("2"); // valor padrão mantido
  });

  it("retorna padrão quando localStorage contém JSON inválido", () => {
    localStorage.setItem("pdv:config:nfce", "INVALID_JSON");
    const cfg = carregarConfigNFCe();
    expect(cfg).toEqual(CONFIG_NFCE_PADRAO);
  });
});

// ─── salvarConfigNFCe ─────────────────────────────────────────────────────────

describe("salvarConfigNFCe", () => {
  it("persiste a config no localStorage", () => {
    salvarConfigNFCe({ habilitada: true, ambiente: "1" });
    const raw = localStorage.getItem("pdv:config:nfce");
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw!);
    expect(parsed.habilitada).toBe(true);
    expect(parsed.ambiente).toBe("1");
  });

  it("sobrescreve config anterior", () => {
    salvarConfigNFCe({ habilitada: true, ambiente: "1" });
    salvarConfigNFCe({ habilitada: false, ambiente: "2" });
    const cfg = carregarConfigNFCe();
    expect(cfg.habilitada).toBe(false);
    expect(cfg.ambiente).toBe("2");
  });
});

// ─── emitirNFCeParaVenda ──────────────────────────────────────────────────────

const emissaoMock = {
  ok: true,
  chave: "35240412345678000195650010000000011234567890",
  protocolo: "135240012345678",
  status: "100",
  qrcode: "https://www.sefaz.rs.gov.br/NFCE/NFCE-COM.aspx?chNFe=...",
  urlChave: "https://www.sefaz.rs.gov.br/consulta",
};

describe("emitirNFCeParaVenda", () => {
  it("cria nota fiscal e emite NFCe — retorna ResultadoNFCe completo", async () => {
    apiPost
      .mockResolvedValueOnce({ id: 42 })       // POST /notas-fiscais
      .mockResolvedValueOnce(emissaoMock);      // POST /notas-fiscais/42/emitir-nfce

    const resultado = await emitirNFCeParaVenda(1, 99, 150.0, "2");

    expect(apiPost).toHaveBeenCalledTimes(2);

    // Primeira chamada: criação da nota
    expect(apiPost).toHaveBeenNthCalledWith(1, "/notas-fiscais", expect.objectContaining({
      codigoEstabelecimento: 1,
      tipoDocumento: "NFCe",
      ambiente: "2",
      codigoVenda: 99,
      valorTotal: 150.0,
    }));

    // Segunda chamada: emissão
    expect(apiPost).toHaveBeenNthCalledWith(2, "/notas-fiscais/42/emitir-nfce", {});

    expect(resultado).toEqual({
      notaId: 42,
      chave: emissaoMock.chave,
      protocolo: emissaoMock.protocolo,
      status: emissaoMock.status,
      qrcode: emissaoMock.qrcode,
      urlChave: emissaoMock.urlChave,
    });
  });

  it("usa ambiente '1' (produção) quando especificado", async () => {
    apiPost
      .mockResolvedValueOnce({ id: 7 })
      .mockResolvedValueOnce(emissaoMock);

    await emitirNFCeParaVenda(2, 10, 99.9, "1");

    expect(apiPost).toHaveBeenNthCalledWith(1, "/notas-fiscais", expect.objectContaining({
      ambiente: "1",
    }));
  });

  it("preenche campos opcionais ausentes na emissão com strings vazias", async () => {
    apiPost
      .mockResolvedValueOnce({ id: 5 })
      .mockResolvedValueOnce({ ok: true }); // emissão sem campos de retorno

    const resultado = await emitirNFCeParaVenda(1, 5, 50, "2");

    expect(resultado.chave).toBe("");
    expect(resultado.protocolo).toBe("");
    expect(resultado.status).toBe("");
    expect(resultado.qrcode).toBe("");
    expect(resultado.urlChave).toBe("");
  });

  it("propaga exceção quando POST /notas-fiscais falha", async () => {
    apiPost.mockRejectedValueOnce(new Error("Servidor indisponível"));

    await expect(emitirNFCeParaVenda(1, 1, 10, "2")).rejects.toThrow("Servidor indisponível");
  });

  it("propaga exceção quando POST /emitir-nfce falha", async () => {
    apiPost
      .mockResolvedValueOnce({ id: 3 })
      .mockRejectedValueOnce(new Error("SEFAZ indisponível"));

    await expect(emitirNFCeParaVenda(1, 3, 20, "2")).rejects.toThrow("SEFAZ indisponível");
  });

  it("inclui dtEmissao no formato YYYY-MM-DD", async () => {
    apiPost
      .mockResolvedValueOnce({ id: 1 })
      .mockResolvedValueOnce(emissaoMock);

    await emitirNFCeParaVenda(1, 1, 10, "2");

    const chamada = apiPost.mock.calls[0][1] as Record<string, unknown>;
    expect(chamada.dtEmissao).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
