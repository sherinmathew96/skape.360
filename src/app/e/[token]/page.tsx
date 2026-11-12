import type { Metadata } from "next";
import { EmbedView } from "@/components/embed-view";

export const metadata: Metadata = { title: { absolute: "Studio Skape" }, robots: { index: false, follow: false } };

/** Short embed address: 360.studioskape.in/e/<code> shows the link's model or tour. */
export default async function ShortEmbedPage({ params }: { params: Promise<{ token: string }> }) {
  return <EmbedView token={(await params).token} />;
}
