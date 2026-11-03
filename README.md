# ST. CECILIA CHOIR - HTCC NAZE

### *Official Digital Library and Community Portal*

Welcome to the official repository for the **St. Cecilia Choir, Holy Trinity Catholic Church (HTCC) Naze**. This platform serves as a centralized hub for choristers to access liturgical music, stay updated on parish events, and celebrate our ministry through media.

Built as a Progressive Web App (PWA), it supports offline access to cached pages, an installable app experience, live in-app updates, and browser notifications when allowed. VAPID-backed push delivery can notify subscribed devices while the app is closed.

---

## 🎵 Project Overview

The goal of this website is to bridge the gap between traditional liturgical music and modern accessibility. It provides a structured environment for choristers to study their parts and for the parish community to engage with the choir's activities.

### Key Modules

* **🎼 Musical Scores & Scripts Library:** A searchable database of PDF scores, Tonic Sol-fa sheets, and MIDI/MP3 rehearsal files categorized by Liturgical Season (Advent, Lent, Ordinary Time, etc.). Features Google Drive integration for score storage and retrieval.
* **📖 Member Hymn Library:** Logged-in members can search the Catholic, Assumpta, and Legion of Mary collections by hymn number or title. Authorized hymn data is cached on the device after first access for offline reading.
* **📅 Choir Events Page:** A public event page for current choir events and a restored archive of earlier celebrations. Featured November and December 2026 events include flyers; Music Boom has a live days, hours, minutes, and seconds countdown.
* **🤖 Cecilia AI Chat Assistant:** An AI-powered liturgical music assistant powered by Groq, capable of answering questions about music, liturgy, choir policies, and more.
* **👥 Member Portal:** A personalized dashboard for choristers with Next Rehearsal and event countdowns, quick-access cards with helpful hover/focus tips, and “NEW” markers for recently added features.
* **📸 Media Gallery:** A responsive carousel and grid view showcasing photographs and videos from various performances and church functions.
* **🏛️ Executives Page:** A dedicated page highlighting the current choir executive committee members and their roles.
* **📊 Attendance Tracking:** Record and track attendance for rehearsals and events. Members can mark their own attendance; admins can manage all records.
* **🔔 Notifications System:** In-app and push notifications for rehearsal reminders, new scores, announcements, and choir updates. Includes Delete All and per-item delete.
* **📢 Announcement Box:** Admin-only broadcast system to send choir-wide announcements with optional date, time, and links. Announcements appear on the Member-home page and in the Notifications feed.
* **🙏 Order of Mass:** Multilingual Catholic Order of Mass reference with English, Latin, and Igbo texts, organized by liturgical section with speaker roles and full prayers.
* **⚙️ Settings:** Dark/light mode toggle, theme preference, account security, notification preferences, and legal/documentation links.

---

## 🚀 Features

### Core Platform
* **Progressive Web App (PWA):** Installable on mobile and desktop, with service-worker caching and VAPID-backed push notifications.
* **Mobile-First Design:** Easy access to sheet music directly from a smartphone during rehearsals, with bottom navigation bar for mobile app feel.
* **Dark / Light Mode:** Toggle between themes or auto-switch based on system preference.
* **Dynamic Greetings:** Personalized welcome messages that adapt based on time of day and liturgical season.
* **Responsive UI:** Works across all screen sizes from mobile to desktop.
* **Form Validation:** Client-side email and password validation with real-time error messages.
* **Password Visibility Toggle:** Eye icon button to show/hide passwords on login and registration forms.
* **Donation Toggle:** Landing page donation section with toggleable bank account details.
* **Legal & Documentation Links:** Terms & Conditions, Privacy Policy, and User Documentation accessible from Login, Register, Profile, and Settings pages.
* **Performance Optimized:** Preconnect hints, lazy loading, reduced-motion support, and optimized service worker caching for fast loading on all devices.
* **Global Error Handling:** User-friendly error messages for network issues, auth failures, file uploads, and server errors, with console logging for debugging.

