import { Router, type IRouter, type Request, type Response } from "express";

const router: IRouter = Router();

router.get("/", (_req: Request, res: Response) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

export default router;
