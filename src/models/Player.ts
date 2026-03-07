import mongoose, { Schema, type Document, type Model } from "mongoose";

export interface ILeagueRegistration {
  league: mongoose.Types.ObjectId;
  paymentStatus: "pending" | "paid" | "failed";
  paymentScreenshot: string; // base64
  eligible: boolean; // over 16 and verified
  /** Playing position for this league (e.g. forward for PPL, batter for PCL) */
  position?: string;
}

export interface IPlayer extends Document {
  fullName: string;
  email: string; // required for franchise owner / main contact; optional for roster-only
  whatsApp: string;
  photo: string; // base64
  aadhaarFront?: string; // base64
  aadhaarBack?: string; // base64
  dateOfBirth?: Date;
  leagueRegistrations: ILeagueRegistration[];
  /** pending until admin approves */
  status: "pending" | "verified" | "rejected";
  createdAt: Date;
  updatedAt: Date;
}

const LeagueRegistrationSchema = new Schema<ILeagueRegistration>(
  {
    league: { type: Schema.Types.ObjectId, ref: "League", required: true },
    paymentStatus: {
      type: String,
      enum: ["pending", "paid", "failed"],
      default: "pending",
    },
    paymentScreenshot: { type: String, default: "" },
    eligible: { type: Boolean, default: false },
    position: { type: String, default: "" },
  },
  { _id: true }
);

const PlayerSchema = new Schema<IPlayer>(
  {
    fullName: { type: String, required: true },
    email: { type: String, default: "" },
    whatsApp: { type: String, default: "" },
    photo: { type: String, required: true },
    aadhaarFront: { type: String, default: "" },
    aadhaarBack: { type: String, default: "" },
    dateOfBirth: { type: Date, default: null },
    leagueRegistrations: {
      type: [LeagueRegistrationSchema],
      default: [],
    },
    status: { type: String, enum: ["pending", "verified", "rejected"], default: "pending" },
  },
  { timestamps: true }
);

PlayerSchema.index(
  { email: 1 },
  { unique: true, sparse: true, partialFilterExpression: { email: { $exists: true, $ne: "" } } }
);
PlayerSchema.index(
  { whatsApp: 1 },
  { unique: true, sparse: true, partialFilterExpression: { whatsApp: { $exists: true, $ne: "" } } }
);

export const Player: Model<IPlayer> =
  mongoose.models.Player ?? mongoose.model<IPlayer>("Player", PlayerSchema);

/** Returns true if player is at least 16 years old on the given date */
export function isOver16(dateOfBirth: Date, onDate: Date = new Date()): boolean {
  const age = onDate.getFullYear() - dateOfBirth.getFullYear();
  const monthDiff = onDate.getMonth() - dateOfBirth.getMonth();
  const dayDiff = onDate.getDate() - dateOfBirth.getDate();
  if (age > 16) return true;
  if (age < 16) return false;
  if (monthDiff > 0) return true;
  if (monthDiff < 0) return false;
  return dayDiff >= 0;
}
