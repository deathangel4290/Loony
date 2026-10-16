import type { GameSession } from './GameSession';

export type TutorialStep = 'gas' | 'coins' | 'airWait' | 'air' | 'brake' | 'fuelWait' | 'fuel' | 'done' | 'finished';
type PromptStep = 'gas' | 'coins' | 'air' | 'brake' | 'fuel' | 'done';

export interface TutorialPrompt {
  step: PromptStep;
  title: string;
  body: string;
  highlight: 'gas' | 'brake' | 'both' | 'fuel' | 'coins' | null;
}

const PROMPTS: Record<PromptStep, TutorialPrompt> = {
  gas: { step: 'gas', title: 'Hold GAS', body: 'Press and hold the right pedal to drive', highlight: 'gas' },
  coins: { step: 'coins', title: 'Grab coins!', body: 'Coins buy upgrades and new rides', highlight: 'coins' },
  air: { step: 'air', title: 'Airborne!', body: 'GAS tilts forward · BRAKE tilts back — land on your wheels', highlight: 'both' },
  brake: { step: 'brake', title: 'BRAKE = slow down', body: 'Hold the left pedal to brake and reverse', highlight: 'brake' },
  fuel: { step: 'fuel', title: 'Watch your fuel!', body: 'Grab fuel cans to keep going', highlight: 'fuel' },
  done: { step: 'done', title: 'You got it!', body: 'Go as far as you can', highlight: null },
};

/**
 * Teaches by doing: each tip appears when it becomes relevant and clears as
 * soon as the player performs it. The run itself is a normal run.
 */
export class Tutorial {
  step: TutorialStep = 'gas';
  private timer = 0;
  private gasHeld = 0;
  private airShown = false;
  slowMo = 1;

  constructor(private session: GameSession, private onPrompt: (p: TutorialPrompt | null) => void) {
    onPrompt(PROMPTS.gas);
  }

  private go(step: TutorialStep): void {
    this.step = step;
    this.timer = 0;
    this.onPrompt(step in PROMPTS ? PROMPTS[step as PromptStep] : null);
  }

  update(dt: number): void {
    const s = this.session;
    const v = s.player.vehicle;
    this.timer += dt;
    this.slowMo = 1;
    if (!s.player.alive) {
      if (this.step !== 'finished') this.go('finished');
      return;
    }
    const x = s.player.x;
    // Only teach air control on a real jump, not a hop over a bump.
    const pos = v.chassis.getPosition();
    const bigAir = v.airborne && v.airTime > 0.25 && pos.y - s.gen.surfaceAt(pos.x) > 1.6;
    switch (this.step) {
      case 'gas':
        if (s.input.gas) this.gasHeld += dt;
        if (this.gasHeld > 1.2 && s.distance > 4) this.go('coins');
        break;
      case 'coins': {
        if (bigAir && !this.airShown && this.timer > 1.5) return this.go('air');
        if (s.coinCount > 0 && this.timer > 2.5) this.go(this.airShown ? 'brake' : 'airWait');
        else if (this.timer > 4.5) this.go('airWait');
        break;
      }
      case 'airWait':
        if (bigAir) this.go('air');
        else if (x > 150) this.go('brake');
        break;
      case 'air':
        this.airShown = true;
        this.slowMo = v.airborne && this.timer < 1.6 ? 0.45 : 1;
        if (!v.airborne && this.timer > 0.4) this.go('brake');
        break;
      case 'brake':
        if (this.timer > 3.2 || (s.input.brake && this.timer > 1)) this.go('fuelWait');
        break;
      case 'fuelWait': {
        const nextFuel = s.gen.collectibles.find((c) => c.kind === 'fuel' && !c.collected && c.x > x - 2);
        if ((nextFuel && nextFuel.x - x < 28) || s.player.fuelFrac < 0.5) this.go('fuel');
        break;
      }
      case 'fuel':
        if (s.fuelCollected > 0) this.go('done');
        else if (this.timer > 9) this.go('done');
        break;
      case 'done':
        if (this.timer > 2.5) this.go('finished');
        break;
    }
  }
}
