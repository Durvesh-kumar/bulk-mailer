import mongoose, { Schema, Document, models, model } from "mongoose";

export type ProfileTier = "CURRENT" | "YEAR_1" | "YEAR_2" | "YEAR_4" | "YEAR_6";

export interface ISmtpAccount {
  _id?: string;
  email: string;
  appPassword: string;
  senderName: string;
  profileTier: ProfileTier;
  createdAt?: Date;
}

export interface ISmtpVault extends Document {
  machineId: string;
  appDomain: string;
  accounts: ISmtpAccount[];
  createdAt: Date;
  updatedAt: Date;
}

const SmtpAccountSchema = new Schema<ISmtpAccount>(
  {
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
    },
    appPassword: {
      type: String,
      required: true,
      trim: true,
    },
    senderName: {
      type: String,
      required: true,
      trim: true,
    },
    profileTier: {
      type: String,
      enum: ["CURRENT", "YEAR_1", "YEAR_2", "YEAR_4", "YEAR_6"],
      default: "YEAR_2",
    },
  },
  { timestamps: true }
);

const SmtpVaultSchema = new Schema<ISmtpVault>(
  {
    machineId: {
      type: String,
      required: true,
      index: true,
    },
    appDomain: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
    },
    accounts: [SmtpAccountSchema],
  },
  { timestamps: true }
);

// HMR Hot-reloading safe pattern (आपके LicenseModel के समान)
if (models.SmtpVault) {
  delete (models as any).SmtpVault;
}

export const SmtpVaultModel = model<ISmtpVault>("SmtpVault", SmtpVaultSchema);