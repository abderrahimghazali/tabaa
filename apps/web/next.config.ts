import fs from "node:fs";
import path from "node:path";
import { PHASE_DEVELOPMENT_SERVER, PHASE_PRODUCTION_SERVER } from "next/constants";
import type { NextConfig } from "next";

// The shared .env lives at the monorepo root, not in apps/web. Existing variables win.
function loadRootEnv() {
  let dir = process.cwd();
  for (let i = 0; i < 5; i++) {
    if (fs.existsSync(path.join(dir, "pnpm-workspace.yaml"))) {
      const file = path.join(dir, ".env");
      if (fs.existsSync(file)) process.loadEnvFile(file);
      return;
    }
    dir = path.dirname(dir);
  }
}

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "X-Frame-Options", value: "DENY" },
  ...(process.env.NODE_ENV === "production"
    ? [{ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" }]
    : []),
];

export default function config(phase: string): NextConfig {
  loadRootEnv();
  if ((phase === PHASE_DEVELOPMENT_SERVER || phase === PHASE_PRODUCTION_SERVER) && !process.env.INTERNAL_API_TOKEN) {
    throw new Error("INTERNAL_API_TOKEN is not set. Add it to the root .env (it must match the API's value).");
  }
  return {
    cacheComponents: true,
    devIndicators: false,
    partialPrefetching: true,
    poweredByHeader: false,
    async headers() {
      return [{ source: "/:path*", headers: securityHeaders }];
    },
    turbopack: {
      rules: {
        "*.css": {
          loaders: ["@tailwindcss/turbopack"],
          as: "*.css",
        },
      },
    },
  };
}
