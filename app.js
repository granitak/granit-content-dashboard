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
    linkedin_company: { label: "LinkedIn – vállalati", short: "LinkedIn", color: "#2867b2", exposure: ["impressions", "reach"], clicks: ["clicks"], engagement: ["reactions", "comments", "shares", "saves"], audience: ["followers"] },
    linkedin_ceo: { label: "LinkedIn – vezetői", short: "Vezetői LinkedIn", color: "#174a75", exposure: ["impressions", "reach"], clicks: ["clicks"], engagement: ["reactions", "comments", "shares", "saves"], audience: [] },
    facebook: { label: "Facebook", short: "Facebook", color: "#4267b2", exposure: ["page_views_total", "views", "reach"], clicks: ["clicks", "post_clicks"], engagement: ["reactions", "comments", "shares", "post_engaged_users"], audience: ["followers", "fans"] },
    instagram: { label: "Instagram", short: "Instagram", color: "#b93683", exposure: ["views", "reach"], clicks: ["clicks"], engagement: ["total_interactions", "accounts_engaged", "reactions", "comments", "shares", "saved"], audience: ["followers"] },
    youtube: { label: "YouTube", short: "YouTube", color: "#d92d20", exposure: ["views"], clicks: [], engagement: ["reactions", "comments", "shares"], audience: ["subscribers"] },
    observer: { label: "Observer", short: "Observer", color: "#b54708", exposure: ["media_mentions"], clicks: [], engagement: ["media_stories"], audience: [] },
  };
  const SOCIAL_SOURCES = ["linkedin_company", "linkedin_ceo", "facebook", "instagram", "youtube"];
  const OWN_SOURCES = ["blog", "mailchimp", ...SOCIAL_SOURCES];
  const ALL_SOURCES = [...OWN_SOURCES, "observer"];
  const PAGE_META = {
    overview: ["VEZETŐI ÖSSZKÉP", "Összkép", "A saját csatornák és a médiamegjelenések közös áttekintése."],
    newsletter: ["E-MAIL-MARKETING", "Hírlevél", "Kampányok, kattintások, feliratkozók és a legsikeresebb tartalmak."],
    blog: ["SAJÁT MÉDIA", "Grandio Blog", "Olvasottság, forgalmi források, szerzők és SEO-teljesítmény."],
    linkedin_company: ["KÖZÖSSÉGI MÉDIA", "LinkedIn – vállalati oldal", "A GRÁNIT Alapkezelő vállalati oldalának teljesítménye."],
    linkedin_ceo: ["VEZETŐI KOMMUNIKÁCIÓ", "LinkedIn – vezetői profil", "A vezetői gondolatvezetés és személyes márka teljesítménye."],
    facebook: ["KÖZÖSSÉGI MÉDIA", "Facebook", "Elérés, kattintások, interakciók és tartalmi eredmények."],
    instagram: ["KÖZÖSSÉGI MÉDIA", "Instagram", "Reels, karusszelek, mentések, megosztások és követőnövekedés."],
    youtube: ["VIDEÓ", "YouTube", "Megtekintések, nézési idő, feliratkozók és videóteljesítmény."],
    content: ["TARTALOMADATBÁZIS", "Tartalomkereső", "Minden importált cikk, poszt, videó és hírlevél egy helyen."],
    stories: ["KERESZTCSATORNÁS ELEMZÉS", "Sztorik és témák", "Az egymáshoz kapcsolódó tartalmak és a legerősebb témák."],
    observer: ["MÉDIAFIGYELÉS", "Observer", "Sajtómegjelenések, megszólalások, említések és reputációs jelzések."],
    ai: ["AUTOMATIKUS ÉRTELMEZÉS", "AI elemző", "Adatokra épülő vezetői összefoglalók és következő lépések."],
    connections: ["RENDSZERÁLLAPOT", "Adatkapcsolatok", "A collectorok frissessége, hibái és beállítási állapota."],
  };

  const state = {
    client: null, user: null, page: location.hash.replace("#", "") || "overview",
    accounts: [], content: [], metrics: [], syncRuns: [], reports: [], charts: [], loadedAt: null,
  };

  function esc(value) { return String(value ?? "").replace(/[&<>'"]/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c])); }
  function num(value, compact = false) {
    const n = Number(value || 0);
    return new Intl.NumberFormat("hu-HU", compact && Math.abs(n) >= 10000 ? { notation: "compact", maximumFractionDigits: 1 } : { maximumFractionDigits: n % 1 ? 1 : 0 }).format(n);
  }
  function pct(value, digits = 1) { return `${new Intl.NumberFormat("hu-HU", { maximumFractionDigits: digits, minimumFractionDigits: digits }).format(Number(value || 0) * 100)}%`; }
  function dateHU(value) { if (!value) return "–"; const d = new Date(value); return Number.isNaN(d.getTime()) ? "–" : new Intl.DateTimeFormat("hu-HU", { year:"numeric", month:"2-digit", day:"2-digit" }).format(d); }
  function dateTimeHU(value) { if (!value) return "–"; const d = new Date(value); return Number.isNaN(d.getTime()) ? "–" : new Intl.DateTimeFormat("hu-HU", { year:"numeric", month:"2-digit", day:"2-digit", hour:"2-digit", minute:"2-digit" }).format(d); }
  function dayKey(value) { const d = new Date(value); return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10); }
  function clampText(value, max = 110) { const text = String(value || "").trim(); return text.length > max ? `${text.slice(0, max - 1)}…` : text; }
  function sourceLabel(source) { return SOURCE[source]?.label || source || "Ismeretlen"; }
  function primaryMetricLabel(source) {
    const labels = {
      blog: "megtekintés",
      mailchimp: "egyedi megnyitás",
      linkedin_company: "megjelenés",
      linkedin_ceo: "megjelenés",
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
      const [accounts, content, metrics, syncRuns, reports] = await Promise.all([
        fetchPaged("accounts", "updated_at", false), fetchPaged("content_items", "published_at", false),
        fetchPaged("metric_daily", "metric_date", false), fetchPaged("sync_runs", "started_at", false), fetchPaged("ai_reports", "report_date", false),
      ]);
      Object.assign(state, { accounts, content, metrics, syncRuns, reports, loadedAt: new Date() });
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
  function deltaHtml(value) { if (value === null || !Number.isFinite(value)) return `<span class="delta neutral">nincs összehasonlítás</span>`; const cls = value > .001 ? "up" : value < -.001 ? "down" : "neutral"; const arrow = value > .001 ? "↑" : value < -.001 ? "↓" : "→"; return `<span class="delta ${cls}">${arrow} ${pct(Math.abs(value))}</span>`; }
  function kpi(label, value, note = "", change = undefined) { return `<article class="kpi-card"><span class="kpi-label">${esc(label)}</span><strong>${esc(value)}</strong><small>${change === undefined ? esc(note) : `${deltaHtml(change)} · ${esc(note)}`}</small></article>`; }

  function allDates(range = selectedRange(), maxDays = 370) {
    let start = range.start ? new Date(range.start) : null;
    if (!start) { const dates = state.metrics.map((m) => new Date(m.metric_date)).filter((d) => !Number.isNaN(d.getTime())); start = dates.length ? new Date(Math.min(...dates)) : new Date(); }
    if ((range.end - start) / 86400000 > maxDays) { start = new Date(range.end); start.setDate(start.getDate() - maxDays + 1); }
    const out=[]; const d=new Date(start); d.setHours(0,0,0,0); while(d<=range.end){out.push(dayKey(d));d.setDate(d.getDate()+1);} return out;
  }
  function dailySeries(source, kind, range = selectedRange()) {
    const dates = allDates(range); const map = Object.fromEntries(dates.map((d)=>[d,0])); const sc = SOURCE[source];
    if (!sc) return { labels: dates, values: dates.map(()=>0) };
    if (kind === "publishing") { contents([source], range).forEach((c)=>{const d=dayKey(c.published_at); if(d in map)map[d]++;}); return {labels:dates,values:dates.map(d=>map[d])}; }
    const names = kind === "exposure" ? sc.exposure : kind === "clicks" ? sc.clicks : sc.engagement;
    const accountRows = state.metrics.filter((m)=>m.source===source && !m.content_external_id && names.includes(m.metric_name) && m.aggregation_type==="flow" && inRange(m.metric_date,range));
    if (accountRows.length) {
      const selectedNames = kind === "engagement" ? names : [names.find((n)=>accountRows.some((r)=>r.metric_name===n))].filter(Boolean);
      accountRows.filter((r)=>selectedNames.includes(r.metric_name)).forEach((r)=>{if(r.metric_date in map)map[r.metric_date]+=Number(r.metric_value||0);});
    } else {
      contents([source],range).forEach((c)=>{const d=dayKey(c.published_at);if(!(d in map))return;map[d]+=kind==="engagement"?names.reduce((s,n)=>s+contentMetric(c,[n]),0):contentMetric(c,names);});
    }
    return { labels: dates, values: dates.map((d)=>map[d]) };
  }
  function movingAverage(values, window) { return values.map((_,i)=>{const start=Math.max(0,i-window+1);const part=values.slice(start,i+1);return part.reduce((a,b)=>a+b,0)/part.length;}); }
  function destroyCharts(){ state.charts.forEach((c)=>c.destroy()); state.charts=[]; }
  function chart(canvasId, config){ const el=$(canvasId); if(!el)return null; const c=new Chart(el,config); state.charts.push(c); return c; }
  function lineChart(canvasId, labels, datasets, options={}) { return chart(canvasId,{type:"line",data:{labels,datasets},options:{responsive:true,maintainAspectRatio:false,interaction:{mode:"index",intersect:false},plugins:{legend:{display:datasets.length>1,position:"bottom"},tooltip:{callbacks:{label:(ctx)=>`${ctx.dataset.label}: ${num(ctx.parsed.y)}`}}},scales:{x:{grid:{display:false},ticks:{maxTicksLimit:10}},y:{beginAtZero:true,grid:{color:"rgba(16,45,49,.06)"}}},...options}}); }
  function barChart(canvasId, labels, values, colors) { return chart(canvasId,{type:"bar",data:{labels,datasets:[{data:values,backgroundColor:colors,borderRadius:7}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{x:{grid:{display:false}},y:{beginAtZero:true,grid:{color:"rgba(16,45,49,.06)"}}}}}); }
  function doughnut(canvasId, labels, values, colors) { return chart(canvasId,{type:"doughnut",data:{labels,datasets:[{data:values,backgroundColor:colors,borderWidth:0}]},options:{responsive:true,maintainAspectRatio:false,cutout:"66%",plugins:{legend:{position:"bottom"}}}}); }

  function topContents(sources, limit=8, range=selectedRange()) {
    return contents(sources,range).map((c)=>({c,s:contentStats(c)})).sort((a,b)=>(b.s.exposure+b.s.clicks*4+b.s.engagement*2)-(a.s.exposure+a.s.clicks*4+a.s.engagement*2)).slice(0,limit);
  }
  function contentRowsHtml(items) {
    if (!items.length) return `<tr><td colspan="7"><div class="empty-state"><strong>Még nincs megjeleníthető tartalom.</strong>A csatorna bekötése után itt automatikusan megjelennek az adatok.</div></td></tr>`;
    return items.map(({c,s})=>`<tr><td><a href="#" class="content-link" data-content="${esc(c.source)}|${esc(c.external_id)}">${esc(clampText(c.title,90))}</a><div class="metric-definition">${esc(c.author||"")}</div></td><td>${sourceBadge(c.source)}</td><td>${dateHU(c.published_at)}</td><td class="num">${num(s.exposure)}<div class="metric-definition">${esc(primaryMetricLabel(c.source))}</div></td><td class="num">${num(s.clicks)}</td><td class="num">${num(s.engagement)}</td><td>${c.url?`<a class="content-link" href="${esc(c.url)}" target="_blank" rel="noopener">Megnyitás ↗</a>`:"–"}</td></tr>`).join("");
  }
  function contentTable(items, title="Legjobb tartalmak") { return `<article class="panel"><div class="panel-heading"><div><p class="eyebrow">TARTALOM</p><h2>${esc(title)}</h2></div></div><div class="table-wrap"><table><thead><tr><th>Tartalom</th><th>Csatorna</th><th>Dátum</th><th class="num">Elsődleges eredmény</th><th class="num">Kattintás</th><th class="num">Interakció</th><th>Link</th></tr></thead><tbody>${contentRowsHtml(items)}</tbody></table></div></article>`; }

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

  function renderOverview() {
    const r=selectedRange(), p=previousRange();
    const web=sourceMetric("blog","exposure",r), webPrev=p?sourceMetric("blog","exposure",p):0;
    const mailOpens=sourceMetric("mailchimp","exposure",r), mailOpensPrev=p?sourceMetric("mailchimp","exposure",p):0;
    const mailClicks=sourceMetric("mailchimp","clicks",r);
    const social=SOCIAL_SOURCES.reduce((s,x)=>s+sourceMetric(x,"exposure",r),0), socialPrev=p?SOCIAL_SOURCES.reduce((s,x)=>s+sourceMetric(x,"exposure",p),0):0;
    const aud=OWN_SOURCES.reduce((s,x)=>s+audience(x),0);
    const pub=contents(OWN_SOURCES,r).length, pubPrev=p?contents(OWN_SOURCES,p).length:0;
    const mentions=sourceMetric("observer","exposure",r), mentionsPrev=p?sourceMetric("observer","exposure",p):0;
    pageContent.innerHTML=`<section class="kpi-grid six">${kpi("Blogmegtekintések",num(web),"GA4 / kiválasztott időszak",delta(web,webPrev))}${kpi("Hírlevél – egyedi megnyitók",num(mailOpens),`${num(mailClicks)} egyedi kattintó`,delta(mailOpens,mailOpensPrev))}${kpi("Social megjelenések",num(social,true),"platformnatív mutatók összege",delta(social,socialPrev))}${kpi("Csatornaközönségek összege",num(aud,true),"nem egyedi személyek; csatornánkénti állapot")}${kpi("Megjelent tartalmak",num(pub),"cikkek, posztok, videók, levelek",delta(pub,pubPrev))}${kpi("Sajtómegjelenések",num(mentions),"Observer-megjelenések",delta(mentions,mentionsPrev))}</section>
    <section class="grid-2"><article class="panel"><div class="panel-heading"><div><p class="eyebrow">NORMALIZÁLT TREND</p><h2>Csatornák teljesítménye a saját átlagukhoz képest</h2></div><span class="panel-note">100 = az időszak napi átlaga · 7 napos simítás</span></div><div class="chart-wrap"><canvas id="overview-trend"></canvas></div></article>
    <article class="panel"><div class="panel-heading"><div><p class="eyebrow">CSATORNAÁLLAPOT</p><h2>Aktivitás csatornánként</h2></div></div><div id="channel-ranking" class="rank-list"></div></article></section>
    <section class="grid-2 equal"><article class="panel"><div class="panel-heading"><div><p class="eyebrow">AUTOMATIKUS ÉRTELMEZÉS</p><h2>Mit érdemes most látni?</h2></div></div>${insightsHtml()}</article>
    <article class="panel"><div class="panel-heading"><div><p class="eyebrow">FORRÁSMIX</p><h2>Publikált tartalmak megoszlása</h2></div></div><div class="chart-wrap compact"><canvas id="overview-mix"></canvas></div></article></section>
    ${contentTable(topContents(sourceSelect.value === "all" ? ALL_SOURCES : [sourceSelect.value],10,r),"Az időszak legerősebb tartalmai")}`;
    const overviewSources = sourceSelect.value === "all" ? ALL_SOURCES : [sourceSelect.value];
    const available=overviewSources.filter((s)=>sourceMetric(s,"exposure",r)>0||contents([s],r).length>0);
    const labels=allDates(r); const datasets=[];
    available.forEach((s)=>{const series=dailySeries(s,"exposure",r).values;const avg=series.reduce((a,b)=>a+b,0)/Math.max(1,series.length);if(!avg)return;datasets.push({label:SOURCE[s].short,data:movingAverage(series,7).map((v)=>v/avg*100),borderColor:SOURCE[s].color,backgroundColor:"transparent",tension:.28,pointRadius:0,borderWidth:2});});
    lineChart("overview-trend",labels,datasets,{scales:{x:{grid:{display:false},ticks:{maxTicksLimit:9}},y:{beginAtZero:false,suggestedMin:0,grid:{color:"rgba(16,45,49,.06)"},title:{display:true,text:"Saját átlag = 100"}}}});
    const rank=available.map((s)=>({s,v:sourceMetric(s,"exposure",r),pub:contents([s],r).length})).sort((a,b)=>b.v-a.v); const max=Math.max(...rank.map((x)=>x.v),1);
    $("channel-ranking").innerHTML=rank.length?rank.map((x,i)=>`<div class="rank-row"><span class="rank-index">${i+1}</span><div class="rank-title">${esc(sourceLabel(x.s))}<small>${num(x.pub)} tartalom</small><div class="progress"><span style="width:${Math.max(4,x.v/max*100)}%"></span></div></div><span class="rank-value">${num(x.v,true)}</span></div>`).join(""):`<div class="empty-state">Még nincs csatornaadat.</div>`;
    const mix=OWN_SOURCES.map((s)=>contents([s],r).length); doughnut("overview-mix",OWN_SOURCES.map((s)=>SOURCE[s].short),mix,OWN_SOURCES.map((s)=>SOURCE[s].color));
  }

  function campaignRows(range=selectedRange()) { return contents(["mailchimp"],range).map((c)=>({c,s:contentStats(c),m:c.metadata||{}})).sort((a,b)=>String(b.c.published_at).localeCompare(String(a.c.published_at))); }
  function renderNewsletter() {
    const r=selectedRange(), p=previousRange(), rows=campaignRows(r), prevRows=p?campaignRows(p):[];
    const metricSum=(items,name)=>items.reduce((sum,item)=>sum+contentMetric(item.c,[name]),0);
    const sent=metricSum(rows,"emails_sent");
    const delivered=metricSum(rows,"delivered");
    const opens=metricSum(rows,"unique_opens");
    const clicks=metricSum(rows,"unique_clicks");
    const unsub=metricSum(rows,"unsubscribes");
    const hardBounce=metricSum(rows,"hard_bounces");
    const softBounce=metricSum(rows,"soft_bounces");
    const bounce=hardBounce+softBounce;
    const pOpens=metricSum(prevRows,"unique_opens");
    const pClicks=metricSum(prevRows,"unique_clicks");
    const deliveryRate=sent?delivered/sent:0;
    const openRate=delivered?opens/delivered:0;
    const clickRate=delivered?clicks/delivered:0;
    const unsubscribeRate=delivered?unsub/delivered:0;
    const bounceRate=sent?bounce/sent:0;
    const audienceNow=audience("mailchimp");
    const audienceHistory=snapshotSeries("mailchimp",SOURCE.mailchimp.audience,r);
    const audienceStart=audienceHistory.values.length?audienceHistory.values[0]:audienceNow;
    const audienceEnd=audienceHistory.values.length?audienceHistory.values[audienceHistory.values.length-1]:audienceNow;
    const audienceGrowth=audienceHistory.values.length>1?audienceEnd-audienceStart:null;
    const audienceGrowthRate=audienceGrowth!==null&&audienceStart?audienceGrowth/audienceStart:null;
    pageContent.innerHTML=`<section class="kpi-grid">
      ${kpi("Aktuális feliratkozók",num(audienceNow),"Mailchimp listaállomány")}
      ${kpi("Feliratkozói növekedés",audienceGrowth===null?"–":`${audienceGrowth>0?"+":""}${num(audienceGrowth)}`,audienceGrowth===null?"a napi mentésekkel válik mérhetővé":"az időszak elejéhez képest",audienceGrowthRate===null?undefined:audienceGrowthRate)}
      ${kpi("Kiküldve",num(sent),`${num(rows.length)} kampány`)}
      ${kpi("Kézbesítve",num(delivered),sent?`${pct(deliveryRate)} kézbesítési arány`:"–")}
      ${kpi("Egyedi megnyitók",num(opens),"legalább egyszer megnyitó címzettek",delta(opens,pOpens))}
      ${kpi("Egyedi kattintók",num(clicks),"legalább egyszer kattintó címzettek",delta(clicks,pClicks))}
      ${kpi("Megnyitási arány",delivered?pct(openRate):"–","egyedi megnyitók / kézbesített")}
      ${kpi("Átkattintási arány",delivered?pct(clickRate):"–","egyedi kattintók / kézbesített")}
      ${kpi("Leiratkozások",num(unsub),delivered?`${pct(unsubscribeRate)} a kézbesítettekből`:"–")}
      ${kpi("Visszapattanások",num(bounce),sent?`${pct(bounceRate)} · ${num(hardBounce)} hard, ${num(softBounce)} soft`:"–")}
    </section>
    <div class="callout"><strong>A hírlevél növekedését elsőként a feliratkozói bázis mutatja.</strong><p>A kiküldés továbbra sem elérés: az egyedi megnyitókat és kattintókat külön teljesítménymutatóként kezeljük. A nyitó diagram a feliratkozók számának alakulását mutatja; a kampányonkénti megnyitási és átkattintási arány lejjebb, változatlanul megmarad.</p></div>
    <article class="panel" style="margin-top:15px"><div class="panel-heading"><div><p class="eyebrow">KÖZÖNSÉGNÖVEKEDÉS</p><h2>Feliratkozók számának alakulása</h2></div><span class="panel-note">napi Mailchimp-listaállomány · ${audienceGrowth===null?"a történet a futásokkal épül":`${audienceGrowth>0?"+":""}${num(audienceGrowth)} fő az időszakban`}</span></div><div class="chart-wrap"><canvas id="mail-audience-chart"></canvas></div></article>
    <section class="grid-2 equal" style="margin-top:15px"><article class="panel"><div class="panel-heading"><div><p class="eyebrow">KIKÜLDÉS</p><h2>Kiküldött és kézbesített levelek</h2></div><span class="panel-note">kampányonkénti címzetti darabszám</span></div><div class="chart-wrap"><canvas id="mail-volume-chart"></canvas></div></article>
    <article class="panel"><div class="panel-heading"><div><p class="eyebrow">KATTINTÁSOK</p><h2>Legsikeresebb kampányok</h2></div><span class="panel-note">egyedi kattintók száma</span></div><div id="mail-rank" class="rank-list"></div></article></section>
    <article class="panel" style="margin-top:15px"><div class="panel-heading"><div><p class="eyebrow">KAMPÁNYTREND</p><h2>Megnyitási és átkattintási arány</h2></div><span class="panel-note">egyedi címzettek / kézbesített levelek</span></div><div class="chart-wrap"><canvas id="mail-rate-chart"></canvas></div></article>
    <article class="panel"><div class="panel-heading"><div><p class="eyebrow">HAVI KIMUTATÁS</p><h2>Hírlevél-statisztika</h2></div><span class="panel-note">minden darabszám címzetti, nem összes eseményszám</span></div><div class="table-wrap"><table><thead><tr><th>Dátum</th><th>Cím</th><th class="num">Kiküldve</th><th class="num">Kézbesítve</th><th class="num">Egyedi megnyitók</th><th class="num">Egyedi kattintók</th><th class="num">Visszapattanás</th><th class="num">Leiratkozás</th><th>Legtöbbet kattintott link</th><th>Legsikeresebb Grandio-cikk</th></tr></thead><tbody>${rows.length?rows.map(({c,m})=>{
      const campaignSent=contentMetric(c,["emails_sent"]);
      const campaignDelivered=contentMetric(c,["delivered"]);
      const campaignOpens=contentMetric(c,["unique_opens"]);
      const campaignClicks=contentMetric(c,["unique_clicks"]);
      const campaignUnsub=contentMetric(c,["unsubscribes"]);
      const campaignHard=contentMetric(c,["hard_bounces"]);
      const campaignSoft=contentMetric(c,["soft_bounces"]);
      const campaignBounce=campaignHard+campaignSoft;
      return `<tr><td>${dateHU(c.published_at)}</td><td><a class="content-link" data-content="mailchimp|${esc(c.external_id)}" href="#">${esc(c.title)}</a><div class="metric-definition">${esc(m.subject_line||"")}</div></td><td class="num">${num(campaignSent)}</td><td class="num">${num(campaignDelivered)}<div class="metric-definition">${campaignSent?pct(campaignDelivered/campaignSent):"–"}</div></td><td class="num">${num(campaignOpens)}<div class="metric-definition">${campaignDelivered?pct(campaignOpens/campaignDelivered):"–"}</div></td><td class="num">${num(campaignClicks)}<div class="metric-definition">${campaignDelivered?pct(campaignClicks/campaignDelivered):"–"}</div></td><td class="num">${num(campaignBounce)}<div class="metric-definition">${campaignSent?pct(campaignBounce/campaignSent):"–"} · ${num(campaignHard)} hard / ${num(campaignSoft)} soft</div></td><td class="num">${num(campaignUnsub)}<div class="metric-definition">${campaignDelivered?pct(campaignUnsub/campaignDelivered):"–"}</div></td><td>${m.top_link_url?`<a class="content-link" target="_blank" rel="noopener" href="${esc(m.top_link_url)}">${esc(clampText(m.top_link_url,55))}</a><div class="metric-definition">${num(m.top_link_unique_clicks||m.top_link_clicks)} egyedi kattintó</div>`:"–"}</td><td>${m.top_grandio_url?`<a class="content-link" target="_blank" rel="noopener" href="${esc(m.top_grandio_url)}">${esc(clampText(m.top_grandio_url,55))}</a><div class="metric-definition">${num(m.top_grandio_unique_clicks||m.top_grandio_clicks)} egyedi kattintó</div>`:"–"}</td></tr>`;
    }).join(""):`<tr><td colspan="10"><div class="empty-state"><strong>Nincs kampány ebben az időszakban.</strong></div></td></tr>`}</tbody></table></div></article>`;
    const chronological=[...rows].reverse();
    const audienceValues=audienceHistory.values.length?audienceHistory.values:[audienceNow];
    const audienceLabels=audienceHistory.labels.length?audienceHistory.labels:[dateHU(new Date())];
    const audienceMin=Math.min(...audienceValues);
    const audienceMax=Math.max(...audienceValues);
    const audiencePadding=Math.max(1,Math.ceil((audienceMax-audienceMin)*.18));
    chart("mail-audience-chart",{type:"line",data:{labels:audienceLabels,datasets:[{label:"Feliratkozók",data:audienceValues,borderColor:"#0a4b55",backgroundColor:"rgba(45,230,140,.16)",fill:true,tension:.28,pointRadius:audienceValues.length>30?0:3,pointHoverRadius:5,borderWidth:3}]},options:{responsive:true,maintainAspectRatio:false,interaction:{mode:"index",intersect:false},plugins:{legend:{display:false},tooltip:{callbacks:{label:(ctx)=>`Feliratkozók: ${num(ctx.parsed.y)}`}}},scales:{x:{grid:{display:false},ticks:{maxTicksLimit:10}},y:{beginAtZero:false,suggestedMin:Math.max(0,audienceMin-audiencePadding),suggestedMax:audienceMax+audiencePadding,grid:{color:"rgba(16,45,49,.06)"},ticks:{precision:0}}}}});
    chart("mail-volume-chart",{type:"bar",data:{labels:chronological.map((x)=>dateHU(x.c.published_at)),datasets:[{label:"Kiküldve",data:chronological.map((x)=>contentMetric(x.c,["emails_sent"])),backgroundColor:"rgba(19,112,125,.30)",borderColor:"#13707d",borderWidth:1,borderRadius:6},{label:"Kézbesítve",data:chronological.map((x)=>contentMetric(x.c,["delivered"])),backgroundColor:"rgba(45,230,140,.35)",borderColor:"#2de68c",borderWidth:1,borderRadius:6}]},options:{responsive:true,maintainAspectRatio:false,interaction:{mode:"index",intersect:false},plugins:{legend:{display:true,position:"bottom"},tooltip:{callbacks:{label:(ctx)=>`${ctx.dataset.label}: ${num(ctx.parsed.y)}`}}},scales:{x:{grid:{display:false}},y:{beginAtZero:true,grid:{color:"rgba(16,45,49,.06)"}}}}});
    chart("mail-rate-chart",{type:"line",data:{labels:chronological.map((x)=>dateHU(x.c.published_at)),datasets:[{label:"Megnyitási arány",data:chronological.map((x)=>{const d=contentMetric(x.c,["delivered"]),o=contentMetric(x.c,["unique_opens"]);return d?o/d*100:0;}),borderColor:"#13707d",backgroundColor:"transparent",tension:.3},{label:"Átkattintási arány",data:chronological.map((x)=>{const d=contentMetric(x.c,["delivered"]),c=contentMetric(x.c,["unique_clicks"]);return d?c/d*100:0;}),borderColor:"#2de68c",backgroundColor:"transparent",tension:.3}]},options:{responsive:true,maintainAspectRatio:false,interaction:{mode:"index",intersect:false},plugins:{legend:{display:true,position:"bottom"},tooltip:{callbacks:{label:(ctx)=>`${ctx.dataset.label}: ${num(ctx.parsed.y)}%`}}},scales:{x:{grid:{display:false}},y:{beginAtZero:true,ticks:{callback:(v)=>`${v}%`},grid:{color:"rgba(16,45,49,.06)"}}}}});
    const sorted=[...rows].sort((a,b)=>contentMetric(b.c,["unique_clicks"])-contentMetric(a.c,["unique_clicks"])).slice(0,7);
    const max=Math.max(...sorted.map((x)=>contentMetric(x.c,["unique_clicks"])),1);
    $("mail-rank").innerHTML=sorted.map((x,i)=>{const value=contentMetric(x.c,["unique_clicks"]);return `<div class="rank-row"><span class="rank-index">${i+1}</span><div class="rank-title">${esc(clampText(x.c.title,65))}<small>${dateHU(x.c.published_at)} · ${num(value)} egyedi kattintó</small><div class="progress"><span style="width:${value/max*100}%"></span></div></div><span class="rank-value">${num(value)}</span></div>`;}).join("")||`<div class="empty-state">Nincs adat.</div>`;
  }

  function renderBlog() {
    const r=selectedRange(),p=previousRange(); const views=sourceMetric("blog","exposure",r),sessions=accountMetricTotal("blog",["web_sessions"],r),users=accountMetricTotal("blog",["web_users"],r),engaged=accountMetricTotal("blog",["web_engaged_sessions"],r),seconds=accountMetricTotal("blog",["web_engagement_seconds"],r),search=accountMetricTotal("blog",["search_clicks"],r),pub=contents(["blog"],r).length;
    const prevViews=p?sourceMetric("blog","exposure",p):0;
    const items=topContents(["blog"],12,r);
    pageContent.innerHTML=`<section class="kpi-grid six">${kpi("Oldalmegtekintések",num(views),"GA4",delta(views,prevViews))}${kpi("Munkamenetek",num(sessions),"GA4")}${kpi("Felhasználók",num(users),"aktív felhasználók")}${kpi("Elkötelezett munkamenetek",num(engaged),sessions?pct(engaged/sessions):"–")}${kpi("Átlagos engagement",users?`${num(seconds/users)} mp`:"–","felhasználónként")}${kpi("Google-kattintások",num(search),`${num(pub)} publikált cikk`)}</section>
    <section class="grid-2"><article class="panel"><div class="panel-heading"><div><p class="eyebrow">FORGALMI TREND</p><h2>Blogmegtekintések</h2></div><span class="panel-note">napi érték + 7 és 28 napos mozgóátlag</span></div><div class="chart-wrap"><canvas id="blog-trend"></canvas></div></article><article class="panel"><div class="panel-heading"><div><p class="eyebrow">SZERZŐK</p><h2>Teljesítmény szerzőnként</h2></div></div><div id="author-rank" class="rank-list"></div></article></section>
    <section class="grid-2 equal"><article class="panel"><div class="panel-heading"><div><p class="eyebrow">SEO</p><h2>Organikus keresési lehetőségek</h2></div></div><div id="seo-list" class="insight-list"></div></article><article class="panel"><div class="panel-heading"><div><p class="eyebrow">TÉMÁK</p><h2>Cikkek kategória szerint</h2></div></div><div class="chart-wrap compact"><canvas id="blog-topic"></canvas></div></article></section>${contentTable(items,"Legjobban teljesítő Grandio-cikkek")}`;
    const series=dailySeries("blog","exposure",r); lineChart("blog-trend",series.labels,[{label:"Megtekintések",data:series.values,borderColor:"rgba(10,75,85,.3)",backgroundColor:"rgba(10,75,85,.06)",fill:true,pointRadius:0},{label:"7 napos átlag",data:movingAverage(series.values,7),borderColor:"#0a4b55",pointRadius:0,tension:.25,borderWidth:2},{label:"28 napos átlag",data:movingAverage(series.values,28),borderColor:"#2de68c",pointRadius:0,tension:.25,borderWidth:2}]);
    const authors={}; contents(["blog"],r).forEach((c)=>{const a=c.author||"Nincs szerzőadat";authors[a]??={count:0,views:0};authors[a].count++;authors[a].views+=contentMetric(c,["web_views"]);}); const ar=Object.entries(authors).map(([name,v])=>({name,...v})).sort((a,b)=>b.views-a.views).slice(0,8); const max=Math.max(...ar.map((x)=>x.views),1); $("author-rank").innerHTML=ar.map((x,i)=>`<div class="rank-row"><span class="rank-index">${i+1}</span><div class="rank-title">${esc(x.name)}<small>${num(x.count)} cikk · ${num(x.count?x.views/x.count:0)} átlagos megtekintés</small><div class="progress"><span style="width:${x.views/max*100}%"></span></div></div><span class="rank-value">${num(x.views)}</span></div>`).join("")||`<div class="empty-state">A GA4 bekötése után jelenik meg.</div>`;
    const seo=contents(["blog"],r).map((c)=>({c,imp:contentMetric(c,["search_impressions"]),click:contentMetric(c,["search_clicks"]),ctr:contentMetric(c,["search_ctr"]),pos:contentMetric(c,["search_position"])})).filter((x)=>x.imp>100).sort((a,b)=>b.imp-a.imp).slice(0,5); $("seo-list").innerHTML=seo.length?seo.map((x)=>`<div class="insight ${x.ctr<.02?"warning":""}"><strong>${esc(clampText(x.c.title,90))}</strong><p>${num(x.imp)} Google-megjelenés · ${num(x.click)} kattintás · ${pct(x.ctr)} CTR${x.pos?` · ${num(x.pos)}. átlagos pozíció`:""}</p></div>`).join(""):`<div class="empty-state"><strong>Még nincs Search Console-adat.</strong>A Google-kapcsolat után itt jelennek meg a SEO-lehetőségek.</div>`;
    const categories={}; contents(["blog"],r).forEach((c)=>{const names=c.metadata?.category_names||[];const cat=names[0]||topicFor(c);categories[cat]=(categories[cat]||0)+1;}); const cats=Object.entries(categories).sort((a,b)=>b[1]-a[1]).slice(0,8); doughnut("blog-topic",cats.map((x)=>x[0]),cats.map((x)=>x[1]),["#0a4b55","#13707d","#2de68c","#7ba7a2","#b54708","#2867b2","#9b59b6","#526b6e"]);
  }

  function renderLinkedInCompany() {
    const source="linkedin_company",r=selectedRange(),p=previousRange();
    const connected=state.accounts.some((a)=>a.source===source)||state.content.some((c)=>c.source===source);
    const impressions=accountMetricTotal(source,["impressions"],r);
    const clicks=accountMetricTotal(source,["clicks"],r);
    const reactions=accountMetricTotal(source,["reactions"],r);
    const comments=accountMetricTotal(source,["comments"],r);
    const shares=accountMetricTotal(source,["shares"],r);
    const interactions=reactions+comments+shares;
    const followersNow=audience(source);
    const followersGained=accountMetricTotal(source,["followers_gained"],r);
    const pageViews=accountMetricTotal(source,["page_views"],r);
    const uniqueVisitors=accountMetricTotal(source,["unique_visitors"],r);
    const prevImpressions=p?accountMetricTotal(source,["impressions"],p):0;
    const prevFollowers=p?accountMetricTotal(source,["followers_gained"],p):0;
    const prevVisitors=p?accountMetricTotal(source,["unique_visitors"],p):0;
    const ctr=impressions?clicks/impressions:0;
    const interactionRate=impressions?interactions/impressions:0;
    const items=topContents([source],12,r);
    pageContent.innerHTML=`${!connected?`<div class="callout"><strong>Még nincs LinkedIn-adat.</strong><p>Töltsd fel a LinkedIn Content, Followers és Visitors XLS exportokat a privát collector repositoryba.</p></div>`:`<div class="callout"><strong>LinkedIn-adatok betöltve.</strong><p>Az oldal a hivatalos LinkedIn Content, Followers és Visitors XLS exportokból épül. Az API jóváhagyása után ugyanez az adatmodell automatikusan tovább tölthető.</p></div>`}
    <section class="kpi-grid six" style="margin-top:15px">
      ${kpi("Megjelenések",num(impressions,true),`CTR: ${pct(ctr)}`,p?delta(impressions,prevImpressions):undefined)}
      ${kpi("Kattintások",num(clicks,true),"LinkedIn-posztokra kattintás")}
      ${kpi("Interakciók",num(interactions,true),`interakciós arány: ${pct(interactionRate)}`)}
      ${kpi("Követők (export)",followersNow?num(followersNow,true):"–",followersNow?"demográfiai export összesítése":"az exportból nem volt biztosan meghatározható")}
      ${kpi("Új követők",num(followersGained,true),rangeLabel(),p?delta(followersGained,prevFollowers):undefined)}
      ${kpi("Egyedi oldallátogatók",num(uniqueVisitors,true),`${num(pageViews,true)} oldalmegtekintés`,p?delta(uniqueVisitors,prevVisitors):undefined)}
    </section>
    <section class="grid-2">
      <article class="panel"><div class="panel-heading"><div><p class="eyebrow">KÖVETŐNÖVEKEDÉS</p><h2>Új követők alakulása</h2></div><span class="panel-note">napi új követők + 28 napos átlag</span></div><div class="chart-wrap"><canvas id="linkedin-followers-chart"></canvas></div></article>
      <article class="panel"><div class="panel-heading"><div><p class="eyebrow">OLDALLÁTOGATOTTSÁG</p><h2>LinkedIn-oldal látogatói</h2></div><span class="panel-note">oldalmegtekintések és egyedi látogatók</span></div><div class="chart-wrap"><canvas id="linkedin-visitors-chart"></canvas></div></article>
    </section>
    <section class="grid-2">
      <article class="panel"><div class="panel-heading"><div><p class="eyebrow">TARTALMI TELJESÍTMÉNY</p><h2>Megjelenések és kattintások</h2></div><span class="panel-note">napi organikus + szponzorált összesen</span></div><div class="chart-wrap"><canvas id="linkedin-performance-chart"></canvas></div></article>
      <article class="panel"><div class="panel-heading"><div><p class="eyebrow">FORMÁTUMOK</p><h2>Tartalomtípusok eredménye</h2></div></div><div id="linkedin-format-rank" class="rank-list"></div></article>
    </section>${contentTable(items,"LinkedIn – legjobban teljesítő posztok")}`;

    const followerSeries=accountFlowSeries(source,["followers_gained"],r);
    chart("linkedin-followers-chart",{type:"bar",data:{labels:followerSeries.labels,datasets:[{type:"bar",label:"Új követők",data:followerSeries.values,backgroundColor:"rgba(40,103,178,.28)",borderColor:"#2867b2",borderWidth:1,borderRadius:5},{type:"line",label:"28 napos átlag",data:movingAverage(followerSeries.values,28),borderColor:"#2de68c",backgroundColor:"transparent",pointRadius:0,tension:.3,borderWidth:2}]},options:{responsive:true,maintainAspectRatio:false,interaction:{mode:"index",intersect:false},plugins:{legend:{display:true,position:"bottom"}},scales:{x:{grid:{display:false},ticks:{maxTicksLimit:10}},y:{beginAtZero:true,grid:{color:"rgba(16,45,49,.06)"},ticks:{precision:0}}}}});

    const visitorSeries=accountFlowSeries(source,["unique_visitors"],r);
    const pageViewSeries=accountFlowSeries(source,["page_views"],r);
    lineChart("linkedin-visitors-chart",visitorSeries.labels,[{label:"Egyedi látogatók",data:visitorSeries.values,borderColor:"#2867b2",backgroundColor:"rgba(40,103,178,.08)",fill:true,pointRadius:0,tension:.25},{label:"Oldalmegtekintések",data:pageViewSeries.values,borderColor:"#2de68c",backgroundColor:"transparent",pointRadius:0,tension:.25}]);

    const impressionSeries=accountFlowSeries(source,["impressions"],r);
    const clickSeries=accountFlowSeries(source,["clicks"],r);
    lineChart("linkedin-performance-chart",impressionSeries.labels,[{label:"Megjelenések",data:impressionSeries.values,borderColor:"#2867b2",backgroundColor:"rgba(40,103,178,.08)",fill:true,pointRadius:0,tension:.25},{label:"Kattintások",data:clickSeries.values,borderColor:"#2de68c",backgroundColor:"transparent",pointRadius:0,tension:.25}]);

    const formats={};
    contents([source],r).forEach((c)=>{const f=(c.content_type||"poszt").toLowerCase();formats[f]??={count:0,exp:0,clicks:0};formats[f].count++;formats[f].exp+=contentMetric(c,["impressions"]);formats[f].clicks+=contentMetric(c,["clicks"]);});
    const formatRows=Object.entries(formats).map(([name,x])=>({name,...x})).sort((a,b)=>b.exp-a.exp);
    const max=Math.max(...formatRows.map((x)=>x.exp),1);
    $("linkedin-format-rank").innerHTML=formatRows.map((x,i)=>`<div class="rank-row"><span class="rank-index">${i+1}</span><div class="rank-title">${esc(x.name)}<small>${num(x.count)} poszt · ${num(x.clicks)} kattintás</small><div class="progress"><span style="width:${x.exp/max*100}%"></span></div></div><span class="rank-value">${num(x.exp,true)}</span></div>`).join("")||`<div class="empty-state">Még nincs formátumadat.</div>`;
  }

  function platformConfig(source) {
    const configs={
      linkedin_company:{cards:[["Megjelenések","exposure"],["Kattintások","clicks"],["Interakciók","engagement"],["Követők","audience"],["Új követők","followers_gained"],["Publikált posztok","publishing"]],note:"A vállalati oldal natív statisztikái."},
      linkedin_ceo:{cards:[["Megjelenések","exposure"],["Kattintások","clicks"],["Interakciók","engagement"],["Profilmegtekintések","profile_views"],["Tartalomból szerzett követők","followers_gained"],["Publikált posztok","publishing"]],note:"A CEO LinkedIn API-jogosultságától függő adatok."},
      facebook:{cards:[["Megtekintések","exposure"],["Kattintások","clicks"],["Interakciók","engagement"],["Követők","audience"],["Megosztások","shares"],["Publikált posztok","publishing"]],note:"Facebook-oldal és posztstatisztikák."},
      instagram:{cards:[["Megtekintések","exposure"],["Elérés","reach"],["Interakciók","engagement"],["Követők","audience"],["Mentések","saved"],["Publikált tartalmak","publishing"]],note:"Instagram üzleti fiók statisztikái."},
      youtube:{cards:[["Megtekintések","exposure"],["Nézési idő","watch_minutes"],["Interakciók","engagement"],["Feliratkozók","audience"],["Új feliratkozók","subscribers_gained"],["Publikált videók","publishing"]],note:"YouTube Analytics és csatornastatisztikák."},
    }; return configs[source];
  }
  function customMetric(source,name,range=selectedRange()) { if(name==="audience")return audience(source);if(["exposure","clicks","engagement","publishing"].includes(name))return sourceMetric(source,name,range);const account=accountMetricTotal(source,[name],range);if(account)return account;return contents([source],range).reduce((s,c)=>s+contentMetric(c,[name]),0); }
  function renderPlatform(source) {
    if(source==="linkedin_company"){renderLinkedInCompany();return;}
    const pc=platformConfig(source),r=selectedRange(),p=previousRange(); const connected=state.accounts.some((a)=>a.source===source)||state.content.some((c)=>c.source===source); const items=topContents([source],12,r);
    pageContent.innerHTML=`${!connected?`<div class="callout"><strong>Ez a csatorna még nincs bekötve.</strong><p>Az oldal szerkezete kész. Az API-kulcsok és jogosultságok beállítása után az adatok automatikusan megjelennek.</p></div>`:""}<section class="kpi-grid six" style="margin-top:${connected?0:15}px">${pc.cards.map(([label,key])=>{const value=customMetric(source,key,r),prev=p?customMetric(source,key,p):0;const formatted=key==="watch_minutes"?`${num(value)} perc`:num(value,true);return kpi(label,formatted,pc.note,["audience"].includes(key)?undefined:delta(value,prev));}).join("")}</section>
    <section class="grid-2"><article class="panel"><div class="panel-heading"><div><p class="eyebrow">TELJESÍTMÉNYTREND</p><h2>${esc(SOURCE[source].short)} – fő mutató</h2></div><span class="panel-note">napi érték + mozgóátlagok</span></div><div class="chart-wrap"><canvas id="platform-trend"></canvas></div></article><article class="panel"><div class="panel-heading"><div><p class="eyebrow">FORMÁTUMOK</p><h2>Tartalomtípusok eredménye</h2></div></div><div id="format-rank" class="rank-list"></div></article></section>${contentTable(items,`${SOURCE[source].label} – legjobb tartalmak`)}`;
    const series=dailySeries(source,"exposure",r); lineChart("platform-trend",series.labels,[{label:"Napi érték",data:series.values,borderColor:`${SOURCE[source].color}55`,backgroundColor:`${SOURCE[source].color}12`,fill:true,pointRadius:0},{label:"7 napos átlag",data:movingAverage(series.values,7),borderColor:SOURCE[source].color,pointRadius:0,tension:.25},{label:"28 napos átlag",data:movingAverage(series.values,28),borderColor:"#2de68c",pointRadius:0,tension:.25}]);
    const formats={}; contents([source],r).forEach((c)=>{const f=(c.content_type||"tartalom").toLowerCase();formats[f]??={count:0,exp:0};formats[f].count++;formats[f].exp+=contentStats(c).exposure;}); const rows=Object.entries(formats).map(([name,x])=>({name,...x})).sort((a,b)=>b.exp-a.exp); const max=Math.max(...rows.map((x)=>x.exp),1); $("format-rank").innerHTML=rows.map((x,i)=>`<div class="rank-row"><span class="rank-index">${i+1}</span><div class="rank-title">${esc(x.name)}<small>${num(x.count)} tartalom</small><div class="progress"><span style="width:${x.exp/max*100}%"></span></div></div><span class="rank-value">${num(x.exp,true)}</span></div>`).join("")||`<div class="empty-state">Még nincs formátumadat.</div>`;
  }

  function renderContentExplorer() {
    pageContent.innerHTML=`<article class="panel"><div class="panel-heading"><div><p class="eyebrow">KERESÉS ÉS SZŰRÉS</p><h2>Minden tartalom</h2></div><div class="table-tools"><input id="content-search" type="search" placeholder="Keresés címben, szerzőben…"><select id="content-source"><option value="all">Minden csatorna</option>${ALL_SOURCES.map((s)=>`<option value="${s}">${SOURCE[s].label}</option>`).join("")}</select><select id="content-sort"><option value="date">Legfrissebb</option><option value="exposure">Legnagyobb elsődleges eredmény</option><option value="clicks">Legtöbb kattintás</option><option value="engagement">Legtöbb interakció</option></select></div></div><div class="table-wrap"><table><thead><tr><th>Tartalom</th><th>Csatorna</th><th>Típus</th><th>Dátum</th><th class="num">Elsődleges eredmény</th><th class="num">Kattintás</th><th class="num">Interakció</th></tr></thead><tbody id="explorer-body"></tbody></table></div><p id="explorer-count" class="metric-definition"></p></article>`;
    const update=()=>{
      const q=$("content-search").value.trim().toLocaleLowerCase("hu");
      const src=$("content-source").value;
      const sort=$("content-sort").value;
      let items=contents(src==="all"?ALL_SOURCES:[src]).filter((c)=>!q||`${c.title} ${c.author} ${c.body}`.toLocaleLowerCase("hu").includes(q)).map((c)=>({c,s:contentStats(c)}));
      items.sort((a,b)=>sort==="date"?String(b.c.published_at).localeCompare(String(a.c.published_at)):b.s[sort]-a.s[sort]);
      $("explorer-body").innerHTML=items.slice(0,300).map(({c,s})=>`<tr><td><a href="#" class="content-link" data-content="${esc(c.source)}|${esc(c.external_id)}">${esc(clampText(c.title,95))}</a><div class="metric-definition">${esc(c.author||"")}</div></td><td>${sourceBadge(c.source)}</td><td>${esc(c.content_type||"tartalom")}</td><td>${dateHU(c.published_at)}</td><td class="num">${num(s.exposure)}<div class="metric-definition">${esc(primaryMetricLabel(c.source))}</div></td><td class="num">${num(s.clicks)}</td><td class="num">${num(s.engagement)}</td></tr>`).join("")||`<tr><td colspan="7"><div class="empty-state">Nincs megfelelő találat.</div></td></tr>`;
      $("explorer-count").textContent=`${num(items.length)} találat · legfeljebb 300 sor megjelenítve`;
      bindContentLinks();
    };
    [$("content-search"),$("content-source"),$("content-sort")].forEach((el)=>el.addEventListener(el.tagName==="INPUT"?"input":"change",update));
    update();
  }

  const STOP=new Set("a az egy és vagy de hogy is itt ott nem igen mi mit mire ezt azt van volt lesz for from the with this that into your our their egyéb így ahol amely amikor mint már még után előtt közben".split(" "));
  function tokens(text){return [...new Set(String(text||"").toLocaleLowerCase("hu").normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9áéíóöőúüű ]/gi," ").split(/\s+/).filter((x)=>x.length>3&&!STOP.has(x)))];}
  function similarity(a,b){const A=new Set(tokens(a)),B=new Set(tokens(b));if(!A.size||!B.size)return 0;let inter=0;A.forEach((x)=>{if(B.has(x))inter++;});return inter/Math.min(A.size,B.size);}
  function topicFor(c){const text=`${c.title} ${c.body}`.toLocaleLowerCase("hu");const tests=[["Ingatlan",/ingatlan|iroda|bevásárló|retail|lakás|épület|bérlő/],["Makrogazdaság",/infláció|kamat|forint|gdp|gazdaság|munkaerő|mnb|jegybank/],["Mesterséges intelligencia",/mesterséges intelligencia|\bai\b|chip|nvidia|tsmc/],["Befektetési alapok",/befektetési alap|hozam|portfólió|kötvény|részvény/],["Nemzetközi piacok",/amerika|európa|kína|románia|szerbia|belgrád|bukarest/],["Vállalati hírek",/gránit|alapkezelő|díj|kinevez|irodanyitás/],["ESG",/esg|fenntartható|zöld|klíma/]];return tests.find(([,re])=>re.test(text))?.[0]||c.metadata?.category_names?.[0]||"Egyéb";}
  function storyClusters() {
    const all=contents(OWN_SOURCES).sort((a,b)=>String(b.published_at).localeCompare(String(a.published_at))).slice(0,800);const clusters=[];
    all.forEach((c)=>{const d=new Date(c.published_at);let best=null,bestScore=.25;for(const cluster of clusters){const sd=new Date(cluster.seed.published_at);if(Math.abs(d-sd)>21*86400000)continue;const score=similarity(c.title+" "+c.body,cluster.seed.title+" "+cluster.seed.body);if(score>bestScore){best=cluster;bestScore=score;}}if(best)best.items.push(c);else clusters.push({seed:c,items:[c]});});
    const multi=clusters.filter((x)=>x.items.length>1).map((x)=>{const stats=x.items.map(contentStats);return {...x,exposure:stats.reduce((s,v)=>s+v.exposure,0),clicks:stats.reduce((s,v)=>s+v.clicks,0),engagement:stats.reduce((s,v)=>s+v.engagement,0)};}).sort((a,b)=>(b.exposure+b.clicks*4)-(a.exposure+a.clicks*4));return multi;
  }
  function renderStories(){const clusters=storyClusters();const topics={};contents(OWN_SOURCES).forEach((c)=>{const t=topicFor(c);topics[t]??={count:0,exp:0,clicks:0};const s=contentStats(c);topics[t].count++;topics[t].exp+=s.exposure;topics[t].clicks+=s.clicks;});const topicRows=Object.entries(topics).map(([name,v])=>({name,...v})).sort((a,b)=>b.exp-a.exp);
    pageContent.innerHTML=`<div class="callout"><strong>Automatikus sztoricsoportosítás</strong><p>A rendszer cím-, szöveg- és időbeli hasonlóság alapján kapcsolja össze a különböző csatornák tartalmait. A találatok tájékoztató jellegűek, de már képesek megmutatni a keresztcsatornás kommunikációt.</p></div><section class="grid-2 equal" style="margin-top:15px"><article class="panel"><div class="panel-heading"><div><p class="eyebrow">TÉMATELJESÍTMÉNY</p><h2>Legerősebb témák</h2></div></div><div class="chart-wrap"><canvas id="topic-chart"></canvas></div></article><article class="panel"><div class="panel-heading"><div><p class="eyebrow">TÉMARANGSOR</p><h2>Tartalmak és kattintások</h2></div></div><div id="topic-rank" class="rank-list"></div></article></section><div class="section-title"><div><p class="eyebrow">KERESZTCSATORNÁS CSOPORTOK</p><h2>Feltételezett közös sztorik</h2></div><span class="panel-note">${num(clusters.length)} többcsatornás csoport</span></div><section class="grid-3">${clusters.slice(0,18).map((x)=>`<article class="story-card"><h3>${esc(clampText(x.seed.title,90))}</h3><p class="muted">${dateHU(x.seed.published_at)} · ${esc(topicFor(x.seed))}</p><div class="story-meta">${[...new Set(x.items.map((i)=>i.source))].map((s)=>`<span class="story-channel">${esc(SOURCE[s]?.short||s)}</span>`).join("")}</div><div class="story-stats"><div><strong>${num(x.exposure,true)}</strong><span>összes elsődleges eredmény</span></div><div><strong>${num(x.clicks)}</strong><span>kattintás</span></div><div><strong>${num(x.items.length)}</strong><span>tartalom</span></div></div></article>`).join("")||`<div class="empty-state"><strong>Még nincs elég keresztcsatornás tartalom.</strong>Legalább két hasonló téma szükséges.</div>`}</section>`;
    barChart("topic-chart",topicRows.slice(0,8).map((x)=>x.name),topicRows.slice(0,8).map((x)=>x.exp),topicRows.slice(0,8).map((_,i)=>["#0a4b55","#13707d","#2de68c","#b54708","#2867b2","#9b59b6","#7ba7a2","#526b6e"][i]));const max=Math.max(...topicRows.map((x)=>x.exp),1);$("topic-rank").innerHTML=topicRows.slice(0,9).map((x,i)=>`<div class="rank-row"><span class="rank-index">${i+1}</span><div class="rank-title">${esc(x.name)}<small>${num(x.count)} tartalom · ${num(x.clicks)} kattintás</small><div class="progress"><span style="width:${x.exp/max*100}%"></span></div></div><span class="rank-value">${num(x.exp,true)}</span></div>`).join("");
  }

  function observerItems(){return contents(["observer"]).map((c)=>({c,m:c.metadata||{},mentions:contentMetric(c,["media_mentions"]),stories:contentMetric(c,["media_stories"])})).sort((a,b)=>String(b.c.published_at).localeCompare(String(a.c.published_at)));}
  function renderObserver(){const items=observerItems();const r=selectedRange();const filtered=items.filter((x)=>inRange(x.c.published_at,r));const mentions=filtered.reduce((s,x)=>s+x.mentions,0);const interviews=filtered.filter((x)=>/interjú|nyilatkozat|megszólal/i.test(`${x.m.depth} ${x.m.mention_type}`)).length;const sources=new Set(filtered.flatMap((x)=>[x.m.primary_source,...(x.m.related_mentions||[]).map((y)=>y.source)].filter(Boolean)));const entities={};filtered.forEach((x)=>(x.m.entities||[]).forEach((e)=>entities[e]=(entities[e]||0)+x.mentions));const topEntities=Object.entries(entities).sort((a,b)=>b[1]-a[1]);const high=filtered.filter((x)=>Number(x.m.priority||0)>=4).length;
    pageContent.innerHTML=`<section class="kpi-grid six">${kpi("Egyedi médiatörténetek",num(filtered.length),rangeLabel())}${kpi("Összes megjelenés",num(mentions),"fő és hasonló megjelenések")}${kpi("Megszólalások / interjúk",num(interviews),"érdemi szakértői jelenlét")}${kpi("Egyedi médiumok",num(sources.size),"fő és kapcsolódó források")}${kpi("Legtöbbet szereplő",topEntities[0]?.[0]||"–",topEntities[0]?`${num(topEntities[0][1])} megjelenés`:"nincs adat")}${kpi("Kiemelt jelzések",num(high),"4–5-ös prioritás")}</section>
    <section class="grid-2"><article class="panel"><div class="panel-heading"><div><p class="eyebrow">MÉDIATREND</p><h2>Megjelenések időben</h2></div></div><div class="chart-wrap"><canvas id="observer-trend"></canvas></div></article><article class="panel"><div class="panel-heading"><div><p class="eyebrow">ÉRINTETTEK</p><h2>Legtöbbet említett entitások</h2></div></div><div id="entity-rank" class="rank-list"></div></article></section>
    <article class="panel"><div class="panel-heading"><div><p class="eyebrow">NAPI SAJTÓFIGYELÉS</p><h2>Médiamegjelenések</h2></div><div class="table-tools"><input id="observer-search" type="search" placeholder="Keresés címben, forrásban, személyben…"><select id="observer-type"><option value="all">Minden típus</option><option value="statement">Nyilatkozat / interjú</option><option value="mention">Említés</option></select></div></div><div class="table-wrap"><table><thead><tr><th>Dátum</th><th>Cím és összefoglaló</th><th>Forrás</th><th>Érintettek</th><th>Megjelenés mélysége</th><th class="num">Megjelenések</th><th>Prioritás</th></tr></thead><tbody id="observer-body"></tbody></table></div><p id="observer-count" class="metric-definition"></p></article>`;
    const series=dailySeries("observer","exposure",r);lineChart("observer-trend",series.labels,[{label:"Megjelenések",data:series.values,borderColor:"#b54708",backgroundColor:"rgba(181,71,8,.08)",fill:true,pointRadius:0,tension:.25},{label:"7 napos átlag",data:movingAverage(series.values,7),borderColor:"#0a4b55",pointRadius:0,tension:.25}]);const max=Math.max(...topEntities.map((x)=>x[1]),1);$("entity-rank").innerHTML=topEntities.slice(0,10).map(([name,v],i)=>`<div class="rank-row"><span class="rank-index">${i+1}</span><div class="rank-title">${esc(name)}<div class="progress"><span style="width:${v/max*100}%"></span></div></div><span class="rank-value">${num(v)}</span></div>`).join("")||`<div class="empty-state">Még nincs felismert entitás.</div>`;
    const update=()=>{const q=$("observer-search").value.trim().toLocaleLowerCase("hu"),type=$("observer-type").value;const rows=filtered.filter((x)=>{const text=`${x.c.title} ${x.c.body} ${x.m.primary_source} ${(x.m.entities||[]).join(" ")} ${x.m.depth}`.toLocaleLowerCase("hu");const statement=/interjú|nyilatkozat|megszólal/i.test(`${x.m.depth} ${x.m.mention_type}`);return (!q||text.includes(q))&&(type==="all"||(type==="statement"&&statement)||(type==="mention"&&!statement));});$("observer-body").innerHTML=rows.map((x)=>`<tr><td>${dateHU(x.c.published_at)}</td><td><a href="#" data-content="observer|${esc(x.c.external_id)}" class="content-link">${esc(x.c.title)}</a><p class="observer-summary">${esc(clampText(x.c.body,240))}</p></td><td>${x.c.url?`<a class="content-link" target="_blank" rel="noopener" href="${esc(x.c.url)}">${esc(x.m.primary_source||x.c.author||"Forrás")} ↗</a>`:esc(x.m.primary_source||x.c.author||"–")}</td><td><div class="tags">${(x.m.entities||[]).map((e)=>`<span class="tag">${esc(e)}</span>`).join("")||"–"}</div></td><td>${esc(x.m.depth||x.m.mention_type||"–")}</td><td class="num">${num(x.mentions)}</td><td><span class="priority p${Number(x.m.priority||2)}">${Number(x.m.priority||2)}</span></td></tr>`).join("")||`<tr><td colspan="7"><div class="empty-state">Nincs megfelelő találat.</div></td></tr>`;$("observer-count").textContent=`${num(rows.length)} médiatörténet · ${num(rows.reduce((s,x)=>s+x.mentions,0))} megjelenés`;bindContentLinks();};$("observer-search").addEventListener("input",update);$("observer-type").addEventListener("change",update);update();
  }

  function renderAI(){const report=state.reports[0];const insights=deterministicInsights();pageContent.innerHTML=`<section class="grid-2"><article class="panel"><div class="panel-heading"><div><p class="eyebrow">LEGFRISSEBB AI-RIPORT</p><h2>${report?`${dateHU(report.period_start)} – ${dateHU(report.period_end)}`:"Még nincs API-alapú riport"}</h2></div>${report?`<span class="tag">${esc(report.model)}</span>`:""}</div><div class="ai-report">${report?esc(report.report_text):`Az automatikus, nagy nyelvi modellel készülő heti riport opcionális. A privát collector-repositoryban beállított OpenAI API-kulccsal és modellel kapcsolható be.`}</div></article><article class="panel"><div class="panel-heading"><div><p class="eyebrow">AZONNALI ELEMZÉS</p><h2>A jelenlegi adatokból</h2></div></div>${insightsHtml(insights)}</article></section><section class="grid-2 equal"><article class="panel"><div class="panel-heading"><div><p class="eyebrow">JAVASOLT KÉRDÉSEK</p><h2>Mire használható az AI-réteg?</h2></div></div><div class="insight-list">${["Mely témák teljesítettek legjobban LinkedInen az elmúlt hat hónapban?","Mely Grandio-cikkek kapták a legtöbb hírlevélkattintást?","Mely sajtómegjelenések igényelnek kommunikációs reakciót?","Mi okozhatta a blogforgalom változását?"].map((q)=>`<div class="insight"><strong>${esc(q)}</strong><p>A későbbi interaktív AI-chat ezekre az adatbázisból, ellenőrizhető számokkal válaszolhat.</p></div>`).join("")}</div></article><article class="panel"><div class="panel-heading"><div><p class="eyebrow">BIZTONSÁG</p><h2>Mit csinál és mit nem?</h2></div></div><div class="callout"><p><strong>Az AI csak olvas.</strong> Nem töröl adatot, nem kezel API-kulcsokat, nem publikál posztot és nem küld sajtóreakciót.</p><p>Minden fontos következtetésnek konkrét mérőszámhoz, időszakhoz és csatornához kell kapcsolódnia.</p></div></article></section>`;}

  function expectedSources(){return [{id:"wordpress",label:"Grandio – WordPress",source:"blog"},{id:"mailchimp",label:"Mailchimp",source:"mailchimp"},{id:"ga4",label:"Google Analytics 4",source:"blog"},{id:"search_console",label:"Search Console",source:"blog"},{id:"youtube",label:"YouTube",source:"youtube"},{id:"meta",label:"Facebook és Instagram",source:"facebook"},{id:"linkedin",label:"LinkedIn",source:"linkedin_company"},{id:"observer",label:"Observer Gmail",source:"observer"},{id:"ai_report",label:"AI heti riport",source:"ai"}];}
  function renderConnections(){const latest=Object.fromEntries(latestSync().map((x)=>[x.source,x]));pageContent.innerHTML=`<section class="grid-3">${expectedSources().map((e)=>{const r=latest[e.id];let status="missing";if(r){const age=(Date.now()-new Date(r.finished_at||r.started_at))/86400000;status=r.status==="error"?"error":age>3?"stale":"success";}return `<article class="panel"><div class="panel-heading"><div><p class="eyebrow">${esc(e.id.toUpperCase())}</p><h2>${esc(e.label)}</h2></div>${statusBadge(status)}</div>${r?`<p><strong>Utolsó futás:</strong> ${dateTimeHU(r.finished_at||r.started_at)}</p><p><strong>Beírt sorok:</strong> ${num(r.records_written)}</p><p class="muted">${esc(r.message||"")}</p>`:`<div class="empty-state"><strong>Még nem futott le.</strong>Állítsd be a szükséges GitHub secretet és változót, majd indítsd el az Actions fülön.</div>`}</article>`;}).join("")}</section><article class="panel"><div class="panel-heading"><div><p class="eyebrow">ADATBÁZIS</p><h2>Jelenlegi adattartalom</h2></div></div><div class="table-wrap"><table><thead><tr><th>Forrás</th><th class="num">Fiókok</th><th class="num">Tartalmak</th><th class="num">Mérési sorok</th><th>Legutóbbi tartalom</th></tr></thead><tbody>${ALL_SOURCES.map((s)=>{const acc=state.accounts.filter((x)=>x.source===s).length,con=state.content.filter((x)=>x.source===s),met=state.metrics.filter((x)=>x.source===s).length;return `<tr><td>${sourceBadge(s)}</td><td class="num">${num(acc)}</td><td class="num">${num(con.length)}</td><td class="num">${num(met)}</td><td>${dateHU(con.sort((a,b)=>String(b.published_at).localeCompare(String(a.published_at)))[0]?.published_at)}</td></tr>`;}).join("")}</tbody></table></div></article>`;}

  function renderPage(){destroyCharts();const meta=PAGE_META[state.page]||PAGE_META.overview;$("page-eyebrow").textContent=meta[0];$("page-title").textContent=meta[1];$("page-subtitle").textContent=meta[2];document.querySelectorAll(".nav-item").forEach((b)=>b.classList.toggle("active",b.dataset.page===state.page));const sourcePages=["linkedin_company","linkedin_ceo","facebook","instagram","youtube"];sourceFilterLabel.classList.add("hidden");if(state.page==="overview")renderOverview();else if(state.page==="newsletter")renderNewsletter();else if(state.page==="blog")renderBlog();else if(sourcePages.includes(state.page))renderPlatform(state.page);else if(state.page==="content")renderContentExplorer();else if(state.page==="stories")renderStories();else if(state.page==="observer")renderObserver();else if(state.page==="ai")renderAI();else if(state.page==="connections")renderConnections();else renderOverview();bindContentLinks();}

  function bindContentLinks(){document.querySelectorAll("[data-content]").forEach((el)=>{if(el.dataset.bound)return;el.dataset.bound="1";el.addEventListener("click",(ev)=>{ev.preventDefault();const [source,...rest]=el.dataset.content.split("|");showContent(source,rest.join("|"));});});}
  function showContent(source,id){const c=state.content.find((x)=>x.source===source&&String(x.external_id)===String(id));if(!c)return;const s=contentStats(c),m=c.metadata||{};$("modal-content").innerHTML=`<p class="eyebrow">${esc(sourceLabel(c.source))}</p><h2>${esc(c.title)}</h2><div class="modal-meta"><div><span>Publikálás</span><strong>${dateHU(c.published_at)}</strong></div><div><span>Szerző / forrás</span><strong>${esc(c.author||m.primary_source||"–")}</strong></div><div><span>${esc(primaryMetricLabel(c.source))}</span><strong>${num(s.exposure)}</strong></div><div><span>Kattintás · interakció</span><strong>${num(s.clicks)} · ${num(s.engagement)}</strong></div></div><div class="tags">${(m.entities||m.category_names||[]).map((x)=>`<span class="tag">${esc(x)}</span>`).join("")}</div><p class="modal-body">${esc(c.body||"Nincs kivonat.")}</p>${m.depth?`<div class="callout"><strong>Megjelenítés mélysége</strong><p>${esc(m.depth)}</p></div>`:""}${m.related_mentions?.length?`<h3 style="margin-top:18px">Hasonló megjelenések</h3><div class="insight-list">${m.related_mentions.map((x)=>`<div class="insight"><strong>${esc(x.source||"Kapcsolódó forrás")}</strong><p>${esc(x.title||"")}${x.url?` · ${esc(x.url)}`:""}</p></div>`).join("")}</div>`:""}${c.url?`<p style="margin-top:20px"><a class="primary-button" style="display:inline-flex;padding:11px 15px;text-decoration:none" target="_blank" rel="noopener" href="${esc(c.url)}">Eredeti tartalom megnyitása ↗</a></p>`:""}`;$("detail-modal").classList.remove("hidden");}

  function navigate(page){state.page=PAGE_META[page]?page:"overview";location.hash=state.page;renderPage();$("sidebar").classList.remove("open");window.scrollTo({top:0,behavior:"smooth"});}
  function wireEvents(){document.querySelectorAll(".nav-item").forEach((b)=>b.addEventListener("click",()=>navigate(b.dataset.page)));rangeSelect.addEventListener("change",renderPage);compareSelect.addEventListener("change",renderPage);sourceSelect.addEventListener("change",()=>{if(state.page==="overview")renderPage();});$("refresh-button").addEventListener("click",()=>loadData());$("menu-button").addEventListener("click",()=>$("sidebar").classList.toggle("open"));document.querySelectorAll("[data-close-modal]").forEach((x)=>x.addEventListener("click",()=>$("detail-modal").classList.add("hidden")));window.addEventListener("hashchange",()=>{const p=location.hash.replace("#","");if(PAGE_META[p]&&p!==state.page){state.page=p;renderPage();}});}

  async function init(){if(!configured){setupScreen.classList.remove("hidden");return;}state.client=window.supabase.createClient(cfg.supabaseUrl,cfg.supabasePublishableKey);wireEvents();const {data:{session}}=await state.client.auth.getSession();if(session){await enter(session.user);}else loginScreen.classList.remove("hidden");$("login-form").addEventListener("submit",async(e)=>{e.preventDefault();$("login-error").textContent="";const {data,error}=await state.client.auth.signInWithPassword({email:$("email").value,password:$("password").value});if(error){$("login-error").textContent=error.message;return;}await enter(data.user);});$("logout-button").addEventListener("click",async()=>{await state.client.auth.signOut();app.classList.add("hidden");loginScreen.classList.remove("hidden");});}
  async function enter(user){state.user=user;loginScreen.classList.add("hidden");setupScreen.classList.add("hidden");app.classList.remove("hidden");$("signed-in-user").textContent=user.email||"Bejelentkezve";await loadData();}
  init();
})();
