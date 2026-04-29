"use server";

import { eq, and } from "drizzle-orm";
import { PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { db } from "@/db";
import { jobQueue, userResume, jobPosting, company } from "@/db/schema";
import { getSessionUserId } from "@/lib/sessionCache";
import { getR2Client, getR2Bucket } from "@/lib/r2";
import {
  buildCustomizePrompt,
  parseCustomizeResponse,
} from "@/lib/resume/customize-prompt";

export type { CustomizeChange, CustomizeResult } from "@/lib/resume/customize-prompt";
export { buildCustomizePrompt, parseCustomizeResponse };

// ── LLM call (Anthropic primary, GPT-4o fallback) ──────────────────

async function callLlm(system: string, user: string): Promise<string> {
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (anthropicKey) {
    try {
      const resp = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": anthropicKey,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-6",
          max_tokens: 4096,
          system,
          messages: [{ role: "user", content: user }],
        }),
      });

      if (resp.ok) {
        const data = (await resp.json()) as {
          content?: { type: string; text: string }[];
        };
        const text = data.content?.find((b) => b.type === "text")?.text ?? "";
        if (text) return text;
      }
    } catch {
      // fall through to GPT-4o
    }
  }

  const openaiKey = process.env.OPENAI_API_KEY;
  if (!openaiKey)
    throw new Error(
      "No LLM API key configured (ANTHROPIC_API_KEY or OPENAI_API_KEY)",
    );

  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${openaiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o",
      max_tokens: 4096,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });

  if (!resp.ok) throw new Error(`GPT-4o request failed: ${resp.status}`);

  const data = (await resp.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  return data.choices?.[0]?.message?.content ?? "";
}

// ── Server actions ───────────────────────────────────────────────────

export async function customizeResume(
  jobQueueId: string,
): Promise<{ success: boolean; r2Key?: string; error?: string }> {
  const userId = await getSessionUserId();
  if (!userId) throw new Error("Not authenticated");

  const [resume] = await db
    .select({ latexSource: userResume.latexSource })
    .from(userResume)
    .where(eq(userResume.userId, userId))
    .limit(1);

  if (!resume?.latexSource) {
    return {
      success: false,
      error: "No LaTeX resume uploaded. Upload a .tex file in Settings.",
    };
  }

  const [item] = await db
    .select({
      postingId: jobQueue.postingId,
      missingKeywords: jobQueue.missingKeywords,
      matchedKeywords: jobQueue.matchedKeywords,
      title: jobPosting.titles,
      companyName: company.name,
      descriptionR2Hash: jobPosting.descriptionR2Hash,
    })
    .from(jobQueue)
    .innerJoin(jobPosting, eq(jobQueue.postingId, jobPosting.id))
    .innerJoin(company, eq(jobPosting.companyId, company.id))
    .where(and(eq(jobQueue.id, jobQueueId), eq(jobQueue.userId, userId)))
    .limit(1);

  if (!item) return { success: false, error: "Queue item not found." };

  let jdText = "";
  const r2Base = process.env.R2_PUBLIC_URL ?? "";
  if (item.descriptionR2Hash && r2Base) {
    try {
      const r = await fetch(`${r2Base}/${item.descriptionR2Hash}.html`);
      if (r.ok) {
        const html = await r.text();
        jdText = html
          .replace(/<[^>]+>/g, " ")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 6000);
      }
    } catch {
      // proceed with empty jdText
    }
  }

  const title = (item.title as string[] | null)?.[0] ?? "Unknown role";
  const { system, user } = buildCustomizePrompt({
    title,
    company: item.companyName,
    jdText,
    missingKeywords: item.missingKeywords ?? [],
    matchedKeywords: item.matchedKeywords ?? [],
    latexSource: resume.latexSource,
  });

  let rawResponse: string;
  try {
    rawResponse = await callLlm(system, user);
  } catch (err) {
    return { success: false, error: String(err) };
  }

  const result = parseCustomizeResponse(rawResponse);
  if (!result) {
    return {
      success: false,
      error: "LLM returned an unexpected format. Please try again.",
    };
  }

  const r2Key = `resumes/${userId}/${item.postingId}.tex`;
  await getR2Client().send(
    new PutObjectCommand({
      Bucket: getR2Bucket(),
      Key: r2Key,
      Body: result.customized_latex,
      ContentType: "text/x-tex",
    }),
  );

  await db
    .update(jobQueue)
    .set({ customizedR2Key: r2Key, customizedAt: new Date() })
    .where(eq(jobQueue.id, jobQueueId));

  return { success: true, r2Key };
}

export async function removeCustomizedResume(jobQueueId: string): Promise<void> {
  const userId = await getSessionUserId();
  if (!userId) throw new Error("Not authenticated");

  const [item] = await db
    .select({ customizedR2Key: jobQueue.customizedR2Key })
    .from(jobQueue)
    .where(and(eq(jobQueue.id, jobQueueId), eq(jobQueue.userId, userId)))
    .limit(1);

  if (!item?.customizedR2Key) return;

  try {
    await getR2Client().send(
      new DeleteObjectCommand({
        Bucket: getR2Bucket(),
        Key: item.customizedR2Key,
      }),
    );
  } catch {
    // best-effort — clear DB reference regardless
  }

  await db
    .update(jobQueue)
    .set({ customizedR2Key: null, customizedAt: null })
    .where(eq(jobQueue.id, jobQueueId));
}

export async function getCustomizedResumeUrl(
  jobQueueId: string,
): Promise<string | null> {
  const userId = await getSessionUserId();
  if (!userId) return null;

  const [item] = await db
    .select({ customizedR2Key: jobQueue.customizedR2Key })
    .from(jobQueue)
    .where(and(eq(jobQueue.id, jobQueueId), eq(jobQueue.userId, userId)))
    .limit(1);

  if (!item?.customizedR2Key) return null;

  return `/api/resumes/${jobQueueId}`;
}
