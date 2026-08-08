import { z } from "zod";
export const searchDomains = ["notes","career","files","tasks","calendar"] as const;
export const searchInputSchema = z.object({ query:z.string().trim().max(200), domains:z.array(z.enum(searchDomains)).optional(), limit:z.number().int().min(1).max(50).default(30) });
export type SearchDomain=(typeof searchDomains)[number]; export type GlobalSearchResult={ id:string;domain:SearchDomain;entityType:string;entityId:string;title:string;subtitle:string|null;snippet:string|null;href:string;score:number;sourceUpdatedAt:string|null;metadata:Record<string,unknown> };
