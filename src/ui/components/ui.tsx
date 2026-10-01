import { type ReactNode, useEffect, useId, useRef, useState } from "react";
import type { BenefitComponent, Card, DataStatus, ResultConfidence, RewardCurrency } from "../../core/domain/types";

export function CardArt({ card, size = "md" }: { card: Card; size?: "sm" | "md" | "lg" }) {
  return (
    <div
      className={`card-art card-art--${size}`}
      style={{ background: `linear-gradient(135deg, ${card.design.from}, ${card.design.to})`, color: card.design.text ?? "#fff" }}
      aria-hidden="true"
    >
      <span className="card-art__chip" />
      <span className="card-art__network">{card.network === "Mastercard" ? "MC" : card.network.toUpperCase()}</span>
    </div>
  );
}

export type BadgeTone = "cash" | "miles" | "points" | "hotel" | "discount" | "deal" | "warn" | "neutral" | "demo" | "good";

export function Badge({ tone = "neutral", children, title }: { tone?: BadgeTone; children: ReactNode; title?: string }) {
  return (
    <span className={`badge badge--${tone}`} title={title}>
      {children}
    </span>
  );
}

export function currencyTone(c?: RewardCurrency): BadgeTone {
  switch (c?.type) {
    case "cash":
      return "cash";
    case "airline_miles":
      return "miles";
    case "hotel_points":
      return "hotel";
    default:
      return "points";
  }
}

export function benefitBadge(b: BenefitComponent, currency?: RewardCurrency): { tone: BadgeTone; label: string } {
  if (b.type === "discount") return { tone: "discount", label: "MERCHANT DISCOUNT" };
  if (b.type === "statement_credit") return { tone: "cash", label: "STATEMENT CREDIT" };
  if (b.type === "fee") return { tone: "warn", label: "FEE" };
  return { tone: currencyTone(currency), label: currency?.badge ?? "REWARD" };
}

const CONF_LABEL: Record<ResultConfidence, string> = { exact: "Exact", estimated: "Estimated", conditional: "Conditional" };

export function ConfidencePill({ confidence }: { confidence: ResultConfidence }) {
  return <span className={`conf conf--${confidence}`}>{CONF_LABEL[confidence]}</span>;
}

export function DataStatusBadge({ status }: { status: DataStatus }) {
  const tone: Record<DataStatus, BadgeTone> = { live: "good", verified: "good", cached: "neutral", estimated: "neutral", demo: "demo", expired: "warn" };
  return <Badge tone={tone[status]}>{status === "demo" ? "DEMO DATA" : status.toUpperCase()}</Badge>;
}

export function InfoTip({ children, label = "More information" }: { children: ReactNode; label?: string }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);
  return (
    <span className="infotip" ref={ref}>
      <button type="button" className="infotip__btn" aria-label={label} aria-expanded={open} aria-describedby={open ? id : undefined} onClick={() => setOpen((o) => !o)}>
        i
      </button>
      {open && (
        <span role="tooltip" id={id} className="infotip__bubble">
          {children}
        </span>
      )}
    </span>
  );
}

export function Modal({ title, onClose, children, wide }: { title: ReactNode; onClose: () => void; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    ref.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${wide ? "modal--wide" : ""}`} role="dialog" aria-modal="true" tabIndex={-1} ref={ref}>
        <div className="modal__head">
          <h2>{title}</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <div className="modal__body">{children}</div>
      </div>
    </div>
  );
}

export function EmptyState({ icon, title, children }: { icon: string; title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <div className="empty__icon" aria-hidden="true">
        {icon}
      </div>
      <h3>{title}</h3>
      {children}
    </div>
  );
}

export const MILES_DISCLAIMER =
  "The value of airline miles depends on how they are redeemed. This estimate is used to compare rewards consistently and does not represent a guaranteed cash redemption value.";
export const POINTS_DISCLAIMER =
  "Points are valued using an estimated redemption value so different rewards can be compared. Actual value depends on how you redeem them.";
