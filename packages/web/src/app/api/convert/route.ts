import {
  generateDrizzleSchema,
  generatePrismaSchema,
  parseDrizzleSchema,
  parsePrismaSchema,
  validateSchema,
} from '@swayamshinde/core';
import { z } from 'zod';

const conversionRequestSchema = z.object({
  sourceFormat: z.enum(['prisma', 'drizzle']),
  targetFormat: z.enum(['prisma', 'drizzle']),
  schema: z.string().min(1),
});

/**
 * Parses a source schema, runs non-blocking structural validation, generates
 * the target format, and returns the conversion alongside both issue sets.
 */
export async function POST(request: Request): Promise<Response> {
  const body: unknown = await request.json().catch(() => undefined);
  const parsedRequest = conversionRequestSchema.safeParse(body);
  if (!parsedRequest.success) {
    return Response.json({ error: parsedRequest.error.issues }, { status: 400 });
  }

  const { sourceFormat, targetFormat, schema: sourceSchema } = parsedRequest.data;
  if (sourceFormat === targetFormat) {
    return Response.json({ error: 'Source and target formats must differ.' }, { status: 400 });
  }

  try {
    const parsedSchema = sourceFormat === 'prisma'
      ? await parsePrismaSchema(sourceSchema)
      : await parseDrizzleSchema(sourceSchema);
    const validation = validateSchema(parsedSchema);
    const generated = targetFormat === 'prisma'
      ? await generatePrismaSchema(parsedSchema)
      : await generateDrizzleSchema(parsedSchema);

    return Response.json({
      output: generated.code,
      conversionWarnings: generated.warnings,
      validation,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Conversion failed.';
    return Response.json({ error: message }, { status: 422 });
  }
}
