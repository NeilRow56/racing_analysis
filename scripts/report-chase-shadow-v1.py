"""Render the isolated CHASE_SHADOW_V1 research artifacts; standard library only."""
import hashlib
import json
import math
import pathlib
import random

ROOT = pathlib.Path('/tmp/chase-shadow-v1')
load = lambda name: json.loads((ROOT / name).read_text())
h, f, dev = load('holdout.json'), load('frozen.json'), load('development.json')
datasets = {y: load(y + '.json') for y in ('2025', '2026')}
pred = load('predictions.json')
fmt = lambda x, n=4: '—' if x is None else f'{x:.{n}f}'
pct = lambda x: '—' if x is None else f'{100*x:.2f}%'
lines = []
def add(s=''):
    lines.append(s)
def table(headers, rows):
    add('| ' + ' | '.join(headers) + ' |')
    add('| ' + ' | '.join(['---'] * len(headers)) + ' |')
    for row in rows:
        add('| ' + ' | '.join(str(x) for x in row) + ' |')
    add()
def aggregate(rs):
    expected = sum(r['probability'] for r in rs)
    winners = sum(r['won'] for r in rs)
    return dict(selections=len(rs), winners=winners, strike=winners/len(rs) if rs else None,
                expected=expected, actualModel=winners/expected if expected else None)
def metrics_row(label, x):
    return [label, x['races'], x['runners'], fmt(x['logLoss']), fmt(x['brier']),
            f"{x['top1']['winners']}/{x['top1']['selections']}", pct(x['top1']['strike']),
            f"{x['top2']['winners']}/{x['top2']['selections']}", pct(x['top2RaceCapture']),
            fmt(x['top1']['actualModel']), fmt(x['top2']['actualModel']), fmt(x['ece']), fmt(x['rankAssociation'])]
headers = ['Model / period', 'Races', 'Runners', 'Race LL', 'Race Brier', 'Top1 W/n', 'Top1 strike',
           'Top2 W/n', 'Top2 race capture', 'Top1 A/M', 'Top2 A/M', 'ECE', 'Rank association']

# Race-paired resampling is uncertainty reporting, never used for fitting or selection.
deltas = []
for a, b in zip(pred['current'], pred['shadow']):
    assert a['raceId'] == b['raceId']
    winner_p = lambda race: next(r['probability'] for r in race['runners'] if r['won'])
    win = lambda race, k: int(any(r['won'] and r['rank'] <= k for r in race['runners']))
    deltas.append([-math.log(winner_p(b)) + math.log(winner_p(a)), win(b, 1)-win(a, 1), win(b, 2)-win(a, 2)])
rng = random.Random(20251001)
boot = [[], [], []]
for _ in range(2000):
    totals = [0., 0., 0.]
    for _ in deltas:
        row = deltas[rng.randrange(len(deltas))]
        for j in range(3):
            totals[j] += row[j]
    for j in range(3):
        boot[j].append(totals[j] / len(deltas))
uncertainty = {name: {'difference': sum(r[j] for r in deltas)/len(deltas),
                     'ci95': [sorted(boot[j])[49], sorted(boot[j])[1949]]}
               for j, name in enumerate(['raceLogLoss', 'top1Strike', 'top2RaceCapture'])}
(ROOT / 'uncertainty.json').write_text(json.dumps(uncertainty, indent=2) + '\n')

