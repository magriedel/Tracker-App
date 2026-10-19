#!/usr/bin/env python3
"""Create a smaller Apple Health XML export for Thyroid Tracker, locally."""

from datetime import date, datetime
from collections import defaultdict
import argparse
import os
import tkinter as tk
from tkinter import filedialog, messagebox, simpledialog
import xml.etree.ElementTree as ET

from summarize_health_export import summarize_export


def local_name(tag):
    return tag.rsplit("}", 1)[-1]


def element_date(element):
    value = element.get("startDate") or element.get("date")
    if not value or len(value) < 10:
        return None
    try:
        return date.fromisoformat(value[:10])
    except ValueError:
        return None


def xml_open_tag(tag, attributes):
    element = ET.Element(tag, attributes)
    serialized = ET.tostring(element, encoding="unicode", short_empty_elements=True)
    return serialized[:-3] + ">" if serialized.endswith(" />") else serialized[:-2] + ">"


def filter_export(source_path, destination_path, start, end):
    iterator = ET.iterparse(source_path, events=("start", "end"))
    _, root = next(iterator)
    root_tag = root.tag
    summaries = defaultdict(lambda: {"quantities": defaultdict(lambda: {"sum": 0.0, "count": 0, "unit": ""}), "categories": defaultdict(lambda: {"count": 0, "minutes": 0.0}), "sleep": [], "workouts": defaultdict(lambda: {"minutes": 0.0, "sessions": 0})})
    activity_summaries = []
    preserved_dated_elements = []
    header_elements = []
    counts = {"quantity_samples": 0, "category_samples": 0, "sleep_intervals": 0, "workouts": 0, "activity_summaries": 0, "ignored_records": 0}
    sum_types = {
        "HKQuantityTypeIdentifierStepCount",
        "HKQuantityTypeIdentifierDistanceWalkingRunning",
        "HKQuantityTypeIdentifierDistanceCycling",
        "HKQuantityTypeIdentifierDistanceSwimming",
        "HKQuantityTypeIdentifierFlightsClimbed",
        "HKQuantityTypeIdentifierActiveEnergyBurned",
        "HKQuantityTypeIdentifierBasalEnergyBurned",
        "HKQuantityTypeIdentifierAppleExerciseTime",
        "HKQuantityTypeIdentifierAppleStandTime",
        "HKQuantityTypeIdentifierPushCount",
        "HKQuantityTypeIdentifierSwimmingStrokeCount",
        "HKQuantityTypeIdentifierStandHour",
    }
    stack = [root]

    def add_record(record):
        record_date = element_date(record)
        if record_date is None or not start <= record_date <= end:
            return False
        day = summaries[record_date.isoformat()]
        kind = record.get("type", "")
        if kind == "HKCategoryTypeIdentifierSleepAnalysis" and "Asleep" in record.get("value", ""):
            try:
                start_time = datetime.fromisoformat(record.get("startDate", "")[:19])
                end_time = datetime.fromisoformat(record.get("endDate", "")[:19])
            except ValueError:
                return False
            duration = (end_time - start_time).total_seconds() / 60
            if duration > 0:
                day["sleep"].append(duration)
                counts["sleep_intervals"] += 1
                return True
            return False
        if kind.startswith("HKCategoryTypeIdentifier"):
            value = record.get("value", "Unknown")
            category = day["categories"][(kind, value)]
            category["count"] += 1
            try:
                start_time = datetime.fromisoformat(record.get("startDate", "")[:19])
                end_time = datetime.fromisoformat(record.get("endDate", "")[:19])
                duration = (end_time - start_time).total_seconds() / 60
                if duration > 0:
                    category["minutes"] += duration
            except ValueError:
                pass
            counts["category_samples"] += 1
            return True
        try:
            value = float(record.get("value", ""))
        except ValueError:
            return False
        if not kind.startswith("HKQuantityTypeIdentifier"):
            return False
        unit = record.get("unit", "")
        metric = day["quantities"][(kind, unit)]
        metric["sum"] += value
        metric["count"] += 1
        metric["unit"] = unit
        counts["quantity_samples"] += 1
        return True

    with open(destination_path, "w", encoding="utf-8", newline="") as output:
        for event, element in iterator:
            if event == "start":
                stack.append(element)
                continue

            parent = stack[-2] if len(stack) > 1 else None
            if parent is root:
                name = local_name(element.tag)
                if name == "Record":
                    if not add_record(element):
                        counts["ignored_records"] += 1
                    root.remove(element)
                elif name == "Workout":
                    item_date = element_date(element)
                    if item_date and start <= item_date <= end:
                        try:
                            duration = float(element.get("duration", "0"))
                        except ValueError:
                            duration = 0
                        unit = (element.get("durationUnit") or "min").lower()
                        if "sec" in unit:
                            duration /= 60
                        elif "hour" in unit:
                            duration *= 60
                        if duration > 0:
                            activity = element.get("workoutActivityType", "HKWorkoutActivityTypeOther")
                            workout_summary = summaries[item_date.isoformat()]["workouts"][activity]
                            workout_summary["minutes"] += duration
                            workout_summary["sessions"] += int(element.get("numberOfSessions", "1") or 1)
                            counts["workouts"] += 1
                    root.remove(element)
                elif name == "ActivitySummary":
                    raw_date = element.get("dateComponents", "")
                    activity_date = None
                    try:
                        activity_date = date.fromisoformat(raw_date[:10])
                    except ValueError:
                        pass
                    if activity_date and start <= activity_date <= end:
                        activity_summaries.append(ET.tostring(element, encoding="unicode"))
                        counts["activity_summaries"] += 1
                    root.remove(element)
                elif name in {"ExportDate", "Me"}:
                    header_elements.append(ET.tostring(element, encoding="unicode"))
                    root.remove(element)
                else:
                    item_date = element_date(element)
                    if item_date and start <= item_date <= end:
                        preserved_dated_elements.append(ET.tostring(element, encoding="unicode"))
                    else:
                        counts["ignored_records"] += 1
                    root.remove(element)
                element.clear()

            stack.pop()

        output.write('<?xml version="1.0" encoding="UTF-8"?>\n')
        output.write(xml_open_tag(root_tag, root.attrib))
        for child in header_elements:
            output.write(child)
        for child in activity_summaries:
            output.write(child)
        for child in preserved_dated_elements:
            output.write(child)
        for day_key, summary in sorted(summaries.items()):
            timestamp = f"{day_key}T12:00:00"
            for (kind, unit), metric in summary["quantities"].items():
                if kind in sum_types or kind.startswith("HKQuantityTypeIdentifierDietary"):
                    value = metric["sum"]
                else:
                    value = metric["sum"] / metric["count"]
                record = ET.Element("Record", {"type": kind, "sourceName": "Thyroid Tracker daily summary", "unit": unit, "startDate": timestamp, "endDate": timestamp, "value": f"{value:.6f}"})
                output.write(ET.tostring(record, encoding="unicode"))
            if summary["sleep"]:
                minutes = sum(summary["sleep"])
                record = ET.Element("Record", {"type": "HKCategoryTypeIdentifierSleepAnalysis", "sourceName": "Thyroid Tracker daily summary", "startDate": f"{day_key}T00:00:00", "endDate": f"{day_key}T{int(minutes // 60):02d}:{int(minutes % 60):02d}:00", "value": "AsleepUnspecified"})
                output.write(ET.tostring(record, encoding="unicode"))
            for (kind, value), category in summary["categories"].items():
                start_time = f"{day_key}T00:00:00"
                total_seconds = round(category["minutes"] * 60)
                end_seconds = min(total_seconds, 86399)
                end_time = f"{day_key}T{end_seconds // 3600:02d}:{(end_seconds % 3600) // 60:02d}:{end_seconds % 60:02d}"
                attributes = {"type": kind, "sourceName": "Thyroid Tracker daily summary", "startDate": start_time, "endDate": end_time, "value": value, "numberOfOccurrences": str(category["count"])}
                output.write(ET.tostring(ET.Element("Record", attributes), encoding="unicode"))
            for activity, workout_summary in summary["workouts"].items():
                workout = ET.Element("Workout", {"workoutActivityType": activity, "duration": f"{workout_summary['minutes']:.6f}", "durationUnit": "min", "numberOfSessions": str(workout_summary['sessions']), "totalDistance": "0", "totalDistanceUnit": "km", "totalEnergyBurned": "0", "totalEnergyBurnedUnit": "kcal", "sourceName": "Thyroid Tracker daily summary", "startDate": timestamp, "endDate": timestamp})
                output.write(ET.tostring(workout, encoding="unicode"))
        output.write(f"</{root_tag}>\n")
    return counts, len(summaries)


