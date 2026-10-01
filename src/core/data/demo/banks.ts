import type { Bank } from "../../domain/types";
import type { DemoDates } from "./dates";

/** FICTIONAL demo issuers. They do not represent any real bank. */
export function demoBanks(d: DemoDates): Bank[] {
  const meta = { country: "AE" as const, dataStatus: "demo" as const, lastCheckedAt: d.ago(1), lastVerifiedAt: d.ago(10) };
  return [
    { id: "saffron", name: "Saffron Bank (Demo)", shortName: "Saffron", ...meta },
    { id: "pearl", name: "Pearl Gulf Bank (Demo)", shortName: "Pearl Gulf", ...meta },
    { id: "marina", name: "Marina Islamic Bank (Demo)", shortName: "Marina Islamic", isIslamic: true, ...meta },
    { id: "falcon", name: "Falcon Commercial Bank (Demo)", shortName: "Falcon", ...meta },
    { id: "corniche", name: "Corniche Bank (Demo)", shortName: "Corniche", ...meta },
    { id: "dune", name: "Dune National Bank (Demo)", shortName: "Dune", ...meta },
  ];
}
