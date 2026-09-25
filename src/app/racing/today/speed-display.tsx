"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

export type SpeedDisplayMetric = "bestLast3" | "latest" | "previous";

export type SpeedDisplayValues = {
  latest: number | null | undefined;
  previous: number | null | undefined;
  bestLast3: number | null | undefined;
};

export const DEFAULT_SPEED_DISPLAY_METRIC: SpeedDisplayMetric = "bestLast3";

const SpeedDisplayContext = createContext<SpeedDisplayMetric>(DEFAULT_SPEED_DISPLAY_METRIC);

export function TodaySpeedDisplay({ children }: { children: ReactNode }) {
  const [metric, setMetric] = useState<SpeedDisplayMetric>(DEFAULT_SPEED_DISPLAY_METRIC);

  return (
    <SpeedDisplayContext.Provider value={metric}>
      <div className="mt-6 flex justify-end">
        <label className="flex items-center gap-2 text-xs font-medium uppercase text-slate-500">
          Speed
          <select
            aria-label="Speed metric"
            className="border border-slate-300 bg-white px-2 py-1.5 text-xs font-medium normal-case text-slate-800"
            onChange={(event) => setMetric(event.currentTarget.value as SpeedDisplayMetric)}
            value={metric}
          >
            <option value="bestLast3">Best L3</option>
            <option value="latest">Latest</option>
            <option value="previous">Previous</option>
          </select>
        </label>
      </div>
      {children}
    </SpeedDisplayContext.Provider>
  );
}

export function SpeedDisplayValue({ values }: { values: SpeedDisplayValues }) {
  const metric = useContext(SpeedDisplayContext);
  return <>{formatSpeedValue(speedValueForMetric(values, metric))}</>;
}

export function speedValueForMetric(
  values: SpeedDisplayValues,
  metric: SpeedDisplayMetric,
): number | null | undefined {
  return values[metric];
}

function formatSpeedValue(value: number | null | undefined): string {
  return value === null || value === undefined ? "-" : Math.round(value).toString();
}
