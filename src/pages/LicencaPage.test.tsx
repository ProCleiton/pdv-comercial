import { describe, it, expect, vi, beforeAll, afterEach, afterAll } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { server } from "@/test/mocks/server";
import { http, HttpResponse } from "msw";
import LicencaPage from "@/pages/LicencaPage";

const BASE = "http://localhost:9000";

beforeAll(() => server.listen({ onUnhandledRequest: "warn" }));
afterEach(() => { server.resetHandlers(); localStorage.clear(); vi.clearAllMocks(); });
afterAll(() => server.close());

function renderPage(props = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const onLicencaValida = vi.fn();
  const onErroPermanente = vi.fn();
  render(
    <QueryClientProvider client={qc}>
      <LicencaPage onLicencaValida={onLicencaValida} onErroPermanente={onErroPermanente} {...props} />
    </QueryClientProvider>
  );
  return { onLicencaValida, onErroPermanente };
}

describe("LicencaPage — etapa login", () => {
  it("renderiza formulário de login", () => {
    renderPage();
    expect(screen.getByPlaceholderText("login")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("••••••••")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Entrar" })).toBeInTheDocument();
  });

  it("valida campos obrigatórios no login", async () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Entrar" }));
    expect(await screen.findByText("Informe usuário e senha.")).toBeInTheDocument();
  });

  it("avança para etapa licença após login válido", async () => {
    renderPage();
    fireEvent.change(screen.getByPlaceholderText("login"), { target: { value: "admin.dev" } });
    fireEvent.change(screen.getByPlaceholderText("••••••••"), { target: { value: "Admin@123" } });
    fireEvent.click(screen.getByRole("button", { name: "Entrar" }));
    await waitFor(() => expect(screen.getByText("Licença do Terminal")).toBeInTheDocument());
  });

  it("exibe erro em login inválido", async () => {
    server.use(
      http.post(`${BASE}/auth/login`, () =>
        HttpResponse.json({ error: "Usuário ou senha incorretos" }, { status: 401 })
      )
    );
    renderPage();
    fireEvent.change(screen.getByPlaceholderText("login"), { target: { value: "errado" } });
    fireEvent.change(screen.getByPlaceholderText("••••••••"), { target: { value: "errado" } });
    fireEvent.click(screen.getByRole("button", { name: "Entrar" }));
    await waitFor(() => expect(screen.getByText(/sessão expirada|incorretos/i)).toBeInTheDocument());
  });
});

describe("LicencaPage — etapa licença (lançamento via frontend)", () => {
  it("valida chave de licença e chama onLicencaValida", async () => {
    // Simula lançamento com args
    localStorage.setItem("token", "token-mock");
    localStorage.setItem("pdv:licencaChave", "LIC1ABCDEF");
    localStorage.setItem("usuario", JSON.stringify({
      id: 1, login: "admin.dev", nome: "Administrador", tipo: "I",
      codigoPerfil: 0, nomePerfil: "", codigoEstabelecimento: 1, codigoFuncionario: 1,
    }));
    const { onLicencaValida } = renderPage();
    await waitFor(() => expect(onLicencaValida).toHaveBeenCalled());
  });

  it("chama onErroPermanente se licença inativa", async () => {
    server.use(
      http.get(`${BASE}/licencas-pdv/validar/:chave`, () =>
        HttpResponse.json({
          id: 1, codigoEstabelecimento: 1, nomeEstabelecimento: "Matriz",
          nomeTerminal: "Caixa 1", chaveLicenca: "LIC1ABCDEF",
          dtAtivacao: "2024-01-01", dtExpiracao: null, ativa: "N",
          dtUltimoUso: null, dtInsercao: null, dtAtualizacao: null,
        })
      )
    );
    localStorage.setItem("token", "token-mock");
    localStorage.setItem("pdv:licencaChave", "LIC1ABCDEF");
    localStorage.setItem("usuario", JSON.stringify({
      id: 1, login: "admin.dev", nome: "Administrador", tipo: "I",
      codigoPerfil: 0, nomePerfil: "", codigoEstabelecimento: 1, codigoFuncionario: 1,
    }));
    const { onErroPermanente } = renderPage();
    await waitFor(() => expect(onErroPermanente).toHaveBeenCalled());
  });
});

describe("LicencaPage — configuração do servidor", () => {
  it("exibe botão de engrenagem na tela de login", () => {
    renderPage();
    expect(screen.getByRole("button", { name: /configurações do servidor/i })).toBeInTheDocument();
  });

  it("abre painel de configuração ao clicar na engrenagem", () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: /configurações do servidor/i }));
    expect(screen.getByText(/configuração do servidor/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/url do servidor/i)).toBeInTheDocument();
  });

  it("fecha painel ao salvar URL", () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: /configurações do servidor/i }));
    expect(screen.getByText(/configuração do servidor/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^salvar$/i }));
    expect(screen.queryByText(/configuração do servidor/i)).not.toBeInTheDocument();
  });

  it("salva a URL no localStorage ao clicar em Salvar", () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: /configurações do servidor/i }));
    const input = screen.getByLabelText(/url do servidor/i);
    fireEvent.change(input, { target: { value: "http://192.168.1.50:9000" } });
    fireEvent.click(screen.getByRole("button", { name: /^salvar$/i }));
    expect(localStorage.getItem("app:apiUrl")).toBe("http://192.168.1.50:9000");
  });
});
