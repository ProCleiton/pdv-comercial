import { invoke } from "@tauri-apps/api/core";

/** Nomes das portas seriais disponíveis no sistema. Ex: ["COM3", "COM5"] */
export async function listarPortas(): Promise<string[]> {
  try {
    return await invoke<string[]>("list_serial_ports");
  } catch {
    return [];
  }
}

/**
 * Envia bytes ESC/POS para a impressora térmica.
 * @param portName  Nome da porta serial (ex: "COM3")
 * @param baudRate  Baud rate (padrão impressoras: 9600, 19200 ou 115200)
 * @param data      Array de bytes gerado pelo EscPos formatter
 */
export async function imprimirEscPos(
  portName: string,
  baudRate: number,
  data: number[]
): Promise<void> {
  await invoke("print_escpos", { portName, baudRate, data });
}

/**
 * Abre a gaveta de dinheiro via comando ESC p pela porta da impressora.
 * A gaveta deve estar conectada ao conector RJ11 da impressora térmica.
 */
export async function abrirGaveta(portName: string, baudRate: number): Promise<void> {
  await invoke("open_cash_drawer", { portName, baudRate });
}

/**
 * Lê uma linha da balança (protocolo RS-232 texto simples).
 * Retorna a string bruta (ex: "  1.250 kg") ou null em caso de timeout/erro.
 */
export async function lerBalancaUmaVez(
  portName: string,
  baudRate: number
): Promise<string | null> {
  try {
    const raw = await invoke<string>("read_scale_once", { portName, baudRate });
    return raw.trim() || null;
  } catch {
    return null;
  }
}

/**
 * Faz o parse da string da balança para número em kg.
 * Suporta formatos comuns Toledo/Filizola: "  1.250 kg", "001250g", "+001.250"
 */
export function parsePesoKg(raw: string): number | null {
  // Remove letras e espaços, troca vírgula por ponto
  const cleaned = raw.replace(/[^\d.,-]/g, "").replace(",", ".");
  const num = parseFloat(cleaned);
  if (isNaN(num)) return null;
  // Se a string original termina em 'g' (gramas), converter para kg
  if (/g$/i.test(raw.trim())) return num / 1000;
  return num;
}
