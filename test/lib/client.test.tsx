// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { api } from "@/lib/client";
import { DATA_CHANGED } from "@/lib/dataChanged";
import { useDataChanged } from "@/components/layout/ShellContext";

function respond(status: number, body: unknown = {}) {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(body), { status })));
}

describe("api mutations announce data changes", () => {
  let heard: ReturnType<typeof vi.fn<(e: Event) => void>>;
  beforeEach(() => {
    heard = vi.fn<(e: Event) => void>();
    window.addEventListener(DATA_CHANGED, heard);
  });
  afterEach(() => {
    window.removeEventListener(DATA_CHANGED, heard);
    vi.unstubAllGlobals();
  });

  it("fires after each successful post, patch, put and delete", async () => {
    respond(200, { ok: true });
    await api.post("/api/leads", { name: "Asha" });
    await api.patch("/api/leads/1", { stage: "won" });
    await api.put("/api/workspace/categories", { categories: [] });
    await api.delete("/api/leads/1");
    expect(heard).toHaveBeenCalledTimes(4);
  });

  it("stays quiet for reads and for failed mutations", async () => {
    respond(200, { leads: [] });
    await api.get("/api/leads");
    respond(400, { error: "Name is required" });
    await expect(api.post("/api/leads", {})).rejects.toThrow("Name is required");
    expect(heard).not.toHaveBeenCalled();
  });
});

describe("useDataChanged", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("calls back once, shortly after a burst of changes", () => {
    const onChange = vi.fn();
    renderHook(() => useDataChanged(onChange));
    window.dispatchEvent(new Event(DATA_CHANGED));
    window.dispatchEvent(new Event(DATA_CHANGED));
    window.dispatchEvent(new Event(DATA_CHANGED));
    expect(onChange).not.toHaveBeenCalled();
    vi.advanceTimersByTime(200);
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("stops listening on unmount", () => {
    const onChange = vi.fn();
    const { unmount } = renderHook(() => useDataChanged(onChange));
    window.dispatchEvent(new Event(DATA_CHANGED));
    unmount();
    vi.advanceTimersByTime(200);
    expect(onChange).not.toHaveBeenCalled();
  });
});
