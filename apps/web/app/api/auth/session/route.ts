import { NextRequest, NextResponse } from "next/server";

const API_BASE_URL = "http://localhost:3001";

export async function GET(request: NextRequest) {
  try {
    const backendUrl = `${API_BASE_URL}/api/auth/session`;

    const headers = new Headers(request.headers);
    headers.delete("host");

    const response = await fetch(backendUrl, {
      method: "GET",
      headers,
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
    console.error("Auth session proxy error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
