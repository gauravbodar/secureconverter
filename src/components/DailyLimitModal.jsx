import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Mail, CheckCircle, AlertCircle, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';

const DailyLimitModal = ({ isOpen, onClose, onSubmit, isLoading, error, success }) => {
  const [email, setEmail] = useState('');
  const [validationError, setValidationError] = useState('');

  const validateEmail = (email) => {
    return String(email)
      .toLowerCase()
      .match(
        /^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/
      );
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    setValidationError('');

    if (!email) {
      setValidationError('Email is required');
      return;
    }

    if (!validateEmail(email)) {
      setValidationError('Please enter a valid email address');
      return;
    }

    onSubmit(email);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 20 }}
            transition={{ type: 'spring', duration: 0.5 }}
            className="bg-white rounded-xl shadow-2xl w-full max-w-[500px] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header Section */}
            <div className="bg-[#1a2b48] px-6 py-6 relative">
              <button
                onClick={onClose}
                className="absolute top-4 right-4 text-white/70 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
              <div className="flex items-center gap-3">
                <div className="bg-white/10 p-2 rounded-full">
                  <Lock className="w-6 h-6 text-white" />
                </div>
                <h2 className="text-xl font-bold text-white">Daily Limit Reached</h2>
              </div>
            </div>

            {/* Content Section */}
            <div className="p-6">
              {!success ? (
                <>
                  <p className="text-gray-600 mb-6 text-base leading-relaxed">
                    You have processed 3 free pages today. Enter your business email to unlock 10 more pages for free.
                  </p>

                  <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="space-y-2">
                      <label htmlFor="email" className="text-sm font-semibold text-[#1a2b48]">
                        Business Email
                      </label>
                      <div className="relative">
                        <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                        <input
                          type="email"
                          id="email"
                          value={email}
                          onChange={(e) => {
                            setEmail(e.target.value);
                            setValidationError('');
                          }}
                          className={`w-full pl-10 pr-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1a2b48] transition-all
                            ${validationError ? 'border-red-500 bg-red-50' : 'border-gray-200'}
                          `}
                          placeholder="name@company.com"
                          disabled={isLoading}
                        />
                      </div>
                      {validationError && (
                        <p className="text-sm text-red-500 flex items-center gap-1">
                          <AlertCircle className="w-4 h-4" />
                          {validationError}
                        </p>
                      )}
                    </div>

                    {error && (
                      <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2 text-sm text-red-700">
                        <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                        <span>{error}</span>
                      </div>
                    )}

                    <Button
                      type="submit"
                      disabled={isLoading}
                      className="w-full bg-[#10b981] hover:bg-[#059669] text-white py-6 text-lg font-semibold transition-all shadow-md hover:shadow-lg mt-2"
                    >
                      {isLoading ? (
                        <span className="flex items-center justify-center gap-2">
                          <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                          Processing...
                        </span>
                      ) : (
                        'Unlock Access Now'
                      )}
                    </Button>
                  </form>
                </>
              ) : (
                <div className="text-center py-4">
                  <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <CheckCircle className="w-8 h-8 text-[#10b981]" />
                  </div>
                  <h3 className="text-xl font-bold text-[#1a2b48] mb-2">Access Unlocked!</h3>
                  <p className="text-gray-600 mb-6">
                    You can now process 10 more pages. Good luck with your conversions!
                  </p>
                  <Button
                    onClick={onClose}
                    className="w-full bg-[#1a2b48] hover:bg-[#2a4060] text-white py-2"
                  >
                    Continue Converting
                  </Button>
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default DailyLimitModal;