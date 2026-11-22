/* =========================================================
   SISTEM INVENTARIS ASET PT. ZEEA
   Frontend: HTML + CSS + JavaScript
   Database: Supabase PostgreSQL + Realtime Presence
   ========================================================= */

/* 1. KONFIGURASI SUPABASE */
const SUPABASE_URL = "https://ecesditmbkdiarojfkgx.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_69NOpt4RqYqIGkmuPaw7MQ_Muz01Dl3";

let supabaseClient = null;
let presenceChannel = null;
let assets = [];
let categories = [];
let disposals = [];
let visitorLogs = [];
let onlineVisitorCodes = new Set();

const $ = (id) => document.getElementById(id);

const PAGE_TITLES = {
  dashboard: "Dashboard",
  assets: "Data Aset",
  disposal: "Disposal",
  damaged: "Aset Rusak",
  categories: "Kategori",
  visitors: "Log Pengunjung"
};

/* 2. FUNGSI UMUM */

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[character]);
}

function formatDate(value) {
  if (!value) return "-";
  const parts = String(value).split("-");
  if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("id-ID");
}

function formatDateTime(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("id-ID", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });
}

function formatRupiah(value) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0
  }).format(Number(value) || 0);
}

function todayISO() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

function showAlert(message, type = "success") {
  const area = $("alert-area");
  if (!area) return;

  area.innerHTML = `
    <div class="alert ${type}">
      <span>${escapeHTML(message)}</span>
      <button class="alert-close" type="button" aria-label="Tutup">×</button>
    </div>
  `;

  area.querySelector(".alert-close")?.addEventListener("click", () => {
    area.innerHTML = "";
  });

  window.clearTimeout(area._timer);
  area._timer = window.setTimeout(() => {
    if (area.querySelector(".alert")) area.innerHTML = "";
  }, 6000);
}

function showModal(id) {
  const modal = $(id);
  if (modal) modal.classList.add("open");
}

function closeModal(id) {
  const modal = $(id);
  if (modal) modal.classList.remove("open");
}

function getCategoryName(asset) {
  return asset.kategori?.nama_kategori
    || categories.find((category) => String(category.id) === String(asset.kategori_id))?.nama_kategori
    || "-";
}

function statusBadge(status) {
  const map = {
    Baik: "good",
    Rusak: "danger",
    Disposal: "neutral"
  };
  return `<span class="badge ${map[status] || "neutral"}">${escapeHTML(status || "Belum diisi")}</span>`;
}

function setButtonLoading(button, loading, loadingText = "Menyimpan...") {
  if (!button) return;
  if (loading) {
    button.dataset.originalText = button.textContent;
    button.textContent = loadingText;
    button.disabled = true;
  } else {
    button.textContent = button.dataset.originalText || button.textContent;
    button.disabled = false;
  }
}

/* 3. DETEKSI PERANGKAT & PENGUNJUNG OTOMATIS */

function getCurrentVisitorIdentity() {
  let code = localStorage.getItem("zeea_visitor_code");
  if (!code) {
    const randomPart = Math.random().toString(36).substring(2, 6).toUpperCase();
    code = `VIS-${randomPart}`;
    localStorage.setItem("zeea_visitor_code", code);
  }
  const name = localStorage.getItem("zeea_visitor_name") || "Tamu / Pengunjung";
  return { code, name };
}

