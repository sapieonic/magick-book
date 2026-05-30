"use client";
import { createContext, useContext, type ReactNode } from "react";
import type { SessionUser } from "@/lib/types";

const Ctx = createContext<SessionUser | null>(null);

export function SessionProvider({ user, children }: { user: SessionUser; children: ReactNode }) {
  return <Ctx.Provider value={user}>{children}</Ctx.Provider>;
}

export function useSession(): SessionUser {
  const user = useContext(Ctx);
  if (!user) throw new Error("useSession must be used within SessionProvider");
  return user;
}
