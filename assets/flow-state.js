"use strict";
(function () {
  const STORAGE_KEY = "resumeai_flow";

  const STAGE_ORDER = ["anonymous", "uploaded", "targeted", "answered", "complete", "subscribed"];

  function defaultState() {
    return {
      stage: "anonymous",
      resume_text: null,
      resume_filename: null,
      target_role: null,
      target_level: null,
      job_description: null,
      answers: null,
      analysis: null,
      variant: null,
      user_email: null,
      plan_tier: null,
      subscription_status: null,
    };
  }

  function load() {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (raw) return { ...defaultState(), ...JSON.parse(raw) };
    } catch (_) {}
    return defaultState();
  }

  function save(state) {
    try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (_) {}
  }

  let state = load();

  function getState()  { return { ...state }; }
  function getStage()  { return state.stage; }

  function stageIndex(s) { return STAGE_ORDER.indexOf(s); }

  function canAccess(path) {
    const gateMap = {
      "/upload/":    "anonymous",
      "/target/":    "uploaded",
      "/questions/": "targeted",
      "/results/":   "answered",
      "/pricing/":   "anonymous",
      "/checkout/":  "anonymous",
      "/settings/":  "anonymous",
    };
    const required = gateMap[path];
    if (!required) return { ok: true };
    if (stageIndex(state.stage) >= stageIndex(required)) return { ok: true };
    const nextMap = { anonymous: "/upload/", uploaded: "/target/", targeted: "/questions/", answered: "/results/" };
    return { ok: false, message: "Complete the previous step first.", next: nextMap[required] || "/upload/" };
  }

  function set(updates) {
    state = { ...state, ...updates };
    save(state);
  }

  function reset() {
    state = defaultState();
    save(state);
  }

  function setResumeUploaded(text, filename) {
    state = { ...state, stage: "uploaded", resume_text: text, resume_filename: filename };
    save(state);
  }

  function setTargeted(role, level, jd) {
    state = { ...state, stage: "targeted", target_role: role, target_level: level, job_description: jd };
    save(state);
  }

  function setAnswered(answers, analysis) {
    state = { ...state, stage: "answered", answers, analysis };
    save(state);
  }

  function setVariant(variant) {
    state = { ...state, stage: "complete", variant };
    save(state);
  }

  function setSubscribed(tier) {
    state = { ...state, stage: "subscribed", plan_tier: tier, subscription_status: "active" };
    save(state);
  }

  window.FLOW = {
    getState, getStage, canAccess, set, reset,
    setResumeUploaded, setTargeted, setAnswered, setVariant, setSubscribed,
  };
})();
