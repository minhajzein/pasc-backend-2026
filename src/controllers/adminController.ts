import type { Request, Response } from "express";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import * as bcrypt from "bcrypt";
import { Player } from "../models/Player";
import { Team } from "../models/Team";
import { Admin } from "../models/Admin";
import { env } from "../config/env";
const LEAGUES = ["ppl", "pcl", "pvl", "pbl"] as const;

function getLeagueParam(req: Request): string | null {
  const raw = req.params.league;
  const league = ((Array.isArray(raw) ? raw[0] : raw) ?? "").toLowerCase();
  return LEAGUES.includes(league as (typeof LEAGUES)[number]) ? league : null;
}

/** POST /api/admin/login - admin login with email + password */
export async function adminLogin(req: Request, res: Response): Promise<void> {
  const email = req.body?.email;
  const password = req.body?.password;
  if (typeof email !== "string" || typeof password !== "string" || !email.trim() || !password) {
    res.status(400).json({ error: "Email and password required" });
    return;
  }
  const normalized = email.trim().toLowerCase();
  const admin = await Admin.findOne({ email: normalized }).lean();
  if (!admin) {
    res.status(401).json({ error: "Invalid email or password" });
    return;
  }
  const match = await bcrypt.compare(password, admin.passwordHash);
  if (!match) {
    res.status(401).json({ error: "Invalid email or password" });
    return;
  }
  const payload = { id: String(admin._id), email: normalized, role: "admin" as const };
  const token = jwt.sign(payload, env.jwtSecret, { expiresIn: "7d" });
  res.json({ token, admin: { email: normalized } });
}

/** GET /api/admin/players/pending - list players with status pending */
export async function listPendingPlayers(req: Request, res: Response): Promise<void> {
  const players = await Player.find({ status: "pending" })
    .select("_id fullName email createdAt status")
    .sort({ createdAt: -1 })
    .lean();
  res.json(players);
}

/** GET /api/admin/leagues/:league/teams/pending - list teams with status pending */
export async function listPendingTeams(req: Request, res: Response): Promise<void> {
  const league = getLeagueParam(req);
  if (!league) {
    res.status(400).json({ error: "Invalid league" });
    return;
  }
  const teams = await Team.find({ league, status: "pending" })
    .select("_id league teamName franchiseOwner createdAt status")
    .populate("franchiseOwner", "fullName email")
    .sort({ createdAt: -1 })
    .lean();
  res.json(teams);
}

/** PATCH /api/admin/players/:id/status - set player status to verified (admin only) */
export async function setPlayerStatus(req: Request, res: Response): Promise<void> {
  const rawId = req.params.id;
  const id = Array.isArray(rawId) ? rawId[0] : rawId;
  const status = req.body?.status;

  if (!id || status !== "verified") {
    res.status(400).json({ error: "Player id and status 'verified' required" });
    return;
  }

  if (!mongoose.Types.ObjectId.isValid(id)) {
    res.status(400).json({ error: "Invalid player id" });
    return;
  }

  const player = await Player.findByIdAndUpdate(
    id,
    { $set: { status: "verified" } },
    { new: true }
  )
    .select("_id fullName email status")
    .lean();

  if (!player) {
    res.status(404).json({ error: "Player not found" });
    return;
  }

  res.json(player);
}

/** PATCH /api/admin/leagues/:league/teams/:id/status - set team status to verified (admin only) */
export async function setTeamStatus(req: Request, res: Response): Promise<void> {
  const league = getLeagueParam(req);
  if (!league) {
    res.status(400).json({ error: "Invalid league" });
    return;
  }

  const rawId = req.params.id;
  const id = Array.isArray(rawId) ? rawId[0] : rawId;
  const status = req.body?.status;

  if (!id || status !== "verified") {
    res.status(400).json({ error: "Team id and status 'verified' required" });
    return;
  }

  const team = await Team.findOneAndUpdate(
    { _id: id, league },
    { $set: { status: "verified" } },
    { new: true }
  )
    .select("_id league teamName status")
    .lean();

  if (!team) {
    res.status(404).json({ error: "Team not found" });
    return;
  }

  res.json(team);
}
