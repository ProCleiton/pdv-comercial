import { useState, useEffect } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { listarPortas, imprimirEscPos, abrirGaveta } from "@/services/serial";
import { EscPos } from "@/services/escpos";
import {
  salvarConfigImpressora,
  type ConfigImpressora,
} from "@/hooks/useImpressora";
import { salvarConfigBalanca, type ConfigBalanca } from "@/hooks/useBalanca";
import {
  salvarConfigTEF,
  carregarConfigTEF,
  CONFIG_TEF_PADRAO,
  type ConfigTEF,
} from "@/services/tef";
import {
  carregarConfigNFCe,
  salvarConfigNFCe,
  CONFIG_NFCE_PADRAO,
} from "@/services/nfce";
import type { ConfigNFCe } from "@/types/pdv";
import { useQuery } from "@tanstack/react-query";
import { api, getApiBaseUrl, setApiBaseUrl } from "@/services/api";
import type { FormaPagamento } from "@/types/pdv";

interface Props {
  onVoltar: () => void;
}

const BAUD_RATES = [1200, 2400, 4800, 9600, 19200, 38400, 57600, 115200];

function loadConfigImpressora(): ConfigImpressora {
  try {
    const raw = localStorage.getItem("pdv:config:impressora");
    if (raw) return JSON.parse(raw);
  } catch {/* */}
  return { portaSerial: "", baudRate: 9600, colunas: 48, abrirGaveta: true };
}

function loadConfigBalanca(): ConfigBalanca {
  try {
    const raw = localStorage.getItem("pdv:config:balanca");
    if (raw) return JSON.parse(raw);
  } catch {/* */}
  return { portaSerial: "", baudRate: 9600, intervaloMs: 500 };
}

