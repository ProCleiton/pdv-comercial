import "@testing-library/jest-dom";
import { vi } from "vitest";

// Mock do Tauri invoke — não disponível no jsdom
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn().mockResolvedValue([]),
}));

// Antes de cada teste: limpa localStorage e define URL da API para o MSW
beforeEach(() => {
  localStorage.clear();
  localStorage.setItem("app:apiUrl", "http://localhost:9000");
});
