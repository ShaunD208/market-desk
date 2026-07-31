import { useState, useEffect, useCallback, useRef } from "react";
import { Settings, RefreshCw, X, Plus, TrendingUp, TrendingDown, ChevronUp, ChevronDown, Circle } from "lucide-react";

// ---- Static reference data -------------------------------------------------

const SECTOR_MAP = {
  TJX: "Consumer Disc.", LIN: "Materials", MU: "Semiconductors", PANW: "Software",
  LRCX: "Semiconductors", CRWV: "Cloud / AI Infra", HON: "Industrials (Automation)", HONA: "Aerospace & Defense", GOOGL: "Comm. Services",
  BA: "Industrials", MSFT: "Technology", COF: "Financials", JNJ: "Health Care",
  AAPL: "Technology", XLI: "Sector ETF", WFC: "Financials", PG: "Consumer Staples",
  XLF: "Sector ETF", RFG: "Sector ETF", AVGO: "Semiconductors", CAH: "Health Care",
  META: "Comm. Services", AMZN: "Consumer Disc.", TXN: "Semiconductors", FDX: "Industrials",
  UPS: "Industrials", GLW: "Hardware", INTC: "Semiconductors", FDXF: "Transportation (LTL)", DELL: "Hardware",
  GEV: "Industrials", NVDA: "Semiconductors", SPY: "Index", QQQ: "Index", DIA: "Index", IWM: "Index",
};

const DEFAULT_WATCHLIST = [
  "TJX", "LIN", "MU", "PANW", "LRCX", "CRWV", "HONA", "GOOGL", "BA", "MSFT", "COF", "JNJ", "AAPL", "XLI",
  "WFC", "PG", "XLF", "RFG", "AVGO", "CAH", "META", "AMZN", "TXN", "FDX", "UPS", "GLW", "INTC", "FDXF",
  "DELL", "GEV", "NVDA",
];

const INDEX_PROXIES = [
  { symbol: "SPY", label: "S&P 500" },
  { symbol: "QQQ", label: "Nasdaq 100" },
  { symbol: "DIA", label: "Dow Jones" },
  { symbol: "IWM", label: "Russell 2000" },
];

// Real snapshot the user shared from their broker screen — used to seed simulated mode.
// price = last price, dp = the "After" % shown (treated here as the day's % change for simulation).
const SEED_QUOTES = {
  TXN: { price: 279.41, dp: 0.08 }, META: { price: 593.87, dp: 0.24 }, AMZN: { price: 231.39, dp: 0.11 },
  INTC: { price: 91.67, dp: -0.39 }, LIN: { price: 507.02, dp: -0.03 }, UPS: { price: 112.95, dp: 0.04 },
  GEV: { price: 996.57, dp: -0.16 }, PANW: { price: 317.32, dp: 0.18 }, NVDA: { price: 196.51, dp: 0.29 },
  GOOGL: { price: 326.56, dp: 0.26 }, COF: { price: 207.05, dp: -0.32 }, MSFT: { price: 389.10, dp: 0.00 },
  TJX: { price: 156.38, dp: 0.35 }, AAPL: { price: 336.91, dp: -0.12 }, WFC: { price: 87.27, dp: 0.15 },
  HON: { price: 245.75, dp: 0.10 }, XLF: { price: 56.88, dp: -0.05 }, BA: { price: 211.50, dp: 0.17 },
  PG: { price: 148.63, dp: -0.07 }, AVGO: { price: 383.22, dp: 0.07 }, XLI: { price: 183.20, dp: 0.70 },
  RFG: { price: 60.73, dp: 0.00 },
  // index proxies, approximate
  SPY: { price: 634.10, dp: 0.12 }, QQQ: { price: 561.40, dp: 0.18 }, DIA: { price: 431.80, dp: 0.05 }, IWM: { price: 231.60, dp: -0.08 },
};

// Plausible baseline prices for watchlist symbols not in the user's shared screenshot,
// so simulated mode still has a sensible starting point for every ticker.
const FALLBACK_BASE_PRICE = {
  MU: 118.4, LRCX: 92.1, CRWV: 148.6, HONA: 220.2, JNJ: 162.3, FDX: 244.7,
  GLW: 47.8, CAH: 148.9, FDXF: 38.5, DELL: 121.6,
};

function splitCsvLine(line) {
  const result = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { inQuotes = !inQuotes; continue; }
    if (ch === "," && !inQuotes) { result.push(cur); cur = ""; continue; }
    cur += ch;
  }
  result.push(cur);
  return result;
}

const CSV_HEADER_ALIASES = {
  symbol: ["symbol", "ticker", "stock", "sym"],
  shares: ["shares", "quantity", "qty", "units", "share qty"],
  cost: ["cost/share", "cost per share", "avg cost", "average cost", "cost basis/share", "cost basis", "cost", "price paid", "avg price"],
};

