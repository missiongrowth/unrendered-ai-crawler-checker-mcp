export interface CardSegment {
  color: string;
  share: number;
  striped: boolean;
}

export interface CardInput {
  url: string;
  eyebrow: string;
  mainPercent: string;
  heroLine: string;
  segments: CardSegment[];
  mainWords: string;
  onlyRendered: string;
  onlyRenderedColor: string;
  missing: string[];
  screenshot: CanvasImageSource | null;
  footer: string;
}

export const CARD_WIDTH = 1200;
export const CARD_HEIGHT = 630;

const SANS = "Geist, sans-serif";
const MONO = "'Geist Mono', monospace";
const BG = "oklch(0.14 0 0)";
const BORDER = "oklch(0.26 0 0)";
const FG = "oklch(1 0 0)";
const MUTED = "oklch(0.72 0 0)";
const PAD = 48;
const TEXT_WIDTH = 640;
const SCREENSHOT_X = 736;
const BAR_HEIGHT = 12;

/** Canvas text does not wait for web fonts: load every face the card uses before drawing. */
const loadCardFonts = (): Promise<unknown> =>
  Promise.all([document.fonts.load(`700 24px ${SANS}`), document.fonts.load(`500 24px ${SANS}`), document.fonts.load(`600 24px ${SANS}`), document.fonts.load(`400 24px ${MONO}`), document.fonts.load(`500 24px ${MONO}`)]);

function fit(ctx: CanvasRenderingContext2D, text: string, width: number): string {
  if (ctx.measureText(text).width <= width) return text;
  let end = text.length;
  while (end > 1 && ctx.measureText(`${text.slice(0, end)}…`).width > width) end -= 1;
  return `${text.slice(0, end)}…`;
}

function text(ctx: CanvasRenderingContext2D, value: string, x: number, y: number, font: string, color: string): void {
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.fillText(fit(ctx, value, TEXT_WIDTH), x, y);
}

function stripes(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.strokeStyle = "oklch(1 0 0 / 0.6)";
  ctx.lineWidth = 2;
  for (let sx = x - h; sx < x + w; sx += 6) {
    ctx.beginPath();
    ctx.moveTo(sx, y + h);
    ctx.lineTo(sx + h, y);
    ctx.stroke();
  }
  ctx.restore();
}

function drawBar(ctx: CanvasRenderingContext2D, segments: readonly CardSegment[], y: number): void {
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(PAD, y, TEXT_WIDTH, BAR_HEIGHT, 6);
  ctx.clip();
  ctx.fillStyle = BORDER;
  ctx.fillRect(PAD, y, TEXT_WIDTH, BAR_HEIGHT);
  let x = PAD;
  for (const seg of segments) {
    const w = seg.share * TEXT_WIDTH;
    if (w < 0.5) continue;
    ctx.fillStyle = seg.color;
    ctx.fillRect(x, y, w, BAR_HEIGHT);
    if (seg.striped) stripes(ctx, x, y, w, BAR_HEIGHT);
    x += w;
  }
  ctx.restore();
}

function drawScreenshot(ctx: CanvasRenderingContext2D, image: CanvasImageSource, width: number, height: number): void {
  const x = SCREENSHOT_X;
  const y = PAD;
  const w = CARD_WIDTH - PAD - x;
  const h = CARD_HEIGHT - 2 * PAD;
  const scale = Math.max(w / width, h / height);
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 8);
  ctx.clip();
  ctx.drawImage(image, x + (w - width * scale) / 2, y, width * scale, height * scale);
  ctx.restore();
  ctx.strokeStyle = BORDER;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 8);
  ctx.stroke();
}

export async function drawCard(canvas: HTMLCanvasElement, input: CardInput, screenshotSize: { width: number; height: number } | null): Promise<void> {
  await loadCardFonts();
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is not available.");
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);
  ctx.textBaseline = "alphabetic";
  ctx.letterSpacing = "1px";
  text(ctx, input.eyebrow, PAD, 80, `500 18px ${MONO}`, MUTED);
  ctx.letterSpacing = "0px";
  text(ctx, input.url, PAD, 120, `400 22px ${MONO}`, FG);
  text(ctx, input.mainPercent, PAD, 262, `700 128px ${SANS}`, FG);
  text(ctx, input.heroLine, PAD, 310, `500 26px ${SANS}`, FG);
  drawBar(ctx, input.segments, 336);
  text(ctx, input.mainWords, PAD, 386, `400 20px ${MONO}`, MUTED);
  text(ctx, input.onlyRendered, PAD, 436, `600 28px ${SANS}`, input.onlyRenderedColor);
  input.missing.forEach((line, i) => {
    text(ctx, line, PAD, 478 + i * 28, `400 18px ${MONO}`, MUTED);
  });
  text(ctx, input.footer, PAD, CARD_HEIGHT - 36, `400 20px ${SANS}`, MUTED);
  if (input.screenshot && screenshotSize) drawScreenshot(ctx, input.screenshot, screenshotSize.width, screenshotSize.height);
}
