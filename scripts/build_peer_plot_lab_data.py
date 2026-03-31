from __future__ import annotations

import argparse
import csv
import json
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

SCALE_ORDER = [
    "Experience of Unity",
    "Spiritual Experience",
    "Blissful State",
    "Insightfulness",
    "Disembodiment",
    "Impaired Control and Cognition",
    "Anxiety",
    "Complex Imagery",
    "Elementary Imagery",
    "Audio-Visual Synesthesia",
    "Changed Meaning of Percepts",
]


def default_input_path() -> Path:
    return (
        Path(__file__).resolve().parents[2]
        / "axp-mvp-survey"
        / "output"
        / "spreadsheet"
        / "axp_legacy_2022_factor_scores_peer_points.csv"
    )


def default_output_dir() -> Path:
    return (
        Path(__file__).resolve().parents[1]
        / "docs"
        / "assets"
        / "peer-plot-data"
    )


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Build public JSON bundles for the peer violin plot lab."
    )
    parser.add_argument(
        "--input",
        type=Path,
        default=default_input_path(),
        help="Path to the public peer-point CSV export.",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=default_output_dir(),
        help="Directory where manifest.json and context bundles will be written.",
    )
    return parser.parse_args()


def quantize_score(raw_value: str) -> float:
    return round(float(raw_value), 4)


def slugify_context(induction: str, dose: str) -> str:
    return f"{induction}-{dose}".replace(" ", "-").lower()


def clean_output_dir(output_dir: Path) -> None:
    output_dir.mkdir(parents=True, exist_ok=True)
    for path in output_dir.glob("*.json"):
        path.unlink()


def main() -> None:
    args = parse_args()
    input_path = args.input.resolve()
    output_dir = args.output_dir.resolve()

    if not input_path.exists():
        raise SystemExit(f"Input file not found: {input_path}")

    clean_output_dir(output_dir)

    peer_scale_rows: dict[tuple[str, str, str], dict[str, float]] = defaultdict(dict)
    context_languages: dict[tuple[str, str], set[str]] = defaultdict(set)
    context_instruments: dict[tuple[str, str], set[str]] = defaultdict(set)
    source_datasets: set[str] = set()
    row_count = 0

    with input_path.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        for row in reader:
            row_count += 1
            scale_id = row["scale_id"].strip()
            if scale_id not in SCALE_ORDER:
                continue

            induction = row["induction_method"].strip().lower()
            dose = row["dose_label"].strip().lower()
            peer_id = row["peer_id"].strip()
            score_value = quantize_score(row["score_value"])

            key = (induction, dose, peer_id)
            peer_scale_rows[key][scale_id] = score_value

            language = row.get("language", "").strip().lower()
            if language:
                context_languages[(induction, dose)].add(language)

            instrument_id = row.get("instrument_id", "").strip()
            if instrument_id:
                context_instruments[(induction, dose)].add(instrument_id)

            dataset = row.get("source_dataset", "").strip()
            if dataset:
                source_datasets.add(dataset)

    context_profiles: dict[tuple[str, str], list[dict[str, object]]] = defaultdict(list)
    for (induction, dose, peer_id), score_map in sorted(peer_scale_rows.items()):
        if len(score_map) < len(SCALE_ORDER):
            continue

        profile = {
            "peerId": peer_id,
            "values": [score_map[scale] for scale in SCALE_ORDER],
        }
        context_profiles[(induction, dose)].append(profile)

    contexts = []
    default_context_key = None
    default_context_count = -1

    for (induction, dose), profiles in sorted(context_profiles.items()):
        context_key = slugify_context(induction, dose)
        payload = {
            "key": context_key,
            "induction": induction,
            "dose": dose,
            "peerCount": len(profiles),
            "scaleOrder": SCALE_ORDER,
            "languages": sorted(context_languages[(induction, dose)]),
            "instrumentIds": sorted(context_instruments[(induction, dose)]),
            "profiles": profiles,
        }

        output_path = output_dir / f"{context_key}.json"
        output_path.write_text(
            json.dumps(payload, ensure_ascii=False, separators=(",", ":")),
            encoding="utf-8",
        )

        contexts.append(
            {
                "key": context_key,
                "induction": induction,
                "dose": dose,
                "peerCount": len(profiles),
                "path": f"assets/peer-plot-data/{context_key}.json",
                "languages": payload["languages"],
                "instrumentIds": payload["instrumentIds"],
            }
        )

        if len(profiles) > default_context_count:
            default_context_key = context_key
            default_context_count = len(profiles)

    manifest = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "scaleOrder": SCALE_ORDER,
        "source": {
            "name": "AXP legacy 2022 factor score peer export",
            "fileName": input_path.name,
            "rowCount": row_count,
            "sourceDatasets": sorted(source_datasets),
        },
        "defaultContext": default_context_key,
        "contexts": contexts,
    }

    (output_dir / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )

    print(
        json.dumps(
            {
                "outputDir": str(output_dir),
                "contextCount": len(contexts),
                "defaultContext": default_context_key,
                "rowCount": row_count,
            }
        )
    )


if __name__ == "__main__":
    main()