function parseCsvHoldings(text) {
  const lines = text.trim().split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return { rows: [], error: "Paste a header row plus at least one data row." };
  const headers = splitCsvLine(lines[0]).map((h) => h.trim().toLowerCase());
  const findCol = (aliases) => headers.findIndex((h) => aliases.includes(h));
  const symbolIdx = findCol(CSV_HEADER_ALIASES.symbol);
  const sharesIdx = findCol(CSV_HEADER_ALIASES.shares);
  const costIdx = findCol(CSV_HEADER_ALIASES.cost);
  if (symbolIdx === -1 || sharesIdx === -1 || costIdx === -1) {
    return { rows: [], error: "Couldn't find Symbol, Shares, and Cost columns. Try headers like: Symbol, Shares, Cost/Share." };
  }
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = splitCsvLine(lines[i]);
    const symbol = (cols[symbolIdx] || "").trim().toUpperCase().replace(/["']/g, "");
    const shares = parseFloat((cols[sharesIdx] || "").replace(/[",$]/g, ""));
    const cost = parseFloat((cols[costIdx] || "").replace(/[",$]/g, ""));
    if (symbol && shares > 0 && cost > 0) rows.push({ symbol, shares, cost });
  }
  return { rows, error: rows.length ? null : "No valid rows found — check that Shares and Cost are numbers." };
}

function seededRandom(seed) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return () => {
    h = (h * 1664525 + 1013904223) >>> 0;
    return h / 4294967296;
  };
}

function buildMockQuote(symbol, prevQuote) {
  const rand = seededRandom(symbol + Date.now());
  let basePrice;
  let baseDp;
  if (prevQuote) {
    basePrice = prevQuote.c;
    baseDp = prevQuote.dp;
  } else if (SEED_QUOTES[symbol]) {
    basePrice = SEED_QUOTES[symbol].price;
    baseDp = SEED_QUOTES[symbol].dp;
  } else {
    basePrice = FALLBACK_BASE_PRICE[symbol] || 50 + rand() * 300;
    baseDp = (rand() - 0.5) * 2.5;
  }
  // small jitter each refresh so it feels alive without losing the seeded starting point
  const jitter = (rand() - 0.5) * 0.4;
  const dp = baseDp + jitter;
  const c = basePrice * (1 + jitter / 100);
  const pc = c / (1 + dp / 100);
  const d = c - pc;
  const h = c * (1 + rand() * 0.006);
  const l = c * (1 - rand() * 0.006);
  const o = pc * (1 + (rand() - 0.5) * 0.004);
  return { c, d, dp, h, l, o, pc, t: Math.floor(Date.now() / 1000) };
}

const FONT_IMPORT = `
@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=JetBrains+Mono:wght@400;500;600&family=Inter:wght@400;500;600&display=swap');
`;

// ---- Helpers ----------------------------------------------------------------

function fmt(n, digits = 2) {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return n.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}
function fmtMoney(n) {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  const sign = n < 0 ? "-" : "";
  return `${sign}$${fmt(Math.abs(n))}`;
}
function fmtPct(n) {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  const sign = n > 0 ? "+" : "";
  return `${sign}${fmt(n)}%`;
}
function changeColor(n) {
  if (n === null || n === undefined || Number.isNaN(n) || n === 0) return "#8B87A8";
  return n > 0 ? "#34E7A6" : "#FF5C82";
}

// Finnhub doesn't allow direct browser requests (no CORS headers), so if the
// direct call fails we retry through pass-through proxies that add them.
// Try a couple of options in order since free proxy services can be flaky.
async function fetchQuote(symbol, apiKey) {
  const target = `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol)}&token=${apiKey}`;
  const attempts = [
    () => fetch(target),
    () => fetch(`https://corsproxy.io/?url=${encodeURIComponent(target)}`),
    () => fetch(`https://api.allorigins.win/raw?url=${encodeURIComponent(target)}`),
  ];
  let lastErr = null;
  for (const attempt of attempts) {
    try {
      const res = await attempt();
      if (res.status === 401 || res.status === 403) throw new Error("AUTH");
      if (!res.ok) throw new Error("HTTP_" + res.status);
      return await res.json();
    } catch (e) {
      if (e.message === "AUTH") throw e;
      lastErr = e;
    }
  }
  throw lastErr || new Error("UNREACHABLE");
}

// Run quote fetches in small batches so we don't hammer the free proxy services.
async function fetchQuotesBatched(symbols, apiKey, batchSize = 6, pauseMs = 250) {
  const out = [];
  for (let i = 0; i < symbols.length; i += batchSize) {
    const batch = symbols.slice(i, i + batchSize);
    const results = await Promise.all(
      batch.map(async (sym) => {
        try {
          const data = await fetchQuote(sym, apiKey);
          return [sym, data, null];
        } catch (e) {
          return [sym, null, e.message || "ERROR"];
        }
      })
    );
    out.push(...results);
    if (i + batchSize < symbols.length) await new Promise((r) => setTimeout(r, pauseMs));
  }
  return out;
}

// Free public finance RSS feeds — no API key, no cost. Used to give the AI
// briefing real headlines to reason about instead of paid search grounding.
const NEWS_FEEDS = [
  "https://feeds.content.dowjones.io/public/rss/mw_topstories",
  "https://www.cnbc.com/id/20910258/device/rss/rss.html",
];

async function fetchViaProxyChain(target) {
  const attempts = [
    () => fetch(target),
    () => fetch(`https://corsproxy.io/?url=${encodeURIComponent(target)}`),
    () => fetch(`https://api.allorigins.win/raw?url=${encodeURIComponent(target)}`),
  ];
  for (const attempt of attempts) {
    try {
      const res = await attempt();
      if (!res.ok) continue;
      return await res.text();
    } catch (e) { /* try next */ }
  }
  return null;
}

function extractHeadlines(xmlText, limit = 6) {
  if (!xmlText) return [];
  const matches = [...xmlText.matchAll(/<title>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/title>/gs)];
  return matches
    .slice(1) // first <title> is usually the feed's own title, not a story
    .map((m) => m[1].trim())
    .filter((t) => t && !/^\s*$/.test(t))
    .slice(0, limit);
}

async function fetchMarketHeadlines() {
  const results = await Promise.all(NEWS_FEEDS.map((url) => fetchViaProxyChain(url)));
  const headlines = results.flatMap((xml) => extractHeadlines(xml, 6));
  return headlines.slice(0, 10);
}

// Free on Finnhub's tier — used to give the briefing real earnings dates for
// the user's own symbols instead of generic news alone. Fails silently if
// unavailable so it never blocks the rest of the briefing.
async function fetchEarningsCalendar(apiKey) {
  if (!apiKey) return [];
  const from = new Date();
  const to = new Date();
  to.setDate(to.getDate() + 7);
  const iso = (d) => d.toISOString().slice(0, 10);
  const target = `https://finnhub.io/api/v1/calendar/earnings?from=${iso(from)}&to=${iso(to)}&token=${apiKey}`;
  try {
    const text = await fetchViaProxyChain(target);
    if (!text) return [];
    const data = JSON.parse(text);
    return Array.isArray(data.earningsCalendar) ? data.earningsCalendar : [];
  } catch (e) {
    return [];
  }
}

// Rough US market session detector (Eastern Time), no API needed.
function getMarketSession() {
  const now = new Date();
  const et = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
  const day = et.getDay();
  const minutes = et.getHours() * 60 + et.getMinutes();
  if (day === 0 || day === 6) return "Weekend";
  if (minutes < 4 * 60) return "Closed";
  if (minutes < 9 * 60 + 30) return "Pre-Market";
  if (minutes < 16 * 60) return "Market Open";
  if (minutes < 20 * 60) return "After-Hours";
  return "Closed";
}

// Finnhub's free tier doesn't reliably push live pre/after-market ticks for
// every individual stock — outside regular hours, a quote's own last-trade
// timestamp is often still the prior regular session's close, which makes
// its % change misleading (it looks like a live move but isn't). Flag those
// so we don't treat a stale close-to-close number as a real intraday move.
function isQuoteStale(q, sessionLabel) {
  if (!q || !q.t) return false;
  if (sessionLabel !== "Pre-Market" && sessionLabel !== "After-Hours") return false;
  const hoursSinceQuote = (Date.now() - q.t * 1000) / 3600000;
  return hoursSinceQuote > 10;
}

// Calls Google's free-tier Gemini API directly from the browser (no backend
// needed — confirmed CORS-friendly on the standard generateContent endpoint).
async function callGemini(apiKeyG, prompt) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${encodeURIComponent(apiKeyG)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.4 },
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Gemini ${res.status}: ${text.slice(0, 200)}`);
  }
  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("") || "";
  if (!text) throw new Error("Empty response from Gemini");
  return text;
}

function buildBriefingPrompt({ dateStr, sessionLabel, indexLines, moverLines, headlines, earningsLines, listName }) {
  const framingNote = sessionLabel === "Pre-Market" || sessionLabel === "Weekend" || sessionLabel === "Closed"
    ? "The market has not opened yet (or is closed). Write this as a forward-looking pre-market brief — what to watch for once trading starts today — not a recap of a session that hasn't happened."
    : sessionLabel === "Market Open"
    ? "The market is currently open. Write this as a live read on today's session so far."
    : "The market has closed for the day (after-hours). Write this as a end-of-day recap.";

  return `You are a calm, precise market-briefing assistant writing a short note for a retail investor reviewing their "${listName || "Watchlist"}" list. Today is ${dateStr}. Current market session: ${sessionLabel}.

${framingNote}

INDEX SNAPSHOT (${sessionLabel === "Pre-Market" || sessionLabel === "After-Hours" ? "extended-hours prices where available — these reflect early/late trading in the ETFs themselves, not futures contracts, and some may not have a live print yet (noted individually below if so)" : "current prices"}):
${indexLines}

NOTABLE WATCHLIST MOVERS (stocks with stale, non-live quotes have already been excluded — a short or empty list here during pre-market/after-hours is normal and means few names have live extended-hours prints yet, not that nothing is happening):
${moverLines || "(no live-quote movers available right now)"}

UPCOMING EARNINGS (next 7 days, for this user's own watchlist/portfolio symbols only):
${earningsLines || "(none scheduled in the next 7 days, or data unavailable)"}

RECENT FINANCIAL HEADLINES:
${headlines.length ? headlines.map((h) => `- ${h}`).join("\n") : "(no headlines available right now — base your read on price action and earnings alone)"}

Write a briefing using ONLY the information above. Do not invent facts, numbers, or events not implied by this data. Do not give buy/sell/hold recommendations or tell the reader what to do with their money — describe what's happening (or what to watch for) and why it might matter, and let them draw their own conclusions. If any headline mentions a major economic event (Fed meeting, inflation data, jobs report, etc.), work it in. Keep it grounded and specific, not generic.

Respond with ONLY raw JSON (no markdown fences, no commentary) matching exactly this shape:
{
  "summary": "2-4 sentences on what's driving markets today (or what to watch for, if pre-market), in plain language",
  "riskLabel": "Risk-On" | "Risk-Off" | "Mixed / Neutral",
  "riskReason": "one short sentence justifying the label",
  "callouts": [
    { "symbol": "TICKER", "note": "one short, specific sentence of context — not advice. Mention an upcoming earnings date here if this symbol has one." }
  ]
}
Include at most 5 callouts, only for names with something genuinely notable to say (price move, upcoming earnings, or relevant headline). If nothing stands out, return an empty callouts array.`;
}

function parseBriefingResponse(text) {
  let cleaned = text.trim();
  cleaned = cleaned.replace(/^```json\s*/i, "").replace(/^```\s*/, "").replace(/```\s*$/, "");
  const parsed = JSON.parse(cleaned);
  if (!parsed || typeof parsed.summary !== "string") throw new Error("Unexpected shape");
  return {
    summary: parsed.summary,
    riskLabel: parsed.riskLabel || "Mixed / Neutral",
    riskReason: parsed.riskReason || "",
    callouts: Array.isArray(parsed.callouts) ? parsed.callouts.slice(0, 5) : [],
  };
}

function buildMockSeries(symbol, pc, c, points = 40) {
  const rand = seededRandom(symbol + "-series-" + Date.now());
  const arr = [];
  let price = pc;
  const drift = (c - pc) / points;
  for (let i = 0; i <= points; i++) {
    const noise = (rand() - 0.5) * Math.abs(c || 1) * 0.005;
    price = price + drift + noise;
    arr.push(price);
  }
  arr[arr.length - 1] = c;
  return arr;
}

// Detects whether this is running inside a Claude artifact (which has the
// special window.storage API) or as a real deployed website (which doesn't,
// but has normal localStorage instead). One file now works in both places.
const IN_ARTIFACT_SANDBOX = typeof window !== "undefined" && !!window.storage;

async function safeStorageGet(key) {
  try {
    if (IN_ARTIFACT_SANDBOX) {
      const res = await window.storage.get(key, false);
      return res ? JSON.parse(res.value) : null;
    }
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}
async function safeStorageSet(key, value) {
  try {
    if (IN_ARTIFACT_SANDBOX) {
      await window.storage.set(key, JSON.stringify(value), false);
      return;
    }
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.error("storage set failed", e);
  }
}

// ---- Small UI atoms -----------------------------------------------------

function ChangeTag({ value, pct, size = "sm" }) {
  const color = changeColor(pct ?? value);
  const Icon = (pct ?? value) > 0 ? ChevronUp : (pct ?? value) < 0 ? ChevronDown : Circle;
  return (
    <span
      className={`inline-flex items-center gap-0.5 font-mono ${size === "lg" ? "text-lg" : "text-sm"}`}
      style={{ color }}
    >
      <Icon size={size === "lg" ? 16 : 12} strokeWidth={2.5} />
      {pct !== undefined ? fmtPct(pct) : fmtMoney(value)}
    </span>
  );
}

function SortHeader({ label, field, sortField, sortDir, onSort, align = "left", sticky = false }) {
  const active = sortField === field;
  return (
    <th
      onClick={() => onSort(field)}
      className={`cursor-pointer select-none px-3 py-2 text-sm uppercase tracking-wider font-medium whitespace-nowrap`}
      style={{
        color: active ? "#A78BFA" : "#8B87A8", textAlign: align,
        ...(sticky ? { position: "sticky", left: 0, zIndex: 2, background: "#171331", boxShadow: "4px 0 8px -4px rgba(0,0,0,0.45)" } : {}),
      }}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {active && (sortDir === "asc" ? <ChevronUp size={12} /> : <ChevronDown size={12} />)}
      </span>
    </th>
  );
}

// ---- Main component -------------------------------------------------------

export default function MarketDesk() {
  const [ready, setReady] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [keyDraft, setKeyDraft] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [simulated, setSimulated] = useState(false);

  const [watchlists, setWatchlists] = useState([{ id: "paper-trade", name: "Paper Trade", symbols: DEFAULT_WATCHLIST }]);
  const [activeListId, setActiveListId] = useState("paper-trade");
  const initialListIdRef = useRef(activeListId);
  const [newListName, setNewListName] = useState("");
  const [showNewListInput, setShowNewListInput] = useState(false);
  const [editingListId, setEditingListId] = useState(null);
  const [editingListName, setEditingListName] = useState("");
  const [portfolio, setPortfolio] = useState([]); // {id, symbol, shares, cost}

  const [quotes, setQuotes] = useState({}); // symbol -> {c,d,dp,h,l,o,pc}
  const [indexSeries, setIndexSeries] = useState({}); // symbol -> array of prices, for the 4 index cards
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [lastUpdated, setLastUpdated] = useState(null);

  const [tab, setTab] = useState("overview");
  const [newSymbol, setNewSymbol] = useState("");
  const [newShares, setNewShares] = useState("");
  const [newCost, setNewCost] = useState("");
  const [newHoldingSymbol, setNewHoldingSymbol] = useState("");

  const [wlSort, setWlSort] = useState({ field: "symbol", dir: "asc" });
  const [pfSort, setPfSort] = useState({ field: "symbol", dir: "asc" });

  const [backupCode, setBackupCode] = useState("");
  const [backupCopied, setBackupCopied] = useState(false);
  const [importText, setImportText] = useState("");
  const [importMsg, setImportMsg] = useState("");
  const [includeKeyInBackup, setIncludeKeyInBackup] = useState(true);

  const [showCsvImport, setShowCsvImport] = useState(false);
  const [csvText, setCsvText] = useState("");
  const [csvError, setCsvError] = useState("");
  const [portfolioHistory, setPortfolioHistory] = useState([]); // [{date, value}]

  const [geminiKey, setGeminiKey] = useState("");
  const [geminiKeyDraft, setGeminiKeyDraft] = useState("");
  const [briefings, setBriefings] = useState({}); // { [listId]: { date, summary, riskLabel, riskReason, callouts, generatedAt } }
  const [briefingLoading, setBriefingLoading] = useState(false);
  const [briefingError, setBriefingError] = useState("");

  const intervalRef = useRef(null);
  const autoBriefingRef = useRef(null);

  const activeList = watchlists.find((l) => l.id === activeListId) || watchlists[0];
  const watchlist = activeList ? activeList.symbols : [];
  const briefing = briefings[activeListId] || null;

  // ---- Load persisted state ----
  useEffect(() => {
    (async () => {
      const settings = await safeStorageGet("md-settings");
      const wls = await safeStorageGet("md-watchlists");
      const legacyWl = await safeStorageGet("md-watchlist"); // pre-multi-list format
      const pf = await safeStorageGet("md-portfolio");
      const brs = await safeStorageGet("md-briefings");
      const legacyBr = await safeStorageGet("md-briefing"); // pre-multi-list format
      const ph = await safeStorageGet("md-portfolio-history");
      if (settings?.apiKey) {
        setApiKey(settings.apiKey);
        setKeyDraft(settings.apiKey);
      }
      if (settings?.geminiKey) {
        setGeminiKey(settings.geminiKey);
        setGeminiKeyDraft(settings.geminiKey);
      }
      if (settings?.autoRefresh) setAutoRefresh(true);
      if (settings?.simulated) setSimulated(true);
      if (Array.isArray(wls) && wls.length) {
        setWatchlists(wls);
        const defaultId = wls.find((l) => l.id === "paper-trade") ? "paper-trade" : wls[0].id;
        setActiveListId(defaultId);
        initialListIdRef.current = defaultId;
      } else if (Array.isArray(legacyWl) && legacyWl.length) {
        const migrated = [{ id: "paper-trade", name: "Paper Trade", symbols: legacyWl }];
        setWatchlists(migrated);
        safeStorageSet("md-watchlists", migrated);
      }
      if (Array.isArray(pf)) setPortfolio(pf);
      if (brs && typeof brs === "object") {
        setBriefings(brs);
      } else if (legacyBr && legacyBr.date) {
        setBriefings({ "paper-trade": legacyBr });
      }
      if (Array.isArray(ph)) setPortfolioHistory(ph);
      setReady(true);
    })();
  }, []);

  const persistSettings = useCallback((key, auto, sim, gKey) => {
    safeStorageSet("md-settings", { apiKey: key, autoRefresh: auto, simulated: sim, geminiKey: gKey });
  }, []);

  // ---- Fetching ----
  const allSymbols = useCallback(() => {
    const set = new Set([...INDEX_PROXIES.map((i) => i.symbol), ...watchlist, ...portfolio.map((p) => p.symbol)]);
    return Array.from(set);
  }, [watchlist, portfolio]);

  const fetchAll = useCallback(async () => {
    if (!apiKey && !simulated) return;
    setLoading(true);
    setError("");
    const symbols = allSymbols();

    if (simulated) {
      // Simulate a brief "loading" beat so refresh feels real, then jitter prices.
      await new Promise((r) => setTimeout(r, 350));
      let computedQuotes = {};
      setQuotes((prev) => {
        const next = { ...prev };
        for (const sym of symbols) next[sym] = buildMockQuote(sym, prev[sym]);
        computedQuotes = next;
        return next;
      });
      setLastUpdated(new Date());
      setIndexSeries((prev) => {
        const next = { ...prev };
        for (const { symbol } of INDEX_PROXIES) {
          const q = computedQuotes[symbol];
          if (q) next[symbol] = buildMockSeries(symbol, q.pc, q.c);
        }
        return next;
      });
      recordPortfolioSnapshot(computedQuotes);
      setLoading(false);
      return;
    }

    try {
      const results = await fetchQuotesBatched(symbols, apiKey);
      const next = {};
      let authFailed = false;
      let allFailed = true;
      for (const [sym, data, errType] of results) {
        if (errType === "AUTH") authFailed = true;
        if (data === null) continue;
        if (data && data.c === undefined) continue;
        next[sym] = data;
        allFailed = false;
      }
      let computedQuotes = {};
      setQuotes((prev) => {
        computedQuotes = { ...prev, ...next };
        return computedQuotes;
      });
      setLastUpdated(new Date());

      // Finnhub's free tier blocks the historical-candle endpoint (premium-only,
      // returns 403), so instead of faking a shape we build the index charts from
      // real prices as they come in — each refresh appends the actual observed
      // price, so the chart is a genuine (if gradually-built) live price trail.
      setIndexSeries((prev) => {
        const nextSeries = { ...prev };
        for (const { symbol } of INDEX_PROXIES) {
          const q = computedQuotes[symbol];
          if (!q) continue;
          const existing = prev[symbol];
          if (!existing || existing.length < 2) {
            // First time we see this symbol: seed a short lead-in so the chart
            // isn't a single dot, then the real trail builds from here on.
            nextSeries[symbol] = [...buildMockSeries(symbol, q.pc, q.c, 8), q.c];
          } else {
            nextSeries[symbol] = [...existing, q.c].slice(-80);
          }
        }
        return nextSeries;
      });
      recordPortfolioSnapshot(computedQuotes);

      if (Object.keys(next).length === 0) {
        if (authFailed) {
          setError("Finnhub rejected your API key. Double-check it in Settings — no extra spaces, and make sure it's still active on your Finnhub dashboard.");
        } else if (allFailed) {
          setError("Couldn't reach the data feed right now. This can happen if the pass-through proxy is temporarily overloaded — try Refresh again in a moment.");
        } else {
          setError("No data came back for these symbols yet.");
        }
      }
    } catch (e) {
      setError("Couldn't reach Finnhub. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }, [apiKey, allSymbols, simulated]);

  useEffect(() => {
    if (ready && (apiKey || simulated)) fetchAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, apiKey, simulated]);

  useEffect(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (autoRefresh && (apiKey || simulated)) {
      intervalRef.current = setInterval(fetchAll, 60000);
    }
    return () => intervalRef.current && clearInterval(intervalRef.current);
  }, [autoRefresh, apiKey, simulated, fetchAll]);

  useEffect(() => {
    if (!ready || !geminiKey) return;
    if (activeListId !== initialListIdRef.current) return; // only the default list auto-briefs; other lists are manual
    const todayStr = new Date().toDateString();
    if (briefing && briefing.date === todayStr) return;
    if (autoBriefingRef.current === todayStr + activeListId) return;
    autoBriefingRef.current = todayStr + activeListId;
    generateBriefing(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, geminiKey, briefing, lastUpdated, activeListId]);

  // ---- Handlers ----
  function saveApiKey() {
    const key = keyDraft.trim();
    setApiKey(key);
    setSimulated(false);
    persistSettings(key, autoRefresh, false, geminiKey);
    setShowSettings(false);
  }
  function enterSimulatedMode() {
    setSimulated(true);
    persistSettings(apiKey, autoRefresh, true, geminiKey);
  }
  function exitSimulatedMode() {
    setSimulated(false);
    setQuotes({});
    persistSettings(apiKey, autoRefresh, false, geminiKey);
    setShowSettings(true);
  }
  function saveGeminiKey() {
    const key = geminiKeyDraft.trim();
    setGeminiKey(key);
    persistSettings(apiKey, autoRefresh, simulated, key);
  }

  async function generateBriefing(force) {
    if (!geminiKey) {
      setBriefingError("Add a free Gemini API key in Settings to enable the AI briefing.");
      return;
    }
    const targetListId = activeListId;
    const targetListName = activeList?.name || "Watchlist";
    const todayStr = new Date().toDateString();
    if (!force && briefing && briefing.date === todayStr) return;
    setBriefingLoading(true);
    setBriefingError("");
    try {
      const sessionLabel = getMarketSession();
      const [headlines, earningsAll] = await Promise.all([
        simulated ? Promise.resolve([]) : fetchMarketHeadlines(),
        simulated ? Promise.resolve([]) : fetchEarningsCalendar(apiKey),
      ]);
      const mySymbols = new Set([...watchlist, ...portfolio.map((p) => p.symbol)]);
      const earningsLines = earningsAll
        .filter((e) => mySymbols.has(e.symbol))
        .slice(0, 8)
        .map((e) => `${e.symbol}: reporting ${e.date}${e.hour === "bmo" ? " (before market open)" : e.hour === "amc" ? " (after market close)" : ""}`)
        .join("\n");
      const indexLines = INDEX_PROXIES.map(({ symbol, label }) => {
        const q = quotes[symbol];
        if (!q) return `${label} (${symbol}): no data yet`;
        if (isQuoteStale(q, sessionLabel)) return `${label} (${symbol}): ${fmt(q.c)}, no live extended-hours print yet — this is still the prior session's close, not a real pre/after-market move`;
        return `${label} (${symbol}): ${fmt(q.c)}, ${fmtPct(q.dp)}`;
      }).join("\n");
      const moversForPrompt = watchlist
        .map((sym) => {
          const q = quotes[sym];
          if (!q || isQuoteStale(q, sessionLabel)) return null;
          return { symbol: sym, pct: q.dp, price: q.c };
        })
        .filter(Boolean)
        .sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct))
        .slice(0, 12);
      const moverLines = moversForPrompt.map((m) => `${m.symbol}: ${fmt(m.price)} (${fmtPct(m.pct)})`).join("\n");
      const dateStr = new Date().toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric" });
      const prompt = buildBriefingPrompt({ dateStr, sessionLabel, indexLines, moverLines, headlines, earningsLines, listName: targetListName });
      const raw = await callGemini(geminiKey, prompt);
      const parsed = parseBriefingResponse(raw);
      const next = { ...parsed, date: todayStr, sessionLabel, generatedAt: new Date().toISOString(), simulatedNote: simulated, listName: targetListName };
      setBriefings((prev) => {
        const nextAll = { ...prev, [targetListId]: next };
        safeStorageSet("md-briefings", nextAll);
        return nextAll;
      });
    } catch (e) {
      setBriefingError("Couldn't generate the briefing — " + (e.message || "unknown error") + ". Double-check your Gemini key in Settings.");
    } finally {
      setBriefingLoading(false);
    }
  }

  function generateBackupCode() {
    const payload = {
      v: 2,
      watchlists,
      portfolio,
      autoRefresh,
      simulated,
      apiKey: includeKeyInBackup ? apiKey : "",
      geminiKey: includeKeyInBackup ? geminiKey : "",
    };
    try {
      const code = btoa(encodeURIComponent(JSON.stringify(payload)));
      setBackupCode(code);
      setBackupCopied(false);
    } catch (e) {
      setBackupCode("");
    }
  }

  async function copyBackupCode() {
    try {
      await navigator.clipboard.writeText(backupCode);
      setBackupCopied(true);
    } catch (e) {
      setBackupCopied(false);
    }
  }

  function importBackupCode() {
    setImportMsg("");
    try {
      const decoded = JSON.parse(decodeURIComponent(atob(importText.trim())));
      if (!decoded || typeof decoded !== "object") throw new Error("bad shape");
      if (Array.isArray(decoded.watchlists) && decoded.watchlists.length) {
        setWatchlists(decoded.watchlists);
        safeStorageSet("md-watchlists", decoded.watchlists);
        const defaultId = decoded.watchlists.find((l) => l.id === "paper-trade") ? "paper-trade" : decoded.watchlists[0].id;
        setActiveListId(defaultId);
      } else if (Array.isArray(decoded.watchlist)) {
        // backward compatibility with older single-list backup codes
        const migrated = [{ id: "paper-trade", name: "Paper Trade", symbols: decoded.watchlist }];
        setWatchlists(migrated);
        safeStorageSet("md-watchlists", migrated);
        setActiveListId("paper-trade");
      }
      if (Array.isArray(decoded.portfolio)) {
        setPortfolio(decoded.portfolio);
        safeStorageSet("md-portfolio", decoded.portfolio);
      }
      const nextKey = decoded.apiKey || apiKey;
      const nextGeminiKey = decoded.geminiKey || geminiKey;
      const nextAuto = !!decoded.autoRefresh;
      const nextSim = decoded.apiKey ? false : simulated;
      setApiKey(nextKey);
      setKeyDraft(nextKey);
      setGeminiKey(nextGeminiKey);
      setGeminiKeyDraft(nextGeminiKey);
      setAutoRefresh(nextAuto);
      if (decoded.apiKey) setSimulated(false);
      persistSettings(nextKey, nextAuto, nextSim, nextGeminiKey);
      setQuotes({});
      setImportText("");
      setImportMsg("Imported! Your watchlists and portfolio are restored.");
    } catch (e) {
      setImportMsg("That code didn't look right — make sure you copied the whole thing.");
    }
  }

  function toggleAutoRefresh() {
    const next = !autoRefresh;
    setAutoRefresh(next);
    persistSettings(apiKey, next, simulated, geminiKey);
  }
  function addWatchSymbol(e) {
    e.preventDefault();
    const sym = newSymbol.trim().toUpperCase();
    if (!sym || watchlist.includes(sym)) { setNewSymbol(""); return; }
    const next = watchlists.map((l) => (l.id === activeListId ? { ...l, symbols: [...l.symbols, sym] } : l));
    setWatchlists(next);
    safeStorageSet("md-watchlists", next);
    setNewSymbol("");
  }
  function removeWatchSymbol(sym) {
    const next = watchlists.map((l) => (l.id === activeListId ? { ...l, symbols: l.symbols.filter((s) => s !== sym) } : l));
    setWatchlists(next);
    safeStorageSet("md-watchlists", next);
  }
  function addWatchlistList() {
    const name = newListName.trim();
    if (!name) { setShowNewListInput(false); return; }
    const id = `list-${Date.now()}`;
    const next = [...watchlists, { id, name, symbols: [] }];
    setWatchlists(next);
    safeStorageSet("md-watchlists", next);
    setActiveListId(id);
    setNewListName("");
    setShowNewListInput(false);
  }
  function renameWatchlistList(id, name) {
    setEditingListId(null);
    if (!name.trim()) return;
    const next = watchlists.map((l) => (l.id === id ? { ...l, name: name.trim() } : l));
    setWatchlists(next);
    safeStorageSet("md-watchlists", next);
  }
  function deleteWatchlistList(id) {
    if (watchlists.length <= 1) return;
    const next = watchlists.filter((l) => l.id !== id);
    setWatchlists(next);
    safeStorageSet("md-watchlists", next);
    if (activeListId === id) setActiveListId(next[0].id);
    setBriefings((prev) => {
      const nb = { ...prev };
      delete nb[id];
      safeStorageSet("md-briefings", nb);
      return nb;
    });
  }
  function addHolding(e) {
    e.preventDefault();
    const sym = newHoldingSymbol.trim().toUpperCase();
    const shares = parseFloat(newShares);
    const cost = parseFloat(newCost);
    if (!sym || !shares || !cost) return;
    const next = [...portfolio, { id: `${sym}-${Date.now()}`, symbol: sym, shares, cost }];
    setPortfolio(next);
    safeStorageSet("md-portfolio", next);
    setNewHoldingSymbol(""); setNewShares(""); setNewCost("");
  }
  function removeHolding(id) {
    const next = portfolio.filter((h) => h.id !== id);
    setPortfolio(next);
    safeStorageSet("md-portfolio", next);
  }

  const csvPreview = csvText.trim() ? parseCsvHoldings(csvText) : { rows: [], error: null };

  function importCsvHoldings() {
    const { rows, error } = parseCsvHoldings(csvText);
    if (error) { setCsvError(error); return; }
    const additions = rows.map((r) => ({
      id: `${r.symbol}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      symbol: r.symbol, shares: r.shares, cost: r.cost,
    }));
    const next = [...portfolio, ...additions];
    setPortfolio(next);
    safeStorageSet("md-portfolio", next);
    setCsvText("");
    setCsvError("");
    setShowCsvImport(false);
  }

  function handleCsvFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setCsvText(ev.target.result || "");
    reader.readAsText(file);
  }

  function recordPortfolioSnapshot(computedQuotes) {
    if (!portfolio.length) return;
    let total = 0;
    let hasAny = false;
    for (const h of portfolio) {
      const q = computedQuotes[h.symbol];
      if (q && q.c) { total += q.c * h.shares; hasAny = true; }
    }
    if (!hasAny) return;
    const todayKey = new Date().toISOString().slice(0, 10);
    setPortfolioHistory((prev) => {
      const next = [...prev];
      const idx = next.findIndex((p) => p.date === todayKey);
      if (idx >= 0) next[idx] = { date: todayKey, value: total };
      else next.push({ date: todayKey, value: total });
      const trimmed = next.slice(-180);
      safeStorageSet("md-portfolio-history", trimmed);
      return trimmed;
    });
  }

  function sortRows(rows, sort, accessor) {
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      const av = accessor(a, sort.field);
      const bv = accessor(b, sort.field);
      if (typeof av === "string") return av.localeCompare(bv) * dir;
      return ((av ?? -Infinity) - (bv ?? -Infinity)) * dir;
    });
  }
  function onSortWl(field) {
    setWlSort((s) => ({ field, dir: s.field === field && s.dir === "asc" ? "desc" : "asc" }));
  }
  function onSortPf(field) {
    setPfSort((s) => ({ field, dir: s.field === field && s.dir === "asc" ? "desc" : "asc" }));
  }

  // ---- Derived data ----
  const marketSession = getMarketSession();
  const watchRows = watchlist.map((sym) => {
    const q = quotes[sym];
    const stale = isQuoteStale(q, marketSession);
    return {
      symbol: sym, sector: SECTOR_MAP[sym] || "Other",
      price: q?.c ?? null, change: q?.d ?? null, pct: q?.dp ?? null,
      high: q?.h ?? null, low: q?.l ?? null, prevClose: q?.pc ?? null,
      stale,
    };
  });
  const sortedWatch = sortRows(watchRows, wlSort, (r, f) => r[f]);

  const portfolioRows = portfolio.map((h) => {
    const q = quotes[h.symbol];
    const price = q?.c ?? null;
    const value = price !== null ? price * h.shares : null;
    const costTotal = h.cost * h.shares;
    const pnl = value !== null ? value - costTotal : null;
    const pnlPct = costTotal ? (pnl / costTotal) * 100 : null;
    return { ...h, sector: SECTOR_MAP[h.symbol] || "Other", price, value, costTotal, pnl, pnlPct, dayPct: q?.dp ?? null };
  });
  const sortedPortfolio = sortRows(portfolioRows, pfSort, (r, f) => r[f]);

  const totalValue = portfolioRows.reduce((s, r) => s + (r.value ?? 0), 0);
  const totalCost = portfolioRows.reduce((s, r) => s + (r.costTotal ?? 0), 0);
  const totalPnl = totalValue - totalCost;
  const totalPnlPct = totalCost ? (totalPnl / totalCost) * 100 : 0;
  const totalDayChange = portfolioRows.reduce((s, r) => {
    if (r.value === null || r.dayPct === null) return s;
    const prevValue = r.value / (1 + r.dayPct / 100);
    return s + (r.value - prevValue);
  }, 0);

  const portfolioSectorTotals = {};
  for (const r of portfolioRows) {
    if (r.value === null) continue;
    portfolioSectorTotals[r.sector] = (portfolioSectorTotals[r.sector] || 0) + r.value;
  }
  const portfolioSectorEntries = Object.entries(portfolioSectorTotals).sort((a, b) => b[1] - a[1]);

  const moversSource = watchRows.filter((r) => r.pct !== null && !r.stale);
  const gainers = [...moversSource].sort((a, b) => b.pct - a.pct).slice(0, 5);
  const losers = [...moversSource].sort((a, b) => a.pct - b.pct).slice(0, 5);

  const sectorGroups = {};
  for (const r of watchRows) {
    if (r.sector === "Index") continue;
    if (!sectorGroups[r.sector]) sectorGroups[r.sector] = [];
    sectorGroups[r.sector].push(r);
  }

  const tapeItems = [...INDEX_PROXIES.map((i) => i.symbol), ...watchlist];
  const validPcts = watchRows.filter((r) => r.pct !== null && !r.stale).map((r) => r.pct);
  const avgPct = validPcts.length ? validPcts.reduce((a, b) => a + b, 0) / validPcts.length : 0;
  const sessionColors = {
    "Pre-Market": { bg: "rgba(167,139,250,0.15)", color: "#A78BFA", border: "rgba(167,139,250,0.35)" },
    "Market Open": { bg: "rgba(52,231,166,0.15)", color: "#34E7A6", border: "rgba(52,231,166,0.35)" },
    "After-Hours": { bg: "rgba(148,130,255,0.1)", color: "#9C97C4", border: "rgba(148,130,255,0.25)" },
    "Closed": { bg: "rgba(148,130,255,0.08)", color: "#655F8C", border: "rgba(148,130,255,0.18)" },
    "Weekend": { bg: "rgba(148,130,255,0.08)", color: "#655F8C", border: "rgba(148,130,255,0.18)" },
  };

  // ---- Render ----
  if (!ready) return null;

  if (!apiKey && !simulated) {
    return (
      <div style={{ background: "radial-gradient(ellipse 900px 600px at 15% -10%, rgba(139,124,246,0.16), transparent 60%), radial-gradient(ellipse 900px 700px at 110% 10%, rgba(214,95,224,0.12), transparent 55%), #07061a", minHeight: "600px", fontFamily: "Inter, sans-serif" }} className="flex items-center justify-center p-6">
        <style>{FONT_IMPORT}</style>
        <div className="max-w-md w-full rounded-lg p-8" style={{ background: "rgba(30,26,64,0.55)", border: "1px solid rgba(148,130,255,0.16)", backdropFilter: "blur(16px)", boxShadow: "0 10px 30px -14px rgba(107,70,229,0.35)" }}>
          <div className="flex items-center gap-2 mb-1">
            <div style={{ width: 8, height: 8, background: "linear-gradient(135deg, #8B7CF6 0%, #D65FE0 100%)", boxShadow: "0 0 10px 2px rgba(214,95,224,0.6)" }} className="rounded-full" />
            <span className="uppercase tracking-widest text-sm" style={{ color: "#8B87A8", fontFamily: "JetBrains Mono, monospace" }}>Market Desk</span>
          </div>
          <h1 style={{ fontFamily: "Space Grotesk, sans-serif", color: "#F1EEFB" }} className="text-3xl font-semibold mb-2">Connect a data feed</h1>
          {IN_ARTIFACT_SANDBOX ? (
            <>
              <p className="text-base mb-3" style={{ color: "#9C97C4" }}>
                This dashboard is built to pull live quotes from Finnhub's free API. Heads up: this artifact's sandbox blocks outgoing requests to external sites, so live data won't load here no matter what key you use — that's a platform restriction, not a problem with your account.
              </p>
              <button
                onClick={enterSimulatedMode}
                className="w-full py-2.5 rounded-md text-base font-semibold mb-4"
                style={{ background: "linear-gradient(135deg, #8B7CF6 0%, #D65FE0 100%)", color: "#0B0819", fontFamily: "Space Grotesk, sans-serif", boxShadow: "0 8px 24px -6px rgba(214,95,224,0.5)" }}
              >
                Use simulated data now
              </button>
              <details className="text-base" style={{ color: "#9C97C4" }}>
                <summary className="cursor-pointer select-none" style={{ color: "#8B87A8" }}>Have a Finnhub key anyway? (won't fetch live here, but saved for later)</summary>
                <div className="mt-3">
                  <input
                    value={keyDraft}
                    onChange={(e) => setKeyDraft(e.target.value)}
                    placeholder="Paste your Finnhub API key"
                    className="w-full px-3 py-2.5 rounded-md mb-3 text-base font-mono outline-none"
                    style={{ background: "rgba(8,7,24,0.7)", border: "1px solid rgba(148,130,255,0.18)", color: "#F1EEFB" }}
                  />
                  <button
                    onClick={saveApiKey}
                    disabled={!keyDraft.trim()}
                    className="w-full py-2 rounded-md text-base font-medium disabled:opacity-40"
                    style={{ background: "rgba(148,130,255,0.08)", border: "1px solid rgba(148,130,255,0.22)", color: "#F1EEFB" }}
                  >
                    Save key
                  </button>
                </div>
              </details>
            </>
          ) : (
            <>
              <p className="text-base mb-4" style={{ color: "#9C97C4" }}>
                This dashboard pulls live quotes from Finnhub's free API — real-time US stock data, 60 requests/minute, no credit card required.
              </p>
              <ol className="text-base mb-5 space-y-1.5 list-decimal list-inside" style={{ color: "#9C97C4" }}>
                <li>Go to <span style={{ color: "#A78BFA" }}>finnhub.io/register</span> and create a free account</li>
                <li>Copy the API key from your dashboard</li>
                <li>Paste it below</li>
              </ol>
              <input
                value={keyDraft}
                onChange={(e) => setKeyDraft(e.target.value)}
                placeholder="Paste your Finnhub API key"
                className="w-full px-3 py-2.5 rounded-md mb-3 text-base font-mono outline-none"
                style={{ background: "rgba(8,7,24,0.7)", border: "1px solid rgba(148,130,255,0.18)", color: "#F1EEFB" }}
              />
              <button
                onClick={saveApiKey}
                disabled={!keyDraft.trim()}
                className="w-full py-2.5 rounded-md text-base font-semibold disabled:opacity-40 mb-3"
                style={{ background: "linear-gradient(135deg, #8B7CF6 0%, #D65FE0 100%)", color: "#0B0819", fontFamily: "Space Grotesk, sans-serif", boxShadow: "0 8px 24px -6px rgba(214,95,224,0.5)" }}
              >
                Connect
              </button>
              <button
                onClick={enterSimulatedMode}
                className="w-full py-2 rounded-md text-base font-medium"
                style={{ background: "rgba(148,130,255,0.08)", border: "1px solid rgba(148,130,255,0.22)", color: "#9C97C4" }}
              >
                Or use simulated data instead
              </button>
              <p className="text-sm mt-3" style={{ color: "#655F8C" }}>Your key is stored only in this browser's local storage. It's never sent anywhere but Finnhub.</p>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div style={{ background: "radial-gradient(ellipse 1000px 700px at 10% -10%, rgba(139,124,246,0.14), transparent 55%), radial-gradient(ellipse 900px 700px at 100% 0%, rgba(214,95,224,0.10), transparent 50%), #07061a", minHeight: "700px", fontFamily: "Inter, sans-serif" }} className="w-full">
      <style>{`
        ${FONT_IMPORT}
        @keyframes tape-scroll { from { transform: translateX(0); } to { transform: translateX(-50%); } }
        .tape-track { animation: tape-scroll 60s linear infinite; }
        .md-scroll::-webkit-scrollbar { height: 6px; width: 6px; }
        .md-scroll::-webkit-scrollbar-thumb { background: rgba(148,130,255,0.3); border-radius: 4px; }
        table { border-collapse: collapse; width: 100%; }
        tbody tr:hover { background: rgba(148,130,255,0.06); }
        .heatmap-columns { columns: 1; }
        @media (min-width: 700px) { .heatmap-columns { columns: 2; } }
        @media (min-width: 1100px) { .heatmap-columns { columns: 3; } }
      `}</style>

      {/* Ticker tape */}
      <div className="overflow-hidden border-b" style={{ borderColor: "rgba(148,130,255,0.14)", background: "rgba(15,12,38,0.8)" }}>
        <div className="flex whitespace-nowrap tape-track py-2">
          {[...tapeItems, ...tapeItems].map((sym, idx) => {
            const q = quotes[sym];
            const color = changeColor(q?.dp);
            return (
              <span key={idx} className="inline-flex items-center gap-1.5 px-4 text-sm font-mono" style={{ color: "#9C97C4" }}>
                <span style={{ color: "#F1EEFB", fontWeight: 600 }}>{sym}</span>
                <span>{q ? fmt(q.c) : "—"}</span>
                <span style={{ color }}>{q ? fmtPct(q.dp) : ""}</span>
              </span>
            );
          })}
        </div>
      </div>

      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b flex-wrap gap-3" style={{ borderColor: "rgba(148,130,255,0.14)" }}>
        <div className="flex items-center gap-4">
          <PulseOrb value={avgPct} />
          <div>
            <div className="flex items-center gap-2">
              <div style={{ width: 8, height: 8, background: "linear-gradient(135deg, #8B7CF6 0%, #D65FE0 100%)", boxShadow: "0 0 10px 2px rgba(214,95,224,0.6)" }} className="rounded-full" />
              <span className="uppercase tracking-widest text-sm" style={{ color: "#8B87A8", fontFamily: "JetBrains Mono, monospace" }}>Market Desk</span>
              {simulated && (
                <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: "rgba(167,139,250,0.15)", color: "#A78BFA", fontFamily: "JetBrains Mono, monospace", border: "1px solid rgba(167,139,250,0.3)" }}>
                  SIMULATED DATA
                </span>
              )}
            </div>
            <h1 style={{ fontFamily: "Space Grotesk, sans-serif", color: "#F1EEFB" }} className="text-2xl font-semibold">Personal Trading Dashboard</h1>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm font-mono" style={{ color: "#655F8C" }}>
            {lastUpdated ? `Updated ${lastUpdated.toLocaleTimeString()}` : "Not yet updated"}
          </span>
          {simulated && (
            <button
              onClick={exitSimulatedMode}
              className="text-sm px-2.5 py-1.5 rounded-md"
              style={{ background: "rgba(148,130,255,0.08)", border: "1px solid rgba(148,130,255,0.22)", color: "#9C97C4" }}
            >
              Switch to live key
            </button>
          )}
          <label className="flex items-center gap-1.5 text-sm cursor-pointer select-none" style={{ color: "#9C97C4" }}>
            <input type="checkbox" checked={autoRefresh} onChange={toggleAutoRefresh} className="accent-current" style={{ accentColor: "#A78BFA" }} />
            Auto-refresh
          </label>
          <button
            onClick={fetchAll}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium"
            style={{ background: "rgba(148,130,255,0.08)", border: "1px solid rgba(148,130,255,0.22)", color: "#F1EEFB" }}
          >
            <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
            {loading ? "Refreshing" : "Refresh"}
          </button>
          <button onClick={() => setShowSettings(true)} className="p-1.5 rounded-md" style={{ background: "rgba(148,130,255,0.08)", border: "1px solid rgba(148,130,255,0.22)" }}>
            <Settings size={15} color="#9C97C4" />
          </button>
        </div>
      </div>

      {error && (
        <div className="mx-5 mt-4 px-4 py-2.5 rounded-md text-base flex items-center justify-between gap-4 flex-wrap" style={{ background: "rgba(255,92,130,0.1)", border: "1px solid rgba(255,92,130,0.3)", color: "#FFA8BE" }}>
          <span>{error}</span>
          {!simulated && (
            <button
              onClick={enterSimulatedMode}
              className="text-sm px-3 py-1.5 rounded-md whitespace-nowrap font-medium"
              style={{ background: "linear-gradient(135deg, #8B7CF6 0%, #D65FE0 100%)", color: "#0B0819", fontWeight: 600 }}
            >
              Use simulated data instead
            </button>
          )}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 px-5 pt-4">
        {[
          { id: "overview", label: "Overview" },
          { id: "portfolio", label: `Portfolio (${portfolio.length})` },
          { id: "watchlist", label: `Watchlist (${watchlist.length})` },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className="px-3.5 py-2 text-base rounded-t-md font-medium"
            style={{
              color: tab === t.id ? "#F1EEFB" : "#8B87A8",
              borderBottom: tab === t.id ? "2px solid #C77FE8" : "2px solid transparent",
              fontFamily: "Space Grotesk, sans-serif",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="p-5">
        {tab === "overview" && (
          <div className="space-y-6">
            {/* AI Briefing */}
            <div className="rounded-lg p-5" style={{ background: "rgba(30,26,64,0.55)", border: "1px solid rgba(148,130,255,0.16)", backdropFilter: "blur(16px)", boxShadow: "0 10px 30px -14px rgba(107,70,229,0.35)" }}>
              <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
                <div className="flex items-center gap-2">
                  <div style={{ width: 6, height: 6, background: "linear-gradient(135deg, #8B7CF6 0%, #D65FE0 100%)", boxShadow: "0 0 8px 1px rgba(214,95,224,0.5)" }} className="rounded-full" />
                  <span className="text-sm uppercase tracking-wider font-semibold" style={{ color: "#F1EEFB", fontFamily: "Space Grotesk, sans-serif" }}>Today's briefing <span style={{ color: "#9C97C4", textTransform: "none", letterSpacing: "normal" }}>· {activeList?.name}</span></span>
                  <span
                    className="text-xs font-semibold px-2 py-0.5 rounded-full ml-1"
                    style={{ background: sessionColors[marketSession].bg, color: sessionColors[marketSession].color, border: `1px solid ${sessionColors[marketSession].border}` }}
                  >
                    {marketSession}
                  </span>
                  {briefing && briefing.riskLabel && (
                    <span
                      className="text-xs font-semibold px-2 py-0.5 rounded-full ml-1"
                      style={{
                        background: briefing.riskLabel === "Risk-On" ? "rgba(52,231,166,0.15)" : briefing.riskLabel === "Risk-Off" ? "rgba(255,92,130,0.15)" : "rgba(148,130,255,0.15)",
                        color: briefing.riskLabel === "Risk-On" ? "#34E7A6" : briefing.riskLabel === "Risk-Off" ? "#FF5C82" : "#A78BFA",
                        border: `1px solid ${briefing.riskLabel === "Risk-On" ? "rgba(52,231,166,0.35)" : briefing.riskLabel === "Risk-Off" ? "rgba(255,92,130,0.35)" : "rgba(148,130,255,0.35)"}`,
                      }}
                    >
                      {briefing.riskLabel}
                    </span>
                  )}
                </div>
                {geminiKey && (
                  <button
                    onClick={() => generateBriefing(true)}
                    disabled={briefingLoading}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium"
                    style={{ background: "rgba(148,130,255,0.08)", border: "1px solid rgba(148,130,255,0.22)", color: "#9C97C4" }}
                  >
                    <RefreshCw size={12} className={briefingLoading ? "animate-spin" : ""} />
                    {briefingLoading ? "Thinking…" : "Regenerate"}
                  </button>
                )}
              </div>

              {!geminiKey && (
                <div>
                  <p className="text-sm mb-3" style={{ color: "#9C97C4" }}>
                    Get a free AI-written market summary here each day — index context, risk-on/off read, and callouts on your watchlist. Runs on Google's free Gemini API (no credit card, no cost).
                  </p>
                  <div className="flex gap-2 max-w-md">
                    <input
                      value={geminiKeyDraft}
                      onChange={(e) => setGeminiKeyDraft(e.target.value)}
                      placeholder="Paste a free Gemini API key (aistudio.google.com)"
                      className="flex-1 px-3 py-2 rounded-md text-sm font-mono outline-none"
                      style={{ background: "rgba(8,7,24,0.7)", border: "1px solid rgba(148,130,255,0.18)", color: "#F1EEFB" }}
                    />
                    <button
                      onClick={saveGeminiKey}
                      disabled={!geminiKeyDraft.trim()}
                      className="px-4 rounded-md text-sm font-semibold disabled:opacity-40"
                      style={{ background: "linear-gradient(135deg, #8B7CF6 0%, #D65FE0 100%)", color: "#0B0819" }}
                    >
                      Enable
                    </button>
                  </div>
                </div>
              )}

              {geminiKey && briefingLoading && !briefing && (
                <p className="text-sm" style={{ color: "#8B87A8" }}>Reading today's headlines and your watchlist…</p>
              )}

              {geminiKey && briefingError && (
                <p className="text-sm" style={{ color: "#FF5C82" }}>{briefingError}</p>
              )}

              {geminiKey && briefing && (
                <div>
                  <p className="text-base leading-relaxed mb-3" style={{ color: "#DAD5F5" }}>{briefing.summary}</p>
                  {briefing.riskReason && (
                    <p className="text-sm mb-3" style={{ color: "#8B87A8" }}><span style={{ color: "#9C97C4" }}>Why:</span> {briefing.riskReason}</p>
                  )}
                  {briefing.callouts && briefing.callouts.length > 0 && (
                    <div className="mt-3 pt-3 space-y-2" style={{ borderTop: "1px solid rgba(148,130,255,0.14)" }}>
                      {briefing.callouts.map((c, i) => (
                        <div key={i} className="flex gap-2.5 text-sm">
                          <span className="font-mono font-semibold shrink-0" style={{ color: "#F1EEFB" }}>{c.symbol}</span>
                          <span style={{ color: "#9C97C4" }}>{c.note}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  <p className="text-xs mt-4" style={{ color: "#655F8C" }}>
                    AI-generated context, not financial advice · Generated {new Date(briefing.generatedAt).toLocaleTimeString()}
                    {briefing.simulatedNote ? " · based on simulated data" : ""}
                  </p>
                </div>
              )}

              {geminiKey && !briefing && !briefingLoading && !briefingError && (
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <p className="text-sm" style={{ color: "#8B87A8" }}>Connected — nothing generated yet today.</p>
                  <button
                    onClick={() => generateBriefing(true)}
                    className="px-3.5 py-1.5 rounded-md text-sm font-semibold"
                    style={{ background: "linear-gradient(135deg, #8B7CF6 0%, #D65FE0 100%)", color: "#0B0819" }}
                  >
                    Generate now
                  </button>
                </div>
              )}
            </div>

            {/* Index strip */}
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <span className="text-sm uppercase tracking-wider font-medium" style={{ color: "#9C97C4" }}>Indices</span>
                <span
                  className="text-xs font-semibold px-2 py-0.5 rounded-full"
                  style={{ background: sessionColors[marketSession].bg, color: sessionColors[marketSession].color, border: `1px solid ${sessionColors[marketSession].border}` }}
                >
                  {marketSession}
                </span>
              </div>
              {(marketSession === "Pre-Market" || marketSession === "After-Hours") && (
                <span className="text-xs" style={{ color: "#655F8C" }}>Reflects each ETF's own extended-hours trades, not futures contracts</span>
              )}
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {INDEX_PROXIES.map((idx) => {
                const q = quotes[idx.symbol];
                const stale = isQuoteStale(q, marketSession);
                const positive = (q?.dp ?? 0) >= 0;
                return (
                  <div key={idx.symbol} className="rounded-lg p-4" style={{ background: "rgba(30,26,64,0.55)", border: "1px solid rgba(148,130,255,0.16)", backdropFilter: "blur(16px)", boxShadow: "0 10px 30px -14px rgba(107,70,229,0.35)" }}>
                    <div className="text-sm mb-1" style={{ color: "#8B87A8" }}>{idx.label} · {idx.symbol}</div>
                    <div className="text-3xl font-mono font-semibold" style={{ color: "#F1EEFB" }}>{q ? fmt(q.c) : "—"}</div>
                    {stale ? (
                      <span className="text-base" style={{ color: "#655F8C" }} title="Last trade is from the prior session — no live extended-hours print yet">prev. close · no live print yet</span>
                    ) : (
                      <ChangeTag pct={q?.dp} size="lg" />
                    )}
                    <IndexSparkline series={indexSeries[idx.symbol]} positive={positive} />
                  </div>
                );
              })}
            </div>

            {/* Movers */}
            <div className="grid md:grid-cols-2 gap-4">
              <div className="rounded-lg p-4" style={{ background: "rgba(30,26,64,0.55)", border: "1px solid rgba(148,130,255,0.16)", backdropFilter: "blur(16px)", boxShadow: "0 10px 30px -14px rgba(107,70,229,0.35)" }}>
                <div className="flex items-center gap-1.5 mb-3">
                  <TrendingUp size={14} color="#34E7A6" />
                  <span className="text-sm uppercase tracking-wider font-medium" style={{ color: "#9C97C4" }}>Top gainers</span>
                </div>
                <div className="space-y-2">
                  {gainers.length === 0 && <div className="text-base" style={{ color: "#655F8C" }}>No data yet</div>}
                  {gainers.map((r) => (
                    <div key={r.symbol} className="flex items-center justify-between text-base">
                      <span className="font-mono" style={{ color: "#F1EEFB" }}>{r.symbol}</span>
                      <span className="flex items-center gap-3">
                        <span className="font-mono text-sm" style={{ color: "#9C97C4" }}>{r.price !== null ? fmt(r.price) : "—"}</span>
                        <ChangeTag pct={r.pct} />
                      </span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="rounded-lg p-4" style={{ background: "rgba(30,26,64,0.55)", border: "1px solid rgba(148,130,255,0.16)", backdropFilter: "blur(16px)", boxShadow: "0 10px 30px -14px rgba(107,70,229,0.35)" }}>
                <div className="flex items-center gap-1.5 mb-3">
                  <TrendingDown size={14} color="#FF5C82" />
                  <span className="text-sm uppercase tracking-wider font-medium" style={{ color: "#9C97C4" }}>Top losers</span>
                </div>
                <div className="space-y-2">
                  {losers.length === 0 && <div className="text-base" style={{ color: "#655F8C" }}>No data yet</div>}
                  {losers.map((r) => (
                    <div key={r.symbol} className="flex items-center justify-between text-base">
                      <span className="font-mono" style={{ color: "#F1EEFB" }}>{r.symbol}</span>
                      <span className="flex items-center gap-3">
                        <span className="font-mono text-sm" style={{ color: "#9C97C4" }}>{r.price !== null ? fmt(r.price) : "—"}</span>
                        <ChangeTag pct={r.pct} />
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Sector heatmap */}
            <div className="rounded-lg p-4" style={{ background: "rgba(30,26,64,0.55)", border: "1px solid rgba(148,130,255,0.16)", backdropFilter: "blur(16px)", boxShadow: "0 10px 30px -14px rgba(107,70,229,0.35)" }}>
              <div className="flex items-center gap-2 mb-4">
                <div style={{ width: 6, height: 6, background: "linear-gradient(135deg, #8B7CF6 0%, #D65FE0 100%)", boxShadow: "0 0 8px 1px rgba(214,95,224,0.5)" }} className="rounded-full" />
                <div className="text-base uppercase tracking-wider font-semibold" style={{ color: "#F1EEFB", fontFamily: "Space Grotesk, sans-serif" }}>Watchlist heatmap by sector <span style={{ color: "#9C97C4", textTransform: "none", letterSpacing: "normal" }}>· {activeList?.name}</span></div>
              </div>
              <div style={{ columns: "1", columnGap: "1.25rem" }} className="heatmap-columns">
                {Object.entries(sectorGroups).map(([sector, rows]) => {
                  const validRows = rows.filter((r) => r.pct !== null);
                  const avgSectorPct = validRows.length ? validRows.reduce((a, r) => a + r.pct, 0) / validRows.length : null;
                  return (
                    <div key={sector} style={{ breakInside: "avoid" }} className="mb-5">
                      <div className="flex items-center justify-between mb-2 pb-1.5" style={{ borderBottom: "1px solid rgba(148,130,255,0.14)" }}>
                        <div className="flex items-baseline gap-2">
                          <span className="text-sm font-semibold tracking-wide" style={{ color: "#DAD5F5", fontFamily: "JetBrains Mono, monospace" }}>{sector.toUpperCase()}</span>
                          <span className="text-xs" style={{ color: "#655F8C" }}>{rows.length} {rows.length === 1 ? "stock" : "stocks"}</span>
                        </div>
                        {avgSectorPct !== null && <ChangeTag pct={avgSectorPct} />}
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(102px, 1fr))", gap: "10px" }}>
                        {rows.map((r) => {
                          const pct = r.pct ?? 0;
                          const intensity = Math.min(Math.abs(pct) / 3, 1);
                          const positive = pct >= 0;
                          const bg = r.pct === null || r.stale ? "rgba(148,130,255,0.08)" : positive
                            ? `rgba(52, 231, 166, ${0.16 + intensity * 0.5})`
                            : `rgba(255, 92, 130, ${0.16 + intensity * 0.5})`;
                          const glow = r.pct === null || r.stale ? "none" : positive
                            ? `0 4px 18px -6px rgba(52,231,166,${0.25 + intensity * 0.45})`
                            : `0 4px 18px -6px rgba(255,92,130,${0.25 + intensity * 0.45})`;
                          const borderColor = r.pct === null || r.stale ? "rgba(255,255,255,0.07)" : positive
                            ? `rgba(52,231,166,${0.25 + intensity * 0.35})`
                            : `rgba(255,92,130,${0.25 + intensity * 0.35})`;
                          return (
                            <div
                              key={r.symbol}
                              className="rounded-xl px-3 py-2.5"
                              style={{ background: bg, border: `1px solid ${borderColor}`, boxShadow: glow }}
                              title={r.stale ? "Last trade is from the prior session — no live extended-hours print yet" : undefined}
                            >
                              <div className="text-base font-mono font-bold leading-tight" style={{ color: "#F1EEFB" }}>{r.symbol}</div>
                              <div className="text-sm font-mono leading-tight mt-1" style={{ color: "#B9B4DC" }}>{r.price !== null ? fmt(r.price) : "—"}</div>
                              <div className="mt-1">{r.stale ? <span className="text-sm" style={{ color: "#655F8C" }}>prev. close</span> : <ChangeTag pct={r.pct} />}</div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

          </div>
        )}

        {tab === "portfolio" && (
          <div className="space-y-5">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <SummaryCard label="Total value" value={fmtMoney(totalValue)} />
              <SummaryCard label="Total cost basis" value={fmtMoney(totalCost)} />
              <SummaryCard label="Total P&L" value={fmtMoney(totalPnl)} sub={fmtPct(totalPnlPct)} color={changeColor(totalPnl)} />
              <SummaryCard label="Day change" value={fmtMoney(totalDayChange)} color={changeColor(totalDayChange)} />
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              <div className="rounded-lg p-4" style={{ background: "rgba(30,26,64,0.55)", border: "1px solid rgba(148,130,255,0.16)", backdropFilter: "blur(16px)", boxShadow: "0 10px 30px -14px rgba(107,70,229,0.35)" }}>
                <div className="text-sm uppercase tracking-wider font-medium mb-3" style={{ color: "#9C97C4" }}>Sector allocation</div>
                <SectorDonut entries={portfolioSectorEntries} total={totalValue} />
              </div>
              <div className="rounded-lg p-4" style={{ background: "rgba(30,26,64,0.55)", border: "1px solid rgba(148,130,255,0.16)", backdropFilter: "blur(16px)", boxShadow: "0 10px 30px -14px rgba(107,70,229,0.35)" }}>
                <div className="text-sm uppercase tracking-wider font-medium mb-3" style={{ color: "#9C97C4" }}>Value over time</div>
                <PortfolioValueChart history={portfolioHistory} />
              </div>
            </div>

            <details className="rounded-lg p-4" style={{ background: "rgba(30,26,64,0.55)", border: "1px solid rgba(148,130,255,0.16)", backdropFilter: "blur(16px)", boxShadow: "0 10px 30px -14px rgba(107,70,229,0.35)" }}>
              <summary className="cursor-pointer select-none text-sm font-medium" style={{ color: "#DAD5F5" }}>Import holdings from CSV</summary>
              <div className="mt-3">
                <p className="text-sm mb-2" style={{ color: "#8B87A8" }}>
                  Paste CSV text (from Excel, Google Sheets, or a broker export) with columns for Symbol, Shares, and Cost/Share — or upload a .csv file.
                </p>
                <input type="file" accept=".csv,text/csv" onChange={handleCsvFile} className="text-sm mb-2" style={{ color: "#9C97C4" }} />
                <textarea
                  value={csvText}
                  onChange={(e) => { setCsvText(e.target.value); setCsvError(""); }}
                  placeholder={"Symbol,Shares,Cost/Share\nAAPL,10,150.00\nMSFT,5,320.00"}
                  rows={5}
                  className="w-full px-2.5 py-2 rounded-md text-sm font-mono outline-none mb-2"
                  style={{ background: "rgba(8,7,24,0.7)", border: "1px solid rgba(148,130,255,0.18)", color: "#F1EEFB", resize: "vertical" }}
                />
                {csvText.trim() && !csvError && (
                  <p className="text-sm mb-2" style={{ color: csvPreview.error ? "#FF5C82" : "#34E7A6" }}>
                    {csvPreview.error || `Found ${csvPreview.rows.length} valid holding${csvPreview.rows.length === 1 ? "" : "s"} ready to import.`}
                  </p>
                )}
                {csvError && <p className="text-sm mb-2" style={{ color: "#FF5C82" }}>{csvError}</p>}
                <button
                  onClick={importCsvHoldings}
                  disabled={!csvText.trim() || !!csvPreview.error || csvPreview.rows.length === 0}
                  className="px-4 py-2 rounded-md text-sm font-semibold disabled:opacity-40"
                  style={{ background: "linear-gradient(135deg, #8B7CF6 0%, #D65FE0 100%)", color: "#0B0819" }}
                >
                  Import {csvPreview.rows.length > 0 ? csvPreview.rows.length : ""} holding{csvPreview.rows.length === 1 ? "" : "s"}
                </button>
              </div>
            </details>

            <form onSubmit={addHolding} className="flex flex-wrap gap-2 items-end rounded-lg p-4" style={{ background: "rgba(30,26,64,0.55)", border: "1px solid rgba(148,130,255,0.16)", backdropFilter: "blur(16px)", boxShadow: "0 10px 30px -14px rgba(107,70,229,0.35)" }}>
              <Field label="Symbol"><input value={newHoldingSymbol} onChange={(e) => setNewHoldingSymbol(e.target.value)} placeholder="AAPL" className="input" /></Field>
              <Field label="Shares"><input value={newShares} onChange={(e) => setNewShares(e.target.value)} placeholder="10" type="number" step="any" className="input w-24" /></Field>
              <Field label="Cost basis / share"><input value={newCost} onChange={(e) => setNewCost(e.target.value)} placeholder="150.00" type="number" step="any" className="input w-32" /></Field>
              <button type="submit" className="flex items-center gap-1 px-3 py-2 rounded-md text-base font-medium" style={{ background: "linear-gradient(135deg, #8B7CF6 0%, #D65FE0 100%)", color: "#0B0819", fontWeight: 600 }}>
                <Plus size={14} /> Add holding
              </button>
            </form>

            <div className="rounded-lg md-scroll overflow-x-auto" style={{ background: "rgba(30,26,64,0.55)", border: "1px solid rgba(148,130,255,0.16)", backdropFilter: "blur(16px)", boxShadow: "0 10px 30px -14px rgba(107,70,229,0.35)" }}>
              {portfolioRows.length === 0 ? (
                <div className="p-8 text-center text-base" style={{ color: "#655F8C" }}>No holdings yet — add one above to start tracking P&L.</div>
              ) : (
                <table>
                  <thead>
                    <tr style={{ borderBottom: "1px solid rgba(148,130,255,0.16)" }}>
                      <SortHeader label="Symbol" field="symbol" sortField={pfSort.field} sortDir={pfSort.dir} onSort={onSortPf} sticky />
                      <SortHeader label="Shares" field="shares" sortField={pfSort.field} sortDir={pfSort.dir} onSort={onSortPf} align="right" />
                      <SortHeader label="Cost/Sh" field="cost" sortField={pfSort.field} sortDir={pfSort.dir} onSort={onSortPf} align="right" />
                      <SortHeader label="Price" field="price" sortField={pfSort.field} sortDir={pfSort.dir} onSort={onSortPf} align="right" />
                      <SortHeader label="Value" field="value" sortField={pfSort.field} sortDir={pfSort.dir} onSort={onSortPf} align="right" />
                      <SortHeader label="P&L" field="pnl" sortField={pfSort.field} sortDir={pfSort.dir} onSort={onSortPf} align="right" />
                      <SortHeader label="P&L %" field="pnlPct" sortField={pfSort.field} sortDir={pfSort.dir} onSort={onSortPf} align="right" />
                      <SortHeader label="Day %" field="dayPct" sortField={pfSort.field} sortDir={pfSort.dir} onSort={onSortPf} align="right" />
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedPortfolio.map((r) => (
                      <tr key={r.id} style={{ borderBottom: "1px solid rgba(148,130,255,0.08)" }}>
                        <td className="px-3 py-2.5" style={{ position: "sticky", left: 0, zIndex: 1, background: "#171331", boxShadow: "4px 0 8px -4px rgba(0,0,0,0.45)" }}>
                          <div className="font-mono font-semibold text-base" style={{ color: "#F1EEFB" }}>{r.symbol}</div>
                          <div className="text-xs" style={{ color: "#655F8C" }}>{r.sector}</div>
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono text-base" style={{ color: "#DAD5F5" }}>{r.shares}</td>
                        <td className="px-3 py-2.5 text-right font-mono text-base" style={{ color: "#DAD5F5" }}>{fmt(r.cost)}</td>
                        <td className="px-3 py-2.5 text-right font-mono text-base" style={{ color: "#DAD5F5" }}>{r.price !== null ? fmt(r.price) : "—"}</td>
                        <td className="px-3 py-2.5 text-right font-mono text-base" style={{ color: "#F1EEFB" }}>{r.value !== null ? fmtMoney(r.value) : "—"}</td>
                        <td className="px-3 py-2.5 text-right"><ChangeTag value={r.pnl} /></td>
                        <td className="px-3 py-2.5 text-right"><ChangeTag pct={r.pnlPct} /></td>
                        <td className="px-3 py-2.5 text-right"><ChangeTag pct={r.dayPct} /></td>
                        <td className="px-2 py-2.5 text-right">
                          <button onClick={() => removeHolding(r.id)} className="p-1 rounded hover:opacity-100 opacity-50">
                            <X size={13} color="#9C97C4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {tab === "watchlist" && (
          <div className="space-y-4">
            <div>
              <div className="flex items-center gap-2 flex-wrap mb-2">
                {watchlists.map((l) => (
                  <div key={l.id} className="flex items-center gap-1">
                    {editingListId === l.id ? (
                      <input
                        autoFocus
                        value={editingListName}
                        onChange={(e) => setEditingListName(e.target.value)}
                        onBlur={() => renameWatchlistList(l.id, editingListName)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") renameWatchlistList(l.id, editingListName);
                          if (e.key === "Escape") setEditingListId(null);
                        }}
                        className="input text-sm px-2.5 py-1.5"
                        style={{ width: 140 }}
                      />
                    ) : (
                      <button
                        onClick={() => setActiveListId(l.id)}
                        onDoubleClick={() => { setEditingListId(l.id); setEditingListName(l.name); }}
                        className="px-3 py-1.5 rounded-full text-sm font-medium flex items-center gap-1.5"
                        style={{
                          background: l.id === activeListId ? "linear-gradient(135deg, #8B7CF6 0%, #D65FE0 100%)" : "rgba(148,130,255,0.08)",
                          color: l.id === activeListId ? "#0B0819" : "#9C97C4",
                          border: `1px solid ${l.id === activeListId ? "transparent" : "rgba(148,130,255,0.22)"}`,
                        }}
                      >
                        {l.name}
                        <span style={{ opacity: 0.7 }}>({l.symbols.length})</span>
                      </button>
                    )}
                    {watchlists.length > 1 && l.id === activeListId && editingListId !== l.id && (
                      <button onClick={() => deleteWatchlistList(l.id)} title="Delete this list" className="p-1 rounded opacity-50 hover:opacity-100">
                        <X size={12} color="#9C97C4" />
                      </button>
                    )}
                  </div>
                ))}
                {showNewListInput ? (
                  <input
                    autoFocus
                    value={newListName}
                    onChange={(e) => setNewListName(e.target.value)}
                    onBlur={addWatchlistList}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") addWatchlistList();
                      if (e.key === "Escape") setShowNewListInput(false);
                    }}
                    placeholder="List name"
                    className="input text-sm px-2.5 py-1.5"
                    style={{ width: 140 }}
                  />
                ) : (
                  <button
                    onClick={() => setShowNewListInput(true)}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-full text-sm"
                    style={{ background: "rgba(148,130,255,0.08)", border: "1px dashed rgba(148,130,255,0.3)", color: "#9C97C4" }}
                  >
                    <Plus size={12} /> New list
                  </button>
                )}
              </div>
              <p className="text-xs" style={{ color: "#655F8C" }}>Double-click a list name to rename it. Overview (heatmap, movers, ticker tape, briefing) always reflects whichever list is selected here.</p>
            </div>

            <form onSubmit={addWatchSymbol} className="flex gap-2">
              <input value={newSymbol} onChange={(e) => setNewSymbol(e.target.value)} placeholder={`Add symbol to ${activeList?.name || "list"}, e.g. NVDA`} className="input flex-1 max-w-xs" />
              <button type="submit" className="flex items-center gap-1 px-3 py-2 rounded-md text-base font-medium" style={{ background: "linear-gradient(135deg, #8B7CF6 0%, #D65FE0 100%)", color: "#0B0819", fontWeight: 600 }}>
                <Plus size={14} /> Add
              </button>
            </form>
            <div className="rounded-lg md-scroll overflow-x-auto" style={{ background: "rgba(30,26,64,0.55)", border: "1px solid rgba(148,130,255,0.16)", backdropFilter: "blur(16px)", boxShadow: "0 10px 30px -14px rgba(107,70,229,0.35)" }}>
              <table>
                <thead>
                  <tr style={{ borderBottom: "1px solid rgba(148,130,255,0.16)" }}>
                    <SortHeader label="Symbol" field="symbol" sortField={wlSort.field} sortDir={wlSort.dir} onSort={onSortWl} sticky />
                    <SortHeader label="Sector" field="sector" sortField={wlSort.field} sortDir={wlSort.dir} onSort={onSortWl} />
                    <SortHeader label="Price" field="price" sortField={wlSort.field} sortDir={wlSort.dir} onSort={onSortWl} align="right" />
                    <SortHeader label="Change" field="change" sortField={wlSort.field} sortDir={wlSort.dir} onSort={onSortWl} align="right" />
                    <SortHeader label="% Chg" field="pct" sortField={wlSort.field} sortDir={wlSort.dir} onSort={onSortWl} align="right" />
                    <SortHeader label="High" field="high" sortField={wlSort.field} sortDir={wlSort.dir} onSort={onSortWl} align="right" />
                    <SortHeader label="Low" field="low" sortField={wlSort.field} sortDir={wlSort.dir} onSort={onSortWl} align="right" />
                    <SortHeader label="Prev Close" field="prevClose" sortField={wlSort.field} sortDir={wlSort.dir} onSort={onSortWl} align="right" />
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {sortedWatch.map((r) => (
                    <tr key={r.symbol} style={{ borderBottom: "1px solid rgba(148,130,255,0.08)" }}>
                      <td className="px-3 py-2.5 font-mono font-semibold text-base" style={{ color: "#F1EEFB", position: "sticky", left: 0, zIndex: 1, background: "#171331", boxShadow: "4px 0 8px -4px rgba(0,0,0,0.45)" }}>{r.symbol}</td>
                      <td className="px-3 py-2.5 text-sm" style={{ color: "#8B87A8" }}>{r.sector}</td>
                      <td className="px-3 py-2.5 text-right font-mono text-base" style={{ color: "#DAD5F5" }}>{r.price !== null ? fmt(r.price) : "—"}</td>
                      <td className="px-3 py-2.5 text-right">{r.stale ? <span className="text-sm" style={{ color: "#655F8C" }}>prev. close</span> : <ChangeTag value={r.change} />}</td>
                      <td className="px-3 py-2.5 text-right">{r.stale ? <span className="text-sm" style={{ color: "#655F8C" }}>—</span> : <ChangeTag pct={r.pct} />}</td>
                      <td className="px-3 py-2.5 text-right font-mono text-base" style={{ color: "#8B87A8" }}>{r.high !== null ? fmt(r.high) : "—"}</td>
                      <td className="px-3 py-2.5 text-right font-mono text-base" style={{ color: "#8B87A8" }}>{r.low !== null ? fmt(r.low) : "—"}</td>
                      <td className="px-3 py-2.5 text-right font-mono text-base" style={{ color: "#8B87A8" }}>{r.prevClose !== null ? fmt(r.prevClose) : "—"}</td>
                      <td className="px-2 py-2.5 text-right">
                        <button onClick={() => removeWatchSymbol(r.symbol)} className="p-1 rounded hover:opacity-100 opacity-50">
                          <X size={13} color="#9C97C4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {showSettings && (
        <div className="fixed inset-0 flex items-center justify-center z-50 p-4" style={{ background: "rgba(0,0,0,0.6)" }} onClick={() => setShowSettings(false)}>
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md rounded-lg p-6 md-scroll" style={{ background: "rgba(34,30,72,0.7)", border: "1px solid rgba(148,130,255,0.22)", backdropFilter: "blur(20px)", boxShadow: "0 20px 60px -20px rgba(107,70,229,0.5)", maxHeight: "85vh", overflowY: "auto" }}>
            <div className="flex items-center justify-between mb-4">
              <h2 style={{ fontFamily: "Space Grotesk, sans-serif", color: "#F1EEFB" }} className="text-lg font-semibold">Settings</h2>
              <button onClick={() => setShowSettings(false)}><X size={16} color="#9C97C4" /></button>
            </div>
            <label className="text-sm uppercase tracking-wider" style={{ color: "#8B87A8" }}>Finnhub API key</label>
            {IN_ARTIFACT_SANDBOX && (
              <p className="text-sm mt-1 mb-2" style={{ color: "#655F8C" }}>
                Note: this sandbox blocks external requests, so a live key won't actually fetch data here.
              </p>
            )}
            <div className="flex gap-2 mt-1.5 mb-1">
              <input
                value={keyDraft}
                onChange={(e) => setKeyDraft(e.target.value)}
                className="flex-1 px-3 py-2 rounded-md text-base font-mono outline-none"
                style={{ background: "rgba(8,7,24,0.7)", border: "1px solid rgba(148,130,255,0.18)", color: "#F1EEFB" }}
              />
              <button
                type="button"
                onClick={() => setKeyDraft("")}
                title="Clear"
                className="px-2.5 rounded-md text-sm"
                style={{ background: "rgba(148,130,255,0.08)", border: "1px solid rgba(148,130,255,0.22)", color: "#9C97C4" }}
              >
                Clear
              </button>
            </div>
            <p className="text-sm mb-3" style={{ color: "#655F8C" }}>{keyDraft.length} characters — if this looks longer than your actual key, hit Clear and paste it fresh.</p>
            <button onClick={saveApiKey} className="w-full py-2 rounded-md text-base font-semibold mb-2" style={{ background: "linear-gradient(135deg, #8B7CF6 0%, #D65FE0 100%)", color: "#0B0819", fontWeight: 600 }}>
              Save
            </button>
            {!simulated && (
              <button
                onClick={() => { enterSimulatedMode(); setShowSettings(false); }}
                className="w-full py-2 rounded-md text-base font-medium"
                style={{ background: "rgba(148,130,255,0.08)", border: "1px solid rgba(148,130,255,0.22)", color: "#9C97C4" }}
              >
                Use simulated data instead
              </button>
            )}

            <div className="mt-5 pt-5" style={{ borderTop: "1px solid rgba(148,130,255,0.16)" }}>
              <label className="text-sm uppercase tracking-wider" style={{ color: "#8B87A8" }}>Gemini API key (for AI briefing)</label>
              <p className="text-sm mt-1 mb-2" style={{ color: "#655F8C" }}>Free, from aistudio.google.com — no credit card.</p>
              <div className="flex gap-2 mb-2">
                <input
                  value={geminiKeyDraft}
                  onChange={(e) => setGeminiKeyDraft(e.target.value)}
                  placeholder="Paste your Gemini API key"
                  className="flex-1 px-3 py-2 rounded-md text-base font-mono outline-none"
                  style={{ background: "rgba(8,7,24,0.7)", border: "1px solid rgba(148,130,255,0.18)", color: "#F1EEFB" }}
                />
                <button
                  type="button"
                  onClick={() => setGeminiKeyDraft("")}
                  title="Clear"
                  className="px-2.5 rounded-md text-sm"
                  style={{ background: "rgba(148,130,255,0.08)", border: "1px solid rgba(148,130,255,0.22)", color: "#9C97C4" }}
                >
                  Clear
                </button>
              </div>
              <button onClick={saveGeminiKey} className="w-full py-2 rounded-md text-sm font-semibold" style={{ background: "linear-gradient(135deg, #8B7CF6 0%, #D65FE0 100%)", color: "#0B0819", fontWeight: 600 }}>
                Save Gemini key
              </button>
            </div>

            <div className="mt-5 pt-5" style={{ borderTop: "1px solid rgba(148,130,255,0.16)" }}>
              <h3 style={{ fontFamily: "Space Grotesk, sans-serif", color: "#F1EEFB" }} className="text-base font-semibold mb-1">Move to another device</h3>
              <p className="text-sm mb-3" style={{ color: "#8B87A8" }}>
                Generate a backup code here, then paste it in on your phone or another browser to bring over your watchlist, portfolio, and settings — no retyping.
              </p>

              <details className="text-base mb-3" style={{ color: "#9C97C4" }}>
                <summary className="cursor-pointer select-none font-medium" style={{ color: "#DAD5F5" }}>Get a code from this device</summary>
                <div className="mt-2.5">
                  <label className="flex items-center gap-2 text-sm mb-2" style={{ color: "#8B87A8" }}>
                    <input type="checkbox" checked={includeKeyInBackup} onChange={(e) => setIncludeKeyInBackup(e.target.checked)} style={{ accentColor: "#A78BFA" }} />
                    Include my API key (plain text — only paste this code somewhere you trust)
                  </label>
                  <button
                    onClick={generateBackupCode}
                    className="w-full py-2 rounded-md text-base font-medium mb-2"
                    style={{ background: "rgba(148,130,255,0.08)", border: "1px solid rgba(148,130,255,0.22)", color: "#F1EEFB" }}
                  >
                    Generate code
                  </button>
                  {backupCode && (
                    <>
                      <textarea
                        readOnly
                        value={backupCode}
                        rows={4}
                        className="w-full px-2.5 py-2 rounded-md text-sm font-mono outline-none mb-2"
                        style={{ background: "rgba(8,7,24,0.7)", border: "1px solid rgba(148,130,255,0.18)", color: "#DAD5F5", resize: "none" }}
                        onFocus={(e) => e.target.select()}
                      />
                      <button
                        onClick={copyBackupCode}
                        className="w-full py-2 rounded-md text-base font-semibold"
                        style={{ background: "linear-gradient(135deg, #8B7CF6 0%, #D65FE0 100%)", color: "#0B0819" }}
                      >
                        {backupCopied ? "Copied!" : "Copy code"}
                      </button>
                    </>
                  )}
                </div>
              </details>

              <details className="text-base" style={{ color: "#9C97C4" }}>
                <summary className="cursor-pointer select-none font-medium" style={{ color: "#DAD5F5" }}>Paste a code on this device</summary>
                <div className="mt-2.5">
                  <textarea
                    value={importText}
                    onChange={(e) => setImportText(e.target.value)}
                    placeholder="Paste your backup code here"
                    rows={4}
                    className="w-full px-2.5 py-2 rounded-md text-sm font-mono outline-none mb-2"
                    style={{ background: "rgba(8,7,24,0.7)", border: "1px solid rgba(148,130,255,0.18)", color: "#F1EEFB", resize: "none" }}
                  />
                  <button
                    onClick={importBackupCode}
                    disabled={!importText.trim()}
                    className="w-full py-2 rounded-md text-base font-semibold disabled:opacity-40"
                    style={{ background: "linear-gradient(135deg, #8B7CF6 0%, #D65FE0 100%)", color: "#0B0819" }}
                  >
                    Import
                  </button>
                  {importMsg && (
                    <p className="text-sm mt-2" style={{ color: importMsg.startsWith("Imported") ? "#34E7A6" : "#FF5C82" }}>{importMsg}</p>
                  )}
                </div>
              </details>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .input {
          background: rgba(8,7,24,0.7); border: 1px solid rgba(148,130,255,0.2); color: #F1EEFB;
          border-radius: 6px; padding: 8px 10px; font-size: 15px; outline: none; font-family: 'JetBrains Mono', monospace;
        }
        .input::placeholder { color: #655F8C; }
      `}</style>
    </div>
  );
}

const DONUT_PALETTE = ["#8B7CF6", "#D65FE0", "#5FA8E0", "#5FE0C7", "#E0C75F", "#E08F5F", "#B85FE0", "#5F7FE0", "#7CE05F", "#E05F9E"];

function SectorDonut({ entries, total }) {
  if (!entries.length || !total) {
    return <div className="text-sm" style={{ color: "#655F8C" }}>Add holdings to see your sector breakdown.</div>;
  }
  const size = 168, radius = 62, stroke = 24, cx = size / 2, cy = size / 2;
  const circumference = 2 * Math.PI * radius;
  let offsetAcc = 0;
  return (
    <div className="flex items-center gap-6 flex-wrap">
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)", flexShrink: 0 }}>
        {entries.map(([sector, value], i) => {
          const frac = value / total;
          const dash = frac * circumference;
          const strokeDashoffset = -offsetAcc;
          offsetAcc += dash;
          const color = DONUT_PALETTE[i % DONUT_PALETTE.length];
          return (
            <circle
              key={sector} cx={cx} cy={cy} r={radius} fill="none" stroke={color} strokeWidth={stroke}
              strokeDasharray={`${dash} ${circumference - dash}`} strokeDashoffset={strokeDashoffset}
              style={{ filter: `drop-shadow(0 0 4px ${color}77)` }}
            />
          );
        })}
      </svg>
      <div className="space-y-2 text-sm">
        {entries.map(([sector, value], i) => (
          <div key={sector} className="flex items-center gap-2">
            <span style={{ width: 9, height: 9, borderRadius: 9999, background: DONUT_PALETTE[i % DONUT_PALETTE.length], flexShrink: 0 }} />
            <span style={{ color: "#DAD5F5" }}>{sector}</span>
            <span className="font-mono" style={{ color: "#8B87A8" }}>{((value / total) * 100).toFixed(1)}%</span>
            <span className="font-mono text-xs" style={{ color: "#655F8C" }}>{fmtMoney(value)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function PortfolioValueChart({ history }) {
  if (!history || history.length < 2) {
    return <div className="text-sm" style={{ color: "#655F8C" }}>Come back after a couple of days to see your value trend build up.</div>;
  }
  const values = history.map((h) => h.value);
  const positive = values[values.length - 1] >= values[0];
  const w = 600, h = 90, pad = 4;
  const min = Math.min(...values), max = Math.max(...values);
  const range = max - min || 1;
  const stepX = (w - pad * 2) / (values.length - 1);
  const pts = values.map((v, i) => {
    const x = pad + i * stepX;
    const y = pad + (1 - (v - min) / range) * (h - pad * 2);
    return [x, y];
  });
  const linePath = pts.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const areaPath = `${linePath} L${pts[pts.length - 1][0].toFixed(1)},${h} L${pts[0][0].toFixed(1)},${h} Z`;
  const color = positive ? "#34E7A6" : "#FF5C82";
  return (
    <div>
      <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={90} preserveAspectRatio="none">
        <defs>
          <linearGradient id="portfolio-value-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.35" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={areaPath} fill="url(#portfolio-value-grad)" stroke="none" />
        <path d={linePath} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
          style={{ filter: `drop-shadow(0 0 4px ${color}) drop-shadow(0 0 8px ${color}88)` }} />
      </svg>
      <div className="flex justify-between text-xs mt-1" style={{ color: "#655F8C" }}>
        <span>{new Date(history[0].date).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>
        <span>{new Date(history[history.length - 1].date).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>
      </div>
    </div>
  );
}

function IndexSparkline({ series, positive }) {
  if (!series || series.length < 2) {
    return <div className="mt-2" style={{ height: 40 }} />;
  }
  const w = 220, h = 44, pad = 3;
  const min = Math.min(...series), max = Math.max(...series);
  const range = max - min || 1;
  const stepX = (w - pad * 2) / (series.length - 1);
  const pts = series.map((v, i) => {
    const x = pad + i * stepX;
    const y = pad + (1 - (v - min) / range) * (h - pad * 2);
    return [x, y];
  });
  const linePath = pts.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const areaPath = `${linePath} L${pts[pts.length - 1][0].toFixed(1)},${h} L${pts[0][0].toFixed(1)},${h} Z`;
  const color = positive ? "#34E7A6" : "#FF5C82";
  const gid = `spark-${positive ? "up" : "down"}-${Math.round(min)}`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={44} className="mt-2" preserveAspectRatio="none">
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.35" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#${gid})`} stroke="none" />
      <path
        d={linePath}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ filter: `drop-shadow(0 0 4px ${color}) drop-shadow(0 0 8px ${color}88)` }}
      />
    </svg>
  );
}

function PulseOrb({ value }) {
  const clamped = Math.max(-3, Math.min(3, value));
  const frac = (clamped + 3) / 6;
  const r = 26;
  const circumference = 2 * Math.PI * r;
  const offset = circumference * (1 - frac);
  const color = value >= 0 ? "#34E7A6" : "#FF5C82";
  return (
    <div className="relative flex items-center justify-center shrink-0" style={{ width: 64, height: 64 }}>
      <div
        className="absolute rounded-full"
        style={{ width: 64, height: 64, background: `radial-gradient(circle, ${color}33 0%, transparent 70%)` }}
      />
      <svg width="64" height="64" style={{ transform: "rotate(-90deg)", position: "relative" }}>
        <circle cx="32" cy="32" r={r} fill="none" stroke="rgba(148,130,255,0.16)" strokeWidth="4" />
        <circle
          cx="32" cy="32" r={r} fill="none" stroke={color} strokeWidth="4"
          strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round"
          style={{ filter: `drop-shadow(0 0 5px ${color})`, transition: "stroke-dashoffset 0.6s ease" }}
        />
      </svg>
      <div className="absolute flex flex-col items-center leading-none">
        <span className="text-xs font-mono font-semibold" style={{ color: "#F1EEFB" }}>
          {value > 0 ? "+" : ""}{value.toFixed(2)}%
        </span>
        <span className="text-[10px] uppercase tracking-wider mt-0.5" style={{ color: "#655F8C" }}>Pulse</span>
      </div>
    </div>
  );
}

function SummaryCard({ label, value, sub, color }) {
  return (
    <div className="rounded-lg p-4" style={{ background: "rgba(30,26,64,0.55)", border: "1px solid rgba(148,130,255,0.16)", backdropFilter: "blur(16px)", boxShadow: "0 10px 30px -14px rgba(107,70,229,0.35)" }}>
      <div className="text-sm mb-1" style={{ color: "#8B87A8" }}>{label}</div>
      <div className="text-2xl font-mono font-semibold" style={{ color: color || "#F1EEFB" }}>{value}</div>
      {sub && <div className="text-sm font-mono mt-0.5" style={{ color: color || "#8B87A8" }}>{sub}</div>}
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs uppercase tracking-wider" style={{ color: "#655F8C" }}>{label}</label>
      {children}
    </div>
  );
}
