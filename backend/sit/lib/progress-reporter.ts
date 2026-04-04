import type { Reporter, File, Task } from 'vitest';

const isTTY = process.stdout.isTTY;

function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  const s = Math.ceil(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return rem > 0 ? `${m}m ${rem}s` : `${m}m`;
}

interface FailureInfo {
  name: string;
  file: string;
  error: string;
}

export default class ProgressReporter implements Reporter {
  private total = 0;
  private completed = 0;
  private passed = 0;
  private failed = 0;
  private failures: FailureInfo[] = [];
  private startTime = 0;
  private collected = false;

  onInit(): void {
    this.startTime = Date.now();
  }

  onCollected(files?: File[]): void {
    // Only count once (vitest may call this multiple times)
    if (this.collected || !files) return;
    this.collected = true;

    for (const file of files) {
      this.total += this.countLeafTests(file.tasks);
    }
    console.log(`\nRunning ${this.total} tests across ${files.length} scenario files\n`);
  }

  private countLeafTests(tasks: Task[]): number {
    let count = 0;
    for (const task of tasks) {
      if (task.type === 'test') {
        count++;
      } else if ('tasks' in task && Array.isArray(task.tasks)) {
        count += this.countLeafTests(task.tasks);
      }
    }
    return count;
  }

  onTaskUpdate(): void {
    // Not reliable for counting — use onFinished to walk the tree instead.
    // We still want live progress though, so we walk all files each time.
  }

  onTestFinished(): void {
    this.completed++;
    this.printProgress();
  }

  private printProgress(): void {
    if (this.total === 0) return;
    const pct = Math.round((this.completed / this.total) * 100);
    const elapsed = Date.now() - this.startTime;
    const avgPerTest = elapsed / this.completed;
    const remaining = Math.max(0, Math.round(avgPerTest * (this.total - this.completed)));
    const eta = formatDuration(remaining);

    const label = `[${this.completed}/${this.total}] ${pct}%`;

    if (isTTY) {
      process.stdout.write(`\r${label} — ~${eta} remaining  `);
    } else {
      console.log(`${label} — ~${eta} remaining`);
    }
  }

  onFinished(files?: File[]): void {
    if (isTTY) process.stdout.write('\n');

    // Walk all files to get accurate pass/fail counts and failure details
    this.passed = 0;
    this.failed = 0;
    this.failures = [];

    if (files) {
      for (const file of files) {
        this.walkResults(file.tasks, file.name);
      }
    }

    const duration = formatDuration(Date.now() - this.startTime);

    console.log('');
    console.log(`  ${this.passed} passed, ${this.failed} failed (${duration})`);

    if (this.failures.length > 0) {
      console.log('');
      console.log('  Failed tests:');
      for (const f of this.failures) {
        console.log(`    ✗ ${f.name}`);
        console.log(`      ${f.file}`);
        // Show first line of error (most useful part)
        const firstLine = f.error.split('\n')[0].trim();
        if (firstLine) {
          console.log(`      → ${firstLine}`);
        }
        console.log('');
      }
    }
  }

  private walkResults(tasks: Task[], fileName: string): void {
    for (const task of tasks) {
      if (task.type === 'test' && task.result) {
        if (task.result.state === 'pass') {
          this.passed++;
        } else if (task.result.state === 'fail') {
          this.failed++;
          const errMsg = task.result.errors?.[0]?.message
            ?? task.result.errors?.[0]?.toString?.()
            ?? 'Unknown error';
          this.failures.push({
            name: task.name,
            file: fileName,
            error: errMsg,
          });
        }
      } else if ('tasks' in task && Array.isArray(task.tasks)) {
        this.walkResults(task.tasks, fileName);
      }
    }
  }
}
