#!/usr/bin/env python3
"""Create a smaller Apple Health XML export for Thyroid Tracker, locally."""

from datetime import date
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
    with open(destination_path, "w", encoding="utf-8", newline="") as output:
        output.write('<?xml version="1.0" encoding="UTF-8"?>\n')
        output.write(xml_open_tag(root_tag, root.attrib))
        kept = {"Record": 0, "Workout": 0}
        dropped = {"Record": 0, "Workout": 0}
        stack = [root]

        for event, element in iterator:
            if event == "start":
                stack.append(element)
                continue

            parent = stack[-2] if len(stack) > 1 else None
            if parent is root:
                name = local_name(element.tag)
                if name in {"Record", "Workout"}:
                    item_date = element_date(element)
                    if item_date is not None and start <= item_date <= end:
                        output.write(ET.tostring(element, encoding="unicode"))
                        kept[name] += 1
                    else:
                        dropped[name] += 1
                    root.remove(element)
                elif name in {"ExportDate", "Me"}:
                    output.write(ET.tostring(element, encoding="unicode"))
                    root.remove(element)
                else:
                    root.remove(element)
                element.clear()

            stack.pop()

        output.write(f"</{root_tag}>\n")
    return kept, dropped


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
        kept, dropped = filter_export(source, destination, start, end)
    except (OSError, ET.ParseError) as error:
        messagebox.showerror("Could not filter export", str(error), parent=app)
        return

    messagebox.showinfo(
        "Filtered export ready",
        f"Saved locally to:\n{destination}\n\n"
        f"Kept {kept['Record']:,} health records and {kept['Workout']:,} workouts.\n"
        f"Skipped {dropped['Record']:,} records and {dropped['Workout']:,} workouts outside the date range.\n\n"
        "The original export was not changed. Only records and workouts used by the tracker were included.",
        parent=app,
    )


if __name__ == "__main__":
    main()