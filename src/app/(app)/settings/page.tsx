import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, Building2, Gauge, IdCard, ShieldCheck, Trash2, Users } from "lucide-react";
import { saveTrashDays } from "@/app/trash-actions";
import { ActionForm } from "@/components/action-form";
import { SettingsHeader } from "@/components/settings-header";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { trashDays } from "@/lib/trash";

export const metadata: Metadata = { title: "Settings" };

const SECTIONS = [
  { href: "/settings/studio", label: "Studio profile", help: "Name, address, GSTIN, bank details and terms on invoices and orders.", icon: IdCard },
  { href: "/team", label: "People", help: "Staff accounts, who can sign in, and their roles.", icon: Users },
  { href: "/team/roles", label: "Roles", help: "Make roles and choose what each can open.", icon: ShieldCheck },
  { href: "/firms", label: "Firms", help: "Contractors and PMCs, each with a page of their projects.", icon: Building2 },
  { href: "/settings/recycle-bin", label: "Recycle bin", help: "Restore deleted projects, drawings, models, tours and reports.", icon: Trash2 },
  { href: "/settings/usage", label: "Usage", help: "How much the database and file storage hold.", icon: Gauge },
];

/** App settings, and the way to every other section of Settings. */
export default async function SettingsPage() {
  const user = await requireUser();
  // Only admins have app settings; everyone else starts on People.
  if (!can(user, "staff.manage")) redirect("/team");
  const days = await trashDays();

  return (
    <div className="mx-auto max-w-[1136px]">
      <SettingsHeader user={user} subtitle="How the app works for the whole studio." />

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <section className="card p-6" aria-labelledby="bin-title">
          <h2 id="bin-title" className="card-title mb-1">Recycle bin</h2>
          <p className="mb-5 text-muted">Deleted items wait here, so they can be restored. After this many days they and their files are removed for good, every night.</p>
          <ActionForm action={saveTrashDays} submitLabel="Save" pendingLabel="Saving…" className="space-y-4">
            <div>
              <label htmlFor="trashDays" className="field-label">Keep deleted items for</label>
              <div className="flex items-center gap-3">
                <input id="trashDays" name="trashDays" type="number" inputMode="numeric" min={7} max={3650} required defaultValue={days} aria-describedby="trash-help" className="field num w-32" />
                <span className="text-muted">days</span>
              </div>
              <p id="trash-help" className="mt-2 text-xs text-muted">Between 7 days and 10 years. 90 is a good default.</p>
            </div>
          </ActionForm>
        </section>

        <section aria-labelledby="sections-title">
          <h2 id="sections-title" className="sr-only">Sections</h2>
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {SECTIONS.map((s) => (
              <li key={s.href}>
                <Link href={s.href} className="card group flex h-full items-start gap-4 p-5 transition-colors hover:bg-[#fbfbff]">
                  <span className="flex h-11 w-11 flex-none items-center justify-center rounded-full bg-active text-primary" aria-hidden="true">
                    <s.icon size={20} strokeWidth={1.6} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-2 font-medium">
                      {s.label}
                      <ArrowRight size={16} strokeWidth={1.6} aria-hidden="true" className="text-muted transition-transform group-hover:translate-x-0.5" />
                    </span>
                    <span className="mt-1 block text-xs leading-5 text-muted">{s.help}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
