// PDF menus → text (unpdf / pdf.js). Image-only PDFs yield '' (menu then reported as unavailable).
import { extractText } from 'unpdf';

export async function pdfText(bytes: Uint8Array): Promise<string> {
  try {
    const { text } = await extractText(new Uint8Array(bytes), { mergePages: true });
    return text
      .replace(/[ \t]+/g, ' ')
      .replace(/\s*\n\s*/g, '\n')
      .trim();
  } catch {
    return '';
  }
}
