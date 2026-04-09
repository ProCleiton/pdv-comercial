/**
 * Formatter ESC/POS — gera bytes para impressoras térmicas USB/Serial.
 *
 * Largura padrão: 48 colunas (papel 80mm) ou 32 colunas (papel 58mm).
 * Toda a lógica é pura (sem efeitos colaterais) — totalmente testável.
 */

// ─── Constantes ESC/POS ──────────────────────────────────────────────────────

const ESC = 0x1b;
const GS  = 0x1d;
const LF  = 0x0a;

/** Inicializa a impressora (limpa buffer, restaura padrões). */
export const CMD_INIT        = [ESC, 0x40];
/** Alimenta e corta o papel. */
export const CMD_CUT         = [GS, 0x56, 0x42, 0x00];
/** Centralizar texto. */
export const CMD_ALIGN_CENTER = [ESC, 0x61, 0x01];
/** Alinhar à esquerda (padrão). */
export const CMD_ALIGN_LEFT   = [ESC, 0x61, 0x00];
/** Alinhar à direita. */
export const CMD_ALIGN_RIGHT  = [ESC, 0x61, 0x02];
/** Negrito ligado. */
export const CMD_BOLD_ON      = [ESC, 0x45, 0x01];
/** Negrito desligado. */
export const CMD_BOLD_OFF     = [ESC, 0x45, 0x00];
/** Fonte dupla largura + altura. */
export const CMD_DOUBLE_SIZE  = [GS, 0x21, 0x11];
/** Fonte normal. */
export const CMD_NORMAL_SIZE  = [GS, 0x21, 0x00];

// ─── Encoder de texto ────────────────────────────────────────────────────────

/** Converte string para bytes CP850/Latin (suporte a acentos básicos). */
function encodeText(text: string): number[] {
  const bytes: number[] = [];
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0x3F;
    // Mapeamento parcial CP850: caracteres acentuados do português
    const cp850Map: Record<string, number> = {
      'à': 0x85, 'á': 0xA0, 'â': 0x83, 'ã': 0xC6,
      'À': 0xB7, 'Á': 0xB5, 'Â': 0xB6, 'Ã': 0xC7,
      'é': 0x82, 'ê': 0x88, 'è': 0x8A,
      'É': 0x90, 'Ê': 0xD2,
      'í': 0xA1, 'î': 0x8C,
      'Í': 0xD6,
      'ó': 0xA2, 'ô': 0x93, 'õ': 0xE4,
      'Ó': 0xE0, 'Ô': 0xE2, 'Õ': 0xE5,
      'ú': 0xA3, 'û': 0x96,
      'Ú': 0xE9,
      'ç': 0x87, 'Ç': 0x80,
      'ñ': 0xA4, 'Ñ': 0xA5,
      'º': 0xA8, 'ª': 0xA6,
      'R$': 0x52, // fallback
    };
    if (char in cp850Map) {
      bytes.push(cp850Map[char]);
    } else if (code < 0x100) {
      bytes.push(code);
    } else {
      bytes.push(0x3F); // '?'
    }
  }
  return bytes;
}

// ─── Builder ─────────────────────────────────────────────────────────────────

export class EscPos {
  private buf: number[] = [];
  readonly cols: number;

  constructor(cols: 32 | 48 = 48) {
    this.cols = cols;
  }

  private push(...bytes: number[]): this {
    this.buf.push(...bytes);
    return this;
  }

  init(): this { return this.push(...CMD_INIT); }
  cut(): this  { return this.push(...CMD_CUT); }

  center(): this { return this.push(...CMD_ALIGN_CENTER); }
  left(): this   { return this.push(...CMD_ALIGN_LEFT); }
  right(): this  { return this.push(...CMD_ALIGN_RIGHT); }

  bold(on = true): this { return this.push(...(on ? CMD_BOLD_ON : CMD_BOLD_OFF)); }
  doubleSize(on = true): this { return this.push(...(on ? CMD_DOUBLE_SIZE : CMD_NORMAL_SIZE)); }

  /** Imprime texto sem quebra de linha. */
  text(s: string): this {
    return this.push(...encodeText(s));
  }

  /** Imprime texto + LF. */
  line(s: string): this {
    return this.push(...encodeText(s), LF);
  }

  /** N linhas em branco. */
  emptyLine(n = 1): this {
    for (let i = 0; i < n; i++) this.push(LF);
    return this;
  }

  /**
   * Linha separadora com o caractere dado.
   * Ex: separator('-') → "------------------------------------------------"
   */
  separator(char = '-'): this {
    return this.line(char.repeat(this.cols));
  }

  /**
   * Imprime duas colunas: esquerda justificada à esquerda, direita à direita.
   * Total = cols chars.
   */
  twoCol(left: string, right: string): this {
    const rightWidth = right.length;
    const leftWidth = this.cols - rightWidth - 1;
    const l = left.substring(0, leftWidth).padEnd(leftWidth);
    const r = right.padStart(rightWidth);
    return this.line(`${l} ${r}`);
  }

  /**
   * Imprime uma linha centralizada (padding manual).
   */
  centeredLine(s: string): this {
    const pad = Math.max(0, Math.floor((this.cols - s.length) / 2));
    return this.line(' '.repeat(pad) + s);
  }

