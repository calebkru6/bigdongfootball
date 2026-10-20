"""Merge the ESPN archive (website-data/) and the raw Sleeper pulls (site/raw/sleeper/)
into one unified data set for the league website (site/public/data/).

Usage: python -I build_site_data.py
Standard library only. Never writes real manager names: labels come from
tools/identity_map.json (Sleeper usernames or neutral labels).
"""
import json, pathlib, datetime, collections, re

HERE = pathlib.Path(__file__).resolve().parent
ESPN = HERE.parent / "espn"                   # anonymized ESPN archive (copy of website-data)
SLEEPER = HERE.parent / "raw" / "sleeper"
OUT = HERE.parent / "public" / "data"

def load(p):
    return json.loads(pathlib.Path(p).read_text(encoding="utf-8"))

def dump(rel, obj):
    p = OUT / rel
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(obj, separators=(",", ":"), ensure_ascii=False), encoding="utf-8")

def r2(x):
    return None if x is None else round(float(x) + 1e-9, 2)

IDENT = load(HERE / "identity_map.json")
MGR_BY_ESPN = {m["espn_manager_id"]: m for m in IDENT["managers"]}
MGR_BY_SLEEPER = {m["sleeper_user_id"]: m for m in IDENT["managers"] if m["sleeper_user_id"]}
FR_BY_ESPN = {f["espn_team"]: f["id"] for f in IDENT["franchises"]}
FR_BY_ROSTER = {f["sleeper_roster_id"]: f["id"] for f in IDENT["franchises"]}

ESPN_POS = {1: "QB", 2: "RB", 3: "WR", 4: "TE", 5: "K", 7: "P", 9: "DT", 10: "DE", 11: "LB",
            12: "CB", 13: "S", 14: "HC", 16: "DEF"}

players = {}   # key -> {name, pos, team}

# ----------------------------------------------------------------------------- ESPN
def espn_player_key(pid):
    return "e:" + pid.replace("player-", "")

def build_espn_players():
    for p in load(ESPN / "players.json"):
        players[espn_player_key(p["id"])] = {
            "name": p["name"], "pos": ESPN_POS.get(p.get("default_position_id"), None), "team": None}
    # prefer the latest in-season name (slim map derived from the archive's players/YEAR.json)
    extra = ESPN / "players-extra.json"
    if extra.exists():
        for pid, info in load(extra).items():
            players.setdefault("e:" + pid, {"name": info["name"], "pos": info.get("pos"), "team": info.get("team")})
    names = ESPN / "player-names.json"
    if names.exists():
        for pid, name in load(names).items():
            k = espn_player_key(pid)
            if k in players:
                players[k]["name"] = name

def espn_round_label(phase, period, playoff_start, tier, home_rank, away_rank):
    # ESPN 4-team playoffs: period playoff_start = semifinals, +1 = final/3rd place; consolation ladder beside.
    if phase == "regular_season":
        return "regular", None
    if phase == "championship_playoffs":
        if period == playoff_start:
            return "playoff", "Semifinal"
        return "playoff", "Championship"
    # consolation
    if tier == "WINNERS_CONSOLATION_LADDER":
        return "consolation", "3rd Place Game"
    if period == playoff_start:
        return "consolation", "Consolation Semifinal"
    # second consolation week: decide 5th vs 7th by final rank of participants
    ranks = sorted(x for x in (home_rank, away_rank) if x)
    if ranks and ranks[0] >= 7:
        return "consolation", "Toilet Bowl (7th Place)"
    return "consolation", "5th Place Game"

