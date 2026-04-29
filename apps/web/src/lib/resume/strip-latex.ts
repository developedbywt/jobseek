export function stripLatexCommands(source: string): string {
  return source
    .replace(/%[^\n]*/g, " ")
    .replace(/\\(begin|end)\{[^}]*\}/g, " ")
    .replace(/\\[a-zA-Z]+\*?\{([^}]*)\}/g, " $1 ")
    .replace(/\\[a-zA-Z]+\*?/g, " ")
    .replace(/[{}]/g, " ")
    .replace(/[&~^_$\\]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
