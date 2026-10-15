// =====================================================================
// 1. STORAGE — replace this section with Supabase later.
//    Right now everything is saved in the browser (localStorage).
// =====================================================================
const store = {
  get(key, fallback) {
    try { return JSON.parse(localStorage.getItem("lakify." + key)) ?? fallback; }
    catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem("lakify." + key, JSON.stringify(value)); }
    catch { toast("Browser storage is full. Delete a flat or use smaller photos."); }
  }
};

// =====================================================================
// 2. DATA
// =====================================================================
let role     = store.get("role", null);                        // "tenant" or "landlord"
let listings = store.get("listings", []);                      // all flats
let tenant   = store.get("tenant", { saved: [], skipped: [], docs: {} });
let tab      = role === "landlord" ? "flats" : "swipe";

const DISTRICTS = ["I","II","III","IV","V","VI","VII","VIII","IX","X","XI","XII",
                   "XIII","XIV","XV","XVI","XVII","XVIII","XIX","XX","XXI","XXII","XXIII"];

function saveAll() {
  store.set("role", role);
  store.set("listings", listings);
  store.set("tenant", tenant);
}

// =====================================================================
// 3. HELPERS
// =====================================================================
const $ = (sel) => document.querySelector(sel);
const screen = $("#screen");
const forint = (n) => Number(n).toLocaleString("hu-HU") + " Ft";
const escape = (s) => String(s ?? "").replace(/[&<>"']/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c]));

function toast(message) {
  document.querySelectorAll(".toast").forEach(t => t.remove());
  const t = document.createElement("div");
  t.className = "toast";
  t.textContent = message;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2500);
}

// Read a file as a data URL. Photos are shrunk so they fit in browser storage.
function readFile(file) {
  return new Promise((resolve, reject) => {
    if (file.type === "application/pdf") {
      if (file.size > 1_000_000) return reject("PDFs must be under 1 MB in this demo.");
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.readAsDataURL(file);
      return;
    }
    if (!file.type.startsWith("image/")) return reject("Use a JPG, PNG or PDF file.");
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, 900 / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = img.width * scale;
      canvas.height = img.height * scale;
      canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL("image/jpeg", 0.8));
    };
    img.onerror = () => reject("That image couldn't be opened.");
    img.src = URL.createObjectURL(file);
  });
}

// =====================================================================
// 4. NAVIGATION
// =====================================================================
function render() {
  $("#switchBtn").hidden = !role;
  $("#tabs").hidden = !role;

  if (!role) return renderHome();

  const tabs = role === "tenant"
    ? [["swipe", "Swipe"], ["saved", "Saved"], ["docs", "Documents"]]
    : [["flats", "My flats"], ["add", "Add flat"]];
  $("#tabs").innerHTML = tabs.map(([key, label]) =>
    `<button data-tab="${key}" class="${tab === key ? "active" : ""}">${label}</button>`).join("");

  if (tab === "swipe") renderSwipe();
  if (tab === "saved") renderSaved();
  if (tab === "docs")  renderDocs();
  if (tab === "flats") renderMyFlats();
  if (tab === "add")   renderAddFlat();
}

$("#tabs").onclick = (e) => {
  const button = e.target.closest("[data-tab]");
  if (button) { tab = button.dataset.tab; render(); }
};

$("#switchBtn").onclick = () => {
  role = role === "tenant" ? "landlord" : "tenant";
  tab = role === "tenant" ? "swipe" : "flats";
  saveAll();
  render();
};

$("#logo").onclick = () => { role = null; saveAll(); render(); };

// =====================================================================
// 5. START SCREEN
// =====================================================================
function renderHome() {
  screen.innerHTML = `
    <h1>Swipe your way into a Budapest flat.</h1>
    <p class="muted">Choose how you want to use Lakify.</p>
    <button class="role" data-role="tenant">
      <b>I'm looking for a flat</b><br>
      <span class="muted">Swipe flats, save favourites and upload your documents.</span>
    </button>
    <button class="role" data-role="landlord">
      <b>I have a flat to rent</b><br>
      <span class="muted">List your flat with photos and proof of ownership.</span>
    </button>`;
  screen.querySelectorAll("[data-role]").forEach(button => {
    button.onclick = () => {
      role = button.dataset.role;
      tab = role === "tenant" ? "swipe" : "flats";
      saveAll();
      render();
    };
  });
}