### Member Portal
* **Next Rehearsal Countdown:** Real-time countdown timer showing time remaining until the next scheduled rehearsal.
* **Sunday Mass Countdown:** Countdown timer for the next scheduled Sunday Mass.
* **Sunday Mass Times:** First Mass at 5:30 AM and second Mass at 10:00 AM.
* **Daily Rehearsals:** The dashboard highlights ongoing rehearsals preparing for St. Cecilia’s Feast, Music Boom, and the 2026 Christmas and New Year celebrations.
* **Quick-Access Cards:** Bento-style grid for Scores, Attendance, Cecilia AI, Events, Order of Mass, and more. Each action has a hover or keyboard-focus tooltip; recently added features are marked “NEW.”
* **Upcoming Event Countdown:** Music Boom’s featured card counts down live in days, hours, minutes, and seconds. Past event cards remain in the public archive alongside current listings.
* **Personalized Dashboard:** Tailored home screen for logged-in members.
* **Mixed Updates Feed:** Announcements, new scores, and new events displayed together in the Announcements section with type icons and colors.
* **Admin Floating Button:** Quick access to Announcement Box for admins and executives.
* **Admin Dashboard Link:** Direct link to admin login for authorized personnel.

### Musical Scores
* **Search & Filter:** Search by title or composer, filter by category and voice part.
* **Alphabetical Sorting:** Sort scores A-Z or Z-A.
* **Category Filters:** Browse by liturgical season, voice part, or composer.
* **Google Drive Integration:** Scores stored and streamed from Google Drive via the Drive API.

### Member Hymn Library
* Members open the hymn-book catalogue from the dashboard. It currently lists the Catholic Hymn Book, Assumpta Hymnal, and Legion of Mary Hymn Book.
* Hymn records are served through the authenticated `/api/hymns?book=<book-id>` endpoint. The JSON files are not meant to be opened as public static URLs. Successful authenticated API responses can be cached by the service worker for use on that device while offline.
* Search matches hymn number, title, and optional category. The reader is shared by all books and selects the requested collection through its `book` query parameter.
* Add records to the appropriate file: `public/data/hymns.json`, `public/data/assumpta-hymns.json`, or `public/data/legion-of-mary-hymns.json`. The format is a root-level array. Each verse has a display label and text lines; an optional `chorus` or `refrain` can be supplied separately. Include text only when it is public domain or the choir has permission to reproduce it:
  ```json
  [
    {
      "number": 1,
      "suffix": "",
      "title": "Hymn title",
      "category": "Opening",
      "verses": [
        { "label": "VERSE 1", "lines": ["First line", "Second line"] }
      ],
      "chorus": { "label": "Chorus", "lines": ["Chorus line"] }
    }
  ]
  ```

### Member portal guide

The [By Law / Constitution page](./public/constitution.html) also includes a practical member portal guide. It explains how to find events and their archive, use hymn and Mass resources, review ledger balances, reserve Music Boom tickets, and enable browser notifications. This guide is separate from the official constitution text.

### Cecilia AI
* **Source-grounded references:** Exact hymn, Order of Mass, and available constitution questions are answered from the local data, with a source label. If the requested text is missing or the constitution does not contain numbered sections, Cecilia says so rather than guessing.
* The structured constitution reference at `public/data/choir-constitution.json` is marked partial; update it only from the complete, approved choir document.
* For exact section lookups, store approved sections under their article as `{ "number": 20, "text": "Exact approved wording" }`. Cecilia will quote a matching section and will ask for the article if the section number is ambiguous.
* **AI-Powered Assistant:** Chat-based interaction using Groq LLM for general liturgical and music conversation.
* **Liturgical Music Expertise:** Answers questions about choir music, rehearsals, and liturgy.
* **Chat History:** Maintains conversation context within a session.
* **Clear Chat History:** Users can delete all their AI chat history at any time.
* **Browser Notifications:** Browser alerts for AI chat errors and successes when notifications are allowed.

### Attendance
* **Self-Service Attendance:** All logged-in users can mark their own attendance for events.
* **Admin Management:** Admins and executives can view and manage all attendance records.
* **Real-time Stats:** Present, absent, and excused counts update instantly.
* **Saved Records:** View historical attendance by event date.

### Notifications
* **In-App Notifications:** Center for all choir announcements and reminders.
* **Browser Notifications:** Service-worker notifications for live alerts and VAPID push delivery while the app is closed.
* **Mark All As Read:** Bulk-read functionality.
* **Delete All:** Clear all notifications at once.
* **Announcements Feed:** Announcements from the Announcement Box appear in the notifications feed with delete capability.

