import { describe, it, expect } from "vitest";
import { TopicTracker } from "../../src/memory/topic-tracker.js";

describe("TopicTracker", () => {
  it("detects topic shift when keywords change significantly", () => {
    const tracker = new TopicTracker();
    tracker.analyzeMessage("fix the authentication module with JWT token validation", 0);
    const state = tracker.analyzeMessage("deploy the kubernetes cluster with helm charts", 1);
    expect(state.topicShiftDetected).toBe(true);
  });

  it("does NOT trigger shift on minor rewording", () => {
    const tracker = new TopicTracker();
    tracker.analyzeMessage("fix the authentication token validation", 0);
    const state = tracker.analyzeMessage("the authentication token validation needs fixing", 1);
    expect(state.topicShiftDetected).toBe(false);
  });

  it("shouldReRetrieve returns true on shift", () => {
    const tracker = new TopicTracker();
    tracker.analyzeMessage("fix authentication module", 0);
    tracker.analyzeMessage("deploy kubernetes cluster with terraform", 1);
    expect(tracker.shouldReRetrieve()).toBe(true);
  });

  it("shouldReRetrieve returns true every N messages", () => {
    const tracker = new TopicTracker(3);
    tracker.analyzeMessage("topic about authentication security", 0);
    tracker.analyzeMessage("more about authentication security", 1);
    tracker.analyzeMessage("still about authentication security", 2);
    expect(tracker.shouldReRetrieve()).toBe(true);
  });

  it("handles empty messages without crash", () => {
    const tracker = new TopicTracker();
    const state = tracker.analyzeMessage("", 0);
    expect(state).toBeDefined();
  });

  it("reset clears all state", () => {
    const tracker = new TopicTracker();
    tracker.analyzeMessage("some topic about testing", 0);
    tracker.reset();
    expect(tracker.getCurrentTopic().currentTopic).toBe("");
  });
});
