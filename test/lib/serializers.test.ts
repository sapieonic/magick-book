import { describe, it, expect } from "vitest";
import { Types } from "mongoose";
import {
  serializeLead,
  serializeAccount,
  serializeContact,
  serializeInvoice,
  serializeExpense,
  serializeActivity,
  serializeMember,
} from "@/lib/api";
import type {
  ILead,
  IAccount,
  IContact,
  IInvoice,
  IExpense,
  IActivity,
  IUser,
} from "@/lib/models";

const oid = () => new Types.ObjectId();
const DATE = new Date("2026-03-15T10:00:00.000Z");
const ISO = DATE.toISOString();

describe("serializeLead", () => {
  it("maps fields, stringifies ids, ISO-formats dates, applies owner name", () => {
    const ownerId = oid();
    const convId = oid();
    const lead = {
      _id: oid(),
      name: "Priya",
      company: "Lumen",
      title: "CTO",
      phone: "+91",
      email: "p@l.com",
      source: "Referral",
      stage: "qualified",
      estValue: 50000,
      notes: "hot",
      tags: ["hot"],
      lostReason: "",
      ownerId,
      convertedAccountId: convId,
      order: 2,
      lastActivityAt: DATE,
      createdAt: DATE,
    } as unknown as ILead;
    const dto = serializeLead(lead, "Owner Name");
    expect(dto.id).toBe(String(lead._id));
    expect(dto.ownerId).toBe(String(ownerId));
    expect(dto.ownerName).toBe("Owner Name");
    expect(dto.convertedAccountId).toBe(String(convId));
    expect(dto.lastActivityAt).toBe(ISO);
    expect(dto.createdAt).toBe(ISO);
    expect(dto.stage).toBe("qualified");
    expect(dto.tags).toEqual(["hot"]);
  });

  it("applies defaults for missing optional fields and null convertedAccountId", () => {
    const lead = { _id: oid(), name: "X", source: "Website", stage: "new", ownerId: oid() } as unknown as ILead;
    const dto = serializeLead(lead);
    expect(dto.company).toBe("");
    expect(dto.estValue).toBe(0);
    expect(dto.tags).toEqual([]);
    expect(dto.ownerName).toBe("");
    expect(dto.convertedAccountId).toBeNull();
    expect(dto.lastActivityAt).toBe("");
  });
});

describe("serializeContact", () => {
  it("maps fields and coerces isPrimary to boolean", () => {
    const c = { _id: oid(), name: "Asha", title: "VP", email: "a@x.com", phone: "1", isPrimary: 1, note: "n" } as unknown as IContact;
    const dto = serializeContact(c);
    expect(dto.isPrimary).toBe(true);
    expect(dto.name).toBe("Asha");
  });
});

describe("serializeAccount", () => {
  it("maps fields and embeds extra info", () => {
    const acc = {
      _id: oid(),
      name: "Lumen",
      domain: "lumen.com",
      industry: "Retail",
      status: "active",
      plan: "Pro",
      value: 12000,
      customerSince: DATE,
      ownerId: oid(),
      lastActivityAt: DATE,
      createdAt: DATE,
    } as unknown as IAccount;
    const primary = { _id: oid(), name: "Asha", isPrimary: true } as unknown as IContact;
    const dto = serializeAccount(acc, { ownerName: "Owner", primaryContact: primary, contactCount: 3 });
    expect(dto.ownerName).toBe("Owner");
    expect(dto.primaryContact?.name).toBe("Asha");
    expect(dto.contactCount).toBe(3);
    expect(dto.customerSince).toBe(ISO);
  });
  it("defaults primaryContact to null and contactCount to 0", () => {
    const acc = { _id: oid(), name: "X", status: "active", value: 0, customerSince: DATE, ownerId: oid(), lastActivityAt: DATE, createdAt: DATE } as unknown as IAccount;
    const dto = serializeAccount(acc);
    expect(dto.primaryContact).toBeNull();
    expect(dto.contactCount).toBe(0);
  });
});

describe("serializeInvoice", () => {
  it("hasFile reflects fileKey presence and dueAt may be null", () => {
    const withFile = { _id: oid(), number: 1001, accountId: oid(), issuedAt: DATE, dueAt: DATE, amount: 5000, status: "sent", fileKey: "k", fileName: "f.pdf" } as unknown as IInvoice;
    const withoutFile = { _id: oid(), number: 1002, accountId: oid(), issuedAt: DATE, amount: 100, status: "draft" } as unknown as IInvoice;
    expect(serializeInvoice(withFile, "Acct").hasFile).toBe(true);
    expect(serializeInvoice(withFile).fileName).toBe("f.pdf");
    expect(serializeInvoice(withoutFile).hasFile).toBe(false);
    expect(serializeInvoice(withoutFile).dueAt).toBeNull();
    expect(serializeInvoice(withoutFile).fileName).toBeNull();
    expect(serializeInvoice(withFile, "Acct").accountName).toBe("Acct");
  });
});

describe("serializeExpense", () => {
  it("maps fields and coerces billable", () => {
    const e = { _id: oid(), accountId: oid(), date: DATE, category: "Travel", vendor: "Uber", amount: 800, billable: 1 } as unknown as IExpense;
    const dto = serializeExpense(e, "Acct");
    expect(dto.billable).toBe(true);
    expect(dto.category).toBe("Travel");
    expect(dto.date).toBe(ISO);
    expect(dto.accountName).toBe("Acct");
  });
});

describe("serializeActivity", () => {
  it("maps fields and applies actor name", () => {
    const a = { _id: oid(), kind: "note", title: "Note added", detail: "called", createdAt: DATE } as unknown as IActivity;
    const dto = serializeActivity(a, "Ada");
    expect(dto.kind).toBe("note");
    expect(dto.actorName).toBe("Ada");
    expect(dto.createdAt).toBe(ISO);
  });
  it("defaults detail and actorName", () => {
    const a = { _id: oid(), kind: "call", title: "Call", createdAt: DATE } as unknown as IActivity;
    const dto = serializeActivity(a);
    expect(dto.detail).toBe("");
    expect(dto.actorName).toBe("");
  });
});

describe("serializeMember", () => {
  it("maps role/status and option flags", () => {
    const u = { _id: oid(), name: "Ada", email: "a@x.com", role: "admin", status: "active" } as unknown as IUser;
    const dto = serializeMember(u, { invitedByName: "Boss", isYou: true });
    expect(dto.role).toBe("admin");
    expect(dto.invitedByName).toBe("Boss");
    expect(dto.isYou).toBe(true);
  });
  it("defaults invitedByName to null and isYou false", () => {
    const u = { _id: oid(), name: "Ada", email: "a@x.com", role: "standard", status: "invited" } as unknown as IUser;
    const dto = serializeMember(u, {});
    expect(dto.invitedByName).toBeNull();
    expect(dto.isYou).toBe(false);
  });
});
