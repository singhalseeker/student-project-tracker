import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth, GoogleAuthProvider } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyAB35y2arDKgCHVnM3FwihXQoC_lwoFO18",
  authDomain: "student-project-tracker-771a5.firebaseapp.com",
  projectId: "student-project-tracker-771a5",
  storageBucket: "student-project-tracker-771a5.firebasestorage.app",
  messagingSenderId: "1009617018125",
  appId: "1:1009617018125:web:58868e915249bb9a14e444"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();