"use client";
import{createContext,useContext,type ReactNode}from"react";
import{assertContinuousFixtureTransport}from"@/features/testing/continuous-fixture-gate";
export type ReadingVerificationTransport={read:typeof import("./reading-progress-actions").getReadingProgress;save:typeof import("./reading-progress-actions").saveReadingProgress};
const Context=createContext<ReadingVerificationTransport|undefined>(undefined);
export function ReadingVerificationProvider({transport,children}:{transport?:ReadingVerificationTransport;children:ReactNode}){assertContinuousFixtureTransport(transport);return <Context.Provider value={transport}>{children}</Context.Provider>;}
export function useReadingVerificationTransport(){const transport=useContext(Context);assertContinuousFixtureTransport(transport);return transport;}
