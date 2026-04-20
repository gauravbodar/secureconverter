import React, { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Upload, File, X, CheckCircle, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { CONVERT_ENDPOINT } from '@/config/api';

const FileUpload = ({ onConversionComplete, onLimitReached }) => {
  const [file, setFile] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [pageCount, setPageCount] = useState(0);
  const [quotaModal, setQuotaModal] = useState({ visible: false });
  const { toast } = useToast();

  const estimatePageCount = (fileSize) => Math.ceil(fileSize / (50 * 1024));

  const handleDrag = useCallback((e) => { e.preventDefault(); e.stopPropagation(); }, []);

  const handleDragIn = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) setIsDragging(true);
  }, []);

  const handleDragOut = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const validateFile = (f) => {
    if (f.type !== 'application/pdf') {
      toast({ title: 'Invalid file type', description: 'Please upload a PDF file only.', variant: 'destructive' });
      return false;
    }
    if (f.size > 3145728) {
      toast({ title: 'File too large (Max 3MB)', description: 'Please upload a file smaller than 3MB.', variant: 'destructive' });
      return false;
    }
    return true;
  };

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const droppedFile = e.dataTransfer.files[0];
      if (validateFile(droppedFile)) {
        setPageCount(estimatePageCount(droppedFile.size));
        setFile(droppedFile);
      }
      e.dataTransfer.clearData();
    }
  }, []);

  const handleFileInput = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      const selected = e.target.files[0];
      if (validateFile(selected)) {
        setPageCount(estimatePageCount(selected.size));
        setFile(selected);
      }
    }
  };

  const handleRemoveFile = () => { setFile(null); setPageCount(0); };

  const handleUpload = async () => {
    if (!file) {
      toast({ title: 'No file selected', description: 'Please select a PDF file to convert.', variant: 'destructive' });
      return;
    }
    if (!validateFile(file)) return;

    setUploading(true);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch(CONVERT_ENDPOINT, { method: 'POST', body: formData });

      // Always parse JSON first — needed for quota error details
      const data = await response.json();

      // Handle quota exceeded — show modal, do NOT throw
      if (data.code === 'QUOTA_EXCEEDED') {
        setQuotaModal({
          visible: true,
          type: data.requiresSignup ? 'signup' : 'upgrade',
          message: data.error,
          pageCount: data.pageCount,
        });
        return;
      }

      // Legacy 403 path (IP-based daily limit without JSON detail)
      if (response.status === 403) {
        if (onLimitReached) onLimitReached(data);
        return;
      }

      // Unexpected server error
      if (!response.ok) {
        throw new Error(data.error || `Upload failed with status: ${response.status}`);
      }

      if (data.error) throw new Error(data.error);

      if (onConversionComplete) {
        onConversionComplete({
          transactions:    data.transactions,
          bank:            data.bank,
          accountName:     data.accountName,
          accountNumber:   data.accountNumber,
          bsb:             data.bsb,
          statementPeriod: data.statementPeriod,
          openingBalance:  data.openingBalance,
          closingBalance:  data.closingBalance,
          validation:      data.validation,
          originalFilename: file.name,
          pageCount,
        });
      }

      setFile(null);
      setPageCount(0);

    } catch (error) {
      console.error('Upload error:', error);
      toast({
        title: 'Conversion Failed',
        description: error.message || 'An error occurred. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setUploading(false);
    }
  };

  return (
    <>
      {/* Quota exceeded modal */}
      <AnimatePresence>
        {quotaModal.visible && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ duration: 0.2 }}
              className="bg-white rounded-xl p-8 max-w-md w-full shadow-2xl"
            >
              <h2 className="text-xl font-bold text-[#0A2342] mb-3">
                {quotaModal.type === 'signup'
                  ? 'Sign up to convert this statement'
                  : 'Upgrade for unlimited pages'}
              </h2>
              <p className="text-gray-600 mb-6 text-sm leading-relaxed">{quotaModal.message}</p>

              <div className="flex flex-col gap-3">
                {quotaModal.type === 'signup' && (
                  <Button
                    onClick={() => {
                      setQuotaModal({ visible: false });
                      document.getElementById('pricing')?.scrollIntoView({ behavior: 'smooth' });
                    }}
                    className="w-full bg-[#0A2342] hover:bg-[#0d2e57] text-white font-semibold py-3"
                  >
                    Sign Up Free — 6 pages/day
                  </Button>
                )}
                <Button
                  onClick={() => {
                    setQuotaModal({ visible: false });
                    document.getElementById('pricing')?.scrollIntoView({ behavior: 'smooth' });
                  }}
                  variant={quotaModal.type === 'signup' ? 'outline' : 'default'}
                  className={`w-full font-semibold py-3 ${
                    quotaModal.type === 'signup'
                      ? 'border-[#0A2342] text-[#0A2342] hover:bg-[#0A2342] hover:text-white'
                      : 'bg-[#0A2342] hover:bg-[#0d2e57] text-white'
                  }`}
                >
                  Upgrade to Pro — Unlimited pages · $19/mo
                </Button>
                <button
                  onClick={() => setQuotaModal({ visible: false })}
                  className="w-full text-gray-500 hover:text-gray-700 text-sm py-2 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <section id="upload" className="py-16 px-4 bg-gradient-to-b from-gray-50 to-white">
        <div className="container mx-auto max-w-3xl">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            <motion.div
              animate={file ? {} : {
                boxShadow: [
                  '0 0 0 0 rgba(16, 185, 129, 0)',
                  '0 0 0 10px rgba(16, 185, 129, 0.1)',
                  '0 0 0 0 rgba(16, 185, 129, 0)',
                ],
              }}
              transition={file ? {} : { duration: 2, repeat: Infinity, repeatDelay: 1 }}
              onDragEnter={handleDragIn}
              onDragLeave={handleDragOut}
              onDragOver={handleDrag}
              onDrop={handleDrop}
              className={`
                relative border-2 border-dashed rounded-xl p-12 text-center transition-all mb-6
                ${isDragging ? 'border-[#10b981] bg-green-50' : 'border-gray-300 bg-white'}
                ${file ? 'bg-green-50 border-[#10b981]' : ''}
                hover:border-[#10b981] hover:bg-green-50/50 cursor-pointer
              `}
            >
              <input
                type="file"
                accept="application/pdf"
                onChange={handleFileInput}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                disabled={uploading}
              />

              {!file ? (
                <div className="flex flex-col items-center gap-4">
                  <div className="w-20 h-20 bg-[#10b981]/10 rounded-full flex items-center justify-center">
                    <Upload className="w-10 h-10 text-[#10b981]" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-[#1a2b48] mb-2">
                      Drop your PDF here or click to browse
                    </p>
                    <p className="text-gray-600">
                      Supports PDF files up to 3MB • First 3 pages free daily
                    </p>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between bg-white rounded-lg p-4 shadow-sm">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-[#10b981]/10 rounded-lg flex items-center justify-center">
                      <File className="w-6 h-6 text-[#10b981]" />
                    </div>
                    <div className="text-left">
                      <p className="font-semibold text-[#1a2b48]">{file.name}</p>
                      <p className="text-sm text-gray-600">
                        {(file.size / 1024 / 1024).toFixed(2)} MB • ~{pageCount} pages
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleRemoveFile(); }}
                    className="text-red-500 hover:text-red-700 transition-colors"
                    disabled={uploading}
                  >
                    <X className="w-6 h-6" />
                  </button>
                </div>
              )}
            </motion.div>

            {file && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-center"
              >
                <Button
                  onClick={handleUpload}
                  disabled={uploading}
                  className="bg-[#10b981] hover:bg-[#059669] text-white px-10 py-7 text-lg font-semibold transition-all w-full md:w-auto shadow-lg hover:shadow-xl"
                >
                  {uploading ? (
                    <span className="flex items-center justify-center gap-2">
                      <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Converting...
                    </span>
                  ) : (
                    <span className="flex items-center justify-center gap-2">
                      <CheckCircle className="w-5 h-5" />
                      Convert to CSV Now
                    </span>
                  )}
                </Button>
              </motion.div>
            )}
          </motion.div>

          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="mt-8 flex items-start gap-3 bg-blue-50 border border-blue-200 rounded-lg p-4"
          >
            <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-blue-900 text-left">
              <p className="font-semibold mb-1">Your privacy is our priority</p>
              <p>Files are processed securely and deleted immediately. We never store your data.</p>
            </div>
          </motion.div>
        </div>
      </section>
    </>
  );
};

export default FileUpload;
