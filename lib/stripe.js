import Stripe from 'stripe';

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2023-10-16',
});

export const PLANS = {
  pro: {
    name: 'Pro',
    priceId: process.env.STRIPE_PRICE_PRO,       // $19/month — set in Vercel env
    amount: 1900,
    interval: 'month',
  },
  accountant: {
    name: 'Accountant',
    priceId: process.env.STRIPE_PRICE_ACCOUNTANT, // $49/month — set in Vercel env
    amount: 4900,
    interval: 'month',
  },
};
