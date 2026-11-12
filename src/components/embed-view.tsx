import { ModelViewer } from "./model-viewer";
import { TourViewer } from "./tour-viewer";
import { loadShare, loadSharedItems, logShareView } from "@/lib/share";

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
export async function EmbedView({ token, type, itemId }: { token: string; type?: string; itemId?: string }) {
  const { state, link } = await loadShare(token);
  if (state === "locked") return <Message text="This view needs a passcode. Open it on Studio Skape's site." />;
  if (state !== "ok" || !link) return <Message text="This view is no longer available." />;

  const { models, tours, order } = await loadSharedItems(link.id);
  // A short /e/ link shows its first model or tour.
  const first = order.find((i) => i.itemType === "model" || i.itemType === "tour");
  const kind = type ?? first?.itemType;
  const id = itemId ?? first?.itemId;
  const fileBase = `/s/${token}/f/`;
  const model = kind === "model" ? models.find((m) => m.id === id) : undefined;
  const tour = kind === "tour" ? tours.find((t) => t.id === id) : undefined;
  if (!model && !tour) return <Message text="This view is no longer available." />;
  await logShareView(link.id, "embed");

  return (
    <main className="relative h-dvh w-full overflow-hidden">
      <h1 className="sr-only">{model?.title ?? tour?.title}</h1>
      {model ? (
        <ModelViewer
          src={`${fileBase}${model.fileId}`}
          title={model.title}
          poster={model.coverFileId ? `${fileBase}${model.coverFileId}` : null}
          view={model.view}
          className="h-full w-full"
        />
      ) : null}
      {tour ? <TourViewer tour={tour} fileBase={fileBase} className="h-full w-full" /> : null}
      {tour ? <p className="pointer-events-none absolute left-3 top-3 rounded bg-black/55 px-2 py-1 text-xs text-white">Studio Skape</p> : null}
    </main>
  );
}
