# ZeroSpot Admin Login + Booking Dashboard

## Admin credential

The application is configured for exactly one admin login:

- Email: `admin@zerospot.in`
- Password: set this value in the backend `.env` as `ADMIN_PASSWORD`.

The password is **not embedded in HTML/JavaScript**. The backend rejects every admin email other than `ADMIN_EMAIL`.

## Files

- `admin-login.html` — dedicated admin login page.
- `admin.html` — admin booking dashboard. It shows all booking data submitted by the customer.
- `appointment.html` — customer booking flow; it already sends the complete `bookingState` to `POST /api/bookings` before confirmation.
- `backend.js` — Express + Firebase Admin backend, including `/api/admin/login`, booking creation, admin booking list, and status updates.
- `firestore.rules` — denies direct browser reads/writes to customer and booking collections.
- `scripts/create-admin.js` — creates or updates the single Firebase admin account and sets `role: admin`.

## Setup

1. Put your Firebase Admin SDK file at:

   `serviceAccountKey.json`

2. Copy `.env.example` to `.env`.

3. Set the real Firebase web API key and the admin password in `.env`:

   `FIREBASE_API_KEY=...`

   `ADMIN_EMAIL=admin@zerospot.in`

   `ADMIN_PASSWORD=...`

4. Install dependencies:

   `npm install express cors dotenv firebase-admin`

5. Create/update the single admin account:

   `node scripts/create-admin.js`

6. Start the backend:

   `node backend.js`

7. Open `admin-login.html` through your web server. After login, the page redirects to `admin.html`.

## Security behavior

- Only `admin@zerospot.in` is accepted by `/api/admin/login`.
- The backend verifies the Firebase ID token before returning bookings.
- The backend additionally requires `users/{uid}.role == "admin"`.
- Firestore rules deny direct browser access to bookings and users.
- The customer booking endpoint remains available for guest bookings.
- Admin session tokens are kept in `sessionStorage` by the browser and cleared on logout.

## Booking data shown

The admin dashboard reads the complete booking document, including customer name, phone, email, city/location, full address, service, service-specific selections, extras, notes, preferred date, preferred time slot, booking ID, status, and timestamps. Unknown/custom fields are also shown in the details view so customer-provided information is not silently omitted.
