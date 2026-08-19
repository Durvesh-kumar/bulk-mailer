import mongoose, { Schema, Document, models, model } from "mongoose";

export interface ILicense extends Document {
  clientName: string;
  appDomain: string;              // सिर्फ और सिर्फ App Domain
  lockedDeviceId: string | null;  // यूजर के लैपटॉप का फिंगरप्रिंट
  status: "ACTIVE" | "SUSPENDED";
  expiresAt: Date;                // 365 दिन की एक्सपायरी
  lastBoundAt?: Date;
  lastResetAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const LicenseSchema = new Schema<ILicense>(
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

if (models.License) {
  delete (models as any).License;
}

export const LicenseModel = model<ILicense>("License", LicenseSchema);