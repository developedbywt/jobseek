"use server";

import { eq, and, desc, count, sql, isNull } from "drizzle-orm";
import { db } from "@/db";
import { jobQueue, jobPosting, company, userResume } from "@/db/schema";
import { getSessionUserId } from "@/lib/sessionCache";
import { extractKeywords } from "@/lib/resume/extract-keywords";

export type QueueEntry = {
  id: string;
  addedAt: string;
  overlapScore: number | null;
  matchedKeywords: string[];
  missingKeywords: string[];
  fitExplanation: string | null;
  analyzedAt: string | null;
  posting: {
    id: string;
    title: string | null;
    sourceUrl: string;
  };
  company: {
    id: string;
    name: string;
    slug: string;
    icon: string | null;
  };
};

export async function addToQueue(
  jobPostingId: string,
): Promise<{ queued: boolean; queueId?: string }> {
  const userId = await getSessionUserId();
  if (!userId) throw new Error("Not authenticated");

  const [existing] = await db
    .select({ id: jobQueue.id })
    .from(jobQueue)
    .where(
      and(
        eq(jobQueue.userId, userId),
        eq(jobQueue.postingId, jobPostingId),
      ),
    )
    .limit(1);

  if (existing) {
    return { queued: true, queueId: existing.id };
  }

  const [row] = await db
    .insert(jobQueue)
    .values({ userId, postingId: jobPostingId })
    .returning({ id: jobQueue.id });

  return { queued: true, queueId: row.id };
}

export async function removeFromQueue(
  queueId: string,
): Promise<{ removed: boolean }> {
  const userId = await getSessionUserId();
  if (!userId) throw new Error("Not authenticated");

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

  if (!item) return { removed: false };

  await db.delete(jobQueue).where(eq(jobQueue.id, queueId));
  return { removed: true };
}

export async function checkQueueStatus(
  jobPostingId: string,
): Promise<{ queued: boolean; queueId?: string; analyzed: boolean }> {
  const userId = await getSessionUserId();
  if (!userId) return { queued: false, analyzed: false };

  const [item] = await db
    .select({
      id: jobQueue.id,
      analyzedAt: jobQueue.analyzedAt,
    })
    .from(jobQueue)
    .where(
      and(
        eq(jobQueue.userId, userId),
        eq(jobQueue.postingId, jobPostingId),
      ),
    )
    .limit(1);

  if (!item) return { queued: false, analyzed: false };

  return {
    queued: true,
    queueId: item.id,
    analyzed: item.analyzedAt !== null,
  };
}

export async function getQueueItems(params: {
  offset: number;
  limit: number;
}): Promise<{ items: QueueEntry[]; total: number }> {
  const userId = await getSessionUserId();
  if (!userId) return { items: [], total: 0 };

  const [totalRow] = await db
    .select({ count: count() })
    .from(jobQueue)
    .where(eq(jobQueue.userId, userId));

  const total = totalRow?.count ?? 0;
  if (total === 0) return { items: [], total: 0 };

  const rows = await db
    .select({
      id: jobQueue.id,
      addedAt: jobQueue.addedAt,
      overlapScore: jobQueue.overlapScore,
      matchedKeywords: jobQueue.matchedKeywords,
      missingKeywords: jobQueue.missingKeywords,
      fitExplanation: jobQueue.fitExplanation,
      analyzedAt: jobQueue.analyzedAt,
      postingId: jobPosting.id,
      postingTitle: sql<string | null>`${jobPosting.titles}[1]`,
      postingSourceUrl: jobPosting.sourceUrl,
      companyId: company.id,
      companyName: company.name,
      companySlug: company.slug,
      companyIcon: company.icon,
    })
    .from(jobQueue)
    .innerJoin(jobPosting, eq(jobQueue.postingId, jobPosting.id))
    .innerJoin(company, eq(jobPosting.companyId, company.id))
    .where(eq(jobQueue.userId, userId))
    .orderBy(desc(jobQueue.addedAt))
    .offset(params.offset)
    .limit(params.limit);

  const items: QueueEntry[] = rows.map((r) => ({
    id: r.id,
    addedAt: r.addedAt.toISOString(),
    overlapScore: r.overlapScore,
    matchedKeywords: r.matchedKeywords ?? [],
    missingKeywords: r.missingKeywords ?? [],
    fitExplanation: r.fitExplanation,
    analyzedAt: r.analyzedAt?.toISOString() ?? null,
    posting: {
      id: r.postingId,
      title: r.postingTitle,
      sourceUrl: r.postingSourceUrl,
    },
    company: {
      id: r.companyId,
      name: r.companyName,
      slug: r.companySlug,
      icon: r.companyIcon,
    },
  }));

  return { items, total };
}

