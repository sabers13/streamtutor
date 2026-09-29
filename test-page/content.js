"use strict";
(() => {
  // src/types.ts
  var DEFAULT_SETTINGS = {
    enabled: true,
    aiEnabled: false,
    userLevel: "A2",
    threshold: "B1",
    backendUrl: "http://localhost:8000",
    position: "bottom"
  };

  // src/utils/normalizer.ts
  var HTML_ENTITY_MAP = {
    "&quot;": '"',
    "&apos;": "'",
    "&#39;": "'",
    "&amp;": "&",
    "&lt;": "<",
    "&gt;": ">",
    "&nbsp;": " ",
    "&auml;": "\xE4",
    "&ouml;": "\xF6",
    "&uuml;": "\xFC",
    "&szlig;": "\xDF",
    "&Auml;": "\xC4",
    "&Ouml;": "\xD6",
    "&Uuml;": "\xDC"
  };
  function unescapeHtml(text) {
    if (!text) return "";
    return text.replace(/&(?:[a-zA-Z]+|#\d+|#x[a-fA-F0-9]+);/g, (match) => {
      if (HTML_ENTITY_MAP[match]) return HTML_ENTITY_MAP[match];
      if (match.startsWith("&#x")) {
        const hex = match.slice(3, -1);
        return String.fromCharCode(parseInt(hex, 16));
      }
      if (match.startsWith("&#")) {
        const dec = match.slice(2, -1);
        return String.fromCharCode(parseInt(dec, 10));
      }
      return match;
    });
  }
  function normalizeSubtitleText(raw) {
    if (!raw) return "";
    const unescaped = unescapeHtml(raw);
    const noTags = unescaped.replace(/<[^>]+>/g, " ");
    const singleLine = noTags.replace(/[\r\n]+/g, " ");
    const noDash = singleLine.replace(/^[-–—]\s*/, "");
    const cleanPunctuation = noDash.replace(/\s+([,.:;!?])/g, "$1");
    return cleanPunctuation.replace(/\s+/g, " ").trim();
  }
  function canonicalTextForMatch(text) {
    const norm = normalizeSubtitleText(text).toLowerCase();
    return norm.replace(/^[„“"«»'…\-—\s]+|[„“"«»'…!?:;.,\s]+$/g, "").trim();
  }

  // src/services/backend-client.ts
  var BackendClient = class {
    memoryCache = /* @__PURE__ */ new Map();
    defaultBackendUrl = "http://localhost:8000";
    constructor(backendUrl) {
      if (backendUrl) {
        this.defaultBackendUrl = backendUrl.replace(/\/+$/, "");
      }
    }
    setBackendUrl(url) {
      this.defaultBackendUrl = url.replace(/\/+$/, "");
    }
    getCacheKey(text, previous, next, userLevel, threshold, aiEnabled) {
      const t = canonicalTextForMatch(text);
      const p = previous ? canonicalTextForMatch(previous) : "";
      const n = next ? canonicalTextForMatch(next) : "";
      return `${t}__${p}__${n}__${userLevel || "A2"}__${threshold || "B1"}__ai:${aiEnabled !== false}`;
    }
    async checkHealth(backendUrl) {
      const base = (backendUrl || this.defaultBackendUrl).replace(/\/+$/, "");
      try {
        const response = await fetch(`${base}/health`, {
          method: "GET",
          headers: { "Accept": "application/json" }
        });
        if (!response.ok) {
          return { ok: false, error: `HTTP ${response.status}: ${response.statusText}` };
        }
        const data = await response.json();
        return { ok: true, data };
      } catch (err) {
        return { ok: false, error: err?.message || "Failed to connect to backend" };
      }
    }
    async analyzeSentence(text, options) {
      const cleanText = normalizeSubtitleText(text);
      if (!cleanText) return null;
      const userLevel = options?.userLevel || "A2";
      const threshold = options?.threshold || "B1";
      const aiEnabled = options?.aiEnabled !== false;
      const backendUrl = (options?.backendUrl || this.defaultBackendUrl).replace(/\/+$/, "");
      const cacheKey = this.getCacheKey(cleanText, options?.previous, options?.next, userLevel, threshold, aiEnabled);
      if (this.memoryCache.has(cacheKey)) {
        return this.memoryCache.get(cacheKey);
      }
      const payload = {
        text: cleanText,
        previous: options?.previous,
        next: options?.next,
        user_level: userLevel,
        threshold,
        ai_enabled: aiEnabled
      };
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8e3);
        const response = await fetch(`${backendUrl}/analyze-sentence`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Accept": "application/json"
          },
          body: JSON.stringify(payload),
          signal: controller.signal
        });
        clearTimeout(timeoutId);
        if (!response.ok) {
          console.warn(`[GermanTutor] Backend returned HTTP ${response.status}: ${response.statusText}`);
          return null;
        }
        const data = await response.json();
        this.memoryCache.set(cacheKey, data);
        return data;
      } catch (err) {
        console.warn("[GermanTutor] Error requesting sentence analysis from backend:", err);
        return null;
      }
    }
    async explainSentence(text, options) {
      const cleanText = normalizeSubtitleText(text);
      if (!cleanText) return null;
      const backendUrl = (options?.backendUrl || this.defaultBackendUrl).replace(/\/+$/, "");
      const payload = {
        text: cleanText,
        previous: options?.previous,
        next: options?.next,
        user_level: options?.userLevel || "A2"
      };
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 12e3);
        const response = await fetch(`${backendUrl}/explain-sentence`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Accept": "application/json"
          },
          body: JSON.stringify(payload),
          signal: controller.signal
        });
        clearTimeout(timeoutId);
        if (!response.ok) {
          console.warn(`[GermanTutor] Explain returned HTTP ${response.status}`);
          return null;
        }
        const data = await response.json();
        return data.explanation || null;
      } catch (err) {
        console.warn("[GermanTutor] Error requesting explanation from backend:", err);
        return null;
      }
    }
    async lookupWord(word, backendUrl) {
      const clean = word.trim().replace(/^[.,!?:;"'()«»]+|[.,!?:;"'()«»]+$/g, "");
      if (!clean) return null;
      const cacheKey = `word::${clean.toLowerCase()}`;
      if (this.memoryCache.has(cacheKey)) {
        return this.memoryCache.get(cacheKey);
      }
      const base = (backendUrl || this.defaultBackendUrl).replace(/\/+$/, "");
      try {
        const response = await fetch(`${base}/lookup-word?word=${encodeURIComponent(clean)}`, {
          method: "GET",
          headers: { Accept: "application/json" }
        });
        if (!response.ok) return null;
        const data = await response.json();
        this.memoryCache.set(cacheKey, data);
        return data;
      } catch (err) {
        console.warn("[GermanTutor] Error looking up word:", err);
        return null;
      }
    }
    async saveFlashcard(req, backendUrl) {
      const base = (backendUrl || this.defaultBackendUrl).replace(/\/+$/, "");
      try {
        const response = await fetch(`${base}/save-flashcard`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json"
          },
          body: JSON.stringify(req)
        });
        if (!response.ok) return null;
        return await response.json();
      } catch (err) {
        console.warn("[GermanTutor] Error saving flashcard:", err);
        return null;
      }
    }
    async getFlashcardCount(backendUrl) {
      const base = (backendUrl || this.defaultBackendUrl).replace(/\/+$/, "");
      try {
        const response = await fetch(`${base}/flashcard-count`, {
          method: "GET",
          headers: { Accept: "application/json" }
        });
        if (!response.ok) return 0;
        const data = await response.json();
        return data.count ?? 0;
      } catch {
        return 0;
      }
    }
    getExportUrl(format = "csv", backendUrl) {
      const base = (backendUrl || this.defaultBackendUrl).replace(/\/+$/, "");
      return `${base}/export-flashcards?format=${encodeURIComponent(format)}`;
    }
    async clearFlashcards(backendUrl) {
      const base = (backendUrl || this.defaultBackendUrl).replace(/\/+$/, "");
      try {
        const response = await fetch(`${base}/flashcards`, {
          method: "DELETE",
          headers: { Accept: "application/json" }
        });
        return response.ok;
      } catch {
        return false;
      }
    }
    clearMemoryCache() {
      this.memoryCache.clear();
    }
  };
  var backendClient = new BackendClient();

  // src/services/prime-observer.ts
  var PrimeObserver = class {
    videoElement = null;
    observer = null;
    pollInterval = null;
    lastCapturedText = "";
    handlers = [];
    CAPTION_SELECTORS = [
      ".atvwebplayersdk-captions-text",
      ".atvwebplayersdk-captions-overlay",
      ".atvwebplayersdk-subtitle-text",
      "[class*='atvwebplayersdk-captions']",
      "[class*='atvwebplayersdk-subtitle']",
      "[class*='captions-text']",
      "[class*='captionsOverlay']",
      "[class*='subtitle-text']",
      "[class*='subtitles-text']",
      "[class*='timed-text']",
      "#fake-captions"
      // Local fake test page support
    ];
    start() {
      this.findAndBindVideo();
      this.setupMutationObserver();
      this.setupPolling();
    }
    stop() {
      if (this.observer) {
        this.observer.disconnect();
        this.observer = null;
      }
      if (this.pollInterval !== null) {
        window.clearInterval(this.pollInterval);
        this.pollInterval = null;
      }
    }
    onCaptionChange(handler) {
      this.handlers.push(handler);
    }
    getVideo() {
      if (!this.videoElement || !this.videoElement.isConnected) {
        this.findAndBindVideo();
      }
      return this.videoElement;
    }
    getCurrentTimeMs() {
      const video = this.getVideo();
      if (video && typeof video.currentTime === "number") {
        return Math.floor(video.currentTime * 1e3);
      }
      return 0;
    }
    findAndBindVideo() {
      const candidates = [
        document.querySelector("#dv-web-player video"),
        document.querySelector(".webPlayerContainer video"),
        document.querySelector("video")
      ];
      for (const v of candidates) {
        if (v) {
          this.videoElement = v;
          break;
        }
      }
    }
    cachedCaptionEl = null;
    rAFPending = false;
    extractVisibleCaptionText() {
      if (this.cachedCaptionEl && this.cachedCaptionEl.isConnected) {
        const txt = (this.cachedCaptionEl.innerText || this.cachedCaptionEl.textContent || "").trim();
        return normalizeSubtitleText(txt);
      }
      const primeCaptionEl = document.querySelector(
        ".atvwebplayersdk-captions-text, .atvwebplayersdk-subtitle-text, #fake-captions"
      );
      if (primeCaptionEl) {
        this.cachedCaptionEl = primeCaptionEl;
        const txt = (primeCaptionEl.innerText || primeCaptionEl.textContent || "").trim();
        return normalizeSubtitleText(txt);
      }
      for (const selector of this.CAPTION_SELECTORS) {
        const found = document.querySelector(selector);
        if (found) {
          const txt = (found.innerText || found.textContent || "").trim();
          if (txt) {
            this.cachedCaptionEl = found;
            return normalizeSubtitleText(txt);
          }
        }
      }
      return "";
    }
    checkCaptions() {
      const text = this.extractVisibleCaptionText();
      if (text !== this.lastCapturedText) {
        this.lastCapturedText = text;
        if (text) {
          console.log("[GermanTutor] Subtitle detected on Prime Video:", text);
        }
        const timeMs = this.getCurrentTimeMs();
        for (const handler of this.handlers) {
          try {
            handler(text, timeMs);
          } catch (err) {
            console.error("[GermanTutor] Error in caption handler:", err);
          }
        }
      }
    }
    setupMutationObserver() {
      if (this.observer) {
        this.observer.disconnect();
      }
      this.observer = new MutationObserver(() => {
        if (this.rAFPending) return;
        this.rAFPending = true;
        requestAnimationFrame(() => {
          this.rAFPending = false;
          this.checkCaptions();
        });
      });
      const targetNode = document.querySelector("#dv-web-player") || document.querySelector(".webPlayerContainer") || document.body;
      if (targetNode) {
        this.observer.observe(targetNode, {
          childList: true,
          subtree: true,
          characterData: true
        });
      }
    }
    setupPolling() {
      if (this.pollInterval !== null) {
        window.clearInterval(this.pollInterval);
      }
      this.pollInterval = window.setInterval(() => {
        this.checkCaptions();
      }, 400);
    }
  };
  var primeObserver = new PrimeObserver();

  // src/services/asbplayer-adapter.ts
  var AsbplayerAdapter = class {
    bound = false;
    currentCues = [];
    onCuesUpdatedCallbacks = [];
    constructor() {
      this.init();
    }
    init() {
      if (this.bound) return;
      this.bound = true;
      document.addEventListener("asbplayer-synced-data", (event) => {
        const detail = event.detail;
        if (!detail) return;
        console.log("[GermanTutor] Received asbplayer-synced-data:", detail);
        const tracks = detail.subtitles || [];
        const germanTrack = tracks.find(
          (t) => t.language.toLowerCase().startsWith("de") || t.label && t.label.toLowerCase().includes("deutsch") || t.label && t.label.toLowerCase().includes("german")
        );
        if (germanTrack && germanTrack.url) {
          console.log("[GermanTutor] Detected German subtitle track from asbplayer:", germanTrack);
        }
      });
      this.requestAsbplayerData();
    }
    requestAsbplayerData() {
      try {
        document.dispatchEvent(new CustomEvent("asbplayer-get-synced-data"));
      } catch (e) {
      }
    }
    setCues(cues) {
      this.currentCues = cues;
      this.onCuesUpdatedCallbacks.forEach((cb) => cb(cues));
    }
    getCues() {
      return this.currentCues;
    }
    onCuesUpdated(callback) {
      this.onCuesUpdatedCallbacks.push(callback);
    }
  };
  var asbplayerAdapter = new AsbplayerAdapter();

  // src/utils/cue-matcher.ts
  function findCueByText(visibleText, cues) {
    if (!visibleText || !cues || cues.length === 0) return null;
    const targetNorm = normalizeSubtitleText(visibleText);
    const targetCanonical = canonicalTextForMatch(visibleText);
    if (!targetCanonical) return null;
    for (let i = 0; i < cues.length; i++) {
      const cueCanonical = canonicalTextForMatch(cues[i].text);
      if (cueCanonical === targetCanonical) {
        return {
          cue: cues[i],
          index: i,
          previous: i > 0 ? cues[i - 1] : void 0,
          next: i < cues.length - 1 ? cues[i + 1] : void 0
        };
      }
    }
    for (let i = 0; i < cues.length; i++) {
      const cueCanonical = canonicalTextForMatch(cues[i].text);
      if (cueCanonical.length > 5 && (targetCanonical.includes(cueCanonical) || cueCanonical.includes(targetCanonical))) {
        return {
          cue: cues[i],
          index: i,
          previous: i > 0 ? cues[i - 1] : void 0,
          next: i < cues.length - 1 ? cues[i + 1] : void 0
        };
      }
    }
    return null;
  }

  // src/ui/overlay.ts
  var OverlayManager = class {
    container = null;
    currentAnalysis = null;
    currentExplanation = null;
    isExplaining = false;
    isSavingSentence = false;
    sentenceSaved = false;
    settings;
    onSettingsChangeCallback;
    isVisible = false;
    // Yomitan-style word popover state
    markedWordEl = null;
    popoverEl = null;
    activeWord = null;
    constructor(settings) {
      this.settings = { ...settings };
      this.setupGlobalDismissListeners();
    }
    updateSettings(newSettings) {
      this.settings = { ...this.settings, ...newSettings };
      if (!this.settings.enabled) {
        this.closeWordPopover();
        this.render();
      } else if (this.currentAnalysis) {
        this.render();
      }
    }
    onSettingsChange(cb) {
      this.onSettingsChangeCallback = cb;
    }
    setupGlobalDismissListeners() {
      document.addEventListener("click", (e) => {
        const target = e.target;
        if (!target) return;
        if (!target.closest(".gst-word") && !target.closest("#gst-word-popover") && this.popoverEl) {
          this.closeWordPopover();
        }
      });
      document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && this.popoverEl) {
          this.closeWordPopover();
        }
      });
    }
    ensureContainer() {
      const pos = this.settings.position || "bottom";
      const className = `gst-overlay-container gst-pos-${pos}`;
      const targetParent = document.fullscreenElement || document.getElementById("dv-web-player") || document.querySelector(".webPlayerUIContainer") || document.body;
      if (this.container && this.container.isConnected) {
        this.container.className = className;
        if (this.container.parentElement !== targetParent) {
          targetParent.appendChild(this.container);
        }
        return this.container;
      }
      const existing = document.getElementById("german-stream-tutor-overlay");
      if (existing) {
        existing.className = className;
        if (existing.parentElement !== targetParent) {
          targetParent.appendChild(existing);
        }
        this.container = existing;
        return this.container;
      }
      const container = document.createElement("div");
      container.id = "german-stream-tutor-overlay";
      container.className = className;
      targetParent.appendChild(container);
      this.container = container;
      return container;
    }
    showAnalysis(analysis) {
      if (this.currentAnalysis?.text !== analysis.text) {
        this.currentExplanation = null;
        this.isExplaining = false;
        this.sentenceSaved = false;
        this.closeWordPopover();
      }
      this.currentAnalysis = analysis;
      if (!this.settings.enabled) {
        this.render();
        return;
      }
      if (!analysis.show_help) {
        this.hide();
        return;
      }
      this.render();
    }
    hide() {
      this.closeWordPopover();
      if (this.container) {
        this.container.style.display = "none";
        this.isVisible = false;
      }
    }
    closeWordPopover() {
      if (this.markedWordEl) {
        this.markedWordEl.classList.remove("gst-word-marked");
        this.markedWordEl = null;
      }
      if (this.popoverEl) {
        this.popoverEl.remove();
        this.popoverEl = null;
      }
      this.activeWord = null;
    }
    /**
     * Tokenizes German sentence into interactive Yomitan-style word spans while preserving
     * whitespace, punctuation, and hyphens.
     */
    renderInteractiveGermanWords(text) {
      if (!text) return "";
      const regex = /([\p{L}\p{N}]+(?:['’\-][\p{L}\p{N}]+)*|[^\p{L}\p{N}\s]+|\s+)/gu;
      const tokens = text.match(regex) || [text];
      return tokens.map((token) => {
        if (/[\p{L}\p{N}]/u.test(token)) {
          const cleanWord = token.replace(/^[.,!?:;"'()«»]+|[.,!?:;"'()«»]+$/g, "");
          return `<span class="gst-word gst-selectable" data-word="${escapeHtml(cleanWord)}" title="Click to lookup & save '${escapeHtml(cleanWord)}'">${escapeHtml(token)}</span>`;
        }
        return escapeHtml(token);
      }).join("");
    }
    /**
     * Shows Yomitan-style floating popover anchored above/below the clicked or hovered word.
     */
    async showWordPopover(word, targetEl) {
      if (!this.container || !this.currentAnalysis) return;
      if (this.activeWord === word && this.popoverEl) {
        this.closeWordPopover();
        return;
      }
      this.closeWordPopover();
      this.activeWord = word;
      this.markedWordEl = targetEl;
      targetEl.classList.add("gst-word-marked");
      const popover = document.createElement("div");
      popover.id = "gst-word-popover";
      popover.className = "gst-word-popover";
      popover.innerHTML = `
      <div class="gst-popover-header">
        <div class="gst-popover-word-title">
          <strong>${escapeHtml(word)}</strong>
          <span class="gst-popover-loading">\u23F3 Looking up...</span>
        </div>
        <button class="gst-popover-close-btn" title="Close">\u2715</button>
      </div>
      <div class="gst-popover-body">
        <div class="gst-popover-meaning-text">...</div>
      </div>
      <div class="gst-popover-footer">
        <button class="gst-popover-save-btn" id="gst-popover-save-btn" title="Save to flashcards file (Wortlaut & Anki)">
          \u2795 Save Flashcard
        </button>
      </div>
    `;
      this.container.appendChild(popover);
      this.popoverEl = popover;
      this.positionPopover(popover, targetEl);
      const closeBtn = popover.querySelector(".gst-popover-close-btn");
      if (closeBtn) {
        closeBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          this.closeWordPopover();
        });
      }
      popover.addEventListener("click", (e) => {
        e.stopPropagation();
      });
      let meaning = "";
      let grammarInfo = null;
      const lowerWord = word.toLowerCase();
      if (this.currentAnalysis.important_words) {
        const found = this.currentAnalysis.important_words.find(
          (w) => w.word.toLowerCase() === lowerWord || lowerWord.includes(w.word.toLowerCase())
        );
        if (found) {
          meaning = found.meaning;
        }
      }
      if (!meaning) {
        const res = await backendClient.lookupWord(
          word,
          this.settings.backendUrl
        );
        if (res && res.meaning) {
          meaning = res.meaning;
          grammarInfo = res.grammar || null;
        }
      }
      if (!meaning) {
        meaning = `German: ${word}`;
      }
      const titleContainer = popover.querySelector(".gst-popover-word-title");
      const meaningText = popover.querySelector(".gst-popover-meaning-text");
      const saveBtn = popover.querySelector("#gst-popover-save-btn");
      if (titleContainer) {
        titleContainer.innerHTML = `
        <strong class="gst-popover-word-name">${escapeHtml(word)}</strong>
        ${grammarInfo ? `<span class="gst-popover-grammar-badge">${escapeHtml(grammarInfo)}</span>` : ""}
      `;
      }
      if (meaningText) {
        meaningText.textContent = meaning;
      }
      if (saveBtn) {
        saveBtn.addEventListener("click", async (e) => {
          e.stopPropagation();
          saveBtn.disabled = true;
          saveBtn.textContent = "\u{1F4BE} Saving...";
          const saveRes = await backendClient.saveFlashcard(
            {
              front: word,
              back: meaning,
              card_type: "word",
              example_sentence: this.currentAnalysis?.text || "",
              sentence_translation: this.currentAnalysis?.translation || "",
              cefr_level: this.currentAnalysis?.estimated_level || "B1",
              source: "StreamTutor / Video"
            },
            this.settings.backendUrl
          );
          if (saveRes?.success) {
            saveBtn.className = "gst-popover-save-btn gst-saved";
            saveBtn.textContent = "\u2713 Saved! (CSV & Anki)";
            setTimeout(() => {
              if (this.popoverEl === popover) {
                this.closeWordPopover();
              }
            }, 1400);
          } else {
            saveBtn.disabled = false;
            saveBtn.textContent = "\u2795 Retry Save";
          }
        });
      }
      this.positionPopover(popover, targetEl);
    }
    positionPopover(popover, targetEl) {
      if (!this.container) return;
      const wordRect = targetEl.getBoundingClientRect();
      const containerRect = this.container.getBoundingClientRect();
      let left = wordRect.left - containerRect.left + wordRect.width / 2 - popover.offsetWidth / 2;
      const maxLeft = containerRect.width - popover.offsetWidth - 8;
      left = Math.max(8, Math.min(left, maxLeft));
      const pos = this.settings.position || "bottom";
      if (pos === "top") {
        const top = wordRect.bottom - containerRect.top + 6;
        popover.style.top = `${top}px`;
        popover.style.bottom = "auto";
      } else {
        const bottom = containerRect.bottom - wordRect.top + 6;
        popover.style.bottom = `${bottom}px`;
        popover.style.top = "auto";
      }
      popover.style.left = `${left}px`;
    }
    render() {
      const container = this.ensureContainer();
      if (!this.settings.enabled) {
        container.style.display = "block";
        this.isVisible = true;
        container.innerHTML = `
        <div class="gst-mini-pill" id="gst-mini-pill" title="Click to turn StreamTutor ON">
          <span class="gst-logo">\u{1F3AC} StreamTutor: <strong style="color: #f87171;">OFF</strong></span>
          <span class="gst-mini-hint">Click to turn ON</span>
        </div>
      `;
        const pill = container.querySelector("#gst-mini-pill");
        if (pill) {
          pill.addEventListener("click", () => {
            this.settings.enabled = true;
            this.onSettingsChangeCallback?.({ enabled: true });
            this.render();
          });
        }
        return;
      }
      if (!this.currentAnalysis) {
        this.hide();
        return;
      }
      const analysis = this.currentAnalysis;
      container.style.display = "block";
      this.isVisible = true;
      const levelColors = {
        A1: { bg: "rgba(6, 78, 59, 0.75)", text: "#34d399", border: "rgba(5, 150, 105, 0.5)" },
        A2: { bg: "rgba(20, 83, 45, 0.75)", text: "#4ade80", border: "rgba(22, 163, 74, 0.5)" },
        B1: { bg: "rgba(120, 53, 15, 0.75)", text: "#fde047", border: "rgba(217, 119, 6, 0.5)" },
        B2: { bg: "rgba(131, 24, 67, 0.75)", text: "#f472b6", border: "rgba(219, 39, 119, 0.5)" },
        C1: { bg: "rgba(76, 29, 149, 0.75)", text: "#c084fc", border: "rgba(147, 51, 234, 0.5)" },
        C2: { bg: "rgba(112, 26, 117, 0.75)", text: "#f0abfc", border: "rgba(192, 38, 211, 0.5)" }
      };
      const levelColor = levelColors[analysis.estimated_level] || levelColors.B1;
      const interactiveGermanHtml = this.renderInteractiveGermanWords(analysis.text);
      container.innerHTML = `
      <div class="gst-card">
        <!-- German Subtitle Text (Every word is clickable Yomitan-style!) -->
        <div class="gst-german-row">
          <div class="gst-german-text gst-selectable" lang="de">${interactiveGermanHtml}</div>
        </div>

        <!-- English Translation (Single sleek line) -->
        <div class="gst-translation-row">
          <span class="gst-translation-text">${escapeHtml(analysis.translation)}</span>
        </div>

        <!-- Grammar / Vocabulary Note (Compact single line if present) -->
        ${analysis.note ? `<div class="gst-note-row">
                 <span class="gst-note-icon">\u{1F4A1}</span>
                 <span class="gst-note-text">${escapeHtml(analysis.note)}</span>
               </div>` : ""}

        <!-- Action Controls Row (Level badge, Save Sentence, AI breakdown) -->
        <div class="gst-actions-row">
          <span class="gst-level-badge" style="background:${levelColor.bg}; color:${levelColor.text}; border: 1px solid ${levelColor.border};" title="Estimated CEFR difficulty: ${escapeHtml(analysis.estimated_level)}">
            ${escapeHtml(analysis.estimated_level)}
          </span>

          <button id="gst-save-sentence-btn" class="gst-btn gst-btn-save ${this.sentenceSaved ? "gst-saved" : ""}" title="Save entire sentence to flashcards (CSV & Anki)" ${this.isSavingSentence ? "disabled" : ""}>
            ${this.sentenceSaved ? "\u2713 Sentence Saved" : this.isSavingSentence ? "\u{1F4BE} Saving..." : "\u{1F4BE} Sentence"}
          </button>

          <button id="gst-explain-btn" class="gst-btn gst-btn-explain" title="Click to ask AI for a deep 50-word grammar breakdown" ${this.isExplaining ? "disabled" : ""}>
            ${this.isExplaining ? "\u23F3 Asking AI..." : this.currentExplanation ? "\u2715 Hide AI Note" : "\u2728 Deep Explanation (AI)"}
          </button>
        </div>

        <!-- On-Demand AI Explanation Box (Max 50-60 words, compact) -->
        ${this.currentExplanation ? `<div class="gst-ai-box">
                 <div class="gst-ai-tag">\u2728 AI Grammar Breakdown</div>
                 <div class="gst-ai-content">${escapeHtml(this.currentExplanation)}</div>
               </div>` : ""}
      </div>
    `;
      const wordElements = container.querySelectorAll(".gst-word");
      wordElements.forEach((wordEl) => {
        const el = wordEl;
        const wordText = el.getAttribute("data-word");
        if (!wordText) return;
        el.addEventListener("click", (e) => {
          e.stopPropagation();
          this.showWordPopover(wordText, el);
        });
      });
      const saveSentenceBtn = container.querySelector("#gst-save-sentence-btn");
      if (saveSentenceBtn) {
        saveSentenceBtn.addEventListener("click", async (e) => {
          e.stopPropagation();
          if (this.sentenceSaved) return;
          this.isSavingSentence = true;
          this.render();
          const res = await backendClient.saveFlashcard(
            {
              front: analysis.text,
              back: analysis.translation,
              card_type: "sentence",
              example_sentence: analysis.text,
              sentence_translation: analysis.translation,
              grammar_note: analysis.note || void 0,
              cefr_level: analysis.estimated_level,
              source: "StreamTutor / Video"
            },
            this.settings.backendUrl
          );
          this.isSavingSentence = false;
          if (res?.success) {
            this.sentenceSaved = true;
          }
          this.render();
        });
      }
      const explainBtn = container.querySelector("#gst-explain-btn");
      if (explainBtn) {
        explainBtn.addEventListener("click", async (e) => {
          e.stopPropagation();
          if (this.currentExplanation) {
            this.currentExplanation = null;
            this.render();
            return;
          }
          this.isExplaining = true;
          this.render();
          const exp = await backendClient.explainSentence(analysis.text, {
            userLevel: this.settings.userLevel,
            backendUrl: this.settings.backendUrl
          });
          this.isExplaining = false;
          this.currentExplanation = exp || "Could not retrieve AI explanation at this time.";
          this.render();
        });
      }
    }
  };
  function escapeHtml(str) {
    if (!str) return "";
    return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
  }

  // src/content/index.ts
  var GermanStreamTutorContent = class {
    settings = { ...DEFAULT_SETTINGS };
    overlayManager;
    currentSubtitleText = "";
    constructor() {
      this.overlayManager = new OverlayManager(this.settings);
      this.init();
    }
    async init() {
      console.log("[GermanTutor] Initializing German Stream Tutor content script...");
      await this.loadSettings();
      this.setupSettingsListeners();
      this.overlayManager.onSettingsChange((newSettings) => {
        this.updateSettings(newSettings);
      });
      asbplayerAdapter.onCuesUpdated((cues) => {
        console.log(`[GermanTutor] asbplayer cues updated: ${cues.length} cues loaded.`);
      });
      primeObserver.onCaptionChange((captionText, currentTimeMs) => {
        this.handleCaptionChange(captionText, currentTimeMs);
      });
      primeObserver.start();
      console.log("[GermanTutor] Watching for subtitles on", window.location.href);
    }
    async loadSettings() {
      try {
        if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
          const stored = await chrome.storage.local.get(DEFAULT_SETTINGS);
          this.settings = { ...DEFAULT_SETTINGS, ...stored };
          this.overlayManager.updateSettings(this.settings);
          backendClient.setBackendUrl(this.settings.backendUrl);
        }
      } catch (e) {
        console.warn("[GermanTutor] Could not read chrome.storage, using defaults", e);
      }
    }
    setupSettingsListeners() {
      try {
        if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.onChanged) {
          chrome.storage.onChanged.addListener((changes, area) => {
            if (area === "local") {
              const updated = {};
              for (const key of Object.keys(changes)) {
                updated[key] = changes[key].newValue;
              }
              this.settings = { ...this.settings, ...updated };
              this.overlayManager.updateSettings(this.settings);
              if (updated.backendUrl) {
                backendClient.setBackendUrl(updated.backendUrl);
              }
            }
          });
        }
        if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.onMessage) {
          chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
            if (message.type === "GET_STATUS") {
              sendResponse({
                settings: this.settings,
                currentSubtitle: this.currentSubtitleText,
                hasVideo: Boolean(primeObserver.getVideo())
              });
            } else if (message.type === "UPDATE_SETTINGS") {
              this.updateSettings(message.settings);
              sendResponse({ ok: true });
            }
          });
        }
      } catch (e) {
        console.warn("[GermanTutor] Storage listener setup failed", e);
      }
    }
    updateSettings(partial) {
      this.settings = { ...this.settings, ...partial };
      this.overlayManager.updateSettings(this.settings);
      if (partial.backendUrl) {
        backendClient.setBackendUrl(partial.backendUrl);
      }
      try {
        if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
          chrome.storage.local.set(this.settings);
        }
      } catch (e) {
      }
    }
    async handleCaptionChange(rawText, currentTimeMs) {
      const cleanText = normalizeSubtitleText(rawText);
      this.currentSubtitleText = cleanText;
      if (!cleanText) {
        this.overlayManager.hide();
        return;
      }
      if (!this.settings.enabled) {
        return;
      }
      let previousText;
      let nextText;
      const cues = asbplayerAdapter.getCues();
      if (cues.length > 0) {
        const match = findCueByText(cleanText, cues);
        if (match) {
          previousText = match.previous?.text;
          nextText = match.next?.text;
        }
      }
      const instantAnalysis = await backendClient.analyzeSentence(cleanText, {
        previous: previousText,
        next: nextText,
        userLevel: this.settings.userLevel,
        threshold: this.settings.threshold,
        aiEnabled: false,
        backendUrl: this.settings.backendUrl
      });
      if (instantAnalysis && (this.currentSubtitleText === cleanText || !this.currentSubtitleText)) {
        this.overlayManager.showAnalysis(instantAnalysis);
      }
    }
  };
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => new GermanStreamTutorContent());
  } else {
    new GermanStreamTutorContent();
  }
})();
//# sourceMappingURL=content.js.map
