import mongoose from "mongoose";
import { env } from "./env";
import { Team } from "../models/Team";

export async function connectDb(): Promise<void> {
  try {
    await mongoose.connect(env.mongoUri);
    console.log("MongoDB connected");
  
  } catch (err) {
    console.error("MongoDB connection error:", err);
    throw err;
  }
}
