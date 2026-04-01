import { Button } from "@/components/ui/Button";
import type { TransacaoTEF, StatusTransacaoTEF, TipoTransacaoTEF } from "@/services/tef";
import { descricaoStatusTEF, corStatusTEF, labelValorTEF } from "@/hooks/useTEF";

interface Props {
  transacao: TransacaoTEF | null;
  status: StatusTransacaoTEF;
  tipo: TipoTransacaoTEF;
  onCancelar: () => void;
  onFechar: () => void;  // após aprovado/recusado/cancelado
}

const ICONE: Record<StatusTransacaoTEF, string> = {
  idle: "💳",
  iniciando: "⏳",
  aguardando_cartao: "💳",
  aguardando_senha: "🔑",
  processando: "⏳",
  aprovado: "✅",
  recusado: "❌",
  cancelado: "🚫",
  erro: "⚠️",
};

const TIPO_LABEL: Record<TipoTransacaoTEF, string> = {
  debito: "Débito",
  credito_vista: "Crédito à Vista",
  credito_parcelado_loja: "Créd. Parc. Loja",
  credito_parcelado_adm: "Créd. Parc. Adm",
  pix: "Pix",
  voucher: "Voucher",
};

const STATUS_TERMINAL: StatusTransacaoTEF[] = ["aprovado", "recusado", "cancelado", "erro"];
const STATUS_CANCELAVEL: StatusTransacaoTEF[] = ["aguardando_cartao", "aguardando_senha"];

export default function TEFModal({ transacao, status, tipo, onCancelar, onFechar }: Props) {
  const eTerminal = STATUS_TERMINAL.includes(status);
  const eCancelavel = STATUS_CANCELAVEL.includes(status);
  const mensagem = transacao?.mensagemOperador ?? descricaoStatusTEF(status);
  const cor = corStatusTEF(status);

  return (
    /* Overlay */
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-6 space-y-6">

        {/* Ícone + tipo */}
        <div className="text-center space-y-1">
          <div className="text-5xl">{ICONE[status]}</div>
          <p className="text-xs font-medium text-[var(--muted-foreground)] uppercase tracking-wide">
            Pagamento {TIPO_LABEL[tipo]}
          </p>
        </div>

        {/* Valor */}
        {transacao && (
          <div className="text-center">
            <p className="text-3xl font-bold text-[var(--foreground)]">
              {labelValorTEF(transacao.valorCentavos)}
            </p>
            {transacao.parcelas > 1 && (
              <p className="text-sm text-[var(--muted-foreground)]">
                em {transacao.parcelas}×
              </p>
            )}
          </div>
        )}

        {/* Status / mensagem */}
        <div className="rounded-lg bg-[var(--muted)] px-4 py-3 text-center space-y-1">
          <p className="text-sm font-semibold" style={{ color: cor }}>
            {descricaoStatusTEF(status)}
          </p>
          {mensagem !== descricaoStatusTEF(status) && (
            <p className="text-xs text-[var(--muted-foreground)]">{mensagem}</p>
          )}
          {transacao?.mensagemCliente && (
            <p className="text-xs text-[var(--foreground)] font-medium border-t border-[var(--border)] pt-2 mt-2">
              {transacao.mensagemCliente}
            </p>
          )}
        </div>

        {/* Dados de aprovação */}
        {status === "aprovado" && transacao && (
          <div className="text-xs space-y-1 text-[var(--muted-foreground)] border rounded-md px-3 py-2 border-[var(--border)]">
            {transacao.bandeira && <div className="flex justify-between"><span>Bandeira</span><span className="font-medium text-[var(--foreground)]">{transacao.bandeira}</span></div>}
            {transacao.nsu && <div className="flex justify-between"><span>NSU</span><span className="font-medium text-[var(--foreground)]">{transacao.nsu}</span></div>}
            {transacao.codigoAutorizacao && <div className="flex justify-between"><span>Autorização</span><span className="font-medium text-[var(--foreground)]">{transacao.codigoAutorizacao}</span></div>}
          </div>
        )}

        {/* Spinner para estados em andamento */}
        {!eTerminal && (
          <div className="flex justify-center">
            <div className="w-8 h-8 border-4 border-[var(--primary)] border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {/* Botões */}
        <div className="space-y-2">
          {eTerminal && (
            <Button className="w-full" onClick={onFechar}>
              {status === "aprovado" ? "Continuar" : "Fechar"}
            </Button>
          )}
          {eCancelavel && (
            <Button variant="outline" className="w-full text-[var(--destructive)]" onClick={onCancelar}>
              Cancelar Transação
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
