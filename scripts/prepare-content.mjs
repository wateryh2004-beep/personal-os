#!/usr/bin/env node
// Local validation only. No network, sign-in, credentials, or database writes.
// Node 22.7+ with --experimental-transform-types (or Node 24) is required.
import { contentWriteSchema } from "../src/features/content/contracts.ts";

if (process.argv.slice(2).some((value) => value === "--help")) {
  process.stdout.write("Usage: node --experimental-transform-types scripts/prepare-content.mjs < chosen-command.json\nValidates one explicitly chosen content command and prints normalized JSON. Does not publish or connect.\n");
} else if (process.argv.length > 2 || process.stdin.isTTY) {
  process.stderr.write("Supply one JSON command on stdin. Credentials and command-line content are not accepted.\n");
  process.exitCode = 2;
} else {
  try {
    const chunks = [];
    let bytes = 0;
    for await (const chunk of process.stdin) {
      bytes += chunk.length;
      if (bytes > 1_000_000) throw new Error("invalid");
      chunks.push(chunk);
    }
    const command = contentWriteSchema.safeParse(JSON.parse(Buffer.concat(chunks).toString("utf8")));
    if (!command.success) throw new Error("invalid");
    process.stdout.write(`${JSON.stringify(command.data, null, 2)}\n`);
  } catch {
    process.stderr.write("Invalid content command. Check the content-write contract; no content was sent or saved.\n");
    process.exitCode = 1;
  }
}
