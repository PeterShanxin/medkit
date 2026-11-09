import { z } from 'zod';
import { type Assessment } from '../../src/application/advisor';

export interface ExplanationRequest {
  purpose: 'organize-record-findings';
  facts: { id: string; text: string }[];
}

export interface ExplanationProvider {
  id: string;
  location: 'remote' | 'local';
  organize(request: ExplanationRequest, signal: AbortSignal): Promise<unknown>;
}

export interface ProviderConsent {
  providerId: string;
  purpose: ExplanationRequest['purpose'];
  expiresAt: string;
  revokedAt: string | null;
}

const resultSchema = z
  .object({ orderedFactIds: z.array(z.string()).max(100) })
  .strict();

/** A provider can order checked facts. It cannot introduce treatment text or mutate records. */
export async function explainAssessment(
  assessment: Assessment,
  provider?: ExplanationProvider,
  consent?: ProviderConsent,
  timeoutMs = 10_000,
): Promise<{
  source: 'local' | 'provider-assisted';
  text: string[];
  reason?: string;
}> {
  const facts = assessment.findings.map((finding, index) => ({
    id: `finding-${index}`,
    text: `${finding.title}. ${finding.detail}`,
  }));
  const fallback = (reason: string) => ({
    source: 'local' as const,
    text: [...facts.map((fact) => fact.text), ...assessment.limitations],
    reason,
  });
  if (!provider) return fallback('No provider is connected.');
  if (
    !consent ||
    consent.providerId !== provider.id ||
    consent.purpose !== 'organize-record-findings' ||
    consent.revokedAt ||
    !Number.isFinite(Date.parse(consent.expiresAt)) ||
    Date.parse(consent.expiresAt) <= Date.now()
  )
    return fallback('Consent is required for this provider and purpose.');
  if (assessment.outcome === 'seek-help')
    return fallback('Urgent guidance does not use a model.');
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(new Error('Provider timeout'));
      }, timeoutMs);
    });
    const output = resultSchema.parse(
      await Promise.race([
        provider.organize(
          { purpose: 'organize-record-findings', facts },
          controller.signal,
        ),
        timeout,
      ]),
    );
    if (
      output.orderedFactIds.length !== facts.length ||
      new Set(output.orderedFactIds).size !== facts.length ||
      output.orderedFactIds.some((id) => !facts.some((fact) => fact.id === id))
    )
      return fallback(
        'The provider response did not preserve every checked fact.',
      );
    return {
      source: 'provider-assisted',
      text: [
        ...output.orderedFactIds.map(
          (id) => facts.find((fact) => fact.id === id)!.text,
        ),
        ...assessment.limitations,
      ],
    };
  } catch {
    return fallback(
      'The provider is unavailable or returned an invalid response.',
    );
  } finally {
    if (timer) clearTimeout(timer);
  }
}
