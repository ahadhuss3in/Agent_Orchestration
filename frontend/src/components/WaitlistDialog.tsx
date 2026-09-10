"use client";

import { useRef, useState, type FormEvent } from "react";

type Status = "idle" | "submitting" | "done" | "error";

/**
 * Replaces the GitHub link that used to sit beside the closing CTA in
 * `CtaFooter.tsx`. A native `<dialog>` rather than a hand-rolled modal: it
 * gets Escape-to-close, top-layer stacking, and reasonable focus handling
 * for free, and `::backdrop` is styled in `globals.css` rather than here.
 *
 * Posts to `/api/waitlist`, which writes the submission to Vercel Blob (see
 * that route for why, now that this is actually deployed on Vercel — a
 * local file does not reliably persist there). This component only knows
 * it's calling an API and rendering whatever comes back — success, a
 * friendly "already on the list," or an error with a retry path.
 */
export function WaitlistDialog() {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [duplicate, setDuplicate] = useState(false);

  const open = () => {
    setStatus("idle");
    setError(null);
    setDuplicate(false);
    dialogRef.current?.showModal();
  };

  const close = () => dialogRef.current?.close();

  const onBackdropClick = (e: React.MouseEvent<HTMLDialogElement>) => {
    // A click that lands on the <dialog> element itself (not its content,
    // which stopPropagation below prevents from bubbling here) is a click
    // on the backdrop.
    if (e.target === dialogRef.current) close();
  };

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const name = (form.elements.namedItem("name") as HTMLInputElement).value;
    const email = (form.elements.namedItem("email") as HTMLInputElement).value;

    setStatus("submitting");
    setError(null);

    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setStatus("error");
        setError(data?.error || "Something went wrong. Try again.");
        return;
      }
      setDuplicate(Boolean(data?.duplicate));
      setStatus("done");
    } catch {
      setStatus("error");
      setError("Could not reach the server. Check your connection and try again.");
    }
  };

  return (
    <>
      <button type="button" className="btn btn-ghost" onClick={open}>
        <span aria-hidden="true">&#8599;</span>
        Join the waitlist
      </button>

      <dialog
        ref={dialogRef}
        className="waitlist-dialog panel panel-glow bracketed"
        aria-labelledby="waitlist-heading"
        onClick={onBackdropClick}
      >
        <div className="p-6 sm:p-8" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-start justify-between gap-4">
            <h2 id="waitlist-heading" className="display-sm text-[1.4rem] text-ink">
              Get on the list.
            </h2>
            <button
              type="button"
              onClick={close}
              aria-label="Close"
              className="hud-label -m-1 rounded-sm p-1 text-ink-dim transition-colors hover:text-ink"
            >
              CLOSE
            </button>
          </div>

          {status === "done" ? (
            <div className="mt-6">
              <p className="font-mono text-[14px] leading-relaxed text-ink">
                {duplicate
                  ? "That email is already on the list. You're set."
                  : "You're on the list. We'll reach out when there's something to try."}
              </p>
              <button
                type="button"
                className="btn btn-primary mt-6"
                onClick={close}
              >
                Done
              </button>
            </div>
          ) : (
            <form onSubmit={onSubmit} className="mt-6" noValidate>
              <p className="font-mono text-[13px] leading-relaxed text-ink-dim">
                Leave your name and email. No spam, just a note when Pantheon
                opens up.
              </p>

              <div className="mt-5">
                <label
                  htmlFor="waitlist-name"
                  className="hud-label block text-ink-dim"
                >
                  Name
                </label>
                <input
                  id="waitlist-name"
                  name="name"
                  type="text"
                  autoComplete="name"
                  required
                  maxLength={200}
                  disabled={status === "submitting"}
                  className="mt-2 w-full rounded-sm border border-line bg-raised px-4 py-3 font-mono text-[14px] text-ink outline-none placeholder:text-ink-dim"
                  placeholder="Ada Lovelace"
                />
              </div>

              <div className="mt-4">
                <label
                  htmlFor="waitlist-email"
                  className="hud-label block text-ink-dim"
                >
                  Email
                </label>
                <input
                  id="waitlist-email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  maxLength={200}
                  disabled={status === "submitting"}
                  className="mt-2 w-full rounded-sm border border-line bg-raised px-4 py-3 font-mono text-[14px] text-ink outline-none placeholder:text-ink-dim"
                  placeholder="ada@example.com"
                />
              </div>

              {status === "error" && error && (
                <p
                  role="alert"
                  className="mt-4 font-mono text-[12.5px] text-[color:var(--ink-accent)]"
                >
                  {error}
                </p>
              )}

              <button
                type="submit"
                className="btn btn-primary mt-6 w-full justify-center sm:w-auto"
                disabled={status === "submitting"}
              >
                {status === "submitting" ? "Joining…" : "Join the waitlist"}
              </button>
            </form>
          )}
        </div>
      </dialog>
    </>
  );
}
