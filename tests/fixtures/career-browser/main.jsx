import React from "react";
import { createRoot } from "react-dom/client";
import { CareerHomeView } from "@/components/career/career-home-view";
import ResumesPage from "@/app/(app)/career/resumes/page";
import { home } from "./data";
import "@/app/globals.css";
const isResumes=location.pathname.includes("resumes");const mode=new URLSearchParams(location.search).get("fixture");
const page=isResumes?await ResumesPage():<CareerHomeView data={mode==="empty"?{...home,interviewTargets:[],interviewPreparations:[],milestones:[]}:home} showContinue={false}/>;
createRoot(document.getElementById("root")).render(<main className="mx-auto max-w-[1180px] px-4 py-8 sm:px-8"><p className="mb-6 text-xs text-[var(--text-secondary)]">隔离预览 · 合成内容 · 无数据库和真实写入</p>{page}</main>);
