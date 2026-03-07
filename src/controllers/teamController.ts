import type { Request, Response } from "express";
import mongoose from "mongoose";
import { randomBytes } from "crypto";
import { Team, PLAYER_POSITIONS, type PlayerPosition } from "../models/Team";
import { Player, isOver16 } from "../models/Player";
import { League } from "../models/League";
import { PendingTeam } from "../models/PendingTeam";
import { sendOtpEmail } from "../services/email";
import type { AuthRequest } from "../middleware/auth";

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
      .select("teamName teamLogo franchiseOwner createdAt _id")
      .populate("franchiseOwner", "fullName photo")
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
    const team = await Team.findOne({ _id: id, league })
      .populate("franchiseOwner", "fullName email whatsApp photo")
      .populate("players.player", "fullName photo")
      .lean();
    if (!team) {
      res.status(404).json({ error: "Team not found" });
      return;
    }
    res.json(team);
  } catch (e) {
    console.error("Get team error:", e);
    res.status(500).json({ error: "Failed to load team" });
  }
}

/** GET /api/me/teams - teams where I am franchise owner (auth required) */
export async function getMyTeams(req: AuthRequest, res: Response): Promise<void> {
  if (!req.user) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  try {
    const teams = await Team.find({ franchiseOwner: req.user.id })
      .populate("franchiseOwner", "fullName photo")
      .sort({ league: 1, createdAt: -1 })
      .lean();
    res.json(teams);
  } catch (e) {
    console.error("Get my teams error:", e);
    res.status(500).json({ error: "Failed to load teams" });
  }
}

