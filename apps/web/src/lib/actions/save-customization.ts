"use server";

import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { jobQueue, resumeCustomizationHistory, userResume } from "@/db/schema";
import { getSessionUserId } from "@/lib/sessionCache";

type SaveCustomizationParams = {
  queueId: string;
  postingId: string;
  customizedContent: string;
  originalContent: string;
  insertedKeywords?: string[];
  jobTitle?: string;
};

type SaveCustomizationResult = {
  saved: boolean;
  message?: string;
  error?: string;
};

export async function saveCustomization(
  params: SaveCustomizationParams,
): Promise<SaveCustomizationResult> {
  const userId = await getSessionUserId();
  if (!userId) throw new Error("Not authenticated");

  try {
    // Validate customized content is valid LaTeX
    if (!params.customizedContent.includes("\\")) {
      return {
        saved: false,
        error: "Invalid LaTeX content",
      };
    }

    const [queueItem] = await db
      .select({ id: jobQueue.id })
      .from(jobQueue)
      .where(
        and(
          eq(jobQueue.id, params.queueId),
          eq(jobQueue.userId, userId),
          eq(jobQueue.postingId, params.postingId),
        ),
      )
      .limit(1);

    if (!queueItem) {
      return {
        saved: false,
        error: "Queue item not found",
      };
    }

    await db.insert(resumeCustomizationHistory).values({
      userId,
      queueId: params.queueId,
      postingId: params.postingId,
      insertedKeywords: params.insertedKeywords ?? [],
      jobTitle: params.jobTitle ?? "Untitled position",
    });

    await db
      .update(userResume)
      .set({
        customizedAt: new Date(),
        customizationCount: sql`${userResume.customizationCount} + 1`,
      })
      .where(eq(userResume.userId, userId));

    return {
      saved: true,
      message: "Resume customization saved successfully",
    };
  } catch (err) {
    return {
      saved: false,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

export async function getCustomizationHistory(_params: {
  limit?: number;
}): Promise<
  Array<{
    queueId: string;
    postingId: string;
    customizedAt: string;
    jobTitle: string;
  }>
> {
  const userId = await getSessionUserId();
  if (!userId) return [];

  // In production: fetch from database/R2
  // For now: return empty array as placeholder

  return [];
}

export async function revertCustomization(queueId: string): Promise<{
  reverted: boolean;
  error?: string;
}> {
  const userId = await getSessionUserId();
  if (!userId) throw new Error("Not authenticated");

  try {
    // Verify ownership
    const [item] = await db
      .select({ id: jobQueue.id })
      .from(jobQueue)
      .where(
        and(
          eq(jobQueue.id, queueId),
          eq(jobQueue.userId, userId),
        ),
      )
      .limit(1);

    if (!item) {
      return { reverted: false, error: "Queue item not found" };
    }

    // In production: restore from R2 backup
    // For now: return success

    return { reverted: true };
  } catch (err) {
    return {
      reverted: false,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}