### Announcement Box (Admin)
* **Broadcast Messaging:** Admins and executives can send announcements to all choir members.
* **Rich Content:** Optional date, time, and link fields for each announcement.
* **Edit & Delete:** Admins can edit or delete announcements after publishing.
* **Multi-Platform Display:** Announcements appear on the Member-home page and in the Notifications feed.

### Order of Mass
* **Multilingual Support:** Toggle between English, Latin, and Igbo liturgical texts.
* **Structured Sections:** Organized by Introductory Rites, Liturgy of the Word, Liturgy of the Eucharist, Communion Rite, and Concluding Rite.
* **Speaker Roles:** Color-coded speakers (Priest, People, All) for easy reading.
* **Full Text Display:** Complete liturgical prayers without truncation.
* **Icon Fallbacks:** Unicode fallbacks for all section icons.

### Admin Dashboard
* **Admin Login:** Dedicated admin login page (`admin-login.html`) for authorized personnel.
* **Dashboard Overview:** Stats for members, scores, events, attendance, and pending items.
* **Recent Members & Scores:** Quick view of latest registrations and uploaded scores with links to full pages.
* **Quick Actions:** Fast links to Create Event, Song List Builder, Attendance, Upload Score, Members Directory, Send Notice, Executives, and Image Gallery.
* **Send Notice:** Broadcast announcements to all choir members with optional date, time, and links.
* **All Users Management:** View user information as an admin or exco; only admins can delete accounts. Admin/exco access is checked against the current database role.

---

## 🛠️ Technology Stack

* **Runtime:** Node.js
* **Backend Framework:** Express.js
* **Frontend:** HTML5, CSS3, Vanilla JavaScript (no framework)
* **Styling:** CSS Custom Properties (Design System), component-based CSS
* **Database:** Supabase (PostgreSQL) for user data, score metadata, and event logs
* **Storage:** Cloudinary (images), Google Drive API (score files)
* **AI:** Groq SDK for the Cecilia AI chat assistant
* **Authentication:** JWT (JSON Web Tokens) with bcryptjs password hashing
* **Media Handling:** Multer for file uploads
* **Deployment:** Vercel (Node.js serverless functions)

---

## 📂 Directory Structure

```text
st-cecilia-choir-HTCCnaze/
├── public/                    # Static assets and web pages
│   ├── css/
│   │   ├── design-system.css  # CSS custom properties and design tokens
│   │   ├── components.css     # Component-level styles
│   │   └── styles.css         # Global styles
│   ├── js/
│   │   ├── shared.js          # Shared utilities and helpers
│   │   ├── scores.js          # Musical scores page logic
│   │   ├── musical-score.js   # Individual score view logic
│   │   ├── member-home.js     # Member portal dashboard logic
│   │   ├── cecilia-ai.js      # AI assistant chat logic
│   │   ├── attendance.js      # Attendance tracking logic
│   │   ├── image-gallery.js   # Gallery carousel and grid logic
│   │   ├── executives.js      # Executives page logic
│   │   ├── dashboard.js       # Admin dashboard logic
│   │   ├── events.js          # Events calendar logic
│   │   ├── notifications.js   # Notifications logic
│   │   ├── settings.js        # Dark mode and preferences
│   │   ├── members.js         # Member directory logic
│   │   ├── members-directory.js
│   │   ├── login.js           # Authentication logic
│   │   ├── register.js        # Registration logic
│   │   ├── profile.js         # User profile logic
│   │   ├── order-of-mass.js   # Order of Mass multilingual page
│   │   ├── announcement-box.js # Admin announcement broadcast page
│   │   ├── create-event.js    # Event creation logic
│   │   ├── event-songs.js     # Song list builder logic
│   │   └── admin-dashboard.js # Admin dashboard logic
│   ├── IMAGES/                # Logo, choir photos, and static images
│   ├── icons/                 # App icons
│   ├── data/                  # JSON data files
│   │   └── order-of-mass.json # English, Latin, Igbo Order of Mass texts
│   ├── index.html             # Landing page
│   ├── member-home.html       # Member portal dashboard
│   ├── scores.html            # Musical Scores page
│   ├── musical-score.html     # Individual score detail page
│   ├── cecilia-ai.html        # AI assistant chat page
│   ├── attendance.html        # Attendance tracking page
│   ├── image-gallery.html     # Image gallery with carousel
│   ├── executives.html        # Executives committee page
│   ├── events.html            # Events calendar page
│   ├── notifications.html     # Notifications center
│   ├── order-of-mass.html     # Order of Mass multilingual page
│   ├── announcement-box.html  # Admin announcement broadcast page
│   ├── create-event.html      # Create event page
│   ├── event-songs.html       # Song list builder page
│   ├── settings.html          # Settings and preferences
│   ├── members.html           # Membership portal
│   ├── members-directory.html # Member directory
│   ├── login.html             # Login page
│   ├── register.html          # Registration page
│   ├── admin-login.html       # Admin login page
│   ├── admin-dashboard.html   # Admin dashboard
│   ├── dashboard.html         # Legacy dashboard
│   ├── profile.html           # User profile page
│   ├── About.html             # About the choir
│   ├── privacy.html           # Privacy policy
│   ├── terms.html             # Terms of service
│   ├── constitution.html      # User documentation / constitution
│   ├── manifest.json          # PWA manifest
│   └── service-worker.js      # PWA service worker
├── server/
│   ├── driveService.js        # Google Drive API service
│   └── driveClient.js         # Google Drive client
├── server.js                  # Express server (API + static serving)
├── schema.sql                 # Database schema
├── vercel.json                # Vercel deployment config
├── package.json
└── README.md
```

