import type { Request, Response } from "express";

export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: () => void
): void {
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
}
