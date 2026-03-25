import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore, collection, addDoc, query, orderBy, limit, onSnapshot, serverTimestamp, doc, setDoc, getDocs, where } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// ===== CONFIGURACIÓN FIREBASE =====
const firebaseConfig = {
  apiKey: "AIzaSyDehFdJAKNzvCGPRB3rca6VmEMTvdpO-2M",
  authDomain: "caquetachat.firebaseapp.com",
  projectId: "caquetachat",
  storageBucket: "caquetachat.firebasestorage.app",
  messagingSenderId: "911518784033",
  appId: "1:911518784033:web:9c003be112ad6880a1e160"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// ===== ESTADO GLOBAL =====
let currentUser = null;
let currentSala = "plaza";
let unsubscribeChat = null;
let mediaRecorder = null;
let audioChunks = [];
let isRecording = false;

// ===== AUTH =====
document.getElementById("btn-google-login").addEventListener("click", async () => {
  try {
    const provider = new GoogleAuthProvider();
    await signInWithPopup(auth, provider);
  } catch (e) {
    alert("Error al iniciar sesión: " + e.message);
  }
});

document.getElementById("btn-logout").addEventListener("click", async () => {
  await signOut(auth);
});

onAuthStateChanged(auth, async (user) => {
  if (user) {
    currentUser = user;
    document.getElementById("screen-login").classList.remove("active");
    document.getElementById("screen-app").classList.add("active");

    // Mostrar nombre y foto
    const av = document.getElementById("user-avatar");
    if (user.photoURL) {
      av.innerHTML = `<img src="${user.photoURL}" alt="foto">`;
    } else {
      av.textContent = user.displayName?.charAt(0).toUpperCase() || "U";
    }
    document.getElementById("user-name").textContent = user.displayName?.split(" ")[0] || "";

    // Registrar presencia
    await setDoc(doc(db, "presencia", user.uid), {
      nombre: user.displayName || "Usuario",
      foto: user.photoURL || "",
      ultimaVez: serverTimestamp(),
      online: true
    }, { merge: true });

    cargarUsuariosOnline();
    cargarChat("plaza");
  } else {
    currentUser = null;
    document.getElementById("screen-app").classList.remove("active");
    document.getElementById("screen-login").classList.add("active");
  }
});

// ===== NAVEGACIÓN =====
document.querySelectorAll(".ntab").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".ntab").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    const page = btn.dataset.page;
    document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
    document.getElementById("page-" + page).classList.add("active");
    if (page === "chat") cargarChat(currentSala);
  });
});

window.goPage = (page) => {
  document.querySelectorAll(".ntab").forEach(b => b.classList.remove("active"));
  document.querySelector(`.ntab[data-page="${page}"]`).classList.add("active");
  document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
  document.getElementById("page-" + page).classList.add("active");
  if (page === "chat") cargarChat(currentSala);
};

// ===== SALAS =====
window.cambiarSala = (sala, nombre, el) => {
  document.querySelectorAll(".sala-item").forEach(s => s.classList.remove("active"));
  el.classList.add("active");
  currentSala = sala;
  document.getElementById("room-title").textContent = nombre;
  cargarChat(sala);
};

// ===== CHAT EN TIEMPO REAL =====
function cargarChat(sala) {
  if (unsubscribeChat) unsubscribeChat();
  const container = document.getElementById("messages-container");
  container.innerHTML = '<div class="msg-placeholder">Cargando mensajes...</div>';

  const q = query(
    collection(db, "salas", sala, "mensajes"),
    orderBy("timestamp", "asc"),
    limit(60)
  );

  unsubscribeChat = onSnapshot(q, (snapshot) => {
    container.innerHTML = "";
    let lastDate = "";

    snapshot.forEach(docSnap => {
      const msg = docSnap.data();
      const fecha = msg.timestamp?.toDate();
      const fechaStr = fecha ? fecha.toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long" }) : "";

      if (fechaStr && fechaStr !== lastDate) {
        const div = document.createElement("div");
        div.className = "date-div";
        div.innerHTML = `<span>${fechaStr}</span>`;
        container.appendChild(div);
        lastDate = fechaStr;
      }

      container.appendChild(crearBurbuja(msg));
    });

    container.scrollTop = container.scrollHeight;
    document.getElementById("room-status").textContent = `${snapshot.size} mensajes · sala activa`;
  });
}