---

## 🔌 API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/register` | User registration |
| POST | `/api/auth/login` | User login (JWT) |
| POST | `/api/auth/logout` | User logout |
| GET | `/api/auth/me` | Get current user |
| POST | `/api/auth/reset-password` | Request password reset |
| POST | `/api/auth/update-password` | Update password |
| GET | `/api/users` | List approved member directory/profile fields (signed-in members); password and internal fields are excluded |
| GET | `/api/users/:id` | Get approved member directory/profile fields (signed-in members); password and internal fields are excluded |
| PUT | `/api/users/:id` | Update own profile or another member's profile (admin/exco only) |
| DELETE | `/api/users/:id` | Delete user (admin only) |
| GET | `/api/scores` | List all scores |
| POST | `/api/scores` | Upload a new score |
| DELETE | `/api/scores/:id` | Delete a score |
| GET | `/api/drive/scores` | List scores from Google Drive |
| POST | `/api/drive/scores/upload` | Upload score to Google Drive |
| DELETE | `/api/drive/scores/:fileId` | Delete score from Google Drive |
| GET | `/api/attendance` | Get attendance records (with member names) |
| POST | `/api/attendance` | Record attendance (self or admin for others) |
| PUT | `/api/attendance/:id` | Update attendance record (own or admin) |
| POST | `/api/attendance/bulk` | Bulk save attendance (admin/exco or self) |
| DELETE | `/api/attendance/:id` | Delete attendance record (own or admin) |
| DELETE | `/api/attendance/event/:eventDate` | Delete all attendance for event (admin/exco only) |
| GET | `/api/events` | List events |
| POST | `/api/events` | Create event |
| PUT | `/api/events/:id` | Update event |
| DELETE | `/api/events/:id` | Delete event |
| GET | `/api/executives` | List executives |
| POST | `/api/executives` | Create executive entry |
| PUT | `/api/executives/:id` | Update executive |
| DELETE | `/api/executives/:id` | Delete executive |
| GET | `/api/gallery` | List gallery images |
| POST | `/api/gallery/upload` | Upload gallery image |
| GET | `/api/notifications` | List notifications |
| POST | `/api/notifications` | Create notification (admin/exco only) |
| POST | `/api/notifications/mark-read` | Mark personal notifications as read |
| DELETE | `/api/notifications/mine` | Delete the signed-in user's personal notifications |
| DELETE | `/api/notifications/:id` | Delete own notification, or shared notification (admin/exco only) |
| GET | `/api/announcements` | List all announcements |
| POST | `/api/announcements` | Create announcement (admin/exco only) |
| PUT | `/api/announcements/:id` | Update announcement (admin/exco only) |
| DELETE | `/api/announcements/:id` | Delete announcement (admin/exco only) |
| GET | `/api/settings` | Get user settings |
| PUT | `/api/settings` | Update user settings |
| POST | `/api/ai/chat` | Cecilia AI chat endpoint |
| GET | `/api/ai/history` | Get AI chat history |
| DELETE | `/api/ai/history` | Clear AI chat history |
| GET | `/api/dashboard/stats` | Dashboard statistics |
| GET | `/api/realtime/:table` | Real-time table updates |
| GET | `/api/health` | Health check |

