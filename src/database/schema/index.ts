// `referenceSchema` is deliberately not re-exported: drizzle-kit emits CREATE SCHEMA for every
// exported pgSchema it finds here, and reference data belongs to another system.
export { appTable } from './schemas';
export * from './domain';
export * from './reference';
