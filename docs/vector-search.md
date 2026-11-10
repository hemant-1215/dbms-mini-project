# Semantic vector search

Monitoring messages are embedded with the `Xenova/all-MiniLM-L6-v2` model through Transformers.js in the API process. The resulting normalized vectors have 384 dimensions and use cosine similarity. Query and event embeddings share the same model ID.

MongoDB stores the vector and metadata in `monitoring_events`. The API executes `$vectorSearch` as the first aggregation stage. Project IDs allowed for the user are resolved from MySQL and passed into the vector stage filter, before results are returned. Admin users may search across projects.

`docker compose exec api node dist/scripts/eval-search.js` evaluates 30 labelled natural-language prompts after the Atlas Local index reports `READY`. It reports Precision@5, Recall@5, and MRR. The labels are the seeded synthetic event types; Recall@5 is normalized by the smaller of five or the positive documents in that class. No keyword fallback is used.
