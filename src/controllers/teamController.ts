import type { Request, Response } from "express";
import { randomBytes } from "crypto";
import { Team, PLAYER_POSITIONS, type PlayerPosition } from "../models/Team";
import { PendingTeam } from "../models/PendingTeam";
import { sendOtpEmail } from "../services/email";

const LEAGUES = ["ppl", "pcl", "pvl", "pbl"] as const;

function getLeagueParam(req: Request): string | null {
  const raw = req.params.league;
  const league = ((Array.isArray(raw) ? raw[0] : raw) ?? "").toLowerCase();
  return LEAGUES.includes(league as (typeof LEAGUES)[number]) ? league : null;
}

export async function listTeams(req: Request, res: Response): Promise<void> {
  const league = getLeagueParam(req);
  if (!league) {
    res.status(400).json({ error: "Invalid league" });
    return;
  }
  try {
    const teams = await Team.find({ league })
      .select("teamName teamLogo managerName createdAt _id")
      .sort({ createdAt: -1 })
      .lean();
    res.json(teams);
  } catch (e) {
    console.error("List teams error:", e);
    res.status(500).json({ error: "Failed to load teams" });
  }
}

export async function getTeamById(req: Request, res: Response): Promise<void> {
  const league = getLeagueParam(req);
  if (!league) {
    res.status(400).json({ error: "Invalid league" });
    return;
  }
  const rawId = req.params.id;
  const id = Array.isArray(rawId) ? rawId[0] : rawId;
  if (!id) {
    res.status(400).json({ error: "Missing team id" });
    return;
  }
  try {
    const team = await Team.findOne({ _id: id, league }).lean();
    if (!team) {
      res.status(404).json({ error: "Team not found" });
      return;
    }
    const { managerEmail, managerWhatsApp, ...publicTeam } = team;
    res.json(publicTeam);
  } catch (e) {
    console.error("Get team error:", e);
    res.status(500).json({ error: "Failed to load team" });
  }
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isValidEmail(email: unknown): email is string {
  return typeof email === "string" && EMAIL_REGEX.test(email.trim());
}

function generateOtp(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function normalizeSponsorDetails(d: unknown): { name: string; logo: string } {
  if (d && typeof d === "object" && "name" in d && "logo" in d) {
    return {
      name: String((d as { name: unknown }).name).trim(),
      logo: String((d as { logo: unknown }).logo),
    };
  }
  return { name: "", logo: "" };
}

function validateTeamPayload(body: Record<string, unknown>, league: string): string | null {
  const isPbl = league === "pbl";

  if (isPbl) {
    const { teamName, teamLogo, players, ownerEmail, ownerPlayerIndex, declarationAccepted } = body;
    if (
      !teamName ||
      !teamLogo ||
      !Array.isArray(players) ||
      players.length !== 2 ||
      typeof declarationAccepted !== "boolean" ||
      !declarationAccepted
    ) {
      return "Badminton: teamName, teamLogo, exactly 2 players (name + photo each), and declaration required.";
    }
    if (!isValidEmail(ownerEmail)) {
      return "Valid owner email is required.";
    }
    const idx = ownerPlayerIndex;
    if (idx !== 0 && idx !== 1) {
      return "Owner must be player 1 or player 2 (ownerPlayerIndex 0 or 1).";
    }
    for (const p of players as { name?: unknown; photo?: unknown }[]) {
      if (!p?.name || !p?.photo) {
        return "Each player must have name and photo.";
      }
    }
    return null;
  }

  const {
    teamName,
    teamLogo,
    managerName,
    managerEmail,
    managerIsPlayer,
    managerPhoto,
    players,
    sponsorDetails,
    declarationAccepted,
  } = body;

  if (
    !teamName ||
    !teamLogo ||
    !managerName ||
    typeof managerIsPlayer !== "boolean" ||
    !managerPhoto ||
    !Array.isArray(players) ||
    players.length === 0 ||
    typeof declarationAccepted !== "boolean" ||
    !declarationAccepted
  ) {
    return "Missing or invalid fields: teamName, teamLogo, managerName, managerEmail, managerIsPlayer, managerPhoto, players (non-empty), declarationAccepted (true required)";
  }

  if (!isValidEmail(managerEmail)) {
    return "Valid manager email is required";
  }

  for (const p of players as { name?: unknown; photo?: unknown; position?: unknown }[]) {
    if (!p?.name || !p?.photo) {
      return "Each player must have name and photo";
    }
    const pos = p.position;
    if (!pos || typeof pos !== "string" || !PLAYER_POSITIONS.includes(pos as PlayerPosition)) {
      return "Each player must have a valid position (goalkeeper, forward, or defender)";
    }
  }

  return null;
}

export async function sendOtp(req: Request, res: Response): Promise<void> {
  const raw = req.params.league;
  const league = ((Array.isArray(raw) ? raw[0] : raw) ?? "").toLowerCase();
  if (!LEAGUES.includes(league as (typeof LEAGUES)[number])) {
    res.status(400).json({ error: "Invalid league" });
    return;
  }

  const err = validateTeamPayload(req.body, league);
  if (err) {
    res.status(400).json({ error: err });
    return;
  }

  const isPbl = league === "pbl";
  let managerEmail: string;
  let teamName: string;
  let payload: {
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

  if (isPbl) {
    const ownerEmail = String(req.body.ownerEmail).trim().toLowerCase();
    const ownerPlayerIndex = Number(req.body.ownerPlayerIndex);
    const players = req.body.players as { name: string; photo: string }[];
    teamName = String(req.body.teamName).trim();
    managerEmail = ownerEmail;
    const ownerPlayer = players[ownerPlayerIndex];
    payload = {
      teamName,
      teamLogo: String(req.body.teamLogo),
      managerName: String(ownerPlayer.name).trim(),
      managerEmail,
      managerWhatsApp: "",
      managerIsPlayer: true,
      managerPhoto: String(ownerPlayer.photo),
      players: players.map((p) => ({
        name: String(p.name).trim(),
        photo: String(p.photo),
        position: "forward",
      })),
      sponsorDetails: normalizeSponsorDetails(req.body.sponsorDetails),
      declarationAccepted: true,
    };
  } else {
    managerEmail = String(req.body.managerEmail).trim().toLowerCase();
    teamName = String(req.body.teamName).trim();
    payload = {
      teamName,
      teamLogo: String(req.body.teamLogo),
      managerName: String(req.body.managerName).trim(),
      managerEmail,
      managerWhatsApp: req.body.managerWhatsApp != null ? String(req.body.managerWhatsApp).trim() : "",
      managerIsPlayer: Boolean(req.body.managerIsPlayer),
      managerPhoto: String(req.body.managerPhoto),
      players: (req.body.players as { name: string; photo: string; position: string }[]).map((p) => ({
        name: String(p.name).trim(),
        photo: String(p.photo),
        position: PLAYER_POSITIONS.includes(p.position as PlayerPosition) ? p.position : "forward",
      })),
      sponsorDetails: normalizeSponsorDetails(req.body.sponsorDetails),
      declarationAccepted: true,
    };
  }

  const existingByEmail = await Team.findOne({ league, managerEmail }).lean();
  if (existingByEmail) {
    res.status(409).json({
      error: isPbl
        ? "This email is already registered as an owner in this league."
        : "This email is already registered as a manager in this league.",
    });
    return;
  }

  const existingByTeamName = await Team.findOne({ league, teamName }).lean();
  if (existingByTeamName) {
    res.status(409).json({
      error: "A team with this name is already registered in this league.",
    });
    return;
  }

  const otp = generateOtp();
  const token = randomBytes(24).toString("hex");
  const otpExpiresAt = new Date(Date.now() + 10 * 60 * 1000);

  try {
    await PendingTeam.create({
      token,
      league,
      payload,
      otp,
      otpExpiresAt,
    });
  } catch (e) {
    console.error("PendingTeam create error:", e);
    res.status(500).json({ error: "Failed to create pending registration" });
    return;
  }

  try {
    await sendOtpEmail(managerEmail, otp);
  } catch (e) {
    const err = e as Error & { response?: string; responseCode?: number; command?: string };
    console.error("Send OTP email error:", err.message || err);
    if (err.response) console.error("SMTP response:", err.response);
    if (err.responseCode) console.error("SMTP responseCode:", err.responseCode);
    if (err.command) console.error("SMTP command:", err.command);
    console.error("Full error:", e);
    await PendingTeam.deleteOne({ token }).catch(() => {});
    res.status(500).json({
      error:
        "Failed to send verification email. Check SMTP configuration (see server console for details).",
    });
    return;
  }

  res.status(200).json({ pendingToken: token });
}

export async function verifyAndRegister(req: Request, res: Response): Promise<void> {
  const raw = req.params.league;
  const league = ((Array.isArray(raw) ? raw[0] : raw) ?? "").toLowerCase();
  if (!LEAGUES.includes(league as (typeof LEAGUES)[number])) {
    res.status(400).json({ error: "Invalid league" });
    return;
  }

  const { pendingToken, otp } = req.body;
  if (!pendingToken || typeof otp !== "string" || !/^\d{6}$/.test(otp.trim())) {
    res.status(400).json({ error: "Invalid or missing pendingToken or OTP (6 digits required)" });
    return;
  }

  const pending = await PendingTeam.findOne({ token: pendingToken, league });
  if (!pending) {
    res.status(400).json({ error: "Invalid or expired verification. Please start registration again." });
    return;
  }

  if (pending.otpExpiresAt < new Date()) {
    await PendingTeam.deleteOne({ token: pendingToken }).catch(() => {});
    res.status(400).json({ error: "OTP has expired. Please request a new code." });
    return;
  }

  if (pending.otp !== otp.trim()) {
    res.status(400).json({ error: "Incorrect OTP. Please try again." });
    return;
  }

  const { payload } = pending;

  try {
    const team = await Team.create({
      league,
      teamName: payload.teamName,
      teamLogo: payload.teamLogo,
      managerName: payload.managerName,
      managerEmail: payload.managerEmail,
      managerWhatsApp: payload.managerWhatsApp ?? "",
      managerIsPlayer: payload.managerIsPlayer,
      managerPhoto: payload.managerPhoto,
      players: payload.players,
      sponsorDetails: payload.sponsorDetails ?? { name: "", logo: "" },
      declarationAccepted: true,
    });
    await PendingTeam.deleteOne({ token: pendingToken }).catch(() => {});
    res.status(201).json({ id: team._id, league: team.league, teamName: team.teamName });
  } catch (err: unknown) {
    const e = err as { code?: number; keyPattern?: Record<string, number>; keyValue?: Record<string, unknown> };
    if (e.code === 11000) {
      if (e.keyPattern?.managerEmail) {
        res.status(409).json({
          error: league === "pbl"
            ? "This email is already registered as an owner in this league."
            : "This email is already registered as a manager in this league.",
        });
        return;
      }
      res.status(409).json({ error: "A team with this name is already registered in this league" });
      return;
    }
    console.error("Verify and register error:", e);
    res.status(500).json({ error: "Failed to complete registration" });
  }
}
