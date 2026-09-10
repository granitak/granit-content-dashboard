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
    linkedin_company: { label: "LinkedIn", short: "LinkedIn", color: "#2867b2", exposure: ["impressions", "reach"], clicks: ["clicks"], engagement: ["reactions", "comments", "shares", "saves"], audience: ["followers_anchor", "followers"] },
    facebook: { label: "Facebook", short: "Facebook", color: "#4267b2", exposure: ["page_views_total", "views", "reach"], clicks: ["clicks", "post_clicks"], engagement: ["reactions", "comments", "shares", "post_engaged_users"], audience: ["followers", "fans"] },
    instagram: { label: "Instagram", short: "Instagram", color: "#b93683", exposure: ["views", "reach"], clicks: ["clicks"], engagement: ["total_interactions", "accounts_engaged", "reactions", "comments", "shares", "saved"], audience: ["followers"] },
    youtube: { label: "YouTube", short: "YouTube", color: "#d92d20", exposure: ["views"], clicks: [], engagement: ["reactions", "comments", "shares"], audience: ["subscribers"] },
    observer: { label: "Observer", short: "Observer", color: "#b54708", exposure: ["media_mentions"], clicks: [], engagement: ["media_stories"], audience: [] },
  };
  const SOCIAL_SOURCES = ["linkedin_company", "facebook", "instagram", "youtube"];
  const OWN_SOURCES = ["blog", "mailchimp", ...SOCIAL_SOURCES];
  const ALL_SOURCES = [...OWN_SOURCES, "observer"];
  // Verified first usable data dates. In "Minden elérhető adat" mode the
  // source-specific charts start here instead of drawing a long artificial zero period.
  const SOURCE_DATA_START = {
    blog: "2025-04-25",
    linkedin_company: "2025-08-25",
    facebook: "2025-02-28",
    instagram: "2025-03-04",
    observer: "2025-09-17",
  };
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
    ai_analyst: ["AI DÖNTÉSTÁMOGATÁS", "AI elemző", "Kérdezz rá a csatornák, sztorik, teljesítmény és médiamegjelenések összefüggéseire a belső adatok alapján."],
    observer: ["MÉDIAFIGYELÉS", "Observer", "Legfrissebb sajtófigyelési jelentés, megjelenési trend, heti AI-összefoglaló és archívum."],
    connections: ["RENDSZERÁLLAPOT", "Adatkapcsolatok", "A collectorok frissessége, hibái és beállítási állapota."],
  };

  const state = {
    client: null, user: null, page: location.hash.replace("#", "") || "overview",
    accounts: [], content: [], metrics: [], syncRuns: [], ai: [], stories: [], storyItems: [], manualAssignments: [], reviewQueue: [], analystMessages: [], analystBusy: false, observerWeeklyBrief: null, observerWeeklyBusy: false, charts: [], loadedAt: null, indexes: null,
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
  function rangeLabelFor(range) { return range?.start ? `${dateHU(range.start)} – ${dateHU(range.end)}` : `Minden elérhető adat${range?.end ? ` · ${dateHU(range.end)}-ig` : ""}`; }
  function latestMetricDate(source, names = [], accountOnly = false) {
    let best = null;
    for (const row of state.metrics) {
      if (row.source !== source) continue;
      if (names.length && !names.includes(row.metric_name)) continue;
      if (accountOnly && String(row.content_external_id || "") !== "") continue;
      const key = String(row.metric_date || "").slice(0,10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) continue;
      const d = new Date(`${key}T23:59:59`);
      if (Number.isNaN(d.getTime())) continue;
      if (!best || d > best) best = d;
    }
    return best;
  }
  function sourceDataRange(source, base = selectedRange()) {
    const configs = {
      blog: { names:["web_views"], accountOnly:false },
      linkedin_company: { names:["impressions","clicks","followers_gained","page_views","unique_visitors"], accountOnly:true },
      facebook: { names:["page_views_total","views","reach"], accountOnly:false },
      instagram: { names:["views","reach"], accountOnly:false },
      observer: { names:["media_mentions"], accountOnly:false },
    };
    const config = configs[source];
    let start = base.start ? new Date(base.start) : null;
    let end = new Date(base.end);
    let days = base.days;

    // In max/all mode start exactly where usable source data begins.
    if (rangeSelect.value === "all" && SOURCE_DATA_START[source]) {
      start = new Date(`${SOURCE_DATA_START[source]}T00:00:00`);
      days = null;
    }

    // Do not pad lagging sources with fake zero days after their latest real metric.
    const latest = config ? latestMetricDate(source, config.names, config.accountOnly) : null;
    if (latest && end > latest) {
      end = new Date(latest); end.setHours(23,59,59,999);

      // For fixed rolling windows preserve the requested number of covered days.
      if (base.start && rangeSelect.value !== "all") {
        if (rangeSelect.value === "year") {
          start = new Date(end.getFullYear(),0,1); start.setHours(0,0,0,0);
          days = Math.ceil((end-start)/86400000)+1;
        } else {
          days = base.days || Math.ceil((base.end-base.start)/86400000)+1;
          start = new Date(end); start.setDate(start.getDate()-days+1); start.setHours(0,0,0,0);
        }
      }
    }
    return { ...base, start, end, days };
  }

  function previousRangeFor(range) {
    if (compareSelect.value === "none" || !range?.start || !range?.days) return null;
    const end = new Date(range.start); end.setDate(end.getDate()-1); end.setHours(23,59,59,999);
    const start = new Date(end); start.setDate(start.getDate()-range.days+1); start.setHours(0,0,0,0);
    return {start,end,days:range.days};
  }


  function latestContentDate(source) {
    const rows=state.content.filter((x)=>x.source===source&&x.published_at).sort((a,b)=>String(b.published_at).localeCompare(String(a.published_at)));
    return rows[0]?.published_at ? new Date(rows[0].published_at) : null;
  }
  function latestObserverReportDate() {
    const groups=observerReportGroups(observerItems());
    return groups[0]?.date||latestContentDate("observer");
  }
  function latestAvailableDate(source) {
    if(source==="blog") return latestMetricDate("blog",["web_views"],false)||latestContentDate(source);
    if(source==="linkedin_company") return latestMetricDate(source,["impressions","clicks","followers_gained","page_views","unique_visitors"],true)||latestContentDate(source);
    if(source==="observer") return latestObserverReportDate();
    const names=SOURCE[source]?.exposure||[];
    return latestMetricDate(source,names,false)||latestContentDate(source);
  }
  function freshnessSourcesForPage(page) {
    if(page==="overview") return ["blog","mailchimp","linkedin_company","facebook","instagram","observer"];
    if(page==="newsletter") return ["mailchimp"];
    if(page==="blog") return ["blog"];
    if(["linkedin_company","facebook","instagram","youtube"].includes(page)) return [page];
    if(page==="observer") return ["observer"];
    if(page==="stories"||page==="ai_analyst") return ["blog","mailchimp","linkedin_company","facebook","instagram","observer"];
    return [];
  }
  function injectFreshness() {
    const sources=freshnessSourcesForPage(state.page);
    if(!sources.length)return;
    const chips=sources.map((source)=>{
      const d=latestAvailableDate(source);
      if(source==="observer"){
        return `<span class="freshness-chip"><strong>Observer-jelentés</strong>${d?dateHU(d):"nincs adat"}</span>`;
      }
      return `<span class="freshness-chip"><strong>${esc(SOURCE[source]?.short||source)}</strong>${d?`${dateHU(d)}-ig`:"nincs adat"}</span>`;
    }).join("");
    pageContent.insertAdjacentHTML("afterbegin",`<div class="freshness-strip"><span>Adatfrissesség</span>${chips}</div>`);
  }

  function contentKey(source, externalId) { return `${source}\u0001${String(externalId ?? "")}`; }
  function metricContentKey(source, externalId, name) { return `${source}\u0001${String(externalId ?? "")}\u0001${name}`; }

  function buildRuntimeIndexes() {
    const contentByKey = new Map();
    const aiByKey = new Map();
    const storyItemsByStory = new Map();
    const storyItemByContent = new Map();
    const storyById = new Map();
    const manualByContent = new Map();
    const metricContent = new Map();

    for (const c of state.content) contentByKey.set(contentKey(c.source, c.external_id), c);
    for (const a of state.ai) aiByKey.set(contentKey(a.source, a.external_id), a);
    for (const s of state.stories) storyById.set(String(s.id), s);
    for (const m of state.manualAssignments) manualByContent.set(contentKey(m.source, m.external_id), m);

    for (const ref of state.storyItems) {
      const sid = String(ref.story_id);
      if (!storyItemsByStory.has(sid)) storyItemsByStory.set(sid, []);
      storyItemsByStory.get(sid).push(ref);
      storyItemByContent.set(contentKey(ref.source, ref.external_id), ref);
    }

    // Pre-aggregate content-level metrics once. This replaces thousands of repeated
    // full metric_daily scans during story/observer rendering.
    for (const row of state.metrics) {
      const externalId = String(row.content_external_id || "");
      if (!externalId) continue;
      const key = metricContentKey(row.source, externalId, row.metric_name);
      let bucket = metricContent.get(key);
      if (!bucket) {
        bucket = { flowSum: 0, snapshotDate: "", snapshotValue: 0, hasSnapshot: false };
        metricContent.set(key, bucket);
      }
      if (row.aggregation_type === "snapshot") {
        const d = String(row.metric_date || "");
        if (!bucket.hasSnapshot || d >= bucket.snapshotDate) {
          bucket.hasSnapshot = true;
          bucket.snapshotDate = d;
          bucket.snapshotValue = Number(row.metric_value || 0);
        }
      } else {
        bucket.flowSum += Number(row.metric_value || 0);
      }
    }

    state.indexes = {
      contentByKey, aiByKey, storyItemsByStory, storyItemByContent,
      storyById, manualByContent, metricContent,
      exposureCache: new Map(),
    };
  }

  function indexedContent(source, externalId) {
    return state.indexes?.contentByKey.get(contentKey(source, externalId)) || null;
  }
  function indexedStory(storyId) {
    return state.indexes?.storyById.get(String(storyId)) || null;
  }

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
  async function fetchOptionalPaged(table, orderColumn = null, ascending = false) {
    try { return await fetchPaged(table, orderColumn, ascending); }
    catch (error) { console.warn(`Optional table unavailable: ${table}`, error); return []; }
  }

  async function loadData(showMessage = true) {
    if (showMessage) $("last-refresh").textContent = "Adatok betöltése…";
    try {
      const [accounts, content, metrics, syncRuns, ai, stories, storyItems, manualAssignments] = await Promise.all([
        fetchPaged("accounts", "updated_at", false), fetchPaged("content_items", "published_at", false),
        fetchPaged("metric_daily", "metric_date", false), fetchPaged("sync_runs", "started_at", false),
        fetchOptionalPaged("content_ai", "generated_at", false),
        fetchOptionalPaged("stories", "end_date", false), fetchOptionalPaged("story_items", "updated_at", false),
        fetchOptionalPaged("story_manual_assignments", "updated_at", false),
      ]);
      Object.assign(state, { accounts, content, metrics, syncRuns, ai, stories, storyItems, manualAssignments, reviewQueue: [], loadedAt: new Date() });
      buildRuntimeIndexes();
      $("last-refresh").textContent = `Betöltve: ${dateTimeHU(state.loadedAt)}`;
      $("footer-data-note").textContent = `${num(content.length)} tartalom · ${num(metrics.length)} adatsor · ${num(stories.length)} sztori`;
      renderPage();
    } catch (error) {
      console.error(error); $("last-refresh").textContent = "Betöltési hiba";
      pageContent.innerHTML = `<div class="empty-state"><strong>Nem sikerült betölteni az adatokat.</strong>${esc(error.message || error)}</div>`;
    }
  }

  function newsletterPilotKey() {
    let first = null;
    for (const c of state.content) {
      if (c.source !== "mailchimp" || !c.published_at) continue;
      if (!first || String(c.published_at) < String(first.published_at)) first = c;
    }
    return first ? contentKey(first.source, first.external_id) : "";
  }
  function isNewsletterPilot(c) {
    return Boolean(c && c.source === "mailchimp" && newsletterPilotKey() === contentKey(c.source,c.external_id));
  }
  function contents(sources = ALL_SOURCES, range = selectedRange(), options = {}) {
    const includeNewsletterPilot = options.includeNewsletterPilot === true;
    return state.content.filter((c) =>
      sources.includes(c.source)
      && inRange(c.published_at, range)
      && (includeNewsletterPilot || !isNewsletterPilot(c))
    );
  }
  function metricRows(source, names, range = selectedRange(), contentId = undefined) {
    return state.metrics.filter((m) => m.source === source && names.includes(m.metric_name) && inRange(m.metric_date, range) && (contentId === undefined || String(m.content_external_id || "") === String(contentId || "")));
  }
  function latestSnapshot(source, names, contentId = "") {
    const rows = state.metrics.filter((m) => m.source === source && names.includes(m.metric_name) && String(m.content_external_id || "") === String(contentId || "") && m.aggregation_type === "snapshot").sort((a,b) => String(b.metric_date).localeCompare(String(a.metric_date)));
    return rows.length ? Number(rows[0].metric_value || 0) : 0;
  }
  function contentMetric(content, names) {
    if (!content) return 0;
    for (const name of names) {
      const bucket = state.indexes?.metricContent.get(metricContentKey(content.source, content.external_id, name));
      if (!bucket) continue;
      return bucket.hasSnapshot ? Number(bucket.snapshotValue || 0) : Number(bucket.flowSum || 0);
    }
    return 0;
  }
  function aiFor(sourceOrContent, externalId = null) {
    const source = typeof sourceOrContent === "object" ? sourceOrContent?.source : sourceOrContent;
    const id = typeof sourceOrContent === "object" ? sourceOrContent?.external_id : externalId;
    return state.indexes?.aiByKey.get(contentKey(source, id)) || null;
  }
  function contentPriority(content) {
    const ai = aiFor(content);
    return Number(ai?.final_priority ?? content?.metadata?.priority ?? 2);
  }
  function contentEntities(content) {
    const ai = aiFor(content);
    return (ai?.key_entities?.length ? ai.key_entities : (content?.metadata?.entities || content?.metadata?.category_names || []));
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
  function followerStockChart(id, source, series, label = "Követők") {
    const values=(series?.values||[]).map(Number).filter(Number.isFinite);
    if(!values.length)return;
    const min=safeMin(values,0),max=safeMax(values,0),pad=Math.max(5,Math.ceil((max-min)*.18),Math.ceil(max*.01));
    chart(id,{type:"line",data:{labels:series.labels,datasets:[{label,data:series.values,borderColor:SOURCE[source].color,backgroundColor:`${SOURCE[source].color}12`,fill:true,tension:.28,pointRadius:series.values.length>80?0:2,pointHoverRadius:5,borderWidth:2.5}]},options:{responsive:true,maintainAspectRatio:false,interaction:{mode:"index",intersect:false},plugins:{legend:{display:false}},scales:{x:{grid:{display:false},ticks:{maxTicksLimit:10}},y:{beginAtZero:false,suggestedMin:Math.max(0,min-pad),suggestedMax:max+pad,grid:{color:"rgba(16,45,49,.06)"},ticks:{precision:0}}}}});
  }

  function linkedInFollowerAnchor() {
    return state.metrics
      .filter((m)=>m.source==="linkedin_company" && m.metric_name==="followers_anchor" && !m.content_external_id && m.aggregation_type==="snapshot")
      .map((m)=>({date:dayKey(m.metric_date),value:Number(m.metric_value||0)}))
      .filter((x)=>x.date && x.value>0)
      .sort((a,b)=>b.date.localeCompare(a.date))[0] || null;
  }

  function linkedInFollowerStockSeries(range=selectedRange()) {
    const anchor=linkedInFollowerAnchor();
    if(!anchor){
      return snapshotSeries("linkedin_company",["followers"],range);
    }
    const gains=new Map();
    state.metrics
      .filter((m)=>m.source==="linkedin_company" && m.metric_name==="followers_gained" && !m.content_external_id && m.aggregation_type==="flow")
      .forEach((m)=>{const d=dayKey(m.metric_date);if(d)gains.set(d,(gains.get(d)||0)+Number(m.metric_value||0));});

    let start=range?.start?new Date(range.start):new Date(`${SOURCE_DATA_START.linkedin_company}T00:00:00`);
    let end=range?.end?new Date(range.end):new Date();
    const anchorDate=new Date(`${anchor.date}T12:00:00`);
    const calcStart=new Date(Math.min(start.getTime(),anchorDate.getTime()));
    const calcEnd=new Date(Math.max(end.getTime(),anchorDate.getTime()));
    calcStart.setHours(0,0,0,0);calcEnd.setHours(23,59,59,999);
    const dates=allDates({start:calcStart,end:calcEnd,days:null},800);
    const idx=dates.indexOf(anchor.date);
    if(idx<0)return {labels:[],values:[],dates:[]};

    const values=new Array(dates.length).fill(null);
    values[idx]=anchor.value;
    let current=anchor.value;
    for(let i=idx+1;i<dates.length;i++){current+=Number(gains.get(dates[i])||0);values[i]=current;}
    current=anchor.value;
    for(let i=idx-1;i>=0;i--){current-=Number(gains.get(dates[i+1])||0);values[i]=Math.max(0,current);}

    const keep=dates.map((d)=>inRange(d,range));
    const outDates=dates.filter((_,i)=>keep[i]);
    const outValues=values.filter((_,i)=>keep[i]);
    return {dates:outDates,labels:outDates.map(dateHU),values:outValues};
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
    const rows = overviewChannelRows(range,previous);
    const ownRows = rows.filter((x)=>x.source!=="observer" && x.value>0);
    const movers = ownRows.filter((x)=>previous && x.prev>0).map((x)=>({...x,change:delta(x.value,x.prev)})).filter((x)=>Number.isFinite(x.change));
    const strongest = [...movers].sort((a,b)=>b.change-a.change)[0];
    const weakest = [...movers].sort((a,b)=>a.change-b.change)[0];
    const bestContent = topContents(OWN_SOURCES,1,range)[0];
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

    let watch = "Nincs kiemelt technikai vagy teljesítményjelzés.";
    if(syncErrors.length) watch = `${syncErrors.map((x)=>sourceLabel(x.source)).join(", ")} legutóbbi adatgyűjtése hibával zárult, ezért az összkép hiányos lehet.`;
    else if(weakest && weakest.change<-.05) watch = `A legnagyobb visszaesés a ${sourceLabel(weakest.source)} csatornán látszik (${deltaHtml(weakest.change)} az előző azonos időszakhoz képest).`;
    else {
      const expert=observerItems().filter(isExpertAppearance).slice(0,1)[0];
      if(expert) watch=`A legfrissebb szakértői médiamegjelenés: „${esc(clampText(expert.c.title,100))}” (${dateHU(expert.c.published_at)}).`;
    }
    return { happened:happenedParts.join(" · "), worked, watch };
  }

  function briefingCard(kind,title,text) {
    const icon = kind==="worked" ? "↗" : kind==="watch" ? "!" : "●";
    return `<article class="briefing-card ${kind}"><div class="briefing-icon">${icon}</div><div><p class="eyebrow">${esc(title)}</p><p>${text}</p></div></article>`;
  }
  function storyContentRows(storyId) {
    const refs = state.indexes?.storyItemsByStory.get(String(storyId)) || [];
    return refs.map((ref)=>{
      const c = indexedContent(ref.source, ref.external_id);
      return c ? {c, ref, s:contentStats(c)} : null;
    }).filter(Boolean);
  }
  function storySummary(story) {
    const rows=storyContentRows(story.id), owned=rows.filter((x)=>x.c.source!=="observer"), media=rows.filter((x)=>x.c.source==="observer");
    const native={};
    owned.forEach((x)=>{native[x.c.source]??={exposure:0,clicks:0,engagement:0,count:0};native[x.c.source].exposure+=x.s.exposure;native[x.c.source].clicks+=x.s.clicks;native[x.c.source].engagement+=x.s.engagement;native[x.c.source].count++;});
    return {story,rows,owned,media,channels:[...new Set(rows.map((x)=>x.c.source))],native,mentions:media.reduce((sum,x)=>sum+contentMetric(x.c,["media_mentions"]),0)};
  }
  function storiesInRange(range=selectedRange()) { return state.stories.filter((s)=>inRange(`${s.end_date||s.start_date}T12:00:00`,range)).map(storySummary); }
  function percentileCacheKey(source, range) {
    const a = range?.start ? dayKey(range.start) : "all";
    const b = range?.end ? dayKey(range.end) : "now";
    return `${source}|${a}|${b}`;
  }
  function exposureValuesForSource(source,range=selectedRange()) {
    const key=percentileCacheKey(source,range);
    const cache=state.indexes?.exposureCache;
    if(cache?.has(key)) return cache.get(key);
    const vals=contents([source],range).map((c)=>contentStats(c).exposure).filter((v)=>v>0).sort((a,b)=>a-b);
    cache?.set(key,vals);
    return vals;
  }
  function sourcePercentile(source,value,range=selectedRange()) {
    const vals=exposureValuesForSource(source,range);
    if(!vals.length||value<=0)return 0;
    // binary search: number of values <= requested value
    let lo=0,hi=vals.length;
    while(lo<hi){const mid=(lo+hi)>>1;if(vals[mid]<=value)lo=mid+1;else hi=mid;}
    return Math.round(lo/vals.length*100);
  }
  function storyPerformanceScore(x,range=selectedRange()) {
    const scores=Object.entries(x.native).map(([source,v])=>sourcePercentile(source,Number(v.exposure||0),range)).filter((v)=>v>0);
    return scores.length?Math.round(scores.reduce((a,b)=>a+b,0)/scores.length):0;
  }
  function storyScore(x,range=selectedRange()){return storyPerformanceScore(x,range)+Math.min(10,Math.max(0,x.channels.filter((s)=>s!=="observer").length-1)*2);}
  function storyCoverageHtml(x) {
    return `<div class="story-coverage">${OWN_SOURCES.map((s)=>`<span class="${x.channels.includes(s)?"covered":"missing"}">${x.channels.includes(s)?"✓":"–"} ${esc(SOURCE[s]?.short||s)}</span>`).join("")}</div>`;
  }
  function storyNativeMetricsHtml(x,limit=4) {
    const rows=Object.entries(x.native).sort((a,b)=>Number(b[1].exposure)-Number(a[1].exposure)).slice(0,limit);
    return `<div class="story-native-metrics">${rows.map(([source,v])=>`<span><strong>${num(v.exposure,true)}</strong> ${esc(primaryMetricLabel(source))} · ${esc(SOURCE[source]?.short||source)}</span>`).join("")}${x.mentions?`<span><strong>${num(x.mentions)}</strong> sajtómegjelenés</span>`:""}</div>`;
  }
  function manualAssignmentFor(content){return state.indexes?.manualByContent.get(contentKey(content.source,content.external_id))||null;}
  function pendingReviewRows(){return state.reviewQueue.filter((x)=>x.status==="pending");}
  function overviewStoryCards(range) {
    const stories=storiesInRange(range).filter((x)=>x.rows.length>1||x.channels.length>1).sort((a,b)=>storyScore(b,range)-storyScore(a,range)).slice(0,3);
    if(stories.length) return stories.map((x)=>`<button class="overview-story-card story-link-button" data-story="${esc(x.story.id)}"><div class="overview-story-top"><div><p class="eyebrow">${x.media.length?"SAJÁT + EARNED MEDIA":"TÖBB CSATORNÁN"}</p><h3>${esc(clampText(x.story.title,90))}</h3></div><span class="story-count">${num(x.rows.length)}</span></div><div class="story-meta">${x.channels.map((s)=>`<span class="story-channel">${esc(SOURCE[s]?.short||s)}</span>`).join("")}</div><div class="overview-story-metrics"><span><strong>${num(storyPerformanceScore(x,range))}/100</strong> csatorna-normalizált score</span><span><strong>${num(x.mentions)}</strong> sajtómegjelenés</span></div></button>`).join("");
    const fallback=topContents(OWN_SOURCES,3,range);
    return fallback.map((x)=>`<article class="overview-story-card"><div class="overview-story-top"><div><p class="eyebrow">${esc(sourceLabel(x.c.source).toUpperCase())}</p><h3>${esc(clampText(x.c.title,90))}</h3></div></div><div class="overview-story-metrics"><span><strong>${num(x.s.exposure,true)}</strong> ${esc(primaryMetricLabel(x.c.source))}</span><span><strong>${num(x.s.engagement)}</strong> interakció</span></div></article>`).join("") || `<div class="empty-state">A Story Engine első futása után itt jelennek meg a keresztcsatornás sztorik.</div>`;
  }

  function renderOverview() {
    const r=selectedRange(), p=previousRange();
    const briefing=overviewBriefing(r,p);
    const channelRows=overviewChannelRows(r,p);
    pageContent.innerHTML=`
      <section class="executive-briefing">
        <div class="section-title overview-section-title"><div><p class="eyebrow">VEZETŐI BRIEFING</p><h2>Mi a fontos most?</h2></div><div class="overview-briefing-actions"><span class="panel-note">${esc(rangeLabel())}</span><button class="text-button" data-nav-page="ai_analyst">Kérdezd az AI-t →</button></div></div>
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
          <p class="metric-definition">Hybrid Story Engine: biztos URL-kapcsolások + szemantikus hasonlóság + idő/entitások + szükség esetén AI-validáció. A csatornák natív KPI-jait nem adjuk össze; a sztorik sorrendje csatornán belüli, normalizált teljesítményből készül.</p>
        </article>
      </section>`;
    pageContent.querySelectorAll("[data-nav-page]").forEach((el)=>el.addEventListener("click",()=>navigate(el.dataset.navPage)));bindStoryLinks();
  }

  function campaignRows(range=selectedRange(), includePilot=false) { return contents(["mailchimp"],range,{includeNewsletterPilot:includePilot}).map((c)=>({c,s:contentStats(c),m:c.metadata||{}})).sort((a,b)=>String(b.c.published_at).localeCompare(String(a.c.published_at))); }
  function newsletterAudienceChangeFromCampaigns(range=selectedRange()) {
    const campaigns=state.content
      .filter((c)=>c.source==="mailchimp" && c.published_at && !isNewsletterPilot(c))
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
    const r=selectedRange(), p=previousRange(), rows=campaignRows(r), archiveRows=campaignRows(r,true), prevRows=p?campaignRows(p):[];
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
    <div class="callout"><strong>A kiküldés nem elérés.</strong><p>A címzetti mennyiséget külön kezeljük; a tényleges teljesítményt az egyedi megnyitók, kattintók és azok arányai mutatják. A legelső pilot kampány automatikusan ki van zárva minden elemzésből és grafikonból; csak az alábbi archívumban marad látható.</p></div>
    <section class="grid-2 equal" style="margin-top:15px"><article class="panel"><div class="panel-heading"><div><p class="eyebrow">KIKÜLDÉS</p><h2>Kiküldött levelek</h2></div><span class="panel-note">kampányonkénti címzetti darabszám</span></div><div class="chart-wrap"><canvas id="mail-volume-chart"></canvas></div></article>
    <article class="panel"><div class="panel-heading"><div><p class="eyebrow">KAMPÁNYTREND</p><h2>Megnyitási és átkattintási arány</h2></div><span class="panel-note">egyedi címzettek / kézbesített levelek</span></div><div class="chart-wrap"><canvas id="mail-rate-chart"></canvas></div></article></section>
    <article class="panel"><div class="panel-heading"><div><p class="eyebrow">ARCHÍVUM</p><h2>Hírlevél-statisztika</h2></div><span class="panel-note">${num(rows.length)} elemzésbe vont · ${num(archiveRows.length)} archivált kampány</span></div><div class="table-wrap"><table id="newsletter-table" class="sortable-table"><thead><tr><th data-sort-type="date">Dátum</th><th data-sort-type="text">Cím</th><th class="num" data-sort-type="number">Kiküldve</th><th class="num" data-sort-type="number">Kézbesítve</th><th class="num" data-sort-type="number">Egyedi megnyitók</th><th class="num" data-sort-type="number">Egyedi kattintók</th><th class="num" data-sort-type="number">Visszapattanás</th><th class="num" data-sort-type="number">Leiratkozás</th><th>Legtöbbet kattintott link</th><th>Legsikeresebb Grandio-cikk</th></tr></thead><tbody>${archiveRows.length?archiveRows.map(({c,m})=>{
      const campaignSent=contentMetric(c,["emails_sent"]), campaignDelivered=contentMetric(c,["delivered"]), campaignOpens=contentMetric(c,["unique_opens"]), campaignClicks=contentMetric(c,["unique_clicks"]), campaignUnsub=contentMetric(c,["unsubscribes"]), campaignHard=contentMetric(c,["hard_bounces"]), campaignSoft=contentMetric(c,["soft_bounces"]), campaignBounce=campaignHard+campaignSoft;
      const pilot=isNewsletterPilot(c); return `<tr class="${pilot?"newsletter-pilot-row":""}"><td data-sort-value="${esc(c.published_at||"")}">${dateHU(c.published_at)}</td><td data-sort-value="${esc(c.title||"")}"><a class="content-link" data-content="mailchimp|${esc(c.external_id)}" href="#">${esc(c.title)}</a>${pilot?` <span class="newsletter-pilot-badge">pilot · elemzésből kizárva</span>`:""}</td><td class="num" data-sort-value="${campaignSent}">${num(campaignSent)}</td><td class="num" data-sort-value="${campaignDelivered}">${num(campaignDelivered)}<div class="metric-definition">${campaignSent?pct(campaignDelivered/campaignSent):"–"}</div></td><td class="num" data-sort-value="${campaignOpens}">${num(campaignOpens)}<div class="metric-definition">${campaignDelivered?pct(campaignOpens/campaignDelivered):"–"}</div></td><td class="num" data-sort-value="${campaignClicks}">${num(campaignClicks)}<div class="metric-definition">${campaignDelivered?pct(campaignClicks/campaignDelivered):"–"}</div></td><td class="num" data-sort-value="${campaignBounce}">${num(campaignBounce)}<div class="metric-definition">${campaignSent?pct(campaignBounce/campaignSent):"–"} · ${num(campaignHard)} hard / ${num(campaignSoft)} soft</div></td><td class="num" data-sort-value="${campaignUnsub}">${num(campaignUnsub)}<div class="metric-definition">${campaignDelivered?pct(campaignUnsub/campaignDelivered):"–"}</div></td><td>${m.top_link_url?`<a class="content-link" target="_blank" rel="noopener" href="${esc(m.top_link_url)}">${esc(clampText(m.top_link_url,55))}</a><div class="metric-definition">${num(m.top_link_unique_clicks||m.top_link_clicks)} egyedi kattintó</div>`:"–"}</td><td>${m.top_grandio_url?`<a class="content-link" target="_blank" rel="noopener" href="${esc(m.top_grandio_url)}">${esc(clampText(m.top_grandio_url,55))}</a><div class="metric-definition">${num(m.top_grandio_unique_clicks||m.top_grandio_clicks)} egyedi kattintó</div>`:"–"}</td></tr>`;
    }).join(""):`<tr><td colspan="10"><div class="empty-state"><strong>Nincs kampány ebben az időszakban.</strong></div></td></tr>`}</tbody></table></div></article>`;
    const chronological=[...rows].reverse(), sentValues=chronological.map((x)=>contentMetric(x.c,["emails_sent"]));
    const sentMin=safeMin(sentValues,0), sentMax=safeMax(sentValues,0), sentPad=Math.max(10,Math.ceil((sentMax-sentMin)*.18),Math.ceil(sentMax*.025));
    chart("mail-volume-chart",{type:"line",data:{labels:chronological.map((x)=>dateHU(x.c.published_at)),datasets:[{label:"Kiküldve",data:sentValues,borderColor:"#2de68c",backgroundColor:"rgba(45,230,140,.10)",fill:true,tension:.3,pointRadius:sentValues.length>35?0:3,pointHoverRadius:5,borderWidth:3}]},options:{responsive:true,maintainAspectRatio:false,interaction:{mode:"index",intersect:false},plugins:{legend:{display:false},tooltip:{callbacks:{label:(ctx)=>`Kiküldve: ${num(ctx.parsed.y)}`}}},scales:{x:{grid:{display:false},ticks:{maxTicksLimit:10}},y:{beginAtZero:false,suggestedMin:Math.max(0,sentMin-sentPad),suggestedMax:sentMax+sentPad,grid:{color:"rgba(16,45,49,.06)"},ticks:{precision:0}}}}});
    chart("mail-rate-chart",{type:"line",data:{labels:chronological.map((x)=>dateHU(x.c.published_at)),datasets:[{label:"Megnyitási arány",data:chronological.map((x)=>{const d=contentMetric(x.c,["delivered"]),o=contentMetric(x.c,["unique_opens"]);return d?o/d*100:0;}),borderColor:"#13707d",backgroundColor:"transparent",tension:.3},{label:"Átkattintási arány",data:chronological.map((x)=>{const d=contentMetric(x.c,["delivered"]),c=contentMetric(x.c,["unique_clicks"]);return d?c/d*100:0;}),borderColor:"#2de68c",backgroundColor:"transparent",tension:.3}]},options:{responsive:true,maintainAspectRatio:false,interaction:{mode:"index",intersect:false},plugins:{legend:{display:true,position:"bottom"}},scales:{x:{grid:{display:false}},y:{beginAtZero:true,ticks:{callback:(v)=>`${v}%`},grid:{color:"rgba(16,45,49,.06)"}}}}});
  }

  function renderBlog() {
    const r=sourceDataRange("blog",selectedRange()),p=previousRangeFor(r);
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
    const source="linkedin_company",r=sourceDataRange(source,selectedRange()),p=previousRangeFor(r);
    const connected=state.accounts.some((a)=>a.source===source)||state.content.some((c)=>c.source===source);
    const impressions=accountMetricTotal(source,["impressions"],r), clicks=accountMetricTotal(source,["clicks"],r), reactions=accountMetricTotal(source,["reactions"],r), comments=accountMetricTotal(source,["comments"],r), shares=accountMetricTotal(source,["shares"],r), interactions=reactions+comments+shares;
    const followerStock=linkedInFollowerStockSeries(r),followersNow=followerStock.values.at(-1)||audience(source), followersGained=accountMetricTotal(source,["followers_gained"],r), pageViews=accountMetricTotal(source,["page_views"],r), uniqueVisitors=accountMetricTotal(source,["unique_visitors"],r);
    const prevFollowerStock=p?linkedInFollowerStockSeries(p):{values:[]};
    const prevImpressions=p?accountMetricTotal(source,["impressions"],p):0, prevClicks=p?accountMetricTotal(source,["clicks"],p):0, prevInteractions=p?(accountMetricTotal(source,["reactions"],p)+accountMetricTotal(source,["comments"],p)+accountMetricTotal(source,["shares"],p)):0, prevFollowersGained=p?accountMetricTotal(source,["followers_gained"],p):0, prevVisitors=p?accountMetricTotal(source,["unique_visitors"],p):0, prevAudience=prevFollowerStock.values.at(-1)||0;
    const ctr=impressions?clicks/impressions:0, interactionRate=impressions?interactions/impressions:0, items=scoredContents([source],r);
    pageContent.innerHTML=`${!connected?`<div class="callout"><strong>Még nincs LinkedIn-adat.</strong><p>Töltsd fel a LinkedIn Content, Followers és Visitors XLS exportokat a privát collector repositoryba.</p></div>`:`<div class="callout"><strong>LinkedIn XLS-adatok betöltve.</strong><p>Ez a csatorna mostantól a hivatalos LinkedIn Content, Followers és Visitors XLS exportokra épül.</p></div>`}
    <section class="kpi-grid six" style="margin-top:15px">${kpi("Megjelenések",num(impressions,true),`CTR: ${pct(ctr)}`,p?delta(impressions,prevImpressions):undefined)}${kpi("Kattintások",num(clicks,true),"LinkedIn-posztokra kattintás",p?delta(clicks,prevClicks):undefined)}${kpi("Interakciók",num(interactions,true),`interakciós arány: ${pct(interactionRate)}`,p?delta(interactions,prevInteractions):undefined)}${kpi("Követők",followersNow?num(followersNow,true):"–",linkedInFollowerAnchor()?"rekonstruált követőállomány":"még nincs követő-anchor",p&&prevAudience?delta(followersNow,prevAudience):undefined)}${kpi("Nettó követőváltozás",num(followersGained,true),rangeLabelFor(r),p?delta(followersGained,prevFollowersGained):undefined)}${kpi("Egyedi oldallátogatók",num(uniqueVisitors,true),`${num(pageViews,true)} oldalmegtekintés`,p?delta(uniqueVisitors,prevVisitors):undefined)}</section>
    <article class="panel" style="margin-top:15px"><div class="panel-heading"><div><p class="eyebrow">KÖVETŐÁLLOMÁNY</p><h2>LinkedIn követők száma</h2></div><span class="panel-note">${linkedInFollowerAnchor()?`kalibrálva: ${dateHU(linkedInFollowerAnchor().date)} · ${num(linkedInFollowerAnchor().value)} követő`:"állítsd be a follower anchort"}</span></div><div class="chart-wrap"><canvas id="linkedin-follower-stock-chart"></canvas></div><p class="metric-definition">A teljes követőállományt egy biztos LinkedIn follower anchorból és a napi előjeles nettó követőváltozásból rekonstruáljuk. Ahol a napi sor folytonos, a visszaszámítás pontos.</p></article>
    <article class="panel" style="margin-top:15px"><div class="panel-heading"><div><p class="eyebrow">TARTALMI TELJESÍTMÉNY</p><h2>Megjelenések és kattintások</h2></div><span class="panel-note">napi organikus + szponzorált összesen · adatok ${dateHU(r.end)}-ig</span></div><div class="chart-wrap"><canvas id="linkedin-performance-chart"></canvas></div></article>
    <section class="grid-2" style="margin-top:15px"><article class="panel"><div class="panel-heading"><div><p class="eyebrow">KÖVETŐVÁLTOZÁS</p><h2>Nettó követőváltozás</h2></div><span class="panel-note">napi nettó változás + 28 napos átlag</span></div><div class="chart-wrap"><canvas id="linkedin-followers-chart"></canvas></div></article><article class="panel"><div class="panel-heading"><div><p class="eyebrow">OLDALLÁTOGATOTTSÁG</p><h2>LinkedIn-oldal látogatói</h2></div><span class="panel-note">oldalmegtekintések és egyedi látogatók</span></div><div class="chart-wrap"><canvas id="linkedin-visitors-chart"></canvas></div></article></section>${contentTable(items,"LinkedIn – összes poszt")}`;
    followerStockChart("linkedin-follower-stock-chart",source,followerStock,"Követők");
    const followerSeries=seriesWithMovingAverages((range)=>accountFlowSeries(source,["followers_gained"],range),r,[28]); chart("linkedin-followers-chart",{type:"bar",data:{labels:followerSeries.labels,datasets:[{type:"bar",label:"Nettó változás",data:followerSeries.values,backgroundColor:"rgba(40,103,178,.28)",borderColor:"#2867b2",borderWidth:1,borderRadius:5},{type:"line",label:"28 napos átlag",data:followerSeries.averages[28],borderColor:"#2de68c",backgroundColor:"transparent",pointRadius:0,tension:.3,borderWidth:2}]},options:{responsive:true,maintainAspectRatio:false,interaction:{mode:"index",intersect:false},plugins:{legend:{display:true,position:"bottom"}},scales:{x:{grid:{display:false},ticks:{maxTicksLimit:10}},y:{beginAtZero:true,grid:{color:"rgba(16,45,49,.06)"},ticks:{precision:0}}}}});
    const visitorSeries=accountFlowSeries(source,["unique_visitors"],r), pageViewSeries=accountFlowSeries(source,["page_views"],r); lineChart("linkedin-visitors-chart",visitorSeries.labels,[{label:"Egyedi látogatók",data:visitorSeries.values,borderColor:"#2867b2",backgroundColor:"rgba(40,103,178,.08)",fill:true,pointRadius:0,tension:.25},{label:"Oldalmegtekintések",data:pageViewSeries.values,borderColor:"#2de68c",backgroundColor:"transparent",pointRadius:0,tension:.25}]);
    const impressionSeries=accountFlowSeries(source,["impressions"],r), clickSeries=accountFlowSeries(source,["clicks"],r); lineChart("linkedin-performance-chart",impressionSeries.labels,[{label:"Megjelenések",data:impressionSeries.values,borderColor:"#2867b2",backgroundColor:"rgba(40,103,178,.08)",fill:true,pointRadius:0,tension:.25},{label:"Kattintások",data:clickSeries.values,borderColor:"#2de68c",backgroundColor:"transparent",pointRadius:0,tension:.25}]);
  }

  function platformConfig(source) {
    const configs={
      linkedin_company:{cards:[["Megjelenések","exposure"],["Kattintások","clicks"],["Interakciók","engagement"],["Követők","audience"],["Nettó követőváltozás","followers_gained"],["Publikált posztok","publishing"]],note:"A vállalati oldal natív statisztikái."},
      facebook:{cards:[["Megtekintések","exposure"],["Kattintások","clicks"],["Interakciók","engagement"],["Követők","audience"],["Megosztások","shares"],["Publikált posztok","publishing"]],note:"Facebook-oldal és posztstatisztikák."},
      instagram:{cards:[["Megtekintések","exposure"],["Elérés","reach"],["Interakciók","engagement"],["Követők","audience"],["Mentések","saved"],["Publikált tartalmak","publishing"]],note:"Instagram üzleti fiók statisztikái."},
      youtube:{cards:[["Megtekintések","exposure"],["Nézési idő","watch_minutes"],["Interakciók","engagement"],["Feliratkozók","audience"],["Új feliratkozók","subscribers_gained"],["Publikált videók","publishing"]],note:"YouTube Analytics és csatornastatisztikák."},
    }; return configs[source];
  }
  function customMetric(source,name,range=selectedRange()) { if(name==="audience")return audience(source);if(["exposure","clicks","engagement","publishing"].includes(name))return sourceMetric(source,name,range);const account=accountMetricTotal(source,[name],range);if(account)return account;return contents([source],range).reduce((s,c)=>s+contentMetric(c,[name]),0); }
  function renderPlatform(source) {
    if(source==="linkedin_company"){renderLinkedInCompany();return;}
    const pc=platformConfig(source),r=sourceDataRange(source,selectedRange()),p=previousRangeFor(r),connected=state.accounts.some((a)=>a.source===source)||state.content.some((c)=>c.source===source),items=scoredContents([source],r);
    const showFormats=source==="instagram";
    const cards=pc.cards.map(([label,key])=>{
      const value=key==="audience"?audience(source):customMetric(source,key,r);
      const prev=key==="audience"?(p?audienceAtEnd(source,p):0):(p?customMetric(source,key,p):0);
      const formatted=key==="watch_minutes"?`${num(value)} perc`:num(value,true);
      return kpi(label,formatted,pc.note,p&&prev?delta(value,prev):(p&&key!=="audience"?delta(value,prev):undefined));
    }).join("");
    const trendTitle=source==="facebook"||source==="instagram"?"Megtekintés / elérés":source==="youtube"?"Megtekintések":primaryMetricLabel(source);
    const showFollowerStock=source==="facebook"||source==="instagram";
    const followerStockPanel=showFollowerStock?`<article class="panel" style="margin-top:15px"><div class="panel-heading"><div><p class="eyebrow">KÖVETŐÁLLOMÁNY</p><h2>${esc(SOURCE[source].short)} követők száma</h2></div><span class="panel-note">natív követő-snapshotok</span></div><div class="chart-wrap"><canvas id="platform-follower-stock"></canvas></div></article>`:"";
    const trendPanel=`<article class="panel"><div class="panel-heading"><div><p class="eyebrow">TELJESÍTMÉNYTREND</p><h2>${esc(trendTitle)}</h2></div><span class="panel-note">napi érték + mozgóátlagok</span></div><div class="chart-wrap"><canvas id="platform-trend"></canvas></div></article>`;
    const formatPanel=showFormats?`<article class="panel"><div class="panel-heading"><div><p class="eyebrow">FORMÁTUMOK</p><h2>Tartalomtípusok eredménye</h2></div></div><div id="format-rank" class="rank-list"></div></article>`:"";
    pageContent.innerHTML=`${!connected?`<div class="callout"><strong>Ez a csatorna még nincs bekötve.</strong><p>Az adatkapcsolat beállítása után az adatok automatikusan megjelennek.</p></div>`:""}<section class="kpi-grid six" style="margin-top:${connected?0:15}px">${cards}</section>${followerStockPanel}${showFormats?`<section class="grid-2" style="margin-top:15px">${trendPanel}${formatPanel}</section>`:`<div style="margin-top:15px;margin-bottom:15px">${trendPanel}</div>`}${contentTable(items,`${SOURCE[source].label} – összes tartalom`,{showClicks:source!=="instagram"})}`;
    if(showFollowerStock){const stock=snapshotSeries(source,SOURCE[source].audience,r);followerStockChart("platform-follower-stock",source,stock,"Követők");}
    const series=seriesWithMovingAverages((range)=>dailySeries(source,"exposure",range),r,[7,28]); lineChart("platform-trend",series.labels,[{label:"Napi érték",data:series.values,borderColor:`${SOURCE[source].color}55`,backgroundColor:`${SOURCE[source].color}12`,fill:true,pointRadius:0},{label:"7 napos átlag",data:series.averages[7],borderColor:SOURCE[source].color,pointRadius:0,tension:.25},{label:"28 napos átlag",data:series.averages[28],borderColor:"#2de68c",pointRadius:0,tension:.25}]);
    if(showFormats){const formats={}; contents([source],r).forEach((c)=>{const f=(c.content_type||"tartalom").toLowerCase();formats[f]??={count:0,exp:0};formats[f].count++;formats[f].exp+=contentStats(c).exposure;}); const rows=Object.entries(formats).map(([name,x])=>({name,...x})).sort((a,b)=>b.exp-a.exp),max=safeMax(rows.map((x)=>x.exp),1)||1; $("format-rank").innerHTML=rows.map((x,i)=>`<div class="rank-row"><span class="rank-index">${i+1}</span><div class="rank-title">${esc(x.name)}<small>${num(x.count)} tartalom</small><div class="progress"><span style="width:${x.exp/max*100}%"></span></div></div><span class="rank-value">${num(x.exp,true)}</span></div>`).join("")||`<div class="empty-state">Még nincs formátumadat.</div>`;}
  }

  function renderContentExplorer() {
    pageContent.innerHTML=`<article class="panel"><div class="panel-heading"><div><p class="eyebrow">KERESÉS ÉS SZŰRÉS</p><h2>Minden tartalom</h2></div><div class="table-tools"><input id="content-search" type="search" placeholder="Keresés címben, szerzőben…"><select id="content-source"><option value="all">Minden csatorna</option>${ALL_SOURCES.map((s)=>`<option value="${s}">${SOURCE[s].label}</option>`).join("")}</select><select id="content-sort"><option value="date">Legfrissebb</option><option value="exposure">Legnagyobb elsődleges eredmény</option><option value="clicks">Legtöbb kattintás</option><option value="engagement">Legtöbb interakció</option></select></div></div><div class="table-wrap"><table id="explorer-table" class="sortable-table"><thead><tr><th data-sort-type="text">Tartalom</th><th data-sort-type="text">Csatorna</th><th data-sort-type="text">Típus</th><th data-sort-type="date">Dátum</th><th class="num" data-sort-type="number">Elsődleges eredmény</th><th class="num" data-sort-type="number">Kattintás</th><th class="num" data-sort-type="number">Interakció</th></tr></thead><tbody id="explorer-body"></tbody></table></div><p id="explorer-count" class="metric-definition"></p></article>`;
    const update=()=>{const q=$("content-search").value.trim().toLocaleLowerCase("hu"),src=$("content-source").value,sort=$("content-sort").value;let items=contents(src==="all"?ALL_SOURCES:[src]).filter((c)=>!q||`${c.title} ${c.author} ${c.body}`.toLocaleLowerCase("hu").includes(q)).map((c)=>({c,s:contentStats(c)}));items.sort((a,b)=>sort==="date"?String(b.c.published_at).localeCompare(String(a.c.published_at)):b.s[sort]-a.s[sort]);
      const visibleItems=items.slice(0,250);
      $("explorer-body").innerHTML=visibleItems.map(({c,s})=>`<tr><td data-sort-value="${esc(c.title||"")}"><a href="#" class="content-link" data-content="${esc(c.source)}|${esc(c.external_id)}">${esc(clampText(c.title,95))}</a><div class="metric-definition">${esc(c.author||"")}</div></td><td data-sort-value="${esc(sourceLabel(c.source))}">${sourceBadge(c.source)}</td><td data-sort-value="${esc(c.content_type||"tartalom")}">${esc(c.content_type||"tartalom")}</td><td data-sort-value="${esc(c.published_at||"")}">${dateHU(c.published_at)}</td><td class="num" data-sort-value="${Number(s.exposure||0)}">${num(s.exposure)}<div class="metric-definition">${esc(primaryMetricLabel(c.source))}</div></td><td class="num" data-sort-value="${Number(s.clicks||0)}">${num(s.clicks)}</td><td class="num" data-sort-value="${Number(s.engagement||0)}">${num(s.engagement)}</td></tr>`).join("")||`<tr><td colspan="7"><div class="empty-state">Nincs megfelelő találat.</div></td></tr>`;
      $("explorer-count").textContent=`${num(items.length)} találat${items.length>250?" · az első 250 látható; keress vagy szűrj a továbbiakhoz":" · minden találat megjelenítve"}`;bindContentLinks();applyCurrentTableSort($("explorer-table"));};
    [$("content-search"),$("content-source"),$("content-sort")].forEach((el)=>el.addEventListener(el.tagName==="INPUT"?"input":"change",update));update();
  }

  function topicFor(c){const ai=aiFor(c);if(ai?.topic)return ai.topic;const text=`${c.title} ${c.body}`.toLocaleLowerCase("hu");const tests=[["Ingatlan",/ingatlan|iroda|bevásárló|retail|lakás|épület|bérlő/],["Makrogazdaság",/infláció|kamat|forint|gdp|gazdaság|munkaerő|mnb|jegybank/],["Mesterséges intelligencia",/mesterséges intelligencia|\bai\b|chip|nvidia|tsmc/],["Befektetési alapok",/befektetési alap|hozam|portfólió|kötvény|részvény/],["Nemzetközi piacok",/amerika|európa|kína|románia|szerbia|belgrád|bukarest/],["Vállalati hírek",/gránit|alapkezelő|díj|kinevez|irodanyitás/],["ESG",/esg|fenntartható|zöld|klíma/]];return tests.find(([,re])=>re.test(text))?.[0]||c.metadata?.category_names?.[0]||"Egyéb";}
  function renderStories(){
    const range=selectedRange(),stories=storiesInRange(range).sort((a,b)=>{
      const dateCmp=String(b.story.end_date||b.story.start_date||"").localeCompare(String(a.story.end_date||a.story.start_date||""));
      return dateCmp||storyScore(b,range)-storyScore(a,range);
    });
    const multi=stories.filter((x)=>x.channels.filter((s)=>s!=="observer").length>1).length,mediaStories=stories.filter((x)=>x.media.length>0).length;
    const recentCutoff=new Date(range.end);recentCutoff.setDate(recentCutoff.getDate()-13);recentCutoff.setHours(0,0,0,0);
    const recentStories=stories.filter((x)=>new Date(`${x.story.end_date||x.story.start_date}T12:00:00`)>=recentCutoff).length;
    const topics={};stories.forEach((x)=>{const t=x.story.topic||topicFor(x.rows[0]?.c||{});topics[t]??={count:0,score:0,mentions:0};topics[t].count++;topics[t].score+=storyPerformanceScore(x,range);topics[t].mentions+=x.mentions;});
    const topicRows=Object.entries(topics).map(([name,v])=>({name,...v,avg:v.count?Math.round(v.score/v.count):0})).sort((a,b)=>b.avg-a.avg||b.count-a.count);
    pageContent.innerHTML=`<section class="kpi-grid">${kpi("Aktív sztorik",num(stories.length),"a kiválasztott időszakban")}${kpi("Többcsatornás",num(multi),"legalább két saját csatorna")}${kpi("Earned media",num(mediaStories),"Observerrel összekapcsolt sztorik")}${kpi("Friss sztorik",num(recentStories),"az elmúlt 14 napban")}</section>
    <div class="callout"><strong>Automatikus Story Engine</strong><p>A rendszer önállóan alakítja ki a sztorikat. A többnyelvű BGE-M3 szemantika miatt magyar, angol és kétnyelvű tartalmak is összekapcsolhatók. Neked csak akkor kell belenyúlnod, ha valamit át szeretnél helyezni, összevonni vagy leválasztani.</p></div>
    <section class="grid-2 equal story-topic-grid" style="margin-top:15px"><article class="panel"><div class="panel-heading"><div><p class="eyebrow">TÉMATELJESÍTMÉNY</p><h2>Átlagos sztori-score</h2></div></div><div class="chart-wrap"><canvas id="topic-chart"></canvas></div><p class="metric-definition">0–100-as normalizált score: minden sztorit a saját csatornáinak tartalmaihoz viszonyítunk. Nem adunk össze különböző natív KPI-kat.</p></article><article class="panel topic-rank-panel"><div class="panel-heading"><div><p class="eyebrow">TÉMARANGSOR</p><h2>Témák teljesítménye</h2></div><span class="panel-note">görgethető teljes lista</span></div><div id="topic-rank" class="rank-list topic-rank-scroll"></div></article></section>
    <div class="section-title"><div><p class="eyebrow">STORY GRAPH</p><h2>Kommunikációs sztorik</h2><p class="metric-definition">Alapértelmezetten a legfrissebb sztorik vannak elöl.</p></div><div class="story-toolbar"><button id="new-story-button" class="secondary-button">+ Új sztori</button><div class="table-tools"><input id="story-search" type="search" placeholder="Keresés sztoriban…"><select id="story-filter"><option value="all">Minden sztori</option><option value="multi">Többcsatornás</option><option value="media">Observerrel</option></select></div></div></div><section id="story-grid" class="grid-3"></section><p id="story-count" class="metric-definition"></p>`;
    barChart("topic-chart",topicRows.slice(0,8).map((x)=>x.name),topicRows.slice(0,8).map((x)=>x.avg),topicRows.slice(0,8).map((_,i)=>["#0a4b55","#13707d","#2de68c","#b54708","#2867b2","#9b59b6","#7ba7a2","#526b6e"][i]));
    const max=Math.max(1,...topicRows.map((x)=>x.avg));$("topic-rank").innerHTML=topicRows.map((x,i)=>`<div class="rank-row"><span class="rank-index">${i+1}</span><div class="rank-title">${esc(x.name)}<small>${num(x.count)} sztori · ${num(x.mentions)} sajtómegjelenés</small><div class="progress"><span style="width:${x.avg/max*100}%"></span></div></div><span class="rank-value">${num(x.avg)}/100</span></div>`).join("")||`<div class="empty-state">A Story Engine első futása után jelenik meg.</div>`;
    const update=()=>{const q=$("story-search").value.trim().toLocaleLowerCase("hu"),filter=$("story-filter").value;const rows=stories.filter((x)=>{if(q&&!`${x.story.title} ${x.story.topic} ${x.story.summary}`.toLocaleLowerCase("hu").includes(q))return false;if(filter==="multi"&&x.channels.filter((s)=>s!=="observer").length<2)return false;if(filter==="media"&&!x.media.length)return false;return true;});
      const visibleRows=rows.slice(0,180);$("story-grid").innerHTML=visibleRows.map((x)=>`<button class="story-card story-card-button" data-story="${esc(x.story.id)}"><div class="story-card-head"><div><h3>${esc(clampText(x.story.title,105))}</h3><p class="muted">${dateHU(x.story.start_date)}${x.story.end_date&&x.story.end_date!==x.story.start_date?` – ${dateHU(x.story.end_date)}`:""} · ${esc(x.story.topic||"Egyéb")}</p></div><span class="story-score">${num(storyPerformanceScore(x,range))}/100</span></div><div class="story-meta">${x.channels.map((s)=>`<span class="story-channel">${esc(SOURCE[s]?.short||s)}</span>`).join("")}</div><p class="story-summary">${esc(clampText(x.story.summary||"",180))}</p>${storyNativeMetricsHtml(x,3)}${storyCoverageHtml(x)}<div class="story-stats"><div><strong>${num(x.channels.filter((s)=>s!=="observer").length)}</strong><span>saját csatorna</span></div><div><strong>${num(x.mentions)}</strong><span>sajtómegjelenés</span></div><div><strong>${num(x.rows.length)}</strong><span>kapcsolt elem</span></div></div></button>`).join("")||`<div class="empty-state"><strong>Nincs megfelelő sztori.</strong>A Story Engine futása után itt automatikusan megjelennek a kapcsolatok.</div>`;
      $("story-count").textContent=`${num(rows.length)} sztori · ${num(rows.reduce((s,x)=>s+x.rows.length,0))} kapcsolt tartalom${rows.length>180?" · az első 180 sztori látható; keress vagy szűrj a továbbiakhoz":""}`;bindStoryLinks();};
    $("story-search").addEventListener("input",update);$("story-filter").addEventListener("change",update);$("new-story-button").addEventListener("click",createManualStory);update();
  }

  function analystSuggestionButtons(){
    return [
      "Mi működött a legjobban ebben az időszakban, és miért?",
      "Mely témák teljesítettek jól több csatornán?",
      "Milyen szakértői és elemzői médiamegjelenéseink voltak az elmúlt héten?",
      "Mit érdemes megismételnünk a következő hónapban?",
      "Hol látszik visszaesés vagy kihasználatlan lehetőség?",
    ].map((q)=>`<button class="analyst-suggestion" data-analyst-question="${esc(q)}">${esc(q)}</button>`).join("");
  }
  function analystEvidenceHtml(items=[]){
    if(!items.length)return "";
    return `<div class="analyst-evidence"><strong>Felhasznált belső adatok</strong><div class="analyst-evidence-list">${items.map((e)=>{
      const label=`${e.kind==="story"?"Sztori":e.kind==="aggregate"?"Összesítő":sourceLabel(e.source)} · ${clampText(e.title,95)}`;
      if(e.kind==="story"&&e.story_id)return `<button class="analyst-evidence-chip" data-story="${esc(e.story_id)}">${esc(label)}</button>`;
      if(e.kind==="content"&&e.source&&e.external_id)return `<button class="analyst-evidence-chip" data-content="${esc(e.source)}|${esc(e.external_id)}">${esc(label)}</button>`;
      return `<span class="analyst-evidence-chip static">${esc(label)}</span>`;
    }).join("")}</div></div>`;
  }
  function renderAnalystMessages(){
    const box=$("analyst-chat");if(!box)return;
    if(!state.analystMessages.length){box.innerHTML=`<div class="analyst-empty"><span>✦</span><strong>Kérdezz rá az adatokra</strong><p>Az AI a kiválasztott időszak csatornaadatait, tartalmait, Story Engine-kapcsolatait és Observer szakértői/elemzői megjelenéseit használja. Külső webes információt nem ad hozzá.</p></div>`;return;}
    box.innerHTML=state.analystMessages.map((m)=>{
      if(m.role==="user")return `<div class="analyst-message user"><div class="analyst-message-label">Te</div><div class="analyst-bubble">${esc(m.content)}</div></div>`;
      if(m.error)return `<div class="analyst-message assistant error"><div class="analyst-message-label">AI elemző</div><div class="analyst-bubble"><strong>Nem sikerült válaszolni.</strong><p>${esc(m.content)}</p></div></div>`;
      return `<div class="analyst-message assistant"><div class="analyst-message-label">AI elemző <span class="analyst-confidence">${esc(m.confidence||"közepes")} bizalom</span></div><div class="analyst-bubble"><p class="analyst-answer">${esc(m.content)}</p>${m.key_points?.length?`<ul class="analyst-points">${m.key_points.map((x)=>`<li>${esc(x)}</li>`).join("")}</ul>`:""}${m.caveats?.length?`<div class="analyst-caveats"><strong>Korlátok / megjegyzések</strong>${m.caveats.map((x)=>`<p>${esc(x)}</p>`).join("")}</div>`:""}${analystEvidenceHtml(m.evidence||[])}<div class="analyst-answer-meta">${m.period?.start?`${dateHU(m.period.start)} – `:""}${dateHU(m.period?.end)}${m.model?` · ${esc(m.model.replace("@cf/meta/",""))}`:""}${m.usage?` · ${num(m.usage.queries_today)}/${num(m.usage.daily_limit)} kérdés ma`:""}</div></div></div>`;
    }).join("");
    bindContentLinks();bindStoryLinks();box.scrollTop=box.scrollHeight;
  }
  async function submitAnalystQuestion(rawQuestion){
    const question=String(rawQuestion||"").trim();if(!question||state.analystBusy)return;
    const previous=state.analystMessages.slice(-6).map((m)=>({role:m.role,content:m.content}));
    state.analystMessages.push({role:"user",content:question});state.analystBusy=true;renderAnalystMessages();
    const input=$("analyst-input"),button=$("analyst-submit");if(input)input.value="";if(button){button.disabled=true;button.textContent="Elemzés…";}
    try{
      const range=selectedRange();
      const {data,error}=await state.client.functions.invoke("ai-analyst",{body:{question,range_start:range.start?dayKey(range.start):null,range_end:dayKey(range.end),history:previous}});
      if(error){let message=error.message||"Edge Function hiba";try{if(error.context){const payload=await error.context.json();message=payload?.error||payload?.message||message;}}catch{}throw new Error(message);}
      if(data?.error)throw new Error(data.error);
      state.analystMessages.push({role:"assistant",content:data?.answer||"Nem érkezett válasz.",key_points:data?.key_points||[],caveats:data?.caveats||[],evidence:data?.evidence||[],confidence:data?.confidence||"közepes",period:data?.period||{},model:data?.model||"",usage:data?.usage||null});
    }catch(error){state.analystMessages.push({role:"assistant",content:error?.message||String(error),error:true});}
    finally{state.analystBusy=false;if(button){button.disabled=false;button.textContent="Kérdezd az AI-t";}renderAnalystMessages();}
  }
  function renderAIAnalyst(){
    const range=selectedRange();
    pageContent.innerHTML=`<section class="ai-analyst-intro panel"><div><p class="eyebrow">BELSŐ ADATOKRA ÉPÜL</p><h2>Kérdezd az AI-t</h2><p>Az elemző a GRÁNIT dashboard strukturált adataiból válaszol: csatornateljesítmény, konkrét tartalmak, Story Engine és Observer médiamegjelenések. Nem keres a nyilvános weben, és minden válasznál megmutatja a felhasznált belső bizonyítékokat.</p></div><div class="analyst-period"><span>Vizsgált időszak</span><strong>${esc(rangeLabel())}</strong><small>A felső időszakválasztóval módosítható.</small></div></section>
    <section class="analyst-suggestions">${analystSuggestionButtons()}</section>
    <article class="panel analyst-panel"><div id="analyst-chat" class="analyst-chat"></div><form id="analyst-form" class="analyst-form"><textarea id="analyst-input" rows="3" maxlength="900" placeholder="Például: Melyik sztorink működött jól több csatornán, és mit tanuljunk belőle?"></textarea><div class="analyst-form-footer"><span>Az AI csak a belső dashboard-adatokból dolgozik.</span><button id="analyst-submit" class="primary-button" type="submit">Kérdezd az AI-t</button></div></form></article>`;
    renderAnalystMessages();
    document.querySelectorAll("[data-analyst-question]").forEach((el)=>el.addEventListener("click",()=>submitAnalystQuestion(el.dataset.analystQuestion)));
    $("analyst-form").addEventListener("submit",(ev)=>{ev.preventDefault();submitAnalystQuestion($("analyst-input").value);});
    $("analyst-input").addEventListener("keydown",(ev)=>{if((ev.ctrlKey||ev.metaKey)&&ev.key==="Enter"){ev.preventDefault();submitAnalystQuestion($("analyst-input").value);}});
  }

  function observerItems(){return state.content.filter((c)=>c.source==="observer").map((c)=>({c,m:c.metadata||{},a:aiFor(c),mentions:contentMetric(c,["media_mentions"]),stories:contentMetric(c,["media_stories"])})).sort((a,b)=>String(b.c.published_at).localeCompare(String(a.c.published_at)));}
  function isExpertAppearance(x){return Boolean(x?.a?.routine_expert_commentary)||/interjú|nyilatkozat|megszólal|kommentár|elemzői cikk|szakértő|interview|commentary/i.test(`${x?.a?.mention_type||""} ${x?.m?.mention_type||""} ${x?.m?.depth||""}`);}
  function observerKeywords(x){
    // For "miért került be?" prefer the Observer collector's matched entities.
    // AI key entities / keywords are fallbacks when the mail parser has no explicit entity list.
    const primary=Array.isArray(x?.m?.entities)?x.m.entities.filter(Boolean):[];
    const fallback=[
      ...(Array.isArray(x?.a?.key_entities)?x.a.key_entities:[]),
      ...(Array.isArray(x?.a?.keywords)?x.a.keywords:[]),
    ].filter(Boolean);
    const raw=primary.length?primary:fallback;
    const seen=new Set(),out=[];
    for(const value of raw){
      const text=String(value||"").trim();
      const key=text.toLocaleLowerCase("hu");
      if(!text||text.length>80||seen.has(key))continue;
      seen.add(key);out.push(text);
    }
    return out;
  }
  function observerKeywordRank(items){
    const counts=new Map();
    for(const item of items){
      const unique=new Set(observerKeywords(item).map((x)=>x.toLocaleLowerCase("hu")));
      for(const key of unique){
        const label=observerKeywords(item).find((x)=>x.toLocaleLowerCase("hu")===key)||key;
        const current=counts.get(key)||{label,count:0};
        current.count+=1;counts.set(key,current);
      }
    }
    return [...counts.values()].sort((a,b)=>b.count-a.count||a.label.localeCompare(b.label,"hu"));
  }
  function observerRiskItem(x){return Boolean(x?.a?.negative_or_sensitive_framing||x?.a?.communication_action_needed||Number(x?.a?.final_priority||1)>=3);}
  function observerReportKey(x){return String(x?.m?.email_message_key||x?.m?.email_subject||dayKey(x?.c?.published_at)||"");}
  function observerReportDate(x){
    const subject=String(x?.m?.email_subject||"");
    const match=subject.match(/(20\d{2})[.\-/](\d{1,2})[.\-/](\d{1,2})/);
    if(match){
      const d=new Date(Number(match[1]),Number(match[2])-1,Number(match[3]),12,0,0,0);
      if(!Number.isNaN(d.getTime()))return d;
    }
    const fallback=new Date(x?.c?.published_at||"");
    return Number.isNaN(fallback.getTime())?null:fallback;
  }
  function observerReportGroups(items){
    const groups=new Map();
    for(const item of items){
      const key=observerReportKey(item);
      if(!groups.has(key))groups.set(key,{key,items:[],subject:item.m?.email_subject||"Observer",date:observerReportDate(item)});
      const group=groups.get(key);group.items.push(item);
      const d=observerReportDate(item);if(d&&(!group.date||d>group.date))group.date=d;
    }
    return [...groups.values()].sort((a,b)=>(b.date?.getTime()||0)-(a.date?.getTime()||0));
  }
  function observerCompactCard(x){const source=x.m.primary_source||x.c.author||"–",summary=clampText(cleanDisplayText(x.a?.summary_short||x.c.body),190),related=(x.m.related_mentions||[]).length,keywords=observerKeywords(x);return `<button class="observer-brief-item" data-content="observer|${esc(x.c.external_id)}"><div><strong>${esc(x.c.title)}</strong><small>${dateHU(x.c.published_at)} · ${esc(source)}${related?` · +${num(related)} kapcsolódó megjelenés`:""}</small>${keywords.length?`<div class="tags observer-keyword-tags">${keywords.slice(0,6).map((k)=>`<span class="tag">${esc(k)}</span>`).join("")}</div>`:""}${summary?`<p>${esc(summary)}</p>`:""}</div><span>›</span></button>`;}
  function observerFallbackWeeklyBrief(week){
    const experts=week.filter(isExpertAppearance),risks=week.filter(observerRiskItem),mentions=week.reduce((s,x)=>s+x.mentions,0);
    const entities=new Map();experts.forEach((x)=>[...(x.a?.key_entities||[]),...(x.m?.entities||[])].forEach((e)=>{const v=String(e||"").trim();if(v&&v.length<80)entities.set(v,(entities.get(v)||0)+1);}));
    const top=[...entities.entries()].sort((a,b)=>b[1]-a[1]).slice(0,4).map(([x])=>x);
    return {answer:`Az elmúlt héten ${num(experts.length)} szakértői/elemzői Observer-történet és összesen ${num(mentions)} sajtómegjelenés látszik.${top.length?` A leggyakoribb szereplők/témák között: ${top.join(", ")}.`:""} ${risks.length?`${num(risks.length)} olyan tétel van, amelyet érdemes reputációs szempontból külön ellenőrizni.`:"Nem látszik kezelendő reputációs kockázat."}`,key_points:[],confidence:"helyi összesítés"};
  }
  function observerWeeklyBriefHtml(data){
    if(!data)return `<div class="observer-ai-loading">AI heti összefoglaló készül…</div>`;
    return `<div class="observer-ai-answer"><p>${esc(data.answer||"")}</p>${data.key_points?.length?`<ul>${data.key_points.slice(0,4).map((x)=>`<li>${esc(x)}</li>`).join("")}</ul>`:""}<small>AI-összefoglaló · a legfrissebb Observer-jelentéshez viszonyított 7 nap</small></div>`;
  }
  async function loadObserverWeeklyBrief(start,end,week){
    const target=$("observer-weekly-ai");if(!target)return;
    const cacheKey=`granit-observer-weekly-v2-${dayKey(end)}`;
    if(state.observerWeeklyBrief?.key===cacheKey){target.innerHTML=observerWeeklyBriefHtml(state.observerWeeklyBrief.data);return;}
    try{const cached=localStorage.getItem(cacheKey);if(cached){const parsed=JSON.parse(cached);state.observerWeeklyBrief={key:cacheKey,data:parsed};target.innerHTML=observerWeeklyBriefHtml(parsed);return;}}catch{}
    if(state.observerWeeklyBusy)return;state.observerWeeklyBusy=true;target.innerHTML=observerWeeklyBriefHtml(null);
    const fallback=observerFallbackWeeklyBrief(week);
    try{
      const question="Foglalj össze 3–5 mondatban az elmúlt 7 nap Observer médiamegjelenéseit. Fókuszálj a szakértői/elemzői megszólalásokra és elemzésekre: kik szerepeltek, milyen fő témákban. Ezután egyértelműen mondd ki, látszik-e kezelendő reputációs kockázat a GRÁNIT Alapkezelő, valamely alap/projekt vagy kolléga negatív, támadó, félrevezető, vitás vagy más szenzitív megjelenése miatt. Rutin gazdasági szakértői kommentár önmagában nem kockázat. Ha nincs ilyen, írd le: Nem látszik kezelendő reputációs kockázat.";
      const {data,error}=await state.client.functions.invoke("ai-analyst",{body:{question,range_start:dayKey(start),range_end:dayKey(end),history:[]}});
      if(error||data?.error)throw new Error(data?.error||error?.message||"AI hiba");
      const result={answer:data?.answer||fallback.answer,key_points:data?.key_points||[],confidence:data?.confidence||"közepes"};
      state.observerWeeklyBrief={key:cacheKey,data:result};try{localStorage.setItem(cacheKey,JSON.stringify(result));}catch{}target.innerHTML=observerWeeklyBriefHtml(result);
    }catch(error){console.warn("Observer weekly AI fallback",error);state.observerWeeklyBrief={key:cacheKey,data:fallback};target.innerHTML=observerWeeklyBriefHtml(fallback);}
    finally{state.observerWeeklyBusy=false;}
  }
  function renderObserver(){
    const items=observerItems(),groups=observerReportGroups(items),latestGroup=groups[0];
    if(!latestGroup){pageContent.innerHTML=`<div class="empty-state"><strong>Még nincs Observer-adat.</strong>Az Observer Gmail import sikeres futása után itt jelennek meg a jelentések.</div>`;return;}

    const latestReport=latestGroup.items,latestExperts=latestReport.filter(isExpertAppearance),latestMentions=latestReport.reduce((s,x)=>s+x.mentions,0);
    const latestDate=latestGroup.date||new Date(latestReport[0]?.c?.published_at||Date.now());

    // Weekly AI window is always anchored to the actual newest Observer email/report date.
    const weekEnd=new Date(latestDate);weekEnd.setHours(23,59,59,999);
    const weekStart=new Date(weekEnd);weekStart.setDate(weekStart.getDate()-6);weekStart.setHours(0,0,0,0);
    const week=items.filter((x)=>{const d=new Date(x.c.published_at);return d>=weekStart&&d<=weekEnd;});

    // Main KPIs and chart follow the dashboard's selected period and comparison.
    const r=sourceDataRange("observer",selectedRange()),p=previousRangeFor(r);
    const currentItems=items.filter((x)=>inRange(x.c.published_at,r));
    const previousItems=p?items.filter((x)=>inRange(x.c.published_at,p)):[];
    const currentMentions=currentItems.reduce((s,x)=>s+x.mentions,0);
    const previousMentions=previousItems.reduce((s,x)=>s+x.mentions,0);
    const keywordRows=observerKeywordRank(currentItems);
    const series=dailySeries("observer","exposure",r);

    pageContent.innerHTML=`<section class="kpi-grid two">
      ${kpi("Történetek",num(currentItems.length),"a kiválasztott időszakban",p?delta(currentItems.length,previousItems.length):undefined)}
      ${kpi("Sajtómegjelenések",num(currentMentions),"a kiválasztott időszakban",p?delta(currentMentions,previousMentions):undefined)}
    </section>
    <section class="grid-2 observer-analysis-grid"><article class="panel"><div class="panel-heading"><div><p class="eyebrow">MEGJELENÉSEK IDŐBEN</p><h2>Observer sajtómegjelenések</h2></div><span class="panel-note">${esc(rangeLabelFor(r))}</span></div><div class="chart-wrap"><canvas id="observer-mentions-chart"></canvas></div><p class="metric-definition">Napi sajtómegjelenések és 7 napos mozgóátlag. A felső KPI-k az előző azonos időszakhoz hasonlítanak.</p></article>
    <article class="panel observer-keyword-panel"><div class="panel-heading"><div><p class="eyebrow">KULCSSZAVAK</p><h2>Leggyakoribb említések</h2></div><span class="panel-note">${esc(rangeLabelFor(r))}</span></div><div id="observer-keyword-rank" class="rank-list observer-keyword-rank"></div><p class="metric-definition">Egy kulcsszót történetenként egyszer számolunk, így a rangsor nem torzul egyetlen sokszor átvett sajtómegjelenéstől.</p></article></section>
    <section class="grid-2 equal observer-brief-grid" style="margin-top:15px"><article class="panel"><div class="panel-heading"><div><p class="eyebrow">LEGFRISSEBB OBSERVER-JELENTÉS</p><h2>${dateHU(latestDate)}</h2></div><span class="panel-note">${num(latestReport.length)} történet</span></div><p class="metric-definition">${esc(latestGroup.subject||"Observer")}</p><div class="observer-brief-list observer-latest-list">${latestReport.map(observerCompactCard).join("")||`<div class="empty-state">Nincs tétel.</div>`}</div></article>
    <article class="panel observer-ai-panel"><div class="panel-heading"><div><p class="eyebrow">AI HETI ÖSSZEFOGLALÓ</p><h2>Mi történt az elmúlt 7 napban?</h2></div><span class="panel-note">${dateHU(weekStart)} – ${dateHU(weekEnd)}</span></div><div id="observer-weekly-ai">${observerWeeklyBriefHtml(null)}</div></article></section>
    <article class="panel observer-archive-panel"><div class="panel-heading"><div><p class="eyebrow">TELJES ARCHÍVUM</p><h2>Observer-történetek</h2></div></div><div><div class="table-tools"><input id="observer-search" type="search" placeholder="Keresés címben, kivonatban…"><select id="observer-type"><option value="all">Minden történet</option><option value="expert">Csak szakértői/elemzői</option></select></div><div class="table-wrap observer-table-wrap"><table id="observer-table" class="sortable-table observer-table observer-keyword-table"><thead><tr><th>Dátum</th><th>Cím</th><th>Forrás</th><th>Kulcsszavak</th><th>Megjelenések</th></tr></thead><tbody id="observer-body"></tbody></table></div><p id="observer-count" class="metric-definition"></p></div></article>`;

    lineChart("observer-mentions-chart",series.labels,[{label:"Napi megjelenések",data:series.values,borderColor:"rgba(181,71,8,.42)",backgroundColor:"rgba(181,71,8,.08)",fill:true,pointRadius:0},{label:"7 napos átlag",data:movingAverage(series.values,7),borderColor:SOURCE.observer.color,pointRadius:0,tension:.25}]);
    const keywordMax=Math.max(1,...keywordRows.map((x)=>x.count));
    $("observer-keyword-rank").innerHTML=keywordRows.slice(0,16).map((x,i)=>`<div class="rank-row"><span class="rank-index">${i+1}</span><div class="rank-title">${esc(x.label)}<small>${num(x.count)} történet</small><div class="progress"><span style="width:${x.count/keywordMax*100}%"></span></div></div><span class="rank-value">${num(x.count)}</span></div>`).join("")||`<div class="empty-state">Nincs felismert kulcsszó a kiválasztott időszakban.</div>`;
    bindContentLinks();loadObserverWeeklyBrief(weekStart,weekEnd,week);

    const update=()=>{const q=$("observer-search").value.trim().toLocaleLowerCase("hu"),type=$("observer-type").value;const rows=items.filter((x)=>{const keywords=observerKeywords(x);const hay=`${x.c.title} ${x.c.body} ${x.m.primary_source} ${keywords.join(" ")}`.toLocaleLowerCase("hu");return (type==="all"||isExpertAppearance(x))&&(!q||hay.includes(q));});const visibleRows=rows.slice(0,250);$("observer-body").innerHTML=visibleRows.map((x)=>{const keywords=observerKeywords(x);return `<tr><td>${dateHU(x.c.published_at)}</td><td><a href="#" data-content="observer|${esc(x.c.external_id)}" class="content-link">${esc(x.c.title)}</a></td><td>${esc(x.m.primary_source||x.c.author||"–")}</td><td><div class="tags observer-tags">${keywords.map((k)=>`<span class="tag">${esc(k)}</span>`).join("")||"–"}</div></td><td class="num">${num(x.mentions)}</td></tr>`;}).join("")||`<tr><td colspan="5"><div class="empty-state">Nincs találat.</div></td></tr>`;$("observer-count").textContent=`${num(rows.length)} történet${rows.length>250?" · az első 250 látható; keress a továbbiakhoz":""}`;bindContentLinks();};
    $("observer-search").addEventListener("input",update);$("observer-type").addEventListener("change",update);update();
  }

  function expectedSources(){return [{id:"wordpress",label:"Grandio – WordPress",source:"blog"},{id:"mailchimp",label:"Mailchimp",source:"mailchimp"},{id:"ga4",label:"Google Analytics 4",source:"blog"},{id:"search_console",label:"Search Console",source:"blog"},{id:"youtube",label:"YouTube",source:"youtube"},{id:"meta",label:"Facebook és Instagram",source:"facebook"},{id:"linkedin",label:"LinkedIn XLS import",source:"linkedin_company"},{id:"observer",label:"Observer Gmail",source:"observer"},{id:"content_ai",label:"Cloudflare Workers AI",source:"observer"},{id:"story_engine",label:"Hybrid Story Engine",source:"blog"}];}
  function renderConnections(){const latest=Object.fromEntries(latestSync().map((x)=>[x.source,x]));pageContent.innerHTML=`<section class="grid-3">${expectedSources().map((e)=>{const r=latest[e.id];let status="missing";if(r){const age=(Date.now()-new Date(r.finished_at||r.started_at))/86400000;status=r.status==="error"?"error":age>3?"stale":"success";}return `<article class="panel"><div class="panel-heading"><div><p class="eyebrow">${esc(e.id.toUpperCase())}</p><h2>${esc(e.label)}</h2></div>${statusBadge(status)}</div>${r?`<p><strong>Utolsó futás:</strong> ${dateTimeHU(r.finished_at||r.started_at)}</p><p><strong>Beírt sorok:</strong> ${num(r.records_written)}</p><p class="muted">${esc(r.message||"")}</p>`:`<div class="empty-state"><strong>Még nem futott le.</strong>Állítsd be a szükséges GitHub secretet és változót, majd indítsd el az Actions fülön.</div>`}</article>`;}).join("")}</section><article class="panel"><div class="panel-heading"><div><p class="eyebrow">ADATBÁZIS</p><h2>Jelenlegi adattartalom</h2></div></div><div class="table-wrap"><table class="sortable-table"><thead><tr><th data-sort-type="text">Forrás</th><th class="num" data-sort-type="number">Fiókok</th><th class="num" data-sort-type="number">Tartalmak</th><th class="num" data-sort-type="number">Mérési sorok</th><th data-sort-type="date">Legutóbbi tartalom</th></tr></thead><tbody>${ALL_SOURCES.map((s)=>{const acc=state.accounts.filter((x)=>x.source===s).length,con=state.content.filter((x)=>x.source===s),met=state.metrics.filter((x)=>x.source===s).length,last=con.sort((a,b)=>String(b.published_at).localeCompare(String(a.published_at)))[0]?.published_at;return `<tr><td data-sort-value="${esc(sourceLabel(s))}">${sourceBadge(s)}</td><td class="num" data-sort-value="${acc}">${num(acc)}</td><td class="num" data-sort-value="${con.length}">${num(con.length)}</td><td class="num" data-sort-value="${met}">${num(met)}</td><td data-sort-value="${esc(last||"")}">${dateHU(last)}</td></tr>`;}).join("")}</tbody></table></div></article>`;}

  function renderPage(){destroyCharts();if(!PAGE_META[state.page])state.page="overview";const meta=PAGE_META[state.page]||PAGE_META.overview;$("page-eyebrow").textContent=meta[0];$("page-title").textContent=meta[1];$("page-subtitle").textContent=meta[2];document.querySelectorAll(".nav-item").forEach((b)=>b.classList.toggle("active",b.dataset.page===state.page));const sourcePages=["linkedin_company","facebook","instagram","youtube"];sourceFilterLabel.classList.add("hidden");if(state.page==="overview")renderOverview();else if(state.page==="newsletter")renderNewsletter();else if(state.page==="blog")renderBlog();else if(sourcePages.includes(state.page))renderPlatform(state.page);else if(state.page==="content")renderContentExplorer();else if(state.page==="stories")renderStories();else if(state.page==="ai_analyst")renderAIAnalyst();else if(state.page==="observer")renderObserver();else if(state.page==="connections")renderConnections();else renderOverview();injectFreshness();bindContentLinks();bindStoryLinks();bindSortableTables();}

  function bindStoryLinks(){document.querySelectorAll("[data-story]").forEach((el)=>{if(el.dataset.storyBound)return;el.dataset.storyBound="1";el.addEventListener("click",(ev)=>{ev.preventDefault();showStory(el.dataset.story);});});}
  function showStory(storyId){
    const story=indexedStory(storyId);if(!story)return;const x=storySummary(story),sorted=[...x.rows].sort((a,b)=>String(a.c.published_at).localeCompare(String(b.c.published_at))),bySource={};
    sorted.forEach((row)=>{bySource[row.c.source]??={count:0,exp:0,clicks:0,engagement:0,mentions:0};const v=bySource[row.c.source];v.count++;v.exp+=row.s.exposure;v.clicks+=row.s.clicks;v.engagement+=row.s.engagement;if(row.c.source==="observer")v.mentions+=contentMetric(row.c,["media_mentions"]);});
    const sourceRows=Object.entries(bySource);
    $("modal-content").innerHTML=`<div class="modal-title-row"><div><p class="eyebrow">KOMMUNIKÁCIÓS SZTORI</p><h2>${esc(story.title)}</h2></div><div style="display:flex;gap:8px;flex-wrap:wrap"><button class="secondary-button" id="story-edit-button">Sztori szerkesztése</button><button class="danger-button" id="story-delete-button">Sztori törlése</button></div></div><div class="modal-meta"><div><span>Időszak</span><strong>${dateHU(story.start_date)}${story.end_date&&story.end_date!==story.start_date?` – ${dateHU(story.end_date)}`:""}</strong></div><div><span>Téma</span><strong>${esc(story.topic||"–")}</strong></div><div><span>Kapcsolt elemek</span><strong>${num(x.rows.length)}</strong></div><div><span>Teljesítmény score</span><strong>${num(storyPerformanceScore(x))}/100</strong></div></div>${story.summary?`<p class="modal-body">${esc(cleanDisplayText(story.summary))}</p>`:""}<h3 style="margin-top:18px">Csatornánkénti natív teljesítmény</h3><p class="metric-definition">A különböző csatornák natív KPI-jait nem adjuk össze.</p><div class="story-source-grid">${sourceRows.map(([source,v])=>`<div class="story-source-card"><strong>${esc(sourceLabel(source))}</strong><span>${num(v.count)} tartalom</span>${source==="observer"?`<b>${num(v.mentions)} sajtómegjelenés</b>`:`<b>${num(v.exp,true)} ${esc(primaryMetricLabel(source))}</b><span>${num(v.clicks)} kattintás · ${num(v.engagement)} interakció</span>`}</div>`).join("")}</div><h3 style="margin-top:18px">Terjesztési lefedettség</h3>${storyCoverageHtml(x)}<h3 style="margin-top:20px">Sztori idővonala</h3><div class="story-timeline">${sorted.map((row)=>`<button class="story-timeline-item" data-content="${esc(row.c.source)}|${esc(row.c.external_id)}"><span class="story-timeline-date">${dateHU(row.c.published_at)}</span><span class="story-timeline-body"><strong>${esc(sourceLabel(row.c.source))}</strong><b>${esc(clampText(row.c.title,120))}</b><small>${esc(row.ref.relation_type||"kapcsolt")}${row.ref.manual_locked?" · kézzel rögzítve":""} · ${pct(Number(row.ref.confidence||1),0)} bizalom</small></span></button>`).join("")}</div>`;
    $("detail-modal").classList.remove("hidden");
    $("story-edit-button").addEventListener("click",()=>showStoryEditor(storyId));
    $("story-delete-button").addEventListener("click",()=>deleteStory(storyId,story.title));
    bindContentLinks();
  }
  async function rpcCall(name,args){const {data,error}=await state.client.rpc(name,args);if(error)throw error;return data;}
  async function deleteStory(storyId,storyTitle=""){
    const label=storyTitle?`„${storyTitle}”`:"ezt a sztorit";
    if(!confirm(`Biztosan törlöd ${label}?\n\nA sztori törlődik, de az eredeti tartalmak megmaradnak. A kapcsolt elemeket az automata nem fogja rögtön újra ugyanebből a sztoriból felépíteni.`))return;
    try{
      await rpcCall("story_delete",{p_story_id:storyId});
      $("detail-modal").classList.add("hidden");
      await loadData(false);
      showToast("Sztori törölve.");
    }catch(error){
      showToast(`Hiba a sztori törlésekor: ${error.message||error}`);
    }
  }
  async function createManualStory(){
    const title=prompt("Új sztori címe:");if(!title)return;
    try{const id=await rpcCall("story_create_manual",{p_title:title,p_topic:""});await loadData(false);showStoryEditor(id);}catch(error){showToast(`Hiba: ${error.message||error}`);}
  }
  function showStoryEditor(storyId){
    const story=indexedStory(storyId);if(!story)return;const rows=storyContentRows(storyId),linkedKeys=new Set(rows.map((x)=>`${x.c.source}|${x.c.external_id}`));
    $("modal-content").innerHTML=`<div class="modal-title-row"><div><p class="eyebrow">KÉZI STORY EDITOR</p><h2>${esc(story.title||"Sztori")}</h2></div><button class="danger-button" id="story-delete-button">Sztori törlése</button></div><div class="story-editor-fields"><label>Cím<input id="story-edit-title" value="${esc(story.title||"")}"></label><label>Téma<input id="story-edit-topic" value="${esc(story.topic||"")}"></label><button id="story-meta-save" class="primary-button">Cím és téma mentése</button></div><div class="panel-heading"><div><p class="eyebrow">KAPCSOLT TARTALMAK</p><h3>${num(rows.length)} elem</h3></div></div><div class="story-editor-linked">${rows.map((row)=>`<div class="story-editor-row"><div><strong>${esc(row.c.title)}</strong><small>${esc(sourceLabel(row.c.source))} · ${dateHU(row.c.published_at)}${row.ref.manual_locked?" · kézzel rögzítve":""}</small></div><button class="danger-button" data-story-remove="${esc(row.c.source)}|${esc(row.c.external_id)}">Eltávolítás</button></div>`).join("")||`<div class="empty-state">A sztori jelenleg üres.</div>`}</div><div class="panel-heading story-editor-add-head"><div><p class="eyebrow">TARTALOM HOZZÁADÁSA / ÁTHELYEZÉSE</p><h3>Bármelyik csatornáról</h3></div></div><div class="table-tools"><input id="story-add-search" type="search" placeholder="Keresés címben…"><select id="story-add-source"><option value="all">Minden csatorna</option>${ALL_SOURCES.map((s)=>`<option value="${s}">${esc(sourceLabel(s))}</option>`).join("")}</select></div><div id="story-add-results" class="story-editor-results"></div>`;
    $("story-delete-button").addEventListener("click",()=>deleteStory(storyId,story.title));
    $("story-meta-save").addEventListener("click",async()=>{try{await rpcCall("story_update_metadata",{p_story_id:storyId,p_title:$("story-edit-title").value,p_topic:$("story-edit-topic").value});showToast("Sztori frissítve.");await loadData(false);showStoryEditor(storyId);}catch(error){showToast(`Hiba: ${error.message||error}`);}});
    document.querySelectorAll("[data-story-remove]").forEach((b)=>b.addEventListener("click",async()=>{const [source,...rest]=b.dataset.storyRemove.split("|");if(!confirm("Biztosan eltávolítod ezt a tartalmat a sztoriból?"))return;try{await rpcCall("story_set_assignment",{p_source:source,p_external_id:rest.join("|"),p_story_id:null});await loadData(false);showStoryEditor(storyId);}catch(error){showToast(`Hiba: ${error.message||error}`);}}));
    const update=()=>{const q=$("story-add-search").value.trim().toLocaleLowerCase("hu"),src=$("story-add-source").value;const candidates=state.content.filter((c)=>(src==="all"||c.source===src)&&!linkedKeys.has(`${c.source}|${c.external_id}`)&&(!q||`${c.title} ${c.author||""}`.toLocaleLowerCase("hu").includes(q))).sort((a,b)=>String(b.published_at).localeCompare(String(a.published_at))).slice(0,50);$("story-add-results").innerHTML=candidates.map((c)=>{const current=state.storyItems.find((x)=>x.source===c.source&&String(x.external_id)===String(c.external_id)),currentStory=current?state.stories.find((s)=>String(s.id)===String(current.story_id)):null;return `<div class="story-editor-row"><div><strong>${esc(c.title)}</strong><small>${esc(sourceLabel(c.source))} · ${dateHU(c.published_at)}${currentStory?` · jelenleg: ${esc(clampText(currentStory.title,70))}`:""}</small></div><button class="secondary-button" data-story-add="${esc(c.source)}|${esc(c.external_id)}">${currentStory?"Áthelyezés ide":"Hozzáadás"}</button></div>`;}).join("")||`<div class="empty-state">Nincs találat.</div>`;document.querySelectorAll("[data-story-add]").forEach((b)=>b.addEventListener("click",async()=>{const [source,...rest]=b.dataset.storyAdd.split("|");try{await rpcCall("story_set_assignment",{p_source:source,p_external_id:rest.join("|"),p_story_id:storyId});await loadData(false);showStoryEditor(storyId);}catch(error){showToast(`Hiba: ${error.message||error}`);}}));};
    $("story-add-search").addEventListener("input",update);$("story-add-source").addEventListener("change",update);update();$("detail-modal").classList.remove("hidden");
  }
  function bindReviewActions(){document.querySelectorAll("[data-review]").forEach((b)=>b.addEventListener("click",async()=>{try{await rpcCall("story_review_decide",{p_review_id:Number(b.dataset.review),p_decision:b.dataset.decision});await loadData(false);}catch(error){showToast(`Hiba: ${error.message||error}`);}}));}
    function bindContentLinks(){document.querySelectorAll("[data-content]").forEach((el)=>{if(el.dataset.bound)return;el.dataset.bound="1";el.addEventListener("click",(ev)=>{ev.preventDefault();const [source,...rest]=el.dataset.content.split("|");showContent(source,rest.join("|"));});});}

  function showContent(source,id){
    const c=indexedContent(source,id);if(!c)return;const s=contentStats(c),m=c.metadata||{},a=aiFor(c),entityTags=contentEntities(c),storyRef=state.indexes?.storyItemByContent.get(contentKey(source,id))||null;
    const observerAi=c.source==="observer"&&a&&a.status==="success"?`<div class="callout"><strong>AI összefoglaló</strong>${a.topic?`<p><strong>Téma:</strong> ${esc(a.topic)}</p>`:""}${a.summary_long||a.summary_short?`<p>${esc(cleanDisplayText(a.summary_long||a.summary_short))}</p>`:""}</div>`:"";
    $("modal-content").innerHTML=`<p class="eyebrow">${esc(sourceLabel(c.source))}</p><h2>${esc(c.title)}</h2><div class="modal-meta"><div><span>Publikálás</span><strong>${dateHU(c.published_at)}</strong></div><div><span>Szerző / forrás</span><strong>${esc(c.author||m.primary_source||"–")}</strong></div><div><span>${esc(primaryMetricLabel(c.source))}</span><strong>${num(s.exposure)}</strong></div><div><span>Kattintás · interakció</span><strong>${num(s.clicks)} · ${num(s.engagement)}</strong></div></div><div class="tags">${(entityTags||[]).map((x)=>`<span class="tag">${esc(x)}</span>`).join("")}</div>${observerAi}<h3 style="margin-top:18px">${c.source==="observer"?"Teljes Observer-kivonat":"Tartalom"}</h3><p class="modal-body">${esc(c.source==="observer"?cleanDisplayText(c.body||"Nincs kivonat."):(c.body||"Nincs kivonat."))}</p>${m.depth?`<div class="callout"><strong>Megjelenítés mélysége</strong><p>${esc(cleanDisplayText(m.depth))}</p></div>`:""}${a?.facts?.length?`<h3 style="margin-top:18px">AI által kiemelt fő pontok</h3><div class="insight-list">${a.facts.map((x)=>`<div class="insight"><p>${esc(x)}</p></div>`).join("")}</div>`:""}${m.related_mentions?.length?`<h3 style="margin-top:18px">Hasonló megjelenések</h3><div class="insight-list">${m.related_mentions.map((x)=>`<div class="insight"><strong>${esc(x.source||"Kapcsolódó forrás")}</strong><p>${esc(x.title||"")}${x.url?` · ${esc(x.url)}`:""}</p></div>`).join("")}</div>`:""}${storyRef?`<p style="margin-top:20px"><button class="primary-button" data-story="${esc(storyRef.story_id)}" style="display:inline-flex;padding:11px 15px">Teljes sztori megnyitása →</button></p>`:""}${c.url?`<p style="margin-top:20px"><a class="primary-button" style="display:inline-flex;padding:11px 15px;text-decoration:none" target="_blank" rel="noopener" href="${esc(c.url)}">Eredeti tartalom megnyitása ↗</a></p>`:""}`;
    $("detail-modal").classList.remove("hidden");bindStoryLinks();
  }


  function navigate(page){state.page=PAGE_META[page]?page:"overview";location.hash=state.page;renderPage();$("sidebar").classList.remove("open");window.scrollTo({top:0,behavior:"smooth"});}
  function wireEvents(){document.querySelectorAll(".nav-item").forEach((b)=>b.addEventListener("click",()=>navigate(b.dataset.page)));rangeSelect.addEventListener("change",()=>{state.indexes?.exposureCache.clear();renderPage();});compareSelect.addEventListener("change",renderPage);sourceSelect.addEventListener("change",()=>{if(state.page==="overview")renderPage();});$("refresh-button").addEventListener("click",()=>loadData());$("menu-button").addEventListener("click",()=>$("sidebar").classList.toggle("open"));document.querySelectorAll("[data-close-modal]").forEach((x)=>x.addEventListener("click",()=>$("detail-modal").classList.add("hidden")));window.addEventListener("hashchange",()=>{const p=location.hash.replace("#","");if(PAGE_META[p]&&p!==state.page){state.page=p;renderPage();}});}

  async function init(){if(!configured){setupScreen.classList.remove("hidden");return;}state.client=window.supabase.createClient(cfg.supabaseUrl,cfg.supabasePublishableKey);wireEvents();const {data:{session}}=await state.client.auth.getSession();if(session){await enter(session.user);}else loginScreen.classList.remove("hidden");$("login-form").addEventListener("submit",async(e)=>{e.preventDefault();$("login-error").textContent="";const {data,error}=await state.client.auth.signInWithPassword({email:$("email").value,password:$("password").value});if(error){$("login-error").textContent=error.message;return;}await enter(data.user);});$("logout-button").addEventListener("click",async()=>{await state.client.auth.signOut();app.classList.add("hidden");loginScreen.classList.remove("hidden");});}
  async function enter(user){state.user=user;loginScreen.classList.add("hidden");setupScreen.classList.add("hidden");app.classList.remove("hidden");$("signed-in-user").textContent=user.email||"Bejelentkezve";await loadData();}
  init();
})();
