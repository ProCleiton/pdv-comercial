import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import {
  gerarCobrancaAvulsa,
  consultarStatusCobranca,
  type CobrancaPdv,
} from "@/services/api";

interface Props {
  valor: number;
  codigoEstabelecimento: number;
  descricao?: string;
  onPago: (cobranca: CobrancaPdv) => void;
  onCancelar: () => void;
}

const POLL_MS = 3_000;

export default function ModalPixPdv({
  valor,
  codigoEstabelecimento,
  descricao,
  onPago,
  onCancelar,
}: Props) {
  const [cobranca, setCobranca] = useState<CobrancaPdv | null>(null);
  const [erro, setErro] = useState("");
  const [copiado, setCopiado] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const resolvidoRef = useRef(false);

  useEffect(() => {
    async function iniciar() {
      try {
        const c = await gerarCobrancaAvulsa(valor, codigoEstabelecimento, descricao);
        setCobranca(c);
        iniciarPolling(c.codigo);
      } catch (err) {
        setErro(err instanceof Error ? err.message : "Erro ao gerar PIX");
      }
    }
    void iniciar();

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function iniciarPolling(cobrancaId: number) {
    intervalRef.current = setInterval(async () => {
      if (resolvidoRef.current) return;
      try {
        const atualizada = await consultarStatusCobranca(cobrancaId);
        setCobranca(atualizada);
        if (atualizada.status === "PAGO") {
          resolvidoRef.current = true;
          if (intervalRef.current) clearInterval(intervalRef.current);
          onPago(atualizada);
        } else if (atualizada.status === "CANCELADO" || atualizada.status === "EXPIRADO") {
          resolvidoRef.current = true;
          if (intervalRef.current) clearInterval(intervalRef.current);
          setErro(`PIX ${atualizada.status.toLowerCase()}. Tente outro método.`);
        }
      } catch {
        // ignora erros de polling temporários
      }
    }, POLL_MS);
  }

  function copiarPix() {
    if (!cobranca?.qrcodeText) return;
    void navigator.clipboard.writeText(cobranca.qrcodeText).then(() => {
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    });
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
      <div className="bg-background rounded-xl shadow-2xl p-6 w-96 space-y-4 text-center">
        <h2 className="text-xl font-bold">Pagamento via PIX</h2>

        <p className="text-muted-foreground text-sm">
          Valor:{" "}
          <strong>
            {valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
          </strong>
        </p>

        {!cobranca && !erro && (
          <div className="flex flex-col items-center gap-2 py-6">
            <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
            <span className="text-sm text-muted-foreground">Gerando QR Code…</span>
          </div>
        )}

        {cobranca && cobranca.status === "PENDENTE" && (
          <>
            {cobranca.qrcodeImageBase64 ? (
              <img
                src={`data:image/png;base64,${cobranca.qrcodeImageBase64}`}
                alt="QR Code PIX"
                className="mx-auto w-52 h-52 rounded border"
              />
            ) : (
              <div className="mx-auto w-52 h-52 rounded border bg-muted flex items-center justify-center">
                <span className="text-4xl">📱</span>
              </div>
            )}

            {cobranca.qrcodeText && (
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Copia e cola:</p>
                <div className="flex gap-2">
                  <code className="text-xs bg-muted px-2 py-1 rounded flex-1 truncate text-left">
                    {cobranca.qrcodeText}
                  </code>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={copiarPix}
                    className="shrink-0"
                  >
                    {copiado ? "✓" : "Copiar"}
                  </Button>
                </div>
              </div>
            )}

            <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
              <div className="animate-spin w-3 h-3 border-2 border-primary border-t-transparent rounded-full" />
              Aguardando pagamento…
            </div>
          </>
        )}

        {cobranca && cobranca.status === "PAGO" && (
          <div className="py-6 text-green-500 text-lg font-bold">✅ PIX Pago!</div>
        )}

        {erro && (
          <p className="text-destructive text-sm">{erro}</p>
        )}

        <div className="flex gap-2 justify-center pt-2">
          <Button variant="outline" onClick={onCancelar}>
            Cancelar
          </Button>
        </div>
      </div>
    </div>
  );
}
