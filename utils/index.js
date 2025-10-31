export const getId = (entityOrId) => {
  if (!entityOrId) return null;
  if (typeof entityOrId === 'bigint' || typeof entityOrId === 'number')
    return entityOrId.toString();
  if (entityOrId.value !== undefined) return entityOrId.value.toString();
  if (entityOrId.id) return getId(entityOrId.id);
  return String(entityOrId);
};
