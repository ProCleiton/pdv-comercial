import { useState, useEffect, useCallback, useRef } from "react";
import { lerBalancaUmaVez, parsePesoKg } from "@/services/serial";

export interface ConfigBalanca {
  portaSerial: string;
  baudRate: number;
  intervaloMs: number; // polling interval (padrão 500ms)
}

function carregarConfigBalanca(): ConfigBalanca | null {
  try {
    const raw = localStorage.getItem("pdv:config:balanca");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function salvarConfigBalanca(cfg: ConfigBalanca) {
  localStorage.setItem("pdv:config:balanca", JSON.stringify(cfg));
}

/**
 * Hook que faz polling da balança enquanto `ativo=true`.
 * Retorna o último peso lido em kg, ou null se sem leitura.
 *
 * Uso na PDVPage:
 *   const { pesoKg, lendo } = useBalanca({ ativo: modoBalanca });
 *   // quando pesoKg muda, preencher quantidade do item atual
 */
export function useBalanca(options: { ativo: boolean }) {
  const [pesoKg, setPesoKg] = useState<number | null>(null);
  const [lendo, setLendo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const cancelRef = useRef(false);

  const lerUmaVez = useCallback(async (): Promise<number | null> => {
    const cfg = carregarConfigBalanca();
    if (!cfg?.portaSerial) return null;
    const raw = await lerBalancaUmaVez(cfg.portaSerial, cfg.baudRate);
    if (!raw) return null;
    return parsePesoKg(raw);
  }, []);

  useEffect(() => {
    if (!options.ativo) {
      setPesoKg(null);
      setLendo(false);
      return;
    }

    const cfg = carregarConfigBalanca();
    if (!cfg?.portaSerial) {
      setErro("Balança não configurada. Configure em Config PDV.");
      return;
    }

    cancelRef.current = false;
    setLendo(true);
    setErro(null);

    async function poll() {
      if (cancelRef.current) return;
      try {
        const peso = await lerUmaVez();
        if (!cancelRef.current && peso !== null) {
          setPesoKg(peso);
        }
      } catch (err: unknown) {
        if (!cancelRef.current) {
          setErro(err instanceof Error ? err.message : "Erro de leitura");
        }
      }
      if (!cancelRef.current) {
        setTimeout(poll, cfg?.intervaloMs ?? 500);
      }
    }

    poll();

    return () => {
      cancelRef.current = true;
      setLendo(false);
    };
  }, [options.ativo, lerUmaVez]);

  const temBalanca = !!carregarConfigBalanca()?.portaSerial;

  return { pesoKg, lendo, erro, temBalanca, lerUmaVez };
}
