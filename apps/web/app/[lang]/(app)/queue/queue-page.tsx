"use client";

import { useState, useEffect, useCallback } from "react";
import { Trans, useLingui } from "@lingui/react/macro";
import { getQueueItems, analyzeQueueItem } from "@/lib/actions/queue";
import type { QueueEntry } from "@/lib/actions/queue";
import { QueueJobCard } from "@/components/queue/queue-job-card";
import { useQueue } from "@/components/QueueProvider";

export function QueuePage() {
  const [items, setItems] = useState<QueueEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const { toggle } = useQueue();
  const { t } = useLingui();

  const loadData = useCallback(async () => {
    const result = await getQueueItems({ offset: 0, limit: 50 });
    setItems(result.items);
    setTotal(result.total);
  }, []);

  useEffect(() => {
    loadData().finally(() => setLoading(false));
  }, [loadData]);

  async function handleAnalyzeAll() {
    const unanalyzed = items.filter((i) => i.analyzedAt === null);
    if (unanalyzed.length === 0) return;
    setAnalyzing(true);
    try {
      for (const item of unanalyzed) {
        try {
          await analyzeQueueItem(item.id, item.posting.id);
        } catch {
          // Continue with remaining items
        }
      }
      await loadData();
    } finally {
      setAnalyzing(false);
    }
  }

  function handleRemove(postingId: string) {
    toggle(postingId);
    setItems((prev) => prev.filter((i) => i.posting.id !== postingId));
    setTotal((prev) => Math.max(0, prev - 1));
  }

  const analyzedItems = items.filter((i) => i.analyzedAt !== null);
  const pendingItems = items.filter((i) => i.analyzedAt === null);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-muted border-t-primary" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-8">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h1 className="text-xl font-bold">
          <Trans id="queue.page.title" comment="Job fit queue page title">Job Fit Queue</Trans>
        </h1>

        {pendingItems.length > 0 && (
          <button
            onClick={handleAnalyzeAll}
            disabled={analyzing}
            className="inline-flex items-center gap-1 rounded bg-indigo-600 px-3 py-1 text-xs font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {analyzing
              ? t({ id: "queue.page.analyzing", comment: "Button label while analysis is running", message: "Analyzing…" })
              : t({
                  id: "queue.page.analyzeAll",
                  comment: "Analyze all queued jobs button",
                  message: `Analyze all (${pendingItems.length})`,
                })}
          </button>
        )}
      </div>

      {/* Stats bar */}
      {total > 0 && (
        <div className="flex gap-4 rounded-md border border-divider bg-surface-alt/50 px-4 py-3 text-sm">
          <span>
            <span className="font-semibold">{total}</span>{" "}
            <span className="text-muted">
              <Trans id="queue.stats.queued" comment="Queued count label">queued</Trans>
            </span>
          </span>
          <span>
            <span className="font-semibold">{analyzedItems.length}</span>{" "}
            <span className="text-muted">
              <Trans id="queue.stats.analyzed" comment="Analyzed count label">analyzed</Trans>
            </span>
          </span>
        </div>
      )}

      {/* Empty state */}
      {items.length === 0 && (
        <div className="rounded-md border border-divider bg-surface px-6 py-12 text-center">
          <p className="text-sm text-muted">
            <Trans id="queue.empty" comment="Empty queue message">
              No jobs in your queue yet. Hit the Queue button on any job to add it.
            </Trans>
          </p>
        </div>
      )}

      {/* Analyzed section */}
      {analyzedItems.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">
            <Trans id="queue.section.analyzed" comment="Section heading for analyzed jobs">Analyzed</Trans>
          </h2>
          {analyzedItems.map((item) => (
            <QueueJobCard key={item.id} item={item} onRemove={handleRemove} />
          ))}
        </section>
      )}

      {/* Pending section */}
      {pendingItems.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">
            <Trans id="queue.section.pending" comment="Section heading for pending jobs awaiting analysis">Pending</Trans>
          </h2>
          {pendingItems.map((item) => (
            <QueueJobCard key={item.id} item={item} onRemove={handleRemove} />
          ))}
        </section>
      )}
    </div>
  );
}
