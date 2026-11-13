import type { SessionUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { SettingsTabs, type SettingsTab } from "./settings-tabs";

/** The Settings sections this person may open. */
export function settingsTabs(user: SessionUser): SettingsTab[] {
  const admin = can(user, "staff.manage");
  return [
    ...(admin ? [{ href: "/settings", label: "General" }] : []),
    ...(admin ? [{ href: "/settings/studio", label: "Studio profile" }] : []),
    { href: "/team", label: "People" },
    ...(admin ? [{ href: "/team/roles", label: "Roles" }] : []),
    ...(can(user, "projects.create") ? [{ href: "/firms", label: "Firms" }] : []),
    ...(admin || can(user, "projects.edit") ? [{ href: "/settings/recycle-bin", label: "Recycle bin" }] : []),
    ...(admin ? [{ href: "/settings/usage", label: "Usage" }] : []),
  ];
}

/** "Settings", a line about the section, and the section tabs. */
export function SettingsHeader({ user, subtitle }: { user: SessionUser; subtitle: string }) {
  return (
    <>
      <div className="mb-5">
        <h1 className="text-[26px] font-semibold leading-8 tracking-[-0.02em]">Settings</h1>
        <p className="mt-1 text-muted">{subtitle}</p>
      </div>
      <SettingsTabs tabs={settingsTabs(user)} />
    </>
  );
}
