import { NextRequest, NextResponse } from "next/server";

const API_BASE_URL = "http://localhost:3001";

export async function POST(request: NextRequest) {
  try {
    const backendUrl = `${API_BASE_URL}/api/auth/sign-in/email`;

    const body = await request.text();
    const headers = new Headers(request.headers);

    // Remove host header and other problematic headers
    headers.delete("host");
    headers.delete("content-length");

    const response = await fetch(backendUrl, {
      method: "POST",
      headers,
      body,
    });

    const responseHeaders = new Headers();
    response.headers.forEach((value, key) => {
      if (key !== "content-length" && key !== "connection") {
        responseHeaders.set(key, value);
      }
    });

    const responseData = await response.text();

    return new NextResponse(responseData, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
    });
  } catch (error) {
    console.error("Auth proxy error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
