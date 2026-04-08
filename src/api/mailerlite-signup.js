const MAILERLITE_API_KEY = import.meta.env.VITE_MAILERLITE_API_KEY;
const MAILERLITE_GROUP_ID = import.meta.env.VITE_MAILERLITE_GROUP_ID;
const MAILERLITE_API_URL = 'https://connect.mailerlite.com/api/subscribers';

/**
 * Subscribes a user to the MailerLite waitlist group.
 * @param {{ email: string, firstName: string }} params
 * @returns {Promise<{ success: boolean, alreadySubscribed?: boolean, error?: string }>}
 */
export async function subscribeToWaitlist({ email, firstName }) {
  const normalizedEmail = email.trim().toLowerCase();

  const response = await fetch(MAILERLITE_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${MAILERLITE_API_KEY}`,
    },
    body: JSON.stringify({
      email: normalizedEmail,
      fields: {
        name: firstName.trim(),
      },
      groups: MAILERLITE_GROUP_ID ? [MAILERLITE_GROUP_ID] : [],
      status: 'active',
    }),
  });

  if (response.status === 200 || response.status === 201) {
    return { success: true };
  }

  // MailerLite returns 409 for duplicates — treat as already subscribed
  if (response.status === 409) {
    return { success: true, alreadySubscribed: true };
  }

  let errorMessage = 'Something went wrong. Please try again.';
  try {
    const data = await response.json();
    if (data?.message) errorMessage = data.message;
  } catch (_) {}

  return { success: false, error: errorMessage };
}
