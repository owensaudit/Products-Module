import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { emptyState } from "./model.js";

export function createStore(filePath) {
  let chain = Promise.resolve();

  async function read() {
    try {
      const text = await readFile(filePath, "utf8");
      const parsed = JSON.parse(text);
      return {
        people: parsed.people ?? [],
        outreachAttempts: parsed.outreachAttempts ?? [],
        visits: parsed.visits ?? [],
        comments: parsed.comments ?? [],
        importMeta: parsed.importMeta ?? null,
        presidency: parsed.presidency ?? null,
      };
    } catch (error) {
      if (error && error.code === "ENOENT") return emptyState();
      throw error;
    }
  }

  async function write(state) {
    await mkdir(path.dirname(filePath), { recursive: true });
    const temporary = `${filePath}.${process.pid}.tmp`;
    await writeFile(temporary, JSON.stringify(state, null, 2));
    await rename(temporary, filePath);
  }

  function update(mutator) {
    const run = chain.then(async () => {
      const current = await read();
      const next = await mutator(current);
      await write(next);
      return next;
    });
    chain = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  return { read, write, update };
}
