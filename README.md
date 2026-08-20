# ST. CECILIA CHOIR - HTCC NAZE

### *Official Digital Library and Community Portal*

Welcome to the official repository for the **St. Cecilia Choir, Holy Trinity Catholic Church (HTCC) Naze**. This platform serves as a centralized hub for choristers to access liturgical music, stay updated on parish events, and celebrate our ministry through media.

Built as a Progressive Web App (PWA), it delivers full offline support, push notifications, and installable mobile app experience.

---

## 🎵 Project Overview

The goal of this website is to bridge the gap between traditional liturgical music and modern accessibility. It provides a structured environment for choristers to study their parts and for the parish community to engage with the choir's activities.

### Key Modules

* **🎼 Musical Scores & Scripts Library:** A searchable database of PDF scores, Tonic Sol-fa sheets, and MIDI/MP3 rehearsal files categorized by Liturgical Season (Advent, Lent, Ordinary Time, etc.). Features Google Drive integration for score storage and retrieval.
* **📅 Choir Events Page:** An integrated calendar for tracking rehearsal schedules, Feast Day celebrations, and Archdiocesan competitions.
* **🤖 Cecilia AI Chat Assistant:** An AI-powered liturgical music assistant powered by Groq, capable of answering questions about music, liturgy, choir policies, and more.
* **👥 Member Portal:** A personalized dashboard for choristers with a Next Rehearsal countdown, quick-access cards, and dynamic time-based greetings.
* **📸 Media Gallery:** A responsive carousel and grid view showcasing photographs and videos from various performances and church functions.
* **🏛️ Executives Page:** A dedicated page highlighting the current choir executive committee members and their roles.
* **📊 Attendance Tracking:** Record and track attendance for rehearsals and events, with admin-level management.
* **🔔 Notifications System:** In-app and push notifications for rehearsal reminders, new scores, announcements, and choir updates.
* **⚙️ Settings:** Dark/light mode toggle, theme preference, account security, and notification preferences.
* **🙏 Liturgical Resource Center:** Quick links to the daily Mass readings and Choral Anthems.

---

## 🚀 Features

### Core Platform
* **Progressive Web App (PWA):** Installable on mobile and desktop with service worker for offline caching and push notifications.
* **Mobile-First Design:** Easy access to sheet music directly from a smartphone during rehearsals, with bottom navigation bar for mobile app feel.
* **Dark / Light Mode:** Toggle between themes or auto-switch based on system preference.
* **Dynamic Greetings:** Personalized welcome messages that adapt based on time of day and liturgical season.
* **Responsive UI:** Works across all screen sizes from mobile to desktop.

### Member Portal
* **Next Rehearsal Countdown:** Real-time countdown timer showing time remaining until the next scheduled rehearsal.
* **Quick-Access Cards:** Bento-style grid for Scores, Attendance, Cecilia AI, Events, and more.
* **Personalized Dashboard:** Tailored home screen for logged-in members.

### Musical Scores
* **Search & Filter:** Search by title or composer, filter by category and voice part.
* **Alphabetical Sorting:** Sort scores A-Z or Z-A.
* **Category Filters:** Browse by liturgical season, voice part, or composer.
* **Google Drive Integration:** Scores stored and streamed from Google Drive via the Drive API.

### Cecilia AI
* **AI-Powered Assistant:** Chat-based interaction using Groq LLM.
* **Liturgical Music Expertise:** Answers questions about choir music, rehearsals, and liturgy.
* **Chat History:** Maintains conversation context within a session.

### Attendance
* **Mark Attendance:** Members can check in to rehearsals and events.
* **Admin Management:** Executives can record and view attendance reports.

### Notifications
* **In-App Notifications:** Center for all choir announcements and reminders.
* **Push Notifications:** Browser push support via service worker for real-time alerts.

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
│   │   └── profile.js         # User profile logic
│   ├── IMAGES/                # Logo, choir photos, and static images
│   ├── icons/                 # App icons
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
│   ├── settings.html          # Settings and preferences
│   ├── members.html           # Membership portal
│   ├── members-directory.html # Member directory
│   ├── login.html             # Login page
│   ├── register.html          # Registration page
│   ├── dashboard.html         # Admin dashboard
│   ├── profile.html           # User profile page
│   ├── About.html             # About the choir
│   ├── privacy.html           # Privacy policy
│   ├── terms.html             # Terms of service
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
| GET | `/api/users` | List all users (admin) |
| GET | `/api/users/:id` | Get user by ID |
| PUT | `/api/users/:id` | Update user |
| DELETE | `/api/users/:id` | Delete user |
| GET | `/api/scores` | List all scores |
| POST | `/api/scores` | Upload a new score |
| DELETE | `/api/scores/:id` | Delete a score |
| GET | `/api/drive/scores` | List scores from Google Drive |
| POST | `/api/drive/scores/upload` | Upload score to Google Drive |
| DELETE | `/api/drive/scores/:fileId` | Delete score from Google Drive |
| GET | `/api/attendance` | Get attendance records |
| POST | `/api/attendance` | Record attendance |
| PUT | `/api/attendance/:id` | Update attendance record |
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
| POST | `/api/notifications` | Create notification |
| GET | `/api/settings` | Get user settings |
| PUT | `/api/settings` | Update user settings |
| POST | `/api/ai/chat` | Cecilia AI chat endpoint |
| GET | `/api/ai/history` | Get AI chat history |
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
   ```env
   PORT=3000
   NODE_ENV=development
   JWT_SECRET=your_jwt_secret_here
   SUPABASE_URL=your_supabase_url
   SUPABASE_KEY=your_supabase_key
   GOOGLE_DRIVE_CLIENT_ID=your_client_id
   GOOGLE_DRIVE_CLIENT_SECRET=your_client_secret
   GOOGLE_DRIVE_REFRESH_TOKEN=your_refresh_token
   GROQ_API_KEY=your_groq_api_key
   CLOUDINARY_CLOUD_NAME=your_cloud_name
   CLOUDINARY_API_KEY=your_api_key
   CLOUDINARY_API_SECRET=your_api_secret
   ```

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
