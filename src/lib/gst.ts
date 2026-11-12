/** GST state and union territory codes, used for place of supply. */
export const GST_STATES: [code: string, name: string][] = [
  ["01", "Jammu and Kashmir"],
  ["02", "Himachal Pradesh"],
  ["03", "Punjab"],
  ["04", "Chandigarh"],
  ["05", "Uttarakhand"],
  ["06", "Haryana"],
  ["07", "Delhi"],
  ["08", "Rajasthan"],
  ["09", "Uttar Pradesh"],
  ["10", "Bihar"],
  ["11", "Sikkim"],
  ["12", "Arunachal Pradesh"],
  ["13", "Nagaland"],
  ["14", "Manipur"],
  ["15", "Mizoram"],
  ["16", "Tripura"],
  ["17", "Meghalaya"],
  ["18", "Assam"],
  ["19", "West Bengal"],
  ["20", "Jharkhand"],
  ["21", "Odisha"],
  ["22", "Chhattisgarh"],
  ["23", "Madhya Pradesh"],
  ["24", "Gujarat"],
  ["26", "Dadra and Nagar Haveli and Daman and Diu"],
  ["27", "Maharashtra"],
  ["29", "Karnataka"],
  ["30", "Goa"],
  ["31", "Lakshadweep"],
  ["32", "Kerala"],
  ["33", "Tamil Nadu"],
  ["34", "Puducherry"],
  ["35", "Andaman and Nicobar Islands"],
  ["36", "Telangana"],
  ["37", "Andhra Pradesh"],
  ["38", "Ladakh"],
  ["96", "Other country"],
];

export const stateName = (code: string | null | undefined) => GST_STATES.find(([c]) => c === code)?.[1] ?? "–";

/** The first two digits of a GSTIN are the state code. */
export const stateFromGstin = (gstin: string | null | undefined) =>
  gstin && /^\d{2}/.test(gstin) && GST_STATES.some(([c]) => c === gstin.slice(0, 2)) ? gstin.slice(0, 2) : null;

/** Default service code for an architecture practice: architectural services (SAC 9983). */
export const DEFAULT_SAC = "998322";

/** Splits GST by place of supply: inside the studio's state it is CGST + SGST, otherwise IGST. */
export function splitGst(gstPaise: number, studioState: string, placeOfSupply: string) {
  if (studioState === placeOfSupply) {
    const cgst = Math.round(gstPaise / 2);
    return { cgst, sgst: gstPaise - cgst, igst: 0 };
  }
  return { cgst: 0, sgst: 0, igst: gstPaise };
}

const ONES = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function belowHundred(n: number) {
  return n < 20 ? ONES[n] : `${TENS[Math.floor(n / 10)]}${n % 10 ? ` ${ONES[n % 10]}` : ""}`;
}
function belowThousand(n: number) {
  const h = Math.floor(n / 100);
  const r = n % 100;
  return [h ? `${ONES[h]} Hundred` : "", r ? belowHundred(r) : ""].filter(Boolean).join(" ");
}

/** 4012000 paise → "Rupees Forty Thousand One Hundred Twenty Only" (Indian lakh/crore grouping). */
export function rupeesInWords(paise: number) {
  const rupees = Math.floor(Math.abs(paise) / 100);
  const ps = Math.abs(paise) % 100;
  const parts: string[] = [];
  const crore = Math.floor(rupees / 1e7);
  const lakh = Math.floor((rupees % 1e7) / 1e5);
  const thousand = Math.floor((rupees % 1e5) / 1e3);
  const rest = rupees % 1000;
  if (crore) parts.push(`${belowThousand(crore)} Crore`);
  if (lakh) parts.push(`${belowHundred(lakh)} Lakh`);
  if (thousand) parts.push(`${belowHundred(thousand)} Thousand`);
  if (rest) parts.push(belowThousand(rest));
  const words = parts.length ? parts.join(" ") : "Zero";
  return `Rupees ${words}${ps ? ` and ${belowHundred(ps)} Paise` : ""} Only`;
}

/** Indian financial year for a date: "2026-27" for 12 Nov 2026. */
export function financialYear(isoDate: string) {
  const y = Number(isoDate.slice(0, 4));
  const start = Number(isoDate.slice(5, 7)) >= 4 ? y : y - 1;
  return `${start}-${String(start + 1).slice(2)}`;
}
