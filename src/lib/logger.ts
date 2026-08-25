// src/lib/logger.ts

export function logError(context: string, error: unknown) {
  const timestamp = new Date().toISOString();
  const errorMessage = error instanceof Error ? error.message : String(error);
  const errorStack = error instanceof Error ? error.stack : undefined;

  console.error(`[${timestamp}] [ERROR] [${context}]:`, errorMessage);
  if (errorStack) {
    console.error(errorStack);
  }
}

export function logInfo(context: string, message: string, data?: any) {
  const timestamp = new Date().toISOString();
  if (data) {
    console.log(`[${timestamp}] [INFO] [${context}]:`, message, data);
  } else {
    console.log(`[${timestamp}] [INFO] [${context}]:`, message);
  }
}