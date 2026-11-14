"""
EMBER build: turns raw PSI harvest into the app's knowledge base.

  data/raw/*.json + data/raw/tables/*.csv  ->  web/public/data/{investigations,tests,flex_gp,meta}.json

Every number the app shows is derived here from the harvested NASA files (or computed live
in the browser from these outputs). Assumptions are recorded per record in `*_basis` fields.

SI disclosure: written with assistance from Claude (Anthropic); reviewed by the author.
"""
import json, re, math, time
from pathlib import Path
import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw"
TAB = RAW / "tables"
OUT = ROOT / "web" / "public" / "data"
ATM_PSI, BAR_PSI, MMHG_PSI = 14.696, 14.504, 0.0193368
CABIN_PSI = 14.7  # ISS / Cygnus cabin pressure, used only where a table omits pressure (flagged)

# Fire-safety pillar per investigation, taken from the challenge statement's own grouping
# (prevention = flammability of solids, detection = smoke/aerosol, suppression = extinguishment).
PILLARS = {
    "PSI-25": ["prevention"], "PSI-26": ["prevention"], "PSI-98": ["prevention"], "PSI-99": ["prevention"],
    "PSI-100": ["prevention"], "PSI-20": ["prevention"], "PSI-101": ["detection"], "PSI-102": ["detection"],
    "PSI-47": ["detection"], "PSI-115": ["detection"], "PSI-69": ["suppression"], "PSI-68": ["suppression"],
    "PSI-117": ["suppression"], "PSI-142": ["suppression"], "PSI-62": ["prevention"], "PSI-60": ["fundamental"],
}


def num(x):
    """Parse messy numeric cells: '~ 21.5', '21.5 - 21.7', '.33 cm', '20 cm/s', '1 atm'."""
    if x is None or (isinstance(x, float) and math.isnan(x)):
        return None
    s = str(x).replace("~", " ").replace(",", "")
    vals = [float(v) for v in re.findall(r"-?\d*\.?\d+", s)]
    if not vals:
        return None
    if re.search(r"\d\s*-\s*\d", s) and len(vals) >= 2:  # a range like 21.5 - 21.7 -> midpoint
        return (vals[0] + vals[1]) / 2
    return vals[0]


def nums(x):
    return [float(v) for v in re.findall(r"\d*\.?\d+", str(x))] if x is not None else []


def read(name):
    p = TAB / name
    if not p.exists():
        return None
    df = pd.read_csv(p, encoding="latin-1", dtype=str).dropna(how="all")
    df.columns = [re.sub(r"\s+", " ", c.replace("﻿", "").replace("ï»¿", "")).strip() for c in df.columns]
    return df


def col(df, *keys):
    for c in df.columns:
        lc = c.lower()
        if all(k.lower() in lc for k in keys):
            return c
    return None


tests = []


def add(inv, table, i, **r):
    r.setdefault("count", 1)
    r.update(inv=inv, table=table, row=int(i))
    r["id"] = f"{inv}:{table}:{i}"
    tests.append(r)


def fuel_class(name):
    n = (name or "").lower()
    if any(k in n for k in ["pmma", "sibal", "fabric", "cotton", "silicone", "nomex", "kapton", "teflon",
                            "pyrell", "paper", "film", "rod", "sphere", "plexiglas", "silicone", "wire", "cellulose"]):
        return "solid"
    if any(k in n for k in ["dust", "ard"]):
        return "aerosol"
    if any(k in n for k in ["ch4", "c2h4", "c2h6", "c3h8", "methane", "ethylene", "ethane", "propane",
                            "butane", "pentane", "dme", "gas"]):
        return "gas"
    return "liquid"


# ---------------------------------------------------------------- adapters (one per PSI table format)
def a_flex():
    df = read("PSI-69_Experimental table_FLEX.csv")
    if df is None: return
    c = dict(fuel=col(df, "fuel"), p=col(df, "pressure"), o2=col(df, "o initial"), co2=col(df, "co initial"),
             he=col(df, "he initial"), d0=col(df, "initial diameter"), dext=col(df, "extinction diameter"),
             K=col(df, "burning rate"), tb=col(df, "burn time"), end=col(df, "test end"), tid=col(df, "identifier"))
    for i, r in df.iterrows():
        p = num(r[c["p"]])
        add("PSI-69", "FLEX", i, fuel=r[c["fuel"]], fuelClass="liquid", config="droplet",
            o2Pct=None if num(r[c["o2"]]) is None else num(r[c["o2"]]) * 100, o2Basis="measured",
            pressurePsi=p * MMHG_PSI if p and p > 50 else None, pressureBasis="measured",
            flowCmS=0.0, co2=num(r[c["co2"]]), he=num(r[c["he"]]),
            out={"d0_mm": num(r[c["d0"]]), "dext_mm": num(r[c["dext"]]), "K_mm2s": num(r[c["K"]]),
                 "burn_s": num(r[c["tb"]]), "end": (r[c["end"]] or "").strip(), "flexId": r[c["tid"]]})


