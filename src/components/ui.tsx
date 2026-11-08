"use client";
import {
  createContext,
  useContext,
  type ReactNode,
  useEffect,
  useRef,
  useId,
  isValidElement,
  cloneElement,
  type ReactElement,
} from "react";
import { X, ArrowUpRight, Check, AlertCircle } from "lucide-react";
import type { Derived, State, Ingredient } from "../domain/types";
import { formatDateTime } from "../domain/location";
import type { Action } from "../domain/validation";
export type View =
  "today" | "stock" | "market" | "plan" | "economics" | "documents";
export type AppContextValue = {
  cloud?: boolean;
  state: State;
  derived: Derived;
  busy: boolean;
  error?: string;
  openLocation: () => void;
  switchWorkspace: (kind: State["kind"]) => Promise<void>;
  view: View;
  setView: (v: View) => void;
  mutate: (a: Action) => Promise<boolean>;
  reload: () => Promise<void>;
  setNotice: (s: string) => void;
  setPayload: (p: { state: State; derived: Derived }) => void;
  planTab: string;
  setPlanTab: (v: string) => void;
};
export const AppContext = createContext<AppContextValue | null>(null);
export function useApp() {
  const c = useContext(AppContext);
  if (!c) throw new Error("App context missing");
  return c;
}
export const dictionaries = {
  en: {
    today: "Today",
    stock: "Recipes & stock",
    market: "Ingredient market",
    plan: "Purchase plan",
    economics: "Scenarios & pricing",
    documents: "Documents & settings",
    upload: "Upload document",
    approve: "Approve shopping plan",
    save: "Save changes",
    shopping: "Shopping list",
    calendar: "Calendar",
    build: "Build shopping plan",
    receipt: "Confirm goods received",
    production: "Record production",
    sample: "Explore sample bakery",
    guided: "Start guided demo",
    money: "Money left after reserve",
    review: "Review",
    cancel: "Cancel",
    print: "Print list",
    export: "Export CSV",
  },
  vi: {
    today: "Hôm nay",
    stock: "Công thức & tồn kho",
    market: "Giá nguyên liệu",
    plan: "Kế hoạch mua hàng",
    economics: "Kịch bản & giá bán",
    documents: "Chứng từ & cài đặt",
    upload: "Tải chứng từ lên",
    approve: "Duyệt kế hoạch mua hàng",
    save: "Lưu thay đổi",
    shopping: "Danh sách mua hàng",
    calendar: "Lịch mua hàng",
    build: "Lập kế hoạch mua hàng",
    receipt: "Xác nhận đã nhận hàng",
    production: "Ghi nhận sản xuất",
    sample: "Khám phá tiệm bánh mẫu",
    guided: "Bắt đầu hướng dẫn",
    money: "Tiền còn lại sau dự phòng",
    review: "Kiểm tra",
    cancel: "Hủy",
    print: "In danh sách",
    export: "Xuất CSV",
  },
};
export function useT() {
  const { state } = useApp();
  return dictionaries[state.settings.locale];
}
export const money = (cents: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    cents / 100,
  );
export function qty(q: number, i: Ingredient | undefined) {
  if (!i) return String(q);
  return i.base_unit === "each"
    ? `${q} ${i.count_unit ?? (i.id === "eggs" ? "eggs" : "units")}`
    : `${Number((q / 1000).toFixed(3))} ${i.base_unit === "ml" ? "L" : "kg"}`;
}
export function dateTime(value: string, timezone: string) {
  return formatDateTime(value, timezone);
}
export const shortRecipe = (name: string) =>
  name.replace(" — illustrative recipe", "");
export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "good" | "warn" | "danger";
}) {
  return <span className={`badge ${tone}`}>{children}</span>;
}
export function Button({
  children,
  variant = "primary",
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
}) {
  return (
    <button className={`button ${variant} ${className}`} {...props}>
      {children}
    </button>
  );
}
export function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <section className={`card ${className}`}>{children}</section>;
}
export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  const labelId = useId(),
    hintId = useId();
  const element = isValidElement(children)
    ? (children as ReactElement<{
        "aria-label"?: string;
        "aria-labelledby"?: string;
        "aria-describedby"?: string;
      }>)
    : null;
  return (
    <label className="field">
      <span id={labelId}>{label}</span>
      {element
        ? cloneElement(element, {
            "aria-labelledby":
              element.props["aria-labelledby"] ??
              (element.props["aria-label"] ? undefined : labelId),
            "aria-describedby": hint
              ? hintId
              : element.props["aria-describedby"],
          })
        : children}
      {hint && <small id={hintId}>{hint}</small>}
    </label>
  );
}
export function Metric({
  label,
  value,
  detail,
}: {
  label: string;
  value: ReactNode;
  detail?: string;
}) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
      {detail && <small>{detail}</small>}
    </div>
  );
}
export function PageHeading({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {action}
    </div>
  );
}
export function Empty({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="empty">
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  );
}
export function Note({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: string;
}) {
  return (
    <div className={`note ${tone}`}>
      <AlertCircle size={17} />
      <div>{children}</div>
    </div>
  );
}
export function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const context = useContext(AppContext);
  useEffect(() => {
    const d = ref.current;
    d?.showModal();
    return () => d?.close();
  }, []);
  return (
    <dialog ref={ref} className="modal" onCancel={onClose}>
      <div className="modal-head">
        <h2>{title}</h2>
        <button
          className="icon-button"
          onClick={onClose}
          aria-label="Close dialog"
        >
          <X size={20} />
        </button>
      </div>
      <div className="modal-body">
        {context?.error && (
          <div className="error-banner" role="alert">
            {context.error}
          </div>
        )}
        {children}
      </div>
    </dialog>
  );
}
export function ActionRow({
  title,
  detail,
  onClick,
  done = false,
}: {
  title: string;
  detail: string;
  onClick: () => void;
  done?: boolean;
}) {
  return (
    <button className="action-row" onClick={onClick}>
      <span className={`action-icon ${done ? "complete" : ""}`}>
        {done ? <Check size={18} /> : <ArrowUpRight size={18} />}
      </span>
      <span>
        <strong>{title}</strong>
        <small>{detail}</small>
      </span>
      <ArrowUpRight size={16} />
    </button>
  );
}
