const API_URL = 'https://connect.mailerlite.com/api/subscribers';

/**
 * Add or update a subscriber in MailerLite.
 * @returns {{ success: boolean, alreadySubscribed?: boolean, error?: string }}
 */
export async function addSubscriber({ email, firstName }) {
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.MAILERLITE_API_KEY}`,
    },
    body: JSON.stringify({
      email: email.trim().toLowerCase(),
      fields: { name: firstName.trim() },
      groups: process.env.MAILERLITE_GROUP_ID ? [process.env.MAILERLITE_GROUP_ID] : [],
      status: 'active',
    }),
  });

  if (res.status === 200 || res.status === 201) return { success: true };
  if (res.status === 409) return { success: true, alreadySubscribed: true };

  let msg = 'Failed to subscribe. Please try again.';
  try {
    const body = await res.json();
    if (body?.message) msg = body.message;
  } catch (_) {}

  return { success: false, error: msg };
}