/** PATCH /api/leagues/:league/teams/:id - update team (franchise owner only) */
export async function updateTeam(req: AuthRequest, res: Response): Promise<void> {
  const league = getLeagueParam(req);
  if (!league) {
    res.status(400).json({ error: "Invalid league" });
    return;
  }
  const rawId = req.params.id;
  const id = Array.isArray(rawId) ? rawId[0] : rawId;
  if (!id || !req.user) {
    res.status(400).json({ error: "Missing team id or not authenticated" });
    return;
  }
  try {
    const team = await Team.findOne({ _id: id, league }).lean();
    if (!team) {
      res.status(404).json({ error: "Team not found" });
      return;
    }
    if (String(team.franchiseOwner) !== req.user.id) {
      res.status(403).json({ error: "Only the franchise owner can update this team" });
      return;
    }
    const body = req.body as Record<string, unknown>;
    const updates: Record<string, unknown> = {};
    if (typeof body.teamName === "string" && body.teamName.trim()) updates.teamName = body.teamName.trim();
    if (typeof body.teamLogo === "string") updates.teamLogo = body.teamLogo;
    if (body.sponsorDetails != null && typeof body.sponsorDetails === "object") {
      const sd = body.sponsorDetails as { name?: unknown; logo?: unknown };
      updates.sponsorDetails = {
        name: typeof sd.name === "string" ? sd.name.trim() : "",
        logo: typeof sd.logo === "string" ? sd.logo : "",
      };
    }
    if (Object.keys(updates).length === 0) {
      res.status(400).json({ error: "No valid fields to update" });
      return;
    }
    const updated = await Team.findByIdAndUpdate(id, { $set: updates }, { new: true })
      .populate("franchiseOwner", "fullName email whatsApp photo")
      .populate("players.player", "fullName photo")
      .lean();
    res.json(updated);
  } catch (e) {
    console.error("Update team error:", e);
    res.status(500).json({ error: "Failed to update team" });
  }
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isValidEmail(email: unknown): email is string {
  return typeof email === "string" && EMAIL_REGEX.test(email.trim());
}

/** Escape special regex characters for use in RegExp */
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Check if a team with this name (trimmed, case-insensitive) already exists in this league */
async function teamNameExistsInLeague(league: string, name: string): Promise<boolean> {
  const normalized = (name || "").trim().toLowerCase();
  if (!normalized) return false;
  const teams = await Team.find({ league }).select("teamName").lean();
  return teams.some(
    (t) => (typeof t.teamName === "string" ? t.teamName.trim().toLowerCase() : "") === normalized
  );
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
      return "Badminton: teamName, teamLogo, exactly 2 players, and declaration required.";
    }
    const idx = ownerPlayerIndex;
    if (idx !== 0 && idx !== 1) {
      return "Owner must be player 1 or player 2 (ownerPlayerIndex 0 or 1).";
    }
    const ownerSlot = (players as { playerId?: unknown; name?: unknown; photo?: unknown }[])[idx];
    const ownerHasPlayerId = typeof ownerSlot?.playerId === "string" && ownerSlot.playerId.trim().length > 0;
    if (!ownerHasPlayerId && !isValidEmail(ownerEmail)) {
      return "Valid owner email is required (or select an existing player as owner).";
    }
    for (const p of players as { playerId?: unknown; name?: unknown; photo?: unknown; email?: unknown }[]) {
      const hasPlayerId = typeof p?.playerId === "string" && p.playerId.trim().length > 0;
      const hasNewPlayer = p?.name && p?.photo;
      if (!hasPlayerId && !hasNewPlayer) {
        return "Each player must be selected from list or have name and photo.";
      }
    }
    return null;
  }

  const {
    teamName,
    teamLogo,
    franchiseOwnerId,
    franchiseOwnerName,
    franchiseOwnerEmail,
    franchiseOwnerPhoto,
    franchiseOwnerPosition,
    players,
    sponsorDetails,
    declarationAccepted,
  } = body;

  if (
    !teamName ||
    !teamLogo ||
    !Array.isArray(players) ||
    players.length === 0 ||
    typeof declarationAccepted !== "boolean" ||
    !declarationAccepted
  ) {
    return "Missing: teamName, teamLogo, players (non-empty), declarationAccepted (true).";
  }

  const hasExistingOwner = typeof franchiseOwnerId === "string" && franchiseOwnerId.trim().length > 0;
  const hasNewOwner =
    franchiseOwnerName &&
    franchiseOwnerEmail &&
    franchiseOwnerPhoto &&
    franchiseOwnerPosition &&
    isValidEmail(franchiseOwnerEmail);

  if (!hasExistingOwner && !hasNewOwner) {
    return "Select an existing franchise owner or enter full details (name, email, photo, position).";
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
  let ownerEmail: string;
  let teamName: string;
  let payload: {
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

  if (isPbl) {
    const ownerPlayerIndex = Number(req.body.ownerPlayerIndex);
    const playersBody = req.body.players as { playerId?: string; name?: string; photo?: string; email?: string; whatsApp?: string; aadhaarFront?: string; aadhaarBack?: string; dateOfBirth?: string; paymentScreenshot?: string }[];
    const ownerSlot = playersBody[ownerPlayerIndex];
    teamName = String(req.body.teamName).trim();
    if (ownerSlot?.playerId) {
      const ownerPlayerDoc = await Player.findById(ownerSlot.playerId).lean();
      if (!ownerPlayerDoc?.email) {
        res.status(400).json({ error: "Selected owner player has no email." });
        return;
      }
      ownerEmail = String(ownerPlayerDoc.email).trim().toLowerCase();
    } else {
      ownerEmail = String(req.body.ownerEmail).trim().toLowerCase();
    }
    payload = {
      teamName,
      teamLogo: String(req.body.teamLogo),
      franchiseOwnerName: String(ownerSlot?.name ?? "").trim(),
      franchiseOwnerEmail: ownerEmail,
      franchiseOwnerWhatsApp: "",
      franchiseOwnerPhoto: String(ownerSlot?.photo ?? ""),
      franchiseOwnerPosition: "forward",
      players: playersBody.map((p) => ({
        playerId: p.playerId && String(p.playerId).trim() ? String(p.playerId).trim() : undefined,
        name: p.name ? String(p.name).trim() : undefined,
        photo: p.photo ? String(p.photo) : undefined,
        position: "forward",
        email: p.email && isValidEmail(p.email) ? String(p.email).trim().toLowerCase() : undefined,
        whatsApp: p.whatsApp != null ? String(p.whatsApp).trim() : undefined,
        aadhaarFront: p.aadhaarFront != null ? String(p.aadhaarFront) : undefined,
        aadhaarBack: p.aadhaarBack != null ? String(p.aadhaarBack) : undefined,
        dateOfBirth: p.dateOfBirth != null ? String(p.dateOfBirth) : undefined,
        paymentScreenshot: p.paymentScreenshot != null ? String(p.paymentScreenshot) : undefined,
      })),
      sponsorDetails: normalizeSponsorDetails(req.body.sponsorDetails),
      teamRegistrationPaymentScreenshot: req.body.teamRegistrationPaymentScreenshot != null ? String(req.body.teamRegistrationPaymentScreenshot) : undefined,
      declarationAccepted: true,
    };
  } else {
    const hasExistingOwner = typeof req.body.franchiseOwnerId === "string" && req.body.franchiseOwnerId.trim().length > 0;
    if (hasExistingOwner) {
      const ownerId = String(req.body.franchiseOwnerId).trim();
      const existingOwner = await Player.findById(ownerId).lean();
      if (!existingOwner || !existingOwner.email) {
        res.status(400).json({ error: "Selected franchise owner not found or has no email." });
        return;
      }
      ownerEmail = String(existingOwner.email).trim().toLowerCase();
      teamName = String(req.body.teamName).trim();
      payload = {
        teamName,
        teamLogo: String(req.body.teamLogo),
        franchiseOwnerId: ownerId,
        franchiseOwnerName: existingOwner.fullName,
        franchiseOwnerEmail: ownerEmail,
        franchiseOwnerWhatsApp: existingOwner.whatsApp ?? "",
        franchiseOwnerPhoto: existingOwner.photo,
        franchiseOwnerPosition: "forward",
        franchiseOwnerPaymentScreenshot: req.body.franchiseOwnerPaymentScreenshot != null ? String(req.body.franchiseOwnerPaymentScreenshot) : undefined,
        players: (req.body.players as { name: string; photo: string; position: string }[]).map(
          (p) => ({
            name: String(p.name).trim(),
            photo: String(p.photo),
            position: PLAYER_POSITIONS.includes(p.position as PlayerPosition) ? p.position : "forward",
          })
        ),
        sponsorDetails: normalizeSponsorDetails(req.body.sponsorDetails),
        teamRegistrationPaymentScreenshot: req.body.teamRegistrationPaymentScreenshot != null ? String(req.body.teamRegistrationPaymentScreenshot) : undefined,
        declarationAccepted: true,
      };
    } else {
      ownerEmail = String(req.body.franchiseOwnerEmail).trim().toLowerCase();
      teamName = String(req.body.teamName).trim();
      payload = {
        teamName,
        teamLogo: String(req.body.teamLogo),
        franchiseOwnerName: String(req.body.franchiseOwnerName).trim(),
        franchiseOwnerEmail: ownerEmail,
        franchiseOwnerWhatsApp:
          req.body.franchiseOwnerWhatsApp != null
            ? String(req.body.franchiseOwnerWhatsApp).trim()
            : "",
        franchiseOwnerPhoto: String(req.body.franchiseOwnerPhoto),
        franchiseOwnerPosition: String(req.body.franchiseOwnerPosition).trim(),
        franchiseOwnerAadhaarFront: req.body.franchiseOwnerAadhaarFront != null ? String(req.body.franchiseOwnerAadhaarFront) : undefined,
        franchiseOwnerAadhaarBack: req.body.franchiseOwnerAadhaarBack != null ? String(req.body.franchiseOwnerAadhaarBack) : undefined,
        franchiseOwnerDateOfBirth: req.body.franchiseOwnerDateOfBirth != null ? String(req.body.franchiseOwnerDateOfBirth) : undefined,
        franchiseOwnerPaymentScreenshot: req.body.franchiseOwnerPaymentScreenshot != null ? String(req.body.franchiseOwnerPaymentScreenshot) : undefined,
        players: (req.body.players as { name: string; photo: string; position: string }[]).map(
          (p) => ({
            name: String(p.name).trim(),
            photo: String(p.photo),
            position: PLAYER_POSITIONS.includes(p.position as PlayerPosition) ? p.position : "forward",
          })
        ),
        sponsorDetails: normalizeSponsorDetails(req.body.sponsorDetails),
        teamRegistrationPaymentScreenshot: req.body.teamRegistrationPaymentScreenshot != null ? String(req.body.teamRegistrationPaymentScreenshot) : undefined,
        declarationAccepted: true,
      };
    }
  }

  // --- Uniqueness checks FIRST: do not send OTP if team name or franchise owner already exists in this league ---
  const existingPlayer = await Player.findOne({ email: ownerEmail }).lean();
  if (existingPlayer) {
    const existingTeam = await Team.findOne({
      league,
      franchiseOwner: existingPlayer._id,
    }).lean();
    if (existingTeam) {
      res.status(409).json({
        error:
          league === "pbl"
            ? "This email is already registered as an owner in this league."
            : "This email is already registered as a franchise owner in this league.",
      });
      return;
    }
  }

  if (await teamNameExistsInLeague(league, teamName)) {
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

  // Re-check right before sending email (guard against race)
  const recheckPlayer = await Player.findOne({ email: ownerEmail }).lean();
  if (recheckPlayer) {
    const recheckOwnerTeam = await Team.findOne({
      league,
      franchiseOwner: recheckPlayer._id,
    }).lean();
    if (recheckOwnerTeam) {
      await PendingTeam.deleteOne({ token }).catch(() => {});
      res.status(409).json({
        error:
          league === "pbl"
            ? "This email is already registered as an owner in this league."
            : "This email is already registered as a franchise owner in this league.",
      });
      return;
    }
  }
  if (await teamNameExistsInLeague(league, teamName)) {
    await PendingTeam.deleteOne({ token }).catch(() => {});
    res.status(409).json({
      error: "A team with this name is already registered in this league.",
    });
    return;
  }

  try {
    await sendOtpEmail(ownerEmail, otp);
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
    res.status(400).json({
      error: "Invalid or expired verification. Please start registration again.",
    });
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

  // Use the league stored with this registration (must match URL; only check uniqueness within this league)
  const registrationLeague = pending.league as string;

  // Validate uniqueness before creating anything (same rules as before OTP; handles race or stale pending).
  // Team name is unique only within the same league; the same name is allowed in different leagues.
  const payloadTeamName = typeof payload.teamName === "string" ? payload.teamName.trim() : "";
  if (payloadTeamName && (await teamNameExistsInLeague(registrationLeague, payloadTeamName))) {
    await PendingTeam.deleteOne({ token: pendingToken }).catch(() => {});
    res.status(409).json({
      error: "A team with this name is already registered in this league.",
    });
    return;
  }
  const ownerEmailForCheck = (payload.franchiseOwnerEmail ?? payload.ownerEmail ?? "")?.trim().toLowerCase();
  if (ownerEmailForCheck) {
    const existingOwnerPlayer = await Player.findOne({ email: ownerEmailForCheck }).lean();
    if (existingOwnerPlayer) {
      const existingOwnerTeam = await Team.findOne({
        league: registrationLeague,
        franchiseOwner: existingOwnerPlayer._id,
      }).lean();
      if (existingOwnerTeam) {
        await PendingTeam.deleteOne({ token: pendingToken }).catch(() => {});
        res.status(409).json({
          error:
            league === "pbl"
              ? "This email is already registered as an owner in this league."
              : "This email is already registered as a franchise owner in this league.",
        });
        return;
      }
    }
  }
  if (payload.franchiseOwnerId) {
    const ownerPlayer = await Player.findById(payload.franchiseOwnerId).lean();
    if (ownerPlayer) {
      const existingOwnerTeam = await Team.findOne({
        league: registrationLeague,
        franchiseOwner: ownerPlayer._id,
      }).lean();
      if (existingOwnerTeam) {
        await PendingTeam.deleteOne({ token: pendingToken }).catch(() => {});
        res.status(409).json({
          error:
            league === "pbl"
              ? "This email is already registered as an owner in this league."
              : "This email is already registered as a franchise owner in this league.",
        });
        return;
      }
    }
  }

  const leagueDoc = await League.findOne({ slug: league }).lean();
  const leagueId = leagueDoc?._id;

  const dobRaw = payload.franchiseOwnerDateOfBirth;
  const dob = dobRaw ? new Date(dobRaw) : null;
  const paymentScreenshot = payload.franchiseOwnerPaymentScreenshot ?? "";
  const paymentStatus = paymentScreenshot ? "paid" : "pending";
  const eligible = dob ? isOver16(dob) : false;

  try {
    const ownerEmail = payload.franchiseOwnerEmail ?? payload.ownerEmail ?? "";
    let ownerPlayer: { _id: mongoose.Types.ObjectId } | null;

    if (payload.franchiseOwnerId) {
      ownerPlayer = await Player.findById(payload.franchiseOwnerId).lean();
      if (!ownerPlayer) {
        res.status(400).json({ error: "Selected franchise owner no longer found." });
        return;
      }
      const hasReg = (ownerPlayer as { leagueRegistrations?: { league: unknown }[] })
        .leagueRegistrations?.some((r) => String(r.league) === String(leagueId));
      if (leagueId && !hasReg) {
        await Player.updateOne(
          { _id: ownerPlayer._id },
          {
            $push: {
              leagueRegistrations: {
                league: leagueId,
                paymentStatus,
                paymentScreenshot,
                eligible,
              },
            },
          }
        );
      }
    } else {
      ownerPlayer = await Player.findOne({ email: ownerEmail }).lean();
      if (!ownerPlayer) {
        const created = await Player.create({
          fullName: payload.franchiseOwnerName ?? "",
          email: ownerEmail,
          whatsApp: payload.franchiseOwnerWhatsApp ?? "",
          photo: payload.franchiseOwnerPhoto ?? "",
          aadhaarFront: payload.franchiseOwnerAadhaarFront ?? "",
          aadhaarBack: payload.franchiseOwnerAadhaarBack ?? "",
          dateOfBirth: dob ?? undefined,
          leagueRegistrations: leagueId
            ? [{ league: leagueId, paymentStatus, paymentScreenshot, eligible }]
            : [],
        });
        ownerPlayer = created.toObject() as typeof ownerPlayer & { _id: typeof created._id };
      } else {
        const updates: Record<string, unknown> = {};
        if (payload.franchiseOwnerAadhaarFront != null) updates.aadhaarFront = payload.franchiseOwnerAadhaarFront;
        if (payload.franchiseOwnerAadhaarBack != null) updates.aadhaarBack = payload.franchiseOwnerAadhaarBack;
        if (dob) updates.dateOfBirth = dob;
        if (Object.keys(updates).length > 0) {
          await Player.updateOne({ _id: ownerPlayer._id }, { $set: updates });
        }
        const hasReg = (ownerPlayer as { leagueRegistrations?: { league: unknown }[] })
          .leagueRegistrations?.some((r) => String(r.league) === String(leagueId));
        if (leagueId && !hasReg) {
          await Player.updateOne(
            { _id: ownerPlayer._id },
            {
              $push: {
                leagueRegistrations: {
                  league: leagueId,
                  paymentStatus,
                  paymentScreenshot,
                  eligible,
                },
              },
            }
          );
        }
      }
    }

    const ownerId = ownerPlayer!._id;
    const teamPlayers: { player: typeof ownerId; position: string }[] = [];
    for (let i = 0; i < payload.players.length; i++) {
      const p = payload.players[i];
      const isOwner = Boolean(
        payload.ownerEmail && payload.ownerPlayerIndex === i
      );
      if (isOwner) {
        teamPlayers.push({ player: ownerId, position: p.position ?? "forward" });
        continue;
      }
      // PBL: use existing player by playerId if set
      const playerId = (p as { playerId?: string }).playerId;
      if (league === "pbl" && playerId) {
        const existing = await Player.findById(playerId).lean();
        if (existing) {
          const hasReg = (existing as { leagueRegistrations?: { league: unknown }[] })
            .leagueRegistrations?.some((r) => String(r.league) === String(leagueId));
          if (leagueId && !hasReg) {
            await Player.updateOne(
              { _id: existing._id },
              {
                $push: {
                  leagueRegistrations: {
                    league: leagueId,
                    paymentStatus: "pending",
                    paymentScreenshot: "",
                    eligible: false,
                  },
                },
              }
            );
          }
          teamPlayers.push({
            player: existing._id,
            position: p.position ?? "forward",
          });
          continue;
        }
      }
      // PBL: if non-owner has email and existing player, use them
      const playerEmail = (p as { email?: string }).email;
      if (league === "pbl" && playerEmail) {
        const existing = await Player.findOne({ email: playerEmail.trim().toLowerCase() }).lean();
        if (existing) {
          const hasReg = (existing as { leagueRegistrations?: { league: unknown }[] })
            .leagueRegistrations?.some((r) => String(r.league) === String(leagueId));
          if (leagueId && !hasReg) {
            await Player.updateOne(
              { _id: existing._id },
              {
                $push: {
                  leagueRegistrations: {
                    league: leagueId,
                    paymentStatus: "pending",
                    paymentScreenshot: "",
                    eligible: false,
                  },
                },
              }
            );
          }
          teamPlayers.push({
            player: existing._id,
            position: p.position ?? "forward",
          });
          continue;
        }
      }
      const created = await Player.create({
        fullName: p.name ?? "",
        email: (p as { email?: string }).email && String((p as { email?: string }).email).trim() ? String((p as { email?: string }).email).trim().toLowerCase() : "",
        photo: p.photo ?? "",
        whatsApp: (p as { whatsApp?: string }).whatsApp ?? "",
        aadhaarFront: (p as { aadhaarFront?: string }).aadhaarFront ?? "",
        aadhaarBack: (p as { aadhaarBack?: string }).aadhaarBack ?? "",
        dateOfBirth: (() => {
          const dob = (p as { dateOfBirth?: string }).dateOfBirth;
          return dob ? new Date(dob) : undefined;
        })(),
        leagueRegistrations: leagueId
          ? [{
              league: leagueId,
              paymentStatus: (p as { paymentScreenshot?: string }).paymentScreenshot ? "paid" : "pending",
              paymentScreenshot: (p as { paymentScreenshot?: string }).paymentScreenshot ?? "",
              eligible: (() => {
                const dob = (p as { dateOfBirth?: string }).dateOfBirth;
                return dob ? isOver16(new Date(dob)) : false;
              })(),
            }]
          : [],
      });
      teamPlayers.push({
        player: created._id,
        position: p.position ?? "forward",
      });
    }

    const team = await Team.create({
      league,
      teamName: payload.teamName,
      teamLogo: payload.teamLogo,
      franchiseOwner: ownerId,
      players: teamPlayers,
      sponsorDetails: payload.sponsorDetails ?? { name: "", logo: "" },
      registrationPaymentStatus: payload.teamRegistrationPaymentScreenshot ? "paid" : "pending",
      registrationPaymentScreenshot: payload.teamRegistrationPaymentScreenshot ?? "",
      status: "pending",
      declarationAccepted: true,
    });

    await PendingTeam.deleteOne({ token: pendingToken }).catch(() => {});

    res.status(201).json({
      id: team._id,
      league: team.league,
      teamName: team.teamName,
    });
  } catch (err: unknown) {
    const e = err as {
      code?: number;
      keyPattern?: Record<string, number>;
      keyValue?: Record<string, unknown>;
    };
    if (e.code === 11000) {
      if (e.keyPattern?.franchiseOwner) {
        res.status(409).json({
          error:
            league === "pbl"
              ? "This email is already registered as an owner in this league."
              : "This email is already registered as a franchise owner in this league.",
        });
        return;
      }
      res.status(409).json({
        error: "A team with this name is already registered in this league",
      });
      return;
    }
    console.error("Verify and register error:", err);
    res.status(500).json({ error: "Failed to complete registration" });
  }
}
