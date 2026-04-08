import React from 'react';
import { useToast } from '@/components/ui/use-toast';

const Footer = () => {
  const { toast } = useToast();
  const currentYear = new Date().getFullYear();

  const handleLinkClick = (linkName) => {
    toast({
      title: "🚧 This feature isn't implemented yet—but don't worry! You can request it in your next prompt! 🚀",
      description: `${linkName} page needed.`
    });
  };

  return (
    <footer className="bg-[#1a2b48] text-white py-12 px-4">
      <div className="container mx-auto max-w-6xl">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-8">
          <div className="col-span-1 md:col-span-1">
            <span className="text-2xl font-bold mb-4 block">Free CSV Converter</span>
            <p className="text-gray-300 mb-4">
              Convert bank statements to CSV format securely and instantly. 100% free tool.
            </p>
          </div>

          <div>
            <span className="font-semibold mb-4 block">Tool</span>
            <ul className="space-y-2">
              <li>
                <button
                  onClick={() => handleLinkClick('How It Works')}
                  className="text-gray-300 hover:text-white transition-colors"
                >
                  How It Works
                </button>
              </li>
              <li>
                <button
                  onClick={() => handleLinkClick('FAQ')}
                  className="text-gray-300 hover:text-white transition-colors"
                >
                  FAQ
                </button>
              </li>
              <li>
                <button
                  onClick={() => handleLinkClick('Supported Banks')}
                  className="text-gray-300 hover:text-white transition-colors"
                >
                  Supported Banks
                </button>
              </li>
            </ul>
          </div>

          <div>
            <span className="font-semibold mb-4 block">Legal</span>
            <ul className="space-y-2">
              <li>
                <button
                  onClick={() => handleLinkClick('Privacy Policy')}
                  className="text-gray-300 hover:text-white transition-colors"
                >
                  Privacy Policy
                </button>
              </li>
              <li>
                <button
                  onClick={() => handleLinkClick('Terms of Service')}
                  className="text-gray-300 hover:text-white transition-colors"
                >
                  Terms of Service
                </button>
              </li>
            </ul>
          </div>
        </div>

        <div className="border-t border-gray-600 pt-8">
          <div className="flex flex-col md:flex-row justify-between items-center gap-4">
            <p className="text-gray-300 text-sm">
              © {currentYear} Free CSV Converter. All rights reserved.
            </p>
            <p className="text-gray-400 text-sm">
              Secure • Private • Always Free
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;