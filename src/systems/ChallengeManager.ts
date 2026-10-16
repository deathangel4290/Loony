import { dailyChallenge, type DailyChallenge } from '../data/challenge';
import type { Reward } from '../data/types';
import { localDateKey } from './DailyRewardManager';
import type { RunSummary } from './RunSummary';
import type { SaveManager } from './SaveManager';

export interface ChallengeResult {
  challenge: DailyChallenge;
  best: number;
  completedNow: boolean;
  completed: boolean;
}

/** Tracks today's daily challenge: best distance and the one-time reward. */
export class ChallengeManager {
  constructor(private save: SaveManager, private grant: (r: Reward) => void, private now: () => Date = () => new Date()) {}

  get today(): DailyChallenge {
    return dailyChallenge(localDateKey(this.now()));
  }

  private state() {
    const st = this.save.data.challenge;
    const key = localDateKey(this.now());
    if (st.dateKey !== key) {
      st.dateKey = key;
      st.best = 0;
      st.completed = false;
      st.attempts = 0;
      this.save.markDirty();
    }
    return st;
  }

  get best(): number {
    return this.state().best;
  }

  get completed(): boolean {
    return this.state().completed;
  }

  get attempts(): number {
    return this.state().attempts;
  }

  recordRun(run: RunSummary): ChallengeResult {
    const st = this.state();
    const challenge = this.today;
    st.attempts += 1;
    st.best = Math.max(st.best, Math.floor(run.distance));
    let completedNow = false;
    if (!st.completed && run.distance >= challenge.target) {
      st.completed = true;
      st.streak += 1;
      completedNow = true;
      this.grant(challenge.reward);
    }
    this.save.markDirty();
    return { challenge, best: st.best, completedNow, completed: st.completed };
  }
}
