import fs from 'fs';
import path from 'path';

export function writeDebugLog(action: string, errorDetails: any) {
  try {
    // प्रोजेक्ट के मेन फोल्डर में 'debug.log' फ़ाइल बनेगी
    const logFilePath = path.join(process.cwd(), 'debug.log');
    
    let errorString = '';
    if (errorDetails instanceof Error) {
      errorString = `${errorDetails.message}\nStack: ${errorDetails.stack}`;
    } else if (typeof errorDetails === 'object') {
      errorString = JSON.stringify(errorDetails, null, 2);
    } else {
      errorString = String(errorDetails);
    }

    const logEntry = `\n----------------------------------------\n[Time: ${new Date().toISOString()}]\nAction: ${action}\nError/Data:\n${errorString}\n`;

    fs.appendFileSync(logFilePath, logEntry, 'utf8');
  } catch (err) {
    console.error('Failed to write log file:', err);
  }
}