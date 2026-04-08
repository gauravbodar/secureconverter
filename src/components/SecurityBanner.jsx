import React from 'react';
import { motion } from 'framer-motion';
import { Shield, Lock, Zap } from 'lucide-react';

const SecurityBanner = () => {
  const features = [
    {
      icon: Shield,
      text: 'Bank-Grade Security'
    },
    {
      icon: Lock,
      text: 'Zero Data Storage'
    },
    {
      icon: Zap,
      text: 'Instant Processing'
    }
  ];

  return (
    <section className="bg-[#f5f5f5] py-8 px-4">
      <div className="container mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="flex flex-wrap justify-center items-center gap-8 md:gap-16"
        >
          {features.map((feature, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
              className="flex items-center gap-3"
            >
              <feature.icon className="w-6 h-6 text-[#1a3a52]" />
              <span className="text-[#1a3a52] font-semibold">{feature.text}</span>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
};

export default SecurityBanner;