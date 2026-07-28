(() => {
  "use strict";

  const config = window.GRANIT_CONFIG || {};
  const configured = config.supabaseUrl && config.supabasePublishableKey && !config.supabaseUrl.includes("PASTE_");
  const setupScreen = document.getElementById("setup-screen");
  const loginScreen = document.getElementById("login-screen");
  const app = document.getElementById("app");

  if (!configured) {
    setupScreen.classList.remove("hidden");
    return;
  }

  const client = window.supabase.createClient(config.supabaseUrl, config.supabasePublishableKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  });

  const SOURCE_LABELS = {
    blog: "Grandio Blog",
    linkedin_company: "Company LinkedIn",
    linkedin_ceo: "CEO LinkedIn",
    facebook: "Facebook",
    instagram: "Instagram",
    youtube: "YouTube",
    mailchimp: "Mailchimp"
  };

  const state = {
    session: null,
    daily: [],
    audience: [],
    content: [],
    sync: [],
    report: null,
    trendChart: null,
    platformChart: null,
    currentStart: null,
    previousStart: null,
    periodDays: 90
  };

  const numberFormat = new Intl.NumberFormat("hu-HU", { maximumFractionDigits: 0 });
  const dateFormat = new Intl.DateTimeFormat("en-GB", { year: "numeric", month: "short", day: "2-digit" });
  const dateTimeFormat = new Intl.DateTimeFormat("en-GB", { year: "numeric", month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit" });

  function show(screen) {
    setupScreen.classList.add("hidden");
    loginScreen.classList.add("hidden");
    app.classList.add("hidden");
    screen.classList.remove("hidden");
  }

  function dateOnly(value) {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "";
    return d.toISOString().slice(0, 10);
  }

  function shiftDate(value, days) {
    const d = new Date(`${value}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
  }

  function rangeInfo() {
    const selected = document.getElementById("range-select").value;
    const end = new Date();
    end.setUTCDate(end.getUTCDate() - 1);
    const endDate = end.toISOString().slice(0, 10);
    if (selected === "all") {
      return { periodDays: null, currentStart: "2000-01-01", previousStart: null, endDate, queryStart: "2000-01-01" };
    }
    const periodDays = Number(selected);
    const currentStart = shiftDate(endDate, -(periodDays - 1));
    const previousStart = shiftDate(currentStart, -periodDays);
    return { periodDays, currentStart, previousStart, endDate, queryStart: previousStart };
  }

  async function fetchPaged(factory, pageSize = 1000) {
    const rows = [];
    let from = 0;
    while (true) {
      const { data, error } = await factory().range(from, from + pageSize - 1);
      if (error) throw error;
      rows.push(...(data || []));
      if (!data || data.length < pageSize) break;
      from += pageSize;
    }
    return rows;
  }

  async function loadData() {
    document.getElementById("last-refresh").textContent = "Loading data…";
    const info = rangeInfo();
    state.currentStart = info.currentStart;
    state.previousStart = info.previousStart;
    state.periodDays = info.periodDays;

    const dailyPromise = fetchPaged(() => client
      .from("v_dashboard_daily")
      .select("source,metric_date,metric_name,metric_value,metric_unit")
      .gte("metric_date", info.queryStart)
      .lte("metric_date", info.endDate)
      .order("metric_date", { ascending: true }));

    const audiencePromise = fetchPaged(() => client
      .from("v_account_metrics_latest")
      .select("source,account_id,metric_name,metric_value,metric_date"));

    let contentQueryFactory = () => client
      .from("v_content_performance")
      .select("source,external_id,account_id,title,url,published_at,content_type,author,impressions,reach,views,clicks,reactions,comments,shares,saves,watch_minutes,emails_sent,delivered,unique_opens,metrics_as_of")
      .order("published_at", { ascending: false, nullsFirst: false });
    if (info.queryStart !== "2000-01-01") {
      contentQueryFactory = () => client
        .from("v_content_performance")
        .select("source,external_id,account_id,title,url,published_at,content_type,author,impressions,reach,views,clicks,reactions,comments,shares,saves,watch_minutes,emails_sent,delivered,unique_opens,metrics_as_of")
        .gte("published_at", `${info.queryStart}T00:00:00Z`)
        .order("published_at", { ascending: false, nullsFirst: false });
    }

    const contentPromise = fetchPaged(contentQueryFactory);
    const syncPromise = client.from("v_sync_latest").select("*").order("source");
    const reportPromise = client.from("ai_reports").select("*").order("created_at", { ascending: false }).limit(1);

    const [daily, audience, content, syncResult, reportResult] = await Promise.all([
      dailyPromise, audiencePromise, contentPromise, syncPromise, reportPromise
    ]);
    if (syncResult.error) throw syncResult.error;
    if (reportResult.error) throw reportResult.error;

    state.daily = daily;
    state.audience = audience;
    state.content = content;
    state.sync = syncResult.data || [];
    state.report = (reportResult.data || [])[0] || null;

    renderAll();
    document.getElementById("last-refresh").textContent = `Dashboard refreshed ${dateTimeFormat.format(new Date())}`;
  }

  function sourceFilter() {
    return document.getElementById("source-select").value;
  }

  function rowsBySource(rows) {
    const source = sourceFilter();
    return source === "all" ? rows : rows.filter(row => row.source === source);
  }

  function metricCube(rows) {
    const cube = new Map();
    for (const row of rows) {
      const key = `${row.source}|${row.metric_date}`;
      if (!cube.has(key)) cube.set(key, {});
      cube.get(key)[row.metric_name] = Number(row.metric_value || 0);
    }
    return cube;
  }

  function firstMetric(metrics, names) {
    for (const name of names) {
      if (Object.prototype.hasOwnProperty.call(metrics, name)) return Number(metrics[name] || 0);
    }
    return 0;
  }

  function categoryValue(source, metrics, category) {
    if (category === "exposure") {
      const priority = {
        blog: ["web_views"],
        youtube: ["views"],
        linkedin_company: ["impressions", "reach"],
        linkedin_ceo: ["impressions", "reach"],
        instagram: ["views", "reach"],
        facebook: ["page_views_total", "views", "reach"],
        mailchimp: ["delivered", "emails_sent"]
      };
      return firstMetric(metrics, priority[source] || ["views", "impressions", "reach"]);
    }
    if (category === "clicks") {
      const priority = {
        blog: ["search_clicks"],
        mailchimp: ["unique_clicks", "clicks"],
        linkedin_company: ["clicks"],
        linkedin_ceo: ["clicks"],
        facebook: ["clicks", "post_clicks"],
        instagram: ["website_clicks", "profile_links_taps"],
        youtube: []
      };
      return firstMetric(metrics, priority[source] || ["clicks"]);
    }
    if (category === "engagement") {
      if (source === "instagram" && Object.prototype.hasOwnProperty.call(metrics, "total_interactions")) return Number(metrics.total_interactions || 0);
      if (source === "facebook" && Object.prototype.hasOwnProperty.call(metrics, "post_engaged_users")) return Number(metrics.post_engaged_users || 0);
      if (source === "blog") return Number(metrics.web_engaged_sessions || 0);
      if (source === "mailchimp") return Number(metrics.unique_clicks || 0);
      return ["reactions", "comments", "shares", "saves"].reduce((sum, name) => sum + Number(metrics[name] || 0), 0);
    }
    return Number(metrics.content_published || 0);
  }

  function dailyCategory(rows, category, start, end) {
    const totals = new Map();
    if (category === "publishing") {
      const source = sourceFilter();
      for (const item of state.content) {
        if (!item.published_at) continue;
        if (source !== "all" && item.source !== source) continue;
        const day = dateOnly(item.published_at);
        if (day >= start && day <= end) totals.set(day, (totals.get(day) || 0) + 1);
      }
      return totals;
    }
    const filtered = rows.filter(row => row.metric_date >= start && row.metric_date <= end);
    const cube = metricCube(filtered);
    for (const [key, metrics] of cube.entries()) {
      const [source, day] = key.split("|");
      const value = categoryValue(source, metrics, category);
      totals.set(day, (totals.get(day) || 0) + value);
    }
    return totals;
  }

  function platformTotals(rows, category, start, end) {
    const totals = new Map();
    if (category === "publishing") {
      for (const item of state.content) {
        const day = dateOnly(item.published_at);
        if (day >= start && day <= end) totals.set(item.source, (totals.get(item.source) || 0) + 1);
      }
      return totals;
    }
    const cube = metricCube(rows.filter(row => row.metric_date >= start && row.metric_date <= end));
    for (const [key, metrics] of cube.entries()) {
      const [source] = key.split("|");
      totals.set(source, (totals.get(source) || 0) + categoryValue(source, metrics, category));
    }
    return totals;
  }

  function sumMap(map) {
    return [...map.values()].reduce((sum, value) => sum + Number(value || 0), 0);
  }

  function comparisonNote(current, previous) {
    if (!state.periodDays) return "All available history";
    if (!previous) return "No comparable previous-period data";
    const change = ((current - previous) / Math.abs(previous)) * 100;
    const arrow = change >= 0 ? "▲" : "▼";
    return `${arrow} ${Math.abs(change).toFixed(1)}% vs previous ${state.periodDays} days`;
  }

  function currentAudience() {
    const rows = rowsBySource(state.audience);
    const groups = new Map();
    for (const row of rows) {
      const key = `${row.source}|${row.account_id}`;
      if (!groups.has(key)) groups.set(key, {});
      groups.get(key)[row.metric_name] = Number(row.metric_value || 0);
    }
    let total = 0;
    for (const [key, values] of groups.entries()) {
      const source = key.split("|")[0];
      const priority = source === "mailchimp"
        ? ["audience_members"]
        : source === "youtube"
          ? ["subscribers"]
          : ["followers", "fans"];
      total += firstMetric(values, priority);
    }
    return total;
  }

  function renderKpis() {
    const rows = rowsBySource(state.daily);
    const end = shiftDate(new Date().toISOString().slice(0, 10), -1);
    const currentStart = state.currentStart;
    const previousEnd = state.previousStart ? shiftDate(currentStart, -1) : null;
    const categories = ["exposure", "clicks", "engagement"];
    for (const category of categories) {
      const current = sumMap(dailyCategory(rows, category, currentStart, end));
      const previous = state.previousStart ? sumMap(dailyCategory(rows, category, state.previousStart, previousEnd)) : 0;
      document.getElementById(`kpi-${category}`).textContent = numberFormat.format(current);
      document.getElementById(`kpi-${category}-note`).textContent = comparisonNote(current, previous);
    }
    document.getElementById("kpi-audience").textContent = numberFormat.format(currentAudience());
  }

  function completeDates(start, end) {
    const dates = [];
    let cursor = start;
    while (cursor <= end) {
      dates.push(cursor);
      cursor = shiftDate(cursor, 1);
      if (dates.length > 5000) break;
    }
    return dates;
  }

  function movingAverage(values, windowSize) {
    return values.map((_, index) => {
      const start = Math.max(0, index - windowSize + 1);
      const slice = values.slice(start, index + 1);
      return slice.reduce((sum, value) => sum + value, 0) / slice.length;
    });
  }

  function renderCharts() {
    const category = document.getElementById("trend-select").value;
    const rows = rowsBySource(state.daily);
    const end = shiftDate(new Date().toISOString().slice(0, 10), -1);
    const totals = dailyCategory(rows, category, state.currentStart, end);
    const labels = completeDates(state.currentStart, end);
    const values = labels.map(day => Number(totals.get(day) || 0));
    const title = {
      exposure: "Exposure / views",
      clicks: "Clicks",
      engagement: "Interactions",
      publishing: "Published content"
    }[category];
    document.getElementById("trend-heading").textContent = title;

    if (state.trendChart) state.trendChart.destroy();
    state.trendChart = new Chart(document.getElementById("trend-chart"), {
      type: "line",
      data: {
        labels,
        datasets: [
          { label: "Daily", data: values, borderWidth: 1.5, pointRadius: 0, tension: .2 },
          { label: "7-day average", data: movingAverage(values, 7), borderWidth: 2.5, pointRadius: 0, tension: .25 },
          { label: "28-day average", data: movingAverage(values, 28), borderWidth: 2.5, pointRadius: 0, tension: .25 }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        plugins: { legend: { position: "bottom" } },
        scales: {
          x: { ticks: { maxTicksLimit: 10 }, grid: { display: false } },
          y: { beginAtZero: true, ticks: { callback: value => numberFormat.format(value) } }
        }
      }
    });

    const allRows = state.daily;
    const platform = platformTotals(allRows, category, state.currentStart, end);
    const source = sourceFilter();
    const entries = [...platform.entries()]
      .filter(([key]) => source === "all" || key === source)
      .sort((a, b) => b[1] - a[1]);
    if (state.platformChart) state.platformChart.destroy();
    state.platformChart = new Chart(document.getElementById("platform-chart"), {
      type: "bar",
      data: {
        labels: entries.map(([key]) => SOURCE_LABELS[key] || key),
        datasets: [{ label: title, data: entries.map(([, value]) => value), borderWidth: 0, borderRadius: 7 }]
      },
      options: {
        indexAxis: "y",
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { beginAtZero: true, ticks: { callback: value => numberFormat.format(value) } },
          y: { grid: { display: false } }
        }
      }
    });
  }

  function contentExposure(item) {
    return Number(item.impressions || item.views || item.reach || item.delivered || item.emails_sent || 0);
  }

  function contentEngagement(item) {
    return Number(item.reactions || 0) + Number(item.comments || 0) + Number(item.shares || 0) + Number(item.saves || 0);
  }

  function renderContent() {
    const query = document.getElementById("content-search").value.trim().toLowerCase();
    const sort = document.getElementById("content-sort").value;
    const source = sourceFilter();
    let items = state.content.filter(item => {
      const day = dateOnly(item.published_at);
      const inPeriod = state.currentStart === "2000-01-01" || !day || day >= state.currentStart;
      return inPeriod && (source === "all" || item.source === source);
    });
    if (query) {
      items = items.filter(item => `${item.title || ""} ${item.author || ""}`.toLowerCase().includes(query));
    }
    items.sort((a, b) => {
      if (sort === "clicks") return Number(b.clicks || 0) - Number(a.clicks || 0);
      if (sort === "engagement") return contentEngagement(b) - contentEngagement(a);
      if (sort === "date") return new Date(b.published_at || 0) - new Date(a.published_at || 0);
      return contentExposure(b) - contentExposure(a);
    });
    items = items.slice(0, 100);

    const tbody = document.getElementById("content-table");
    tbody.innerHTML = "";
    for (const item of items) {
      const tr = document.createElement("tr");
      const title = item.url
        ? `<a href="${escapeHtml(item.url)}" target="_blank" rel="noopener">${escapeHtml(item.title || "Untitled")}</a>`
        : escapeHtml(item.title || "Untitled");
      const dateText = item.published_at ? dateFormat.format(new Date(item.published_at)) : "–";
      tr.innerHTML = `
        <td class="content-title">${title}<span class="content-meta">${escapeHtml(item.author || item.content_type || "")}</span></td>
        <td><span class="source-badge">${escapeHtml(SOURCE_LABELS[item.source] || item.source)}</span></td>
        <td>${dateText}</td>
        <td class="numeric">${numberFormat.format(contentExposure(item))}</td>
        <td class="numeric">${numberFormat.format(Number(item.clicks || 0))}</td>
        <td class="numeric">${numberFormat.format(contentEngagement(item))}</td>`;
      tbody.appendChild(tr);
    }
    document.getElementById("content-empty").classList.toggle("hidden", items.length > 0);
  }

  function escapeHtml(value) {
    return String(value || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function renderSync() {
    const grid = document.getElementById("sync-grid");
    grid.innerHTML = "";
    for (const row of state.sync) {
      const wrapper = document.createElement("div");
      wrapper.className = "sync-row";
      const finished = row.finished_at ? dateTimeFormat.format(new Date(row.finished_at)) : "Not finished";
      wrapper.innerHTML = `
        <div><strong>${escapeHtml(SOURCE_LABELS[row.source] || row.source)}</strong><small>${escapeHtml(finished)} · ${numberFormat.format(row.records_written || 0)} rows</small></div>
        <span class="sync-status ${row.status === "success" ? "success" : "error"}">${escapeHtml(row.status)}</span>`;
      wrapper.title = row.message || "";
      grid.appendChild(wrapper);
    }
    if (!state.sync.length) grid.innerHTML = '<p class="muted">No collector run has reached the database yet.</p>';
  }

  function renderReport() {
    const box = document.getElementById("ai-report");
    if (!state.report) {
      box.innerHTML = '<p class="muted">AI reporting is optional. Add an OpenAI API key and model in the collector repository to enable it.</p>';
      return;
    }
    box.textContent = state.report.report_text;
  }

  function renderAll() {
    renderKpis();
    renderCharts();
    renderContent();
    renderSync();
    renderReport();
  }

  async function authenticate() {
    const { data } = await client.auth.getSession();
    state.session = data.session;
    if (!state.session) {
      show(loginScreen);
      return;
    }
    show(app);
    document.getElementById("dashboard-title").textContent = config.dashboardTitle || "GRÁNIT Content Intelligence";
    document.getElementById("signed-in-user").textContent = state.session.user.email || "";
    try {
      await loadData();
    } catch (error) {
      console.error(error);
      document.getElementById("last-refresh").textContent = `Data error: ${error.message}`;
    }
  }

  document.getElementById("login-form").addEventListener("submit", async event => {
    event.preventDefault();
    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value;
    const errorEl = document.getElementById("login-error");
    errorEl.textContent = "";
    const { error } = await client.auth.signInWithPassword({ email, password });
    if (error) {
      errorEl.textContent = error.message;
      return;
    }
    await authenticate();
  });

  document.getElementById("logout-button").addEventListener("click", async () => {
    await client.auth.signOut();
    state.session = null;
    show(loginScreen);
  });
  document.getElementById("refresh-button").addEventListener("click", loadData);
  document.getElementById("range-select").addEventListener("change", loadData);
  document.getElementById("source-select").addEventListener("change", renderAll);
  document.getElementById("trend-select").addEventListener("change", renderCharts);
  document.getElementById("content-search").addEventListener("input", renderContent);
  document.getElementById("content-sort").addEventListener("change", renderContent);

  client.auth.onAuthStateChange((_event, session) => {
    state.session = session;
  });
  authenticate();
})();
