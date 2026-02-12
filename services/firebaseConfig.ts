
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

// Configuração do seu projeto Firebase
const firebaseConfig = {
  apiKey: "AIzaSyCgoKg5whLMJYBSRB-YcvDP23YDq94ktPg",
  authDomain: "lifeboat-muster.firebaseapp.com",
  projectId: "lifeboat-muster",
  storageBucket: "lifeboat-muster.firebasestorage.app",
  messagingSenderId: "670379072568",
  appId: "1:670379072568:web:699aeba939b9ef08ff1acd",
  measurementId: "G-5BZ2TBZ0ZE"
};

// Inicializa o Firebase
const app = initializeApp(firebaseConfig);

// Exporta o Firestore para ser usado no cloudService.ts
export const db = getFirestore(app);
