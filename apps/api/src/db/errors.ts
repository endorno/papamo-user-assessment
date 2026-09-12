function errorMessages(error: unknown): string[] {
  const messages: string[] = [];
  let current = error;

  for (let depth = 0; depth < 4 && current; depth += 1) {
    if (current instanceof Error) {
      messages.push(current.message);
      current = current.cause;
      continue;
    }
    break;
  }

  return messages;
}

export function isUniqueConstraintError(error: unknown): boolean {
  return errorMessages(error).some((message) => (
    message.includes('UNIQUE constraint failed')
    || message.includes('SQLITE_CONSTRAINT_UNIQUE')
    || message.includes('SQLITE_CONSTRAINT_PRIMARYKEY')
  ));
}

export function isForeignKeyConstraintError(error: unknown): boolean {
  return errorMessages(error).some((message) => (
    message.includes('FOREIGN KEY constraint failed')
    || message.includes('SQLITE_CONSTRAINT_FOREIGNKEY')
  ));
}
