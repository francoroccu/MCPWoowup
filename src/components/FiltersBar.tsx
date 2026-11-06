import { Suspense } from "react";
import { Filters } from "./Filters";
import { CHANNEL_LABEL, type Channel } from "@/lib/metrics";
import { currentMonth, monthRange } from "@/lib/months";
import { monthTitle, type Filters as F } from "@/lib/views";

const LONG = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

export function FiltersBar({ f, channels }: { f: F; channels: string[] }) {
  const now = currentMonth();
  const monthOptions = monthRange(`${Number(now.slice(0, 4)) - 1}-01`, now)
    .reverse()
    .map((m) => ({
      value: m,
      label: `${LONG[Number(m.slice(5)) - 1]} ${m.slice(0, 4)}${m === now ? " (en curso)" : ""}`,
    }));
  const chs = ["all", ...channels.filter((c) => c in CHANNEL_LABEL)] as Channel[];
  return (
    <Suspense>
      <Filters
        month={f.month}
        channel={f.channel}
        groupType={f.groupType}
        monthOptions={monthOptions}
        channels={chs.map((c) => ({ value: c, label: CHANNEL_LABEL[c] }))}
      />
    </Suspense>
  );
}

export { monthTitle };
