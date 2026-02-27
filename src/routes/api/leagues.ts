import { Router, type IRouter } from "express";
import { sendOtp, verifyAndRegister, listTeams, getTeamById } from "../../controllers/teamController";

const router: IRouter = Router();

router.get("/:league/teams", listTeams);
router.get("/:league/teams/:id", getTeamById);
router.post("/:league/teams/send-otp", sendOtp);
router.post("/:league/teams/verify", verifyAndRegister);

export default router;
