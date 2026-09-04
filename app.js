(() => {
  "use strict";

  const cfg = window.GRANIT_CONFIG || {};
  const configured = Boolean(cfg.supabaseUrl && cfg.supabasePublishableKey && !String(cfg.supabaseUrl).includes("PASTE_"));
  const $ = (id) => document.getElementById(id);
  const setupScreen = $("setup-screen");
  const loginScreen = $("login-screen");
  const app = $("app");
  const pageContent = $("page-content");
  const sourceSelect = $("source-select");
  const rangeSelect = $("range-select");
  const compareSelect = $("compare-select");
  const sourceFilterLabel = $("global-source-label");

  const SOURCE = {
    blog: { label: "Grandio Blog", short: "Blog", color: "#0a4b55", exposure: ["web_views"], clicks: ["search_clicks"], engagement: ["web_engaged_sessions"], audience: [] },
    mailchimp: { label: "Hírlevél", short: "Hírlevél", color: "#13707d", exposure: ["unique_opens"], clicks: ["unique_clicks"], engagement: [], audience: ["audience_members"] },
    linkedin_company: { label: "LinkedIn", short: "LinkedIn", color: "#2867b2", exposure: ["impressions", "reach"], clicks: ["clicks"], engagement: ["reactions", "comments", "shares", "saves"], audience: ["followers"] },
    facebook: { label: "Facebook", short: "Facebook", color: "#4267b2", exposure: ["page_views_total", "views", "reach"], clicks: ["clicks", "post_clicks"], engagement: ["reactions", "comments", "shares", "post_engaged_users"], audience: ["followers", "fans"] },
    instagram: { label: "Instagram", short: "Instagram", color: "#b93683", exposure: ["views", "reach"], clicks: ["clicks"], engagement: ["total_interactions", "accounts_engaged", "reactions", "comments", "shares", "saved"], audience: ["followers"] },
    youtube: { label: "YouTube", short: "YouTube", color: "#d92d20", exposure: ["views"], clicks: [], engagement: ["reactions", "comments", "shares"], audience: ["subscribers"] },
    observer: { label: "Observer", short: "Observer", color: "#b54708", exposure: ["media_mentions"], clicks: [], engagement: ["media_stories"], audience: [] },
  };
  const SOCIAL_SOURCES = ["linkedin_company", "facebook", "instagram", "youtube"];
  const OWN_SOURCES = ["blog", "mailchimp", ...SOCIAL_SOURCES];
  const ALL_SOURCES = [...OWN_SOURCES, "observer"];
  const PAGE_META = {
    overview: ["VEZETŐI ÖSSZKÉP", "Összkép", "30 másodperces vezetői kép: mi történt, mi működött és mire kell figyelni."],
    newsletter: ["E-MAIL-MARKETING", "Hírlevél", "Kampányok, kattintások, feliratkozók és a legsikeresebb tartalmak."],
    blog: ["SAJÁT MÉDIA", "Grandio Blog", "Olvasottság, forgalmi források, szerzők és SEO-teljesítmény."],
    linkedin_company: ["KÖZÖSSÉGI MÉDIA", "LinkedIn", "A GRÁNIT Alapkezelő LinkedIn-oldalának teljesítménye."],
    facebook: ["KÖZÖSSÉGI MÉDIA", "Facebook", "Elérés, kattintások, interakciók és tartalmi eredmények."],
    instagram: ["KÖZÖSSÉGI MÉDIA", "Instagram", "Reels, karusszelek, mentések, megosztások és követőnövekedés."],
    youtube: ["VIDEÓ", "YouTube", "Megtekintések, nézési idő, feliratkozók és videóteljesítmény."],
    content: ["TARTALOMADATBÁZIS", "Tartalomkereső", "Minden importált cikk, poszt, videó és hírlevél egy helyen."],
    stories: ["KERESZTCSATORNÁS ELEMZÉS", "Sztorik és elemzés", "Keresztcsatornás történetek, témák és ezek teljesítménye."],
    observer: ["MÉDIAFIGYELÉS", "Observer", "Sajtómegjelenések, megszólalások, említések és reputációs jelzések."],
    connections: ["RENDSZERÁLLAPOT", "Adatkapcsolatok", "A collectorok frissessége, hibái és beállítási állapota."],
  };

  const state = {
    client: null, user: null, page: location.hash.replace("#", "") || "overview",
    accounts: [], content: [], metrics: [], syncRuns: [], charts: [], loadedAt: null,
  };

  function esc(value) { return String(value ?? "").replace(/[&<>'"]/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c])); }
  function num(value, compact = false) {
    const n = Number(value || 0);
    return new Intl.NumberFormat("hu-HU", compact && Math.abs(n) >= 10000 ? { notation: "compact", maximumFractionDigits: 1 } : { maximumFractionDigits: n % 1 ? 1 : 0 }).format(n);
  }
  function pct(value, digits = 1) { return `${new Intl.NumberFormat("hu-HU", { maximumFractionDigits: digits, minimumFractionDigits: digits }).format(Number(value || 0) * 100)}%`; }
  function dateHU(value) { if (!value) return "–"; const d = new Date(value); return Number.isNaN(d.getTime()) ? "–" : new Intl.DateTimeFormat("hu-HU", { year:"numeric", month:"2-digit", day:"2-digit" }).format(d); }
  function dateTimeHU(value) { if (!value) return "–"; const d = new Date(value); return Number.isNaN(d.getTime()) ? "–" : new Intl.DateTimeFormat("hu-HU", { year:"numeric", month:"2-digit", day:"2-digit", hour:"2-digit", minute:"2-digit" }).format(d); }
  function dayKey(value) { const d = new Date(value); if (Number.isNaN(d.getTime())) return ""; const y=d.getFullYear(), m=String(d.getMonth()+1).padStart(2,"0"), day=String(d.getDate()).padStart(2,"0"); return `${y}-${m}-${day}`; }
  function clampText(value, max = 110) { const text = String(value || "").trim(); return text.length > max ? `${text.slice(0, max - 1)}…` : text; }
  function cleanDisplayText(value) { return String(value || "").replace(/\s+/g, " ").trim(); }
  function sourceLabel(source) { return SOURCE[source]?.label || source || "Ismeretlen"; }
  function primaryMetricLabel(source) {
    const labels = {
      blog: "megtekintés",
      mailchimp: "egyedi megnyitás",
      linkedin_company: "megjelenés",
      facebook: "megtekintés / elérés",
      instagram: "megtekintés / elérés",
      youtube: "megtekintés",
      observer: "sajtómegjelenés",
    };
    return labels[source] || "elsődleges eredmény";
  }
  function sourceBadge(source) { return `<span class="source-badge">${esc(sourceLabel(source))}</span>`; }
  function statusBadge(status) { const map = { success:["Működik","success"], error:["Hiba","error"], missing:["Nincs beállítva","neutral"], stale:["Nem friss","warning"] }; const [label, cls] = map[status] || [status,"neutral"]; return `<span class="status-badge ${cls}">${label}</span>`; }
  function showToast(message) { const toast = $("toast"); toast.textContent = message; toast.classList.remove("hidden"); clearTimeout(showToast.timer); showToast.timer = setTimeout(() => toast.classList.add("hidden"), 2800); }

  function selectedRange(offset = 0) {
    const now = new Date(); now.setHours(23,59,59,999);
    const value = rangeSelect.value;
    if (value === "all") return { start: null, end: now, days: null };
    let start;
    let days;
    if (value === "year") { start = new Date(now.getFullYear(), 0, 1); days = Math.ceil((now - start) / 86400000) + 1; }
    else { days = Number(value); start = new Date(now); start.setDate(start.getDate() - days + 1); start.setHours(0,0,0,0); }
    if (offset && days) { const shift = days * offset; start.setDate(start.getDate() + shift); now.setDate(now.getDate() + shift); }
    return { start, end: now, days };
  }
  function previousRange() { if (compareSelect.value === "none") return null; const current = selectedRange(); if (!current.start || !current.days) return null; const end = new Date(current.start); end.setDate(end.getDate() - 1); end.setHours(23,59,59,999); const start = new Date(end); start.setDate(start.getDate() - current.days + 1); start.setHours(0,0,0,0); return { start, end, days: current.days }; }
  function inRange(value, range = selectedRange()) { if (!value) return false; const d = new Date(value); if (Number.isNaN(d.getTime())) return false; return (!range.start || d >= range.start) && d <= range.end; }
  function rangeLabel() { const r = selectedRange(); return r.start ? `${dateHU(r.start)} – ${dateHU(r.end)}` : "Minden elérhető adat"; }

  async function fetchPaged(table, orderColumn = null, ascending = false) {
    const rows = []; const pageSize = 1000; let from = 0;
    while (true) {
      let query = state.client.from(table).select("*").range(from, from + pageSize - 1);
      if (orderColumn) query = query.order(orderColumn, { ascending });
      const { data, error } = await query;
      if (error) throw error;
      rows.push(...(data || []));
      if (!data || data.length < pageSize) break;
      from += pageSize;
      if (from > 200000) break;
    }
    return rows;
  }

  async function loadData(showMessage = true) {
    if (showMessage) $("last-refresh").textContent = "Adatok betöltése…";
    try {
      const [accounts, content, metrics, syncRuns] = await Promise.all([
        fetchPaged("accounts", "updated_at", false), fetchPaged("content_items", "published_at", false),
        fetchPaged("metric_daily", "metric_date", false), fetchPaged("sync_runs", "started_at", false),
      ]);
      Object.assign(state, { accounts, content, metrics, syncRuns, loadedAt: new Date() });
      $("last-refresh").textContent = `Betöltve: ${dateTimeHU(state.loadedAt)}`;
      $("footer-data-note").textContent = `${num(content.length)} tartalom · ${num(metrics.length)} adatsor`;
      renderPage();
    } catch (error) {
      console.error(error); $("last-refresh").textContent = "Betöltési hiba";
      pageContent.innerHTML = `<div class="empty-state"><strong>Nem sikerült betölteni az adatokat.</strong>${esc(error.message || error)}</div>`;
    }
  }

  function contents(sources = ALL_SOURCES, range = selectedRange()) { return state.content.filter((c) => sources.includes(c.source) && inRange(c.published_at, range)); }
  function metricRows(source, names, range = selectedRange(), contentId = undefined) {
    return state.metrics.filter((m) => m.source === source && names.includes(m.metric_name) && inRange(m.metric_date, range) && (contentId === undefined || String(m.content_external_id || "") === String(contentId || "")));
  }
  function latestSnapshot(source, names, contentId = "") {
    const rows = state.metrics.filter((m) => m.source === source && names.includes(m.metric_name) && String(m.content_external_id || "") === String(contentId || "") && m.aggregation_type === "snapshot").sort((a,b) => String(b.metric_date).localeCompare(String(a.metric_date)));
    return rows.length ? Number(rows[0].metric_value || 0) : 0;
  }
  function contentMetric(content, names) {
    for (const name of names) {
      const rows = state.metrics.filter((m) => m.source === content.source && m.metric_name === name && String(m.content_external_id || "") === String(content.external_id));
      if (!rows.length) continue;
      const snapshots = rows.filter((r) => r.aggregation_type === "snapshot").sort((a,b) => String(b.metric_date).localeCompare(String(a.metric_date)));
      if (snapshots.length) return Number(snapshots[0].metric_value || 0);
      return rows.reduce((s,r) => s + Number(r.metric_value || 0), 0);
    }
    return 0;
  }
  function accountMetricTotal(source, names, range = selectedRange()) {
    for (const name of names) {
      const rows = metricRows(source, [name], range, "");
      if (!rows.length) continue;
      const flows = rows.filter((r) => r.aggregation_type === "flow");
      if (flows.length) return flows.reduce((s,r) => s + Number(r.metric_value || 0), 0);
      const latest = [...rows].sort((a,b) => String(b.metric_date).localeCompare(String(a.metric_date)))[0];
      return Number(latest?.metric_value || 0);
    }
    return 0;
  }
  function sourceMetric(source, kind, range = selectedRange()) {
    const sc = SOURCE[source]; if (!sc) return 0;
    if (kind === "publishing") return contents([source], range).length;
    const names = kind === "exposure" ? sc.exposure : kind === "clicks" ? sc.clicks : sc.engagement;
    if (!names.length) return 0;
    if (kind === "engagement") {
      if (source === "instagram") {
        const account = accountMetricTotal(source, ["total_interactions", "accounts_engaged"], range);
        if (account) return account;
        return contents([source], range).reduce((sum, c) => {
          const total = contentMetric(c, ["total_interactions"]);
          return sum + (total || ["reactions", "comments", "shares", "saved"].reduce((s,n)=>s+contentMetric(c,[n]),0));
        }, 0);
      }
      if (source === "facebook") {
        const account = accountMetricTotal(source, ["post_engaged_users"], range);
        if (account) return account;
      }
      const accountValues = names.map((n) => accountMetricTotal(source, [n], range));
      if (accountValues.some(Boolean)) return accountValues.reduce((a,b) => a+b,0);
      return contents([source], range).reduce((sum,c) => sum + names.reduce((s,n) => s + contentMetric(c,[n]),0),0);
    }
    const account = accountMetricTotal(source, names, range);
    if (account) return account;
    return contents([source], range).reduce((sum,c) => sum + contentMetric(c,names),0);
  }
  function audience(source) { return latestSnapshot(source, SOURCE[source]?.audience || [], ""); }
  function snapshotSeries(source, names, range = selectedRange()) {
    for (const name of names) {
      const rows = metricRows(source, [name], range, "")
        .filter((m) => m.aggregation_type === "snapshot")
        .sort((a, b) => String(a.metric_date).localeCompare(String(b.metric_date)));
      if (!rows.length) continue;
      const byDate = new Map();
      rows.forEach((row) => byDate.set(dayKey(row.metric_date), Number(row.metric_value || 0)));
      const points = [...byDate.entries()].sort((a, b) => a[0].localeCompare(b[0]));
      return { labels: points.map(([date]) => dateHU(date)), values: points.map(([, value]) => value), dates: points.map(([date]) => date) };
    }
    return { labels: [], values: [], dates: [] };
  }
  function accountFlowSeries(source, names, range = selectedRange()) {
    const dates = allDates(range);
    const map = Object.fromEntries(dates.map((d)=>[d,0]));
    state.metrics.filter((m)=>m.source===source && !m.content_external_id && names.includes(m.metric_name) && m.aggregation_type==="flow" && inRange(m.metric_date,range)).forEach((m)=>{
      const d=dayKey(m.metric_date);
      if(d in map) map[d]+=Number(m.metric_value||0);
    });
    return {labels:dates.map((d)=>dateHU(d)),values:dates.map((d)=>map[d]),dates};
  }
  function rangeWithLookback(range, days = 0) {
    if (!range?.start || !days) return range;
    const start = new Date(range.start);
    start.setDate(start.getDate() - days);
    start.setHours(0,0,0,0);
    return { ...range, start, days: range.days ? range.days + days : null };
  }
  function trimSeries(series, range) {
    if (!range?.start) return series;
    const keep = (series.dates || []).map((d)=>inRange(d,range));
    return {
      labels: (series.labels || []).filter((_,i)=>keep[i]),
      values: (series.values || []).filter((_,i)=>keep[i]),
      dates: (series.dates || []).filter((_,i)=>keep[i]),
    };
  }
  function seriesWithMovingAverages(builder, range, windows = []) {
    const maxWindow = Math.max(1, ...windows.map((w)=>Number(w)||1));
    const expanded = rangeWithLookback(range, maxWindow - 1);
    const full = builder(expanded);
    const averages = Object.fromEntries(windows.map((w)=>[w,movingAverage(full.values,w)]));
    if (!range?.start) return { ...full, averages };
    const keep = (full.dates || []).map((d)=>inRange(d,range));
    return {
      labels: (full.labels || []).filter((_,i)=>keep[i]),
      values: (full.values || []).filter((_,i)=>keep[i]),
      dates: (full.dates || []).filter((_,i)=>keep[i]),
      averages: Object.fromEntries(windows.map((w)=>[w,(averages[w]||[]).filter((_,i)=>keep[i])])),
    };
  }

  function contentStats(c) {
    const sc = SOURCE[c.source] || { exposure:[], clicks:[], engagement:[] };
    let engagement;
    if (c.source === "instagram") {
      engagement = contentMetric(c, ["total_interactions"]) || ["reactions", "comments", "shares", "saved"].reduce((sum,n)=>sum+contentMetric(c,[n]),0);
    } else {
      engagement = sc.engagement.reduce((sum,n) => sum + contentMetric(c,[n]),0);
    }
    return {
      exposure: contentMetric(c, sc.exposure),
      clicks: contentMetric(c, sc.clicks),
      engagement,
    };
  }
  function delta(current, previous) { if (!previous) return current ? null : 0; return (current - previous) / Math.abs(previous); }
  function safeMin(values, fallback = 0) { let best = Infinity; for (const value of values || []) { const n=Number(value); if (Number.isFinite(n) && n < best) best=n; } return best===Infinity?fallback:best; }
  function safeMax(values, fallback = 0) { let best = -Infinity; for (const value of values || []) { const n=Number(value); if (Number.isFinite(n) && n > best) best=n; } return best===-Infinity?fallback:best; }
  function audienceAtEnd(source, range) {
    if (!range) return 0;
    const names=SOURCE[source]?.audience||[];
    for (const name of names) {
      let bestDate="", bestValue=0;
      for (const row of state.metrics) {
        if (row.source!==source || row.metric_name!==name || String(row.content_external_id||"")!=="" || row.aggregation_type!=="snapshot") continue;
        const d=new Date(row.metric_date); if(Number.isNaN(d.getTime()) || d>range.end) continue;
        const key=String(row.metric_date||""); if(!bestDate || key>bestDate){bestDate=key;bestValue=Number(row.metric_value||0);}
      }
      if(bestDate) return bestValue;
    }
    return 0;
  }
  function audienceChangeForRange(source, range=selectedRange()) {
    const names=SOURCE[source]?.audience||[];
    for (const name of names) {
      const rows=state.metrics.filter((row)=>row.source===source && row.metric_name===name && String(row.content_external_id||"")==="" && row.aggregation_type==="snapshot")
        .map((row)=>({date:new Date(row.metric_date),key:String(row.metric_date||""),value:Number(row.metric_value||0)}))
        .filter((row)=>!Number.isNaN(row.date.getTime()) && row.date<=range.end)
        .sort((a,b)=>a.date-b.date);
      if(rows.length<2) continue;
      const end=rows[rows.length-1];
      if(!range.start) {
        const start=rows[0];
        return {value:end.value-start.value,start:start.value,end:end.value,coverageStart:start.date,complete:true};
      }
      const beforeStart=rows.filter((row)=>row.date<range.start).pop();
      if(beforeStart) return {value:end.value-beforeStart.value,start:beforeStart.value,end:end.value,coverageStart:range.start,complete:true};
      return null;
    }
    return null;
  }
  function deltaHtml(value) { if (value === null || !Number.isFinite(value)) return `<span class="delta neutral">nincs összehasonlítás</span>`; const cls = value > .001 ? "up" : value < -.001 ? "down" : "neutral"; const arrow = value > .001 ? "↑" : value < -.001 ? "↓" : "→"; return `<span class="delta ${cls}">${arrow} ${pct(Math.abs(value))}</span>`; }
  function kpi(label, value, note = "", change = undefined) { return `<article class="kpi-card"><span class="kpi-label">${esc(label)}</span><strong>${esc(value)}</strong><small>${change === undefined ? esc(note) : `${deltaHtml(change)} · ${esc(note)}`}</small></article>`; }

  function allDates(range = selectedRange(), maxDays = 760) {
    let start = range.start ? new Date(range.start) : null;
    if (!start) {
      let earliest = Infinity;
      for (const row of state.metrics) { const t=new Date(row.metric_date).getTime(); if(Number.isFinite(t) && t<earliest) earliest=t; }
      start = earliest===Infinity ? new Date() : new Date(earliest);
    }
    if ((range.end - start) / 86400000 > maxDays) { start = new Date(range.end); start.setDate(start.getDate() - maxDays + 1); }
    const out=[]; const d=new Date(start); d.setHours(0,0,0,0); while(d<=range.end){out.push(dayKey(d));d.setDate(d.getDate()+1);} return out;
  }
  function dailySeries(source, kind, range = selectedRange()) {
    const dates = allDates(range); const map = Object.fromEntries(dates.map((d)=>[d,0])); const sc = SOURCE[source];
    if (!sc) return { labels: dates.map((d)=>dateHU(d)), values: dates.map(()=>0), dates };
    if (kind === "publishing") {
      contents([source], range).forEach((c)=>{const d=dayKey(c.published_at); if(d in map)map[d]++;});
      return {labels:dates.map((d)=>dateHU(d)),values:dates.map((d)=>map[d]),dates};
    }
    const names = kind === "exposure" ? sc.exposure : kind === "clicks" ? sc.clicks : sc.engagement;
    const flowRows = state.metrics.filter((m)=>m.source===source && names.includes(m.metric_name) && m.aggregation_type==="flow" && inRange(m.metric_date,range));
    const accountRows = flowRows.filter((m)=>!m.content_external_id);
    const sourceRows = accountRows.length ? accountRows : flowRows;
    if (sourceRows.length) {
      const selectedNames = kind === "engagement" ? names : [names.find((n)=>sourceRows.some((r)=>r.metric_name===n))].filter(Boolean);
      sourceRows.filter((r)=>selectedNames.includes(r.metric_name)).forEach((r)=>{
        const d=dayKey(r.metric_date);
        if(d in map) map[d]+=Number(r.metric_value||0);
      });
    } else {
      contents([source],range).forEach((c)=>{const d=dayKey(c.published_at);if(!(d in map))return;map[d]+=kind==="engagement"?names.reduce((sum,n)=>sum+contentMetric(c,[n]),0):contentMetric(c,names);});
    }
    return { labels: dates.map((d)=>dateHU(d)), values: dates.map((d)=>map[d]), dates };
  }
  function movingAverage(values, window) { return values.map((_,i)=>{const start=Math.max(0,i-window+1);const part=values.slice(start,i+1);return part.reduce((a,b)=>a+b,0)/part.length;}); }
  function destroyCharts(){ state.charts.forEach((c)=>c.destroy()); state.charts=[]; }
  function chart(canvasId, config){ const el=$(canvasId); if(!el)return null; const c=new Chart(el,config); state.charts.push(c); return c; }
  function lineChart(canvasId, labels, datasets, options={}) { return chart(canvasId,{type:"line",data:{labels,datasets},options:{responsive:true,maintainAspectRatio:false,interaction:{mode:"index",intersect:false},plugins:{legend:{display:datasets.length>1,position:"bottom"},tooltip:{callbacks:{label:(ctx)=>`${ctx.dataset.label}: ${num(ctx.parsed.y)}`}}},scales:{x:{grid:{display:false},ticks:{maxTicksLimit:10}},y:{beginAtZero:true,grid:{color:"rgba(16,45,49,.06)"}}},...options}}); }
  function barChart(canvasId, labels, values, colors) { return chart(canvasId,{type:"bar",data:{labels,datasets:[{data:values,backgroundColor:colors,borderRadius:7}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{x:{grid:{display:false}},y:{beginAtZero:true,grid:{color:"rgba(16,45,49,.06)"}}}}}); }
  function doughnut(canvasId, labels, values, colors) { return chart(canvasId,{type:"doughnut",data:{labels,datasets:[{data:values,backgroundColor:colors,borderWidth:0}]},options:{responsive:true,maintainAspectRatio:false,cutout:"66%",plugins:{legend:{position:"bottom"}}}}); }

  function scoredContents(sources, range=selectedRange()) {
    return contents(sources,range).map((c)=>({c,s:contentStats(c)})).sort((a,b)=>(b.s.exposure+b.s.clicks*4+b.s.engagement*2)-(a.s.exposure+a.s.clicks*4+a.s.engagement*2));
  }
  function topContents(sources, limit=8, range=selectedRange()) { return scoredContents(sources,range).slice(0,limit); }
  function contentRowsHtml(items, options = {}) {
    const showClicks=options.showClicks!==false, showAuthor=options.showAuthor===true;
    const colCount=6+(showClicks?1:0)+(showAuthor?1:0);
    if (!items.length) return `<tr><td colspan="${colCount}"><div class="empty-state"><strong>Még nincs megjeleníthető tartalom.</strong>A csatorna bekötése után itt automatikusan megjelennek az adatok.</div></td></tr>`;
    return items.map(({c,s})=>`<tr${showAuthor?` data-author="${esc(c.author||"Nincs szerzőadat")}"`:""}><td data-sort-value="${esc(c.title||"")}"><a href="#" class="content-link" data-content="${esc(c.source)}|${esc(c.external_id)}">${esc(clampText(c.title,90))}</a></td>${showAuthor?`<td data-sort-value="${esc(c.author||"Nincs szerzőadat")}">${esc(c.author||"Nincs szerzőadat")}</td>`:""}<td data-sort-value="${esc(sourceLabel(c.source))}">${sourceBadge(c.source)}</td><td data-sort-value="${esc(c.published_at||"")}">${dateHU(c.published_at)}</td><td class="num" data-sort-value="${Number(s.exposure||0)}">${num(s.exposure)}<div class="metric-definition">${esc(primaryMetricLabel(c.source))}</div></td>${showClicks?`<td class="num" data-sort-value="${Number(s.clicks||0)}">${num(s.clicks)}</td>`:""}<td class="num" data-sort-value="${Number(s.engagement||0)}">${num(s.engagement)}</td><td>${c.url?`<a class="content-link" href="${esc(c.url)}" target="_blank" rel="noopener">Megnyitás ↗</a>`:"–"}</td></tr>`).join("");
  }
  function contentTable(items, title="Tartalmak", options = {}) {
    const showClicks=options.showClicks!==false, showAuthor=options.showAuthor===true, authorFilter=options.authorFilter===true;
    const authorNames=showAuthor?[...new Set(items.map(({c})=>c.author||"Nincs szerzőadat"))].sort((a,b)=>a.localeCompare(b,"hu",{sensitivity:"base"})):[];
    const filterHtml=authorFilter?`<details class="author-filter" id="blog-author-filter"><summary>Szerzők szűrése <span id="blog-author-filter-count">(${num(authorNames.length)} / ${num(authorNames.length)})</span></summary><div class="author-filter-actions"><button type="button" class="secondary-button" id="blog-author-all">Összes</button><button type="button" class="secondary-button" id="blog-author-none">Egyik sem</button></div><div class="author-filter-options">${authorNames.map((name)=>`<label><input type="checkbox" value="${esc(name)}" checked> <span>${esc(name)}</span></label>`).join("")}</div></details>`:"";
    return `<article class="panel"><div class="panel-heading"><div><p class="eyebrow">TARTALOM</p><h2>${esc(title)}</h2></div><span class="panel-note">${authorFilter?`<span id="blog-content-visible-count">${num(items.length)}</span> / `:""}${num(items.length)} elem · oszlopfejlécre kattintva rendezhető</span></div>${filterHtml}<div class="table-wrap"><table class="sortable-table${authorFilter?" blog-content-table":""}"><thead><tr><th data-sort-type="text">Tartalom</th>${showAuthor?`<th data-sort-type="text">Szerző</th>`:""}<th data-sort-type="text">Csatorna</th><th data-sort-type="date">Dátum</th><th class="num" data-sort-type="number">Elsődleges eredmény</th>${showClicks?`<th class="num" data-sort-type="number">Kattintás</th>`:""}<th class="num" data-sort-type="number">Interakció</th><th>Link</th></tr></thead><tbody>${contentRowsHtml(items,options)}</tbody></table></div></article>`;
  }
  function bindBlogAuthorFilter() {
    const details=$("blog-author-filter"), table=document.querySelector(".blog-content-table");
    if(!details||!table)return;
    const boxes=[...details.querySelectorAll('input[type="checkbox"]')], count=$("blog-author-filter-count"), visible=$("blog-content-visible-count");
    const apply=()=>{const selected=new Set(boxes.filter((box)=>box.checked).map((box)=>box.value));let shown=0;[...table.tBodies[0].rows].forEach((row)=>{const show=selected.has(row.dataset.author||"");row.hidden=!show;if(show)shown++;});if(count)count.textContent=`(${selected.size} / ${boxes.length})`;if(visible)visible.textContent=num(shown);};
    boxes.forEach((box)=>box.addEventListener("change",apply));
    $("blog-author-all")?.addEventListener("click",()=>{boxes.forEach((box)=>box.checked=true);apply();});
    $("blog-author-none")?.addEventListener("click",()=>{boxes.forEach((box)=>box.checked=false);apply();});
    apply();
  }

  function sortableValue(cell, type) {
    const raw = cell?.dataset?.sortValue ?? cell?.textContent?.trim() ?? "";
    if (type === "number") { const n=Number(raw); return Number.isFinite(n)?n:Number.NEGATIVE_INFINITY; }
    if (type === "date") { const t=Date.parse(raw); return Number.isFinite(t)?t:Number.NEGATIVE_INFINITY; }
    return raw.toLocaleLowerCase("hu");
  }
  function applyCurrentTableSort(table) {
    if (!table || table.dataset.sortColumn === undefined) return;
    const index=Number(table.dataset.sortColumn), dir=table.dataset.sortDir||"desc", header=table.tHead?.rows?.[0]?.cells?.[index];
    if (!header) return;
    const type=header.dataset.sortType||"text", body=table.tBodies?.[0]; if(!body)return;
    const rows=[...body.rows];
    rows.sort((a,b)=>{const av=sortableValue(a.cells[index],type),bv=sortableValue(b.cells[index],type);let cmp=0;if(typeof av==="number"&&typeof bv==="number")cmp=av-bv;else cmp=String(av).localeCompare(String(bv),"hu",{numeric:true,sensitivity:"base"});return dir==="asc"?cmp:-cmp;});
    rows.forEach((row)=>body.appendChild(row));
  }
  function bindSortableTables(root=document) {
    root.querySelectorAll("table.sortable-table").forEach((table)=>{
      if(table.dataset.sortBound)return; table.dataset.sortBound="1";
      [...(table.tHead?.rows?.[0]?.cells||[])].forEach((th,index)=>{
        if(!th.dataset.sortType)return;
        th.setAttribute("role","button"); th.tabIndex=0;
        const activate=()=>{const same=Number(table.dataset.sortColumn)===index;const defaultDir=th.dataset.sortType==="text"?"asc":"desc";table.dataset.sortColumn=String(index);table.dataset.sortDir=same?(table.dataset.sortDir==="asc"?"desc":"asc"):defaultDir;table.querySelectorAll("th[data-sort-type]").forEach((x)=>delete x.dataset.sortDir);th.dataset.sortDir=table.dataset.sortDir;applyCurrentTableSort(table);};
        th.addEventListener("click",activate); th.addEventListener("keydown",(ev)=>{if(ev.key==="Enter"||ev.key===" "){ev.preventDefault();activate();}});
      });
    });
  }

  function renderAudienceTrendChart(source, canvasId, range=selectedRange()) {
    const history=snapshotSeries(source,SOURCE[source]?.audience||[],range), current=audience(source);
    const values=history.values.length?history.values:(current?[current]:[]), labels=history.labels.length?history.labels:(current?[dateHU(new Date())]:[]);
    if(!values.length)return;
    const lo=safeMin(values,0),hi=safeMax(values,0),padding=Math.max(1,Math.ceil((hi-lo)*.18));
    const noun=source==="youtube"?"Feliratkozók":"Követők";
    chart(canvasId,{type:"line",data:{labels,datasets:[{label:noun,data:values,borderColor:SOURCE[source].color,backgroundColor:`${SOURCE[source].color}18`,fill:true,tension:.28,pointRadius:values.length>30?0:3,pointHoverRadius:5,borderWidth:3}]},options:{responsive:true,maintainAspectRatio:false,interaction:{mode:"index",intersect:false},plugins:{legend:{display:false},tooltip:{callbacks:{label:(ctx)=>`${noun}: ${num(ctx.parsed.y)}`}}},scales:{x:{grid:{display:false},ticks:{maxTicksLimit:10}},y:{beginAtZero:false,suggestedMin:Math.max(0,lo-padding),suggestedMax:hi+padding,grid:{color:"rgba(16,45,49,.06)"},ticks:{precision:0}}}}});
  }

  function deterministicInsights() {
    const range=selectedRange(); const previous=previousRange(); const connected=ALL_SOURCES.filter((s)=>state.accounts.some((a)=>a.source===s)||state.content.some((c)=>c.source===s));
    const scored=connected.map((s)=>({s,value:sourceMetric(s,"exposure",range),prev:previous?sourceMetric(s,"exposure",previous):0})).filter((x)=>x.value>0).sort((a,b)=>b.value-a.value);
    const top=topContents(ALL_SOURCES,1,range)[0]; const insights=[];
    if(scored[0]) insights.push({title:`A legnagyobb aktivitást a ${sourceLabel(scored[0].s)} adta`,text:`Az időszakban ${num(scored[0].value)} ${primaryMetricLabel(scored[0].s)} volt a csatorna elsődleges teljesítménymutatója.`,type:"normal"});
    if(top) insights.push({title:"A legerősebb tartalom",text:`„${clampText(top.c.title,130)}” – ${num(top.s.exposure)} ${primaryMetricLabel(top.c.source)}, ${num(top.s.clicks)} kattintás és ${num(top.s.engagement)} interakció.`,type:"normal"});
    const errors=latestSync().filter((x)=>x.status==="error"); if(errors.length) insights.push({title:"Adatkapcsolati figyelmeztetés",text:`${errors.map((x)=>sourceLabel(x.source)).join(", ")} legutóbbi futása hibával zárult. Az eredmények emiatt hiányosak lehetnek.`,type:"warning"});
    const missing=OWN_SOURCES.filter((s)=>!connected.includes(s)); if(missing.length) insights.push({title:"Még bekötendő csatornák",text:missing.map(sourceLabel).join(", "),type:"warning"});
    if(!insights.length) insights.push({title:"Nincs még elegendő adat",text:"A WordPress, Mailchimp vagy Observer első sikeres futása után itt automatikus megállapítások jelennek meg.",type:"warning"});
    return insights;
  }
  function insightsHtml(items=deterministicInsights()) { return `<div class="insight-list">${items.map((i)=>`<div class="insight ${i.type||""}"><strong>${esc(i.title)}</strong><p>${esc(i.text)}</p></div>`).join("")}</div>`; }
  function latestSync() { const map=new Map(); [...state.syncRuns].sort((a,b)=>String(b.finished_at||b.started_at).localeCompare(String(a.finished_at||a.started_at))).forEach((r)=>{if(!map.has(r.source))map.set(r.source,r);}); return [...map.values()]; }

  function channelPage(source) {
    const pages = { blog:"blog", mailchimp:"newsletter", linkedin_company:"linkedin_company", facebook:"facebook", instagram:"instagram", youtube:"youtube", observer:"observer" };
    return pages[source] || "overview";
  }
  function contentNoun(source, count) {
    if (source === "blog") return `${num(count)} cikk`;
    if (source === "mailchimp") return `${num(count)} kampány`;
    if (source === "observer") return `${num(count)} médiatörténet`;
    if (source === "youtube") return `${num(count)} videó`;
    return `${num(count)} tartalom`;
  }
  function overviewChannelRows(range, previous) {
    return ALL_SOURCES.map((source) => {
      const value = sourceMetric(source,"exposure",range);
      const prev = previous ? sourceMetric(source,"exposure",previous) : 0;
      const items = contents([source],range).length;
      const change = previous ? delta(value,prev) : null;
      return { source, value, prev, items, change };
    }).filter((x)=>x.value>0 || x.items>0 || audience(x.source)>0);
  }
  function overviewBriefing(range, previous) {
    const ownItems = contents(OWN_SOURCES,range);
    const ownPrev = previous ? contents(OWN_SOURCES,previous) : [];
    const mediaItems = contents(["observer"],range);
    const mediaPrev = previous ? contents(["observer"],previous) : [];
    const rows = overviewChannelRows(range,previous);
    const ownRows = rows.filter((x)=>x.source!=="observer" && x.value>0);
    const movers = ownRows.filter((x)=>previous && x.prev>0).map((x)=>({...x,change:delta(x.value,x.prev)})).filter((x)=>Number.isFinite(x.change));
    const strongest = [...movers].sort((a,b)=>b.change-a.change)[0];
    const weakest = [...movers].sort((a,b)=>a.change-b.change)[0];
    const bestContent = topContents(OWN_SOURCES,1,range)[0];
    const highPriority = mediaItems.filter((c)=>Number(c.metadata?.priority||0)>=4);
    const syncErrors = latestSync().filter((x)=>x.status==="error");

    const happenedParts = [`${num(ownItems.length)} saját tartalom jelent meg`];
    if(mediaItems.length) happenedParts.push(`${num(mediaItems.length)} Observer-történet érkezett`);
    if(previous) happenedParts.push(`a saját publikációk száma ${deltaHtml(delta(ownItems.length,ownPrev.length))}`);

    let worked = "Még nincs elég összehasonlítható teljesítményadat a legerősebb eredmény kiemeléséhez.";
    if(bestContent) {
      const s=bestContent.s;
      worked = `A legerősebb tartalom: „${esc(clampText(bestContent.c.title,120))}” – ${num(s.exposure,true)} ${primaryMetricLabel(bestContent.c.source)}${s.engagement?`, ${num(s.engagement)} interakcióval`:""}.`;
      if(strongest && strongest.change>0) worked += ` Csatornaszinten a ${sourceLabel(strongest.source)} javult a legtöbbet (${deltaHtml(strongest.change)}).`;
    }

    let watch = "Nincs kiemelt adatkapcsolati vagy médiakockázati jelzés a kiválasztott időszakban.";
    if(highPriority.length) watch = `${num(highPriority.length)} magas prioritású Observer-történet látható az időszakban; ezeket érdemes elsőként átnézni.`;
    else if(syncErrors.length) watch = `${syncErrors.map((x)=>sourceLabel(x.source)).join(", ")} legutóbbi adatgyűjtése hibával zárult, ezért az összkép hiányos lehet.`;
    else if(weakest && weakest.change<-.05) watch = `A legnagyobb visszaesés a ${sourceLabel(weakest.source)} csatornán látszik (${deltaHtml(weakest.change)} az előző azonos időszakhoz képest).`;

    return { happened:happenedParts.join(" · "), worked, watch };
  }
  function briefingCard(kind,title,text) {
    const icon = kind==="worked" ? "↗" : kind==="watch" ? "!" : "●";
    return `<article class="briefing-card ${kind}"><div class="briefing-icon">${icon}</div><div><p class="eyebrow">${esc(title)}</p><p>${text}</p></div></article>`;
  }
  function overviewStoryCards(range) {
    const clusters=storyClusters().map((x)=>{const items=x.items.filter((i)=>inRange(i.published_at,range));const stats=items.map(contentStats);return {...x,items,exposure:stats.reduce((sum,v)=>sum+v.exposure,0),engagement:stats.reduce((sum,v)=>sum+v.engagement,0)};}).filter((x)=>x.items.length>1).sort((a,b)=>b.exposure-a.exposure).slice(0,3);
    if(clusters.length) return clusters.map((x)=>`<article class="overview-story-card"><div class="overview-story-top"><div><p class="eyebrow">TÖBB CSATORNÁN</p><h3>${esc(clampText(x.items[0]?.title||x.seed.title,90))}</h3></div><span class="story-count">${num(x.items.length)}</span></div><div class="story-meta">${[...new Set(x.items.map((i)=>i.source))].map((s)=>`<span class="story-channel">${esc(SOURCE[s]?.short||s)}</span>`).join("")}</div><div class="overview-story-metrics"><span><strong>${num(x.exposure,true)}</strong> platformeredmény</span><span><strong>${num(x.engagement)}</strong> interakció</span></div></article>`).join("");
    const fallback=topContents(OWN_SOURCES,3,range);
    return fallback.map((x)=>`<article class="overview-story-card"><div class="overview-story-top"><div><p class="eyebrow">${esc(sourceLabel(x.c.source).toUpperCase())}</p><h3>${esc(clampText(x.c.title,90))}</h3></div></div><div class="overview-story-metrics"><span><strong>${num(x.s.exposure,true)}</strong> ${esc(primaryMetricLabel(x.c.source))}</span><span><strong>${num(x.s.engagement)}</strong> interakció</span></div></article>`).join("") || `<div class="empty-state">Még nincs elég tartalom a kiemeléshez.</div>`;
  }
  function renderOverview() {
    const r=selectedRange(), p=previousRange();
    const briefing=overviewBriefing(r,p);
    const channelRows=overviewChannelRows(r,p);
    pageContent.innerHTML=`
      <section class="executive-briefing">
        <div class="section-title overview-section-title"><div><p class="eyebrow">VEZETŐI BRIEFING</p><h2>Mi a fontos most?</h2></div><span class="panel-note">${esc(rangeLabel())}</span></div>
        <div class="briefing-grid">
          ${briefingCard("happened","MI TÖRTÉNT?",briefing.happened)}
          ${briefingCard("worked","MI MŰKÖDÖTT?",briefing.worked)}
          ${briefingCard("watch","MIRE FIGYELJÜNK?",briefing.watch)}
        </div>
      </section>
      <section class="overview-grid">
        <article class="panel overview-channels-panel">
          <div class="panel-heading"><div><p class="eyebrow">CSATORNÁK ÉS MÉDIA</p><h2>Egy pillantásra</h2></div><span class="panel-note">kattints a részletekhez</span></div>
          <div class="overview-channel-list">${channelRows.map((x)=>`<button class="overview-channel-row" data-nav-page="${channelPage(x.source)}"><span class="channel-dot" style="background:${SOURCE[x.source].color}"></span><span class="overview-channel-name"><strong>${esc(sourceLabel(x.source))}</strong><small>${esc(contentNoun(x.source,x.items))}</small></span><span class="overview-channel-value"><strong>${num(x.value,true)}</strong><small>${esc(primaryMetricLabel(x.source))}</small></span><span class="overview-channel-delta">${p?deltaHtml(x.change):'<span class="delta neutral">–</span>'}</span><span class="overview-channel-arrow">›</span></button>`).join("")||`<div class="empty-state">Még nincs csatornaadat.</div>`}</div>
        </article>
        <article class="panel overview-stories-panel">
          <div class="panel-heading"><div><p class="eyebrow">KIEMELT TARTALMAK</p><h2>Legerősebb sztorik</h2></div><button class="text-button" data-nav-page="stories">Sztorik és elemzés →</button></div>
          <div class="overview-story-list">${overviewStoryCards(r)}</div>
          <p class="metric-definition">A jelenlegi sztoricsoportosítás szabályalapú. A következő AI-fázis szemantikus összekapcsolással és Observer-adatokkal pontosítja.</p>
        </article>
      </section>`;
    pageContent.querySelectorAll("[data-nav-page]").forEach((el)=>el.addEventListener("click",()=>navigate(el.dataset.navPage)));
  }

  function campaignRows(range=selectedRange()) { return contents(["mailchimp"],range).map((c)=>({c,s:contentStats(c),m:c.metadata||{}})).sort((a,b)=>String(b.c.published_at).localeCompare(String(a.c.published_at))); }
  function newsletterAudienceChangeFromCampaigns(range=selectedRange()) {
    const campaigns=state.content
      .filter((c)=>c.source==="mailchimp" && c.published_at)
      .map((c)=>({c,date:new Date(c.published_at),sent:contentMetric(c,["emails_sent"])}))
      .filter((x)=>!Number.isNaN(x.date.getTime()) && x.date<=range.end && x.sent>0)
      .sort((a,b)=>a.date-b.date);
    if(!campaigns.length)return null;
    const end=campaigns[campaigns.length-1];
    if(!range.start){
      const start=campaigns[0];
      return {value:end.sent-start.sent,start:start.sent,end:end.sent,startDate:start.date,endDate:end.date,note:"az első elérhető kampányhoz képest"};
    }
    const beforeStart=campaigns.filter((x)=>x.date<range.start).pop();
    const firstInRange=campaigns.find((x)=>x.date>=range.start);
    const start=beforeStart||firstInRange;
    if(!start)return null;
    return {value:end.sent-start.sent,start:start.sent,end:end.sent,startDate:start.date,endDate:end.date,note:beforeStart?"az időszak elejéhez képest":"az első időszaki kampányhoz képest"};
  }
  function renderNewsletter() {
    const r=selectedRange(), p=previousRange(), rows=campaignRows(r), prevRows=p?campaignRows(p):[];
    const metricSum=(items,name)=>items.reduce((sum,item)=>sum+contentMetric(item.c,[name]),0);
    const sent=metricSum(rows,"emails_sent"), delivered=metricSum(rows,"delivered"), opens=metricSum(rows,"unique_opens"), clicks=metricSum(rows,"unique_clicks");
    const pSent=metricSum(prevRows,"emails_sent"), pDelivered=metricSum(prevRows,"delivered"), pOpens=metricSum(prevRows,"unique_opens"), pClicks=metricSum(prevRows,"unique_clicks");
    const deliveryRate=sent?delivered/sent:0, openRate=delivered?opens/delivered:0, clickRate=delivered?clicks/delivered:0;
    const pDeliveryRate=pSent?pDelivered/pSent:0, pOpenRate=pDelivered?pOpens/pDelivered:0, pClickRate=pDelivered?pClicks/pDelivered:0;
    const audienceNow=audience("mailchimp"), previousAudience=p?audienceAtEnd("mailchimp",p):0, audienceChange=newsletterAudienceChangeFromCampaigns(r);
    const audienceGrowth=audienceChange?.value??null;
    const audienceGrowthNote=audienceChange?.note||"nincs használható kampányadat";
    pageContent.innerHTML=`<section class="kpi-grid">
      ${kpi("Aktuális feliratkozók",num(audienceNow),"Mailchimp listaállomány",p&&previousAudience?delta(audienceNow,previousAudience):undefined)}
      ${kpi("Feliratkozók változása",audienceGrowth===null?"–":`${audienceGrowth>0?"+":""}${num(audienceGrowth)}`,audienceGrowthNote)}
      ${kpi("Kiküldve",num(sent),`${num(rows.length)} kampány`,p?delta(sent,pSent):undefined)}
      ${kpi("Kézbesítve",num(delivered),sent?`${pct(deliveryRate)} kézbesítési arány`:"–",p?delta(delivered,pDelivered):undefined)}
      ${kpi("Egyedi megnyitók",num(opens),"legalább egyszer megnyitó címzettek",p?delta(opens,pOpens):undefined)}
      ${kpi("Egyedi kattintók",num(clicks),"legalább egyszer kattintó címzettek",p?delta(clicks,pClicks):undefined)}
      ${kpi("Megnyitási arány",delivered?pct(openRate):"–","egyedi megnyitók / kézbesített",p&&pOpenRate?delta(openRate,pOpenRate):undefined)}
      ${kpi("Átkattintási arány",delivered?pct(clickRate):"–","egyedi kattintók / kézbesített",p&&pClickRate?delta(clickRate,pClickRate):undefined)}
    </section>
    <div class="callout"><strong>A kiküldés nem elérés.</strong><p>A címzetti mennyiséget külön kezeljük; a tényleges teljesítményt az egyedi megnyitók, kattintók és azok arányai mutatják.</p></div>
    <section class="grid-2 equal" style="margin-top:15px"><article class="panel"><div class="panel-heading"><div><p class="eyebrow">KIKÜLDÉS</p><h2>Kiküldött levelek</h2></div><span class="panel-note">kampányonkénti címzetti darabszám</span></div><div class="chart-wrap"><canvas id="mail-volume-chart"></canvas></div></article>
    <article class="panel"><div class="panel-heading"><div><p class="eyebrow">KAMPÁNYTREND</p><h2>Megnyitási és átkattintási arány</h2></div><span class="panel-note">egyedi címzettek / kézbesített levelek</span></div><div class="chart-wrap"><canvas id="mail-rate-chart"></canvas></div></article></section>
    <article class="panel"><div class="panel-heading"><div><p class="eyebrow">HAVI KIMUTATÁS</p><h2>Hírlevél-statisztika</h2></div><span class="panel-note">${num(rows.length)} kampány · oszlopfejlécre kattintva rendezhető</span></div><div class="table-wrap"><table id="newsletter-table" class="sortable-table"><thead><tr><th data-sort-type="date">Dátum</th><th data-sort-type="text">Cím</th><th class="num" data-sort-type="number">Kiküldve</th><th class="num" data-sort-type="number">Kézbesítve</th><th class="num" data-sort-type="number">Egyedi megnyitók</th><th class="num" data-sort-type="number">Egyedi kattintók</th><th class="num" data-sort-type="number">Visszapattanás</th><th class="num" data-sort-type="number">Leiratkozás</th><th>Legtöbbet kattintott link</th><th>Legsikeresebb Grandio-cikk</th></tr></thead><tbody>${rows.length?rows.map(({c,m})=>{
      const campaignSent=contentMetric(c,["emails_sent"]), campaignDelivered=contentMetric(c,["delivered"]), campaignOpens=contentMetric(c,["unique_opens"]), campaignClicks=contentMetric(c,["unique_clicks"]), campaignUnsub=contentMetric(c,["unsubscribes"]), campaignHard=contentMetric(c,["hard_bounces"]), campaignSoft=contentMetric(c,["soft_bounces"]), campaignBounce=campaignHard+campaignSoft;
      return `<tr><td data-sort-value="${esc(c.published_at||"")}">${dateHU(c.published_at)}</td><td data-sort-value="${esc(c.title||"")}"><a class="content-link" data-content="mailchimp|${esc(c.external_id)}" href="#">${esc(c.title)}</a></td><td class="num" data-sort-value="${campaignSent}">${num(campaignSent)}</td><td class="num" data-sort-value="${campaignDelivered}">${num(campaignDelivered)}<div class="metric-definition">${campaignSent?pct(campaignDelivered/campaignSent):"–"}</div></td><td class="num" data-sort-value="${campaignOpens}">${num(campaignOpens)}<div class="metric-definition">${campaignDelivered?pct(campaignOpens/campaignDelivered):"–"}</div></td><td class="num" data-sort-value="${campaignClicks}">${num(campaignClicks)}<div class="metric-definition">${campaignDelivered?pct(campaignClicks/campaignDelivered):"–"}</div></td><td class="num" data-sort-value="${campaignBounce}">${num(campaignBounce)}<div class="metric-definition">${campaignSent?pct(campaignBounce/campaignSent):"–"} · ${num(campaignHard)} hard / ${num(campaignSoft)} soft</div></td><td class="num" data-sort-value="${campaignUnsub}">${num(campaignUnsub)}<div class="metric-definition">${campaignDelivered?pct(campaignUnsub/campaignDelivered):"–"}</div></td><td>${m.top_link_url?`<a class="content-link" target="_blank" rel="noopener" href="${esc(m.top_link_url)}">${esc(clampText(m.top_link_url,55))}</a><div class="metric-definition">${num(m.top_link_unique_clicks||m.top_link_clicks)} egyedi kattintó</div>`:"–"}</td><td>${m.top_grandio_url?`<a class="content-link" target="_blank" rel="noopener" href="${esc(m.top_grandio_url)}">${esc(clampText(m.top_grandio_url,55))}</a><div class="metric-definition">${num(m.top_grandio_unique_clicks||m.top_grandio_clicks)} egyedi kattintó</div>`:"–"}</td></tr>`;
    }).join(""):`<tr><td colspan="10"><div class="empty-state"><strong>Nincs kampány ebben az időszakban.</strong></div></td></tr>`}</tbody></table></div></article>`;
    const chronological=[...rows].reverse(), sentValues=chronological.map((x)=>contentMetric(x.c,["emails_sent"]));
    const sentMin=safeMin(sentValues,0), sentMax=safeMax(sentValues,0), sentPad=Math.max(10,Math.ceil((sentMax-sentMin)*.18),Math.ceil(sentMax*.025));
    chart("mail-volume-chart",{type:"line",data:{labels:chronological.map((x)=>dateHU(x.c.published_at)),datasets:[{label:"Kiküldve",data:sentValues,borderColor:"#2de68c",backgroundColor:"rgba(45,230,140,.10)",fill:true,tension:.3,pointRadius:sentValues.length>35?0:3,pointHoverRadius:5,borderWidth:3}]},options:{responsive:true,maintainAspectRatio:false,interaction:{mode:"index",intersect:false},plugins:{legend:{display:false},tooltip:{callbacks:{label:(ctx)=>`Kiküldve: ${num(ctx.parsed.y)}`}}},scales:{x:{grid:{display:false},ticks:{maxTicksLimit:10}},y:{beginAtZero:false,suggestedMin:Math.max(0,sentMin-sentPad),suggestedMax:sentMax+sentPad,grid:{color:"rgba(16,45,49,.06)"},ticks:{precision:0}}}}});
    chart("mail-rate-chart",{type:"line",data:{labels:chronological.map((x)=>dateHU(x.c.published_at)),datasets:[{label:"Megnyitási arány",data:chronological.map((x)=>{const d=contentMetric(x.c,["delivered"]),o=contentMetric(x.c,["unique_opens"]);return d?o/d*100:0;}),borderColor:"#13707d",backgroundColor:"transparent",tension:.3},{label:"Átkattintási arány",data:chronological.map((x)=>{const d=contentMetric(x.c,["delivered"]),c=contentMetric(x.c,["unique_clicks"]);return d?c/d*100:0;}),borderColor:"#2de68c",backgroundColor:"transparent",tension:.3}]},options:{responsive:true,maintainAspectRatio:false,interaction:{mode:"index",intersect:false},plugins:{legend:{display:true,position:"bottom"}},scales:{x:{grid:{display:false}},y:{beginAtZero:true,ticks:{callback:(v)=>`${v}%`},grid:{color:"rgba(16,45,49,.06)"}}}}});
  }

  function renderBlog() {
    const r=selectedRange(),p=previousRange();
    const views=sourceMetric("blog","exposure",r),sessions=accountMetricTotal("blog",["web_sessions"],r),users=accountMetricTotal("blog",["web_users"],r),engaged=accountMetricTotal("blog",["web_engaged_sessions"],r),seconds=accountMetricTotal("blog",["web_engagement_seconds"],r),pub=contents(["blog"],r).length;
    const prevViews=p?sourceMetric("blog","exposure",p):0,prevSessions=p?accountMetricTotal("blog",["web_sessions"],p):0,prevUsers=p?accountMetricTotal("blog",["web_users"],p):0,prevEngaged=p?accountMetricTotal("blog",["web_engaged_sessions"],p):0,prevSeconds=p?accountMetricTotal("blog",["web_engagement_seconds"],p):0;
    const avgEngagement=users?seconds/users:0,prevAvgEngagement=prevUsers?prevSeconds/prevUsers:0,items=scoredContents(["blog"],r);
    pageContent.innerHTML=`<section class="kpi-grid five">${kpi("Oldalmegtekintések",num(views),"GA4",p?delta(views,prevViews):undefined)}${kpi("Munkamenetek",num(sessions),"GA4",p?delta(sessions,prevSessions):undefined)}${kpi("Felhasználók",num(users),"aktív felhasználók",p?delta(users,prevUsers):undefined)}${kpi("Elkötelezett munkamenetek",num(engaged),sessions?pct(engaged/sessions):"–",p?delta(engaged,prevEngaged):undefined)}${kpi("Átlagos engagement",users?`${num(avgEngagement)} mp`:"–","felhasználónként",p&&prevAvgEngagement?delta(avgEngagement,prevAvgEngagement):undefined)}</section>
    <section class="grid-2"><article class="panel"><div class="panel-heading"><div><p class="eyebrow">FORGALMI TREND</p><h2>Blogmegtekintések</h2></div><span class="panel-note">napi érték + 7 és 28 napos mozgóátlag</span></div><div class="chart-wrap"><canvas id="blog-trend"></canvas></div></article><article class="panel"><div class="panel-heading"><div><p class="eyebrow">SZERZŐK</p><h2>Teljesítmény szerzőnként</h2></div><span class="panel-note">a Grandio Blogon megjelenő szerzőnév alapján</span></div><div id="author-rank" class="rank-list author-rank-scroll"></div></article></section>
    ${contentTable(items,"Összes Grandio-cikk",{showClicks:false,showAuthor:true,authorFilter:true})}`;
    const series=seriesWithMovingAverages((range)=>dailySeries("blog","exposure",range),r,[7,28]); lineChart("blog-trend",series.labels,[{label:"Megtekintések",data:series.values,borderColor:"rgba(10,75,85,.3)",backgroundColor:"rgba(10,75,85,.06)",fill:true,pointRadius:0},{label:"7 napos átlag",data:series.averages[7],borderColor:"#0a4b55",pointRadius:0,tension:.25,borderWidth:2},{label:"28 napos átlag",data:series.averages[28],borderColor:"#2de68c",pointRadius:0,tension:.25,borderWidth:2}]);
    const authors={}; contents(["blog"],r).forEach((c)=>{const a=c.author||"Nincs szerzőadat";authors[a]??={count:0,views:0};authors[a].count++;authors[a].views+=contentMetric(c,["web_views"]);});
    const ar=Object.entries(authors).map(([name,v])=>({name,...v})).sort((a,b)=>b.views-a.views),max=safeMax(ar.map((x)=>x.views),1)||1;
    $("author-rank").innerHTML=ar.map((x,i)=>`<div class="rank-row"><span class="rank-index">${i+1}</span><div class="rank-title">${esc(x.name)}<small>${num(x.count)} cikk · ${num(x.count?x.views/x.count:0)} átlagos megtekintés</small><div class="progress"><span style="width:${x.views/max*100}%"></span></div></div><span class="rank-value">${num(x.views)}</span></div>`).join("")||`<div class="empty-state">Még nincs szerzőhöz kapcsolható forgalmi adat.</div>`;
    bindBlogAuthorFilter();
  }

  function renderLinkedInCompany() {
    const source="linkedin_company",r=selectedRange(),p=previousRange();
    const connected=state.accounts.some((a)=>a.source===source)||state.content.some((c)=>c.source===source);
    const impressions=accountMetricTotal(source,["impressions"],r), clicks=accountMetricTotal(source,["clicks"],r), reactions=accountMetricTotal(source,["reactions"],r), comments=accountMetricTotal(source,["comments"],r), shares=accountMetricTotal(source,["shares"],r), interactions=reactions+comments+shares;
    const followersNow=audience(source), followersGained=accountMetricTotal(source,["followers_gained"],r), pageViews=accountMetricTotal(source,["page_views"],r), uniqueVisitors=accountMetricTotal(source,["unique_visitors"],r);
    const prevImpressions=p?accountMetricTotal(source,["impressions"],p):0, prevClicks=p?accountMetricTotal(source,["clicks"],p):0, prevInteractions=p?(accountMetricTotal(source,["reactions"],p)+accountMetricTotal(source,["comments"],p)+accountMetricTotal(source,["shares"],p)):0, prevFollowersGained=p?accountMetricTotal(source,["followers_gained"],p):0, prevVisitors=p?accountMetricTotal(source,["unique_visitors"],p):0, prevAudience=p?audienceAtEnd(source,p):0;
    const ctr=impressions?clicks/impressions:0, interactionRate=impressions?interactions/impressions:0, items=scoredContents([source],r);
    pageContent.innerHTML=`${!connected?`<div class="callout"><strong>Még nincs LinkedIn-adat.</strong><p>Töltsd fel a LinkedIn Content, Followers és Visitors XLS exportokat a privát collector repositoryba.</p></div>`:`<div class="callout"><strong>LinkedIn XLS-adatok betöltve.</strong><p>Ez a csatorna mostantól a hivatalos LinkedIn Content, Followers és Visitors XLS exportokra épül.</p></div>`}
    <section class="kpi-grid six" style="margin-top:15px">${kpi("Megjelenések",num(impressions,true),`CTR: ${pct(ctr)}`,p?delta(impressions,prevImpressions):undefined)}${kpi("Kattintások",num(clicks,true),"LinkedIn-posztokra kattintás",p?delta(clicks,prevClicks):undefined)}${kpi("Interakciók",num(interactions,true),`interakciós arány: ${pct(interactionRate)}`,p?delta(interactions,prevInteractions):undefined)}${kpi("Követők",followersNow?num(followersNow,true):"–",followersNow?"aktuális exportált állomány":"még nincs követő-snapshot",p&&prevAudience?delta(followersNow,prevAudience):undefined)}${kpi("Új követők",num(followersGained,true),rangeLabel(),p?delta(followersGained,prevFollowersGained):undefined)}${kpi("Egyedi oldallátogatók",num(uniqueVisitors,true),`${num(pageViews,true)} oldalmegtekintés`,p?delta(uniqueVisitors,prevVisitors):undefined)}</section>
    <section class="grid-2" style="margin-top:15px"><article class="panel"><div class="panel-heading"><div><p class="eyebrow">KÖVETŐNÖVEKEDÉS</p><h2>Új követők alakulása</h2></div><span class="panel-note">napi új követők + 28 napos átlag</span></div><div class="chart-wrap"><canvas id="linkedin-followers-chart"></canvas></div></article><article class="panel"><div class="panel-heading"><div><p class="eyebrow">OLDALLÁTOGATOTTSÁG</p><h2>LinkedIn-oldal látogatói</h2></div><span class="panel-note">oldalmegtekintések és egyedi látogatók</span></div><div class="chart-wrap"><canvas id="linkedin-visitors-chart"></canvas></div></article></section>
    <article class="panel"><div class="panel-heading"><div><p class="eyebrow">TARTALMI TELJESÍTMÉNY</p><h2>Megjelenések és kattintások</h2></div><span class="panel-note">napi organikus + szponzorált összesen</span></div><div class="chart-wrap"><canvas id="linkedin-performance-chart"></canvas></div></article>${contentTable(items,"LinkedIn – összes poszt")}`;
    const followerSeries=seriesWithMovingAverages((range)=>accountFlowSeries(source,["followers_gained"],range),r,[28]); chart("linkedin-followers-chart",{type:"bar",data:{labels:followerSeries.labels,datasets:[{type:"bar",label:"Új követők",data:followerSeries.values,backgroundColor:"rgba(40,103,178,.28)",borderColor:"#2867b2",borderWidth:1,borderRadius:5},{type:"line",label:"28 napos átlag",data:followerSeries.averages[28],borderColor:"#2de68c",backgroundColor:"transparent",pointRadius:0,tension:.3,borderWidth:2}]},options:{responsive:true,maintainAspectRatio:false,interaction:{mode:"index",intersect:false},plugins:{legend:{display:true,position:"bottom"}},scales:{x:{grid:{display:false},ticks:{maxTicksLimit:10}},y:{beginAtZero:true,grid:{color:"rgba(16,45,49,.06)"},ticks:{precision:0}}}}});
    const visitorSeries=accountFlowSeries(source,["unique_visitors"],r), pageViewSeries=accountFlowSeries(source,["page_views"],r); lineChart("linkedin-visitors-chart",visitorSeries.labels,[{label:"Egyedi látogatók",data:visitorSeries.values,borderColor:"#2867b2",backgroundColor:"rgba(40,103,178,.08)",fill:true,pointRadius:0,tension:.25},{label:"Oldalmegtekintések",data:pageViewSeries.values,borderColor:"#2de68c",backgroundColor:"transparent",pointRadius:0,tension:.25}]);
    const impressionSeries=accountFlowSeries(source,["impressions"],r), clickSeries=accountFlowSeries(source,["clicks"],r); lineChart("linkedin-performance-chart",impressionSeries.labels,[{label:"Megjelenések",data:impressionSeries.values,borderColor:"#2867b2",backgroundColor:"rgba(40,103,178,.08)",fill:true,pointRadius:0,tension:.25},{label:"Kattintások",data:clickSeries.values,borderColor:"#2de68c",backgroundColor:"transparent",pointRadius:0,tension:.25}]);
  }

  function platformConfig(source) {
    const configs={
      linkedin_company:{cards:[["Megjelenések","exposure"],["Kattintások","clicks"],["Interakciók","engagement"],["Követők","audience"],["Új követők","followers_gained"],["Publikált posztok","publishing"]],note:"A vállalati oldal natív statisztikái."},
      facebook:{cards:[["Megtekintések","exposure"],["Kattintások","clicks"],["Interakciók","engagement"],["Követők","audience"],["Megosztások","shares"],["Publikált posztok","publishing"]],note:"Facebook-oldal és posztstatisztikák."},
      instagram:{cards:[["Megtekintések","exposure"],["Elérés","reach"],["Interakciók","engagement"],["Követők","audience"],["Mentések","saved"],["Publikált tartalmak","publishing"]],note:"Instagram üzleti fiók statisztikái."},
      youtube:{cards:[["Megtekintések","exposure"],["Nézési idő","watch_minutes"],["Interakciók","engagement"],["Feliratkozók","audience"],["Új feliratkozók","subscribers_gained"],["Publikált videók","publishing"]],note:"YouTube Analytics és csatornastatisztikák."},
    }; return configs[source];
  }
  function customMetric(source,name,range=selectedRange()) { if(name==="audience")return audience(source);if(["exposure","clicks","engagement","publishing"].includes(name))return sourceMetric(source,name,range);const account=accountMetricTotal(source,[name],range);if(account)return account;return contents([source],range).reduce((s,c)=>s+contentMetric(c,[name]),0); }
  function renderPlatform(source) {
    if(source==="linkedin_company"){renderLinkedInCompany();return;}
    const pc=platformConfig(source),r=selectedRange(),p=previousRange(),connected=state.accounts.some((a)=>a.source===source)||state.content.some((c)=>c.source===source),items=scoredContents([source],r);
    const showFormats=source==="instagram";
    const cards=pc.cards.map(([label,key])=>{
      const value=key==="audience"?audience(source):customMetric(source,key,r);
      const prev=key==="audience"?(p?audienceAtEnd(source,p):0):(p?customMetric(source,key,p):0);
      const formatted=key==="watch_minutes"?`${num(value)} perc`:num(value,true);
      return kpi(label,formatted,pc.note,p&&prev?delta(value,prev):(p&&key!=="audience"?delta(value,prev):undefined));
    }).join("");
    const trendPanel=`<article class="panel"><div class="panel-heading"><div><p class="eyebrow">TELJESÍTMÉNYTREND</p><h2>${esc(SOURCE[source].short)} – fő mutató</h2></div><span class="panel-note">napi érték + mozgóátlagok</span></div><div class="chart-wrap"><canvas id="platform-trend"></canvas></div></article>`;
    const formatPanel=showFormats?`<article class="panel"><div class="panel-heading"><div><p class="eyebrow">FORMÁTUMOK</p><h2>Tartalomtípusok eredménye</h2></div></div><div id="format-rank" class="rank-list"></div></article>`:"";
    pageContent.innerHTML=`${!connected?`<div class="callout"><strong>Ez a csatorna még nincs bekötve.</strong><p>Az adatkapcsolat beállítása után az adatok automatikusan megjelennek.</p></div>`:""}<section class="kpi-grid six" style="margin-top:${connected?0:15}px">${cards}</section>${showFormats?`<section class="grid-2" style="margin-top:15px">${trendPanel}${formatPanel}</section>`:`<div style="margin-top:15px;margin-bottom:15px">${trendPanel}</div>`}${contentTable(items,`${SOURCE[source].label} – összes tartalom`,{showClicks:source!=="instagram"})}`;
    const series=seriesWithMovingAverages((range)=>dailySeries(source,"exposure",range),r,[7,28]); lineChart("platform-trend",series.labels,[{label:"Napi érték",data:series.values,borderColor:`${SOURCE[source].color}55`,backgroundColor:`${SOURCE[source].color}12`,fill:true,pointRadius:0},{label:"7 napos átlag",data:series.averages[7],borderColor:SOURCE[source].color,pointRadius:0,tension:.25},{label:"28 napos átlag",data:series.averages[28],borderColor:"#2de68c",pointRadius:0,tension:.25}]);
    if(showFormats){const formats={}; contents([source],r).forEach((c)=>{const f=(c.content_type||"tartalom").toLowerCase();formats[f]??={count:0,exp:0};formats[f].count++;formats[f].exp+=contentStats(c).exposure;}); const rows=Object.entries(formats).map(([name,x])=>({name,...x})).sort((a,b)=>b.exp-a.exp),max=safeMax(rows.map((x)=>x.exp),1)||1; $("format-rank").innerHTML=rows.map((x,i)=>`<div class="rank-row"><span class="rank-index">${i+1}</span><div class="rank-title">${esc(x.name)}<small>${num(x.count)} tartalom</small><div class="progress"><span style="width:${x.exp/max*100}%"></span></div></div><span class="rank-value">${num(x.exp,true)}</span></div>`).join("")||`<div class="empty-state">Még nincs formátumadat.</div>`;}
  }

  function renderContentExplorer() {
    pageContent.innerHTML=`<article class="panel"><div class="panel-heading"><div><p class="eyebrow">KERESÉS ÉS SZŰRÉS</p><h2>Minden tartalom</h2></div><div class="table-tools"><input id="content-search" type="search" placeholder="Keresés címben, szerzőben…"><select id="content-source"><option value="all">Minden csatorna</option>${ALL_SOURCES.map((s)=>`<option value="${s}">${SOURCE[s].label}</option>`).join("")}</select><select id="content-sort"><option value="date">Legfrissebb</option><option value="exposure">Legnagyobb elsődleges eredmény</option><option value="clicks">Legtöbb kattintás</option><option value="engagement">Legtöbb interakció</option></select></div></div><div class="table-wrap"><table id="explorer-table" class="sortable-table"><thead><tr><th data-sort-type="text">Tartalom</th><th data-sort-type="text">Csatorna</th><th data-sort-type="text">Típus</th><th data-sort-type="date">Dátum</th><th class="num" data-sort-type="number">Elsődleges eredmény</th><th class="num" data-sort-type="number">Kattintás</th><th class="num" data-sort-type="number">Interakció</th></tr></thead><tbody id="explorer-body"></tbody></table></div><p id="explorer-count" class="metric-definition"></p></article>`;
    const update=()=>{const q=$("content-search").value.trim().toLocaleLowerCase("hu"),src=$("content-source").value,sort=$("content-sort").value;let items=contents(src==="all"?ALL_SOURCES:[src]).filter((c)=>!q||`${c.title} ${c.author} ${c.body}`.toLocaleLowerCase("hu").includes(q)).map((c)=>({c,s:contentStats(c)}));items.sort((a,b)=>sort==="date"?String(b.c.published_at).localeCompare(String(a.c.published_at)):b.s[sort]-a.s[sort]);
      $("explorer-body").innerHTML=items.map(({c,s})=>`<tr><td data-sort-value="${esc(c.title||"")}"><a href="#" class="content-link" data-content="${esc(c.source)}|${esc(c.external_id)}">${esc(clampText(c.title,95))}</a><div class="metric-definition">${esc(c.author||"")}</div></td><td data-sort-value="${esc(sourceLabel(c.source))}">${sourceBadge(c.source)}</td><td data-sort-value="${esc(c.content_type||"tartalom")}">${esc(c.content_type||"tartalom")}</td><td data-sort-value="${esc(c.published_at||"")}">${dateHU(c.published_at)}</td><td class="num" data-sort-value="${Number(s.exposure||0)}">${num(s.exposure)}<div class="metric-definition">${esc(primaryMetricLabel(c.source))}</div></td><td class="num" data-sort-value="${Number(s.clicks||0)}">${num(s.clicks)}</td><td class="num" data-sort-value="${Number(s.engagement||0)}">${num(s.engagement)}</td></tr>`).join("")||`<tr><td colspan="7"><div class="empty-state">Nincs megfelelő találat.</div></td></tr>`;
      $("explorer-count").textContent=`${num(items.length)} találat · minden találat megjelenítve`;bindContentLinks();applyCurrentTableSort($("explorer-table"));};
    [$("content-search"),$("content-source"),$("content-sort")].forEach((el)=>el.addEventListener(el.tagName==="INPUT"?"input":"change",update));update();
  }

  const STOP=new Set("a az egy és vagy de hogy is itt ott nem igen mi mit mire ezt azt van volt lesz for from the with this that into your our their egyéb így ahol amely amikor mint már még után előtt közben".split(" "));
  function tokens(text){return [...new Set(String(text||"").toLocaleLowerCase("hu").normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9áéíóöőúüű ]/gi," ").split(/\s+/).filter((x)=>x.length>3&&!STOP.has(x)))];}
  function similarity(a,b){const A=new Set(tokens(a)),B=new Set(tokens(b));if(!A.size||!B.size)return 0;let inter=0;A.forEach((x)=>{if(B.has(x))inter++;});return inter/Math.min(A.size,B.size);}
  function topicFor(c){const text=`${c.title} ${c.body}`.toLocaleLowerCase("hu");const tests=[["Ingatlan",/ingatlan|iroda|bevásárló|retail|lakás|épület|bérlő/],["Makrogazdaság",/infláció|kamat|forint|gdp|gazdaság|munkaerő|mnb|jegybank/],["Mesterséges intelligencia",/mesterséges intelligencia|\bai\b|chip|nvidia|tsmc/],["Befektetési alapok",/befektetési alap|hozam|portfólió|kötvény|részvény/],["Nemzetközi piacok",/amerika|európa|kína|románia|szerbia|belgrád|bukarest/],["Vállalati hírek",/gránit|alapkezelő|díj|kinevez|irodanyitás/],["ESG",/esg|fenntartható|zöld|klíma/]];return tests.find(([,re])=>re.test(text))?.[0]||c.metadata?.category_names?.[0]||"Egyéb";}
  function storyClusters() {
    const all=contents(OWN_SOURCES).sort((a,b)=>String(b.published_at).localeCompare(String(a.published_at)));const clusters=[];
    all.forEach((c)=>{const d=new Date(c.published_at);let best=null,bestScore=.25;for(const cluster of clusters){const sd=new Date(cluster.seed.published_at);if(Math.abs(d-sd)>21*86400000)continue;const score=similarity(c.title+" "+c.body,cluster.seed.title+" "+cluster.seed.body);if(score>bestScore){best=cluster;bestScore=score;}}if(best)best.items.push(c);else clusters.push({seed:c,items:[c]});});
    const multi=clusters.filter((x)=>x.items.length>1).map((x)=>{const stats=x.items.map(contentStats);return {...x,exposure:stats.reduce((s,v)=>s+v.exposure,0),clicks:stats.reduce((s,v)=>s+v.clicks,0),engagement:stats.reduce((s,v)=>s+v.engagement,0)};}).sort((a,b)=>(b.exposure+b.clicks*4)-(a.exposure+a.clicks*4));return multi;
  }
  function renderStories(){const clusters=storyClusters();const topics={};contents(OWN_SOURCES).forEach((c)=>{const t=topicFor(c);topics[t]??={count:0,exp:0,clicks:0};const s=contentStats(c);topics[t].count++;topics[t].exp+=s.exposure;topics[t].clicks+=s.clicks;});const topicRows=Object.entries(topics).map(([name,v])=>({name,...v})).sort((a,b)=>b.exp-a.exp);
    pageContent.innerHTML=`<div class="callout"><strong>Jelenlegi sztoricsoportosítás</strong><p>A rendszer most cím-, szöveg- és időbeli hasonlóság alapján kapcsolja össze a különböző csatornák tartalmait. Ez a működő alap; a következő AI-fázis szemantikus hasonlósággal, entitásokkal és Observer-megjelenésekkel pontosítja a kapcsolatokat.</p></div><section class="grid-2 equal" style="margin-top:15px"><article class="panel"><div class="panel-heading"><div><p class="eyebrow">TÉMATELJESÍTMÉNY</p><h2>Legerősebb témák</h2></div></div><div class="chart-wrap"><canvas id="topic-chart"></canvas></div></article><article class="panel"><div class="panel-heading"><div><p class="eyebrow">TÉMARANGSOR</p><h2>Tartalmak és kattintások</h2></div></div><div id="topic-rank" class="rank-list"></div></article></section><div class="section-title"><div><p class="eyebrow">KERESZTCSATORNÁS CSOPORTOK</p><h2>Közös kommunikációs sztorik</h2></div><span class="panel-note">${num(clusters.length)} többcsatornás csoport</span></div><section class="grid-3">${clusters.map((x)=>`<article class="story-card"><h3>${esc(clampText(x.seed.title,90))}</h3><p class="muted">${dateHU(x.seed.published_at)} · ${esc(topicFor(x.seed))}</p><div class="story-meta">${[...new Set(x.items.map((i)=>i.source))].map((s)=>`<span class="story-channel">${esc(SOURCE[s]?.short||s)}</span>`).join("")}</div><div class="story-stats"><div><strong>${num(x.exposure,true)}</strong><span>összes elsődleges eredmény</span></div><div><strong>${num(x.clicks)}</strong><span>kattintás</span></div><div><strong>${num(x.items.length)}</strong><span>tartalom</span></div></div></article>`).join("")||`<div class="empty-state"><strong>Még nincs elég keresztcsatornás tartalom.</strong>Legalább két hasonló téma szükséges.</div>`}</section>`;
    barChart("topic-chart",topicRows.slice(0,8).map((x)=>x.name),topicRows.slice(0,8).map((x)=>x.exp),topicRows.slice(0,8).map((_,i)=>["#0a4b55","#13707d","#2de68c","#b54708","#2867b2","#9b59b6","#7ba7a2","#526b6e"][i]));const max=safeMax(topicRows.map((x)=>x.exp),1)||1;$("topic-rank").innerHTML=topicRows.map((x,i)=>`<div class="rank-row"><span class="rank-index">${i+1}</span><div class="rank-title">${esc(x.name)}<small>${num(x.count)} tartalom · ${num(x.clicks)} kattintás</small><div class="progress"><span style="width:${x.exp/max*100}%"></span></div></div><span class="rank-value">${num(x.exp,true)}</span></div>`).join("");
  }

  function observerItems(){return contents(["observer"]).map((c)=>({c,m:c.metadata||{},mentions:contentMetric(c,["media_mentions"]),stories:contentMetric(c,["media_stories"])})).sort((a,b)=>String(b.c.published_at).localeCompare(String(a.c.published_at)));}
  function renderObserver(){
    const items=observerItems(),r=selectedRange(),p=previousRange(),filtered=items.filter((x)=>inRange(x.c.published_at,r)),prevFiltered=p?items.filter((x)=>inRange(x.c.published_at,p)):[];
    const mentions=filtered.reduce((sum,x)=>sum+x.mentions,0),prevMentions=prevFiltered.reduce((sum,x)=>sum+x.mentions,0),interviews=filtered.filter((x)=>/interjú|nyilatkozat|megszólal/i.test(`${x.m.depth} ${x.m.mention_type}`)).length,prevInterviews=prevFiltered.filter((x)=>/interjú|nyilatkozat|megszólal/i.test(`${x.m.depth} ${x.m.mention_type}`)).length;
    const sourceSet=(rows)=>new Set(rows.flatMap((x)=>[x.m.primary_source,...(x.m.related_mentions||[]).map((y)=>y.source)].filter(Boolean))),sources=sourceSet(filtered),prevSources=sourceSet(prevFiltered),entities={};
    filtered.forEach((x)=>(x.m.entities||[]).forEach((e)=>entities[e]=(entities[e]||0)+x.mentions)); const topEntities=Object.entries(entities).sort((a,b)=>b[1]-a[1]),high=filtered.filter((x)=>Number(x.m.priority||0)>=4).length;
    pageContent.innerHTML=`<section class="kpi-grid">${kpi("Médiatörténetek",num(filtered.length),"külön feldolgozott cikkek",p?delta(filtered.length,prevFiltered.length):undefined)}${kpi("Sajtómegjelenések",num(mentions),"elsődleges + hasonló megjelenések",p?delta(mentions,prevMentions):undefined)}${kpi("Különböző források",num(sources.size),"felismert médiadomének",p?delta(sources.size,prevSources.size):undefined)}${kpi("Interjúk / megszólalások",num(interviews),`${num(high)} magas prioritású történet`,p?delta(interviews,prevInterviews):undefined)}</section>
    <section class="grid-2"><article class="panel"><div class="panel-heading"><div><p class="eyebrow">MÉDIATREND</p><h2>Megjelenések időben</h2></div></div><div class="chart-wrap"><canvas id="observer-trend"></canvas></div></article><article class="panel entity-panel"><div class="panel-heading"><div><p class="eyebrow">ÉRINTETT ENTITÁSOK</p><h2>Márkák, alapok, projektek és személyek</h2></div><span class="panel-note">görgethető teljes lista</span></div><div id="entity-rank" class="rank-list entity-rank-scroll"></div></article></section>
    <article class="panel"><div class="panel-heading"><div><p class="eyebrow">SAJTÓADATBÁZIS</p><h2>Minden médiatörténet</h2></div><div class="table-tools"><input id="observer-search" type="search" placeholder="Keresés címben, összefoglalóban…"><select id="observer-type"><option value="all">Minden típus</option><option value="interjú">Interjú / megszólalás</option><option value="high">Magas prioritás</option></select></div></div><div class="table-wrap observer-table-wrap"><table id="observer-table" class="sortable-table observer-table"><colgroup><col class="obs-date"><col class="obs-title"><col class="obs-source"><col class="obs-entity"><col class="obs-depth"><col class="obs-count"><col class="obs-priority"></colgroup><thead><tr><th data-sort-type="date">Dátum</th><th data-sort-type="text">Cím és ismertetés</th><th data-sort-type="text">Forrás</th><th data-sort-type="text">Érintett entitás</th><th data-sort-type="text">Megjelenítés mélysége</th><th class="num" data-sort-type="number">Megjelenések</th><th data-sort-type="number">Prioritás</th></tr></thead><tbody id="observer-body"></tbody></table></div><p id="observer-count" class="metric-definition"></p></article>`;
    const series=seriesWithMovingAverages((range)=>dailySeries("observer","exposure",range),r,[7]); lineChart("observer-trend",series.labels,[{label:"Megjelenések",data:series.values,borderColor:"#b54708",backgroundColor:"rgba(181,71,8,.08)",fill:true,pointRadius:0,tension:.25},{label:"7 napos átlag",data:series.averages[7],borderColor:"#0a4b55",pointRadius:0,tension:.25}]);
    const max=safeMax(topEntities.map((x)=>x[1]),1)||1; $("entity-rank").innerHTML=topEntities.map(([name,v],i)=>`<div class="rank-row"><span class="rank-index">${i+1}</span><div class="rank-title">${esc(name)}<div class="progress"><span style="width:${v/max*100}%"></span></div></div><span class="rank-value">${num(v)}</span></div>`).join("")||`<div class="empty-state">Még nincs felismert entitás.</div>`;
    const update=()=>{const q=$("observer-search").value.trim().toLocaleLowerCase("hu"),type=$("observer-type").value;let rows=filtered.filter((x)=>{const hay=`${x.c.title} ${x.c.body} ${x.m.primary_source} ${x.m.depth} ${(x.m.entities||[]).join(" ")}`.toLocaleLowerCase("hu");if(q&&!hay.includes(q))return false;if(type==="interjú"&&!/interjú|nyilatkozat|megszólal/i.test(`${x.m.depth} ${x.m.mention_type}`))return false;if(type==="high"&&Number(x.m.priority||0)<4)return false;return true;});
      $("observer-body").innerHTML=rows.map((x)=>{const summary=cleanDisplayText(x.c.body),depth=cleanDisplayText(x.m.depth||x.m.mention_type||"–"),source=x.m.primary_source||x.c.author||"–",entitiesText=(x.m.entities||[]).join(" ");return `<tr><td data-sort-value="${esc(x.c.published_at||"")}">${dateHU(x.c.published_at)}</td><td data-sort-value="${esc(x.c.title||"")}"><a href="#" data-content="observer|${esc(x.c.external_id)}" class="content-link">${esc(x.c.title)}</a>${summary?`<p class="observer-summary">${esc(summary)}</p>`:""}</td><td data-sort-value="${esc(source)}">${x.c.url?`<a class="content-link observer-source-link" target="_blank" rel="noopener" href="${esc(x.c.url)}">${esc(source)} ↗</a>`:esc(source)}</td><td data-sort-value="${esc(entitiesText)}"><div class="tags observer-tags">${(x.m.entities||[]).map((e)=>`<span class="tag">${esc(e)}</span>`).join("")||"–"}</div></td><td class="observer-depth" data-sort-value="${esc(depth)}">${esc(depth)}</td><td class="num" data-sort-value="${Number(x.mentions||0)}">${num(x.mentions)}</td><td data-sort-value="${Number(x.m.priority||2)}"><span class="priority p${Number(x.m.priority||2)}">${Number(x.m.priority||2)}</span></td></tr>`;}).join("")||`<tr><td colspan="7"><div class="empty-state">Nincs megfelelő találat.</div></td></tr>`;
      $("observer-count").textContent=`${num(rows.length)} médiatörténet · ${num(rows.reduce((sum,x)=>sum+x.mentions,0))} megjelenés · minden találat megjelenítve`;bindContentLinks();applyCurrentTableSort($("observer-table"));};
    $("observer-search").addEventListener("input",update);$("observer-type").addEventListener("change",update);update();
  }


  function expectedSources(){return [{id:"wordpress",label:"Grandio – WordPress",source:"blog"},{id:"mailchimp",label:"Mailchimp",source:"mailchimp"},{id:"ga4",label:"Google Analytics 4",source:"blog"},{id:"search_console",label:"Search Console",source:"blog"},{id:"youtube",label:"YouTube",source:"youtube"},{id:"meta",label:"Facebook és Instagram",source:"facebook"},{id:"linkedin",label:"LinkedIn XLS import",source:"linkedin_company"},{id:"observer",label:"Observer Gmail",source:"observer"}];}
  function renderConnections(){const latest=Object.fromEntries(latestSync().map((x)=>[x.source,x]));pageContent.innerHTML=`<section class="grid-3">${expectedSources().map((e)=>{const r=latest[e.id];let status="missing";if(r){const age=(Date.now()-new Date(r.finished_at||r.started_at))/86400000;status=r.status==="error"?"error":age>3?"stale":"success";}return `<article class="panel"><div class="panel-heading"><div><p class="eyebrow">${esc(e.id.toUpperCase())}</p><h2>${esc(e.label)}</h2></div>${statusBadge(status)}</div>${r?`<p><strong>Utolsó futás:</strong> ${dateTimeHU(r.finished_at||r.started_at)}</p><p><strong>Beírt sorok:</strong> ${num(r.records_written)}</p><p class="muted">${esc(r.message||"")}</p>`:`<div class="empty-state"><strong>Még nem futott le.</strong>Állítsd be a szükséges GitHub secretet és változót, majd indítsd el az Actions fülön.</div>`}</article>`;}).join("")}</section><article class="panel"><div class="panel-heading"><div><p class="eyebrow">ADATBÁZIS</p><h2>Jelenlegi adattartalom</h2></div></div><div class="table-wrap"><table class="sortable-table"><thead><tr><th data-sort-type="text">Forrás</th><th class="num" data-sort-type="number">Fiókok</th><th class="num" data-sort-type="number">Tartalmak</th><th class="num" data-sort-type="number">Mérési sorok</th><th data-sort-type="date">Legutóbbi tartalom</th></tr></thead><tbody>${ALL_SOURCES.map((s)=>{const acc=state.accounts.filter((x)=>x.source===s).length,con=state.content.filter((x)=>x.source===s),met=state.metrics.filter((x)=>x.source===s).length,last=con.sort((a,b)=>String(b.published_at).localeCompare(String(a.published_at)))[0]?.published_at;return `<tr><td data-sort-value="${esc(sourceLabel(s))}">${sourceBadge(s)}</td><td class="num" data-sort-value="${acc}">${num(acc)}</td><td class="num" data-sort-value="${con.length}">${num(con.length)}</td><td class="num" data-sort-value="${met}">${num(met)}</td><td data-sort-value="${esc(last||"")}">${dateHU(last)}</td></tr>`;}).join("")}</tbody></table></div></article>`;}

  function renderPage(){destroyCharts();if(!PAGE_META[state.page])state.page="overview";const meta=PAGE_META[state.page]||PAGE_META.overview;$("page-eyebrow").textContent=meta[0];$("page-title").textContent=meta[1];$("page-subtitle").textContent=meta[2];document.querySelectorAll(".nav-item").forEach((b)=>b.classList.toggle("active",b.dataset.page===state.page));const sourcePages=["linkedin_company","facebook","instagram","youtube"];sourceFilterLabel.classList.add("hidden");if(state.page==="overview")renderOverview();else if(state.page==="newsletter")renderNewsletter();else if(state.page==="blog")renderBlog();else if(sourcePages.includes(state.page))renderPlatform(state.page);else if(state.page==="content")renderContentExplorer();else if(state.page==="stories")renderStories();else if(state.page==="observer")renderObserver();else if(state.page==="connections")renderConnections();else renderOverview();bindContentLinks();bindSortableTables();}

  function bindContentLinks(){document.querySelectorAll("[data-content]").forEach((el)=>{if(el.dataset.bound)return;el.dataset.bound="1";el.addEventListener("click",(ev)=>{ev.preventDefault();const [source,...rest]=el.dataset.content.split("|");showContent(source,rest.join("|"));});});}
  function showContent(source,id){const c=state.content.find((x)=>x.source===source&&String(x.external_id)===String(id));if(!c)return;const s=contentStats(c),m=c.metadata||{};$("modal-content").innerHTML=`<p class="eyebrow">${esc(sourceLabel(c.source))}</p><h2>${esc(c.title)}</h2><div class="modal-meta"><div><span>Publikálás</span><strong>${dateHU(c.published_at)}</strong></div><div><span>Szerző / forrás</span><strong>${esc(c.author||m.primary_source||"–")}</strong></div><div><span>${esc(primaryMetricLabel(c.source))}</span><strong>${num(s.exposure)}</strong></div><div><span>Kattintás · interakció</span><strong>${num(s.clicks)} · ${num(s.engagement)}</strong></div></div><div class="tags">${(m.entities||m.category_names||[]).map((x)=>`<span class="tag">${esc(x)}</span>`).join("")}</div><p class="modal-body">${esc(c.source==="observer"?cleanDisplayText(c.body||"Nincs kivonat."):(c.body||"Nincs kivonat."))}</p>${m.depth?`<div class="callout"><strong>Megjelenítés mélysége</strong><p>${esc(cleanDisplayText(m.depth))}</p></div>`:""}${m.related_mentions?.length?`<h3 style="margin-top:18px">Hasonló megjelenések</h3><div class="insight-list">${m.related_mentions.map((x)=>`<div class="insight"><strong>${esc(x.source||"Kapcsolódó forrás")}</strong><p>${esc(x.title||"")}${x.url?` · ${esc(x.url)}`:""}</p></div>`).join("")}</div>`:""}${c.url?`<p style="margin-top:20px"><a class="primary-button" style="display:inline-flex;padding:11px 15px;text-decoration:none" target="_blank" rel="noopener" href="${esc(c.url)}">Eredeti tartalom megnyitása ↗</a></p>`:""}`;$("detail-modal").classList.remove("hidden");}

  function navigate(page){state.page=PAGE_META[page]?page:"overview";location.hash=state.page;renderPage();$("sidebar").classList.remove("open");window.scrollTo({top:0,behavior:"smooth"});}
  function wireEvents(){document.querySelectorAll(".nav-item").forEach((b)=>b.addEventListener("click",()=>navigate(b.dataset.page)));rangeSelect.addEventListener("change",renderPage);compareSelect.addEventListener("change",renderPage);sourceSelect.addEventListener("change",()=>{if(state.page==="overview")renderPage();});$("refresh-button").addEventListener("click",()=>loadData());$("menu-button").addEventListener("click",()=>$("sidebar").classList.toggle("open"));document.querySelectorAll("[data-close-modal]").forEach((x)=>x.addEventListener("click",()=>$("detail-modal").classList.add("hidden")));window.addEventListener("hashchange",()=>{const p=location.hash.replace("#","");if(PAGE_META[p]&&p!==state.page){state.page=p;renderPage();}});}

  async function init(){if(!configured){setupScreen.classList.remove("hidden");return;}state.client=window.supabase.createClient(cfg.supabaseUrl,cfg.supabasePublishableKey);wireEvents();const {data:{session}}=await state.client.auth.getSession();if(session){await enter(session.user);}else loginScreen.classList.remove("hidden");$("login-form").addEventListener("submit",async(e)=>{e.preventDefault();$("login-error").textContent="";const {data,error}=await state.client.auth.signInWithPassword({email:$("email").value,password:$("password").value});if(error){$("login-error").textContent=error.message;return;}await enter(data.user);});$("logout-button").addEventListener("click",async()=>{await state.client.auth.signOut();app.classList.add("hidden");loginScreen.classList.remove("hidden");});}
  async function enter(user){state.user=user;loginScreen.classList.add("hidden");setupScreen.classList.add("hidden");app.classList.remove("hidden");$("signed-in-user").textContent=user.email||"Bejelentkezve";await loadData();}
  init();
})();
