// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getFirestore } from "@firebase/firestore";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyC1A8BoaSfkbuRoJPyJhmrnSuduLft3WzY",
  authDomain: "webnote-df968.firebaseapp.com",
  projectId: "webnote-df968",
  storageBucket: "webnote-df968.appspot.com",
  messagingSenderId: "785362641992",
  appId: "1:785362641992:web:e5369bbaf2844d897c647d",
  measurementId: "G-DJCXVFVL9K"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const firestore = getFirestore(app);

export { firestore }