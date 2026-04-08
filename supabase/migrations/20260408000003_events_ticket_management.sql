ALTER TABLE events
    ADD COLUMN ticket_management TEXT NOT NULL DEFAULT 'internal'
    CHECK (ticket_management IN ('internal', 'external'));
