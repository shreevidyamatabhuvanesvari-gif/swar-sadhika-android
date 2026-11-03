
#!/usr/bin/env python3
"""Validate Swar-Sadhika progress JSON without third-party dependencies.

Run from the repository root:
    python tools/validate_progress.py

Or point to another repository:
    python tools/validate_progress.py /path/to/repository

The validator is read-only. It never edits progress.json or any other file.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

SCHEMA_VERSION = 1
VALID_STATUSES = {"NOT_STARTED", "IN_PROGRESS", "PASS", "FAIL", "BLOCKED"}

# The original 17 project modules. Additional future modules are allowed,
# provided they use a unique ID and follow the same data contract.
REQUIRED_MODULE_IDS = (
    "index_panel",
    "android_launch",
    "local_model_loading",
    "hindi_female_tts",
    "sanskrit_pronunciation",
    "chant_prosody",
    "audio_generation_playback",
    "audio_save_share",
    "video_import",
    "caption_sync",
    "video_full_duration",
    "lip_sync",
    "body_language",
    "mp4_export",
    "offline_operation",
    "privacy_permissions",
    "android_build_install",
)

REQUIRED_FEATURE_FIELDS = {
    "id",
    "name",
    "status",
    "progress",
    "summary",
    "testEnvironment",
    "lastTestAt",
    "evidence",
    "blocker",
}

REQUIRED_ROOT_FIELDS = {
    "schemaVersion",
    "buildLabel",
    "lastUpdated",
    "lastTestNote",
    "features",
}

PLACEHOLDER_PHRASES = (
    "not tested",
    "not yet tested",
    "not available",
    "not provided",
    "pending",
    "none",
    "null",
    "n/a",
    "अभी उपलब्ध नहीं",
    "अभी नहीं हुआ",
    "परीक्षण बाकी",
    "जाँच बाकी",
    "दर्ज नहीं",
    "बाकी है",
)

ID_PATTERN = re.compile(r"^[a-z][a-z0-9_]*$")


class ValidationError(Exception):
    """Raised when a progress file is structurally or semantically invalid."""


def reject_duplicate_keys(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    """Reject duplicate keys instead of silently taking the last value."""
    result: dict[str, Any] = {}

    for key, value in pairs:
        if key in result:
            raise ValidationError(f"JSON में duplicate key मिली: {key}")
        result[key] = value

    return result


def load_json(path: Path) -> dict[str, Any]:
    if not path.is_file():
        raise ValidationError(
            f"आवश्यक फाइल नहीं मिली: {path.as_posix()}"
        )

    try:
        raw = path.read_text(encoding="utf-8-sig")
    except OSError as exc:
        raise ValidationError(
            f"फाइल पढ़ी नहीं जा सकी: {path} ({exc})"
        ) from exc

    try:
        data = json.loads(
            raw,
            object_pairs_hook=reject_duplicate_keys
        )
    except ValidationError:
        raise
    except json.JSONDecodeError as exc:
        raise ValidationError(
            f"JSON Syntax त्रुटि: {path} — "
            f"पंक्ति {exc.lineno}, कॉलम {exc.colno}: {exc.msg}"
        ) from exc

    if not isinstance(data, dict):
        raise ValidationError(
            f"JSON का सबसे बाहरी भाग Object होना चाहिए: {path}"
        )

    return data


def non_empty_string(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def meaningful_text(value: Any) -> bool:
    if not non_empty_string(value):
        return False

    normalized = value.strip().casefold()

    if len(normalized) < 8:
        return False

    # Reject explicit placeholders without rejecting ordinary explanations
    # merely because they mention that work remains to be done.
    exact_placeholders = {
        phrase.casefold() for phrase in PLACEHOLDER_PHRASES
    }

    if normalized in exact_placeholders:
        return False

    if normalized.startswith((
        "not tested",
        "not yet tested",
        "not available",
        "not provided",
        "अभी उपलब्ध नहीं",
        "अभी नहीं हुआ",
        "दर्ज नहीं"
    )):
        return False

    return True


def parse_timezone_timestamp(value: Any) -> datetime | None:
    if not isinstance(value, str) or not value.strip():
        return None

    text = value.strip()

    # Support ISO timestamps ending in Z.
    if text.endswith("Z"):
        text = text[:-1] + "+00:00"

    try:
        parsed = datetime.fromisoformat(text)
    except ValueError:
        return None

    if parsed.tzinfo is None or parsed.utcoffset() is None:
        return None

    return parsed


def validate_test_record(
    feature: dict[str, Any],
    index: int,
    errors: list[str]
) -> None:

    status = feature.get("status")
    module_id = feature.get("id", f"feature[{index}]")
    progress = feature.get("progress")

    # PASS and FAIL both claim that a test was actually performed.
    # Both require test context, timestamp and meaningful evidence.
    if status in {"PASS", "FAIL"}:

        if not meaningful_text(feature.get("testEnvironment")):
            errors.append(
                f"{module_id}: {status} के लिए "
                "testEnvironment का वास्तविक विवरण जरूरी है।"
            )

        timestamp = parse_timezone_timestamp(
            feature.get("lastTestAt")
        )

        if timestamp is None:
            errors.append(
                f"{module_id}: {status} के लिए "
                "timezone सहित ISO-8601 lastTestAt जरूरी है।"
            )

        elif timestamp > datetime.now(timezone.utc) + timedelta(minutes=5):
            errors.append(
                f"{module_id}: lastTestAt भविष्य का समय नहीं हो सकता।"
            )

        if not meaningful_text(feature.get("evidence")):
            errors.append(
                f"{module_id}: {status} के लिए "
                "वास्तविक evidence विवरण जरूरी है।"
            )

    if status == "PASS" and progress != 100:
        errors.append(
            f"{module_id}: PASS के लिए progress ठीक 100 होना चाहिए।"
        )

    if status == "NOT_STARTED" and progress != 0:
        errors.append(
            f"{module_id}: NOT_STARTED के लिए progress 0 होना चाहिए।"
        )

    if status == "BLOCKED" and not meaningful_text(
        feature.get("blocker")
    ):
        errors.append(
            f"{module_id}: BLOCKED स्थिति में "
            "blocker का कारण लिखना जरूरी है।"
        )


def validate_progress_file(
    path: Path
) -> tuple[dict[str, Any], list[str]]:

    data = load_json(path)
    errors: list[str] = []

    missing_root = sorted(
        REQUIRED_ROOT_FIELDS - data.keys()
    )

    if missing_root:
        errors.append(
            "Root JSON fields गायब हैं: "
            + ", ".join(missing_root)
        )

    if type(data.get("schemaVersion")) is not int or (
        data.get("schemaVersion") != SCHEMA_VERSION
    ):
        errors.append(
            f"schemaVersion {SCHEMA_VERSION} होना चाहिए।"
        )

    for field in (
        "buildLabel",
        "lastUpdated",
        "lastTestNote"
    ):
        if not non_empty_string(data.get(field)):
            errors.append(
                f"Root field '{field}' खाली या अनुपस्थित है।"
            )

    features = data.get("features")

    if not isinstance(features, list) or not features:
        errors.append(
            "'features' एक खाली-न-होने वाली JSON Array होनी चाहिए।"
        )
        return data, errors

    seen_ids: set[str] = set()
    seen_names: set[str] = set()

    for index, feature in enumerate(features):

        location = f"features[{index}]"

        if not isinstance(feature, dict):
            errors.append(
                f"{location}: प्रत्येक मॉड्यूल JSON Object होना चाहिए।"
            )
            continue

        missing = sorted(
            REQUIRED_FEATURE_FIELDS - feature.keys()
        )

        if missing:
            errors.append(
                f"{location}: आवश्यक fields गायब हैं: "
                + ", ".join(missing)
            )

        module_id = feature.get("id")
        name = feature.get("name")

        if (
            not isinstance(module_id, str)
            or not ID_PATTERN.fullmatch(module_id)
        ):
            errors.append(
                f"{location}: id छोटे अक्षरों, अंकों "
                "और underscore वाला वैध ID होना चाहिए।"
            )

        elif module_id in seen_ids:
            errors.append(
                f"दोहराया गया module ID: {module_id}"
            )

        else:
            seen_ids.add(module_id)

        if not non_empty_string(name):
            errors.append(
                f"{location}: name खाली या अनुपस्थित है।"
            )

        elif name in seen_names:
            errors.append(
                f"दोहराया गया module name: {name}"
            )

        else:
            seen_names.add(name)

        status = feature.get("status")

        if (
            not isinstance(status, str)
            or status not in VALID_STATUSES
        ):
            errors.append(
                f"{module_id or location}: "
                f"अमान्य status: {status!r}"
            )

        progress = feature.get("progress")

        # bool is a subclass of int in Python.
        if (
            isinstance(progress, bool)
            or not isinstance(progress, int)
            or not 0 <= progress <= 100
        ):
            errors.append(
                f"{module_id or location}: "
                "progress पूर्णांक 0 से 100 के बीच होना चाहिए।"
            )

        if not non_empty_string(feature.get("summary")):
            errors.append(
                f"{module_id or location}: "
                "'summary' खाली नहीं हो सकता।"
            )

        for nullable_field in (
            "testEnvironment",
            "evidence",
            "blocker"
        ):
            value = feature.get(nullable_field)

            if value is not None and not isinstance(value, str):
                errors.append(
                    f"{module_id or location}: "
                    f"'{nullable_field}' String या null होना चाहिए।"
                )

        last_test = feature.get("lastTestAt")

        if last_test is not None and not isinstance(last_test, str):
            errors.append(
                f"{module_id or location}: "
                "'lastTestAt' String या null होना चाहिए।"
            )

        if (
            isinstance(status, str)
            and status in VALID_STATUSES
            and isinstance(progress, int)
            and not isinstance(progress, bool)
        ):
            validate_test_record(feature, index, errors)

    missing_ids = sorted(
        set(REQUIRED_MODULE_IDS) - seen_ids
    )

    if missing_ids:
        errors.append(
            "मूल 17 मॉड्यूल में से ये IDs गायब हैं: "
            + ", ".join(missing_ids)
        )

    return data, errors


def compare_web_and_android(
    root_data: dict[str, Any],
    asset_path: Path
) -> list[str]:
    """Check that root and Android asset contain the same module identities."""

    if not asset_path.exists():
        raise ValidationError(
            f"Android asset नहीं मिली: {asset_path.as_posix()}"
        )

    asset_data, asset_errors = validate_progress_file(asset_path)

    if asset_errors:
        raise ValidationError(
            "Android assets/progress.json में त्रुटियाँ: "
            + " | ".join(asset_errors)
        )

    warnings: list[str] = []

    if (
        asset_data.get("schemaVersion")
        != root_data.get("schemaVersion")
    ):
        warnings.append(
            "वेब और Android progress.json का schemaVersion अलग है।"
        )

    root_features = root_data.get("features", [])
    asset_features = asset_data.get("features", [])

    if not isinstance(asset_features, list):
        return warnings + [
            "Android asset में features JSON Array नहीं है।"
        ]

    root_identity = [
        (item.get("id"), item.get("name"))
        for item in root_features
        if isinstance(item, dict)
    ]

    asset_identity = [
        (item.get("id"), item.get("name"))
        for item in asset_features
        if isinstance(item, dict)
    ]

    if root_identity != asset_identity:
        raise ValidationError(
            "वेब progress.json और Android assets/progress.json "
            "में मॉड्यूल ID/नाम/क्रम समान नहीं हैं।"
        )

    root_states = [
        (item.get("id"), item.get("status"), item.get("progress"))
        for item in root_features
        if isinstance(item, dict)
    ]

    asset_states = [
        (item.get("id"), item.get("status"), item.get("progress"))
        for item in asset_features
        if isinstance(item, dict)
    ]

    if root_states != asset_states:
        warnings.append(
            "वेब और Android progress.json में status/progress "
            "अलग हैं; दोनों प्रतियाँ अपडेट करें।"
        )

    return warnings


def main() -> int:

    parser = argparse.ArgumentParser(
        description=(
            "Swar-Sadhika progress.json की read-only जाँच करें।"
        )
    )

    parser.add_argument(
        "repository",
        nargs="?",
        default=".",
        help="Repository का root folder (डिफ़ॉल्ट: वर्तमान folder)"
    )

    args = parser.parse_args()

    repo = Path(args.repository).expanduser().resolve()

    if not repo.is_dir():
        print(
            f"FAIL: Repository folder नहीं मिला: {repo}"
        )
        return 2

    root_progress = repo / "progress.json"

    android_asset = (
        repo
        / "app"
        / "src"
        / "main"
        / "assets"
        / "progress.json"
    )

    print("Swar-Sadhika Progress Validator")
    print(f"Repository: {repo}")
    print("Mode: READ-ONLY (कोई फाइल बदली नहीं जाएगी)\n")

    try:
        data, errors = validate_progress_file(root_progress)

    except ValidationError as exc:
        print(f"FAIL: {exc}")
        return 1

    warnings: list[str] = []

    if not errors:
        try:
            warnings = compare_web_and_android(
                data,
                android_asset
            )
        except ValidationError as exc:
            errors.append(str(exc))

    features = data.get("features", [])

    counts = {
        status: 0
        for status in sorted(VALID_STATUSES)
    }

    for feature in features:
        if isinstance(feature, dict):
            status = feature.get("status")

            if isinstance(status, str) and status in counts:
                counts[status] += 1

    print(f"Modules found: {len(features)}")

    print(
        "Status counts: "
        + ", ".join(
            f"{key}={counts[key]}"
            for key in sorted(counts)
        )
    )

    if warnings:
        print("\nWARNINGS:")

        for warning in warnings:
            print(f"  - {warning}")

    if errors:
        print("\nVALIDATION ERRORS:")

        for error in errors:
            print(f"  - {error}")

        print(
            f"\nRESULT: FAIL ({len(errors)} error(s))"
        )
        return 1

    print(
        "\nRESULT: PASS — progress data संरचनात्मक "
        "और नियमों के अनुसार वैध है।"
    )

    print(
        "NOTE: यह validator दर्ज प्रमाण की वास्तविकता "
        "स्वयं सत्यापित नहीं करता;"
    )

    print(
        "      प्रमाण की मानवीय/डिवाइस-स्तर पर जाँच "
        "अभी भी आवश्यक है।"
    )

    return 0


if __name__ == "__main__":
    sys.exit(main())
