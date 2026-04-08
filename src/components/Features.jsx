import React from 'react';
import { motion } from 'framer-motion';
import { Building2, Shield, Zap, Database } from 'lucide-react';

const Features = () => {
  const features = [
    {
      icon: Building2,
      title: 'All Major Australian Banks',
      description: 'Full support for NAB, Westpac, Commonwealth Bank (CBA), and ANZ statements',
      color: 'bg-blue-100 text-blue-600'
    },
    {
      icon: Shield,
      title: 'Bank-Grade Security',
      description: 'Enterprise-level encryption and security protocols to protect your sensitive data',
      color: 'bg-green-100 text-green-600'
    },
    {
      icon: Zap,
      title: 'Lightning Fast',
      description: 'Convert your statements in seconds with our optimized processing engine',
      color: 'bg-yellow-100 text-yellow-600'
    },
    {
      icon: Database,
      title: 'Zero Data Storage',
      description: 'We never store your files or data. Everything is processed and deleted immediately',
      color: 'bg-purple-100 text-purple-600'
    }
  ];

  return (
    <section id="features" className="py-20 px-4 bg-[#f5f5f5]">
      <div className="container mx-auto max-w-6xl">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <h2 className="text-3xl md:text-4xl font-bold text-[#1a3a52] mb-4">
            Why Choose Our Converter?
          </h2>
          <p className="text-gray-600 text-lg max-w-2xl mx-auto">
            Built specifically for Australian banks with security and speed in mind
          </p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {features.map((feature, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: index * 0.1 }}
              className="bg-white rounded-lg p-8 shadow-md hover:shadow-xl transition-shadow"
            >
              <div className={`w-14 h-14 rounded-lg ${feature.color} flex items-center justify-center mb-6`}>
                <feature.icon className="w-7 h-7" />
              </div>
              <h3 className="text-xl font-bold text-[#1a3a52] mb-3">
                {feature.title}
              </h3>
              <p className="text-gray-600 leading-relaxed">
                {feature.description}
              </p>
            </motion.div>
          ))}
        </div>

        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.5 }}
          className="mt-16 grid grid-cols-2 md:grid-cols-4 gap-6"
        >
          <img alt="NAB Bank logo" className="h-12 mx-auto opacity-60 hover:opacity-100 transition-opacity" src="https://images.unsplash.com/photo-1672870153692-e34f6b3fa056" />
          <img alt="Westpac Bank logo" className="h-12 mx-auto opacity-60 hover:opacity-100 transition-opacity" src="https://images.unsplash.com/photo-1680672306353-4b3ae6523e56" />
          <img alt="Commonwealth Bank logo" className="h-12 mx-auto opacity-60 hover:opacity-100 transition-opacity" src="https://images.unsplash.com/photo-1571704631356-cb97f8f770ba" />
          <img alt="ANZ Bank logo" className="h-12 mx-auto opacity-60 hover:opacity-100 transition-opacity" src="https://images.unsplash.com/photo-1672870153680-2b30371b410d" />
        </motion.div>
      </div>
    </section>
  );
};

export default Features;