import importlib.util
import json
from pathlib import Path
import sys
import tempfile
import time
import unittest

SPEC = importlib.util.spec_from_file_location("voice_studio_api", Path(__file__).parents[1] / "api.py")
api = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = api
SPEC.loader.exec_module(api)


def multipart(fields, files):
    boundary = "manix-test-boundary"
    body = bytearray()
    for name, value in fields.items():
        body.extend(f'--{boundary}\r\nContent-Disposition: form-data; name="{name}"\r\n\r\n{value}\r\n'.encode())
    for name, value in files.items():
        body.extend(f'--{boundary}\r\nContent-Disposition: form-data; name="{name}"; filename="../../private.wav"\r\nContent-Type: audio/wav\r\n\r\n'.encode())
        body.extend(value); body.extend(b"\r\n")
    body.extend(f"--{boundary}--\r\n".encode())
    return f"multipart/form-data; boundary={boundary}", bytes(body)


class IdleStudio(api.Studio):
    def _worker(self):
        pass


class FormTests(unittest.TestCase):
    def test_text_and_utf8_reference(self):
        content_type, body = multipart({"mode": "text", "consent": "true", "text": "Bonjour, c’est ma voix."}, {"reference": b"private-audio"})
        fields, files = api.parse_multipart(content_type, body)
        self.assertEqual(fields["text"], "Bonjour, c’est ma voix.")
        self.assertEqual(files, {"reference": b"private-audio"})

    def test_missing_consent_is_forbidden(self):
        content_type, body = multipart({"mode": "audio"}, {"reference": b"a", "source": b"b"})
        with self.assertRaises(api.UserError) as error:
            api.parse_multipart(content_type, body)
        self.assertEqual(error.exception.status, 403)

    def test_modes_cannot_mix_source_and_text(self):
        content_type, body = multipart({"mode": "text", "consent": "true", "text": "Bonjour"}, {"reference": b"a", "source": b"b"})
        with self.assertRaises(api.UserError):
            api.parse_multipart(content_type, body)

    def test_text_limit(self):
        content_type, body = multipart({"mode": "text", "consent": "true", "text": "a" * 401}, {"reference": b"a"})
        with self.assertRaises(api.UserError):
            api.parse_multipart(content_type, body)

    def test_no_upload_paths_or_empty_files(self):
        content_type, body = multipart({"mode": "audio", "consent": "true"}, {"reference": b"", "source": b"b"})
        with self.assertRaises(api.UserError):
            api.parse_multipart(content_type, body)


class JobTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        root = Path(self.temp.name)
        self.config = api.Config(root, root / "data", root / "piper", root / "model")
        self.studio = IdleStudio(self.config)
        self.studio.health = lambda: {"ready": True}

    def tearDown(self):
        self.studio.close()
        self.temp.cleanup()

    def create(self):
        return self.studio.create({"mode": "text", "text": "Ma voix privée"}, {"reference": b"private-reference"})

    def test_job_id_is_secret_and_inputs_not_public(self):
        job = self.create()
        self.assertRegex(job.id, r"^[A-Za-z0-9_-]{43}$")
        data = self.studio.public_job(job.id)
        self.assertEqual(data["status"], "queued")
        self.assertNotIn("reference", json.dumps(data))
        self.assertNotIn("Ma voix privée", json.dumps(data))
        with self.assertRaises(api.UserError):
            self.studio.public_job("../etc/passwd")

    def test_delete_removes_private_files_and_capability(self):
        job = self.create()
        directory = self.studio._directory(job.id)
        self.studio.delete(job.id)
        self.assertFalse(directory.exists())
        with self.assertRaises(api.UserError) as error:
            self.studio.public_job(job.id)
        self.assertEqual(error.exception.status, 404)

    def test_expired_job_unavailable(self):
        job = self.create()
        job.created_at = time.time() - api.TTL_SECONDS - 1
        with self.assertRaises(api.UserError):
            self.studio.public_job(job.id)

    def test_restart_drops_uploads_and_marks_interruption(self):
        job = self.create()
        restarted = IdleStudio(self.config)
        try:
            self.assertEqual(restarted.public_job(job.id)["status"], "failed")
            self.assertFalse((restarted._directory(job.id) / "reference.upload").exists())
            self.assertFalse((restarted._directory(job.id) / "text.txt").exists())
        finally:
            restarted.close()

    def test_rate_limit(self):
        for _ in range(3):
            self.studio.rate_limit("192.0.2.1")
        with self.assertRaises(api.UserError) as error:
            self.studio.rate_limit("192.0.2.1")
        self.assertEqual(error.exception.status, 429)
        self.studio.rate_limit("192.0.2.2")

    def test_bounded_queue(self):
        for _ in range(4):
            self.create()
        with self.assertRaises(api.UserError) as error:
            self.create()
        self.assertEqual(error.exception.status, 429)


if __name__ == "__main__":
    unittest.main()
