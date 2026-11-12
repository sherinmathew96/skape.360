import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-[760px]">
      <h1 className="text-2xl font-bold leading-8 tracking-[-0.01em]">Not found</h1>
      <p className="mb-6 mt-1 text-muted">
        That page does not exist, or it belongs to a project you are not on.
      </p>
      <Link href="/projects" className="btn btn-secondary">Back to projects</Link>
    </div>
  );
}
