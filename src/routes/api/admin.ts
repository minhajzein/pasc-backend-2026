import { Router, type IRouter } from "express";
import { requireAdmin } from "../../middleware/admin";
import {
  adminLogin,
  listPendingPlayers,
  listPendingTeams,
  getPlayerById,
  getTeamById,
  setPlayerStatus,
  setTeamStatus,
  updatePlayerLeagueRegistration,
} from "../../controllers/adminController";

const router: IRouter = Router();

router.post("/login", adminLogin);

router.use(requireAdmin);

router.get("/players/pending", listPendingPlayers);
router.get("/players/:id", getPlayerById);
router.patch("/players/:id/status", setPlayerStatus);
router.patch("/players/:id/league-registration", updatePlayerLeagueRegistration);
router.get("/leagues/:league/teams/pending", listPendingTeams);
router.get("/leagues/:league/teams/:id", getTeamById);
router.patch("/leagues/:league/teams/:id/status", setTeamStatus);

export default router;
