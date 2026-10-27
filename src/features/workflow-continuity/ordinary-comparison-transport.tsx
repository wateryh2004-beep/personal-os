"use client";
import {createContext,useContext,type ReactNode} from "react";
import {assertContinuousFixtureTransport} from "@/features/testing/continuous-fixture-gate";
import {readOrdinaryDraftComparison} from "./ordinary-comparison";
export type OrdinaryComparisonTransport=typeof readOrdinaryDraftComparison;
const Context=createContext<OrdinaryComparisonTransport|undefined>(undefined);
export function OrdinaryComparisonProvider({read,children}:{read?:OrdinaryComparisonTransport;children:ReactNode}){assertContinuousFixtureTransport(read);return <Context.Provider value={read}>{children}</Context.Provider>;}
export function useOrdinaryComparisonTransport(){const read=useContext(Context);assertContinuousFixtureTransport(read);return read??readOrdinaryDraftComparison;}
