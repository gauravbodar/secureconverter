import React, { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Upload, File, X, CheckCircle, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { CONVERT_ENDPOINT, SIGNUP_ENDPOINT } from '@/config/api';

const FileUpload = ({ onConversionComplete }) => {
  const [file, setFile]           = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [pageCount, setPageCount] = useState(0);
  const [quotaModal, setQuotaModal] = useState({ visible: false });
  const [authToken, setAuthToken] = useState(null);
  const [signupForm, setSignupForm] = useState({ firstName: '', email: '', password: '', loading: false, error: '' });
  const { toast } = useToast();

  const estimatePageCount = (fileSize) => Math.ceil(fileSize / (50 * 1024));

  const handleDrag    = useCallback((e) => { e.preventDefault(); e.stopPropagation(); }, []);
  const handleDragIn  = useCallback((e) => {
    e.preventDefault(); e.stopPropagation();
    if (e.dataTransfer.items?.length > 0) setIsDragging(true);
  }, []);
  const handleDragOut = useCallback((e) => { e.preventDefault(); e.stopPropagation(); setIsDragging(false); }, []);

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
    e.preventDefault(); e.stopPropagation(); setIsDragging(false);
    if (e.dataTransfer.files?.length > 0) {
      const f = e.dataTransfer.files[0];
      if (validateFile(f)) { setPageCount(estimatePageCount(f.size)); setFile(f); }
      e.dataTransfer.clearData();
    }
  }, []);

  const handleFileInput = (e) => {
    if (e.target.files?.length > 0) {
      const f = e.target.files[0];
      if (validateFile(f)) { setPageCount(estimatePageCount(f.size)); setFile(f); }
    }
  };

  const handleRemoveFile = () => { setFile(null); setPageCount(0); };

  // ── Core upload function ───────────────────────────────────────────────────
  // overrideToken: token from post-signup retry; falls back to state → localStorage
  const handleUpload = async (overrideToken = null) => {
    if (!file) {
      toast({ title: 'No file selected', description: 'Please select a PDF file to convert.', variant: 'destructive' });
      return;
    }
    if (!validateFile(file)) return;

    setUploading(true);

    try {
      const formData = new FormData();
      formData.append('file', file);

      // Resolve auth token: retry param → component state → localStorage
      const token = overrideToken || authToken || localStorage.getItem('sb_access_token');
      const headers = token ? { Authorization: `Bearer ${token}` } : {};

      const response = await fetch(CONVERT_ENDPOINT, { method: 'POST', headers, body: formData });

      // Always parse JSON first — needed for quota error details
      const data = await response.json();

      // Handle ALL quota / daily-limit responses with the inline modal.
      // Covers: new 429 QUOTA_EXCEEDED, old 403 DAILY_LIMIT_REACHED, and
      // any other 403/429 where the backend didn't set a specific code.
      if (
        data.code === 'QUOTA_EXCEEDED' ||
        data.code === 'DAILY_LIMIT_REACHED' ||
        response.status === 429 ||
        response.status === 403
      ) {
        setQuotaModal({
          visible: true,
          type: data.requiresUpgrade === true ? 'upgrade' : 'signup',
          message: data.error || 'You have reached your daily conversion limit.',
          pageCount: data.pageCount,
          signupSuccess: false,
          readyToken: null,
        });
        return;
      }

      if (!response.ok) throw new Error(data.error || `Upload failed with status: ${response.status}`);
      if (data.error) throw new Error(data.error);

      if (onConversionComplete) {
        onConversionComplete({
          transactions:     data.transactions,
          bank:             data.bank,
          accountName:      data.accountName,
          accountNumber:    data.accountNumber,
          bsb:              data.bsb,
          statementPeriod:  data.statementPeriod,
          openingBalance:   data.openingBalance,
          closingBalance:   data.closingBalance,
          validation:       data.validation,
          originalFilename: file.name,
          pageCount,
        });
      }

      setFile(null);
      setPageCount(0);

    } catch (error) {
      console.error('Upload error:', error);
      toast({ title: 'Conversion Failed', description: error.message || 'An error occurred. Please try again.', variant: 'destructive' });
    } finally {
      setUploading(false);
    }
  };

  // ── Inline signup (inside quota modal) ────────────────────────────────────
  const handleSignup = async () => {
    if (!signupForm.email || !signupForm.password) {
      setSignupForm(f => ({ ...f, error: 'Please enter your email and a password.' }));
      return;
    }
    setSignupForm(f => ({ ...f, loading: true, error: '' }));
    try {
      const res  = await fetch(SIGNUP_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: signupForm.email, password: signupForm.password, firstName: signupForm.firstName }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Signup failed. Please try again.');

      const token = data.session?.access_token || null;
      if (token) {
        localStorage.setItem('sb_access_token', token);
        setAuthToken(token);
      }

      // Store token directly in modal state — avoids stale-closure issue where
      // React state may not have settled before "Continue Converting" is clicked.
      setQuotaModal(m => ({ ...m, signupSuccess: true, readyToken: token }));
    } catch (err) {
      setSignupForm(f => ({ ...f, error: err.message }));
    } finally {
      setSignupForm(f => ({ ...f, loading: false }));
    }
  };

  // ── Retry after signup ─────────────────────────────────────────────────────
  // Reads token from quotaModal.readyToken (set at signup time, same render),
  // falls back to localStorage. Does NOT rely on authToken state settling.
  const retryConversion = async (readyToken) => {
    const token = readyToken || localStorage.getItem('sb_access_token');
    setQuotaModal({ visible: false });
    setSignupForm({ firstName: '', email: '', password: '', loading: false, error: '' });
    await handleUpload(token);
  };

  const closeModal = () => {
    setQuotaModal({ visible: false });
    setSignupForm({ firstName: '', email: '', password: '', loading: false, error: '' });
  };

  // ── Modal content ──────────────────────────────────────────────────────────
  const renderModalContent = () => {
    // "Access Unlocked" state after successful signup
    if (quotaModal.signupSuccess) {
      return (
        <div className="text-center">
          <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="w-8 h-8 text-green-600" />
          </div>
          <h2 className="text-xl font-bold text-[#0A2342] mb-2">Access Unlocked</h2>
          <p className="text-gray-600 text-sm mb-6">
            Your free account is ready — you have 6 pages per day.
          </p>
          <Button
            onClick={() => retryConversion(quotaModal.readyToken)}
            className="w-full bg-[#0A2342] hover:bg-[#0d2e57] text-white font-semibold py-3"
          >
            <CheckCircle className="w-4 h-4 mr-2" />
            Continue Converting
          </Button>
        </div>
      );
    }

    // Signup modal with inline form
    if (quotaModal.type === 'signup') {
      return (
        <>
          <h2 className="text-xl font-bold text-[#0A2342] mb-2">
            Sign up to convert this statement
          </h2>
          <p className="text-gray-600 text-sm mb-5 leading-relaxed">{quotaModal.message}</p>

          <div className="flex flex-col gap-3 mb-4">
            <input
              type="text"
              placeholder="First name"
              value={signupForm.firstName}
              onChange={e => setSignupForm(f => ({ ...f, firstName: e.target.value }))}
              onKeyDown={e => e.key === 'Enter' && handleSignup()}
              className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#0A2342] focus:border-transparent"
            />
            <input
              type="email"
              placeholder="Email address"
              value={signupForm.email}
              onChange={e => setSignupForm(f => ({ ...f, email: e.target.value }))}
              onKeyDown={e => e.key === 'Enter' && handleSignup()}
              className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#0A2342] focus:border-transparent"
            />
            <input
              type="password"
              placeholder="Password (min 6 characters)"
              value={signupForm.password}
              onChange={e => setSignupForm(f => ({ ...f, password: e.target.value }))}
              onKeyDown={e => e.key === 'Enter' && handleSignup()}
              className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#0A2342] focus:border-transparent"
            />
            {signupForm.error && (
              <p className="text-red-600 text-xs">{signupForm.error}</p>
            )}
          </div>

          <div className="flex flex-col gap-3">
            <Button
              onClick={handleSignup}
              disabled={signupForm.loading}
              className="w-full bg-[#0A2342] hover:bg-[#0d2e57] text-white font-semibold py-3"
            >
              {signupForm.loading ? (
                <span className="flex items-center justify-center gap-2">
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Creating account…
                </span>
              ) : 'Create Free Account — 6 pages/day'}
            </Button>
            <Button
              onClick={closeModal}
              variant="outline"
              className="w-full border-[#0A2342] text-[#0A2342] hover:bg-[#0A2342] hover:text-white font-semibold py-3"
            >
              Upgrade to Pro · $19/mo
            </Button>
            <button
              onClick={closeModal}
              className="w-full text-gray-500 hover:text-gray-700 text-sm py-2 transition-colors"
            >
              Cancel
            </button>
          </div>
        </>
      );
    }

    // Upgrade modal (pro/accountant user at limit, or free-registered at limit)
    return (
      <>
        <h2 className="text-xl font-bold text-[#0A2342] mb-2">Upgrade for unlimited pages</h2>
        <p className="text-gray-600 text-sm mb-6 leading-relaxed">{quotaModal.message}</p>
        <div className="flex flex-col gap-3">
          <Button
            onClick={() => { closeModal(); document.getElementById('pricing')?.scrollIntoView({ behavior: 'smooth' }); }}
            className="w-full bg-[#0A2342] hover:bg-[#0d2e57] text-white font-semibold py-3"
          >
            Upgrade to Pro — Unlimited pages · $19/mo
          </Button>
          <button
            onClick={closeModal}
            className="w-full text-gray-500 hover:text-gray-700 text-sm py-2 transition-colors"
          >
            Cancel
          </button>
        </div>
      </>
    );
  };

  return (
    <>
      {/* Quota / signup modal */}
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
              {renderModalContent()}
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
                    <p className="text-gray-600">Supports PDF files up to 3MB • First 3 pages free daily</p>
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
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="text-center">
                <Button
                  onClick={() => handleUpload()}
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