export async function getQueueStatuses(): Promise<
  Array<{ postingId: string; queued: boolean; queueId?: string; analyzed: boolean }>
> {
  const userId = await getSessionUserId();
  if (!userId) return [];

  const items = await db
    .select({
      postingId: jobQueue.postingId,
      queueId: jobQueue.id,
      analyzedAt: jobQueue.analyzedAt,
    })
    .from(jobQueue)
    .where(eq(jobQueue.userId, userId));

  return items.map((item) => ({
    postingId: item.postingId,
    queued: true,
    queueId: item.queueId,
    analyzed: item.analyzedAt !== null,
  }));
}

export async function analyzeQueueItem(
  queueId: string,
  postingId: string,
): Promise<void> {
  const userId = await getSessionUserId();
  if (!userId) throw new Error("Not authenticated");

  // Get user's resume keywords
  const [resume] = await db
    .select({ keywords: userResume.keywords })
    .from(userResume)
    .where(eq(userResume.userId, userId))
    .limit(1);

  if (!resume || !resume.keywords || resume.keywords.length === 0) {
    throw new Error("Resume not uploaded or keywords not extracted");
  }

  // Get job posting titles
  const [posting] = await db
    .select({
      titles: jobPosting.titles,
    })
    .from(jobPosting)
    .where(eq(jobPosting.id, postingId))
    .limit(1);

  if (!posting || !posting.titles) {
    throw new Error("Job posting not found");
  }

  // Extract keywords from job titles (for now, without full description from R2)
  const jobTitleText = posting.titles.join(" ");
  const jobKeywords = await extractKeywords(jobTitleText);

  // Calculate overlap
  const resumeKeywordSet = new Set(resume.keywords.map((k) => k.toLowerCase()));
  const jobKeywordSet = new Set(jobKeywords.map((k) => k.toLowerCase()));

  const matched = jobKeywords.filter((k) =>
    resumeKeywordSet.has(k.toLowerCase()),
  );

  const missing = jobKeywords.filter(
    (k) => !resumeKeywordSet.has(k.toLowerCase()),
  );

  const overlapScore =
    jobKeywordSet.size > 0 ? matched.length / jobKeywordSet.size : 0;

  // Generate fit explanation
  const matchPercentage = Math.round(overlapScore * 100);
  let fitExplanation = `${matchPercentage}% skill overlap. `;
  if (matched.length > 0) {
    fitExplanation += `Matched: ${matched.slice(0, 3).join(", ")}${matched.length > 3 ? `, +${matched.length - 3} more` : ""}. `;
  }
  if (missing.length > 0) {
    fitExplanation += `Missing: ${missing.slice(0, 3).join(", ")}${missing.length > 3 ? `, +${missing.length - 3} more` : ""}.`;
  }

  // Update queue item
  await db
    .update(jobQueue)
    .set({
      overlapScore: overlapScore,
      matchedKeywords: matched,
      missingKeywords: missing,
      fitExplanation: fitExplanation,
      analyzedAt: new Date(),
    })
    .where(
      and(
        eq(jobQueue.id, queueId),
        eq(jobQueue.userId, userId),
      ),
    );
}

// Max queue IDs returned to avoid unbounded client payload
const GET_QUEUED_IDS_LIMIT = 500;

export async function getQueuedIds(): Promise<string[]> {
  const userId = await getSessionUserId();
  if (!userId) return [];

  try {
    const rows = await db
      .select({ postingId: jobQueue.postingId })
      .from(jobQueue)
      .where(eq(jobQueue.userId, userId))
      .limit(GET_QUEUED_IDS_LIMIT);
    return rows.map((r) => r.postingId);
  } catch {
    return [];
  }
}