add('# Chase Shadow V1\n')
add('## Executive Summary\n')
add('**D — CLEAR HOLDOUT IMPROVEMENT — PROSPECTIVE SHADOW JUSTIFIED.** Recommended action: **C — run the frozen CHASE_SHADOW_V1 prospectively alongside the current model.** This is a recommendation only; no prospective activation or production change was made.\n')
a, b = h['current']['overall'], h['shadow']['overall']
add(f"The 2025-only selection chose **Set {f['set']}**, a Chase-only fit of the existing 79 Jump inputs. On **{a['races']:,} identical 2026 races / {a['runners']:,} starters**, race log loss improves **{a['logLoss']:.4f} → {b['logLoss']:.4f}**, Brier **{a['brier']:.4f} → {b['brier']:.4f}**, and fixed-band calibration error **{pct(a['ece'])} → {pct(b['ece'])}**. Top1 winners improve **303 → 321**, Top2 **547 → 554**. Log loss improves in every quarter.\n")
add('This establishes a useful probability-model improvement on this holdout, not a proven betting edge. Top1/Top2 improvements have confidence intervals crossing zero. Non-handicap ranking is mixed and recent non-completers remain overpriced. Captured-price returns are negative and cover only a small October subset.\n')
add('## Current Chase Problem\n')
add('JUMP_TISSUE_V1 shares coefficients across Hurdle and Chase. The motivation was existing Chase underperformance, including overconfidence among lower-reliability selections. The current-model 2026 Top1 A/M of 0.799 and 30%+ probability-band A/M of 0.780 confirm that issue on this population. Hurdles were not fitted, evaluated or changed in this experiment. Historical 2026 diagnostics already existed in the project; “untouched holdout” here means no 2026 rows or outcomes were used to select features, fit parameters or select this candidate. It does not claim 2026 was historically unknown to the project.\n')
add('## Feature Universe\n')
add('Set A preserves the frozen Jump universe: OR; latest, best L3 and average L3 Jump Speed; trainer/jockey prior rates and log counts; days since run; log prior starts; age; weight; class; distance; field size; handicap; soft/firm going flags; one missingness flag per numeric field; and existing dated prior-comment features. No price, SP, target result comment or future run enters a predictor. Numeric missing values use the existing zero-plus-missing-flag representation, with training-only scaling.\n')
add('Race-common class, distance, field-size, handicap and going terms cancel inside race softmax and cannot independently rank runners; their constant coefficients are retained for parity, not treated as discovered effects. In particular the cached actual field count is used for existing field integrity and is race-common, never a runner discriminator. The inherited `log_prior_jump_starts` input receives cached `priorRuns`, as in the current freezer; it is not silently redefined as Chase starts.\n')
add('## Chase-Specific History\n')
add('The existing feature cache does not directly store Chase-only windows or exact Speed reliability. Research-only extensions were reconstructed from dated source histories using existing subtype, horse-metric and Speed helpers, with strict prior-date cutoffs. They were exported separately; no cached fields were replaced. This is historical as-of reconstruction, not a frozen prospective feature snapshot or an assertion that database rows were ingested before each off. The final selected Set A uses cached Jump fields and existing prior comments, not the new extensions.\n')
add('Speed eligibility matches the feature-store loader: known result/non-runner exclusions and non-empty race winning time, newest-first all-code window. B filters that eligible history to Chase, then uses the existing latest/L3 metrics only with at least **two observed eligible Chase starts**, with explicit missingness. This sufficiency threshold counts starts, not two usable Speed figures. C uses **min(Chase usable figures in L3 / 3, 1)** as a fixed blending weight; when one side is missing it uses the available side with explicit Chase coverage flags. No rating is fabricated for wholly missing histories.\n')
covrows=[]
for y, data in datasets.items():
    rr=[r for x in data['races'] for r in x['runners']]
    tests=[('All-Jump best L3 available',lambda r:r['raw'][2] is not None),
           ('Chase-only best L3 available (unrestricted)',lambda r:r['chaseBest'] is not None),
           ('B sufficient Chase history',lambda r:r['chaseWindow']>=2),
           ('B sufficient + best L3 available',lambda r:r['chaseWindow']>=2 and r['chaseBest'] is not None),
           ('C blended best L3 available',lambda r:r['raw'][2] is not None or r['chaseBest'] is not None),
           ('Completion label known',lambda r:r['completion']!='missing')]
    for label, fn in tests:
        n=sum(fn(r) for r in rr);covrows.append([y,label,n,len(rr),pct(n/len(rr))])
table(['Year','Representation / coverage','Known n','All starters','Coverage'],covrows)
add('Chase experience below counts all observed source starts before target, including starts without a usable time figure; it is deliberately separate from Speed eligibility. Zero means zero observed prior Chase starts, not certified lifetime absence. Sparse or truncated database histories are an evidence limitation. Completion uses only an explicit latest pre-target position/status; missing labels are retained. No retrospective target labels fill gaps.\n')
add('## Candidate Sets\n')
for k, text in f['protocol']['candidates'].items():
    add(f'- **{k}:** {text}.')
