#!/usr/bin/env python3
"""
Import speaker series data from Excel into data/speakers.json.

Usage:
    python import_excel.py                              # legacy workbook (all years)
    python import_excel.py "ADRC REC + Schedule .xlsx"
    python import_excel.py "USC_ADRC_REC_Seminar_Schedule_2026-2027_.xlsx" --merge
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

    match = re.search(r"\(([^)]+@[^)]+)\)", s)
    if match:
        email = match.group(1).strip()
        name = re.sub(r"\s*\([^)]+\)", "", s).strip()
        return name, email

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


def normalize_year_label(raw: str) -> str:
    return raw.replace("–", "-").replace("—", "-").strip()


def extract_year_from_sheet(df: pd.DataFrame, sheet_name: str, xlsx_path: Path) -> str:
    for i in range(min(5, len(df))):
        for val in df.iloc[i].tolist():
            if pd.isna(val):
                continue
            text = str(val)
            match = re.search(r"(20\d{2})\s*[-–—]\s*(20\d{2})", text)
            if match:
                return f"{match.group(1)}-{match.group(2)}"

    match = re.search(r"(20\d{2})\s*[-_]\s*(20\d{2})", xlsx_path.stem)
    if match:
        return f"{match.group(1)}-{match.group(2)}"

    cleaned = sheet_name.strip().strip("()").strip()
    if re.match(r"20\d{2}-20\d{2}", cleaned):
        return cleaned
    return cleaned or "unknown"


def find_header_row(df: pd.DataFrame) -> int | None:
    for i, row in df.iterrows():
        vals = [str(v).strip().lower() if pd.notna(v) else "" for v in row]
        has_date = any("date" in v for v in vals)
        has_speaker_col = any(v in vals for v in ["name", "speaker"])
        has_content_col = any(v in vals for v in ["title", "topic"])
        if has_date and (has_speaker_col or has_content_col):
            return i
    return None


DOMAIN_AFFILIATIONS = {
    "usc.edu": "USC",
    "med.usc.edu": "USC",
    "ucla.edu": "UCLA",
    "g.ucla.edu": "UCLA",
    "mednet.ucla.edu": "UCLA",
    "uci.edu": "UC Irvine",
    "ucsd.edu": "UC San Diego",
    "health.ucsd.edu": "UC San Diego",
    "ucsf.edu": "UCSF",
    "ucsb.edu": "UC Santa Barbara",
    "uw.edu": "University of Washington",
    "mayo.edu": "Mayo Clinic",
    "wustl.edu": "Washington University in St. Louis",
    "cumc.columbia.edu": "Columbia University",
    "columbia.edu": "Columbia University",
    "wayne.edu": "Wayne State University",
    "uky.edu": "University of Kentucky",
    "brown.edu": "Brown University",
    "rush.edu": "Rush University",
    "duke.edu": "Duke University",
    "ucf.edu": "University of Central Florida",
    "clemson.edu": "Clemson University",
    "utdallas.edu": "UT Dallas",
    "fordham.edu": "Fordham University",
    "adelphi.edu": "Adelphi University",
    "ifh.rutgers.edu": "Rutgers University",
    "rutgers.edu": "Rutgers University",
    "uthscsa.edu": "UT Health San Antonio",
    "uab.edu": "UAB",
    "bannerhealth.com": "Banner Health",
}


def email_domain(email: str) -> str:
    if not email or "@" not in email:
        return ""
    return email.strip().split("@")[-1].lower()


def is_usc_affiliation(domain: str) -> bool:
    return domain == "usc.edu" or domain.endswith(".usc.edu")


def infer_affiliation(email: str) -> tuple[str, str]:
    domain = email_domain(email)
    if not domain:
        return "", ""

    if domain in DOMAIN_AFFILIATIONS:
        affiliation = DOMAIN_AFFILIATIONS[domain]
    elif is_usc_affiliation(domain):
        affiliation = "USC"
    else:
        base = domain.split(".")[0]
        affiliation = base.upper() if len(base) <= 4 else base.replace("-", " ").title()

    speaker_type = "Internal" if is_usc_affiliation(domain) else "External"
    return affiliation, speaker_type


def infer_from_talk_type(talk_type: str) -> tuple[str, str]:
    talk = (talk_type or "").strip().lower()
    if not talk:
        return "", ""
    if "external" in talk or "national webinar" in talk:
        return "External institution", "External"
    return "USC", "Internal"


def infer_from_name(name: str) -> tuple[str, str]:
    if not name or name == "Open slot":
        return "", ""

    guest_match = re.search(r"\(guest,\s*([^)]+)\)", name, re.I)
    if guest_match:
        institution = guest_match.group(1).strip()
        return institution, "External"

    lowered = name.lower()
    if "guest" in lowered or "external" in lowered:
        return "External institution", "External"

    return "USC", "Internal"


def enrich_entry(entry: dict) -> dict:
    if entry.get("status") == "Open" or entry.get("name") == "Open slot":
        entry.setdefault("affiliation", "")
        entry.setdefault("speakerType", "")
        return entry

    email = entry.get("email", "")
    inferred_affiliation, inferred_type = infer_affiliation(email)

    if not inferred_affiliation or not inferred_type:
        talk_affiliation, talk_type_label = infer_from_talk_type(entry.get("talkType", ""))
        inferred_affiliation = inferred_affiliation or talk_affiliation
        inferred_type = inferred_type or talk_type_label

    if not inferred_affiliation or not inferred_type:
        name_affiliation, name_type = infer_from_name(entry.get("name", ""))
        inferred_affiliation = inferred_affiliation or name_affiliation
        inferred_type = inferred_type or name_type

    if not entry.get("affiliation") and inferred_affiliation:
        entry["affiliation"] = inferred_affiliation
    if not entry.get("speakerType") and inferred_type:
        entry["speakerType"] = inferred_type

    entry.setdefault("affiliation", "")
    entry.setdefault("speakerType", "")
    return entry


def enrich_all_data(data: dict) -> dict:
    for year, info in data.items():
        if year == "_meta":
            continue
        info["entries"] = [enrich_entry(dict(e)) for e in info["entries"]]
    return data

def build_col_map(headers: list[str]) -> dict:
    col_map = {}
    for j, h in enumerate(headers):
        hl = h.lower()
        if hl in ("name", "speaker"):
            col_map["name"] = j
        elif "date" in hl:
            col_map["date"] = j
        elif hl in ("title", "topic"):
            col_map["title"] = j
        elif "talk type" in hl or hl == "type":
            col_map["talkType"] = j
        elif hl == "status":
            col_map["status"] = j
        elif hl == "semester":
            col_map["semester"] = j
        elif hl == "notes":
            col_map["notes"] = j
    return col_map


def cell(row, col_map, key):
    if key not in col_map:
        return None
    return row.iloc[col_map[key]]


def is_holiday_or_cancel(name, title, status=""):
    keywords = [
        "HOLIDAY", "CANCEL", "THANKSGIVING", "CHRISTMAS", "NEW YEAR",
        "WINTER HOLIDAYS", "SPRING BREAK",
    ]
    combined = f"{name} {title} {status}".upper()
    for kw in keywords:
        if kw in combined:
            return True
    if name.upper() in ("CANCEL", "THANKSGIVING HOLIDAY", "CHRISTMAS HOLIDAY", "OFF"):
        return True
    if status.upper() == "HOLIDAY":
        return True
    if "MEETING" in name.upper() and not title.strip():
        return True
    return False


def should_skip_entry(name_raw, title, talk_type, date_val, status=""):
    name = str(name_raw).strip() if pd.notna(name_raw) else ""
    title_str = str(title).strip() if pd.notna(title) else ""
    talk = str(talk_type).strip() if pd.notna(talk_type) else ""
    date_s = str(date_val).strip() if pd.notna(date_val) else ""
    status_str = str(status).strip() if pd.notna(status) else ""

    if is_holiday_or_cancel(name, title_str, status_str):
        return True

    skip_talk_types = {"THANKSGIVING", "WINTER HOLIDAYS", "SPRING BREAK", "OFF"}
    if talk.upper() in skip_talk_types:
        return True

    if "(off)" in date_s.lower() or re.search(r"\boff\b", date_s, re.I):
        return True

    if status_str.upper() == "OPEN":
        return False

    if name.upper() in {"OFF", "CANCEL", "NAN", ""} and not title_str and status_str.upper() != "OPEN":
        return True

    if not name and not title_str and status_str.upper() != "OPEN":
        return True

    return False


def import_sheet(df: pd.DataFrame, year_label: str) -> list[dict]:
    header_row = find_header_row(df)
    if header_row is None:
        return []

    headers = [
        str(v).strip() if pd.notna(v) else f"col_{j}"
        for j, v in enumerate(df.iloc[header_row])
    ]
    col_map = build_col_map(headers)
    entries = []

    for i in range(header_row + 1, len(df)):
        row = df.iloc[i]
        name_raw = cell(row, col_map, "name")
        date_val = cell(row, col_map, "date")
        title = cell(row, col_map, "title")
        talk_type = cell(row, col_map, "talkType")
        status = cell(row, col_map, "status")
        semester = cell(row, col_map, "semester")
        notes = cell(row, col_map, "notes")

        if pd.isna(name_raw) and pd.isna(date_val) and pd.isna(title):
            continue

        status_str = str(status).strip() if pd.notna(status) else ""
        if should_skip_entry(name_raw, title, talk_type, date_val, status_str):
            continue

        name, email = parse_name_email(name_raw)
        title_str = str(title).strip() if pd.notna(title) else ""
        date_str = parse_date(date_val)
        semester_str = str(semester).strip() if pd.notna(semester) else ""
        notes_str = str(notes).strip() if pd.notna(notes) else ""

        if status_str.upper() == "OPEN":
            name = name or "Open slot"
            title_str = title_str or "Topic TBD"
        elif not title_str:
            title_str = "Topic TBD"

        entry = {
            "id": f"{year_label}-{len(entries) + 1}",
            "name": name,
            "email": email,
            "date": date_str,
            "title": title_str,
            "talkType": str(talk_type).strip() if pd.notna(talk_type) else "",
            "status": status_str or ("Booked" if name and name != "Open slot" else "Open"),
        }
        if semester_str:
            entry["semester"] = semester_str
        if notes_str:
            entry["notes"] = notes_str

        enrich_entry(entry)
        entries.append(entry)

    return entries


def import_excel(xlsx_path: Path) -> dict:
    xl = pd.ExcelFile(xlsx_path)
    all_data = {}

    for sheet in xl.sheet_names:
        if sheet == "Sheet6":
            continue

        df = pd.read_excel(xlsx_path, sheet_name=sheet, header=None)
        year_label = normalize_year_label(extract_year_from_sheet(df, sheet, xlsx_path))
        entries = import_sheet(df, year_label)
        if not entries:
            continue

        all_data[year_label] = {
            "label": f"ADRC REC {year_label}",
            "entries": entries,
        }

    all_data["_meta"] = {
        "lastUpdated": datetime.now().astimezone().isoformat(timespec="seconds"),
    }
    return all_data


def merge_import(xlsx_path: Path, output_path: Path = OUTPUT) -> dict:
    existing = {}
    if output_path.exists():
        existing = json.loads(output_path.read_text())
        existing.pop("_meta", None)

    imported = import_excel(xlsx_path)
    imported.pop("_meta", None)
    existing.update(imported)

    existing["_meta"] = {
        "lastUpdated": datetime.now().astimezone().isoformat(timespec="seconds"),
    }
    return existing


def main():
    args = [a for a in sys.argv[1:] if a != "--merge"]
    merge = "--merge" in sys.argv
    xlsx = Path(args[0]) if args else Path(DEFAULT_XLSX)

    if not xlsx.exists():
        print(f"Error: file not found: {xlsx}")
        sys.exit(1)

    data = merge_import(xlsx) if merge else import_excel(xlsx)
    data = enrich_all_data(data)
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(data, indent=2))

    print(f"Imported {xlsx.name} -> {OUTPUT}" + (" (merged)" if merge else ""))
    for year, info in sorted(data.items(), reverse=True):
        if year == "_meta":
            continue
        booked = sum(1 for e in info["entries"] if e.get("status", "Booked") == "Booked")
        open_slots = sum(1 for e in info["entries"] if e.get("status") == "Open")
        print(f"  {year}: {len(info['entries'])} entries ({booked} booked, {open_slots} open)")


if __name__ == "__main__":
    main()
