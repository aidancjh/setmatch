import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { CATEGORY_LABELS, getMarketItem } from "../lib/marketplace";
import { CategoryArt } from "../components/MarketplaceArt";

export default function MarketplaceItem() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const [showDmNote, setShowDmNote] = useState(false);
  const item = getMarketItem(id);

  if (!item) {
    return (
      <div className="py-16 text-center">
        <p className="text-sm text-slate-400">This listing no longer exists.</p>
        <button
          onClick={() => navigate("/marketplace")}
          className="mt-3 text-sm font-semibold text-white underline"
        >
          Back to Marketplace
        </button>
      </div>
    );
  }

  return (
    <div>
      <button
        onClick={() => navigate("/marketplace")}
        className="mb-3 text-sm font-medium text-slate-400 transition hover:text-white"
      >
        ← Marketplace
      </button>

      {/* Hero illustration */}
      <div className="flex h-52 items-center justify-center rounded-2xl bg-brand/10 text-brand">
        <CategoryArt category={item.category} className="h-28 w-28" />
      </div>

      {/* Title + price */}
      <div className="mt-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <span className="inline-block rounded-full bg-slate-800 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-slate-300">
            {CATEGORY_LABELS[item.category]}
          </span>
          <h1 className="mt-1.5 text-xl font-bold leading-tight text-white">{item.name}</h1>
        </div>
        <span className="shrink-0 text-2xl font-extrabold text-brand">${item.price}</span>
      </div>

      {/* Court slot details */}
      {item.category === "courts" && (item.venue || item.when) && (
        <div className="mt-3 space-y-1.5 rounded-xl border border-slate-800 bg-slate-900 p-3">
          {item.when && (
            <p className="text-sm font-semibold text-white">{item.when}</p>
          )}
          {item.venue && <p className="text-xs text-slate-400">{item.venue}</p>}
        </div>
      )}

      {/* Condition (gear) */}
      {item.condition && (
        <p className="mt-3 text-sm text-slate-300">
          <span className="text-slate-500">Condition:</span> {item.condition}
        </p>
      )}

      {/* Description */}
      <p className="mt-3 text-sm leading-relaxed text-slate-300">{item.description}</p>

      {/* Seller */}
      <div className="mt-5 rounded-2xl border border-slate-800 bg-slate-900 p-3">
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          Seller
        </p>
        <div className="flex items-center justify-between gap-3">
          <Link
            to={`/user/${item.sellerId}`}
            className="flex min-w-0 items-center gap-2.5"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand/10 text-sm font-bold text-brand">
              {item.sellerName.charAt(0).toUpperCase()}
            </span>
            <span className="truncate text-sm font-semibold text-white">
              {item.sellerName}
            </span>
          </Link>
          <button
            onClick={() => setShowDmNote(true)}
            className="shrink-0 rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-dark active:scale-95"
          >
            Message seller
          </button>
        </div>
        {showDmNote && (
          <p className="mt-3 rounded-lg bg-slate-800 px-3 py-2 text-xs text-slate-300">
            Direct messages are coming soon. For now, tap the seller to view their
            profile.
          </p>
        )}
      </div>
    </div>
  );
}
