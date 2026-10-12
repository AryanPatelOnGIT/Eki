const path = 'backend/src/services/telemetryPayload.test.ts';
export const mutationTestMap = [
  ['GNSS02', ['rejects primitive and array shapes with the explicit shape reason',
    'rejects empty objects and closed-schema prefixes before field validation'], 'Closed payload shape and complete rollout field sets before numeric validation.'],
  ['GNSS07', ['accepts all three motion states and rejects unknown or non-string states'], 'All motion enum values accepted; malformed and unknown states rejected.'],
  ['GNSS09', ['preserves delayed device send time in both sequenced schemas and rejects invalid send clocks'], 'Delayed receipt/sample clocks retained across both sequenced schemas; nonnumeric/fractional/earlier/too-future clocks rejected.'],
  ['GNSS10', ['accepts a valid JSON body at 512 bytes and refuses zero and 513 bytes before parsing'], 'Direct binary parser exact 511/512-byte acceptance and zero/513-byte refusal before parsing.'],
].map(([caseId, titles, scope]) => ({ caseId, scope, sourcePaths: ['backend/src/services/telemetryPayload.ts'],
  tests: titles.map(title => ({ path, name: `parseTelemetryPayload > ${title}`, level: 'L1', semantics: scope })) }));