def a_flex2():
    df = read("PSI-68_Experimental table_Flex2.csv")
    if df is None: return
    for i, r in df.iterrows():
        o2s, ps = nums(r[col(df, "oxygen")]), nums(r[col(df, "pressure")])
        for o in o2s:
            for p in ps:
                add("PSI-68", "FLEX-2", i, fuel=r[col(df, "fuel")], fuelClass="liquid", config="droplet",
                    o2Pct=o * 100 if o < 1 else o, o2Basis="test-matrix", pressurePsi=p * ATM_PSI,
                    pressureBasis="test-matrix", flowCmS=None, matrix=True,
                    out={"gas": r[col(df, "gas mixture")], "flow": r[col(df, "flow")], "d0": r[col(df, "initial droplet")]})


def a_cfi():
    df = read("PSI-39_Experimental table_CFI.csv")
    if df is None: return
    for i, r in df.iterrows():
        add("PSI-39", "CFI", i, fuel=r[col(df, "fuel")], fuelClass="liquid", config="droplet",
            o2Pct=(num(r[col(df, "oxygen")]) or 0) * 100 or None, o2Basis="measured",
            pressurePsi=(num(r[col(df, "pressure")]) or 0) * ATM_PSI or None, pressureBasis="measured",
            he=num(r[col(df, "helium")]), out={"fiber": r[col(df, "fiber")]})


def a_cfig():
    for name, inverse in [("PSI-159_Experimental table_CFI-G_Normal Flames.csv", False),
                          ("PSI-159_Experimental table_CFI-G_Inverse Flames.csv", True)]:
        df = read(name)
        if df is None: continue
        o2c = col(df, "xo2") if inverse else col(df, "xo2 before")
        for i, r in df.iterrows():
            o2, p = num(r[o2c]), num(r[col(df, "approx p")])
            add("PSI-159", "CFI-G " + ("inverse" if inverse else "normal"), i, fuel=r[col(df, "fuel")],
                fuelClass="gas", config="spherical " + ("inverse" if inverse else "normal"),
                o2Pct=o2 * 100 if o2 is not None else None, o2Basis="oxidizer-stream" if inverse else "measured",
                pressurePsi=p * BAR_PSI if p else None, pressureBasis="measured",
                out={"coolFlame": r.get(col(df, "cool flame") or col(df, "tfp")), "hotIgnition": r[col(df, "hot ignition")],
                     "burn_s": num(r[col(df, "burn time")]), "Tad_K": num(r[col(df, "tad")])})


def a_flamedesign():
    for name, inverse in [("PSI-10_Experimental table_Flame Design_Normal Flame.csv", False),
                          ("PSI-10_Experimental table_Flame Design_Inverse Flame.csv", True)]:
        df = read(name)
        if df is None: continue
        o2c = col(df, "xo2") if inverse else col(df, "xo2 (init)")
        for i, r in df.iterrows():
            o2, p = num(r[o2c]), num(r[col(df, "pmean")])
            add("PSI-10", "Flame Design " + ("inverse" if inverse else "normal"), i,
                fuel=r.get(col(df, "fuel")) if col(df, "fuel") else "C2H4", fuelClass="gas",
                config="spherical " + ("inverse" if inverse else "normal"),
                o2Pct=o2 * 100 if o2 is not None else None, o2Basis="oxidizer-stream" if inverse else "measured",
                pressurePsi=p * ATM_PSI if p else None, pressureBasis="measured",
                out={"Tad_K": num(r[col(df, "tad")]), "Zst": num(r[col(df, "zst")])})


def a_bass2():
    df = read("PSI-25_Experimental table_BASS-II.csv")
    if df is None: return
    for i, r in df.iterrows():
        add("PSI-25", "BASS-II", i, fuel=re.sub(r"\s+", " ", str(r[col(df, "fuel sample")])).strip(), fuelClass="solid",
            config="flat/rod sample in flow duct", o2Pct=num(r[col(df, "initial o2")]), o2Basis="measured",
            pressurePsi=CABIN_PSI, pressureBasis="assumed-cabin",
            out={"fanDisplay": r[col(df, "fan display")], "airDisplay": r[col(df, "air display")],
                 "finalO2": num(r[col(df, "final o2")]), "finalCO_ppm": num(r[col(df, "final co")]), "pi": r[col(df, "pi")]})


