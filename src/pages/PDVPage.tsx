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
import { useTEF } from "@/hooks/useTEF";
import type { TipoTransacaoTEF } from "@/services/tef";
import { carregarConfigNFCe, emitirNFCeParaVenda } from "@/services/nfce";
import type { ResultadoNFCe } from "@/types/pdv";
import TEFModal from "@/components/TEFModal";
import ModalTroco from "@/pages/ModalTroco";
import ModalValorParcial from "@/pages/ModalValorParcial";
import ModalPixPdv from "@/components/ModalPixPdv";
import type { CobrancaPdv } from "@/services/api";

interface Props {
  turno: TurnoCaixa;
  usuario: UsuarioPDV;
  licenca: LicencaPDV;
  onSangria: () => void;
  onFechamento: () => void;
  onConfig: () => void;
}

/** Mapeia descricao da forma de pagamento para tipo TEF. */
function inferirTipoTEF(descricao: string): TipoTransacaoTEF {
  const d = descricao.toLowerCase();
  if (d.includes("debit") || d.includes("debito")) return "debito";
  if (d.includes("pix")) return "pix";
  if (d.includes("voucher") || d.includes("beneficio") || d.includes("vale")) return "voucher";
  if (d.includes("parc")) return "credito_parcelado_loja";
  return "credito_vista";
}

/** Retorna true se a forma de pagamento é PIX via PSP (não TEF). */
function ehPixPsp(descricao: string): boolean {
  const d = descricao.toUpperCase();
  return d.includes("PIX") && (d.includes("PSP") || d.includes("QR"));
}

/** Retorna true se a forma de pagamento e dinheiro. */
function ehDinheiro(descricao: string): boolean {
  return descricao.toUpperCase().includes("DINHEIRO");
}

