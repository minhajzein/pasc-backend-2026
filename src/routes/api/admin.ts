import { Router, type IRouter } from "express";
import { requireAdmin } from "../../middleware/admin";
import {
  adminLogin,
  listPendingPlayers,
  listPendingTeams,
  setPlayerStatus,
  setTeamStatus,
} from "../../controllers/adminController";

const router: IRouter = Router();

router.post("/login", adminLogin);

router.use(requireAdmin);

router.get("/players/pending", listPendingPlayers);
router.patch("/players/:id/status", setPlayerStatus);
router.get("/leagues/:league/teams/pending", listPendingTeams);
router.patch("/leagues/:league/teams/:id/status", setTeamStatus);

export default router;
