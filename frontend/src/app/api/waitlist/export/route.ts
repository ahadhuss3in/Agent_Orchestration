import { NextResponse } from "next/server";
import { list, get } from "@vercel/blob";

/**
 * Turns the individual per-signup blobs `POST /api/waitlist` writes back
 * into the single downloadable spreadsheet the client actually asked for.
 * There is no persistent CSV file to hand over on Vercel (see that route's
 * own comment for why), so this assembles one on demand instead: list every
 * blob under `waitlist/`, read each one back, and stream out a `.csv`.
 *
 * Gated on a shared secret rather than left open, because every record here
 * is a real name and email address. Set `WAITLIST_EXPORT_SECRET` in this
 * project's environment (locally in `.env.local`, and again in the Vercel
 * project's own Environment Variables settings for production — these are
 * two separate places, setting it in one does not set it in the other),
 * then visit `/api/waitlist/export?secret=<that value>` to download.
 */

type Record = { name: string; email: string; timestamp: string };

function csvField(raw: string): string {
  let v = raw.replace(/[\r\n]+/g, " ").trim();
  if (/^[=+\-@]/.test(v)) v = `'${v}`;
  return `"${v.replace(/"/g, '""')}"`;
}

export async function GET(request: Request) {
  const secret = process.env.WAITLIST_EXPORT_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "WAITLIST_EXPORT_SECRET is not set on the server." },
      { status: 500 },
    );
  }

  const { searchParams } = new URL(request.url);
  const provided =
    searchParams.get("secret") ?? request.headers.get("x-export-secret");
  if (provided !== secret) {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }

  const records: Record[] = [];
  let cursor: string | undefined;
  do {
    const page = await list({ prefix: "waitlist/", cursor, limit: 1000 });
    for (const blobMeta of page.blobs) {
      const blob = await get(blobMeta.pathname, { access: "private" });
      // `stream` is a web ReadableStream, not a Node async-iterable — no
      // `for await` here despite that working at the Node REPL, where the
      // runtime's experimental support papers over what the DOM lib types
      // for ReadableStream don't actually declare. `getReader()` is the one
      // consumption path both the type and the runtime agree on. `stream`
      // is only ever `null` on a 304 (cache-validation) response, which
      // nothing here triggers, but the type still allows it.
      if (!blob?.stream) continue;
      const chunks: Uint8Array[] = [];
      const reader = blob.stream.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) chunks.push(value);
      }
      try {
        records.push(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch {
        // Skip anything that isn't the JSON shape this route itself writes.
      }
    }
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);

  records.sort((a, b) => a.timestamp.localeCompare(b.timestamp));

  const lines = [
    "timestamp,email,name",
    ...records.map((r) => `${r.timestamp},${r.email},${csvField(r.name)}`),
  ];

  return new NextResponse(lines.join("\n") + "\n", {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="waitlist.csv"`,
    },
  });
}
