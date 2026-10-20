BIGDONGFOOTBALL — WEBSITE DATA

Start with catalog.json. This export contains data for a future website;
it does not contain a deployed site or frontend application.

Suggested pages and their data:
HOME: league.json, seasons.json, records.json
SEASON: seasons/YEAR/summary.json, standings.json, matchups.json, rules.json
TEAMS: teams.json, plus season-specific standings
MANAGER CAREERS: managers.json, joined to season-specific team ownership
GAME: a matchup joined to lineups.json by matchup_id
DRAFT: seasons/YEAR/draft.json joined to players.json
MOVES: seasons/YEAR/transactions.json filtered to adds-drops-waivers
TRADES: seasons/YEAR/trades.json, joined to its event_ids in transactions.json
RECORDS: records.json
HEAD TO HEAD: head-to-head.json
PLAYER: players.json, plus players/YEAR.json
MEMORIES: memories.json; entries marked needs_editorial_review are drafts

Real manager names and ESPN account identifiers are omitted. Default labels
are anonymous. Historical team names and NFL player names remain intact.
The local private identity map is intentionally excluded from this export.

Use coverage.json when rendering missing-data messages. The 2016-2017
transaction logs were not returned by the endpoints checked. Do not display
their empty arrays as evidence that the league had no transactions.
Only seasons marked played belong in championship and career leaderboards.

All data paths in catalog.json and source references are relative to the
package/archive root. Raw-source references are provenance, not public URLs.
See SCHEMA.txt for status definitions, joins and data limitations.
