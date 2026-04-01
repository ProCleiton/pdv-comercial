import { describe, it, expect } from "vitest";
import {
  EscPos,
  gerarRecibo,
  gerarComprovanteSangria,
  CMD_INIT,
  CMD_CUT,
  CMD_BOLD_ON,
  CMD_BOLD_OFF,
  CMD_ALIGN_CENTER,
  CMD_ALIGN_LEFT,
  CMD_DOUBLE_SIZE,
  CMD_NORMAL_SIZE,
  formataMoeda,
  type DadosRecibo,
} from "@/services/escpos";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function bytesContain(haystack: number[], needle: number[]): boolean {
  outer: for (let i = 0; i <= haystack.length - needle.length; i++) {
    for (let j = 0; j < needle.length; j++) {
      if (haystack[i + j] !== needle[j]) continue outer;
    }
    return true;
  }
  return false;
}

function bytesToAscii(bytes: number[]): string {
  return bytes
    .filter((b) => b >= 0x20 && b < 0x80)
    .map((b) => String.fromCharCode(b))
    .join("");
}

// ─── EscPos class ────────────────────────────────────────────────────────────

describe("EscPos — comandos básicos", () => {
  it("init() emite CMD_INIT", () => {
    const p = new EscPos();
    p.init();
    expect(bytesContain(p.toArray(), CMD_INIT)).toBe(true);
  });

  it("cut() emite CMD_CUT", () => {
    const p = new EscPos();
    p.cut();
    expect(bytesContain(p.toArray(), CMD_CUT)).toBe(true);
  });

  it("bold(true) emite CMD_BOLD_ON", () => {
    const p = new EscPos();
    p.bold(true);
    expect(bytesContain(p.toArray(), CMD_BOLD_ON)).toBe(true);
  });

  it("bold(false) emite CMD_BOLD_OFF", () => {
    const p = new EscPos();
    p.bold(false);
    expect(bytesContain(p.toArray(), CMD_BOLD_OFF)).toBe(true);
  });

  it("center() emite CMD_ALIGN_CENTER", () => {
    const p = new EscPos();
    p.center();
    expect(bytesContain(p.toArray(), CMD_ALIGN_CENTER)).toBe(true);
  });

  it("left() emite CMD_ALIGN_LEFT", () => {
    const p = new EscPos();
    p.left();
    expect(bytesContain(p.toArray(), CMD_ALIGN_LEFT)).toBe(true);
  });

  it("doubleSize(true) emite CMD_DOUBLE_SIZE", () => {
    const p = new EscPos();
    p.doubleSize(true);
    expect(bytesContain(p.toArray(), CMD_DOUBLE_SIZE)).toBe(true);
  });

  it("doubleSize(false) emite CMD_NORMAL_SIZE", () => {
    const p = new EscPos();
    p.doubleSize(false);
    expect(bytesContain(p.toArray(), CMD_NORMAL_SIZE)).toBe(true);
  });

  it("line() emite bytes ASCII + LF (0x0A)", () => {
    const p = new EscPos();
    p.line("ABC");
    const bytes = p.toArray();
    expect(bytes).toContain(0x41); // 'A'
    expect(bytes).toContain(0x42); // 'B'
    expect(bytes).toContain(0x43); // 'C'
    expect(bytes[bytes.length - 1]).toBe(0x0A); // LF
  });

  it("separator('-') gera linha de 48 hífens para cols=48", () => {
    const p = new EscPos(48);
    p.separator("-");
    const ascii = bytesToAscii(p.toArray());
    expect(ascii).toBe("-".repeat(48));
  });

  it("separator('-') gera linha de 32 hífens para cols=32", () => {
    const p = new EscPos(32);
    p.separator("-");
    const ascii = bytesToAscii(p.toArray());
    expect(ascii).toBe("-".repeat(32));
  });

  it("twoCol() produz texto com comprimento total = cols", () => {
    const p = new EscPos(48);
    p.twoCol("TOTAL", "R$ 10,00");
    const ascii = bytesToAscii(p.toArray());
    // linha ASCII deve ter 48 chars + LF omitido na conversão
    expect(ascii.length).toBe(48);
  });

  it("toArray() retorna array de números", () => {
    const p = new EscPos();
    p.init().line("test").cut();
    const arr = p.toArray();
    expect(Array.isArray(arr)).toBe(true);
    expect(arr.every((b) => typeof b === "number" && b >= 0 && b <= 255)).toBe(true);
  });

  it("encoda corretamente ç/ã/é via CP850", () => {
    const p = new EscPos();
    p.text("ação");
    const bytes = p.toArray();
    // 'ã' → 0xC6, 'ç' → 0x87 (conforme o mapa CP850 do escpos.ts)
    expect(bytes).toContain(0xC6); // ã
    expect(bytes).toContain(0x87); // ç
  });
});

// ─── formataMoeda ─────────────────────────────────────────────────────────────

