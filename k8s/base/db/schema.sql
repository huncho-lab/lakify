-- Runs once, when the PostgreSQL data directory is first created
-- (mounted at /docker-entrypoint-initdb.d by the StatefulSet).
CREATE TABLE IF NOT EXISTS listings (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title       TEXT        NOT NULL,
    address     TEXT        NOT NULL,
    district    TEXT        NOT NULL,
    rent        INTEGER     NOT NULL CHECK (rent > 0),      -- forints per month
    size        NUMERIC     NOT NULL CHECK (size > 0),      -- square metres
    rooms       INTEGER     NOT NULL CHECK (rooms >= 1),
    description TEXT        NOT NULL DEFAULT '',
    photos      JSONB       NOT NULL,                       -- list of image URLs / data URLs
    proof       JSONB,                                      -- proof of ownership, or NULL
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS listings_created_at_idx ON listings (created_at DESC);
