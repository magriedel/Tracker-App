#!/usr/bin/env python3
"""Create a smaller Apple Health XML export for Thyroid Tracker, locally."""

from datetime import date, datetime
from collections import defaultdict
import tkinter as tk
from tkinter import filedialog, messagebox, simpledialog
import xml.etree.ElementTree as ET


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
    summaries = defaultdict(lambda: {"heart_rate_sum": 0.0, "heart_rate_count": 0, "steps": 0.0, "sleep": [], "workouts": []})
    counts = {"heart_rate": 0, "steps": 0, "sleep_intervals": 0, "workouts": 0, "ignored_records": 0}
    stack = [root]

    def add_record(record):
        record_date = element_date(record)
        if record_date is None or not start <= record_date <= end:
            return False
        day = summaries[record_date.isoformat()]
        kind = record.get("type", "")
        if kind == "HKCategoryTypeIdentifierSleepAnalysis" and record.get("value", "").startswith("Asleep"):
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
        try:
            value = float(record.get("value", ""))
        except ValueError:
            return False
        if kind == "HKQuantityTypeIdentifierHeartRate":
            day["heart_rate_sum"] += value
            day["heart_rate_count"] += 1
            counts["heart_rate"] += 1
            return True
        if kind == "HKQuantityTypeIdentifierStepCount":
            day["steps"] += value
            counts["steps"] += 1
            return True
        return False

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
                            summaries[item_date.isoformat()]["workouts"].append(duration)
                            counts["workouts"] += 1
                    root.remove(element)
                elif name in {"ExportDate", "Me"}:
                    stack.pop()
                    continue
                else:
                    root.remove(element)
                element.clear()

            stack.pop()

        output.write('<?xml version="1.0" encoding="UTF-8"?>\n')
        output.write(xml_open_tag(root_tag, root.attrib))
        for child in root:
            if local_name(child.tag) in {"ExportDate", "Me"}:
                output.write(ET.tostring(child, encoding="unicode"))
        for day_key, summary in sorted(summaries.items()):
            timestamp = f"{day_key}T12:00:00"
            if summary["heart_rate_count"]:
                average = summary["heart_rate_sum"] / summary["heart_rate_count"]
                record = ET.Element("Record", {"type": "HKQuantityTypeIdentifierHeartRate", "sourceName": "Thyroid Tracker daily summary", "unit": "count/min", "startDate": timestamp, "endDate": timestamp, "value": f"{average:.6f}"})
                output.write(ET.tostring(record, encoding="unicode"))
            if summary["steps"]:
                record = ET.Element("Record", {"type": "HKQuantityTypeIdentifierStepCount", "sourceName": "Thyroid Tracker daily summary", "unit": "count", "startDate": timestamp, "endDate": timestamp, "value": f"{summary['steps']:.6f}"})
                output.write(ET.tostring(record, encoding="unicode"))
            if summary["sleep"]:
                minutes = sum(summary["sleep"])
                record = ET.Element("Record", {"type": "HKCategoryTypeIdentifierSleepAnalysis", "sourceName": "Thyroid Tracker daily summary", "startDate": f"{day_key}T00:00:00", "endDate": f"{day_key}T{int(minutes // 60):02d}:{int(minutes % 60):02d}:00", "value": "AsleepUnspecified"})
                output.write(ET.tostring(record, encoding="unicode"))
            for duration in summary["workouts"]:
                workout = ET.Element("Workout", {"workoutActivityType": "HKWorkoutActivityTypeOther", "duration": f"{duration:.6f}", "durationUnit": "min", "totalDistance": "0", "totalDistanceUnit": "km", "totalEnergyBurned": "0", "totalEnergyBurnedUnit": "kcal", "sourceName": "Thyroid Tracker daily summary", "startDate": timestamp, "endDate": timestamp})
                output.write(ET.tostring(workout, encoding="unicode"))
        output.write(f"</{root_tag}>\n")
    return counts, len(summaries)


def main():
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

    try:
        counts, day_count = filter_export(source, destination, start, end)
    except (OSError, ET.ParseError) as error:
        messagebox.showerror("Could not filter export", str(error), parent=app)
        return

    messagebox.showinfo(
        "Filtered export ready",
        f"Saved locally to:\n{destination}\n\n"
        f"Summarized {day_count:,} dates into {counts['heart_rate']:,} heart-rate, {counts['steps']:,} step, "
        f"{counts['sleep_intervals']:,} sleep-interval, and {counts['workouts']:,} workout source records.\n"
        f"Ignored {counts['ignored_records']:,} unsupported or out-of-range health records.\n"
        f"Filtered file size: {__import__('os').path.getsize(destination) / (1024 * 1024):.1f} MB.\n\n"
        "The original export was not changed. Daily summaries contain only metrics used by the tracker.",
        parent=app,
    )


if __name__ == "__main__":
    main()