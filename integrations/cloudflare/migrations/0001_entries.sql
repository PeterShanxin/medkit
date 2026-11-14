CREATE TABLE entries (
  namespace TEXT NOT NULL,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  revision TEXT NOT NULL,
  PRIMARY KEY (namespace, key)
);
CREATE TABLE namespaces (namespace TEXT PRIMARY KEY, revision TEXT NOT NULL);
CREATE TABLE transaction_guard (
  id TEXT PRIMARY KEY,
  valid INTEGER NOT NULL CONSTRAINT medkit_transaction_valid CHECK (valid = 1)
);
CREATE TRIGGER entries_insert AFTER INSERT ON entries BEGIN
  INSERT INTO namespaces VALUES (NEW.namespace, lower(hex(randomblob(16))))
  ON CONFLICT(namespace) DO UPDATE SET revision=excluded.revision;
END;
CREATE TRIGGER entries_update AFTER UPDATE ON entries BEGIN
  INSERT INTO namespaces VALUES (NEW.namespace, lower(hex(randomblob(16))))
  ON CONFLICT(namespace) DO UPDATE SET revision=excluded.revision;
END;
CREATE TRIGGER entries_delete AFTER DELETE ON entries BEGIN
  INSERT INTO namespaces VALUES (OLD.namespace, lower(hex(randomblob(16))))
  ON CONFLICT(namespace) DO UPDATE SET revision=excluded.revision;
END;

CREATE INDEX entries_expiry ON entries(json_extract(value,'$.expiresAt')) WHERE namespace IN ('sessions','oauth-pending','oauth-codes','oauth-access','oauth-refresh');
