// info-modal.js — Shared info icon + modal system for Schedule Validator
// Requires: learn-data.js loaded first

(function () {
  'use strict';

  /* ── Build modal DOM ─────────────────────────────────── */
  function createModal() {
    const el = document.createElement('div');
    el.id = 'infoModal';
    el.className = 'info-modal-overlay';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.innerHTML = `
      <div class="info-modal-box">
        <button class="info-modal-close" aria-label="Close">&times;</button>
        <div class="info-modal-header">
          <span class="info-modal-icon" id="imIcon"></span>
          <div>
            <div class="info-modal-cat" id="imCategory"></div>
            <h2 class="info-modal-title" id="imTitle"></h2>
          </div>
        </div>
        <div class="info-modal-body">
          <p class="info-modal-definition" id="imDefinition"></p>
          <div class="info-modal-section" id="imWhyWrap">
            <div class="info-modal-section-label">Why it matters</div>
            <p id="imWhy"></p>
          </div>
          <div class="info-modal-grid">
            <div class="info-modal-pill" id="imThreshWrap">
              <div class="info-modal-pill-label">Target / Threshold</div>
              <div class="info-modal-pill-value" id="imThreshold"></div>
            </div>
            <div class="info-modal-pill" id="imWeightWrap">
              <div class="info-modal-pill-label">Score Weight</div>
              <div class="info-modal-pill-value" id="imWeight"></div>
            </div>
            <div class="info-modal-pill" id="imFormulaWrap">
              <div class="info-modal-pill-label">Formula</div>
              <div class="info-modal-pill-value" id="imFormula"></div>
            </div>
          </div>
          <div class="info-modal-tip" id="imTipWrap">
            <span class="info-modal-tip-label">💡 Pro Tip</span>
            <span id="imTip"></span>
          </div>
          <div class="info-modal-footer">
            <a href="learn.html" class="info-modal-learn-link" id="imLearnLink">
              View full glossary →
            </a>
          </div>
        </div>
      </div>`;
    document.body.appendChild(el);

    // Close handlers
    el.querySelector('.info-modal-close').addEventListener('click', closeModal);
    el.addEventListener('click', function (e) {
      if (e.target === el) closeModal();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeModal();
    });

    return el;
  }

  function getModal() {
    return document.getElementById('infoModal') || createModal();
  }

  /* ── Open / close ────────────────────────────────────── */
  function openModal(topicKey) {
    const topics = window.LEARN_TOPICS || {};
    const topic = topics[topicKey];
    if (!topic) {
      console.warn('No learn topic found for key:', topicKey);
      return;
    }

    const modal = getModal();

    document.getElementById('imIcon').textContent = topic.icon || 'ℹ️';
    document.getElementById('imCategory').textContent = topic.category || '';
    document.getElementById('imTitle').textContent = topic.title || topicKey;
    document.getElementById('imDefinition').textContent = topic.definition || '';

    // Why it matters
    const whyWrap = document.getElementById('imWhyWrap');
    document.getElementById('imWhy').textContent = topic.whyMatters || '';
    whyWrap.style.display = topic.whyMatters ? '' : 'none';

    // Threshold
    const threshWrap = document.getElementById('imThreshWrap');
    document.getElementById('imThreshold').textContent = topic.threshold || '';
    threshWrap.style.display = topic.threshold ? '' : 'none';

    // Weight
    const weightWrap = document.getElementById('imWeightWrap');
    document.getElementById('imWeight').textContent = topic.weight || '';
    weightWrap.style.display = topic.weight ? '' : 'none';

    // Formula
    const formulaWrap = document.getElementById('imFormulaWrap');
    document.getElementById('imFormula').textContent = topic.formula || '';
    formulaWrap.style.display = topic.formula ? '' : 'none';

    // Tip
    const tipWrap = document.getElementById('imTipWrap');
    document.getElementById('imTip').textContent = topic.tip || '';
    tipWrap.style.display = topic.tip ? '' : 'none';

    // Learn more link — anchor to specific topic on learn page
    const learnLink = document.getElementById('imLearnLink');
    learnLink.href = 'learn.html#' + topicKey;

    modal.classList.add('open');
    modal.querySelector('.info-modal-box').focus();
  }

  function closeModal() {
    const modal = document.getElementById('infoModal');
    if (modal) modal.classList.remove('open');
  }

  /* ── Event delegation — handles dynamically-created buttons ── */
  function injectInfoButtons() {
    // Global click delegation — catches info buttons added anywhere in HTML
    document.addEventListener('click', function (e) {
      const btn = e.target.closest('[data-info-topic]');
      if (btn) {
        e.stopPropagation();
        openModal(btn.dataset.infoTopic);
      }
    });
  }

  function addInfoButton(headerEl, topicKey, isEye) {
    // Don't add twice
    if (headerEl.querySelector('.info-icon-btn')) return;
    const btn = document.createElement('button');
    btn.className = 'info-icon-btn';
    btn.setAttribute('aria-label', 'Learn more');
    btn.setAttribute('title', 'Learn more');
    btn.dataset.infoTopic = topicKey;
    btn.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><circle cx="12" cy="8" r="0.5" fill="currentColor"/></svg>`;
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      openModal(topicKey);
    });
    headerEl.appendChild(btn);
  }

  function addEyeButton(containerEl, topicKey) {
    if (containerEl.querySelector('.eye-icon-btn')) return;
    const btn = document.createElement('button');
    btn.className = 'eye-icon-btn';
    btn.setAttribute('aria-label', 'What does this mean?');
    btn.setAttribute('title', 'What does this mean?');
    btn.dataset.infoTopic = topicKey;
    btn.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`;
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      openModal(topicKey);
    });
    containerEl.appendChild(btn);
  }

  /* ── Public API ──────────────────────────────────────── */
  window.InfoModal = {
    open: openModal,
    close: closeModal,
    inject: injectInfoButtons
  };

  // Auto-init after DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectInfoButtons);
  } else {
    injectInfoButtons();
  }
})();
