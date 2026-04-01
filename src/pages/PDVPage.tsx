import { useState, useEffect, useCallback, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/services/api";
import { logInfo, logError } from "@/services/logger";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { cn, formataMoeda, formataNumeroPedido } from "@/lib/utils";
import type { TurnoCaixa, Produto, ItemCarrinho, FormaPagamento, PagamentoCarrinho } from "@/types/pdv";
import type { UsuarioPDV } from "@/lib/auth";
import type { LicencaPDV } from "@/types/pdv";
import { useImpressora } from "@/hooks/useImpressora";

interface Props {
  turno: TurnoCaixa;
  usuario: UsuarioPDV;
  licenca: LicencaPDV;
  onSangria: () => void;
  onFechamento: () => void;
  onConfig: () => void;
}

export default function PDVPage({ turno, usuario, licenca, onSangria, onFechamento, onConfig }: Props) {
  const [busca, setBusca] = useState("");
  const [carrinho, setCarrinho] = useState<ItemCarrinho[]>([]);
  const [pagamentos, setPagamentos] = useState<PagamentoCarrinho[]>([]);
  const [erroBusca, setErroBusca] = useState("");
  const [finalizando, setFinalizando] = useState(false);
  const [sucesso, setSucesso] = useState(false);
  const buscaRef = useRef<HTMLInputElement>(null);

  const { imprimirRecibo, abrirGavetaManual, imprimindo, erroImpressora } = useImpressora(usuario);

  const { data: formasPagamento = [] } = useQuery<FormaPagamento[]>({
    queryKey: ["formas-pagamento"],
    queryFn: () => api.get<FormaPagamento[]>("/formas-pagamentos"),
    staleTime: 300_000,
  });

  useEffect(() => {
    buscaRef.current?.focus();
  }, [sucesso]);

  const buscarProduto = useCallback(async () => {
    const termo = busca.trim();
    if (!termo) return;
    setErroBusca("");
    try {
      let produto: Produto | null = null;
      try {
        produto = await api.get<Produto>(`/produtos/barras/${encodeURIComponent(termo)}`);
      } catch {
        const lista = await api.get<Produto[]>(`/produtos?busca=${encodeURIComponent(termo)}`);
        if (lista && lista.length > 0) produto = lista[0];
      }
      if (!produto) {
        setErroBusca("Produto não encontrado.");
        return;
      }
      adicionarAoCarrinho(produto);
      setBusca("");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erro na busca";
      setErroBusca(msg);
    }
  }, [busca]);

  function adicionarAoCarrinho(produto: Produto) {
    setCarrinho((prev) => {
      const idx = prev.findIndex((item) => item.produto.id === produto.id);
      if (idx >= 0) {
        const atualizado = [...prev];
        atualizado[idx] = { ...atualizado[idx], quantidade: atualizado[idx].quantidade + 1 };
        return atualizado;
      }
      return [...prev, { produto, quantidade: 1, precoUnitario: produto.precoVenda, desconto: 0 }];
    });
  }

  function removerItem(idx: number) {
    setCarrinho((prev) => prev.filter((_, i) => i !== idx));
  }

  function alterarQuantidade(idx: number, novaQtd: number) {
    if (novaQtd <= 0) { removerItem(idx); return; }
    setCarrinho((prev) => {
      const atualizado = [...prev];
      atualizado[idx] = { ...atualizado[idx], quantidade: novaQtd };
      return atualizado;
    });
  }

  const totalCarrinho = carrinho.reduce(
    (acc, item) => acc + (item.precoUnitario - item.desconto) * item.quantidade,
    0
  );

  const totalPago = pagamentos.reduce((acc, p) => acc + p.valor, 0);
  const restante = totalCarrinho - totalPago;
  const troco = totalPago > totalCarrinho ? totalPago - totalCarrinho : 0;

  function adicionarPagamento(forma: FormaPagamento) {
    if (restante <= 0) return;
    const valorPagamento = restante;
    setPagamentos((prev) => {
      const idx = prev.findIndex((p) => p.codigoFormaPagamento === forma.id);
      if (idx >= 0) {
        const att = [...prev];
        att[idx] = { ...att[idx], valor: att[idx].valor + valorPagamento };
        return att;
      }
      return [...prev, { codigoFormaPagamento: forma.id, nomeFormaPagamento: forma.descricao, valor: valorPagamento }];
    });
  }

  function limparPagamentos() { setPagamentos([]); }

  async function finalizarVenda() {
    if (carrinho.length === 0) { setErroBusca("Carrinho vazio."); return; }
    if (restante > 0) { setErroBusca("Pagamento insuficiente."); return; }
    setFinalizando(true);
    setErroBusca("");
    try {
      const body = {
        codigoEstabelecimento: turno.codigoEstabelecimento,
        codigoFuncionario: usuario.codigoFuncionario,
        codigoTurnoCaixa: turno.id,
        itens: carrinho.map((item) => ({
          codigoProduto: item.produto.id,
          quantidade: item.quantidade,
          precoUnitario: item.precoUnitario,
          desconto: item.desconto,
        })),
        pagamentos: pagamentos.map((p) => ({
          codigoFormaPagamento: p.codigoFormaPagamento,
          valor: p.valor,
        })),
      };
      const resultado = await api.post<{ id: number }>("/vendas", body);
      await logInfo("PDV", usuario.login, "venda_finalizada", `id=${resultado.id} itens=${carrinho.length} total=${totalCarrinho}`);

      // Imprimir recibo automaticamente (silencioso se impressora não configurada)
      await imprimirRecibo({
        numeroCupom: formataNumeroPedido(resultado.id),
        nomeEstabelecimento: licenca.nomeTerminal,
        operador: usuario.nome,
        itens: carrinho.map((item) => ({
          descricao: item.produto.descricao,
          quantidade: item.quantidade,
          precoUnitario: item.precoUnitario,
          desconto: item.desconto,
          total: (item.precoUnitario - item.desconto) * item.quantidade,
        })),
        pagamentos: pagamentos.map((p) => ({
          descricao: p.nomeFormaPagamento,
          valor: p.valor,
        })),
        totalBruto: totalCarrinho,
        troco,
      });

      setCarrinho([]);
      setPagamentos([]);
      setSucesso(true);
      setTimeout(() => setSucesso(false), 2000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erro ao finalizar venda";
      setErroBusca(msg);
      await logError("PDV", usuario.login, "erro_finalizar_venda", msg);
    } finally {
      setFinalizando(false);
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Barra superior */}
      <header className="flex items-center justify-between px-4 py-2 border-b border-[var(--border)] bg-[var(--card)]">
        <div className="flex items-center gap-3">
          <span className="text-lg font-bold text-[var(--primary)]">PDV</span>
          <span className="text-sm text-[var(--muted-foreground)]">{licenca.nomeTerminal}</span>
          <span className="text-xs text-[var(--muted-foreground)] hidden md:inline">• Turno #{turno.id}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-[var(--muted-foreground)] hidden md:inline">{usuario.nome}</span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => abrirGavetaManual()}
            title="Abrir gaveta manualmente"
          >
            🗂
          </Button>
          <Button variant="outline" size="sm" onClick={onConfig} title="Configurações de hardware">
            ⚙️
          </Button>
          <Button variant="outline" size="sm" onClick={onSangria}>Sangria</Button>
          <Button variant="destructive" size="sm" onClick={onFechamento}>Fechar Caixa</Button>
        </div>
      </header>

      {/* Mensagem de erro da impressora (não bloqueia fluxo) */}
      {erroImpressora && (
        <div className="px-4 py-1 text-xs text-[var(--destructive)] bg-[var(--destructive)]/10 border-b border-[var(--destructive)]/20">
          ⚠️ Impressora: {erroImpressora}
        </div>
      )}

      {/* Conteúdo principal */}
      <div className="flex flex-1 overflow-hidden">
        {/* Painel esquerdo: busca + carrinho */}
        <div className="flex flex-col flex-1 overflow-hidden border-r border-[var(--border)]">
          {/* Busca */}
          <div className="p-3 border-b border-[var(--border)] space-y-2">
            <div className="flex gap-2">
              <Input
                ref={buscaRef}
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && buscarProduto()}
                placeholder="Código de barras ou descrição…"
                className="flex-1 text-base"
                autoFocus
              />
              <Button onClick={buscarProduto} variant="outline">Buscar</Button>
            </div>
            {erroBusca && <p className="text-xs text-[var(--destructive)]">{erroBusca}</p>}
            {sucesso && <p className="text-xs text-[var(--success)]">✓ Venda finalizada com sucesso!</p>}
          </div>

          {/* Carrinho */}
          <div className="flex-1 overflow-auto">
            {carrinho.length === 0 ? (
              <div className="flex items-center justify-center h-full text-[var(--muted-foreground)] text-sm">
                Carrinho vazio — use a busca acima
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--border)] text-[var(--muted-foreground)]">
                    <th className="text-left px-3 py-2 font-medium">Produto</th>
                    <th className="text-center px-2 py-2 font-medium w-24">Qtd</th>
                    <th className="text-right px-3 py-2 font-medium">Preço</th>
                    <th className="text-right px-3 py-2 font-medium">Total</th>
                    <th className="w-8"></th>
                  </tr>
                </thead>
                <tbody>
                  {carrinho.map((item, idx) => (
                    <tr key={item.produto.id} className={cn("border-b border-[var(--border)]", idx % 2 === 0 ? "bg-[var(--card)]" : "")}>
                      <td className="px-3 py-2 text-[var(--foreground)]">{item.produto.descricao}</td>
                      <td className="px-2 py-2">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => alterarQuantidade(idx, item.quantidade - 1)}
                            className="w-6 h-6 rounded bg-[var(--muted)] hover:bg-[var(--border)] text-[var(--foreground)] text-xs"
                          >−</button>
                          <span className="w-8 text-center">{item.quantidade}</span>
                          <button
                            onClick={() => alterarQuantidade(idx, item.quantidade + 1)}
                            className="w-6 h-6 rounded bg-[var(--muted)] hover:bg-[var(--border)] text-[var(--foreground)] text-xs"
                          >+</button>
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right text-[var(--muted-foreground)]">{formataMoeda(item.precoUnitario)}</td>
                      <td className="px-3 py-2 text-right font-medium text-[var(--foreground)]">
                        {formataMoeda((item.precoUnitario - item.desconto) * item.quantidade)}
                      </td>
                      <td className="pr-2">
                        <button
                          onClick={() => removerItem(idx)}
                          className="text-[var(--destructive)] hover:opacity-80 text-xs px-1"
                          title="Remover"
                        >✕</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Painel direito: total + pagamentos */}
        <div className="flex flex-col w-80 shrink-0">
          {/* Total */}
          <div className="p-4 border-b border-[var(--border)] bg-[var(--card)]">
            <div className="flex justify-between items-center">
              <span className="text-[var(--muted-foreground)] text-sm">Total</span>
              <span className="text-2xl font-bold text-[var(--foreground)]">{formataMoeda(totalCarrinho)}</span>
            </div>
            {totalPago > 0 && (
              <>
                <div className="flex justify-between items-center mt-1">
                  <span className="text-sm text-[var(--muted-foreground)]">Pago</span>
                  <span className="text-sm text-[var(--success)]">{formataMoeda(totalPago)}</span>
                </div>
                {restante > 0 && (
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-[var(--muted-foreground)]">Falta</span>
                    <span className="text-sm text-[var(--warning)]">{formataMoeda(restante)}</span>
                  </div>
                )}
                {troco > 0 && (
                  <div className="flex justify-between items-center mt-1">
                    <span className="text-sm font-medium text-[var(--foreground)]">Troco</span>
                    <span className="text-lg font-bold text-[var(--success)]">{formataMoeda(troco)}</span>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Formas de pagamento */}
          <div className="p-3 border-b border-[var(--border)] space-y-2">
            <p className="text-xs font-medium text-[var(--muted-foreground)] uppercase tracking-wide">Forma de Pagamento</p>
            <div className="grid grid-cols-2 gap-2">
              {formasPagamento.map((fp) => (
                <button
                  key={fp.id}
                  onClick={() => adicionarPagamento(fp)}
                  disabled={restante <= 0}
                  className="rounded-lg border border-[var(--border)] bg-[var(--card)] hover:bg-[var(--muted)] disabled:opacity-40 py-3 px-2 text-sm text-center text-[var(--foreground)] transition-colors"
                >
                  {fp.descricao}
                </button>
              ))}
            </div>
            {pagamentos.length > 0 && (
              <div className="space-y-1 mt-2">
                {pagamentos.map((p) => (
                  <div key={p.codigoFormaPagamento} className="flex justify-between text-sm">
                    <span className="text-[var(--muted-foreground)]">{p.nomeFormaPagamento}</span>
                    <span className="text-[var(--foreground)]">{formataMoeda(p.valor)}</span>
                  </div>
                ))}
                <button onClick={limparPagamentos} className="text-xs text-[var(--destructive)] hover:opacity-80">
                  Limpar pagamentos
                </button>
              </div>
            )}
          </div>

          {/* Botões de ação */}
          <div className="p-3 space-y-2 mt-auto">
            <Button
              onClick={finalizarVenda}
              className="w-full"
              size="xl"
              disabled={finalizando || imprimindo || carrinho.length === 0 || restante > 0}
            >
              {finalizando ? "Finalizando…" : imprimindo ? "Imprimindo…" : "Finalizar Venda"}
            </Button>
            <Button
              variant="outline"
              onClick={() => { setCarrinho([]); setPagamentos([]); setErroBusca(""); }}
              className="w-full"
              size="sm"
              disabled={carrinho.length === 0}
            >
              Cancelar
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
