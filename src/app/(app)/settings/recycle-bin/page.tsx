import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Box, Building2, ClipboardList, FileText, FolderKanban, Orbit, RotateCcw } from "lucide-react";
import { purgeNow, restoreItem } from "@/app/trash-actions";
import { ConfirmButton } from "@/components/confirm-button";
import { SettingsHeader } from "@/components/settings-header";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { daysLeft, listTrash, purgeExpired, TRASH_LABEL, type TrashType } from "@/lib/trash";

export const metadata: Metadata = { title: "Recycle bin" };

const ICON: Record<TrashType, typeof Box> = {
  project: FolderKanban,
  drawing: FileText,
  model: Box,
  tour: Orbit,
  report: ClipboardList,
  firm: Building2,
};

const dateFmt = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });

/** Deleted items, with restore and remove-for-good, and the days left for each. */
export default async function RecycleBinPage() {
  const user = await requireUser();
  if (!can(user, "staff.manage") && !can(user, "projects.edit")) redirect("/settings");
  // The nightly job does this too; doing it here keeps the list honest if it hasn't run.
  const { days } = await purgeExpired();
  const items = await listTrash();

  return (
    <div className="mx-auto max-w-[1136px]">
      <SettingsHeader user={user} subtitle={`Deleted items stay here for ${days} days, then they and their files are removed for good.`} />

      <section className="card overflow-hidden" aria-labelledby="bin-title">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 px-6 pb-3 pt-6">
          <h2 id="bin-title" className="card-title">Recycle bin</h2>
          <p className="num text-sm text-muted">{items.length ? `${items.length} ${items.length === 1 ? "item" : "items"}` : ""}</p>
        </div>
        {items.length === 0 ? (
          <p className="empty mx-6 mb-6">The bin is empty. Deleted projects, drawings, 3D models, 360° tours, site reports and firms appear here.</p>
        ) : (
          <ul>
            {items.map((item) => {
              const Icon = ICON[item.type];
              const left = daysLeft(item.deletedAt, days);
              return (
                <li key={`${item.type}-${item.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-3 border-t border-rule px-6 py-4">
                  <span className="flex h-11 w-11 flex-none items-center justify-center rounded-full bg-raised text-muted" aria-hidden="true">
                    <Icon size={20} strokeWidth={1.6} />
                  </span>
                  <span className="min-w-0 flex-1 basis-52">
                    <span className="block truncate font-medium">{item.title}</span>
                    <span className="block truncate text-xs leading-5 text-muted">
                      {[TRASH_LABEL[item.type], item.projectName, `deleted ${dateFmt.format(item.deletedAt)}${item.deletedByName ? ` by ${item.deletedByName}` : ""}`]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </span>
                  <span className={`pill ${left <= 7 ? "pill-warning" : ""}`}>{left === 0 ? "Goes tonight" : `${left} ${left === 1 ? "day" : "days"} left`}</span>
                  <span className="flex flex-none items-center gap-2">
                    <form action={restoreItem}>
                      <input type="hidden" name="type" value={item.type} />
                      <input type="hidden" name="id" value={item.id} />
                      <button type="submit" className="btn btn-secondary h-10">
                        <RotateCcw size={16} strokeWidth={1.6} aria-hidden="true" /> Restore
                      </button>
                    </form>
                    <form action={purgeNow}>
                      <input type="hidden" name="type" value={item.type} />
                      <input type="hidden" name="id" value={item.id} />
                      <ConfirmButton message={`Delete “${item.title}” for good? ${item.type === "project" ? "Everything in the project and all its files go too. " : ""}This can't be undone.`}>
                        Delete for good
                      </ConfirmButton>
                    </form>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
