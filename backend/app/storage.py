"""Small SQLite store. Photos and model files remain outside public static roots."""

import json
import sqlite3
from pathlib import Path
from threading import RLock


class Store:
    def __init__(self, data_dir: Path):
        self.directory = data_dir.resolve()
        self.directory.mkdir(parents=True, exist_ok=True, mode=0o700)
        self.path = self.directory / "research.sqlite3"
        self.lock = RLock()
        with self.connect() as connection:
            connection.execute("CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, owner TEXT NOT NULL, payload TEXT NOT NULL)")
            connection.execute("CREATE INDEX IF NOT EXISTS sessions_owner ON sessions(owner)")

    def connect(self):
        connection = sqlite3.connect(self.path, timeout=30)
        connection.execute("PRAGMA journal_mode=WAL")
        return connection

    def list(self, owner: str):
        with self.connect() as connection:
            rows = connection.execute("SELECT payload FROM sessions WHERE owner=?", (owner,)).fetchall()
        return sorted((json.loads(row[0]) for row in rows), key=lambda value: value["updated_at"], reverse=True)

    def get(self, owner: str, session_id: str):
        with self.connect() as connection:
            row = connection.execute("SELECT payload FROM sessions WHERE owner=? AND id=?", (owner, session_id)).fetchone()
        return json.loads(row[0]) if row else None

    def put(self, owner: str, session: dict):
        payload = json.dumps(session, allow_nan=False, separators=(",", ":"))
        with self.connect() as connection:
            connection.execute("INSERT INTO sessions(id,owner,payload) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload WHERE owner=excluded.owner", (session["id"], owner, payload))

    def delete(self, owner: str, session_id: str):
        with self.connect() as connection:
            connection.execute("DELETE FROM sessions WHERE owner=? AND id=?", (owner, session_id))
