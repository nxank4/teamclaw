/**
 * Step: select team template (game_dev, startup, content).
 */

import React from "react";
import { Box, Text } from "ink";
import SelectInput from "ink-select-input";

type Props = {
  onSelect: (templateId: string) => void;
};

const ITEMS = [
  { label: "Game Dev — programmers, artists, SFX, game designer", value: "game_dev" },
  { label: "Startup — engineers, product manager, designer", value: "startup" },
  { label: "Content — writer, editor, designer", value: "content" },
];

export default function TeamTemplateStep({ onSelect }: Props): React.JSX.Element {
  return (
    <Box flexDirection="column">
      <Text>Team template:</Text>
      <Box marginTop={1}>
        <SelectInput
          items={ITEMS}
          onSelect={(item) => onSelect(item.value)}
        />
      </Box>
    </Box>
  );
}
