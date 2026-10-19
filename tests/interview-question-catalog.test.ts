import { expect, it } from "vitest";
import { catalogFilters, catalogUrl, filterQuestionCatalog, type QuestionCatalogRow } from "@/features/interview/question-catalog";
import { emptyLibraryFilters } from "@/features/interview/workspace-library";
const rows: QuestionCatalogRow[] = [
  {id:"q1",prompt:"Explain ＳＱＬ window functions",shortTitle:"Window functions",category:"knowledge",style:"stress",subcategory:"技术面 · 数据分析",preparationCount:2},
  {id:"q2",prompt:"Tell a story",shortTitle:null,category:"behavioral",style:"standard",subcategory:null,preparationCount:0},
];
it("combines independent filters and normalizes multi-term metadata search",()=>{
  expect(filterQuestionCatalog(rows,{...emptyLibraryFilters,q:"sql 数据分析",domain:"数据分析",category:"knowledge",style:"stress"})).toEqual([rows[0]]);
  expect(filterQuestionCatalog(rows,{...emptyLibraryFilters,q:"sql",style:"standard"})).toEqual([]);
  expect(filterQuestionCatalog(rows,{...emptyLibraryFilters,domain:"未分类"})).toEqual([rows[1]]);
});
it("preserves the space while composing a multi-word query and restores all URL facets",()=>{
  const filters={q:"sql ",domain:"数据分析",category:"knowledge",style:"stress"};
  const url=new URL(catalogUrl(filters),"https://example.test");
  expect(catalogFilters(url.searchParams)).toEqual(filters);
  expect(catalogUrl(emptyLibraryFilters)).toBe("/career/interview/questions");
});
it("uses the first repeated parameter and normalizes invalid legacy types",()=>{
  expect(catalogFilters(new URLSearchParams("category=stress&category=knowledge&q=one&q=two"))).toMatchObject({category:"all",style:"stress",q:"one"});
});

it("keeps legacy competency-tag matches discoverable in the metadata catalog",()=>{
  expect(filterQuestionCatalog([{...rows[0],competencyTags:["风险识别"]}],{...emptyLibraryFilters,q:"风险识别"})).toHaveLength(1);
});
