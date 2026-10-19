#!/usr/bin/env python3
"""Stream an Apple Health export into daily, date-filtered metric summaries."""

from __future__ import annotations

import argparse
import csv
from collections import defaultdict
from datetime import date, datetime
import os
from pathlib import Path
import tkinter as tk
from tkinter import filedialog, messagebox, simpledialog
import xml.etree.ElementTree as ET


SUM_TYPES = {
    "StepCount",
    "DistanceWalkingRunning",
    "DistanceCycling",
    "DistanceSwimming",
    "FlightsClimbed",
    "ActiveEnergyBurned",
    "BasalEnergyBurned",
    "AppleExerciseTime",
    "AppleStandTime",
    "PushCount",
    "SwimmingStrokeCount",
    "StandHour",
}

METRIC_LABELS = {
    "HeartRateVariabilitySDNN": "Heart rate variability (SDNN)",
    "RestingHeartRate": "Resting heart rate",
    "OxygenSaturation": "Blood oxygen",
    "RespiratoryRate": "Respiratory rate",
    "WalkingHeartRateAverage": "Walking heart rate",
    "BodyTemperature": "Body temperature",
    "BasalBodyTemperature": "Basal body temperature",
    "AppleSleepingWristTemperature": "Sleeping wrist temperature",
    "VO2Max": "VO2 max",
    "BloodGlucose": "Blood glucose",
    "BodyMass": "Body weight",
    "BodyMassIndex": "Body mass index",
    "BodyFatPercentage": "Body fat percentage",
    "StepCount": "Steps",
    "DistanceWalkingRunning": "Walking/running distance",
    "DistanceCycling": "Cycling distance",
    "DistanceSwimming": "Swimming distance",
    "FlightsClimbed": "Flights climbed",
    "ActiveEnergyBurned": "Active energy",
    "BasalEnergyBurned": "Resting energy",
    "AppleExerciseTime": "Exercise time",
    "AppleStandTime": "Stand time",
    "StandHour": "Stand hours",
    "HeartRate": "Heart rate",
}

ACTIVITY_LABELS = {
    "activeEnergyBurned": "Move ring energy",
    "activeEnergyBurnedGoal": "Move ring energy goal",
    "appleExerciseTime": "Exercise ring",
    "appleExerciseTimeGoal": "Exercise ring goal",
    "appleStandHours": "Stand ring",
    "appleStandHoursGoal": "Stand ring goal",
}

CATEGORY_LABELS = {
    "MindfulSession": "Mindfulness",
    "HandwashingEvent": "Handwashing",
    "ToothbrushingEvent": "Toothbrushing",
    "HighHeartRateEvent": "High heart-rate event",
    "LowHeartRateEvent": "Low heart-rate event",
    "IrregularHeartRhythmEvent": "Irregular heart-rhythm event",
    "EnvironmentalAudioExposureEvent": "Environmental audio exposure",
    "HeadphoneAudioExposureEvent": "Headphone audio exposure",
    "AppleStandHour": "Stand hour",
}

CSV_FIELDS = (
    "date",
    "category",
    "metric_type",
    "metric",
    "value",
    "unit",
    "sample_count",
    "sum",
    "average",
    "minimum",
    "maximum",
    "duration_minutes",
    "details",
)


def day_from_attribute(element: ET.Element, attribute: str = "startDate") -> date | None:
    raw = element.get(attribute, "")
    try:
        return date.fromisoformat(raw[:10])
    except ValueError:
        return None


def friendly_name(raw_name: str) -> str:
    if raw_name in METRIC_LABELS:
        return METRIC_LABELS[raw_name]
    spaced = "".join(f" {character}" if character.isupper() else character for character in raw_name).strip()
    return spaced[:1].upper() + spaced[1:]


def number_text(value: float | int | None) -> str:
    if value is None:
        return ""
    return f"{value:.6f}".rstrip("0").rstrip(".") if isinstance(value, float) else str(value)


def parse_timestamp(value: str) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value)
    except ValueError:
        return None


