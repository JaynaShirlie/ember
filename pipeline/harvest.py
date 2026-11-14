"""
EMBER harvester: pulls combustion investigations from NASA PSI (Physical Sciences Informatics).

- Discovers investigations live through the PSI search API (no hard-coded list).
- Saves each investigation's metadata and its experimental-table CSVs.
- Safe to re-run: it overwrites with the latest PSI release, so new datasets appear automatically.

SI disclosure: this file was written with assistance from Claude (Anthropic) and reviewed by the author.
"""
import json, os, re, sys, time
from pathlib import Path
import requests

BASE = "https://psi.nasa.gov/geode-py/ws"
ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw"
TABLES = RAW / "tables"
SEARCH_TERMS = ["combustion", "flame", "fire", "smoke", "droplet", "soot"]
UA = {"User-Agent": "EMBER-research-harvester/1.0 (open-source NASA Space Apps project)"}

session = requests.Session()
session.headers.update(UA)


def get(url, **kw):
    for attempt in range(4):
        try:
            r = session.get(url, timeout=90, **kw)
            r.raise_for_status()
            return r
        except Exception as e:  # network hiccups on PSI are common; retry with backoff
            if attempt == 3:
                raise
            print(f"  retry {attempt + 1} for {url.split('?')[0]}: {type(e).__name__}", file=sys.stderr)
            time.sleep(3 * (attempt + 1))


def discover():
    found = {}
    for term in SEARCH_TERMS:
        j = get(f"{BASE}/repo/search", params=dict(term=term, source="psi", type="investigation",
                                                   sort="Public Release Date", order="desc", size=200)).json()
        for h in j.get("hits", {}).get("hits", []):
            s = h["_source"]
            if (s.get("Research Area") or "").strip().lower() == "combustion science":
                found[s["Accession"]] = {"accession": s["Accession"], "title": s.get("Title"),
                                         "projectType": s.get("Project Type"),
                                         "subResearchArea": s.get("SubResearch Area")}
    return dict(sorted(found.items(), key=lambda kv: int(kv[0].split("-")[1])))


def clean_meta(j):
    keep = ["accession", "title", "investigationAcronym", "doi", "researchArea", "subResearchArea",
            "projectType", "proposalTitle", "objective", "approach", "hypothesis", "researchImpacts",
            "description", "experimentHardware", "flightProgram", "missionName", "investigationStartDate",
            "investigationEndDate", "releaseDate", "modifiedDate", "licenseName", "managingNasaCenter",
            "totalFileSize", "version", "factors", "payloads"]
    m = {k: j.get(k) for k in keep}
    m["related"] = [r for r in re.split(r"[\s,;]+", str(j.get("related_glds") or "")) if r.startswith("PSI-")]
    m["publications"] = [{k: p.get(k) for k in ("title", "authors", "doi", "link", "journal", "year") if p.get(k)}
                         for p in (j.get("publications") or [])]
    files = []
    for f in (j.get("added") or []) + (j.get("files") or []):
        if isinstance(f, dict) and f.get("file_name") and f.get("visible", True):
            files.append({"name": f["file_name"], "size": f.get("file_size"),
                          "category": (f.get("remote_path") or "").split("/")[-2] if f.get("remote_path") else ""})
    m["files"] = list({f["name"]: f for f in files}.values())
    m["experimentalTables"] = [{"file": e["file_name"], "version": e.get("version", 1)}
                               for e in (j.get("experimentalTable") or []) if e.get("file_name")]
    return m


def download_table(acc, fname, version):
    url = get(f"{BASE}/studies/{acc}/download",
              params=dict(file=fname, version=version, redirect="false")).text.strip().strip('"')
    data = get(url).content
    out = TABLES / fname.replace("/", "_")
    out.write_bytes(data)
    return out.name, len(data)


def main():
    TABLES.mkdir(parents=True, exist_ok=True)
    invs = discover()
    print(f"Discovered {len(invs)} combustion investigations: {', '.join(invs)}")
    index = []
    for acc in invs:
        j = get(f"{BASE}/repo/investigations/{acc}").json()
        m = clean_meta(j)
        m["searchInfo"] = invs[acc]
        tables = []
        for t in m["experimentalTables"]:
            try:
                name, size = download_table(acc, t["file"], t["version"])
                tables.append({"file": name, "bytes": size})
            except Exception as e:
                print(f"  ! table {t['file']} failed: {e}", file=sys.stderr)
        m["tablesDownloaded"] = tables
        (RAW / f"{acc}.json").write_text(json.dumps(m, indent=1, ensure_ascii=False), encoding="utf-8")
        index.append({"accession": acc, "title": m["title"], "acronym": m["investigationAcronym"],
                      "tables": [t["file"] for t in tables]})
        print(f"  {acc:8s} {str(m['investigationAcronym'] or '')[:18]:18s} tables={len(tables)}")
    (RAW / "index.json").write_text(json.dumps({"harvestedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                                                "source": "NASA PSI https://psi.nasa.gov/physci/repo",
                                                "investigations": index}, indent=1), encoding="utf-8")


if __name__ == "__main__":
    main()
