import { Types } from "mongoose";
import { connectDBForSeed } from "./db-seed-helper";
import { Workspace, User, Lead, Account, Contact, Invoice, Expense, Activity } from "./models";

const DAY = 86400000;
const HOUR = 3600000;
const now = () => Date.now();
const ago = (ms: number) => new Date(now() - ms);

/**
 * Seeds the workspace with the sample data from the MagickBook wireframes.
 * Idempotent: skips if a workspace already exists (unless force=true, which
 * wipes the domain collections first).
 */
export async function seedDatabase({ force = false }: { force?: boolean } = {}): Promise<void> {
  const existing = await Workspace.estimatedDocumentCount();
  if (existing > 0 && !force) return;

  if (force) {
    await Promise.all([
      Workspace.deleteMany({}),
      User.deleteMany({}),
      Lead.deleteMany({}),
      Account.deleteMany({}),
      Contact.deleteMany({}),
      Invoice.deleteMany({}),
      Expense.deleteMany({}),
      Activity.deleteMany({}),
    ]);
  }

  const wsId = new Types.ObjectId();

  // ---- Team ------------------------------------------------------------
  const riya = await User.create({
    workspaceId: wsId,
    name: "Riya Nair",
    email: "riya@acme.in",
    authProvider: "demo",
    role: "admin",
    status: "active",
  });
  const karan = await User.create({
    workspaceId: wsId,
    name: "Karan Rao",
    email: "karan@acme.in",
    authProvider: "demo",
    role: "admin",
    status: "active",
    invitedById: riya._id,
  });
  const neha = await User.create({
    workspaceId: wsId,
    name: "Neha Gupta",
    email: "neha@acme.in",
    authProvider: "demo",
    role: "standard",
    status: "active",
    invitedById: riya._id,
  });
  await User.create({
    workspaceId: wsId,
    name: "Sam Toh",
    email: "sam@pine.co",
    authProvider: "demo",
    role: "standard",
    status: "invited",
    invitedById: riya._id,
  });

  await Workspace.create({
    _id: wsId,
    name: "Acme & Co",
    businessTypes: ["Sales calls", "Collections"],
    ownerId: riya._id,
    domain: "acme.in",
  });

  // ---- Accounts + contacts --------------------------------------------
  async function makeAccount(opts: {
    name: string;
    domain?: string;
    industry?: string;
    status: "active" | "at_risk" | "churned";
    plan?: string;
    value: number;
    owner: Types.ObjectId;
    sinceDaysAgo: number;
    lastActivityMs: number;
    primary: { name: string; title?: string; email?: string; phone?: string; note?: string };
    others?: { name: string; title?: string; email?: string; phone?: string }[];
  }) {
    const accId = new Types.ObjectId();
    const primary = await Contact.create({
      workspaceId: wsId,
      accountId: accId,
      name: opts.primary.name,
      title: opts.primary.title,
      email: opts.primary.email,
      phone: opts.primary.phone,
      note: opts.primary.note,
      isPrimary: true,
    });
    if (opts.others?.length) {
      await Contact.insertMany(
        opts.others.map((c) => ({
          workspaceId: wsId,
          accountId: accId,
          name: c.name,
          title: c.title,
          email: c.email,
          phone: c.phone,
          isPrimary: false,
        })),
      );
    }
    const acc = await Account.create({
      _id: accId,
      workspaceId: wsId,
      ownerId: opts.owner,
      name: opts.name,
      domain: opts.domain,
      industry: opts.industry,
      status: opts.status,
      plan: opts.plan,
      value: opts.value,
      customerSince: ago(opts.sinceDaysAgo * DAY),
      primaryContactId: primary._id,
      lastActivityAt: ago(opts.lastActivityMs),
    });
    return acc;
  }

  const acme = await makeAccount({
    name: "Acme Logistics",
    domain: "acmelogistics.in",
    industry: "Logistics",
    status: "active",
    plan: "Growth",
    value: 85000,
    owner: riya._id,
    sinceDaysAgo: 75,
    lastActivityMs: 2 * HOUR,
    primary: { name: "Karan Rao", title: "COO · the original lead", email: "karan@acmelogistics.in", phone: "+91 90042 11881" },
    others: [
      { name: "Neha Gupta", title: "Finance", email: "neha@acmelogistics.in" },
      { name: "Vikram S.", title: "Ops lead", email: "vikram@acmelogistics.in" },
      { name: "Tara M.", title: "Procurement", email: "tara@acmelogistics.in" },
    ],
  });

  const lumen = await makeAccount({
    name: "Lumen Retail",
    domain: "lumenretail.in",
    industry: "Retail",
    status: "active",
    plan: "Starter",
    value: 40000,
    owner: riya._id,
    sinceDaysAgo: 20,
    lastActivityMs: 1 * DAY,
    primary: { name: "Priya Sharma", title: "Head of Ops", email: "priya@lumen.in", phone: "+91 80467 33449" },
    others: [{ name: "Rohit K.", title: "Founder", email: "rohit@lumen.in" }],
  });

  await makeAccount({
    name: "Brightline",
    domain: "brightline.io",
    industry: "SaaS",
    status: "at_risk",
    plan: "Growth",
    value: 120000,
    owner: karan._id,
    sinceDaysAgo: 200,
    lastActivityMs: 9 * DAY,
    primary: { name: "Maya Iyer", title: "VP Sales", email: "maya@brightline.io", phone: "+91 99887 22110" },
    others: [
      { name: "Arjun P.", title: "Finance" },
      { name: "Sara L.", title: "Ops" },
    ],
  });

  await makeAccount({
    name: "Nova Foods",
    domain: "novafoods.in",
    industry: "FMCG",
    status: "active",
    plan: "Starter",
    value: 22000,
    owner: neha._id,
    sinceDaysAgo: 40,
    lastActivityMs: 3 * DAY,
    primary: { name: "Dev Mehta", title: "Owner", email: "dev@novafoods.in", phone: "+91 98200 55330" },
  });

  await makeAccount({
    name: "Pine & Co",
    domain: "pine.co",
    industry: "Consulting",
    status: "active",
    plan: "Growth",
    value: 60000,
    owner: karan._id,
    sinceDaysAgo: 110,
    lastActivityMs: 5 * HOUR,
    primary: { name: "Sam Toh", title: "Partner", email: "sam@pine.co", phone: "+91 90011 44556" },
    others: [
      { name: "Ina R.", title: "Associate" },
      { name: "Ken W.", title: "Finance" },
      { name: "Lia M.", title: "Ops" },
      { name: "Ravi T.", title: "Procurement" },
    ],
  });

  await makeAccount({
    name: "Orbit Media",
    domain: "orbitmedia.in",
    industry: "Media",
    status: "churned",
    value: 0,
    owner: neha._id,
    sinceDaysAgo: 300,
    lastActivityMs: 30 * DAY,
    primary: { name: "Aisha Khan", title: "Director", email: "aisha@orbitmedia.in" },
    others: [{ name: "Tom B.", title: "Producer" }],
  });

  // ---- Invoices (for Acme — mirrors the wireframe invoice list) -------
  await Invoice.insertMany([
    { workspaceId: wsId, accountId: acme._id, number: 1042, issuedAt: ago(28 * DAY), dueAt: ago(14 * DAY), amount: 110000, status: "overdue" },
    { workspaceId: wsId, accountId: acme._id, number: 1040, issuedAt: ago(32 * DAY), dueAt: ago(18 * DAY), amount: 55000, status: "sent" },
    { workspaceId: wsId, accountId: acme._id, number: 1038, issuedAt: ago(42 * DAY), dueAt: ago(28 * DAY), amount: 95000, status: "paid" },
    { workspaceId: wsId, accountId: acme._id, number: 1031, issuedAt: ago(70 * DAY), dueAt: ago(56 * DAY), amount: 140000, status: "paid" },
    // A couple for other accounts so the global Money view isn't single-account.
    { workspaceId: wsId, accountId: lumen._id, number: 1039, issuedAt: ago(20 * DAY), dueAt: ago(6 * DAY), amount: 40000, status: "paid" },
    { workspaceId: wsId, accountId: lumen._id, number: 1043, issuedAt: ago(5 * DAY), dueAt: ago(-9 * DAY), amount: 40000, status: "sent" },
  ]);

  // ---- Expenses (for Acme — mirrors the wireframe expense list) -------
  await Expense.insertMany([
    { workspaceId: wsId, accountId: acme._id, date: ago(26 * DAY), category: "Telephony", vendor: "Twilio call minutes", amount: 6200, billable: true },
    { workspaceId: wsId, accountId: acme._id, date: ago(31 * DAY), category: "Travel", vendor: "Onboarding visit", amount: 4000, billable: false },
    { workspaceId: wsId, accountId: acme._id, date: ago(38 * DAY), category: "Software", vendor: "WhatsApp API", amount: 2800, billable: true },
    { workspaceId: wsId, accountId: acme._id, date: ago(15 * DAY), category: "Marketing", vendor: "Field campaign", amount: 12000, billable: false },
    { workspaceId: wsId, accountId: lumen._id, date: ago(10 * DAY), category: "Software", vendor: "Analytics seat", amount: 3500, billable: true },
  ]);

  // ---- Leads (board) ---------------------------------------------------
  async function makeLead(opts: {
    name: string;
    company: string;
    title?: string;
    phone?: string;
    email?: string;
    source?: string;
    stage: "new" | "contacted" | "qualified" | "proposal" | "won" | "lost";
    estValue?: number;
    tags?: string[];
    owner: Types.ObjectId;
    order: number;
    createdDaysAgo: number;
    lastActivityMs?: number;
    convertedAccountId?: Types.ObjectId;
    notes?: string;
  }) {
    return Lead.create({
      workspaceId: wsId,
      ownerId: opts.owner,
      name: opts.name,
      company: opts.company,
      title: opts.title,
      phone: opts.phone,
      email: opts.email,
      source: opts.source ?? "Website",
      stage: opts.stage,
      estValue: opts.estValue ?? 0,
      tags: opts.tags ?? [],
      order: opts.order,
      notes: opts.notes,
      convertedAccountId: opts.convertedAccountId,
      createdAt: ago(opts.createdDaysAgo * DAY),
      lastActivityAt: ago(opts.lastActivityMs ?? opts.createdDaysAgo * DAY),
    });
  }

  const priyaLead = await makeLead({
    name: "Priya Sharma",
    company: "Lumen Retail",
    title: "Head of Ops",
    phone: "+91 80467 33449",
    email: "priya@lumen.in",
    source: "Website",
    stage: "qualified",
    estValue: 120000,
    tags: ["hot"],
    owner: riya._id,
    order: 0,
    createdDaysAgo: 5,
    lastActivityMs: 1 * HOUR,
    notes: "Budget confirmed on call. Ready for proposal.",
  });

  await makeLead({ name: "Dev Mehta", company: "Nova Foods", phone: "+91 98200 55330", stage: "new", estValue: 80000, owner: neha._id, order: 0, createdDaysAgo: 2 });
  await makeLead({ name: "Aisha Khan", company: "Orbit Media", phone: "+91 99001 23456", stage: "contacted", tags: ["called"], owner: riya._id, order: 0, createdDaysAgo: 6, lastActivityMs: 1 * DAY });
  await makeLead({ name: "Sam Toh", company: "Pine & Co", phone: "+91 90011 44556", stage: "contacted", estValue: 200000, owner: riya._id, order: 1, createdDaysAgo: 8 });
  await makeLead({ name: "Leo Park", company: "Wavelength", email: "leo@wavelength.io", stage: "qualified", estValue: 90000, owner: karan._id, order: 1, createdDaysAgo: 7 });
  await makeLead({ name: "Maya Iyer", company: "Brightline", phone: "+91 99887 22110", stage: "proposal", estValue: 340000, owner: karan._id, order: 0, createdDaysAgo: 12, lastActivityMs: 2 * DAY, notes: "Proposal sent — following up." });
  await makeLead({ name: "Acme Logistics", company: "Acme Logistics", stage: "won", estValue: 85000, owner: riya._id, order: 0, createdDaysAgo: 80, convertedAccountId: acme._id });
  // a few more "new" so the column count feels alive
  await makeLead({ name: "Ravi Shah", company: "Delta Traders", phone: "+91 90090 12121", stage: "new", estValue: 60000, owner: riya._id, order: 1, createdDaysAgo: 1 });
  await makeLead({ name: " To be Triaged", company: "Kettle Foods", stage: "new", owner: neha._id, order: 2, createdDaysAgo: 1 });

  // ---- Activity timeline for the Priya lead (page 7) ------------------
  await Activity.insertMany([
    { workspaceId: wsId, leadId: priyaLead._id, actorId: riya._id, kind: "lead_created", title: "Lead created", detail: "from Website", createdAt: ago(5 * DAY) },
    { workspaceId: wsId, leadId: priyaLead._id, actorId: riya._id, kind: "stage_change", title: "Contacted", createdAt: ago(4 * DAY) },
    { workspaceId: wsId, leadId: priyaLead._id, actorId: riya._id, kind: "whatsapp", title: "WhatsApp reply", detail: '"Yes, send me the details."', createdAt: ago(3 * DAY) },
    { workspaceId: wsId, leadId: priyaLead._id, actorId: riya._id, kind: "call", title: "Call logged · 4m12s", detail: "Outbound — Aria summarised the call.", createdAt: ago(2 * DAY) },
    { workspaceId: wsId, leadId: priyaLead._id, actorId: riya._id, kind: "stage_change", title: "Qualified", detail: "Budget confirmed on call. Ready for proposal.", createdAt: ago(3 * HOUR) },
  ]);

  // ---- Activity for Acme account --------------------------------------
  await Activity.insertMany([
    { workspaceId: wsId, accountId: acme._id, actorId: riya._id, kind: "converted", title: "Converted from lead", detail: "Karan Rao set as primary contact", createdAt: ago(75 * DAY) },
    { workspaceId: wsId, accountId: acme._id, actorId: karan._id, kind: "invoice", title: "Invoice #1042 sent", detail: "₹1,10,000", createdAt: ago(28 * DAY) },
    { workspaceId: wsId, accountId: acme._id, actorId: riya._id, kind: "call", title: "Quarterly review call", detail: "Renewal looks healthy.", createdAt: ago(2 * HOUR) },
  ]);
}

/** Standalone runner for `npm run seed` against a real MONGODB_URI. */
export async function runSeedCli() {
  await connectDBForSeed();
  await seedDatabase({ force: process.argv.includes("--force") });
  console.log("✓ Seed complete.");
  process.exit(0);
}
