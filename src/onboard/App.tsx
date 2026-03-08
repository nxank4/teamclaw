/**
 * Main wizard flow for TeamClaw onboarding.
 */

import React, { useState, useCallback } from "react";
import { Box, Text } from "ink";
import WorkerUrlStep from "./steps/WorkerUrlStep.js";
import TeamTemplateStep from "./steps/TeamTemplateStep.js";
import GoalStep from "./steps/GoalStep.js";
import LlmGatewayStep from "./steps/LlmGatewayStep.js";
import type { LlmGatewayChoice } from "./steps/LlmGatewayStep.js";
import { writeConfig } from "./writeConfig.js";

export type OnboardState = {
  workerUrl: string;
  template: string;
  goal: string;
  gateway?: LlmGatewayChoice;
};

const STEPS = ["worker", "template", "goal", "llm", "save"] as const;

export default function App(): React.JSX.Element {
  const [step, setStep] = useState<(typeof STEPS)[number]>("worker");
  const [state, setState] = useState<OnboardState>({
    workerUrl: process.env["OPENCLAW_WORKER_URL"] ?? "http://localhost:8001",
    template: "game_dev",
    goal: "",
  });
  const [error, setError] = useState<string>("");
  const [saveError, setSaveError] = useState<string>("");

  const advance = useCallback((next?: (typeof STEPS)[number]) => {
    setError("");
    if (next) {
      setStep(next);
      return;
    }
    const idx = STEPS.indexOf(step);
    if (idx >= 0 && idx < STEPS.length - 1) setStep(STEPS[idx + 1] ?? "worker");
  }, [step]);

  const onWorkerComplete = useCallback((url: string) => {
    setState((s) => ({ ...s, workerUrl: url }));
    advance("template");
  }, [advance]);

  const onTemplateComplete = useCallback((t: string) => {
    setState((s) => ({ ...s, template: t }));
    advance("goal");
  }, [advance]);

  const onGoalComplete = useCallback((g: string) => {
    setState((s) => ({ ...s, goal: g }));
    advance("llm");
  }, [advance]);

  const onLlmComplete = useCallback(
    (gateway: LlmGatewayChoice) => {
      setState((s) => ({ ...s, gateway }));
      setStep("save");
      setError("");
      setSaveError("");
      try {
        writeConfig(state.workerUrl, state.template, state.goal, gateway);
      } catch (e) {
        setSaveError((e as Error).message);
      }
    },
    [state.workerUrl, state.template, state.goal]
  );

  const onWorkerError = useCallback((msg: string) => setError(msg), []);

  if (step === "worker") {
    return (
      <Box flexDirection="column" padding={1}>
        <Text bold>TeamClaw setup. Configure your bot team.</Text>
        <Box marginTop={1} />
        <WorkerUrlStep
          initialUrl={state.workerUrl}
          onComplete={onWorkerComplete}
          onError={onWorkerError}
        />
        {error ? <Text color="red">{error}</Text> : null}
      </Box>
    );
  }

  if (step === "template") {
    return (
      <Box flexDirection="column" padding={1}>
        <Text bold>TeamClaw setup. Configure your bot team.</Text>
        <Box marginTop={1} />
        <TeamTemplateStep onSelect={onTemplateComplete} />
      </Box>
    );
  }

  if (step === "goal") {
    return (
      <Box flexDirection="column" padding={1}>
        <Text bold>TeamClaw setup. Configure your bot team.</Text>
        <Box marginTop={1} />
        <GoalStep initialGoal={state.goal} onComplete={onGoalComplete} />
      </Box>
    );
  }

  if (step === "llm") {
    return (
      <Box flexDirection="column" padding={1}>
        <Text bold>TeamClaw setup. Configure your bot team.</Text>
        <Box marginTop={1} />
        <LlmGatewayStep onComplete={onLlmComplete} />
      </Box>
    );
  }

  if (step === "save") {
    return (
      <Box flexDirection="column" padding={1}>
        <Text bold>TeamClaw setup. Configure your bot team.</Text>
        <Box marginTop={1} />
        {saveError ? (
          <Text color="red">Save failed: {saveError}</Text>
        ) : (
          <>
            <Text color="green">Setup complete.</Text>
            <Text>Run <Text bold>teamclaw web</Text> or <Text bold>teamclaw work</Text>.</Text>
          </>
        )}
      </Box>
    );
  }

  return <Text>Done.</Text>;
}
