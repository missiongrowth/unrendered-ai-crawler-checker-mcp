export interface CardInput {
  url: string;
  mainPercent: string;
  mainWords: string;
  wordsOnlyAfterJs: number;
  missing: string[];
  screenshot: CanvasImageSource | null;
  footer: string;
}

export const CARD_WIDTH = 1200;
export const CARD_HEIGHT = 630;

const FONT = "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";
const PAD = 48;
const TEXT_WIDTH = 640;

function fit(ctx: CanvasRenderingContext2D, text: string, width: number): string {
  if (ctx.measureText(text).width <= width) return text;
  let end = text.length;
  while (end > 1 && ctx.measureText(`${text.slice(0, end)}…`).width > width) end -= 1;
  return `${text.slice(0, end)}…`;
}

function text(ctx: CanvasRenderingContext2D, value: string, x: number, y: number, size: number, weight: number, color: string): void {
  ctx.font = `${weight} ${size}px ${FONT}`;
  ctx.fillStyle = color;
  ctx.fillText(fit(ctx, value, TEXT_WIDTH), x, y);
}

function drawScreenshot(ctx: CanvasRenderingContext2D, image: CanvasImageSource, width: number, height: number): void {
  const x = 736;
  const y = PAD;
  const w = CARD_WIDTH - PAD - x;
  const h = CARD_HEIGHT - 2 * PAD;
  const scale = Math.max(w / width, h / height);
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 12);
  ctx.clip();
  ctx.drawImage(image, x + (w - width * scale) / 2, y, width * scale, height * scale);
  ctx.restore();
  ctx.strokeStyle = "#3a3f46";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 12);
  ctx.stroke();
}

export function drawCard(canvas: HTMLCanvasElement, input: CardInput, screenshotSize: { width: number; height: number } | null): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is not available.");
  ctx.fillStyle = "#14161a";
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);
  ctx.textBaseline = "alphabetic";
  text(ctx, "SERVER HTML VS RENDERED PAGE", PAD, 80, 20, 700, "#9aa4af");
  text(ctx, input.url, PAD, 118, 24, 400, "#e6e8eb");
  text(ctx, input.mainPercent, PAD, 250, 128, 800, "#56B4E9");
  text(ctx, "of the main content is in the server HTML", PAD, 296, 28, 600, "#e6e8eb");
  text(ctx, input.mainWords, PAD, 328, 20, 400, "#9aa4af");
  text(ctx, `${input.wordsOnlyAfterJs} words only appear after JavaScript`, PAD, 388, 28, 600, "#D55E00");
  input.missing.forEach((line, i) => {
    text(ctx, `• ${line}`, PAD, 440 + i * 36, 22, 400, "#e6e8eb");
  });
  text(ctx, input.footer, PAD, CARD_HEIGHT - PAD, 20, 400, "#9aa4af");
  if (input.screenshot && screenshotSize) drawScreenshot(ctx, input.screenshot, screenshotSize.width, screenshotSize.height);
}
