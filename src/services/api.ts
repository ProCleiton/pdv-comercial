const API_URL_KEY = "app:apiUrl";
const API_BASE_DEFAULT = "http://api.comercialia.local";

export function getApiBaseUrl(): string {
  return localStorage.getItem(API_URL_KEY) ?? API_BASE_DEFAULT;
}

export function setApiBaseUrl(url: string): void {
  const normalizada = url.replace(/\/$/, "").trim();
  if (normalizada) {
    localStorage.setItem(API_URL_KEY, normalizada);
  } else {
    localStorage.removeItem(API_URL_KEY);
  }
}

function getApiBase(): string {
  return getApiBaseUrl();
}

function getToken(): string | null {
  return localStorage.getItem("token");
}

function getUsuarioLogin(): string {
  try {
    const u = localStorage.getItem("usuario");
    return u ? (JSON.parse(u).login ?? "pdv") : "pdv";
  } catch {
    return "pdv";
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const method = (options.method ?? "GET").toUpperCase();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${getApiBase()}${path}`, { ...options, headers });
  const usuario = getUsuarioLogin();

  if (res.status === 401) {
    if (path !== "/auth/login") {
      localStorage.removeItem("token");
      localStorage.removeItem("usuario");
      window.dispatchEvent(new CustomEvent("auth:sessao-expirada"));
    }
    throw new Error(
      path === "/auth/login"
        ? "Usuário ou senha incorretos"
        : "Sessão expirada. Faça login novamente."
    );
  }

  if (!res.ok) {
    const body = await res.text();
    console.error(`[PDV] ${method} ${path} [${res.status}] usuario=${usuario}`, body);
    let mensagem = `Erro ${res.status}`;
    if (body) {
      try {
        const json = JSON.parse(body);
        mensagem = json.error ?? json.message ?? json.mensagem ?? body;
      } catch {
        mensagem = body;
      }
    }
    throw new Error(mensagem);
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body: unknown) =>
    request<T>(path, { method: "POST", body: JSON.stringify(body) }),
  put: <T>(path: string, body: unknown) =>
    request<T>(path, { method: "PUT", body: JSON.stringify(body) }),
  delete: <T>(path: string) => request<T>(path, { method: "DELETE" }),
};

// ── Cobrança PSP (PIX/Boleto) ────────────────────────────────────────────────

export interface CobrancaPdv {
  codigo: number;
  tipo: "PIX" | "BOLETO";
  provedor: string;
  status: "PENDENTE" | "PAGO" | "CANCELADO" | "EXPIRADO";
  valor: number;
  txid: string;
  qrcodeText: string | null;
  qrcodeImageBase64: string | null;
  linhaDigitavel: string | null;
  barcodeUrl: string | null;
  dtVencimento: string;
  dtCriacao: string;
  dtPagamento: string | null;
}

export function gerarCobrancaAvulsa(
  valor: number,
  codigoEstabelecimento: number,
  descricao?: string
): Promise<CobrancaPdv> {
  return api.post<CobrancaPdv>("/cobrancas/avulso", {
    tipo: "PIX",
    valor,
    codigoEstabelecimento,
    descricao: descricao ?? "Pagamento PDV",
  });
}

export function consultarStatusCobranca(id: number): Promise<CobrancaPdv> {
  return api.get<CobrancaPdv>(`/cobrancas/${id}`);
}

