import Stripe from 'stripe';

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2023-10-16',
});

export const PLANS = {
  'pro-monthly': {
    name: 'Pro Monthly',
    priceId: process.env.STRIPE_PRICE_PRO_MONTHLY, // set in Vercel env
    amount: 900, // $9.00 AUD in cents
    interval: 'month',
  },
  'pro-yearly': {
    name: 'Pro Yearly',
    priceId: process.env.STRIPE_PRICE_PRO_YEARLY,
    amount: 7900, // $79.00 AUD in cents
    interval: 'year',
  },
};
