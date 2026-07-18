import { useNavigate } from "react-router-dom";
import {
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  itemsByCategory,
  type MarketItem,
} from "../lib/marketplace";
import { CategoryArt } from "../components/MarketplaceArt";

function ItemCard({ item }: { item: MarketItem }) {
  const navigate = useNavigate();
  const sub = item.category === "courts" ? item.when : item.condition;
  return (
    <button
      onClick={() => navigate(`/marketplace/${item.id}`)}
      className="flex w-full items-center gap-3 rounded-2xl border border-slate-800 bg-slate-900 p-3 text-left transition active:scale-[0.98] hover:border-brand/40"
    >
      <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-brand/10 text-brand">
        <CategoryArt category={item.category} className="h-11 w-11" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <p className="truncate font-semibold text-white">{item.name}</p>
          <span className="shrink-0 font-bold text-brand">${item.price}</span>
        </div>
        <p className="mt-0.5 truncate text-xs text-slate-400">{item.blurb}</p>
        <p className="mt-1 truncate text-[11px] text-slate-500">
          {sub ? `${sub} · ` : ""}
          {item.sellerName}
        </p>
      </div>
    </button>
  );
}

export default function Marketplace() {
  return (
    <div>
      <div className="mb-4">
        <h1 className="text-2xl font-bold tracking-tight text-white">Marketplace</h1>
        <p className="text-sm text-slate-400">
          Gear and courts from the community. Tap an item to see details.
        </p>
      </div>

      {CATEGORY_ORDER.map((category) => {
        const items = itemsByCategory(category);
        if (items.length === 0) return null;
        return (
          <section key={category} className="mb-6">
            <h2 className="mb-2.5 text-xs font-bold uppercase tracking-wide text-slate-300">
              {CATEGORY_LABELS[category]}{" "}
              <span className="text-slate-500">({items.length})</span>
            </h2>
            <div className="space-y-2.5">
              {items.map((item) => (
                <ItemCard key={item.id} item={item} />
              ))}
            </div>
          </section>
        );
      })}

      <p className="pb-2 pt-1 text-center text-[11px] text-slate-600">
        Sample listings — buying &amp; selling is coming soon.
      </p>
    </div>
  );
}
