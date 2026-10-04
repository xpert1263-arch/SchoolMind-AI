import { askMiddleware } from './askHandler.mjs';
import { describeConfigForLog, hasTelegramToken } from './env.mjs';
import { describeProviders } from './ai/index.mjs';
import { startTelegramBridge } from './telegram.mjs';

/**
 * Mounts the SchoolMind API inside Vite's dev and preview servers, so
 * every secret — Gemini, Groq, the Telegram bot token — stays in the
 * Node process and never reaches the browser bundle. Nothing in this
 * file, or in anything it imports, is importable from src/.
 */
export function askMySchoolApi() {
  let announced = false;

  const announce = () => {
    if (announced) return;
    announced = true;

    const { aiConfigured, webSearchEnabled, geminiModel } = describeConfigForLog();

    void describeProviders().then((providers) => {
      /* Model names are fine here: this is a server log. */
      const model = geminiModel ? ` [${geminiModel}]` : '';
      console.info(`[schoolmind-ai] providers: ${providers}${model}`);
      if (!aiConfigured) {
        console.info(
          '[schoolmind-ai] no AI provider configured — school-data answers and SchoolMind fallbacks still work. See .env.example.',
        );
      }
      /* Deliberately phrased as "available", not "on": configuration
         is not success. A live answer is only ever claimed after a
         search has actually run and returned pages. */
      console.info(
        webSearchEnabled
          ? '[schoolmind-ai] live web search available (Gemini grounding, then Groq browser_search). A search must actually run before any answer is treated as current.'
          : '[schoolmind-ai] no live web search mechanism configured — current-information questions will be declined rather than guessed.',
      );
    });

    if (!hasTelegramToken) {
      console.info(
        '[schoolmind-telegram] TELEGRAM_BOT_TOKEN not set — Parent Connect stores records but cannot link or deliver. See .env.example.',
      );
      return;
    }
    /* One bridge per process, however many times Vite re-evaluates
       this module during hot reload. */
    void startTelegramBridge();
  };

  return {
    name: 'schoolmind:api',
    configureServer(server) {
      server.middlewares.use(askMiddleware);
      announce();
    },
    configurePreviewServer(server) {
      server.middlewares.use(askMiddleware);
      announce();
    },
  };
}
