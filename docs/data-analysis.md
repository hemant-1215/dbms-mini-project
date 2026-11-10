# Data analysis

The analytics screen reads live results for project costs, GPU utilization, CPU utilization, queued/running/failed jobs, and available GPUs. `db/queries/q1_chargeback_ranking.sql` ranks project chargeback and computes share of fleet cost. `q2_scheduler_candidates.sql` exposes scheduler eligibility and server load. `q3_failure_trend.sql` computes seven-day rolling failure rates and prior status transition timing.

## Local seeded run

The deterministic fixture loaded 25 projects, 300 jobs, 40 GPUs, 100,000 resource-usage samples, and 2,000 monitoring events. The live validation also created one zero-job QA project for API ownership checks, so the overview endpoint reported 26 projects. The results below are from that run on 2026-11-10; synthetic workload values are for demonstrating the dashboard and query behavior.

- Total estimated chargeback was ₹310,293.29. The five highest-spend projects represented 51.12% of the total. `Research project 08` ranked first at ₹72,188.59 (23.26%); the next four ranked projects contributed 9.88%, 8.44%, 5.30%, and 4.24%.
- Job status counts were 192 completed, 38 failed, 36 queued, 15 cancelled, 12 scheduled, and 7 running. The 19 scheduled/running jobs account for 19 GPUs that were not available; the overview showed 21 available GPUs.
- The seven-day failure trend returned 70 server-day rows, with failures on 17 rows. That is a presence count, not a fleet-wide failure probability, because each row aggregates jobs allocated to one server on one UTC day.
- Across 64 observed hourly buckets, the unweighted mean GPU utilization was 60.18% and CPU utilization was 57.63%. The fleet inventory view separately reported 16.78% average utilization across GPUs; these figures use different aggregation windows and denominators.
- The five-iteration local index benchmark found the `(job_id, recorded_at)` usage index reduced median query time from 9.703 ms to 0.747 ms for job 1. The 300-row job-status and two-row history comparisons were too small to show a reliable benefit; their indexed medians were 0.384 ms and 0.212 ms.

These values are evidence from one local run and should not be treated as production capacity or billing forecasts. The sample benchmark CSV is saved under `benchmark/results/`.
