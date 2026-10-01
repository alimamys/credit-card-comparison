import type { MccCode, Merchant, SpendCategory } from "../../domain/types";
import type { DemoDates } from "./dates";

/**
 * Merchant Category Codes (ISO 18245). Codes and descriptions are standard;
 * the category mapping is this application's own normalisation.
 */
const MCC_TABLE: [string, string, SpendCategory][] = [
  ["5541", "Service stations", "fuel"],
  ["5542", "Automated fuel dispensers", "fuel"],
  ["5411", "Grocery stores, supermarkets", "groceries"],
  ["5499", "Misc. food stores, convenience stores", "groceries"],
  ["5812", "Eating places, restaurants", "dining"],
  ["5814", "Fast food restaurants", "dining"],
  ["4511", "Airlines, air carriers", "airline"],
  ["4722", "Travel agencies, tour operators", "travel"],
  ["7011", "Hotels, motels, resorts", "hotel"],
  ["8211", "Elementary and secondary schools", "education"],
  ["8220", "Colleges, universities", "education"],
  ["8299", "Schools and educational services", "education"],
  ["4900", "Utilities — electric, gas, water", "utilities"],
  ["4814", "Telecommunication services", "telecom"],
  ["4121", "Taxicabs and limousines", "transport"],
  ["4111", "Local and suburban commuter transport", "transport"],
  ["4784", "Tolls and bridge fees", "transport"],
  ["7523", "Parking lots and garages", "transport"],
  ["9399", "Government services", "government"],
  ["9311", "Tax payments", "government"],
  ["5732", "Electronics stores", "electronics"],
  ["5712", "Furniture and home furnishings", "retail"],
  ["5311", "Department stores", "retail"],
  ["5399", "Misc. general merchandise", "online_shopping"],
  ["5651", "Family clothing stores", "fashion"],
  ["7832", "Motion picture theatres", "entertainment"],
  ["5912", "Drug stores and pharmacies", "health"],
  ["8062", "Hospitals", "health"],
  ["6300", "Insurance sales and underwriting", "insurance"],
  ["6513", "Real estate agents — rentals", "real_estate"],
  ["8398", "Charitable organisations", "charity"],
];

export function demoMccs(d: DemoDates): MccCode[] {
  return MCC_TABLE.map(([code, description, category]) => ({
    code,
    description,
    category,
    dataStatus: "verified",
    lastVerifiedAt: d.ago(30),
    sources: [{ url: "https://www.iso.org/search.html?q=18245", publisher: "ISO 18245", retrievedAt: d.ago(30) }],
  }));
}

type M = [id: string, name: string, category: SpendCategory, mcc: string, aliases: string[], icon: string, online?: boolean];

/** Phrases that contain a merchant alias but refer to something else. */
const NEGATIVE_ALIASES: Record<string, string[]> = {
  emirates: ["emirates id", "emirates nbd", "emirates islamic", "mall of the emirates", "emirates post", "emirates auction"],
  etihad: ["etihad rail", "etihad water", "etihad credit"],
  noon: ["afternoon", "noon prayer"],
};

/**
 * Real UAE merchants mapped to categories and typical MCCs. MCCs can vary by
 * acquirer/terminal — the mapping is marked "estimated" until verified.
 */