def build_espn_season(year):
    d = ESPN / "seasons" / str(year)
    summary = load(d / "summary.json")
    standings = load(d / "standings.json")
    matchups = load(d / "matchups.json")
    lineups = load(d / "lineups.json")
    draft = load(d / "draft.json")
    rules = load(d / "rules.json")
    txs = load(d / "transactions.json")
    trades = load(d / "trades.json")
    cov = {c["season"]: c for c in load(ESPN / "coverage.json")}.get(year, {})

    sched = rules.get("scheduleSettings", {})
    reg_weeks = sched.get("matchupPeriodCount")
    playoff_start = (reg_weeks or 13) + 1
    rank_by_team = {s["team_id"]: s["final_rank"] for s in standings}

    teams = []
    for s in sorted(standings, key=lambda s: (s["final_rank"] or 99)):
        m = MGR_BY_ESPN.get(s["manager_ids"][0]) if s["manager_ids"] else None
        rs = s["regular_season"]
        teams.append({
            "franchise": FR_BY_ESPN[s["team_id"]],
            "manager": m["id"] if m else None,
            "team_name": s["name"],
            "avatar": None,
            "division": None,
            "wins": rs["wins"], "losses": rs["losses"], "ties": rs["ties"],
            "pf": r2(rs["pointsFor"]), "pa": r2(rs["pointsAgainst"]),
            "playoff_seed": s["playoff_seed"],
            "final_rank": s["final_rank"],
            "champion": s["final_rank"] == 1,
        })
    name_by_team = {s["team_id"]: s["name"] for s in standings}
    lineup_by = {(l["week"], l["team_id"]): l for l in lineups}
    rfile = ESPN / "rosters" / f"{year}.json"
    rost = load(rfile) if rfile.exists() else {"weeks": {}, "final": {}, "note": None}
    ESPN_SLOT_ORDER = ["QB", "RB", "WR", "TE", "FLEX", "OP", "K", "DEF", "BN", "IR"]
    def roster_entries(lst, with_pts=True):
        out = []
        for e in lst:
            starter = e["slot"] not in ("BN", "IR")
            out.append({"p": "e:" + e["p"], "pts": (r2(e["pts"]) if e["pts"] is not None else 0.0) if with_pts else None,
                        "slot": e["slot"], "starter": starter})
        out.sort(key=lambda x: (ESPN_SLOT_ORDER.index(x["slot"]) if x["slot"] in ESPN_SLOT_ORDER else 50, -(x["pts"] or 0)))
        return out

    def side(obj, period):
        tid = obj["team_id"]
        l = lineup_by.get((period, tid))
        out = {"franchise": FR_BY_ESPN[tid], "team_name": name_by_team.get(tid),
               "points": r2(obj["points"]),
               "points_by_week": {k: r2(v) for k, v in (obj.get("points_by_week") or {}).items()}}
        wk_r = rost["weeks"].get(str(period), {}).get(tid.replace("team-", ""))
        if wk_r:
            out["lineup"] = roster_entries(wk_r)
            out["lineup_sum"] = r2(sum(x["pts"] for x in out["lineup"] if x["starter"]))
            out["manual_adjustment"] = r2(l["manual_adjustment"]) if l else 0.0
            out["lineup_reconciles"] = abs((out["lineup_sum"] or 0) + (out["manual_adjustment"] or 0) - (out["points"] or 0)) < 0.01
        elif l:
            out["lineup"] = [{"p": espn_player_key(e["player_id"]), "pts": r2(e["player_points"]), "slot": None,
                              "starter": None} for e in l["entries"] if e["player_id"]]
            out["lineup_sum"] = r2(l["sum_of_player_points"])
            out["manual_adjustment"] = r2(l["manual_adjustment"])
            out["lineup_reconciles"] = bool(l["points_reconcile"])
        return out
    final_rosters = {FR_BY_ESPN["team-" + tid]: roster_entries(lst, with_pts=False) for tid, lst in rost["final"].items() if "team-" + tid in FR_BY_ESPN}
    rosters = {"final": final_rosters, "final_label": "End of season", "weekly": bool(rost["weeks"]),
               "weekly_note": rost.get("note")}

    ms = []
    for m in matchups:
        if not m["played"]:
            continue
        phase, label = espn_round_label(m["phase"], m["matchup_period"], playoff_start, m["playoff_tier"],
                                        rank_by_team.get(m["home"]["team_id"]), rank_by_team.get(m["away"]["team_id"]))
        wk = m["matchup_period"]
        weeks = sorted(int(k) for k in (m["home"].get("points_by_week") or {wk: 0}).keys()) or [wk]
        home, away = side(m["home"], wk), side(m["away"], wk)
        winner = {"HOME": "home", "AWAY": "away", "TIE": "tie"}.get(m["winner"])
        ms.append({"id": m["id"], "week": wk, "weeks": weeks, "phase": phase, "round": label,
                   "home": home, "away": away, "winner": winner, "played": True})

    # draft
    picks = []
    for p in sorted(draft, key=lambda p: p["overall_pick"]):
        picks.append({"pick": p["overall_pick"], "round": p["round"], "slot": p["pick_in_round"],
                      "franchise": FR_BY_ESPN.get(p["team_id"]),
                      "p": espn_player_key(p["player_id"]) if p.get("player_identified") and p.get("player_id") else None,
                      "keeper": bool(p.get("keeper")), "bid": p.get("bid_amount") or None})
    ds = rules.get("draftSettings", {})
    keepers = sum(1 for p in picks if p["keeper"])
    nrounds = max((p["round"] for p in picks), default=0)
    dlabel = (f"Startup draft ({nrounds} rounds, {(ds.get('type') or '').lower()})" if not keepers
              else f"Keeper draft ({nrounds} rounds, {keepers} picks flagged as keepers)")
    ddate = datetime.datetime.utcfromtimestamp(ds["date"] / 1000).strftime("%Y-%m-%dT%H:%M:%SZ") if ds.get("date") else None
    drafts = [{"label": dlabel, "type": (ds.get("type") or "").lower(), "order": (ds.get("orderType") or "").lower(),
               "rounds": nrounds, "picks": picks, "keepers": keepers, "date": ddate,
               "unidentified_slots": cov.get("unidentified_draft_slots", 0)}] if picks else []

    # transactions: executed adds/drops/waivers + executed trades
    events = []
    for t in txs:
        if "trades" in t["categories"]:
            continue
        obs = [o for o in t["observations"] if o["status"] == "EXECUTED" and o["type"] in ("FREEAGENT", "WAIVER", "ROSTER")]
        if not obs:
            continue
        o0 = obs[0]
        adds, drops, bid = {}, {}, None
        for o in obs:
            for it in o["items"]:
                if it["type"] == "ADD":
                    adds[espn_player_key(it["player_id"])] = FR_BY_ESPN.get(it["to_team_id"] or o["team_id"])
                    if it.get("acquisition_budget"):
                        bid = it["acquisition_budget"]
                elif it["type"] == "DROP":
                    drops[espn_player_key(it["player_id"])] = FR_BY_ESPN.get(it["from_team_id"] or o["team_id"])
        if not adds and not drops:
            continue
        kind = {"FREEAGENT": "free_agent", "WAIVER": "waiver", "ROSTER": "free_agent"}[o0["type"]]
        events.append({"id": t["id"], "week": o0.get("scoring_period"), "date": o0.get("processed_at") or o0.get("proposed_at"),
                       "type": kind, "franchises": sorted({v for v in list(adds.values()) + list(drops.values()) if v}),
                       "adds": [{"p": k, "to": v} for k, v in adds.items()],
                       "drops": [{"p": k, "from": v} for k, v in drops.items()], "picks": [], "bid": bid})
    tx_by_id = {t["id"]: t for t in txs}
    proposed = 0
    for tr in trades:
        if not tr["execution_recorded"]:
            proposed += 1
            continue
        ev = tx_by_id.get(tr["execution_event_ids"][0])
        o = next((o for o in ev["observations"] if o["type"] in ("TRADE_ACCEPT", "TRADE_UPHOLD")), ev["observations"][0]) if ev else {}
        adds, drops = [], []
        for mv in tr["recorded_player_movements"]:
            adds.append({"p": espn_player_key(mv["player_id"]), "to": FR_BY_ESPN.get(mv["to_team_id"])})
            drops.append({"p": espn_player_key(mv["player_id"]), "from": FR_BY_ESPN.get(mv["from_team_id"])})
        frs = sorted({x["to"] for x in adds if x["to"]} | {x["from"] for x in drops if x["from"]})
        events.append({"id": tr["id"], "week": o.get("scoring_period"), "date": o.get("processed_at") or o.get("accepted_at"),
                       "type": "trade", "franchises": frs, "adds": adds, "drops": drops, "picks": [], "bid": None})
    events.sort(key=lambda e: (e["date"] or "", e["id"]))

    # settings summary
    scoring = rules.get("scoringSettings", {})
    lsc = rules.get("rosterSettings", {}).get("lineupSlotCounts", {})
    slot_names = {"0": "QB", "2": "RB", "4": "WR", "6": "TE", "23": "FLEX", "16": "DEF", "17": "K", "20": "BN", "21": "IR", "7": "OP"}
    roster_positions = []
    for sid in ["0", "2", "4", "6", "23", "7", "17", "16", "20", "21"]:
        roster_positions += [slot_names[sid]] * int(lsc.get(sid, 0) or 0)
    settings = {
        "platform_league_id": "1923288",
        "regular_weeks": reg_weeks, "playoff_week_start": playoff_start,
        "playoff_teams": sched.get("playoffTeamCount"),
        "playoff_seeding": sched.get("playoffSeedingRule"),
        "divisions": [dv["name"] for dv in sched.get("divisions", [])],
        "roster_positions": roster_positions,
        "scoring_type": scoring.get("playerRankType"),
        "draft": {"type": (ds.get("type") or "").lower(), "order": (ds.get("orderType") or "").lower(),
                  "keepers": ds.get("keeperCount"), "keepers_used": keepers},
        "format": "dynasty (run as an ESPN keeper league: rosters carried over through keeper picks)" if keepers else "dynasty (startup season)",
        "trade_deadline": None, "waivers": None, "faab": None,
    }
    notes = []
    if cov.get("transaction_state") == "not_returned":
        notes.append("ESPN did not return this season's transaction log. The empty moves list is a data gap, not evidence the league made no moves.")
    if not rost["weeks"]:
        notes.append("ESPN returned no weekly roster snapshots for this season: box scores show the nine starters without slot labels, and the Rosters tab only has the end-of-season roster.")
    if cov.get("lineup_point_mismatches"):
        notes.append(f"{len(cov['lineup_point_mismatches'])} box scores have player totals that do not reproduce the official team score; the official score is shown.")
    if cov.get("unidentified_draft_slots"):
        notes.append(f"{cov['unidentified_draft_slots']} draft slots could not be matched to a player.")
    if proposed:
        notes.append(f"{proposed} additional trade proposals were recorded without an execution record and are not listed.")

    return {
        "season": year, "platform": "espn", "status": "complete", "league_name": summary["league_name"],
        "champion": next((t["manager"] for t in teams if t["champion"]), None),
        "teams": teams, "matchups": ms, "bracket": None, "drafts": drafts, "transactions": events,
        "settings": settings, "notes": notes, "rosters": rosters,
    }

