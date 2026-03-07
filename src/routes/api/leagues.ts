import { Router, type IRouter } from "express";
import {
  listLeagues,
  getLeagueBySlug,
} from "../../controllers/leagueController";
import {
  sendOtp,
  verifyAndRegister,
  listTeams,
  getTeamById,
  updateTeam,
} from "../../controllers/teamController";
import { requireAuth } from "../../middleware/auth";

const router: IRouter = Router();

router.get("/", listLeagues);
router.get("/:league/teams/:id", getTeamById);
router.patch("/:league/teams/:id", requireAuth, updateTeam);
router.get("/:league/teams", listTeams);
router.get("/:league", getLeagueBySlug);
router.post("/:league/teams/send-otp", sendOtp);
router.post("/:league/teams/verify", verifyAndRegister);

export default router;
