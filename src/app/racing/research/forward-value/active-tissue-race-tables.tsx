import type { ActiveResearchCapture } from "./active-tissue-captures";

const time = (value: string) => new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", hour: "2-digit", minute: "2-digit" }).format(new Date(value));

export function ActiveTissueRaceTables({ races, date }: { races: ActiveResearchCapture[]; date: string }) {
  return <section className="mt-5 border border-slate-300 bg-white p-4" aria-labelledby="active-tissue-heading">
    <h3 id="active-tissue-heading" className="text-base font-semibold">Today’s Tissue captures · {date}</h3>
    <p className="mt-1 text-sm text-slate-600">Latest valid frozen pre-off observation per race, retained after the off. Market prices and ranks use the same captured book. Original observations remain available in the archive below.</p>
    {!races.length ? <p className="mt-3 text-sm text-slate-500">No valid pre-off Tissue captures for today.</p> : null}
    {races.map(race => <details open key={race.raceId} className="mt-4 border border-slate-200 p-3">
      <summary className="cursor-pointer text-sm font-semibold">{race.raceDate} · {time(race.scheduledOff)} {race.course} · {race.family} · {race.modelVersion}</summary>
      <p className="mt-1 text-xs text-slate-500">Captured {time(race.capturedAt)} London time · {race.runners.length} runners</p>
      <div className="mt-2 overflow-x-auto"><table className="w-full whitespace-nowrap text-left text-xs tabular-nums">
        <caption className="sr-only">Latest pre-off Tissue capture for {race.course} {time(race.scheduledOff)}</caption>
        <thead><tr>{["Horse", "Tissue rank", "Tissue %", "Market price", "Market rank"].map(label => <th key={label} scope="col" className="border-b p-2 font-medium">{label}</th>)}</tr></thead>
        <tbody>{[...race.runners].sort((a, b) => a.tissueRank - b.tissueRank || a.runnerId.localeCompare(b.runnerId)).map(runner => <tr key={runner.runnerId}>
          <th scope="row" className="p-2 font-medium">{runner.horseName}</th>
          <td className="p-2">{runner.tissueRank}</td><td className="p-2">{(runner.probability * 100).toFixed(2)}%</td>
          <td className="p-2">{runner.marketPrice?.toFixed(2) ?? "—"}</td><td className="p-2">{runner.marketRank ?? "—"}</td>
        </tr>)}</tbody>
      </table></div>
    </details>)}
  </section>;
}
