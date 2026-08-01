"""Verify that the local awareness artifact matches its checked metadata."""

import hashlib
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
MODEL_DIR = ROOT / "models_store"
METADATA_PATH = MODEL_DIR / "phishing_awareness_v1.metadata.json"


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as artifact:
        for chunk in iter(lambda: artifact.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def main() -> None:
    if not METADATA_PATH.is_file():
        raise SystemExit(f"Missing model metadata: {METADATA_PATH}")
    metadata = json.loads(METADATA_PATH.read_text())
    artifact = MODEL_DIR / metadata["artifact"]
    if not artifact.is_file():
        raise SystemExit(f"Missing model artifact: {artifact}")
    actual = sha256(artifact)
    expected = metadata["artifact_sha256"]
    if actual != expected:
        raise SystemExit(
            f"Model checksum mismatch\nExpected: {expected}\nActual:   {actual}"
        )
    print(f"Model ready: {metadata['model_version']} ({actual})")


if __name__ == "__main__":
    main()
