import { z } from 'npm:zod@4.4.3'

const noteAttrs = z
  .object({
    address: z.string().max(500).optional(),
    lat: z.number().min(-90).max(90).optional(),
    lng: z.number().min(-180).max(180).optional(),
    duration: z.union([z.number().positive(), z.string().min(1).max(100)]).optional(),
    time_hint: z.string().max(200).optional(),
    cost: z.union([z.number().nonnegative(), z.string().max(100)]).optional(),
  })
  .strict()

export const noteOperations = z.object({
  operations: z.array(
    z.discriminatedUnion('op', [
      z.object({
        op: z.literal('add'),
        title: z.string().trim().min(1).max(60),
        memo: z.string().max(2000).optional().default(''),
        attrs: noteAttrs.optional().default({}),
        source: z.string().uuid(),
      }),
      z.object({
        op: z.literal('update'),
        target: z.string().uuid(),
        title: z.string().trim().min(1).max(60).optional(),
        memo: z.string().max(2000).nullable().optional(),
        attrs: noteAttrs.optional().default({}),
        source: z.string().uuid(),
      }),
      z.object({
        op: z.literal('hold'),
        target: z.string().uuid(),
        reason: z.string().trim().min(1).max(500),
        source: z.string().uuid(),
      }),
    ]),
  ),
})

export const generatedPlan = z.object({
  slots: z.array(
    z.object({
      id: z.string().uuid().optional(),
      start_at: z.string().datetime({ offset: true }),
      end_at: z.string().datetime({ offset: true }),
      options: z.array(
        z.object({
          id: z.string().uuid().optional(),
          note_id: z.string().uuid().nullable().optional(),
          title: z.string().trim().min(1).max(120),
          start_at: z.string().datetime({ offset: true }),
          end_at: z.string().datetime({ offset: true }),
          kind: z.enum(['activity', 'travel', 'all_day', 'placeholder']).default('activity'),
          attrs: z.record(z.string(), z.unknown()).default({}),
          reason: z.string().max(1000).optional(),
        }),
      ),
    }),
  ),
})
