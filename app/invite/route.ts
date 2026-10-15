import { NextResponse } from "next/server";

export function GET() {
  const response = new NextResponse(null, { status: 303, headers: { Location: "/access-error" } });
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}
