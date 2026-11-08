"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import {
  MapPin,
  House,
  Package,
  ChartNoAxesCombined,
  ShoppingBasket,
  SlidersHorizontal,
  Files,
  Upload,
  ShieldCheck,
  ArrowUpRight,
  CheckCircle2,
  X,
  PanelLeftClose,
  Menu,
  ChevronRight,
} from "lucide-react";
import type { State, Derived } from "../domain/types";
import type { Action } from "../domain/validation";
import { AppContext, dictionaries, Button, Badge, type View } from "./ui";
import Today from "./Today";
import Logo from "./Logo";
import LocationEditor from "./LocationSettings";
import { locationLabel, formatDateTime } from "../domain/location";
import PlanView from "./PlanView";
import Inventory from "./Inventory";
import Market from "./Market";
import Economics from "./Economics";
import Documents from "./Documents";
type Payload = { state: State; derived: Derived };
const nav = [
  { id: "today", icon: House },
  { id: "stock", icon: Package },
  { id: "market", icon: ChartNoAxesCombined },
  { id: "plan", icon: ShoppingBasket },
  { id: "economics", icon: SlidersHorizontal },
  { id: "documents", icon: Files },
] as const;
export default function App({ cloud = false }: { cloud?: boolean }) {
  const [payload, setPayload] = useState<Payload | null>(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [view, setViewState] = useState<View>("today"),
    [planTab, setPlanTab] = useState("plan"),
    [mobileOpen, setMobileOpen] = useState(false),
    [locationOpen, setLocationOpen] = useState(false);
  const latest = useRef<Payload | null>(null);
  const setData = (p: Payload) => {
    latest.current = p;
    setPayload(p);
  };
  const reload = useCallback(async () => {
    try {
      const res = await fetch("/api/state", { cache: "no-store" }),
        data = await res.json();
      if (!res.ok) throw new Error(data.error);
      latest.current = data;
      setPayload(data);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);
  useEffect(() => {
    const onHash = () => {
      const hash = location.hash.slice(1);
      if (nav.some((n) => n.id === hash)) setViewState(hash as View);
    };
    window.addEventListener("hashchange", onHash);
    const abort = new AbortController();
    fetch("/api/state", { cache: "no-store", signal: abort.signal })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        latest.current = data;
        setPayload(data);
        onHash();
      })
      .catch((e) => {
        if (e.name !== "AbortError") setError(e.message);
      });
    return () => {
      abort.abort();
      window.removeEventListener("hashchange", onHash);
    };
  }, []);
  useEffect(() => {
    if (payload) document.documentElement.lang = payload.state.settings.locale;
  }, [payload]);
  useEffect(() => {
    if (!notice) return;
    const id = setTimeout(() => setNotice(""), 5500);
    return () => clearTimeout(id);
  }, [notice]);
  function setView(v: View) {
    setViewState(v);
    setMobileOpen(false);
    location.hash = v;
    window.scrollTo({ top: 0, behavior: "instant" });
  }
  async function mutate(action: Action) {
    if (action.type === "check" && latest.current) {
      const optimistic = structuredClone(latest.current);
      const order = optimistic.state.orders.find(
        (o) => o.id === action.order_id,
      );
      if (order) {
        order.checked[action.offer_id] = action.checked;
        setData(optimistic);
      }
    }
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/state", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action,
            revision: latest.current?.state.revision,
          }),
        }),
        data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setData(data);
      setNotice(
        action.type === "check"
          ? "Shopping list saved"
          : "Saved to your private workspace",
      );
      return true;
    } catch (e) {
      setError((e as Error).message);
      await reload();
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function switchWorkspace(kind: State["kind"]) {
    setBusy(true);
    try {
      const res = await fetch("/api/state", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "workspace", kind }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setData(data);
      setView(kind === "guided" ? "documents" : "today");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (!payload)
    return (
      <div className="loading-screen">
        <Logo />
        <p>{error || "Opening your private workspace…"}</p>
        {error && <Button onClick={reload}>Try again</Button>}
      </div>
    );
  const { state, derived } = payload,
    t = dictionaries[state.settings.locale];
  return (
    <AppContext.Provider
      value={{
        cloud,
        state,
        derived,
        error,
        openLocation: () => {
          setError("");
          setLocationOpen(true);
        },
        switchWorkspace,
        busy,
        view,
        setView,
        mutate,
        reload,
        setNotice,
        setPayload: setData,
        planTab,
        setPlanTab,
      }}
    >
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>
      <div className="app-shell">
        <aside
          className={`sidebar ${mobileOpen ? "open" : ""}`}
          aria-label="Main navigation"
        >
          <a className="brand" href="#today" onClick={() => setView("today")}>
            <Logo />
          </a>
          <button
            className="mobile-close icon-button"
            onClick={() => setMobileOpen(false)}
            aria-label="Close navigation"
          >
            <PanelLeftClose />
          </button>
          <div className="workspace-label">
            <span className="workspace-avatar">
              {state.name.slice(0, 2).toUpperCase()}
            </span>
            <div>
              <strong>{state.name}</strong>
              <span>{locationLabel(state.location)}</span>
            </div>
          </div>
          <div className="nav-label">YOUR KITCHEN</div>
          <nav>
            {nav.map((n) => (
              <button
                key={n.id}
                className={`nav-item ${view === n.id ? "active" : ""}`}
                aria-label={t[n.id]}
                aria-current={view === n.id ? "page" : undefined}
                onClick={() => setView(n.id)}
              >
                <n.icon size={19} />
                <span className="nav-full">{t[n.id]}</span>
                <span className="nav-short">
                  {
                    {
                      today: "Kitchen",
                      stock: "Stock & recipes",
                      market: "Prices",
                      plan: "Shopping",
                      economics: "Decisions",
                      documents: "Documents",
                    }[n.id]
                  }
                </span>
                {view === n.id && <span className="nav-dot" />}
              </button>
            ))}
          </nav>
          <div className="sidebar-bottom">
            <div className="small-brand">
              <ShieldCheck size={17} />
              <strong>Your kitchen. Your records.</strong>
            </div>
            <p>
              Stored on this app’s local server.
              <br />
              Your records stay private.
            </p>
            <button
              onClick={() =>
                void switchWorkspace(
                  state.kind === "sample" ? "owner" : "sample",
                )
              }
              className="text-button"
            >
              {state.kind === "sample" ? "Back to my business" : t.sample}
              <ArrowUpRight size={15} />
            </button>
            <span className="version">PRIVATE PILOT · V1.3</span>
          </div>
        </aside>
        {mobileOpen && (
          <button
            className="nav-backdrop"
            aria-label="Close navigation"
            onClick={() => setMobileOpen(false)}
          />
        )}
        <div className="workspace-main">
          <header className="topbar">
            <div className="breadcrumb">
              <button
                className="icon-button mobile-menu"
                aria-label="Open navigation"
                onClick={() => setMobileOpen(true)}
              >
                <Menu size={22} />
              </button>
              <span className="desktop-only">Workspace</span>
              <ChevronRight className="desktop-only" size={13} />
              <span className="mobile-brand">
                <Logo compact />
              </span>
              <strong className="desktop-only">{t[view]}</strong>
            </div>
            <div className="topbar-actions">
              <button
                className="location-button"
                aria-label="Set business location"
                onClick={() => {
                  setError("");
                  setLocationOpen(true);
                }}
              >
                <MapPin size={15} />
                <span>{locationLabel(state.location)}</span>
              </button>
              <select
                className="workspace-picker"
                aria-label="Workspace"
                value={state.kind}
                disabled={busy}
                onChange={(e) =>
                  void switchWorkspace(e.target.value as State["kind"])
                }
              >
                <option value="owner">My business</option>
                <option value="sample">Sample bakery</option>
                <option value="guided">Guided sample demo</option>
              </select>
              <button
                className="text-button account-link"
                onClick={() => setView("documents")}
              >
                Account & backups
              </button>
              <Badge>
                {state.price_mode === "sample" ? "Demo data" : "Your inputs"}
              </Badge>
              <span className="demo-date">
                {formatDateTime(state.clock, state.timezone)}
              </span>
              <select
                aria-label="Language"
                value={state.settings.locale}
                onChange={(e) =>
                  void mutate({
                    type: "settings",
                    settings: {
                      ...state.settings,
                      locale: e.target.value as "en" | "vi",
                    },
                  })
                }
              >
                <option value="en">EN</option>
                <option value="vi">VI</option>
              </select>
              <Button variant="secondary" onClick={() => setView("documents")}>
                <Upload size={16} />
                <span>{t.upload}</span>
              </Button>
            </div>
          </header>
          <main id="main-content" tabIndex={-1}>
            {error && (
              <div className="error-banner" role="alert">
                <strong>Couldn’t save this change.</strong>
                <span>{error}</span>
                <button
                  aria-label="Dismiss error"
                  className="icon-button"
                  onClick={() => setError("")}
                >
                  <X size={18} />
                </button>
              </div>
            )}
            {view === "today" ? (
              <Today />
            ) : view === "plan" ? (
              <PlanView />
            ) : view === "stock" ? (
              <Inventory />
            ) : view === "market" ? (
              <Market />
            ) : view === "economics" ? (
              <Economics />
            ) : (
              <Documents />
            )}
          </main>
          <footer className="app-footer">
            <span>
              {state.price_mode === "sample"
                ? "Sample prices, real calculations. Made for food businesses."
                : "Your supplier quotes · current planning time."}
            </span>
            <span>No real orders or payments · USD</span>
          </footer>
        </div>
      </div>
      <nav className="mobile-bottom" aria-label="Quick actions">
        <button
          onClick={() => setView("today")}
          className={view === "today" ? "active" : ""}
        >
          <House size={20} />
          {t.today}
        </button>
        <button
          onClick={() => {
            setPlanTab("plan");
            setView("plan");
          }}
          className={view === "plan" && planTab === "plan" ? "active" : ""}
        >
          <ShoppingBasket size={20} />
          {t.plan}
        </button>
        <button
          onClick={() => {
            setPlanTab("shopping");
            setView("plan");
          }}
          className={view === "plan" && planTab === "shopping" ? "active" : ""}
        >
          <CheckCircle2 size={20} />
          {t.shopping}
        </button>
        <button
          onClick={() => setView("documents")}
          className={view === "documents" ? "active" : ""}
        >
          <Upload size={20} />
          {state.settings.locale === "vi" ? "Tải lên" : "Upload"}
        </button>
      </nav>
      {locationOpen && (
        <LocationEditor
          key={`${state.id}-${state.revision}`}
          onClose={() => setLocationOpen(false)}
        />
      )}
      {notice && (
        <div className="toast" role="status">
          <CheckCircle2 size={18} />
          {notice}
          <button
            aria-label="Dismiss notification"
            onClick={() => setNotice("")}
          >
            <X size={16} />
          </button>
        </div>
      )}
    </AppContext.Provider>
  );
}
