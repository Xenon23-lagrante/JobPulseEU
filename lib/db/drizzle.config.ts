import { defineConfig } from "drizzle-kit";
import path from "path";

const cfg: any = {
  schema: path.join(__dirname, "./src/schema/index.ts"),
  dialect: "postgresql",
};

if (process.env.DATABASE_URL) {
  cfg.dbCredentials = { url: process.env.DATABASE_URL };
}

export default defineConfig(cfg as any);
