import { describe, it, expect } from "vitest";
import { stripLatexCommands } from "@/lib/resume/strip-latex";

describe("stripLatexCommands", () => {
  it("strips backslash commands", () => {
    const input = "\\textbf{Go} and \\textit{PostgreSQL}";
    expect(stripLatexCommands(input)).toContain("Go");
    expect(stripLatexCommands(input)).toContain("PostgreSQL");
    expect(stripLatexCommands(input)).not.toContain("\\textbf");
  });

  it("strips LaTeX environments", () => {
    const input = "\\begin{itemize}\n\\item Kubernetes\n\\end{itemize}";
    expect(stripLatexCommands(input)).toContain("Kubernetes");
    expect(stripLatexCommands(input)).not.toContain("\\begin");
    expect(stripLatexCommands(input)).not.toContain("\\item");
  });

  it("strips preamble commands", () => {
    const input = "\\documentclass{article}\n\\usepackage{hyperref}\nJavaScript";
    expect(stripLatexCommands(input)).toContain("JavaScript");
    expect(stripLatexCommands(input)).not.toContain("\\documentclass");
  });

  it("preserves plain text words", () => {
    const input = "Built distributed systems with Go and React";
    const result = stripLatexCommands(input);
    expect(result).toContain("distributed");
    expect(result).toContain("Go");
    expect(result).toContain("React");
  });

  it("strips braces and ampersands (tabular separators)", () => {
    const input = "Java & Kotlin & Scala";
    const result = stripLatexCommands(input);
    expect(result).toContain("Java");
    expect(result).toContain("Kotlin");
    expect(result).not.toContain("&");
  });

  it("returns empty string for empty input", () => {
    expect(stripLatexCommands("")).toBe("");
  });
});
