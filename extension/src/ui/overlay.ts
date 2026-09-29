import { AnalyzeSentenceResponse, CefrLevel, TutorSettings, LookupWordResponse } from '../types';
import { backendClient } from '../services/backend-client';

export class OverlayManager {
  private container: HTMLElement | null = null;
  private currentAnalysis: AnalyzeSentenceResponse | null = null;
  private currentExplanation: string | null = null;
  private isExplaining: boolean = false;
  private isSavingSentence: boolean = false;
  private sentenceSaved: boolean = false;
  private settings: TutorSettings;
  private onSettingsChangeCallback?: (newSettings: Partial<TutorSettings>) => void;
  private isVisible: boolean = false;

  // Yomitan-style word popover state
  private markedWordEl: HTMLElement | null = null;
  private popoverEl: HTMLElement | null = null;
  private activeWord: string | null = null;

  constructor(settings: TutorSettings) {
    this.settings = { ...settings };
    this.setupGlobalDismissListeners();
  }

  updateSettings(newSettings: Partial<TutorSettings>) {
    this.settings = { ...this.settings, ...newSettings };
    if (!this.settings.enabled) {
      this.closeWordPopover();
      this.render();
    } else if (this.currentAnalysis) {
      this.render();
    }
  }

  onSettingsChange(cb: (newSettings: Partial<TutorSettings>) => void) {
    this.onSettingsChangeCallback = cb;
  }

  private setupGlobalDismissListeners() {
    // Dismiss word popover when user clicks elsewhere
    document.addEventListener('click', (e) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      if (
        !target.closest('.gst-word') &&
        !target.closest('#gst-word-popover') &&
        this.popoverEl
      ) {
        this.closeWordPopover();
      }
    });

