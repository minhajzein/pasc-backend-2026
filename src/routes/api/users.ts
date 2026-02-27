import { Router, type IRouter } from "express";
import { getUsers } from "../../controllers/userController";

const router: IRouter = Router();

router.get("/", getUsers);

export default router;
