// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { api, useApi } from "@/lib/client";
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

describe("useApi", () => {
  afterEach(() => vi.unstubAllGlobals());

  /** A fetch whose responses resolve only when the test says so, in any order. */
  function deferredFetch() {
    const pending: ((body: unknown) => void)[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise<Response>((resolve) => pending.push((body) => resolve(new Response(JSON.stringify(body), { status: 200 }))))),
    );
    return pending;
  }

  it("keeps the newest response when an older one lands after it", async () => {
    const pending = deferredFetch();
    const { result } = renderHook(() => useApi<{ v: number }>("/api/leads"));
    act(() => void result.current.refresh());
    expect(pending).toHaveLength(2);

    await act(async () => pending[1]({ v: 2 })); // the newer request answers first
    await waitFor(() => expect(result.current.data).toEqual({ v: 2 }));
    await act(async () => pending[0]({ v: 1 })); // then the stale mount request
    expect(result.current.data).toEqual({ v: 2 });
    expect(result.current.loading).toBe(false);
  });

  it("drops a response for a URL the hook has moved off", async () => {
    const pending = deferredFetch();
    const { result, rerender } = renderHook(({ url }) => useApi<{ v: string }>(url), { initialProps: { url: "/api/leads?q=a" as string | null } });
    rerender({ url: "/api/leads?q=b" });
    await act(async () => pending[1]({ v: "b" }));
    await act(async () => pending[0]({ v: "a" }));
    expect(result.current.data).toEqual({ v: "b" });
  });
});
