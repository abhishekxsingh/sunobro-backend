const admin = require('firebase-admin');
const { FIREBASE } = require('../config');

let app;

const isConfigured = () => Boolean(FIREBASE.PROJECT_ID);

const auth = () => {
  if (!isConfigured()) {
    const error = new Error('Firebase is not configured.');
    error.code = 'FIREBASE_NOT_CONFIGURED';
    throw error;
  }

  if (!app) {
    const options = { projectId: FIREBASE.PROJECT_ID };
    if (FIREBASE.CLIENT_EMAIL && FIREBASE.PRIVATE_KEY) {
      options.credential = admin.credential.cert({
        projectId: FIREBASE.PROJECT_ID,
        clientEmail: FIREBASE.CLIENT_EMAIL,
        privateKey: FIREBASE.PRIVATE_KEY,
      });
    }
    app = admin.initializeApp(options);
  }

  return admin.auth(app);
};

const verifyIdToken = (idToken) => auth().verifyIdToken(idToken);

module.exports = { isConfigured, verifyIdToken };
