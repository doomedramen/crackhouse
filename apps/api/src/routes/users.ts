import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { db } from "@/db";
import {
  users as usersTable,
  accounts as accountsTable,
  selectUserSchema,
} from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import {
  authenticate,
  requireAdmin,
  requireSuperuser,
  getUserId,
  isAdmin,
  isSuperuser,
} from "@/middleware/auth";
import { logger } from "@/lib/logger";
import crypto from "crypto";

const usersRouter = new Hono();

// Apply authentication middleware to all routes
usersRouter.use("*", authenticate);

// Validation schemas
const createUserSchema = z.object({
  email: z.string().email("Invalid email address"),
  name: z.string().min(1).max(255).optional(),
  password: z.string().min(8, "Password must be at least 8 characters"),
  role: z.enum(["user", "admin", "superuser"]).default("user"),
});

const updateUserSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  email: z.string().email("Invalid email address").optional(),
  role: z.enum(["user", "admin", "superuser"]).optional(),
  emailVerified: z.boolean().optional(),
});

// GET /api/users - Get all users (admin only)
usersRouter.get("/", requireAdmin, async (c) => {
  try {
    const allUsers = await db
      .select({
        // Don't return sensitive fields
        id: usersTable.id,
        email: usersTable.email,
        name: usersTable.name,
        role: usersTable.role,
        emailVerified: usersTable.emailVerified,
        image: usersTable.image,
        createdAt: usersTable.createdAt,
        updatedAt: usersTable.updatedAt,
      })
      .from(usersTable);

    logger.info("Users list fetched", "users", {
      requesterId: getUserId(c),
      count: allUsers.length,
    });

    return c.json({
      success: true,
      data: allUsers,
      count: allUsers.length,
    });
  } catch (error) {
    logger.error(
      "Get users error",
      "users",
      error instanceof Error ? error : new Error(String(error)),
    );
    return c.json(
      {
        success: false,
        error: "Failed to fetch users",
      },
      500,
    );
  }
});

// GET /api/users/:id - Get single user by ID
usersRouter.get("/:id", async (c) => {
  const id = c.req.param("id");
  const requesterId = getUserId(c);

  try {
    const user = await db
      .select({
        id: usersTable.id,
        email: usersTable.email,
        name: usersTable.name,
        role: usersTable.role,
        emailVerified: usersTable.emailVerified,
        image: usersTable.image,
        createdAt: usersTable.createdAt,
        updatedAt: usersTable.updatedAt,
      })
      .from(usersTable)
      .where(eq(usersTable.id, id))
      .limit(1);

    if (!user || user.length === 0) {
      return c.json(
        {
          success: false,
          error: "User not found",
        },
        404,
      );
    }

    // Users can only view their own profile unless they're admin/superuser
    if (id !== requesterId && !isAdmin(c)) {
      return c.json(
        {
          success: false,
          error: "Access denied",
        },
        403,
      );
    }

    logger.info("User fetched", "users", {
      requesterId,
      targetUserId: id,
    });

    return c.json({
      success: true,
      data: user[0],
    });
  } catch (error) {
    logger.error(
      "Get user error",
      "users",
      error instanceof Error ? error : new Error(String(error)),
      {
        userId: id,
      },
    );
    return c.json(
      {
        success: false,
        error: "Failed to fetch user",
      },
      500,
    );
  }
});

