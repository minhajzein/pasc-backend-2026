import mongoose, { Schema, type Document, type Model } from "mongoose";

export interface IPendingPlayerRegistration extends Document {
  email: string;
  otp: string;
  expiresAt: Date;
  payload: {
    fullName: string;
    email: string;
    whatsApp: string;
    photo: string;
    aadhaarFront?: string;
    aadhaarBack?: string;
    dateOfBirth?: string;
    /** league slug -> payment screenshot base64 */
    leaguePayments: { leagueSlug: string; paymentScreenshot: string }[];
  };
  createdAt: Date;
}

const PendingPlayerRegistrationSchema = new Schema<IPendingPlayerRegistration>(
  {
    email: { type: String, required: true },
    otp: { type: String, required: true },
    expiresAt: { type: Date, required: true },
    payload: {
      fullName: String,
      email: String,
      whatsApp: String,
      photo: String,
      aadhaarFront: String,
      aadhaarBack: String,
      dateOfBirth: String,
      leaguePayments: [{ leagueSlug: String, paymentScreenshot: String }],
    },
  },
  { timestamps: true }
);

PendingPlayerRegistrationSchema.index({ email: 1 });
PendingPlayerRegistrationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const PendingPlayerRegistration: Model<IPendingPlayerRegistration> =
  mongoose.models.PendingPlayerRegistration ??
  mongoose.model<IPendingPlayerRegistration>("PendingPlayerRegistration", PendingPlayerRegistrationSchema);
