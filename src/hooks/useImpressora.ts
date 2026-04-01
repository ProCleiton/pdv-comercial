import { useCallback, useState } from "react";
import { imprimirEscPos, abrirGaveta } from "@/services/serial";
import { gerarRecibo, gerarComprovanteSangria } from "@/services/escpos";
import type { DadosRecibo } from "@/services/escpos";
import { logError, logInfo } from "@/services/logger";
import type { UsuarioPDV } from "@/lib/auth";

export interface ConfigImpressora {
  portaSerial: string;   // ex: "COM3"
  baudRate: number;      // ex: 9600
  colunas: 32 | 48;     // 58mm=32, 80mm=48
  abrirGaveta: boolean;  // abrir gaveta automaticamente ao finalizar venda
}

function carregarConfigImpressora(): ConfigImpressora | null {
  try {
    const raw = localStorage.getItem("pdv:config:impressora");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function salvarConfigImpressora(cfg: ConfigImpressora) {
  localStorage.setItem("pdv:config:impressora", JSON.stringify(cfg));
}

export function useImpressora(usuario: UsuarioPDV) {
  const [imprimindo, setImprimindo] = useState(false);
  const [erroImpressora, setErroImpressora] = useState<string | null>(null);

  const config = carregarConfigImpressora();

  const temImpressora = !!config?.portaSerial;

  const imprimirRecibo = useCallback(
    async (dados: DadosRecibo) => {
      const cfg = carregarConfigImpressora();
      if (!cfg?.portaSerial) return; // impressora não configurada — silencioso

      setImprimindo(true);
      setErroImpressora(null);
      try {
        const bytes = gerarRecibo({ ...dados, cols: cfg.colunas });
        await imprimirEscPos(cfg.portaSerial, cfg.baudRate, bytes);
        if (cfg.abrirGaveta) {
          await abrirGaveta(cfg.portaSerial, cfg.baudRate);
        }
        await logInfo("Impressora", usuario.login, "recibo_impresso", `cupom=${dados.numeroCupom}`);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        setErroImpressora(msg);
        await logError("Impressora", usuario.login, "erro_impressao", msg);
      } finally {
        setImprimindo(false);
      }
    },
    [usuario.login]
  );

  const imprimirSangria = useCallback(
    async (dados: Parameters<typeof gerarComprovanteSangria>[0]) => {
      const cfg = carregarConfigImpressora();
      if (!cfg?.portaSerial) return;

      setImprimindo(true);
      setErroImpressora(null);
      try {
        const bytes = gerarComprovanteSangria({ ...dados, cols: cfg.colunas });
        await imprimirEscPos(cfg.portaSerial, cfg.baudRate, bytes);
        await logInfo("Impressora", usuario.login, "sangria_impressa", `valor=${dados.valor}`);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        setErroImpressora(msg);
        await logError("Impressora", usuario.login, "erro_impressao_sangria", msg);
      } finally {
        setImprimindo(false);
      }
    },
    [usuario.login]
  );

  const abrirGavetaManual = useCallback(async () => {
    const cfg = carregarConfigImpressora();
    if (!cfg?.portaSerial) {
      setErroImpressora("Impressora não configurada.");
      return;
    }
    try {
      await abrirGaveta(cfg.portaSerial, cfg.baudRate);
      await logInfo("Impressora", usuario.login, "gaveta_aberta_manual", "");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setErroImpressora(msg);
    }
  }, [usuario.login]);

  return { imprimindo, erroImpressora, temImpressora, imprimirRecibo, imprimirSangria, abrirGavetaManual };
}
