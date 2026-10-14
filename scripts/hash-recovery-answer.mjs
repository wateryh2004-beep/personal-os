// Run locally, then copy only the generated verifier to a server-only env var.
import { randomBytes, scryptSync } from "node:crypto";
import { createInterface } from "node:readline/promises";

const prompt = createInterface({ input: process.stdin, output: process.stderr });
try {
  const first = (await prompt.question("第一个英语单词：")).trim().toLowerCase();
  const second = (await prompt.question("第二个英语单词：")).trim().toLowerCase();
  if (![first, second].every((word) => /^[a-z]{1,64}$/.test(word))) throw new Error("请分别输入两个英语单词。");
  const salt = randomBytes(16);
  const hash = scryptSync(`${first}\n${second}`, salt, 32);
  console.log(`scrypt-v1:${salt.toString("hex")}:${hash.toString("hex")}`);
} finally {
  prompt.close();
}