    // Dismiss on Escape key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.popoverEl) {
        this.closeWordPopover();
      }
    });
  }

  private ensureContainer(): HTMLElement {
    const pos = this.settings.position || 'bottom';
    const className = `gst-overlay-container gst-pos-${pos}`;

    const targetParent =
      document.fullscreenElement ||
      document.getElementById('dv-web-player') ||
      document.querySelector('.webPlayerUIContainer') ||
      document.body;

    if (this.container && this.container.isConnected) {
      this.container.className = className;
      if (this.container.parentElement !== targetParent) {
        targetParent.appendChild(this.container);
      }
      return this.container;
    }

    const existing = document.getElementById('german-stream-tutor-overlay');
    if (existing) {
      existing.className = className;
      if (existing.parentElement !== targetParent) {
        targetParent.appendChild(existing);
      }
      this.container = existing;
      return this.container;
    }

    const container = document.createElement('div');
    container.id = 'german-stream-tutor-overlay';
    container.className = className;

    targetParent.appendChild(container);
    this.container = container;
    return container;
  }

  showAnalysis(analysis: AnalyzeSentenceResponse) {
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

    // Only display help if show_help is true
    if (!analysis.show_help) {
      this.hide();
      return;
    }

    this.render();
  }

  hide() {
    this.closeWordPopover();
    if (this.container) {
      this.container.style.display = 'none';
      this.isVisible = false;
    }
  }

  private closeWordPopover() {
    if (this.markedWordEl) {
      this.markedWordEl.classList.remove('gst-word-marked');
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
  private renderInteractiveGermanWords(text: string): string {
    if (!text) return '';
    const regex = /([\p{L}\p{N}]+(?:['’\-][\p{L}\p{N}]+)*|[^\p{L}\p{N}\s]+|\s+)/gu;
    const tokens = text.match(regex) || [text];

    return tokens
      .map((token) => {
        // If token contains letters or digits, it's an interactive word
        if (/[\p{L}\p{N}]/u.test(token)) {
          const cleanWord = token.replace(/^[.,!?:;"'()«»]+|[.,!?:;"'()«»]+$/g, '');
          return `<span class="gst-word gst-selectable" data-word="${escapeHtml(cleanWord)}" title="Click to lookup & save '${escapeHtml(cleanWord)}'">${escapeHtml(token)}</span>`;
        }
        return escapeHtml(token);
      })
      .join('');
  }

  /**
   * Shows Yomitan-style floating popover anchored above/below the clicked or hovered word.
   */
  private async showWordPopover(word: string, targetEl: HTMLElement) {
    if (!this.container || !this.currentAnalysis) return;

    // Toggle off if clicking the currently active word
    if (this.activeWord === word && this.popoverEl) {
      this.closeWordPopover();
      return;
    }

    this.closeWordPopover();
    this.activeWord = word;
    this.markedWordEl = targetEl;
    targetEl.classList.add('gst-word-marked');

    // Create popover DOM element
    const popover = document.createElement('div');
    popover.id = 'gst-word-popover';
    popover.className = 'gst-word-popover';
    popover.innerHTML = `
      <div class="gst-popover-header">
        <div class="gst-popover-word-title">
          <strong>${escapeHtml(word)}</strong>
          <span class="gst-popover-loading">⏳ Looking up...</span>
        </div>
        <button class="gst-popover-close-btn" title="Close">✕</button>
      </div>
      <div class="gst-popover-body">
        <div class="gst-popover-meaning-text">...</div>
      </div>
      <div class="gst-popover-footer">
        <button class="gst-popover-save-btn" id="gst-popover-save-btn" title="Save to flashcards file (Wortlaut & Anki)">
          ➕ Save Flashcard
        </button>
      </div>
    `;

    // Position popover relative to container
    this.container.appendChild(popover);
    this.popoverEl = popover;

    // Position calculation
    this.positionPopover(popover, targetEl);

    // Close button listener
    const closeBtn = popover.querySelector('.gst-popover-close-btn') as HTMLElement;
    if (closeBtn) {
      closeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.closeWordPopover();
      });
    }

    // Stop click events inside popover from closing it
    popover.addEventListener('click', (e) => {
      e.stopPropagation();
    });

    // 1. Look up meaning: check if word is in current analysis important_words first
    let meaning = '';
    let grammarInfo: string | null = null;
    const lowerWord = word.toLowerCase();

    if (this.currentAnalysis.important_words) {
      const found = this.currentAnalysis.important_words.find(
        (w) => w.word.toLowerCase() === lowerWord || lowerWord.includes(w.word.toLowerCase())
      );
      if (found) {
        meaning = found.meaning;
      }
    }

    // If not found locally, query backend dictionary
    if (!meaning) {
      const res: LookupWordResponse | null = await backendClient.lookupWord(
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

    // Update popover content
    const titleContainer = popover.querySelector('.gst-popover-word-title') as HTMLElement;
    const meaningText = popover.querySelector('.gst-popover-meaning-text') as HTMLElement;
    const saveBtn = popover.querySelector('#gst-popover-save-btn') as HTMLButtonElement;

    if (titleContainer) {
      titleContainer.innerHTML = `
        <strong class="gst-popover-word-name">${escapeHtml(word)}</strong>
        ${grammarInfo ? `<span class="gst-popover-grammar-badge">${escapeHtml(grammarInfo)}</span>` : ''}
      `;
    }

    if (meaningText) {
      meaningText.textContent = meaning;
    }

    // Save button click
    if (saveBtn) {
      saveBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        saveBtn.disabled = true;
        saveBtn.textContent = '💾 Saving...';

        const saveRes = await backendClient.saveFlashcard(
          {
            front: word,
            back: meaning,
            card_type: 'word',
            example_sentence: this.currentAnalysis?.text || '',
            sentence_translation: this.currentAnalysis?.translation || '',
            cefr_level: this.currentAnalysis?.estimated_level || 'B1',
            source: 'StreamTutor / Video',
          },
          this.settings.backendUrl
        );

        if (saveRes?.success) {
          saveBtn.className = 'gst-popover-save-btn gst-saved';
          saveBtn.textContent = '✓ Saved! (CSV & Anki)';
          setTimeout(() => {
            if (this.popoverEl === popover) {
              this.closeWordPopover();
            }
          }, 1400);
        } else {
          saveBtn.disabled = false;
          saveBtn.textContent = '➕ Retry Save';
        }
      });
    }

    // Re-adjust position after content update
    this.positionPopover(popover, targetEl);
  }

  private positionPopover(popover: HTMLElement, targetEl: HTMLElement) {
    if (!this.container) return;
    const wordRect = targetEl.getBoundingClientRect();
    const containerRect = this.container.getBoundingClientRect();

    // Horizontal centering over word
    let left = wordRect.left - containerRect.left + wordRect.width / 2 - popover.offsetWidth / 2;
    // Keep inside container bounds
    const maxLeft = containerRect.width - popover.offsetWidth - 8;
    left = Math.max(8, Math.min(left, maxLeft));

    // Vertical placement: default above the word, or below if near top
    const pos = this.settings.position || 'bottom';
    if (pos === 'top') {
      // Place below word
      const top = wordRect.bottom - containerRect.top + 6;
      popover.style.top = `${top}px`;
      popover.style.bottom = 'auto';
    } else {
      // Place above word
      const bottom = containerRect.bottom - wordRect.top + 6;
      popover.style.bottom = `${bottom}px`;
      popover.style.top = 'auto';
    }

    popover.style.left = `${left}px`;
  }

  private render() {
    const container = this.ensureContainer();

    // When disabled, render a mini toggle button pill so user can easily re-enable
    if (!this.settings.enabled) {
      container.style.display = 'block';
      this.isVisible = true;
      container.innerHTML = `
        <div class="gst-mini-pill" id="gst-mini-pill" title="Click to turn StreamTutor ON">
          <span class="gst-logo">🎬 StreamTutor: <strong style="color: #f87171;">OFF</strong></span>
          <span class="gst-mini-hint">Click to turn ON</span>
        </div>
      `;
      const pill = container.querySelector('#gst-mini-pill');
      if (pill) {
        pill.addEventListener('click', () => {
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
    container.style.display = 'block';
    this.isVisible = true;

    // Level badge color mapping
    const levelColors: Record<CefrLevel, { bg: string; text: string; border: string }> = {
      A1: { bg: 'rgba(6, 78, 59, 0.75)', text: '#34d399', border: 'rgba(5, 150, 105, 0.5)' },
      A2: { bg: 'rgba(20, 83, 45, 0.75)', text: '#4ade80', border: 'rgba(22, 163, 74, 0.5)' },
      B1: { bg: 'rgba(120, 53, 15, 0.75)', text: '#fde047', border: 'rgba(217, 119, 6, 0.5)' },
      B2: { bg: 'rgba(131, 24, 67, 0.75)', text: '#f472b6', border: 'rgba(219, 39, 119, 0.5)' },
      C1: { bg: 'rgba(76, 29, 149, 0.75)', text: '#c084fc', border: 'rgba(147, 51, 234, 0.5)' },
      C2: { bg: 'rgba(112, 26, 117, 0.75)', text: '#f0abfc', border: 'rgba(192, 38, 211, 0.5)' },
    };
    const levelColor = levelColors[analysis.estimated_level] || levelColors.B1;

    // Generate Yomitan-style interactive word spans
    const interactiveGermanHtml = this.renderInteractiveGermanWords(analysis.text);

    // Render subtitle card:
    // ULTRA-SLIM & UNCLUTTERED: Notice we DO NOT flood the card with word chips!
    // Words are interactive right in the subtitle line itself!
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
        ${
          analysis.note
            ? `<div class="gst-note-row">
                 <span class="gst-note-icon">💡</span>
                 <span class="gst-note-text">${escapeHtml(analysis.note)}</span>
               </div>`
            : ''
        }

        <!-- Action Controls Row (Level badge, Save Sentence, AI breakdown) -->
        <div class="gst-actions-row">
          <span class="gst-level-badge" style="background:${levelColor.bg}; color:${levelColor.text}; border: 1px solid ${levelColor.border};" title="Estimated CEFR difficulty: ${escapeHtml(analysis.estimated_level)}">
            ${escapeHtml(analysis.estimated_level)}
          </span>

          <button id="gst-save-sentence-btn" class="gst-btn gst-btn-save ${this.sentenceSaved ? 'gst-saved' : ''}" title="Save entire sentence to flashcards (CSV & Anki)" ${this.isSavingSentence ? 'disabled' : ''}>
            ${this.sentenceSaved ? '✓ Sentence Saved' : this.isSavingSentence ? '💾 Saving...' : '💾 Sentence'}
          </button>

          <button id="gst-explain-btn" class="gst-btn gst-btn-explain" title="Click to ask AI for a deep 50-word grammar breakdown" ${this.isExplaining ? 'disabled' : ''}>
            ${this.isExplaining ? '⏳ Asking AI...' : this.currentExplanation ? '✕ Hide AI Note' : '✨ Deep Explanation (AI)'}
          </button>
        </div>

        <!-- On-Demand AI Explanation Box (Max 50-60 words, compact) -->
        ${
          this.currentExplanation
            ? `<div class="gst-ai-box">
                 <div class="gst-ai-tag">✨ AI Grammar Breakdown</div>
                 <div class="gst-ai-content">${escapeHtml(this.currentExplanation)}</div>
               </div>`
            : ''
        }
      </div>
    `;

    // 1. Attach Yomitan-style click & hover handlers to every German word span
    const wordElements = container.querySelectorAll('.gst-word');
    wordElements.forEach((wordEl) => {
      const el = wordEl as HTMLElement;
      const wordText = el.getAttribute('data-word');
      if (!wordText) return;

      // Click to pin & inspect word popover
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        this.showWordPopover(wordText, el);
      });
    });

    // 2. 1-Click Sentence Save Button
    const saveSentenceBtn = container.querySelector('#gst-save-sentence-btn') as HTMLButtonElement;
    if (saveSentenceBtn) {
      saveSentenceBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (this.sentenceSaved) return;

        this.isSavingSentence = true;
        this.render();

        const res = await backendClient.saveFlashcard(
          {
            front: analysis.text,
            back: analysis.translation,
            card_type: 'sentence',
            example_sentence: analysis.text,
            sentence_translation: analysis.translation,
            grammar_note: analysis.note || undefined,
            cefr_level: analysis.estimated_level,
            source: 'StreamTutor / Video',
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

    // 3. On-Demand AI Explanation Button Click
    const explainBtn = container.querySelector('#gst-explain-btn') as HTMLButtonElement;
    if (explainBtn) {
      explainBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (this.currentExplanation) {
          // Collapse
          this.currentExplanation = null;
          this.render();
          return;
        }

        this.isExplaining = true;
        this.render();

        const exp = await backendClient.explainSentence(analysis.text, {
          userLevel: this.settings.userLevel,
          backendUrl: this.settings.backendUrl,
        });

        this.isExplaining = false;
        this.currentExplanation = exp || 'Could not retrieve AI explanation at this time.';
        this.render();
      });
    }
  }
}

function escapeHtml(str: string): string {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