---

## 🚀 Getting Started

### Prerequisites
* Node.js (v18+)
* npm
* Google Drive API credentials
* Supabase project credentials
* Groq API key (for Cecilia AI)
* Cloudinary account (for image storage)

### Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/fabian-codes/st-cecilia-choir-HTCCnaze.git
   cd st-cecilia-choir-HTCCnaze
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Configure environment variables:**
   Create a `.env` file in the root directory:
   Copy [`.env.example`](./.env.example) to `.env`, then fill in the values locally. The server requires `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, and a strong `JWT_SECRET`. Never commit `.env` or expose the Supabase service-role key.

   For ticket reservations and the payment details shown on the ticket and Debt Ledger pages, also set the verified `BANK_NAME`, `BANK_ACCOUNT_NAME`, and `BANK_ACCOUNT_NUMBER`. Online reservations stay disabled until all three are present.

4. **Run the development server:**
   ```bash
   npm run dev
   ```

5. **Visit:** `http://localhost:3000`

---

## 🚀 Deployment

Deploy to Vercel with a single command:

```bash
vercel
```

Or connect your GitHub repository to Vercel for automatic deployments.

### Daily Supabase Keep-Alive and Browser Push

1. In Supabase, run [`supabase-push-subscriptions.sql`](./supabase-push-subscriptions.sql) once in the SQL Editor. The table stores browser subscriptions privately for the backend to send notifications.
2. Generate VAPID keys locally with `npx web-push generate-vapid-keys`. In the Vercel project settings, add these environment variables for Production (and Preview if needed):
   - `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY`: the generated key pair.
   - `VAPID_SUBJECT`: a contact such as `mailto:stceciliaholytrinitycatholicch@gmail.com`.
   - `CRON_SECRET`: a private random value (for example, generate one with `openssl rand -hex 32`).
3. Redeploy after setting the variables. Vercel runs `/api/cron/keep-supabase-alive` daily at 09:00 UTC and uses `CRON_SECRET` to authorize the database check. This daily database read helps prevent inactivity pauses, but it cannot resume a project that has already been paused; resume that project in Supabase first.
4. Members can enable **Browser Notifications** in Settings. Their device subscribes securely, and newly created choir notifications are sent to enabled subscriptions. Notifications require HTTPS and browser permission.

Do not commit the generated VAPID private key or `CRON_SECRET`. Push delivery will remain disabled until the VAPID variables and Supabase subscription table are configured.

### Music Boom ticket sales

The public [Music Boom ticket page](./public/tickets.html) supports ticket reservations, bank-transfer references or receipt uploads, and order status checks. Payment is **not automatic**: an admin or exco member must compare the submitted details with the bank account before confirming an order. Confirmed tickets receive unique QR codes; email delivery is recorded separately so an SMTP outage does not undo a confirmed payment. The staff desk at `ticket-admin.html` supports online-order review, physical sales, QR/manual serial check-in, and recent audit history. Access requires a valid admin/exco login; opening the desk without one redirects to the Admin Portal. Physical sellers can be chosen from the member suggestions or entered manually (for example, a cadet choir seller); the selected name and staff operator are recorded separately.

Before opening ticket sales:

