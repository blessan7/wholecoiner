import jwt from 'jsonwebtoken';
import { cookies } from 'next/headers';

const COOKIE_NAME = 'app_session';
const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_change_me_in_production';

/**
 * Set session cookie with JWT token
 * @param {Object} params
 * @param {string} params.userId - User ID
 * @param {boolean} params.twoFaVerified - Whether 2FA is verified
 */
export async function setSession({ userId, twoFaVerified }) {
  const token = jwt.sign(
    { 
      sub: userId, 
      twoFaVerified: !!twoFaVerified 
    },
    JWT_SECRET,
    { expiresIn: '7d' }
  );

  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 7 * 24 * 60 * 60, // 7 days in seconds
  });
}

/**
 * Clear session cookie
 */
export async function clearSession() {
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 0,
  });
}

/**
 * Parse cookie string to get value by name
 * @param {string} cookieHeader - Cookie header string
 * @param {string} name - Cookie name
 * @returns {string|null} Cookie value or null
 */
function parseCookie(cookieHeader, name) {
  if (!cookieHeader) return null;
  
  const cookies = cookieHeader.split(';').map(c => c.trim());
  for (const cookie of cookies) {
    const [cookieName, ...valueParts] = cookie.split('=');
    if (cookieName.trim() === name) {
      return valueParts.join('='); // Handle values with = signs
    }
  }
  return null;
}

/**
 * Get and verify session from cookie
 * @param {Request} request - Optional Request object to read cookies from headers
 * @returns {Object|null} Session data or null if invalid
 */
export async function getSession(request = null) {
  let token = null;
  
  // Try to get cookie from request headers first (for external requests)
  if (request) {
    const cookieHeader = request.headers.get('cookie');
    token = parseCookie(cookieHeader, COOKIE_NAME);
  }
  
  // Fallback to Next.js cookies() API (for internal requests)
  if (!token) {
    try {
      const cookieStore = await cookies();
      token = cookieStore.get(COOKIE_NAME)?.value;
    } catch (error) {
      // cookies() might fail in some contexts, that's okay
    }
  }
  
  if (!token) return null;
  
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (error) {
    return null;
  }
}

