/**
 * Step: prompt for OpenClaw worker URL, validate with /health.
 */

import React, { useState } from "react";
import { Box, Text } from "ink";
import TextInput from "ink-text-input";

type Props = {
  initialUrl: string;
  onComplete: (url: string) => void;
  onError: (msg: string) => void;
};

export default function WorkerUrlStep({ initialUrl, onComplete, onError }: Props): React.JSX.Element {
  const [url, setUrl] = useState(initialUrl);
  const [validating, setValidating] = useState(false);

  const handleSubmit = async (value: string): Promise<void> => {
    const trimmed = value.trim();
    if (!trimmed) {
      onError("URL cannot be empty");
      return;
    }
    let base = trimmed;
    if (!base.startsWith("http://") && !base.startsWith("https://")) {
      base = `http://${base}`;
    }
    setValidating(true);
    onError("");
    try {
      const healthUrl = base.replace(/\/$/, "") + "/health";
      const res = await fetch(healthUrl);
      if (!res.ok) {
        onError(`Worker returned ${res.status}. Use a valid OpenClaw worker URL or skip validation.`);
        return;
      }
      onComplete(base.replace(/\/$/, ""));
    } catch (e) {
      onError(
        `Cannot reach worker: ${(e as Error).message}. Enter URL anyway? (validation skipped)`
      );
      onComplete(base.replace(/\/$/, ""));
    } finally {
      setValidating(false);
    }
  };

  return (
    <Box flexDirection="column">
      <Text>OpenClaw worker URL:</Text>
      <Box marginTop={1}>
        <TextInput
          value={url}
          onChange={setUrl}
          onSubmit={handleSubmit}
          placeholder="http://localhost:8001"
        />
      </Box>
      {validating ? <Text color="gray">Validating...</Text> : null}
    </Box>
  );
}
