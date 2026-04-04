import type { Reporter, File } from 'vitest';
import type { TaskResultPack } from '@vitest/runner';

const isTTY = process.stdout.isTTY;

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const s = Math.ceil(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return rem > 0 ? `${m}m ${rem}s` : `${m}m`;
}

export default class ProgressReporter implements Reporter {
  private total = 0;
  private completed = 0;
  private passed = 0;
  private failed = 0;
  private startTime = 0;

  onInit(): void {
    this.startTime = Date.now();
  }

  onCollected(files?: File[]): void {
    if (!files) return;
    for (const file of files) {
      this.total += this.countTests(file);
    }
    const fileCount = files.length;
    console.log(`\nRunning ${this.total} tests across ${fileCount} scenario files\n`);
  }

  private countTests(file: File): number {
    let count = 0;
    const walk = (tasks: File['tasks']): void => {
      for (const task of tasks) {
        if (task.type === 'test') {
          count++;
        } else if ('tasks' in task) {
          walk(task.tasks);
        }
      }
    };
    walk(file.tasks);
    return count;
  }

  onTaskUpdate(packs: TaskResultPack[]): void {
    for (const pack of packs) {
      const result = pack[1];
      if (!result) continue;

      const state = result.state;
      if (state !== 'pass' && state !== 'fail') continue;

      this.completed++;
      if (state === 'pass') this.passed++;
      else this.failed++;

      const pct = Math.round((this.completed / this.total) * 100);
      const elapsed = Date.now() - this.startTime;
      const avgPerTest = elapsed / this.completed;
      const remaining = Math.round(avgPerTest * (this.total - this.completed));
      const eta = formatDuration(remaining);

      const icon = state === 'pass' ? '\u2713' : '\u2717';
      const label = `[${this.completed}/${this.total}] ${pct}%`;

      if (isTTY) {
        process.stdout.write(`\r${label} ${icon} ~${eta} remaining  `);
      } else {
        console.log(`${label} - ~${eta} remaining`);
      }
    }
  }

  onFinished(): void {
    const duration = formatDuration(Date.now() - this.startTime);
    if (isTTY) process.stdout.write('\n');
    console.log('');
    console.log(`Results: ${this.passed} passed, ${this.failed} failed (${duration})`);
    console.log('');
  }
}
