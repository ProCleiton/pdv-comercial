import { useState, useEffect } from "react";
import { Settings } from "lucide-react";
import { api } from "@/services/api";
import { getApiBaseUrl, setApiBaseUrl } from "@/services/api";
import { logInfo, logError } from "@/services/logger";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import type { LicencaPDV } from "@/types/pdv";
import type { UsuarioPDV } from "@/lib/auth";

interface Props {
  onLicencaValida: (licenca: LicencaPDV, usuario: UsuarioPDV) => void;
  onErroPermanente: (msg: string) => void;
}

type Etapa = "login" | "licenca";

export default function LicencaPage({ onLicencaValida, onErroPermanente }: Props) {
  const [etapa, setEtapa] = useState<Etapa>("login");
  const [login, setLogin] = useState("");
  const [senha, setSenha] = useState("");
  const [chave, setChave] = useState("");
  const [processando, setProcessando] = useState(false);
  const [erro, setErro] = useState("");
  const [usuarioTemp, setUsuarioTemp] = useState<UsuarioPDV | null>(null);

  const [showConfig, setShowConfig] = useState(false);
  const [urlServidor, setUrlServidor] = useState(() => getApiBaseUrl());
  const [feedbackServidor, setFeedbackServidor] = useState("");
  const [testandoServidor, setTestandoServidor] = useState(false);

  function salvarUrlServidor() {
    setApiBaseUrl(urlServidor);
    setShowConfig(false);
    setFeedbackServidor("");
  }

  async function testarConexao() {
    setTestandoServidor(true);
    setFeedbackServidor("");
    try {
      const res = await fetch(`${urlServidor.replace(/\/$/, "")}/actuator/health`);
      setFeedbackServidor(res.ok ? "✅ Servidor acessível" : `⚠️ Servidor retornou ${res.status}`);
    } catch {
      setFeedbackServidor("❌ Não foi possível conectar ao servidor");
    } finally {
      setTestandoServidor(false);
    }
  }

  // Se já há token + chave nos args (lançado pelo frontend), pular diretamente para validação de licença
  useEffect(() => {
    const tokenArg = localStorage.getItem("token");
    const chaveArg = localStorage.getItem("pdv:licencaChave");
    const rawUsuario = localStorage.getItem("usuario");

    if (tokenArg && chaveArg && rawUsuario) {
      try {
        const usu = JSON.parse(rawUsuario) as UsuarioPDV;
        setUsuarioTemp(usu);
        setChave(chaveArg);
        setEtapa("licenca");
        // Auto-validar
        validarLicencaAuto(chaveArg, usu);
      } catch {
        // Args incompletos → mostrar login manual
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function validarLicencaAuto(chaveArg: string, usu: UsuarioPDV) {
    setProcessando(true);
    setErro("");
    try {
      const licenca = await api.get<LicencaPDV>(`/licencas-pdv/validar/${encodeURIComponent(chaveArg)}`);
      if (!licenca || licenca.ativa !== "S") {
        onErroPermanente("Licença inválida ou desativada para este terminal.");
        return;
      }
      // Registrar uso (fire-and-forget)
      api.put<void>(`/licencas-pdv/${licenca.id}/registrar-uso`, {}).catch(() => {});
      await logInfo("Licenca", usu.login, "licenca_validada_auto", `terminal=${licenca.nomeTerminal}`);
      onLicencaValida(licenca, usu);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erro ao validar licença";
      setErro(msg);
      await logError("Licenca", usu.login, "erro_validar_licenca_auto", msg);
    } finally {
      setProcessando(false);
    }
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setErro("");
    if (!login.trim() || !senha) { setErro("Informe usuário e senha."); return; }
    setProcessando(true);
    try {
      const result = await api.post<{ token: string; id: number; login: string; nome: string; tipo: string; codigoPerfil: number; nomePerfil: string; codigoEstabelecimento: number; codigoFuncionario: number }>("/auth/login", {
        usuario: login.trim(),
        senha,
      });
      const usuario: UsuarioPDV = {
        id: result.id,
        login: result.login,
        nome: result.nome,
        tipo: result.tipo,
        codigoPerfil: result.codigoPerfil,
        nomePerfil: result.nomePerfil,
        codigoEstabelecimento: result.codigoEstabelecimento,
        codigoFuncionario: result.codigoFuncionario,
      };
      localStorage.setItem("token", result.token);
      localStorage.setItem("usuario", JSON.stringify(usuario));
      setUsuarioTemp(usuario);
      await logInfo("Licenca", usuario.login, "login_pdv", "login realizado no PDV standalone");
      setEtapa("licenca");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erro ao fazer login";
      setErro(msg);
    } finally {
      setProcessando(false);
    }
  }

  async function handleValidarLicenca(e: React.FormEvent) {
    e.preventDefault();
    setErro("");
    const chaveNorm = chave.trim();
    if (!chaveNorm) { setErro("Informe a chave de licença do terminal."); return; }
    if (!usuarioTemp) { setEtapa("login"); return; }
    await validarLicencaAuto(chaveNorm, usuarioTemp);
  }

  const configModal = showConfig && (
    <div
      className="fixed inset-0 z-50 flex items-end justify-start p-4 bg-black/40"
      onClick={(e) => { if (e.target === e.currentTarget) setShowConfig(false); }}
    >
      <div className="w-full max-w-sm rounded-xl border border-[var(--border)] bg-[var(--card)] shadow-xl p-5 space-y-4">
        <h2 className="text-sm font-semibold text-[var(--foreground)]">Configuração do Servidor</h2>
        <div className="space-y-1">
          <label className="text-xs text-[var(--muted-foreground)]" htmlFor="cfg-url-servidor-pdv">
            URL do servidor backend
          </label>
          <Input
            id="cfg-url-servidor-pdv"
            type="url"
            placeholder="http://192.168.1.10:9000"
            value={urlServidor}
            onChange={(e) => setUrlServidor(e.target.value)}
          />
          <p className="text-xs text-[var(--muted-foreground)]">Ex: http://localhost:9000</p>
        </div>
        {feedbackServidor && (
          <p className="text-xs text-[var(--foreground)]">{feedbackServidor}</p>
        )}
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="flex-1"
            disabled={testandoServidor}
            onClick={testarConexao}
          >
            {testandoServidor ? "Testando…" : "Testar"}
          </Button>
          <Button type="button" size="sm" className="flex-1" onClick={salvarUrlServidor}>
            Salvar
          </Button>
        </div>
      </div>
    </div>
  );

  const gearButton = (
    <button
      type="button"
      aria-label="Configurações do servidor"
      onClick={() => { setShowConfig(true); setFeedbackServidor(""); }}
      className="fixed bottom-4 left-4 p-2 rounded-lg text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--muted)] transition-colors z-40"
    >
      <Settings size={18} />
    </button>
  );

  if (etapa === "login") {
    return (
      <>
        {gearButton}
        {configModal}
        <div className="flex flex-col items-center justify-center h-full gap-8 p-8">
          <div className="w-full max-w-sm">
            <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-8 space-y-6">
              <div className="text-center space-y-1">
                <div className="text-4xl">🖥️</div>
                <h1 className="text-2xl font-bold text-[var(--foreground)]">PDV ComercialIA</h1>
                <p className="text-sm text-[var(--muted-foreground)]">Acesse com suas credenciais</p>
              </div>
              <form onSubmit={handleLogin} className="space-y-4">
                <div className="space-y-1">
                  <label className="text-sm text-[var(--muted-foreground)]">Usuário</label>
                  <Input
                    type="text"
                    value={login}
                    onChange={(e) => setLogin(e.target.value)}
                    placeholder="login"
                    autoFocus
                    autoComplete="username"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-sm text-[var(--muted-foreground)]">Senha</label>
                  <Input
                    type="password"
                    value={senha}
                    onChange={(e) => setSenha(e.target.value)}
                    placeholder="••••••••"
                    autoComplete="current-password"
                  />
                </div>
                {erro && (
                  <div className="rounded-md bg-[var(--destructive)]/10 border border-[var(--destructive)]/30 p-3 text-sm text-[var(--destructive)]">
                    {erro}
                  </div>
                )}
                <Button type="submit" className="w-full" size="lg" disabled={processando}>
                  {processando ? "Entrando…" : "Entrar"}
                </Button>
              </form>
            </div>
          </div>
        </div>
      </>
    );
  }

  // Etapa "licenca"
  return (
    <>
      {gearButton}
      {configModal}
      <div className="flex flex-col items-center justify-center h-full gap-8 p-8">
        <div className="w-full max-w-sm">
          <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-8 space-y-6">
            <div className="text-center space-y-1">
              <div className="text-4xl">🔑</div>
              <h1 className="text-2xl font-bold text-[var(--foreground)]">Licença do Terminal</h1>
              <p className="text-sm text-[var(--muted-foreground)]">
                {usuarioTemp ? `Olá, ${usuarioTemp.nome}` : ""}
              </p>
              <p className="text-xs text-[var(--muted-foreground)]">
                Informe a chave de licença configurada para este terminal.
              </p>
            </div>
            <form onSubmit={handleValidarLicenca} className="space-y-4">
              <div className="space-y-1">
                <label className="text-sm text-[var(--muted-foreground)]">Chave de Licença</label>
                <Input
                  type="text"
                  value={chave}
                  onChange={(e) => setChave(e.target.value)}
                  placeholder="LIC…"
                  autoFocus={!processando}
                  className="font-mono text-sm"
                />
              </div>
              {processando && (
                <p className="text-sm text-center text-[var(--muted-foreground)] animate-pulse">
                  Validando licença…
                </p>
              )}
              {erro && (
                <div className="rounded-md bg-[var(--destructive)]/10 border border-[var(--destructive)]/30 p-3 text-sm text-[var(--destructive)]">
                  {erro}
                </div>
              )}
              <Button type="submit" className="w-full" size="lg" disabled={processando}>
                {processando ? "Validando…" : "Validar Licença"}
              </Button>
              <button
                type="button"
                onClick={() => { setEtapa("login"); setErro(""); }}
                className="w-full text-xs text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
              >
                ← Trocar de usuário
              </button>
            </form>
          </div>
        </div>
      </div>
    </>
  );
}
