import { askMiddleware } from './askHandler.mjs';
import { describeConfig } from './env.mjs';

/**
 * Mounts the AskMySchool API inside Vite's dev and preview servers, so
 * the Gemini key stays in the Node process and never reaches the
 * browser bundle. Nothing in this file is importable from src/.
 */
export function askMySchoolApi() {
  let announced = false;

  const announce = () => {
    if (announced) return;
    announced = true;
    const { geminiConfigured, webSearchEnabled, model } = describeConfig();
    if (!geminiConfigured) {
      console.info(
        '[askmyschool] GEMINI_API_KEY not set — school-data answers work, AI and web search are disabled. See .env.example.',
      );
      return;
    }
    console.info(
      `[askmyschool] Gemini ready (model ${model}), grounded web search ${webSearchEnabled ? 'on' : 'off'}.`,
    );
  };

  return {
    name: 'schoolmind:askmyschool-api',
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
