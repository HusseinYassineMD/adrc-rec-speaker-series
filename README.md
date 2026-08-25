# ADRC REC Speaker Series Dashboard

Web dashboard for viewing and managing the ADRC REC speaker series schedule.

**Live site:** https://husseinyassinemd.github.io/adrc-rec-speaker-series/

## For team members

Open the link above in any browser. Use the year tabs to browse schedules, search for speakers, and filter by upcoming talks.

## Updating the schedule (maintainers)

1. Edit `data/speakers.json`, or re-import from Excel locally:
   ```bash
   python3 -m venv .venv
   source .venv/bin/activate
   pip install pandas openpyxl
   python import_excel.py
   ```
2. Commit and push changes — the live site updates in a few minutes.

**Note:** Edits made in the browser save only on that computer. To update the shared schedule for everyone, update the data file and push to GitHub.
