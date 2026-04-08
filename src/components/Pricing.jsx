import React from 'react';
import { motion } from 'framer-motion';
import { Check, Star } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';

const Pricing = () => {
  const { toast } = useToast();

  const handleCheckout = (plan) => {
    toast({
      title: "🚧 This feature isn't implemented yet—but don't worry! You can request it in your next prompt! 🚀",
      description: `Stripe checkout integration needed for ${plan} plan.`
    });
  };

  const plans = [
    {
      name: 'Pay As You Go',
      price: '$2.99',
      period: 'per conversion',
      description: 'Perfect for occasional use',
      features: [
        'Convert any Australian bank statement',
        'Up to 10MB file size',
        'Instant CSV download',
        'Bank-grade security',
        'Zero data storage',
        'Email support'
      ],
      cta: 'Convert Now',
      popular: false
    },
    {
      name: 'Unlimited Plan',
      price: '$29.99',
      period: 'per month',
      description: 'Best for regular users',
      features: [
        'Unlimited conversions',
        'Up to 20MB file size',
        'Priority processing',
        'Bank-grade security',
        'Zero data storage',
        'Priority email support',
        'Batch processing',
        'API access'
      ],
      cta: 'Start Free Trial',
      popular: true,
      badge: '🔥 First 50 Registrants: 50% OFF'
    }
  ];

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
          <h2 className="text-3xl md:text-4xl font-bold text-[#1a3a52] mb-4">
            Simple, Transparent Pricing
          </h2>
          <p className="text-gray-600 text-lg max-w-2xl mx-auto">
            Choose the plan that works best for you
          </p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-5xl mx-auto">
          {plans.map((plan, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: index * 0.2 }}
              className={`
                relative bg-white rounded-xl p-8 shadow-lg
                ${plan.popular ? 'border-4 border-[#1a3a52] scale-105' : 'border border-gray-200'}
                hover:shadow-2xl transition-all
              `}
            >
              {plan.badge && (
                <div className="absolute -top-4 left-1/2 transform -translate-x-1/2 bg-gradient-to-r from-orange-500 to-red-500 text-white px-4 py-2 rounded-full text-sm font-bold shadow-lg flex items-center gap-2">
                  <Star className="w-4 h-4 fill-current" />
                  {plan.badge}
                </div>
              )}

              {plan.popular && (
                <div className="absolute -top-3 -right-3">
                  <div className="bg-[#1a3a52] text-white px-4 py-1 rounded-full text-sm font-semibold">
                    Most Popular
                  </div>
                </div>
              )}

              <div className="mb-8">
                <h3 className="text-2xl font-bold text-[#1a3a52] mb-2">
                  {plan.name}
                </h3>
                <p className="text-gray-600 mb-4">{plan.description}</p>
                <div className="flex items-baseline gap-2">
                  <span className="text-5xl font-bold text-[#1a3a52]">
                    {plan.price}
                  </span>
                  <span className="text-gray-600">
                    {plan.period}
                  </span>
                </div>
              </div>

              <ul className="space-y-4 mb-8">
                {plan.features.map((feature, fIndex) => (
                  <li key={fIndex} className="flex items-start gap-3">
                    <Check className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                    <span className="text-gray-700">{feature}</span>
                  </li>
                ))}
              </ul>

              <Button
                onClick={() => handleCheckout(plan.name)}
                className={`
                  w-full py-6 text-lg font-semibold transition-all
                  ${plan.popular 
                    ? 'bg-[#1a3a52] hover:bg-[#2a5a82] text-white' 
                    : 'bg-gray-100 hover:bg-gray-200 text-[#1a3a52]'
                  }
                `}
              >
                {plan.cta}
              </Button>
            </motion.div>
          ))}
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.5 }}
          className="mt-12 text-center"
        >
          <p className="text-gray-600">
            All plans include our security guarantee and instant processing. No hidden fees.
          </p>
        </motion.div>
      </div>
    </section>
  );
};

export default Pricing;