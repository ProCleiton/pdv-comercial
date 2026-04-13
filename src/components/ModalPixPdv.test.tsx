import { describe, it, expect, vi, beforeAll, afterEach, afterAll } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { server } from "@/test/mocks/server";
import { http, HttpResponse } from "msw";
import ModalPixPdv from "@/components/ModalPixPdv";

const BASE = "http://localhost:9000";

beforeAll(() => server.listen({ onUnhandledRequest: "warn" }));
afterEach(() => { server.resetHandlers(); localStorage.clear(); vi.clearAllMocks(); });
afterAll(() => server.close());

function renderModal(
  onPago = vi.fn(),
  onCancelar = vi.fn()
) {
  return render(
    <ModalPixPdv
      valor={50.0}
      codigoEstabelecimento={1}
      descricao="Teste PDV"
      onPago={onPago}
      onCancelar={onCancelar}
    />
  );
}

describe("ModalPixPdv", () => {
  it("renderiza o modal e exibe valor formatado", async () => {
    renderModal();
    expect(screen.getByText(/Pagamento via PIX/i)).toBeInTheDocument();
    expect(screen.getByText(/R\$\s*50,00/i)).toBeInTheDocument();
  });

  it("exibe QR Code (copia e cola) após gerar cobrança", async () => {
    renderModal();
    await waitFor(() =>
      expect(screen.getByText(/Copia e cola/i)).toBeInTheDocument()
    );
    expect(screen.getByText(/bcb\.pix\.mock/i)).toBeInTheDocument();
  });

  it("chama onCancelar ao clicar em Cancelar", async () => {
    const onCancelar = vi.fn();
    renderModal(vi.fn(), onCancelar);
    const btnCancelar = screen.getByRole("button", { name: /Cancelar/i });
    await userEvent.click(btnCancelar);
    expect(onCancelar).toHaveBeenCalledOnce();
  });

  it("chama onPago quando polling retorna status PAGO", async () => {
    const onPago = vi.fn();
    // Sobrescreve o handler avulso para retornar codigo 999 (que o polling retorna PAGO)
    server.use(
      http.post(`${BASE}/cobrancas/avulso`, () =>
        HttpResponse.json({
          codigo: 999,
          tipo: "PIX",
          provedor: "MOCK",
          status: "PENDENTE",
          valor: 50.0,
          txid: "mock-pago",
          qrcodeText: "00020126...",
          qrcodeImageBase64: null,
          linhaDigitavel: null,
          barcodeUrl: null,
          dtVencimento: "2026-12-31",
          dtCriacao: new Date().toISOString(),
          dtPagamento: null,
        }, { status: 201 })
      )
    );

    vi.useFakeTimers();
    renderModal(onPago);

    // Aguarda a cobrança ser gerada (avança microtasks do fetch)
    await vi.runAllTimersAsync();

    // Aguarda QR code aparecer e executa ciclo de polling (async)
    await vi.runAllTimersAsync();

    vi.useRealTimers();

    await waitFor(() => {
      expect(onPago).toHaveBeenCalledOnce();
    }, { timeout: 3000 });
  });
});
