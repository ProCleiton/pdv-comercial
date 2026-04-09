import { api } from "@/services/api";
import type { ConfigNFCe, ResultadoNFCe } from "@/types/pdv";

const STORAGE_KEY = "pdv:config:nfce";

export const CONFIG_NFCE_PADRAO: ConfigNFCe = {
  habilitada: false,
  ambiente: "2",
};

export function carregarConfigNFCe(): ConfigNFCe {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...CONFIG_NFCE_PADRAO, ...JSON.parse(raw) };
  } catch {/* */}
  return { ...CONFIG_NFCE_PADRAO };
}

export function salvarConfigNFCe(cfg: ConfigNFCe): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
}

interface NotaFiscalCriada {
  id: number;
}

/**
 * Cria um registro de nota fiscal NFCe no backend e a emite.
 * Retorna os dados da emissão (chave, protocolo, QR code).
 * Em caso de erro, propaga a exceção — o chamador decide como tratar.
 */
export async function emitirNFCeParaVenda(
  codigoEstabelecimento: number,
  codigoVenda: number,
  valorTotal: number,
  ambiente: "1" | "2"
): Promise<ResultadoNFCe> {
  const dtEmissao = new Date().toISOString().slice(0, 10);

  const nota = await api.post<NotaFiscalCriada>("/notas-fiscais", {
    codigoEstabelecimento,
    tipoDocumento: "NFCe",
    ambiente,
    dtEmissao,
    valorTotal,
    codigoVenda,
  });

  const emissao = await api.post<{
    ok: boolean;
    chave: string;
    protocolo: string;
    status: string;
    qrcode: string;
    urlChave: string;
  }>(`/notas-fiscais/${nota.id}/emitir-nfce`, {});

  return {
    notaId: nota.id,
    chave: emissao.chave ?? "",
    protocolo: emissao.protocolo ?? "",
    status: emissao.status ?? "",
    qrcode: emissao.qrcode ?? "",
    urlChave: emissao.urlChave ?? "",
  };
}