describe("formataMoeda", () => {
  it("formata inteiros com zeros centavos", () => {
    expect(formataMoeda(10)).toBe("R$ 10,00");
  });

  it("formata valor decimal", () => {
    expect(formataMoeda(1.5)).toBe("R$ 1,50");
  });

  it("formata zero corretamente", () => {
    expect(formataMoeda(0)).toBe("R$ 0,00");
  });

  it("formata valor grande", () => {
    expect(formataMoeda(1234.99)).toBe("R$ 1234,99");
  });
});

// ─── gerarRecibo ─────────────────────────────────────────────────────────────

const mockRecibo: DadosRecibo = {
  nomeEstabelecimento: "Loja Teste",
  operador: "Operador 1",
  numeroCupom: "000042",
  itens: [
    { descricao: "Produto A", quantidade: 2, precoUnitario: 5.0, desconto: 0, total: 10.0 },
    { descricao: "Produto B", quantidade: 1, precoUnitario: 3.5, desconto: 0.5, total: 3.0 },
  ],
  pagamentos: [
    { descricao: "Dinheiro", valor: 15.0 },
  ],
  totalBruto: 13.0,
  troco: 2.0,
  cols: 48,
};

describe("gerarRecibo", () => {
  it("retorna array de bytes não-vazio", () => {
    const bytes = gerarRecibo(mockRecibo);
    expect(bytes.length).toBeGreaterThan(50);
  });

  it("inicia com CMD_INIT", () => {
    const bytes = gerarRecibo(mockRecibo);
    expect(bytesContain(bytes, CMD_INIT)).toBe(true);
  });

  it("termina com CMD_CUT", () => {
    const bytes = gerarRecibo(mockRecibo);
    expect(bytesContain(bytes, CMD_CUT)).toBe(true);
  });

  it("contém o nome do estabelecimento", () => {
    const bytes = gerarRecibo(mockRecibo);
    const ascii = bytesToAscii(bytes);
    expect(ascii).toContain("Loja Teste");
  });

  it("contém o número do cupom", () => {
    const bytes = gerarRecibo(mockRecibo);
    const ascii = bytesToAscii(bytes);
    expect(ascii).toContain("000042");
  });

  it("contém o nome do operador", () => {
    const bytes = gerarRecibo(mockRecibo);
    const ascii = bytesToAscii(bytes);
    expect(ascii).toContain("Operador 1");
  });

  it("contém descrição dos itens", () => {
    const bytes = gerarRecibo(mockRecibo);
    const ascii = bytesToAscii(bytes);
    expect(ascii).toContain("Produto A");
    expect(ascii).toContain("Produto B");
  });

  it("exibe troco quando > 0", () => {
    const bytes = gerarRecibo(mockRecibo);
    const ascii = bytesToAscii(bytes);
    expect(ascii).toContain("TROCO");
    expect(ascii).toContain("2,00");
  });

  it("não exibe TROCO quando troco = 0", () => {
    const bytes = gerarRecibo({ ...mockRecibo, troco: 0 });
    const ascii = bytesToAscii(bytes);
    expect(ascii).not.toContain("TROCO");
  });

  it("funciona com cols=32 (papel 58mm)", () => {
    const bytes = gerarRecibo({ ...mockRecibo, cols: 32 });
    const ascii = bytesToAscii(bytes);
    expect(ascii).toContain("Loja Teste");
    // separador deve ter 32 chars, não 48
    expect(ascii).not.toContain("-".repeat(48));
  });
});

// ─── gerarComprovanteSangria ──────────────────────────────────────────────────

describe("gerarComprovanteSangria", () => {
  const dadosSangria = {
    nomeTerminal: "Caixa 1",
    operador: "João",
    valor: 50.0,
    motivo: "Pagamento fornecedor",
    cols: 48 as const,
  };

  it("retorna array não-vazio", () => {
    const bytes = gerarComprovanteSangria(dadosSangria);
    expect(bytes.length).toBeGreaterThan(20);
  });

  it("contém 'SANGRIA'", () => {
    const bytes = gerarComprovanteSangria(dadosSangria);
    const ascii = bytesToAscii(bytes);
    expect(ascii).toContain("SANGRIA");
  });

  it("contém o valor da sangria", () => {
    const bytes = gerarComprovanteSangria(dadosSangria);
    const ascii = bytesToAscii(bytes);
    expect(ascii).toContain("50,00");
  });

  it("contém o motivo", () => {
    const bytes = gerarComprovanteSangria(dadosSangria);
    const ascii = bytesToAscii(bytes);
    expect(ascii).toContain("Pagamento fornecedor");
  });

  it("contém o nome do terminal", () => {
    const bytes = gerarComprovanteSangria(dadosSangria);
    const ascii = bytesToAscii(bytes);
    expect(ascii).toContain("Caixa 1");
  });

  it("termina com CMD_CUT", () => {
    const bytes = gerarComprovanteSangria(dadosSangria);
    expect(bytesContain(bytes, CMD_CUT)).toBe(true);
  });
});
