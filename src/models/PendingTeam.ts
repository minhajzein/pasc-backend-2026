import mongoose, { Schema, type Document, type Model } from "mongoose";

export interface IPendingTeam extends Document {
  token: string;
  league: string;
  payload: {
    teamName: string;
    teamLogo: string;
    franchiseOwnerId?: string;
    franchiseOwnerName?: string;
    franchiseOwnerEmail?: string;
    franchiseOwnerWhatsApp?: string;
    franchiseOwnerPhoto?: string;
    franchiseOwnerPosition?: string;
    franchiseOwnerAadhaarFront?: string;
    franchiseOwnerAadhaarBack?: string;
    franchiseOwnerDateOfBirth?: string;
    franchiseOwnerPaymentScreenshot?: string;
    players: { playerId?: string; name?: string; photo?: string; position?: string; email?: string; whatsApp?: string; aadhaarFront?: string; aadhaarBack?: string; dateOfBirth?: string; paymentScreenshot?: string }[];
    ownerEmail?: string;
    ownerPlayerIndex?: number;
    sponsorDetails: { name: string; logo: string };
    teamRegistrationPaymentScreenshot?: string;
    declarationAccepted: boolean;
  };
  otp: string;
  otpExpiresAt: Date;
  createdAt: Date;
}

const PendingTeamSchema = new Schema<IPendingTeam>(
  {
    token: { type: String, required: true, unique: true },
    league: { type: String, required: true, enum: ["ppl", "pcl", "pvl", "pbl"] },
    payload: {
      teamName: String,
      teamLogo: String,
      franchiseOwnerId: String,
      franchiseOwnerName: String,
      franchiseOwnerEmail: String,
      franchiseOwnerWhatsApp: String,
      franchiseOwnerPhoto: String,
      franchiseOwnerPosition: String,
      franchiseOwnerAadhaarFront: String,
      franchiseOwnerAadhaarBack: String,
      franchiseOwnerDateOfBirth: String,
      franchiseOwnerPaymentScreenshot: String,
      players: [{
        playerId: String,
        name: String,
        photo: String,
        position: String,
        email: String,
        whatsApp: String,
        aadhaarFront: String,
        aadhaarBack: String,
        dateOfBirth: String,
        paymentScreenshot: String,
      }],
      ownerEmail: String,
      ownerPlayerIndex: Number,
      sponsorDetails: { name: String, logo: String },
      teamRegistrationPaymentScreenshot: String,
      declarationAccepted: Boolean,
    },
    otp: { type: String, required: true },
    otpExpiresAt: { type: Date, required: true },
  },
  { timestamps: true }
);

export const PendingTeam: Model<IPendingTeam> =
  mongoose.models.PendingTeam ?? mongoose.model<IPendingTeam>("PendingTeam", PendingTeamSchema);