  /** Retorna o buffer como Uint8Array para envio via Tauri. */
  toBytes(): Uint8Array {
    return new Uint8Array(this.buf);
  }

  /** Retorna o buffer como array de números (serializable para Tauri invoke). */
  toArray(): number[] {
    return [...this.buf];
  }
}

// ─── Helpers de formatação ───────────────────────────────────────────────────

export interface ItemRecibo {
  descricao: string;
  quantidade: number;
  precoUnitario: number;
  desconto: number;
  total: number;
}

export interface PagamentoRecibo {
  descricao: string;
  valor: number;
}

export interface DadosRecibo {
  nomeEstabelecimento: string;
  operador: string;
  numeroCupom: string;
  itens: ItemRecibo[];
  pagamentos: PagamentoRecibo[];
  totalBruto: number;
  troco: number;
  cols?: 32 | 48;
  /** Dados da NFCe emitida — quando presentes, imprime rodapé fiscal */
  nfce?: {
    chave: string;
    protocolo: string;
    qrcode?: string;
    urlChave?: string;
  };
}

/** Formata valor monetário em BRL sem usar Intl (CP850 não tem símbolo correto). */
export function formataMoeda(v: number): string {
  return 'R$ ' + v.toFixed(2).replace('.', ',');
}

/** Gera o array de bytes ESC/POS do cupom fiscal simplificado. */
export function gerarRecibo(dados: DadosRecibo): number[] {
  const p = new EscPos(dados.cols ?? 48);
  const dtStr = new Date().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

  p.init();

  // Cabeçalho
  p.center().bold(true).doubleSize(true).line(dados.nomeEstabelecimento.substring(0, 20));
  p.doubleSize(false).bold(false);
  p.emptyLine();
  p.left();
  p.line(`Cupom: ${dados.numeroCupom}`);
  p.line(`Data : ${dtStr}`);
  p.line(`Oper.: ${dados.operador}`);
  p.separator();

  // Itens
  p.bold(true).line('ITEM                    QTD       TOTAL').bold(false);
  p.separator('-');
  for (let i = 0; i < dados.itens.length; i++) {
    const item = dados.itens[i];
    const idx = String(i + 1).padStart(2, '0');
    const descMaxLen = p.cols - 18;
    p.line(`${idx} ${item.descricao.substring(0, descMaxLen).padEnd(descMaxLen)} ${String(item.quantidade.toFixed(item.quantidade % 1 === 0 ? 0 : 3)).padStart(5)} ${formataMoeda(item.total).padStart(8)}`);
    if (item.desconto > 0) {
      p.twoCol('   Desconto', `-${formataMoeda(item.desconto * item.quantidade)}`);
    }
  }
  p.separator();

  // Totais
  p.bold(true).twoCol('TOTAL', formataMoeda(dados.totalBruto)).bold(false);
  p.emptyLine();

  // Pagamentos
  for (const pg of dados.pagamentos) {
    p.twoCol(pg.descricao, formataMoeda(pg.valor));
  }
  if (dados.troco > 0) {
    p.bold(true).twoCol('TROCO', formataMoeda(dados.troco)).bold(false);
  }

  p.separator();
  p.center().line('Obrigado pela preferencia!');

  // Rodapé NFCe — imprime somente quando a nota foi emitida com sucesso
  if (dados.nfce?.chave) {
    p.emptyLine();
    p.separator('=');
    p.center().bold(true).line('NFC-e').bold(false);
    p.left();

    // Chave de acesso formatada em grupos de 4 dígitos
    const chave = dados.nfce.chave.replace(/\D/g, '');
    const chaveFmt = chave.match(/.{1,4}/g)?.join(' ') ?? chave;
    const linhaMax = p.cols;
    for (let i = 0; i < chaveFmt.length; i += linhaMax) {
      p.center().line(chaveFmt.slice(i, i + linhaMax).trim());
    }

    if (dados.nfce.protocolo) {
      p.left().twoCol('Protocolo:', dados.nfce.protocolo);
    }

    // URL de consulta
    if (dados.nfce.urlChave) {
      p.emptyLine();
      p.center().line('Consulte em:');
      const url = dados.nfce.urlChave;
      for (let i = 0; i < url.length; i += linhaMax) {
        p.center().line(url.slice(i, i + linhaMax));
      }
    }
    p.separator('=');
  }

  p.emptyLine(3);
  p.cut();

  return p.toArray();
}

/** Gera comprovante de sangria. */
export function gerarComprovanteSangria(dados: {
  nomeTerminal: string;
  operador: string;
  valor: number;
  motivo: string;
  cols?: 32 | 48;
}): number[] {
  const p = new EscPos(dados.cols ?? 48);
  const dtStr = new Date().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

  p.init();
  p.center().bold(true).line('*** SANGRIA DE CAIXA ***').bold(false);
  p.emptyLine();
  p.left();
  p.line(`Terminal: ${dados.nomeTerminal}`);
  p.line(`Operador: ${dados.operador}`);
  p.line(`Data    : ${dtStr}`);
  p.separator();
  p.bold(true).twoCol('VALOR', formataMoeda(dados.valor)).bold(false);
  p.separator('-');
  p.line(`Motivo: ${dados.motivo}`);
  p.separator();
  p.center().line('Assinatura: ____________________');
  p.emptyLine(3);
  p.cut();

  return p.toArray();
}
