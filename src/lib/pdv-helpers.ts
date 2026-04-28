import type { TipoTransacaoTEF } from "@/services/tef";

/** Mapeia descricao da forma de pagamento para tipo TEF. */
export function inferirTipoTEF(descricao: string): TipoTransacaoTEF {
  const d = descricao.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (d.includes("debit") || d.includes("debito")) return "debito";
  if (d.includes("pix")) return "pix";
  if (d.includes("voucher") || d.includes("beneficio") || d.includes("vale")) return "voucher";
  if (d.includes("parc")) return "credito_parcelado_loja";
  return "credito_vista";
}

/** Retorna true se a forma de pagamento é PIX via PSP (não TEF). */
export function ehPixPsp(descricao: string): boolean {
  const d = descricao.toUpperCase();
  return d.includes("PIX") && (d.includes("PSP") || d.includes("QR"));
}

/** Retorna true se a forma de pagamento e dinheiro. */
export function ehDinheiro(descricao: string): boolean {
  return descricao.toUpperCase().includes("DINHEIRO");
}
