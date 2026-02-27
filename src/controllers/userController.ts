import { getUser } from "../services/userService";
import type { Request, Response } from "express";

export async function getUsers(_req: Request, res: Response): Promise<void> {
  const users = await getUser();
  res.json(users);
}
