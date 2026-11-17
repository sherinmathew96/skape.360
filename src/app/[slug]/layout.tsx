import type { Metadata } from "next";
import { LiveRefresh } from "@/components/live-refresh";

// Link previews of client pages show their own title only, not the app's tagline.
export const metadata: Metadata = { description: null };

/** Client pages (portal, shared drawings, firm page) refresh live when the studio changes something. */
export default function SlugLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <LiveRefresh />
    </>
  );
}
