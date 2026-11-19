CREATE TABLE projects (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name         VARCHAR(150) NOT NULL,
    key          VARCHAR(5)   NOT NULL UNIQUE CHECK (key ~ '^[A-Z]{2,5}$'),
    description  TEXT,
    color        VARCHAR(7)   NOT NULL DEFAULT '#6366F1',
    icon         VARCHAR(10),
    owner_id     UUID         NOT NULL REFERENCES users(id),
    task_counter INT          NOT NULL DEFAULT 0,
    archived_at  TIMESTAMPTZ,
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ  NOT NULL DEFAULT now()
);
