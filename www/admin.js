const API_UPDATE_URL = "/cgi-bin/update_beds.cgi";

const form = document.getElementById("updateForm");
const hospital = document.getElementById("hospital");
const ward = document.getElementById("ward");
const total = document.getElementById("total");
const available = document.getElementById("available");
const formMsg = document.getElementById("formMsg");

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  formMsg.textContent = "";

  const params = new URLSearchParams({
    hospital: hospital.value.trim(),
    ward: ward.value,
    total: total.value,
    available: available.value,
  });

  try {
    const res = await fetch(API_UPDATE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.error || "Update failed");
    formMsg.style.color = "#16a34a";
    formMsg.textContent = "Update saved.";
  } catch (err) {
    formMsg.style.color = "#ef4444";
    formMsg.textContent = err.message;
  }
});