1. Run [`supabase-ticketing.sql`](./supabase-ticketing.sql) in the Supabase SQL Editor. It creates ticket packages, orders, issued tickets, the private receipt bucket, database functions, and the audit log.
2. The migration seeds Regular (₦500), VIP (₦10,000), and Family (₦15,000) packages. Set each package's `capacity` in `public.ticket_packages` before sales if there is a known limit. A `NULL` capacity means unlimited; no capacity or Family admission count has been assumed.
3. Configure these server-side environment variables in `.env` for local work and in the deployment provider for production:
   - `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` for the backend's database access. Never expose the service-role key in browser code.
   - `BANK_NAME`, `BANK_ACCOUNT_NAME`, and `BANK_ACCOUNT_NUMBER` with the choir's verified transfer details. Reservation and payment proof submission remain unavailable until all three are set.
   - `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, and optionally `TICKETS_FROM_EMAIL` for emailed QR tickets. Without SMTP, orders can still be approved, but the desk reports that email delivery needs configuration and provides an email retry action.
   - Optionally set `TICKET_PROOF_BUCKET` if the private bucket uses a different name from `ticket-payment-proofs`.
4. Test the complete reservation, proof review, ticket email, physical-sale, and check-in flows using a test Supabase project before opening sales. Keep the receipt bucket private and never share the service-role key or SMTP password.

Admin and exco accounts can review or reject online orders, record physical sales, and check tickets in. Receipt preview links expire after five minutes. Ticket APIs are network-only and are not cached by the service worker. The audit log is append-only for application operations and hash-chained to make changes detectable; it is not protection against a project owner who can alter the database schema.

The ticket page and staff desk show an extracted preview image for the selected Regular, VIP, or Family package. The supplied photo contains overlapping tickets, so the previews are best-effort crops; the printed ticket name and price remain available as text.

### Choir Debt Ledger

The [Debt Ledger](./public/debt-ledger.html) is available to signed-in members, who can search and filter the choir-wide dues and levy records by name, year, month, payment type, and status. Members can view records and payment history but cannot make changes. Admin accounts can enter records, import old lists, record payments, and review all entries from the Admin Dashboard; exco and regular members cannot edit ledger data. A separately confirmed, admin-only action can permanently clear all ledger members, old imported figures, dues/levies, and payment history. The server verifies current database roles for privileged operations, and a payment cannot exceed the remaining balance. Ledger API responses are private and are never cached by the service worker. The page refreshes its data every 20 seconds while open.

To set it up:

1. Run [`supabase-debt-ledger.sql`](./supabase-debt-ledger.sql) in the Supabase SQL Editor. The tables are private to the server's service-role API.
2. Sign in with an admin account and open **Debt Ledger** from the Admin Dashboard. The finance page starts with **Enter a record**; use **Import an old list** to preview a source file, or **View all records** to search and manage the whole ledger. Other signed-in members can search and view all choir records but cannot edit them.
3. Admins can import CSV, Excel `.xlsx`, TXT, or JSON debt lists. The app reads the file on the server, shows a preview, and asks the user to map each column before saving. Imports are idempotent and keep source amounts as text; they do not calculate expressions or change confirmed balances. The original numbered JSON list keeps its serial numbers, including duplicates. PDF imports are not supported; enter those records manually.
4. To enter a new payment due, use **Enter a record**. The member's name, description, type, and amount are required; year and month are optional. Types include monthly dues, burial, wedding, child dedication, and other choir payments. Record payments from the member's entry; members then see the amount paid and balance remaining.
5. Review imported figures with the Finance Secretary. Confirm member names if needed, mark source figures checked, and add each verified amount as a dues or levy item. Historical figures remain separate from confirmed balances until entered as a confirmed payment due.

Historical source values stay visible as provided but do not count toward the live balance until confirmed. The account details shown to signed-in members and ticket buyers come from the server-side `BANK_NAME`, `BANK_ACCOUNT_NAME`, and `BANK_ACCOUNT_NUMBER` variables. Set all three in the hosting provider (including Vercel Production) and redeploy; ticket reservations remain unavailable until the account details are configured. Verify those values against the choir's bank details before accepting transfers.

The global delete action requires both a confirmation dialog and typing **DELETE ALL FINANCIAL RECORDS**. It deletes every entry, imported source figure, due/levy and payment. To enable it in an existing Supabase project, rerun [`supabase-debt-ledger.sql`](./supabase-debt-ledger.sql) so the restricted `clear_debt_ledger_records` function and child-dedication levy type are installed.

---

## 🤝 Contribution

We welcome contributions from tech-savvy members of the choir and the HTCC Naze community.

1. **Fork** the repository.
2. Create a **Feature Branch** (`git checkout -b feature/NewFeature`).
3. **Commit** your changes (`git commit -m 'Add: NewFeature'`).
4. **Push** to the branch (`git push origin feature/NewFeature`).
5. Open a **Pull Request**.

---

## 📜 License

This project is for the private use of the St. Cecilia Choir, HTCC Naze. Musical scores uploaded are subject to copyright laws; please ensure you have the right to distribute digital copies of specific compositions.

---

**Soli Deo Gloria!** *St. Cecilia, Pray for us.*

## Sing Praises......... To The Lord!!!!
