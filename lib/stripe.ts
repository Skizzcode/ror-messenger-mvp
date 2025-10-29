// lib/stripe.ts
import Stripe from 'stripe';

export const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || '';
export const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || '';
export const NEXT_PUBLIC_BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
export const NEXT_PUBLIC_STRIPE_PK = process.env.NEXT_PUBLIC_STRIPE_PK || '';

export function getStripe() {
  if (!STRIPE_SECRET_KEY) throw new Error('Missing STRIPE_SECRET_KEY');
  // Omit apiVersion to avoid TypeScript pin mismatch with installed @types
  return new Stripe(STRIPE_SECRET_KEY);
}
