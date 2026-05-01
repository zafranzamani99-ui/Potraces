import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const BOT_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN')!;

async function sendTelegramReply(chatId: number, text: string) {
  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
  });
}

Deno.serve(async (req: Request) => {
  // Telegram always sends POST
  if (req.method !== 'POST') {
    return new Response('OK', { status: 200 });
  }

  try {
    const update = await req.json();
    const message = update?.message;
    if (!message?.text || !message?.from?.id) {
      return new Response('OK', { status: 200 });
    }

    const chatId = message.from.id as number;
    const text = (message.text as string).trim();

    // Handle /start command
    if (text.toLowerCase().startsWith('/start')) {
      await sendTelegramReply(
        chatId,
        '👋 <b>Potraces Verification Bot</b>\n\n' +
        'Send your 6-digit verification code here to verify your Potraces business account.\n\n' +
        'Hantar kod pengesahan 6 digit anda di sini untuk mengesahkan akaun perniagaan Potraces anda.'
      );
      return new Response('OK', { status: 200 });
    }

    // Clean up: uppercase, strip spaces
    const code = text.replace(/\s/g, '').toUpperCase();

    // Must look like a 6-char code
    if (code.length !== 6) {
      await sendTelegramReply(
        chatId,
        'Kod tidak sah. Sila hantar kod 6 digit dari aplikasi Potraces.\n\nInvalid code. Please send the 6-digit code from the Potraces app.'
      );
      return new Response('OK', { status: 200 });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const chatIdStr = String(chatId);

    // Rate limit: count attempts from this chat_id in the last 15 minutes.
    // Reject once >= 10 attempts — blocks online brute force while being
    // tolerant of legitimate typos.
    const since = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    const { count: recentAttempts } = await admin
      .from('otp_chat_attempts')
      .select('id', { count: 'exact', head: true })
      .eq('chat_id', chatIdStr)
      .gte('attempted_at', since);

    if ((recentAttempts ?? 0) >= 10) {
      await sendTelegramReply(
        chatId,
        '🚫 Terlalu banyak cubaan. Sila tunggu 15 minit.\n\nToo many attempts. Please wait 15 minutes.'
      );
      return new Response('OK', { status: 200 });
    }

    // Look up pending OTP
    const { data: otp } = await admin
      .from('otp_verifications')
      .select('id, user_id, expires_at, chat_id')
      .eq('code', code)
      .eq('status', 'pending')
      .maybeSingle();

    // Always log the attempt (matched or not) for rate-limit accounting
    await admin
      .from('otp_chat_attempts')
      .insert({ chat_id: chatIdStr, matched: !!otp });

    if (!otp) {
      // Check if code exists but expired
      const { data: expired } = await admin
        .from('otp_verifications')
        .select('id')
        .eq('code', code)
        .in('status', ['expired', 'verified'])
        .maybeSingle();

      if (expired) {
        await sendTelegramReply(
          chatId,
          '⏰ Kod ini telah tamat tempoh. Sila minta kod baru dari aplikasi.\n\nThis code has expired. Please request a new one from the app.'
        );
      } else {
        await sendTelegramReply(
          chatId,
          '❌ Kod tidak dijumpai. Sila semak semula.\n\nCode not found. Please double-check your code.'
        );
      }
      return new Response('OK', { status: 200 });
    }

    // Check expiry
    if (new Date(otp.expires_at) < new Date()) {
      await admin
        .from('otp_verifications')
        .update({ status: 'expired' })
        .eq('id', otp.id);

      await sendTelegramReply(
        chatId,
        '⏰ Kod ini telah tamat tempoh. Sila minta kod baru dari aplikasi.\n\nThis code has expired. Please request a new one from the app.'
      );
      return new Response('OK', { status: 200 });
    }

    // Bind to this chat_id on first matching submission. If a previous
    // attempt from a different chat already bound it, reject.
    if (otp.chat_id && otp.chat_id !== chatIdStr) {
      await sendTelegramReply(
        chatId,
        '❌ Kod ini telah dimulakan oleh pengguna lain.\n\nThis code was started by a different user.'
      );
      return new Response('OK', { status: 200 });
    }

    // Mark verified
    await admin
      .from('otp_verifications')
      .update({
        status: 'verified',
        verified_at: new Date().toISOString(),
        chat_id: chatIdStr,
      })
      .eq('id', otp.id);

    // Update seller_profiles.is_verified
    await admin
      .from('seller_profiles')
      .update({ is_verified: true })
      .eq('user_id', otp.user_id);

    await sendTelegramReply(
      chatId,
      '✅ <b>Pengesahan berjaya!</b>\n\nSila kembali ke aplikasi Potraces.\n\nVerification successful! Please return to the Potraces app.'
    );

    return new Response('OK', { status: 200 });
  } catch (e) {
    console.error('Telegram webhook error:', e);
    // Always return 200 to Telegram to prevent retries
    return new Response('OK', { status: 200 });
  }
});
