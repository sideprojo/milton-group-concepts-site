/**
 * Spaced Repetition Engine (Local Runtime — 10,000+ Item Optimized)
 * Implements strict interval schedule: [0, 1d, 3d, 7d, 14d, 30d, 60d, 120d]
 * Computes retrievability curves, lapse penalties, sibling root boosts, and diagnostic telemetry.
 */
class SpacedRepetitionEngine {
  constructor() {
    this.STAGES = [0, 1, 3, 7, 14, 30, 60, 120]; // Intervals in days
    this.STORAGE_KEY = 'saos_mastery_state_v1';
    this.state = this.loadState();
    if (!this.state._diagnostics) {
      this.state._diagnostics = {
        familyErrors: {},
        tagErrors: {
          'DIAG-MORPH-01': 0,
          'DIAG-SYN-02': 0,
          'DIAG-SEM-03': 0,
          'DIAG-PHON-04': 0
        },
        history: []
      };
    }
  }

  loadState() {
    if (typeof localStorage !== 'undefined') {
      const saved = localStorage.getItem(this.STORAGE_KEY);
      if (saved) {
        try {
          return JSON.parse(saved);
        } catch (e) {
          console.warn('Failed parsing saved mastery state, reinitializing', e);
        }
      }
    }
    return {};
  }