add('\nOnly these three representations were tried. No additional subsets, penalty sweep, price threshold choice, tree model or ROI fitting was used. Each used 90 deterministic full-batch epochs, L2 = 0.02 and learning rate 0.12 / sqrt(1 + epoch/10), matching the existing Jump Tissue fit.\n')
add('## 2025 Development\n')
add('Train: **1 January–30 September 2025**, 1,118 races. Validation: **1 October–31 December 2025**, 580 races. Race observations were not shuffled. Selection: lowest validation race log loss; within 0.005, lowest fixed-band ECE, then Top2 capture, then fewer features. This rule was written before development evaluation and before holdout export.\n')
table(headers,[metrics_row(c['set']+' train',c['train']) for c in dev]+[metrics_row(c['set']+' validation',c['validation']) for c in dev])
add('A, B and C differed in validation log loss by less than 0.0005. A had the best calibration and Top2 capture, and stronger established history coverage. C improved Top1 strike but materially weakened Top2 capture; B did not improve ranking. The declared near-tie rule therefore chose A. B and C also differ in their surrounding features, so this small representation comparison does not isolate a causal Chase-history-only effect. This tests Chase-only fitting and rejects the more specialised history inputs for this version; it does not establish that Chase-only histories have no future value. The current shared model is not shown as an independent 2025 validation control because it was fitted on all of 2025.\n')
table(headers,[metrics_row(c['set']+' 2025-'+m['month'],m) for c in dev for m in c['months']])
add('Monthly validation stability is descriptive and noisy; it did not trigger any extra feature search. The selected representation was then refitted on all 1,698 eligible 2025 Chase races / 13,077 starters with unchanged optimizer, before 2026 export.\n')
add('### Validation calibration\n')
table(['Set','Band','Runners','Expected','Actual','A/M'],[[c['set'],r['band'],r['selections'],fmt(r['expected']),r['winners'],fmt(r['actualModel'])]for c in dev for r in c['validation']['calibration']])
add('## Frozen Candidate\n')
add(f"Version: **{f['version']}**. Representation: **{f['set']}**. Inputs: **{len(f['model']['names'])}**. Frozen at **{f['frozenAt']}**. Checksum: `{f['checksum']}`. The checksum is verified before holdout scoring; both research code hashes are verified unchanged. Model artifact writes use exclusive creation.\n")
add('Exact names, means, scales, coefficients, optimizer and split are in [frozen.json](/tmp/chase-shadow-v1/frozen.json). The complete parameter table is also reproduced below. Standardised logit = sum(weight × (input − mean) / scale), then softmax across the eligible field. No intercept is needed.\n')
add(f"Development export SHA-256: `{f['developmentDataHash']}`. Holdout export SHA-256: `{h['holdoutHash']}`.\n")
for path, digest in f['codeHashes'].items():
    add(f'- `{path}`: `{digest}`')
add()
for y,data in datasets.items():
    add(f"**{y} source:** `{data['cache']}`; feature schema `{data['manifest']['featureSchemaVersion']}`, source schema `{data['manifest']['sourceFeatureVersion']}`, winning-time guard `{data['manifest']['jumpWinningTimeGuardVersion']}`.\n")
    for name,digest in data['sourceHashes'].items():
        add(f'- {name}: `{digest}`')
    add(f"- History export hash: `{data['historyHash']}`; comment export hash: `{data['commentsHash']}`.")
    add(f"- Excluded races: `{json.dumps(data['exclusions'],sort_keys=True)}`.\n")
