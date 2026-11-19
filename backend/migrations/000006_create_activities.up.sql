CREATE TABLE activities (
    id          BIGSERIAL PRIMARY KEY,
    project_id  UUID        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    task_id     UUID        REFERENCES tasks(id) ON DELETE CASCADE,
    user_id     UUID        NOT NULL REFERENCES users(id),
    action      VARCHAR(30) NOT NULL,
    metadata    JSONB       NOT NULL DEFAULT '{}',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_activities_project ON activities(project_id, created_at DESC);
CREATE INDEX idx_activities_task    ON activities(task_id, created_at DESC);
