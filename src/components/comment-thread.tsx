"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { Send } from "lucide-react";
import { replyToClient } from "@/app/comment-actions";
import { portalComments, postPortalComment, type ClientComment } from "@/app/portal-talk-actions";
import { saveClientName, useClientName } from "./use-client-name";

export type ThreadItem = { kind: "drawing" | "model" | "render"; id: string };

const when = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });

function Messages({ comments, mine }: { comments: ClientComment[]; mine: "client" | "studio" }) {
  const end = useRef<HTMLLIElement>(null);
  // Braces matter: newer browsers return a Promise from scrollIntoView, which React would take for a cleanup.
  useEffect(() => {
    end.current?.scrollIntoView({ block: "nearest" });
  }, [comments.length]);
  if (!comments.length) return <p className="py-6 text-center text-sm text-muted">No comments yet.</p>;
  return (
    <ol className="space-y-3">
      {comments.map((c) => {
        const own = c.author === mine;
        return (
          <li key={c.id} className={`flex flex-col ${own ? "items-end" : "items-start"}`}>
            <div className={`max-w-[88%] rounded-2xl px-3.5 py-2.5 text-sm ${own ? "rounded-br-md bg-primary text-white" : "rounded-bl-md bg-raised"}`}>
              <p className="whitespace-pre-line break-words">{c.body}</p>
            </div>
            <p className="mt-1 px-1 text-[11px] text-muted">
              {c.author === "studio" ? `${c.authorName} · Studio Skape` : c.authorName} · {when.format(new Date(c.createdAt))}
            </p>
          </li>
        );
      })}
      <li ref={end} aria-hidden="true" />
    </ol>
  );
}

/** The client's thread on a drawing, model or render: read, and write with their name (remembered on this device). */
export function ClientThread({ slug, item }: { slug: string; item: ThreadItem }) {
  const [comments, setComments] = useState<ClientComment[] | null>(null);
  const saved = useClientName();
  const [draft, setDraft] = useState("");
  const [editing, setEditing] = useState(false);
  const askName = editing || !saved;
  const name = askName ? draft : saved;
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    let alive = true;
    portalComments(slug, item).then((res) => {
      if (!alive) return;
      if ("error" in res) setError(res.error);
      else setComments(res.data ?? []);
    });
    return () => {
      alive = false;
    };
  }, [slug, item.kind, item.id]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">{comments ? <Messages comments={comments} mine="client" /> : <p className="py-6 text-center text-sm text-muted">{error ?? "Loading…"}</p>}</div>
      <form
        className="space-y-2 border-t border-rule p-3"
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          start(async () => {
            const res = await postPortalComment(slug, item, name, body);
            if ("error" in res) return setError(res.error);
            saveClientName(name);
            setEditing(false);
            setBody("");
            setComments(res.data ?? []);
          });
        }}
      >
        {askName ? (
          <div>
            <label htmlFor={`name-${item.id}`} className="field-label">Your name</label>
            <input id={`name-${item.id}`} value={draft} onChange={(e) => setDraft(e.target.value)} required minLength={2} maxLength={60} autoComplete="name" className="field" placeholder="So the studio knows who wrote" />
          </div>
        ) : (
          <p className="text-xs text-muted">
            Commenting as <span className="font-medium text-text">{name}</span>{" "}
            <button
              type="button"
              onClick={() => {
                setDraft(saved);
                setEditing(true);
              }}
              className="text-primary hover:underline"
            >
              Change
            </button>
          </p>
        )}
        <div className="flex items-end gap-2">
          <label htmlFor={`body-${item.id}`} className="sr-only">Comment</label>
          <textarea
            id={`body-${item.id}`}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={2}
            maxLength={2000}
            required
            placeholder="Write a comment…"
            className="field h-auto min-h-11 flex-1 resize-none py-2"
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) e.currentTarget.form?.requestSubmit();
            }}
          />
          <button type="submit" disabled={pending || !body.trim()} className="btn btn-primary h-11 w-11 flex-none p-0" aria-label="Send comment">
            <Send size={18} strokeWidth={1.8} aria-hidden="true" />
          </button>
        </div>
        {error ? <p role="alert" className="text-sm text-negative">{error}</p> : null}
      </form>
    </div>
  );
}

/** The studio's view of a client thread, with a reply box. */
export function StudioThread({ projectId, item, comments, canReply }: { projectId: string; item: ThreadItem; comments: ClientComment[]; canReply: boolean }) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="space-y-3">
      <div className="max-h-[420px] overflow-y-auto pr-1">
        <Messages comments={comments} mine="studio" />
      </div>
      {canReply ? (
        <form
          className="flex items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            start(async () => {
              const res = await replyToClient({ projectId, kind: item.kind, itemId: item.id, body });
              if ("error" in res) return setError(res.error);
              setBody("");
              router.refresh();
            });
          }}
        >
          <label htmlFor={`reply-${item.id}`} className="sr-only">Reply to the client</label>
          <textarea id={`reply-${item.id}`} value={body} onChange={(e) => setBody(e.target.value)} rows={2} maxLength={2000} required placeholder="Reply to the client…" className="field h-auto min-h-11 flex-1 resize-none py-2" />
          <button type="submit" disabled={pending || !body.trim()} className="btn btn-primary h-11 flex-none px-4">
            {pending ? "Sending…" : "Reply"}
          </button>
        </form>
      ) : null}
      {error ? <p role="alert" className="text-sm text-negative">{error}</p> : null}
    </div>
  );
}