add(f"Frozen current model checksum: `{datasets['2026']['modelChecksum']}`. Comparison uses the official frozen current artifact, not a newly refitted shared-model control. Any difference therefore includes Chase-only fitting on current compatible 2025 research inputs, rather than a causal isolation of training-population choice alone.\n")
add('## 2026 Holdout\n')
add('Eligible settled Chases from **1 January–29 October 2026**. Both models use exactly the same races, runners and deterministic runner-ID tie-breaking. Started pulled-up/fallen/unseated/non-finishers remain losses through canonical `settledWinValue`; NR/void are excluded. Single-winner races only, matching the existing Tissue experiment convention; four no-single-winner/dead-heat/unresolved-winner races are excluded rather than assigned a fabricated soft target. Thirteen unsettled races and one small field are excluded. SP availability is not a modelling-eligibility condition.\n')
add('## Current Model Comparison\n')
table(headers,[metrics_row('JUMP_TISSUE_V1',a),metrics_row('CHASE_SHADOW_V1',b)])
table(['Model','Rank set','Selections','Winners','Selection strike','Expected winners','A/M','SP n','SP ROI'],[[name,rank,x['selections'],x['winners'],pct(x['strike']),fmt(x['expected']),fmt(x['actualModel']),x['spN'],pct(x['spROI'])]for name,key in [('Current','current'),('Shadow','shadow')]for rank in ('top1','top2')for x in [h[key]['overall'][rank]]])
add('Top2 selection strike uses two £1 selections per race; Top2 race capture is winners / races. Race LL = mean −log(winner probability). Race Brier = mean sum of squared errors over each field. ECE = sum over fixed bands of |actual−expected| / runners. Rank association is the mean race-wise Spearman correlation of predicted rank versus the binary winner target (outcome ties averaged); it measures winner ranking, not a fabricated ordering of non-finishers. Mean winner rank improves from '+fmt(a['meanWinnerRank'])+' to '+fmt(b['meanWinnerRank'])+'. Full-field A/M is identically one for both normalised books and is not evidence of calibration.\n')
table(['Shadow − current','Difference','Paired 95% interval'],[[k,fmt(v['difference'],6),f"[{fmt(v['ci95'][0],6)}, {fmt(v['ci95'][1],6)}]"]for k,v in uncertainty.items()])
add('Intervals use 2,000 paired race bootstrap replicates, seed 20251001, with fixed fitted models. This describes holdout sampling uncertainty; it is not a refit, model-selection step or guarantee across future seasons. Log-loss improvement is clearer than the selection-count gains.\n')
add('## Chronological Stability\n')
table(headers,[metrics_row(name+' '+q['period'],q)for i in range(4)for name,key in [('Current','current'),('Shadow','shadow')]for q in [h[key]['quarters'][i]]])
add('Period labels are fixed calendar quarters; 10–12 means October through 29 October only. Race LL improves in **all four blocks**. Top1 winner count improves in the first three and falls by one in October; Top2 improves in three and falls in April–June. Improvement is repeatedly visible in probabilities, with mixed selection stability.\n')
add('## Handicap Analysis\n')
table(headers,[metrics_row(name+' '+x['group'],x)for i in range(3)for name,key in [('Current','current'),('Shadow','shadow')]for x in [h[key]['handicap'][i]]])
add('The existing title-assisted `classifyHandicapStatus` definition is preserved, including unknown rather than treating unknown as non-handicap. Handicap Top1 and Top2 improve; non-handicap log loss improves but Top1/Top2 strike fall. These descriptive results do not create separate fitted models or live rules.\n')

def context(title,key,interpretation):
    add('## '+title+'\n')
    rows=[]
    for name,m in [('Current','current'),('Shadow','shadow')]:
        for g in h[m]['contexts'][key]:
            for rank in ['all','top1','top2']:
                x=g[rank]
                rows.append([name,g['group'],rank,x['selections'],x['winners'],pct(x['strike']),fmt(x['expected']),fmt(x['actualModel']),fmt(g['runnerLogLoss']) if rank=='all' else '—'])
    table(['Model','Pre-race group','Ranks','Runners / selections','Winners','Strike','Expected','A/M','All-group binary LL'],rows)
    add(interpretation+'\n')
