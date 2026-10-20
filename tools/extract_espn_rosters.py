"""Extract weekly and end-of-season ESPN rosters from the private raw capture into espn/rosters/YEAR.json.

Local-only tool: it reads ../bulk-*/ (the raw ESPN responses, which stay outside the repo) and writes
anonymized roster files (player ids, names, positions, slots, points) that are committed with the site.
Usage: python -I extract_espn_rosters.py
"""
import json, pathlib, glob, re

HERE = pathlib.Path(__file__).resolve().parent
ARCHIVE = HERE.parents[1]
OUT = HERE.parent / "espn" / "rosters"
BULK = sorted(ARCHIVE.glob("bulk-*"))[-1]

SLOT = {0: "QB", 1: "TQB", 2: "RB", 3: "RB/WR", 4: "WR", 5: "WR/TE", 6: "TE", 7: "OP", 16: "DEF", 17: "K",
        20: "BN", 21: "IR", 23: "FLEX", 24: "ER"}
POS = {1: "QB", 2: "RB", 3: "WR", 4: "TE", 5: "K", 7: "P", 16: "DEF"}
TEAM_ABBR = {1: "ATL", 2: "BUF", 3: "CHI", 4: "CIN", 5: "CLE", 6: "DAL", 7: "DEN", 8: "DET", 9: "GB", 10: "TEN", 11: "IND",
             12: "KC", 13: "LV", 14: "LAR", 15: "MIA", 16: "MIN", 17: "NE", 18: "NO", 19: "NYG", 20: "NYJ", 21: "PHI",
             22: "ARI", 23: "PIT", 24: "LAC", 25: "SF", 26: "SEA", 27: "TB", 28: "WAS", 29: "CAR", 30: "JAX", 33: "BAL", 34: "HOU"}

def load(p):
    d = json.loads(pathlib.Path(p).read_text(encoding="utf-8"))
    return d[0] if isinstance(d, list) else d

def entry(e, week=None):
    pp = e.get("playerPoolEntry") or {}
    pl = pp.get("player") or {}
    pts = None
    if week is not None:
        pts = pp.get("appliedStatTotal")
        if pts is None:
            for s in pl.get("stats") or []:
                if s.get("scoringPeriodId") == week and s.get("statSourceId") == 0:
                    pts = s.get("appliedTotal"); break
    return {"p": str(e.get("playerId")), "slot": SLOT.get(e.get("lineupSlotId"), str(e.get("lineupSlotId"))),
            "pts": round(pts, 2) if isinstance(pts, (int, float)) else None,
            "name": pl.get("fullName"), "pos": POS.get(pl.get("defaultPositionId")), "team": TEAM_ABBR.get(pl.get("proTeamId"))}

def main():
    OUT.mkdir(parents=True, exist_ok=True)
    players = {}
    for y in range(2016, 2022):
        weeks = {}
        for f in sorted(BULK.glob(f"{y}-week-*-boxscores.json")):
            w = int(re.search(r"-week-(\d+)-", f.name).group(1))
            d = load(f)
            for m in d.get("schedule", []):
                if m.get("matchupPeriodId") != w:
                    continue
                for side in ("home", "away"):
                    s = m.get(side) or {}
                    ents = (s.get("rosterForCurrentScoringPeriod") or {}).get("entries") or []
                    if not ents:
                        continue
                    weeks.setdefault(str(w), {})[str(s["teamId"])] = [entry(e, w) for e in ents]
        season = load(BULK / f"{y}-season.json")
        final = {}
        for t in season.get("teams", []):
            ents = (t.get("roster") or {}).get("entries") or []
            if ents:
                final[str(t["id"])] = [entry(e) for e in ents]
        for wk in weeks.values():
            for lst in wk.values():
                for e in lst:
                    if e["name"]:
                        players[e["p"]] = {"name": e["name"], "pos": e["pos"], "team": e["team"]}
        for lst in final.values():
            for e in lst:
                if e["name"]:
                    players[e["p"]] = {"name": e["name"], "pos": e["pos"], "team": e["team"]}
        slim = lambda lst: [{k: v for k, v in e.items() if k in ("p", "slot", "pts")} for e in lst]
        out = {"season": y, "weeks": {w: {t: slim(l) for t, l in teams.items()} for w, teams in weeks.items()},
               "final": {t: slim(l) for t, l in final.items()},
               "weekly_coverage": "full" if weeks else "none",
               "note": None if weeks else "ESPN returned no weekly roster snapshots for this season; only the end-of-season roster is available."}
        (OUT / f"{y}.json").write_text(json.dumps(out, separators=(",", ":")), encoding="utf-8")
        print(y, "weeks", len(weeks), "final teams", len(final))
    (HERE.parent / "espn" / "players-extra.json").write_text(json.dumps(players, separators=(",", ":"), ensure_ascii=False), encoding="utf-8")
    print("players", len(players))

if __name__ == "__main__":
    main()
