/**
 * ============================================================
 * Recall — auth.js  (Firebase sign-in, loaded on demand by sync.js)
 * ============================================================
 * Loads the Firebase Auth SDK from Google's CDN at a pinned version and
 * hands sync.js a small provider object. Only Authentication is used.
 * The config below is public by design; access is enforced on the server
 * by verifying the signed-in person's token.
 * ============================================================
 */
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import {
  getAuth, onAuthStateChanged, signInWithPopup, GoogleAuthProvider,
  signInWithEmailAndPassword, createUserWithEmailAndPassword,
  sendPasswordResetEmail, signOut,
  deleteUser, reauthenticateWithCredential, reauthenticateWithPopup, EmailAuthProvider
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';

const firebaseConfig = {
  apiKey: 'AIzaSyDm6WJSrYHNZR3FvEGReniq_hH-g9j74cU',
  authDomain: 'recall-med.firebaseapp.com',
  projectId: 'recall-med',
  storageBucket: 'recall-med.firebasestorage.app',
  messagingSenderId: '293923320344',
  appId: '1:293923320344:web:2ee0ea0d7766ad1375896d'
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
try { auth.useDeviceLanguage(); } catch (e) { /* optional */ }

function describe(u) {
  if (!u) return null;
  const google = (u.providerData || []).some((p) => p.providerId === 'google.com');
  return { uid: u.uid, email: u.email || '', providerId: google ? 'google.com' : 'password' };
}

const provider = {
  onChange(cb) { return onAuthStateChanged(auth, (u) => cb(describe(u))); },
  currentUser() { return describe(auth.currentUser); },
  getToken(force) {
    if (!auth.currentUser) return Promise.reject(new Error('signed_out'));
    return auth.currentUser.getIdToken(!!force);
  },
  async signInGoogle() {
    const g = new GoogleAuthProvider();
    g.setCustomParameters({ prompt: 'select_account' });
    await signInWithPopup(auth, g);
  },
  async signInEmail(email, password) { await signInWithEmailAndPassword(auth, email, password); },
  async signUpEmail(email, password) { await createUserWithEmailAndPassword(auth, email, password); },
  async resetPassword(email) { await sendPasswordResetEmail(auth, email); },
  async signOut() { await signOut(auth); },
  // Account deletion: Firebase only allows it shortly after a fresh sign-in, so the person confirms first.
  async reauthEmail(password) {
    const u = auth.currentUser;
    if (!u || !u.email) throw new Error('signed_out');
    await reauthenticateWithCredential(u, EmailAuthProvider.credential(u.email, password));
  },
  async reauthGoogle() {
    const u = auth.currentUser;
    if (!u) throw new Error('signed_out');
    const g = new GoogleAuthProvider();
    g.setCustomParameters({ prompt: 'select_account', login_hint: u.email || '' });
    await reauthenticateWithPopup(u, g);
  },
  async deleteAccount() {
    if (!auth.currentUser) throw new Error('signed_out');
    await deleteUser(auth.currentUser);
  }
};

window.Sync.attachAuth(provider);
