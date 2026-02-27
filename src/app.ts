import express from "express";
import cors from "cors";
import morgan from "morgan";
import { errorHandler } from "./middleware/errorHandler";
import healthRouter from "./routes/health";
import apiRouter from "./routes/api";
import { env } from "./config/env";

export function createApp(): express.Application {
  const app = express();

  app.use(cors({ origin: env.frontendUrl }));
  app.use(express.json({ limit: "50mb" }));
  app.use(morgan(env.nodeEnv === "development" ? "dev" : "combined"));

  app.use("/health", healthRouter);
  app.use("/api", apiRouter);

  app.use(errorHandler);

  return app;
}