// =====================================================================
// 6. TENANT: SWIPE
// =====================================================================
function nextFlat() {
  return listings.find(f => !tenant.saved.includes(f.id) && !tenant.skipped.includes(f.id));
}

function renderSwipe() {
  const flat = nextFlat();
  if (!flat) {
    screen.innerHTML = `
      <div class="empty">
        <h2>No more flats</h2>
        <p class="muted">${listings.length ? "You've seen every flat." : "No flats have been listed yet. Switch to landlord and add one."}</p>
        ${tenant.skipped.length ? `<button class="btn light" id="again">Show skipped flats again</button>` : ""}
      </div>`;
    const again = $("#again");
    if (again) again.onclick = () => { tenant.skipped = []; saveAll(); render(); };
    return;
  }

  screen.innerHTML = `
    <div class="deck">
      <div class="card" id="card">
        <div class="photo" style="background-image:url('${flat.photos[0] || ""}')">
          <div class="stamp like">LIKE</div>
          <div class="stamp nope">NOPE</div>
          <div class="price">${forint(flat.rent)}/mo</div>
        </div>
        <div class="info">
          <h3>${escape(flat.title)}</h3>
          <div class="muted">${escape(flat.address)} · District ${flat.district}</div>
          <div class="muted">${flat.size} m² · ${flat.rooms} room(s)</div>
        </div>
      </div>
    </div>
    <div class="buttons">
      <button class="round nope" id="nopeBtn" aria-label="Skip">✕</button>
      <button class="round like" id="likeBtn" aria-label="Save">♥</button>
    </div>`;

  $("#nopeBtn").onclick = () => decide(flat, false);
  $("#likeBtn").onclick = () => decide(flat, true);
  enableDrag($("#card"), flat);
}

function decide(flat, liked) {
  const card = $("#card");
  card.style.transform = `translateX(${liked ? 500 : -500}px) rotate(${liked ? 20 : -20}deg)`;
  if (liked) tenant.saved.push(flat.id); else tenant.skipped.push(flat.id);
  saveAll();
  setTimeout(render, 250);
}

// Drag the card left or right with mouse or finger
function enableDrag(card, flat) {
  let startX = null;
  card.onpointerdown = (e) => { startX = e.clientX; card.classList.add("dragging"); card.setPointerCapture(e.pointerId); };
  card.onpointermove = (e) => {
    if (startX === null) return;
    const dx = e.clientX - startX;
    card.style.transform = `translateX(${dx}px) rotate(${dx / 20}deg)`;
    card.querySelector(".like").style.opacity = Math.max(0, dx / 100);
    card.querySelector(".nope").style.opacity = Math.max(0, -dx / 100);
  };
  card.onpointerup = (e) => {
    const dx = e.clientX - startX;
    startX = null;
    card.classList.remove("dragging");
    if (dx > 100) decide(flat, true);
    else if (dx < -100) decide(flat, false);
    else card.style.transform = "";
  };
}

// =====================================================================
// 7. TENANT: SAVED
// =====================================================================
function renderSaved() {
  const saved = listings.filter(f => tenant.saved.includes(f.id));
  screen.innerHTML = `<h2>Saved flats</h2>` + (saved.length
    ? saved.map(f => `
        <div class="item">
          <div class="thumb" style="background-image:url('${f.photos[0] || ""}')"></div>
          <div>
            <h3>${escape(f.title)}</h3>
            <div class="muted">${forint(f.rent)}/mo · District ${f.district} · ${f.size} m²</div>
            <p class="muted">${escape(f.description)}</p>
            <button class="btn light small" data-remove="${f.id}">Remove</button>
          </div>
        </div>`).join("")
    : `<div class="empty"><p class="muted">Swipe right on a flat to save it here.</p></div>`);

  screen.querySelectorAll("[data-remove]").forEach(button => {
    button.onclick = () => {
      tenant.saved = tenant.saved.filter(id => id !== button.dataset.remove);
      saveAll();
      render();
    };
  });
}

// =====================================================================
// 8. TENANT: DOCUMENTS
// =====================================================================
const TENANT_DOCS = [
  ["id",     "ID card or passport"],
  ["income", "Proof of income (payslip or employment contract)"],
];