function detectDeviceInfo() {
  const ua = navigator.userAgent || "";

  let perangkat = "Desktop / Laptop";
  if (/Tablet|iPad/i.test(ua)) {
    perangkat = "Tablet";
  } else if (/Mobi|Android|iPhone/i.test(ua)) {
    perangkat = "HP / Mobile";
  }

  let sistem_operasi = "Tidak diketahui";
  if (/Windows NT 10/i.test(ua)) sistem_operasi = "Windows 10/11";
  else if (/Windows/i.test(ua)) sistem_operasi = "Windows";
  else if (/Android/i.test(ua)) sistem_operasi = "Android";
  else if (/iPhone|iPad|iPod/i.test(ua)) sistem_operasi = "iOS";
  else if (/Mac OS X/i.test(ua)) sistem_operasi = "macOS";
  else if (/Linux/i.test(ua)) sistem_operasi = "Linux";

  let browser = "Browser Lainnya";
  if (/Edg\//i.test(ua)) browser = "Microsoft Edge";
  else if (/OPR\//i.test(ua) || /Opera/i.test(ua)) browser = "Opera";
  else if (/Chrome\//i.test(ua)) browser = "Google Chrome";
  else if (/Firefox\//i.test(ua)) browser = "Mozilla Firefox";
  else if (/Safari\//i.test(ua)) browser = "Apple Safari";

  const resolusi_layar = `${window.screen.width}x${window.screen.height}`;

  return { perangkat, sistem_operasi, browser, resolusi_layar };
}

async function trackVisitorOpen() {
  if (!supabaseClient) return;
  const { code, name } = getCurrentVisitorIdentity();
  const info = detectDeviceInfo();

  try {
    await supabaseClient.from("log_pengunjung").insert({
      visitor_code: code,
      nama_pengunjung: name,
      perangkat: info.perangkat,
      browser: info.browser,
      sistem_operasi: info.sistem_operasi,
      resolusi_layar: info.resolusi_layar
    });
  } catch (err) {
    console.warn("Log pengunjung belum tersimpan:", err.message);
  }
}

function initVisitorRealtimePresence() {
  if (!supabaseClient) return;
  const { code, name } = getCurrentVisitorIdentity();
  onlineVisitorCodes.add(code);
  updateOnlineCounterUI();

  presenceChannel = supabaseClient.channel("zeea-online-visitors", {
    config: { presence: { key: code } }
  });

  presenceChannel
    .on("presence", { event: "sync" }, () => {
      const state = presenceChannel.presenceState();
      onlineVisitorCodes = new Set(Object.keys(state));
      if (!onlineVisitorCodes.size) onlineVisitorCodes.add(code);
      updateOnlineCounterUI();
      renderVisitors();
    })
    .on("presence", { event: "join" }, ({ key, newPresences }) => {
      if (key !== code) {
        const visitorName = newPresences?.[0]?.name || "Pengunjung";
        showAlert(`Terdeteksi: ${visitorName} (${key}) baru saja membuka web.`, "success");
        loadVisitorLogs().then(renderVisitors).catch(() => {});
      }
    })
    .subscribe(async (status) => {
      if (status === "SUBSCRIBED") {
        await presenceChannel.track({
          code,
          name,
          online_at: new Date().toISOString()
        });
      }
    });
}

function updateOnlineCounterUI() {
  const count = Math.max(1, onlineVisitorCodes.size);
  if ($("online-count-text")) {
    $("online-count-text").textContent = `${count} Online`;
  }
  if ($("visitor-online-count")) {
    $("visitor-online-count").textContent = count;
  }
}

async function loadVisitorLogs() {
  const { data, error } = await supabaseClient
    .from("log_pengunjung")
    .select("*")
    .order("waktu_akses", { ascending: false })
    .limit(100);

  if (error) {
    console.warn("Tabel log_pengunjung belum siap:", error.message);
    visitorLogs = [];
    return;
  }
  visitorLogs = data || [];
}

function renderVisitors() {
  const tbody = $("visitors-table-body");
  if (!tbody) return;

  const { code: myCode } = getCurrentVisitorIdentity();
  const todayStr = todayISO();

  const uniqueVisitors = new Set(visitorLogs.map((item) => item.visitor_code)).size;
  const todayVisits = visitorLogs.filter((item) => {
    if (!item.waktu_akses) return false;
    const localDate = new Date(item.waktu_akses);
    const iso = new Date(localDate.getTime() - localDate.getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 10);
    return iso === todayStr;
  }).length;

  updateOnlineCounterUI();
  if ($("visitor-total-count")) $("visitor-total-count").textContent = visitorLogs.length;
  if ($("visitor-unique-count")) $("visitor-unique-count").textContent = uniqueVisitors;
  if ($("visitor-today-count")) $("visitor-today-count").textContent = todayVisits;

  const query = ($("visitor-search")?.value || "").trim().toLowerCase();
  const filtered = visitorLogs.filter((item) => {
    const text = `${item.visitor_code || ""} ${item.nama_pengunjung || ""} ${item.perangkat || ""} ${item.sistem_operasi || ""} ${item.browser || ""}`.toLowerCase();
    return text.includes(query);
  });

  if (!filtered.length) {
    tbody.innerHTML = `<tr><td colspan="7" class="empty-state">Belum ada riwayat pengunjung yang cocok.</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map((item) => {
    const isOnline = onlineVisitorCodes.has(item.visitor_code);
    const isMe = item.visitor_code === myCode;
    return `
      <tr>
        <td>${escapeHTML(formatDateTime(item.waktu_akses))}</td>
        <td>${escapeHTML(item.visitor_code)} ${isMe ? '<span class="badge neutral">Anda</span>' : ""}</td>
        <td>${escapeHTML(item.nama_pengunjung || "Tamu / Pengunjung")}</td>
        <td>${escapeHTML(item.perangkat || "-")} (${escapeHTML(item.sistem_operasi || "-")})</td>
        <td>${escapeHTML(item.browser || "-")}</td>
        <td>${escapeHTML(item.resolusi_layar || "-")}</td>
        <td>${isOnline
          ? '<span class="badge good">Sedang Online</span>'
          : '<span class="badge neutral">Tercatat</span>'}</td>
      </tr>
    `;
  }).join("");
}

async function setMyVisitorName() {
  const { code, name } = getCurrentVisitorIdentity();
  const input = window.prompt(
    `Masukkan nama atau label untuk perangkat ini (${code}):`,
    name
  );
  if (input === null) return;

  const trimmed = input.trim() || "Tamu / Pengunjung";
  localStorage.setItem("zeea_visitor_name", trimmed);

  if (presenceChannel) {
    await presenceChannel.track({
      code,
      name: trimmed,
      online_at: new Date().toISOString()
    });
  }

  if (supabaseClient) {
    await supabaseClient
      .from("log_pengunjung")
      .update({ nama_pengunjung: trimmed })
      .eq("visitor_code", code);
    await loadVisitorLogs();
    renderVisitors();
  }
  showAlert(`Nama perangkat diperbarui menjadi "${trimmed}".`);
}

/* 4. PERHITUNGAN MASA MANFAAT */

function endOfUsefulLife(asset) {
  if (!asset?.tanggal_perolehan) return null;

  const parts = String(asset.tanggal_perolehan).split("-").map(Number);
  if (parts.length !== 3 || parts.some((part) => !Number.isFinite(part))) {
    return null;
  }

  const [year, month, day] = parts;
  const life = Number(asset.masa_manfaat_tahun);

  if (!year || !month || !day || !Number.isFinite(life) || life < 1) {
    return null;
  }

  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }

  date.setFullYear(date.getFullYear() + Math.floor(life));
  return date;
}

function daysUntil(date) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  return Math.round((target - today) / 86400000);
}

function getUsefulLifeStatus(asset) {
  const endDate = endOfUsefulLife(asset);

  if (!endDate) {
    return {
      date: "-",
      days: null,
      label: "Tanggal belum valid",
      className: "neutral"
    };
  }

  const days = daysUntil(endDate);
  const formatted = formatDate(
    `${endDate.getFullYear()}-${String(endDate.getMonth() + 1).padStart(2, "0")}-${String(endDate.getDate()).padStart(2, "0")}`
  );

  if (days < 0) {
    return { date: formatted, days, label: "Masa manfaat terlewati", className: "danger" };
  }
  if (days <= 180) {
    return { date: formatted, days, label: "Segera berakhir", className: "warning" };
  }
  return { date: formatted, days, label: "Masih dalam masa manfaat", className: "good" };
}

/* 5. AMBIL DATA DARI SUPABASE */

async function loadAssets() {
  const { data, error } = await supabaseClient
    .from("aset")
    .select("*, kategori(nama_kategori)")
    .order("created_at", { ascending: false });

  if (error) throw new Error(`Gagal memuat aset: ${error.message}`);
  assets = data || [];
}

async function loadCategories() {
  const { data, error } = await supabaseClient
    .from("kategori")
    .select("*")
    .order("nama_kategori", { ascending: true });

  if (error) throw new Error(`Gagal memuat kategori: ${error.message}`);
  categories = data || [];
}

async function loadDisposals() {
  const { data, error } = await supabaseClient
    .from("disposal")
    .select("*, aset(kode_aset, nama_aset)")
    .order("tanggal_disposal", { ascending: false });

  if (error) throw new Error(`Gagal memuat data disposal: ${error.message}`);
  disposals = data || [];
}

async function refreshData() {
  await Promise.all([loadCategories(), loadAssets(), loadDisposals(), loadVisitorLogs()]);
  renderAll();
}

/* 6. DASHBOARD DAN PENGINGAT MASA MANFAAT */

function renderDashboard() {
  const usableAssets = assets.filter((asset) => asset.kondisi === "Baik");
  const damagedAssets = assets.filter((asset) => asset.kondisi === "Rusak");
  const disposedAssets = assets.filter((asset) => asset.kondisi === "Disposal");

  $("total-aset").textContent = assets.length;
  const totalNilaiAset = assets.reduce((total, asset) => {
    return total + (Number(asset.harga_perolehan) || 0);
  }, 0);

  $("total-nilai-aset").textContent = formatRupiah(totalNilaiAset);
  $("total-bisa-dipakai").textContent = usableAssets.length;
  $("total-rusak").textContent = damagedAssets.length;
  $("total-sudah-dilepas").textContent = disposedAssets.length;
  $("total-kategori").textContent = categories.length;

  const tbody = $("expiry-table-body");
  if (!tbody) return;

  const activeAssets = assets
    .filter((asset) => asset.kondisi !== "Disposal")
    .map((asset) => ({
      asset,
      status: getUsefulLifeStatus(asset)
    }))
    .sort((a, b) => {
      if (a.status.days === null) return 1;
      if (b.status.days === null) return -1;
      return a.status.days - b.status.days;
    });

  if (activeAssets.length === 0) {
    tbody.innerHTML = `
      <tr><td colspan="4" class="empty-state">
        Belum ada aset aktif. Tambahkan data aset terlebih dahulu.
      </td></tr>`;
    return;
  }

  tbody.innerHTML = activeAssets.map(({ asset, status }) => `
    <tr>
      <td>${escapeHTML(asset.kode_aset || "-")}</td>
      <td>${escapeHTML(asset.nama_aset || "-")}</td>
      <td>${escapeHTML(status.date)}</td>
      <td><span class="badge ${status.className}">${escapeHTML(status.label)}</span></td>
    </tr>
  `).join("");
}

/* 7. TABEL DATA ASET */

function renderAssets() {
  const tbody = $("assets-table-body");
  if (!tbody) return;

  const query = ($("asset-search")?.value || "").trim().toLowerCase();
  const filter = $("asset-filter")?.value || "";

  const filtered = assets.filter((asset) => {
    const text = `${asset.kode_aset || ""} ${asset.nama_aset || ""} ${getCategoryName(asset)}`.toLowerCase();
    return text.includes(query) && (!filter || asset.kondisi === filter);
  });

  if (!filtered.length) {
    tbody.innerHTML = `<tr><td colspan="7" class="empty-state">Tidak ada data aset yang cocok.</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map((asset) => `
    <tr>
      <td>${escapeHTML(asset.kode_aset || "-")}</td>
      <td>${escapeHTML(asset.nama_aset || "-")}</td>
      <td>${escapeHTML(getCategoryName(asset))}</td>
      <td>${escapeHTML(formatDate(asset.tanggal_perolehan))}</td>
      <td>${statusBadge(asset.kondisi)}</td>
      <td>${escapeHTML(asset.lokasi || "-")}</td>
      <td>
        <div class="table-actions">
          <button type="button" class="action-button" data-action="edit-asset" data-id="${escapeHTML(asset.id)}">Edit</button>
          <button type="button" class="action-button" data-action="delete-asset" data-id="${escapeHTML(asset.id)}">Hapus</button>
        </div>
      </td>
    </tr>
  `).join("");
}

/* 8. TABEL DISPOSAL */

function renderDisposals() {
  const tbody = $("disposal-table-body");
  if (!tbody) return;

  const query = ($("disposal-search")?.value || "").trim().toLowerCase();
  const filtered = disposals.filter((item) => {
    const asset = item.aset || assets.find((a) => String(a.id) === String(item.aset_id));
    const text = `${asset?.kode_aset || ""} ${asset?.nama_aset || ""} ${item.alasan || ""}`.toLowerCase();
    return text.includes(query);
  });

  if (!filtered.length) {
    tbody.innerHTML = `<tr><td colspan="5" class="empty-state">Belum ada data disposal.</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map((item) => {
    const asset = item.aset || assets.find((a) => String(a.id) === String(item.aset_id));
    const nilai = item.nilai_disposal ?? item.nilai_jual ?? 0;
    return `
      <tr>
        <td>${escapeHTML(asset?.kode_aset || "-")}</td>
        <td>${escapeHTML(asset?.nama_aset || "-")}</td>
        <td>${escapeHTML(formatDate(item.tanggal_disposal))}</td>
        <td>${escapeHTML(item.alasan || "-")}</td>
        <td>${escapeHTML(formatRupiah(nilai))}</td>
      </tr>
    `;
  }).join("");
}

/* 9. TABEL ASET RUSAK */

function renderDamaged() {
  const tbody = $("damaged-table-body");
  if (!tbody) return;

  const query = ($("damaged-search")?.value || "").trim().toLowerCase();
  const damaged = assets.filter((asset) => {
    const text = `${asset.kode_aset || ""} ${asset.nama_aset || ""} ${getCategoryName(asset)} ${asset.lokasi || ""}`.toLowerCase();
    return asset.kondisi === "Rusak" && text.includes(query);
  });

  if (!damaged.length) {
    tbody.innerHTML = `<tr><td colspan="6" class="empty-state">Tidak ada aset rusak yang tercatat.</td></tr>`;
    return;
  }

  tbody.innerHTML = damaged.map((asset) => `
    <tr>
      <td>${escapeHTML(asset.kode_aset || "-")}</td>
      <td>${escapeHTML(asset.nama_aset || "-")}</td>
      <td>${escapeHTML(getCategoryName(asset))}</td>
      <td>${escapeHTML(asset.lokasi || "-")}</td>
      <td>${escapeHTML(asset.keterangan || "-")}</td>
      <td><button type="button" class="action-button" data-action="edit-condition" data-id="${escapeHTML(asset.id)}">Perbarui Kondisi</button></td>
    </tr>
  `).join("");
}

/* 10. TAMPILAN KATEGORI */

function renderCategories() {
  const grid = $("category-grid");
  if (!grid) return;

  if (!categories.length) {
    grid.innerHTML = `<div class="empty-card">Belum ada kategori. Klik “Tambah Kategori” untuk membuat kategori baru.</div>`;
    return;
  }

  grid.innerHTML = categories.map((category, index) => {
    const count = assets.filter((asset) => String(asset.kategori_id) === String(category.id)).length;
    const symbols = ["▦", "⌘", "▤", "◇", "✦", "◈"];

    return `
      <article class="category-card">
        <div class="category-symbol">${symbols[index % symbols.length]}</div>
        <h3>${escapeHTML(category.nama_kategori || "Kategori")}</h3>
        <p>${escapeHTML(category.deskripsi || "Tidak ada deskripsi kategori.")}</p>
        <div class="category-count">${count} aset terdaftar</div>
      </article>
    `;
  }).join("");
}

function renderAll() {
  renderDashboard();
  renderAssets();
  renderDisposals();
  renderDamaged();
  renderCategories();
  renderVisitors();
  updateSelectOptions();
}

/* 11. DROPDOWN KATEGORI DAN ASET */

function updateSelectOptions() {
  const categorySelect = $("asset-category");
  if (categorySelect) {
    const previousValue = categorySelect.value;
    categorySelect.innerHTML = `<option value="">Pilih kategori</option>` +
      categories.map((category) => `
        <option value="${escapeHTML(category.id)}">${escapeHTML(category.nama_kategori)}</option>
      `).join("");
    categorySelect.value = previousValue;
  }

  const disposalSelect = $("disposal-asset");
  if (disposalSelect) {
    const previousValue = disposalSelect.value;
    const eligible = assets.filter((asset) => asset.kondisi !== "Disposal");
    disposalSelect.innerHTML = `<option value="">Pilih aset</option>` +
      eligible.map((asset) => `
        <option value="${escapeHTML(asset.id)}">${escapeHTML(asset.kode_aset)} — ${escapeHTML(asset.nama_aset)}</option>
      `).join("");
    disposalSelect.value = previousValue;
  }
}

/* 12. SIMPAN ASET BARU ATAU EDIT ASET */

function openAssetForm(asset = null) {
  updateSelectOptions();

  $("asset-form").reset();
  $("asset-id").value = asset?.id || "";
  $("asset-modal-title").textContent = asset ? "Edit Aset" : "Tambah Aset";
  $("save-asset-btn").textContent = asset ? "Simpan Perubahan" : "Simpan Aset";

  $("asset-code").value = asset?.kode_aset || "";
  $("asset-name").value = asset?.nama_aset || "";
  $("asset-category").value = asset?.kategori_id ? String(asset.kategori_id) : "";
  $("asset-date").value = asset?.tanggal_perolehan || todayISO();
  $("asset-price").value = asset?.harga_perolehan ?? 0;
  $("asset-life").value = asset?.masa_manfaat_tahun ?? 5;
  $("asset-condition").value = asset?.kondisi || "Baik";
  $("asset-location").value = asset?.lokasi || "";
  $("asset-notes").value = asset?.keterangan || "";

  showModal("asset-modal");

  if (!categories.length && supabaseClient) {
    loadCategories()
      .then(() => {
        updateSelectOptions();
        if (asset?.kategori_id) {
          $("asset-category").value = String(asset.kategori_id);
        }
      })
      .catch((error) => {
        showAlert(`Kategori gagal dimuat: ${error.message}`, "error");
      });
  }
}

async function saveAsset(event) {
  event.preventDefault();

  if (!supabaseClient) {
    showAlert("Koneksi Supabase belum siap. Periksa koneksi internet Anda.", "error");
    return;
  }

  const button = $("save-asset-btn");
  setButtonLoading(button, true);

  const id = $("asset-id").value;
  const rawCategoryId = $("asset-category").value;

  const payload = {
    kode_aset: $("asset-code").value.trim(),
    nama_aset: $("asset-name").value.trim(),
    kategori_id: rawCategoryId ? Number(rawCategoryId) : null,
    tanggal_perolehan: $("asset-date").value,
    harga_perolehan: Number($("asset-price").value) || 0,
    masa_manfaat_tahun: Number($("asset-life").value),
    kondisi: $("asset-condition").value,
    lokasi: $("asset-location").value.trim() || null,
    keterangan: $("asset-notes").value.trim() || null
  };

  try {
    if (!payload.kode_aset) throw new Error("Kode aset wajib diisi.");
    if (!payload.nama_aset) throw new Error("Nama aset wajib diisi.");
    if (!payload.kategori_id) throw new Error("Silakan pilih kategori aset terlebih dahulu.");
    if (!payload.tanggal_perolehan) throw new Error("Tanggal perolehan wajib diisi.");
    if (payload.masa_manfaat_tahun < 1) throw new Error("Masa manfaat minimal 1 tahun.");

    let result;
    if (id) {
      result = await supabaseClient
        .from("aset")
        .update(payload)
        .eq("id", Number(id))
        .select();
    } else {
      result = await supabaseClient
        .from("aset")
        .insert(payload)
        .select();
    }

    if (result.error) throw result.error;

    closeModal("asset-modal");
    await refreshData();
    showAlert(id ? "Data aset berhasil diperbarui." : "Aset baru berhasil ditambahkan.");
  } catch (error) {
    console.error("Gagal menyimpan aset:", error);
    showAlert(error.message || "Gagal menyimpan data aset.", "error");
  } finally {
    setButtonLoading(button, false);
  }
}

async function deleteAsset(id) {
  const asset = assets.find((item) => String(item.id) === String(id));
  if (!asset) return;

  const confirmed = window.confirm(
    `Hapus aset "${asset.nama_aset}" (${asset.kode_aset})?`
  );
  if (!confirmed) return;

  const numericId = Number(id);

  try {
    await supabaseClient.from("riwayat_kondisi").delete().eq("aset_id", numericId);
    await supabaseClient.from("disposal").delete().eq("aset_id", numericId);

    const { error } = await supabaseClient
      .from("aset")
      .delete()
      .eq("id", numericId);

    if (error) throw error;

    await refreshData();
    showAlert("Data aset berhasil dihapus.");
  } catch (error) {
    console.error("Gagal menghapus aset:", error);
    showAlert(`Aset tidak dapat dihapus: ${error.message}`, "error");
  }
}

/* 13. TAMBAH KATEGORI */

async function saveCategory(event) {
  event.preventDefault();

  const name = $("category-name").value.trim();
  const description = $("category-description").value.trim();

  if (!name) {
    showAlert("Nama kategori wajib diisi.", "error");
    return;
  }

  try {
    const { error } = await supabaseClient.from("kategori").insert({
      nama_kategori: name,
      deskripsi: description || null
    });

    if (error) throw error;

    closeModal("category-modal");
    $("category-form").reset();
    await refreshData();
    showAlert("Kategori berhasil ditambahkan.");
  } catch (error) {
    showAlert(`Gagal menambahkan kategori: ${error.message}`, "error");
  }
}

/* 14. DISPOSAL ASET */

async function saveDisposal(event) {
  event.preventDefault();

  const assetId = $("disposal-asset").value;
  const date = $("disposal-date").value;
  const reason = $("disposal-reason").value.trim();
  const value = Number($("disposal-value").value) || 0;

  if (!assetId || !date || !reason) {
    showAlert("Lengkapi aset, tanggal, dan alasan disposal.", "error");
    return;
  }

  const numericAssetId = Number(assetId);
  const asset = assets.find((item) => String(item.id) === String(assetId));
  if (!asset) {
    showAlert("Aset tidak ditemukan. Muat ulang data lalu coba lagi.", "error");
    return;
  }

  try {
    const { error: disposalError } = await supabaseClient
      .from("disposal")
      .insert({
        aset_id: numericAssetId,
        tanggal_disposal: date,
        alasan: reason,
        nilai_disposal: value
      });

    if (disposalError) throw disposalError;

    const { error: assetError } = await supabaseClient
      .from("aset")
      .update({ kondisi: "Disposal" })
      .eq("id", numericAssetId);

    closeModal("disposal-modal");
    $("disposal-form").reset();

    await refreshData();

    if (assetError) {
      showAlert(
        `Catatan disposal tersimpan, tetapi kondisi aset belum berubah: ${assetError.message}`,
        "error"
      );
      return;
    }

    showAlert("Disposal berhasil dicatat dan kondisi aset telah diperbarui.");
  } catch (error) {
    showAlert(`Gagal mencatat disposal: ${error.message}`, "error");
  }
}

/* 15. PERBARUI KONDISI ASET */

function openConditionForm(id) {
  const asset = assets.find((item) => String(item.id) === String(id));
  if (!asset) return;

  $("condition-asset-id").value = asset.id;
  $("condition-asset-name").value = asset.nama_aset || "";
  $("condition-new-value").value = asset.kondisi === "Rusak" ? "Baik" : "Rusak";
  $("condition-notes").value = "";
  showModal("condition-modal");
}

async function saveCondition(event) {
  event.preventDefault();

  const id = $("condition-asset-id").value;
  const numericId = Number(id);
  const newCondition = $("condition-new-value").value;
  const notes = $("condition-notes").value.trim();
  const asset = assets.find((item) => String(item.id) === String(id));

  if (!asset) {
    showAlert("Data aset tidak ditemukan.", "error");
    return;
  }

  if (asset.kondisi === "Disposal") {
    showAlert("Aset yang sudah dilepas tidak bisa diubah melalui menu kondisi rusak.", "error");
    return;
  }

  try {
    const { error } = await supabaseClient
      .from("aset")
      .update({
        kondisi: newCondition,
        keterangan: notes || asset.keterangan || null
      })
      .eq("id", numericId);

    if (error) throw error;

    const { error: historyError } = await supabaseClient
      .from("riwayat_kondisi")
      .insert({
        aset_id: numericId,
        kondisi_baru: newCondition,
        tanggal_laporan: todayISO(),
        keterangan: notes || null
      });

    closeModal("condition-modal");
    await refreshData();

    if (historyError) {
      showAlert(
        `Kondisi aset berhasil diubah, tetapi riwayat kondisi belum tersimpan: ${historyError.message}`,
        "error"
      );
    } else {
      showAlert("Kondisi aset berhasil diperbarui.");
    }
  } catch (error) {
    showAlert(`Gagal memperbarui kondisi aset: ${error.message}`, "error");
  }
}

/* 16. NAVIGASI ANTARHALAMAN */

function navigateTo(page) {
  if (!PAGE_TITLES[page]) return;

  document.querySelectorAll(".page-section").forEach((section) => {
    section.classList.toggle("active", section.id === `page-${page}`);
  });

  document.querySelectorAll(".nav-link").forEach((button) => {
    button.classList.toggle("active", button.dataset.page === page);
  });

  $("page-title").textContent = PAGE_TITLES[page];
  $("breadcrumb-current").textContent = PAGE_TITLES[page];
  $("sidebar").classList.remove("open");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

/* 17. PASANG EVENT LISTENER */

function bindEvents() {
  document.querySelectorAll(".nav-link").forEach((button) => {
    button.addEventListener("click", () => navigateTo(button.dataset.page));
  });

  document.querySelectorAll("[data-open-page]").forEach((button) => {
    button.addEventListener("click", () => {
      const targetPage = button.dataset.openPage;
      navigateTo(targetPage);
      if (targetPage === "assets" && button.textContent.includes("Tambah Aset")) {
        openAssetForm();
      }
    });
  });

  document.querySelectorAll("[data-close-modal]").forEach((button) => {
    button.addEventListener("click", () => closeModal(button.dataset.closeModal));
  });

  document.querySelectorAll(".modal-backdrop").forEach((backdrop) => {
    backdrop.addEventListener("click", (event) => {
      if (event.target === backdrop) closeModal(backdrop.id);
    });
  });

  $("mobile-menu")?.addEventListener("click", () => {
    $("sidebar").classList.toggle("open");
  });

  $("add-asset-btn")?.addEventListener("click", () => openAssetForm());
  $("add-category-btn")?.addEventListener("click", () => {
    $("category-form").reset();
    showModal("category-modal");
  });
  $("add-disposal-btn")?.addEventListener("click", () => {
    $("disposal-form").reset();
    $("disposal-date").value = todayISO();
    updateSelectOptions();
    showModal("disposal-modal");
  });

  $("online-indicator")?.addEventListener("click", () => navigateTo("visitors"));
  $("set-visitor-name-btn")?.addEventListener("click", setMyVisitorName);
  $("refresh-visitors-btn")?.addEventListener("click", async () => {
    await loadVisitorLogs();
    renderVisitors();
    showAlert("Log pengunjung diperbarui.");
  });

  $("asset-form")?.addEventListener("submit", saveAsset);
  $("category-form")?.addEventListener("submit", saveCategory);
  $("disposal-form")?.addEventListener("submit", saveDisposal);
  $("condition-form")?.addEventListener("submit", saveCondition);

  $("asset-search")?.addEventListener("input", renderAssets);
  $("asset-filter")?.addEventListener("change", renderAssets);
  $("disposal-search")?.addEventListener("input", renderDisposals);
  $("damaged-search")?.addEventListener("input", renderDamaged);
  $("visitor-search")?.addEventListener("input", renderVisitors);

  $("assets-table-body")?.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button) return;

    const { action, id } = button.dataset;
    if (action === "edit-asset") {
      const asset = assets.find((item) => String(item.id) === String(id));
      if (asset) openAssetForm(asset);
    } else if (action === "delete-asset") {
      deleteAsset(id);
    }
  });

  $("damaged-table-body")?.addEventListener("click", (event) => {
    const button = event.target.closest('button[data-action="edit-condition"]');
    if (button) openConditionForm(button.dataset.id);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      document.querySelectorAll(".modal-backdrop.open").forEach((modal) => closeModal(modal.id));
      $("sidebar").classList.remove("open");
    }
  });
}

/* 18. MULAI APLIKASI */

async function initApp() {
  if ($("current-date")) {
    $("current-date").textContent = new Date().toLocaleDateString("id-ID", {
      day: "numeric",
      month: "long",
      year: "numeric"
    });
  }
  if ($("footer-year")) {
    $("footer-year").textContent = new Date().getFullYear();
  }

  bindEvents();

  if (!window.supabase?.createClient) {
    showAlert("Library Supabase gagal dimuat. Periksa koneksi internet lalu muat ulang halaman.", "error");
    return;
  }

  supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  await trackVisitorOpen();
  initVisitorRealtimePresence();

  try {
    await refreshData();
  } catch (error) {
    console.error("Kesalahan saat memuat data Supabase:", error);
    showAlert(`Data gagal dimuat: ${error.message}`, "error");
  }
}

window.addEventListener("error", (event) => {
  showAlert(`Error JavaScript: ${event.message}`, "error");
});

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initApp);
} else {
  initApp();
}