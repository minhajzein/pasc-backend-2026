import mongoose, { Schema, type Document, type Model } from "mongoose";

export interface IPendingLogin extends Document {
  email: string;
  otp: string;
  expiresAt: Date;
  createdAt: Date;
}

const PendingLoginSchema = new Schema<IPendingLogin>(
  {
    email: { type: String, required: true },
    otp: { type: String, required: true },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true }
);

PendingLoginSchema.index({ email: 1 });
PendingLoginSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 }); // TTL - remove when expired

export const PendingLogin: Model<IPendingLogin> =
  mongoose.models.PendingLogin ?? mongoose.model<IPendingLogin>("PendingLogin", PendingLoginSchema);
