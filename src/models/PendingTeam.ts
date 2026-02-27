import mongoose, { Schema, type Document, type Model } from "mongoose";

export interface IPendingTeam extends Document {
  token: string;
  league: string;
  payload: {
    teamName: string;
    teamLogo: string;
    managerName: string;
    managerEmail: string;
    managerWhatsApp: string;
    managerIsPlayer: boolean;
    managerPhoto: string;
    players: { name: string; photo: string; position: string }[];
    sponsorDetails: { name: string; logo: string };
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
      managerName: String,
      managerEmail: String,
      managerWhatsApp: String,
      managerIsPlayer: Boolean,
      managerPhoto: String,
      players: [{ name: String, photo: String, position: String }],
      sponsorDetails: { name: String, logo: String },
      declarationAccepted: Boolean,
    },
    otp: { type: String, required: true },
    otpExpiresAt: { type: Date, required: true },
  },
  { timestamps: true }
);

export const PendingTeam: Model<IPendingTeam> =
  mongoose.models.PendingTeam ?? mongoose.model<IPendingTeam>("PendingTeam", PendingTeamSchema);
