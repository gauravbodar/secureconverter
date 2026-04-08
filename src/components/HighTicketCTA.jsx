import React from 'react';
import { motion } from 'framer-motion';
import { Calendar, TrendingUp, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';

const HighTicketCTA = () => {
  const { toast } = useToast();

  const handleBookAudit = () => {
    toast({
      title: "🚧 This feature isn't implemented yet—but don't worry! You can request it in your next prompt! 🚀",
      description: "Calendly integration or booking system needed."
    });
  };

  const benefits = [
    { icon: TrendingUp, text: 'Automated financial reporting' },
    { icon: Zap, text: 'Custom workflow optimization' },
    { icon: Calendar, text: 'Save 10+ hours per week' }
  ];

  return (
    <section className="py-20 px-4 bg-[#1a2b48] text-white">
      <div className="container mx-auto max-w-5xl">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center"
        >
          <div className="inline-block bg-[#10b981]/20 text-[#10b981] px-4 py-2 rounded-full text-sm font-semibold mb-6">
            FOR BUSINESSES PROCESSING 100+ PAGES
          </div>
          
          <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold mb-6">
            Processing 100+ pages?
          </h2>
          
          <p className="text-xl text-gray-300 mb-8 max-w-2xl mx-auto">
            Manual cleanup is a waste of your time. Book a Workflow Audit and we will automate your entire reporting system.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10 max-w-3xl mx-auto">
            {benefits.map((benefit, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
                className="flex items-center gap-3 bg-white/10 backdrop-blur-sm rounded-lg p-4"
              >
                <div className="bg-[#10b981]/20 rounded-full p-2">
                  <benefit.icon className="w-5 h-5 text-[#10b981]" />
                </div>
                <span className="text-sm font-medium">{benefit.text}</span>
              </motion.div>
            ))}
          </div>

          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.3 }}
          >
            <Button
              onClick={handleBookAudit}
              className="bg-[#10b981] hover:bg-[#059669] text-white px-10 py-7 text-lg font-semibold transition-all shadow-xl hover:shadow-2xl"
            >
              <Calendar className="w-6 h-6 mr-2" />
              Book Free Workflow Audit
            </Button>
            <p className="text-sm text-gray-400 mt-4">
              30-minute consultation • No commitment required
            </p>
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
};

export default HighTicketCTA;