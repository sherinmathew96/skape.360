import { ImageResponse } from "next/og";
import { loadFirm } from "@/lib/firms";
import { loadPortal } from "@/lib/portal";
import { findShared, projectName } from "@/lib/share-slugs";

/**
 * The picture in WhatsApp and other link previews: the drawing (or group) name
 * large, the project under it, and the Studio Skape mark at the foot.
 */
export const alt = "Studio Skape";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

async function names(slug: string): Promise<{ title: string; sub: string | null }> {
  const { portal } = await loadPortal(slug);
  if (portal) return { title: portal.projectName, sub: portal.location?.trim() || null };
  const { firm } = await loadFirm(slug);
  if (firm) return { title: firm.name, sub: "Projects with Studio Skape" };
  const shared = await findShared(slug);
  if (shared) return { title: shared.name, sub: await projectName(shared.projectId) };
  return { title: "Studio Skape", sub: null };
}

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { title, sub } = await names(slug.toLowerCase()).catch(() => ({ title: "Studio Skape", sub: null }));
  // Long names step down so they still fit on two or three lines.
  const fontSize = title.length > 60 ? 60 : title.length > 36 ? 72 : 88;
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", background: "#1b1b1b", color: "#ffffff", padding: "72px 80px" }}>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize, lineHeight: 1.08, letterSpacing: "-0.03em", maxHeight: fontSize * 1.08 * 3, overflow: "hidden" }}>{title}</div>
          {sub ? <div style={{ marginTop: 28, fontSize: 40, color: "#b9bccb", lineHeight: 1.2 }}>{sub}</div> : null}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
          <svg width="64" height="64" viewBox="0 0 1932 1932">
            <rect width="1932" height="1932" rx="180" fill="#ffffff" />
            <g fill="#1b1b1b">
              <path d="M318 307h413a12 12 0 0 1 12 12v846l-6 17L307 752V319a12 12 0 0 1 11-12z" />
              <path d="M1200 307h413a11 11 0 0 1 11 11v418a12 12 0 0 1-8 11L762 1182l-14-17 442-847a12 12 0 0 1 10-11z" />
              <path d="M318 1185h1295a11 11 0 0 1 11 11v418a11 11 0 0 1-11 11H978l-233-233v233H318a11 11 0 0 1-11-11v-418a11 11 0 0 1 11-11z" />
            </g>
          </svg>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ fontSize: 30 }}>Studio Skape</div>
            <div style={{ fontSize: 24, color: "#8f93a6" }}>360.studioskape.in</div>
          </div>
        </div>
      </div>
    ),
    size,
  );
}