export default function PDVPage({ turno, usuario, licenca, onSangria, onFechamento, onConfig }: Props) {
  const [busca, setBusca] = useState("");
  const [carrinho, setCarrinho] = useState<ItemCarrinho[]>([]);
  const [pagamentos, setPagamentos] = useState<PagamentoCarrinho[]>([]);
  const [erroBusca, setErroBusca] = useState("");
  const [finalizando, setFinalizando] = useState(false);
  const [sucesso, setSucesso] = useState(false);
  const [itemSelecionadoIdx, setItemSelecionadoIdx] = useState<number | null>(null);
  const buscaRef = useRef<HTMLInputElement>(null);

  // Modal Troco (dinheiro)
  const [showTroco, setShowTroco] = useState(false);
  const [formaTroco, setFormaTroco] = useState<FormaPagamento | null>(null);

  // Modal Valor Parcial (split payment — formas não-Dinheiro)
  const [showValorParcial, setShowValorParcial] = useState(false);
  const [fpValorParcialAtual, setFpValorParcialAtual] = useState<FormaPagamento | null>(null);

  // Estado do modal TEF
  const [showTEF, setShowTEF] = useState(false);
  const [tipoTEFAtual, setTipoTEFAtual] = useState<TipoTransacaoTEF>("credito_vista");
  const [fpTEFAtual, setFpTEFAtual] = useState<FormaPagamento | null>(null);
  const tefPendenteFinalizar = useRef(false);

  // Estado do modal PIX PSP
  const [showPixPsp, setShowPixPsp] = useState(false);
  const [fpPixPspAtual, setFpPixPspAtual] = useState<FormaPagamento | null>(null);
  const [valorPixPsp, setValorPixPsp] = useState(0);

  const { imprimirRecibo, abrirGavetaManual, imprimindo, erroImpressora } = useImpressora(usuario);
  const tef = useTEF(usuario);

  const { data: formasPagamentoRaw = [] } = useQuery<FormaPagamento[]>({
    queryKey: ["formas-pagamento"],
    queryFn: () => api.get<FormaPagamento[]>("/formas-pagamentos"),
    staleTime: 300_000,
  });

  // Deduplica por nome normalizado (salvaguarda contra DB ter registros com IDs distintos mas nomes iguais)
  const formasPagamento = Array.from(
    new Map(
      formasPagamentoRaw.map((f) => [
        f.descricao.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim(),
        f,
      ])
    ).values()
  );

  const modalAberto = showTEF || showTroco || showValorParcial || showPixPsp;

  useEffect(() => {
    if (!modalAberto) buscaRef.current?.focus();
  }, [sucesso, modalAberto]);

  // Calculos
  const totalCarrinho = carrinho.reduce(
    (acc, item) => acc + (item.precoUnitario - item.desconto) * item.quantidade,
    0
  );
  const totalPago = pagamentos.reduce((acc, p) => acc + p.valor, 0);
  const restante = totalCarrinho - totalPago;
  const troco = totalPago > totalCarrinho ? totalPago - totalCarrinho : 0;

  // ─── Atalhos de teclado globais ─────────────────────────────────────────────
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement).tagName;
      const emInput = tag === "INPUT" || tag === "TEXTAREA";

      // Esc: fecha modais ou limpa busca
      if (e.key === "Escape") {
        if (showTroco) { setShowTroco(false); setFormaTroco(null); return; }
        if (showTEF) return;
        if (busca) { setBusca(""); buscaRef.current?.focus(); }
        return;
      }

      if (modalAberto) return;

      // F12 — Finalizar venda
      if (e.key === "F12") {
        e.preventDefault();
        finalizarVenda();
        return;
      }

      // F6 — Cancelar venda
      if (e.key === "F6") {
        e.preventDefault();
        if (carrinho.length > 0) {
          setCarrinho([]);
          setPagamentos([]);
          setErroBusca("");
          setBusca("");
          buscaRef.current?.focus();
        }
        return;
      }

      // Del — Remove item selecionado (ou ultimo se nenhum selecionado)
      if (e.key === "Delete" && !emInput) {
        e.preventDefault();
        const idx = itemSelecionadoIdx !== null ? itemSelecionadoIdx : carrinho.length - 1;
        if (idx >= 0) {
          setCarrinho((prev) => prev.filter((_, i) => i !== idx));
          setItemSelecionadoIdx(null);
        }
        return;
      }

      // Setas: navega entre itens do carrinho
      if ((e.key === "ArrowUp" || e.key === "ArrowDown") && !emInput && carrinho.length > 0) {
        e.preventDefault();
        setItemSelecionadoIdx((prev) => {
          const atual = prev ?? (e.key === "ArrowDown" ? -1 : carrinho.length);
          const prox = e.key === "ArrowDown" ? atual + 1 : atual - 1;
          return Math.max(0, Math.min(prox, carrinho.length - 1));
        });
        return;
      }

      // Qualquer tecla alfanumerica fora de input: foca campo de busca
      if (!emInput && e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
        buscaRef.current?.focus();
      }
    }

    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busca, carrinho, itemSelecionadoIdx, modalAberto, showTEF, showTroco]);

  // ─── Busca com suporte a multiplicador (ex: "3*leite" ou "3*7891234567890") ──
  const buscarProduto = useCallback(async () => {
    const termo = busca.trim();
    if (!termo) return;
    setErroBusca("");

    // Detectar prefixo de quantidade: "3*termo" => qtd=3, busca="termo"
    let quantidade = 1;
    let termoBusca = termo;
    const multMatch = termo.match(/^(\d+)\*(.+)$/);
    if (multMatch) {
      quantidade = Math.max(1, parseInt(multMatch[1], 10));
      termoBusca = multMatch[2].trim();
    }

    try {
      let produto: Produto | null = null;
      try {
        produto = await api.get<Produto>(`/produtos/barras/${encodeURIComponent(termoBusca)}`);
      } catch {
        const lista = await api.get<Produto[]>(`/produtos?busca=${encodeURIComponent(termoBusca)}`);
        if (lista && lista.length > 0) produto = lista[0];
      }
      if (!produto) {
        setErroBusca("Produto não encontrado.");
        return;
      }
      adicionarAoCarrinho(produto, quantidade);
      setBusca("");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erro na busca";
      setErroBusca(msg);
    }
  }, [busca]);

  function adicionarAoCarrinho(produto: Produto, qtd = 1) {
    setCarrinho((prev) => {
      const idx = prev.findIndex((item) => item.produto.id === produto.id);
      if (idx >= 0) {
        const atualizado = [...prev];
        atualizado[idx] = { ...atualizado[idx], quantidade: atualizado[idx].quantidade + qtd };
        return atualizado;
      }
      return [...prev, { produto, quantidade: qtd, precoUnitario: produto.precoVenda, desconto: 0 }];
    });
  }

  function removerItem(idx: number) {
    setCarrinho((prev) => prev.filter((_, i) => i !== idx));
    if (itemSelecionadoIdx === idx) setItemSelecionadoIdx(null);
  }

  function alterarQuantidade(idx: number, novaQtd: number) {
    if (novaQtd <= 0) { removerItem(idx); return; }
    setCarrinho((prev) => {
      const atualizado = [...prev];
      atualizado[idx] = { ...atualizado[idx], quantidade: novaQtd };
      return atualizado;
    });
  }

  function adicionarPagamentoDireto(
    forma: FormaPagamento,
    valor: number,
    tefData?: { nsu?: string; codigoAutorizacao?: string; bandeira?: string; tipoTransacao?: string }
  ) {
    setPagamentos((prev) => [...prev, {
      id: crypto.randomUUID(),
      codigoFormaPagamento: forma.id,
      nomeFormaPagamento: forma.descricao,
      valor,
      nsu: tefData?.nsu,
      codigoAutorizacao: tefData?.codigoAutorizacao,
      bandeira: tefData?.bandeira,
      tipoTransacao: tefData?.tipoTransacao,
    }]);
  }

  async function handleCliqueFormaPagamento(forma: FormaPagamento) {
    if (restante <= 0) return;

    if (ehDinheiro(forma.descricao)) {
      setFormaTroco(forma);
      setShowTroco(true);
    } else {
      // TEF e demais formas: solicita valor parcial antes de prosseguir
      setFpValorParcialAtual(forma);
      setShowValorParcial(true);
    }
  }

  async function handleConfirmarValorParcial(valor: number) {
    if (!fpValorParcialAtual) return;
    const forma = fpValorParcialAtual;
    setShowValorParcial(false);
    setFpValorParcialAtual(null);

    if (tef.ehPagamentoTEF(forma.id)) {
      const tipo = inferirTipoTEF(forma.descricao);
      setTipoTEFAtual(tipo);
      setFpTEFAtual(forma);
      setShowTEF(true);
      tefPendenteFinalizar.current = false;
      try {
        await tef.iniciarPagamento(valor, tipo);
        tefPendenteFinalizar.current = true;
      } catch {
        setShowTEF(false);
      }
    } else if (ehPixPsp(forma.descricao)) {
      setFpPixPspAtual(forma);
      setValorPixPsp(valor);
      setShowPixPsp(true);
    } else {
      adicionarPagamentoDireto(forma, valor);
    }
  }

  function handlePixPspPago(cobranca: CobrancaPdv) {
    if (!fpPixPspAtual) return;
    adicionarPagamentoDireto(fpPixPspAtual, cobranca.valor, {
      nsu: cobranca.txid,
      tipoTransacao: "PIX_PSP",
    });
    setShowPixPsp(false);
    setFpPixPspAtual(null);
  }

  function handlePixPspCancelar() {
    setShowPixPsp(false);
    setFpPixPspAtual(null);
  }

  function handleConfirmarTroco(valorRecebido: number) {
    if (!formaTroco) return;
    adicionarPagamentoDireto(formaTroco, valorRecebido, undefined);
    setShowTroco(false);
    setFormaTroco(null);
  }

  async function handleTEFFechar() {
    if (tef.status === "aprovado" && tef.transacao && fpTEFAtual) {
      adicionarPagamentoDireto(fpTEFAtual, tef.transacao.valorCentavos / 100, {
        nsu: tef.transacao.nsu,
        codigoAutorizacao: tef.transacao.codigoAutorizacao,
        bandeira: tef.transacao.bandeira as string | undefined,
        tipoTransacao: tef.transacao.tipo,
      });
    }
    setShowTEF(false);
    tef.reset();
    setFpTEFAtual(null);
  }

  async function handleTEFCancelar() {
    await tef.cancelar();
  }

  async function handleConfirmarTEF() {
    try {
      await tef.confirmar();
    } catch {
      // erro tratado no hook
    }
  }

  useEffect(() => {
    if (showTEF && tef.status === "aguardando_cartao" && tefPendenteFinalizar.current) {
      handleConfirmarTEF();
      tefPendenteFinalizar.current = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showTEF, tef.status]);

  function limparPagamentos() { setPagamentos([]); }

  function removerPagamento(id: string) {
    setPagamentos((prev) => prev.filter((p) => p.id !== id));
  }

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
          precoVenda: item.precoUnitario,
          desconto: item.desconto,
        })),
        pagamentos: pagamentos.map((p) => ({
          codigoFormaPagamento: p.codigoFormaPagamento,
          valor: p.valor,
          ...(p.nsu               && { nsu: p.nsu }),
          ...(p.codigoAutorizacao && { codigoAutorizacao: p.codigoAutorizacao }),
          ...(p.bandeira          && { bandeira: p.bandeira }),
          ...(p.tipoTransacao     && { tipoTransacao: p.tipoTransacao }),
        })),
      };
      const resultado = await api.post<{ id: number }>("/vendas", body);
      await logInfo("PDV", usuario.login, "venda_finalizada", `id=${resultado.id} itens=${carrinho.length} total=${totalCarrinho}`);

      // Emissão NFCe — não bloqueia a venda em caso de falha
      let nfceResultado: ResultadoNFCe | undefined;
      const cfgNFCe = carregarConfigNFCe();
      if (cfgNFCe.habilitada) {
        try {
          nfceResultado = await emitirNFCeParaVenda(
            turno.codigoEstabelecimento,
            resultado.id,
            totalCarrinho,
            cfgNFCe.ambiente
          );
          await logInfo("PDV", usuario.login, "nfce_emitida", `venda=${resultado.id} chave=${nfceResultado.chave}`);
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          await logError("PDV", usuario.login, "erro_nfce", `venda=${resultado.id} ${msg}`);
          // NFCe falhou — venda já foi salva; apenas registra o erro
        }
      }

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
        ...(nfceResultado && {
          nfce: {
            chave: nfceResultado.chave,
            protocolo: nfceResultado.protocolo,
            qrcode: nfceResultado.qrcode,
            urlChave: nfceResultado.urlChave,
          },
        }),
      });

      setCarrinho([]);
      setPagamentos([]);
      setItemSelecionadoIdx(null);
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

  // Hint de multiplicador no input
  const multMatch = busca.match(/^(\d+)\*(.*)$/);
  const multiplicadorAtivo = multMatch ? parseInt(multMatch[1], 10) : null;

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
          <Button variant="outline" size="sm" onClick={() => abrirGavetaManual()} title="Abrir gaveta manualmente">🗂</Button>
          <Button variant="outline" size="sm" onClick={onConfig} title="Configuracoes de hardware">⚙️</Button>
          <Button variant="outline" size="sm" onClick={onSangria}>Sangria</Button>
          <Button variant="destructive" size="sm" onClick={onFechamento}>Fechar Caixa</Button>
        </div>
      </header>

      {erroImpressora && (
        <div className="px-4 py-1 text-xs text-[var(--destructive)] bg-[var(--destructive)]/10 border-b border-[var(--destructive)]/20">
          ⚠️ Impressora: {erroImpressora}
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        {/* Painel esquerdo: busca + carrinho */}
        <div className="flex flex-col flex-1 overflow-hidden border-r border-[var(--border)]">
          {/* Busca */}
          <div className="p-3 border-b border-[var(--border)] space-y-2">
            <div className="flex gap-2 items-center">
              <div className="relative flex-1">
                <Input
                  ref={buscaRef}
                  value={busca}
                  onChange={(e) => { setBusca(e.target.value); setErroBusca(""); }}
                  onKeyDown={(e) => e.key === "Enter" && buscarProduto()}
                  placeholder="Código de barras, descrição ou 3*codigo…"
                  className="flex-1 text-base pr-24"
                  autoFocus
                />
                {multiplicadorAtivo && (
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-[var(--primary)] bg-[var(--primary)]/10 px-2 py-0.5 rounded">
                    Qtd: {multiplicadorAtivo}
                  </span>
                )}
              </div>
              <Button onClick={buscarProduto} variant="outline">Buscar</Button>
            </div>
            <div className="flex justify-between items-center">
              <div className="flex-1">
                {erroBusca && <p className="text-xs text-[var(--destructive)]">{erroBusca}</p>}
                {sucesso && <p className="text-xs text-green-500">✓ Venda finalizada com sucesso!</p>}
              </div>
              <p className="text-xs text-[var(--muted-foreground)] hidden md:block">
                F12 Finalizar • F6 Cancelar • Del Remover • ↑↓ Navegar • Qtd*código
              </p>
            </div>
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
                    <tr
                      key={item.produto.id}
                      onClick={() => setItemSelecionadoIdx(idx)}
                      className={cn(
                        "border-b border-[var(--border)] cursor-pointer transition-colors",
                        itemSelecionadoIdx === idx
                          ? "bg-[var(--primary)]/10 ring-1 ring-inset ring-[var(--primary)]/30"
                          : idx % 2 === 0 ? "bg-[var(--card)]" : ""
                      )}
                    >
                      <td className="px-3 py-2 text-[var(--foreground)]">{item.produto.descricao}</td>
                      <td className="px-2 py-2">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={(e) => { e.stopPropagation(); alterarQuantidade(idx, item.quantidade - 1); }}
                            className="w-6 h-6 rounded bg-[var(--muted)] hover:bg-[var(--border)] text-[var(--foreground)] text-xs"
                          >−</button>
                          <span className="w-8 text-center">{item.quantidade}</span>
                          <button
                            onClick={(e) => { e.stopPropagation(); alterarQuantidade(idx, item.quantidade + 1); }}
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
                          onClick={(e) => { e.stopPropagation(); removerItem(idx); }}
                          className="text-[var(--destructive)] hover:opacity-80 text-xs px-1"
                          title="Remover (Del)"
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
                  <span className="text-sm text-green-500">{formataMoeda(totalPago)}</span>
                </div>
                {restante > 0 && (
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-[var(--muted-foreground)]">Falta</span>
                    <span className="text-sm text-yellow-500">{formataMoeda(restante)}</span>
                  </div>
                )}
                {troco > 0 && (
                  <div className="flex justify-between items-center mt-2 p-2 rounded-lg bg-green-500/10 border border-green-500/20">
                    <span className="text-sm font-medium text-[var(--foreground)]">💵 Troco</span>
                    <span className="text-xl font-bold text-green-500">{formataMoeda(troco)}</span>
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
                  onClick={() => handleCliqueFormaPagamento(fp)}
                  disabled={restante <= 0}
                  className={cn(
                    "rounded-lg border border-[var(--border)] bg-[var(--card)] hover:bg-[var(--muted)] disabled:opacity-40 py-3 px-2 text-sm text-center text-[var(--foreground)] transition-colors",
                    tef.ehPagamentoTEF(fp.id) && "ring-1 ring-[var(--primary)]",
                    ehDinheiro(fp.descricao) && "ring-1 ring-green-500/50"
                  )}
                  title={tef.ehPagamentoTEF(fp.id) ? "Pagamento via PINPAD (TEF)" : ehDinheiro(fp.descricao) ? "Informe o valor recebido para calcular troco" : undefined}
                >
                  {tef.ehPagamentoTEF(fp.id) && <span className="text-xs block text-[var(--primary)] mb-1">💳</span>}
                  {ehDinheiro(fp.descricao) && <span className="text-xs block text-green-500 mb-1">💵</span>}
                  {fp.descricao}
                </button>
              ))}
            </div>
            {pagamentos.length > 0 && (
              <div className="space-y-1 mt-2">
                {pagamentos.map((p) => (
                  <div key={p.id} className="flex justify-between items-center text-sm">
                    <span className="text-[var(--muted-foreground)]">
                      {p.nomeFormaPagamento}
                      {p.nsu && <span className="text-xs ml-1 opacity-60">NSU:{p.nsu}</span>}
                    </span>
                    <div className="flex items-center gap-1">
                      <span className="text-[var(--foreground)]">{formataMoeda(p.valor)}</span>
                      <button
                        onClick={() => removerPagamento(p.id)}
                        title="Remover pagamento"
                        className="text-[var(--destructive)] hover:opacity-80 text-xs px-1"
                      >✕</button>
                    </div>
                  </div>
                ))}
                <button onClick={limparPagamentos} className="text-xs text-[var(--destructive)] hover:opacity-80">
                  Limpar pagamentos
                </button>
              </div>
            )}
          </div>

          {/* Botoes de acao */}
          <div className="p-3 space-y-2 mt-auto">
            <Button
              onClick={finalizarVenda}
              className="w-full"
              size="xl"
              disabled={finalizando || imprimindo || carrinho.length === 0 || restante > 0}
            >
              {finalizando ? "Finalizando…" : imprimindo ? "Imprimindo…" : "Finalizar Venda (F12)"}
            </Button>
            <Button
              variant="outline"
              onClick={() => { setCarrinho([]); setPagamentos([]); setErroBusca(""); setItemSelecionadoIdx(null); }}
              className="w-full"
              size="sm"
              disabled={carrinho.length === 0}
            >
              Cancelar Venda (F6)
            </Button>
          </div>
        </div>
      </div>

      {/* Modal TEF */}
      {showTEF && (
        <TEFModal
          transacao={tef.transacao}
          status={tef.status}
          tipo={tipoTEFAtual}
          onCancelar={handleTEFCancelar}
          onFechar={handleTEFFechar}
        />
      )}

      {/* Modal Troco (dinheiro) */}
      {showTroco && (
        <ModalTroco
          valorRestante={restante}
          onConfirmar={handleConfirmarTroco}
          onCancelar={() => { setShowTroco(false); setFormaTroco(null); }}
        />
      )}

      {/* Modal Valor Parcial (split payment) */}
      {showValorParcial && fpValorParcialAtual && (
        <ModalValorParcial
          forma={fpValorParcialAtual}
          valorMaximo={restante}
          onConfirmar={handleConfirmarValorParcial}
          onCancelar={() => { setShowValorParcial(false); setFpValorParcialAtual(null); }}
        />
      )}

      {/* Modal PIX via PSP */}
      {showPixPsp && fpPixPspAtual && (
        <ModalPixPdv
          valor={valorPixPsp}
          codigoEstabelecimento={turno.codigoEstabelecimento}
          descricao="Pagamento PDV"
          onPago={handlePixPspPago}
          onCancelar={handlePixPspCancelar}
        />
      )}
    </div>
  );
}