# ----------------------------------------------------------------------------- SLEEPER
SLEEPER_PLAYERS = None

def sleeper_player_key(pid):
    return "s:" + str(pid)

def ensure_sleeper_player(pid, meta=None):
    k = sleeper_player_key(pid)
    if k in players:
        return k
    p = (SLEEPER_PLAYERS or {}).get(str(pid))
    if p:
        name = p.get("full_name") or f"{p.get('first_name','')} {p.get('last_name','')}".strip()
        players[k] = {"name": name, "pos": p.get("position"), "team": p.get("team")}
    elif meta:
        players[k] = {"name": f"{meta.get('first_name','')} {meta.get('last_name','')}".strip(),
                      "pos": meta.get("position"), "team": meta.get("team")}
    else:
        players[k] = {"name": f"Player {pid}", "pos": None, "team": None}
    return k

def playoff_week_map(settings):
    """Return {round_number: [weeks]} for the winners/losers bracket."""
    start = settings["playoff_week_start"]
    teams = settings["playoff_teams"]
    rounds = max(1, (teams - 1).bit_length())  # 4 teams -> 2 rounds, 6/8 -> 3
    rt = settings.get("playoff_round_type", 0)
    out, w = {}, start
    for r in range(1, rounds + 1):
        n = 2 if (rt == 2 or (rt == 1 and r == rounds)) else 1
        out[r] = list(range(w, w + n)); w += n
    return out