context('Speed Reliability','reliability','The unchanged `assessJumpSpeedReliability` helper counts usable Jump figures in the eligible all-code L3 window: HIGH=3, MEDIUM=2, LOW=0–1; Flat/AW and unavailable figures occupy slots. These are reconstructed historical assessments, not backfilled annotations in the prospective ledger. MEDIUM Top2 A/M improves 0.904→0.999; LOW improves 0.720→0.818 but remains overestimated. LOW Top2 winners fall 71→63 because fewer LOW runners are selected. This is an improvement in probability pricing, not a complete solution to sparse-history ranking.')
add('### Fixed MEDIUM/LOW pooled comparison\n')
pooled={}
for m in ['current','shadow']:
    rr=[r for race in pred[m] for r in race['runners'] if r['reliability'] in ['MEDIUM','LOW']]
    pooled[m]={rank:aggregate([r for r in rr if rank=='all' or r['rank']<=(1 if rank=='top1' else 2)])for rank in ['all','top1','top2']}
table(['Model','Ranks','n','Winners','Strike','Expected','A/M'],[[m,k,x['selections'],x['winners'],pct(x['strike']),fmt(x['expected']),fmt(x['actualModel'])]for m in pooled for k,x in pooled[m].items()])
context('OR Rank','orRank','Competition OR rank is computed from the full cached pre-race field, including subsequent non-runners; ties share rank and missing OR stays missing. Model scoring subsequently excludes non-runners. This preserves the existing frozen-field context convention. Rank-1/2–3/4+ comparisons are descriptive; no new OR threshold was chosen. Top2 A/M moves closer to one in each known OR bucket: rank 1, 0.871→0.975; rank 2–3, 0.888→0.964; rank 4+, 0.858→0.983. The candidate selects fewer high-OR winners and more rank-4+ winners, while missing-OR Top2 A/M deteriorates from 0.950 to 0.903.')
context('Completion History','completion','Only explicit latest pre-target result status/position is used. Known non-completion includes PU and other started failures; missing stays separate. Recent non-completion Top2 A/M improves 0.573→0.715, but Top1 remains only 0.518: material residual overconfidence persists. The selected candidate does not introduce an explicit completion coefficient, because the representation that included it did not win 2025 validation.')
context('Chase Experience','priorChase','Buckets are the requested fixed 0 / 1–2 / 3+ observed prior Chase starts. There are no imputed lifetime counts. These rows show complete observed-source coverage but do not prove complete career capture. No cut-off was fitted. Top2 A/M improves for 1–2 observed starts (0.943→1.029) and 3+ (0.874→0.989), but zero-prior-Chase Top2 A/M remains poor and slightly worsens (0.769→0.746). The candidate therefore does not solve the new-chaser weakness.')
add('For runner-defined groups, mixed-field race log loss has no non-overlapping race denominator. The tables therefore show all-group binary runner LL explicitly, alongside selection strike and A/M; they do not relabel it as race LL. Complete race log loss is reserved for race-defined chronology and handicap tables.\n')
add('## Calibration\n')
table(['Model','Fixed probability band','Runners','Expected winners','Actual winners','A/M'],[[name,x['band'],x['selections'],fmt(x['expected']),x['winners'],fmt(x['actualModel'])]for name,key in [('Current','current'),('Shadow','shadow')]for x in h[key]['overall']['calibration']])
add('The largest improvement is reduced overconfidence above 30%: A/M 0.780→0.915. Overall fixed-band ECE roughly halves. Band membership changes with model probabilities, so the model-specific bands are not matched runner cohorts. No calibration transform was tuned on 2026.\n')
add('## Rank Disagreement\n')
table(['Rank1 agreement','Model','Races','Top1 winners','Strike','Expected','A/M'],[['different' if d['disagree'] else 'same',name,d[key]['races'],d[key]['top1']['winners'],pct(d[key]['top1']['strike']),fmt(d[key]['top1']['expected']),fmt(d[key]['top1']['actualModel'])]for d in h['disagreement']for name,key in [('Current','current'),('Shadow','shadow')]])
add('Rank1 changes in 371 / 1,220 races (30.41%). On those races the shadow finds 87 winners versus 69 for current. On the 849 agreement races both find 234, while the shadow assigns less probability and is better calibrated. Behaviour changes are therefore substantive, not just a uniform calibration rescale.\n')
add('## Longer-Price Context\n')
add('Genuine prices come only from existing `validValueCapture` Chase Value books, captured before scheduled off with the expected epoch/schema/scorer and canonical settled outcomes. Prices are matched by exact race ID + runner ID; no SP is substituted. Both models have the same **46 price-covered races / 92 Top2 selections**. The comparison recomputes historical ranks from cached starter fields; the shadow did not exist when these prices were captured. These are retrospective selections at genuine prospective quotes, not a prospective shadow track record or a replacement for frozen primary-book reporting.\n')
price_rows=[]
for name,key in [('Current','current'),('Shadow','shadow')]:
    p=h[key]['prices']
    for label,k in [('All matched Top2','all'),('Top2 captured price >6.00','over6')]:
        x=p[k];price_rows.append([name,label,x['n'],x['winners'],pct(x['winners']/x['n'] if x['n'] else None),pct(x['roi'])])
