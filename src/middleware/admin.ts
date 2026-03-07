import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env";

export interface AdminJwtPayload {
  id: string;
  email: string;
  role: "admin";
}

export interface AdminRequest extends Request {
  admin?: AdminJwtPayload;
}

export function requireAdmin(req: AdminRequest, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (token) {
    try {
      const decoded = jwt.verify(token, env.jwtSecret) as AdminJwtPayload;
      if (decoded.role === "admin") {
        req.admin = decoded;
        next();
        return;
      }
    } catch {
      // fall through to key check or 403
    }
  }
  const key = req.headers["x-admin-key"];
  if (env.adminSecret && env.adminSecret === key) {
    next();
    return;
  }
  res.status(403).json({ error: "Admin access required" });
}
