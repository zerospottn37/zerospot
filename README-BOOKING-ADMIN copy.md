# ZeroSpot Booking -> Admin Panel

## Files

- `appointment.html` — existing customer booking page, updated to save the complete `bookingState` to the backend before showing confirmation.
- `admin.html` — admin booking dashboard.
- `backend.js` — existing backend plus booking APIs.
- `firestore.rules` — blocks direct browser access to bookings/users; the trusted Firebase Admin SDK is used by the backend.

## 1. Backend

Replace your current backend.js with the generated `backend.js`.

Your existing backend already expects:

- `serviceAccountKey.json` in the backend folder
- `.env`
- `FIREBASE_API_KEY`
- Firebase Admin credentials

Install dependencies if necessary:

    npm install express cors dotenv firebase-admin

Start:

    npm start

or:

    node backend.js

## 2. Enable Firestore

The current project previously returned a `SERVICE_DISABLED` error for Cloud Firestore.

In Google/Firebase Console, enable the Firestore API and create the Firestore database before testing bookings.

## 3. Admin account

The admin panel checks:

    users/{firebaseUid}.role === "admin"

So create/sign in the admin Firebase account, then set that user's Firestore profile:

    {
      "role": "admin"
    }

Do not make all users admins.

## 4. API URL

Both pages default to:

    http://localhost:5000

For production, set:

    window.ZS_API_BASE = "https://YOUR-BACKEND-DOMAIN";

before the page scripts, or replace the fallback constant in both HTML files.

## 5. Booking document

Every customer submission creates:

    bookings/{autoDocumentId}

with the complete booking payload, including:

- bookingId
- name
- phone
- email
- location
- address
- service
- serviceSummary
- BHK / room selections
- bathrooms
- office configuration
- restaurant/hotel/shop configuration
- A/C complaint selections
- extra items
- notes
- preferred date
- preferred time slot
- status
- createdAt
- updatedAt
- source

The exact fields vary by the service selected, but the complete current `bookingState` is sent so service-specific information is not lost.

## 6. Important behavior

The booking is saved to Firestore BEFORE the confirmation screen is shown.

WhatsApp remains separate from the database. The Admin Panel reads the Firestore booking, so the admin does not depend on WhatsApp messages.
