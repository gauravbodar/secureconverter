import React from 'react';
import { motion } from 'framer-motion';

const Header = ({ onLogoClick, onWaitlistClick }) => {
  return (
    <header className="sticky top-0 z-50 bg-white border-b border-gray-200 shadow-sm">
      <nav className="container mx-auto px-4 py-4">
        <div className="flex items-center justify-between">
          <motion.button
            onClick={onLogoClick}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5 }}
            className="flex items-center hover:opacity-80 transition-opacity"
          >
            <span className="text-2xl font-bold text-[#1a2b48]">Free CSV Converter</span>
          </motion.button>

          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-600 hidden sm:block">
              100% Free • No Sign-Up Required
            </span>
            {onWaitlistClick && (
              <motion.button
                onClick={onWaitlistClick}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.5 }}
                className="bg-[#1a2b48] hover:bg-[#243d66] text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
              >
                Join Waitlist
              </motion.button>
            )}
          </div>
        </div>
      </nav>
    </header>
  );
};

export default Header;