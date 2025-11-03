import { existsSync, readFileSync } from 'node:fs';

export const getId = entityOrId => {
  if (!entityOrId) return null;
  if (typeof entityOrId === 'bigint' || typeof entityOrId === 'number')
    return entityOrId.toString();
  if (entityOrId.value !== undefined) return entityOrId.value.toString();
  if (entityOrId.id) return getId(entityOrId.id);
  return String(entityOrId);
};

export const sleep = ms => {
  return new Promise(resolve => setTimeout(resolve, ms));
};

export const safeReadJson = (filePath, fallback = {}) => {
  if (!existsSync(filePath)) return fallback;
  try {
    const content = readFileSync(filePath, 'utf8').trim();
    return content ? JSON.parse(content) : fallback;
  } catch {
    return fallback;
  }
};
