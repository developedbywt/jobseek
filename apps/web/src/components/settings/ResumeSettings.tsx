"use client";

import { useEffect, useState } from "react";
import { getResume, uploadResume, deleteResume } from "@/lib/actions/resume";
import type { ResumeInfo } from "@/lib/actions/resume";
import { Button } from "@/components/ui/Button";
import { Upload, Trash2 } from "lucide-react";

export function ResumeSettings() {
  const [resume, setResume] = useState<ResumeInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getResume()
      .then((r) => setResume(r))
      .catch((err) => console.error("Failed to load resume:", err))
      .finally(() => setLoading(false));
  }, []);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const isLatex = file.name.endsWith(".tex");
    const isPdf = file.type.includes("pdf");
    const isText = file.type.includes("text") || isLatex;

    if (!isPdf && !isText) {
      setError("Only PDF, plain text, or .tex files are supported.");
      return;
    }

    setError(null);
    setUploading(true);

    try {
      let content = "";
      let latexSource: string | undefined;

      if (isLatex) {
        latexSource = await file.text();
        content = latexSource;
      } else if (isText) {
        content = await file.text();
      } else {
        const buf = await file.arrayBuffer();
        const bytes = new Uint8Array(buf);
        const runs: string[] = [];
        let run = "";
        for (let i = 0; i < bytes.length; i++) {
          const c = bytes[i];
          if (c >= 32 && c < 127) {
            run += String.fromCharCode(c);
          } else {
            if (run.length >= 4) runs.push(run);
            run = "";
          }
        }
        if (run.length >= 4) runs.push(run);
        content = runs.join(" ");
      }

      const result = await uploadResume({ filename: file.name, content, latexSource });
      setResume(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to upload resume");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  async function handleDelete() {
    if (!resume) return;
    if (!confirm("Are you sure you want to delete your resume?")) return;

    try {
      await deleteResume();
      setResume(null);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete resume");
    }
  }

  if (loading) {
    return <div className="text-muted text-sm">Loading resume...</div>;
  }

  return (
    <div className="rounded-lg border border-border bg-card p-6 space-y-4">
      <div>
        <h3 className="font-semibold mb-2">Resume for Job Fit Analysis</h3>
        <p className="text-sm text-muted">
          Upload your resume to enable job fit analysis and AI-powered customization. Upload a{" "}
          <code className="text-xs">.tex</code> file to unlock resume generation.
        </p>
      </div>

      {error && (
        <div className="rounded p-3 bg-error-bg text-error text-sm">
          {error}
        </div>
      )}

      {resume ? (
        <div className="space-y-3 bg-border-soft rounded p-4">
          <div>
            <p className="text-sm font-medium">Uploaded resume</p>
            <p className="text-sm text-muted">{resume.filename}</p>
            <p className="text-xs text-muted mt-1">
              {resume.keywords.length > 0
                ? `${resume.keywords.length} keywords extracted`
                : "Keywords pending extraction"}
              {resume.hasLatexSource && (
                <span className="ml-2 text-indigo-600 dark:text-indigo-400">· LaTeX source stored</span>
              )}
            </p>
          </div>
          <div className="flex gap-2">
            <label className="flex-1">
              <button
                className="w-full inline-flex items-center justify-center gap-2 rounded-full font-semibold px-5 py-2 bg-primary text-primary-contrast border border-primary hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-50"
                disabled={uploading}
              >
                <Upload className="h-4 w-4" />
                Replace
              </button>
              <input
                type="file"
                accept=".pdf,.txt,.tex,text/plain,application/pdf,application/x-tex"
                onChange={handleFileChange}
                disabled={uploading}
                className="hidden"
              />
            </label>
            <Button
              variant="danger-outline"
              size="sm"
              onClick={handleDelete}
              disabled={uploading}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      ) : (
        <label className="block">
          <div className="border-2 border-dashed border-border rounded-lg p-6 text-center hover:border-primary transition-colors cursor-pointer">
            <Upload className="h-8 w-8 mx-auto mb-2 text-muted" />
            <p className="text-sm font-medium mb-1">Upload your resume</p>
            <p className="text-xs text-muted">PDF, plain text, or <code>.tex</code> file</p>
          </div>
          <input
            type="file"
            accept=".pdf,.txt,.tex,text/plain,application/pdf,application/x-tex"
            onChange={handleFileChange}
            disabled={uploading}
            className="hidden"
          />
        </label>
      )}

      {uploading && (
        <div className="text-sm text-muted text-center py-2">
          Uploading and processing resume...
        </div>
      )}
    </div>
  );
}
