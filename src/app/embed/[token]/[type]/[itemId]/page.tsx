import type { Metadata } from "next";
import { ModelViewer } from "@/components/model-viewer";
import { TourViewer } from "@/components/tour-viewer";
import { loadShare, loadSharedItems, logShareView } from "@/lib/share";

type Props = { params: Promise<{ token: string; type: string; itemId: string }> };

export const metadata: Metadata = { title: { absolute: "Studio Skape" }, robots: { index: false, follow: false } };

function Message({ text }: { text: string }) {
  return (
    <main className="flex h-dvh items-center justify-center bg-ground p-6 text-center text-muted">
      <p>{text}</p>
    </main>
  );
}

/**
 * The bare viewer for an <iframe> on another website. Only links without a
 * passcode can be embedded, since the passcode cookie does not reach iframes.
 */
export default async function EmbedPage({ params }: Props) {
  const { token, type, itemId } = await params;
  const { state, link } = await loadShare(token);
  if (state === "locked") return <Message text="This view needs a passcode. Open it on Studio Skape's site." />;
  if (state !== "ok" || !link) return <Message text="This view is no longer available." />;

  const { models, tours } = await loadSharedItems(link.id);
  const fileBase = `/s/${token}/f/`;
  const model = type === "model" ? models.find((m) => m.id === itemId) : undefined;
  const tour = type === "tour" ? tours.find((t) => t.id === itemId) : undefined;
  if (!model && !tour) return <Message text="This view is no longer available." />;
  await logShareView(link.id, "embed");

  return (
    <main className="relative h-dvh w-full overflow-hidden">
      <h1 className="sr-only">{model?.title ?? tour?.title}</h1>
      {model ? <ModelViewer src={`${fileBase}${model.fileId}`} title={model.title} className="h-full w-full" /> : null}
      {tour ? <TourViewer tour={tour} fileBase={fileBase} className="h-full w-full" /> : null}
      <p className="pointer-events-none absolute left-3 top-3 rounded bg-black/55 px-2 py-1 text-xs text-white">Studio Skape</p>
    </main>
  );
}
