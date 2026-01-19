import {type Browser, chromium} from 'playwright';
import {consola} from 'consola';

const DEFAULT_UA =
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

let browserPromise: Promise<Browser> | null = null;
let didRegisterCloseHook = false;

export async function closeBrowser(): Promise<void> {
    if (!browserPromise) return;
    try {
        const browser = await browserPromise;
        await browser.close();
    } finally {
        browserPromise = null;
        didRegisterCloseHook = false;
    }
}

async function getBrowser(): Promise<Browser> {
    if (!browserPromise) {
        browserPromise = chromium.launch({
            headless: true,
            args: [
                // 在 GitHub Actions / Linux 上更稳；在本地也不会造成影响
                '--no-sandbox',
                '--disable-setuid-sandbox',
            ],
        });
    }

    const browser = await browserPromise;

    if (!didRegisterCloseHook) {
        didRegisterCloseHook = true;
        process.once('beforeExit', () => {
            void browser.close().catch(() => undefined);
        });
        process.once('SIGINT', () => {
            void browser.close().catch(() => undefined);
            process.exit(130);
        });
        process.once('SIGTERM', () => {
            void browser.close().catch(() => undefined);
            process.exit(143);
        });
    }

    return browser;
}

function sleep(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
}

function looksLikeCaptcha(html: string): boolean {
    return /验证码|验证你的身份|sec\.douban\.com|异常请求|禁止访问/.test(html);
}

export async function fetchHtmlWithBrowser(url: string): Promise<string> {
    const browser = await getBrowser();

    const cookieHeader = process.env.DOUBAN_COOKIE;

    const maxAttempts = 3;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        const context = await browser.newContext({
            userAgent: process.env.DOUBAN_UA || DEFAULT_UA,
            locale: 'zh-CN',
            extraHTTPHeaders: {
                'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
                ...(cookieHeader ? {Cookie: cookieHeader} : {}),
            },
        });

        const page = await context.newPage();

        try {
            await page.goto(url, {
                waitUntil: 'domcontentloaded',
                timeout: 30_000,
            });

            // Douban 详情页主体通常在 #info/#content；尽量小等待，避免无意义拉长。
            await page.waitForSelector('#info', {timeout: 10_000}).catch(() => undefined);

            const html = await page.content();
            if (looksLikeCaptcha(html)) {
                throw new Error(
                    'Douban returned a verification/captcha page. Consider setting DOUBAN_COOKIE (and optionally DOUBAN_UA).',
                );
            }
            return html;
        } catch (error) {
            if (attempt >= maxAttempts) {
                throw error;
            }
            consola.warn(`fetchHtmlWithBrowser failed (attempt ${attempt}/${maxAttempts}): ${String(error)}`);
            await sleep(800 * attempt);
        } finally {
            await page.close().catch(() => undefined);
            await context.close().catch(() => undefined);
        }
    }

    throw new Error('Unreachable');
}
