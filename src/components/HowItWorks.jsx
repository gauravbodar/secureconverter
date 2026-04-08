import React from 'react';
import { motion } from 'framer-motion';
import { Upload, Settings, Download } from 'lucide-react';

const HowItWorks = () => {
  const steps = [
    {
      icon: Upload,
      number: '01',
      title: 'Upload Your Statement',
      description: 'Drag and drop your PDF bank statement or browse to select it'
    },
    {
      icon: Settings,
      number: '02',
      title: 'Automatic Processing',
      description: 'Our AI analyzes and converts your statement in seconds'
    },
    {
      icon: Download,
      number: '03',
      title: 'Download CSV',
      description: 'Get your clean, formatted CSV file ready for use'
    }
  ];

  return (
    <section id="how-it-works" className="py-20 px-4 bg-white">
      <div className="container mx-auto max-w-6xl">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <h2 className="text-3xl md:text-4xl font-bold text-[#1a3a52] mb-4">
            How It Works
          </h2>
          <p className="text-gray-600 text-lg max-w-2xl mx-auto">
            Three simple steps to convert your bank statement
          </p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 md:gap-12">
          {steps.map((step, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: index * 0.2 }}
              className="relative text-center"
            >
              {index < steps.length - 1 && (
                <div className="hidden md:block absolute top-16 left-[60%] w-full h-0.5 bg-gradient-to-r from-[#1a3a52] to-gray-300"></div>
              )}
              
              <div className="relative z-10 bg-white">
                <div className="w-20 h-20 bg-[#1a3a52] rounded-full flex items-center justify-center mx-auto mb-6">
                  <step.icon className="w-10 h-10 text-white" />
                </div>
                
                <div className="text-5xl font-bold text-[#1a3a52] opacity-20 mb-4">
                  {step.number}
                </div>
                
                <h3 className="text-xl font-bold text-[#1a3a52] mb-3">
                  {step.title}
                </h3>
                
                <p className="text-gray-600">
                  {step.description}
                </p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default HowItWorks;