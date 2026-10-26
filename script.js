// ==========================================
// UBAY-UBAY CLIENT SCRIPT & API CONFIG
// ==========================================

// PASTE your Apps Script Web App URL here (Deploy > New deployment > Web app).
const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbwobxIUEHGfPOojxzj4VwndNQpKIx_wnZKR1PCPY_CeOceOH15Ochs57X3QbtbKaerJ/exec";

async function callScript(payload) {
  if (!SCRIPT_URL || SCRIPT_URL.indexOf("PASTE_") === 0) {
    throw new Error("The website isn't connected to the database yet (SCRIPT_URL is missing in script.js).");
  }
  const response = await fetch(SCRIPT_URL, {
    method: "POST",
    body: JSON.stringify(payload),
    headers: { "Content-Type": "text/plain;charset=utf-8" } // avoids CORS preflight with Apps Script
  });
  if (!response.ok) throw new Error("Network response failed with status " + response.status);
  const result = await response.json();
  if (result.error) {
    const err = new Error(result.error);
    err.result = result;
    throw err;
  }
  return result;
}

function plainError(error) {
  if (!error) return "An unknown error occurred.";
  return error.message || String(error);
}

// ==========================================
// ACCEPTANCE LETTER FORM (sign-up.html)
// ==========================================
document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("acceptance-form");
  if (!form) return;

  const $ = (id) => document.getElementById(id);
  const status = $("form-status");
  const submitBtn = $("signup-submit");
  const canvas = $("signature-pad");
  let pad = null;
  let lastPdf = null;

  const setStatus = (msg, isError) => {
    status.textContent = msg;
    status.classList.toggle("is-error", Boolean(isError));
  };

  // ---------- signature pad ----------
  function sizeCanvas() {
    const ratio = Math.max(window.devicePixelRatio || 1, 1);
    const w = canvas.offsetWidth, h = canvas.offsetHeight;
    if (!w || (canvas.width === w * ratio && canvas.height === h * ratio)) return;
    const data = pad ? pad.toData() : [];
    canvas.width = w * ratio;
    canvas.height = h * ratio;
    canvas.getContext("2d").scale(ratio, ratio);
    if (pad) { pad.clear(); pad.fromData(data); }
  }
  function initPad() {
    if (!window.SignaturePad) { setTimeout(initPad, 100); return; }
    pad = new window.SignaturePad(canvas, { penColor: "#212338" });
    sizeCanvas();
  }
  window.addEventListener("load", initPad);
  window.addEventListener("resize", sizeCanvas);
  $("signature-clear").addEventListener("click", () => pad && pad.clear());

  // ---------- validation ----------
  const fieldErrors = {
    "full-name": (v) => (v.trim().length < 2 ? "Please enter your full name." : ""),
    "artist-name": (v) => (!v.trim() ? "Please enter your artist name." : ""),
    "email": (v) => (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim()) ? "" : "Please enter a valid email."),
    "social": (v) => (v.trim().length < 2 ? "Please enter your social handle." : "")
  };
  function validate() {
    let firstBad = null;
    Object.keys(fieldErrors).forEach((id) => {
      const msg = fieldErrors[id]($(id).value);
      $(id + "-error").textContent = msg;
      if (msg && !firstBad) firstBad = $(id);
    });
    const agreeMsg = $("agree").checked ? "" : "Please tick the box to agree.";
    $("agree-error").textContent = agreeMsg;
    if (agreeMsg && !firstBad) firstBad = $("agree");
    const sigMsg = pad && !pad.isEmpty() ? "" : "Please sign in the box.";
    $("signature-error").textContent = sigMsg;
    if (sigMsg && !firstBad) firstBad = canvas;
    if (firstBad) { firstBad.focus && firstBad.focus(); firstBad.scrollIntoView({ block: "center" }); }
    return !firstBad;
  }

  // ---------- PDF copy of the signed letter ----------
  const ascii = (s) => s
    .replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, "-").replace(/\u20B1/g, "PHP ").replace(/\u2026/g, "...")
    .replace(/[^\x09\x0A\x20-\x7E\xA0-\xFF]/g, "");

  function buildPdf(d, signatureDataUrl) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const M = 56, W = doc.internal.pageSize.getWidth() - M * 2, H = doc.internal.pageSize.getHeight();
    let y = M;
    const need = (h) => { if (y + h > H - M) { doc.addPage(); y = M; } };
    const write = (text, size, bold, gap) => {
      doc.setFont("helvetica", bold ? "bold" : "normal");
      doc.setFontSize(size);
      doc.splitTextToSize(ascii(text), W).forEach((line) => { need(size + 4); doc.text(line, M, y); y += size + 4; });
      y += gap || 0;
    };
    $("letter-text").innerText.split("\n").map((l) => l.trim()).filter(Boolean).forEach((line, i) => {
      const heading = i === 0 || /^\d+\.\s/.test(line);
      write(line, i === 0 ? 15 : heading ? 11.5 : 10, heading, heading ? 3 : 4);
    });
    need(190);
    y += 12;
    write("Signed by", 11.5, true, 3);
    write("Full name: " + d.fullName, 10);
    write("Artist name: " + d.artistName, 10);
    write("Email: " + d.email, 10);
    write("Social: " + d.social, 10);
    write("Date signed: " + d.dateSigned, 10, false, 6);
    doc.addImage(signatureDataUrl, "PNG", M, y, 180, 70);
    return doc;
  }

  // ---------- submit ----------
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    setStatus("");
    if (!validate()) { setStatus("Please fix the highlighted fields.", true); return; }

    const dateSigned = new Date().toLocaleDateString("en-PH", { year: "numeric", month: "long", day: "numeric" });
    $("date-signed").value = dateSigned;
    const data = {
      fullName: $("full-name").value.trim(),
      artistName: $("artist-name").value.trim(),
      email: $("email").value.trim(),
      social: $("social").value.trim(),
      dateSigned
    };
    const versionEl = document.querySelector("#letter-text .small");
    const signatureDataUrl = pad.toDataURL("image/png");

    submitBtn.disabled = true;
    setStatus("Signing and sending…");
    try {
      lastPdf = buildPdf(data, signatureDataUrl);
      const pdfBase64 = lastPdf.output("datauristring").split("base64,")[1];
      await callScript({
        action: "submitSignup",
        ...data,
        agree: true,
        website: $("website").value,
        letterVersion: versionEl ? versionEl.textContent.trim() : "",
        signaturePng: signatureDataUrl.split("base64,")[1],
        pdfBase64,
        userAgent: navigator.userAgent
      });

      document.querySelectorAll("[data-done]").forEach((node) => { node.textContent = data[node.dataset.done] || ""; });
      form.hidden = true;
      $("signup-done").hidden = false;
      $("signup-done").focus();
      const dlg = $("thanks-dialog");
      if (dlg && dlg.showModal) dlg.showModal();
    } catch (err) {
      setStatus(plainError(err), true);
    } finally {
      submitBtn.disabled = false;
    }
  });

  $("signup-download").addEventListener("click", () => { if (lastPdf) lastPdf.save("Ubay-Ubay-Acceptance-Letter.pdf"); });
});