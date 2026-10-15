import { readFileSync } from 'node:fs';

const zh = JSON.parse(readFileSync(`${process.cwd()}/src/i18n/zh-Hant.json`, 'utf8')) as Record<
  string,
  string
>;
const en = JSON.parse(readFileSync(`${process.cwd()}/src/i18n/en.json`, 'utf8')) as Record<
  string,
  string
>;

function section(source: string, start: string, end: string): string {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  expect(from).toBeGreaterThanOrEqual(0);
  expect(to).toBeGreaterThan(from);
  return source.slice(from, to);
}

describe('Chapter 2 monitoring teaching flow', () => {
  const source = readFileSync(`${process.cwd()}/src/scenes/Chapter2LabScene.ts`, 'utf8');

  it('compares recording methods without revealing the chart before deployment', () => {
    const comparison = section(
      source,
      'private showMonitoringComparisonModal(): void',
      'private showDeploymentModal(): void',
    );

    expect(comparison).not.toContain('new DoTimelineChart(');
    expect(comparison).not.toContain('chart.showManualSample(');
    expect(comparison).not.toContain('chart.showContinuousSeries()');
    expect(comparison).toContain("bodyKey: 'lab.compareManualMethodBody'");
    expect(comparison).toContain("bodyKey: 'lab.compareFixedMethodBody'");
    expect(comparison).toContain("bodyKey: 'lab.compareSensorMethodBody'");
    expect(comparison).toContain("sensor.id === 'fixed-probe'");
    expect(comparison).toContain('this.monitoringComparisonComplete = true;');
  });

  it('waits for each real utterance to finish before starting the next narration', () => {
    const comparison = section(
      source,
      'private showMonitoringComparisonModal(): void',
      'private showDeploymentModal(): void',
    );

    expect(comparison).toContain('utterance.onend = () => {');
    expect(comparison).toContain('if (this.activeNarrationUtterance === utterance) finish();');
    expect(comparison).toContain('if (!speechAvailable) {');
    expect(comparison).toContain('narrationFallback = this.time.delayedCall(5200, finish);');
    expect(comparison.indexOf('if (!speechAvailable) {')).toBeLessThan(
      comparison.indexOf('narrationFallback = this.time.delayedCall(5200, finish);'),
    );
    expect(
      comparison.indexOf('narrationFallback = this.time.delayedCall(5200, finish);'),
    ).toBeLessThan(comparison.indexOf('window.speechSynthesis.speak(utterance);'));
  });

  it('starts deployment with no preselected answer and only three teaching choices', () => {
    const deployment = section(
      source,
      'private showDeploymentModal(): void',
      'private showDeploymentResultModal(): void',
    );

    expect(deployment).toContain('let selectedSensor: Sensor | null = null;');
    expect(deployment).toContain("['vessel-sampling', 'fixed-probe', 'sensing-film-node']");
    expect(deployment).toContain("i18n.t('lab.selectDeviceFirst')");
  });

  it('uses the three explicit success rules instead of a hard-coded winning grid cell', () => {
    const deployment = section(
      source,
      'private showDeploymentModal(): void',
      'private showDeploymentResultModal(): void',
    );

    expect(deployment).toContain(
      'evaluateDeployment(currentDeployment(), DEMO_DEPLOYMENT_SCENARIO)',
    );
    expect(deployment).toContain("key: 'allPointsCovered'");
    expect(deployment).toContain("key: 'completeDataAtAllPoints'");
    expect(deployment).toContain("key: 'withinBudget'");
    expect(deployment).not.toContain('placements.has(7)');
    expect(deployment).not.toContain('placements.has(8)');
  });

  it('makes the vessel cover one column and warns when a placement exceeds budget', () => {
    const deployment = section(
      source,
      'private showDeploymentModal(): void',
      'private showDeploymentResultModal(): void',
    );

    expect(deployment).toContain("sensorToPlace.id === 'vessel-sampling'");
    expect(deployment).toContain('[column, column + 3, column + 6]');
    expect(deployment).toContain('totalDeploymentCost(projectedDeployment)');
    expect(deployment).toContain('showBudgetAlarm(projectedCost - totalBudget)');
  });

  it('uses large deployment cards with separate space for the three success rules', () => {
    const deployment = section(
      source,
      'private showDeploymentModal(): void',
      'private showDeploymentResultModal(): void',
    );

    expect(deployment).toContain('.rectangle(x, y, 580, 118');
    expect(deployment).toContain('const y = 412 + index * 128;');
    expect(deployment).toContain('createResearchSurface(this, 450, 816, 580, 132');
    expect(deployment).toContain('.rectangle(600, 318, 270, 48');
    expect(deployment).toContain("fontSize: isEnglish ? '21px' : '23px'");
    expect(deployment).toContain('pulseText(equipmentTitle);');
    expect(deployment).toContain('pulseText(goalsTitle);');
    expect(deployment).not.toContain('toolGuide');
  });

  it('opens a truthful grid result for every completed run without a line chart', () => {
    const deployment = section(
      source,
      'private showDeploymentModal(): void',
      'private showDeploymentResultModal(): void',
    );
    const result = section(
      source,
      'private showDeploymentResultModal(): void',
      'private showLearningSummary(): void',
    );

    expect(deployment).toContain('createDeploymentRunSnapshot(');
    expect(deployment).toContain('this.deploymentRunSnapshot = snapshot;');
    expect(deployment).toContain('resultButton?.setVisible(true);');
    expect(deployment).toContain(
      'this.time.delayedCall(420, () => this.showDeploymentResultModal());',
    );
    expect(deployment).toContain('() => this.showDeploymentResultModal()');
    expect(deployment).not.toContain('new DoTimelineChart(');
    expect(result).not.toContain('new DoTimelineChart(');
    expect(result).not.toContain('chart.showContinuousSeries');
    expect(result).not.toContain('chart.showManualSample');
    expect(result).toContain('const cellXs = [630, 900, 1170]');
    expect(result).toContain('const cellYs = [500, 615, 730]');
    expect(result).toContain('.rectangle(x, y, 248, 102');
    expect(result).toContain('createResearchSurface(this, 850, 848, 1080, 76');
    expect(result).toContain("'lab.resultCellLowGap'");
    expect(result).toContain("'lab.resultCellRepairedLow'");
    expect(result).toContain("'lab.resultCellManual'");
    expect(result).toContain("'lab.resultCellContinuous'");
    expect(result).toContain("cell.mode === 'unmonitored'");
    expect(result).toContain("'lab.resultNearBedGap'");
    expect(result).toContain("activeCell.sensorId !== 'fixed-probe'");
    expect(result).toContain('this.deploymentRepairSpend += cost;');
    expect(result).toContain('activeCell.lowOxygenDetected');
    expect(result).toContain("i18n.t('lab.resultRepairCompleted')");
    expect(result).toContain('if (snapshot.success)');
    expect(result).toContain('const hasNextToolTrial =');
    expect(result).toContain('nextToolHighlight');
    expect(result).toContain('repeat: -1');
    expect(source).not.toContain('DoTimelineChart');
  });

  it('keeps low oxygen visible after repair and uses compact two-line grid labels', () => {
    const result = section(
      source,
      'private showDeploymentResultModal(): void',
      'private showLearningSummary(): void',
    );

    expect(result).toContain(
      "activeCell.lowOxygenDetected ? 'lab.resultCellRepairedLow' : 'lab.resultCellRepaired'",
    );
    expect(zh['lab.resultCellRepairedLow']).toContain('低氧');
    expect(en['lab.resultCellRepairedLow']).toBe('FIXED PROBE\nLOW O₂ · DATA MISSING');
    expect(zh['lab.resultCellLowGap']).toContain('資料中斷');
    expect(en['lab.resultCellLowGap']).toBe('FIXED PROBE\nLOW O₂ · DATA GAP');
    expect(en['lab.resultCellRepaired']?.split('\n')).toHaveLength(2);
    expect(en['lab.resultCellLowGap']?.split('\n')).toHaveLength(2);
  });

  it('restores unresolved repair wrenches when returning to the deployment screen', () => {
    const deployment = section(
      source,
      'private showDeploymentModal(): void',
      'private showDeploymentResultModal(): void',
    );

    expect(deployment).toContain('if (this.deploymentRunComplete)');
    expect(deployment).toContain('updateSimulationVisual(5);');
    expect(deployment).toContain(
      "sensor?.id === 'fixed-probe' && !this.repairedDeploymentCells.has(index)",
    );
  });

  it('keeps the English grid heading and hint in separate horizontal regions', () => {
    const result = section(
      source,
      'private showDeploymentResultModal(): void',
      'private showLearningSummary(): void',
    );

    expect(en['lab.resultCoverageTitle']).toBe('3 × 3 MONITORING GRID');
    expect(result).toContain(".text(1390, 390, inputPrompt(this, 'lab.resultCoverageHint')");
    expect(result).toContain('.setOrigin(1, 0);');
  });

  it('shows the three recording methods again as simple cards in the learning summary', () => {
    const summary = section(
      source,
      'private showLearningSummary(): void',
      'private showFinalQuiz(): void',
    );

    expect(summary).toContain("title: 'lab.summaryVesselMini'");
    expect(summary).toContain("title: 'lab.summaryFixedMini'");
    expect(summary).toContain("title: 'lab.summaryFilmMini'");
    expect(summary).not.toContain('drawSeries');
    expect(summary).toContain("i18n.t('lab.summaryMethodCompare')");
    expect(summary).toContain("i18n.t('lab.summaryNetwork')");
  });
});