table(['Model','Sample','Settled','Winners','Strike','Captured ROI'],price_rows)
# Rank-specific genuine captured >6 samples, including stored settlement semantics.
pricebooks={r['raceId']:r for r in datasets['2026']['prices']}
rank_price=[]
for name,key in [('Current','current'),('Shadow','shadow')]:
    for rank in [1,2]:
        matched=[]
        for race in pred[key]:
            book=pricebooks.get(race['raceId'])
            if not book: continue
            quotes={r['runnerId']:r for r in book['runners']}
            for r in race['runners']:
                q=quotes.get(r['runnerId'])
                if r['rank']==rank and q and q['marketPrice']>6 and q['outcome'] and q['outcome']['status']=='settled' and q['outcome']['profitLoss'] is not None:
                    matched.append((r,q))
        n=len(matched);w=sum(r['won'] for r,q in matched)
        rank_price.append([name,rank,n,w,pct(w/n if n else None),pct(sum(q['outcome']['profitLoss'] for r,q in matched)/n if n else None)])
table(['Model','Rank, captured >6','Settled','Winners','Strike','Captured ROI'],rank_price)
add('No price-covered October result influenced the fit. The shadow >6 sample is 28 selections with two winners and negative ROI; it is insufficient to infer a profitable longer-price strategy. SP returns are separately labelled in Current Model Comparison.\n')
add('## Classification\n')
add('**D — CLEAR HOLDOUT IMPROVEMENT — PROSPECTIVE SHADOW JUSTIFIED.** This classification rests on lower log loss in every quarter, lower Brier, substantially better fixed-band calibration and selection A/M, and modest aggregate ranking improvement. Paired race log-loss uncertainty excludes zero. It does **not** assert statistically resolved Top1/Top2 gains, uniformly better subgroups, positive ROI or production readiness. Non-handicap strikes, new chasers and recent jumping failure remain mixed. This is sufficient to justify a prospective shadow, while setting a higher bar for any later live change.\n')
add('## Recommended Next Action\n')
add('**C — run this exact frozen CHASE_SHADOW_V1 prospectively alongside JUMP_TISSUE_V1.** Preserve its features and parameters and assess fresh, dated full-field predictions with genuine captures. No alternative model, additional tuning exercise or live replacement is recommended here. Implementation/activation is outside this completed retrospective evaluation.\n')
add('## Verification and Reproduction\n')
add('Added standalone research scripts only. Database sessions enforced `default_transaction_read_only=on`; no sync, settlement update, database write, tracker backfill, live scorer, Today UI or racecard modification was executed. All pre-existing protected source/research files were compared byte-for-byte with start-of-task hashes; see [verification.json](/tmp/chase-shadow-v1/verification.json).\n')
add('Validation: TypeScript strict typecheck passed; targeted ESLint passed; 31 existing settlement and Speed reliability tests passed. Independent artifact checks verify common fields, race sums, outcome denominators, frozen hashes and non-finisher inclusion. No application build was needed because the app was unchanged.\n')
add('Run order (in a fresh output directory, retaining compatible input caches): protocol declaration → `bun --env-file=.env.local scripts/extract-chase-shadow-v1.ts 2025` → `bun scripts/evaluate-chase-shadow-v1.ts develop` → `bun --env-file=.env.local scripts/extract-chase-shadow-v1.ts 2026` → `bun scripts/evaluate-chase-shadow-v1.ts holdout` → `python3 scripts/report-chase-shadow-v1.py`. Development and holdout artifacts use exclusive writes to prevent accidental replacement; reproducing requires a separate empty directory or deliberate archival, not silently overwriting the evaluated model. The extractor currently names the local compatible 2026 cache under `/tmp/chase-non-summer-cache`; the source files and their hashes must be preserved with this report.\n')
add('## Exact Frozen Parameters\n')
table(['Input (ordered)','Mean','Scale','Weight'],[[n,repr(mu),repr(sd),repr(w)]for n,mu,sd,w in zip(f['model']['names'],f['model']['means'],f['model']['scales'],f['model']['weights'])])
path=pathlib.Path('/tmp/chase-shadow-v1-development-and-holdout.md')
path.write_text('\n'.join(lines)+'\n')

