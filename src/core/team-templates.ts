/**
 * Predefined team templates for quick setup.
 */

import { z } from "zod";
import type { BotDefinition } from "./bot-definitions.js";
import { getRoleTemplate } from "./bot-definitions.js";

export const RoleSlotSchema = z.object({
  role_id: z.string(),
  count: z.number().min(1).default(1),
  default_traits: z.record(z.unknown()).optional().default({}),
});
export type RoleSlot = z.infer<typeof RoleSlotSchema>;

export const TeamTemplateSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().default(""),
  slots: z.array(RoleSlotSchema).default([]),
});
export type TeamTemplate = z.infer<typeof TeamTemplateSchema>;

export const TEAM_TEMPLATES: Record<string, TeamTemplate> = {
  game_dev: {
    id: "game_dev",
    name: "Game Dev Team",
    description: "Programmers, artists, SFX, and game designer",
    slots: [
      { role_id: "software_engineer", count: 2, default_traits: {} },
      { role_id: "artist", count: 1, default_traits: {} },
      { role_id: "sfx_designer", count: 1, default_traits: {} },
      { role_id: "game_designer", count: 1, default_traits: {} },
    ],
  },
  startup: {
    id: "startup",
    name: "Startup Team",
    description: "Engineers, product manager, designer",
    slots: [
      { role_id: "software_engineer", count: 2, default_traits: {} },
      { role_id: "product_manager", count: 1, default_traits: {} },
      { role_id: "designer", count: 1, default_traits: {} },
    ],
  },
  content: {
    id: "content",
    name: "Content Team",
    description: "Writer, editor, designer",
    slots: [
      { role_id: "writer", count: 1, default_traits: {} },
      { role_id: "editor", count: 1, default_traits: {} },
      { role_id: "designer", count: 1, default_traits: {} },
    ],
  },
};

export function buildTeamFromTemplate(
  templateId: string,
  prefix = "bot",
  customizations: Record<string, Record<string, unknown>> | null = null
): BotDefinition[] {
  const template = TEAM_TEMPLATES[templateId];
  if (!template) return [];

  const cust = customizations ?? {};
  const bots: BotDefinition[] = [];
  let idx = 0;

  for (const slot of template.slots) {
    const role = getRoleTemplate(slot.role_id);
    const roleName = role?.name ?? slot.role_id;

    for (let i = 0; i < slot.count; i++) {
      const botId = `${prefix}_${idx}`;
      const slotTraits = { ...slot.default_traits };
      const slotKey = `${prefix}_${idx}`;
      if (slotKey in cust) Object.assign(slotTraits, cust[slotKey]);
      else if (String(idx) in cust) Object.assign(slotTraits, cust[String(idx)]);

      let displayName = roleName;
      if (slot.count > 1) displayName = `${roleName} ${i + 1}`;

      bots.push({
        id: botId,
        name: displayName,
        role_id: slot.role_id,
        traits: slotTraits,
        worker_url: null,
      });
      idx++;
    }
  }

  return bots;
}

export function getTeamTemplate(templateId: string): TeamTemplate | null {
  return TEAM_TEMPLATES[templateId] ?? null;
}