def a_bass():
    df = read("PSI-26_Experimental table_BASS.csv")
    if df is None: return
    for i, r in df.iterrows():
        add("PSI-26", "BASS", i, fuel=str(r[col(df, "fuel sample")]).strip(), fuelClass="solid",
            config="flat/rod sample in flow duct", o2Pct=None, o2Basis="not-in-table",
            pressurePsi=None, pressureBasis="not-in-table", out={"date": r[col(df, "date")]})


def a_saffire():
    for inv, name, label in [("PSI-98", "PSI-98_Experimental table_SAFFIRE-1.csv", "Saffire-I"),
                             ("PSI-99", "PSI-99_Experimental table_SAFFIRE-2.csv", "Saffire-II"),
                             ("PSI-100", "PSI-100_Experimental table_SAFFIRE-3.csv", "Saffire-III")]:
        df = read(name)
        if df is None: continue
        for i, r in df.iterrows():
            mat = str(r[col(df, "material")])
            if "pre-test" in mat.lower() or not re.match(r"^[A-Za-z0-9]", str(r[col(df, "sample number")])):
                continue
            o2c = col(df, "o2")
            o2 = num(r[o2c]) if o2c else None
            add(inv, label, i, fuel=mat.strip(), fuelClass="solid", config="large sample in flow duct (Cygnus)",
                o2Pct=o2 if o2 else 21.0, o2Basis="measured" if o2 else "assumed-cabin",
                pressurePsi=CABIN_PSI, pressureBasis="assumed-cabin", flowCmS=num(r[col(df, "air flow")]),
                out={"direction": str(r[col(df, "direction")]).strip(), "thickness": r[col(df, "thickness")],
                     "burn": r.get(col(df, "burn time")) if col(df, "burn time") else None,
                     "spread1g": r.get(col(df, "1-g spread")) if col(df, "1-g spread") else None})


def a_same():
    df = read("PSI-102_Experimental table_SAME.csv")
    if df is not None:
        for i, r in df.iterrows():
            add("PSI-102", "SAME", i, fuel=str(r[col(df, "material")]).strip(), fuelClass="solid", config="smoke source (heated)",
                o2Pct=21.0, o2Basis="assumed-cabin", pressurePsi=CABIN_PSI, pressureBasis="assumed-cabin",
                flowCmS=num(r[col(df, "air flow")]), out={"weightLoss_mg_min": num(r[col(df, "weight loss")]),
                                                         "aging_min": num(r[col(df, "aging")])})
    df = read("PSI-101_Experimental table_SAME-R.csv")
    if df is not None:
        for i, r in df.iterrows():
            add("PSI-101", "SAME-R", i, fuel=str(r[col(df, "sample type")]).strip(), fuelClass="solid",
                config="smoke source (heated)", o2Pct=21.0, o2Basis="assumed-cabin", pressurePsi=CABIN_PSI,
                pressureBasis="assumed-cabin", flowCmS=num(r[col(df, "inlet velocity")]),
                out={"desc": r[col(df, "description")], "netAging_s": num(r[col(df, "net aging")])})


def a_spice_slice():
    df = read("PSI-107_Experimental table_Spice.csv")
    if df is not None:
        for i, r in df.iterrows():
            add("PSI-107", "SPICE", i, fuel=r[col(df, "fuel")], fuelClass="gas", config="co-flow jet",
                o2Pct=21.0, o2Basis="assumed-cabin", pressurePsi=CABIN_PSI, pressureBasis="assumed-cabin",
                flowCmS=num(r[col(df, "air rate")]), out={"fuelRate_mg_s": num(r[col(df, "fuel rate (mg")]),
                                                         "nozzle_mm": num(r[col(df, "nozzle")])})
    df = read("PSI-106_Experimental table_Slice.csv")
    if df is not None:
        for i, r in df.iterrows():
            add("PSI-106", "SLICE", i, fuel=str(r[col(df, "fuel")]).strip(), fuelClass="gas", config="co-flow jet",
                o2Pct=21.0, o2Basis="assumed-cabin", pressurePsi=CABIN_PSI, pressureBasis="assumed-cabin", out={})


