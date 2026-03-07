import mongoose, { Schema, type Document, type Model } from "mongoose";

export const PLAYER_POSITIONS = ["goalkeeper", "forward", "defender"] as const;
export type PlayerPosition = (typeof PLAYER_POSITIONS)[number];

export interface ITeamPlayer {
  player: mongoose.Types.ObjectId;
  position: string;
}

export interface ISponsorDetails {
  name: string;
  logo: string; // base64
}

export interface ITeam extends Document {
  league: string;
  teamName: string;
  teamLogo: string;
  franchiseOwner: mongoose.Types.ObjectId; // ref Player - franchise owner is a player
  players: ITeamPlayer[]; // refs to Player + position in team
  sponsorDetails: ISponsorDetails;
  /** Team registration fee payment */
  registrationPaymentStatus: "pending" | "paid" | "failed";
  registrationPaymentScreenshot: string; // base64
  /** pending until admin approves */
  status: "pending" | "verified" | "rejected";
  declarationAccepted: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const TeamPlayerSchema = new Schema<ITeamPlayer>(
  {
    player: { type: Schema.Types.ObjectId, ref: "Player", required: true },
    position: { type: String, required: true },
  },
  { _id: true }
);

const SponsorDetailsSchema = new Schema<ISponsorDetails>(
  { name: { type: String, default: "" }, logo: { type: String, default: "" } },
  { _id: false }
);

const TeamSchema = new Schema<ITeam>(
  {
    league: { type: String, required: true, enum: ["ppl", "pcl", "pvl", "pbl"] },
    teamName: { type: String, required: true },
    teamLogo: { type: String, required: true },
    franchiseOwner: { type: Schema.Types.ObjectId, ref: "Player", required: true },
    players: { type: [TeamPlayerSchema], required: true, default: [] },
    sponsorDetails: { type: SponsorDetailsSchema, default: () => ({ name: "", logo: "" }) },
    registrationPaymentStatus: { type: String, enum: ["pending", "paid", "failed"], default: "pending" },
    registrationPaymentScreenshot: { type: String, default: "" },
    status: { type: String, enum: ["pending", "verified", "rejected"], default: "pending" },
    declarationAccepted: { type: Boolean, required: true },
  },
  { timestamps: true }
);

TeamSchema.index({ league: 1, teamName: 1 }, { unique: true }); // team name unique per league; same name allowed in different leagues
/** One franchise owner per league; a player can own teams in multiple leagues. */
TeamSchema.index({ league: 1, franchiseOwner: 1 }, { unique: true });

export const Team: Model<ITeam> =
  mongoose.models.Team ?? mongoose.model<ITeam>("Team", TeamSchema);
