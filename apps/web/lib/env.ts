import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  server: {
    // Server-side only env vars (if any)
  },
  client: {
    // Client-side env vars (must be prefixed with NEXT_PUBLIC_)
    NEXT_PUBLIC_API_URL: z.string().url().optional(),
    NEXT_PUBLIC_WS_URL: z.string().optional(),
    NEXT_PUBLIC_FRONTEND_URL: z.string().url().optional(),
  },
  runtimeEnv: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
    NEXT_PUBLIC_WS_URL: process.env.NEXT_PUBLIC_WS_URL,
    NEXT_PUBLIC_FRONTEND_URL: process.env.NEXT_PUBLIC_FRONTEND_URL,
  },
  /**
   * Run validation on the client and server
   */
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
});

// Export typed env vars
export const {
  NEXT_PUBLIC_API_URL,
  NEXT_PUBLIC_WS_URL,
  NEXT_PUBLIC_FRONTEND_URL,
} = env;
