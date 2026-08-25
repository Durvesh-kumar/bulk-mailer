// src/lib/models/License.ts
import mongoose, { Schema, Document, Model, Connection, models, model } from "mongoose";

export interface ILicense extends Document {
  clientName: string;
  appDomain: string;
  lockedDeviceId: string | null;
  status: "ACTIVE" | "SUSPENDED";
  expiresAt: Date;
  lastBoundAt?: Date;
  lastResetAt?: Date;
  createdAt: Date;
  updatedAt: Date;  
}

export const LicenseSchema = new Schema<ILicense>(
  {
    clientName: {
      type: String,
      required: true,
      trim: true,
    },
    appDomain: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    lockedDeviceId: {
      type: String,
      default: null,
    },
    status: {
      type: String,
      enum: ["ACTIVE", "SUSPENDED"],
      default: "ACTIVE",
    },
    expiresAt: {
      type: Date,
      required: true,
    },
    lastBoundAt: {
      type: Date,
    },
    lastResetAt: {
      type: Date,
    },
  },
  { timestamps: true }
);

export function getLicenseModel(conn?: Connection | typeof mongoose): Model<ILicense> {
  const target = conn || mongoose;
  if (target.models && target.models.License) {
    return target.models.License as Model<ILicense>;
  }
  return target.model("License", LicenseSchema) as Model<ILicense>;
}

export const LicenseModel: Model<ILicense> =
  models.License || model<ILicense>("License", LicenseSchema);