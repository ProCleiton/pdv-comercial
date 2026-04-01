import { useState, useEffect, useCallback } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import LicencaPage from "@/pages/LicencaPage";
import AberturaTurnoPage from "@/pages/AberturaTurnoPage";
import PDVPage from "@/pages/PDVPage";
import SangriaPage from "@/pages/SangriaPage";
import FechamentoPage from "@/pages/FechamentoPage";
import ConfigPDVPage from "@/pages/ConfigPDVPage";
import { isAutenticado, logout, type UsuarioPDV } from "@/lib/auth";
import { type TelaAtiva, type TurnoCaixa, type LicencaPDV } from "@/types/pdv";
import "./App.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 30_000 },
  },
});

/**
 * Lê os argumentos de lançamento do PDV passados pelo frontend principal.
 * Formato esperado: --auth-token=<jwt> --estabelecimento=<id> --licenca=<chave>
 */
async function parseLaunchArgs(): Promise<{ token?: string; estabelecimento?: string; licenca?: string }> {
  try {
    const args = await invoke<string[]>("get_launch_args");
    const result: { token?: string; estabelecimento?: string; licenca?: string } = {};
    for (const arg of args) {
      if (arg.startsWith("--auth-token=")) result.token = arg.slice("--auth-token=".length);
      else if (arg.startsWith("--estabelecimento=")) result.estabelecimento = arg.slice("--estabelecimento=".length);
      else if (arg.startsWith("--licenca=")) result.licenca = arg.slice("--licenca=".length);
    }
    return result;
  } catch {
    return {};
  }
}

function AppContent() {
  const [tela, setTela] = useState<TelaAtiva>("validando_licenca");
  const [licenca, setLicenca] = useState<LicencaPDV | null>(null);
  const [turnoAtivo, setTurnoAtivo] = useState<TurnoCaixa | null>(null);
  const [usuario, setUsuario] = useState<UsuarioPDV | null>(null);
  const [erroMsg, setErroMsg] = useState<string>("");

  // Ao iniciar: injeta token dos args (se veio do frontend) e carrega usuário
  useEffect(() => {
    parseLaunchArgs().then((args) => {
      if (args.token) {
        localStorage.setItem("token", args.token);
      }
      if (args.licenca) {
        localStorage.setItem("pdv:licencaChave", args.licenca);
      }
      if (args.estabelecimento) {
        localStorage.setItem("pdv:estabelecimento", args.estabelecimento);
      }

      // Carrega usuário do localStorage (injetado pelo token JWT login ou arg)
      const rawUsuario = localStorage.getItem("usuario");
      if (rawUsuario) {
        try {
          setUsuario(JSON.parse(rawUsuario) as UsuarioPDV);
        } catch {/* ignora */}
      }
    });

    function handleSessaoExpirada() {
      logout();
      setTela("validando_licenca");
      setLicenca(null);
      setTurnoAtivo(null);
      queryClient.clear();
    }
    window.addEventListener("auth:sessao-expirada", handleSessaoExpirada);
    return () => window.removeEventListener("auth:sessao-expirada", handleSessaoExpirada);
  }, []);

  const handleLicencaValida = useCallback((lic: LicencaPDV, usu: UsuarioPDV) => {
    setLicenca(lic);
    setUsuario(usu);
    setTela("aguardando_turno");
  }, []);

  const handleErroPermanente = useCallback((msg: string) => {
    setErroMsg(msg);
    setTela("erro_licenca");
  }, []);

  const handleTurnoAberto = useCallback((turno: TurnoCaixa) => {
    setTurnoAtivo(turno);
    setTela("tela_pdv");
  }, []);

  const handleTurnoExistente = useCallback((turno: TurnoCaixa) => {
    setTurnoAtivo(turno);
    setTela("tela_pdv");
  }, []);

  const handleIrSangria = useCallback(() => setTela("sangria"), []);
  const handleVoltarPDV = useCallback(() => setTela("tela_pdv"), []);
  const handleIrFechamento = useCallback(() => setTela("fechamento"), []);
  const handleIrConfig = useCallback(() => setTela("config_pdv"), []);

  const handleTurnoFechado = useCallback(() => {
    setTurnoAtivo(null);
    setTela("aguardando_turno");
    queryClient.clear();
  }, []);

  // Tela de erro permanente (licença inválida/expirada)
  if (tela === "erro_licenca") {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-6 p-8">
        <div className="text-6xl">🔒</div>
        <h1 className="text-2xl font-bold text-[var(--foreground)]">PDV Bloqueado</h1>
        <p className="text-[var(--muted-foreground)] text-center max-w-md">{erroMsg}</p>
        <p className="text-sm text-[var(--muted-foreground)]">
          Entre em contato com o administrador para reativar a licença deste terminal.
        </p>
      </div>
    );
  }

  if (tela === "validando_licenca" || !isAutenticado()) {
    return (
      <LicencaPage
        onLicencaValida={handleLicencaValida}
        onErroPermanente={handleErroPermanente}
      />
    );
  }

  if (tela === "aguardando_turno" || !turnoAtivo) {
    return (
      <AberturaTurnoPage
        licenca={licenca!}
        usuario={usuario!}
        onTurnoAberto={handleTurnoAberto}
        onTurnoExistente={handleTurnoExistente}
      />
    );
  }

  if (tela === "sangria") {
    return (
      <SangriaPage
        turno={turnoAtivo}
        usuario={usuario!}
        onVoltar={handleVoltarPDV}
      />
    );
  }

  if (tela === "config_pdv") {
    return <ConfigPDVPage onVoltar={handleVoltarPDV} />;
  }

  if (tela === "fechamento") {
    return (
      <FechamentoPage
        turno={turnoAtivo}
        usuario={usuario!}
        onFechado={handleTurnoFechado}
        onCancelar={handleVoltarPDV}
      />
    );
  }

  return (
    <PDVPage
      turno={turnoAtivo}
      usuario={usuario!}
      licenca={licenca!}
      onSangria={handleIrSangria}
      onFechamento={handleIrFechamento}
      onConfig={handleIrConfig}
    />
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AppContent />
    </QueryClientProvider>
  );
}
