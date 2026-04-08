# CLAUDE CODE PROMPT: Add MailerLite Waitlist Integration to Bank Statement Converter

## PROJECT CONTEXT
I have an existing React/Vite site: AU Bank Statement to CSV Converter (Micro-SaaS)
Location: C:\AWS\securestatement
The site is built with: React + Vite + Tailwind CSS

Original design: Modern, clean, minimalist. Deep Navy Blue, Crisp White, light Grey accents.

## GOAL
Add a **MailerLite-integrated waitlist landing page** to the existing site while maintaining the original design system.

## WHAT TO ADD

### 1. NEW LANDING PAGE: /waitlist
Create a new React component for the waitlist signup page with these elements:

**Design Requirements:**
- Match existing site design (Deep Navy Blue, White, Grey)
- Professional, trustworthy tone
- Mobile responsive
- Single column form on right side, content on left side (desktop view)

**Content Structure:**
- Hero headline: "Convert Bank Statements in 30 Seconds"
- Sub-headline: "Turn messy PDF bank statements into clean spreadsheets. Automatically."
- Three feature callouts with icons:
  - Lightning Fast (⚡)
  - Secure & Private (🔒)
  - Ready to Use (📊)
- Email signup form (First Name + Email)
- Success message on submit
- Three-step "How It Works" section at bottom
- Footer with launch date and security note

**Form Functionality:**
- Validation: First name required, valid email required
- On submit: POST to /api/mailerlite-signup endpoint
- Loading state while submitting
- Error handling with user-friendly messages
- Success state shows: "You're on the list! 🎉"
- Auto-clear form after success

**MailerLite Integration:**
- Form posts to backend endpoint: /api/mailerlite-signup
- Include first_name and email in payload
- Backend handles API authentication (API key never exposed to frontend)

### 2. NEW API ENDPOINT: /api/mailerlite-signup
Create a backend API endpoint that:

**Functionality:**
- Receives POST request with: { email, firstName }
- Validates email format
- Calls MailerLite API to add subscriber to group
- Returns success/error response
- Handles duplicate emails gracefully

**Security:**
- API key stored in environment variables (MAILERLITE_API_KEY, MAILERLITE_GROUP_ID)
- Never expose API key to frontend
- Input validation on backend
- CORS enabled for your domain only

**Tech:**
- Use fetch() to call: https://api.mailerlite.com/api/v1/subscribers
- Bearer token authentication with API key
- Handle both success and error responses from MailerLite

### 3. UPDATE ROUTING
Add route to your main router file:
- Path: /waitlist
- Component: BankStatementWaitlist (new component)
- No authentication required

### 4. UPDATE NAVIGATION (Optional)
If you want to add a link in your main navigation:
- Add "Waitlist" link that goes to /waitlist
- Or leave navigation as-is (traffic will come from external links)

## IMPLEMENTATION REQUIREMENTS

### File Structure
```
src/
├── components/
│   ├── BankStatementWaitlist.jsx (NEW - React component)
│   ├── ... (existing components)
├── api/
│   └── mailerlite-signup.js (NEW - backend endpoint)
├── App.jsx (UPDATE - add route)
└── ... (existing files)
```

### Environment Variables Needed
```
REACT_APP_MAILERLITE_GROUP_ID=your_group_id
MAILERLITE_API_KEY=mlsn_your_api_key
```

### Dependencies
- Should already have: React, Tailwind CSS, lucide-react icons
- No new dependencies needed

## DESIGN CONSISTENCY

**Color Palette (must match existing site):**
- Primary Blue: #0066cc (or your existing blue)
- White: #ffffff
- Light Grey: #f5f5f5
- Dark Grey: #333333
- Accent Grey: #666666

**Typography:**
- Headings: Bold, 18-32px (match existing site)
- Body: Regular, 14-16px (match existing site)
- Use same font family as existing site

**Spacing & Layout:**
- Max-width: 1200px (match existing site)
- Padding: 4rem sides on desktop, 2rem on mobile
- Gap between sections: 3-4rem

**Button Styles:**
- Primary button: Blue background, white text
- Hover: Darker blue
- Disabled: Grey
- Border radius: Match existing site style

## FORM VALIDATION RULES

**First Name:**
- Required
- Min length: 2 characters
- Max length: 50 characters

**Email:**
- Required
- Valid email format (regex: /^[^\s@]+@[^\s@]+\.[^\s@]+$/)
- Trim whitespace
- Convert to lowercase for submission

**Error Messages:**
- "Please fill in all fields"
- "Please enter a valid email address"
- "Something went wrong. Please try again."
- "Already on the waitlist" (if MailerLite returns duplicate)

**Success Message:**
- "You're on the list! 🎉"
- "Thanks for signing up, [FirstName]! We'll send you early access on April 15."
- "Check your email for confirmation"

## MAILERLITE API DETAILS

**Endpoint:** POST https://api.mailerlite.com/api/v1/subscribers

**Request Headers:**
```
Content-Type: application/json
Authorization: Bearer {MAILERLITE_API_KEY}
```

**Request Body:**
```json
{
  "email": "user@example.com",
  "fields": {
    "first_name": "John"
  },
  "groups": ["GROUP_ID"],
  "status": "active"
}
```

**Success Response:** 200 or 201 status

**Expected Behavior:**
- New subscriber added to group
- If subscriber already exists, update their data
- Return appropriate response to frontend

## TESTING REQUIREMENTS

After implementation, test:
1. ✓ Can navigate to /waitlist
2. ✓ Form validation works (empty fields, invalid email)
3. ✓ Can submit form with valid data
4. ✓ Loading state shows while submitting
5. ✓ Success message appears after submit
6. ✓ New subscriber appears in MailerLite account
7. ✓ Mobile responsive layout
8. ✓ Form clears after success
9. ✓ Can submit multiple times (different emails)
10. ✓ Error handling works (show error message if API fails)

## ADDITIONAL NOTES

**Security Focus:**
- Never log or expose API keys
- Validate all inputs on backend (don't trust frontend)
- Use HTTPS for all API calls
- Keep MailerLite API key in environment variables only

**User Experience:**
- Form should be quick and simple (2 fields only)
- Clear confirmation message
- Mobile-first responsive design
- Loading indicator while submitting

**Performance:**
- Component should load quickly
- Images optimized
- No unnecessary API calls
- Graceful error handling

**Branding:**
- Match existing site's professional tone
- Maintain deep navy blue + white color scheme
- Use consistent spacing and typography
- Include security messaging (similar to main site)

## DELIVERABLES

1. ✓ New React component: BankStatementWaitlist.jsx
2. ✓ New API endpoint: mailerlite-signup.js  
3. ✓ Updated routing in App.jsx
4. ✓ Working form with MailerLite integration
5. ✓ Error handling and validation
6. ✓ Success state and messaging
7. ✓ Mobile responsive design
8. ✓ Tested and ready to deploy

## OPTIONAL ENHANCEMENTS (Can do later)

- Add a banner on main site linking to /waitlist
- Track conversion metrics (Google Analytics event)
- Add discount code display after signup
- Create branded thank you email template in MailerLite
- Add social proof (testimonial carousel)

---

## HOW TO USE THIS PROMPT

1. Go to Claude Code
2. Upload your project directory: C:\AWS\securestatement
3. Copy this entire prompt
4. Paste in Claude Code chat
5. Claude will implement the changes
6. Deploy to test

**This prompt is specific, detailed, and ready for Claude Code implementation.**