// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, renderHook, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider, useTheme } from "@/components/theme/ThemeProvider";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { useShortcutLabel } from "@/lib/useShortcutLabel";

function mockOS(dark: boolean) {
  window.matchMedia = vi.fn().mockReturnValue({ matches: dark, addEventListener: vi.fn(), removeEventListener: vi.fn() });
}

function Pref() {
  return <p>pref: {useTheme().pref}</p>;
}

describe("ThemeProvider", () => {
  let style: HTMLStyleElement;
  let metas: HTMLMetaElement[];
  beforeEach(() => {
    localStorage.clear();
    delete document.documentElement.dataset.theme;
    style = document.head.appendChild(document.createElement("style"));
    style.textContent = ':root { --color-ground: #eef1f4; } :root[data-theme="dark"] { --color-ground: #111315; }';
    metas = ["(prefers-color-scheme: light)", "(prefers-color-scheme: dark)"].map((media) => {
      const m = document.head.appendChild(document.createElement("meta"));
      m.name = "theme-color";
      m.media = media;
      return m;
    });
  });
  afterEach(() => {
    style.remove();
    metas.forEach((m) => m.remove());
  });

  it("starts from the saved choice, never applying the OS theme first", () => {
    localStorage.setItem("mb-theme", "dark");
    mockOS(false);
    const observer = new MutationObserver(() => {});
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"], attributeOldValue: true });

    render(<ThemeProvider><Pref /></ThemeProvider>);
    expect(screen.getByText("pref: dark")).toBeInTheDocument();
    // Every value data-theme held on the way: none of them is the OS's light.
    const history = [...observer.takeRecords().map((r) => r.oldValue), document.documentElement.dataset.theme];
    observer.disconnect();
    expect(history).not.toContain("light");
    expect(history.at(-1)).toBe("dark");
  });

  it("follows the OS when nothing is saved", () => {
    mockOS(true);
    render(<ThemeProvider><Pref /></ThemeProvider>);
    expect(screen.getByText("pref: system")).toBeInTheDocument();
    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  it("points the browser chrome colour at the chosen theme, whatever the OS prefers", async () => {
    mockOS(false);
    render(<ThemeProvider><ThemeToggle /></ThemeProvider>);
    expect(metas.map((m) => m.content)).toEqual(["#eef1f4", "#eef1f4"]);
    await userEvent.click(screen.getByRole("radio", { name: "Dark" }));
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(localStorage.getItem("mb-theme")).toBe("dark");
    expect(metas.map((m) => m.content)).toEqual(["#111315", "#111315"]);
  });
});

describe("useShortcutLabel", () => {
  afterEach(() => vi.restoreAllMocks());

  it("writes ⌘ on Apple devices", () => {
    vi.spyOn(navigator, "platform", "get").mockReturnValue("MacIntel");
    expect(renderHook(() => useShortcutLabel("K")).result.current).toBe("⌘K");
    expect(renderHook(() => useShortcutLabel("Enter")).result.current).toBe("⌘ Enter");
  });

  it("writes Ctrl elsewhere", () => {
    vi.spyOn(navigator, "platform", "get").mockReturnValue("Win32");
    expect(renderHook(() => useShortcutLabel("K")).result.current).toBe("Ctrl K");
    expect(renderHook(() => useShortcutLabel("Enter")).result.current).toBe("Ctrl Enter");
  });
});
