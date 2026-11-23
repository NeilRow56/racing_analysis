-- psql -X -qAt -v ON_ERROR_STOP=1 -d racing_analysis -f scripts/export-full-history-profitability.sql
BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL timezone = 'UTC';
SELECT json_build_object(
  'id', r.id, 'source', r.source_id, 'date', r.race_date, 'off', r.race_datetime,
  'course', c.display_name, 'country', c.country, 'name', r.race_name, 'type', r.race_type, 'code', r.race_type_code,
  'class', r.race_class, 'yards', r.distance_yards, 'going', r.going, 'declared', r.declared_runner_count,
  'actual', r.actual_runner_count,
  'resultId', result.body #>> '{race_summary,race_summary_reference,id}',
  'stage', result.body #>> '{race_summary,race_stage}',
  'surface', coalesce(result.body #>> '{race_summary,course_surface,surface}', card.body #>> '{race_summary,course_surface,surface}'),
  'handicap', coalesce(result.body #>> '{race_summary,has_handicap}', card.body #>> '{race_summary,has_handicap}'),
  'starterCount', result.body #>> '{race_summary,ride_count}',
  'resultRides', (SELECT json_agg(json_build_array(
    x #>> '{ride_reference,id}', x #>> '{horse,horse_reference,id}', x->>'finish_position', x->>'ride_status',
    coalesce(x #>> '{casualty,type}', x #>> '{casualty,short_name}', x #>> '{casualty,name}', x #>> '{casualty,reason}'), x #>> '{betting,current_odds}'
  ) ORDER BY x #>> '{ride_reference,id}') FROM jsonb_array_elements(
    CASE WHEN jsonb_typeof(result.body->'rides') = 'array' THEN result.body->'rides' ELSE '[]'::jsonb END
  ) x),
  'cardAt', card.fetched_at, 'cardStage', card.body #>> '{race_summary,race_stage}',
  'cardId', card.body #>> '{race_summary,race_summary_reference,id}', 'cardDate', card.body #>> '{race_summary,date}',
  'cardRides', (SELECT json_agg(json_build_array(
    x #>> '{ride_reference,id}', x #>> '{horse,horse_reference,id}', x->>'ride_status',
    x->>'official_rating', x->'bookmakerOdds'
  ) ORDER BY x #>> '{ride_reference,id}') FROM jsonb_array_elements(
    CASE WHEN jsonb_typeof(card.body->'rides') = 'array' THEN card.body->'rides' ELSE '[]'::jsonb END
  ) x),
  'runners', coalesce((SELECT json_agg(json_build_array(
    rr.id, rr.source_id, rr.horse_id, h.source_id, rr.trainer_id, rr.jockey_id, rr.finishing_position,
    rr.result_status, rr.outcome_code, rr.official_rating, rr.topspeed_rating, rr.racing_post_rating,
    rr.starting_price_decimal, rr.weight_carried_lbs, rr.horse_age
  ) ORDER BY rr.id) FROM race_runners rr JOIN horses h ON h.id=rr.horse_id
    WHERE rr.race_id=r.id AND rr.source='sporting_life'), '[]'::json)
)
FROM races r JOIN courses c ON c.id=r.course_id
LEFT JOIN LATERAL (
  SELECT payload #> '{props,pageProps,race}' AS body FROM source_imports
  WHERE source=r.source AND source_id=r.source_id AND source_type='full-result-next-data'
) result ON true
LEFT JOIN LATERAL (
  SELECT payload #> '{props,pageProps,race}' AS body, fetched_at FROM source_imports
  WHERE source=r.source AND source_id=r.source_id AND source_type='racecard-next-data' AND r.race_date >= '2024-01-01'
) card ON true
WHERE r.source='sporting_life' AND r.race_date <= :'through'::date
ORDER BY r.race_date,r.race_datetime,r.id;
COMMIT;
