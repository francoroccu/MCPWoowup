import { Suspense } from "react";
import { Filters } from "./Filters";
import { CHANNEL_LABEL, type Channel } from "@/lib/metrics";
import { currentMonth, monthLabel, monthRange } from "@/lib/months";
import type { Filters as F } from "@/lib/views";

export function FiltersBar({ f, channels }: { f: F; channels: string[] }) {
  const now = currentMonth();
  const monthOptions = monthRange(`${Number(now.slice(0, 4)) - 1}-01`, now)
    .reverse()
    .map((m) => ({ value: m, label: `${monthLabel(m)} ${m.slice(0, 4)}` }));
  const chs = ["all", ...channels.filter((c) => c in CHANNEL_LABEL)] as Channel[];
  return (
    <Suspense>
      <Filters
        from={f.from}
        to={f.to}
        channel={f.channel}
        groupType={f.groupType}
        monthOptions={monthOptions}
        channels={chs.map((c) => ({ value: c, label: CHANNEL_LABEL[c] }))}
      />
    </Suspense>
  );
}
