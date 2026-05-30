import mongoose, { Schema, model, models, type Types } from "mongoose";
import {
  LEAD_STAGES,
  LEAD_SOURCES,
  ACCOUNT_STATUSES,
  INVOICE_STATUSES,
  EXPENSE_CATEGORIES,
  ROLES,
  MEMBER_STATUSES,
  ACTIVITY_KINDS,
} from "./constants";

/* ------------------------------------------------------------------ types */

export interface IWorkspace {
  _id: Types.ObjectId;
  name: string;
  businessTypes: string[];
  ownerId: Types.ObjectId;
  domain?: string; // email domain that auto-joins this workspace (e.g. "magickvoice.com")
  createdAt: Date;
  updatedAt: Date;
}

export interface IUser {
  _id: Types.ObjectId;
  workspaceId: Types.ObjectId;
  name: string;
  email: string;
  authProvider: "google" | "microsoft" | "password" | "demo";
  firebaseUid?: string;
  role: (typeof ROLES)[number];
  status: (typeof MEMBER_STATUSES)[number];
  invitedById?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export interface ILead {
  _id: Types.ObjectId;
  workspaceId: Types.ObjectId;
  ownerId: Types.ObjectId;
  name: string;
  company?: string;
  title?: string;
  phone?: string;
  email?: string;
  source: string;
  stage: (typeof LEAD_STAGES)[number];
  estValue: number;
  notes?: string;
  tags: string[];
  lostReason?: string;
  convertedAccountId?: Types.ObjectId;
  order: number;
  lastActivityAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface IAccount {
  _id: Types.ObjectId;
  workspaceId: Types.ObjectId;
  ownerId: Types.ObjectId;
  name: string;
  domain?: string;
  industry?: string;
  status: (typeof ACCOUNT_STATUSES)[number];
  plan?: string;
  value: number; // monthly recurring value (₹/mo)
  customerSince: Date;
  primaryContactId?: Types.ObjectId;
  fromLeadId?: Types.ObjectId;
  lastActivityAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface IContact {
  _id: Types.ObjectId;
  workspaceId: Types.ObjectId;
  accountId: Types.ObjectId;
  name: string;
  title?: string;
  email?: string;
  phone?: string;
  isPrimary: boolean;
  note?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface IInvoice {
  _id: Types.ObjectId;
  workspaceId: Types.ObjectId;
  accountId: Types.ObjectId;
  number: number;
  issuedAt: Date;
  dueAt?: Date;
  amount: number;
  status: (typeof INVOICE_STATUSES)[number];
  // Externally-generated invoice document persisted in S3.
  fileKey?: string;
  fileName?: string;
  fileType?: string;
  fileSize?: number;
  fileUploadedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface IExpense {
  _id: Types.ObjectId;
  workspaceId: Types.ObjectId;
  accountId: Types.ObjectId;
  date: Date;
  category: string;
  vendor: string;
  amount: number;
  billable: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface IActivity {
  _id: Types.ObjectId;
  workspaceId: Types.ObjectId;
  leadId?: Types.ObjectId;
  accountId?: Types.ObjectId;
  actorId?: Types.ObjectId;
  kind: (typeof ACTIVITY_KINDS)[number];
  title: string;
  detail?: string;
  createdAt: Date;
  updatedAt: Date;
}

/* ---------------------------------------------------------------- schemas */

const opts = { timestamps: true };

const WorkspaceSchema = new Schema<IWorkspace>(
  {
    name: { type: String, required: true },
    businessTypes: { type: [String], default: [] },
    ownerId: { type: Schema.Types.ObjectId, ref: "User" },
    domain: { type: String, index: true },
  },
  opts,
);

const UserSchema = new Schema<IUser>(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", index: true },
    name: { type: String, required: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    authProvider: { type: String, enum: ["google", "microsoft", "password", "demo"], default: "password" },
    firebaseUid: { type: String, index: true, sparse: true },
    role: { type: String, enum: ROLES, default: "admin" },
    status: { type: String, enum: MEMBER_STATUSES, default: "active" },
    invitedById: { type: Schema.Types.ObjectId, ref: "User" },
  },
  opts,
);
UserSchema.index({ email: 1 }, { unique: true });

const LeadSchema = new Schema<ILead>(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", index: true, required: true },
    ownerId: { type: Schema.Types.ObjectId, ref: "User", index: true, required: true },
    name: { type: String, required: true },
    company: String,
    title: String,
    phone: String,
    email: String,
    source: { type: String, enum: LEAD_SOURCES, default: "Website" },
    stage: { type: String, enum: LEAD_STAGES, default: "new", index: true },
    estValue: { type: Number, default: 0 },
    notes: String,
    tags: { type: [String], default: [] },
    lostReason: String,
    convertedAccountId: { type: Schema.Types.ObjectId, ref: "Account" },
    order: { type: Number, default: 0 },
    lastActivityAt: { type: Date, default: Date.now },
  },
  opts,
);

const AccountSchema = new Schema<IAccount>(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", index: true, required: true },
    ownerId: { type: Schema.Types.ObjectId, ref: "User", index: true, required: true },
    name: { type: String, required: true },
    domain: String,
    industry: String,
    status: { type: String, enum: ACCOUNT_STATUSES, default: "active", index: true },
    plan: String,
    value: { type: Number, default: 0 },
    customerSince: { type: Date, default: Date.now },
    primaryContactId: { type: Schema.Types.ObjectId, ref: "Contact" },
    fromLeadId: { type: Schema.Types.ObjectId, ref: "Lead" },
    lastActivityAt: { type: Date, default: Date.now },
  },
  opts,
);

const ContactSchema = new Schema<IContact>(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", index: true, required: true },
    accountId: { type: Schema.Types.ObjectId, ref: "Account", index: true, required: true },
    name: { type: String, required: true },
    title: String,
    email: String,
    phone: String,
    isPrimary: { type: Boolean, default: false },
    note: String,
  },
  opts,
);

const InvoiceSchema = new Schema<IInvoice>(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", index: true, required: true },
    accountId: { type: Schema.Types.ObjectId, ref: "Account", index: true, required: true },
    number: { type: Number, required: true },
    issuedAt: { type: Date, default: Date.now },
    dueAt: Date,
    amount: { type: Number, required: true },
    status: { type: String, enum: INVOICE_STATUSES, default: "draft", index: true },
    fileKey: String,
    fileName: String,
    fileType: String,
    fileSize: Number,
    fileUploadedAt: Date,
  },
  opts,
);

const ExpenseSchema = new Schema<IExpense>(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", index: true, required: true },
    accountId: { type: Schema.Types.ObjectId, ref: "Account", index: true, required: true },
    date: { type: Date, default: Date.now },
    category: { type: String, enum: EXPENSE_CATEGORIES, default: "Other" },
    vendor: { type: String, default: "" },
    amount: { type: Number, required: true },
    billable: { type: Boolean, default: false },
  },
  opts,
);

const ActivitySchema = new Schema<IActivity>(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", index: true, required: true },
    leadId: { type: Schema.Types.ObjectId, ref: "Lead", index: true },
    accountId: { type: Schema.Types.ObjectId, ref: "Account", index: true },
    actorId: { type: Schema.Types.ObjectId, ref: "User" },
    kind: { type: String, enum: ACTIVITY_KINDS, required: true },
    title: { type: String, required: true },
    detail: String,
  },
  opts,
);

/* ----------------------------------------------------------------- models */
// Guard against "OverwriteModelError" during Next.js hot reload.

export const Workspace = (models.Workspace as mongoose.Model<IWorkspace>) || model<IWorkspace>("Workspace", WorkspaceSchema);
export const User = (models.User as mongoose.Model<IUser>) || model<IUser>("User", UserSchema);
export const Lead = (models.Lead as mongoose.Model<ILead>) || model<ILead>("Lead", LeadSchema);
export const Account = (models.Account as mongoose.Model<IAccount>) || model<IAccount>("Account", AccountSchema);
export const Contact = (models.Contact as mongoose.Model<IContact>) || model<IContact>("Contact", ContactSchema);
export const Invoice = (models.Invoice as mongoose.Model<IInvoice>) || model<IInvoice>("Invoice", InvoiceSchema);
export const Expense = (models.Expense as mongoose.Model<IExpense>) || model<IExpense>("Expense", ExpenseSchema);
export const Activity = (models.Activity as mongoose.Model<IActivity>) || model<IActivity>("Activity", ActivitySchema);