def build_sleeper_season(year):
    d = SLEEPER / str(year)
    lg = load(d / "league.json"); users = load(d / "users.json"); rosters = load(d / "rosters.json")
    st = lg["settings"]
    state = load(SLEEPER / "state.json")
    in_season = lg["status"] == "in_season"
    last_scored = st.get("last_scored_leg") or 0
    current_week = int(state.get("week") or 0) if in_season and str(state.get("season")) == str(year) else None
    umap = {u["user_id"]: u for u in users}
    div_names = {1: lg["metadata"].get("division_1"), 2: lg["metadata"].get("division_2")} if lg.get("metadata") else {}

    wb = load(d / "winners_bracket.json") or []
    lb = load(d / "losers_bracket.json") or []
    pw = playoff_week_map(st)
    final_round = max(pw)

    # final placement from brackets
    place = {}
    for b in wb:
        if b["r"] == final_round and b.get("w") and b.get("p"):
            place[b["w"]] = b["p"]; place[b["l"]] = b["p"] + 1
    for b in lb:
        if b["r"] == final_round and b.get("w") and b.get("p"):
            place[b["w"]] = st["playoff_teams"] + b["p"]; place[b["l"]] = st["playoff_teams"] + b["p"] + 1
    seeds = {}
    r1 = sorted([b for b in wb if b["r"] == 1], key=lambda b: b["m"])
    if in_season:
        r1 = []  # Sleeper pre-fills the bracket from current standings; seeds are not real until the regular season ends
    if len(r1) == 2:
        seeds[r1[0]["t1"]] = 1; seeds[r1[0]["t2"]] = 4; seeds[r1[1]["t1"]] = 2; seeds[r1[1]["t2"]] = 3
    elif len(r1) == 1:
        seeds[r1[0]["t1"]] = 1; seeds[r1[0]["t2"]] = 2

    teams = []
    for r in rosters:
        u = umap.get(r["owner_id"], {}); s = r["settings"]; m = MGR_BY_SLEEPER.get(r["owner_id"])
        pf = (s.get("fpts") or 0) + (s.get("fpts_decimal") or 0) / 100.0
        pa = (s.get("fpts_against") or 0) + (s.get("fpts_against_decimal") or 0) / 100.0
        teams.append({
            "franchise": FR_BY_ROSTER[r["roster_id"]], "manager": m["id"] if m else None,
            "roster_id": r["roster_id"],
            "team_name": (u.get("metadata") or {}).get("team_name") or u.get("display_name"),
            "avatar": (f"https://sleepercdn.com/avatars/thumbs/{u['avatar']}" if u.get("avatar") else None),
            "division": div_names.get(s.get("division")),
            "wins": s.get("wins", 0), "losses": s.get("losses", 0), "ties": s.get("ties", 0),
            "pf": r2(pf), "pa": r2(pa),
            "playoff_seed": seeds.get(r["roster_id"]),
            "final_rank": place.get(r["roster_id"]) if not in_season else None,
            "champion": place.get(r["roster_id"]) == 1 and not in_season,
        })
    # regular-season rank by record then points (used for in-season ordering and as seed fallback)
    teams.sort(key=lambda t: (-t["wins"], t["losses"], -(t["pf"] or 0)))
    for i, t in enumerate(teams, 1):
        t["standing"] = i
    teams.sort(key=lambda t: (t["final_rank"] or 99, t["standing"]))
    by_roster = {t["roster_id"]: t for t in teams}

    # starters slot labels
    slots = [p for p in lg["roster_positions"] if p != "BN"]
    final_rosters = {}
    for r in rosters:
        starters = r.get("starters") or []
        lst = []
        for i, pid in enumerate(starters):
            if pid and pid != "0":
                lst.append({"p": ensure_sleeper_player(pid), "pts": None, "slot": slots[i] if i < len(slots) else None, "starter": True})
        for pid in (r.get("reserve") or []):
            lst.append({"p": ensure_sleeper_player(pid), "pts": None, "slot": "IR", "starter": False})
        for pid in (r.get("taxi") or []):
            lst.append({"p": ensure_sleeper_player(pid), "pts": None, "slot": "TAXI", "starter": False})
        seen = {x["p"] for x in lst}
        for pid in (r.get("players") or []):
            k = ensure_sleeper_player(pid)
            if k not in seen:
                lst.append({"p": k, "pts": None, "slot": "BN", "starter": False})
        final_rosters[FR_BY_ROSTER[r["roster_id"]]] = lst
    rosters_out = {"final": final_rosters, "final_label": "Current roster" if in_season else "End of season", "weekly": True, "weekly_note": None}

    def side(mrow):
        t = by_roster[mrow["roster_id"]]
        starters = mrow.get("starters") or []
        spts = mrow.get("starters_points") or []
        ppts = mrow.get("players_points") or {}
        lineup = []
        for i, pid in enumerate(starters):
            if not pid or pid == "0":
                lineup.append({"p": None, "pts": 0.0, "slot": slots[i] if i < len(slots) else None, "starter": True})
                continue
            lineup.append({"p": ensure_sleeper_player(pid), "pts": r2(spts[i] if i < len(spts) else ppts.get(pid, 0)),
                           "slot": slots[i] if i < len(slots) else None, "starter": True})
        for pid in (mrow.get("players") or []):
            if pid in starters:
                continue
            lineup.append({"p": ensure_sleeper_player(pid), "pts": r2(ppts.get(pid, 0)), "slot": "BN", "starter": False})
        return {"franchise": t["franchise"], "team_name": t["team_name"], "points": r2(mrow.get("points") or 0), "lineup": lineup}

    weekly = {}
    import glob
    for f in sorted(d.glob("matchups-*.json")):
        w = int(f.stem.split("-")[1]); rows = load(f) or []
        weekly[w] = rows

    ms = []
    reg_end = st["playoff_week_start"] - 1
    for w in sorted(weekly):
        if w > reg_end:
            continue
        groups = collections.defaultdict(list)
        for row in weekly[w]:
            if row.get("matchup_id") is None:
                continue
            groups[row["matchup_id"]].append(row)
        for mid, rows in sorted(groups.items()):
            if len(rows) != 2:
                continue
            rows.sort(key=lambda r: r["roster_id"])
            played = w <= last_scored
            home, away = side(rows[0]), side(rows[1])
            winner = None
            if played:
                winner = "home" if home["points"] > away["points"] else "away" if away["points"] > home["points"] else "tie"
            ms.append({"id": f"{year}-w{w}-m{mid}", "week": w, "weeks": [w], "phase": "regular", "round": None,
                       "home": home, "away": away, "winner": winner, "played": played,
                       "live": (current_week == w and not played) or None})

    def bracket_games(bracket, kind):
        out = []
        for b in bracket:
            r = b["r"]; weeks = pw.get(r, []); t1, t2 = b.get("t1"), b.get("t2")
            if not (isinstance(t1, int) and isinstance(t2, int)):
                continue
            if in_season and (not weeks or weeks[0] > last_scored):
                continue  # Sleeper pre-seeds in-season brackets from current standings; nothing has been played
            if kind == "playoff":
                label = "Championship" if (r == final_round and b.get("p") == 1) else \
                        "3rd Place Game" if (r == final_round and b.get("p") == 3) else \
                        "Semifinal" if r == final_round - 1 else f"Round {r}"
            else:
                label = "5th Place Game" if (r == final_round and b.get("p") == 1) else \
                        "Toilet Bowl (7th Place)" if (r == final_round and b.get("p") == 3) else \
                        "Consolation Semifinal" if r == final_round - 1 else f"Consolation Round {r}"
            sides = {}
            for rid in (t1, t2):
                wk_sides = []
                for w in weeks:
                    row = next((x for x in weekly.get(w, []) if x["roster_id"] == rid), None)
                    if row:
                        wk_sides.append((w, side(row)))
                if not wk_sides:
                    t = by_roster[rid]
                    sides[rid] = {"franchise": t["franchise"], "team_name": t["team_name"], "points": None, "lineup": []}
                    continue
                total = r2(sum(s["points"] for _, s in wk_sides))
                sd = {"franchise": wk_sides[0][1]["franchise"], "team_name": wk_sides[0][1]["team_name"], "points": total,
                      "points_by_week": {str(w): s["points"] for w, s in wk_sides},
                      "lineup": wk_sides[-1][1]["lineup"] if len(wk_sides) == 1 else None,
                      "lineups_by_week": {str(w): s["lineup"] for w, s in wk_sides} if len(wk_sides) > 1 else None}
                sides[rid] = sd
            played = bool(weeks) and weeks[-1] <= last_scored and b.get("w") is not None
            winner = None
            if played:
                winner = "home" if b["w"] == t1 else "away"
            out.append({"id": f"{year}-{kind}-r{r}-m{b['m']}", "week": weeks[0] if weeks else None, "weeks": weeks,
                        "phase": kind if kind == "playoff" else "consolation", "round": label,
                        "home": sides[t1], "away": sides[t2], "winner": winner, "played": played,
                        "bracket": {"m": b["m"], "r": r, "t1_from": b.get("t1_from"), "t2_from": b.get("t2_from"), "p": b.get("p")}})
        return out
    ms += bracket_games(wb, "playoff")
    ms += bracket_games(lb, "consolation")

    # drafts
    drafts = []
    for dr in sorted(load(d / "drafts.json") or [], key=lambda x: x.get("start_time") or x.get("created") or 0):
        did = dr["draft_id"]
        picks_raw = load(d / f"draft-{did}-picks.json") or []
        rounds = dr["settings"].get("rounds")
        slot_to_roster = {int(v): int(k) for k, v in (dr.get("slot_to_roster_id") or {}).items()}
        picks = []
        for p in sorted(picks_raw, key=lambda p: p["pick_no"]):
            md = p.get("metadata") or {}
            picks.append({"pick": p["pick_no"], "round": p["round"], "slot": p["draft_slot"],
                          "franchise": FR_BY_ROSTER.get(p.get("roster_id") or slot_to_roster.get(p["draft_slot"])),
                          "p": ensure_sleeper_player(p["player_id"], md) if p.get("player_id") else None,
                          "keeper": bool(p.get("is_keeper")), "bid": (md.get("amount") if dr["type"] == "auction" else None)})
        label = ("Startup draft" if rounds and rounds >= 10 else "Rookie draft") + f" ({rounds} rounds, {dr['type']})"
        dts = dr.get("start_time") or dr.get("last_picked") or dr.get("created")
        drafts.append({"label": label, "type": dr["type"], "order": dr["type"], "rounds": rounds, "picks": picks,
                       "draft_id": did, "status": dr.get("status"),
                       "date": datetime.datetime.utcfromtimestamp(dts / 1000).strftime("%Y-%m-%dT%H:%M:%SZ") if dts else None})

    # transactions
    events = []
    for f in sorted(d.glob("transactions-*.json")):
        for t in load(f) or []:
            if t.get("status") != "complete":
                continue
            adds = [{"p": ensure_sleeper_player(pid), "to": FR_BY_ROSTER.get(rid)} for pid, rid in (t.get("adds") or {}).items()]
            drops = [{"p": ensure_sleeper_player(pid), "from": FR_BY_ROSTER.get(rid)} for pid, rid in (t.get("drops") or {}).items()]
            picks = [{"season": dp["season"], "round": dp["round"], "from": FR_BY_ROSTER.get(dp["previous_owner_id"]),
                      "to": FR_BY_ROSTER.get(dp["owner_id"]), "original": FR_BY_ROSTER.get(dp["roster_id"])}
                     for dp in (t.get("draft_picks") or [])]
            faab = [{"from": FR_BY_ROSTER.get(x["sender"]), "to": FR_BY_ROSTER.get(x["receiver"]), "amount": x["amount"]}
                    for x in (t.get("waiver_budget") or [])]
            if not adds and not drops and not picks and not faab:
                continue
            created = datetime.datetime.utcfromtimestamp(t["created"] / 1000).strftime("%Y-%m-%dT%H:%M:%SZ")
            events.append({"id": t["transaction_id"], "week": t.get("leg"), "date": created, "type": t["type"],
                           "franchises": sorted({FR_BY_ROSTER.get(r) for r in (t.get("roster_ids") or []) if FR_BY_ROSTER.get(r)}),
                           "adds": adds, "drops": drops, "picks": picks, "faab": faab or None,
                           "bid": (t.get("settings") or {}).get("waiver_bid")})
    events.sort(key=lambda e: (e["date"], e["id"]))

    sc = lg.get("scoring_settings") or {}
    settings = {
        "platform_league_id": lg["league_id"],
        "regular_weeks": reg_end, "playoff_week_start": st["playoff_week_start"], "playoff_teams": st["playoff_teams"],
        "playoff_round_weeks": pw, "playoff_seeding": "division winners first" if st.get("playoff_seed_type") == 1 else "best record",
        "divisions": [v for v in div_names.values() if v],
        "roster_positions": lg["roster_positions"],
        "scoring_type": f"{sc.get('rec', 0):g} PPR" if sc.get("rec") else "standard",
        "scoring": {k: sc.get(k) for k in ("pass_td", "pass_yd", "pass_int", "rush_yd", "rec", "rec_yd", "rec_td", "fum_lost") if k in sc},
        "draft": {"type": "dynasty" if st.get("type") == 2 else "keeper" if st.get("type") == 1 else "redraft",
                  "rounds": st.get("draft_rounds"), "keepers": st.get("max_keepers")},
        "format": ("dynasty" if st.get("type") == 2 else "keeper" if st.get("type") == 1 else "redraft") + (" with superflex" if "SUPER_FLEX" in lg["roster_positions"] else ""),
        "trade_deadline": st.get("trade_deadline"), "waivers": "FAAB" if st.get("waiver_type") == 2 else "rolling",
        "faab": st.get("waiver_budget"), "superflex": "SUPER_FLEX" in lg["roster_positions"],
    }
    notes = []
    if in_season:
        notes.append(f"Season in progress: {last_scored} of {reg_end} regular-season weeks scored.")
    return {
        "season": year, "platform": "sleeper", "status": "in_season" if in_season else "complete",
        "league_name": lg["name"], "champion": next((t["manager"] for t in teams if t["champion"]), None),
        "current_week": current_week, "last_scored_week": last_scored,
        "teams": teams, "matchups": ms, "bracket": {"winners": wb, "losers": lb, "roster_to_franchise": {str(k): v for k, v in FR_BY_ROSTER.items()}},
        "drafts": drafts, "transactions": events, "settings": settings, "notes": notes, "rosters": rosters_out,
    }

