import type { Metadata } from "next";
import { EmbedView } from "@/components/embed-view";

type Props = { params: Promise<{ token: string; type: string; itemId: string }> };

export const metadata: Metadata = { title: { absolute: "Studio Skape" }, robots: { index: false, follow: false } };

/** The original, long embed address. New embed codes use /e/<code>. */
export default async function EmbedPage({ params }: Props) {
  const { token, type, itemId } = await params;
  return <EmbedView token={token} type={type} itemId={itemId} />;
}
