import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Zap, Lock, BarChart2, CheckCircle, Upload, Settings, Download } from 'lucide-react';
import { subscribeToWaitlist } from '@/api/mailerlite-signup';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const features = [
  { icon: Zap, label: 'Lightning Fast', desc: 'Results in under 30 seconds' },
  { icon: Lock, label: 'Secure & Private', desc: 'Your data never leaves your browser' },
  { icon: BarChart2, label: 'Ready to Use', desc: 'Clean CSV for Xero, Excel & more' },
];

const steps = [
  { icon: Upload, step: '1', title: 'Upload Your PDF', desc: 'Drag and drop any AU bank statement PDF.' },
  { icon: Settings, step: '2', title: 'Auto-Processing', desc: 'Our engine extracts and cleans your transactions.' },
  { icon: Download, step: '3', title: 'Download CSV', desc: 'Get a spreadsheet-ready file instantly.' },
];

const BankStatementWaitlist = ({ onBackHome }) => {
  const [firstName, setFirstName] = useState('');
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [alreadySubscribed, setAlreadySubscribed] = useState(false);

  const validate = () => {
    if (!firstName.trim() || !email.trim()) {
      setError('Please fill in all fields.');
      return false;
    }
    if (firstName.trim().length < 2 || firstName.trim().length > 50) {
      setError('First name must be between 2 and 50 characters.');
      return false;
    }
    if (!EMAIL_REGEX.test(email.trim())) {
      setError('Please enter a valid email address.');
      return false;
    }
    return true;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!validate()) return;

    setLoading(true);
    try {
      const result = await subscribeToWaitlist({ email, firstName });
      if (result.success) {
        setSuccess(true);
        setAlreadySubscribed(!!result.alreadySubscribed);
        setFirstName('');
        setEmail('');
      } else {
        setError(result.error || 'Something went wrong. Please try again.');
      }
    } catch (_) {
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-white">
      {/* Hero Section */}
      <section className="relative bg-[#1a2b48] text-white py-16 px-4 overflow-hidden">
        <div className="absolute inset-0 z-0">
          <img
            src="https://images.unsplash.com/photo-1554224155-6726b3ff858f"
            alt="Financial spreadsheet background"
            className="w-full h-full object-cover opacity-20"
          />
          <div className="absolute inset-0 bg-gradient-to-br from-[#1a2b48] via-[#1a2b48]/95 to-[#1a2b48]/85" />
        </div>

        <div className="container mx-auto max-w-6xl relative z-10">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            {/* Left: Content */}
            <motion.div
              initial={{ opacity: 0, x: -30 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.6 }}
            >
              <span className="inline-block bg-[#10b981]/20 text-[#10b981] text-sm font-semibold px-3 py-1 rounded-full mb-4 border border-[#10b981]/30">
                Early Access — Limited Spots
              </span>
              <h1 className="text-4xl md:text-5xl font-bold leading-tight mb-4">
                Convert Bank Statements in 30 Seconds
              </h1>
              <p className="text-lg text-gray-200 mb-8">
                Turn messy PDF bank statements into clean spreadsheets. Automatically.
              </p>

              {/* Feature callouts */}
              <div className="space-y-4">
                {features.map(({ icon: Icon, label, desc }) => (
                  <motion.div
                    key={label}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.5, delay: 0.2 }}
                    className="flex items-center gap-4 bg-white/10 backdrop-blur-sm border border-white/20 rounded-lg px-4 py-3"
                  >
                    <div className="bg-[#10b981]/20 rounded-full p-2 flex-shrink-0">
                      <Icon className="w-5 h-5 text-[#10b981]" />
                    </div>
                    <div>
                      <span className="font-semibold text-white">{label}</span>
                      <p className="text-sm text-gray-300">{desc}</p>
                    </div>
                  </motion.div>
                ))}
              </div>
            </motion.div>

            {/* Right: Form */}
            <motion.div
              initial={{ opacity: 0, x: 30 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.6, delay: 0.15 }}
              className="bg-white rounded-2xl shadow-2xl p-8"
            >
              {!success ? (
                <>
                  <h2 className="text-2xl font-bold text-[#1a2b48] mb-2">Get Early Access</h2>
                  <p className="text-gray-500 text-sm mb-6">
                    Join the waitlist. We'll notify you the moment we launch.
                  </p>

                  <form onSubmit={handleSubmit} noValidate className="space-y-4">
                    <div>
                      <label htmlFor="firstName" className="block text-sm font-medium text-gray-700 mb-1">
                        First Name
                      </label>
                      <input
                        id="firstName"
                        type="text"
                        value={firstName}
                        onChange={(e) => setFirstName(e.target.value)}
                        placeholder="Jane"
                        maxLength={50}
                        disabled={loading}
                        className="w-full border border-gray-300 rounded-lg px-4 py-3 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#1a2b48] focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed transition"
                      />
                    </div>

                    <div>
                      <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                        Email Address
                      </label>
                      <input
                        id="email"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="jane@example.com"
                        disabled={loading}
                        className="w-full border border-gray-300 rounded-lg px-4 py-3 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#1a2b48] focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed transition"
                      />
                    </div>

                    {error && (
                      <p className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                        {error}
                      </p>
                    )}

                    <button
                      type="submit"
                      disabled={loading}
                      className="w-full bg-[#1a2b48] hover:bg-[#243d66] disabled:bg-gray-400 disabled:cursor-not-allowed text-white font-semibold py-3 px-6 rounded-lg transition-colors duration-200 flex items-center justify-center gap-2"
                    >
                      {loading ? (
                        <>
                          <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                          </svg>
                          Joining waitlist...
                        </>
                      ) : (
                        'Join the Waitlist →'
                      )}
                    </button>
                  </form>

                  <p className="text-xs text-gray-400 text-center mt-4">
                    🔒 No spam. Unsubscribe anytime.
                  </p>
                </>
              ) : (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.4 }}
                  className="text-center py-4"
                >
                  <div className="flex justify-center mb-4">
                    <div className="bg-[#10b981]/10 rounded-full p-4">
                      <CheckCircle className="w-12 h-12 text-[#10b981]" />
                    </div>
                  </div>
                  <h3 className="text-2xl font-bold text-[#1a2b48] mb-2">
                    {alreadySubscribed ? 'Already on the list!' : "You're on the list! 🎉"}
                  </h3>
                  <p className="text-gray-600 mb-1">
                    {alreadySubscribed
                      ? 'Your email is already registered for early access.'
                      : `Thanks for signing up! We'll send you early access on April 15.`}
                  </p>
                  <p className="text-sm text-gray-400">Check your email for confirmation.</p>
                  <button
                    onClick={onBackHome}
                    className="mt-6 text-sm text-[#1a2b48] underline hover:text-[#243d66] transition-colors"
                  >
                    ← Back to converter
                  </button>
                </motion.div>
              )}
            </motion.div>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-16 px-4 bg-[#f8f9fb]">
        <div className="container mx-auto max-w-5xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="text-center mb-12"
          >
            <h2 className="text-3xl font-bold text-[#1a2b48] mb-3">How It Works</h2>
            <p className="text-gray-500">Three steps. Thirty seconds.</p>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {steps.map(({ icon: Icon, step, title, desc }, i) => (
              <motion.div
                key={step}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: i * 0.1 }}
                className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 text-center"
              >
                <div className="flex justify-center mb-4">
                  <div className="relative">
                    <div className="bg-[#1a2b48]/10 rounded-full p-4">
                      <Icon className="w-6 h-6 text-[#1a2b48]" />
                    </div>
                    <span className="absolute -top-1 -right-1 bg-[#1a2b48] text-white text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center">
                      {step}
                    </span>
                  </div>
                </div>
                <h3 className="font-bold text-[#1a2b48] text-lg mb-2">{title}</h3>
                <p className="text-gray-500 text-sm">{desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-[#1a2b48] text-white py-8 px-4 text-center">
        <div className="container mx-auto max-w-2xl">
          <p className="font-semibold mb-1">Free CSV Converter</p>
          <p className="text-gray-300 text-sm mb-3">
            Launching <strong>April 15, 2026</strong> · Early access spots are limited.
          </p>
          <p className="text-gray-400 text-xs">
            🔒 Your data is processed securely. We never store your bank statement files.
          </p>
        </div>
      </footer>
    </div>
  );
};

export default BankStatementWaitlist;
