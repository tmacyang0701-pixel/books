"""Exercise real local Git history and byte-for-byte Windows file migration."""
import importlib.util
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

SCRIPT = Path(__file__).resolve().parents[1] / "setup/migrate-repository.py"
SPEC = importlib.util.spec_from_file_location("migration", SCRIPT)
migration = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(migration)


class MigrationTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="books-migration-test-")
        self.addCleanup(self.temp.cleanup)
        self.base = Path(self.temp.name)
        self.source, self.target = self.base / "old books", self.base / "new books"
        for root in (self.source, self.target):
            root.mkdir()
            subprocess.run(["git", "init", "-q", "-b", "main", str(root)], check=True)
            migration.git(root, "config", "user.name", "Migration Test")
            migration.git(root, "config", "user.email", "test@example.invalid")
            migration.git(root, "remote", "add", "origin", "https://example.invalid/books.git")
        (self.source / ".gitignore").write_text(".local/\n.env\n", encoding="utf-8")
        (self.source / "lesson.txt").write_bytes(b"first\r\n")
        migration.git(self.source, "add", ".")
        migration.git(self.source, "commit", "-qm", "initial")
        (self.source / "lesson.txt").write_bytes(b"second\r\n")
        migration.git(self.source, "commit", "-qam", "second")
        (self.source / "lesson.txt").write_bytes(b"uncommitted edit\r\n")
        (self.source / ".local").mkdir()
        (self.source / ".local/data.json").write_text('{"progress":12}', encoding="utf-8")
        (self.source / ".env").write_text("SECRET=fixture-only", encoding="utf-8")
        (self.source / "empty directory").mkdir()
        (self.source / "\u8bfe\u4ef6.txt").write_text("\u7269\u7406\u8bb2\u89e3", encoding="utf-8")
        migration.git(self.target, "config", "migration.keep", "existing-target-setting")
        self.config = (self.target / ".git/config").read_bytes()

    def test_copies_local_data_changes_and_history_keeps_target_git(self):
        report = migration.migrate(self.source, self.target)
        self.assertTrue(report["checksumsVerified"])
        self.assertEqual((self.target / ".git/config").read_bytes(), self.config)
        self.assertEqual(migration.git(self.target, "rev-list", "--count", "HEAD").stdout.strip(), "2")
        for name in migration.inventory(self.source)[0]:
            self.assertEqual((self.source / name).read_bytes(), (self.target / name).read_bytes())
        self.assertTrue((self.target / "empty directory").is_dir())
        self.assertEqual(migration.git(self.source, "status", "--porcelain").stdout,
                         migration.git(self.target, "status", "--porcelain").stdout)
        self.assertEqual(migration.git(self.target, "check-ignore", ".env").stdout.strip(), ".env")
        saved = json.loads((self.target / ".git/books-migration-report.json").read_text(encoding="utf-8"))
        self.assertEqual(len(saved["manifest"]), report["files"])
        self.assertNotIn("fixture-only", json.dumps(saved))

    def test_check_is_read_only(self):
        self.assertEqual(migration.migrate(self.source, self.target, check=True)["status"], "ready")
        self.assertEqual([entry.name for entry in self.target.iterdir()], [".git"])
        self.assertEqual((self.target / ".git/config").read_bytes(), self.config)
        self.assertNotEqual(migration.git(self.target, "rev-parse", "--verify", "HEAD", required=False).returncode, 0)

    def test_existing_target_files_are_never_overwritten(self):
        keep = self.target / "lesson.txt"
        keep.write_bytes(b"target work")
        with self.assertRaisesRegex(RuntimeError, "contains working files"):
            migration.migrate(self.source, self.target)
        self.assertEqual(keep.read_bytes(), b"target work")

    def test_existing_target_commits_are_never_reset(self):
        migration.git(self.target, "commit", "--allow-empty", "-qm", "target history")
        head = migration.git(self.target, "rev-parse", "HEAD").stdout
        with self.assertRaisesRegex(RuntimeError, "already has commits"):
            migration.migrate(self.source, self.target)
        self.assertEqual(migration.git(self.target, "rev-parse", "HEAD").stdout, head)

    def test_different_remotes_are_rejected(self):
        migration.git(self.target, "remote", "set-url", "origin", "https://example.invalid/other.git")
        with self.assertRaisesRegex(RuntimeError, "origin URLs differ"):
            migration.migrate(self.source, self.target)

    def test_nested_target_is_rejected(self):
        nested = self.source / "nested"
        nested.mkdir()
        with self.assertRaisesRegex(RuntimeError, "non-nested"):
            migration.migrate(self.source, nested)

    def test_checksum_failure_keeps_source(self):
        original = (self.source / "lesson.txt").read_bytes()
        real_copy = migration.shutil.copy2

        def corrupted_copy(source, target):
            real_copy(source, target)
            if Path(source).name == "lesson.txt":
                Path(target).write_bytes(b"corrupted")

        with patch.object(migration.shutil, "copy2", side_effect=corrupted_copy):
            with self.assertRaisesRegex(RuntimeError, "checksum failed"):
                migration.migrate(self.source, self.target)
        self.assertEqual((self.source / "lesson.txt").read_bytes(), original)
        self.assertFalse((self.target / ".git/books-migration-report.json").exists())


if __name__ == "__main__":
    unittest.main()