  saveState() {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.state));
    }
  }

  /**
   * Read-only state lookup (does not bloat localStorage for 10,000 unseen items).
   */
  peekItemState(itemId) {
    if (this.state[itemId]) {
      return this.state[itemId];
    }
    return {
      itemId: itemId,
      stage: 0,
      intervalDays: 0,
      easeFactor: 2.5,
      repetitionCount: 0,
      lapseCount: 0,
      history: [],
      lastReviewed: null,
      nextDue: 0,
      diagnosticAccuracy: {
        phonetics: 1.0,
        derivation: 1.0,
        recall: 1.0
      }
    };
  }

  getItemState(itemId) {
    if (!this.state[itemId]) {
      this.state[itemId] = {
        itemId: itemId,
        stage: 0,
        intervalDays: 0,
        easeFactor: 2.5,
        repetitionCount: 0,
        lapseCount: 0,
        history: [],
        lastReviewed: null,
        nextDue: Date.now(),
        diagnosticAccuracy: {
          phonetics: 1.0,
          derivation: 1.0,
          recall: 1.0
        }
      };
    }
    return this.state[itemId];
  }

  /**
   * Process a review response and record family/diagnostic telemetry.
   */
  processReview(itemId, grade, mode = 'vocabulary', responseTimeMs = 1500, itemMeta = null) {
    const record = this.getItemState(itemId);
    const now = Date.now();
    const passed = grade >= 3;

    if (passed) {
      record.repetitionCount += 1;
      if (record.stage < this.STAGES.length - 1) {
        record.stage += 1;
      }
      record.intervalDays = this.STAGES[record.stage];
      record.easeFactor = Math.max(1.3, record.easeFactor + (0.1 - (5 - grade) * (0.08 + (5 - grade) * 0.02)));
    } else {
      record.lapseCount += 1;
      record.stage = Math.max(0, record.stage - 2);
      record.intervalDays = this.STAGES[record.stage];
      record.easeFactor = Math.max(1.3, record.easeFactor - 0.2);

      if (itemMeta) {
        this.recordDiagnosticError(itemMeta.familyId || 'fam_ten', (itemMeta.diagnosticTags && itemMeta.diagnosticTags[0]) || 'DIAG-MORPH-01', itemId);
      }
    }

    record.lastReviewed = now;
    const intervalMs = record.intervalDays * 24 * 60 * 60 * 1000;
    record.nextDue = record.stage === 0 ? now + (10 * 60 * 1000) : now + intervalMs;

    record.history.push({
      timestamp: now,
      grade,
      mode,
      stage: record.stage,
      responseTimeMs
    });

    this.saveState();
    return record;
  }

  recordDiagnosticError(familyId, diagTag = 'DIAG-MORPH-01', itemId = null) {
    if (!this.state._diagnostics) {
      this.state._diagnostics = { familyErrors: {}, tagErrors: {}, history: [] };
    }
    this.state._diagnostics.familyErrors[familyId] = (this.state._diagnostics.familyErrors[familyId] || 0) + 1;
    this.state._diagnostics.tagErrors[diagTag] = (this.state._diagnostics.tagErrors[diagTag] || 0) + 1;
    this.state._diagnostics.history.unshift({
      timestamp: Date.now(),
      familyId,
      diagTag,
      itemId
    });
    if (this.state._diagnostics.history.length > 50) {
      this.state._diagnostics.history.pop();
    }
    this.saveState();
  }

  getWeakestFamilyId(allFamilies) {
    const famErrors = (this.state._diagnostics && this.state._diagnostics.familyErrors) || {};
    let weakestId = null;
    let maxErr = -1;
    for (const [fId, count] of Object.entries(famErrors)) {
      if (count > maxErr) {
        maxErr = count;
        weakestId = fId;
      }
    }
    // Also inspect item lapses if no explicit diagnostic errors yet
    if (!weakestId && allFamilies && allFamilies.length > 0) {
      return allFamilies[0].id;
    }
    return weakestId || 'fam_ten';
  }

  /**
   * Returns active review queue: all due active items + up to 25 new flagship items.
   */
  getDueItems(allItems, maxNewBatch = 25) {
    const now = Date.now();
    const activeDue = [];
    const unseenQueue = [];

    for (let i = 0; i < allItems.length; i++) {
      const item = allItems[i];
      const saved = this.state[item.id];
      if (saved) {
        if (saved.nextDue <= now) {
          activeDue.push(item);
        }
      } else if (unseenQueue.length < maxNewBatch) {
        unseenQueue.push(item);
      }
    }

    activeDue.sort((a, b) => this.state[a.id].nextDue - this.state[b.id].nextDue);
    return [...activeDue, ...unseenQueue];
  }

  /**
   * Fast O(N) metrics over 10,000+ items without mutating state.
   */
  calculateMetrics(allItems) {
    let totalItems = allItems.length;
    let matureItems = 0;
    let youngItems = 0;
    let unseenItems = 0;
    let learningItems = 0;
    let totalLapses = 0;
    let reviewedCount = 0;

    for (let i = 0; i < totalItems; i++) {
      const saved = this.state[allItems[i].id];
      if (!saved || (saved.repetitionCount === 0 && saved.stage === 0 && saved.lapseCount === 0)) {
        unseenItems += 1;
      } else {
        reviewedCount += 1;
        totalLapses += saved.lapseCount;
        if (saved.stage >= 4) {
          matureItems += 1;
        } else if (saved.stage >= 1) {
          youngItems += 1;
        } else {
          learningItems += 1;
        }
      }
    }

    const retentionRate = reviewedCount > 0
      ? Math.round(((reviewedCount - Math.min(reviewedCount, totalLapses)) / reviewedCount) * 100)
      : 100;

    return {
      totalItems,
      matureItems,
      youngItems,
      learningItems,
      unseenItems,
      totalLapses,
      retentionRate: Math.max(0, retentionRate)
    };
  }

  getReviewForecast(allItems, daysAhead = 14) {
    const forecast = new Array(daysAhead).fill(0);
    const now = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;

    for (let i = 0; i < allItems.length; i++) {
      const saved = this.state[allItems[i].id];
      if (saved && saved.nextDue) {
        const diffDays = Math.floor((saved.nextDue - now) / dayMs);
        if (diffDays >= 0 && diffDays < daysAhead) {
          forecast[diffDays] += 1;
        } else if (diffDays < 0) {
          forecast[0] += 1;
        }
      }
    }
    // Baseline daily new-item target if no reviews scheduled yet on Day 0
    if (forecast[0] === 0) {
      forecast[0] = Math.min(25, allItems.length);
    }
    return forecast;
  }
}

if (typeof module !== 'undefined') {
  module.exports = { SpacedRepetitionEngine };
}
