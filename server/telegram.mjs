import { config, hasTelegramToken } from './env.mjs';
import { readUpdateOffset, redeemToken, TokenResult, writeUpdateOffset } from './parentStore.mjs';

/* ------------------------------------------------------------------
   The Telegram bridge.

   WHY POLLING, NOT A WEBHOOK
   A webhook needs Telegram to reach this machine, which means a
   public HTTPS URL. The hackathon build runs on localhost, so the
   only way to get a webhook today is a tunnel — one more moving part
   that can be down ten minutes before a presentation. Long polling
   needs nothing but an outbound connection, and `getUpdates` is the
   same official Bot API.

   Moving to a webhook later is a small change: `handleUpdate` below
   is the whole of the logic, and a hosted build would call it from an
   HTTP route instead of from the loop.

   WHAT THIS FILE WILL NOT DO
   It never reports a connection that Telegram did not confirm. A
   parent is "connected" only after Telegram delivered a /start
   carrying a token this server issued, and the chat id written is the
   one Telegram reported. There is no path from a browser to a chat id.

   The bot token is read from the environment, sent in the request URL
   to Telegram and nowhere else. It is scrubbed out of every log line
   below, because an error message from the Bot API echoes the URL.
   ------------------------------------------------------------------ */

const API = 'https://api.telegram.org';
const LONG_POLL_SECONDS = 25;
/* A little longer than the long poll, so a healthy wait is not a
   timeout. */
const REQUEST_TIMEOUT_MS = (LONG_POLL_SECONDS + 10) * 1000;

/** Back-off after a failed poll: gentle at first, then patient. */
const BACKOFF_MS = [1000, 3000, 8000, 20_000, 60_000];

/* How long to wait out another consumer of the same bot, and how many
   times before concluding it is not going away. */
const CONFLICT_RETRY_MS = 15_000;
const CONFLICT_LIMIT = 20;

/* One bridge per Node process. Vite re-evaluates this module on hot
   reload, which would otherwise start a second loop — and two
   `getUpdates` consumers on one bot steal each other's updates. The
   guard lives on globalThis so a fresh module instance still finds
   the running one. */
const BRIDGE = Symbol.for('schoolmind.telegram.bridge');

function bridgeState() {
  if (!globalThis[BRIDGE]) {
    globalThis[BRIDGE] = {
      running: false,
      stopped: false,
      botUsername: null,
      lastErrorCode: null,
      consecutiveFailures: 0,
      conflicts: 0,
      startedAt: null,
    };
  }
  return globalThis[BRIDGE];
}

/** Removes the bot token from anything about to be logged. */
function scrub(text) {
  const token = config.telegramBotToken;
  let out = String(text ?? '').slice(0, 300);
  if (token) out = out.split(token).join('***');
  return out.replace(/bot\d+:[\w-]+/gi, 'bot***');
}

function logTelegram(message) {
  console.info(`[schoolmind-telegram] ${scrub(message)}`);
}

function logTelegramError(label, error) {
  const detail = error?.status ? `${label} (status ${error.status})` : label;
  console.error(`[schoolmind-telegram] ${scrub(detail)}: ${scrub(error?.message ?? 'failed')}`);
}

/** One Bot API call. Throws an error carrying `.status` so the caller
 *  can tell a bad token from a blip. */
async function callApi(method, body, { timeoutMs = 15_000 } = {}) {
  if (!hasTelegramToken) {
    const error = new Error('telegram_not_configured');
    error.status = 503;
    throw error;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${API}/bot${config.telegramBotToken}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body ?? {}),
      signal: controller.signal,
    });

    let payload = null;
    try {
      payload = await response.json();
    } catch {
      /* A gateway error can arrive as HTML. */
    }

    if (!response.ok || payload?.ok !== true) {
      const error = new Error(payload?.description ?? `telegram_http_${response.status}`);
      error.status = response.status;
      error.telegramCode = payload?.error_code ?? response.status;
      throw error;
    }

    return payload.result;
  } finally {
    clearTimeout(timer);
  }
}

/* ---- outbound -------------------------------------------------------- */

export const DeliveryResult = {
  SENT: 'sent',
  NOT_CONNECTED: 'not_connected',
  NOT_CONFIGURED: 'not_configured',
  BLOCKED: 'blocked',
  FAILED: 'failed',
};

