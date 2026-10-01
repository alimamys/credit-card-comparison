import type { SpendCategory } from "./types";

export interface CategoryMeta {
  id: SpendCategory;
  label: string;
  icon: string;
  /** Lower-case words/phrases the parser maps to this category. */
  keywords: string[];
}

export const CATEGORIES: CategoryMeta[] = [
  { id: "fuel", label: "Fuel", icon: "⛽", keywords: ["petrol", "fuel", "gas station", "diesel", "fill up", "refuel", "gasoline"] },
  { id: "groceries", label: "Groceries", icon: "🛒", keywords: ["grocery", "groceries", "supermarket", "hypermarket", "vegetables", "co-op", "coop"] },
  { id: "dining", label: "Dining", icon: "🍽️", keywords: ["restaurant", "dinner", "lunch", "breakfast", "brunch", "cafe", "coffee", "dining", "meal"] },
  { id: "food_delivery", label: "Food delivery", icon: "🛵", keywords: ["food delivery", "delivery", "takeaway", "take away", "order food"] },
  { id: "airline", label: "Flights", icon: "✈️", keywords: ["flight", "flights", "airline", "air ticket", "plane ticket", "airfare"] },
  { id: "hotel", label: "Hotels", icon: "🏨", keywords: ["hotel", "resort", "staycation", "room night"] },
  { id: "travel", label: "Travel", icon: "🧳", keywords: ["travel", "holiday", "vacation", "tour package", "travel agency"] },
  { id: "online_shopping", label: "Online shopping", icon: "📦", keywords: ["online shopping", "online order"] },
  { id: "retail", label: "Retail", icon: "🛍️", keywords: ["shopping", "mall", "furniture", "department store", "home"] },
  { id: "electronics", label: "Electronics", icon: "💻", keywords: ["electronics", "laptop", "phone", "iphone", "tv", "television", "gadget"] },
  { id: "fashion", label: "Fashion", icon: "👗", keywords: ["clothes", "clothing", "fashion", "shoes", "apparel"] },
  { id: "education", label: "Education", icon: "🎓", keywords: ["school fees", "school fee", "school", "tuition", "university", "college", "nursery", "education"] },
  { id: "utilities", label: "Utilities", icon: "💡", keywords: ["electricity", "water bill", "utility", "utilities", "dewa", "addc", "sewa", "fewa", "bill"] },
  { id: "telecom", label: "Telecom", icon: "📱", keywords: ["mobile bill", "internet", "broadband", "recharge", "phone bill", "telecom"] },
  { id: "government", label: "Government", icon: "🏛️", keywords: ["government", "fine", "fines", "visa renewal", "emirates id", "traffic fine", "municipality"] },
  { id: "transport", label: "Transport", icon: "🚕", keywords: ["taxi", "metro", "nol", "parking", "toll", "ride", "bus"] },
  { id: "entertainment", label: "Entertainment", icon: "🎬", keywords: ["cinema", "movie", "movies", "concert", "theme park", "tickets"] },
  { id: "health", label: "Health", icon: "💊", keywords: ["pharmacy", "clinic", "hospital", "doctor", "dentist", "medicine"] },
  { id: "insurance", label: "Insurance", icon: "🛡️", keywords: ["insurance", "premium"] },
  { id: "real_estate", label: "Rent & real estate", icon: "🏠", keywords: ["rent", "real estate", "landlord", "ejari"] },
  { id: "charity", label: "Charity", icon: "🤲", keywords: ["charity", "donation", "zakat", "sadaqah"] },
  { id: "other", label: "Other", icon: "💳", keywords: [] },
];

const BY_ID = new Map(CATEGORIES.map((c) => [c.id, c]));

export function categoryMeta(id: SpendCategory): CategoryMeta {
  return BY_ID.get(id) ?? BY_ID.get("other")!;
}

export function isSpendCategory(value: string): value is SpendCategory {
  return BY_ID.has(value as SpendCategory);
}
