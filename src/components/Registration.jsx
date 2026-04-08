import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Mail, Lock, Eye, EyeOff, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';

const Registration = () => {
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const { toast } = useToast();

  const handleSubmit = (e) => {
    e.preventDefault();
    
    if (!email || !password || !confirmPassword) {
      toast({
        title: "Missing fields",
        description: "Please fill in all fields.",
        variant: "destructive"
      });
      return;
    }

    if (password !== confirmPassword) {
      toast({
        title: "Passwords don't match",
        description: "Please ensure both passwords are identical.",
        variant: "destructive"
      });
      return;
    }

    if (password.length < 8) {
      toast({
        title: "Password too short",
        description: "Password must be at least 8 characters long.",
        variant: "destructive"
      });
      return;
    }

    // Store registration in localStorage for demo purposes
    const registrationData = {
      email,
      registeredAt: new Date().toISOString()
    };
    localStorage.setItem('userRegistration', JSON.stringify(registrationData));

    toast({
      title: "Registration successful! ✅",
      description: "Your account has been created. (Demo mode - data stored locally)"
    });

    setEmail('');
    setPassword('');
    setConfirmPassword('');
  };

  return (
    <section id="registration" className="py-20 px-4 bg-white">
      <div className="container mx-auto max-w-md">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-12"
        >
          <h2 className="text-3xl md:text-4xl font-bold text-[#1a3a52] mb-4">
            Create Your Account
          </h2>
          <p className="text-gray-600 text-lg">
            Join now and start converting your bank statements
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="bg-[#f5f5f5] rounded-xl p-8 shadow-lg"
        >
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label htmlFor="email" className="block text-sm font-semibold text-[#1a3a52] mb-2">
                Email Address
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                <input
                  type="email"
                  id="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-12 pr-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1a3a52] focus:border-transparent transition-all"
                  placeholder="your@email.com"
                  required
                />
              </div>
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-semibold text-[#1a3a52] mb-2">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  id="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-12 pr-12 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1a3a52] focus:border-transparent transition-all"
                  placeholder="••••••••"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            <div>
              <label htmlFor="confirmPassword" className="block text-sm font-semibold text-[#1a3a52] mb-2">
                Confirm Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  id="confirmPassword"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full pl-12 pr-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1a3a52] focus:border-transparent transition-all"
                  placeholder="••••••••"
                  required
                />
              </div>
            </div>

            <div className="flex items-start gap-2">
              <input
                type="checkbox"
                id="terms"
                className="mt-1"
                required
              />
              <label htmlFor="terms" className="text-sm text-gray-600">
                I agree to the{' '}
                <a href="#terms" className="text-[#1a3a52] font-semibold hover:underline">
                  Terms of Service
                </a>
                {' '}and{' '}
                <a href="#privacy" className="text-[#1a3a52] font-semibold hover:underline">
                  Privacy Policy
                </a>
              </label>
            </div>

            <Button
              type="submit"
              className="w-full bg-[#1a3a52] hover:bg-[#2a5a82] text-white py-6 text-lg font-semibold transition-all flex items-center justify-center gap-2"
            >
              <UserPlus className="w-5 h-5" />
              Create Account
            </Button>
          </form>

          <div className="mt-6 text-center">
            <p className="text-gray-600">
              Already have an account?{' '}
              <button
                onClick={() => toast({
                  title: "🚧 This feature isn't implemented yet—but don't worry! You can request it in your next prompt! 🚀"
                })}
                className="text-[#1a3a52] font-semibold hover:underline"
              >
                Sign in
              </button>
            </p>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.4 }}
          className="mt-8 bg-gradient-to-r from-orange-50 to-red-50 border border-orange-200 rounded-lg p-4"
        >
          <p className="text-sm text-center text-gray-700">
            <span className="font-bold text-orange-600">🎉 Limited Time Offer:</span>{' '}
            First 50 registrants get 50% off unlimited plan for life!
          </p>
        </motion.div>
      </div>
    </section>
  );
};

export default Registration;