/**
 * Sends one message to one chat.
 *
 * Returns a result rather than throwing, because a teacher needs to
 * know which of two parents received it. "Blocked" is separated out:
 * a parent who blocked the bot is a different fact from Telegram
 * being down, and only one of them is worth retrying.
 */
export async function sendTelegramMessage(chatId, text) {
  if (!hasTelegramToken) return { status: DeliveryResult.NOT_CONFIGURED };
  if (!chatId) return { status: DeliveryResult.NOT_CONNECTED };

  try {
    const result = await callApi('sendMessage', {
      chat_id: chatId,
      text,
      disable_web_page_preview: true,
    });
    return { status: DeliveryResult.SENT, messageId: result?.message_id ?? null };
  } catch (error) {
    logTelegramError('sendMessage', error);
    /* 403: the parent blocked the bot or deleted the chat. */
    if (error?.telegramCode === 403) return { status: DeliveryResult.BLOCKED };
    return { status: DeliveryResult.FAILED };
  }
}

/* ---- inbound --------------------------------------------------------- */

/** What the bot says back to a parent, in both languages at once: we
 *  do not know which the parent reads, and this is the only message
 *  they get before a teacher writes to them. */
const REPLIES = {
  connected: (name) =>
    [
      `SchoolMind: ulanish tasdiqlandi${name ? ` — ${name}` : ''}.`,
      "Farzandingiz o'qituvchilarining xabarlari shu yerga keladi.",
      '',
      `SchoolMind: подключение подтверждено${name ? ` — ${name}` : ''}.`,
      'Сообщения от учителей вашего ребёнка будут приходить сюда.',
    ].join('\n'),
  expired: [
    "SchoolMind: havola muddati tugagan. Farzandingizdan yangi havola so'rang.",
    '',
    'SchoolMind: срок действия ссылки истёк. Попросите у ребёнка новую ссылку.',
  ].join('\n'),
  used: [
    'SchoolMind: bu havola allaqachon ishlatilgan. Yangi havola so‘rang.',
    '',
    'SchoolMind: эта ссылка уже использована. Попросите новую ссылку.',
  ].join('\n'),
  unknown: [
    "SchoolMind: havola tanilmadi. Farzandingiz ilovasidagi havolani oching.",
    '',
    'SchoolMind: ссылка не распознана. Откройте ссылку из приложения вашего ребёнка.',
  ].join('\n'),
  noPayload: [
    "SchoolMind: salom! Ulanish uchun farzandingiz ilovasida bergan havolani oching.",
    '',
    'SchoolMind: здравствуйте! Чтобы подключиться, откройте ссылку из приложения вашего ребёнка.',
  ].join('\n'),
};

/**
 * Handles one Telegram update. The whole of the inbound logic, kept
 * separate from the loop so a hosted webhook build can call it too.
 */
export async function handleUpdate(update) {
  const message = update?.message ?? update?.edited_message;
  const chatId = message?.chat?.id;
  const text = typeof message?.text === 'string' ? message.text.trim() : '';
  if (!chatId || !text.startsWith('/start')) return;

  const payload = text.slice('/start'.length).trim().split(/\s+/)[0] ?? '';

  if (!payload) {
    await sendTelegramMessage(chatId, REPLIES.noPayload);
    return;
  }

  const outcome = redeemToken(payload, chatId);

  if (outcome.result === TokenResult.OK) {
    /* The log says which parent of which pupil, never the chat id. */
    logTelegram(`linked ${outcome.relation} of ${outcome.studentId}`);
    await sendTelegramMessage(chatId, REPLIES.connected(outcome.fullName));
    return;
  }

  logTelegram(`start payload rejected (${outcome.result})`);
  if (outcome.result === TokenResult.EXPIRED) {
    await sendTelegramMessage(chatId, REPLIES.expired);
  } else if (outcome.result === TokenResult.USED) {
    await sendTelegramMessage(chatId, REPLIES.used);
  } else {
    await sendTelegramMessage(chatId, REPLIES.unknown);
  }
}

/* ---- the loop -------------------------------------------------------- */

