"use client";

import { startTransition, useActionState, useEffect, useRef, useState, type SubmitEvent } from "react";
import { questionPasswordResetAction, type QuestionRecoveryState } from "@/features/auth/question-recovery-action";
import { AuthFeedback, AuthHeading, AuthPassword, AuthSubmit, AuthSuccess } from "@/components/auth/auth-interaction";

const initial: QuestionRecoveryState = {};

export function QuestionRecoveryForm() {
  const [state, action, pending] = useActionState(questionPasswordResetAction, initial);
  const [step, setStep] = useState<"answer" | "password">("answer");
  const [words, setWords] = useState(["", ""]);
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    form.current?.querySelector<HTMLInputElement>(step === "password" ? '[name="password"]' : '[name="firstWord"]')?.focus({ preventScroll: true });
  }, [step]);

  if (state.updated) return <AuthSuccess title="密码已更新" message={state.message} href="/login" action="返回登录" />;

  function next(event: SubmitEvent<HTMLFormElement>) {
    if (step !== "answer") return;
    event.preventDefault();
    const inputs = form.current?.querySelectorAll<HTMLInputElement>(".auth-answer-fields input");
    if (inputs && Array.from(inputs).every(input => input.reportValidity())) startTransition(() => setStep("password"));
  }

  return (
    <form ref={form} action={action} onSubmit={next} className="auth-card auth-form" data-step={step} aria-busy={pending}>
      <AuthHeading title="找回密码" />
      <ol className="auth-steps" aria-label="找回密码步骤"><li aria-current={step === "answer" ? "step" : undefined} data-active="true">填写答案</li><li aria-current={step === "password" ? "step" : undefined} data-active={step === "password"}>设置密码</li></ol>
      <fieldset disabled={pending} className="auth-fields">
        <fieldset className="auth-answer-fields" hidden={step !== "answer"}>
          <legend className="auth-question">你认为余航人生中最重要的事情是什么？</legend>
          <p className="auth-hint">填写两个英语单词，大小写不限。</p>
          <div className="auth-word-pair">{[0, 1].map(index => <div key={index} className="auth-word"><AuthPassword label={index === 0 ? "第一个单词" : "第二个单词"} required name={index === 0 ? "firstWord" : "secondWord"} maxLength={64} pattern="[a-zA-Z]+" autoComplete="off" autoCapitalize="none" spellCheck={false} placeholder="xxxx" value={words[index]} onChange={event => setWords(values => values.map((value, i) => i === index ? event.target.value : value))} />{index === 0 ? <span className="auth-word-join" aria-hidden="true">和</span> : null}</div>)}</div>
        </fieldset>
        <div className="auth-password-fields auth-fields" hidden={step !== "password"} key={step}>
          <AuthPassword label="新密码" required name="password" minLength={10} maxLength={128} autoComplete="new-password" placeholder="至少 10 个字符" />
          <AuthPassword label="确认新密码" required name="confirmPassword" minLength={10} maxLength={128} autoComplete="new-password" placeholder="再输入一次新密码" />

        </div>
      </fieldset>
      <AuthFeedback state={state} />
      {step === "answer" ? <button type="submit" formNoValidate className="auth-primary">继续设置密码<span aria-hidden="true">→</span></button> : <><AuthSubmit pending={pending} label="验证答案并重置密码" pendingLabel="正在验证并重置…" /><button type="button" disabled={pending} className="auth-back" onClick={() => startTransition(() => setStep("answer"))}>← 修改答案</button></>}
      <noscript><style>{`.auth-password-fields[hidden],.auth-answer-fields[hidden]{display:grid!important}`}</style><p className="auth-hint">请完整填写答案和新密码后提交。</p></noscript>
    </form>
  );
}