const MERCHANTS: M[] = [
  ["enoc", "ENOC", "fuel", "5541", ["enoc", "eppco", "enoc petrol"], "⛽"],
  ["adnoc", "ADNOC Distribution", "fuel", "5541", ["adnoc", "adnoc oasis"], "⛽"],
  ["emarat", "Emarat", "fuel", "5541", ["emarat"], "⛽"],
  ["carrefour", "Carrefour", "groceries", "5411", ["carrefour", "carrefour uae", "mafcarrefour"], "🛒"],
  ["lulu", "Lulu Hypermarket", "groceries", "5411", ["lulu", "lulu hypermarket"], "🛒"],
  ["spinneys", "Spinneys", "groceries", "5411", ["spinneys"], "🛒"],
  ["waitrose", "Waitrose", "groceries", "5411", ["waitrose"], "🛒"],
  ["union_coop", "Union Coop", "groceries", "5411", ["union coop", "union co-op"], "🛒"],
  ["talabat", "Talabat", "food_delivery", "5814", ["talabat"], "🛵", true],
  ["deliveroo", "Deliveroo", "food_delivery", "5814", ["deliveroo"], "🛵", true],
  ["starbucks", "Starbucks", "dining", "5814", ["starbucks"], "☕"],
  ["mcdonalds", "McDonald's", "dining", "5814", ["mcdonalds", "mcdonald's", "mcd"], "🍔"],
  ["amazon_ae", "Amazon.ae", "online_shopping", "5399", ["amazon", "amazon.ae", "amazon uae"], "📦", true],
  ["noon", "noon", "online_shopping", "5399", ["noon", "noon.com"], "📦", true],
  ["namshi", "Namshi", "fashion", "5651", ["namshi"], "👗", true],
  ["emirates", "Emirates", "airline", "4511", ["emirates", "emirates airline", "emirates.com"], "✈️"],
  ["etihad", "Etihad Airways", "airline", "4511", ["etihad", "etihad airways"], "✈️"],
  ["flydubai", "flydubai", "airline", "4511", ["flydubai", "fly dubai"], "✈️"],
  ["air_arabia", "Air Arabia", "airline", "4511", ["air arabia"], "✈️"],
  ["booking_com", "Booking.com", "travel", "4722", ["booking.com", "booking com"], "🧳", true],
  ["marriott", "Marriott Hotels", "hotel", "7011", ["marriott", "w hotel", "ritz-carlton", "sheraton", "westin"], "🏨"],
  ["hilton", "Hilton", "hotel", "7011", ["hilton", "conrad", "waldorf astoria"], "🏨"],
  ["careem", "Careem", "transport", "4121", ["careem"], "🚕", true],
  ["uber", "Uber", "transport", "4121", ["uber"], "🚕", true],
  ["salik", "Salik", "transport", "4784", ["salik"], "🛣️"],
  ["rta", "RTA / nol", "transport", "4111", ["rta", "nol", "nol card", "dubai metro"], "🚇"],
  ["dewa", "DEWA", "utilities", "4900", ["dewa"], "💡"],
  ["taqa", "TAQA Distribution", "utilities", "4900", ["addc", "taqa", "aadc"], "💡"],
  ["etisalat", "e& (Etisalat)", "telecom", "4814", ["etisalat", "e&", "eand"], "📱"],
  ["du", "du", "telecom", "4814", ["du telecom", "du bill", "du mobile"], "📱"],
  ["vox", "VOX Cinemas", "entertainment", "7832", ["vox", "vox cinemas"], "🎬"],
  ["ikea", "IKEA", "retail", "5712", ["ikea"], "🛋️"],
  ["sharaf_dg", "Sharaf DG", "electronics", "5732", ["sharaf dg", "sharaf"], "💻"],
  ["apple_store", "Apple Store", "electronics", "5732", ["apple store", "apple.com"], "💻"],
  ["gems", "GEMS Education", "education", "8211", ["gems", "gems education"], "🎓"],
  ["dubai_police", "Dubai Police (fines)", "government", "9399", ["dubai police", "traffic fines"], "🏛️"],
  ["life_pharmacy", "Life Pharmacy", "health", "5912", ["life pharmacy"], "💊"],
  ["aster", "Aster Pharmacy", "health", "5912", ["aster", "aster pharmacy"], "💊"],
];

export function demoMerchants(d: DemoDates): Merchant[] {
  return MERCHANTS.map(([id, name, category, mcc, aliases, icon, online]) => ({
    id,
    name,
    category,
    mccs: [mcc],
    aliases,
    icon,
    isOnline: online,
    negativeAliases: NEGATIVE_ALIASES[id],
    dataStatus: "estimated",
    lastCheckedAt: d.ago(5),
    lastVerifiedAt: d.ago(40),
  }));
}