summary=[]
def out(k,v): summary.extend([k+':',v,''])
out('CURRENT MODEL','JUMP_TISSUE_V1');out('CANDIDATE','CHASE_SHADOW_V1')
train=next(c for c in dev if c['set']==f['set'])
out('2025 TRAINING',f"Jan–Sep: {train['train']['races']} races / {train['train']['runners']} runners; full-2025 final refit: 1698 races / 13077 runners")
out('2025 VALIDATION',f"Oct–Dec: {train['validation']['races']} races / {train['validation']['runners']} runners; LL {fmt(train['validation']['logLoss'])}, ECE {pct(train['validation']['ece'])}")
out('FEATURE COUNT',str(len(f['model']['names'])));out('2026 HOLDOUT RACES',str(a['races']))
for name,m in [('CURRENT','current'),('SHADOW','shadow')]:
    for rank in ['top1','top2']:
        x=h[m]['overall'][rank]
        out(name+' '+rank.upper(),f"strike {pct(x['strike'])} / A-M {fmt(x['actualModel'])} / race log loss {fmt(h[m]['overall']['logLoss'])}; {x['winners']}/{x['selections']} selections"+(f"; race capture {pct(h[m]['overall']['top2RaceCapture'])}" if rank=='top2' else ''))
for name,m in [('CURRENT','current'),('SHADOW','shadow')]:
    out(name+' CALIBRATION',f"ECE {pct(h[m]['overall']['ece'])}; 30%+ A/M {fmt(h[m]['overall']['calibration'][-1]['actualModel'])}")
for label,g in [('HANDICAP','handicap'),('NON-HANDICAP','non_handicap')]:
    out(label,'; '.join(f"{m}: n={x['races']}, top1={pct(x['top1']['strike'])}, top2 race capture={pct(x['top2RaceCapture'])}, LL={fmt(x['logLoss'])}"for m in ['current','shadow']for x in h[m]['handicap']if x['group']==g))
out('HIGH RELIABILITY','; '.join(f"{m} top2 A/M {fmt(next(x for x in h[m]['contexts']['reliability'] if x['group']=='HIGH')['top2']['actualModel'])}"for m in ['current','shadow']))
out('MEDIUM/LOW','; '.join(f"{m} top2 A/M {fmt(pooled[m]['top2']['actualModel'])}"for m in ['current','shadow']))
out('RANK1 DISAGREEMENT','371 races; shadow 87 winners vs current 69')
out('CLASSIFICATION','D — CLEAR HOLDOUT IMPROVEMENT — PROSPECTIVE SHADOW JUSTIFIED')
out('RECOMMENDED NEXT ACTION','C — run frozen CHASE_SHADOW_V1 prospectively alongside current model; not activated by this analysis')
for label in ['PRODUCTION MODEL CHANGED','TODAY PAGE CHANGED','TRACKER CHANGED','DATABASE CHANGED']:out(label,'NO')
text='\n'.join(summary)
(ROOT/'terminal-summary.txt').write_text(text+'\n')
print(text)
print('REPORT:',path)
