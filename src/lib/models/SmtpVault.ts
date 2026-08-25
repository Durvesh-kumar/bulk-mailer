// src/lib/models/SmtpVault.ts
import mongoose, { Schema, Document, Model, Connection, models, model } from "mongoose";

export type ProfileTier = "CURRENT" | "YEAR_1" | "YEAR_2" | "YEAR_4" | "YEAR_6";

export interface ISmtpAccount {
  _id?: string;
  email: string;
  appPassword: string;
  senderName: string;
  profileTier: ProfileTier;
  lastSentAt?: Date;
  createdAt?: Date;
}

export interface ISmtpVault {
  userId: string;
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
    lastSentAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

export const SmtpVaultSchema = new Schema<ISmtpVault>(
  {
    userId: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
    },
    accounts: [SmtpAccountSchema],
  },
  { timestamps: true }
);

// 🎯 टेनेंट DB कनेक्शन पर बाइंड करने वाला फंक्शन
export function getSmtpVaultModel(conn?: Connection | typeof mongoose): Model<ISmtpVault> {
  const target = conn || mongoose;
  if (target.models && target.models.SmtpVault) {
    return target.models.SmtpVault as Model<ISmtpVault>;
  }
  return target.model("SmtpVault", SmtpVaultSchema);
}

// 🎯 डायरेक्ट मॉडल एक्सपोर्ट (एडमिन और अन्य फाइल्स के लिए)
export const SmtpVaultModel: Model<ISmtpVault> =
  models.SmtpVault || model<ISmtpVault>("SmtpVault", SmtpVaultSchema);