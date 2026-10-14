"use server";

import { z } from "zod";
import { consumeQuestionRecoveryAttempt, isQuestionRecoveryConfigured, resetOwnerPasswordFromQuestion } from "@/lib/adapters/question-password-recovery";
import { verifyRecoveryAnswer } from "@/lib/auth/recovery-answer";

const word = z.string().trim().min(1).max(64).regex(/^[a-z]+$/i);
const schema = z.object({
  firstWord: word,
  secondWord: word,
  password: z.string().min(10).max(128),
  confirmPassword: z.string().min(10).max(128),
}).refine((value) => value.password === value.confirmPassword);

export type QuestionRecoveryState = { error?: string; message?: string; updated?: boolean };

export async function questionPasswordResetAction(_: QuestionRecoveryState, formData: FormData): Promise<QuestionRecoveryState> {
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "请分别填写两个英语单词，并输入至少 10 位的新密码，两次密码须一致。" };
  if (!isQuestionRecoveryConfigured()) return { error: "问题找回暂未启用，请使用邮箱找回。" };

  try {
    // Shared database limit comes before answer checking; no in-memory fallback.
    if (!await consumeQuestionRecoveryAttempt()) return { error: "尝试次数过多，请 15 分钟后再试，或使用邮箱找回。" };
    if (!await verifyRecoveryAnswer(parsed.data.firstWord, parsed.data.secondWord, process.env.PASSWORD_RECOVERY_ANSWER_HASH!)) {
      return { error: "答案不正确，请重新填写。" };
    }
    const { sessionsRevoked } = await resetOwnerPasswordFromQuestion(parsed.data.password);
    return {
      updated: true,
      message: sessionsRevoked
        ? "密码已更新，请返回登录。"
        : "密码已更新，请返回登录。旧会话退出未完成，请登录后检查账户安全。",
    };
  } catch {
    // Never log answers, passwords, generated links, session tokens or SDK error objects.
    return { error: "暂时无法重置密码，请稍后重试或使用邮箱找回。" };
  }
}
