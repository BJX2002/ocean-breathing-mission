import { readFileSync } from 'node:fs';

function section(source: string, start: string, end: string): string {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  expect(from).toBeGreaterThanOrEqual(0);
  expect(to).toBeGreaterThan(from);
  return source.slice(from, to);
}

describe('Chapter 2 monitoring teaching flow', () => {
  const source = readFileSync(`${process.cwd()}/src/scenes/Chapter2LabScene.ts`, 'utf8');

  it('compares one vessel reading with a 24-hour sensor chart before deployment', () => {
    const comparison = section(
      source,
      'private showMonitoringComparisonModal(): void',
      'private showDeploymentModal(): void',
    );

    expect(comparison).toContain('new DoTimelineChart(');
    expect(comparison).toContain('chart.showManualSample(');
    expect(comparison).toContain('chart.showContinuousSeries()');
    expect(comparison).toContain("step = 'sensor-result'");
    expect(comparison).toContain('this.monitoringComparisonComplete = true;');
  });

  it('starts deployment with no preselected answer and only three teaching choices', () => {
    const deployment = section(
      source,
      'private showDeploymentModal(): void',
      'private showLearningSummary(): void',
    );

    expect(deployment).toContain('let selectedSensor: Sensor | null = null;');
    expect(deployment).toContain("['vessel-sampling', 'fixed-probe', 'sensing-film-node']");
    expect(deployment).toContain("i18n.t('lab.selectDeviceFirst')");
  });

  it('uses the shared five-goal rules instead of a hard-coded winning grid cell', () => {
    const deployment = section(
      source,
      'private showDeploymentModal(): void',
      'private showLearningSummary(): void',
    );

    expect(deployment).toContain('evaluateDeployment(deployed, DEMO_DEPLOYMENT_SCENARIO)');
    expect(deployment).toContain("key: 'continuousRecording'");
    expect(deployment).toContain("key: 'allLocationsCovered'");
    expect(deployment).toContain("key: 'multipleDepthsCovered'");
    expect(deployment).toContain("key: 'eventDetected'");
    expect(deployment).toContain("key: 'withinBudget'");
    expect(deployment).not.toContain('placements.has(7)');
    expect(deployment).not.toContain('placements.has(8)');
  });
});
