import "dotenv/config";
import { createApp } from "./app";
import { env } from "./config/env";
import { connectDb } from "./config/db";

async function start(): Promise<void> {
  await connectDb();
  const app = createApp();
  app.listen(env.port, () => {
    console.log(`Server listening on port ${env.port}`);
    const { user, host, port } = env.smtp;
    if (user) {
      console.log(`SMTP configured: ${user} @ ${host}:${port}`);
    } else {
      console.warn("SMTP not configured (SMTP_USER empty). OTP emails will fail.");
    }
  });
}

start().catch((err) => {
  console.error("Start error:", err);
  process.exit(1);
});