def a_acme_sessions():
    """ACME summary tables list test days with a count of flames ignited."""
    specs = [("PSI-20", "PSI-20_Experimental table_ACME BRE.csv", "ACME BRE"),
             ("PSI-21", "PSI-21_Experimental table_CLD Flame.csv", "ACME CLD"),
             ("PSI-22", "PSI-22_Experimental table_ACME E-FIELD Flames.csv", "ACME E-FIELD"),
             ("PSI-23", "PSI-23_Experimental table_ACME s-Flame.csv", "ACME s-Flame")]
    for inv, name, label in specs:
        df = read(name)
        if df is None: continue
        for i, r in df.iterrows():
            n = int(num(r[col(df, "flames ignited")]) or 0)
            o2c, atm = col(df, "oxygen conc"), col(df, "atmosphere")
            o2s = nums(r[o2c]) if o2c else (nums(r[atm])[:1] if atm else [])
            fuel = str(r[col(df, "fuel bottle")]).strip()
            if not o2s:
                o2s, basis = [21.0], "assumed-cabin"
            else:
                basis = "measured"
            for o in o2s:
                add(inv, label, i, fuel=fuel, fuelClass="gas", config="burner (test day)", o2Pct=o,
                    o2Basis=basis, pressurePsi=None, pressureBasis="not-in-table", count=max(1, round(n / len(o2s))),
                    session=True, out={"flamesIgnited": n, "notes": str(r.get(col(df, "notes")) or "")[:300] if col(df, "notes") and isinstance(r.get(col(df, "notes")), str) else ""})


def a_daft():
    df = read("PSI-47_Experimental table_DAFT.csv")
    if df is None: return
    for i, r in df.iterrows():
        add("PSI-47", "DAFT", i, fuel=str(r[col(df, "sample material")])[:80], fuelClass="aerosol", config="aerosol sampling",
            o2Pct=None, o2Basis="not-in-table", pressurePsi=None, pressureBasis="not-in-table",
            out={"hardware": r[col(df, "hardware")], "location": r[col(df, "location")]})


# ---------------------------------------------------------------- investigations
def investigations():
    invs = []
    for p in sorted(RAW.glob("PSI-*.json"), key=lambda p: int(p.stem.split("-")[1])):
        m = json.loads(p.read_text(encoding="utf-8"))
        acc = m["accession"]
        t = [x for x in tests if x["inv"] == acc]
        o2 = [x["o2Pct"] for x in t if x.get("o2Pct") and x.get("o2Basis") != "oxidizer-stream" and not x.get("matrix")]
        o2s = [x["o2Pct"] for x in t if x.get("o2Pct") and x.get("o2Basis") == "oxidizer-stream"]
        ps = [x["pressurePsi"] for x in t if x.get("pressurePsi")]
        classes = sorted({x["fuelClass"] for x in t})
        pillars = PILLARS.get(acc) or (["fundamental"])
        invs.append({
            "accession": acc, "acronym": m.get("investigationAcronym") or "", "title": m.get("title"),
            "doi": m.get("doi"), "projectType": m.get("projectType"), "subArea": m.get("subResearchArea"),
            "objective": m.get("objective"), "approach": m.get("approach"), "hypothesis": m.get("hypothesis"),
            "impacts": m.get("researchImpacts"), "hardware": m.get("experimentHardware"),
            "platform": (m.get("searchInfo") or {}).get("projectType"), "start": m.get("investigationStartDate"),
            "end": m.get("investigationEndDate"), "related": m.get("related"), "publications": m.get("publications"),
            "files": [{"name": f["name"], "category": f.get("category")} for f in m.get("files", [])][:400],
            "fileCount": len(m.get("files", [])), "totalSize": m.get("totalFileSize"),
            "tables": [x["file"] for x in m.get("tablesDownloaded", [])], "pillars": pillars,
            "nTests": sum(x.get("count", 1) for x in t if not x.get("matrix")), "nRows": len(t),
            "fuelClasses": classes, "fuels": sorted({str(x["fuel"]) for x in t})[:30],
            "o2Range": [min(o2), max(o2)] if o2 else None, "oxidizerStreamO2Range": [min(o2s), max(o2s)] if o2s else None, "pressureRange": [min(ps), max(ps)] if ps else None,
            "url": f"https://psi.nasa.gov/physci/repo/data/investigations/{acc}",
        })
    return invs


