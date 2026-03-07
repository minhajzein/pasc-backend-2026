import { Router, type IRouter } from "express";
import { requireAuth } from "../../middleware/auth";
import {
  sendLoginOtp,
  verifyLogin,
  getMe,
  updateMe,
  sendPlayerRegisterOtp,
  verifyPlayerRegister,
} from "../../controllers/authController";
import { getMyTeams } from "../../controllers/teamController";

const router: IRouter = Router();

router.post("/send-login-otp", sendLoginOtp);
router.post("/verify-login", verifyLogin);
router.post("/send-player-register-otp", sendPlayerRegisterOtp);
router.post("/verify-player-register", verifyPlayerRegister);

router.get("/me", requireAuth, getMe);
router.patch("/me", requireAuth, updateMe);
router.get("/me/teams", requireAuth, getMyTeams);

export default router;
