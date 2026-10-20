/* BigDongFootball league site — static SPA over data/*.json (no build step). */
(() => {
  const $app = document.getElementById('app');
  const cache = {};
  const D = { league: null, seasons: null, managers: null, franchises: null, h2h: null, records: null, players: null, season: {} };

  // ---------------------------------------------------------------- data
  async function getJSON(path) {
    if (cache[path]) return cache[path];
    const r = await fetch(path, { cache: 'no-cache' });
    if (!r.ok) throw new Error(`${path}: ${r.status}`);
    cache[path] = await r.json();
    return cache[path];
  }
  async function loadCore() {
    if (D.league) return;
    [D.league, D.seasons, D.managers, D.franchises, D.h2h, D.records, D.players] = await Promise.all([
      'league', 'seasons', 'managers', 'franchises', 'h2h', 'records', 'players'].map(n => getJSON(`data/${n}.json`)));
    D.mgr = Object.fromEntries(D.managers.map(m => [m.id, m]));
    D.fr = Object.fromEntries(D.franchises.map(f => [f.id, f]));
  }
  async function loadSeason(y) {
    if (!D.season[y]) D.season[y] = await getJSON(`data/seasons/${y}.json`);
    return D.season[y];
  }
  async function loadAllSeasons() {
    return Promise.all(D.seasons.map(s => loadSeason(s.season)));
  }

  // ---------------------------------------------------------------- helpers
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = (n, d = 2) => n == null ? '—' : Number(n).toFixed(d).replace(/\.?0+$/, m => m === '.00' || m === '.0' ? '' : m.replace(/0+$/, ''));
  const pts = n => n == null ? '—' : (Number.isInteger(n) ? String(n) : Number(n).toFixed(2).replace(/0$/, ''));
  const pct = n => n == null ? '—' : (n >= 1 ? '1.000' : n.toFixed(3).replace(/^0/, ''));
  const rec = t => `${t.wins}-${t.losses}${t.ties ? '-' + t.ties : ''}`;
  const mgrName = id => (D.mgr[id] && D.mgr[id].display_name) || id || '—';
  const mgrLink = id => id ? `<a href="#/manager/${enc(id)}">${esc(mgrName(id))}</a>` : '<span class="muted">—</span>';
  const enc = encodeURIComponent;
  const platformPill = p => `<span class="pill pill-${p}">${p === 'espn' ? 'ESPN' : 'Sleeper'}</span>`;
  const ordinal = n => n == null ? '—' : n + (['th', 'st', 'nd', 'rd'][(n % 100 > 10 && n % 100 < 14) ? 0 : (n % 10 < 4 ? n % 10 : 0)]);
  const player = k => D.players[k] || { name: k ? `Unknown (${k})` : 'Empty slot', pos: null, team: null };
  const playerLabel = k => { const p = player(k); return `${k ? `<a class="plink" href="#/player/${enc(k)}">${esc(p.name)}</a>` : esc(p.name)}${p.pos ? ` <span class="muted small">${esc(p.pos)}${p.team ? ' · ' + esc(p.team) : ''}</span>` : ''}`; };
  const playerRow = k => `<span class="prow">${headshot(k, 'hs hs-xs')}${playerLabel(k)}</span>`;
  const playerLink = k => k ? `<a class="plink" href="#/player/${enc(k)}">${esc(player(k).name)}</a>` : '—';
  const yearRanges = ys => { const u = [...new Set(ys)].sort((a, b) => a - b); const out = []; let st = null, pv = null; u.forEach(y => { if (st === null) { st = pv = y; return; } if (y === pv + 1) { pv = y; return; } out.push(st === pv ? `${st}` : `${st}–${pv}`); st = pv = y; }); if (st !== null) out.push(st === pv ? `${st}` : `${st}–${pv}`); return out.join(', '); };
  const frName = (season, f) => { const t = season && teamOf(season, f); return t ? t.team_name : (D.fr[f] ? D.fr[f].current_name : f); };
  const headshotUrl = k => {
    if (!k) return null;
    const p = player(k);
    if (p.pos === 'DEF') { const ab = (k.startsWith('s:') ? k.slice(2) : (p.team || '')).toLowerCase(); return ab ? `https://sleepercdn.com/images/team_logos/nfl/${esc(ab)}.png` : null; }
    if (k.startsWith('s:')) return `https://sleepercdn.com/content/nfl/players/thumb/${esc(k.slice(2))}.jpg`;
    if (k.startsWith('e:')) return `https://a.espncdn.com/i/headshots/nfl/players/full/${esc(k.slice(2))}.png`;
    return null;
  };
  const headshot = (k, cls = 'hs') => { const u = headshotUrl(k); return u ? `<img class="${cls}" src="${u}" alt="" loading="lazy" onerror="this.style.visibility='hidden'">` : `<span class="${cls} hs-empty"></span>`; };
  const logoImg = (t, cls = 'tlogo') => t && t.logo ? `<img class="${cls}" src="${esc(t.logo)}" alt="" loading="lazy" onerror="this.remove()">` : '';
  const avatar = (m, lg) => {
    const mg = typeof m === 'string' ? D.mgr[m] : m;
    const name = mg ? mg.display_name : '?';
    if (mg && mg.avatar) return `<img class="avatar${lg ? ' lg' : ''}" src="${esc(mg.avatar)}" alt="" loading="lazy">`;
    return `<span class="avatar${lg ? ' lg' : ''}">${esc(name.slice(0, 1).toUpperCase())}</span>`;
  };
  const teamCell = (t, opts = {}) => `<div class="team-cell">${t.logo ? logoImg(t, 'avatar') : avatar(t.manager)}<div><div class="tn">${opts.roster ? `<a href="#/season/${opts.roster}/rosters/final/${t.franchise}" title="Season roster view">${esc(t.team_name)}</a>` : opts.link ? `<a href="#/manager/${enc(t.manager)}">${esc(t.team_name)}</a>` : esc(t.team_name)}${t.champion ? ' <span class="trophy" title="Champion">🏆</span>' : ''}</div><div class="mn">${esc(mgrName(t.manager))}</div></div></div>`;
  const dateFmt = iso => iso ? new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '';
  const weekLabel = m => m.weeks && m.weeks.length > 1 ? `Weeks ${m.weeks[0]}–${m.weeks[m.weeks.length - 1]}` : `Week ${m.week}`;
  function teamOf(season, franchise) { return season.teams.find(t => t.franchise === franchise); }
  function sortTable(rows, key, dir) {
    return rows.slice().sort((a, b) => {
      const x = a[key], y = b[key];
      if (x == null && y == null) return 0; if (x == null) return 1; if (y == null) return -1;
      return (typeof x === 'number' ? x - y : String(x).localeCompare(String(y))) * dir;
    });
  }

  // ---------------------------------------------------------------- matchup card + box score
  function matchupCard(season, m, opts = {}) {
    const side = (s, who) => {
      const t = teamOf(season, s.franchise) || {};
      const cls = m.winner === who ? 'w' : (m.winner && m.winner !== 'tie' ? 'l' : '');
      return `<div class="side ${cls}"><div class="n"><span class="t">${logoImg(t, 'tlogo sm')}${esc(s.team_name)}</span><span class="m">${esc(mgrName(t.manager))}${t.playoff_seed && m.phase !== 'regular' ? ` · #${t.playoff_seed} seed` : ''}</span></div><span class="p">${m.played || m.live ? pts(s.points) : ''}</span></div>`;
    };
    const meta = opts.hideMeta ? '' : `<div class="meta"><span>${esc(m.round || weekLabel(m))}${m.round && m.weeks.length > 1 ? ` · ${weekLabel(m)}` : ''}</span><span>${m.live ? '<span class="pill pill-live">Live</span>' : (!m.played ? 'Upcoming' : (opts.showSeason ? season.season : ''))}</span></div>`;
    return `<div class="mu" data-game="${season.season}|${esc(m.id)}">${meta}${side(m.home, 'home')}${side(m.away, 'away')}</div>`;
  }
  function boxScore(season, m) {
    const col = (s, who) => {
      const t = teamOf(season, s.franchise) || {};
      const lineups = s.lineups_by_week ? Object.entries(s.lineups_by_week) : [[null, s.lineup || []]];
      const body = lineups.map(([wk, lu]) => {
        const starters = lu.filter(e => e.starter !== false);
        const bench = lu.filter(e => e.starter === false);
        const rowsFor = list => list.map(e => `<tr class="${e.starter === false ? 'bench' : ''}"><td class="slot">${esc(e.slot || '')}</td><td>${e.p ? playerRow(e.p) : '<span class="muted">Empty</span>'}</td><td class="pts">${pts(e.pts)}</td></tr>`).join('');
        return `${wk ? `<tr class="bench-head"><td colspan="3">Week ${wk} · ${pts(s.points_by_week[wk])}</td></tr>` : ''}${rowsFor(starters)}${bench.length ? `<tr class="bench-head"><td colspan="3">Bench</td></tr>${rowsFor(bench)}` : ''}`;
      }).join('');
      const note = s.lineup_reconciles === false ? `<div class="small muted">Player points sum to ${pts(s.lineup_sum)}${s.manual_adjustment ? ` (+${pts(s.manual_adjustment)} adj.)` : ''}; the official score is shown.</div>` : '';
      return `<div><h4><span>${logoImg(t, 'tlogo')}${esc(s.team_name)} <span class="muted small">${esc(mgrName(t.manager))}</span></span><span class="mono ${m.winner === who ? 'trophy' : ''}">${pts(s.points)}</span></h4>${note}<table>${body || '<tr><td class="muted">No lineup recorded</td></tr>'}</table></div>`;
    };
    const espnNote = season.platform === 'espn' ? `<p class="small muted">ESPN's archive does not say which players started, so starters and bench are not separated for ${season.season}.</p>` : '';
    return `<div class="row"><h3 style="margin:0">${esc(m.round || weekLabel(m))} · ${season.season}</h3>${platformPill(season.platform)}${m.round ? `<span class="muted small">${weekLabel(m)}</span>` : ''}</div>${espnNote}<div class="box">${col(m.home, 'home')}${col(m.away, 'away')}</div>`;
  }
  async function openGame(year, id) {
    const s = await loadSeason(year);
    const m = s.matchups.find(x => x.id === id);
    if (!m) return;
    document.getElementById('modalBody').innerHTML = boxScore(s, m);
    document.getElementById('modal').hidden = false;
    document.body.style.overflow = 'hidden';
  }
  function closeModal() { document.getElementById('modal').hidden = true; document.body.style.overflow = ''; }
  document.getElementById('modalClose').onclick = closeModal;
  document.getElementById('modal').addEventListener('click', e => { if (e.target.id === 'modal') closeModal(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });
  document.addEventListener('click', e => {
    const g = e.target.closest('[data-game]');
    if (g) { const [y, id] = g.dataset.game.split('|'); openGame(+y, id); }
  });

  // ---------------------------------------------------------------- pages
  async function pageHome() {
    const L = D.league, cur = D.seasons[D.seasons.length - 1];
    const curS = await loadSeason(cur.season);
    const champs = D.records.champions.slice().reverse();
    const titles = {};
    champs.forEach(c => { titles[c.manager] = (titles[c.manager] || 0) + 1; });
    const leaders = D.managers.filter(m => m.seasons.length).slice().sort((a, b) => (b.career.titles.length - a.career.titles.length) || (b.career.win_pct - a.career.win_pct));
    const wk = curS.current_week || curS.last_scored_week;
    const thisWeek = curS.matchups.filter(m => m.week === wk && m.phase === 'regular');
    const lastWeek = curS.matchups.filter(m => m.week === curS.last_scored_week && m.phase === 'regular');
    const standings = curS.teams.slice().sort((a, b) => (a.standing || 99) - (b.standing || 99));
    const eraTL = D.seasons.map(s => `<a class="tl-year ${s.platform}" href="#/season/${s.season}"><div class="y">${s.season}</div><div class="c">${s.status === 'complete' ? `<b>${esc(s.champion_team)}</b>${esc(mgrName(s.champion))}` : `<b>In progress</b>Week ${esc(s.current_week)}`}</div></a>`).join('');
    const topGames = D.records.highest_scores.slice(0, 5);
    $app.innerHTML = `
      <section class="hero">
        <h1>BigDongFootball</h1>
        <p class="tag">A dynasty league since day one. The first six seasons ran on ESPN as a keeper league because ESPN had no dynasty format; in 2022 the same eight franchises moved to Sleeper and kept building. Every game, roster, draft and trade from both eras is here in one place.</p>
        <div class="stat-row">
          <div class="stat"><span class="v">${L.counts.seasons}</span><span class="l">Seasons</span></div>
          <div class="stat"><span class="v">${L.counts.games}</span><span class="l">Games played</span></div>
          <div class="stat"><span class="v">${D.records.champions.length}</span><span class="l">Champions crowned</span></div>
          <div class="stat"><span class="v">${L.counts.transactions.toLocaleString()}</span><span class="l">Roster moves</span></div>
          <div class="stat"><span class="v">${L.counts.managers}</span><span class="l">Managers all-time</span></div>
        </div>
      </section>
      <section class="section">
        <div class="era-legend"><span><i style="background:var(--espn)"></i>ESPN era</span><span><i style="background:var(--sleeper)"></i>Sleeper era</span></div>
        <div class="timeline">${eraTL}</div>
      </section>
      <section class="section grid grid-2">
        <div class="card">
          <div class="card-head"><h2>${cur.season} ${cur.status === 'complete' ? 'Final standings' : 'Standings'}</h2><a class="small" href="#/season/${cur.season}">Full season →</a></div>
          <div class="table-wrap"><table class="tbl"><thead><tr><th class="rank">#</th><th>Team</th><th class="num">W-L</th><th class="num">PF</th><th class="num">PA</th></tr></thead><tbody>
            ${standings.map((t, i) => `<tr class="${t.playoff_seed || (cur.status !== 'complete' && i < (curS.settings.playoff_teams || 4)) ? 'hl' : ''}"><td class="rank">${t.final_rank || i + 1}</td><td>${teamCell(t, { link: true })}</td><td class="num">${rec(t)}</td><td class="num">${pts(t.pf)}</td><td class="num">${pts(t.pa)}</td></tr>`).join('')}
          </tbody></table></div>
          ${cur.status !== 'complete' ? `<p class="small muted" style="margin-top:8px">Highlighted rows are in the current playoff positions (${curS.settings.playoff_teams} teams qualify). Playoffs begin week ${curS.settings.playoff_week_start}.</p>` : ''}
        </div>
        <div class="card">
          <div class="card-head"><h2>${thisWeek.length && thisWeek.some(m => !m.played) ? `Week ${wk} ${thisWeek.some(m => m.live) ? '— live' : ''}` : `Week ${curS.last_scored_week} results`}</h2><a class="small" href="#/season/${cur.season}/schedule">All weeks →</a></div>
          <div class="matchups" style="grid-template-columns:1fr">${(thisWeek.length ? thisWeek : lastWeek).map(m => matchupCard(curS, m)).join('') || '<div class="empty">No games yet.</div>'}</div>
        </div>
      </section>
      <section class="section">
        <div class="card-head"><h2>Champions</h2><a class="small" href="#/records">Record book →</a></div>
        <div class="champs">${champs.map(c => `<a class="champ" href="#/season/${c.season}"><div class="y">${c.season}</div>${c.logo ? `<img class="champ-logo" src="${esc(c.logo)}" alt="" loading="lazy" onerror="this.remove()">` : ''}<div class="t">${esc(c.team_name)}</div><div class="m">${esc(mgrName(c.manager))} · ${esc(c.record)}</div></a>`).join('')}</div>
      </section>
      <section class="section grid grid-2">
        <div class="card">
          <div class="card-head"><h2>All-time leaderboard</h2><a class="small" href="#/managers">All managers →</a></div>
          <div class="table-wrap"><table class="tbl"><thead><tr><th>Manager</th><th class="num">Titles</th><th class="num">W-L</th><th class="num">Win%</th><th class="num">Playoffs</th></tr></thead><tbody>
            ${leaders.filter(m => m.active).map(m => `<tr><td><div class="team-cell">${avatar(m)}<div><div class="tn"><a href="#/manager/${enc(m.id)}">${esc(m.display_name)}</a></div><div class="mn">${esc(m.team_names[m.team_names.length - 1].name)}</div></div></div></td><td class="num">${m.career.titles.length ? '🏆'.repeat(m.career.titles.length) : '—'}</td><td class="num">${m.career.wins}-${m.career.losses}${m.career.ties ? '-' + m.career.ties : ''}</td><td class="num">${pct(m.career.win_pct)}</td><td class="num">${m.career.playoff_appearances.length}</td></tr>`).join('')}
          </tbody></table></div>
        </div>
        <div class="card">
          <div class="card-head"><h2>Highest scores ever</h2><a class="small" href="#/records">More records →</a></div>
          <ol class="record-list">${topGames.map((r, i) => `<li data-game="${r.season}|${esc(r.id)}" style="cursor:pointer"><span class="i">${i + 1}</span><span class="d">${esc(r.team_name)} <small>${esc(mgrName(r.manager))} · ${r.season} ${r.round ? esc(r.round) : 'week ' + r.week} vs ${esc(r.opponent)} (${pts(r.opponent_points)}) ${platformPill(r.platform)}</small></span><span class="v">${pts(r.points)}</span></li>`).join('')}</ol>
          <p class="small muted" style="margin-top:10px">${esc(D.records.note)}</p>
        </div>
      </section>`;
  }

  function pageSeasons() {
    $app.innerHTML = `<div class="page-head"><h1>Seasons</h1><span class="sub">${D.seasons.length} seasons · ESPN 2016–2021 · Sleeper 2022–present</span></div>
    <div class="table-wrap"><table class="tbl"><thead><tr><th>Season</th><th>Platform</th><th>Champion</th><th>Runner-up</th><th>#1 seed</th><th>Points leader</th><th class="num">Games</th><th class="num">Moves</th><th class="num">Trades</th><th>Scoring</th></tr></thead><tbody>
    ${D.seasons.slice().reverse().map(s => `<tr><td><a href="#/season/${s.season}"><b>${s.season}</b></a>${s.status !== 'complete' ? ` <span class="pill pill-live">Week ${esc(s.current_week)}</span>` : ''}</td><td>${platformPill(s.platform)}</td><td>${s.champion ? `<div class="team-cell">${s.champion_logo ? `<img class="avatar" src="${esc(s.champion_logo)}" alt="" loading="lazy">` : avatar(s.champion)}<div><b>${esc(s.champion_team)}</b><div class="small muted">${mgrLink(s.champion)}</div></div></div>` : '<span class="muted">TBD</span>'}</td><td>${s.runner_up ? mgrLink(s.runner_up) : '—'}</td><td>${s.top_seed ? mgrLink(s.top_seed) : '—'}</td><td>${mgrLink(s.points_leader)}</td><td class="num">${s.games}</td><td class="num">${s.transactions || '<span class="muted">n/a</span>'}</td><td class="num">${s.trades || (s.transactions ? 0 : '<span class="muted">n/a</span>')}</td><td class="small">${esc(s.scoring_type || '')}</td></tr>`).join('')}
    </tbody></table></div>
    <div class="notes">BigDongFootball has always been a dynasty league. On ESPN (2016–2021) that was done through yearly keeper drafts where managers re-selected their carried-over rosters; the move to Sleeper in 2022 made it a native dynasty league. The league began in 2016. ESPN no longer serves itemized move logs for 2016 and 2017; those seasons show official per-team counters plus moves reconstructed from lineups and rosters, marked "reconstructed". 2022 and 2023 exist on ESPN only as unused auto-renewed shells; the real seasons were played on Sleeper and are shown from there.</div>`;
  }

  async function pageSeason(year, tab = 'standings', arg, arg2) {
    const s = await loadSeason(year);
    const idx = D.seasons.findIndex(x => x.season === year);
    const prev = D.seasons[idx - 1], next = D.seasons[idx + 1];
    const tabs = [['standings', 'Standings'], ['schedule', 'Schedule & scores'], ['playoffs', 'Playoffs'], ['rosters', 'Rosters'], ['draft', 'Draft'], ['moves', 'Moves'], ['trades', 'Trades'], ['rules', 'Rules']];
    const champ = s.teams.find(t => t.champion);
    let body = '';
    if (tab === 'standings') body = seasonStandings(s);
    else if (tab === 'schedule') body = seasonSchedule(s);
    else if (tab === 'playoffs') body = seasonPlayoffs(s);
    else if (tab === 'rosters') body = seasonRosters(s, arg, arg2);
    else if (tab === 'draft') body = seasonDraft(s);
    else if (tab === 'moves') body = seasonMoves(s, false);
    else if (tab === 'trades') body = seasonMoves(s, true);
    else if (tab === 'rules') body = seasonRules(s);
    $app.innerHTML = `<div class="page-head"><h1>${year} season</h1>${platformPill(s.platform)}${s.status !== 'complete' ? `<span class="pill pill-live">In progress · week ${esc(s.current_week)}</span>` : ''}<span class="sub">${champ ? `🏆 ${esc(champ.team_name)} (${esc(mgrName(champ.manager))})` : ''}</span><span class="spacer"></span>
      <span class="row">${prev ? `<a class="btn" href="#/season/${prev.season}/${tab}">← ${prev.season}</a>` : ''}${next ? `<a class="btn" href="#/season/${next.season}/${tab}">${next.season} →</a>` : ''}</span></div>
      <div class="tabs">${tabs.map(([k, l]) => `<a href="#/season/${year}/${k}" class="${k === tab ? 'active' : ''}">${l}</a>`).join('')}</div>${body}
      ${s.notes.length ? `<div class="notes"><b>Data notes</b><ul>${s.notes.map(n => `<li>${esc(n)}</li>`).join('')}</ul></div>` : ''}`;
  }
  function seasonStandings(s) {
    const divs = s.settings.divisions || [];
    const byDiv = divs.length && s.teams.some(t => t.division) ? divs.map(d => [d, s.teams.filter(t => t.division === d)]) : [[null, s.teams]];
    const order = list => list.slice().sort((a, b) => (a.standing || a.final_rank || 99) - (b.standing || b.final_rank || 99) || (a.final_rank || 99) - (b.final_rank || 99));
    const table = (list, title) => `<div class="card"><div class="card-head"><h3>${title || 'Regular season'}</h3></div><div class="table-wrap"><table class="tbl"><thead><tr><th class="rank">#</th><th>Team</th><th class="num">W</th><th class="num">L</th>${s.teams.some(t => t.ties) ? '<th class="num">T</th>' : ''}<th class="num">Pct</th><th class="num">PF</th><th class="num m-hide">PA</th><th class="num m-hide">Diff</th><th class="num">Seed</th><th class="num">Final</th></tr></thead><tbody>
      ${order(list).map((t, i) => { const g = t.wins + t.losses + t.ties; return `<tr class="${t.playoff_seed ? 'hl' : ''}"><td class="rank">${i + 1}</td><td>${teamCell(t, { link: true, roster: s.season })}</td><td class="num">${t.wins}</td><td class="num">${t.losses}</td>${s.teams.some(x => x.ties) ? `<td class="num">${t.ties}</td>` : ''}<td class="num">${g ? pct((t.wins + .5 * t.ties) / g) : '—'}</td><td class="num">${pts(t.pf)}</td><td class="num m-hide">${pts(t.pa)}</td><td class="num m-hide ${t.pf - t.pa >= 0 ? '' : 'muted'}">${t.pf != null ? (t.pf - t.pa >= 0 ? '+' : '') + pts(+(t.pf - t.pa).toFixed(2)) : '—'}</td><td class="num">${t.playoff_seed || ''}</td><td class="num">${t.final_rank ? ordinal(t.final_rank) : ''}</td></tr>`; }).join('')}
      </tbody></table></div></div>`;
    const finalOrder = s.status === 'complete' ? `<div class="card" style="margin-top:18px"><div class="card-head"><h3>Final standings</h3><span class="small muted">champion and runner-up from the title game; semifinal losers, then non-playoff teams, in regular-season order. Third-place and consolation games do not affect placement.</span></div><div class="table-wrap"><table class="tbl"><thead><tr><th class="rank">#</th><th>Team</th><th>Regular season</th><th>Result</th></tr></thead><tbody>
      ${s.teams.slice().sort((a, b) => (a.final_rank || 99) - (b.final_rank || 99)).map(t => `<tr><td class="rank">${t.final_rank}</td><td>${teamCell(t, { link: true })}</td><td>${rec(t)} · ${pts(t.pf)} pts${t.playoff_seed ? ` · #${t.playoff_seed} seed` : ''}</td><td>${t.final_rank === 1 ? '<span class="pill pill-champ">Champion</span>' : t.final_rank === 2 ? 'Runner-up' : t.playoff_seed ? 'Semifinalist' : t.final_rank === s.teams.length ? '<span class="muted">Last place</span>' : ''}</td></tr>`).join('')}
      </tbody></table></div></div>` : '';
    return `${byDiv.map(([d, list]) => table(list, d ? `${d} division` : null)).join('')}${finalOrder}`;
  }
  function seasonSchedule(s) {
    const weeks = {};
    s.matchups.filter(m => m.phase === 'regular').forEach(m => (weeks[m.week] = weeks[m.week] || []).push(m));
    const post = s.matchups.filter(m => m.phase !== 'regular');
    const blocks = Object.keys(weeks).map(Number).sort((a, b) => a - b).map(w => {
      const ms = weeks[w];
      const top = ms.filter(m => m.played).flatMap(m => [[m.home, m], [m.away, m]]).sort((a, b) => b[0].points - a[0].points)[0];
      return `<div class="week-block"><h3>Week ${w} ${ms.some(m => m.live) ? '<span class="pill pill-live">Live</span>' : ''}${top ? `<span class="small muted" style="font-family:var(--font);font-weight:400">top score: ${esc(top[0].team_name)} ${pts(top[0].points)}</span>` : ''}</h3><div class="matchups">${ms.map(m => matchupCard(s, m, { hideMeta: true })).join('')}</div></div>`;
    }).join('');
    return `${blocks}${post.length ? `<div class="week-block"><h3>Postseason</h3><div class="matchups">${post.map(m => matchupCard(s, m)).join('')}</div></div>` : ''}<p class="small muted">Click any game for the box score.</p>`;
  }
  function seasonPlayoffs(s) {
    const po = s.matchups.filter(m => m.phase === 'playoff'), co = s.matchups.filter(m => m.phase === 'consolation');
    if (!po.length) return `<div class="empty">Playoffs have not started. ${s.settings.playoff_teams} teams qualify; the bracket begins week ${s.settings.playoff_week_start}.</div>`;
    const group = list => { const g = {}; list.forEach(m => (g[m.round] = g[m.round] || []).push(m)); return Object.entries(g); };
    const col = (title, list) => `<div class="col"><h4>${title}</h4>${group(list).map(([r, ms]) => `<h3 style="font-size:1rem;margin:10px 0 6px">${esc(r)} <span class="small muted" style="font-family:var(--font);font-weight:400">${weekLabel(ms[0])}</span></h3>${ms.map(m => matchupCard(s, m, { hideMeta: true })).join('')}`).join('')}</div>`;
    const champ = s.teams.find(t => t.champion);
    return `${champ ? `<div class="card" style="margin-bottom:18px;display:flex;gap:16px;align-items:center">${champ.logo ? `<img class="avatar lg" src="${esc(champ.logo)}" alt="">` : avatar(champ.manager, true)}<div><div class="small muted">${s.season} champion</div><h2 style="margin:0">${esc(champ.team_name)}</h2><div>${mgrLink(champ.manager)} · ${rec(champ)} regular season · #${champ.playoff_seed || '?'} seed</div></div></div>` : ''}
      <div class="bracket">${col('Championship bracket', po)}${co.length ? col('Consolation bracket · does not count for anything', co) : ''}</div><p class="small muted">The third-place game and the consolation bracket do not affect final standings; consolation games are also left out of records, rivalries, streaks and player totals.</p>`;
  }
  function rosterWeek(s, sel) {
    // weekly rosters come from the matchup lineups; the final/current snapshot from rosters.final
    const byFr = {};
    if (sel === 'final') {
      Object.entries(s.rosters.final).forEach(([f, lu]) => byFr[f] = { lineup: lu, pts: null });
    } else {
      s.matchups.forEach(m => {
        if (!m.weeks.includes(sel)) return;
        [m.home, m.away].forEach(side => {
          const lu = side.lineups_by_week ? side.lineups_by_week[String(sel)] : (m.weeks.length === 1 ? side.lineup : null);
          if (lu) byFr[side.franchise] = { lineup: lu, pts: side.points_by_week ? side.points_by_week[String(sel)] : side.points, opp: (side === m.home ? m.away : m.home).team_name, label: m.round || null, won: m.winner === (side === m.home ? 'home' : 'away') };
        });
      });
    }
    return byFr;
  }
  function seasonRosters(s, which, arg2) {
    const weeks = [...new Set(s.matchups.filter(m => m.played || m.live).flatMap(m => m.weeks))].sort((a, b) => a - b);
    const hasFinal = s.rosters && Object.keys(s.rosters.final || {}).length;
    const teamSel = arg2 && /^f\d+$/.test(arg2) ? arg2 : null;
    const view = teamSel ? 'team' : (arg2 === 'cards' ? 'cards' : 'grid');
    const sel = which && which !== 'final' ? +which : (which === 'final' || !weeks.length ? 'final' : weeks[weeks.length - 1]);
    const byFr = rosterWeek(s, sel);
    const order = s.teams.slice().sort((a, b) => (a.final_rank || a.standing || 99) - (b.final_rank || b.standing || 99));
    const suffix = view === 'cards' ? '/cards' : '';
    const picker = `<div class="row" style="margin-bottom:14px"><span class="muted small">Week</span><div class="row" style="gap:4px">${weeks.map(w => `<a class="btn" style="padding:4px 9px" href="#/season/${s.season}/rosters/${w}${suffix}" ${sel === w ? 'data-active' : ''}>${w}</a>`).join('')}${hasFinal ? `<a class="btn" style="padding:4px 9px" href="#/season/${s.season}/rosters/final${suffix}" ${sel === 'final' ? 'data-active' : ''}>${esc(s.rosters.final_label)}</a>` : ''}</div><span class="spacer"></span>
      <select class="sel" id="rosterTeam"><option value="">All teams</option>${order.map(t => `<option value="${t.franchise}" ${teamSel === t.franchise ? 'selected' : ''}>${esc(t.team_name)}</option>`).join('')}</select>
      ${!teamSel ? `<div class="seg"><a class="${view === 'grid' ? 'active' : ''}" href="#/season/${s.season}/rosters/${sel}">Grid</a><a class="${view === 'cards' ? 'active' : ''}" href="#/season/${s.season}/rosters/${sel}/cards">Cards</a></div>` : ''}
      <input class="inp" id="rosterFilter" placeholder="Find a player…" style="min-width:180px"></div>`;
    const slotless = s.platform === 'espn' && sel !== 'final' && !s.rosters.weekly;
    setTimeout(() => { const t = document.getElementById('rosterTeam'); if (t) t.onchange = () => { location.hash = `#/season/${s.season}/rosters/${sel}${t.value ? '/' + t.value : ''}`; }; }, 0);
    setTimeout(() => {
      const inp = document.getElementById('rosterFilter');
      if (inp) inp.oninput = () => { const q = inp.value.trim().toLowerCase(); document.querySelectorAll('.roster-card tr[data-name]').forEach(tr => { tr.style.display = !q || tr.dataset.name.includes(q) ? '' : 'none'; tr.classList.toggle('hit', !!q && tr.dataset.name.includes(q)); }); document.querySelectorAll('.roster-card').forEach(c => c.style.display = !q || c.querySelector('tr.hit') ? '' : 'none'); document.querySelectorAll('.gcell[data-name]').forEach(g => { g.classList.toggle('hit', !!q && g.dataset.name.includes(q)); g.classList.toggle('dim', !!q && !g.dataset.name.includes(q)); }); };
    }, 0);
    if (teamSel) return picker + teamSeasonView(s, teamSel, weeks);
    if (view === 'grid') {
      // one compact table: rows = lineup slots, columns = teams
      const starterSlots = s.settings.roster_positions.filter(p => p !== 'BN' && p !== 'IR');
      const cols = order.map(t => ({ t, r: byFr[t.franchise] }));
      const maxBench = Math.max(0, ...cols.map(c => c.r ? c.r.lineup.filter(e => e.starter === false).length : 0));
      const cell = e => e ? `<div class="gcell ${e.starter === false ? 'bench' : ''}" data-name="${esc(player(e.p).name.toLowerCase())}"><span class="gn">${e.p ? playerLink(e.p) : '<span class="muted">—</span>'}</span><span class="gp">${player(e.p).pos ? esc(player(e.p).pos) : ''}${e.pts != null && sel !== 'final' ? ` · <b>${pts(e.pts)}</b>` : ''}</span></div>` : '<div class="gcell muted">—</div>';
      const rowsHtml = [];
      if (slotless) {
        const maxN = Math.max(0, ...cols.map(c => c.r ? c.r.lineup.length : 0));
        for (let i = 0; i < maxN; i++) rowsHtml.push(`<tr><td class="slot">${i + 1}</td>${cols.map(c => `<td>${cell(c.r && c.r.lineup[i])}</td>`).join('')}</tr>`);
      } else {
        starterSlots.forEach((slot, i) => {
          rowsHtml.push(`<tr><td class="slot">${esc(slot)}</td>${cols.map(c => { const st = c.r ? c.r.lineup.filter(e => e.starter !== false) : []; const e = st.find((x, j) => x.slot === slot && !st.slice(0, j).some((y, k) => y.slot === slot && k >= 0 && st.slice(0, j).filter(z => z.slot === slot).length > i - starterSlots.slice(0, i).filter(z => z === slot).length)) ; return `<td>${cell(st.filter(x => x.slot === slot)[starterSlots.slice(0, i).filter(z => z === slot).length])}</td>`; }).join('')}</tr>`);
        });
        if (maxBench) rowsHtml.push(`<tr class="bench-head"><td class="slot">BN</td>${cols.map(() => '<td></td>').join('')}</tr>`);
        for (let i = 0; i < maxBench; i++) rowsHtml.push(`<tr class="benchrow"><td class="slot"></td>${cols.map(c => { const b = c.r ? c.r.lineup.filter(e => e.starter === false) : []; return `<td>${cell(b[i])}</td>`; }).join('')}</tr>`);
      }
      return `${picker}${slotless ? '<div class="notes">ESPN kept only the nine starters for each week of this season, without slot labels. The full roster is only available as the end-of-season snapshot.</div>' : ''}
        <div class="table-wrap"><table class="rgrid"><thead><tr><th></th>${cols.map(c => `<th><a href="#/season/${s.season}/rosters/${sel}/${c.t.franchise}">${logoImg(c.t, 'tlogo')}${esc(c.t.team_name)}</a><div class="small muted" style="font-weight:400">${esc(mgrName(c.t.manager))}${c.r && c.r.pts != null ? ` · ${pts(c.r.pts)}${c.r.won ? ' ✓' : ''}` : ''}</div></th>`).join('')}</tr></thead><tbody>${rowsHtml.join('')}</tbody></table></div>
        <p class="small muted">Click a team name for its week-by-week season view.</p>`;
    }
    const card = t => {
      const r = byFr[t.franchise];
      if (!r) return `<div class="card"><h3>${esc(t.team_name)}</h3><div class="empty">No roster recorded for this week.</div></div>`;
      const starters = r.lineup.filter(e => e.starter !== false), bench = r.lineup.filter(e => e.starter === false);
      const rows = list => list.map(e => `<tr class="${e.starter === false ? 'bench' : ''}" data-name="${esc(player(e.p).name.toLowerCase())}"><td class="slot">${esc(e.slot || '')}</td><td>${e.p ? playerRow(e.p) : '<span class="muted">Empty</span>'}</td><td class="pts">${e.pts == null ? '' : pts(e.pts)}</td></tr>`).join('');
      return `<div class="card roster-card"><div class="card-head"><div>${teamCell(t, { link: true })}</div><div class="num mono">${r.pts != null ? pts(r.pts) : ''}</div></div>${r.opp ? `<div class="small muted" style="margin:-6px 0 8px">${esc(r.label || 'Week ' + sel)} vs ${esc(r.opp)}</div>` : ''}<table class="box-table">${rows(starters)}${bench.length ? `<tr class="bench-head"><td colspan="3">Bench${bench.some(e => e.slot === 'IR' || e.slot === 'TAXI') ? ' / IR' : ''}</td></tr>${rows(bench)}` : ''}</table></div>`;
    };
    setTimeout(() => {
      const inp = document.getElementById('rosterFilter');
      if (inp) inp.oninput = () => { const q = inp.value.trim().toLowerCase(); document.querySelectorAll('.roster-card tr[data-name]').forEach(tr => { tr.style.display = !q || tr.dataset.name.includes(q) ? '' : 'none'; tr.classList.toggle('hit', !!q && tr.dataset.name.includes(q)); }); document.querySelectorAll('.roster-card').forEach(c => c.style.display = !q || c.querySelector('tr.hit') ? '' : 'none'); document.querySelectorAll('.gcell[data-name]').forEach(g => g.classList.toggle('hit', !!q && g.dataset.name.includes(q))); document.querySelectorAll('.gcell[data-name]').forEach(g => g.classList.toggle('dim', !!q && !g.dataset.name.includes(q))); };
    }, 0);
    return `${picker}${slotless ? '<div class="notes">ESPN kept only the nine starters for each week of this season, without slot labels. The full roster is only available as the end-of-season snapshot.</div>' : ''}<div class="grid grid-2 rosters">${order.map(card).join('')}</div>`;
  }
  function teamSeasonView(s, fr, weeks) {
    // one team, weeks across, starters down (by slot), bench below; cells are player + points
    const t = teamOf(s, fr);
    const cols = weeks.map(w => ({ w, r: rosterWeek(s, w)[fr] }));
    const starterSlots = s.settings.roster_positions.filter(p => p !== 'BN' && p !== 'IR');
    const slotless = s.platform === 'espn' && !s.rosters.weekly;
    const cell = e => e ? `<div class="gcell ${e.starter === false ? 'bench' : ''}" data-name="${esc(player(e.p).name.toLowerCase())}"><span class="gn">${e.p ? playerLink(e.p) : '<span class="muted">—</span>'}</span><span class="gp">${e.pts != null ? `<b>${pts(e.pts)}</b>` : ''}</span></div>` : '<div class="gcell muted">—</div>';
    const rows = [];
    if (slotless) {
      const maxN = Math.max(0, ...cols.map(c => c.r ? c.r.lineup.length : 0));
      for (let i = 0; i < maxN; i++) rows.push(`<tr><td class="slot">${i + 1}</td>${cols.map(c => `<td>${cell(c.r && c.r.lineup.slice().sort((a, b) => (b.pts || 0) - (a.pts || 0))[i])}</td>`).join('')}</tr>`);
    } else {
      starterSlots.forEach((slot, i) => {
        const nth = starterSlots.slice(0, i).filter(z => z === slot).length;
        rows.push(`<tr><td class="slot">${esc(slot)}</td>${cols.map(c => { const st = c.r ? c.r.lineup.filter(e => e.starter !== false && e.slot === slot) : []; return `<td>${cell(st[nth])}</td>`; }).join('')}</tr>`);
      });
      const maxBench = Math.max(0, ...cols.map(c => c.r ? c.r.lineup.filter(e => e.starter === false).length : 0));
      if (maxBench) rows.push(`<tr class="bench-head"><td class="slot">BN</td>${cols.map(() => '<td></td>').join('')}</tr>`);
      for (let i = 0; i < maxBench; i++) rows.push(`<tr class="benchrow"><td class="slot"></td>${cols.map(c => { const b = c.r ? c.r.lineup.filter(e => e.starter === false) : []; return `<td>${cell(b[i])}</td>`; }).join('')}</tr>`);
    }
    const final = (s.rosters.final || {})[fr];
    const totals = cols.map(c => c.r && c.r.pts != null ? pts(c.r.pts) : '');
    return `<div class="card" style="margin-bottom:14px;display:flex;gap:14px;align-items:center">${t.logo ? `<img class="avatar lg" src="${esc(t.logo)}" alt="">` : avatar(t.manager, true)}<div><h2 style="margin:0">${esc(t.team_name)}</h2><div class="muted">${mgrLink(t.manager)} · ${rec(t)}${t.pf != null ? ` · ${pts(t.pf)} pts` : ''}${t.final_rank ? ` · finished ${ordinal(t.final_rank)}` : ''}</div></div></div>
      ${slotless ? '<div class="notes">ESPN kept only the nine starters per week for this season, without slot labels; starters are listed by points.</div>' : ''}
      <div class="table-wrap"><table class="rgrid team"><thead><tr><th></th>${cols.map(c => `<th><a href="#/season/${s.season}/rosters/${c.w}">Wk ${c.w}</a><div class="small muted" style="font-weight:400">${c.r ? `${c.r.won ? '<span class="trophy">W</span>' : c.r.won === false && c.r.pts != null ? 'L' : ''} ${c.r.label ? esc(c.r.label) : ''} vs ${esc(c.r.opp || '')}` : ''}</div></th>`).join('')}</tr></thead><tbody>${rows.join('')}<tr class="total"><td class="slot">Pts</td>${totals.map(x => `<td><b>${x}</b></td>`).join('')}</tr></tbody></table></div>
      ${final && final.length ? `<h3 style="margin-top:22px">${esc(s.rosters.final_label)}</h3><div class="row" style="gap:6px">${final.map(e => `<span class="pill pill-neutral" style="text-transform:none;font-size:.8rem">${e.slot && e.slot !== 'BN' ? `<span class="muted">${esc(e.slot)}</span> ` : ''}${playerLink(e.p)}</span>`).join('')}</div>` : ''}`;
  }
  function seasonDraft(s) {
    if (!s.drafts.length) return '<div class="empty">No draft recorded for this season.</div>';
    return s.drafts.map((d, di) => {
      const picks = d.picks;
      const rounds = {};
      picks.forEach(p => (rounds[p.round] = rounds[p.round] || []).push(p));
      const slots = Math.max(...picks.map(p => p.slot || 0), s.teams.length);
      const header = `<div class="draft-row" style="grid-template-columns:40px repeat(${slots}, minmax(130px,1fr))"><div></div>${Array.from({ length: slots }, (_, i) => { const first = picks.find(p => p.round === 1 && p.slot === i + 1); const t = first && teamOf(s, first.franchise); return `<div class="small muted" style="padding:2px 6px">${i + 1}. ${t ? esc(t.team_name) : ''}</div>`; }).join('')}</div>`;
      const rows = Object.keys(rounds).map(Number).sort((a, b) => a - b).map(r => `<div class="draft-row" style="grid-template-columns:40px repeat(${slots}, minmax(130px,1fr))"><div class="small muted" style="padding-top:6px">R${r}</div>${Array.from({ length: slots }, (_, i) => { const p = rounds[r].find(x => x.slot === i + 1) || rounds[r][i]; if (!p) return '<div></div>'; const pl = p.p ? player(p.p) : null; const t = teamOf(s, p.franchise); return `<div class="dpick ${pl ? esc(pl.pos || '') : ''} ${p.keeper ? 'keeper' : ''}" title="${esc(t ? t.team_name : '')}"><div class="rk">#${p.pick}${p.keeper ? ' · keeper' : ''}${p.bid ? ' · $' + p.bid : ''}</div><div class="pn">${pl ? esc(pl.name) : '<span class="muted">Unidentified</span>'}</div><div class="pm">${pl ? esc([pl.pos, pl.team].filter(Boolean).join(' · ')) : ''} ${t ? '· ' + esc(t.team_name) : ''}</div></div>`; }).join('')}</div>`).join('');
      return `<div class="card" style="margin-bottom:18px"><div class="card-head"><h3>${esc(d.label)}</h3><span class="small muted">${picks.length} picks${d.unidentified_slots ? ` · ${d.unidentified_slots} unidentified` : ''}</span></div><div class="draft-board">${header}${rows}</div></div>`;
    }).join('');
  }
  function tradeSides(s, t) {
    const name = f => { const tm = teamOf(s, f); return tm ? tm.team_name : f || '?'; };
    const sides = {};
    t.franchises.forEach(f => sides[f] = { franchise: f, name: name(f), manager: (teamOf(s, f) || {}).manager, gets: [], gives: [] });
    const pickLabel = p => `${esc(p.season)} round ${p.round} pick${p.original && p.original !== p.from && p.original !== p.to ? ` <span class="muted small">(orig. ${esc(name(p.original))})</span>` : ''}`;
    t.adds.forEach(a => sides[a.to] && sides[a.to].gets.push({ kind: 'player', p: a.p, html: playerLabel(a.p) }));
    t.drops.forEach(a => sides[a.from] && sides[a.from].gives.push({ kind: 'player', p: a.p, html: playerLabel(a.p) }));
    t.picks.forEach(p => { if (sides[p.to]) sides[p.to].gets.push({ kind: 'pick', pick: p, html: pickLabel(p) }); if (sides[p.from]) sides[p.from].gives.push({ kind: 'pick', pick: p, html: pickLabel(p) }); });
    (t.faab || []).forEach(f => { if (sides[f.to]) sides[f.to].gets.push({ kind: 'faab', html: `$${f.amount} FAAB` }); if (sides[f.from]) sides[f.from].gives.push({ kind: 'faab', html: `$${f.amount} FAAB` }); });
    return Object.values(sides);
  }
  function tradeCard(s, t, opts = {}) {
    const sides = tradeSides(s, t);
    const list = (items, sign) => items.length ? `<ul class="${sign === '+' ? 'gets' : 'gives'}">${items.map(i => `<li><span class="sign">${sign}</span> ${i.html}</li>`).join('')}</ul>` : '';
    return `<div class="trade"><div class="hdr"><span>${t.inferred ? `<span class="pill pill-inferred" title="Reconstructed from lineups; ESPN no longer serves this log">reconstructed${t.confidence === 'low' ? ' · low confidence' : ''}</span> around week ${t.week}${t.week_range && t.week_range[0] !== t.week_range[1] ? ` <span class="muted">(weeks ${t.week_range[0]}–${t.week_range[1]})</span>` : ''}` : `${dateFmt(t.date)}${t.week ? ` · week ${t.week}` : ''}`}</span><span>${s.season} ${platformPill(s.platform)} ${opts.noLink ? '' : `<a class="btn" style="padding:2px 8px;margin-left:8px" href="#/tx/${s.season}/${enc(t.id)}">Investigate →</a>`}</span></div><div class="sides">${sides.map(v => `<div class="side"><div class="who"><a href="#/manager/${enc(v.manager)}">${esc(v.name)}</a> <span class="muted small">${esc(mgrName(v.manager))}</span></div>${list(v.gets, '+')}${list(v.gives, '−')}${!v.gets.length && !v.gives.length ? '<div class="muted small">nothing recorded</div>' : ''}</div>`).join('')}</div></div>`;
  }
  function txLine(s, t) {
    const name = f => { const tm = teamOf(s, f); return tm ? esc(tm.team_name) : f || '?'; };
    if (t.type === 'trade') return tradeCard(s, t);
    const who = t.franchises.map(name).join(', ');
    const adds = t.adds.map(a => `<span class="add">+ ${playerLabel(a.p)}</span>`).join(' &nbsp; ');
    const drops = t.drops.map(a => `<span class="drop">− ${playerLabel(a.p)}</span>`).join(' &nbsp; ');
    const kind = t.type === 'waiver' ? `Waiver${t.bid != null ? ` ($${t.bid})` : ''}` : t.type === 'commissioner' ? 'Commissioner move' : t.inferred ? 'Pickup / drop' : 'Free agent';
    if (t.inferred) return `<div class="tx"><div class="when"><span class="pill pill-inferred">reconstructed</span><br><span class="small">≈ week ${t.week}${t.week_range && t.week_range[0] !== t.week_range[1] ? ` (${t.week_range[0]}–${t.week_range[1]})` : ''} · ${kind}</span></div><div class="what"><div class="who">${who}</div><div class="line">${adds}${adds && drops ? '<br>' : ''}${drops}</div></div></div>`;
    return `<div class="tx"><div class="when">${dateFmt(t.date)}<br><span class="small">${t.week ? `Week ${t.week} · ` : ''}${kind}</span></div><div class="what"><div class="who">${who}</div><div class="line">${adds}${adds && drops ? '<br>' : ''}${drops}</div></div></div>`;
  }
  function countersTable(s) {
    if (!s.transaction_counters) return '';
    const rows = s.teams.map(t => ({ t, c: s.transaction_counters[t.franchise] || {} }));
    return `<div class="card" style="margin-bottom:18px"><div class="card-head"><h3>Official transaction counter</h3><span class="small muted">from ESPN's league records</span></div><div class="table-wrap"><table class="tbl"><thead><tr><th>Team</th><th class="num">Pickups</th><th class="num">Drops</th><th class="num">Trades</th><th>Pickups by week</th></tr></thead><tbody>${rows.map(({ t, c }) => `<tr><td>${teamCell(t, { link: true })}</td><td class="num">${c.acquisitions ?? '—'}</td><td class="num">${c.drops ?? '—'}</td><td class="num">${c.trades ?? '—'}</td><td class="mono small muted">${c.by_week ? Object.entries(c.by_week).map(([w, n]) => n ? `<span title="week ${w}">${w}:${n}</span>` : '').filter(Boolean).join(' ') : ''}</td></tr>`).join('')}</tbody></table></div>${s.reconstructed ? `<p class="small muted" style="margin:8px 0 0">${esc(s.reconstructed.method)} Reconstructed: ${s.reconstructed.events.add} pickups, ${s.reconstructed.events.drop} drops, ${s.reconstructed.events.trade} trades. Weeks are approximate; a pickup that never started is invisible.</p>` : ''}</div>`;
  }
  function seasonMoves(s, tradesOnly) {
    const list = s.transactions.filter(t => tradesOnly ? t.type === 'trade' : t.type !== 'trade');
    if (!list.length) return `<div class="empty">${s.transactions.length ? 'No ' + (tradesOnly ? 'completed trades' : 'moves') + ' recorded.' : 'No move log was recoverable for this season.'}</div>`;
    const counts = {};
    s.transactions.forEach(t => counts[t.type] = (counts[t.type] || 0) + 1);
    const summary = Object.entries(counts).map(([k, v]) => `${v} ${k.replace('_', ' ')}${v > 1 && k === 'trade' ? 's' : ''}`).join(' · ');
    if (tradesOnly) return `${countersTable(s)}<p class="muted small">${summary}</p>${list.slice().reverse().map(t => txLine(s, t)).join('')}`;
    const byTeam = {};
    list.forEach(t => t.franchises.forEach(f => byTeam[f] = (byTeam[f] || 0) + 1));
    const busiest = Object.entries(byTeam).sort((a, b) => b[1] - a[1]).map(([f, n]) => `${esc((teamOf(s, f) || {}).team_name)} (${n})`).slice(0, 3).join(', ');
    return `${countersTable(s)}<p class="muted small">${summary}. Most active: ${busiest}.</p><div>${(s.reconstructed ? list : list.slice().reverse()).map(t => txLine(s, t)).join('')}</div>`;
  }
  function seasonRules(s) {
    const st = s.settings;
    const starters = st.roster_positions.filter(p => p !== 'BN' && p !== 'IR');
    const rows = [
      ['Platform', `${s.platform === 'espn' ? 'ESPN' : 'Sleeper'} league ${esc(st.platform_league_id)}`],
      ['Format', esc(st.format || '')],
      ['Scoring', esc(st.scoring_type || '')],
      ['Starting lineup', starters.join(', ')],
      ['Bench', `${st.roster_positions.filter(p => p === 'BN').length} bench${st.roster_positions.includes('IR') ? ' + IR' : ''}`],
      ['Regular season', `${st.regular_weeks} weeks`],
      ['Playoffs', `${st.playoff_teams} teams, start week ${st.playoff_week_start}${st.playoff_round_weeks ? ' · ' + Object.entries(st.playoff_round_weeks).map(([r, w]) => `round ${r}: week${w.length > 1 ? 's' : ''} ${w.join('–')}`).join(', ') : ''}`],
      ['Seeding', esc(String(st.playoff_seeding || '').toLowerCase().replace(/_/g, ' '))],
      ['Divisions', (st.divisions || []).join(' / ') || '—'],
      ['Waivers', st.waivers ? `${st.waivers}${st.faab ? ` · $${st.faab} budget` : ''}` : '—'],
      ['Draft', `${esc(st.draft.type || '')}${st.draft.order ? ' · ' + esc(st.draft.order) : ''}${st.draft.rounds ? ' · ' + st.draft.rounds + ' rounds' : ''}`],
    ];
    const sc = st.scoring ? `<div class="card" style="margin-top:18px"><h3>Key scoring</h3><div class="table-wrap"><table class="tbl"><tbody>${Object.entries(st.scoring).map(([k, v]) => `<tr><td>${esc(k.replace(/_/g, ' '))}</td><td class="num">${fmt(v)}</td></tr>`).join('')}</tbody></table></div></div>` : '';
    return `<div class="card"><h3>Settings</h3><div class="table-wrap"><table class="tbl"><tbody>${rows.map(([k, v]) => `<tr><td class="muted" style="width:180px">${k}</td><td>${v}</td></tr>`).join('')}</tbody></table></div></div>${sc}`;
  }

  // ---- managers
  let mgrSort = { key: 'win_pct', dir: -1 };
  function pageManagers() {
    const rows = D.managers.filter(m => m.seasons.length).map(m => ({
      id: m.id, name: m.display_name, active: m.active, seasons: m.career.seasons, wins: m.career.wins, losses: m.career.losses, ties: m.career.ties,
      win_pct: m.career.win_pct, pf: m.career.pf, pa: m.career.pa, ppg: m.avg_points, titles: m.career.titles.length, finals: m.career.titles.length + m.career.runner_ups.length,
      playoffs: m.career.playoff_appearances.length, best: m.career.best_finish, avg_finish: m.career.avg_finish, last: m.career.last_places.length, streak: m.longest_win_streak || 0,
      po_w: (m.playoff_record || {}).wins || 0, po_l: (m.playoff_record || {}).losses || 0, team: m.team_names[m.team_names.length - 1].name, m,
    }));
    const cols = [['name', 'Manager'], ['seasons', 'Seasons'], ['wins', 'W'], ['losses', 'L'], ['win_pct', 'Pct'], ['ppg', 'PPG'], ['pf', 'PF'], ['titles', 'Titles'], ['finals', 'Finals'], ['playoffs', 'Playoffs'], ['po_w', 'PO W-L'], ['best', 'Best'], ['avg_finish', 'Avg finish'], ['last', 'Last place'], ['streak', 'Best streak']];
    const mHide = new Set(['seasons', 'ppg', 'pf', 'finals', 'po_w', 'best', 'last', 'streak']);
    const sorted = sortTable(rows, mgrSort.key, mgrSort.dir);
    $app.innerHTML = `<div class="page-head"><h1>Managers</h1><span class="sub">Career numbers across both platforms. Regular season W-L; playoffs separate. Click a column to sort.</span></div>
      <div class="table-wrap"><table class="tbl" id="mgrTable"><thead><tr>${cols.map(([k, l]) => `<th class="sortable ${k === 'name' ? '' : 'num'} ${mHide.has(k) ? 'm-hide' : ''} ${mgrSort.key === k ? 'sorted' + (mgrSort.dir > 0 ? ' asc' : '') : ''}" data-key="${k}">${l}</th>`).join('')}</tr></thead><tbody>
      ${sorted.map(r => `<tr><td><div class="team-cell">${avatar(r.m)}<div><div class="tn"><a href="#/manager/${enc(r.id)}">${esc(r.name)}</a>${r.active ? '' : ' <span class="pill pill-neutral">former</span>'}</div><div class="mn">${esc(r.team)}</div></div></div></td><td class="num m-hide">${r.seasons}</td><td class="num">${r.wins}</td><td class="num">${r.losses}${r.ties ? '-' + r.ties : ''}</td><td class="num">${pct(r.win_pct)}</td><td class="num m-hide">${pts(r.ppg)}</td><td class="num m-hide">${pts(r.pf)}</td><td class="num">${r.titles ? '🏆'.repeat(r.titles) : '—'}</td><td class="num m-hide">${r.finals}</td><td class="num">${r.playoffs}</td><td class="num m-hide">${r.po_w}-${r.po_l}</td><td class="num m-hide">${r.best ? ordinal(r.best) : '—'}</td><td class="num">${fmt(r.avg_finish, 1)}</td><td class="num m-hide">${r.last || '—'}</td><td class="num m-hide">${r.streak}</td></tr>`).join('')}
      </tbody></table></div>
      <div class="notes">PPG = average points per game across every game played. Scoring systems differed between ESPN and Sleeper, so point totals mix the two. Two 2016-only managers are shown with neutral labels.</div>`;
    $app.querySelectorAll('th.sortable').forEach(th => th.onclick = () => {
      const k = th.dataset.key;
      mgrSort = { key: k, dir: mgrSort.key === k ? -mgrSort.dir : (k === 'name' || k === 'avg_finish' || k === 'best' ? 1 : -1) };
      pageManagers();
    });
  }
  async function pageManager(id) {
    const m = D.mgr[id];
    if (!m) { $app.innerHTML = '<div class="empty">Unknown manager.</div>'; return; }
    const c = m.career;
    const rivals = D.h2h.filter(h => h.a === id || h.b === id).map(h => { const me = h.a === id; return { other: me ? h.b : h.a, w: me ? h.a_wins : h.b_wins, l: me ? h.b_wins : h.a_wins, t: h.ties, g: h.games, pf: me ? h.a_pts : h.b_pts, pa: me ? h.b_pts : h.a_pts, po: h.playoff_games, last: h.last }; }).sort((a, b) => b.g - a.g);
    const bestWins = D.records.highest_scores.filter(r => r.manager === id).slice(0, 3);
    const fr = m.franchises.map(f => D.fr[f]).filter(Boolean);
    const prevOwners = fr.flatMap(f => f.managers.filter(x => x !== id)).map(x => mgrLink(x));
    $app.innerHTML = `<div class="mgr-head">${avatar(m, true)}<div><h1 style="margin:0">${esc(m.display_name)}</h1><div class="muted">${esc(m.team_names[m.team_names.length - 1].name)} · ${m.active ? 'active' : 'former'} · ${c.espn_seasons.length ? `ESPN ${c.espn_seasons[0]}–${c.espn_seasons[c.espn_seasons.length - 1]}` : ''}${c.espn_seasons.length && c.sleeper_seasons.length ? ' · ' : ''}${c.sleeper_seasons.length ? `Sleeper ${c.sleeper_seasons[0]}–${c.sleeper_seasons[c.sleeper_seasons.length - 1]}` : ''}</div>${c.titles.length ? `<div class="trophy">🏆 ${c.titles.join(', ')}</div>` : ''}</div></div>
      <div class="kpis">
        <div class="kpi"><div class="v">${c.wins}-${c.losses}${c.ties ? '-' + c.ties : ''}</div><div class="l">Regular season</div></div>
        <div class="kpi"><div class="v">${pct(c.win_pct)}</div><div class="l">Win pct</div></div>
        <div class="kpi"><div class="v">${c.titles.length}</div><div class="l">Titles</div></div>
        <div class="kpi"><div class="v">${c.playoff_appearances.length}<span class="muted" style="font-size:.9rem">/${c.completed_seasons}</span></div><div class="l">Playoff trips</div></div>
        <div class="kpi"><div class="v">${(m.playoff_record || {}).wins || 0}-${(m.playoff_record || {}).losses || 0}</div><div class="l">Playoff record</div></div>
        <div class="kpi"><div class="v">${pts(m.avg_points)}</div><div class="l">Points per game</div></div>
        <div class="kpi"><div class="v">${c.best_finish ? ordinal(c.best_finish) : '—'}</div><div class="l">Best finish</div></div>
        <div class="kpi"><div class="v">${fmt(c.avg_finish, 1)}</div><div class="l">Avg finish</div></div>
        <div class="kpi"><div class="v">${m.longest_win_streak || 0}</div><div class="l">Longest win streak</div></div>
        <div class="kpi"><div class="v">${esc(m.current_streak || '—')}</div><div class="l">Current streak</div></div>
        <div class="kpi"><div class="v">${pts(m.high_game)}</div><div class="l">Best game</div></div>
        <div class="kpi"><div class="v">${c.last_places.length}</div><div class="l">Last-place finishes</div></div>
      </div>
      <div class="grid grid-2">
        <div class="card"><h3>Season by season</h3><div class="table-wrap"><table class="tbl"><thead><tr><th>Year</th><th>Team</th><th class="num">W-L</th><th class="num">PF</th><th class="num">Seed</th><th class="num">Finish</th></tr></thead><tbody>
          ${m.seasons.slice().reverse().map(s => `<tr class="${s.champion ? 'hl' : ''}"><td><a href="#/season/${s.season}">${s.season}</a> ${platformPill(s.platform)}</td><td><span class="prow">${s.logo ? `<img class="tlogo" src="${esc(s.logo)}" alt="" loading="lazy" onerror="this.remove()">` : ''}<a href="#/season/${s.season}/rosters/final/${s.franchise}">${esc(s.team_name)}</a></span></td><td class="num">${rec(s)}</td><td class="num">${pts(s.pf)}</td><td class="num">${s.playoff_seed || ''}</td><td class="num">${s.status !== 'complete' ? `<span class="muted">${ordinal(s.standing)} now</span>` : (s.champion ? '🏆 1st' : ordinal(s.final_rank))}</td></tr>`).join('')}
        </tbody></table></div></div>
        <div>
          <div class="card"><h3>Head-to-head</h3><div class="table-wrap"><table class="tbl"><thead><tr><th>Opponent</th><th class="num">W-L</th><th class="num">Pct</th><th class="num">Avg PF</th><th class="num">Avg PA</th><th class="num">PO</th></tr></thead><tbody>
            ${rivals.map(r => `<tr><td><a href="#/h2h/${enc(id)}/${enc(r.other)}">${esc(mgrName(r.other))}</a></td><td class="num ${r.w > r.l ? '' : r.w < r.l ? 'muted' : ''}">${r.w}-${r.l}${r.t ? '-' + r.t : ''}</td><td class="num">${pct(r.g ? (r.w + .5 * r.t) / r.g : null)}</td><td class="num">${pts(+(r.pf / r.g).toFixed(1))}</td><td class="num">${pts(+(r.pa / r.g).toFixed(1))}</td><td class="num">${r.po || ''}</td></tr>`).join('')}
          </tbody></table></div></div>
          <div class="card" style="margin-top:18px"><h3>Team names</h3><ul style="margin:0;padding-left:18px">${m.team_names.map(t => `<li>${esc(t.name)} <span class="muted small">${t.from === t.to ? t.from : `${t.from}–${t.to}`}</span></li>`).join('')}</ul>
          ${prevOwners.length ? `<p class="small muted" style="margin:10px 0 0">Franchise previously run by ${prevOwners.join(', ')}.</p>` : ''}
          ${!m.active && c.espn_seasons.length && !c.sleeper_seasons.length ? `<p class="small muted" style="margin:10px 0 0">Original owner of this franchise in the league's first season; the franchise changed hands in 2017.</p>` : ''}</div>
          ${(m.hall_of_fame || []).length ? `<div class="card" style="margin-top:18px"><div class="card-head"><h3>Hall of fame</h3><span class="small muted">points scored while starting for ${esc(m.display_name)}</span></div><div class="table-wrap"><table class="tbl"><thead><tr><th class="rank">#</th><th>Player</th><th class="num">Pts</th><th class="num">Starts</th><th class="num">PPG</th><th>Seasons</th><th class="num">Best</th></tr></thead><tbody>${m.hall_of_fame.slice(0, 12).map((h, i) => `<tr><td class="rank">${i + 1}</td><td>${playerRow(h.p)}</td><td class="num">${pts(h.starter_pts)}</td><td class="num">${h.starts}</td><td class="num">${pts(h.ppg)}</td><td class="small muted nowrap">${yearRanges(h.seasons)}</td><td class="num">${h.best ? pts(h.best.pts) : ''}</td></tr>`).join('')}</tbody></table></div><p class="small muted" style="margin:8px 0 0">2016–2017 ESPN data only records starters, so bench points from those years are not counted anywhere.</p></div>` : ''}
          ${bestWins.length ? `<div class="card" style="margin-top:18px"><h3>Top scoring games</h3><ol class="record-list">${bestWins.map((r, i) => `<li data-game="${r.season}|${esc(r.id)}" style="cursor:pointer"><span class="i">${i + 1}</span><span class="d">${r.season} ${r.round ? esc(r.round) : 'week ' + r.week} vs ${esc(r.opponent)}<small>${esc(r.team_name)}</small></span><span class="v">${pts(r.points)}</span></li>`).join('')}</ol></div>` : ''}
        </div>
      </div>`;
  }

  // ---- head to head
  async function pageH2H(a, b) {
    const ids = D.managers.filter(m => m.seasons.length && m.active).map(m => m.id);
    const get = (x, y) => D.h2h.find(h => (h.a === x && h.b === y) || (h.a === y && h.b === x));
    const cell = (x, y) => {
      if (x === y) return '<td class="self">—</td>';
      const h = get(x, y); if (!h) return '<td class="muted">0-0</td>';
      const w = h.a === x ? h.a_wins : h.b_wins, l = h.a === x ? h.b_wins : h.a_wins;
      return `<td class="${w > l ? 'w' : w < l ? 'l' : 'e'}"><a href="#/h2h/${enc(x)}/${enc(y)}">${w}-${l}${h.ties ? '-' + h.ties : ''}</a></td>`;
    };
    let detail = '';
    if (a && b) {
      const h = get(a, b);
      if (h) {
        await loadAllSeasons();
        const games = h.matchups.map(x => ({ s: D.season[x.season], m: D.season[x.season].matchups.find(mm => mm.id === x.id) })).filter(x => x.m).reverse();
        const aw = h.a === a ? h.a_wins : h.b_wins, bw = h.a === a ? h.b_wins : h.a_wins;
        const ap = h.a === a ? h.a_pts : h.b_pts, bp = h.a === a ? h.b_pts : h.a_pts;
        detail = `<div class="card" style="margin-bottom:22px"><div class="row" style="justify-content:space-between"><div class="team-cell">${avatar(a, true)}<div><h2 style="margin:0">${mgrLink(a)}</h2><div class="muted">${aw} wins · ${pts(+(ap / h.games).toFixed(1))} avg</div></div></div><div style="text-align:center"><div class="muted small">All-time</div><div style="font-family:var(--display);font-size:2.4rem;font-weight:800">${aw} – ${bw}${h.ties ? ' – ' + h.ties : ''}</div><div class="muted small">${h.games} games · ${h.playoff_games} playoff · ESPN ${h.espn_games} / Sleeper ${h.sleeper_games}</div></div><div class="team-cell" style="flex-direction:row-reverse;text-align:right"><div style="order:2">${avatar(b, true)}</div><div><h2 style="margin:0">${mgrLink(b)}</h2><div class="muted">${bw} wins · ${pts(+(bp / h.games).toFixed(1))} avg</div></div></div></div></div>
          <h3>Every meeting</h3><div class="matchups">${games.map(g => matchupCard(g.s, g.m, { showSeason: true })).join('')}</div>`;
      }
    }
    $app.innerHTML = `<div class="page-head"><h1>Rivalries</h1><span class="sub">All-time head-to-head, regular season and playoffs, both platforms. Row vs column.</span></div>${detail}
      <div class="table-wrap"><table class="h2h-grid"><thead><tr><th></th>${ids.map(i => `<th><a href="#/manager/${enc(i)}">${esc(mgrName(i))}</a></th>`).join('')}</tr></thead><tbody>
      ${ids.map(x => `<tr><th class="rowh"><a href="#/manager/${enc(x)}">${esc(mgrName(x))}</a></th>${ids.map(y => cell(x, y)).join('')}</tr>`).join('')}
      </tbody></table></div>
      <h3 style="margin-top:28px">Most played</h3><div class="table-wrap"><table class="tbl"><thead><tr><th>Matchup</th><th class="num">Games</th><th class="num">Series</th><th class="num">Playoff games</th><th>Last meeting</th></tr></thead><tbody>
      ${D.h2h.slice().sort((x, y) => y.games - x.games).slice(0, 12).map(h => `<tr><td><a href="#/h2h/${enc(h.a)}/${enc(h.b)}">${esc(mgrName(h.a))} vs ${esc(mgrName(h.b))}</a></td><td class="num">${h.games}</td><td class="num">${h.a_wins}-${h.b_wins}${h.ties ? '-' + h.ties : ''}</td><td class="num">${h.playoff_games}</td><td>${h.last ? `${h.last.season} wk ${h.last.week} · ${h.last.winner ? esc(mgrName(h.last.winner)) + ' won' : 'tie'}` : ''}</td></tr>`).join('')}
      </tbody></table></div>`;
  }

  // ---- records
  let recEra = 'all';
  function pageRecords() {
    const R = D.records;
    const f = list => recEra === 'all' ? list : list.filter(x => x.platform === recEra);
    const ctx = r => `${r.season} ${r.round ? esc(r.round) : 'week ' + r.week}${r.multi_week ? ' · two-week total' : ''} ${platformPill(r.platform)}`;
    const li = (r, main, sub, val) => `<li ${r.id ? `data-game="${r.season}|${esc(r.id)}" style="cursor:pointer"` : ''}><span class="i"></span><span class="d">${main}<small>${sub}</small></span><span class="v">${val}</span></li>`;
    const block = (title, list, render) => `<div class="card"><h3>${title}</h3><ol class="record-list">${list.slice(0, 10).map((r, i) => render(r).replace('<span class="i"></span>', `<span class="i">${i + 1}</span>`)).join('') || '<li class="muted">—</li>'}</ol></div>`;
    const titles = {};
    R.champions.forEach(c => (titles[c.manager] = titles[c.manager] || []).push(c.season));
    $app.innerHTML = `<div class="page-head"><h1>Record book</h1><span class="sub">${esc(R.note)}</span><span class="spacer"></span><div class="seg">${[['all', 'All-time'], ['espn', 'ESPN era'], ['sleeper', 'Sleeper era']].map(([k, l]) => `<button class="${recEra === k ? 'active' : ''}" data-era="${k}">${l}</button>`).join('')}</div></div>
      <div class="grid grid-2">
        ${block('Highest single-game score', f(R.highest_scores), r => li(r, `${esc(r.team_name)} <span class="muted">(${esc(mgrName(r.manager))})</span>`, `${ctx(r)} vs ${esc(r.opponent)} ${pts(r.opponent_points)}`, pts(r.points)))}
        ${block('Lowest single-game score', f(R.lowest_scores), r => li(r, `${esc(r.team_name)} <span class="muted">(${esc(mgrName(r.manager))})</span>`, `${ctx(r)} vs ${esc(r.opponent)} ${pts(r.opponent_points)}`, pts(r.points)))}
        ${block('Biggest blowouts', f(R.largest_margins), r => li(r, `${esc(r.winner)} over ${esc(r.loser)}`, `${ctx(r)} · ${pts(r.winner_points)}–${pts(r.loser_points)}`, '+' + pts(r.margin)))}
        ${block('Closest games', f(R.closest_games), r => li(r, `${esc(r.winner)} over ${esc(r.loser)}`, `${ctx(r)} · ${pts(r.winner_points)}–${pts(r.loser_points)}`, pts(r.margin)))}
        ${block('Highest-scoring games (combined)', f(R.highest_combined), r => li(r, `${esc(r.home)} vs ${esc(r.away)}`, `${ctx(r)} · ${pts(r.home_points)}–${pts(r.away_points)}`, pts(r.combined)))}
        ${block('Lowest-scoring games (combined)', f(R.lowest_combined), r => li(r, `${esc(r.home)} vs ${esc(r.away)}`, `${ctx(r)} · ${pts(r.home_points)}–${pts(r.away_points)}`, pts(r.combined)))}
        ${block('Best regular seasons', f(R.best_seasons), r => li(r, `${esc(r.team_name)} <span class="muted">(${esc(mgrName(r.manager))})</span>`, `${r.season} ${platformPill(r.platform)} · ${pts(r.pf)} pts · finished ${ordinal(r.final_rank)}`, `${r.wins}-${r.losses}${r.ties ? '-' + r.ties : ''}`))}
        ${block('Worst regular seasons', f(R.worst_seasons), r => li(r, `${esc(r.team_name)} <span class="muted">(${esc(mgrName(r.manager))})</span>`, `${r.season} ${platformPill(r.platform)} · ${pts(r.pf)} pts · finished ${ordinal(r.final_rank)}`, `${r.wins}-${r.losses}${r.ties ? '-' + r.ties : ''}`))}
        ${block('Most points per game, season', f(R.most_points_season), r => li(r, `${esc(r.team_name)} <span class="muted">(${esc(mgrName(r.manager))})</span>`, `${r.season} ${platformPill(r.platform)} · ${rec(r)} · ${pts(r.pf)} total`, pts(r.ppg)))}
        ${block('Fewest points per game, season', f(R.fewest_points_season), r => li(r, `${esc(r.team_name)} <span class="muted">(${esc(mgrName(r.manager))})</span>`, `${r.season} ${platformPill(r.platform)} · ${rec(r)} · ${pts(r.pf)} total`, pts(r.ppg)))}
        <div class="card"><h3>Longest win streaks</h3><ol class="record-list">${R.streaks.slice(0, 10).map((s, i) => `<li><span class="i">${i + 1}</span><span class="d">${mgrLink(s.manager)}<small>longest losing streak ${s.longest_losing_streak}</small></span><span class="v">${s.longest_win_streak}</span></li>`).join('')}</ol><p class="small muted">Consecutive wins including playoffs, carried across seasons. Consolation games are not counted anywhere.</p></div>
        <div class="card"><h3>Title count</h3><ol class="record-list">${Object.entries(titles).sort((a, b) => b[1].length - a[1].length).map(([m, ys], i) => `<li><span class="i">${i + 1}</span><span class="d">${mgrLink(m)}<small>${ys.join(', ')}</small></span><span class="v">${'🏆'.repeat(ys.length)}</span></li>`).join('')}</ol></div>
      </div>`;
    $app.querySelectorAll('[data-era]').forEach(b => b.onclick = () => { recEra = b.dataset.era; pageRecords(); });
  }

  // ---- all drafts / all trades
  async function pageDrafts(year) {
    const years = D.seasons.map(s => s.season);
    const y = year && years.includes(+year) ? +year : years[years.length - 1];
    const s = await loadSeason(y);
    $app.innerHTML = `<div class="page-head"><h1>Drafts</h1><span class="sub">Every draft board, ESPN and Sleeper.</span><span class="spacer"></span><div class="row">${years.map(v => `<a class="btn ${v === y ? 'active' : ''}" href="#/drafts/${v}">${v}</a>`).join('')}</div></div>${seasonDraft(s)}`;
  }
  async function pageTrades() {
    await loadAllSeasons();
    const all = D.seasons.map(s => D.season[s.season]).flatMap(s => s.transactions.filter(t => t.type === 'trade').map(t => ({ s, t }))).reverse();
    const counts = {};
    all.forEach(({ t }) => t.franchises.forEach(f => { const m = (D.franchises.find(x => x.id === f) || {}).current_manager; counts[m] = (counts[m] || 0) + 1; }));
    const leader = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    $app.innerHTML = `<div class="page-head"><h1>Trades</h1><span class="sub">${all.length} completed trades on record (ESPN 2018–2021, Sleeper 2022–present). ESPN's 2016–2017 logs were not recoverable.</span></div>
      <div class="card" style="margin-bottom:18px"><h3>Most active traders</h3><div class="row">${leader.map(([m, n]) => `<span class="pill pill-neutral" style="text-transform:none;font-size:.85rem">${esc(mgrName(m))} · ${n}</span>`).join('')}</div></div>
      ${all.map(({ s, t }) => txLine(s, t)).join('')}`;
  }

  // ---- players
  let plSort = { key: 'pts', dir: -1 }, plQuery = '', plPos = '';
  async function pagePlayers() {
    const idx = await getJSON('data/players-index.json');
    const q = plQuery.trim().toLowerCase();
    let rows = idx.filter(r => (!q || r.name.toLowerCase().includes(q)) && (!plPos || r.pos === plPos));
    rows = sortTable(rows, plSort.key, plSort.dir);
    const cols = [['name', 'Player'], ['pos', 'Pos'], ['pts', 'Starter pts'], ['total', 'Total pts'], ['starts', 'Starts'], ['weeks', 'Weeks rostered'], ['first', 'First'], ['last', 'Last'], ['teams', 'Teams'], ['trades', 'Trades']];
    const pHide = new Set(['total', 'weeks', 'first', 'teams', 'trades']);
    $app.innerHTML = `<div class="page-head"><h1>Players</h1><span class="sub">${idx.length} players who have been on a BigDongFootball roster. Points are what they scored while started; both eras combined.</span></div>
      <div class="row" style="margin-bottom:14px"><input class="inp" id="plq" placeholder="Search players…" value="${esc(plQuery)}" style="min-width:240px"><div class="seg">${['', 'QB', 'RB', 'WR', 'TE', 'K', 'DEF'].map(x => `<button class="${plPos === x ? 'active' : ''}" data-pos="${x}">${x || 'All'}</button>`).join('')}</div><span class="muted small">${rows.length} shown</span></div>
      <div class="table-wrap"><table class="tbl"><thead><tr><th class="rank">#</th>${cols.map(([k, l]) => `<th class="sortable ${k === 'name' || k === 'pos' ? '' : 'num'} ${pHide.has(k) ? 'm-hide' : ''} ${plSort.key === k ? 'sorted' + (plSort.dir > 0 ? ' asc' : '') : ''}" data-key="${k}">${l}</th>`).join('')}</tr></thead><tbody>
      ${rows.slice(0, 300).map((r, i) => `<tr><td class="rank">${i + 1}</td><td><span class="prow">${headshot(r.id, 'hs hs-sm')}<a href="#/player/${enc(r.id)}"><b>${esc(r.name)}</b></a> ${r.team ? `<span class="muted small">${esc(r.team)}</span>` : ''}</span></td><td>${esc(r.pos || '')}</td><td class="num">${pts(r.pts)}</td><td class="num m-hide">${pts(r.total)}</td><td class="num">${r.starts}</td><td class="num m-hide">${r.weeks}</td><td class="num m-hide">${r.first || ''}</td><td class="num">${r.last || ''}</td><td class="num m-hide">${r.teams}</td><td class="num m-hide">${r.trades || ''}</td></tr>`).join('')}
      </tbody></table></div>${rows.length > 300 ? '<p class="small muted">Showing the first 300; narrow the search to see more.</p>' : ''}`;
    const inp = document.getElementById('plq');
    inp.oninput = () => { plQuery = inp.value; const pos = inp.selectionStart; pagePlayers().then(() => { const n = document.getElementById('plq'); n.focus(); n.setSelectionRange(pos, pos); }); };
    $app.querySelectorAll('[data-pos]').forEach(b => b.onclick = () => { plPos = b.dataset.pos; pagePlayers(); });
    $app.querySelectorAll('th.sortable').forEach(th => th.onclick = () => { const k = th.dataset.key; plSort = { key: k, dir: plSort.key === k ? -plSort.dir : (k === 'name' || k === 'pos' || k === 'first' ? 1 : -1) }; pagePlayers(); });
  }
  async function pagePlayer(id) {
    let d;
    try { d = await getJSON(`data/players/${id.replace(':', '-')}.json`); } catch (e) { $app.innerHTML = '<div class="empty">No record of this player in the league.</div>'; return; }
    await loadAllSeasons();
    const c = d.career;
    const seasonOf = y => D.season[y];
    const evLine = e => {
      const sn = seasonOf(e.season);
      const to = e.to ? `<a href="#/manager/${enc((teamOf(sn, e.to) || {}).manager)}">${esc(frName(sn, e.to))}</a>` : null;
      const from = e.from ? `<a href="#/manager/${enc((teamOf(sn, e.from) || {}).manager)}">${esc(frName(sn, e.from))}</a>` : null;
      let what;
      if (e.type === 'carryover' || e.type === 'keeper') return '';
      if (e.type === 'draft') {
        const prev = e.prev_team ? ` <span class="muted small">— ended ${e.season - 1} on <a href="#/manager/${enc((teamOf(seasonOf(e.season - 1), e.prev_team) || {}).manager)}">${esc(frName(seasonOf(e.season - 1), e.prev_team))}</a>; ${e.startup ? `the ${e.season} startup draft on Sleeper re-selected rosters after the move from ESPN` : `the ${e.season} ESPN keeper draft was entered by hand, so an offseason trade or pickup shows up here`}</span>` : '';
        what = e.startup ? `Selected by ${to} in the ${e.season} startup draft <span class="muted small">(round ${e.round}, pick ${e.pick})</span>${prev}` : e.keeper_draft ? `Entered for ${to} in the ${e.season} keeper draft <span class="muted small">(round ${e.round}, pick ${e.pick})</span>${prev}` : `Drafted by ${to} <span class="muted small">(round ${e.round}, pick ${e.pick})</span>`;
      }
      else if (e.type === 'trade') {
        const t = sn && sn.transactions.find(x => x.id === e.id);
        what = `Traded from ${from || '?'} to ${to || '?'}`;
        if (t) return `<div class="tx"><div class="when"><a href="#/season/${e.season}/trades">${e.season}</a>${e.week ? ` · week ${e.week}` : ''}<br><span class="small">${dateFmt(e.date)}</span></div><div class="what"><div class="line">${what}</div>${tradeCard(sn, t)}</div></div>`;
      }
      else if (e.inferred) what = `${e.to ? `Picked up by ${to}` : `Dropped by ${from}`} <span class="pill pill-inferred">reconstructed</span> <span class="muted small">around week ${e.week}${e.week_range && e.week_range[0] !== e.week_range[1] ? ` (${e.week_range[0]}–${e.week_range[1]})` : ''}</span>`;
      else if (e.type === 'waiver') what = e.to ? `Claimed off waivers by ${to}${e.bid != null ? ` <span class="muted small">($${e.bid} FAAB)</span>` : ''}` : `Dropped by ${from}`;
      else if (e.type === 'commissioner') what = e.to ? `Added to ${to} by the commissioner` : `Removed from ${from} by the commissioner`;
      else what = e.to ? `Signed as a free agent by ${to}` : `Dropped by ${from}`;
      if (e.to && e.from && e.type !== 'trade') what = `Moved from ${from} to ${to}`;
      return `<div class="tx"><div class="when"><a href="#/season/${e.season}/${e.type === 'draft' || e.type === 'keeper' ? 'draft' : e.type === 'trade' ? 'trades' : 'moves'}">${e.season}</a>${e.week ? ` · ${e.inferred ? '≈ ' : ''}week ${e.week}` : ''}<br><span class="small">${dateFmt(e.date)}</span></div><div class="what"><div class="line">${what}</div></div></div>`;
    };
    const tenRows = d.tenures.slice().reverse().map(t => `<tr><td><a href="#/season/${t.season}/rosters">${t.season}</a> ${platformPill(t.platform)}</td><td><a href="#/manager/${enc(t.manager)}">${esc(t.team_name)}</a><div class="small muted">${esc(mgrName(t.manager))}</div></td><td class="num">${t.weeks}</td><td class="num">${t.starts}</td><td class="num">${pts(t.starter_pts)}</td><td class="num">${pts(t.total_pts)}</td><td class="num">${pts(t.ppg)}</td><td class="num">${t.best ? `${pts(t.best.pts)} <span class="muted small">wk ${t.best.week}</span>` : ''}</td></tr>`).join('');
    const byFr = {};
    d.tenures.forEach(t => { const a = byFr[t.manager] = byFr[t.manager] || { pts: 0, starts: 0, weeks: 0, seasons: [] }; a.pts += t.starter_pts; a.starts += t.starts; a.weeks += t.weeks; a.seasons.push(t.season); });
    const homes = Object.entries(byFr).sort((a, b) => b[1].pts - a[1].pts);
    const bySeason = {};
    d.weekly.filter(w => w.starter).forEach(w => (bySeason[w.season] = bySeason[w.season] || []).push(w));
    const maxPts = Math.max(1, ...d.weekly.map(w => w.pts || 0));
    const spark = Object.keys(bySeason).map(Number).sort((a, b) => a - b).map(y => `<div class="spark-season"><div class="small muted">${y}</div><div class="spark">${bySeason[y].sort((a, b) => a.week - b.week).map(w => `<i style="height:${Math.max(2, Math.round(40 * (w.pts || 0) / maxPts))}px" title="${y} wk ${w.week}: ${pts(w.pts)} (${esc(frName(seasonOf(y), w.franchise))})"></i>`).join('')}</div></div>`).join('');
    $app.innerHTML = `<div class="page-head" style="align-items:center">${headshot(d.id, 'hs hs-lg')}<div><h1 style="margin:0">${esc(d.name)}</h1><div class="row" style="gap:8px;margin-top:4px"><span class="pill pill-neutral">${esc(d.pos || '')}${d.team ? ' · ' + esc(d.team) : ''}</span><span class="sub">In the league ${c.seasons.length ? `${c.seasons[0]}–${c.seasons[c.seasons.length - 1]}` : ''} · ${c.managers.length} team${c.managers.length === 1 ? '' : 's'}</span></div></div></div>
      <div class="kpis">
        <div class="kpi"><div class="v">${pts(c.starter_pts)}</div><div class="l">Points as starter</div></div>
        <div class="kpi"><div class="v">${pts(c.total_pts)}</div><div class="l">Points while rostered</div></div>
        <div class="kpi"><div class="v">${c.starts}</div><div class="l">Starts</div></div>
        <div class="kpi"><div class="v">${c.weeks}</div><div class="l">Weeks rostered</div></div>
        <div class="kpi"><div class="v">${c.starts ? pts(+(c.starter_pts / c.starts).toFixed(2)) : '—'}</div><div class="l">PPG as starter</div></div>
        <div class="kpi"><div class="v">${c.trades}</div><div class="l">Times traded</div></div>
        <div class="kpi"><div class="v">${d.best_weeks[0] ? pts(d.best_weeks[0].pts) : '—'}</div><div class="l">Best week</div></div>
      </div>
      ${spark ? `<div class="card" style="margin-bottom:18px"><h3>Weekly scoring as a starter</h3><div class="sparks">${spark}</div></div>` : ''}
      ${gameLog(d)}
      <div class="grid grid-2">
        <div>
          <div class="card"><h3>Teams</h3><div class="table-wrap"><table class="tbl"><thead><tr><th>Manager</th><th class="num">Pts</th><th class="num">Starts</th><th class="num">Weeks</th><th>Seasons</th></tr></thead><tbody>${homes.map(([m, a]) => `<tr><td>${mgrLink(m)}</td><td class="num">${pts(+a.pts.toFixed(2))}</td><td class="num">${a.starts}</td><td class="num">${a.weeks}</td><td class="small muted nowrap">${yearRanges(a.seasons)}</td></tr>`).join('') || '<tr><td colspan="5" class="muted">Never on a roster during a scored week.</td></tr>'}</tbody></table></div></div>
          <div class="card" style="margin-top:18px"><h3>Season by season</h3><div class="table-wrap"><table class="tbl"><thead><tr><th>Year</th><th>Team</th><th class="num">Wks</th><th class="num">Starts</th><th class="num">Starter pts</th><th class="num">Total</th><th class="num">PPG</th><th class="num">Best</th></tr></thead><tbody>${tenRows || '<tr><td colspan="8" class="muted">—</td></tr>'}</tbody></table></div></div>
        </div>
        <div class="card"><h3>Transaction history</h3>${d.events.filter(e => e.type !== 'carryover' && e.type !== 'keeper').length ? d.events.slice().reverse().map(evLine).join('') : '<div class="empty">No recorded moves.</div>'}</div>
      </div>`;
  }

  function gameLog(d) {
    const seasons = [...new Set(d.weekly.map(w => w.season))].sort((a, b) => b - a);
    if (!seasons.length) return '';
    const cur = plLogSeason && seasons.includes(plLogSeason) ? plLogSeason : seasons[0];
    const rows = d.weekly.filter(w => w.season === cur).sort((a, b) => a.week - b.week);
    const sn = D.season[cur];
    const tn = f => { const t = sn && teamOf(sn, f); return t ? t.team_name : f; };
    const tot = rows.filter(w => w.starter && w.counted !== false).reduce((a, w) => a + (w.pts || 0), 0);
    return `<div class="card" style="margin-bottom:18px"><div class="card-head"><h3>Game log</h3><div class="row" style="gap:4px">${seasons.map(y => `<button class="btn ${y === cur ? 'active' : ''}" style="padding:3px 9px" data-logseason="${y}">${y}</button>`).join('')}</div></div>
      <div class="table-wrap"><table class="tbl"><thead><tr><th>Wk</th><th>Team</th><th>Slot</th><th class="num">Pts</th><th>Opponent</th><th class="num">Score</th><th>Result</th></tr></thead><tbody>
      ${rows.map(w => `<tr class="${w.starter && w.counted !== false ? '' : 'muted'}" data-game="${cur}|${esc(w.game)}" style="cursor:pointer"><td>${w.week}${w.round ? ` <span class="small muted">${esc(w.round)}${w.counted === false ? ' · not counted' : ''}</span>` : ''}</td><td>${esc(tn(w.franchise))}</td><td class="mono small">${w.starter ? esc(w.slot || '') : 'BN'}</td><td class="num"><b>${pts(w.pts)}</b></td><td>${esc(tn(w.opp))}</td><td class="num mono small">${w.team_pts != null ? `${pts(w.team_pts)}–${pts(w.opp_pts)}` : ''}</td><td>${w.won === true ? '<span class="trophy">W</span>' : w.won === false ? '<span class="muted">L</span>' : ''}</td></tr>`).join('')}
      <tr class="total"><td colspan="3"><b>${cur} as starter</b></td><td class="num"><b>${pts(+tot.toFixed(2))}</b></td><td colspan="3" class="small muted">${rows.filter(w => w.starter && w.counted !== false).length} starts · ${rows.filter(w => w.counted !== false).length} weeks rostered · consolation weeks shown but not counted · click a row for the box score</td></tr>
      </tbody></table></div></div>`;
  }
  let plLogSeason = null;
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-logseason]');
    if (b) { plLogSeason = +b.dataset.logseason; route(); }
  });

  // ---- transaction detail
  async function pageTx(year, id) {
    const s = await loadSeason(+year);
    const t = s.transactions.find(x => x.id === id);
    if (!t) { $app.innerHTML = '<div class="empty">Transaction not found.</div>'; return; }
    await loadAllSeasons();
    const moved = [...new Set([...t.adds.map(a => a.p), ...t.drops.map(a => a.p)])];
    const details = await Promise.all(moved.map(p => getJSON(`data/players/${p.replace(':', '-')}.json`).catch(() => null)));
    const after = moved.map((p, i) => {
      const d = details[i]; const to = (t.adds.find(a => a.p === p) || {}).to; const from = (t.drops.find(a => a.p === p) || {}).from;
      if (!d) return { p, to, from };
      const wk = t.week || 0;
      const sum = rows => ({ pts: rows.reduce((a, w) => a + (w.starter ? (w.pts || 0) : 0), 0), starts: rows.filter(w => w.starter).length, weeks: rows.length });
      const before = sum(d.weekly.filter(w => w.franchise === from && (w.season < +year || (w.season === +year && w.week <= wk))));
      const rest = sum(d.weekly.filter(w => w.franchise === to && w.season === +year && w.week > wk));
      const later = sum(d.weekly.filter(w => w.franchise === to && w.season > +year));
      const laterSeasons = [...new Set(d.weekly.filter(w => w.franchise === to && w.season > +year).map(w => w.season))];
      // did the receiving team move the player on again?
      const next = d.events.find(e => (e.season > +year || (e.season === +year && (e.date || '') > (t.date || ''))) && e.from === to && e.type !== 'carryover');
      return { p, to, from, before, rest, later, laterSeasons, next, d };
    });
    const name = f => { const tm = teamOf(s, f); return tm ? tm.team_name : f; };
    const pickRows = t.picks.map(pk => {
      const ds = D.season[+pk.season]; let used = null;
      if (ds) ds.drafts.forEach(d => d.picks.forEach(x => { if (x.round === pk.round && x.franchise === pk.to && x.p) (used = used || []).push(x); }));
      return `<tr><td>${esc(pk.season)} round ${pk.round}</td><td>${esc(name(pk.from))} → ${esc(name(pk.to))}</td><td>${used ? used.map(x => `${playerLabel(x.p)} <span class="muted small">#${x.pick}</span>`).join('<br>') : (ds && ds.status === 'complete' ? '<span class="muted">not traceable</span>' : '<span class="muted">not yet used</span>')}</td></tr>`;
    }).join('');
    const isTrade = t.type === 'trade';
    $app.innerHTML = `<div class="page-head"><h1>${isTrade ? 'Trade' : t.type === 'waiver' ? 'Waiver claim' : t.type === 'commissioner' ? 'Commissioner move' : 'Free-agent move'}</h1><span class="sub">${s.season}${t.week ? ` · week ${t.week}` : ''} · ${dateFmt(t.date)}</span><span class="spacer"></span><a class="btn" href="#/season/${s.season}/${isTrade ? 'trades' : 'moves'}">All ${s.season} ${isTrade ? 'trades' : 'moves'}</a></div>
      ${isTrade ? tradeCard(s, t, { noLink: true }) : txLine(s, t)}
      ${moved.length ? `<div class="card" style="margin-top:18px"><h3>What happened next</h3><div class="table-wrap"><table class="tbl"><thead><tr><th>Player</th><th>Went to</th><th class="num">Before, for old team</th><th class="num">Rest of ${s.season}</th><th class="num">Later seasons</th><th>Then</th></tr></thead><tbody>
        ${after.map(a => `<tr><td>${playerLabel(a.p)}</td><td>${a.to ? `<a href="#/manager/${enc((teamOf(s, a.to) || {}).manager)}">${esc(name(a.to))}</a>` : '<span class="muted">released</span>'}</td><td class="num">${a.before ? `${pts(+a.before.pts.toFixed(2))} <span class="muted small">${a.before.starts} st / ${a.before.weeks} wk</span>` : '—'}</td><td class="num">${a.rest ? `<b>${pts(+a.rest.pts.toFixed(2))}</b> <span class="muted small">${a.rest.starts} st / ${a.rest.weeks} wk</span>` : '—'}</td><td class="num">${a.later && a.later.weeks ? `${pts(+a.later.pts.toFixed(2))} <span class="muted small">${a.later.starts} st · ${yearRanges(a.laterSeasons)}</span>` : '<span class="muted">—</span>'}</td><td class="small">${a.next ? `${a.next.type === 'trade' ? 'Traded' : 'Dropped'} ${a.next.season}${a.next.week ? ' wk ' + a.next.week : ''}${a.next.to ? ' to ' + esc(name(a.next.to)) : ''}` : (a.d && a.d.weekly.some(w => w.franchise === a.to && w.season === D.league.current_season) ? '<span class="trophy">still on roster</span>' : '')}</td></tr>`).join('')}
      </tbody></table></div><p class="small muted" style="margin:8px 0 0">Points are what the player scored while started for that team. 2016–2017 ESPN data only records starters.</p></div>` : ''}
      ${t.inferred ? `<div class="notes">This move is reconstructed from the draft, weekly starters and end-of-season rosters; ESPN no longer serves the itemized ${s.season} log. The week is approximate${t.week_range && t.week_range[0] !== t.week_range[1] ? ` (between weeks ${t.week_range[0]} and ${t.week_range[1]})` : ''}${t.confidence === 'low' ? ', and this pairing is low confidence' : ''}.</div>` : ''}
      ${t.picks.length ? `<div class="card" style="margin-top:18px"><h3>Draft picks in the deal</h3><div class="table-wrap"><table class="tbl"><thead><tr><th>Pick</th><th>Moved</th><th>Became</th></tr></thead><tbody>${pickRows}</tbody></table></div><p class="small muted" style="margin:8px 0 0">"Became" lists the receiving team's selections in that round of that draft; when a team held several picks in the round all are shown.</p></div>` : ''}`;
  }

  // ---------------------------------------------------------------- router
  const routes = [
    [/^\/?$/, () => pageHome()],
    [/^\/seasons$/, () => pageSeasons()],
    [/^\/season\/(\d{4})(?:\/([a-z]+))?(?:\/([a-z0-9]+))?(?:\/([a-z0-9]+))?$/, (y, tab, arg, arg2) => pageSeason(+y, tab || 'standings', arg, arg2)],
    [/^\/managers$/, () => pageManagers()],
    [/^\/manager\/([^/]+)$/, id => pageManager(decodeURIComponent(id))],
    [/^\/h2h(?:\/([^/]+)\/([^/]+))?$/, (a, b) => pageH2H(a && decodeURIComponent(a), b && decodeURIComponent(b))],
    [/^\/records$/, () => pageRecords()],
    [/^\/drafts(?:\/(\d{4}))?$/, y => pageDrafts(y)],
    [/^\/trades$/, () => pageTrades()],
    [/^\/players$/, () => pagePlayers()],
    [/^\/tx\/(\d{4})\/([^/]+)$/, (y, id) => pageTx(y, decodeURIComponent(id))],
    [/^\/player\/([^/]+)$/, id => pagePlayer(decodeURIComponent(id))],
  ];
  async function route() {
    const path = (location.hash.replace(/^#/, '') || '/');
    closeModal();
    try {
      await loadCore();
      const top = path.split('/')[1] || '';
      document.querySelectorAll('#nav a').forEach(a => a.classList.toggle('active', a.dataset.route === (top === 'season' ? 'seasons' : top === 'manager' ? 'managers' : top === 'player' ? 'players' : top === 'tx' ? 'trades' : top || 'home')));
      document.getElementById('nav').classList.remove('open');
      for (const [re, fn] of routes) {
        const m = path.match(re);
        if (m) { $app.innerHTML = '<div class="loading">Loading…</div>'; await fn(...m.slice(1)); window.scrollTo(0, 0); return; }
      }
      $app.innerHTML = '<div class="empty">Page not found. <a href="#/">Home</a></div>';
    } catch (e) {
      console.error(e);
      $app.innerHTML = `<div class="empty">Could not load league data (${esc(e.message)}). If you opened this file directly, serve the folder over HTTP instead.</div>`;
    }
    const L = D.league;
    if (L) document.getElementById('footer').innerHTML = `BigDongFootball · ESPN league ${esc(L.eras[0].league_id)} (2016–2021) → <a href="${esc(L.eras[1].url)}" target="_blank" rel="noopener">Sleeper league</a> (2022–present) · Sleeper data refreshed ${dateFmt(L.data_updated)} · Manager names are Sleeper usernames; real names are not published.`;
  }
  window.addEventListener('hashchange', route);
  document.getElementById('navToggle').onclick = () => {
    const n = document.getElementById('nav'); n.classList.toggle('open');
    document.getElementById('navToggle').setAttribute('aria-expanded', n.classList.contains('open'));
  };
  route();
})();
