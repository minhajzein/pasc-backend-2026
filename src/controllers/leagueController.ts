import type { Request, Response } from "express";
import { League } from "../models/League";
import { Team } from "../models/Team";
import { Player } from "../models/Player";

const LEAGUE_SLUGS = ["ppl", "pcl", "pvl", "pbl"] as const;

function getLeagueSlug(req: Request): string | null {
  const raw = req.params.league;
  const slug = ((Array.isArray(raw) ? raw[0] : raw) ?? "").toLowerCase();
  return LEAGUE_SLUGS.includes(slug as (typeof LEAGUE_SLUGS)[number]) ? slug : null;
}

/** GET /api/leagues - list all leagues (with team count) */
export async function listLeagues(req: Request, res: Response): Promise<void> {
  try {
    const leagues = await League.find().sort({ slug: 1 }).lean();
    const teamCounts = await Team.aggregate<{ _id: string; count: number }>([
      { $group: { _id: "$league", count: { $sum: 1 } } },
    ]);
    const countByLeague: Record<string, number> = {};
    for (const row of teamCounts) {
      countByLeague[row._id] = row.count;
    }
    const result = leagues.map((l) => ({
      ...l,
      teamCount: countByLeague[l.slug] ?? 0,
    }));
    res.json(result);
  } catch (e) {
    console.error("List leagues error:", e);
    res.status(500).json({ error: "Failed to load leagues" });
  }
}

/** GET /api/leagues/:league - get one league with its teams and players */
export async function getLeagueBySlug(req: Request, res: Response): Promise<void> {
  const slug = getLeagueSlug(req);
  if (!slug) {
    res.status(400).json({ error: "Invalid league" });
    return;
  }
  try {
    const league = await League.findOne({ slug }).lean();
    if (!league) {
      res.status(404).json({ error: "League not found" });
      return;
    }
    const teams = await Team.find({ league: slug })
      .populate("franchiseOwner", "fullName email whatsApp photo")
      .populate("players.player", "fullName photo whatsApp")
      .sort({ createdAt: -1 })
      .lean();
    res.json({ ...league, teams });
  } catch (e) {
    console.error("Get league error:", e);
    res.status(500).json({ error: "Failed to load league" });
  }
}

const LEAGUES_WITH_PLAYERS = ["ppl", "pcl", "pvl"] as const;

/** GET /api/leagues/:league/players - list players registered for this league (PPL, PCL, PVL only; no PBL) */
export async function listLeaguePlayers(req: Request, res: Response): Promise<void> {
  const slug = getLeagueSlug(req);
  if (!slug) {
    res.status(400).json({ error: "Invalid league" });
    return;
  }
  if (!LEAGUES_WITH_PLAYERS.includes(slug as (typeof LEAGUES_WITH_PLAYERS)[number])) {
    res.status(404).json({ error: "This league does not have a public players list." });
    return;
  }
  try {
    const leagueDoc = await League.findOne({ slug }).select("_id").lean();
    if (!leagueDoc) {
      res.status(404).json({ error: "League not found" });
      return;
    }
    const limit = Math.min(500, Math.max(1, parseInt(String(req.query.limit), 10) || 100));
    const skip = Math.max(0, parseInt(String(req.query.skip), 10) || 0);

    const players = await Player.find({
      "leagueRegistrations.league": leagueDoc._id,
      status: { $in: ["pending", "verified"] },
    })
      .select("fullName photo leagueRegistrations")
      .sort({ fullName: 1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const leagueIdStr = String(leagueDoc._id);
    const list = players.map((p) => {
      const reg = (p.leagueRegistrations as { league: unknown; position?: string }[]).find(
        (r) => String(r.league) === leagueIdStr
      );
      return {
        _id: String(p._id),
        fullName: p.fullName,
        photo: p.photo ?? "",
        position: reg?.position?.trim() || "",
      };
    });

    res.json(list);
  } catch (e) {
    console.error("List league players error:", e);
    res.status(500).json({ error: "Failed to load players" });
  }
}
