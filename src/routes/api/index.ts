import { Router, type IRouter } from "express";
import usersRouter from "./users";
import leaguesRouter from "./leagues";

const router: IRouter = Router();

router.use("/users", usersRouter);
router.use("/leagues", leaguesRouter);

export default router;