async function callMinimaxFitAnalysis(params: {
  queueId: string;
  title: string;
  companyName: string;
  jdText: string;
  resumeKeywords: string[];
}): Promise<void> {
  type FitResult = {
    overlap_score: number;
    matched_keywords: string[];
    missing_keywords: string[];
    fit_explanation: string;
  };

  const apiKey = process.env.MINIMAX_API_KEY;
  if (!apiKey) return;

  try {
    const resp = await fetch("https://api.minimax.chat/v1/chat/completions", {
      method: "POST",
      signal: AbortSignal.timeout(20000),
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "abab6.5s-chat",
        messages: [
          {
            role: "system",
            content:
              'You are a job fit analyzer. Given a candidate\'s keyword list and a job description, return JSON with exactly these fields:\n{\n  "overlap_score": number,\n  "matched_keywords": string[],\n  "missing_keywords": string[],\n  "fit_explanation": string\n}\noverlap_score is 0-100. matched_keywords are JD requirements present in resume keywords. missing_keywords are important JD requirements absent from resume. fit_explanation is 2-3 sentences covering skill match, seniority fit, notable gap. Return ONLY the JSON object.',
          },
          {
            role: "user",
            content: `Resume keywords: ${JSON.stringify(params.resumeKeywords)}\n\nJob: ${params.title} at ${params.companyName}\n\n${params.jdText}`,
          },
        ],
        max_tokens: 400,
        temperature: 0.2,
      }),
    });

    if (!resp.ok) return;

    const data = (await resp.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const content = data.choices?.[0]?.message?.content?.trim() ?? "";
    const match = content.match(/\{[\s\S]*\}/);
    if (!match) return;

    const result = JSON.parse(match[0]) as FitResult;

    if (typeof result.overlap_score !== "number" || !isFinite(result.overlap_score)) {
      return;
    }

    await db
      .update(jobQueue)
      .set({
        overlapScore: result.overlap_score / 100,
        matchedKeywords: result.matched_keywords,
        missingKeywords: result.missing_keywords,
        fitExplanation: result.fit_explanation,
        analyzedAt: new Date(),
      })
      .where(eq(jobQueue.id, params.queueId));
  } catch {
    // Silently skip — job remains unanalyzed, user can retry
  }
}

// In-memory guard prevents duplicate concurrent analyzeQueue calls per user
// within the same server instance (protects against double-click / parallel tabs).
const analyzingUsers = new Set<string>();

export async function analyzeQueue(): Promise<{ started: boolean }> {
  const userId = await getSessionUserId();
  if (!userId) throw new Error("Not authenticated");

  if (analyzingUsers.has(userId)) return { started: false };

  analyzingUsers.add(userId);
  try {
    const [resume] = await db
      .select({ keywords: userResume.keywords })
      .from(userResume)
      .where(eq(userResume.userId, userId))
      .limit(1);

    if (!resume || resume.keywords.length === 0) {
      return { started: false };
    }

    const unanalyzed = await db
      .select({
        id: jobQueue.id,
        postingId: jobQueue.postingId,
        title: sql<string | null>`${jobPosting.titles}[1]`,
        companyName: company.name,
      })
      .from(jobQueue)
      .innerJoin(jobPosting, eq(jobQueue.postingId, jobPosting.id))
      .innerJoin(company, eq(jobPosting.companyId, company.id))
      .where(and(eq(jobQueue.userId, userId), isNull(jobQueue.analyzedAt)));

    if (unanalyzed.length === 0) return { started: false };

    const r2Base = (process.env.R2_DOMAIN_URL ?? "").replace(/\/$/, "");

    for (let i = 0; i < unanalyzed.length; i += 3) {
      const batch = unanalyzed.slice(i, i + 3);
      await Promise.all(
        batch.map(async (item) => {
          let jdText = "";
          if (r2Base) {
            try {
              const url = `${r2Base}/job/${item.postingId}/en/latest.html`;
              const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
              if (r.ok) {
                const html = await r.text();
                jdText = html
                  .replace(/<[^>]+>/g, " ")
                  .replace(/\s+/g, " ")
                  .trim()
                  .slice(0, 4000);
              }
            } catch {
              // proceed with empty JD text
            }
          }

          await callMinimaxFitAnalysis({
            queueId: item.id,
            title: item.title ?? "Unknown role",
            companyName: item.companyName,
            jdText,
            resumeKeywords: resume.keywords,
          });
        }),
      );
    }

    return { started: true };
  } finally {
    analyzingUsers.delete(userId);
  }
}
