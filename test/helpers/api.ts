import { NextRequest } from "next/server";
import { Types } from "mongoose";
import type { IUser } from "@/lib/models";

/** Build a NextRequest with an optional JSON body. */
export function jsonRequest(
  url: string,
  method: string,
  body?: unknown,
): NextRequest {
  const init: { method: string; headers?: Record<string, string>; body?: string } = { method };
  if (body !== undefined) {
    init.headers = { "Content-Type": "application/json" };
    init.body = JSON.stringify(body);
  }
  return new NextRequest(new URL(url, "http://localhost"), init as ConstructorParameters<typeof NextRequest>[1]);
}

/** Build a NextRequest carrying multipart form-data. */
export function formRequest(url: string, form: FormData): NextRequest {
  return new NextRequest(new URL(url, "http://localhost"), {
    method: "POST",
    body: form,
  } as ConstructorParameters<typeof NextRequest>[1]);
}

/** Next 16 dynamic-route context: params is async. */
export function ctx<T = Record<string, string>>(params: T) {
  return { params: Promise.resolve(params) } as any;
}

/** Minimal IUser stand-in for the auth mock (matches what handlers read). */
export function fakeUser(over: Partial<IUser> = {}): IUser {
  return {
    _id: new Types.ObjectId(),
    workspaceId: new Types.ObjectId(),
    name: "Test User",
    email: "test@x.com",
    authProvider: "demo",
    role: "admin",
    status: "active",
    createdAt: new Date(),
    updatedAt: new Date(),
    ...over,
  } as IUser;
}
