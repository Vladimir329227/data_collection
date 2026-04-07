import { z } from "zod";

/** ru / en / de string lists (questions or string lines per language) */
const langStringArrays = z.object({
  ru: z.array(z.string()),
  en: z.array(z.string()),
  de: z.array(z.string()),
});

const productAliases = z.record(z.string(), langStringArrays);

const qaPairRegular = z
  .object({
    id: z.string(),
    category: z.string(),
    questions: langStringArrays,
    answers: langStringArrays,
    product_filter: z.union([z.string(), z.null()]).optional(),
  })
  .strict();

const qaPairTemplate = z
  .object({
    id: z.string(),
    category: z.string(),
    type: z.literal("product_template"),
    question_templates: langStringArrays,
    answer_template: langStringArrays,
  })
  .strict();

export const qaPairSchema = z.union([qaPairTemplate, qaPairRegular]);

const recommendationRules = z.object({
  by_effect: z.record(z.string(), z.array(z.string())),
  by_ingredient: z.record(z.string(), z.array(z.string())),
  by_color: z.record(z.string(), z.array(z.string())),
});

export const knowledgeBaseSchema = z.object({
  product_aliases: productAliases,
  qa_pairs: z.array(qaPairSchema),
  recommendation_rules: recommendationRules,
});

export type KnowledgeBase = z.infer<typeof knowledgeBaseSchema>;
export type QaPair = z.infer<typeof qaPairSchema>;
export type LangStrings = z.infer<typeof langStringArrays>;

export type QaProductTemplate = Extract<QaPair, { type: "product_template" }>;

export function isProductTemplate(p: QaPair): p is QaProductTemplate {
  return (p as { type?: string }).type === "product_template";
}

export function parseKnowledgeBase(data: unknown): KnowledgeBase {
  return knowledgeBaseSchema.parse(data);
}

export function safeParseKnowledgeBase(data: unknown) {
  return knowledgeBaseSchema.safeParse(data);
}