def summarize_export(source_path: str | Path, destination_path: str | Path, start: date, end: date) -> dict[str, int]:
    source_path = Path(source_path)
    destination_path = Path(destination_path)
    if source_path.resolve() == destination_path.resolve():
        raise ValueError("The output CSV must not overwrite the original Apple Health export.")

    daily = defaultdict(lambda: {
        "quantities": defaultdict(lambda: {"sum": 0.0, "count": 0, "minimum": None, "maximum": None}),
        "categories": defaultdict(lambda: {"count": 0, "minutes": 0.0}),
        "sleep_minutes": 0.0,
        "sleep_intervals": 0,
        "workouts": defaultdict(lambda: {"minutes": 0.0, "sessions": 0, "distance": 0.0, "distance_unit": "", "energy": 0.0, "energy_unit": ""}),
        "activity": {},
    })
    counts = {"quantity_samples": 0, "category_samples": 0, "sleep_intervals": 0, "workouts": 0, "activity_summaries": 0}

    iterator = ET.iterparse(source_path, events=("start", "end"))
    _, root = next(iterator)
    stack = [root]
    for event, element in iterator:
        if event == "start":
            stack.append(element)
            continue

        parent = stack[-2] if len(stack) > 1 else None
        if parent is root:
            kind = element.tag.rsplit("}", 1)[-1]
            if kind == "Record":
                record_day = day_from_attribute(element)
                if record_day is not None and start <= record_day <= end:
                    type_name = element.get("type", "")
                    short_type = type_name.removeprefix("HKQuantityTypeIdentifier").removeprefix("HKCategoryTypeIdentifier")
                    raw_value = element.get("value", "")
                    if type_name.startswith("HKQuantityTypeIdentifier"):
                        try:
                            value = float(raw_value)
                        except ValueError:
                            value = None
                        if value is not None:
                            if short_type == "OxygenSaturation" and element.get("unit") == "%" and 0 < value <= 1:
                                value *= 100
                            unit = element.get("unit", "")
                            metric = daily[record_day.isoformat()]["quantities"][(short_type, unit)]
                            metric["sum"] += value
                            metric["count"] += 1
                            metric["minimum"] = value if metric["minimum"] is None else min(metric["minimum"], value)
                            metric["maximum"] = value if metric["maximum"] is None else max(metric["maximum"], value)
                            counts["quantity_samples"] += 1
                    elif type_name.startswith("HKCategoryTypeIdentifier"):
                        day_summary = daily[record_day.isoformat()]
                        category = day_summary["categories"][(short_type, raw_value)]
                        category["count"] += max(1, int(element.get("numberOfOccurrences", "1") or 1))
                        record_start = parse_timestamp(element.get("startDate", ""))
                        record_end = parse_timestamp(element.get("endDate", ""))
                        if record_start and record_end and record_end > record_start:
                            minutes = (record_end - record_start).total_seconds() / 60
                            category["minutes"] += minutes
                            if short_type == "SleepAnalysis" and "Asleep" in raw_value:
                                day_summary["sleep_minutes"] += minutes
                                day_summary["sleep_intervals"] += 1
                                counts["sleep_intervals"] += 1
                        counts["category_samples"] += 1
            elif kind == "Workout":
                workout_day = day_from_attribute(element)
                if workout_day is not None and start <= workout_day <= end:
                    try:
                        minutes = float(element.get("duration", "0"))
                    except ValueError:
                        minutes = 0.0
                    duration_unit = (element.get("durationUnit") or "min").lower()
                    if "sec" in duration_unit:
                        minutes /= 60
                    elif "hour" in duration_unit:
                        minutes *= 60
                    activity = element.get("workoutActivityType", "HKWorkoutActivityTypeOther").removeprefix("HKWorkoutActivityType") or "Other"
                    workout = daily[workout_day.isoformat()]["workouts"][activity]
                    workout["minutes"] += minutes
                    workout["sessions"] += max(1, int(element.get("numberOfSessions", "1") or 1))
                    try:
                        workout["distance"] += float(element.get("totalDistance", "0") or 0)
                    except ValueError:
                        pass
                    try:
                        workout["energy"] += float(element.get("totalEnergyBurned", "0") or 0)
                    except ValueError:
                        pass
                    workout["distance_unit"] = element.get("totalDistanceUnit", "")
                    workout["energy_unit"] = element.get("totalEnergyBurnedUnit", "")
                    counts["workouts"] += 1
            elif kind == "ActivitySummary":
                activity_day = day_from_attribute(element, "dateComponents")
                if activity_day is not None and start <= activity_day <= end:
                    values = daily[activity_day.isoformat()]["activity"]
                    for name, raw_value in element.attrib.items():
                        if name == "dateComponents" or name.endswith("Unit"):
                            continue
                        try:
                            value = float(raw_value)
                        except ValueError:
                            continue
                        values[name] = (value, element.get(f"{name}Unit", ""))
                    counts["activity_summaries"] += 1
            root.remove(element)
            element.clear()
        stack.pop()

    with destination_path.open("w", encoding="utf-8-sig", newline="") as output:
        writer = csv.DictWriter(output, fieldnames=CSV_FIELDS)
        writer.writeheader()
        for day_key in sorted(daily):
            summary = daily[day_key]
            rows = []
            for (type_name, unit), metric in summary["quantities"].items():
                average = metric["sum"] / metric["count"]
                aggregate = "sum" if type_name in SUM_TYPES or type_name.startswith("Dietary") else "average"
                value = metric["sum"] if aggregate == "sum" else average
                rows.append({
                    "category": "quantity",
                    "metric_type": f"HKQuantityTypeIdentifier{type_name}",
                    "metric": friendly_name(type_name),
                    "value": number_text(value),
                    "unit": unit,
                    "sample_count": metric["count"],
                    "sum": number_text(metric["sum"]),
                    "average": number_text(average),
                    "minimum": number_text(metric["minimum"]),
                    "maximum": number_text(metric["maximum"]),
                    "details": f"daily {aggregate}",
                })
            if summary["sleep_intervals"]:
                rows.append({
                    "category": "sleep",
                    "metric_type": "HKCategoryTypeIdentifierSleepAnalysis",
                    "metric": "Sleep duration (asleep intervals)",
                    "value": number_text(summary["sleep_minutes"]),
                    "unit": "min",
                    "sample_count": summary["sleep_intervals"],
                    "duration_minutes": number_text(summary["sleep_minutes"]),
                    "details": "Asleep category intervals; assigned by interval start date",
                })
            for (type_name, category_value), category in summary["categories"].items():
                rows.append({
                    "category": "category",
                    "metric_type": f"HKCategoryTypeIdentifier{type_name}",
                    "metric": f"{CATEGORY_LABELS.get(type_name, friendly_name(type_name))}: {category_value}",
                    "value": category["count"],
                    "unit": "events",
                    "sample_count": category["count"],
                    "duration_minutes": number_text(category["minutes"]),
                    "details": f"Apple Health category value: {category_value}",
                })
            for activity, workout in summary["workouts"].items():
                details = []
                if workout["distance"] and workout["distance_unit"]:
                    details.append(f"distance={number_text(workout['distance'])} {workout['distance_unit']}")
                if workout["energy"] and workout["energy_unit"]:
                    details.append(f"energy={number_text(workout['energy'])} {workout['energy_unit']}")
                rows.append({
                    "category": "workout",
                    "metric_type": f"HKWorkoutActivityType{activity}",
                    "metric": friendly_name(activity),
                    "value": number_text(workout["minutes"]),
                    "unit": "min",
                    "sample_count": workout["sessions"],
                    "duration_minutes": number_text(workout["minutes"]),
                    "details": "; ".join(details),
                })
            for name, (value, unit) in summary["activity"].items():
                rows.append({
                    "category": "activity_summary",
                    "metric_type": f"ActivitySummary{name}",
                    "metric": ACTIVITY_LABELS.get(name, friendly_name(name)),
                    "value": number_text(value),
                    "unit": unit,
                    "sample_count": 1,
                    "details": "Apple Activity ring daily summary",
                })
            for row in sorted(rows, key=lambda item: (item["category"], item["metric"], item["unit"])):
                writer.writerow({"date": day_key, **row})

    counts["days_with_data"] = len(daily)
    counts["output_rows"] = sum(
        len(summary["quantities"]) + len(summary["categories"]) + len(summary["workouts"]) + len(summary["activity"]) + bool(summary["sleep_intervals"])
        for summary in daily.values()
    )
    return counts


