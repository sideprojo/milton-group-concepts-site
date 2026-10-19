/**
 * Production SCORM 2004 4th Edition Adapter for SAOS Runtime & Multi-SCO Pages
 *
 * Implements IEEE 1484.11.1 & IEEE 1484.11.2 (SCORM 2004 4th Edition CMI Data Model).
 * Communicates with API_1484_11 in parent/opener window, with local fallback for offline PWA.
 */
var SAOS_SCORM = {
  api: null,
  isAvailable: false,
  startTime: null,
  interactionCount: 0,

  findAPI: function(win) {
    var attempts = 0;
    while (win && attempts < 500) {
      if (win.API_1484_11) {
        return win.API_1484_11;
      }
      attempts++;
      if (win.parent && win.parent !== win) {
        win = win.parent;
      } else {
        break;
      }
    }
    return null;
  },

  init: function(moduleLocation) {
    this.startTime = new Date();
    this.api = this.findAPI(window) || (window.opener ? this.findAPI(window.opener) : null);

    if (this.api) {
      this.isAvailable = true;
      var initRes = this.api.Initialize("");
      console.log("[SAOS SCORM 2004 4th] API_1484_11 Connected. Result: " + initRes);

      var currentCompletion = this.get("cmi.completion_status");
      if (!currentCompletion || currentCompletion === "unknown" || currentCompletion === "") {
        this.set("cmi.completion_status", "incomplete");
      }
      var currentSuccess = this.get("cmi.success_status");
      if (!currentSuccess || currentSuccess === "") {
        this.set("cmi.success_status", "unknown");
      }

      this.set("cmi.exit", "suspend");
      if (moduleLocation) {
        this.set("cmi.location", moduleLocation);
      }
      this.commit();
    } else {
      console.log("[SAOS SCORM 2004 4th] Standalone Mode (No LMS API_1484_11 detected). Local storage active.");
      if (moduleLocation) {
        localStorage.setItem("saos_scorm_location", moduleLocation);
      }
    }
  },

  get: function(element) {
    if (this.isAvailable && this.api) {
      return this.api.GetValue(element);
    }
    return localStorage.getItem("scorm_" + element) || "";
  },

  set: function(element, value) {
    if (this.isAvailable && this.api) {
      var res = this.api.SetValue(element, String(value));
      return res === "true" || res === true;
    } else {
      localStorage.setItem("scorm_" + element, String(value));
      return true;
    }
  },

  commit: function() {
    if (this.isAvailable && this.api) {
      return this.api.Commit("");
    }
    return "true";
  },

  formatISO8601Duration: function(ms) {
    var totalSeconds = Math.floor(ms / 1000);
    var hours = Math.floor(totalSeconds / 3600);
    var minutes = Math.floor((totalSeconds % 3600) / 60);
    var seconds = totalSeconds % 60;
    return "PT" + (hours > 0 ? hours + "H" : "") + (minutes > 0 ? minutes + "M" : "") + seconds + "S";
  },

  recordScore: function(scorePct, attempts, maxAttempts) {
    maxAttempts = maxAttempts || 10;
    var raw = Math.round(scorePct);
    var scaled = (scorePct / 100).toFixed(4);
    var progress = Math.min(1.0, attempts / maxAttempts).toFixed(2);

    this.set("cmi.score.raw", raw);
    this.set("cmi.score.min", "0");
    this.set("cmi.score.max", "100");
    this.set("cmi.score.scaled", scaled);
    this.set("cmi.progress_measure", progress);

    if (attempts >= 5) {
      this.set("cmi.completion_status", "completed");
      this.set("cmi.success_status", scorePct >= 70 ? "passed" : "failed");
    }
    this.commit();
  },

  recordInteraction: function(id, type, learnerResponse, isCorrect, description) {
    if (!this.isAvailable || !this.api) return;
    var idx = this.interactionCount++;
    var prefix = "cmi.interactions." + idx + ".";
    this.set(prefix + "id", String(id));
    this.set(prefix + "type", type || "choice");
    this.set(prefix + "learner_response", String(learnerResponse));
    this.set(prefix + "result", isCorrect ? "correct" : "incorrect");
    if (description) {
      this.set(prefix + "description", String(description));
    }
    this.commit();
  },

  requestNav: function(direction) {
    // direction: 'continue', 'previous', or target SCO ID
    if (this.isAvailable && this.api) {
      if (direction === 'continue' || direction === 'next') {
        this.set("adl.nav.request", "continue");
      } else if (direction === 'previous' || direction === 'prev') {
        this.set("adl.nav.request", "previous");
      }
      this.commit();
      this.finish();
    }
  },

  finish: function() {
    if (this.isAvailable && this.api) {
      if (this.startTime) {
        var elapsedMs = (new Date()).getTime() - this.startTime.getTime();
        var isoDuration = this.formatISO8601Duration(elapsedMs);
        this.set("cmi.session_time", isoDuration);
      }
      this.set("cmi.exit", "suspend");
      this.commit();
      this.api.Terminate("");
      this.isAvailable = false;
      console.log("[SAOS SCORM 2004 4th] Session Terminated cleanly.");
    }
  }
};

if (typeof window !== 'undefined') {
  window.addEventListener("load", function() {
    if (!window._SAOS_CUSTOM_SCORM_INIT) {
      SAOS_SCORM.init();
    }
  });
  window.addEventListener("beforeunload", function() {
    SAOS_SCORM.finish();
  });
}

if (typeof module !== 'undefined') {
  module.exports = { SAOS_SCORM };
}
