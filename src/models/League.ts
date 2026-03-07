import mongoose, { Schema, type Document, type Model } from "mongoose";

export interface ILeague extends Document {
  name: string;
  slug: string;
  fullName: string;
  description: string;
  createdAt: Date;
  updatedAt: Date;
}

const LeagueSchema = new Schema<ILeague>(
  {
    name: { type: String, required: true },
    slug: { type: String, required: true, unique: true },
    fullName: { type: String, required: true },
    description: { type: String, default: "" },
  },
  { timestamps: true }
);

export const League: Model<ILeague> =
  mongoose.models.League ?? mongoose.model<ILeague>("League", LeagueSchema);
