#!/usr/bin/env python3
"""
Re-import speaker series data from the Excel spreadsheet into data/speakers.json.

Usage:
    python import_excel.py
    python import_excel.py "ADRC REC + Schedule .xlsx"
"""

import json
import re
import sys
from datetime import datetime
from pathlib import Path

import pandas as pd

DEFAULT_XLSX = "ADRC REC + Schedule .xlsx"
OUTPUT = Path("data/speakers.json")


def parse_name_email(name_str):
    if pd.isna(name_str) or not str(name_str).strip():
        return "", ""
    s = str(name_str).strip()
    match = re.search(r"<([^>]+@[^>]+)>", s)
    if match:
        email = match.group(1).strip()
        name = re.sub(r"\s*<[^>]+>", "", s).strip()
        return name, email
    return s, ""


def parse_date(val):
    if pd.isna(val):
        return None
    if isinstance(val, datetime):
        return val.strftime("%Y-%m-%d")
    s = str(val).strip()
    for fmt in ["%Y-%m-%d", "%Y-%m-%d %H:%M:%S"]:
        try:
            return datetime.strptime(s.split("(")[0].strip(), fmt).strftime("%Y-%m-%d")
        except ValueError:
            pass
    m = re.search(r"(\w+\s+\d{1,2},?\s+\d{4})", s)
    if m:
        for fmt in ["%B %d, %Y", "%B %d %Y", "%b %d, %Y"]:
            try:
                ds = m.group(1).replace("  ", " ")
                return datetime.strptime(ds, fmt).strftime("%Y-%m-%d")
            except ValueError:
                pass
    return s


def is_holiday_or_cancel(name, title):
    keywords = [
        "HOLIDAY", "CANCEL", "THANKSGIVING", "CHRISTMAS",
        "WINTER HOLIDAYS", "SPRING BREAK",
    ]
    combined = f"{name} {title}".upper()
    for kw in keywords:
        if kw in combined:
            return True
    if name.upper() in ("CANCEL", "THANKSGIVING HOLIDAY", "CHRISTMAS HOLIDAY", "OFF"):
        return True
    if "MEETING" in name.upper() and not title.strip():
        return True
    return False


def should_skip_entry(name_raw, title, talk_type, date_val):
    name = str(name_raw).strip() if pd.notna(name_raw) else ""
    title_str = str(title).strip() if pd.notna(title) else ""
    talk = str(talk_type).strip() if pd.notna(talk_type) else ""
    date_s = str(date_val).strip() if pd.notna(date_val) else ""

    if is_holiday_or_cancel(name, title_str):
        return True

    skip_talk_types = {"THANKSGIVING", "WINTER HOLIDAYS", "SPRING BREAK", "OFF"}
    if talk.upper() in skip_talk_types:
        return True

    if "(off)" in date_s.lower() or re.search(r"\boff\b", date_s, re.I):
        return True

    if name.upper() in {"OFF", "CANCEL", "NAN", ""} and not title_str:
        return True

    if not name and not title_str:
        return True

    return False


def import_excel(xlsx_path: Path) -> dict:
    xl = pd.ExcelFile(xlsx_path)
    all_data = {}

    for sheet in xl.sheet_names:
        if sheet == "Sheet6":
            continue

        df = pd.read_excel(xlsx_path, sheet_name=sheet, header=None)
        header_row = None
        for i, row in df.iterrows():
            vals = [str(v).strip().lower() if pd.notna(v) else "" for v in row]
            if "name" in vals and any("date" in v for v in vals):
                header_row = i
                break
        if header_row is None:
            continue

        headers = [
            str(v).strip() if pd.notna(v) else f"col_{j}"
            for j, v in enumerate(df.iloc[header_row])
        ]
        col_map = {}
        for j, h in enumerate(headers):
            hl = h.lower()
            if "name" in hl:
                col_map["name"] = j
            elif "date" in hl:
                col_map["date"] = j
            elif "title" in hl:
                col_map["title"] = j
            elif "talk type" in hl or hl == "type":
                col_map["talkType"] = j

        year_label = sheet.strip().strip("()").strip()
        entries = []

        for i in range(header_row + 1, len(df)):
            row = df.iloc[i]
            name_raw = row.iloc[col_map.get("name", 0)] if "name" in col_map else None
            name, email = parse_name_email(name_raw)
            date_val = row.iloc[col_map["date"]] if "date" in col_map else None
            title = row.iloc[col_map["title"]] if "title" in col_map else None
            talk_type = row.iloc[col_map["talkType"]] if "talkType" in col_map else None

            if pd.isna(name_raw) and pd.isna(date_val) and pd.isna(title):
                continue

            title_str = str(title).strip() if pd.notna(title) else ""
            date_str = parse_date(date_val)

            if should_skip_entry(name_raw, title, talk_type, date_val):
                continue

            if not name and not title_str:
                continue

            entries.append({
                "id": f"{year_label}-{len(entries) + 1}",
                "name": name,
                "email": email,
                "date": date_str,
                "title": title_str,
                "talkType": str(talk_type).strip() if pd.notna(talk_type) else "",
            })

        all_data[year_label] = {
            "label": f"ADRC REC {year_label}",
            "entries": entries,
        }

    all_data["_meta"] = {
        "lastUpdated": datetime.now().astimezone().isoformat(timespec="seconds"),
    }

    return all_data


def main():
    xlsx = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(DEFAULT_XLSX)
    if not xlsx.exists():
        print(f"Error: file not found: {xlsx}")
        sys.exit(1)

    data = import_excel(xlsx)
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(data, indent=2))

    print(f"Imported {xlsx.name} -> {OUTPUT}")
    for year, info in sorted(data.items(), reverse=True):
        if year == "_meta":
            continue
        print(f"  {year}: {len(info['entries'])} entries")


if __name__ == "__main__":
    main()
