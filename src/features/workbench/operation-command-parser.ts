import { instantToDate, shiftCalendarDate, wallTimeToIso } from "@/features/calendar/timezone";
export type ParsedWorkbenchCommand = { kind: "calendar"; subject: string; startsAt: string; endsAt: string; timezone: string } | { kind: "tasks_tomorrow" };
export function isWorkbenchCommandCandidate(query: string): boolean {
 const text=query.trim();
 return /^(把)?选中(的)?任务(移到|改到|延到)明天$/.test(text) || /^(今天|明天|后天|周[一二三四五六日天])\s*\d{1,2}(?:[:：]\d{2}|点(?:\d{1,2}分?)?)\s*.+?\s*\d{1,3}分钟$/.test(text);
}
/** Deliberately small deterministic grammar. Parsing never writes or invokes AI. */
export function parseWorkbenchCommand(query: string, timezone: string, now: string): ParsedWorkbenchCommand | null {
 const text=query.trim();
 if(/^(把)?选中(的)?任务(移到|改到|延到)明天$/.test(text))return {kind:"tasks_tomorrow"};
 const match=/^(今天|明天|后天|周[一二三四五六日天])\s*(\d{1,2})(?:[:：](\d{2})|点(?:(\d{1,2})分?)?)\s*(.+?)\s*(\d{1,3})分钟$/.exec(text);
 if(!match)return null;
 const [,day,hourText,colonMinute,minuteText,subject,durationText]=match;
 const hour=Number(hourText),minute=Number(colonMinute??minuteText??0),duration=Number(durationText);
 if(hour>23||minute>59||duration<1||duration>480||subject.length>500)return null;
 const today=instantToDate(now,timezone);
 let offset=day==="明天"?1:day==="后天"?2:0;
 if(day.startsWith("周")){const weekday=new Date(`${today}T12:00:00Z`).getUTCDay();const target="日一二三四五六".indexOf(day.slice(1).replace("天","日"));offset=(target-weekday+7)%7;}
 let date=shiftCalendarDate(today,offset);
 let startsAt=wallTimeToIso(`${date}T${String(hour).padStart(2,"0")}:${String(minute).padStart(2,"0")}`,timezone);
 if(day.startsWith("周")&&Date.parse(startsAt)<=Date.parse(now)){date=shiftCalendarDate(date,7);startsAt=wallTimeToIso(`${date}T${String(hour).padStart(2,"0")}:${String(minute).padStart(2,"0")}`,timezone);}
 return {kind:"calendar",subject,startsAt,endsAt:new Date(Date.parse(startsAt)+duration*60000).toISOString(),timezone};
}
