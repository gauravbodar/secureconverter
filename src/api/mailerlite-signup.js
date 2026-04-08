/**
 * Subscribes a user to the MailerLite waitlist via the Vercel backend endpoint.
 * The backend keeps the API key server-side.
 * Falls back to calling MailerLite directly if VITE_ env vars are available
 * (e.g., in local dev before the backend is deployed).
 *
 * @param {{ email: string, firstName: string }} params
 * @returns {Promise<{ success: boolean, alreadySubscribed?: boolean, error?: string }>}
 */
export async function subscribeToWaitlist({ email, firstName }) {
  const response = await fetch('/api/mailerlite-signup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: email.trim().toLowerCase(), firstName: firstName.trim() }),
  });

  try {
    const data = await response.json();
    if (data.success) return { success: true, alreadySubscribed: !!data.alreadySubscribed };
    return { success: false, error: data.error || 'Something went wrong. Please try again.' };
  } catch (_) {
    return { success: false, error: 'Something went wrong. Please try again.' };
  }
}
