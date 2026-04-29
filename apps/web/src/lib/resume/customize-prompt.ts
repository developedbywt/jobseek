export type CustomizeChange = {
  original: string;
  replacement: string;
  keyword_added: string;
  rationale: string;
};

export type CustomizeResult = {
  changes: CustomizeChange[];
  customized_latex: string;
};

export function buildCustomizePrompt(params: {
  title: string;
  company: string;
  jdText: string;
  missingKeywords: string[];
  matchedKeywords: string[];
  latexSource: string;
}): { system: string; user: string } {
  const system = `You are a resume editor. Given a LaTeX resume source, a list of missing keywords from a job description, and the job description itself, make targeted edits to the resume to naturally incorporate missing keywords.

Rules:
1. Only edit work experience bullet points — never touch contact info, education, skills section structure, LaTeX preamble, or column/spacing definitions.
2. Focus edits on the most recent experience entry first, then earlier entries if needed.
3. Never fabricate experience. Only substitute within compatible technology ecosystems:
   - JVM: Java ↔ Kotlin ↔ Scala (context-dependent)
   - Scripting/backend: Python ↔ TypeScript (only for scripting/tooling contexts, not web frameworks)
   - Container orchestration: Docker ↔ Kubernetes (only if candidate already has containerization)
   - Message queues: mention Kafka if the candidate has any event-driven or async experience
   Do NOT pair incompatible stacks (e.g., Python + Spring Boot, PHP + Go microservices).
4. Preserve all LaTeX formatting exactly: alignment environments, column widths, spacing commands, custom macros. The document must remain compilable and one page.
5. Make the minimum changes needed. Do not rewrite bullets that don't need changing.
6. Return a JSON object with exactly two fields:
   - "changes": array of {original, replacement, keyword_added, rationale}
   - "customized_latex": the full modified .tex source as a string`;

  const user = `Missing keywords: [${params.missingKeywords.join(", ")}]
Matched keywords: [${params.matchedKeywords.join(", ")}]

Job: ${params.title} at ${params.company}

Job description:
${params.jdText}

Resume LaTeX:
${params.latexSource}`;

  return { system, user };
}

export function parseCustomizeResponse(raw: string): CustomizeResult | null {
  const jsonMatch =
    raw.match(/```(?:json)?\s*([\s\S]*?)```/) ?? raw.match(/(\{[\s\S]*\})/);
  if (!jsonMatch) return null;

  try {
    const parsed = JSON.parse(jsonMatch[1] ?? jsonMatch[0]) as unknown;
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      !Array.isArray((parsed as Record<string, unknown>).changes) ||
      typeof (parsed as Record<string, unknown>).customized_latex !== "string"
    ) {
      return null;
    }
    return parsed as CustomizeResult;
  } catch {
    return null;
  }
}
