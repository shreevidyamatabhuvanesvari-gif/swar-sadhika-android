#!/usr/bin/env python3
"""Read-only validator for the browser-based Swar-Sadhika progress.json."""

from __future__ import annotations
import argparse
import json
import re
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

SCHEMA_VERSION = 1
VALID_STATUSES = {"NOT_STARTED", "IN_PROGRESS", "PASS", "FAIL", "BLOCKED"}
REQUIRED_MODULE_IDS = {
    "index_panel", "local_model_loading", "hindi_female_tts",
    "sanskrit_pronunciation", "chant_prosody", "audio_generation_playback",
    "audio_save_share", "video_import", "caption_sync", "video_full_duration",
    "lip_sync", "body_language", "mp4_export", "offline_operation",
    "privacy_permissions",
}
REQUIRED_ROOT_FIELDS = {"schemaVersion", "buildLabel", "lastUpdated", "lastTestNote", "features"}
REQUIRED_FEATURE_FIELDS = {
    "id", "name", "status", "progress", "summary",
    "testEnvironment", "lastTestAt", "evidence", "blocker",
}
ID_PATTERN = re.compile(r"^[a-z][a-z0-9_]*$")


class ValidationError(Exception):
    pass


def reject_duplicate_keys(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValidationError(f"JSON में duplicate key मिली: {key}")
        result[key] = value
    return result


def meaningful_text(value):
    if not isinstance(value, str) or len(value.strip()) < 8:
        return False
    text = value.strip().casefold()
    placeholders = (
        "not tested", "not yet tested", "not available", "not provided",
        "pending", "none", "null", "n/a", "अभी उपलब्ध नहीं",
        "अभी नहीं हुआ", "परीक्षण बाकी", "जाँच बाकी", "दर्ज नहीं", "बाकी है",
    )
    return text not in placeholders and not text.startswith(
        ("not tested", "not yet tested", "not available", "not provided",
         "अभी उपलब्ध नहीं", "अभी नहीं हुआ", "दर्ज नहीं")
    )


def parse_timestamp(value):
    if not isinstance(value, str) or not value.strip():
        return None
    text = value.strip()
    if text.endswith("Z"):
        text = text[:-1] + "+00:00"
    try:
        parsed = datetime.fromisoformat(text)
    except ValueError:
        return None
    return parsed if parsed.tzinfo and parsed.utcoffset() is not None else None


def load_and_validate(path):
    if not path.is_file():
        raise ValidationError(f"आवश्यक फाइल नहीं मिली: {path}")
    try:
        data = json.loads(
            path.read_text(encoding="utf-8-sig"),
            object_pairs_hook=reject_duplicate_keys,
        )
    except (OSError, json.JSONDecodeError) as exc:
        raise ValidationError(f"JSON पढ़ने में त्रुटि: {exc}") from exc
    if not isinstance(data, dict):
        raise ValidationError("Root JSON Object होना चाहिए।")

    errors = []
    missing = sorted(REQUIRED_ROOT_FIELDS - data.keys())
    if missing:
        errors.append("Root fields गायब: " + ", ".join(missing))
    if type(data.get("schemaVersion")) is not int or data.get("schemaVersion") != SCHEMA_VERSION:
        errors.append(f"schemaVersion {SCHEMA_VERSION} होना चाहिए।")
    for field in ("buildLabel", "lastUpdated", "lastTestNote"):
        if not isinstance(data.get(field), str) or not data[field].strip():
            errors.append(f"Root field '{field}' खाली है।")

    features = data.get("features")
    if not isinstance(features, list) or not features:
        errors.append("'features' खाली न होने वाली JSON Array होनी चाहिए।")
        return data, errors

    seen_ids, seen_names = set(), set()
    for index, feature in enumerate(features):
        where = f"features[{index}]"
        if not isinstance(feature, dict):
            errors.append(f"{where}: रिकॉर्ड JSON Object होना चाहिए।")
            continue
        absent = sorted(REQUIRED_FEATURE_FIELDS - feature.keys())
        if absent:
            errors.append(f"{where}: fields गायब: " + ", ".join(absent))
        module_id, name = feature.get("id"), feature.get("name")
        if not isinstance(module_id, str) or not ID_PATTERN.fullmatch(module_id):
            errors.append(f"{where}: अमान्य module id।")
        elif module_id in seen_ids:
            errors.append(f"दोहराया गया module ID: {module_id}")
        else:
            seen_ids.add(module_id)
        if not isinstance(name, str) or not name.strip():
            errors.append(f"{where}: name खाली है।")
        elif name in seen_names:
            errors.append(f"दोहराया गया module name: {name}")
        else:
            seen_names.add(name)

        status, progress = feature.get("status"), feature.get("progress")
        if status not in VALID_STATUSES:
            errors.append(f"{module_id or where}: अमान्य status {status!r}")
        if isinstance(progress, bool) or not isinstance(progress, int) or not 0 <= progress <= 100:
            errors.append(f"{module_id or where}: progress 0 से 100 का पूर्णांक होना चाहिए।")
        if not isinstance(feature.get("summary"), str) or not feature["summary"].strip():
            errors.append(f"{module_id or where}: summary खाली है।")

        for field in ("testEnvironment", "evidence", "blocker"):
            if feature.get(field) is not None and not isinstance(feature.get(field), str):
                errors.append(f"{module_id or where}: {field} String या null होना चाहिए।")
        if feature.get("lastTestAt") is not None and not isinstance(feature.get("lastTestAt"), str):
            errors.append(f"{module_id or where}: lastTestAt String या null होना चाहिए।")

        if status in {"PASS", "FAIL"}:
            if not meaningful_text(feature.get("testEnvironment")):
                errors.append(f"{module_id}: {status} के लिए वास्तविक testEnvironment जरूरी है।")
            timestamp = parse_timestamp(feature.get("lastTestAt"))
            if timestamp is None:
                errors.append(f"{module_id}: timezone सहित ISO-8601 lastTestAt जरूरी है।")
            elif timestamp > datetime.now(timezone.utc) + timedelta(minutes=5):
                errors.append(f"{module_id}: lastTestAt भविष्य का समय नहीं हो सकता।")
            if not meaningful_text(feature.get("evidence")):
                errors.append(f"{module_id}: {status} के लिए वास्तविक evidence जरूरी है।")
        if status == "PASS" and progress != 100:
            errors.append(f"{module_id}: PASS के लिए progress 100 होना चाहिए।")
        if status == "NOT_STARTED" and progress != 0:
            errors.append(f"{module_id}: NOT_STARTED के लिए progress 0 होना चाहिए।")
        if status == "BLOCKED" and not meaningful_text(feature.get("blocker")):
            errors.append(f"{module_id}: BLOCKED स्थिति में blocker का कारण जरूरी है।")

    missing_ids = sorted(REQUIRED_MODULE_IDS - seen_ids)
    if missing_ids:
        errors.append("आवश्यक Web मॉड्यूल IDs गायब: " + ", ".join(missing_ids))
    extra_ids = sorted(seen_ids - REQUIRED_MODULE_IDS)
    if extra_ids:
        errors.append("अनपेक्षित मॉड्यूल IDs: " + ", ".join(extra_ids))
    return data, errors


def main():
    parser = argparse.ArgumentParser(description="Swar-Sadhika Web progress.json की read-only जाँच।")
    parser.add_argument("repository", nargs="?", default=".", help="Repository root folder")
    repo = Path(parser.parse_args().repository).expanduser().resolve()
    if not repo.is_dir():
        print(f"FAIL: Repository folder नहीं मिला: {repo}")
        return 2
    print("Swar-Sadhika Web Progress Validator")
    print(f"Repository: {repo}")
    print("Mode: READ-ONLY (कोई फाइल नहीं बदली जाएगी)\n")
    try:
        data, errors = load_and_validate(repo / "progress.json")
    except ValidationError as exc:
        print(f"FAIL: {exc}")
        return 1
    features = data.get("features", [])
    counts = {status: 0 for status in sorted(VALID_STATUSES)}
    for item in features:
        if isinstance(item, dict) and item.get("status") in counts:
            counts[item["status"]] += 1
    print(f"Modules found: {len(features)}")
    print("Status counts: " + ", ".join(f"{key}={counts[key]}" for key in sorted(counts)))
    if errors:
        print("\nVALIDATION ERRORS:")
        for error in errors:
            print("  - " + error)
        print(f"\nRESULT: FAIL ({len(errors)} error(s))")
        return 1
    print("\nRESULT: PASS — Web progress data संरचनात्मक और नियमों के अनुसार वैध है।")
    print("NOTE: यह दर्ज प्रमाण की वास्तविकता स्वयं सत्यापित नहीं करता।")
    return 0


if __name__ == "__main__":
    sys.exit(main())
