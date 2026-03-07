import type { Request, Response } from "express";
import mongoose from "mongoose";
import { Player } from "../models/Player";
import { League } from "../models/League";

const DEFAULT_LIMIT = 30;
const MAX_LIMIT = 50;
const NON_PBL_LEAGUES = ["ppl", "pcl", "pvl"] as const;

/** GET /api/players - list players for selection (search by name/email), returns only players with email.
 *  Optional query: league=ppl|pcl|pvl to include hasPaidForLeague for that league. */
export async function listPlayers(req: Request, res: Response): Promise<void> {
  const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
  const leagueSlug = typeof req.query.league === "string" ? req.query.league.trim().toLowerCase() : "";
  const limit = Math.min(
    Math.max(1, parseInt(String(req.query.limit), 10) || DEFAULT_LIMIT),
    MAX_LIMIT
  );

  const filter: mongoose.FilterQuery<{ fullName: string; email: string }> = {
    email: { $exists: true, $ne: "" },
  };
  if (q.length > 0) {
    const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(escaped, "i");
    filter.$or = [
      { fullName: re },
      { email: re },
    ];
  }

  const includeLeagueStatus =
    leagueSlug && NON_PBL_LEAGUES.includes(leagueSlug as (typeof NON_PBL_LEAGUES)[number]);

  let leagueId: mongoose.Types.ObjectId | null = null;
  if (includeLeagueStatus) {
    const leagueDoc = await League.findOne({ slug: leagueSlug }).select("_id").lean();
    leagueId = leagueDoc?._id ?? null;
  }

  const players = await Player.find(filter)
    .select(includeLeagueStatus ? "_id fullName email photo leagueRegistrations" : "_id fullName email photo")
    .sort({ fullName: 1 })
    .limit(limit)
    .lean();

  const list = players.map((p) => {
    const base = {
      _id: String(p._id),
      fullName: p.fullName,
      email: p.email,
      photo: p.photo ?? "",
    };
    if (includeLeagueStatus && leagueId && "leagueRegistrations" in p && Array.isArray(p.leagueRegistrations)) {
      const reg = (p.leagueRegistrations as { league: unknown; paymentStatus?: string; position?: string }[]).find(
        (r) => String(r.league) === String(leagueId)
      );
      const hasPaidForLeague = reg?.paymentStatus === "paid";
      const positionForLeague = reg?.position?.trim() || undefined;
      return { ...base, hasPaidForLeague, positionForLeague };
    }
    return base;
  });

  res.json(list);
}
