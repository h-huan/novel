# Executable quality controls

Based on main `2ee2231e45fb356b6e4cb67eb6c7fa9f029fcded`.

## Character contracts

The context compiler compiles existing character/profile fields into schema version 1 contracts. `profile_json.voiceContract` supports sentenceLength, speechRegister, directness, questionFrequency, explanationTolerance, preferredVocabulary, forbiddenVocabulary, catchphrases, speechRhythm, toneToDifferentPeople, authorityBehavior, dangerBehavior, betrayalBehavior, intimacyBehavior, conflictBehavior, weakPersonBehavior, moralBoundary and behaviorForbidden. Existing extended profile fields remain supported. Missing values stay unknown. The version is a SHA-256 of canonical contract content.

Explicit named speech/actions are extracted conservatively; ambiguous and pronoun-only attributions are excluded. Forbidden vocabulary has an executable check. Semantic violations must identify the character, contract version, contract field and literal attributed evidence. Numerical preferences and behavioral prose are also supplied to the semantic judge, not inferred from keywords.

## Repairs and scores

Four registry executors use different instructions and scope limits: voice (four patches/15%, attributed actor only), scene (three/30%, within scene boundaries), platform (six/20%, deterministic platform issue reduction required), and local replacement (eight/30%, issue evidence only). All retain uniqueness, overlap, structured-output validation, full recheck, comparison and rollback. Scene/voice meaning preservation is enforced by recheck, not claimed as a deterministic property of text edits.

Strategy history is matched to rule ID, platform, genre, story type, model and prompt version. At least five matching attempts are required for a candidate; otherwise use the deterministic default. Accepted rates are penalized by introduced issues.

Scores use positive dimension weights. Context, logic, character voice and world rules default to a 70 floor; an evidenced floor violation blocks even if the weighted score is high. Missing applicable dimensions keep the score unknown. `qualityPolicy` on project create/update can override weights/floors; defaults vary for short/long stories and Fanqie. Aggregated reports retain blocked status.

## Context and AI Trace

Dependency selection precedes recency: explicit outline characters/foreshadowings, outstanding foreshadowings, character-linked/world-wide rules and chapter rule tasks, timeline participants and causal ancestors, location/organization data and confirmed states. Recent chapters fill remaining space. Contracts are never partially clipped; oversized contracts can be omitted with a truncation notice. Other long fields can be clipped. The valid JSON snapshot includes truncation diagnostics and has a hard 4K–48K character budget (default 16K/24K), plus a stable content hash.

Scene beat sequences, dialogue function distributions and show/explain proxies are computed across scenes and prior chapters. `unknown` dialogue functions and absent evidence remain explicit. These are heuristic risks, not AI probabilities or semantic verdicts. The semantic judge sees the comparison evidence; accepted semantic issues drive registry selection. Reports and the cockpit expose contracts, attribution coverage, context version, policy, model distributions and risks.

## Benchmark API

Existing sample/annotation/evaluation APIs remain available. Samples accept `chapterIndex` as context scope and `sourceRef` as source provenance.

- `POST /api/v1/generation-metrics/benchmark/run`: `{ projectId?, sampleIds?: string[], repair?: boolean }` (maximum 20 selected samples per invocation).
- `GET /api/v1/generation-metrics/benchmark/runs?projectId=...`: persistent execution status and results.

Only labeled samples with a nonempty source reference are eligible. A valid project with matching platform/story type is required. The runner invokes the production assessor without showing it human labels. Incomplete/failed reviews are recorded as failures, not perfect predictions. Results include predicted labels, precision/recall, FP/FN and optional repair acceptance/introduced issues. Benchmark repairs never overwrite live chapters, reports or learning records. No eligible samples returns `waiting_for_real_samples` and no invented evaluation. Tests use isolated in-memory fixtures; their numbers are not real benchmark performance.

## Migrations and verification

`001_initial` is the complete schema for a fresh database. Existing databases run one fixed, idempotent `schema-reconciler` on startup; it adds only missing structures and records the current schema version in a singleton metadata row. Future schema work updates this same reconciler instead of adding `002`, `003`, and further numbered files. Historical numbered records are collapsed to the single `001` baseline without deleting business data. Both the baseline and reconciler run transactionally and fail fast.

Automated checks cover contract attribution, critical floors, distant dependency retrieval beyond 1,000 chapters/100 characters, pathological budget limits, conditioned strategy fallback, real SQLite fresh/existing/legacy schema parity, benchmark runner and optional repairs, API validation/empty states and cockpit operation. Run the existing server typecheck/build/unit/acceptance/E2E and desktop typecheck/unit/build/quality E2E commands; CI executes the same matrix.