function crearBurbuja(msg) {
  const esMio = msg.uid === currentUser?.uid;
  const row = document.createElement("div");
  row.className = "msg-row" + (esMio ? " me" : "");

  const hora = msg.timestamp?.toDate()?.toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" }) || "";

  let avatarHtml = "";
  if (msg.foto) {
    avatarHtml = `<div class="av"><img src="${msg.foto}" alt="av"></div>`;
  } else {
    const letra = (msg.nombre || "U").charAt(0).toUpperCase();
    const colores = ["#e8f5e9","#e3f2fd","#fff3e0","#fce4ec","#f3e5f5"];
    const col = colores[msg.nombre?.charCodeAt(0) % colores.length] || "#e8f5e9";
    avatarHtml = `<div class="av" style="background:${col}">${letra}</div>`;
  }

  let contenido = "";
  if (msg.tipo === "texto") {
    contenido = `
      <div class="sender-name">${msg.nombre || "Usuario"}</div>
      <div class="bubble">${escapeHtml(msg.texto)}</div>
      <div class="msg-meta">${hora}${esMio ? " ✓✓" : ""}</div>`;
  } else if (msg.tipo === "imagen") {
    contenido = `
      <div class="sender-name">${msg.nombre || "Usuario"}</div>
      <div class="img-bubble"><img src="${msg.url}" alt="imagen" loading="lazy"><div class="img-caption">${escapeHtml(msg.nombreArchivo || "Imagen")}</div></div>
      <div class="msg-meta">${hora}</div>`;
  } else if (msg.tipo === "archivo") {
    contenido = `
      <div class="sender-name">${msg.nombre || "Usuario"}</div>
      <div class="file-bubble"><div class="file-icon-box">📄</div><div><div class="file-nm">${escapeHtml(msg.nombreArchivo || "Archivo")}</div><div class="file-sz">${msg.tamano || ""}</div></div><a href="${msg.url}" target="_blank" style="font-size:0.75rem;color:var(--vm);text-decoration:none;margin-left:4px">⬇</a></div>
      <div class="msg-meta">${hora}</div>`;
  } else if (msg.tipo === "audio") {
    const waveHtml = Array.from({length: 18}, (_, i) => {
      const h = [10,16,22,14,26,18,12,20,16,24,10,18,14,22,16,12,20,8][i];
      return `<div class="wbar" style="height:${h}px"></div>`;
    }).join("");
    contenido = `
      <div class="sender-name">${msg.nombre || "Usuario"}</div>
      <div class="audio-bubble"><button class="play-btn" onclick="reproducirAudio('${msg.url}', this)">▶</button><div class="waveform">${waveHtml}</div><span class="audio-dur">${msg.duracion || "0:10"}</span></div>
      <div class="msg-meta">${hora}</div>`;
  }

  row.innerHTML = avatarHtml + `<div>${contenido}</div>`;
  return row;
}

// ===== ENVIAR MENSAJE DE TEXTO =====
window.enviarMensaje = async () => {
  const input = document.getElementById("msg-input");
  const texto = input.value.trim();
  if (!texto || !currentUser) return;

  input.value = "";
  await addDoc(collection(db, "salas", currentSala, "mensajes"), {
    tipo: "texto",
    texto,
    uid: currentUser.uid,
    nombre: currentUser.displayName || "Usuario",
    foto: currentUser.photoURL || "",
    timestamp: serverTimestamp()
  });
};

document.getElementById("msg-input").addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); enviarMensaje(); }
});

// ===== AUDIO =====
window.toggleAudio = async () => {
  const btn = document.getElementById("btn-audio");

  if (!isRecording) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunks = [];
      mediaRecorder = new MediaRecorder(stream);
      mediaRecorder.ondataavailable = e => audioChunks.push(e.data);
      mediaRecorder.onstop = async () => {
        const blob = new Blob(audioChunks, { type: "audio/webm" });
        stream.getTracks().forEach(t => t.stop());
        await subirAudio(blob);
      };
      mediaRecorder.start();
      isRecording = true;
      btn.textContent = "⏹️ Detener";
      btn.classList.add("grabando");
    } catch (e) {
      alert("No se pudo acceder al micrófono. Por favor permite el acceso.");
    }
  } else {
    mediaRecorder.stop();
    isRecording = false;
    btn.textContent = "🎙️ Audio";
    btn.classList.remove("grabando");
  }
};

async function subirAudio(blob) {
  if (!currentUser) return;
  // Subimos como base64 a Firestore (para evitar Storage de pago)
  const reader = new FileReader();
  reader.onloadend = async () => {
    const base64 = reader.result;
    await addDoc(collection(db, "salas", currentSala, "mensajes"), {
      tipo: "audio",
      url: base64,
      duracion: "0:0" + Math.floor(audioChunks.length / 2),
      uid: currentUser.uid,
      nombre: currentUser.displayName || "Usuario",
      foto: currentUser.photoURL || "",
      timestamp: serverTimestamp()
    });
  };
  reader.readAsDataURL(blob);
}

