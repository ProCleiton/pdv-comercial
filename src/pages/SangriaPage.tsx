import { useState } from "react";
import { api } from "@/services/api";
import { logInfo, logError } from "@/services/logger";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import type { TurnoCaixa } from "@/types/pdv";
import type { UsuarioPDV } from "@/lib/auth";
import { formataMoeda } from "@/lib/utils";
import { useImpressora } from "@/hooks/useImpressora";

interface Props {
  turno: TurnoCaixa;
  usuario: UsuarioPDV;
  onVoltar: () => void;
}

export default function SangriaPage({ turno, usuario, onVoltar }: Props) {
  const [valor, setValor] = useState("");
  const [motivo, setMotivo] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const [sucesso, setSucesso] = useState(false);

  const { imprimirSangria, imprimindo } = useImpressora(usuario);

  async function handleSalvar(e: React.FormEvent) {
    e.preventDefault();
    setErro("");
    const v = parseFloat(valor.replace(",", "."));
    if (!v || v <= 0) { setErro("Informe um valor válido maior que zero."); return; }
    if (!motivo.trim()) { setErro("Informe o motivo da sangria."); return; }
    setSalvando(true);
    try {
      await api.post<{ id: number }>(`/turnos-caixa/${turno.id}/sangrias`, {
        codigoFuncionario: usuario.codigoFuncionario,
        valor: v,
        motivo: motivo.trim(),
      });
      await logInfo("Sangria", usuario.login, "sangria_registrada", `turno=${turno.id} valor=${v}`);

      // Imprimir comprovante de sangria (silencioso se impressora não configurada)
      await imprimirSangria({
        nomeTerminal: turno.nomeTerminal,
        operador: usuario.nome,
        valor: v,
        motivo: motivo.trim(),
      });

      setSucesso(true);
      setValor("");
      setMotivo("");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erro ao registrar sangria";
      setErro(msg);
      await logError("Sangria", usuario.login, "erro_sangria", msg);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="flex flex-col items-center justify-center h-full gap-8 p-8">
      <div className="w-full max-w-md">
        <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-8 space-y-6">
          <div className="text-center space-y-1">
            <div className="text-4xl">💸</div>
            <h1 className="text-2xl font-bold text-[var(--foreground)]">Sangria de Caixa</h1>
            <p className="text-sm text-[var(--muted-foreground)]">Turno #{turno.id} • {turno.nomeTerminal}</p>
          </div>

          {sucesso && (
            <div className="rounded-md bg-[var(--success)]/10 border border-[var(--success)]/30 p-3 text-sm text-[var(--success)] text-center">
              ✓ Sangria registrada com sucesso!
            </div>
          )}

          <form onSubmit={handleSalvar} className="space-y-4">
            <div className="space-y-1">
              <label className="text-sm text-[var(--muted-foreground)]">Valor (R$) *</label>
              <Input
                type="text"
                inputMode="decimal"
                placeholder="0,00"
                value={valor}
                onChange={(e) => setValor(e.target.value)}
                className="text-lg text-center"
                autoFocus
              />
            </div>

            <div className="space-y-1">
              <label className="text-sm text-[var(--muted-foreground)]">Motivo *</label>
              <Input
                type="text"
                placeholder="Ex: Pagamento de fornecedor"
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                maxLength={200}
              />
            </div>

            {erro && (
              <div className="rounded-md bg-[var(--destructive)]/10 border border-[var(--destructive)]/30 p-3 text-sm text-[var(--destructive)]">
                {erro}
              </div>
            )}

            <div className="flex gap-3">
              <Button type="button" variant="outline" className="flex-1" onClick={onVoltar}>
                Voltar
              </Button>
              <Button type="submit" className="flex-1" disabled={salvando || imprimindo}>
                {salvando ? "Registrando…" : imprimindo ? "Imprimindo…" : "Registrar Sangria"}
              </Button>
            </div>
          </form>

          <div className="text-center text-xs text-[var(--muted-foreground)] border-t border-[var(--border)] pt-4">
            Valor abertura: <span className="font-medium">{formataMoeda(turno.valorAbertura)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}


export default function SangriaPage({ turno, usuario, onVoltar }: Props) {
  const [valor, setValor] = useState("");
  const [motivo, setMotivo] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const [sucesso, setSucesso] = useState(false);

  async function handleSalvar(e: React.FormEvent) {
    e.preventDefault();
    setErro("");
    const v = parseFloat(valor.replace(",", "."));
    if (!v || v <= 0) { setErro("Informe um valor válido maior que zero."); return; }
    if (!motivo.trim()) { setErro("Informe o motivo da sangria."); return; }
    setSalvando(true);
    try {
      await api.post<{ id: number }>(`/turnos-caixa/${turno.id}/sangrias`, {
        codigoFuncionario: usuario.codigoFuncionario,
        valor: v,
        motivo: motivo.trim(),
      });
      await logInfo("Sangria", usuario.login, "sangria_registrada", `turno=${turno.id} valor=${v}`);
      setSucesso(true);
      setValor("");
      setMotivo("");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erro ao registrar sangria";
      setErro(msg);
      await logError("Sangria", usuario.login, "erro_sangria", msg);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="flex flex-col items-center justify-center h-full gap-8 p-8">
      <div className="w-full max-w-md">
        <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-8 space-y-6">
          <div className="text-center space-y-1">
            <div className="text-4xl">💸</div>
            <h1 className="text-2xl font-bold text-[var(--foreground)]">Sangria de Caixa</h1>
            <p className="text-sm text-[var(--muted-foreground)]">Turno #{turno.id} • {turno.nomeTerminal}</p>
          </div>

          {sucesso && (
            <div className="rounded-md bg-[var(--success)]/10 border border-[var(--success)]/30 p-3 text-sm text-[var(--success)] text-center">
              ✓ Sangria registrada com sucesso!
            </div>
          )}

          <form onSubmit={handleSalvar} className="space-y-4">
            <div className="space-y-1">
              <label className="text-sm text-[var(--muted-foreground)]">Valor (R$) *</label>
              <Input
                type="text"
                inputMode="decimal"
                placeholder="0,00"
                value={valor}
                onChange={(e) => setValor(e.target.value)}
                className="text-lg text-center"
                autoFocus
              />
            </div>

            <div className="space-y-1">
              <label className="text-sm text-[var(--muted-foreground)]">Motivo *</label>
              <Input
                type="text"
                placeholder="Ex: Pagamento de fornecedor"
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                maxLength={200}
              />
            </div>

            {erro && (
              <div className="rounded-md bg-[var(--destructive)]/10 border border-[var(--destructive)]/30 p-3 text-sm text-[var(--destructive)]">
                {erro}
              </div>
            )}

            <div className="flex gap-3">
              <Button type="button" variant="outline" className="flex-1" onClick={onVoltar}>
                Voltar
              </Button>
              <Button type="submit" className="flex-1" disabled={salvando}>
                {salvando ? "Registrando…" : "Registrar Sangria"}
              </Button>
            </div>
          </form>

          <div className="text-center text-xs text-[var(--muted-foreground)] border-t border-[var(--border)] pt-4">
            Valor abertura: <span className="font-medium">{formataMoeda(turno.valorAbertura)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
