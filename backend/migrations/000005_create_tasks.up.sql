CREATE TABLE tasks (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id    UUID         NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    number        INT          NOT NULL,
    title         VARCHAR(200) NOT NULL,
    description   TEXT,
    status        VARCHAR(15)  NOT NULL DEFAULT 'todo'
                  CHECK (status IN ('todo', 'in_progress', 'in_review', 'done')),
    priority      VARCHAR(10)  NOT NULL DEFAULT 'medium'
                  CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
    labels        TEXT[]       NOT NULL DEFAULT '{}' CHECK (cardinality(labels) <= 5),
    position      DOUBLE PRECISION NOT NULL DEFAULT 0,
    assignee_id   UUID         REFERENCES users(id) ON DELETE SET NULL,
    created_by    UUID         NOT NULL REFERENCES users(id),
    start_date    DATE,
    due_date      DATE,
    completed_at  TIMESTAMPTZ,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
    UNIQUE (project_id, number),
    CHECK (due_date IS NULL OR start_date IS NULL OR due_date >= start_date)
);
CREATE INDEX idx_tasks_project_status ON tasks(project_id, status, position);
CREATE INDEX idx_tasks_assignee       ON tasks(assignee_id);
CREATE INDEX idx_tasks_due_date       ON tasks(due_date);
CREATE INDEX idx_tasks_title_trgm     ON tasks USING gin (title gin_trgm_ops);
