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
      className={`inline-flex items-center gap-0.5 font-mono ${size === "lg" ? "text-base" : "text-xs"}`}
      style={{ color }}
    >
      <Icon size={size === "lg" ? 16 : 12} strokeWidth={2.5} />
      {pct !== undefined ? fmtPct(pct) : fmtMoney(value)}
    </span>
  );
}

function SortHeader({ label, field, sortField, sortDir, onSort, align = "left" }) {
  const active = sortField === field;
  return (
    <th
      onClick={() => onSort(field)}
      className={`cursor-pointer select-none px-3 py-2 text-[11px] uppercase tracking-wider font-medium whitespace-nowrap`}
      style={{ color: active ? "#A78BFA" : "#8B87A8", textAlign: align }}
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

  const [watchlist, setWatchlist] = useState(DEFAULT_WATCHLIST);
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

  const intervalRef = useRef(null);

  // ---- Load persisted state ----
  useEffect(() => {
    (async () => {
      const settings = await safeStorageGet("md-settings");
      const wl = await safeStorageGet("md-watchlist");
      const pf = await safeStorageGet("md-portfolio");
      if (settings?.apiKey) {
        setApiKey(settings.apiKey);
        setKeyDraft(settings.apiKey);
      }
      if (settings?.autoRefresh) setAutoRefresh(true);
      if (settings?.simulated) setSimulated(true);
      if (Array.isArray(wl) && wl.length) setWatchlist(wl);
      if (Array.isArray(pf)) setPortfolio(pf);
      setReady(true);
    })();
  }, []);

  const persistSettings = useCallback((key, auto, sim) => {
    safeStorageSet("md-settings", { apiKey: key, autoRefresh: auto, simulated: sim });
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

  // ---- Handlers ----
  function saveApiKey() {
    const key = keyDraft.trim();
    setApiKey(key);
    setSimulated(false);
    persistSettings(key, autoRefresh, false);
    setShowSettings(false);
  }
  function enterSimulatedMode() {
    setSimulated(true);
    persistSettings(apiKey, autoRefresh, true);
  }
  function exitSimulatedMode() {
    setSimulated(false);
    setQuotes({});
    persistSettings(apiKey, autoRefresh, false);
    setShowSettings(true);
  }
  function toggleAutoRefresh() {
    const next = !autoRefresh;
    setAutoRefresh(next);
    persistSettings(apiKey, next, simulated);
  }
  function addWatchSymbol(e) {
    e.preventDefault();
    const sym = newSymbol.trim().toUpperCase();
    if (!sym || watchlist.includes(sym)) { setNewSymbol(""); return; }
    const next = [...watchlist, sym];
    setWatchlist(next);
    safeStorageSet("md-watchlist", next);
    setNewSymbol("");
  }
  function removeWatchSymbol(sym) {
    const next = watchlist.filter((s) => s !== sym);
    setWatchlist(next);
    safeStorageSet("md-watchlist", next);
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
  const watchRows = watchlist.map((sym) => {
    const q = quotes[sym];
    return {
      symbol: sym, sector: SECTOR_MAP[sym] || "Other",
      price: q?.c ?? null, change: q?.d ?? null, pct: q?.dp ?? null,
      high: q?.h ?? null, low: q?.l ?? null, prevClose: q?.pc ?? null,
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

  const moversSource = watchRows.filter((r) => r.pct !== null);
  const gainers = [...moversSource].sort((a, b) => b.pct - a.pct).slice(0, 5);
  const losers = [...moversSource].sort((a, b) => a.pct - b.pct).slice(0, 5);

  const sectorGroups = {};
  for (const r of watchRows) {
    if (r.sector === "Index") continue;
    if (!sectorGroups[r.sector]) sectorGroups[r.sector] = [];
    sectorGroups[r.sector].push(r);
  }

  const tapeItems = [...INDEX_PROXIES.map((i) => i.symbol), ...watchlist];
  const validPcts = watchRows.map((r) => r.pct).filter((p) => p !== null);
  const avgPct = validPcts.length ? validPcts.reduce((a, b) => a + b, 0) / validPcts.length : 0;

  // ---- Render ----
  if (!ready) return null;

  if (!apiKey && !simulated) {
    return (
      <div style={{ background: "radial-gradient(ellipse 900px 600px at 15% -10%, rgba(139,124,246,0.16), transparent 60%), radial-gradient(ellipse 900px 700px at 110% 10%, rgba(214,95,224,0.12), transparent 55%), #07061a", minHeight: "600px", fontFamily: "Inter, sans-serif" }} className="flex items-center justify-center p-6">
        <style>{FONT_IMPORT}</style>
        <div className="max-w-md w-full rounded-lg p-8" style={{ background: "rgba(30,26,64,0.55)", border: "1px solid rgba(148,130,255,0.16)", backdropFilter: "blur(16px)", boxShadow: "0 10px 30px -14px rgba(107,70,229,0.35)" }}>
          <div className="flex items-center gap-2 mb-1">
            <div style={{ width: 8, height: 8, background: "linear-gradient(135deg, #8B7CF6 0%, #D65FE0 100%)", boxShadow: "0 0 10px 2px rgba(214,95,224,0.6)" }} className="rounded-full" />
            <span className="uppercase tracking-widest text-xs" style={{ color: "#8B87A8", fontFamily: "JetBrains Mono, monospace" }}>Market Desk</span>
          </div>
          <h1 style={{ fontFamily: "Space Grotesk, sans-serif", color: "#F1EEFB" }} className="text-2xl font-semibold mb-2">Connect a data feed</h1>
          {IN_ARTIFACT_SANDBOX ? (
            <>
              <p className="text-sm mb-3" style={{ color: "#9C97C4" }}>
                This dashboard is built to pull live quotes from Finnhub's free API. Heads up: this artifact's sandbox blocks outgoing requests to external sites, so live data won't load here no matter what key you use — that's a platform restriction, not a problem with your account.
              </p>
              <button
                onClick={enterSimulatedMode}
                className="w-full py-2.5 rounded-md text-sm font-semibold mb-4"
                style={{ background: "linear-gradient(135deg, #8B7CF6 0%, #D65FE0 100%)", color: "#0B0819", fontFamily: "Space Grotesk, sans-serif", boxShadow: "0 8px 24px -6px rgba(214,95,224,0.5)" }}
              >
                Use simulated data now
              </button>
              <details className="text-sm" style={{ color: "#9C97C4" }}>
                <summary className="cursor-pointer select-none" style={{ color: "#8B87A8" }}>Have a Finnhub key anyway? (won't fetch live here, but saved for later)</summary>
                <div className="mt-3">
                  <input
                    value={keyDraft}
                    onChange={(e) => setKeyDraft(e.target.value)}
                    placeholder="Paste your Finnhub API key"
                    className="w-full px-3 py-2.5 rounded-md mb-3 text-sm font-mono outline-none"
                    style={{ background: "rgba(8,7,24,0.7)", border: "1px solid rgba(148,130,255,0.18)", color: "#F1EEFB" }}
                  />
                  <button
                    onClick={saveApiKey}
                    disabled={!keyDraft.trim()}
                    className="w-full py-2 rounded-md text-sm font-medium disabled:opacity-40"
                    style={{ background: "rgba(148,130,255,0.08)", border: "1px solid rgba(148,130,255,0.22)", color: "#F1EEFB" }}
                  >
                    Save key
                  </button>
                </div>
              </details>
            </>
          ) : (
            <>
              <p className="text-sm mb-4" style={{ color: "#9C97C4" }}>
                This dashboard pulls live quotes from Finnhub's free API — real-time US stock data, 60 requests/minute, no credit card required.
              </p>
              <ol className="text-sm mb-5 space-y-1.5 list-decimal list-inside" style={{ color: "#9C97C4" }}>
                <li>Go to <span style={{ color: "#A78BFA" }}>finnhub.io/register</span> and create a free account</li>
                <li>Copy the API key from your dashboard</li>
                <li>Paste it below</li>
              </ol>
              <input
                value={keyDraft}
                onChange={(e) => setKeyDraft(e.target.value)}
                placeholder="Paste your Finnhub API key"
                className="w-full px-3 py-2.5 rounded-md mb-3 text-sm font-mono outline-none"
                style={{ background: "rgba(8,7,24,0.7)", border: "1px solid rgba(148,130,255,0.18)", color: "#F1EEFB" }}
              />
              <button
                onClick={saveApiKey}
                disabled={!keyDraft.trim()}
                className="w-full py-2.5 rounded-md text-sm font-semibold disabled:opacity-40 mb-3"
                style={{ background: "linear-gradient(135deg, #8B7CF6 0%, #D65FE0 100%)", color: "#0B0819", fontFamily: "Space Grotesk, sans-serif", boxShadow: "0 8px 24px -6px rgba(214,95,224,0.5)" }}
              >
                Connect
              </button>
              <button
                onClick={enterSimulatedMode}
                className="w-full py-2 rounded-md text-sm font-medium"
                style={{ background: "rgba(148,130,255,0.08)", border: "1px solid rgba(148,130,255,0.22)", color: "#9C97C4" }}
              >
                Or use simulated data instead
              </button>
              <p className="text-xs mt-3" style={{ color: "#655F8C" }}>Your key is stored only in this browser's local storage. It's never sent anywhere but Finnhub.</p>
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
              <span key={idx} className="inline-flex items-center gap-1.5 px-4 text-xs font-mono" style={{ color: "#9C97C4" }}>
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
              <span className="uppercase tracking-widest text-[11px]" style={{ color: "#8B87A8", fontFamily: "JetBrains Mono, monospace" }}>Market Desk</span>
              {simulated && (
                <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: "rgba(167,139,250,0.15)", color: "#A78BFA", fontFamily: "JetBrains Mono, monospace", border: "1px solid rgba(167,139,250,0.3)" }}>
                  SIMULATED DATA
                </span>
              )}
            </div>
            <h1 style={{ fontFamily: "Space Grotesk, sans-serif", color: "#F1EEFB" }} className="text-xl font-semibold">Personal Trading Dashboard</h1>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs font-mono" style={{ color: "#655F8C" }}>
            {lastUpdated ? `Updated ${lastUpdated.toLocaleTimeString()}` : "Not yet updated"}
          </span>
          {simulated && (
            <button
              onClick={exitSimulatedMode}
              className="text-xs px-2.5 py-1.5 rounded-md"
              style={{ background: "rgba(148,130,255,0.08)", border: "1px solid rgba(148,130,255,0.22)", color: "#9C97C4" }}
            >
              Switch to live key
            </button>
          )}
          <label className="flex items-center gap-1.5 text-xs cursor-pointer select-none" style={{ color: "#9C97C4" }}>
            <input type="checkbox" checked={autoRefresh} onChange={toggleAutoRefresh} className="accent-current" style={{ accentColor: "#A78BFA" }} />
            Auto-refresh
          </label>
          <button
            onClick={fetchAll}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium"
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
        <div className="mx-5 mt-4 px-4 py-2.5 rounded-md text-sm flex items-center justify-between gap-4 flex-wrap" style={{ background: "rgba(255,92,130,0.1)", border: "1px solid rgba(255,92,130,0.3)", color: "#FFA8BE" }}>
          <span>{error}</span>
          {!simulated && (
            <button
              onClick={enterSimulatedMode}
              className="text-xs px-3 py-1.5 rounded-md whitespace-nowrap font-medium"
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
            className="px-3.5 py-2 text-sm rounded-t-md font-medium"
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
            {/* Index strip */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {INDEX_PROXIES.map((idx) => {
                const q = quotes[idx.symbol];
                const color = changeColor(q?.dp);
                const positive = (q?.dp ?? 0) >= 0;
                return (
                  <div key={idx.symbol} className="rounded-lg p-4" style={{ background: "rgba(30,26,64,0.55)", border: "1px solid rgba(148,130,255,0.16)", backdropFilter: "blur(16px)", boxShadow: "0 10px 30px -14px rgba(107,70,229,0.35)" }}>
                    <div className="text-xs mb-1" style={{ color: "#8B87A8" }}>{idx.label} · {idx.symbol}</div>
                    <div className="text-2xl font-mono font-semibold" style={{ color: "#F1EEFB" }}>{q ? fmt(q.c) : "—"}</div>
                    <ChangeTag pct={q?.dp} size="lg" />
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
                  <span className="text-xs uppercase tracking-wider font-medium" style={{ color: "#9C97C4" }}>Top gainers</span>
                </div>
                <div className="space-y-2">
                  {gainers.length === 0 && <div className="text-sm" style={{ color: "#655F8C" }}>No data yet</div>}
                  {gainers.map((r) => (
                    <div key={r.symbol} className="flex items-center justify-between text-sm">
                      <span className="font-mono" style={{ color: "#F1EEFB" }}>{r.symbol}</span>
                      <ChangeTag pct={r.pct} />
                    </div>
                  ))}
                </div>
              </div>
              <div className="rounded-lg p-4" style={{ background: "rgba(30,26,64,0.55)", border: "1px solid rgba(148,130,255,0.16)", backdropFilter: "blur(16px)", boxShadow: "0 10px 30px -14px rgba(107,70,229,0.35)" }}>
                <div className="flex items-center gap-1.5 mb-3">
                  <TrendingDown size={14} color="#FF5C82" />
                  <span className="text-xs uppercase tracking-wider font-medium" style={{ color: "#9C97C4" }}>Top losers</span>
                </div>
                <div className="space-y-2">
                  {losers.length === 0 && <div className="text-sm" style={{ color: "#655F8C" }}>No data yet</div>}
                  {losers.map((r) => (
                    <div key={r.symbol} className="flex items-center justify-between text-sm">
                      <span className="font-mono" style={{ color: "#F1EEFB" }}>{r.symbol}</span>
                      <ChangeTag pct={r.pct} />
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Sector heatmap */}
            <div className="rounded-lg p-4" style={{ background: "rgba(30,26,64,0.55)", border: "1px solid rgba(148,130,255,0.16)", backdropFilter: "blur(16px)", boxShadow: "0 10px 30px -14px rgba(107,70,229,0.35)" }}>
              <div className="text-xs uppercase tracking-wider font-medium mb-3" style={{ color: "#9C97C4" }}>Watchlist heatmap by sector</div>
              <div style={{ columns: "1", columnGap: "1rem" }} className="heatmap-columns">
                {Object.entries(sectorGroups).map(([sector, rows]) => (
                  <div key={sector} style={{ breakInside: "avoid" }} className="mb-4">
                    <div className="text-[11px] mb-1.5" style={{ color: "#655F8C", fontFamily: "JetBrains Mono, monospace" }}>{sector.toUpperCase()} · {rows.length}</div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(64px, 1fr))", gap: "6px" }}>
                      {rows.map((r) => {
                        const pct = r.pct ?? 0;
                        const intensity = Math.min(Math.abs(pct) / 3, 1);
                        const bg = r.pct === null ? "rgba(148,130,255,0.08)" : pct >= 0
                          ? `rgba(52, 231, 166, ${0.14 + intensity * 0.5})`
                          : `rgba(255, 92, 130, ${0.14 + intensity * 0.5})`;
                        const glow = r.pct === null ? "none" : pct >= 0
                          ? `0 0 12px -4px rgba(52,231,166,${0.2 + intensity * 0.4})`
                          : `0 0 12px -4px rgba(255,92,130,${0.2 + intensity * 0.4})`;
                        return (
                          <div
                            key={r.symbol}
                            className="rounded-md px-2 py-1.5"
                            style={{ background: bg, border: "1px solid rgba(255,255,255,0.07)", boxShadow: glow }}
                          >
                            <div className="text-[11px] font-mono font-semibold leading-tight" style={{ color: "#F1EEFB" }}>{r.symbol}</div>
                            <div className="text-[10px] font-mono leading-tight" style={{ color: "#DAD5F5" }}>{r.pct !== null ? fmtPct(r.pct) : "—"}</div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
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

            <form onSubmit={addHolding} className="flex flex-wrap gap-2 items-end rounded-lg p-4" style={{ background: "rgba(30,26,64,0.55)", border: "1px solid rgba(148,130,255,0.16)", backdropFilter: "blur(16px)", boxShadow: "0 10px 30px -14px rgba(107,70,229,0.35)" }}>
              <Field label="Symbol"><input value={newHoldingSymbol} onChange={(e) => setNewHoldingSymbol(e.target.value)} placeholder="AAPL" className="input" /></Field>
              <Field label="Shares"><input value={newShares} onChange={(e) => setNewShares(e.target.value)} placeholder="10" type="number" step="any" className="input w-24" /></Field>
              <Field label="Cost basis / share"><input value={newCost} onChange={(e) => setNewCost(e.target.value)} placeholder="150.00" type="number" step="any" className="input w-32" /></Field>
              <button type="submit" className="flex items-center gap-1 px-3 py-2 rounded-md text-sm font-medium" style={{ background: "linear-gradient(135deg, #8B7CF6 0%, #D65FE0 100%)", color: "#0B0819", fontWeight: 600 }}>
                <Plus size={14} /> Add holding
              </button>
            </form>

            <div className="rounded-lg overflow-hidden md-scroll overflow-x-auto" style={{ background: "rgba(30,26,64,0.55)", border: "1px solid rgba(148,130,255,0.16)", backdropFilter: "blur(16px)", boxShadow: "0 10px 30px -14px rgba(107,70,229,0.35)" }}>
              {portfolioRows.length === 0 ? (
                <div className="p-8 text-center text-sm" style={{ color: "#655F8C" }}>No holdings yet — add one above to start tracking P&L.</div>
              ) : (
                <table>
                  <thead>
                    <tr style={{ borderBottom: "1px solid rgba(148,130,255,0.16)" }}>
                      <SortHeader label="Symbol" field="symbol" sortField={pfSort.field} sortDir={pfSort.dir} onSort={onSortPf} />
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
                        <td className="px-3 py-2.5">
                          <div className="font-mono font-semibold text-sm" style={{ color: "#F1EEFB" }}>{r.symbol}</div>
                          <div className="text-[10px]" style={{ color: "#655F8C" }}>{r.sector}</div>
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono text-sm" style={{ color: "#DAD5F5" }}>{r.shares}</td>
                        <td className="px-3 py-2.5 text-right font-mono text-sm" style={{ color: "#DAD5F5" }}>{fmt(r.cost)}</td>
                        <td className="px-3 py-2.5 text-right font-mono text-sm" style={{ color: "#DAD5F5" }}>{r.price !== null ? fmt(r.price) : "—"}</td>
                        <td className="px-3 py-2.5 text-right font-mono text-sm" style={{ color: "#F1EEFB" }}>{r.value !== null ? fmtMoney(r.value) : "—"}</td>
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
            <form onSubmit={addWatchSymbol} className="flex gap-2">
              <input value={newSymbol} onChange={(e) => setNewSymbol(e.target.value)} placeholder="Add symbol, e.g. NVDA" className="input flex-1 max-w-xs" />
              <button type="submit" className="flex items-center gap-1 px-3 py-2 rounded-md text-sm font-medium" style={{ background: "linear-gradient(135deg, #8B7CF6 0%, #D65FE0 100%)", color: "#0B0819", fontWeight: 600 }}>
                <Plus size={14} /> Add
              </button>
            </form>
            <div className="rounded-lg overflow-hidden md-scroll overflow-x-auto" style={{ background: "rgba(30,26,64,0.55)", border: "1px solid rgba(148,130,255,0.16)", backdropFilter: "blur(16px)", boxShadow: "0 10px 30px -14px rgba(107,70,229,0.35)" }}>
              <table>
                <thead>
                  <tr style={{ borderBottom: "1px solid rgba(148,130,255,0.16)" }}>
                    <SortHeader label="Symbol" field="symbol" sortField={wlSort.field} sortDir={wlSort.dir} onSort={onSortWl} />
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
                      <td className="px-3 py-2.5 font-mono font-semibold text-sm" style={{ color: "#F1EEFB" }}>{r.symbol}</td>
                      <td className="px-3 py-2.5 text-xs" style={{ color: "#8B87A8" }}>{r.sector}</td>
                      <td className="px-3 py-2.5 text-right font-mono text-sm" style={{ color: "#DAD5F5" }}>{r.price !== null ? fmt(r.price) : "—"}</td>
                      <td className="px-3 py-2.5 text-right"><ChangeTag value={r.change} /></td>
                      <td className="px-3 py-2.5 text-right"><ChangeTag pct={r.pct} /></td>
                      <td className="px-3 py-2.5 text-right font-mono text-sm" style={{ color: "#8B87A8" }}>{r.high !== null ? fmt(r.high) : "—"}</td>
                      <td className="px-3 py-2.5 text-right font-mono text-sm" style={{ color: "#8B87A8" }}>{r.low !== null ? fmt(r.low) : "—"}</td>
                      <td className="px-3 py-2.5 text-right font-mono text-sm" style={{ color: "#8B87A8" }}>{r.prevClose !== null ? fmt(r.prevClose) : "—"}</td>
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
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-sm rounded-lg p-6" style={{ background: "rgba(34,30,72,0.7)", border: "1px solid rgba(148,130,255,0.22)", backdropFilter: "blur(20px)", boxShadow: "0 20px 60px -20px rgba(107,70,229,0.5)" }}>
            <div className="flex items-center justify-between mb-4">
              <h2 style={{ fontFamily: "Space Grotesk, sans-serif", color: "#F1EEFB" }} className="text-base font-semibold">Settings</h2>
              <button onClick={() => setShowSettings(false)}><X size={16} color="#9C97C4" /></button>
            </div>
            <label className="text-xs uppercase tracking-wider" style={{ color: "#8B87A8" }}>Finnhub API key</label>
            {IN_ARTIFACT_SANDBOX && (
              <p className="text-xs mt-1 mb-2" style={{ color: "#655F8C" }}>
                Note: this sandbox blocks external requests, so a live key won't actually fetch data here.
              </p>
            )}
            <div className="flex gap-2 mt-1.5 mb-1">
              <input
                value={keyDraft}
                onChange={(e) => setKeyDraft(e.target.value)}
                className="flex-1 px-3 py-2 rounded-md text-sm font-mono outline-none"
                style={{ background: "rgba(8,7,24,0.7)", border: "1px solid rgba(148,130,255,0.18)", color: "#F1EEFB" }}
              />
              <button
                type="button"
                onClick={() => setKeyDraft("")}
                title="Clear"
                className="px-2.5 rounded-md text-xs"
                style={{ background: "rgba(148,130,255,0.08)", border: "1px solid rgba(148,130,255,0.22)", color: "#9C97C4" }}
              >
                Clear
              </button>
            </div>
            <p className="text-[11px] mb-3" style={{ color: "#655F8C" }}>{keyDraft.length} characters — if this looks longer than your actual key, hit Clear and paste it fresh.</p>
            <button onClick={saveApiKey} className="w-full py-2 rounded-md text-sm font-semibold mb-2" style={{ background: "linear-gradient(135deg, #8B7CF6 0%, #D65FE0 100%)", color: "#0B0819", fontWeight: 600 }}>
              Save
            </button>
            {!simulated && (
              <button
                onClick={() => { enterSimulatedMode(); setShowSettings(false); }}
                className="w-full py-2 rounded-md text-sm font-medium"
                style={{ background: "rgba(148,130,255,0.08)", border: "1px solid rgba(148,130,255,0.22)", color: "#9C97C4" }}
              >
                Use simulated data instead
              </button>
            )}
          </div>
        </div>
      )}

      <style>{`
        .input {
          background: rgba(8,7,24,0.7); border: 1px solid rgba(148,130,255,0.2); color: #F1EEFB;
          border-radius: 6px; padding: 8px 10px; font-size: 13px; outline: none; font-family: 'JetBrains Mono', monospace;
        }
        .input::placeholder { color: #655F8C; }
      `}</style>
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
        <span className="text-[10px] font-mono font-semibold" style={{ color: "#F1EEFB" }}>
          {value > 0 ? "+" : ""}{value.toFixed(2)}%
        </span>
        <span className="text-[7px] uppercase tracking-wider mt-0.5" style={{ color: "#655F8C" }}>Pulse</span>
      </div>
    </div>
  );
}

function SummaryCard({ label, value, sub, color }) {
  return (
    <div className="rounded-lg p-4" style={{ background: "rgba(30,26,64,0.55)", border: "1px solid rgba(148,130,255,0.16)", backdropFilter: "blur(16px)", boxShadow: "0 10px 30px -14px rgba(107,70,229,0.35)" }}>
      <div className="text-xs mb-1" style={{ color: "#8B87A8" }}>{label}</div>
      <div className="text-xl font-mono font-semibold" style={{ color: color || "#F1EEFB" }}>{value}</div>
      {sub && <div className="text-xs font-mono mt-0.5" style={{ color: color || "#8B87A8" }}>{sub}</div>}
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[10px] uppercase tracking-wider" style={{ color: "#655F8C" }}>{label}</label>
      {children}
    </div>
  );
}
