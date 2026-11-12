/**
 * Money is handled in whole paise (integers) so totals add up exactly.
 * The database stores decimals as strings ("1250.50"); these helpers convert.
 */

const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const qtyFmt = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 3 });

export const toPaise = (value: string | number) => Math.round(Number(value) * 100);
export const formatINR = (paise: number) => inr.format(paise / 100);
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
