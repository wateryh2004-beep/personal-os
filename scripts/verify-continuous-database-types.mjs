/* Whole unpublished task scope. Official artifact provenance is checked only in CLI mode. */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import scope from "./continuous-type-scope.cjs";
const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const keyOf = (node, source) => ts.isStringLiteral(node) ? node.text : node.getText(source);
export function document(text, filename = "types.ts") {
  const enumRefs = new Set();
  const source = ts.createSourceFile(filename, text, ts.ScriptTarget.Latest, true);
  assert.equal(source.parseDiagnostics.length, 0, "TypeScript artifact parse errors");
  const database = source.statements.find(node => ts.isTypeAliasDeclaration(node) && node.name.text === "Database");
  assert.ok(database && ts.isTypeLiteralNode(database.type), "Generated Database alias missing");
  function property(node, name) {
    node = resolve(node);
    assert.ok(ts.isTypeLiteralNode(node), `Expected object for ${name}`);
    const member = node.members.find(member => member.name && keyOf(member.name, source) === name);
    assert.ok(member?.type, `Missing generated member ${name}`); return member.type;
  }
  function resolve(node) {
    if (ts.isParenthesizedTypeNode(node)) return resolve(node.type);
    if (ts.isIndexedAccessTypeNode(node)) {
      const keys = []; let current = node;
      while (ts.isIndexedAccessTypeNode(current)) { assert.ok(ts.isLiteralTypeNode(current.indexType) && ts.isStringLiteral(current.indexType.literal), "Only literal Database indexed aliases supported"); keys.unshift(current.indexType.literal.text); current = current.objectType; }
      assert.ok(ts.isTypeReferenceNode(current) && current.typeName.getText(source) === "Database", "Unknown indexed alias");
      if (keys[0] === "public" && keys[1] === "Enums") enumRefs.add(keys[2]);
      return keys.reduce((value, key) => property(value, key), database.type);
    }
    return node;
  }
  function normal(node) {
    node = resolve(node);
    if (ts.isTypeLiteralNode(node)) return { object: entries(node) };
    if (ts.isUnionTypeNode(node)) {
      let values = node.types.flatMap(member => { const value = normal(member); return value && value.union ? value.union : [value]; });
      if (values.includes("Json")) values = values.filter(value => value !== "null");
      values = [...new Map(values.map(value => [JSON.stringify(value), value])).values()].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
      return values.length === 1 ? values[0] : { union: values };
    }
    if (ts.isArrayTypeNode(node)) return { array: normal(node.elementType) };
    if (ts.isTupleTypeNode(node)) return { tuple: node.elements.map(normal) };
    if (ts.isLiteralTypeNode(node)) return ts.isStringLiteral(node.literal) ? { literal: node.literal.text } : node.literal.getText(source);
    if (ts.isTypeReferenceNode(node) && node.typeName.getText(source) === "Json") return "Json";
    return node.getText(source).replace(/\s+/g, "");
  }
  function entries(node) {
    node = resolve(node); assert.ok(ts.isTypeLiteralNode(node), "Expected literal members");
    return Object.fromEntries(node.members.map(member => { assert.ok(ts.isPropertySignature(member) && member.type && member.name, "Only declared properties supported"); return [keyOf(member.name, source), { optional: !!member.questionToken, type: normal(member.type) }]; }).sort(([a], [b]) => a.localeCompare(b)));
  }
  const publicSchema = property(database.type, "public");
  const nullable = node => { node = resolve(node); return ts.isUnionTypeNode(node) && node.types.some(type => ts.isLiteralTypeNode(type) && type.literal.kind === ts.SyntaxKind.NullKeyword); };
  return { source, enumRefs, property, normal, entries, resolve, nullable, tables: property(publicSchema, "Tables"), functions: property(publicSchema, "Functions") };
}
const hasNull = value => value === "null" || !!value?.union?.includes("null");
const withoutNull = value => !value?.union ? value : value.union.length === 2 ? value.union.find(member => member !== "null") : { union: value.union.filter(member => member !== "null") };
function relationshipRows(doc, table) {
  const rows = doc.resolve(doc.property(doc.property(doc.tables, table), "Relationships"));
  assert.ok(ts.isTupleTypeNode(rows), `${table}.Relationships must be a tuple`);
  return rows.elements.map(row => {
    const fields = doc.entries(row); assert.deepEqual(Object.keys(fields).sort(), ["columns", "foreignKeyName", "isOneToOne", "referencedColumns", "referencedRelation"].sort(), `${table}.Relationship keys`);
    return { foreignKeyName: fields.foreignKeyName.type.literal, columns: fields.columns.type.tuple.map(value => value.literal), isOneToOne: fields.isOneToOne.type === "true", referencedRelation: fields.referencedRelation.type.literal, referencedColumns: fields.referencedColumns.type.tuple.map(value => value.literal) };
  }).sort((a, b) => a.foreignKeyName.localeCompare(b.foreignKeyName) || a.referencedRelation.localeCompare(b.referencedRelation));
}
export function verifyDocuments(actualText, candidateText, catalog) {
  const actual = document(actualText), candidate = document(candidateText); let checked = 0;
  const tables = { ...Object.fromEntries(scope.fullTables.map(table => [table, null])), ...scope.changedColumns };
  for (const [table, fields] of Object.entries(tables)) for (const shape of ["Row", "Insert", "Update"]) {
    const a = actual.entries(actual.property(actual.property(actual.tables, table), shape)), c = candidate.entries(candidate.property(candidate.property(candidate.tables, table), shape)), names = fields ?? Object.keys(a);
    if (fields === null) assert.deepEqual(Object.keys(c), Object.keys(a), `${table}.${shape} column inventory`);
    for (const field of names) { if (shape === "Row") assert.equal(candidate.nullable(candidate.property(candidate.property(candidate.property(candidate.tables, table), shape), field)), actual.nullable(actual.property(actual.property(actual.property(actual.tables, table), shape), field)), `${table}.${shape}.${field} explicit nullability`); assert.deepEqual(c[field], a[field], `${table}.${shape}.${field}`); checked++; }
  }
  for (const table of [...scope.fullTables, ...Object.keys(scope.changedRelationships)]) {
    let a = relationshipRows(actual, table), c = relationshipRows(candidate, table);
    const names = scope.changedRelationships[table]; if (names) { a = a.filter(row => names.includes(row.foreignKeyName)); c = c.filter(row => names.includes(row.foreignKeyName)); assert.equal(a.length, names.length, `${table} actual task-owned FK inventory`); assert.equal(c.length, names.length, `${table} candidate task-owned FK inventory`); }
    assert.deepEqual(c, a, `${table}.Relationships`); checked += a.length;
  }
  for (const name of scope.functions) {
    const a = actual.property(actual.functions, name), c = candidate.property(candidate.functions, name), argsA = actual.entries(actual.property(a, "Args")), argsC = candidate.entries(candidate.property(c, "Args"));
    for (const key of scope.nullableArguments[name] ?? []) { assert.ok(argsC[key] && hasNull(argsC[key].type), `${name}.${key} application nullable contract missing`); argsC[key] = { ...argsC[key], type: withoutNull(argsC[key].type) }; }
    assert.deepEqual(argsC, argsA, name + ".Args");
    assert.deepEqual(candidate.normal(candidate.property(c, "Returns")), actual.normal(actual.property(a, "Returns")), name + ".Returns");
    if (scope.compositeFunctions[name]) assert.deepEqual(candidate.normal(candidate.property(c, "SetofOptions")), actual.normal(actual.property(a, "SetofOptions")), name + ".SetofOptions"); checked++;
  }
  if (catalog) {
    for (const [table, fields] of Object.entries(tables)) {
      const tableNode = candidate.property(candidate.tables, table), row = candidate.entries(candidate.property(tableNode, "Row")), insert = candidate.entries(candidate.property(tableNode, "Insert"));
      const columns = catalog.columns.filter(column => column.table === table && (fields === null || fields.includes(column.column)));
      assert.equal(columns.length, fields?.length ?? Object.keys(row).length, `${table} actual catalog columns`);
      for (const column of columns) { assert.equal(candidate.nullable(candidate.property(candidate.property(tableNode, "Row"), column.column)), column.nullable, `${table}.${column.column} catalog nullability`); assert.equal(insert[column.column].optional, column.nullable || column.default !== null || !!column.identity || !!column.generated, `${table}.${column.column} catalog default/optional`); checked += 2; }
    }
    for (const table of [...scope.fullTables, ...Object.keys(scope.changedRelationships)]) {
      let rows = relationshipRows(candidate, table), keys = catalog.foreignKeys.filter(key => key.table === table && key.referencedSchema === "public");
      const names = scope.changedRelationships[table]; if (names) { rows = rows.filter(row => names.includes(row.foreignKeyName)); keys = keys.filter(key => names.includes(key.name)); }
      assert.deepEqual(rows.map(({ foreignKeyName, columns, referencedRelation, referencedColumns }) => ({ name: foreignKeyName, columns, referencedRelation, referencedColumns })), keys.map(({ name, columns, referencedRelation, referencedColumns }) => ({ name, columns, referencedRelation, referencedColumns })).sort((a, b) => a.name.localeCompare(b.name)), `${table} native composite FK catalog`);
    }
    for (const name of scope.functions) {
      const functions = catalog.functions.filter(fn => fn.name === name); assert.equal(functions.length, 1, `${name} unambiguous native RPC`);
      const args = candidate.entries(candidate.property(candidate.property(candidate.functions, name), "Args"));
      assert.deepEqual(Object.keys(args), functions[0].inputArguments.map(arg => arg.name).sort(), `${name} native args inventory`);
      for (const arg of functions[0].inputArguments) assert.equal(args[arg.name].optional, arg.hasDefault, `${name}.${arg.name} native default`);
    }
    for (const [name, result] of Object.entries(scope.baselineFunctions)) {
      const fn = catalog.functions.find(row => row.name === name);
      assert.equal(fn.securityDefiner, false, name + " native invoker boundary");
      assert.equal(fn.result, result, name + " native scalar return");
      assert.ok(fn.config?.some(value => value === 'search_path=""' || value === "search_path=public"), name + " bounded search path");
      assert.ok(fn.acl?.some(value => /^authenticated=[^/]*X/.test(value)), name + " authenticated execute grant");
      assert.ok(!fn.acl?.some(value => /^(?:anon)?=[^/]*X/.test(value)), name + " anonymous execute denied");
    }
    const projectTrigger = catalog.functions.filter(fn => fn.name === "sync_project_search_document");
    assert.equal(projectTrigger.length, 1, "Project projection trigger function catalog");
    assert.equal(projectTrigger[0].result, "trigger", "Project projection trigger return");
    assert.equal(projectTrigger[0].securityDefiner, false, "Project projection invoker boundary");
    assert.ok(catalog.triggers.some(row => row.table === "projects" && row.name === "projects_search_sync" && row.function === "sync_project_search_document" && row.enabled === "O" && /AFTER INSERT OR DELETE OR UPDATE|AFTER INSERT OR UPDATE OR DELETE/.test(row.definition)), "Project projection trigger catalog binding");
    const trigger = catalog.functions.filter(fn => fn.name === "protect_note_source_version"); assert.equal(trigger.length, 1); assert.equal(trigger[0].result, "trigger"); assert.equal(trigger[0].securityDefiner, false);
    assert.ok(catalog.triggers.some(row => row.table === "note_versions" && row.name === "protect_note_source_version" && row.function === "protect_note_source_version" && /BEFORE DELETE OR UPDATE|BEFORE UPDATE OR DELETE/.test(row.definition)), "Immutable source trigger catalog binding");
  }
  return { candidateFieldsAndFunctionsChecked: checked, verifiedScope: { fullTables: scope.fullTables, changedColumns: scope.changedColumns, foreignKeyTables: [...scope.fullTables, ...Object.keys(scope.changedRelationships)], enumDefinitionsResolved: [...new Set([...candidate.enumRefs, ...actual.enumRefs])].sort(), rpcNames: scope.functions, scalarNullableArgumentExceptions: scope.nullableArguments, triggerNames: catalog ? ["note_versions.protect_note_source_version", "projects.projects_search_sync"] : [] }, catalogCompared: !!catalog };
}
export function runCli(argv = process.argv.slice(2)) {
  const actualPath = path.resolve(argv[0] || ""), synthetic = argv.includes("--synthetic-ast-probe");
  assert.ok(actualPath.startsWith(path.join(root, "test-results", "continuous-workflows-postgres") + path.sep), "Only isolated generator/probe artifacts are accepted");
  let catalog;
  if (!synthetic) {
    const runtime = JSON.parse(fs.readFileSync(path.join(path.dirname(actualPath), "typegen-runtime.json"), "utf8"));
    assert.equal(runtime.generator, "supabase/postgres-meta:v0.96.4"); assert.equal(runtime.databaseNetwork, "none"); assert.equal(runtime.hostPorts, false); assert.equal(runtime.productionAccess, false); assert.ok(/^container:personal-os-rehearsal-[0-9a-f]{32}$/.test(runtime.network));
    const hash = bytes => createHash("sha256").update(bytes).digest("hex");
    assert.match(runtime.imageId, /^sha256:[a-f0-9]{64}$/); assert.ok(runtime.repoDigests.some(value => /^supabase\/postgres-meta@sha256:[a-f0-9]{64}$/.test(value)), "Official generator pulled image digest required");
    assert.equal(runtime.actualCheckoutSha, execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(), "Actual generator checkout SHA");
    const migrations = fs.readdirSync(path.join(root, "supabase/migrations")).filter(name => name.endsWith(".sql")).sort();
    assert.deepEqual(runtime.migrations, migrations.map(name => ({ name, sha256: hash(fs.readFileSync(path.join(root, "supabase/migrations", name))) })), "Exact generated migration bytes");
    assert.equal(runtime.generatedTypesSha256, hash(fs.readFileSync(actualPath)), "Official type artifact bytes");
    assert.equal(runtime.catalogSha256, hash(fs.readFileSync(path.join(path.dirname(actualPath), "actual-schema-catalog.json"))), "Native catalog artifact bytes");
    catalog = JSON.parse(fs.readFileSync(path.join(path.dirname(actualPath), "actual-schema-catalog.json"), "utf8")); assert.ok(Array.isArray(catalog.foreignKeys) && Array.isArray(catalog.triggers), "Complete native catalog required");
  }
  const result = verifyDocuments(fs.readFileSync(actualPath, "utf8"), fs.readFileSync(path.join(root, "src/types/database.ts"), "utf8"), catalog);
  console.log(JSON.stringify({ status: synthetic ? "synthetic-type-probe-passed" : "verified", artifact: path.relative(root, actualPath), ...result, generationIsActual: !synthetic, syntheticOnly: synthetic, candidateWasReplaced: false, productionAccess: false }, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) runCli();