# ----------------------------------------------------------------------------- AGGREGATES
def manager_of(season, franchise):
    t = next((t for t in season["teams"] if t["franchise"] == franchise), None)
    return t["manager"] if t else None

def build_aggregates(seasons):
    mgrs = {m["id"]: {"id": m["id"], "display_name": m.get("display_name") or m["id"], "avatar": None,
                      "seasons": [], "franchises": []} for m in IDENT["managers"]}
    # avatars from latest sleeper season
    for s in seasons:
        if s["platform"] != "sleeper":
            continue
        for t in s["teams"]:
            if t["manager"] and t.get("avatar"):
                mgrs[t["manager"]]["avatar"] = t["avatar"]
    games = []  # flat list of (season, matchup, side manager a, b)
    for s in seasons:
        for t in s["teams"]:
            if not t["manager"]:
                continue
            mg = mgrs[t["manager"]]
            mg["seasons"].append({"season": s["season"], "platform": s["platform"], "franchise": t["franchise"],
                                  "team_name": t["team_name"], "wins": t["wins"], "losses": t["losses"], "ties": t["ties"],
                                  "pf": t["pf"], "pa": t["pa"], "playoff_seed": t["playoff_seed"], "final_rank": t["final_rank"],
                                  "champion": t["champion"], "status": s["status"], "standing": t.get("standing")})
            if t["franchise"] not in mg["franchises"]:
                mg["franchises"].append(t["franchise"])
        for m in s["matchups"]:
            if not m["played"]:
                continue
            a, b = manager_of(s, m["home"]["franchise"]), manager_of(s, m["away"]["franchise"])
            games.append((s, m, a, b))

    # streaks + playoff records
    per = collections.defaultdict(list)
    for s, m, a, b in games:
        key = (s["season"], m["weeks"][-1] if m["weeks"] else m["week"], m["id"])
        for me, them, mine, theirs in ((a, b, m["home"], m["away"]), (b, a, m["away"], m["home"])):
            if not me:
                continue
            res = "T" if m["winner"] == "tie" else ("W" if (m["winner"] == "home") == (mine is m["home"]) else "L")
            pbw = mine.get("points_by_week") or {}
            game_pts = max(pbw.values()) if len(pbw) > 1 else mine["points"]
            per[me].append((key, res, m["phase"], game_pts, theirs["points"], them, mine["points"], len(m["weeks"])))
    for mid, rows in per.items():
        rows.sort(key=lambda r: r[0])
        mg = mgrs[mid]
        best = cur = 0; worst = curl = 0
        for _, res, *_ in rows:
            if res == "W":
                cur += 1; curl = 0
            elif res == "L":
                curl += 1; cur = 0
            else:
                cur = curl = 0
            best = max(best, cur); worst = max(worst, curl)
        tail = rows[-1][1]; n = 0
        for r in reversed(rows):
            if r[1] == tail:
                n += 1
            else:
                break
        mg["longest_win_streak"] = best; mg["longest_losing_streak"] = worst
        mg["current_streak"] = f"{tail}{n}"
        mg["playoff_record"] = {"wins": sum(1 for r in rows if r[2] == "playoff" and r[1] == "W"),
                                "losses": sum(1 for r in rows if r[2] == "playoff" and r[1] == "L")}
        mg["all_games"] = {"wins": sum(1 for r in rows if r[1] == "W"), "losses": sum(1 for r in rows if r[1] == "L"),
                           "ties": sum(1 for r in rows if r[1] == "T")}
        pts = [r[3] for r in rows if r[3] is not None]
        total = sum(r[6] for r in rows if r[6] is not None); nweeks = sum(r[7] for r in rows if r[6] is not None)
        mg["avg_points"] = r2(total / nweeks) if nweeks else None
        mg["high_game"] = r2(max(pts)) if pts else None
        mg["low_game"] = r2(min(pts)) if pts else None

    for mg in mgrs.values():
        done = [x for x in mg["seasons"] if x["status"] == "complete"]
        mg["career"] = {
            "seasons": len(mg["seasons"]), "completed_seasons": len(done),
            "wins": sum(x["wins"] for x in mg["seasons"]), "losses": sum(x["losses"] for x in mg["seasons"]),
            "ties": sum(x["ties"] for x in mg["seasons"]),
            "pf": r2(sum(x["pf"] or 0 for x in mg["seasons"])), "pa": r2(sum(x["pa"] or 0 for x in mg["seasons"])),
            "titles": [x["season"] for x in done if x["champion"]],
            "runner_ups": [x["season"] for x in done if x["final_rank"] == 2],
            "third_places": [x["season"] for x in done if x["final_rank"] == 3],
            "last_places": [x["season"] for x in done if x["final_rank"] == 8],
            "playoff_appearances": [x["season"] for x in done if x["playoff_seed"]],
            "best_finish": min((x["final_rank"] for x in done if x["final_rank"]), default=None),
            "avg_finish": r2(sum(x["final_rank"] for x in done if x["final_rank"]) / len([x for x in done if x["final_rank"]])) if any(x["final_rank"] for x in done) else None,
            "espn_seasons": [x["season"] for x in mg["seasons"] if x["platform"] == "espn"],
            "sleeper_seasons": [x["season"] for x in mg["seasons"] if x["platform"] == "sleeper"],
        }
        w, l, t = mg["career"]["wins"], mg["career"]["losses"], mg["career"]["ties"]
        mg["career"]["win_pct"] = r2((w + 0.5 * t) / (w + l + t)) if (w + l + t) else None
        mg["team_names"] = []
        for x in mg["seasons"]:
            if x["team_name"] and (not mg["team_names"] or mg["team_names"][-1]["name"] != x["team_name"]):
                mg["team_names"].append({"name": x["team_name"], "from": x["season"], "to": x["season"]})
            elif mg["team_names"]:
                mg["team_names"][-1]["to"] = x["season"]
        mg["active"] = any(x["season"] == max(s["season"] for s in seasons) for x in mg["seasons"])

    # franchises
    frs = []
    for f in IDENT["franchises"]:
        rows = []
        for s in seasons:
            t = next((t for t in s["teams"] if t["franchise"] == f["id"]), None)
            if t:
                rows.append({"season": s["season"], "platform": s["platform"], "manager": t["manager"], "team_name": t["team_name"],
                             "wins": t["wins"], "losses": t["losses"], "ties": t["ties"], "pf": t["pf"], "pa": t["pa"],
                             "final_rank": t["final_rank"], "playoff_seed": t["playoff_seed"], "champion": t["champion"]})
        frs.append({"id": f["id"], "espn_team": f["espn_team"], "sleeper_roster_id": f["sleeper_roster_id"],
                    "current_name": rows[-1]["team_name"] if rows else None, "current_manager": rows[-1]["manager"] if rows else None,
                    "seasons": rows, "titles": [r["season"] for r in rows if r["champion"]],
                    "managers": list(dict.fromkeys(r["manager"] for r in rows if r["manager"]))})

    # head to head (by manager)
    h2h = collections.defaultdict(lambda: {"games": 0, "a_wins": 0, "b_wins": 0, "ties": 0, "a_pts": 0.0, "b_pts": 0.0,
                                           "playoff_games": 0, "espn_games": 0, "sleeper_games": 0, "last": None, "matchups": []})
    for s, m, a, b in games:
        if not a or not b:
            continue
        key = tuple(sorted((a, b)))
        rec = h2h[key]
        first_is_home = key[0] == a
        hp, ap = m["home"]["points"] or 0, m["away"]["points"] or 0
        rec["games"] += 1
        if m["winner"] == "tie":
            rec["ties"] += 1
        else:
            home_won = m["winner"] == "home"
            a_won = home_won == first_is_home
            rec["a_wins" if a_won else "b_wins"] += 1
        rec["a_pts"] += hp if first_is_home else ap
        rec["b_pts"] += ap if first_is_home else hp
        rec["playoff_games"] += m["phase"] == "playoff"
        rec[f"{s['platform']}_games"] += 1
        rec["matchups"].append({"season": s["season"], "id": m["id"]})
        rec["last"] = {"season": s["season"], "week": m["week"], "winner": None if m["winner"] == "tie" else (a if (m["winner"] == "home") else b)}
    h2h_out = [{"a": k[0], "b": k[1], **{kk: (r2(v) if isinstance(v, float) else v) for kk, v in v.items()}} for k, v in h2h.items()]

    # records
    scores, margins, combined, closest, lowest = [], [], [], [], []
    for s, m, a, b in games:
        hp, ap = m["home"]["points"], m["away"]["points"]
        if hp is None or ap is None:
            continue
        ctx = {"season": s["season"], "platform": s["platform"], "week": m["week"], "weeks": m["weeks"], "phase": m["phase"], "round": m["round"], "id": m["id"]}
        for side, pts, opp, oppts, mg in (("home", hp, m["away"], ap, a), ("away", ap, m["home"], hp, b)):
            me = m[side]
            # single-game records use one scoring week; multi-week playoff games are split per week
            pbw = me.get("points_by_week") or {}
            obw = opp.get("points_by_week") or {}
            if len(m["weeks"]) > 1 and len(pbw) > 1:
                for wk in sorted(pbw, key=int):
                    entry = {**ctx, "week": int(wk), "weeks": [int(wk)], "manager": mg, "franchise": me["franchise"], "team_name": me["team_name"],
                             "points": pbw[wk], "opponent": opp["team_name"], "opponent_manager": (b if side == "home" else a),
                             "opponent_points": obw.get(wk), "round": f"{m['round']} (week {wk})"}
                    scores.append(entry); lowest.append(entry)
            else:
                entry = {**ctx, "manager": mg, "franchise": me["franchise"], "team_name": me["team_name"], "points": pts,
                         "opponent": opp["team_name"], "opponent_manager": (b if side == "home" else a), "opponent_points": oppts}
                scores.append(entry); lowest.append(entry)
        win = m["home"] if hp >= ap else m["away"]; lose = m["away"] if hp >= ap else m["home"]
        margins.append({**ctx, "multi_week": len(m["weeks"]) > 1, "winner": win["team_name"], "winner_manager": a if win is m["home"] else b, "loser": lose["team_name"],
                        "loser_manager": b if win is m["home"] else a, "margin": r2(abs(hp - ap)), "winner_points": max(hp, ap), "loser_points": min(hp, ap)})
        combined.append({**ctx, "multi_week": len(m["weeks"]) > 1, "home": m["home"]["team_name"], "away": m["away"]["team_name"], "home_manager": a, "away_manager": b,
                         "home_points": hp, "away_points": ap, "combined": r2(hp + ap)})
    decided = [x for x in margins if x["margin"] > 0]
    season_rows = []
    for s in seasons:
        for t in s["teams"]:
            if s["status"] != "complete":
                continue
            g = t["wins"] + t["losses"] + t["ties"]
            season_rows.append({"season": s["season"], "platform": s["platform"], "manager": t["manager"], "team_name": t["team_name"],
                                "wins": t["wins"], "losses": t["losses"], "ties": t["ties"], "pf": t["pf"], "pa": t["pa"],
                                "ppg": r2(t["pf"] / g) if g else None, "final_rank": t["final_rank"], "win_pct": r2((t["wins"] + 0.5 * t["ties"]) / g) if g else None})
    N = 15
    records = {
        "note": "ESPN seasons (2016-2021) and Sleeper seasons (2022-) used different scoring systems and roster sizes; single-game and season point records are listed with their platform and are not normalized.",
        "highest_scores": sorted(scores, key=lambda x: -x["points"])[:N],
        "lowest_scores": sorted(lowest, key=lambda x: x["points"])[:N],
        "largest_margins": sorted(margins, key=lambda x: -x["margin"])[:N],
        "closest_games": sorted(decided, key=lambda x: x["margin"])[:N],
        "highest_combined": sorted(combined, key=lambda x: -x["combined"])[:N],
        "lowest_combined": sorted(combined, key=lambda x: x["combined"])[:N],
        "best_seasons": sorted(season_rows, key=lambda x: (-(x["win_pct"] or 0), -(x["pf"] or 0)))[:N],
        "worst_seasons": sorted(season_rows, key=lambda x: ((x["win_pct"] or 0), (x["pf"] or 0)))[:N],
        "most_points_season": sorted(season_rows, key=lambda x: -(x["ppg"] or 0))[:N],
        "fewest_points_season": sorted(season_rows, key=lambda x: (x["ppg"] or 0))[:N],
        "champions": [{"season": s["season"], "platform": s["platform"], "manager": s["champion"],
                       "team_name": next((t["team_name"] for t in s["teams"] if t["champion"]), None),
                       "runner_up": next((t["manager"] for t in s["teams"] if t["final_rank"] == 2), None),
                       "runner_up_team": next((t["team_name"] for t in s["teams"] if t["final_rank"] == 2), None),
                       "record": next((f"{t['wins']}-{t['losses']}" + (f"-{t['ties']}" if t['ties'] else "") for t in s["teams"] if t["champion"]), None)}
                      for s in seasons if s["status"] == "complete"],
        "streaks": sorted([{"manager": m["id"], "longest_win_streak": m.get("longest_win_streak", 0), "longest_losing_streak": m.get("longest_losing_streak", 0)}
                           for m in mgrs.values() if m["seasons"]], key=lambda x: -x["longest_win_streak"]),
    }
    return list(mgrs.values()), frs, h2h_out, records


