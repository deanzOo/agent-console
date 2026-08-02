import { NextResponse } from "next/server";
import { getDatabase } from "@agent-console/core/db";
import { readTelemetry } from "@/lib/telemetry";

export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json(readTelemetry(getDatabase()));
}
