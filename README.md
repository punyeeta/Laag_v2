# Laag

## About

*Laag* is Bisaya for going out or wandering around. Groups usually plan a trip in a shared document for the plan and a sheet for the money, and do the math by hand every time something changes. Laag replaces both.

It's built for the messy parts of real group trips:

- **Prices you aren't sure of yet.** A price can be exact, a range, an estimate (~₱1,000 counts as ₱1,000 to ₱1,200), or unknown. The app shows totals as a range until everything is confirmed.
- **People who join or drop out late.** Totals count only people marked Going. People marked Maybe appear as a "what if they join?" preview.
- **Costs that don't split evenly**, such as per person, per group (a guide fee for every 5 visitors), or only for some people (life vests).
- **Gas**, estimated from the route distance, your car's km/L and the current fuel price.
- **Logging expenses on the trip, even with no signal.** Expenses sync when you're back online.
- **Settling up**, with the fewest transfers needed so everyone ends at zero.

## Features

| Area | What you can do |
|---|---|
| Trips | Create, duplicate and pin trips. Trips are grouped as Planning, Ongoing and Settled. |
| Plan | Stops, costs with certainty levels, gas settings, and live totals per person. |
| People | Invite with one link, add people by name (including guests without phones), mark Going / Maybe / Out, and see what each person should bring. |
| Expenses | Quick-add from a phone, paid from the pool or by a person, and choose who each cost is split between. |
| Settle up | Balances and transfers, and marking each transfer as paid. |
| Checklists | Food and materials, each item assigned to someone or marked bring-your-own. |
| Notes | One shared note per trip. |
| Activity | Who changed what, with undo. The organizer can undo all changes made by a removed member. |
| Profile | Default name, saved cars, new-trip defaults and pinned trip. |

## Roles

- **Organizer:** whoever creates the trip, signed in with Google. Can manage people, reset the invite link, turn on join approval, and delete the trip.
- **Member:** joins from the invite link by tapping their name. No account needed. Can edit everything in the trip.
- **Guest:** a person added by name who hasn't joined. Others can log expenses for them.

Joining is instant by default. Organizers who post their link publicly can turn on **Require approval to join** for that trip.

## Tech stack

| Layer | Tools |
|---|---|
| Frontend | React, TypeScript, Tailwind CSS, Framer Motion |
| Backend | Firebase Auth (Google and anonymous sign-in) and Cloud Firestore (with offline cache) |
| Testing | Vitest, plus the Firebase Emulator Suite with @firebase/rules-unit-testing |
| Hosting | Vercel or Firebase Hosting. There's no server code of our own. |
| App | Installable PWA |

## Run it locally

```bash
npm install
npm run dev   
npm test      
npm run build
```

The app needs a Firebase web config in a `.env.local` file, with `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_STORAGE_BUCKET`, `VITE_FIREBASE_MESSAGING_SENDER_ID` and `VITE_FIREBASE_APP_ID`. Deploy the security rules with `npx firebase deploy --only firestore`.
