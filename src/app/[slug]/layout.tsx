import { LiveRefresh } from "@/components/live-refresh";

/** Client pages (portal, shared drawings, firm page) refresh live when the studio changes something. */
export default function SlugLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <LiveRefresh />
    </>
  );
}
