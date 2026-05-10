/* ═══════════════════════════════════════════════════════════════════════════
   LYVENIA / RODIA — Checkout flow
   - Toggle Mensuel ↔ Annuel sur la grille pricing
   - Modal d'inscription avec auto-fill SIRET via INSEE
   - Modal Enterprise (sur devis)
   ═══════════════════════════════════════════════════════════════════════════ */

(() => {
  "use strict";

  const API_BASE = "https://api.lyvenia.fr";

  // Source unique de vérité pour les tarifs (cohérent avec le backend Stripe)
  const TIERS = {
    solo:       { label: "Société",      monthly: 60,  annual: 576,  fleet: "1-5 véhicules"   },
    flotte:     { label: "Société +",    monthly: 110, annual: 1056, fleet: "6-10 véhicules"  },
    pro:        { label: "Société Pro",  monthly: 160, annual: 1536, fleet: "11-20 véhicules" },
    enterprise: { label: "Enterprise",   monthly: 0,   annual: 0,    fleet: "20+ véhicules"   },
  };

  // ─────────────────────────────────────────────────────────────────────────
  //  TOGGLE MENSUEL ↔ ANNUEL
  // ─────────────────────────────────────────────────────────────────────────

  let currentPeriod = "monthly";

  document.querySelectorAll(".pricing-toggle-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const period = btn.dataset.period;
      if (period === currentPeriod) return;
      currentPeriod = period;

      document.querySelectorAll(".pricing-toggle-btn").forEach(b => {
        const active = b.dataset.period === period;
        b.classList.toggle("is-active", active);
        b.setAttribute("aria-selected", active ? "true" : "false");
      });

      // Met à jour les prix affichés sur les cards
      document.querySelectorAll(".price-amount[data-monthly]").forEach(el => {
        el.textContent = el.dataset[period];
      });
      document.querySelectorAll(".pricing-billed").forEach(el => {
        el.textContent = el.dataset[period + "Text"] || "";
      });
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  //  HELPERS — Modal open/close
  // ─────────────────────────────────────────────────────────────────────────

  function openModal(id) {
    const modal = document.getElementById(id);
    if (!modal) return;
    modal.hidden = false;
    document.body.style.overflow = "hidden";
    // Focus le premier input pour accessibilité
    const firstInput = modal.querySelector("input, select, textarea");
    if (firstInput) setTimeout(() => firstInput.focus(), 50);
  }

  function closeModal(modal) {
    modal.hidden = true;
    document.body.style.overflow = "";
  }

  // Fermeture sur backdrop, croix, ou Escape
  document.querySelectorAll("[data-close-modal]").forEach(el => {
    el.addEventListener("click", () => closeModal(el.closest(".modal")));
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      document.querySelectorAll(".modal:not([hidden])").forEach(closeModal);
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  //  MODAL INSCRIPTION — Open
  // ─────────────────────────────────────────────────────────────────────────

  let selectedTier = null;

  document.querySelectorAll(".js-checkout").forEach(btn => {
    btn.addEventListener("click", () => {
      selectedTier = btn.dataset.tier;
      const tier = TIERS[selectedTier];
      if (!tier) return;

      // Met à jour le titre + récap
      document.getElementById("modalTierLabel").textContent = tier.label;
      document.getElementById("summaryPlan").textContent = `RODIA ${tier.label} — ${tier.fleet}`;
      const price = tier[currentPeriod];
      const periodLabel = currentPeriod === "annual" ? "/an" : "/mois";
      document.getElementById("summaryPrice").textContent = `${price} € HT ${periodLabel}`;

      // Reset le formulaire à chaque ouverture
      document.getElementById("checkoutForm").reset();
      document.getElementById("siretStatus").className = "modal-siret-status";
      hideError("modalError");

      openModal("checkoutModal");
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  //  AUTO-FILL SIRET
  // ─────────────────────────────────────────────────────────────────────────

  const siretInput  = document.getElementById("f-siret");
  const siretStatus = document.getElementById("siretStatus");
  let siretTimer = null;

  // Validation Luhn côté client (filtre les fautes de frappe avant l'API call)
  function isValidLuhn(s) {
    if (!/^\d{14}$/.test(s)) return false;
    let total = 0;
    for (let i = 0; i < 14; i++) {
      let n = parseInt(s[i], 10);
      if (i % 2 === 0) {
        n *= 2;
        if (n > 9) n -= 9;
      }
      total += n;
    }
    return total % 10 === 0;
  }

  siretInput.addEventListener("input", (e) => {
    // Filtre : que des chiffres
    const cleaned = e.target.value.replace(/\D/g, "").slice(0, 14);
    if (e.target.value !== cleaned) e.target.value = cleaned;

    // Reset visuel
    siretStatus.className = "modal-siret-status";

    // Debounce : on attend 500ms après la dernière frappe pour fetcher
    clearTimeout(siretTimer);
    if (cleaned.length !== 14) return;
    if (!isValidLuhn(cleaned)) {
      siretStatus.className = "modal-siret-status is-ko";
      return;
    }
    siretTimer = setTimeout(() => fetchSiret(cleaned), 500);
  });

  async function fetchSiret(siret) {
    siretStatus.className = "modal-siret-status is-loading";
    try {
      const r = await fetch(`${API_BASE}/api/insee/lookup`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ siret }),
      });
      const data = await r.json();

      if (!r.ok) {
        siretStatus.className = "modal-siret-status is-ko";
        return;
      }

      // Auto-remplit les champs (sauf si l'utilisateur a déjà saisi)
      const setIfEmpty = (id, value) => {
        const el = document.getElementById(id);
        if (el && !el.value && value) el.value = value;
      };
      setIfEmpty("f-company", data.name);
      setIfEmpty("f-address", data.address);
      setIfEmpty("f-city",    data.city);
      setIfEmpty("f-zip",     data.zip_code);

      siretStatus.className = data.warning
        ? "modal-siret-status is-warn"
        : "modal-siret-status is-ok";
    } catch (err) {
      console.error("[siret] fetch failed:", err);
      siretStatus.className = "modal-siret-status is-ko";
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  CHECKOUT FORM — Submit
  // ─────────────────────────────────────────────────────────────────────────

  const form     = document.getElementById("checkoutForm");
  const submitBtn = document.getElementById("modalSubmit");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    hideError("modalError");

    const data = Object.fromEntries(new FormData(form).entries());
    data.tier   = selectedTier;
    data.period = currentPeriod;

    // Validation rapide côté client
    if (!data.email || !data.email.includes("@"))
      return showError("modalError", "Email invalide.");
    if (!data.company_name || !data.company_name.trim())
      return showError("modalError", "Nom de société requis.");
    if (!isValidLuhn(data.siret || ""))
      return showError("modalError", "SIRET invalide. 14 chiffres avec checksum valide.");

    submitBtn.disabled = true;
    submitBtn.textContent = "Préparation du paiement…";

    try {
      const r = await fetch(`${API_BASE}/api/checkout/create-session`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(data),
      });
      const result = await r.json();

      if (!r.ok || !result.url) {
        throw new Error(result.error || "Erreur lors de la création de la session de paiement.");
      }
      // Redirige vers Stripe Checkout
      window.location.href = result.url;
    } catch (err) {
      submitBtn.disabled = false;
      submitBtn.textContent = "Continuer vers le paiement";
      showError("modalError", err.message || "Une erreur est survenue. Réessayez.");
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  //  MODAL ENTERPRISE
  // ─────────────────────────────────────────────────────────────────────────

  document.querySelectorAll(".js-enterprise").forEach(btn => {
    btn.addEventListener("click", () => {
      document.getElementById("enterpriseForm").reset();
      hideError("enterpriseError");
      openModal("enterpriseModal");
    });
  });

  const eForm    = document.getElementById("enterpriseForm");
  const eSubmit  = document.getElementById("enterpriseSubmit");

  eForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    hideError("enterpriseError");

    const data = Object.fromEntries(new FormData(eForm).entries());
    if (!data.email || !data.email.includes("@"))
      return showError("enterpriseError", "Email invalide.");
    if (!data.company_name || !data.company_name.trim())
      return showError("enterpriseError", "Nom de société requis.");
    if (!data.fleet_size || !data.fleet_size.trim())
      return showError("enterpriseError", "Taille de flotte requise.");

    eSubmit.disabled = true;
    eSubmit.textContent = "Envoi en cours…";

    try {
      const r = await fetch(`${API_BASE}/api/contact/enterprise`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(data),
      });
      const result = await r.json();
      if (!r.ok) throw new Error(result.error || "Erreur lors de l'envoi.");

      // Remplace le formulaire par un message de succès
      eForm.innerHTML = `
        <div style="text-align:center;padding:2rem 0">
          <div style="font-size:3rem;margin-bottom:1rem">✓</div>
          <h3 style="margin-bottom:.5rem">Demande envoyée !</h3>
          <p style="color:var(--text-muted)">${result.message || "On vous recontacte sous 24h."}</p>
        </div>
      `;
    } catch (err) {
      eSubmit.disabled = false;
      eSubmit.textContent = "Envoyer ma demande";
      showError("enterpriseError", err.message || "Une erreur est survenue. Réessayez.");
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  //  HELPERS — Erreurs
  // ─────────────────────────────────────────────────────────────────────────

  function showError(id, msg) {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = msg;
    el.hidden = false;
  }
  function hideError(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.hidden = true;
    el.textContent = "";
  }
})();
