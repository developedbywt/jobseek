import { describe, it, expect } from "vitest";
import { buildCustomizePrompt, parseCustomizeResponse } from "@/lib/resume/customize-prompt";

describe("buildCustomizePrompt", () => {
  it("includes missing keywords in user message", () => {
    const prompt = buildCustomizePrompt({
      title: "Backend Engineer",
      company: "Stripe",
      jdText: "We use Kafka and gRPC extensively.",
      missingKeywords: ["Kafka", "gRPC"],
      matchedKeywords: ["Go", "PostgreSQL"],
      latexSource: "\\begin{document}\\item Built APIs with Go\\end{document}",
    });
    expect(prompt.user).toContain("Kafka");
    expect(prompt.user).toContain("gRPC");
    expect(prompt.user).toContain("Go");
    expect(prompt.user).toContain("PostgreSQL");
    expect(prompt.user).toContain("Backend Engineer");
    expect(prompt.user).toContain("Stripe");
  });

  it("includes latex source in user message", () => {
    const prompt = buildCustomizePrompt({
      title: "SWE",
      company: "Acme",
      jdText: "Java required",
      missingKeywords: ["Java"],
      matchedKeywords: [],
      latexSource: "\\item Developed systems",
    });
    expect(prompt.user).toContain("\\item Developed systems");
  });

  it("system prompt contains all required rules", () => {
    const prompt = buildCustomizePrompt({
      title: "SWE",
      company: "Acme",
      jdText: "Java required",
      missingKeywords: [],
      matchedKeywords: [],
      latexSource: "",
    });
    expect(prompt.system).toContain("work experience bullet points");
    expect(prompt.system).toContain("one page");
    expect(prompt.system).toContain("customized_latex");
    expect(prompt.system).toContain("changes");
  });
});

describe("parseCustomizeResponse", () => {
  it("parses valid JSON response", () => {
    const raw = `{"changes":[{"original":"Built APIs with Java","replacement":"Built APIs with Kotlin","keyword_added":"Kotlin","rationale":"Kotlin is JVM-compatible"}],"customized_latex":"\\\\item Built APIs with Kotlin"}`;
    const result = parseCustomizeResponse(raw);
    expect(result).not.toBeNull();
    expect(result!.changes).toHaveLength(1);
    expect(result!.changes[0].keyword_added).toBe("Kotlin");
    expect(result!.customized_latex).toContain("Kotlin");
  });

  it("extracts JSON from markdown code block", () => {
    const raw = "```json\n{\"changes\":[],\"customized_latex\":\"hello\"}\n```";
    const result = parseCustomizeResponse(raw);
    expect(result).not.toBeNull();
    expect(result!.customized_latex).toBe("hello");
  });

  it("returns null for invalid JSON", () => {
    expect(parseCustomizeResponse("not json at all")).toBeNull();
  });

  it("returns null if required fields missing", () => {
    expect(parseCustomizeResponse('{"changes":[]}')).toBeNull();
    expect(parseCustomizeResponse('{"customized_latex":""}')).toBeNull();
  });
});
