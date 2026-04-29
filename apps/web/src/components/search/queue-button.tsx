"use client";

import { ListPlus, ListChecks } from "lucide-react";
import { useLingui } from "@lingui/react/macro";
import * as Tooltip from "@radix-ui/react-tooltip";
import { useAuth } from "@/lib/useAuth";
import { useLocalePath } from "@/lib/useLocalePath";
import { useQueue } from "@/components/QueueProvider";
import { tooltipClass } from "@/components/ui/tooltip-styles";

interface QueueButtonProps {
  postingId: string;
  /** When true, renders as a compact icon-only button (for job cards) */
  compact?: boolean;
}

export function QueueButton({ postingId, compact = false }: QueueButtonProps) {
  const { t } = useLingui();
  const { isLoggedIn, isPending } = useAuth();
  const lp = useLocalePath();
  const { isQueued, toggle, isToggling } = useQueue();

  const queued = isQueued(postingId);
  const toggling = isToggling(postingId);

  const label = queued
    ? t({ id: "search.queue.remove", comment: "Tooltip for remove from queue button", message: "Remove from queue" })
    : t({ id: "search.queue.add", comment: "Tooltip for add to queue button", message: "Add to queue" });

  function handleClick(e: React.MouseEvent) {
    e.stopPropagation();
    if (isPending) return;
    if (!isLoggedIn) {
      window.location.href = lp("/sign-in");
      return;
    }
    toggle(postingId);
  }

  const Icon = queued ? ListChecks : ListPlus;

  if (compact) {
    return (
      <Tooltip.Provider delayDuration={0} skipDelayDuration={300}>
        <Tooltip.Root>
          <Tooltip.Trigger asChild>
            <button
              onClick={handleClick}
              disabled={toggling}
              className="shrink-0 cursor-pointer text-muted transition-opacity hover:opacity-70 disabled:cursor-default disabled:opacity-50"
              aria-label={label}
            >
              <Icon size={14} className={queued ? "fill-current" : ""} />
            </button>
          </Tooltip.Trigger>
          <Tooltip.Portal>
            <Tooltip.Content className={tooltipClass} sideOffset={6}>
              {label}
            </Tooltip.Content>
          </Tooltip.Portal>
        </Tooltip.Root>
      </Tooltip.Provider>
    );
  }

  return (
    <Tooltip.Provider delayDuration={0} skipDelayDuration={300}>
      <Tooltip.Root>
        <Tooltip.Trigger asChild>
          <button
            onClick={handleClick}
            disabled={toggling}
            aria-label={label}
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold transition-colors disabled:cursor-default disabled:opacity-50 ${
              queued
                ? "border-indigo-500 bg-indigo-500 text-white"
                : "border-indigo-500 bg-transparent text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-950"
            }`}
          >
            <Icon size={12} />
            {queued
              ? t({ id: "search.queue.queued", comment: "Label when job is already queued", message: "Queued" })
              : t({ id: "search.queue.queue", comment: "Label for queue button", message: "Queue" })}
          </button>
        </Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content className={tooltipClass} sideOffset={6}>
            {label}
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  );
}