# ----------------------------------------------------------------------------- PLAYER IDENTITY + PAGES
def _norm_name(n):
    n = (n or "").lower().replace(".", "").replace("'", "").replace("-", " ")
    n = re.sub(r"\b(jr|sr|ii|iii|iv|v)\b", "", n)
    return re.sub(r"[^a-z]", "", n)

def unify_players(seasons):
    """Map ESPN player ids onto Sleeper ids by name (and position) so a career reads as one across eras."""
    db = SLEEPER_PLAYERS or {}
    by_name, defs = {}, {}
    for sid, pr in db.items():
        if pr.get("position") == "DEF":
            defs[(pr.get("last_name") or "").lower()] = sid
            continue
        name = pr.get("full_name") or f"{pr.get('first_name', '')} {pr.get('last_name', '')}".strip()
        if name:
            by_name.setdefault(_norm_name(name), []).append((sid, pr.get("position"), pr))
    alias = {}
    for k, v in list(players.items()):
        if not k.startswith("e:"):
            continue
        sid = None
        if v.get("pos") == "DEF" or "D/ST" in (v.get("name") or ""):
            sid = defs.get(v["name"].replace("D/ST", "").strip().lower())
        else:
            cands = by_name.get(_norm_name(v["name"]), [])
            same = [c for c in cands if c[1] == v.get("pos")]
            pick = same if same else cands
            if len(pick) == 1:
                sid = pick[0][0]
            elif len(pick) > 1:
                # prefer the one with NFL experience overlapping the ESPN years (older players)
                pick.sort(key=lambda c: -(c[2].get("years_exp") or 0))
                sid = pick[0][0]
        if sid:
            alias[k] = "s:" + sid
    for ek, sk in alias.items():
        if sk not in players:
            ensure_sleeper_player(sk[2:])
        players[sk].setdefault("espn_ids", []).append(ek[2:])
        del players[ek]

    def fix(e):
        if e and e.get("p") in alias:
            e["p"] = alias[e["p"]]
    for sn in seasons:
        for m in sn["matchups"]:
            for side in (m["home"], m["away"]):
                for e in side.get("lineup") or []:
                    fix(e)
                for lu in (side.get("lineups_by_week") or {}).values():
                    for e in lu:
                        fix(e)
        for d in sn["drafts"]:
            for pk in d["picks"]:
                fix(pk)
        for t in sn["transactions"]:
            for e in t["adds"] + t["drops"]:
                fix(e)
        for lst in (sn.get("rosters") or {}).get("final", {}).values():
            for e in lst:
                fix(e)
    return len(alias)

