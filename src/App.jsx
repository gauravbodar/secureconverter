import React, { useState } from 'react';
import { Helmet } from 'react-helmet';
import Header from '@/components/Header';
import Hero from '@/components/Hero';
import FileUpload from '@/components/FileUpload';
import ResultsPage from '@/components/ResultsPage';
import HighTicketCTA from '@/components/HighTicketCTA';
import Footer from '@/components/Footer';
import DailyLimitModal from '@/components/DailyLimitModal';
import BankStatementWaitlist from '@/components/BankStatementWaitlist';
import { useDailyLimit } from '@/hooks/useDailyLimit';

function App() {
  const [currentPage, setCurrentPage] = useState('home');
  const [conversionData, setConversionData] = useState(null);
  
  // Integrate Daily Limit Hook
  const { 
    isOpen: isModalOpen, 
    openModal: openDailyLimitModal, 
    closeModal: closeDailyLimitModal, 
    submitEmail, 
    isLoading: isModalLoading, 
    error: modalError, 
    success: modalSuccess 
  } = useDailyLimit();

  const handleConversionComplete = (data) => {
    setConversionData(data);
    setCurrentPage('results');
  };

  const handleBackHome = () => {
    setCurrentPage('home');
    setConversionData(null);
  };

  const handleWaitlistClick = () => {
    setCurrentPage('waitlist');
    setConversionData(null);
  };

  return (
    <>
      <Helmet>
        <title>Free Bank Statement to CSV Converter - Fast & Secure</title>
        <meta name="description" content="Instantly transform PDF bank statements into clean CSV files ready for Xero, QuickBooks, or Excel. No software to install. Bank-grade security." />
      </Helmet>

      {/* Daily Limit Modal Rendered at Top Level */}
      <DailyLimitModal
        isOpen={isModalOpen}
        onClose={closeDailyLimitModal}
        onSubmit={submitEmail}
        isLoading={isModalLoading}
        error={modalError}
        success={modalSuccess}
      />

      {currentPage === 'waitlist' ? (
        <BankStatementWaitlist onBackHome={handleBackHome} />
      ) : (
        <div className="min-h-screen bg-white">
          <Header onLogoClick={handleBackHome} onWaitlistClick={handleWaitlistClick} />
          <main>
            {currentPage === 'home' && (
              <>
                <Hero />
                <FileUpload
                  onConversionComplete={handleConversionComplete}
                  onLimitReached={openDailyLimitModal}
                />
                <HighTicketCTA />
              </>
            )}
            {currentPage === 'results' && conversionData && (
              <ResultsPage
                conversionData={conversionData}
                onBackHome={handleBackHome}
              />
            )}
          </main>
          <Footer />
        </div>
      )}
    </>
  );
}

export default App;