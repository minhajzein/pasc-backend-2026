import { Router, type IRouter } from "express";
import { listPlayers } from "../../controllers/playerController";

const router: IRouter = Router();

router.get("/", listPlayers);

export default router;
