import { NextResponse } from 'next/server';
import { nanoid } from 'nanoid';

// Simple in-memory rate limiter (replace with Redis in production)
const rateLimitStore = new Map();

function rateLimit(ip, limit = 100, windowMs = 60000) {
  const now = Date.now();
  const key = `${ip}:${Math.floor(now / windowMs)}`;

  const current = rateLimitStore.get(key) || 0;

  if (current >= limit) {
    return false;
  }

  rateLimitStore.set(key, current + 1);

  // Cleanup old entries
  if (rateLimitStore.size > 1000) {
    const oldestKey = Array.from(rateLimitStore.keys())[0];
    rateLimitStore.delete(oldestKey);
  }

  return true;
}

export function middleware(request) {
  const requestId = nanoid();
  const ip = request.ip || request.headers.get('x-forwarded-for') || 'unknown';

  // Add request ID to headers
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-request-id', requestId);

  // Rate limiting (100 requests per minute per IP)
  if (!rateLimit(ip, 100, 60000)) {
    return NextResponse.json(
      {
        error: {
          message: 'Too many requests',
          code: 'RATE_LIMIT_EXCEEDED',
          requestId,
        },
      },
      { status: 429 }
    );
  }

  // Log request
  console.log(
    JSON.stringify({
      requestId,
      method: request.method,
      url: request.url,
      ip,
      timestamp: new Date().toISOString(),
    })
  );

  return NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });
}

export const config = {
  matcher: '/api/:path*',
};