def run_gui() -> None:
    app = tk.Tk()
    app.withdraw()
    app.update()
    source = filedialog.askopenfilename(
        title="Choose the original Apple Health export.xml",
        filetypes=[("Apple Health XML", "export.xml *.xml"), ("XML files", "*.xml")],
        parent=app,
    )
    if not source:
        return
    first_text = simpledialog.askstring("Start date", "Include dates from (YYYY-MM-DD):", parent=app)
    last_text = simpledialog.askstring("End date", "Include dates through (YYYY-MM-DD):", parent=app)
    if not first_text or not last_text:
        return
    try:
        start = date.fromisoformat(first_text.strip())
        end = date.fromisoformat(last_text.strip())
        if start > end:
            raise ValueError("The start date must be on or before the end date.")
    except ValueError as error:
        messagebox.showerror("Invalid date range", str(error), parent=app)
        return
    suggested_name = f"health-daily-{start.isoformat()}-to-{end.isoformat()}.csv"
    destination = filedialog.asksaveasfilename(
        title="Save daily Apple Health summary CSV",
        initialfile=suggested_name,
        defaultextension=".csv",
        filetypes=[("CSV files", "*.csv")],
        parent=app,
    )
    if not destination:
        return
    try:
        counts = summarize_export(source, destination, start, end)
    except (OSError, ET.ParseError, ValueError) as error:
        messagebox.showerror("Could not summarize export", str(error), parent=app)
        return
    messagebox.showinfo(
        "Daily summary ready",
        f"Saved CSV to:\n{destination}\n\n"
        f"Summarized {counts['days_with_data']:,} days into {counts['output_rows']:,} metric rows.\n"
        f"Quantity samples: {counts['quantity_samples']:,}; category samples: {counts['category_samples']:,}; "
        f"sleep intervals: {counts['sleep_intervals']:,}; workouts: {counts['workouts']:,}.",
        parent=app,
    )


