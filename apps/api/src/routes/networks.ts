import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { db } from "@/db";
import { networks as networksSchema, selectNetworkSchema } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { authenticate, getUserId } from "@/middleware/auth";
import { logger } from "@/lib/logger";

const networksRouter = new Hono();

// Apply authentication middleware to all routes
networksRouter.use("*", authenticate);

// Get all networks
networksRouter.get("/", async (c) => {
  try {
    const userId = getUserId(c);
    const allNetworks = await db.query.networks.findMany({
      where: eq(networksSchema.userId, userId),
      orderBy: [desc(networksSchema.createdAt)],
    });

    return c.json({
      success: true,
      data: allNetworks,
      count: allNetworks.length,
    });
  } catch (error) {
    logger.error(
      "Get networks error",
      "networks",
      error instanceof Error ? error : new Error(String(error)),
    );
    return c.json(
      {
        success: false,
        error: "Failed to fetch networks",
      },
      500,
    );
  }
});

// Get single network by ID
networksRouter.get("/:id", async (c) => {
  const id = c.req.param("id");

  try {
    const network = await db.query.networks.findFirst({
      where: eq(networksSchema.id, id),
    });

    if (!network) {
      return c.json(
        {
          success: false,
          error: "Network not found",
        },
        404,
      );
    }

    return c.json({
      success: true,
      data: network,
    });
  } catch (error) {
    logger.error(
      "Get network error",
      "networks",
      error instanceof Error ? error : new Error(String(error)),
    );
    return c.json(
      {
        success: false,
        error: "Failed to fetch network",
      },
      500,
    );
  }
});

// Create new network
networksRouter.post(
  "/",
  zValidator(
    "json",
    z.object({
      ssid: z.string().optional(),
      bssid: z.string().min(1),
      encryption: z.string().min(1),
      channel: z.number().optional(),
      frequency: z.number().optional(),
      signalStrength: z.number().optional(),
      location: z.string().optional(),
      notes: z.string().optional(),
      captureDate: z.string().datetime().optional(),
    }),
  ),
  async (c) => {
    const data = c.req.valid("json");

    try {
      const userId = getUserId(c);

      const [newNetwork] = await db
        .insert(networksSchema)
        .values({
          ...data,
          userId,
          captureDate: data.captureDate
            ? new Date(data.captureDate)
            : new Date(),
        })
        .returning();

      return c.json(
        {
          success: true,
          data: newNetwork,
        },
        201,
      );
    } catch (error) {
      logger.error(
        "Create network error",
        "networks",
        error instanceof Error ? error : new Error(String(error)),
      );
      return c.json(
        {
          success: false,
          error: "Failed to create network",
        },
        500,
      );
    }
  },
);

// Update network
networksRouter.put(
  "/:id",
  zValidator(
    "json",
    z.object({
      ssid: z.string().optional(),
      encryption: z.string().optional(),
      channel: z.number().optional(),
      frequency: z.number().optional(),
      signalStrength: z.number().optional(),
      location: z.string().optional(),
      notes: z.string().optional(),
      status: z.enum(["ready", "processing", "failed"]).optional(),
    }),
  ),
  async (c) => {
    const id = c.req.param("id");
    const data = c.req.valid("json");

    try {
      const [updatedNetwork] = await db
        .update(networksSchema)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(networksSchema.id, id))
        .returning();

      if (!updatedNetwork) {
        return c.json(
          {
            success: false,
            error: "Network not found",
          },
          404,
        );
      }

      return c.json({
        success: true,
        data: updatedNetwork,
      });
    } catch (error) {
      logger.error(
        "Update network error",
        "networks",
        error instanceof Error ? error : new Error(String(error)),
      );
      return c.json(
        {
          success: false,
          error: "Failed to update network",
        },
        500,
      );
    }
  },
);

// Delete network
networksRouter.delete("/:id", async (c) => {
  const id = c.req.param("id");

  try {
    const [deletedNetwork] = await db
      .delete(networksSchema)
      .where(eq(networksSchema.id, id))
      .returning();

    if (!deletedNetwork) {
      return c.json(
        {
          success: false,
          error: "Network not found",
        },
        404,
      );
    }

    return c.json({
      success: true,
      message: "Network deleted successfully",
    });
  } catch (error) {
    logger.error(
      "Delete network error",
      "networks",
      error instanceof Error ? error : new Error(String(error)),
    );
    return c.json(
      {
        success: false,
        error: "Failed to delete network",
      },
      500,
    );
  }
});

export { networksRouter as networksRoutes };
