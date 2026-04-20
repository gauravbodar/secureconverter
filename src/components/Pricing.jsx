import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Check, Phone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';

const PLANS = [
  {
    key: null,
    name: 'Free',
    price: '$0',
    period: '',
    highlight: false,
    badge: null,
    features: [
      '3 conversions to try',
      'No signup required',
      'CSV export',
      'CBA, NAB, Westpac, ANZ',
    ],
    cta: 'Try Free Now',
    ctaVariant: 'outline',
    action: 'scroll',
  },
  {
    key: null,
    name: 'Registered Free',
    price: '$0',
    period: 'forever',
    highlight: false,
    badge: null,
    features: [
      '6 pages per day',
      'Free forever',
      'CSV export',
      'Conversion history',
    ],
    cta: 'Create Free Account',
    ctaVariant: 'outline',
    action: 'signup',
  },
  {
    key: 'pro',
    name: 'Pro',
    price: '$19',
    period: '/month',
    highlight: true,
    badge: 'Most Popular',
    features: [
      'Unlimited pages',
      'All Australian banks',
      'CSV + XLSX export',
      'Full conversion history',
      'Priority processing',
    ],
    cta: 'Get Pro',
    ctaVariant: 'default',
    action: 'checkout',
  },
  {
    key: 'accountant',
    name: 'Accountant',
    price: '$49',
    period: '/month',
    highlight: false,
    badge: null,
    features: [
      'Everything in Pro',
      'Client folders',
      '5 team members',
      'API access',
      'Webhook notifications',
    ],
    cta: 'Get Accountant Plan',
    ctaVariant: 'default',
    action: 'checkout',
  },
];

const Pricing = ({ onSignupClick }) => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(null);

  const handleAction = async (plan) => {
    if (plan.action === 'scroll') {
      document.getElementById('upload')?.scrollIntoView({ behavior: 'smooth' });
      return;
    }

    if (plan.action === 'signup') {
      if (onSignupClick) onSignupClick();
      return;
    }

    // checkout
    const token = localStorage.getItem('sb_access_token');
    if (!token) {
      toast({
        title: 'Sign in required',
        description: 'Create a free account first, then upgrade.',
        variant: 'destructive',
      });
      if (onSignupClick) onSignupClick();
      return;
    }

    setLoading(plan.key);
    try {
      const res = await fetch('/api/payment/create-checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ plan: plan.key }),
      });
      const data = await res.json();
      if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl;
      } else {
        throw new Error(data.error || 'Checkout failed');
      }
    } catch (err) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(null);
    }
  };

  return (
    <section id="pricing" className="py-20 px-4 bg-[#f5f5f5]">
      <div className="container mx-auto max-w-6xl">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <h2 className="text-3xl md:text-4xl font-bold text-[#0A2342] mb-4">
            Simple, Transparent Pricing
          </h2>
          <p className="text-gray-600 text-lg max-w-2xl mx-auto">
            Built for Australian accountants, brokers, and businesses
          </p>
        </motion.div>

        {/* Plan cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-10">
          {PLANS.map((plan, i) => (
            <motion.div
              key={plan.name}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: i * 0.1 }}
              className={`relative bg-white rounded-xl p-6 flex flex-col shadow-md transition-all hover:shadow-xl
                ${plan.highlight ? 'border-2 border-[#0A2342] scale-105' : 'border border-gray-200'}`}
            >
              {plan.badge && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-[#0A2342] text-white text-xs font-bold px-3 py-1 rounded-full whitespace-nowrap">
                  {plan.badge}
                </div>
              )}

              <div className="mb-6">
                <h3 className="text-lg font-bold text-[#0A2342] mb-1">{plan.name}</h3>
                <div className="flex items-baseline gap-1">
                  <span className="text-4xl font-bold text-[#0A2342]">{plan.price}</span>
                  {plan.period && <span className="text-gray-500 text-sm">{plan.period}</span>}
                </div>
              </div>

              <ul className="space-y-2 mb-8 flex-1">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm text-gray-700">
                    <Check className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" />
                    {f}
                  </li>
                ))}
              </ul>

              <Button
                onClick={() => handleAction(plan)}
                disabled={loading === plan.key}
                variant={plan.ctaVariant}
                className={`w-full font-semibold ${
                  plan.highlight
                    ? 'bg-[#0A2342] hover:bg-[#0d2e57] text-white'
                    : plan.ctaVariant === 'outline'
                    ? 'border-[#0A2342] text-[#0A2342] hover:bg-[#0A2342] hover:text-white'
                    : 'bg-[#0A2342] hover:bg-[#0d2e57] text-white'
                }`}
              >
                {loading === plan.key ? 'Redirecting…' : plan.cta}
              </Button>
            </motion.div>
          ))}
        </div>

        {/* Enterprise tile — NO price, ever */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.4 }}
          className="bg-[#0A2342] text-white rounded-xl p-8 flex flex-col md:flex-row items-center justify-between gap-6"
        >
          <div>
            <h3 className="text-xl font-bold mb-2">Enterprise</h3>
            <p className="text-blue-200 text-sm max-w-lg">
              Custom volume · AI workflow automation · White-glove onboarding.
              We build custom AI agents that automate your entire back-office —
              invoicing, lead follow-up, client onboarding, report generation.
              Built in 2 weeks. Done-for-you.
            </p>
          </div>
          <a
            href="mailto:gaurav.bodar@gmail.com"
            className="flex-shrink-0"
          >
            <Button className="bg-white text-[#0A2342] hover:bg-blue-50 font-semibold px-6 py-3 flex items-center gap-2">
              <Phone className="w-4 h-4" />
              Book a Free Discovery Call
            </Button>
          </a>
        </motion.div>
      </div>
    </section>
  );
};

export default Pricing;
