"""Reconstruct 2016-2017 roster moves, which ESPN no longer serves, from what it does serve:
draft picks, the nine weekly starters per team, end-of-season rosters, and the official per-team
transaction counters (adds per week, drops, trades). Writes espn/inferred-moves/YEAR.json.

Every event carries inferred=True and a week window. A player seen starting for team A then for
team B moved A->B somewhere in that window; if B->A movement overlaps, the pair is a trade candidate
(capped by the teams' official trade counts). Bench-only pickups that never started and never ended
the season on the roster are invisible and show up only in the counter totals.
Usage: python -I infer_espn_moves.py
"""
import json, pathlib, collections, itertools

HERE = pathlib.Path(__file__).resolve().parent
ESPN = HERE.parent / "espn"
OUT = ESPN / "inferred-moves"

def load(p):
    return json.loads(pathlib.Path(p).read_text(encoding="utf-8"))

def raw(pid):
    return pid.replace("player-", "")

def infer(year, counters):
    draft = load(ESPN / "seasons" / str(year) / "draft.json")
    extra = load(ESPN / "players-extra.json") if (ESPN / "players-extra.json").exists() else {}
    base_players = {p["id"].replace("player-", ""): p for p in load(ESPN / "players.json")}
    def is_def(pid):
        info = extra.get(pid) or {}
        bp = base_players.get(pid) or {}
        return info.get("pos") == "DEF" or bp.get("default_position_id") == 16 or "D/ST" in (bp.get("name") or "")
    lineups = load(ESPN / "seasons" / str(year) / "lineups.json")
    rost = load(ESPN / "rosters" / f"{year}.json")
    weeks = sorted({l["week"] for l in lineups})
    last_week = max(weeks)
    obs = collections.defaultdict(list)  # pid -> [(order, week, team, kind)]
    for p in draft:
        if p.get("player_identified") and p.get("player_id"):
            obs[raw(p["player_id"])].append((0, 0, int(p["team_id"].replace("team-", "")), "draft"))
    for l in lineups:
        for e in l["entries"]:
            if e.get("player_id"):
                obs[raw(e["player_id"])].append((1 + l["week"], l["week"], int(l["team_id"].replace("team-", "")), "start"))
    for tid, lst in rost["final"].items():
        for e in lst:
            obs[e["p"]].append((100, last_week + 1, int(tid), "final"))
    events = []
    transitions = []  # (pid, from_team, to_team, wmin, wmax)
    for pid, rows in obs.items():
        rows.sort()
        stints = []
        for _, wk, team, kind in rows:
            if stints and stints[-1]["team"] == team:
                stints[-1]["last"] = wk; stints[-1]["last_kind"] = kind
            else:
                stints.append({"team": team, "first": wk, "last": wk, "first_kind": kind, "last_kind": kind})
        for i, st in enumerate(stints):
            prev = stints[i - 1] if i else None
            if st["first_kind"] != "draft":
                wmin = (prev["last"] if prev else 0)
                wmax = st["first"] if st["first_kind"] != "final" else last_week
                if prev:
                    transitions.append((pid, prev["team"], st["team"], wmin, wmax))
                else:
                    events.append({"type": "add", "player": pid, "team": st["team"], "week_min": max(wmin, 1), "week_max": max(wmax, 1),
                                   "basis": "first seen " + ("starting" if st["first_kind"] == "start" else "on the final roster") + f" for team {st['team']} in week {st['first']}"})
            if st["last_kind"] != "final" and i == len(stints) - 1:
                events.append({"type": "drop", "player": pid, "team": st["team"], "week_min": st["last"], "week_max": last_week,
                               "basis": f"last seen for team {st['team']} in week {st['last']}, not on its final roster"})
    # trade pairing: opposite transitions between the same two teams with overlapping windows
    trade_cap = {int(t): c["trades"] for t, c in counters["teams"].items()}
    used = set()
    pair_groups = collections.defaultdict(list)
    for idx, tr in enumerate(transitions):
        pair_groups[tuple(sorted((tr[1], tr[2])))].append(idx)
    trades = []
    for pair, idxs in pair_groups.items():
        a, b = pair
        fwd = [i for i in idxs if transitions[i][1] == a]
        back = [i for i in idxs if transitions[i][1] == b]
        for i in fwd:
            for j in back:
                if i in used or j in used:
                    continue
                _, _, _, w1, x1 = transitions[i]; _, _, _, w2, x2 = transitions[j]
                lo, hi = max(w1, w2), min(x1, x2)
                if is_def(transitions[i][0]) and is_def(transitions[j][0]):
                    continue  # two streamed defenses crossing is a drop/add pattern, not a trade
                if lo <= hi and trade_cap.get(a, 0) > 0 and trade_cap.get(b, 0) > 0:
                    used.add(i); used.add(j)
                    conf = "low" if (is_def(transitions[i][0]) or is_def(transitions[j][0]) or hi - lo > 4) else "medium"
                    trades.append({"type": "trade", "teams": [a, b], "week_min": max(lo, 1), "week_max": max(hi, 1), "confidence": conf,
                                   "moves": [{"player": transitions[i][0], "from": a, "to": b}, {"player": transitions[j][0], "from": b, "to": a}],
                                   "basis": "players crossed between the two teams in overlapping windows; both teams have official trade counts"})
                    trade_cap[a] -= 1; trade_cap[b] -= 1
                    break
    for idx, (pid, a, b, wmin, wmax) in enumerate(transitions):
        if idx in used:
            continue
        events.append({"type": "drop", "player": pid, "team": a, "week_min": max(wmin, 1), "week_max": max(wmax, 1), "basis": f"last seen for team {a} in week {wmin}, next seen for team {b} in week {wmax}"})
        events.append({"type": "add", "player": pid, "team": b, "week_min": max(wmin, 1), "week_max": max(wmax, 1), "basis": f"last seen for team {a} in week {wmin}, next seen for team {b} in week {wmax}"})
    # pick the most likely week for each add from the team's official per-week acquisition counts
    cap = {int(t): dict((int(k), v) for k, v in c["by_week"].items()) for t, c in counters["teams"].items()}
    for e in sorted([e for e in events if e["type"] == "add"], key=lambda e: (e["week_max"] - e["week_min"], e["week_min"])):
        wk = None
        for w in range(e["week_min"], e["week_max"] + 1):
            if cap.get(e["team"], {}).get(w, 0) > 0:
                wk = w; cap[e["team"]][w] -= 1; break
        e["week"] = wk if wk is not None else e["week_max"]
        e["week_from_counter"] = wk is not None
        if wk is None and e["basis"].startswith("first seen") and e["week_min"] <= 1:
            e["type"] = "draft_unidentified"  # no official pickup capacity before first sight: almost surely an unidentified draft slot
    for e in events:
        if e["type"] == "drop":
            e["week"] = max(e["week_min"], 1)
            e["week_min"] = max(e["week_min"], 1)
        e.setdefault("confidence", "low" if e["week_max"] - e["week_min"] > 4 else "medium")
    events = [e for e in events if e["type"] != "draft_unidentified"] + [e for e in events if e["type"] == "draft_unidentified"]
    for t in trades:
        t["week"] = t["week_min"]
    summary = {"teams": {}, "events": {"add": sum(1 for e in events if e["type"] == "add"), "drop": sum(1 for e in events if e["type"] == "drop"), "trade": len(trades)}}
    for tid, c in counters["teams"].items():
        summary["teams"][tid] = {"official_acquisitions": c["acquisitions"], "official_drops": c["drops"], "official_trades": c["trades"],
                                 "inferred_adds": sum(1 for e in events if e["type"] == "add" and e["team"] == int(tid)),
                                 "inferred_drops": sum(1 for e in events if e["type"] == "drop" and e["team"] == int(tid)),
                                 "inferred_trades": sum(1 for t in trades if int(tid) in t["teams"])}
    out = {"season": year, "inferred": True,
           "method": "Reconstructed from draft picks, weekly starters, end-of-season rosters and ESPN's official per-team transaction counters. ESPN no longer serves the itemized log for this season.",
           "summary": summary, "events": sorted(events, key=lambda e: (e["week"], e["type"], e["team"])), "trades": trades}
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / f"{year}.json").write_text(json.dumps(out, indent=1), encoding="utf-8")
    print(year, summary["events"], "official adds", sum(c["acquisitions"] for c in counters["teams"].values()),
          "official trades", sum(c["trades"] for c in counters["teams"].values()) // 2)
    for tid, s in summary["teams"].items():
        print("   team", tid, s)

def main():
    counters = load(ESPN / "transaction-counters.json")
    for y in (2016, 2017):
        infer(y, counters[str(y)])

if __name__ == "__main__":
    main()
