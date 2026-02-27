// Shared types and interfaces for the API
import type { Request, Response } from "express";

export type AsyncRequestHandler = (
  req: Request,
  res: Response
) => Promise<void> | void;