def build_player_pages(seasons):
    ten = collections.defaultdict(lambda: {"weeks": 0, "starts": 0, "starter_pts": 0.0, "total_pts": 0.0, "best": None, "slots": collections.Counter()})
    weekly = collections.defaultdict(list)
    def process(sn, m, side, wk, lu):
        fr = side["franchise"]; mg = manager_of(sn, fr)
        for e in lu:
            pid = e.get("p")
            if not pid:
                continue
            starter = e.get("starter") is not False
            pts = e.get("pts") or 0.0
            t = ten[(pid, sn["season"], fr)]
            t["weeks"] += 1
            t["manager"] = mg; t["team_name"] = side["team_name"]; t["platform"] = sn["platform"]
            if starter:
                t["starts"] += 1; t["starter_pts"] += pts
                t["slots"][e.get("slot") or "?"] += 1
                if t["best"] is None or pts > t["best"]["pts"]:
                    t["best"] = {"week": wk, "pts": r2(pts), "round": m.get("round")}
            t["total_pts"] += pts
            weekly[pid].append({"season": sn["season"], "week": wk, "franchise": fr, "slot": e.get("slot"), "pts": r2(pts), "starter": starter, "round": m.get("round")})
    for sn in seasons:
        for m in sn["matchups"]:
            if not (m["played"] or m.get("live")):
                continue
            for side in (m["home"], m["away"]):
                if side.get("lineups_by_week"):
                    for wk, lu in side["lineups_by_week"].items():
                        process(sn, m, side, int(wk), lu)
                elif side.get("lineup"):
                    process(sn, m, side, m["week"], side["lineup"])
    # who ended each season on each franchise (final roster + last scored week), to tell carryovers from real picks
    end_roster = collections.defaultdict(set)
    for sn in seasons:
        for fr, lst in (sn.get("rosters") or {}).get("final", {}).items():
            end_roster[(sn["season"], fr)] |= {e["p"] for e in lst if e.get("p")}
        last = {}
        for m in sn["matchups"]:
            if not m["played"]:
                continue
            for side in (m["home"], m["away"]):
                wk = m["weeks"][-1]
                if wk >= last.get(side["franchise"], (0, None))[0]:
                    lu = (side.get("lineups_by_week") or {}).get(str(wk)) or side.get("lineup") or []
                    last[side["franchise"]] = (wk, lu)
        for fr, (wk, lu) in last.items():
            end_roster[(sn["season"], fr)] |= {e["p"] for e in lu if e.get("p")}
    events = collections.defaultdict(list)
    for sn in seasons:
        for d in sn["drafts"]:
            prior = any(k[0] == sn["season"] - 1 for k in end_roster)
            keeper_draft = (sn["platform"] == "espn" and d.get("keepers", 0) > 0) or (d["label"].startswith("Startup") and prior)
            acquired = collections.defaultdict(set)
            for t in sn["transactions"]:
                if d.get("date") and t["date"] and t["date"] < d["date"]:
                    for a in t["adds"]:
                        acquired[a["to"]].add(a["p"])
            for pk in d["picks"]:
                if pk.get("p"):
                    carried = pk["keeper"] or (keeper_draft and (pk["p"] in end_roster[(sn["season"] - 1, pk["franchise"])] or pk["p"] in acquired[pk["franchise"]]))
                    events[pk["p"]].append({"season": sn["season"], "date": d.get("date"), "week": 0, "type": "carryover" if carried else "draft",
                                            "to": pk["franchise"], "from": None, "round": pk["round"], "pick": pk["pick"], "label": d["label"], "id": None,
                                            "startup": d["label"].startswith("Startup")})
        for t in sn["transactions"]:
            drops = {e["p"]: e["from"] for e in t["drops"]}
            adds = {e["p"]: e["to"] for e in t["adds"]}
            for pid in set(adds) | set(drops):
                events[pid].append({"season": sn["season"], "date": t["date"], "week": t["week"], "type": t["type"], "id": t["id"],
                                    "to": adds.get(pid), "from": drops.get(pid), "bid": t.get("bid"),
                                    "picks": [{"season": x["season"], "round": x["round"], "from": x["from"], "to": x["to"]} for x in t.get("picks") or []] if t["type"] == "trade" else None,
                                    "others": [e["p"] for e in t["adds"] if e["p"] != pid] if t["type"] == "trade" else None})
    pids = set(ten_key[0] for ten_key in ten) | set(events)
    index = []
    OUT_P = OUT / "players"
    OUT_P.mkdir(parents=True, exist_ok=True)
    for old in OUT_P.glob("*.json"):
        old.unlink()
    for pid in pids:
        info = players.get(pid) or {"name": pid, "pos": None, "team": None}
        rows = []
        for (p2, season, fr), t in ten.items():
            if p2 != pid:
                continue
            rows.append({"season": season, "platform": t.get("platform"), "franchise": fr, "manager": t.get("manager"), "team_name": t.get("team_name"),
                         "weeks": t["weeks"], "starts": t["starts"], "starter_pts": r2(t["starter_pts"]), "total_pts": r2(t["total_pts"]),
                         "ppg": r2(t["starter_pts"] / t["starts"]) if t["starts"] else None, "best": t["best"],
                         "slots": dict(t["slots"].most_common(3))})
        rows.sort(key=lambda r: (r["season"], r["franchise"]))
        ev = sorted(events.get(pid, []), key=lambda e: (e["season"], e["date"] or "", e["week"] or 0))
        wk = sorted(weekly.get(pid, []), key=lambda w: -(w["pts"] or 0))
        career = {"weeks": sum(r["weeks"] for r in rows), "starts": sum(r["starts"] for r in rows),
                  "starter_pts": r2(sum(r["starter_pts"] for r in rows)), "total_pts": r2(sum(r["total_pts"] for r in rows)),
                  "seasons": sorted({r["season"] for r in rows} | {e["season"] for e in ev}),
                  "franchises": sorted({r["franchise"] for r in rows} | {e["to"] for e in ev if e.get("to")}),
                  "managers": sorted({r["manager"] for r in rows if r["manager"]}),
                  "trades": sum(1 for e in ev if e["type"] == "trade"), "drafted": [e for e in ev if e["type"] == "draft"][:1],
                  "carryovers": sum(1 for e in ev if e["type"] == "carryover")}
        fid = pid.replace(":", "-")
        detail = {"id": pid, "name": info["name"], "pos": info.get("pos"), "team": info.get("team"), "espn_ids": info.get("espn_ids"),
                  "career": career, "tenures": rows, "events": ev, "best_weeks": wk[:10], "weekly": sorted(weekly.get(pid, []), key=lambda w: (w["season"], w["week"]))}
        (OUT_P / f"{fid}.json").write_text(json.dumps(detail, separators=(",", ":"), ensure_ascii=False), encoding="utf-8")
        if career["weeks"] or ev:
            index.append({"id": pid, "name": info["name"], "pos": info.get("pos"), "team": info.get("team"),
                          "pts": career["starter_pts"], "total": career["total_pts"], "starts": career["starts"], "weeks": career["weeks"],
                          "first": career["seasons"][0] if career["seasons"] else None, "last": career["seasons"][-1] if career["seasons"] else None,
                          "teams": len(career["franchises"]), "trades": career["trades"]})
    index.sort(key=lambda x: -(x["pts"] or 0))
    dump("players-index.json", index)
    # hall of fame by franchise and by manager
    def hof(keyfn):
        agg = collections.defaultdict(lambda: {"starter_pts": 0.0, "total_pts": 0.0, "starts": 0, "weeks": 0, "seasons": set(), "best": None})
        for (pid, season, fr), t in ten.items():
            k = keyfn(season, fr, t)
            if k is None:
                continue
            a = agg[(k, pid)]
            a["starter_pts"] += t["starter_pts"]; a["total_pts"] += t["total_pts"]; a["starts"] += t["starts"]; a["weeks"] += t["weeks"]; a["seasons"].add(season)
            if t["best"] and (a["best"] is None or t["best"]["pts"] > a["best"]["pts"]):
                a["best"] = {**t["best"], "season": season}
        out = collections.defaultdict(list)
        for (k, pid), a in agg.items():
            out[k].append({"p": pid, "starter_pts": r2(a["starter_pts"]), "total_pts": r2(a["total_pts"]), "starts": a["starts"], "weeks": a["weeks"],
                           "ppg": r2(a["starter_pts"] / a["starts"]) if a["starts"] else None,
                           "seasons": sorted(a["seasons"]), "best": a["best"]})
        for k in out:
            out[k].sort(key=lambda x: -x["starter_pts"])
            out[k] = out[k][:25]
        return out
    return hof(lambda season, fr, t: fr), hof(lambda season, fr, t: t.get("manager"))

