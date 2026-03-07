import type { Response } from "express";
import jwt from "jsonwebtoken";
import { Player, isOver16 } from "../models/Player";
import { League } from "../models/League";
import { PendingLogin } from "../models/PendingLogin";
import { PendingPlayerRegistration } from "../models/PendingPlayerRegistration";
import { sendLoginOtpEmail } from "../services/email";
import { env } from "../config/env";
import type { AuthRequest, JwtPayload } from "../middleware/auth";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isValidEmail(email: unknown): email is string {
  return typeof email === "string" && EMAIL_REGEX.test(email.trim());
}

function generateOtp(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

/** POST /api/auth/send-login-otp */
export async function sendLoginOtp(req: AuthRequest, res: Response): Promise<void> {
  const email = req.body?.email;
  if (!isValidEmail(email)) {
    res.status(400).json({ error: "Valid email is required" });
    return;
  }
  const normalized = (email as string).trim().toLowerCase();

  const player = await Player.findOne({ email: normalized }).lean();
  if (!player) {
    res.status(404).json({
      error: "No registration found for this email. Register a team or as a player first.",
    });
    return;
  }

  const otp = generateOtp();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

  await PendingLogin.deleteMany({ email: normalized }).catch(() => {});
  await PendingLogin.create({ email: normalized, otp, expiresAt });

  try {
    await sendLoginOtpEmail(normalized, otp);
  } catch (e) {
    console.error("Send login OTP error:", e);
    res.status(500).json({ error: "Failed to send login code. Try again later." });
    return;
  }

  res.status(200).json({ message: "Login code sent to your email" });
}

/** POST /api/auth/verify-login */
export async function verifyLogin(req: AuthRequest, res: Response): Promise<void> {
  const email = req.body?.email;
  const otp = req.body?.otp;
  if (!isValidEmail(email) || typeof otp !== "string" || !/^\d{6}$/.test(otp.trim())) {
    res.status(400).json({ error: "Valid email and 6-digit code required" });
    return;
  }
  const normalized = (email as string).trim().toLowerCase();

  const pending = await PendingLogin.findOne({ email: normalized });
  if (!pending) {
    res.status(400).json({ error: "Invalid or expired code. Request a new one." });
    return;
  }
  if (pending.expiresAt < new Date()) {
    await PendingLogin.deleteOne({ email: normalized }).catch(() => {});
    res.status(400).json({ error: "Code has expired. Request a new one." });
    return;
  }
  if (pending.otp !== otp.trim()) {
    res.status(400).json({ error: "Incorrect code." });
    return;
  }

  const player = await Player.findOne({ email: normalized }).lean();
  if (!player) {
    res.status(404).json({ error: "Player not found" });
    return;
  }

  await PendingLogin.deleteOne({ email: normalized }).catch(() => {});

  const payload: JwtPayload = { id: String(player._id), email: normalized };
  const token = jwt.sign(payload, env.jwtSecret, { expiresIn: "7d" });

  res.status(200).json({
    token,
    player: {
      _id: player._id,
      fullName: player.fullName,
      email: player.email,
      whatsApp: player.whatsApp,
      photo: player.photo,
      dateOfBirth: player.dateOfBirth,
      leagueRegistrations: player.leagueRegistrations,
      status: (player as { status?: string }).status ?? "pending",
    },
  });
}

/** GET /api/auth/me - requires auth */
export async function getMe(req: AuthRequest, res: Response): Promise<void> {
  if (!req.user) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  const player = await Player.findById(req.user.id)
    .populate("leagueRegistrations.league", "name slug")
    .lean();
  if (!player) {
    res.status(404).json({ error: "Player not found" });
    return;
  }
  res.json({
    _id: player._id,
    fullName: player.fullName,
    email: player.email,
    whatsApp: player.whatsApp,
    photo: player.photo,
    aadhaarFront: player.aadhaarFront,
    aadhaarBack: player.aadhaarBack,
    dateOfBirth: player.dateOfBirth,
    leagueRegistrations: player.leagueRegistrations,
    status: (player as { status?: string }).status ?? "pending",
  });
}

/** PATCH /api/auth/me - update own profile */
export async function updateMe(req: AuthRequest, res: Response): Promise<void> {
  if (!req.user) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  const body = req.body as Record<string, unknown>;
  const updates: Record<string, unknown> = {};
  if (typeof body.fullName === "string" && body.fullName.trim()) updates.fullName = body.fullName.trim();
  if (typeof body.whatsApp === "string") updates.whatsApp = body.whatsApp.trim();
  if (typeof body.photo === "string") updates.photo = body.photo;
  if (typeof body.aadhaarFront === "string") updates.aadhaarFront = body.aadhaarFront;
  if (typeof body.aadhaarBack === "string") updates.aadhaarBack = body.aadhaarBack;
  if (body.dateOfBirth != null) {
    const d = body.dateOfBirth instanceof Date ? body.dateOfBirth : new Date(String(body.dateOfBirth));
    if (!isNaN(d.getTime())) updates.dateOfBirth = d;
  }
  if (Object.keys(updates).length === 0) {
    res.status(400).json({ error: "No valid fields to update" });
    return;
  }
  const player = await Player.findByIdAndUpdate(
    req.user.id,
    { $set: updates },
    { new: true }
  )
    .select("fullName email whatsApp photo aadhaarFront aadhaarBack dateOfBirth leagueRegistrations")
    .lean();
  if (!player) {
    res.status(404).json({ error: "Player not found" });
    return;
  }
  res.json(player);
}

const PLAYER_REG_LEAGUES = ["ppl", "pcl", "pvl"] as const; // PBL is team-only

/** POST /api/auth/send-player-register-otp */
export async function sendPlayerRegisterOtp(req: AuthRequest, res: Response): Promise<void> {
  const body = req.body as Record<string, unknown>;
  const fullName = typeof body.fullName === "string" ? body.fullName.trim() : "";
  const email = body.email;
  const photo = typeof body.photo === "string" ? body.photo : "";
  const leaguePayments = Array.isArray(body.leaguePayments) ? body.leaguePayments as { leagueSlug: string; paymentScreenshot: string }[] : [];

  if (!isValidEmail(email) || !fullName || !photo) {
    res.status(400).json({ error: "Full name, valid email, and photo are required" });
    return;
  }
  const normalized = (email as string).trim().toLowerCase();

  const existing = await Player.findOne({ email: normalized }).lean();
  if (existing) {
    res.status(409).json({ error: "This email is already registered. Use login instead." });
    return;
  }

  const validLeagues = leaguePayments.filter(
    (p) => typeof p.leagueSlug === "string" && PLAYER_REG_LEAGUES.includes(p.leagueSlug as (typeof PLAYER_REG_LEAGUES)[number])
  );
  if (validLeagues.length === 0) {
    res.status(400).json({ error: "Select at least one league (PPL, PCL, or PVL) with payment" });
    return;
  }

  const otp = generateOtp();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

  await PendingPlayerRegistration.deleteMany({ email: normalized }).catch(() => {});
  await PendingPlayerRegistration.create({
    email: normalized,
    otp,
    expiresAt,
    payload: {
      fullName,
      email: normalized,
      whatsApp: typeof body.whatsApp === "string" ? body.whatsApp.trim() : "",
      photo,
      aadhaarFront: typeof body.aadhaarFront === "string" ? body.aadhaarFront : undefined,
      aadhaarBack: typeof body.aadhaarBack === "string" ? body.aadhaarBack : undefined,
      dateOfBirth: typeof body.dateOfBirth === "string" ? body.dateOfBirth : undefined,
      leaguePayments: validLeagues.map((p) => ({
        leagueSlug: p.leagueSlug,
        paymentScreenshot: typeof p.paymentScreenshot === "string" ? p.paymentScreenshot : "",
      })),
    },
  });

  try {
    await sendLoginOtpEmail(normalized, otp);
  } catch (e) {
    console.error("Send player register OTP error:", e);
    res.status(500).json({ error: "Failed to send verification code. Try again later." });
    return;
  }

  res.status(200).json({ message: "Verification code sent to your email" });
}

/** POST /api/auth/verify-player-register */
export async function verifyPlayerRegister(req: AuthRequest, res: Response): Promise<void> {
  const email = req.body?.email;
  const otp = req.body?.otp;
  if (!isValidEmail(email) || typeof otp !== "string" || !/^\d{6}$/.test(otp.trim())) {
    res.status(400).json({ error: "Valid email and 6-digit code required" });
    return;
  }
  const normalized = (email as string).trim().toLowerCase();

  const pending = await PendingPlayerRegistration.findOne({ email: normalized });
  if (!pending) {
    res.status(400).json({ error: "Invalid or expired code. Request a new one." });
    return;
  }
  if (pending.expiresAt < new Date()) {
    await PendingPlayerRegistration.deleteOne({ email: normalized }).catch(() => {});
    res.status(400).json({ error: "Code has expired. Request a new one." });
    return;
  }
  if (pending.otp !== otp.trim()) {
    res.status(400).json({ error: "Incorrect code." });
    return;
  }

  const p = pending.payload;
  const leagueDocs = await League.find({ slug: { $in: p.leaguePayments.map((x) => x.leagueSlug) } }).lean();
  const leagueRegistrations = p.leaguePayments.map((lp) => {
    const leagueDoc = leagueDocs.find((l) => l.slug === lp.leagueSlug);
    const leagueId = leagueDoc?._id;
    const dob = p.dateOfBirth ? new Date(p.dateOfBirth) : null;
    const eligible = dob ? isOver16(dob) : false;
    return {
      league: leagueId,
      paymentStatus: lp.paymentScreenshot ? "paid" : "pending",
      paymentScreenshot: lp.paymentScreenshot ?? "",
      eligible,
    };
  }).filter((r) => r.league);

  const player = await Player.create({
    fullName: p.fullName,
    email: p.email,
    whatsApp: p.whatsApp ?? "",
    photo: p.photo,
    aadhaarFront: p.aadhaarFront ?? "",
    aadhaarBack: p.aadhaarBack ?? "",
    dateOfBirth: p.dateOfBirth ? new Date(p.dateOfBirth) : undefined,
    leagueRegistrations,
    status: "pending",
  });

  await PendingPlayerRegistration.deleteOne({ email: normalized }).catch(() => {});

  const payload: JwtPayload = { id: String(player._id), email: normalized };
  const token = jwt.sign(payload, env.jwtSecret, { expiresIn: "7d" });

  const created = player.toObject();
  res.status(201).json({
    token,
    player: {
      _id: created._id,
      fullName: created.fullName,
      email: created.email,
      whatsApp: created.whatsApp,
      photo: created.photo,
      dateOfBirth: created.dateOfBirth,
      leagueRegistrations: created.leagueRegistrations,
      status: "pending",
    },
  });
}
