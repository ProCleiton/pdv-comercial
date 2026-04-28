import { describe, it, expect } from "vitest";
import { inferirTipoTEF, ehPixPsp, ehDinheiro } from "./pdv-helpers";

describe("inferirTipoTEF", () => {
  it("PIX PINPAD → pix", () => {
    expect(inferirTipoTEF("PIX PINPAD")).toBe("pix");
  });

  it("pix (minúsculo) → pix", () => {
    expect(inferirTipoTEF("Pagamento Pix")).toBe("pix");
  });

  it("Débito → debito", () => {
    expect(inferirTipoTEF("Cartão Débito")).toBe("debito");
  });

  it("Debit (inglês) → debito", () => {
    expect(inferirTipoTEF("Debit Card")).toBe("debito");
  });

  it("Crédito Vista → credito_vista", () => {
    expect(inferirTipoTEF("Crédito à Vista")).toBe("credito_vista");
  });

  it("Crédito Parcelado → credito_parcelado_loja", () => {
    expect(inferirTipoTEF("Crédito Parcelado 3x")).toBe("credito_parcelado_loja");
  });

  it("Voucher → voucher", () => {
    expect(inferirTipoTEF("Voucher Refeição")).toBe("voucher");
  });

  it("Vale → voucher", () => {
    expect(inferirTipoTEF("Vale Alimentação")).toBe("voucher");
  });

  it("Benefício → voucher", () => {
    expect(inferirTipoTEF("Benefício Social")).toBe("voucher");
  });

  it("desconhecido → credito_vista (default)", () => {
    expect(inferirTipoTEF("Forma Desconhecida")).toBe("credito_vista");
  });

  it("case insensitive — DEBITO maiúsculo → debito", () => {
    expect(inferirTipoTEF("DEBITO")).toBe("debito");
  });
});

describe("ehPixPsp", () => {
  it("PIX PSP → true", () => {
    expect(ehPixPsp("PIX PSP")).toBe(true);
  });

  it("PIX QR Code → true", () => {
    expect(ehPixPsp("PIX QR Code")).toBe(true);
  });

  it("pix psp (minúsculo) → true", () => {
    expect(ehPixPsp("pix psp")).toBe(true);
  });

  it("PIX PINPAD → false (sem PSP/QR, vai por TEF)", () => {
    expect(ehPixPsp("PIX PINPAD")).toBe(false);
  });

  it("PIX simples → false", () => {
    expect(ehPixPsp("PIX")).toBe(false);
  });

  it("Crédito → false", () => {
    expect(ehPixPsp("Crédito Vista")).toBe(false);
  });
});

describe("ehDinheiro", () => {
  it("Dinheiro → true", () => {
    expect(ehDinheiro("Dinheiro")).toBe(true);
  });

  it("DINHEIRO maiúsculo → true", () => {
    expect(ehDinheiro("DINHEIRO")).toBe(true);
  });

  it("Crédito → false", () => {
    expect(ehDinheiro("Crédito Vista")).toBe(false);
  });
});