# ---------------------------------------------------------------- FLEX Gaussian-process model (exported to run in-browser)
def flex_model():
    from sklearn.gaussian_process import GaussianProcessRegressor
    from sklearn.gaussian_process.kernels import RBF, WhiteKernel, ConstantKernel as C
    from sklearn.model_selection import KFold

    rows = [t for t in tests if t["inv"] == "PSI-69" and t.get("pressurePsi") and t["out"].get("K_mm2s") is not None
            and t.get("o2Pct") is not None]
    feats = ["o2", "p_atm", "co2", "he", "heptane"]

    def x_of(t):
        return [t["o2Pct"] / 100, t["pressurePsi"] / ATM_PSI, t.get("co2") or 0, t.get("he") or 0,
                1.0 if "hept" in str(t["fuel"]).lower() else 0.0]

    X = np.array([x_of(t) for t in rows]); y = np.array([t["out"]["K_mm2s"] for t in rows])
    mu, sd = X.mean(0), X.std(0); sd[sd == 0] = 1
    ym, ys = y.mean(), y.std()
    Xs, yz = (X - mu) / sd, (y - ym) / ys
    kernel = C(1.0, (1e-2, 1e2)) * RBF(np.ones(X.shape[1]), (1e-2, 1e2)) + WhiteKernel(0.1, (1e-4, 1))

    # honest validation: 5-fold cross-validation
    preds = np.zeros_like(y); covered = 0
    for tr, te in KFold(5, shuffle=True, random_state=0).split(Xs):
        g = GaussianProcessRegressor(kernel=kernel, normalize_y=False, n_restarts_optimizer=2, random_state=0).fit(Xs[tr], yz[tr])
        m, s = g.predict(Xs[te], return_std=True)
        preds[te] = m * ys + ym
        covered += np.sum(np.abs(y[te] - (m * ys + ym)) <= 1.96 * s * ys)
    r2 = 1 - np.sum((y - preds) ** 2) / np.sum((y - y.mean()) ** 2)
    mae = float(np.mean(np.abs(y - preds)))

    gp = GaussianProcessRegressor(kernel=kernel, normalize_y=False, n_restarts_optimizer=4, random_state=0).fit(Xs, yz)
    k = gp.kernel_
    const, rbf, white = k.k1.k1.constant_value, k.k1.k2.length_scale, k.k2.noise_level
    return {
        "target": "Droplet burning-rate constant K (mm²/s), from PSI-69 FLEX",
        "features": feats, "n": int(len(y)), "xMean": mu.tolist(), "xStd": sd.tolist(), "yMean": float(ym), "yStd": float(ys),
        "constant": float(const), "lengthScales": np.atleast_1d(rbf).tolist(), "noise": float(white),
        "Xtrain": Xs.round(6).tolist(), "alpha": gp.alpha_.round(8).tolist(), "L": gp.L_.round(8).tolist(),
        "trainRanges": {f: [float(X[:, i].min()), float(X[:, i].max())] for i, f in enumerate(feats)},
        "cv": {"folds": 5, "r2": round(float(r2), 3), "mae": round(mae, 4), "coverage95": round(float(covered / len(y)), 3)},
        "points": [{"o2": t["o2Pct"], "p": t["pressurePsi"], "co2": t.get("co2") or 0, "he": t.get("he") or 0,
                    "fuel": t["fuel"], "K": t["out"]["K_mm2s"], "end": t["out"]["end"], "id": t["out"].get("flexId")} for t in rows],
    }


def main():
    for f in [a_flex, a_flex2, a_cfi, a_cfig, a_flamedesign, a_bass2, a_bass, a_saffire, a_same, a_spice_slice, a_acme_sessions, a_daft]:
        before = len(tests); f(); print(f"{f.__name__:18s} +{len(tests) - before}")
    OUT.mkdir(parents=True, exist_ok=True)
    invs = investigations()
    model = flex_model()
    idx = json.loads((RAW / "index.json").read_text())
    meta = {"harvestedAt": idx["harvestedAt"], "builtAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "investigations": len(invs), "tables": sum(len(i["tables"]) for i in invs),
            "testRecords": sum(1 for t in tests if not t.get("matrix")),
            "flamesOrTests": sum(t.get("count", 1) for t in tests if not t.get("matrix")),
            "withO2AndPressure": sum(1 for t in tests if t.get("o2Pct") and t.get("pressurePsi") and not t.get("matrix")),
            "flexModelCV": model["cv"]}
    clean = lambda o: json.loads(json.dumps(o, default=lambda v: None if isinstance(v, float) and math.isnan(v) else str(v)).replace("NaN", "null"))
    (OUT / "tests.json").write_text(json.dumps(clean(tests), separators=(",", ":")), encoding="utf-8")
    (OUT / "investigations.json").write_text(json.dumps(clean(invs), separators=(",", ":"), ensure_ascii=False), encoding="utf-8")
    (OUT / "flex_gp.json").write_text(json.dumps(model, separators=(",", ":")), encoding="utf-8")
    (OUT / "meta.json").write_text(json.dumps(meta, indent=1), encoding="utf-8")
    print(json.dumps(meta, indent=1))


if __name__ == "__main__":
    main()
