import { readFileSync } from 'node:fs';

describe('iPad touch controls', () => {
  const touchSource = readFileSync(`${process.cwd()}/src/input/TouchInputAdapter.ts`, 'utf8');
  const managerSource = readFileSync(`${process.cwd()}/src/input/InputManager.ts`, 'utf8');
  const diveSource = readFileSync(`${process.cwd()}/src/scenes/DiveScene.ts`, 'utf8');
  const schemeSource = readFileSync(`${process.cwd()}/src/input/ControlScheme.ts`, 'utf8');

  it('keeps joystick, action, and cancel on independent pointers', () => {
    expect(touchSource).toContain('private joystickPointerId: number | null = null');
    expect(touchSource).toContain('private actionPointerId: number | null = null');
    expect(touchSource).toContain('private cancelPointerId: number | null = null');
    expect(touchSource).toContain('this.actionPressed || this.actionPointerId !== null');
    expect(touchSource).toContain('this.cancelPressed || this.cancelPointerId !== null');
    expect(touchSource).not.toContain('state.action = true');
    expect(touchSource).toContain('JOYSTICK_Y + 92');
  });

  it('shows touch controls only for the touch control scheme', () => {
    expect(schemeSource).toContain("get('controls')");
    expect(schemeSource).toContain("override === 'touch' || override === 'keyboard'");
    expect(managerSource).toContain(
      'usesTouchControls(scene) ? new TouchInputAdapter(scene) : null',
    );
    expect(managerSource).toContain('setTouchControlsVisible');
    expect(managerSource).toContain('setTouchActionLabel');
  });

  it('provides a touch shutter and a dedicated viewfinder exit', () => {
    expect(diveSource).toContain("setTouchActionLabel(i18n.t('touch.shutter'))");
    expect(diveSource).toContain('setTouchCancelVisible(this.viewfinderOpen)');
    expect(diveSource).toContain('if (input.cancel && !this.cancelWasDown)');
    expect(diveSource).toContain("inputPrompt(this, 'dive.viewfinderControls')");
  });

  it('has bilingual touch-specific instructions and a landscape guard', () => {
    const english = JSON.parse(readFileSync(`${process.cwd()}/src/i18n/en.json`, 'utf8')) as Record<
      string,
      string
    >;
    const chinese = JSON.parse(
      readFileSync(`${process.cwd()}/src/i18n/zh-Hant.json`, 'utf8'),
    ) as Record<string, string>;
    const page = readFileSync(`${process.cwd()}/index.html`, 'utf8');
    const required = [
      'tutorial.move.touch',
      'tutorial.explore.touch',
      'dive.stationPhotoPrompt.touch',
      'dive.viewfinderControls.touch',
      'lab.controls.touch',
      'report.photoToggleHint.touch',
    ];

    for (const key of required) {
      expect(english[key]).toBeTruthy();
      expect(chinese[key]).toBeTruthy();
    }
    expect(page).toContain('@media (orientation: portrait) and (pointer: coarse)');
    expect(page).toContain('Rotate your iPad to landscape to play');
  });
});
