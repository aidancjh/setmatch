// Mock Marketplace catalog. Frontend-only for now (no backend/DB) — a neat,
// browsable listing we can refine later. Sellers are real seeded demo users so
// their profiles are clickable (see /user/:id). Courts are resold court slots:
// someone booked a court, can't use it, and sells the slot so a buyer can host.

export type MarketCategory = "shoes" | "volleyballs" | "courts";

export interface MarketItem {
  id: string;
  category: MarketCategory;
  name: string;
  price: number;
  /** Short one-liner for the card. */
  blurb: string;
  /** Longer text for the detail page. */
  description: string;
  /** Condition label (gear only). */
  condition?: string;
  sellerId: string;
  sellerName: string;
  /** Courts only — where and when the resold slot is. */
  venue?: string;
  when?: string;
}

export const CATEGORY_LABELS: Record<MarketCategory, string> = {
  shoes: "Shoes",
  volleyballs: "Volleyballs",
  courts: "Courts",
};

export const CATEGORY_ORDER: MarketCategory[] = ["shoes", "volleyballs", "courts"];

export const MARKET_ITEMS: MarketItem[] = [
  // --- Shoes ---
  {
    id: "mk_shoe_1",
    category: "shoes",
    name: "Mizuno Wave Lightning Z6",
    price: 85,
    blurb: "Barely used · US 10",
    description:
      "Worn for one indoor season, tons of life left. Excellent lateral support and grip. Size US 10 / EU 44. No box.",
    condition: "Like new",
    sellerId: "user_theo",
    sellerName: "Wei Jie L.",
  },
  {
    id: "mk_shoe_2",
    category: "shoes",
    name: "ASICS Sky Elite FF 2",
    price: 110,
    blurb: "Brand new in box · US 9",
    description:
      "Bought the wrong size — never worn, still in the original box with tags. Top-tier attacking shoe. Size US 9 / EU 42.5.",
    condition: "New",
    sellerId: "user_dre",
    sellerName: "Arjun N.",
  },
  {
    id: "mk_shoe_3",
    category: "shoes",
    name: "Nike Zoom HyperAce 2",
    price: 60,
    blurb: "Solid indoor shoe · US 11",
    description:
      "Reliable everyday indoor shoe. Some sole wear but plenty of grip left. Size US 11 / EU 45.",
    condition: "Used — good",
    sellerId: "user_maria",
    sellerName: "Jia Min T.",
  },
  {
    id: "mk_shoe_4",
    category: "shoes",
    name: "Adidas Crazyflight Mid",
    price: 70,
    blurb: "Great ankle support · US 8.5",
    description:
      "Mid-cut for extra ankle stability. Worn a handful of times, clean and cared for. Size US 8.5 / EU 42.",
    condition: "Like new",
    sellerId: "user_nina",
    sellerName: "Hui Wen O.",
  },

  // --- Volleyballs ---
  {
    id: "mk_ball_1",
    category: "volleyballs",
    name: "Mikasa V200W (Official)",
    price: 45,
    blurb: "FIVB match ball · unopened",
    description:
      "The official FIVB indoor game ball. Brand new, never inflated. The gold standard for competitive indoor play.",
    condition: "New",
    sellerId: "user_grace",
    sellerName: "Nur Aisyah B.",
  },
  {
    id: "mk_ball_2",
    category: "volleyballs",
    name: "Molten Flistatec V5M5000",
    price: 40,
    blurb: "Used indoors twice",
    description:
      "Premium indoor ball with flight-stability panels. Used for two sessions, basically new. Great touch.",
    condition: "Like new",
    sellerId: "user_theo",
    sellerName: "Wei Jie L.",
  },
  {
    id: "mk_ball_3",
    category: "volleyballs",
    name: "Wilson AVP Official Beach",
    price: 30,
    blurb: "Perfect for the sand",
    description:
      "Official AVP beach ball, soft-touch cover that holds up outdoors. Some sand wear, plays great.",
    condition: "Used — good",
    sellerId: "user_dre",
    sellerName: "Arjun N.",
  },
  {
    id: "mk_ball_4",
    category: "volleyballs",
    name: "Mikasa VLS300 Beach",
    price: 50,
    blurb: "Official beach game ball · new",
    description:
      "The official FIVB beach ball. Brand new. Dimpled cover for grip and stable flight in the wind.",
    condition: "New",
    sellerId: "user_maria",
    sellerName: "Jia Min T.",
  },

  // --- Courts (resold booked slots) ---
  {
    id: "mk_court_1",
    category: "courts",
    name: "Indoor Court — Bedok Sports Hall",
    price: 20,
    blurb: "Sat 6–8 PM · take my slot",
    description:
      "Booked via ActiveSG but can't make it — buy the slot and host your own game. Full-size indoor court, nets set up, 5 min from Bedok MRT.",
    venue: "Bedok Sports Hall (ActiveSG), Court 2 · Bedok",
    when: "Sat, Jun 27 · 6:00–8:00 PM",
    sellerId: "user_maria",
    sellerName: "Jia Min T.",
  },
  {
    id: "mk_court_2",
    category: "courts",
    name: "Beach Court — Siloso Beach",
    price: 25,
    blurb: "Sun morning · 2 hrs",
    description:
      "Reserved beach court I can't use this weekend. Great sand, right by the beach bars. Grab it and run your own session.",
    venue: "Siloso Beach, Sentosa · Net 4",
    when: "Sun, Jun 28 · 10:00 AM–12:00 PM",
    sellerId: "user_theo",
    sellerName: "Wei Jie L.",
  },
  {
    id: "mk_court_3",
    category: "courts",
    name: "Indoor Court — OCBC Arena",
    price: 30,
    blurb: "Fri 7–9 PM · premium hall",
    description:
      "Premium indoor court at OCBC Arena, Sports Hub. Pro flooring, pro nets. Booked it for a game that fell through — it's yours.",
    venue: "OCBC Arena · Kallang",
    when: "Fri, Jul 3 · 7:00–9:00 PM",
    sellerId: "user_dre",
    sellerName: "Arjun N.",
  },
];

export function getMarketItem(id: string): MarketItem | undefined {
  return MARKET_ITEMS.find((i) => i.id === id);
}

export function itemsByCategory(category: MarketCategory): MarketItem[] {
  return MARKET_ITEMS.filter((i) => i.category === category);
}
