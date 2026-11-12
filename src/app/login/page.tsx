import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { login } from "@/app/actions";
import { ActionForm } from "@/components/action-form";
import { Mark } from "@/components/mark";
import { PasswordField } from "@/components/password-field";
import { getUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage() {
  if (await getUser()) redirect("/");

  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-[360px]">
        <div className="mb-8 flex items-center gap-3">
          <Mark size={36} />
          <div>
            <p className="text-base font-medium leading-5">SKAPE360</p>
            <p className="text-muted">Studio Skape</p>
          </div>
        </div>

        <div className="card p-6">
          <h1 className="mb-1 text-2xl font-bold leading-8 tracking-[-0.01em]">Sign in</h1>
          <p className="mb-6 text-muted">Use the account your admin set up for you.</p>

          <ActionForm action={login} submitLabel="Sign in" pendingLabel="Signing in…" className="space-y-4">
            <div>
              <label htmlFor="email" className="field-label">Email</label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="username"
                spellCheck={false}
                required
                className="field"
              />
            </div>
            <div>
              <label htmlFor="password" className="field-label">Password</label>
              <PasswordField id="password" name="password" autoComplete="current-password" />
            </div>
          </ActionForm>
        </div>

        <p className="mt-4 text-xs text-muted">
          Forgot your password? Ask a studio admin to reset it.
        </p>
      </div>
    </main>
  );
}
