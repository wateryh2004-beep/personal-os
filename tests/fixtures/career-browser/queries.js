import { resumes } from "./data"; export async function getResumeVersions() { const mode=new URLSearchParams(location.search).get("fixture"); return mode==="empty"?{...resumes,resumes:[]}:resumes; }

export async function getInterviewQuestions() { const {catalogRows}=await import("./interview.js"); const mode=new URLSearchParams(location.search).get("fixture"); return {rows:mode==="empty"?[]:catalogRows.map(row=>({question:{id:row.id,canonical_prompt:row.prompt,short_title:row.shortTitle,category:row.category,question_style:row.style,subcategory:row.subcategory},preparationCount:row.preparationCount})),unavailable:mode==="error"}; }

export async function getPracticeQueue(context) { return (await import("./practice.js")).fixtureQueue(context); }
export async function getInterviewInsights() { return (await import("./practice.js")).fixtureInsights(); }
export async function getPracticeDetail() { return (await import("./practice.js")).fixtureDetail(); }
export async function getInterviewStories() { return (await import("./stories.js")).storyLibraryFixture(); }
export async function getInterviewStoryDetail(id) { return (await import("./stories.js")).storyDetailFixture(id); }
