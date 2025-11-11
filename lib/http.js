import { NextResponse } from 'next/server';

/**
 * Success response helper
 * @param {*} data - Data to return in response
 * @param {ResponseInit} init - Optional response init options
 * @returns {NextResponse}
 */
export const ok = (data, init) => {
  return NextResponse.json({ ok: true, data }, init);
};

/**
 * Error response helper
 * @param {string} message - Error message
 * @param {number} code - HTTP status code (default: 400)
 * @param {Object} extra - Additional error data
 * @returns {NextResponse}
 */
export const fail = (message, code = 400, extra = {}) => {
  return NextResponse.json(
    { ok: false, error: { message, code, ...extra } },
    { status: code }
  );
};