function renderDocs() {
  screen.innerHTML = `<h2>Your documents</h2>
    <p class="muted">Landlords ask for these before a viewing.</p>` +
    TENANT_DOCS.map(([key, label]) => {
      const doc = tenant.docs[key];
      return `
        <div class="doc">
          <h3>${label}</h3>
          ${doc ? `<span class="badge">Uploaded: ${escape(doc.name)}</span>` : `<span class="badge missing">Missing</span>`}
          <p><input type="file" accept="image/*,application/pdf" data-doc="${key}"></p>
        </div>`;
    }).join("");

  screen.querySelectorAll("[data-doc]").forEach(input => {
    input.onchange = async () => {
      const file = input.files[0];
      if (!file) return;
      try {
        tenant.docs[input.dataset.doc] = { name: file.name, data: await readFile(file) };
        saveAll();
        toast("Document uploaded");
        render();
      } catch (message) { toast(message); }
    };
  });
}

// =====================================================================
// 9. LANDLORD: MY FLATS
// =====================================================================
function renderMyFlats() {
  screen.innerHTML = `<h2>My flats</h2>` + (listings.length
    ? listings.map(f => `
        <div class="item">
          <div class="thumb" style="background-image:url('${f.photos[0] || ""}')"></div>
          <div>
            <h3>${escape(f.title)}</h3>
            <div class="muted">${forint(f.rent)}/mo · District ${f.district} · ${f.photos.length} photo(s)</div>
            <p>${f.proof ? `<span class="badge">Proof of ownership uploaded</span>` : `<span class="badge missing">No proof of ownership</span>`}</p>
            <button class="btn light small" data-delete="${f.id}">Delete</button>
          </div>
        </div>`).join("")
    : `<div class="empty"><p class="muted">You haven't listed a flat yet.</p><button class="btn yellow" id="addFirst">Add your first flat</button></div>`);

  const addFirst = $("#addFirst");
  if (addFirst) addFirst.onclick = () => { tab = "add"; render(); };

  screen.querySelectorAll("[data-delete]").forEach(button => {
    button.onclick = () => {
      listings = listings.filter(f => f.id !== button.dataset.delete);
      saveAll();
      toast("Flat deleted");
      render();
    };
  });
}

// =====================================================================
// 10. LANDLORD: ADD FLAT
// =====================================================================
function renderAddFlat() {
  let photos = [];
  let proof = null;

  screen.innerHTML = `
    <h2>Add a flat</h2>
    <form class="form" id="flatForm">
      <label>Title <input name="title" required placeholder="Bright two-room flat near Deák tér"></label>
      <label>Address <input name="address" required placeholder="Király utca 20"></label>
      <div class="row">
        <label>District
          <select name="district">${DISTRICTS.map(d => `<option>${d}</option>`).join("")}</select>
        </label>
        <label>Rent per month (Ft) <input name="rent" type="number" required min="1" placeholder="250000"></label>
      </div>
      <div class="row">
        <label>Size (m²) <input name="size" type="number" required min="1" placeholder="45"></label>
        <label>Rooms <input name="rooms" type="number" required min="1" value="1"></label>
      </div>
      <label>Description <textarea name="description" rows="4" placeholder="Describe the flat, the building and the neighbourhood."></textarea></label>
      <label>Photos <input type="file" accept="image/*" multiple id="photoInput"></label>
      <div class="photos" id="photoPreview"></div>
      <label>Proof of ownership (tulajdoni lap) <input type="file" accept="image/*,application/pdf" id="proofInput"></label>
      <div class="muted" id="proofName"></div>
      <button class="btn yellow" type="submit">Publish flat</button>
    </form>`;

  $("#photoInput").onchange = async (e) => {
    for (const file of e.target.files) {
      try { photos.push(await readFile(file)); } catch (message) { toast(message); }
    }
    $("#photoPreview").innerHTML = photos.map(src => `<img src="${src}" alt="">`).join("");
  };

  $("#proofInput").onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      proof = { name: file.name, data: await readFile(file) };
      $("#proofName").textContent = "Uploaded: " + file.name;
    } catch (message) { toast(message); }
  };

  $("#flatForm").onsubmit = (e) => {
    e.preventDefault();
    if (!photos.length) return toast("Add at least one photo.");
    const form = new FormData(e.target);
    listings.unshift({
      id: Date.now().toString(),
      title: form.get("title"),
      address: form.get("address"),
      district: form.get("district"),
      rent: Number(form.get("rent")),
      size: Number(form.get("size")),
      rooms: Number(form.get("rooms")),
      description: form.get("description"),
      photos,
      proof,
    });
    saveAll();
    toast("Flat published");
    tab = "flats";
    render();
  };
}

// =====================================================================
// START
// =====================================================================
render();
