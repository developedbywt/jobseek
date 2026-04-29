"use server";

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { userResume } from "@/db/schema";
import { getSessionUserId } from "@/lib/sessionCache";
import { extractKeywords } from "@/lib/resume/extract-keywords";
import { stripLatexCommands } from "@/lib/resume/strip-latex";

export type ResumeInfo = {
  filename: string;
  keywords: string[];
  updatedAt: string;
  hasLatexSource: boolean;
};

export async function uploadResume(params: {
  filename: string;
  content: string;
  latexSource?: string;
}): Promise<ResumeInfo> {
  const userId = await getSessionUserId();
  if (!userId) throw new Error("Not authenticated");

  const { filename, content, latexSource } = params;

  const textForKeywords = latexSource ? stripLatexCommands(latexSource) : content;
  const keywords = await extractKeywords(textForKeywords);

  const [result] = await db
    .insert(userResume)
    .values({
      userId,
      filename,
      keywords,
      latexSource: latexSource ?? null,
    })
    .onConflictDoUpdate({
      target: userResume.userId,
      set: {
        filename,
        keywords,
        latexSource: latexSource ?? null,
        updatedAt: new Date(),
      },
    })
    .returning();

  return {
    filename: result.filename,
    keywords: result.keywords,
    updatedAt: result.updatedAt.toISOString(),
    hasLatexSource: result.latexSource !== null,
  };
}

export async function getResume(): Promise<ResumeInfo | null> {
  const userId = await getSessionUserId();
  if (!userId) return null;

  const [resume] = await db
    .select()
    .from(userResume)
    .where(eq(userResume.userId, userId))
    .limit(1);

  if (!resume) return null;

  return {
    filename: resume.filename,
    keywords: resume.keywords,
    updatedAt: resume.updatedAt.toISOString(),
    hasLatexSource: resume.latexSource !== null,
  };
}

export async function deleteResume(): Promise<void> {
  const userId = await getSessionUserId();
  if (!userId) throw new Error("Not authenticated");

  await db.delete(userResume).where(eq(userResume.userId, userId));
}
