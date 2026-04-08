import { useState } from 'react';
import { UNLOCK_ENDPOINT } from '@/config/api';
import { useToast } from '@/components/ui/use-toast';

export const useDailyLimit = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  const { toast } = useToast();

  const openModal = () => {
    setIsOpen(true);
    setSuccess(false);
    setError(null);
  };

  const closeModal = () => {
    setIsOpen(false);
  };

  const submitEmail = async (email) => {
    setIsLoading(true);
    setError(null);

    try {
      // Task 1 Context & Task 3: Backend now automatically detects IP.
      // Removed client-side IP fetch to improve speed and privacy handling.
      // Task 3: Verifying only email is sent in the body.
      const response = await fetch(UNLOCK_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email }),
      });

      if (!response.ok) {
        throw new Error('Failed to unlock access. Please try again.');
      }

      setSuccess(true);
      toast({
        title: "Access Granted! 🔓",
        description: "You can now process 10 more pages.",
        className: "bg-green-50 border-green-200"
      });

    } catch (err) {
      console.error(err);
      setError(err.message || "An error occurred");
      toast({
        title: "Unlock Failed",
        description: err.message || "Could not process your request.",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  return {
    isOpen,
    isLoading,
    error,
    success,
    openModal,
    closeModal,
    submitEmail
  };
};