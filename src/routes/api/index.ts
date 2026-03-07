import { Router, type IRouter } from "express";
import usersRouter from "./users";
import leaguesRouter from "./leagues";
import authRouter from "./auth";
import adminRouter from "./admin";
import playersRouter from "./players";

const router: IRouter = Router();

router.use("/users", usersRouter);
router.use("/auth", authRouter);
router.use("/leagues", leaguesRouter);
router.use("/players", playersRouter);
router.use("/admin", adminRouter);

export default router;
