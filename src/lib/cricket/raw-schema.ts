import { z } from "zod";

// The subset of the Cricsheet JSON format (https://cricsheet.org/format/json/)
// that MatchBrief reads. Unknown keys are stripped by Zod.

const count = z.number().int().min(0);

const RawDelivery = z.object({
  batter: z.string(),
  bowler: z.string(),
  non_striker: z.string(),
  runs: z.object({
    batter: count,
    extras: count,
    total: count,
    non_boundary: z.boolean().optional(),
  }),
  extras: z
    .object({
      wides: count.optional(),
      noballs: count.optional(),
      byes: count.optional(),
      legbyes: count.optional(),
      penalty: count.optional(),
    })
    .optional(),
  wickets: z
    .array(
      z.object({
        kind: z.string(),
        player_out: z.string(),
        fielders: z.array(z.object({ name: z.string().optional() })).optional(),
      }),
    )
    .optional(),
  replacements: z.unknown().optional(),
});

const RawInnings = z.object({
  team: z.string(),
  overs: z.array(z.object({ over: count, deliveries: z.array(RawDelivery) })),
  target: z.object({ runs: count, overs: z.number() }).optional(),
  penalty_runs: z.unknown().optional(),
  super_over: z.boolean().optional(),
});

export const RawMatchSchema = z.object({
  meta: z.object({
    data_version: z.string(),
    created: z.string(),
    revision: z.number(),
  }),
  info: z.object({
    balls_per_over: z.number(),
    city: z.string().optional(),
    dates: z.array(z.string()).min(1),
    event: z
      .object({
        name: z.string(),
        match_number: z.number().optional(),
        group: z.string().optional(),
      })
      .optional(),
    gender: z.string(),
    match_type: z.string(),
    overs: z.number(),
    teams: z.tuple([z.string(), z.string()]),
    venue: z.string(),
    // Read only to reject DLS / Super Over / no-result matches. Never copied out.
    outcome: z.object({
      method: z.string().optional(),
      eliminator: z.string().optional(),
      result: z.string().optional(),
    }),
  }),
  innings: z.array(RawInnings),
});

export type RawMatch = z.infer<typeof RawMatchSchema>;
export type RawDelivery = z.infer<typeof RawDelivery>;
