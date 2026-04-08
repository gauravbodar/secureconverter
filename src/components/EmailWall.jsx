import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Mail, Zap, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';

const EmailWall = ({ onSuccess, onClose, pagesNeeded, currentUsage }) => {
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!email || !email.includes('@')) {
      toast({
        title: "Invalid email",
        description: "Please enter a valid email address.",
        variant: "destructive"
      });
      return;
    }

    setIsSubmitting(true);

    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Store unlimited access
    localStorage.setItem('unlimitedAccess', JSON.stringify({
      email,
      unlockTime: new Date().toISOString()
    }));

    // Store email submission
    const submissions = JSON.parse(localStorage.getItem('emailSubmissions') || '[]');
    submissions.push({
      email,
      timestamp: new Date().toISOString()
    });
    localStorage.setItem('emailSubmissions', JSON.stringify(submissions));

    toast({
      title: "Success! 🎉",
      description: "You now have unlimited access for 24 hours!"
    });

    setIsSubmitting(false);
    onSuccess();
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          transition={{ type: 'spring', duration: 0.5 }}
          className="bg-white rounded-2xl max-w-lg w-full p-8 relative shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={onClose}
            className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-6 h-6" />
          </button>

          <div className="text-center mb-6">
            <div className="w-16 h-16 bg-gradient-to-br from-[#10b981] to-[#059669] rounded-full flex items-center justify-center mx-auto mb-4">
              <Zap className="w-8 h-8 text-white" />
            </div>
            <h2 className="text-3xl font-bold text-[#1a2b48] mb-3">
              Unlock Unlimited Pages
            </h2>
            <p className="text-gray-600 text-lg">
              You've used {currentUsage} of 3 free pages today. Get a free Pro account for 24 hours!
            </p>
          </div>

          <div className="bg-gradient-to-br from-green-50 to-blue-50 rounded-xl p-6 mb-6">
            <div className="flex items-center gap-3 mb-3">
              <Clock className="w-5 h-5 text-[#10b981]" />
              <span className="font-semibold text-[#1a2b48]">24-Hour Pro Access Includes:</span>
            </div>
            <ul className="space-y-2 text-gray-700">
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 bg-[#10b981] rounded-full"></span>
                Unlimited page conversions
              </li>
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 bg-[#10b981] rounded-full"></span>
                Priority processing speed
              </li>
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 bg-[#10b981] rounded-full"></span>
                No file size limits
              </li>
            </ul>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="relative">
              <Mail className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full pl-12 pr-4 py-4 border-2 border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#10b981] focus:border-transparent transition-all text-gray-900 text-lg"
                placeholder="your@email.com"
                required
              />
            </div>

            <Button
              type="submit"
              disabled={isSubmitting}
              className="w-full bg-[#10b981] hover:bg-[#059669] text-white py-6 text-lg font-semibold transition-all shadow-lg hover:shadow-xl"
            >
              {isSubmitting ? (
                <span className="flex items-center justify-center gap-2">
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  Unlocking...
                </span>
              ) : (
                'Unlock Now - Free for 24 Hours'
              )}
            </Button>
          </form>

          <p className="text-xs text-gray-500 text-center mt-4">
            No credit card required. By continuing, you agree to receive occasional product updates.
          </p>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default EmailWall;