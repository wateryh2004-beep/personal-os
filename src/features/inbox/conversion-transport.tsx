"use client";
import {createContext,useContext,type ReactNode} from "react";
import {assertContinuousFixtureTransport} from "@/features/testing/continuous-fixture-gate";
export type InboxConversionTransport={
 taskCreate:typeof import("@/features/tasks/microsoft-todo").createMicrosoftTodoTaskAction;
 taskRead:typeof import("@/features/tasks/microsoft-todo").readMicrosoftTodoCreationAction;
 calendarCreate:typeof import("@/features/calendar/actions").createCalendarEvent;
 calendarRead:typeof import("@/features/calendar/actions").readCalendarCreationIntent;
 noteCreate:typeof import("./actions").convertInboxToNote;
 dailyCreate:typeof import("./actions").convertInboxToDailyNote;
 projectCreate:typeof import("./actions").convertInboxToProject;
 linkCreate:typeof import("./actions").convertInboxToLink;
 conversionRead:typeof import("./actions").readInboxConversionIntent;
 projectChoices:typeof import("./actions").readInboxProjectChoices;
};
const Context=createContext<InboxConversionTransport|undefined>(undefined);
export function InboxConversionProvider({transport,children}:{transport?:InboxConversionTransport;children:ReactNode}){assertContinuousFixtureTransport(transport);return <Context.Provider value={transport}>{children}</Context.Provider>;}
export function useInboxConversionTransport(){const value=useContext(Context);assertContinuousFixtureTransport(value);return value;}
