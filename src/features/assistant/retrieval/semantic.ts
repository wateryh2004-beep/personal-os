import type { SearchDomain } from "@/features/search/types";

export type SemanticSearchRequest = {
  query: string;
  domains: SearchDomain[];
  limit: number;
};

export type SemanticSearchHit = {
  entityType: string;
  entityId: string;
  title: string;
  excerpt: string;
  score: number;
  href: string;
};

/**
 * Provider-neutral boundary. A future pgvector/embedding implementation can be
 * registered here without coupling the cognitive router to one vendor.
 */
export interface SemanticRetriever {
  readonly provider: string;
  isAvailable(): Promise<boolean>;
  search(request: SemanticSearchRequest): Promise<SemanticSearchHit[]>;
}

let registeredRetriever: SemanticRetriever | null = null;

export function registerSemanticRetriever(retriever: SemanticRetriever | null) {
  registeredRetriever = retriever;
}

export function getSemanticRetriever() {
  return registeredRetriever;
}
