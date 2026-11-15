import "server-only";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { getDb, schema as s } from "@/db";
import type { ModelView } from "@/db/schema";
import { getTours, type TourData } from "./studio";

export type VisualModel = { id: string; title: string; fileId: string; coverFileId: string | null; view: ModelView };
export type VisualRender = { id: string; title: string; fileId: string };
export type DrawingVisuals = { models: VisualModel[]; tours: TourData[]; renders: VisualRender[] };

export const NO_VISUALS: DrawingVisuals = { models: [], tours: [], renders: [] };

/**
 * The 3D models, 360° tours and render images that go with each drawing.
 * Models and tours in the recycle bin are left out, and tours without a room.
 */
export async function drawingVisuals(drawingIds: string[]): Promise<Map<string, DrawingVisuals>> {
  const out = new Map<string, DrawingVisuals>(drawingIds.map((id) => [id, { models: [], tours: [], renders: [] }]));
  if (!drawingIds.length) return out;
  const db = await getDb();
  const [models, tourLinks, renders] = await Promise.all([
    db
      .select({
        drawingId: s.drawingModels.drawingId,
        id: s.models3d.id,
        title: s.models3d.title,
        fileId: s.models3d.fileId,
        coverFileId: s.models3d.coverFileId,
        view: s.models3d.view,
      })
      .from(s.drawingModels)
      .innerJoin(s.models3d, eq(s.models3d.id, s.drawingModels.modelId))
      .where(and(inArray(s.drawingModels.drawingId, drawingIds), isNull(s.models3d.deletedAt)))
      .orderBy(asc(s.drawingModels.createdAt)),
    db
      .select({ drawingId: s.drawingTours.drawingId, tourId: s.drawingTours.tourId })
      .from(s.drawingTours)
      .innerJoin(s.tours, eq(s.tours.id, s.drawingTours.tourId))
      .where(and(inArray(s.drawingTours.drawingId, drawingIds), isNull(s.tours.deletedAt)))
      .orderBy(asc(s.drawingTours.createdAt)),
    db
      .select({ drawingId: s.drawingRenders.drawingId, id: s.drawingRenders.id, title: s.drawingRenders.title, fileId: s.drawingRenders.fileId })
      .from(s.drawingRenders)
      .where(inArray(s.drawingRenders.drawingId, drawingIds))
      .orderBy(asc(s.drawingRenders.position), asc(s.drawingRenders.createdAt)),
  ]);
  const tours = await getTours([...new Set(tourLinks.map((t) => t.tourId))]);
  for (const { drawingId, ...m } of models) out.get(drawingId)?.models.push(m);
  for (const link of tourLinks) {
    const tour = tours.find((t) => t.id === link.tourId);
    if (tour && tour.scenes.length) out.get(link.drawingId)?.tours.push(tour);
  }
  for (const { drawingId, ...r } of renders) out.get(drawingId)?.renders.push(r);
  return out;
}

/** Every file a drawing's visuals need: model files and covers, tour photos and renders. */
export function visualFileIds(v: DrawingVisuals): string[] {
  return [
    ...v.models.flatMap((m) => [m.fileId, ...(m.coverFileId ? [m.coverFileId] : [])]),
    ...v.tours.flatMap((t) => t.scenes.map((sc) => sc.fileId)),
    ...v.renders.map((r) => r.fileId),
  ];
}
