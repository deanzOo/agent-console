import { NextResponse } from "next/server";
import { z } from "zod";
import { getDatabase } from "@/lib/db";
import { pushSubscriptions } from "@/lib/schema";
import { getSetting } from "@/lib/settings";

export const dynamic = "force-dynamic";

const subscriptionSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({ p256dh: z.string().min(1), auth: z.string().min(1) }),
});

export function GET() {
  const publicKey = getSetting(getDatabase(), "vapid_public_key");
  if (!publicKey) {
    return NextResponse.json({ error: "push_not_configured" }, { status: 404 });
  }
  return NextResponse.json({ publicKey });
}

export async function POST(request: Request) {
  const db = getDatabase();
  if (!getSetting(db, "vapid_public_key")) {
    return NextResponse.json({ error: "push_not_configured" }, { status: 404 });
  }

  const parsed = subscriptionSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  db.insert(pushSubscriptions)
    .values({
      endpoint: parsed.data.endpoint,
      keysJson: JSON.stringify(parsed.data.keys),
    })
    .onConflictDoNothing()
    .run();

  return NextResponse.json({ ok: true }, { status: 201 });
}