export default function ConfigPDVPage({ onVoltar }: Props) {
  const [portas, setPortas] = useState<string[]>([]);
  const [carregandoPortas, setCarregandoPortas] = useState(false);

  const [cfgImpressora, setCfgImpressora] = useState<ConfigImpressora>(loadConfigImpressora);
  const [cfgBalanca, setCfgBalanca] = useState<ConfigBalanca>(loadConfigBalanca);
  const [cfgTEF, setCfgTEF] = useState<ConfigTEF>(() => carregarConfigTEF() ?? CONFIG_TEF_PADRAO);
  const [cfgNFCe, setCfgNFCe] = useState<ConfigNFCe>(() => carregarConfigNFCe() ?? CONFIG_NFCE_PADRAO);

  const [urlServidor, setUrlServidor] = useState(() => getApiBaseUrl());
  const [testandoServidor, setTestandoServidor] = useState(false);
  const [feedbackServidor, setFeedbackServidor] = useState("");

  const [testandoImpressora, setTestando] = useState(false);
  const [feedbackImpressora, setFeedbackImpressora] = useState("");
  const [feedbackBalanca, setFeedbackBalanca] = useState("");
  const [salvo, setSalvo] = useState(false);

  const { data: formasPagamento = [] } = useQuery<FormaPagamento[]>({
    queryKey: ["formas-pagamento"],
    queryFn: () => api.get<FormaPagamento[]>("/formas-pagamentos"),
    staleTime: 300_000,
  });

  async function atualizarPortas() {
    setCarregandoPortas(true);
    const lista = await listarPortas();
    setPortas(lista);
    setCarregandoPortas(false);
  }

  useEffect(() => { atualizarPortas(); }, []);

  function salvarTudo() {
    setApiBaseUrl(urlServidor);
    salvarConfigImpressora(cfgImpressora);
    salvarConfigBalanca(cfgBalanca);
    salvarConfigTEF(cfgTEF);
    salvarConfigNFCe(cfgNFCe);
    setSalvo(true);
    setTimeout(() => setSalvo(false), 2500);
  }

  async function testarImpressora() {
    if (!cfgImpressora.portaSerial) {
      setFeedbackImpressora("Selecione uma porta serial.");
      return;
    }
    setTestando(true);
    setFeedbackImpressora("");
    try {
      const p = new EscPos(cfgImpressora.colunas);
      p.init()
        .center().bold(true).line("** TESTE DE IMPRESSAO **").bold(false)
        .left().separator()
        .line("PDV ComercialIA")
        .line("Impressora configurada com sucesso!")
        .emptyLine()
        .twoCol("Porta:", cfgImpressora.portaSerial)
        .twoCol("Baud:", String(cfgImpressora.baudRate))
        .twoCol("Colunas:", String(cfgImpressora.colunas))
        .separator()
        .emptyLine(3).cut();
      await imprimirEscPos(cfgImpressora.portaSerial, cfgImpressora.baudRate, p.toArray());
      setFeedbackImpressora("✓ Teste enviado com sucesso!");
    } catch (err: unknown) {
      setFeedbackImpressora("Erro: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setTestando(false);
    }
  }

  async function testarGaveta() {
    if (!cfgImpressora.portaSerial) {
      setFeedbackImpressora("Selecione uma porta serial para a impressora/gaveta.");
      return;
    }
    try {
      await abrirGaveta(cfgImpressora.portaSerial, cfgImpressora.baudRate);
      setFeedbackImpressora("✓ Comando de gaveta enviado!");
    } catch (err: unknown) {
      setFeedbackImpressora("Erro gaveta: " + (err instanceof Error ? err.message : String(err)));
    }
  }

  return (
    <div className="flex flex-col h-full overflow-auto">
      {/* Header */}
      <header className="flex items-center gap-3 px-4 py-3 border-b border-[var(--border)] bg-[var(--card)]">
        <Button variant="outline" size="sm" onClick={onVoltar}>← Voltar</Button>
        <h1 className="text-base font-semibold text-[var(--foreground)]">Configuração de Hardware</h1>
      </header>

      <div className="flex-1 p-6 space-y-8 max-w-2xl mx-auto w-full">

        {/* Servidor */}
        <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-4 space-y-4">
          <h2 className="text-sm font-semibold text-[var(--foreground)]">🌐 Servidor</h2>
          <p className="text-xs text-[var(--muted-foreground)]">
            URL da API ComercialIA. Altere apenas ao conectar em um servidor remoto (produção).
          </p>

          <div className="space-y-1">
            <label className="text-xs text-[var(--muted-foreground)]">URL do servidor</label>
            <Input
              value={urlServidor}
              onChange={(e) => { setUrlServidor(e.target.value); setFeedbackServidor(""); }}
              placeholder="http://192.168.1.10:9000"
            />
            <p className="text-xs text-[var(--muted-foreground)]">
              Padrão local: <code>http://localhost:9000</code>
            </p>
          </div>

          {feedbackServidor && (
            <p className={`text-xs ${feedbackServidor.startsWith("✓") ? "text-[var(--success,#22c55e)]" : "text-[var(--destructive)]"}`}>
              {feedbackServidor}
            </p>
          )}

          <Button
            variant="outline"
            size="sm"
            disabled={testandoServidor}
            onClick={async () => {
              const urlNorm = urlServidor.replace(/\/$/, "").trim();
              if (!urlNorm) { setFeedbackServidor("Informe a URL do servidor."); return; }
              setTestandoServidor(true);
              setFeedbackServidor("");
              try {
                const res = await fetch(`${urlNorm}/actuator/health`, { signal: AbortSignal.timeout(5000) });
                setFeedbackServidor(res.ok ? "✓ Servidor acessível e saudável." : `Servidor respondeu com status ${res.status}.`);
              } catch {
                setFeedbackServidor("Não foi possível conectar. Verifique a URL e a rede.");
              } finally {
                setTestandoServidor(false);
              }
            }}
          >
            {testandoServidor ? "Testando…" : "Testar Conexão"}
          </Button>
        </div>

        {/* Portas disponíveis */}
        <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-[var(--foreground)]">Portas Seriais Disponíveis</h2>
            <Button variant="outline" size="sm" onClick={atualizarPortas} disabled={carregandoPortas}>
              {carregandoPortas ? "Buscando…" : "Atualizar"}
            </Button>
          </div>
          {portas.length === 0 ? (
            <p className="text-sm text-[var(--muted-foreground)]">Nenhuma porta encontrada. Verifique os cabos USB/serial.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {portas.map((p) => (
                <span key={p} className="rounded-full px-3 py-1 text-xs border border-[var(--border)] bg-[var(--muted)] text-[var(--foreground)]">
                  {p}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Impressora / Gaveta */}
        <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-4 space-y-4">
          <h2 className="text-sm font-semibold text-[var(--foreground)]">🖨️ Impressora Térmica + Gaveta</h2>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs text-[var(--muted-foreground)]">Porta Serial</label>
              <Input
                value={cfgImpressora.portaSerial}
                onChange={(e) => setCfgImpressora((c) => ({ ...c, portaSerial: e.target.value }))}
                placeholder="Ex: COM3"
                list="portas-impressora"
              />
              <datalist id="portas-impressora">
                {portas.map((p) => <option key={p} value={p} />)}
              </datalist>
            </div>

            <div className="space-y-1">
              <label className="text-xs text-[var(--muted-foreground)]">Baud Rate</label>
              <select
                value={cfgImpressora.baudRate}
                onChange={(e) => setCfgImpressora((c) => ({ ...c, baudRate: Number(e.target.value) }))}
                className="flex h-10 w-full rounded-md border border-[var(--border)] bg-[var(--input)] px-3 text-sm text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
              >
                {BAUD_RATES.map((b) => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>
          </div>

          <div className="flex items-center gap-6">
            <label className="flex items-center gap-2 text-sm text-[var(--foreground)] cursor-pointer">
              <input
                type="radio"
                name="colunas"
                value={48}
                checked={cfgImpressora.colunas === 48}
                onChange={() => setCfgImpressora((c) => ({ ...c, colunas: 48 }))}
              />
              Papel 80mm (48 colunas)
            </label>
            <label className="flex items-center gap-2 text-sm text-[var(--foreground)] cursor-pointer">
              <input
                type="radio"
                name="colunas"
                value={32}
                checked={cfgImpressora.colunas === 32}
                onChange={() => setCfgImpressora((c) => ({ ...c, colunas: 32 }))}
              />
              Papel 58mm (32 colunas)
            </label>
          </div>

          <label className="flex items-center gap-2 text-sm text-[var(--foreground)] cursor-pointer">
            <input
              type="checkbox"
              checked={cfgImpressora.abrirGaveta}
              onChange={(e) => setCfgImpressora((c) => ({ ...c, abrirGaveta: e.target.checked }))}
            />
            Abrir gaveta automaticamente ao finalizar venda
          </label>

          {feedbackImpressora && (
            <p className={`text-xs ${feedbackImpressora.startsWith("✓") ? "text-[var(--success)]" : "text-[var(--destructive)]"}`}>
              {feedbackImpressora}
            </p>
          )}

          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={testarImpressora} disabled={testandoImpressora}>
              {testandoImpressora ? "Imprimindo…" : "Imprimir Teste"}
            </Button>
            <Button variant="outline" size="sm" onClick={testarGaveta}>
              Testar Gaveta
            </Button>
          </div>
        </div>

        {/* Balança */}
        <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-4 space-y-4">
          <h2 className="text-sm font-semibold text-[var(--foreground)]">⚖️ Balança (RS-232)</h2>
          <p className="text-xs text-[var(--muted-foreground)]">
            Suporte: Toledo Prix 3, Filizola MX, e similares (protocolo ASCII peso + unidade).
          </p>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs text-[var(--muted-foreground)]">Porta Serial</label>
              <Input
                value={cfgBalanca.portaSerial}
                onChange={(e) => setCfgBalanca((c) => ({ ...c, portaSerial: e.target.value }))}
                placeholder="Ex: COM5"
                list="portas-balanca"
              />
              <datalist id="portas-balanca">
                {portas.map((p) => <option key={p} value={p} />)}
              </datalist>
            </div>

            <div className="space-y-1">
              <label className="text-xs text-[var(--muted-foreground)]">Baud Rate</label>
              <select
                value={cfgBalanca.baudRate}
                onChange={(e) => setCfgBalanca((c) => ({ ...c, baudRate: Number(e.target.value) }))}
                className="flex h-10 w-full rounded-md border border-[var(--border)] bg-[var(--input)] px-3 text-sm text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
              >
                {BAUD_RATES.map((b) => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs text-[var(--muted-foreground)]">Intervalo de leitura (ms)</label>
            <Input
              type="number"
              min={100}
              max={5000}
              step={100}
              value={cfgBalanca.intervaloMs}
              onChange={(e) => setCfgBalanca((c) => ({ ...c, intervaloMs: Number(e.target.value) }))}
              className="w-32"
            />
          </div>

          {feedbackBalanca && (
            <p className={`text-xs ${feedbackBalanca.startsWith("✓") ? "text-[var(--success)]" : "text-[var(--destructive)]"}`}>
              {feedbackBalanca}
            </p>
          )}
        </div>

        {/* TEF / PINPAD */}
        <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-4 space-y-4">
          <h2 className="text-sm font-semibold text-[var(--foreground)]">💳 PINPAD / TEF</h2>
          <p className="text-xs text-[var(--muted-foreground)]">
            Pagamentos eletrônicos via terminal de cartão. Use <strong>Mock</strong> para desenvolvimento sem hardware.
          </p>

          <div className="space-y-1">
            <label className="text-xs text-[var(--muted-foreground)]">Provider</label>
            <div className="flex gap-4">
              {(["mock", "sitef", "backend"] as const).map((p) => (
                <label key={p} className="flex items-center gap-2 text-sm text-[var(--foreground)] cursor-pointer">
                  <input
                    type="radio"
                    name="tef-provider"
                    value={p}
                    checked={cfgTEF.provider === p}
                    onChange={() => setCfgTEF((c) => ({ ...c, provider: p }))}
                  />
                  {p === "mock" ? "Mock (desenvolvimento)" : p === "sitef" ? "SiTef (intSiTef local)" : "Backend (via servidor — recomendado)"}
                </label>
              ))}
            </div>
          </div>

          {cfgTEF.provider === "sitef" && (
            <div className="space-y-3 pl-4 border-l-2 border-[var(--border)]">
              <div className="space-y-1">
                <label className="text-xs text-[var(--muted-foreground)]">Endpoint intSiTef</label>
                <Input
                  value={cfgTEF.endpointSitef}
                  onChange={(e) => setCfgTEF((c) => ({ ...c, endpointSitef: e.target.value }))}
                  placeholder="http://localhost:4096"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs text-[var(--muted-foreground)]">Cód. Estabelecimento SiTef</label>
                  <Input
                    value={cfgTEF.codigoEstabelecimentoSitef}
                    onChange={(e) => setCfgTEF((c) => ({ ...c, codigoEstabelecimentoSitef: e.target.value }))}
                    placeholder="00000000"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-[var(--muted-foreground)]">Cód. Terminal SiTef</label>
                  <Input
                    value={cfgTEF.codigoTerminalSitef}
                    onChange={(e) => setCfgTEF((c) => ({ ...c, codigoTerminalSitef: e.target.value }))}
                    placeholder="001"
                  />
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-xs text-[var(--muted-foreground)]">Timeout (segundos)</label>
                <Input
                  type="number"
                  min={10}
                  max={300}
                  value={cfgTEF.timeoutSegundos}
                  onChange={(e) => setCfgTEF((c) => ({ ...c, timeoutSegundos: Number(e.target.value) }))}
                  className="w-24"
                />
              </div>
            </div>
          )}

          {cfgTEF.provider === "backend" && (
            <div className="space-y-3 pl-4 border-l-2 border-[var(--border)]">
              <p className="text-xs text-[var(--muted-foreground)]">
                O PDV delega todas as operações TEF ao servidor. O servidor Spring Boot audita cada
                transação e se comunica com o PINPAD via microserviço fiscal (ACBrTEF).
              </p>
              <div className="space-y-1">
                <label className="text-xs text-[var(--muted-foreground)]">Código do Estabelecimento</label>
                <Input
                  type="number"
                  min={1}
                  value={cfgTEF.codigoEstabelecimentoBackend || ""}
                  onChange={(e) => setCfgTEF((c) => ({ ...c, codigoEstabelecimentoBackend: Number(e.target.value) }))}
                  placeholder="1"
                  className="w-40"
                />
                <p className="text-xs text-[var(--muted-foreground)]">
                  Código do estabelecimento cadastrado no sistema (usado para auditoria das transações).
                </p>
              </div>
            </div>
          )}

          <div className="space-y-2">
            <label className="text-xs text-[var(--muted-foreground)] block">
              Formas de pagamento que acionam o PINPAD
            </label>
            {formasPagamento.length === 0 ? (
              <p className="text-xs text-[var(--muted-foreground)]">Carregando formas de pagamento...</p>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {formasPagamento.map((fp) => (
                  <label key={fp.id} className="flex items-center gap-2 text-sm text-[var(--foreground)] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={cfgTEF.codigosFormasPagamentoTEF.includes(fp.id)}
                      onChange={(e) => {
                        setCfgTEF((c) => ({
                          ...c,
                          codigosFormasPagamentoTEF: e.target.checked
                            ? [...c.codigosFormasPagamentoTEF, fp.id]
                            : c.codigosFormasPagamentoTEF.filter((id) => id !== fp.id),
                        }));
                      }}
                    />
                    {fp.descricao}
                  </label>
                ))}
              </div>
            )}
            <p className="text-xs text-[var(--muted-foreground)]">
              Marcadas = abre modal PINPAD ao selecionar. Desmarcadas = pagamento direto (dinheiro, etc.).
            </p>
          </div>
        </div>

        {/* NFCe */}
        <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-4 space-y-4">
          <h2 className="text-sm font-semibold text-[var(--foreground)]">🧾 NFC-e (Nota Fiscal Consumidor Eletrônica)</h2>
          <p className="text-xs text-[var(--muted-foreground)]">
            Quando habilitada, emite NFC-e automaticamente ao finalizar cada venda. Requer o módulo fiscal configurado no servidor.
          </p>

          <label className="flex items-center gap-2 text-sm text-[var(--foreground)] cursor-pointer">
            <input
              type="checkbox"
              checked={cfgNFCe.habilitada}
              onChange={(e) => setCfgNFCe((c) => ({ ...c, habilitada: e.target.checked }))}
            />
            Emitir NFC-e ao finalizar venda
          </label>

          {cfgNFCe.habilitada && (
            <div className="pl-4 border-l-2 border-[var(--border)] space-y-2">
              <label className="text-xs text-[var(--muted-foreground)] block">Ambiente</label>
              <div className="flex gap-6">
                {([["2", "Homologação (testes)"], ["1", "Produção"]] as const).map(([val, label]) => (
                  <label key={val} className="flex items-center gap-2 text-sm text-[var(--foreground)] cursor-pointer">
                    <input
                      type="radio"
                      name="nfce-ambiente"
                      value={val}
                      checked={cfgNFCe.ambiente === val}
                      onChange={() => setCfgNFCe((c) => ({ ...c, ambiente: val }))}
                    />
                    {label}
                  </label>
                ))}
              </div>
              <p className="text-xs text-[var(--muted-foreground)]">
                ⚠️ Use <strong>Homologação</strong> para testes. Mude para <strong>Produção</strong> somente após certificação junto à SEFAZ.
              </p>
            </div>
          )}
        </div>

        {/* Salvar */}
        <div className="flex items-center gap-3 pb-8">
          <Button onClick={salvarTudo} size="lg" className="w-48">
            {salvo ? "✓ Configurações salvas!" : "Salvar Configurações"}
          </Button>
          {salvo && <p className="text-xs text-[var(--muted-foreground)]">Reinicie o PDV para aplicar mudanças de porta.</p>}
        </div>
      </div>
    </div>
  );
}