// POST /api/users - Create new user (admin/superuser only)
usersRouter.post(
  "/",
  requireAdmin,
  zValidator("json", createUserSchema),
  async (c) => {
    try {
      const requesterId = getUserId(c);
      const { email, name, password, role } = c.req.valid("json");

      // Only superusers can create other superusers
      if (role === "superuser" && !isSuperuser(c)) {
        return c.json(
          {
            success: false,
            error: "Only superusers can create superuser accounts",
          },
          403,
        );
      }

      // Check if user with this email already exists
      const existingUser = await db.query.users.findFirst({
        where: eq(usersTable.email, email),
      });

      if (existingUser) {
        return c.json(
          {
            success: false,
            error: "User with this email already exists",
          },
          409,
        );
      }

      // Hash password
      const bcrypt = await import("bcryptjs");
      const hashedPassword = await bcrypt.hash(password, 10);

      const userId = crypto.randomUUID();

      // Insert user record
      const [newUser] = await db
        .insert(usersTable)
        .values({
          id: userId,
          email,
          name: name || email.split("@")[0],
          role,
          emailVerified: true, // Auto-verify admin-created users
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning();

      // Insert account record for password authentication
      await db.insert(accountsTable).values({
        id: crypto.randomUUID(),
        userId: userId,
        accountId: userId,
        providerId: "credential",
        provider: "credential",
        password: hashedPassword,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      logger.info("User created", "users", {
        requesterId,
        newUserId: userId,
        email,
        role,
      });

      return c.json({
        success: true,
        message: "User created successfully",
        data: {
          id: newUser.id,
          email: newUser.email,
          name: newUser.name,
          role: newUser.role,
          emailVerified: newUser.emailVerified,
          createdAt: newUser.createdAt,
        },
      });
    } catch (error) {
      logger.error(
        "Create user error",
        "users",
        error instanceof Error ? error : new Error(String(error)),
      );
      return c.json(
        {
          success: false,
          error: "Failed to create user",
        },
        500,
      );
    }
  },
);

// PATCH /api/users/:id - Update user (admin for all fields, users for own basic fields)
usersRouter.patch("/:id", zValidator("json", updateUserSchema), async (c) => {
  const id = c.req.param("id");
  const requesterId = getUserId(c);
  const updates = c.req.valid("json");

  try {
    // Check if user exists
    const existingUser = await db.query.users.findFirst({
      where: eq(usersTable.id, id),
    });

    if (!existingUser) {
      return c.json(
        {
          success: false,
          error: "User not found",
        },
        404,
      );
    }

    const isSelf = id === requesterId;
    const hasAdminAccess = isAdmin(c);

    // Users can only update their own name
    // Admins can update any field except role (superuser required)
    // Superusers can update anything
    if (!isSelf && !hasAdminAccess) {
      return c.json(
        {
          success: false,
          error: "Access denied",
        },
        403,
      );
    }

    // If updating role, require admin
    if (updates.role && !hasAdminAccess) {
      return c.json(
        {
          success: false,
          error: "Only administrators can change user roles",
        },
        403,
      );
    }

    // If updating role to/from superuser, require superuser
    if (
      updates.role &&
      (updates.role === "superuser" || existingUser.role === "superuser") &&
      !isSuperuser(c)
    ) {
      return c.json(
        {
          success: false,
          error: "Only superusers can modify superuser accounts",
        },
        403,
      );
    }

    // Users can only update their name if updating themselves
    if (isSelf && !hasAdminAccess) {
      const allowedFields = ["name"];
      const attemptedFields = Object.keys(updates);
      const invalidFields = attemptedFields.filter(
        (f) => !allowedFields.includes(f),
      );

      if (invalidFields.length > 0) {
        return c.json(
          {
            success: false,
            error: `You can only update your name. Invalid fields: ${invalidFields.join(", ")}`,
          },
          403,
        );
      }
    }

    // Update user
    const [updatedUser] = await db
      .update(usersTable)
      .set({
        ...updates,
        updatedAt: new Date(),
      })
      .where(eq(usersTable.id, id))
      .returning();

    logger.info("User updated", "users", {
      requesterId,
      targetUserId: id,
      updates: Object.keys(updates),
    });

    return c.json({
      success: true,
      message: "User updated successfully",
      data: {
        id: updatedUser.id,
        email: updatedUser.email,
        name: updatedUser.name,
        role: updatedUser.role,
        emailVerified: updatedUser.emailVerified,
        updatedAt: updatedUser.updatedAt,
      },
    });
  } catch (error) {
    logger.error(
      "Update user error",
      "users",
      error instanceof Error ? error : new Error(String(error)),
      {
        userId: id,
      },
    );
    return c.json(
      {
        success: false,
        error: "Failed to update user",
      },
      500,
    );
  }
});

// DELETE /api/users/:id - Delete user (superuser only, with last superuser protection)
usersRouter.delete("/:id", requireSuperuser, async (c) => {
  const id = c.req.param("id");
  const requesterId = getUserId(c);

  try {
    // Check if user exists
    const userToDelete = await db.query.users.findFirst({
      where: eq(usersTable.id, id),
    });

    if (!userToDelete) {
      return c.json(
        {
          success: false,
          error: "User not found",
        },
        404,
      );
    }

    // Prevent deleting self
    if (id === requesterId) {
      return c.json(
        {
          success: false,
          error: "You cannot delete your own account",
        },
        400,
      );
    }

    // If deleting a superuser, check if they're the last one
    if (userToDelete.role === "superuser") {
      const [{ count }] = await db
        .select({ count: sql<number>`count(*)` })
        .from(usersTable)
        .where(eq(usersTable.role, "superuser"));

      if (count <= 1) {
        return c.json(
          {
            success: false,
            error: "Cannot delete the last superuser account",
          },
          400,
        );
      }
    }

    // Delete user (cascade will delete associated records)
    await db.delete(usersTable).where(eq(usersTable.id, id));

    logger.info("User deleted", "users", {
      requesterId,
      deletedUserId: id,
      deletedUserEmail: userToDelete.email,
      deletedUserRole: userToDelete.role,
    });

    return c.json({
      success: true,
      message: "User deleted successfully",
    });
  } catch (error) {
    logger.error(
      "Delete user error",
      "users",
      error instanceof Error ? error : new Error(String(error)),
      {
        userId: id,
      },
    );
    return c.json(
      {
        success: false,
        error: "Failed to delete user",
      },
      500,
    );
  }
});

export { usersRouter as usersRoutes };
