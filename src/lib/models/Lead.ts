// src/lib/models/Lead.ts
import mongoose, { Schema, Document, Model } from "mongoose";

export interface ILead extends Document {
  email: string;
  serviceType: string;
  nicheCategory: string;
  country: string;
  sourceUrl: string;
  isContacted: boolean;
  contactCount: number;
  lastContactedAt: Date | null;
  coolDownUntil: Date | null; // 🛑 90-Day Cooldown Lock
  isVerified: boolean;
  mxRecordValid: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const LeadSchema = new Schema<ILead>(
  {
    email: { 
      type: String, 
      required: true, 
      unique: true, 
      index: true, 
      lowercase: true, 
      trim: true 
    },
    serviceType: { 
      type: String, 
      required: true, 
      index: true,
      trim: true 
    },
    nicheCategory: { 
      type: String, 
      required: true, 
      index: true,
      trim: true 
    },
    country: { 
      type: String, 
      required: true, 
      index: true,
      trim: true 
    },
    sourceUrl: { 
      type: String, 
      default: "",
      trim: true 
    },
    isContacted: { 
      type: Boolean, 
      default: false, 
      index: true 
    },
    contactCount: { 
      type: Number, 
      default: 0 
    },
    lastContactedAt: { 
      type: Date, 
      default: null 
    },
    coolDownUntil: { 
      type: Date, 
      default: null, 
      index: true 
    },
    isVerified: { 
      type: Boolean, 
      default: true 
    },
    mxRecordValid: { 
      type: Boolean, 
      default: true 
    },
  },
  { 
    timestamps: true 
  }
);

// 🚀 High-Scale Compound Indexing (50,000+ लीड्स पर भी <1ms में फ़िल्टर)
LeadSchema.index({ nicheCategory: 1, country: 1, isContacted: 1, coolDownUntil: 1 });

export const Lead: Model<ILead> = mongoose.models.Lead || mongoose.model<ILead>("Lead", LeadSchema);