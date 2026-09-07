import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { put, BlobError } from "@vercel/blob";

/**
 * Waitlist signup — replaces the GitHub link that used to sit in the footer
 * CTA. This project is hosted on Vercel, which rules out the local-CSV-file
 * version this route started as: Vercel functions get an ephemeral,
 * isolated filesystem per invocation, so a write there might not persist
 * past that one request, definitely won't survive a redeploy, and won't be
 * visible to a different instance handling the next signup. Storage moved
 * to Vercel Blob instead, which is a real, shared, persistent store that
 * actually works from a serverless function.
 *
 * One blob per signup, not one shared mutable file. That is deliberate: a
 * single growing CSV blob would need every request to read the whole file,
 * append a row, and write it back, and two signups landing in the same
 * moment across two separate serverless instances could race and silently
 * drop one of them — there is no shared process-level lock the way there
 * was for the local file. Giving every submission its own blob, at a
 * pathname derived from the email, sidesteps that entirely: two different
 * emails write to two different keys with no shared state to corrupt, and
 * the SAME email racing itself just means both writes target one key, where
 * `allowOverwrite: false` makes the second one fail loudly instead of
 * silently overwriting — which this route reads as "already on the list"
 * rather than a real error.
 *
 * The email is hashed into the pathname rather than used directly so the
 * blob's own URL (which Vercel Blob's `list()`/`get()` surface, and which
 * can end up in logs) does not itself contain someone's email address in
 * plain text. Every blob is written with `access: 'private'`, so the
 * content additionally requires the store's own token to read at all — a
 * bare blob URL is not enough by itself, unlike `access: 'public'`.
 */

function pathnameFor(email: string): string {
  const hash = createHash("sha256").update(email).digest("hex");
  return `waitlist/${hash}.json`;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_LEN = 200;

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const { name, email } = (body ?? {}) as { name?: unknown; email?: unknown };

  if (typeof name !== "string" || typeof email !== "string") {
    return NextResponse.json({ error: "Name and email are required." }, { status: 400 });
  }

  const trimmedName = name.trim();
  const normalizedEmail = email.trim().toLowerCase();

  if (!trimmedName || trimmedName.length > MAX_LEN) {
    return NextResponse.json({ error: "Enter a name." }, { status: 400 });
  }
  if (!EMAIL_RE.test(normalizedEmail) || normalizedEmail.length > MAX_LEN) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  }

  const record = {
    name: trimmedName,
    email: normalizedEmail,
    timestamp: new Date().toISOString(),
  };

  try {
    await put(pathnameFor(normalizedEmail), JSON.stringify(record), {
      access: "private",
      contentType: "application/json",
      allowOverwrite: false,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof BlobError && err.message.includes("already exists")) {
      return NextResponse.json({ ok: true, duplicate: true });
    }
    return NextResponse.json(
      { error: "Could not save that right now. Try again in a moment." },
      { status: 500 },
    );
  }
}
