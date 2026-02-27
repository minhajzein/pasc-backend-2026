import mongoose, { Schema, type Document, type Model } from "mongoose";

export interface IPlayer {
  name: string;
  photo: string; // base64
  position: "goalkeeper" | "forward" | "defender";
}

export const PLAYER_POSITIONS = ["goalkeeper", "forward", "defender"] as const;
export type PlayerPosition = (typeof PLAYER_POSITIONS)[number];

export interface ISponsorDetails {
  name: string;
  logo: string; // base64
}

export interface ITeam extends Document {
  league: string;
  teamName: string;
  teamLogo: string;
  managerName: string;
  managerEmail: string;
  managerWhatsApp: string;
  managerIsPlayer: boolean;
  managerPhoto: string;
  players: IPlayer[];
  sponsorDetails: ISponsorDetails;
  declarationAccepted: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const PlayerSchema = new Schema<IPlayer>(
  {
    name: { type: String, required: true },
    photo: { type: String, required: true },
    position: { type: String, required: true, enum: ["goalkeeper", "forward", "defender"] },
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
    managerName: { type: String, required: true },
    managerEmail: { type: String, required: true },
    managerWhatsApp: { type: String, default: "" },
    managerIsPlayer: { type: Boolean, required: true, default: false },
    managerPhoto: { type: String, required: true },
    players: { type: [PlayerSchema], required: true, validate: (v: IPlayer[]) => Array.isArray(v) && v.length > 0 },
    sponsorDetails: { type: SponsorDetailsSchema, default: () => ({ name: "", logo: "" }) },
    declarationAccepted: { type: Boolean, required: true },
  },
  { timestamps: true }
);

TeamSchema.index({ league: 1, teamName: 1 }, { unique: true });
TeamSchema.index({ league: 1, managerEmail: 1 }, { unique: true });

export const Team: Model<ITeam> =
  mongoose.models.Team ?? mongoose.model<ITeam>("Team", TeamSchema);
