import { z } from 'zod'

export const noteAttributesSchema = z
  .object({
    address: z.string().max(500).optional(),
    lat: z.number().min(-90).max(90).optional(),
    lng: z.number().min(-180).max(180).optional(),
    duration: z.union([z.number().positive(), z.string().min(1).max(100)]).optional(),
    time_hint: z.string().max(200).optional(),
    cost: z.union([z.number().nonnegative(), z.string().max(100)]).optional(),
    memo: z.string().max(2000).nullable().optional(),
  })
  .strict()

const operationSourceSchema = z.uuid()

export const aiNoteOperationSchema = z.discriminatedUnion('op', [
  z.object({
    op: z.literal('add'),
    title: z.string().trim().min(1).max(60),
    memo: z.string().max(2000).optional().default(''),
    attrs: noteAttributesSchema.optional().default({}),
    source: operationSourceSchema,
  }),
  z.object({
    op: z.literal('update'),
    target: z.uuid(),
    title: z.string().trim().min(1).max(60).optional(),
    memo: z.string().max(2000).nullable().optional(),
    attrs: noteAttributesSchema.optional().default({}),
    source: operationSourceSchema,
  }),
  z.object({
    op: z.literal('hold'),
    target: z.uuid(),
    reason: z.string().trim().min(1).max(500),
    source: operationSourceSchema,
  }),
])

export const aiNoteOperationsSchema = z.object({
  operations: z.array(aiNoteOperationSchema).max(100),
})

export const generatedPlanOptionSchema = z.object({
  id: z.uuid().optional(),
  note_id: z.uuid().nullable().optional(),
  title: z.string().trim().min(1).max(120),
  start_at: z.iso.datetime({ offset: true }),
  end_at: z.iso.datetime({ offset: true }),
  kind: z.enum(['activity', 'travel', 'all_day', 'placeholder']).default('activity'),
  attrs: z.record(z.string(), z.unknown()).default({}),
  reason: z.string().max(1000).optional(),
})

export const generatedPlanSlotSchema = z
  .object({
    id: z.uuid().optional(),
    start_at: z.iso.datetime({ offset: true }),
    end_at: z.iso.datetime({ offset: true }),
    options: z.array(generatedPlanOptionSchema).min(1).max(20),
  })
  .refine((slot) => Date.parse(slot.end_at) > Date.parse(slot.start_at), {
    message: 'slot end_at must be after start_at',
  })

export const generatedPlanSchema = z.object({
  slots: z.array(generatedPlanSlotSchema).max(100),
})
