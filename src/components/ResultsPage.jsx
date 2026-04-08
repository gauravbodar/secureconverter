import React from 'react';
import { motion } from 'framer-motion';
import { Download, CheckCircle, ArrowLeft, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';

const ResultsPage = ({ conversionData, onBackHome }) => {
  const { toast } = useToast();

  const handleDownload = () => {
    if (!conversionData) return;

    const url = window.URL.createObjectURL(conversionData.blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = conversionData.filename;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);

    toast({
      title: "Download Started! 📥",
      description: "Your CSV file is downloading now."
    });
  };

  const handleXeroClick = () => {
    toast({
      title: "🚧 This feature isn't implemented yet—but don't worry! You can request it in your next prompt! 🚀",
      description: "Xero affiliate integration needed."
    });
  };

  const handleMercuryClick = () => {
    toast({
      title: "🚧 This feature isn't implemented yet—but don't worry! You can request it in your next prompt! 🚀",
      description: "Mercury affiliate integration needed."
    });
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white py-12 px-4">
      <div className="container mx-auto max-w-4xl">
        {/* Back Button */}
        <motion.button
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          onClick={onBackHome}
          className="flex items-center gap-2 text-gray-600 hover:text-[#1a2b48] transition-colors mb-8"
        >
          <ArrowLeft className="w-5 h-5" />
          <span className="font-medium">Convert Another File</span>
        </motion.button>

        {/* Success Header */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="text-center mb-12"
        >
          <div className="w-20 h-20 bg-[#10b981] rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-4xl font-bold text-[#1a2b48] mb-4">
            Conversion Complete! 🎉
          </h1>
          <p className="text-xl text-gray-600">
            Your CSV file is ready to download
          </p>
        </motion.div>

        {/* Download Card */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="bg-white rounded-xl shadow-lg p-8 mb-8 border border-gray-200"
        >
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="text-lg font-semibold text-[#1a2b48] mb-1">
                {conversionData?.originalFilename || 'Bank Statement'}
              </h3>
              <p className="text-sm text-gray-600">
                Converted • {conversionData?.pageCount || 0} pages processed
              </p>
            </div>
            <div className="text-right">
              <span className="inline-block bg-green-100 text-green-800 text-xs font-semibold px-3 py-1 rounded-full">
                Ready
              </span>
            </div>
          </div>

          <Button
            onClick={handleDownload}
            className="w-full bg-[#10b981] hover:bg-[#059669] text-white py-6 text-lg font-semibold transition-all shadow-lg hover:shadow-xl"
          >
            <Download className="w-6 h-6 mr-2" />
            Download CSV File
          </Button>
        </motion.div>

        {/* What's Next Section */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.4 }}
          className="mb-8"
        >
          <h2 className="text-2xl font-bold text-[#1a2b48] mb-6 text-center">
            What's Next?
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Xero Card */}
            <motion.div
              whileHover={{ y: -5 }}
              className="bg-white rounded-xl shadow-lg p-6 border border-gray-200 hover:shadow-xl transition-all"
            >
              <div className="mb-4">
                <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center mb-4">
                  <span className="text-2xl">📊</span>
                </div>
                <h3 className="text-xl font-bold text-[#1a2b48] mb-2">
                  Import to Xero
                </h3>
                <p className="text-gray-600 mb-4">
                  Import your data to Xero accounting software. Get 50% off your first 3 months.
                </p>
              </div>
              <Button
                onClick={handleXeroClick}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white transition-all"
              >
                Claim Offer
                <ExternalLink className="w-4 h-4 ml-2" />
              </Button>
            </motion.div>

            {/* Mercury Card */}
            <motion.div
              whileHover={{ y: -5 }}
              className="bg-white rounded-xl shadow-lg p-6 border border-gray-200 hover:shadow-xl transition-all"
            >
              <div className="mb-4">
                <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center mb-4">
                  <span className="text-2xl">🏦</span>
                </div>
                <h3 className="text-xl font-bold text-[#1a2b48] mb-2">
                  Switch to Mercury
                </h3>
                <p className="text-gray-600 mb-4">
                  Tired of manual bank feeds? Switch to Mercury Business Banking for automated reporting.
                </p>
              </div>
              <Button
                onClick={handleMercuryClick}
                className="w-full bg-purple-600 hover:bg-purple-700 text-white transition-all"
              >
                Learn More
                <ExternalLink className="w-4 h-4 ml-2" />
              </Button>
            </motion.div>
          </div>
        </motion.div>
      </div>
    </div>
  );
};

export default ResultsPage;