async function pollForever() {
  const state = bridgeState();
  let offset = readUpdateOffset();

  while (!state.stopped) {
    try {
      const updates = await callApi(
        'getUpdates',
        {
          offset,
          timeout: LONG_POLL_SECONDS,
          allowed_updates: ['message'],
        },
        { timeoutMs: REQUEST_TIMEOUT_MS },
      );

      state.consecutiveFailures = 0;
      state.conflicts = 0;
      state.lastErrorCode = null;

      for (const update of updates ?? []) {
        offset = Math.max(offset, (update.update_id ?? 0) + 1);
        try {
          await handleUpdate(update);
        } catch (error) {
          /* One bad update must not end the loop. */
          logTelegramError('update', error);
        }
      }
      if (updates?.length) writeUpdateOffset(offset);
    } catch (error) {
      /* A token Telegram refuses will never start working. Stop, and
         say so once, rather than hammering a closed door. */
      if (error?.telegramCode === 401) {
        state.lastErrorCode = 'invalid_token';
        state.stopped = true;
        state.running = false;
        console.error(
          '[schoolmind-telegram] bot token rejected — Parent Connect cannot link or deliver. Check TELEGRAM_BOT_TOKEN.',
        );
        return;
      }
      /* 409: another getUpdates consumer is attached to this bot —
         usually a second dev server that is about to be shut down.
         This used to stop the bridge for good, which meant one stray
         process could take Parent Connect out until someone restarted
         the server. It is a transient condition, so wait it out and
         come back; after a long run of them, give up and say so. */
      if (error?.telegramCode === 409) {
        state.conflicts = (state.conflicts ?? 0) + 1;
        state.lastErrorCode = 'conflict';
        if (state.conflicts === 1) {
          console.warn(
            '[schoolmind-telegram] another process is receiving this bot’s updates — waiting for it to stop.',
          );
        }
        if (state.conflicts > CONFLICT_LIMIT) {
          state.stopped = true;
          state.running = false;
          console.error(
            '[schoolmind-telegram] still conflicting after several minutes — stopping. Close the other process and restart the dev server.',
          );
          return;
        }
        await new Promise((r) => setTimeout(r, CONFLICT_RETRY_MS));
        continue;
      }

      state.consecutiveFailures += 1;
      state.lastErrorCode = error?.name === 'AbortError' ? 'timeout' : 'unreachable';
      const wait = BACKOFF_MS[Math.min(state.consecutiveFailures - 1, BACKOFF_MS.length - 1)];
      if (state.consecutiveFailures === 1 || state.consecutiveFailures % 10 === 0) {
        logTelegramError('getUpdates', error);
      }
      await new Promise((r) => setTimeout(r, wait));
    }
  }

  state.running = false;
}

/**
 * Starts the bridge once. Safe to call on every Vite hot reload: the
 * second call finds the first one already running and returns it.
 */
export async function startTelegramBridge() {
  const state = bridgeState();
  if (state.running) return state;
  if (!hasTelegramToken || !config.telegramPollingEnabled) return state;

  state.running = true;
  state.stopped = false;
  state.startedAt = new Date().toISOString();

  try {
    const me = await callApi('getMe', {});
    state.botUsername = me?.username ?? null;
    logTelegram(`connected as @${state.botUsername ?? 'unknown'} (long polling)`);
  } catch (error) {
    if (error?.telegramCode === 401) {
      state.lastErrorCode = 'invalid_token';
      state.running = false;
      state.stopped = true;
      console.error(
        '[schoolmind-telegram] bot token rejected — Parent Connect cannot link or deliver.',
      );
      return state;
    }
    state.lastErrorCode = 'unreachable';
    logTelegramError('getMe', error);
    /* Reachability can come back; the loop keeps trying. */
  }

  void pollForever();
  return state;
}

/** Safe to send to a browser: what works, and why not. No token, no
 *  chat ids, no provider internals. */
export function telegramHealth() {
  const state = bridgeState();
  return {
    configured: hasTelegramToken,
    running: state.running,
    botUsername: state.botUsername,
    /** One of null | 'invalid_token' | 'conflict' | 'timeout' | 'unreachable'. */
    errorCode: state.lastErrorCode,
  };
}

/** The deep link a parent opens. Built from the username Telegram
 *  itself reported, so a link is never offered for a bot we have not
 *  actually reached. */
export function deepLinkFor(token) {
  const { botUsername } = bridgeState();
  if (!botUsername) return null;
  return `https://t.me/${botUsername}?start=${token}`;
}
