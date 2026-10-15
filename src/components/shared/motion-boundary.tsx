"use client";

import * as React from "react";

type TransitionClass = string | { default: string; [type: string]: string };
type MotionBoundaryProps = {
  children: React.ReactNode;
  name?: string;
  enter?: TransitionClass;
  exit?: TransitionClass;
  share?: TransitionClass;
  update?: TransitionClass;
};

// App Router supplies React's ViewTransition runtime. Stable React (unit tests,
// non-Next renderers) and browsers without the API retain the ordinary live UI.
const NativeTransition = (React as typeof React & {
  ViewTransition?: React.ComponentType<MotionBoundaryProps & { default: string }>;
}).ViewTransition;

export function MotionBoundary(props: MotionBoundaryProps) {
  return NativeTransition ? <NativeTransition default="none" {...props} /> : <>{props.children}</>;
}
