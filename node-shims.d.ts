declare module "node:child_process" {
  interface CommandOutput {
    toString(encoding?: string): string;
  }

  export function execSync(
    command: string,
    options?: { stdio?: "pipe" | "ignore" | "inherit" | readonly string[] },
  ): CommandOutput;
}

declare const process: {
  cwd(): string;
};