def main() -> None:
    parser = argparse.ArgumentParser(description="Filter a large Apple Health XML export and summarize every metric by day.")
    parser.add_argument("--input", help="Path to the original Apple Health export.xml")
    parser.add_argument("--start", help="Inclusive first date (YYYY-MM-DD)")
    parser.add_argument("--end", help="Inclusive last date (YYYY-MM-DD)")
    parser.add_argument("--output", help="Destination CSV path")
    args = parser.parse_args()

    if not any((args.input, args.start, args.end, args.output)):
        run_gui()
        return
    if not all((args.input, args.start, args.end, args.output)):
        parser.error("--input, --start, --end, and --output must be provided together")
    try:
        start = date.fromisoformat(args.start)
        end = date.fromisoformat(args.end)
        if start > end:
            parser.error("--start must be on or before --end")
        counts = summarize_export(args.input, args.output, start, end)
    except (OSError, ET.ParseError, ValueError) as error:
        parser.exit(1, f"Could not summarize export: {error}\n")

    size_mb = os.path.getsize(args.output) / (1024 * 1024)
    print(f"Saved daily summary: {args.output}")
    print(f"Date range: {start.isoformat()} through {end.isoformat()} (inclusive)")
    print(f"Days with data: {counts['days_with_data']:,}; output metric rows: {counts['output_rows']:,}")
    print(f"Quantity samples: {counts['quantity_samples']:,}; category samples: {counts['category_samples']:,}; sleep intervals: {counts['sleep_intervals']:,}; workouts: {counts['workouts']:,}")
    print(f"CSV size: {size_mb:.1f} MB")


if __name__ == "__main__":
    main()