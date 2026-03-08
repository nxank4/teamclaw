/**
 * Step: optional default goal for first run.
 */

import React, { useState } from "react";
import { Box, Text } from "ink";
import TextInput from "ink-text-input";

type Props = {
  initialGoal: string;
  onComplete: (goal: string) => void;
};

const DEFAULT_GOAL = "Build a small 2D game with sprite assets and sound effects";

export default function GoalStep({ initialGoal, onComplete }: Props): React.JSX.Element {
  const [goal, setGoal] = useState(initialGoal || DEFAULT_GOAL);

  return (
    <Box flexDirection="column">
      <Text>Default goal for first run (optional):</Text>
      <Box marginTop={1}>
        <TextInput
          value={goal}
          onChange={setGoal}
          onSubmit={(value) => onComplete(value.trim() || DEFAULT_GOAL)}
          placeholder={DEFAULT_GOAL}
        />
      </Box>
    </Box>
  );
}