# ----------------------------------------------------------------------------- MAIN
def main():
    global SLEEPER_PLAYERS
    build_espn_players()
    SLEEPER_PLAYERS = load(SLEEPER / "players.json")
    seasons = [build_espn_season(y) for y in load(ESPN / "league.json")["played_seasons"]]
    sleeper_years = sorted(int(x["season"]) for x in load(SLEEPER / "manifest.json")["leagues"])
    seasons += [build_sleeper_season(y) for y in sleeper_years]
    seasons.sort(key=lambda s: s["season"])
    print("unified espn->sleeper players:", unify_players(seasons))
    managers, franchises, h2h, records = build_aggregates(seasons)
    hof_fr, hof_mg = build_player_pages(seasons)
    for f in franchises:
        f["hall_of_fame"] = hof_fr.get(f["id"], [])
    for m in managers:
        m["hall_of_fame"] = hof_mg.get(m["id"], [])

    for s in seasons:
        dump(f"seasons/{s['season']}.json", s)
    index = [{"season": s["season"], "platform": s["platform"], "status": s["status"], "league_name": s["league_name"],
              "champion": s["champion"], "champion_team": next((t["team_name"] for t in s["teams"] if t["champion"]), None),
              "runner_up": next((t["manager"] for t in s["teams"] if t["final_rank"] == 2), None),
              "team_count": len(s["teams"]), "games": sum(1 for m in s["matchups"] if m["played"]),
              "transactions": len(s["transactions"]), "trades": sum(1 for t in s["transactions"] if t["type"] == "trade"),
              "current_week": s.get("current_week"), "last_scored_week": s.get("last_scored_week"),
              "scoring_type": s["settings"].get("scoring_type"), "notes": s["notes"],
              "top_seed": next((t["manager"] for t in s["teams"] if t["playoff_seed"] == 1), None),
              "points_leader": max(s["teams"], key=lambda t: t["pf"] or 0)["manager"] if s["teams"] else None}
             for s in seasons]
    dump("seasons.json", index)
    dump("managers.json", managers)
    dump("franchises.json", franchises)
    dump("h2h.json", h2h)
    dump("records.json", records)
    # players referenced anywhere
    dump("players.json", players)
    sleeper_state = load(SLEEPER / "state.json")
    manifest = load(SLEEPER / "manifest.json")
    dump("league.json", {
        "name": "BigDongFootball",
        "founded": seasons[0]["season"],
        "format": "dynasty",
        "history_note": "The league began in 2016 on ESPN.",
        "eras": [{"platform": "espn", "label": "ESPN era", "seasons": [s["season"] for s in seasons if s["platform"] == "espn"], "league_id": "1923288",
                  "url": "https://fantasy.espn.com/football/league?leagueId=1923288"},
                 {"platform": "sleeper", "label": "Sleeper era", "seasons": [s["season"] for s in seasons if s["platform"] == "sleeper"],
                  "league_id": manifest["leagues"][0]["league_id"], "url": f"https://sleeper.com/leagues/{manifest['leagues'][0]['league_id']}"}],
        "current_season": seasons[-1]["season"], "current_status": seasons[-1]["status"],
        "nfl_state": {"season": sleeper_state.get("season"), "week": sleeper_state.get("week"), "season_type": sleeper_state.get("season_type")},
        "data_updated": manifest["fetched_utc"],
        "built": datetime.datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ"),
        "counts": {"seasons": len(seasons), "games": sum(1 for s in seasons for m in s["matchups"] if m["played"]),
                   "managers": sum(1 for m in managers if m["seasons"]), "transactions": sum(len(s["transactions"]) for s in seasons),
                   "players": len(players)},
    })
    print("seasons", [(s["season"], s["platform"], s["status"], len(s["matchups"]), len(s["transactions"]), s["champion"]) for s in seasons])
    print("players", len(players))

if __name__ == "__main__":
    main()
