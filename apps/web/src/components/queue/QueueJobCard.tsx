"use client";

import { useState } from "react";
import type { QueueEntry } from "@/lib/actions/queue";
import {
  customizeResume,
  removeCustomizedResume,
  getCustomizedResumeUrl,
} from "@/lib/actions/customize-resume";
import { scoreColor, formatScore } from "@/lib/queue-utils";
import { Download, FileText, Trash2 } from "lucide-react";

export function QueueJobCard({
  item,
  onRemove,
  onAnalyze,
  hasLatexSource,
}: {
  item: QueueEntry;
  onRemove: (queueId: string) => void;
  onAnalyze: (queueId: string) => void;
  hasLatexSource: boolean;
}) {
  const {
    id,
    posting,
    company,
    overlapScore,
    matchedKeywords,
    missingKeywords,
    fitExplanation,
    analyzedAt,
  } = item;

  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [localCustomizedKey, setLocalCustomizedKey] = useState(
    item.customizedR2Key,
  );

  async function handleGenerate() {
    setGenerating(true);
    setGenerateError(null);
    try {
      const result = await customizeResume(id);
      if (result.success) {
        setLocalCustomizedKey(result.r2Key ?? "customized");
      } else {
        setGenerateError(result.error ?? "Generation failed.");
      }
    } catch {
      setGenerateError("Generation failed. Please try again.");
    } finally {
      setGenerating(false);
    }
  }

  async function handleDownload() {
    const url = await getCustomizedResumeUrl(id);
    if (!url) {
      setGenerateError("Could not retrieve download link. Please try again.");
      return;
    }
    const a = document.createElement("a");
    a.href = url;
    a.download = "resume-customized.tex";
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  async function handleRemoveCustomized() {
    try {
      await removeCustomizedResume(id);
      setLocalCustomizedKey(null);
    } catch {
      setGenerateError("Failed to remove customized resume. Please try again.");
    }
  }

  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-3">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-sm truncate">
            {posting.title || "Untitled"}
          </h3>
          <p className="text-xs text-muted">{company.name}</p>
        </div>
        <button
          onClick={() => onRemove(id)}
          className="text-xs text-muted hover:text-foreground transition-colors shrink-0"
          title="Remove from queue"
        >
          ✕
        </button>
      </div>

      {/* Score section */}
      {analyzedAt ? (
        <div className="space-y-2">
          <div className={`rounded p-2 ${scoreColor(overlapScore)}`}>
            <div className="flex items-baseline justify-between">
              <span className="text-xs font-medium">Fit Score</span>
              <span className="text-sm font-bold">{formatScore(overlapScore)}</span>
            </div>
          </div>

          {/* Keywords */}
          {matchedKeywords.length > 0 && (
            <div>
              <p className="text-xs font-medium mb-1">
                Matched ({matchedKeywords.length})
              </p>
              <div className="flex flex-wrap gap-1">
                {matchedKeywords.slice(0, 3).map((kw) => (
                  <span
                    key={kw}
                    className="inline-block rounded-full bg-green-100 px-2 py-1 text-xs font-medium"
                  >
                    {kw}
                  </span>
                ))}
                {matchedKeywords.length > 3 && (
                  <span className="inline-block rounded-full bg-border px-2 py-1 text-xs font-medium">
                    +{matchedKeywords.length - 3}
                  </span>
                )}
              </div>
            </div>
          )}

          {missingKeywords.length > 0 && (
            <div>
              <p className="text-xs font-medium mb-1">
                Missing ({missingKeywords.length})
              </p>
              <div className="flex flex-wrap gap-1">
                {missingKeywords.slice(0, 3).map((kw) => (
                  <span
                    key={kw}
                    className="inline-block rounded-full bg-border px-2 py-1 text-xs font-medium"
                  >
                    {kw}
                  </span>
                ))}
                {missingKeywords.length > 3 && (
                  <span className="inline-block rounded-full bg-border px-2 py-1 text-xs font-medium">
                    +{missingKeywords.length - 3}
                  </span>
                )}
              </div>
            </div>
          )}

          {fitExplanation && (
            <p className="text-xs text-muted">{fitExplanation}</p>
          )}

          {/* Resume customization actions */}
          <div className="flex flex-wrap items-center gap-2 border-t border-border pt-2">
            {!localCustomizedKey ? (
              <>
                <button
                  onClick={handleGenerate}
                  disabled={generating || !hasLatexSource}
                  title={
                    !hasLatexSource
                      ? "Upload your .tex resume in Settings to enable this"
                      : undefined
                  }
                  className="inline-flex items-center gap-1.5 rounded border border-indigo-400 px-2.5 py-1 text-xs font-medium text-indigo-600 hover:bg-indigo-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-indigo-600 dark:text-indigo-400 dark:hover:bg-indigo-950"
                >
                  <FileText size={12} />
                  {generating ? "Generating…" : "Generate resume"}
                </button>
                {generateError && (
                  <span className="text-xs text-red-500">{generateError}</span>
                )}
              </>
            ) : (
              <>
                <button
                  onClick={handleDownload}
                  className="inline-flex items-center gap-1.5 rounded border border-emerald-400 px-2.5 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-50 dark:border-emerald-600 dark:text-emerald-400 dark:hover:bg-emerald-950"
                >
                  <Download size={12} />
                  Download .tex
                </button>
                <button
                  onClick={handleRemoveCustomized}
                  className="inline-flex items-center gap-1.5 rounded border border-border px-2.5 py-1 text-xs text-muted hover:bg-border-soft"
                >
                  <Trash2 size={12} />
                  Remove
                </button>
              </>
            )}
          </div>
        </div>
      ) : (
        <button
          onClick={() => onAnalyze(id)}
          className="w-full py-2 px-3 text-xs font-medium rounded bg-primary text-primary-contrast hover:opacity-90 transition-opacity"
        >
          Analyze Fit
        </button>
      )}

      {/* Footer */}
      <div className="flex items-center gap-2 pt-2 border-t border-border text-xs text-muted">
        <a
          href={posting.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-1 hover:text-foreground transition-colors truncate"
        >
          View posting
        </a>
      </div>
    </div>
  );
}
