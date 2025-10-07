const API_LIST_URL = "/cgi-bin/beds.cgi";
const API_UPDATE_URL = "/cgi-bin/update_beds.cgi"; // used for optimistic refresh after updates

const tableBody = document.querySelector("#bedsTable tbody");
const searchHospital = document.getElementById("searchHospital");
const filterWard = document.getElementById("filterWard");
const refreshBtn = document.getElementById("refreshBtn");
const lastUpdatedEl = document.getElementById("lastUpdated");

let sortKey = "hospital";
let sortAsc = true;
let latestData = [];

async function fetchBeds() {
  const params = new URLSearchParams();
  if (searchHospital.value.trim()) params.set("hospital", searchHospital.value.trim());
  if (filterWard.value) params.set("ward", filterWard.value);
  const url = `${API_LIST_URL}?${params.toString()}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error("Network error");
  const json = await res.json();
  if (!json.success) throw new Error(json.error || "API error");
  latestData = json.data;
  lastUpdatedEl.textContent = new Date(json.updatedAt * 1000).toLocaleString();
  renderTable();
  renderWardSections();
  notifyIfNewAvailability(json.data);
}

function renderTable() {
  const data = [...latestData];
  data.sort((a, b) => {
    const av = a[sortKey];
    const bv = b[sortKey];
    if (typeof av === "number" && typeof bv === "number") {
      return sortAsc ? av - bv : bv - av;
    }
    return sortAsc
      ? String(av).localeCompare(String(bv))
      : String(bv).localeCompare(String(av));
  });
  tableBody.innerHTML = data
    .map(
      (r) => `<tr>
        <td>${escapeHtml(r.hospital)}</td>
        <td>${escapeHtml(r.ward)}</td>
        <td>${r.total}</td>
        <td class="avail ${r.available > 0 ? "pos" : "neg"}">${r.available}</td>
      </tr>`
    )
    .join("");
}

function renderWardSections() {
  const wards = ["General", "ICU", "Emergency", "Operation"];
  for (const w of wards) {
    const list = document.querySelector(`#ward-${w} .ward-list`);
    const items = latestData.filter((d) => d.ward.toLowerCase() === w.toLowerCase());
    list.innerHTML = items
      .map(
        (r) => `<li><span>${escapeHtml(r.hospital)}</span><strong>${r.available}/${r.total}</strong></li>`
      )
      .join("");
  }
}

let lastAvailSnapshot = new Map();
function notifyIfNewAvailability(data) {
  // simple edge-triggered notification - if any hospital/ward availability increased
  for (const r of data) {
    const key = `${r.hospital}__${r.ward}`;
    const prev = lastAvailSnapshot.get(key) ?? r.available;
    if (r.available > prev) {
      toast(`${r.ward}: ${r.hospital} has ${r.available} beds now`);
    }
    lastAvailSnapshot.set(key, r.available);
  }
}

function toast(msg) {
  let div = document.createElement("div");
  div.textContent = msg;
  div.style.position = "fixed";
  div.style.right = "16px";
  div.style.bottom = "16px";
  div.style.background = "#16a34a";
  div.style.color = "#fff";
  div.style.padding = "10px 12px";
  div.style.borderRadius = "6px";
  div.style.zIndex = 9999;
  document.body.appendChild(div);
  setTimeout(() => div.remove(), 3000);
}

function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

// sorting
for (const th of document.querySelectorAll("#bedsTable th")) {
  th.addEventListener("click", () => {
    const key = th.getAttribute("data-sort");
    if (sortKey === key) sortAsc = !sortAsc;
    else {
      sortKey = key;
      sortAsc = true;
    }
    renderTable();
  });
}

refreshBtn.addEventListener("click", fetchBeds);
searchHospital.addEventListener("input", debounce(fetchBeds, 300));
filterWard.addEventListener("change", fetchBeds);

// polling
setInterval(fetchBeds, 10000);
fetchBeds().catch((e) => console.error(e));

function debounce(fn, ms) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

// Chatbot
const chatToggle = document.getElementById("chatToggle");
const chatWindow = document.getElementById("chatWindow");
const chatLog = document.getElementById("chatLog");
const chatText = document.getElementById("chatText");
const chatSend = document.getElementById("chatSend");

chatToggle.addEventListener("click", () => {
  chatWindow.classList.toggle("open");
  if (chatWindow.classList.contains("open")) chatText.focus();
});

chatSend.addEventListener("click", sendChat);
chatText.addEventListener("keydown", (e) => {
  if (e.key === "Enter") sendChat();
});

function addMsg(role, text) {
  const div = document.createElement("div");
  div.className = `chat-msg ${role}`;
  div.textContent = text;
  chatLog.appendChild(div);
  chatLog.scrollTop = chatLog.scrollHeight;
}

function sendChat() {
  const text = chatText.value.trim();
  if (!text) return;
  addMsg("user", text);
  chatText.value = "";

  // naive rule-based suggestion based on available data
  const suggestion = suggestHospital(text, latestData);
  addMsg("bot", suggestion);
}

function suggestHospital(query, data) {
  const tokens = query.toLowerCase().split(/\W+/).filter(Boolean);
  const urgent = tokens.includes("icu") || tokens.includes("critical") || tokens.includes("oxygen");
  const wardPref = tokens.find((t) => ["icu","general","emergency","operation"].includes(t));
  const ward = wardPref ? wardPref.charAt(0).toUpperCase() + wardPref.slice(1) : (urgent ? "ICU" : "Emergency");

  const candidates = data
    .filter((r) => r.ward.toLowerCase() === ward.toLowerCase() && r.available > 0)
    .sort((a, b) => b.available - a.available);

  if (candidates.length === 0) {
    return `No immediate availability found for ${ward}. Consider General wards or expand search.`;
  }
  const top = candidates.slice(0, 3).map((c) => `${c.hospital} (${c.available}/${c.total})`).join("; ");
  return `Nearest matches for ${ward}: ${top}. If urgent, call 112.`;
}