def main():
    parser = argparse.ArgumentParser(description="Filter and condense an Apple Health export locally.")
    parser.add_argument("--input", help="Path to the original Apple Health export.xml")
    parser.add_argument("--start", help="Inclusive first date (YYYY-MM-DD)")
    parser.add_argument("--end", help="Inclusive last date (YYYY-MM-DD)")
    parser.add_argument("--output", help="Path for the filtered XML output")
    parser.add_argument("--csv", help="Optional path for a CSV with every metric summarized per day")
    args = parser.parse_args()

    if any((args.input, args.start, args.end, args.output)):
        if not all((args.input, args.start, args.end, args.output)):
            parser.error("--input, --start, --end and --output must be provided together")
        try:
            start = date.fromisoformat(args.start)
            end = date.fromisoformat(args.end)
            if start > end:
                parser.error("--start must be on or before --end")
            counts, day_count = filter_export(args.input, args.output, start, end)
            if args.csv:
                summarize_export(args.input, args.csv, start, end)
                print(f"Saved daily all-metric CSV: {args.csv}")
        except (OSError, ET.ParseError, ValueError) as error:
            parser.exit(1, f"Could not filter export: {error}\n")
        size_mb = os.path.getsize(args.output) / (1024 * 1024)
        print(f"Saved filtered export: {args.output}")
        print(f"Date range: {start.isoformat()} through {end.isoformat()} (inclusive)")
        print(f"Days summarized: {day_count:,}")
        print(f"Numeric quantity samples retained: {counts['quantity_samples']:,}; category samples retained: {counts['category_samples']:,}")
        print(f"Sleep intervals retained: {counts['sleep_intervals']:,}; workouts retained: {counts['workouts']:,}; activity summaries retained: {counts['activity_summaries']:,}")
        print(f"Unsupported/out-of-range records skipped: {counts['ignored_records']:,}")
        print(f"Output size: {size_mb:.1f} MB")
        return

    app = tk.Tk()
    app.withdraw()
    app.update()

    source = filedialog.askopenfilename(
        title="Choose Apple Health export.xml",
        filetypes=[("Apple Health XML", "export.xml *.xml"), ("XML files", "*.xml")],
    )
    if not source:
        return

    start_text = simpledialog.askstring(
            "Start date", "Include records on or after (YYYY-MM-DD):", initialvalue="2025-01-01", parent=app
    )
    if not start_text:
        return
    end_text = simpledialog.askstring(
        "End date", "Include records on or before (YYYY-MM-DD):", initialvalue="2026-10-19", parent=app
    )
    if not end_text:
        return
    try:
        start = date.fromisoformat(start_text.strip())
        end = date.fromisoformat(end_text.strip())
        if start > end:
            raise ValueError("The start date must be on or before the end date.")
    except ValueError as error:
        messagebox.showerror("Invalid date range", str(error), parent=app)
        return

    destination = filedialog.asksaveasfilename(
        title="Save filtered Apple Health export",
        initialfile=f"export-{start.isoformat()}-to-{end.isoformat()}.xml",
        defaultextension=".xml",
        filetypes=[("XML files", "*.xml")],
    )
    if not destination:
        return

    csv_path = os.path.splitext(destination)[0] + "-daily-metrics.csv"
    try:
        counts, day_count = filter_export(source, destination, start, end)
        csv_counts = summarize_export(source, csv_path, start, end)
    except (OSError, ET.ParseError, ValueError) as error:
        messagebox.showerror("Could not filter export", str(error), parent=app)
        return

    messagebox.showinfo(
        "Filtered export ready",
        f"Saved locally to:\n{destination}\n\n"
        f"All-metric daily CSV ({csv_counts['output_rows']:,} metric rows over {csv_counts['days_with_data']:,} days):\n{csv_path}\n\n"
        f"Summarized {day_count:,} dates from {counts['quantity_samples']:,} numeric Health samples, "
        f"{counts['category_samples']:,} category samples, {counts['sleep_intervals']:,} sleep intervals, "
        f"{counts['workouts']:,} workouts, and {counts['activity_summaries']:,} activity summaries.\n"
        f"Ignored {counts['ignored_records']:,} unsupported or out-of-range health records.\n"
        f"Filtered file size: {os.path.getsize(destination) / (1024 * 1024):.1f} MB.\n\n"
        "The original export was not changed. Numeric quantities, category values/counts/durations, sleep, workouts, and dated activity summaries were retained locally.",
        parent=app,
    )


if __name__ == "__main__":
    main()