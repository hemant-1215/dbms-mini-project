# MongoDB monitoring collection

Database: `ai_crms_monitoring`. Collection: `monitoring_events`.

Each document contains a stable event ID, timestamp, nullable relational IDs, event type, severity, human-readable message, metadata object, 384-number normalized embedding, and model identifier `Xenova/all-MiniLM-L6-v2`. MySQL owns relational entity records; MongoDB stores telemetry observations only.

The collection validator is strict. Standard indexes support time, job-time, and project-severity-time queries. A MongoDB Vector Search index applies pre-filters on project, severity, and event type before similarity ranking.

The selected Atlas Local preview image provides a single-node local Search/Vector Search environment for development and testing. Compose pins the tested image digest for reproducible classroom demos. MongoDB documents this local image as a development/testing option, not a production deployment target.
