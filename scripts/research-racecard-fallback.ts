export type StoredRacecard = {
  date: string;
  sourceId: string;
  payloadId: string | null;
  payloadDate: string | null;
  meetingId: string;
  scheduledTime: string | null;
  runners: number;
  payloadRunners: number;
};

export function validateStoredRacecards(date: string, cards: StoredRacecard[]) {
  const races = new Set(cards.map((card) => card.sourceId)).size;
  const meetings = new Set(cards.map((card) => card.meetingId)).size;
  const runners = cards.reduce((sum, card) => sum + card.runners, 0);
  const usable = races >= 2 && races === cards.length && meetings >= 1 && cards.every((card) =>
    card.date === date && card.payloadDate === date && card.payloadId === card.sourceId &&
    Boolean(card.meetingId && card.scheduledTime) && card.runners >= 2 && card.runners === card.payloadRunners,
  );
  return { date, races, meetings, runners, usable };
}

export type StoredRacecardStatus = ReturnType<typeof validateStoredRacecards>;

export async function checkStoredRacecards(date: string): Promise<StoredRacecardStatus> {
  const { createDbConnection } = await import("@/db");
  const connection = createDbConnection();
  try {
    const cards = await connection.client<StoredRacecard[]>`
      select r.race_date::text as date, r.source_id as "sourceId",
        si.payload #>> '{props,pageProps,race,race_summary,race_summary_reference,id}' as "payloadId",
        si.payload #>> '{props,pageProps,race,race_summary,date}' as "payloadDate",
        r.course_id::text as "meetingId", r.scheduled_time::text as "scheduledTime",
        (select count(*)::int from race_runners rr
          where rr.race_id = r.id and rr.source = 'sporting_life') as runners,
        case when jsonb_typeof(si.payload #> '{props,pageProps,race,rides}') = 'array'
          then jsonb_array_length(si.payload #> '{props,pageProps,race,rides}') else 0 end as "payloadRunners"
      from races r
      join courses c on c.id = r.course_id
      join source_imports si on si.source = r.source and si.source_id = r.source_id
        and si.source_type = 'racecard-next-data'
      where r.source = 'sporting_life' and r.race_date = ${date}::date
        and upper(c.country) in ('GB', 'UK', 'IRE', 'IE', 'ENG', 'SCO', 'WAL', 'WALE',
          'ENGLAND', 'SCOTLAND', 'WALES', 'IRELAND', 'EIRE', 'NORTHERN IRELAND', 'NORT')
      order by r.source_id
    `;
    return validateStoredRacecards(date, cards);
  } finally {
    await connection.client.end();
  }
}

export function isRacecardAcquisitionFailure(output: string) {
  if (/RACECARD_DETAIL_DATE_MISMATCH|detail_race_id_mismatch|no_race_payload|different date|wrong.date|date.mismatch|target.date.*validation|ACCESS_CONTROL_SIGNAL|(?:JSONDecodeError|KeyError|ValueError|TypeError|IntegrityError|ProgrammingError):/i.test(output)) return false;
  if (!/^REQUEST_FAILED url=https:\/\/www\.sportinglife\.com\//m.test(output)) return false;
  // Use the terminal exception, not a retry line preceding an unrelated failure.
  const terminal = output.trim().split("\n").filter((line) => !line.startsWith("error: script ")).at(-1) ?? "";
  return /^(?:TimeoutError|ConnectionResetError|ConnectionRefusedError|ConnectionAbortedError):/.test(terminal) ||
    /^(?:OSError|socket\.gaierror):.*(?:timed out|connection reset|connection refused|temporary failure|network is unreachable)/i.test(terminal) ||
    /^http\.client\.RemoteDisconnected: Remote end closed connection without response/.test(terminal) ||
    /^urllib\.error\.URLError:.*(?:timed out|connection reset|connection refused|temporary failure|name.*resolution|network is unreachable)/i.test(terminal) ||
    /SportingLifeRequestError: Sporting Life returned HTTP 5\d\d\b/.test(terminal);
}
