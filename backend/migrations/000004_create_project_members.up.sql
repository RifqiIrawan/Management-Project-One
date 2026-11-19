CREATE TABLE project_members (
    project_id  UUID        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    user_id     UUID        NOT NULL REFERENCES users(id)    ON DELETE CASCADE,
    role        VARCHAR(10) NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'member')),
    is_favorite BOOLEAN     NOT NULL DEFAULT false,
    joined_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (project_id, user_id)
);
CREATE INDEX idx_members_user ON project_members(user_id);
