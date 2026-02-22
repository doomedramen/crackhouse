import { Hono } from "hono";
import { auth } from "@/lib/auth";

const authRoutes = new Hono();

// Mount Better Auth handler with the recommended pattern from documentation
authRoutes.on(["POST", "GET"], "/*", (c) => {
  return auth.handler(c.req.raw);
});

export { authRoutes };
