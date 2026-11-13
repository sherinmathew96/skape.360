/**
 * Money is handled in whole paise (integers) so totals add up exactly.
 * The database stores decimals as strings ("1250.50"); these helpers convert.
 */

const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const qtyFmt = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 3 });

export const toPaise = (value: string | number) => Math.round(Number(value) * 100);
export const formatINR = (paise: number) => inr.format(paise / 100);
const inrWhole = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
/** For headline figures: drops the paise when there are none (₹25,000 rather than ₹25,000.00). */
export const formatINRShort = (paise: number) => (paise % 100 === 0 ? inrWhole.format(paise / 100) : inr.format(paise / 100));
export const formatQty = (value: string | number) => qtyFmt.format(Number(value));

export type PricedLine = { quantity: string | number; rate: string | number; gstRate: string | number };

/** Each line rounded to the paisa, then summed, so the printed lines add up to the printed total. */
export function lineAmounts(line: PricedLine) {
  const amount = Math.round(Number(line.quantity) * Number(line.rate) * 100);
  const gst = Math.round((amount * Number(line.gstRate)) / 100);
  return { amount, gst, total: amount + gst };
}

export function orderTotals(lines: PricedLine[]) {
  return lines.reduce(
    (t, line) => {
      const a = lineAmounts(line);
      return { amount: t.amount + a.amount, gst: t.gst + a.gst, total: t.total + a.total };
    },
    { amount: 0, gst: 0, total: 0 },
  );
}

/** Common units on Indian sites; any unit can be typed. */
export const UNITS = ["bags", "nos", "kg", "tonnes", "cft", "cum", "sqft", "sqm", "rft", "m", "litres", "loads", "boxes", "sets"];
