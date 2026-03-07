import type { Request, Response } from "express";
import { League } from "../models/League";
import { Team } from "../models/Team";

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
