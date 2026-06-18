// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Mock the network layer rather than hitting real endpoints.
const { post, patch } = vi.hoisted(() => ({ post: vi.fn(), patch: vi.fn() }));
vi.mock("@/lib/client", () => ({
  api: { post, patch, get: vi.fn(), delete: vi.fn() },
  ApiError: class extends Error {},
}));

import { AddLeadDrawer } from "@/components/leads/AddLeadDrawer";
import { ToastProvider } from "@/components/ui/Toast";
import type { LeadDTO } from "@/lib/types";

const created: LeadDTO = {
  id: "new1", name: "Priya", company: "Lumen", title: "", phone: "", email: "",
  source: "Website", stage: "new", estValue: 5000, notes: "", tags: [], lostReason: "",
  ownerId: "o", ownerName: "", convertedAccountId: null, order: 0,
  lastActivityAt: new Date().toISOString(), createdAt: new Date().toISOString(),
  deletedAt: null,
};

function renderDrawer(props: Partial<React.ComponentProps<typeof AddLeadDrawer>> = {}) {
  const onCreated = vi.fn();
  const onClose = vi.fn();
  render(
    <ToastProvider>
      <AddLeadDrawer open onClose={onClose} onCreated={onCreated} {...props} />
    </ToastProvider>,
  );
  return { onCreated, onClose };
}

beforeEach(() => vi.clearAllMocks());

describe("AddLeadDrawer composer", () => {
  it("blocks submit and shows an inline validation error when the name is empty", async () => {
    const user = userEvent.setup();
    renderDrawer();
    await user.click(screen.getByRole("button", { name: "Save lead" }));
    expect(await screen.findByText("A contact name is required.")).toBeInTheDocument();
    expect(post).not.toHaveBeenCalled();
  });

  it("blocks submit and shows an inline validation error when the phone is empty", async () => {
    const user = userEvent.setup();
    renderDrawer();
    await user.type(screen.getByPlaceholderText("Priya Sharma"), "Priya");
    await user.click(screen.getByRole("button", { name: "Save lead" }));
    expect(await screen.findByText("A phone number is required.")).toBeInTheDocument();
    expect(post).not.toHaveBeenCalled();
  });

  it("posts to /api/leads and fires onCreated when the required fields are provided", async () => {
    post.mockResolvedValueOnce({ lead: created });
    const user = userEvent.setup();
    const { onCreated } = renderDrawer();

    await user.type(screen.getByPlaceholderText("Priya Sharma"), "Priya");
    await user.type(screen.getByPlaceholderText(/\+91/), "+919876543210");
    await user.click(screen.getByRole("button", { name: "Save lead" }));

    await waitFor(() => expect(post).toHaveBeenCalledOnce());
    expect(post).toHaveBeenCalledWith("/api/leads", expect.objectContaining({ name: "Priya" }));
    expect(onCreated).toHaveBeenCalledWith(created);
  });

  it("surfaces a server error as a toast", async () => {
    post.mockRejectedValueOnce(new Error("Boom"));
    const user = userEvent.setup();
    renderDrawer();
    await user.type(screen.getByPlaceholderText("Priya Sharma"), "Priya");
    await user.type(screen.getByPlaceholderText(/\+91/), "+919876543210");
    await user.click(screen.getByRole("button", { name: "Save lead" }));
    expect(await screen.findByText("Boom")).toBeInTheDocument();
  });
});
