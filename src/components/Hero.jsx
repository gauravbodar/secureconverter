import React from 'react';
import { motion } from 'framer-motion';
import { Shield, Building2, Lock } from 'lucide-react';

const Hero = () => {
  const trustBadges = [
    { icon: Shield, text: 'Bank-Grade Privacy' },
    { icon: Building2, text: 'Supports all Major Banks (NAB, CBA, Westpac, ANZ)' },
    { icon: Lock, text: '100% Secure Processing' }
  ];

  return (
    <section className="relative bg-[#1a2b48] text-white py-16 px-4 overflow-hidden">
      {/* Background Image with Gradient Overlay */}
      <div className="absolute inset-0 z-0">
        <img 
          src="https://images.unsplash.com/photo-1571677246347-5040036b95cc"
          alt="Financial technology background"
          className="w-full h-full object-cover opacity-30"
        />
        <div className="absolute inset-0 bg-gradient-to-br from-[#1a2b48] via-[#1a2b48]/95 to-[#1a2b48]/90"></div>
      </div>

      <div className="container mx-auto max-w-5xl relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="text-center mb-12"
        >
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold mb-6 leading-tight">
            Free Bank Statement to CSV Converter – Fast, Accurate, & Secure.
          </h1>
          <p className="text-lg md:text-xl mb-8 text-gray-200 max-w-3xl mx-auto">
            Instantly transform PDF statements into clean CSV files ready for Xero, QuickBooks, or Excel. No software to install.
          </p>
        </motion.div>

        {/* Trust Badges */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.3 }}
          className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl mx-auto"
        >
          {trustBadges.map((badge, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5, delay: 0.4 + index * 0.1 }}
              className="bg-white/10 backdrop-blur-sm border border-white/20 rounded-lg p-4 flex items-center gap-3"
            >
              <div className="bg-[#10b981]/20 rounded-full p-2 flex-shrink-0">
                <badge.icon className="w-5 h-5 text-[#10b981]" />
              </div>
              <span className="text-sm font-medium text-white">{badge.text}</span>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
};

export default Hero;