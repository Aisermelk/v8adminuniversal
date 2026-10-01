-- V8 Admin Universal — relação N:N entre clientes e projetos
-- Seguro para executar mais de uma vez.
CREATE TABLE IF NOT EXISTS client_project (
  client_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member',
  created_at TEXT NOT NULL,
  PRIMARY KEY (client_id, project_id),
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_client_project_project
  ON client_project(project_id);

INSERT OR IGNORE INTO client_project (client_id, project_id, role, created_at)
SELECT client_id, id, 'owner', COALESCE(created_at, datetime('now'))
FROM projects
WHERE client_id IS NOT NULL AND client_id <> '';
