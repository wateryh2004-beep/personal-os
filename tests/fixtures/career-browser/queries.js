import { resumes } from "./data"; export async function getResumeVersions() { const mode=new URLSearchParams(location.search).get("fixture"); return mode==="empty"?{...resumes,resumes:[]}:resumes; }