window.reproducirAudio = (url, btn) => {
  const audio = new Audio(url);
  audio.play();
  btn.textContent = "⏸";
  audio.onended = () => { btn.textContent = "▶"; };
};

// ===== IMAGEN =====
window.triggerImage = () => document.getElementById("image-input").click();
window.triggerCamera = () => document.getElementById("camera-input").click();

window.subirImagen = async (input) => {
  const file = input.files[0];
  if (!file || !currentUser) return;
  input.value = "";

  const reader = new FileReader();
  reader.onloadend = async () => {
    // Para imágenes pequeñas usamos base64 en Firestore
    if (reader.result.length > 900000) {
      alert("Imagen muy grande. Por favor usa una imagen menor a 700KB.");
      return;
    }
    await addDoc(collection(db, "salas", currentSala, "mensajes"), {
      tipo: "imagen",
      url: reader.result,
      nombreArchivo: file.name,
      uid: currentUser.uid,
      nombre: currentUser.displayName || "Usuario",
      foto: currentUser.photoURL || "",
      timestamp: serverTimestamp()
    });
  };
  reader.readAsDataURL(file);
};

// ===== ARCHIVO =====
window.triggerFile = () => document.getElementById("file-input").click();

window.subirArchivo = async (input) => {
  const file = input.files[0];
  if (!file || !currentUser) return;
  input.value = "";

  const reader = new FileReader();
  reader.onloadend = async () => {
    if (reader.result.length > 900000) {
      alert("Archivo muy grande. Máximo 700KB por ahora.");
      return;
    }
    const kb = Math.round(file.size / 1024);
    const tamano = kb > 1024 ? (kb/1024).toFixed(1) + " MB" : kb + " KB";
    await addDoc(collection(db, "salas", currentSala, "mensajes"), {
      tipo: "archivo",
      url: reader.result,
      nombreArchivo: file.name,
      tamano,
      uid: currentUser.uid,
      nombre: currentUser.displayName || "Usuario",
      foto: currentUser.photoURL || "",
      timestamp: serverTimestamp()
    });
  };
  reader.readAsDataURL(file);
};

// ===== EMOJI =====
const emojis = ["🌿","🐟","🦜","🌺","🌅","😊","🎉","👋","❤️","🌱","🎵","💚"];
window.addEmoji = () => {
  const inp = document.getElementById("msg-input");
  inp.value += emojis[Math.floor(Math.random() * emojis.length)];
  inp.focus();
};

// ===== VIDEO (placeholder con Daily.co) =====
window.iniciarVideo = () => {
  document.getElementById("video-modal").style.display = "flex";
};
window.cerrarVideo = () => {
  document.getElementById("video-modal").style.display = "none";
};
window.iniciarAudioCall = () => {
  alert("Función de llamada de voz disponible próximamente. Para activarla necesitas crear una cuenta gratis en daily.co y obtener tu API key.");
};

// ===== USUARIOS ONLINE =====
async function cargarUsuariosOnline() {
  const container = document.getElementById("online-users");
  try {
    const snap = await getDocs(collection(db, "presencia"));
    if (snap.empty) {
      container.innerHTML = '<div class="loading-users">Sin usuarios registrados aún</div>';
      return;
    }
    container.innerHTML = "";
    let count = 0;
    snap.forEach(d => {
      if (count >= 5) return;
      const u = d.data();
      const letra = (u.nombre || "U").charAt(0).toUpperCase();
      const colores = ["#e8f5e9","#e3f2fd","#fff3e0","#fce4ec","#f3e5f5"];
      const col = colores[u.nombre?.charCodeAt(0) % colores.length] || "#e8f5e9";
      const row = document.createElement("div");
      row.className = "user-row-item";
      row.innerHTML = `
        <div class="u-av" style="background:${col}">${u.foto ? `<img src="${u.foto}">` : letra}</div>
        <span class="u-name">${u.nombre?.split(" ")[0] || "Usuario"}</span>
        <div class="u-dot"></div>`;
      container.appendChild(row);
      count++;
    });
  } catch (e) {
    container.innerHTML = '<div class="loading-users">Cargando...</div>';
  }
}

// ===== HELPERS =====
function escapeHtml(text) {
  return text?.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;") || "";
}
