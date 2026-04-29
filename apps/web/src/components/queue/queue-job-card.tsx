"use client";

import Image from "next/image";
import { X } from "lucide-react";
import { Trans } from "@lingui/react/macro";
import type { QueueEntry } from "@/lib/actions/queue";

interface QueueJobCardProps {
  item: QueueEntry;
  onRemove: (postingId: string) => void;
}

function scoreColor(score: number): "green" | "amber" | "red" {
  if (score >= 0.8) return "green";
  if (score >= 0.6) return "amber";
  return "red";
}

function formatScore(score: number): string {
  return `${Math.round(score * 100)}%`;
}

const accentColorMap = {
  green: "bg-emerald-500",
  amber: "bg-amber-400",
  red: "bg-red-500",
};

const badgeColorMap = {
  green: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200",
  amber: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
  red: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
};

export function QueueJobCard({ item, onRemove }: QueueJobCardProps) {
  const isAnalyzed = item.analyzedAt !== null;
  const tier = item.overlapScore != null ? scoreColor(item.overlapScore) : null;

  return (
    <div className="relative flex overflow-hidden rounded-md border border-divider bg-surface">
      {tier && <div className={`w-1 shrink-0 ${accentColorMap[tier]}`} />}

      <div className="flex flex-1 flex-col gap-2 p-4">
        {/* Header row */}
        <div className="flex items-start gap-3">
          {item.company.icon ? (
            <Image
              src={item.company.icon}
              alt={item.company.name}
              width={36}
              height={36}
              className="size-9 shrink-0 rounded"
            />
          ) : (
            <div className="flex size-9 shrink-0 items-center justify-center rounded bg-border-soft text-sm font-semibold text-muted">
              {item.company.name.slice(0, 2).toUpperCase()}
            </div>
          )}

          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{item.posting.title ?? "—"}</p>
            <p className="text-xs text-muted">{item.company.name}</p>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {isAnalyzed && item.overlapScore != null && tier && (
              <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${badgeColorMap[tier]}`}>
                {formatScore(item.overlapScore)}
              </span>
            )}
            <button
              onClick={() => onRemove(item.posting.id)}
              className="rounded p-1 text-muted hover:bg-border-soft hover:text-foreground"
              aria-label="Remove from queue"
            >
              <X size={14} />
            </button>
          </div>
        </div>

        {/* Keyword pills */}
        {isAnalyzed && (item.matchedKeywords.length > 0 || item.missingKeywords.length > 0) && (
          <div className="flex flex-wrap gap-1">
            {item.matchedKeywords.slice(0, 8).map((kw) => (
              <span
                key={kw}
                className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200"
              >
                {kw}
              </span>
            ))}
            {item.missingKeywords.slice(0, 5).map((kw) => (
              <span
                key={kw}
                className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-medium text-red-800 dark:bg-red-900 dark:text-red-200"
              >
                {kw}
              </span>
            ))}
          </div>
        )}

        {/* Fit explanation */}
        {isAnalyzed && item.fitExplanation && (
          <p className="text-xs leading-relaxed text-muted">{item.fitExplanation}</p>
        )}

        {/* Pending state */}
        {!isAnalyzed && (
          <p className="text-xs text-muted">
            <Trans id="queue.card.pending" comment="Label shown on queue card before analysis runs">
              Pending analysis
            </Trans>
          </p>
        )}
      </div>
    </div>
  );
}
