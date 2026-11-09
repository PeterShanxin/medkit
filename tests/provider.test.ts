import { describe, expect, it, vi } from 'vitest';
import {
  explainAssessment,
  type ExplanationProvider,
  type ProviderConsent,
} from '../integrations/ai/provider';
import { assessRecords } from '../src/application/advisor';
import { fixture, now } from './fixtures';

const assessment = assessRecords(fixture().state, now);
const consent: ProviderConsent = {
  providerId: 'test',
  purpose: 'organize-record-findings',
  expiresAt: '2099-01-01T00:00:00.000Z',
  revokedAt: null,
};
describe('provider boundary', () => {
  it('does not transmit any facts without consent for this provider and purpose', async () => {
    const organize = vi.fn();
    const provider: ExplanationProvider = {
      id: 'test',
      location: 'remote',
      organize,
    };
    expect((await explainAssessment(assessment, provider)).source).toBe(
      'local',
    );
    expect(organize).not.toHaveBeenCalled();
    await explainAssessment(assessment, provider, {
      ...consent,
      providerId: 'other',
    });
    expect(organize).not.toHaveBeenCalled();
    await explainAssessment(assessment, provider, {
      ...consent,
      revokedAt: now,
    });
    expect(organize).not.toHaveBeenCalled();
  });
  it('returns a local summary if the provider is unavailable or slow', async () => {
    const provider: ExplanationProvider = {
      id: 'test',
      location: 'remote',
      organize: async () => {
        throw new Error('Network unavailable');
      },
    };
    expect(
      (await explainAssessment(assessment, provider, consent)).source,
    ).toBe('local');
    const slow: ExplanationProvider = {
      ...provider,
      organize: () => new Promise(() => {}),
    };
    expect((await explainAssessment(assessment, slow, consent, 5)).source).toBe(
      'local',
    );
  });
  it('rejects invented findings, omitted facts, and unsolicited medical advice', async () => {
    for (const response of [
      { orderedFactIds: ['invented'] },
      { orderedFactIds: [], advice: 'Take a medicine' },
      { orderedFactIds: [] },
    ]) {
      const provider: ExplanationProvider = {
        id: 'test',
        location: 'local',
        organize: async () => response,
      };
      const result = await explainAssessment(assessment, provider, consent);
      expect(result.source).toBe('local');
      expect(result.text.join(' ')).not.toContain('Take a medicine');
    }
  });
  it('allows ordering trusted findings while retaining their exact local wording and limitations', async () => {
    const provider: ExplanationProvider = {
      id: 'test',
      location: 'remote',
      organize: async (request) => ({
        orderedFactIds: request.facts.map((fact) => fact.id).reverse(),
      }),
    };
    const result = await explainAssessment(assessment, provider, consent);
    expect(result.source).toBe('provider-assisted');
    expect(result.text).toContain(assessment.limitations[0]);
  });
});
