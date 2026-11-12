import { count, eq } from "drizzle-orm";
import { hashPassword } from "../lib/password";
import { addDays, today } from "../lib/dates";
import { STAGE_TEMPLATES } from "../lib/stages";
import type { Db } from "./index";
import * as s from "./schema";

/**
 * Creates the first admin account, and with `demo` a small set of sample
 * staff, clients, projects and tasks so every screen has something to show.
 *
 * SAMPLE DATA: everything below the admin account is invented. Clear it with
 * `npm run db:reset` (local) before entering real projects.
 */
export async function seed(db: Db, opts: { demo: boolean }) {
  const [{ n }] = await db.select({ n: count() }).from(s.users);
  if (n > 0) return;

  const adminEmail = (process.env.SEED_ADMIN_EMAIL || "admin@studioskape.test").toLowerCase();
  const adminPassword = process.env.SEED_ADMIN_PASSWORD;
  if (!adminPassword) {
    throw new Error("Set SEED_ADMIN_PASSWORD in .env.local before the first start.");
  }

  const [admin] = await db
    .insert(s.users)
    .values({
      email: adminEmail,
      name: process.env.SEED_ADMIN_NAME || "Studio Admin",
      role: "admin",
      title: "Principal",
      passwordHash: await hashPassword(adminPassword),
    })
    .returning();

  if (!opts.demo) return;

  // Sample staff share the admin's password so each role can be tried locally.
  const staffHash = await hashPassword(adminPassword);
  const staff = await db
    .insert(s.users)
    .values([
      { email: "meera@studioskape.test", name: "Meera Krishnan", role: "project_manager", title: "Project manager", passwordHash: staffHash },
      { email: "arjun@studioskape.test", name: "Arjun Varma", role: "architect", title: "Senior architect", passwordHash: staffHash },
      { email: "nisha@studioskape.test", name: "Nisha Thomas", role: "architect", title: "Junior architect", passwordHash: staffHash },
      { email: "rahul@studioskape.test", name: "Rahul Menon", role: "site_engineer", title: "Site engineer", passwordHash: staffHash },
      { email: "fathima@studioskape.test", name: "Fathima Rasheed", role: "accountant", title: "Accounts", passwordHash: staffHash },
    ])
    .returning();
  const [meera, arjun, nisha, rahul] = staff;

  const clients = await db
    .insert(s.clients)
    .values([
      { name: "Anand Kadavil", phone: "+91 98470 11204" },
      { name: "Marari Shores LLP", phone: "+91 484 400 2190" },
      { name: "Dr Leena Joseph", phone: "+91 94470 55318" },
      { name: "Suresh and Divya Nair", phone: "+91 98950 77641" },
    ])
    .returning();

  const t = today();
  const year = t.slice(0, 4);

  type Seed = {
    code: string;
    name: string;
    client: number;
    type: s.ProjectType;
    location: string;
    lead: s.User;
    members: s.User[];
    start: number;
    due: number;
    /** stages approved, then one in progress */
    approved: number;
    milestones: [string, number, boolean][];
    tasks: [string, s.User, number | null, s.TaskStatus][];
  };

  const plan: Seed[] = [
    {
      code: `SS-${year}-001`,
      name: "Kadavil Residence",
      client: 0,
      type: "design_build",
      location: "Kakkanad, Kochi",
      lead: meera,
      members: [meera, arjun, rahul],
      start: -210,
      due: 150,
      approved: 5,
      milestones: [
        ["Foundation complete", -20, true],
        ["Ground floor slab cast", 9, false],
        ["First floor slab cast", 48, false],
      ],
      tasks: [
        ["Issue revised staircase detail to site", arjun, -3, "in_progress"],
        ["Check ground floor slab reinforcement", rahul, 2, "todo"],
        ["Confirm window schedule with client", meera, 5, "todo"],
        ["Order plumbing sleeves for slab", rahul, 1, "todo"],
        ["Update structural drawings to R2", arjun, -14, "done"],
      ],
    },
    {
      code: `SS-${year}-002`,
      name: "Marari Beach Villas",
      client: 1,
      type: "design",
      location: "Mararikulam, Alappuzha",
      lead: arjun,
      members: [arjun, nisha, meera],
      start: -95,
      due: 80,
      approved: 2,
      milestones: [
        ["Client sign-off on schematic design", -30, true],
        ["Design development presentation", 12, false],
        ["Working drawings issue", 55, false],
      ],
      tasks: [
        ["Villa type B: revise roof overhang", nisha, -1, "in_progress"],
        ["Prepare material board for presentation", nisha, 6, "todo"],
        ["Coastal zone setback check", arjun, 3, "todo"],
        ["Render two exterior views", nisha, 10, "todo"],
        ["Site survey overlay", arjun, -40, "done"],
        ["Schematic plans, all villa types", nisha, -34, "done"],
      ],
    },
    {
      code: `SS-${year}-003`,
      name: "Joseph Clinic Fit-out",
      client: 2,
      type: "construction",
      location: "Thevara, Kochi",
      lead: meera,
      members: [meera, rahul],
      start: -40,
      due: 35,
      approved: 3,
      milestones: [
        ["Partitions and ceiling closed", -6, true],
        ["Flooring and joinery complete", 14, false],
        ["Handover to client", 35, false],
      ],
      tasks: [
        ["Reception counter: approve shop drawing", meera, 0, "todo"],
        ["Snag walk with electrician", rahul, 4, "todo"],
        ["Vinyl flooring delivery follow-up", rahul, -2, "todo"],
        ["Ceiling grid inspection", rahul, -8, "done"],
      ],
    },
    {
      code: `SS-${year}-004`,
      name: "Nair Apartment Interior",
      client: 3,
      type: "design",
      location: "Panampilly Nagar, Kochi",
      lead: nisha,
      members: [nisha, arjun],
      start: -12,
      due: 110,
      approved: 0,
      milestones: [
        ["Concept presentation", 8, false],
        ["Schematic layouts", 30, false],
      ],
      tasks: [
        ["Measure the apartment and draw as-built plan", nisha, -5, "done"],
        ["Two concept moodboards", nisha, 4, "in_progress"],
        ["Furniture layout options", nisha, 7, "todo"],
        ["Review concept before client meeting", arjun, 7, "todo"],
      ],
    },
  ];

  for (const p of plan) {
    const [project] = await db
      .insert(s.projects)
      .values({
        code: p.code,
        name: p.name,
        clientId: clients[p.client].id,
        type: p.type,
        location: p.location,
        startDate: addDays(t, p.start),
        dueDate: addDays(t, p.due),
        leadId: p.lead.id,
        createdBy: admin.id,
      })
      .returning();

    await db
      .insert(s.projectMembers)
      .values(p.members.map((m) => ({ projectId: project.id, userId: m.id })));

    await db.insert(s.projectStages).values(
      STAGE_TEMPLATES[p.type].map((name, i) => ({
        projectId: project.id,
        name,
        position: i,
        status: (i < p.approved ? "approved" : i === p.approved ? "in_progress" : "pending") as s.StageStatus,
        approvedAt: i < p.approved ? new Date() : null,
        approvedBy: i < p.approved ? admin.id : null,
      })),
    );

    await db.insert(s.milestones).values(
      p.milestones.map(([name, offset, done]) => ({
        projectId: project.id,
        name,
        dueDate: addDays(t, offset),
        doneAt: done ? new Date() : null,
      })),
    );

    await db.insert(s.tasks).values(
      p.tasks.map(([title, assignee, offset, status]) => ({
        projectId: project.id,
        title,
        assigneeId: assignee.id,
        status,
        dueDate: offset === null ? null : addDays(t, offset),
        createdBy: p.lead.id,
        completedAt: status === "done" ? new Date() : null,
      })),
    );
  }

  // Give the admin some work of their own so "My tasks" is not empty.
  const [first] = await db.select().from(s.projects).where(eq(s.projects.code, `SS-${year}-002`));
  await db.insert(s.tasks).values([
    { projectId: first.id, title: "Approve design development fee stage", assigneeId: admin.id, status: "todo", dueDate: addDays(t, 2), createdBy: admin.id },
    { projectId: first.id, title: "Call client about presentation date", assigneeId: admin.id, status: "todo", dueDate: addDays(t, -1), createdBy: admin.id },
  ]);
}
