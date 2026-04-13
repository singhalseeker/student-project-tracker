# 📊 Student Project Tracker

A real-time project tracking dashboard built for **RBCET** to monitor student team projects, module progress, and activity logs across devices.

🔗 **Live Demo:** [student-project-tracker-one.vercel.app](https://student-project-tracker-one.vercel.app)

---

## ✨ Features

- 🔐 **Google Sign-In** — Secure authentication, no passwords needed
- 📊 **Project Dashboard** — Track multiple projects with progress bars and status badges
- 📦 **Module Management** — Add, edit, and delete modules within each project
- 👥 **Team Members** — Assign members to each module
- 📋 **Activity Log** — See who changed what and when, in real time
- 🔄 **Real-time Sync** — Changes reflect instantly across all devices
- 🌍 **Cross-device** — Works on any device, anywhere in the world
- ⚠️ **Deadline Alerts** — Visual warnings for approaching deadlines

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React + Vite |
| Database | Firebase Firestore |
| Authentication | Firebase Auth (Google) |
| Hosting | Vercel |
| Version Control | GitHub |

---

## 🚀 Getting Started

### Prerequisites
- Node.js installed
- Firebase project set up
- Git installed

### Installation

```bash
# Clone the repository
git clone https://github.com/singhalseeker/student-project-tracker.git

# Navigate to project folder
cd student-project-tracker

# Install dependencies
npm install
```

### Firebase Setup

1. Create a Firebase project at [console.firebase.google.com](https://console.firebase.google.com)
2. Enable **Firestore Database**
3. Enable **Google Sign-In** under Authentication
4. Create `src/firebase.js` with your config:

```js
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth, GoogleAuthProvider } from "firebase/auth";

const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_AUTH_DOMAIN",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_STORAGE_BUCKET",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
```

### Run Locally

```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

---

## 📁 Project Structure

```
src/
├── App.jsx          # Main dashboard component
├── firebase.js      # Firebase configuration
└── main.jsx         # React entry point
```

---

## 🔒 Security

- Only authenticated users can read/write data
- Firestore rules enforce login requirement
- Google OAuth handles all authentication securely

---

## 📸 Screenshots

> Sign in with your Google account to access the dashboard

- **Login Page** — Clean Google Sign-In screen
- **Dashboard** — Project cards with progress tracking
- **Module Editor** — Edit progress, status, assignees and remarks
- **Activity Log** — Full history of all changes with user info

---

## 👨‍💻 Developed By

**Prateek Singhal** — RBCET  
Academic Year 2025–26

---

## 📄 License

This project is for academic use at RBCET.
